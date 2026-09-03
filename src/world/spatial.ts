// World plane — spatial state (Part 12 §12.12).
// Organism positions are authoritative; the spatial hash is derived
// infrastructure that must be reconstructible at any time (Part 12 §12.24).
//
// Performance: this is the hot perception path (cells cast several spatial
// probes per tick), so the hash uses numeric packed cell keys and compares
// squared distances — a single sqrt is paid only for the returned winner.

export interface Vec2 {
  readonly x: number;
  readonly y: number;
}

export function distance(a: Vec2, b: Vec2): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

interface Entry<T> {
  key: T;
  x: number;
  y: number;
}

/** Derived spatial index — rebuildable from authoritative positions (Part 12 §12.24). */
export class SpatialHash<T> {
  private readonly cellSize: number;
  private readonly cells = new Map<number, Entry<T>[]>();
  /**
   * Packing stride for cell keys: key = cx * STRIDE + cy. Collision-free as long
   * as cy < STRIDE (true for any realistic world: cy ≤ height/cellSize).
   */
  private static readonly STRIDE = 1 << 16;

  constructor(cellSize = 8) {
    this.cellSize = cellSize;
  }

  private cellKey(pos: Vec2): number {
    const cx = Math.floor(pos.x / this.cellSize);
    const cy = Math.floor(pos.y / this.cellSize);
    return cx * SpatialHash.STRIDE + cy;
  }

  insert(key: T, pos: Vec2): void {
    const ck = this.cellKey(pos);
    let bucket = this.cells.get(ck);
    if (!bucket) {
      bucket = [];
      this.cells.set(ck, bucket);
    }
    bucket.push({ key, x: pos.x, y: pos.y });
  }

  clear(): void {
    this.cells.clear();
  }

  /**
   * All entries within `radius` of `pos`, nearest first.
   * K5: the ordering (dist, then key) is a deterministic total order regardless
   * of insertion order.
   */
  query(pos: Vec2, radius: number): { key: T; pos: Vec2; dist: number }[] {
    const c = Math.ceil(radius / this.cellSize);
    const cx = Math.floor(pos.x / this.cellSize);
    const cy = Math.floor(pos.y / this.cellSize);
    const out: { key: T; pos: Vec2; dist: number; distSq: number }[] = [];
    const r2 = radius * radius;
    for (let dy = -c; dy <= c; dy++) {
      for (let dx = -c; dx <= c; dx++) {
        const bucket = this.cells.get((cx + dx) * SpatialHash.STRIDE + (cy + dy));
        if (!bucket) continue;
        for (const e of bucket) {
          const dxv = e.x - pos.x;
          const dyv = e.y - pos.y;
          const d2 = dxv * dxv + dyv * dyv;
          if (d2 <= r2) out.push({ key: e.key, pos: { x: e.x, y: e.y }, dist: Math.sqrt(d2), distSq: d2 });
        }
      }
    }
    out.sort((a, b) => a.dist - b.dist || String(a.key).localeCompare(String(b.key)));
    return out;
  }

  /**
   * The single nearest entry within `radius`, or null. Fast path: no array
   * allocation or sort — used by hot perception paths that only need the
   * nearest stimulus. Ties resolve to the smallest key (same total order as
   * `query()[0]`), preserving determinism.
   */
  queryNearest(pos: Vec2, radius: number): { key: T; pos: Vec2; dist: number } | null {
    const c = Math.ceil(radius / this.cellSize);
    const cx = Math.floor(pos.x / this.cellSize);
    const cy = Math.floor(pos.y / this.cellSize);
    const r2 = radius * radius;
    let bestD2 = Infinity;
    let bestKey: T | null = null;
    let bestX = 0;
    let bestY = 0;
    for (let dy = -c; dy <= c; dy++) {
      for (let dx = -c; dx <= c; dx++) {
        const bucket = this.cells.get((cx + dx) * SpatialHash.STRIDE + (cy + dy));
        if (!bucket) continue;
        for (const e of bucket) {
          const dxv = e.x - pos.x;
          const dyv = e.y - pos.y;
          const d2 = dxv * dxv + dyv * dyv;
          if (d2 > r2) continue;
          if (d2 < bestD2 || (d2 === bestD2 && (bestKey === null || String(e.key).localeCompare(String(bestKey)) < 0))) {
            bestD2 = d2;
            bestKey = e.key;
            bestX = e.x;
            bestY = e.y;
          }
        }
      }
    }
    return bestKey === null ? null : { key: bestKey, pos: { x: bestX, y: bestY }, dist: Math.sqrt(bestD2) };
  }
}