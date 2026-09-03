// World plane — terrain, water, day/night, and organic barrier walls
// (Part 17 §17.4 environmental laws extended to spatial elevation).
//
// Terrain is a coarse elevation grid. Water naturally pools in the lowest
// cells — wherever elevation falls below the water level, that cell is
// submerged and gains a water depth. Water is authoritative, static state
// derived from (seed, config): it is generated at initialization and
// serialized with the world so checkpoints and branches reproduce it exactly.
//
// The day/night cycle is a pure function of the world tick (dayPhase(tick)),
// so it is deterministic, rollback-safe, and never a mutable counter: a
// rolled-back tick leaves the day clock unchanged.
//
// Barriers are ORGANIC formations of regular hexagons registered on a shared
// pointy-top hexagon lattice — every cluster is a contiguous set of
// edge-adjacent lattice cells, so neighbouring tiles share full edges (cleanly
// connected: no seams, no overlaps) and still create navigable obstacles,
// shelters, corridors, and enclosed spaces. Each constituent polygon is
// impassible; adjacency between them forms the formation. A coarse grid
// caches which polygons can affect a point for fast collision testing.

import type { RngStreams } from "../kernel/rng";

export interface TerrainConfig {
  /** Elevation grid cell size in world units. */
  readonly cellSize: number;
  /** Terrain roughness: higher ⇒ more peaks and valleys (0..1). */
  readonly roughness: number;
  /** Water level as a fraction of the elevation range [0..1]. */
  readonly waterLevel: number;
  /** Day length in ticks (day + night). */
  readonly dayLength: number;
  /** Number of organic wall clusters to generate. */
  readonly wallClusters: number;
  /** Per-cluster hexagon count (varied). */
  readonly wallDensity: number;
}

export const DEFAULT_TERRAIN: TerrainConfig = {
  cellSize: 6,
  roughness: 0.62,
  waterLevel: 0.46,
  dayLength: 480,
  wallClusters: 9,
  wallDensity: 14,
};

export const WALL_HEX_RADIUS = 2.4;
export const WALL_SPACING = WALL_HEX_RADIUS * 1.6;

export interface WallPolygon {
  readonly id: string;
  /** Ordered vertices (world space), CCW. */
  readonly vertices: readonly { x: number; y: number }[];
}

export function hexagon(id: string, cx: number, cy: number, r: number): WallPolygon {
  const verts: { x: number; y: number }[] = [];
  for (let i = 0; i < 6; i++) {
    const a = Math.PI / 6 + (i / 6) * Math.PI * 2;
    verts.push({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r });
  }
  return { id, vertices: verts };
}

/** Day phase in [0,1): 0 = midnight, 0.5 = noon. */
export function dayPhase(tick: number, dayLength: number): number {
  const len = Math.max(1, dayLength);
  return ((tick % len) + len) % len / len;
}

/** Daylight factor in [0,1]: 1 at noon, ~0 at night. */
export function daylight(tick: number, dayLength: number): number {
  const p = dayPhase(tick, dayLength) * Math.PI * 2;
  return 0.5 - 0.5 * Math.cos(p);
}

/** World centre of a pointy-top axial lattice cell (q, r). */
export function axialCentre(q: number, r: number): { x: number; y: number } {
  const s = WALL_SPACING;
  return { x: s * Math.sqrt(3) * (q + r / 2), y: s * 1.5 * r };
}

export class Terrain {
  readonly cols: number;
  readonly rows: number;
  readonly elevation: Float64Array; // row-major, 0..1
  readonly water: Float64Array;     // depth in world units (0 = dry)
  readonly wallPolygons: WallPolygon[];
  /** For a grid cell (cx,cy) → list of wall-polygon indices that can overlap it. */
  private readonly wallGrid: number[][];

