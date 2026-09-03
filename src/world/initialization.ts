// Experimentation plane → world initialization (Part 11 §11.12).
// Initial conditions are derived deterministically from the experiment seed —
// the `experiment` stream — so the same seed yields the same initial world.

import { World, type WorldConfig, type OrganismRecord, type ResourcePatch, type Genome, type EnvironmentalZone, type ZoneKind, radiusFromBiomass } from "./world";
import { RngStreams } from "../kernel/rng";
import { MODEL_VERSION, SCHEMA_VERSION } from "../kernel/version";
import { buildBody, randomBrain, TROPHIC_BY_BIAS, BRAIN_INPUTS, type CellNode, type NeuralNet, type TrophicStrategy } from "./body";
import { buildConstructionModules, constructionTotal as sumConstruction } from "./development";
import { MAX_PLANT_LEAVES, MIN_PLANT_LEAVES, WATER_SPAWN_PROBABILITY, plantClusterId } from "./plants";
import { FOUNDER_SEED_MOLECULES, OFFSPRING_SEED_MOLECULES } from "./metabolism";
import { generateTerrain, DEFAULT_TERRAIN, type TerrainConfig, WALL_HEX_RADIUS, WALL_SPACING, hexagon, axialCentre, Terrain } from "./terrain";

export interface ExperimentDefinition {
  readonly experimentId: string;
  readonly hypothesis: string;
  readonly replicateId: string;
  readonly seed: string;
  readonly config: WorldConfig;
}

let organismSeq = 0;
let genomeSeq = 0;
let patchSeq = 0;

export function resetIdCounters(): void {
  organismSeq = 0;
  genomeSeq = 0;
  patchSeq = 0;
}

export function nextOrganismId(tick: number): string {
  return `o:${tick.toString(36)}-${(organismSeq++).toString(36)}`;
}

export function nextGenomeId(): string {
  return `g:${(genomeSeq++).toString(36)}`;
}

export function nextPatchId(): string {
  return `r:${(patchSeq++).toString(36)}`;
}