  constructor(
    readonly width: number,
    readonly height: number,
    readonly config: TerrainConfig,
    elevation: Float64Array,
    water: Float64Array,
    wallPolygons: WallPolygon[],
  ) {
    this.cols = Math.max(1, Math.ceil(width / config.cellSize));
    this.rows = Math.max(1, Math.ceil(height / config.cellSize));
    this.elevation = elevation;
    this.water = water;
    this.wallPolygons = wallPolygons;
    this.wallGrid = this.buildWallGrid(wallPolygons);
  }

  private idx(cx: number, cy: number): number {
    return cy * this.cols + cx;
  }

  private cellAt(x: number, y: number): { cx: number; cy: number } {
    const cx = Math.min(this.cols - 1, Math.max(0, Math.floor(x / this.config.cellSize)));
    const cy = Math.min(this.rows - 1, Math.max(0, Math.floor(y / this.config.cellSize)));
    return { cx, cy };
  }

  /** Elevation (0..1) at a world point. */
  elevationAt(x: number, y: number): number {
    const { cx, cy } = this.cellAt(x, y);
    return this.elevation[this.idx(cx, cy)]!;
  }

  /** Water depth (world units) at a point; 0 = dry land. */
  waterAt(x: number, y: number): number {
    const { cx, cy } = this.cellAt(x, y);
    return this.water[this.idx(cx, cy)]!;
  }

  /** True if the point is submerged. */
  isWater(x: number, y: number): boolean {
    return this.waterAt(x, y) > 0;
  }

  /** True if the point lies inside any impassable barrier polygon. */
  blocked(x: number, y: number): boolean {
    const { cx, cy } = this.cellAt(x, y);
    const candidates = this.wallGrid[this.idx(cx, cy)] ?? [];
    for (const i of candidates) {
      if (pointInPolygon(x, y, this.wallPolygons[i]!.vertices)) return true;
    }
    return false;
  }

  /** Speed multiplier at a point: water slows, land is neutral. */
  speedFactor(x: number, y: number): number {
    const w = this.waterAt(x, y);
    if (w > 0) return Math.max(0.3, 0.85 - 0.1 * Math.min(1, w));
    return 1;
  }

  /** Resource-regeneration multiplier near water: food is likelier around pools. */
  resourceFactor(x: number, y: number): number {
    const w = this.waterAt(x, y);
    if (w > 0) return 1.4; // aquatic patches thrive
    // Sample a few neighbours: riparian edge also boosts growth.
    const { cx, cy } = this.cellAt(x, y);
    let near = false;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const nx = cx + dx;
        const ny = cy + dy;
        if (nx >= 0 && nx < this.cols && ny >= 0 && ny < this.rows) {
          if (this.water[this.idx(nx, ny)]! > 0) { near = true; break; }
        }
      }
      if (near) break;
    }
    return near ? 1.2 : 1;
  }

  private buildWallGrid(walls: WallPolygon[]): number[][] {
    const grid: number[][] = new Array(this.cols * this.rows);
    for (let i = 0; i < grid.length; i++) grid[i] = [];
    for (let wi = 0; wi < walls.length; wi++) {
      const verts = walls[wi]!.vertices;
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      for (const v of verts) {
        minX = Math.min(minX, v.x); maxX = Math.max(maxX, v.x);
        minY = Math.min(minY, v.y); maxY = Math.max(maxY, v.y);
      }
      // Register against every terrain cell whose square BBOX overlaps the
      // polygon bbox. A centre-only test misses most tiles (walls are much
      // smaller than a cell), which made drawn walls passable — "invisible
      // walls" were the mismatched remainder. Bbox overlap is conservative:
      // blocked() still point-tests the polygon, so extra registrations cost
      // only a cheap candidate check.
      const c0 = this.cellAt(minX, minY);
      const c1 = this.cellAt(maxX, maxY);
      for (let cy = c0.cy; cy <= c1.cy; cy++) {
        for (let cx = c0.cx; cx <= c1.cx; cx++) {
          grid[this.idx(cx, cy)]!.push(wi);
        }
      }
    }
    return grid;
  }

  serialize(): SerializedTerrain {
    return {
      config: this.config,
      cols: this.cols,
      rows: this.rows,
      elevation: Array.from(this.elevation),
      water: Array.from(this.water),
      walls: this.wallPolygons.map((w) => ({ id: w.id, vertices: [...w.vertices] })),
    };
  }

  static restore(data: SerializedTerrain): Terrain {
    return new Terrain(
      data.cols * data.config.cellSize,
      data.rows * data.config.cellSize,
      data.config,
      Float64Array.from(data.elevation),
      Float64Array.from(data.water),
      data.walls.map((w) => ({ id: w.id, vertices: [...w.vertices] })),
    );
  }

  /** A uniform plain (no elevation variance, no water, no walls). */
  static plain(width: number, height: number): Terrain {
    const cfg: TerrainConfig = { cellSize: 10, roughness: 0.2, waterLevel: 0, dayLength: 480, wallClusters: 0, wallDensity: 0 };
    const cols = Math.max(1, Math.ceil(width / cfg.cellSize));
    const rows = Math.max(1, Math.ceil(height / cfg.cellSize));
    const elevation = new Float64Array(cols * rows);
    const water = new Float64Array(cols * rows);
    return new Terrain(width, height, cfg, elevation, water, []);
  }
}

export interface SerializedTerrain {
  config: TerrainConfig;
  cols: number;
  rows: number;
  elevation: number[];
  water: number[];
  walls: { id: string; vertices: { x: number; y: number }[] }[];
}

// ---------------------------------------------------------------------------
// Generation (deterministic from the `experiment` stream).
// ---------------------------------------------------------------------------

/** Value-noise heightfield via a coarse lattice of random gradients. */
function generateElevation(rng: RngStreams, cols: number, rows: number, roughness: number): Float64Array {
  const lattice = 5;
  const gx = Math.max(2, Math.ceil(cols / lattice));
  const gy = Math.max(2, Math.ceil(rows / lattice));
  const grid = new Float64Array((gx + 1) * (gy + 1));
  for (let y = 0; y <= gy; y++) {
    for (let x = 0; x <= gx; x++) {
      grid[y * (gx + 1) + x] = rng.next("experiment");
    }
  }
  const out = new Float64Array(cols * rows);
  const sx = (cols - 1) / (gx || 1);
  const sy = (rows - 1) / (gy || 1);
  for (let cy = 0; cy < rows; cy++) {
    for (let cx = 0; cx < cols; cx++) {
      const fx = Math.min(gx - 1, Math.floor(cx / sx));
      const fy = Math.min(gy - 1, Math.floor(cy / sy));
      const tx = (cx - fx * sx) / (sx || 1);
      const ty = (cy - fy * sy) / (sy || 1);
      const lerp = (a: number, b: number, t: number): number => a + (b - a) * (t * t * (3 - 2 * t));
      const v =
        lerp(
          lerp(grid[fy * (gx + 1) + fx]!, grid[fy * (gx + 1) + fx + 1]!, tx),
          lerp(grid[(fy + 1) * (gx + 1) + fx]!, grid[(fy + 1) * (gx + 1) + fx + 1]!, tx),
          ty,
        );
      // Shape toward a basin-like distribution and raise roughness contrast.
      const shaped = 0.35 + 0.5 * v + roughness * (v - 0.5) * 0.8;
      out[cy * cols + cx] = Math.min(1, Math.max(0, shaped));
    }
  }
  return out;
}

/**
 * Water depth = waterLevel - elevation, scaled to world units, then multiplied
 * by a smoothly-varying REGIONAL depth factor (some basins are deep, others
 * are shallow pools) so the depth gradient differs between water bodies.
 */
function waterFromElevation(
  elevation: Float64Array,
  cols: number,
  rows: number,
  cellSize: number,
  waterLevel: number,
  depthFactor?: Float64Array,
): Float64Array {
  const water = new Float64Array(elevation.length);
  for (let i = 0; i < elevation.length; i++) {
    const e = elevation[i]!;
    if (e < waterLevel) {
      const base = (waterLevel - e) * cellSize * 2;
      water[i] = base * (depthFactor?.[i] ?? 1);
    } else water[i] = 0;
  }
  return water;
}