/** Uniform in [0, n) from the experiment stream. */
function u(rng: RngStreams, n: number): number {
  return rng.next("experiment") * n;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

const ZONE_KIND_CYCLE: readonly ZoneKind[] = ["fertile", "harsh", "viscous"];

interface PocketDescription {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  readonly seed: string;
  readonly inhabits: number;
}

function generatePockets(
  config: WorldConfig,
  rng: RngStreams,
  baseSeed: string,
): PocketDescription[] {
  const pockets: PocketDescription[] = [];
  const wanted = config.inaccessiblePocketCount ?? 0;
  if (wanted <= 0) return pockets;
  const density = config.terrain?.wallDensity ?? DEFAULT_TERRAIN.wallDensity;
  const maxCells = Math.max(4, Math.round(density * 1.6));
  for (let i = 0; i < wanted * 2 && pockets.length < wanted; i++) {
    const pocketSeed = `${baseSeed}:p${i}`;
    const prng = RngStreams.fromSeed(pocketSeed);
    const w = Math.max(14, Math.floor(config.width * (0.07 + 0.05 * prng.next("experiment"))));
    const h = Math.max(14, Math.floor(config.height * (0.07 + 0.05 * prng.next("experiment"))));
    const x = 18 + Math.floor(prng.next("experiment") * Math.max(2, config.width - w - 36));
    const y = 18 + Math.floor(prng.next("experiment") * Math.max(2, config.height - h - 36));
    const inhabits = Math.max(0, (config.inaccessiblePocketInhabitants ?? 0) + Math.floor(prng.next("experiment") * 2) - 1);
    pockets.push({ x, y, w, h, seed: pocketSeed, inhabits });
  }
  return pockets.slice(0, wanted);
}

/**
 * Deterministically generate rectangular environmental zones (Part 17 §17.4)
 * from the experiment stream. Fixed draw order per zone: size-x, size-y,
 * pos-x, pos-y — so the same seed yields the same zone map (§11.12).
 * Kinds cycle fertile → harsh → viscous so every default map exhibits all three.
 */
export function generateZones(config: WorldConfig, rng: RngStreams): EnvironmentalZone[] {
  const zones: EnvironmentalZone[] = [];
  const count = config.zoneCount ?? 0;
  for (let i = 0; i < count; i++) {
    const kind = ZONE_KIND_CYCLE[i % ZONE_KIND_CYCLE.length]!;
    const w = Math.max(10, Math.floor(config.width * (0.14 + 0.1 * rng.next("experiment"))));
    const h = Math.max(10, Math.floor(config.height * (0.14 + 0.1 * rng.next("experiment"))));
    const x = Math.floor(rng.next("experiment") * Math.max(1, config.width - w));
    const y = Math.floor(rng.next("experiment") * Math.max(1, config.height - h));
    zones.push({ id: `z:${i.toString(36)}`, kind, x, y, width: w, height: h });
  }
  return zones;
}

export function randomGenome(rng: RngStreams): Genome {
  // Node counts (body plan) are drawn first; nodeCount is their sum.
  const photoreceptorCount = Math.floor(u(rng, 4)); // 0..3
  const chemoreceptorCount = 1 + Math.floor(u(rng, 4)); // 1..4
  const mechanoreceptorCount = 1 + Math.floor(u(rng, 3)); // 1..3
  const flagellumCount = 1 + Math.floor(u(rng, 3)); // 1..3
  const aggression = u(rng, 1);
  const spikeCount = aggression > 0.35 ? Math.floor(u(rng, 3)) : 0; // 0..2
  const nodeCount =
    photoreceptorCount + chemoreceptorCount + mechanoreceptorCount + flagellumCount + spikeCount;
  return {
    genomeId: nextGenomeId(),
    genes: {
      speed: 0.5 + u(rng, 1.5),
      senseRadius: 4 + u(rng, 20),
      metabolism: 0.5 + u(rng, 1.0),
      // Founder thresholds sit near ecological equilibrium so the null model
      // can actually cycle rather than going extinct at maxAge.
      reproductionThreshold: 35 + u(rng, 35),
      offspringInvestment: 0.3 + u(rng, 0.3),
      nodeCount,
      aggression,
      trophic: u(rng, 2) - 1,
      attackPower: 0.5 + u(rng, 2.5),
      growthEfficiency: 0.6 + u(rng, 0.8),
      daySensitivity: u(rng, 1),
      photoreceptorCount,
      chemoreceptorCount,
      mechanoreceptorCount,
      flagellumCount,
      spikeCount,
    },
    regulatory: {
      photoreceptorAxis: "speed",
      chemoreceptorAxis: "senseRadius",
      mechanoreceptorAxis: "metabolism",
    },
  };
}

export interface MakeOrganismOptions {
  readonly age?: number;
  readonly maturity?: number;
  readonly developmentCompleted?: boolean;
  /** Pre-built brain (neural heredity). When absent a fresh brain is drawn. */
  readonly brain?: NeuralNet;
  /** Explicit facing (radians). When absent a fresh draw is made from the `experiment` stream. */
  readonly facing?: number;
}

/**
 * Construct an OrganismRecord from a genome: builds the node-based body,
 * initializes the brain, and derives trophic strategy + starting biomass.
 * Shared by founders, offspring (inheritance), and lab interventions so the
 * body/brain construction is always identical (Part 15 heredity).
 */
export function makeOrganism(
  id: string,
  genome: Genome,
  x: number,
  y: number,
  energy: number,
  parentIds: readonly string[],
  tick: number,
  rng: RngStreams,
  options: MakeOrganismOptions = {},
): OrganismRecord {
  const nodes: CellNode[] = buildBody(genome.genes);
  const brain: NeuralNet = options.brain ?? randomBrain(genome, rng);
  const biomass = Math.max(6, energy * 0.6);
  const trophic: TrophicStrategy = TROPHIC_BY_BIAS(genome.genes.trophic);
  const age = options.age ?? 0;
  const maturity = options.maturity ?? 1;
  const developmentCompleted = options.developmentCompleted ?? true;
  const kinds = new Set(nodes.map((n) => n.kind));
  const modules = ["locomotion", "sensing", ...kinds].filter((m, i, a) => a.indexOf(m) === i);
  // Part 15 construction queue: offspring build their surface-node modules
  // over development; founders are born canalized (queue empty, full cost paid).
  const constructionModules = buildConstructionModules(genome.genes);
  const constructionTotal = sumConstruction(constructionModules);
  const constructionQueue = developmentCompleted ? [] : constructionModules.map((m) => m.name);
  return {
    id,
    genomeId: genome.genomeId,
    genome,
    parentIds: [...parentIds],
    x,
    y,
    vx: 0,
    vy: 0,
    energy,
    speed: genome.genes.speed,
    senseRadius: genome.genes.senseRadius,
    age,
    lifecycle: "ACTIVE",
    maturity,
    developmentCompleted,
    modules,
    nodes,
    brain,
    facing: options.facing ?? rng.next("experiment") * Math.PI * 2,
    trophic,
    biomass,
    radius: radiusFromBiomass(biomass),
    developmentClock: options.age ?? 0,
    constructionQueue,
    constructionProgress: developmentCompleted ? constructionTotal : 0,
    constructionTotal,
    hunger: 0,
    memory: new Array<number>(BRAIN_INPUTS).fill(0),
    // ProtoEvo molecules: founders are born mature with a molecule seed to
    // invest in upgrades; offspring are seeded small and must synthesize/eat
    // the rest to pay their construction queue.
    molecules: developmentCompleted ? FOUNDER_SEED_MOLECULES : OFFSPRING_SEED_MOLECULES,
    nodeLevels: nodes.map(() => 0),
  };
}

export function initializeWorld(def: ExperimentDefinition, rng: RngStreams): World {
  const meta = {
    worldId: `w:${def.experimentId}:${def.replicateId}`,
    modelVersion: MODEL_VERSION,
    schemaVersion: SCHEMA_VERSION,
    tick: 0,
    experimentId: def.experimentId,
    replicateId: def.replicateId,
    seed: def.seed,
  };
  // Environmental topology (Part 17 §17.4): explicit zones win; otherwise a
  // zoneCount knob generates deterministic zones; neither → uniform plain.
  const config: WorldConfig =
    def.config.zoneCount !== undefined
      ? { ...def.config, zones: def.config.zoneCount > 0 ? generateZones(def.config, rng) : [] }
      : def.config;
  // Terrain: elevation + water + organic walls, generated deterministically.
  const terrainCfg: TerrainConfig = { ...DEFAULT_TERRAIN, ...(def.config.terrain ?? {}) };
  const terrain = generateTerrain(rng, config.width, config.height, terrainCfg);
  const world = new World(meta, config, rng, undefined, terrain);

  // Inaccessible pockets: compact wall-enclosed arenas pierced by a narrow
  // entrance corridor plus a surrounding ring of hex barrier tiles so normal
  // wandering locomotion tends to bounce off before finding the gap.
  const pockets = generatePockets(config, rng, def.seed);
  for (const pocket of pockets) {
    const corridorSeed = `${pocket.seed}:c`;
    const cRng = RngStreams.fromSeed(corridorSeed);
    const cw = Math.max(2.4, 1.6 + cRng.next("experiment") * 1.2);
    const pocketWalls: ReturnType<typeof hexagon>[] = [];
    wallLoop: for (let cy = 0; cy < Math.max(1, Math.ceil(pocket.h / terrainCfg.cellSize)); cy++) {
      for (let cx = 0; cx < Math.max(1, Math.ceil(pocket.w / terrainCfg.cellSize)); cx++) {
        const px = pocket.x + cx * terrainCfg.cellSize + terrainCfg.cellSize / 2;
        const py = pocket.y + cy * terrainCfg.cellSize + terrainCfg.cellSize / 2;
        if (px <= 0 || py <= 0 || px >= config.width - 1 || py >= config.height - 1) continue;
        const hq = Math.round(px / (Math.sqrt(3) * WALL_SPACING) - ((2 * py) / (3 * WALL_SPACING)) / 2);
        const hr = Math.round((2 * py) / (3 * WALL_SPACING));
        if (pocket.w <= 2 * WALL_SPACING && cx >= Math.ceil(pocket.w / terrainCfg.cellSize) - 1) continue;
        if (pocket.h <= 2 * WALL_SPACING && cy >= Math.ceil(pocket.h / terrainCfg.cellSize) - 1) continue;
        const centre = axialCentre(hq, hr);
        if (Math.abs(centre.x - px) > WALL_SPACING * 0.5 || Math.abs(centre.y - py) > WALL_SPACING * 0.5) continue;
        if (terrain.blocked(centre.x, centre.y)) continue;
        if (cx === Math.floor(pocket.w / terrainCfg.cellSize) - 1 && cy === Math.floor(pocket.h / 2)) continue;
        pocketWalls.push(hexagon(`w${(world.terrain.wallPolygons.length + pocketWalls.length).toString(36)}`, centre.x, centre.y, WALL_HEX_RADIUS));
      }
    }
    const updatedWalls = [...world.terrain.wallPolygons, ...pocketWalls];
    const newTerrain = new Terrain(config.width, config.height, terrainCfg, terrain.elevation, terrain.water, updatedWalls);
    (world as any).terrain = newTerrain;
  }

  // Plants: each is a cluster of joined smaller leaf nodes (ProtoEvo
  // morphology), not a single point. Plant placement is now pocket-scoped when
  // inaccessible pockets are declared: each pocket gets a small seeded plant
  // body, and the remaining available plants live outside pockets in
  // water-correlated sites. That keeps most of the arena sparse while seeding
  // isolated pockets with their own initial food.
  let plantSeq = 0;
  const cellSize = terrain.config.cellSize;
  const pocketByCell = (px: number, py: number): PocketDescription | null => {
    for (const p of pockets) {
      if (px >= p.x && px < p.x + p.w && py >= p.y && py < p.y + p.h) return p;
    }
    return null;
  };
  const outsideWetCells: { cx: number; cy: number }[] = [];
  for (let cy = 0; cy < terrain.rows; cy++) {
    for (let cx = 0; cx < terrain.cols; cx++) {
      const wx = (cx + 0.5) * cellSize;
      const wy = (cy + 0.5) * cellSize;
      if (pocketByCell(wx, wy)) continue;
      if (terrain.water[cy * terrain.cols + cx]! > 0) {
        outsideWetCells.push({ cx, cy });
        continue;
      }
      let near = false;
      for (let dy = -1; dy <= 1 && !near; dy++) {
        for (let dx = -1; dx <= 1 && !near; dx++) {
          const nx = cx + dx;
          const ny = cy + dy;
          if (nx >= 0 && nx < terrain.cols && ny >= 0 && ny < terrain.rows) {
            const nwx = (nx + 0.5) * cellSize;
            const nwy = (ny + 0.5) * cellSize;
            if (!pocketByCell(nwx, nwy) && terrain.water[ny * terrain.cols + nx]! > 0) near = true;
          }
        }
      }
      if (near) outsideWetCells.push({ cx, cy });
    }
  }
  const pocketPlants: Array<{ clusterId: string; x: number; y: number; cx: number; cy: number }> = [];
  for (const pocket of pockets) {
    const prng = RngStreams.fromSeed(pocket.seed);
    for (let i = 0; i < pocket.inhabits; i++) {
      const clusterId = plantClusterId(0, plantSeq++);
      const jx = (prng.next("experiment") - 0.5) * pocket.w * 0.55;
      const jy = (prng.next("experiment") - 0.5) * pocket.h * 0.55;
      const px = clamp(pocket.x + pocket.w / 2 + jx, 4, config.width - 4);
      const py = clamp(pocket.y + pocket.h / 2 + jy, 4, config.height - 4);
      pocketPlants.push({ clusterId, x: px, y: py, cx: Math.floor(px / cellSize), cy: Math.floor(py / cellSize) });
    }
  }
  const outsideCount = Math.max(0, (config.outsidePlantCount ?? def.config.resourcePatches) - pocketPlants.length);
  const outsidePlants: Array<{ clusterId: string; x: number; y: number; cx: number; cy: number }> = [];
  for (let i = 0; i < outsideCount; i++) {
    const wetDraw = rng.next("experiment");
    let cx = 0;
    let cy = 0;
    if (outsideWetCells.length > 0 && wetDraw < WATER_SPAWN_PROBABILITY) {
      const wet = outsideWetCells[rng.int("experiment", outsideWetCells.length)]!;
      cx = wet.cx;
      cy = wet.cy;
    } else {
      let attempts = 0;
      let placed = false;
      while (attempts < 40 && !placed) {
        const candX = 12 + rng.next("experiment") * Math.max(4, config.width - 24);
        const candY = 12 + rng.next("experiment") * Math.max(4, config.height - 24);
        if (!pocketByCell(candX, candY)) {
          cx = Math.floor(candX / cellSize);
          cy = Math.floor(candY / cellSize);
          placed = true;
        }
        attempts++;
      }
      if (!placed) {
        cx = Math.floor(20 + rng.next("experiment") * Math.max(4, config.width - 40));
        cy = Math.floor(20 + rng.next("experiment") * Math.max(4, config.height - 40));
      }
    }
    const clusterId = plantClusterId(0, plantSeq++);
    outsidePlants.push({ clusterId, x: 0, y: 0, cx, cy });
  }

  for (const plant of pocketPlants) {
    const prng = RngStreams.fromSeed(`${plant.clusterId}:body`);
    const leaves = MIN_PLANT_LEAVES + Math.floor(prng.next("experiment") * (MAX_PLANT_LEAVES - MIN_PLANT_LEAVES + 1));
    const plantCapacity = def.config.patchCapacity * (0.8 + 0.3 * prng.next("experiment"));
    const baseRegen = 0.025 + 0.045 * prng.next("experiment");
    const perLeaf = plantCapacity / leaves;
    for (let l = 0; l < leaves; l++) {
      const ang = (l / leaves) * Math.PI * 2 + prng.next("experiment") * 0.6;
      const rad = 0.8 + prng.next("experiment") * 1.9;
      const patch: ResourcePatch = {
        id: nextPatchId(),
        x: clamp(plant.x + Math.cos(ang) * rad, 2, def.config.width - 2),
        y: clamp(plant.y + Math.sin(ang) * rad, 2, def.config.height - 2),
        quantity: perLeaf * (0.4 + 0.6 * prng.next("experiment")),
        regenerationRate: baseRegen * (0.7 + 0.6 * prng.next("experiment")),
        clusterId: plant.clusterId,
        capacity: perLeaf,
      };
      world.resources.set(patch.id, patch);
    }
  }
  for (const plant of outsidePlants) {
    const prng = RngStreams.fromSeed(`${plant.clusterId}:body`);
    const leaves = MIN_PLANT_LEAVES + Math.floor(prng.next("experiment") * (MAX_PLANT_LEAVES - MIN_PLANT_LEAVES + 1));
    const plantCapacity = def.config.patchCapacity * (0.8 + 0.3 * prng.next("experiment"));
    const baseRegen = 0.025 + 0.045 * prng.next("experiment");
    const perLeaf = plantCapacity / leaves;
    for (let l = 0; l < leaves; l++) {
      const ang = (l / leaves) * Math.PI * 2 + prng.next("experiment") * 0.6;
      const rad = 0.8 + prng.next("experiment") * 1.9;
      const patch: ResourcePatch = {
        id: nextPatchId(),
        x: clamp((plant.cx + 0.35 + prng.next("experiment") * 0.3) * cellSize + (prng.next("experiment") - 0.5) * cellSize * 0.9, 2, def.config.width - 2),
        y: clamp((plant.cy + 0.35 + prng.next("experiment") * 0.3) * cellSize + (prng.next("experiment") - 0.5) * cellSize * 0.9, 2, def.config.height - 2),
        quantity: perLeaf * (0.4 + 0.6 * prng.next("experiment")),
        regenerationRate: baseRegen * (0.7 + 0.6 * prng.next("experiment")),
        clusterId: plant.clusterId,
        capacity: perLeaf,
      };
      world.resources.set(patch.id, patch);
    }
  }

  // Founder population. Founders are recorded in the lineage book directly
  // (they bypass the delta path; Part 14 G12/I18-B: every organism has a node).
  // Founders are born mature (age 0 with full maturity) so the first
  // generation can reproduce; offspring develop (Part 15).
  // Founders drop near plant clusters so the first generation can actually feed
  // and accumulate complex molecules (ProtoEvo economy) instead of starving.
  const plantPositions: [number, number][] = [];
  for (const r of world.resources.values()) {
    if (r.clusterId) plantPositions.push([r.x, r.y]);
  }
  for (let i = 0, n = def.config.initialPopulation; i < n; i++) {
    const genome = randomGenome(rng);
    const tp = plantPositions[Math.floor(rng.next("experiment") * plantPositions.length)]!;
    const jit = (rng.next("experiment") - 0.5) * 6;
    const fx = clamp(tp[0] + Math.cos(jit) * 3, 2, def.config.width - 2);
    const fy = clamp(tp[1] + Math.sin(jit) * 3, 2, def.config.height - 2);
    const o = makeOrganism(
      nextOrganismId(0),
      genome,
      fx,
      fy,
      72 + u(rng, 48),
      [],
      0,
      rng,
    );
    world.organisms.set(o.id, o);
    world.lineage.recordBirth(o.id, o.parentIds, o.genomeId, 0);
  }

  // Part 17 §17.6 I17-A: seed the conservation ledger with initial energy.
  let initial = 0;
  for (const o of world.organisms.values()) initial += o.energy;
  for (const r of world.resources.values()) initial += r.quantity;
  world.conservation.initialEnergy = initial;
  return world;
}

export {};