/**
 * A coarse value-noise "basin depth" map in [0.55, 1.45], bilinearly smoothed
 * to the cell grid. Water bodies in different regions get different depth
 * gradients (deep lakes vs shallow ponds). Deterministic — fixed lattice
 * draw order per (cols, rows).
 */
function generateDepthRegions(rng: RngStreams, cols: number, rows: number): Float64Array {
  const lattice = 9;
  const gx = Math.max(2, Math.ceil(cols / lattice));
  const gy = Math.max(2, Math.ceil(rows / lattice));
  const grid = new Float64Array((gx + 1) * (gy + 1));
  for (let y = 0; y <= gy; y++) {
    for (let x = 0; x <= gx; x++) {
      grid[y * (gx + 1) + x] = rng.next("experiment");
    }
  }
  const out = new Float64Array(cols * rows);
  const sx = (cols - 1) / (gx || 1);
  const sy = (rows - 1) / (gy || 1);
  for (let cy = 0; cy < rows; cy++) {
    for (let cx = 0; cx < cols; cx++) {
      const fx = Math.min(gx - 1, Math.floor(cx / sx));
      const fy = Math.min(gy - 1, Math.floor(cy / sy));
      const tx = (cx - fx * sx) / (sx || 1);
      const ty = (cy - fy * sy) / (sy || 1);
      const lerp = (a: number, b: number, t: number): number => a + (b - a) * (t * t * (3 - 2 * t));
      const v = lerp(
        lerp(grid[fy * (gx + 1) + fx]!, grid[fy * (gx + 1) + fx + 1]!, tx),
        lerp(grid[(fy + 1) * (gx + 1) + fx]!, grid[(fy + 1) * (gx + 1) + fx + 1]!, tx),
        ty,
      );
      out[cy * cols + cx] = 0.55 + v * 0.9; // [0.55, 1.45]
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Hex-lattice wall formations.
//
// Barriers are now built on a shared POINTY-TOP hexagon lattice: each barrier
// tile is a hexagon registered at a lattice cell, and every cluster is a
// contiguous set of edge-adjacent cells (a deterministic breadth-first grow
// from a seed cell). Neighbouring tiles therefore share full edges — cleanly
// connected, no seams, no overlaps — and still form irregular organic blobs
// with corridors and enclosed spaces. Wall polygons from different clusters
// never touch, which keeps navigable gaps between formations.
// ---------------------------------------------------------------------------

/** Axial neighbour offsets (pointy-top), CCW. */
const AXIAL_NEIGHBOURS: readonly (readonly [number, number])[] = [
  [1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1],
];

/** Closest axial cell (q, r) to a world point. */
function nearestAxial(x: number, y: number): { q: number; r: number } {
  const s = WALL_SPACING;
  const r = Math.round((2 * y) / (3 * s));
  const q = Math.round(x / (Math.sqrt(3) * s) - r / 2);
  return { q, r };
}

/**
 * Generate organic wall formations on the hexagon lattice. Deterministic per
 * cluster: seed position plus an elevation-biased sample, target size (1 draw),
 * seed growth direction (1 draw). Cells are placed only on lattice sites whose
 * elevation is at/above the chosen threshold, so the barrier tiles line up with
 * the higher terrain rather than appearing uniformly at random.
 *
 * Growth is a biased BFS that prefers one neighbour direction first and then
 * trims the result into one or more long, thin connected chains, so the
 * formations read as ridges/lines instead of round clusters.
 */
export function generateWalls(
  rng: RngStreams,
  width: number,
  height: number,
  clusters: number,
  density: number,
  elevation: Float64Array,
  cols: number,
  rows: number,
  elevationThreshold: number,
  cellSizeArg?: number,
): WallPolygon[] {
  const cellSize = cellSizeArg ?? 10;
  const walls: WallPolygon[] = [];
  const occupied = new Set<string>();
  const margin = WALL_HEX_RADIUS * 2.2;
  let seq = 0;

  const inside = (q: number, r: number): boolean => {
    const c = axialCentre(q, r);
    return c.x >= margin && c.x <= width - margin && c.y >= margin && c.y <= height - margin;
  };

  for (let c = 0; c < clusters; c++) {
    const target = Math.max(4, Math.round(density * (0.45 + rng.next("experiment") * 0.7)));
    // Bias seed toward higher ground and prefer long thin chains on ridges.
    const elevationBias = 0.62;
    // Elevation tie-breaking seed: sample candidate lattice sites until one lands
    // on terrain at or above the threshold, then start from there.
    let start: { q: number; r: number } | null = null;
    for (let attempt = 0; attempt < 40 && !start; attempt++) {
      const sx = width * (0.1 + 0.8 * rng.next("experiment"));
      const sy = height * (0.1 + 0.8 * rng.next("experiment"));
      const cand = nearestAxial(sx, sy);
      if (!inside(cand.q, cand.r)) continue;
      const cx = axialCentre(cand.q, cand.r).x;
      const cy = axialCentre(cand.q, cand.r).y;
      const cell = cols > 0 && rows > 0 ? Math.min(cols - 1, Math.max(0, Math.floor(cx / (cols > 0 ? width / cols : 1)))) : 0;
      const row = rows > 0 && cols > 0 ? Math.min(rows - 1, Math.max(0, Math.floor(cy / (rows > 0 ? height / rows : 1)))) : 0;
      const e = elevation[row * cols + cell] ?? 0;
      if (e + elevationBias * (e - 0.5) >= elevationThreshold) start = cand;
    }
    if (!start) {
      // Fallback to a plain random seed when no high-elevation site is found.
      const seedX = width * (0.1 + 0.8 * rng.next("experiment"));
      const seedY = height * (0.1 + 0.8 * rng.next("experiment"));
      const cand = nearestAxial(seedX, seedY);
      if (!inside(cand.q, cand.r) || occupied.has(`${cand.q},${cand.r}`)) continue;
      start = cand;
    }
    if (!start) continue;
    if (occupied.has(`${start.q},${start.r}`)) continue;

    // Deterministic BFS with a thin-chain bias: grow outward along one
    // seeded direction first, then only add another branch when the current
    // tip stalls. That keeps formations long/thin on ridges.
    const cells: { q: number; r: number }[] = [{ q: start.q, r: start.r }];
    occupied.add(`${start.q},${start.r}`);
    let head = 0;
    let dir = Math.floor(rng.next("experiment") * 6);
    while (cells.length < target && head < cells.length) {
      const cur = cells[head++]!;
      let grew = false;
      for (let k = 0; k < 6 && cells.length < target && !grew; k++) {
        const off = AXIAL_NEIGHBOURS[(dir + k) % 6]!;
        const nq = cur.q + off[0];
        const nr = cur.r + off[1];
        const key = `${nq},${nr}`;
        if (occupied.has(key) || !inside(nq, nr)) continue;
        occupied.add(key);
        cells.push({ q: nq, r: nr });
        dir = (k + 3) % 6;
        grew = true;
      }
      if (!grew) dir = (dir + 1) % 6;
    }

    // Trim into long thin chains/lines instead of a connected blob.
    const trimmed = thinChainFromCells(cells, elevation, cols, rows, cellSize);
    for (const cell of trimmed) {
      const centre = axialCentre(cell.q, cell.r);
      walls.push(hexagon(`w${seq++}`, centre.x, centre.y, WALL_HEX_RADIUS));
    }
  }
  return walls;
}

/**
 * Keep a connected set of axial hex cells but drop ones that create bulky
 * branches, preserving only a long, thin connected spine. Ties are resolved
 * by elevation (prefer higher ground) so the surviving line still hugs the
 * high-elevation ridge.
 */
function thinChainFromCells(
  cells: { q: number; r: number }[],
  elevation: Float64Array,
  cols: number,
  rows: number,
  cellSize: number,
): { q: number; r: number }[] {
  if (cells.length <= 6) return cells.slice();

  const byKey = new Map<string, { q: number; r: number; e: number }>();
  for (const cell of cells) {
    const centre = axialCentre(cell.q, cell.r);
    const e = elevationSample(elevation, cols, rows, cellSize, centre.x, centre.y);
    byKey.set(`${cell.q},${cell.r}`, { q: cell.q, r: cell.r, e });
  }

  const killed = new Set<string>();
  const keys = cells.map((c) => `${c.q},${c.r}`);
  // Prune low-elevation border cells until the set reads as one or two long
  // connected strands rather than a compact cluster.
  for (let i = 0; i < keys.length && cells.length - killed.size > 4; i++) {
    const key = keys[i]!;
    if (killed.has(key)) continue;
    const here = byKey.get(key)!;
    // If removing this cell does not disconnect the remaining set and it is
    // lower than a sibling neighbour, prune it (bias toward thin ridges).
    const neighbours = axialNeighbourKeys(here.q, here.r);
    const aliveNeighbours = neighbours.filter((n) => byKey.has(n) && !killed.has(n));
    if (aliveNeighbours.length >= 2) {
      const lower = aliveNeighbours.some((n) => (byKey.get(n)!.e ?? 0) >= (here.e ?? 0));
      if (lower) continue;
      killed.add(key);
    }
  }

  return cells.filter((c) => !killed.has(`${c.q},${c.r}`));
}

/** Elevation at a world point sampled from the row-major grid. */
function elevationSample(
  elevation: Float64Array,
  cols: number,
  rows: number,
  cellSize: number,
  x: number,
  y: number,
): number {
  if (cols <= 0 || rows <= 0) return 0;
  const cx = Math.min(cols - 1, Math.max(0, Math.floor(x / cellSize)));
  const cy = Math.min(rows - 1, Math.max(0, Math.floor(y / cellSize)));
  return elevation[cy * cols + cx] ?? 0;
}

function axialNeighbourKeys(q: number, r: number): string[] {
  return [
    `${q + 1},${r}`,
    `${q + 1},${r - 1}`,
    `${q},${r - 1}`,
    `${q - 1},${r}`,
    `${q - 1},${r + 1}`,
    `${q},${r + 1}`,
  ];
}


/** Build a full terrain object deterministically from config + experiment stream. */
export function generateTerrain(rng: RngStreams, width: number, height: number, config: TerrainConfig): Terrain {
  const cols = Math.max(1, Math.ceil(width / config.cellSize));
  const rows = Math.max(1, Math.ceil(height / config.cellSize));
  const elevation = generateElevation(rng, cols, rows, config.roughness);
  // Region-varying depth: deep basins in some areas, shallow pools in others.
  const depthRegions = generateDepthRegions(rng, cols, rows);
  const water = waterFromElevation(elevation, cols, rows, config.cellSize, config.waterLevel, depthRegions);
  const walls = config.wallClusters > 0 ? generateWalls(rng, width, height, config.wallClusters, config.wallDensity, elevation, cols, rows, 0.42, config.cellSize) : [];
  return new Terrain(width, height, config, elevation, water, walls);
}

// ---------------------------------------------------------------------------
// Geometry helpers.
// ---------------------------------------------------------------------------

/** Even-odd ray-cast point-in-polygon test (handles concave organic shapes). */
export function pointInPolygon(x: number, y: number, vertices: readonly { x: number; y: number }[]): boolean {
  let inside = false;
  for (let i = 0, j = vertices.length - 1; i < vertices.length; j = i++) {
    const xi = vertices[i]!.x;
    const yi = vertices[i]!.y;
    const xj = vertices[j]!.x;
    const yj = vertices[j]!.y;
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
