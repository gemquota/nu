// World plane — plant ecology (ProtoEvo morphology + Part 17 E4 niche construction).
//
// A plant is a CLUSTER of attached, slightly-overlapping small orbs (leaf
// nodes). Over time a plant GROWS by spawning new attached leaf nodes (up to a
// cap). When a plant wiggles or is eaten, a small chance a clump dislodges and
// becomes a drifting spore that settles elsewhere to spread the plant.
//
// All of this is authoritative world state expressed as ordinary resource
// patches (R3 multi-resource): leaves are "energy" patches sharing a clusterId;
// spores are patches flagged `spore` that drift and settle.

import type { ResourcePatch, ResourceType } from "./world";

/** Maximum leaf nodes a single plant cluster can grow to. */
export const MAX_CLUSTER_LEAVES = 6;
/** Typical starting leaf count for a newly spawned plant. */
export const MIN_PLANT_LEAVES = 3;
export const MAX_PLANT_LEAVES = 5;
/**
 * Leaf fraction below which a leaf stops regrowing — the "wilt line". Kept as
 * a pool signal source in I1: a leaf at/below the wilt line is treated as
 * contributing no income. Retired as a *death* mechanism (I1.4): death is
 * budget-only via the cluster pool (UPKEEP_STARVATION_TICKS).
 */
export const LEAF_WILT_FRACTION = 0.06;
/**
 * @deprecated I1.4 retired the depletion-tick camping special case. Kept only
 * as a migration alias; the runtime no longer reads it. Budget-only mortality
 * (cluster pool starvation) replaced it.
 */
export const LEAF_DEPLETION_TICKS = 240;
/** World-unit radius of a leaf orb (small — clusters read as attached orbs). */
export const PLANT_ORB_RADIUS = 1.7;
/**
 * Centre-to-centre spacing between leaf orbs in a cluster: exactly one orb
 * diameter, so neighbouring leaves just touch and read as a single plant
 * body without overlapping into a clump.
 */
export const LEAF_MIN_SPACING = PLANT_ORB_RADIUS * 2.02;
/**
 * Extra clearance a NEW leaf keeps from a DIFFERENT cluster, so distinct
 * plants don't merge into one blob (and their ids/clusters stay readable).
 */
export const CLUSTER_MIN_SPACING = PLANT_ORB_RADIUS * 3.2;
/** Probability a plant centre is placed at/next to water (spawn bias). */
export const WATER_SPAWN_PROBABILITY = 0.9;
/** Probability per tick a plant attempts to grow a new leaf. */
export const GROWTH_PROBABILITY = 0.002;
/**
 * I1.3 — Growth is proposal-only: this probability proposes a new leaf; the
 * cluster's energy pool gates everything. A proposal only queues when the
 * pool can pay GROWTH_COST plus a reserve for upkeep during maturation.
 */
export const GROWTH_RESERVE = 4;
// ---------------------------------------------------------------------------
// I1 — Living Physiology: per-cluster budget constants (exported for tests).
// ---------------------------------------------------------------------------
/**
 * I1.2 Multi-field photosynthesis scale: pool income per tick per mature leaf
 * is PHOTOSYNTHESIS_RATE × leafCapacity × the product of the environment
 * fields (light, water, soil, chemical modifier). Sampled through
 * `photosynthesisInput()` so I2 genes can reweight it later.
 */
export const PHOTOSYNTHESIS_RATE = 0.028;
/** I1.3 Energy cost paid from the pool when a queued leaf is *queued*. */
export const GROWTH_COST = 6;
/** I1.3 Ticks a queued leaf takes to mature (paid upkeep while building). */
export const LEAF_MATURATION_TICKS = 90;
/** I1.4 Upkeep per mature leaf per tick, paid from the cluster pool. */
export const UPKEEP_PER_LEAF = 0.02;
/** I1.4 Consecutive ticks the pool can't cover upkeep before a leaf dies. */
export const UPKEEP_STARVATION_TICKS = 60;
/** I1.4 Upkeep cost multiplier for a leaf still under construction. */
export const CONSTRUCTION_UPKEEP_FRACTION = 0.5;
/** I1.2/I1.4 Soil feedback: pool activity depletes local soil; recovery when idle. */
export const SOIL_DEPLETION_PER_TICK = 0.00025;
export const SOIL_RECOVERY_PER_TICK = 0.0004;
/** Soil fertility floor: income scales with fertility ∈ [SOIL_FLOOR, 1]. */
export const SOIL_FLOOR = 0.55;
/**
 * I1.2 chemical-field contribution: the ambient chemical field at the leaf
 * nudges income by ±CHEMICAL_INCOME_BIAS (clamped), representing root uptake
 * of dissolved compounds. Small — the field is a modifier, not a driver.
 */
export const CHEMICAL_INCOME_BIAS = 0.1;
/** Maximum stored energy in a cluster pool (a multiple of one leaf capacity). */
export const POOL_CAPACITY_LEAVES = 2.5;
/**
 * I1.1 — Per-cluster authoritative state (Stage A hybrid). The patch
 * representation stays the body/edibility substrate; the cluster's physiology
 * (pool, age, soil, construction queue) lives in a delta-tracked world map
 * `plantClusters` so rollback semantics match the kernel's double-buffer
 * discipline. Ownership: written by the plant-physiology phases, read by
 * consumption (grazed withdrawals), metrics, and the lab (read-only).
 */
export interface PlantClusterState {
  readonly clusterId: string;
  /** Stored energy pool (the plant's budget: income − upkeep − grazing). */
  energy: number;
  /** Age in ticks. */
  age: number;
  /** Local soil fertility consumed by this cluster's activity, 0..1. */
  soilDepletion: number;
  /**
   * Construction queue (Part 15 semantics): leaves queued and paid at
   * GROWTH_COST, maturing over LEAF_MATURATION_TICKS. Each entry is the leaf
   * id the matured node will use (queue honesty, I-PL1.3).
   */
  queue: { readonly leafId: string; readonly ticksLeft: number }[];
  /** Consecutive ticks the pool failed to cover upkeep (budget-only death). */
  starvationTicks: number;
  /** Cumulative per-field income of the last tick (lab readout, presentation-only mirror). */
  lastIncome: { light: number; water: number; soil: number; chemical: number; total: number };
}

export function makePlantCluster(clusterId: string, initialEnergy: number): PlantClusterState {
  return {
    clusterId,
    energy: initialEnergy,
    age: 0,
    soilDepletion: 0,
    queue: [],
    starvationTicks: 0,
    lastIncome: { light: 0, water: 0, soil: 0, chemical: 0, total: 0 },
  };
}

/**
 * I1.2 — the single sampling helper for multi-field photosynthesis. Every
 * income computation goes through here so I2 genes can reweight the fields in
 * one place. Fields: light (day/night daylight()), water (basin proximity via
 * terrain resource factor), soil (fertility from cluster depletion), chemical
 * (ambient chemical field as a small clamped modifier).
 */
export interface PhotosynthesisInput {
  readonly light: number;
  readonly water: number;
  readonly soil: number;
  readonly chemical: number;
}

export function photosynthesisInput(
  daylightFactor: number,
  waterFactor: number,
  soilDepletion: number,
  chemicalSample: number,
): PhotosynthesisInput {
  const light = Math.min(1, Math.max(0, daylightFactor));
  const water = Math.min(1, Math.max(0, waterFactor));
  const soil = Math.max(SOIL_FLOOR, 1 - soilDepletion);
  const chemical = 1 + CHEMICAL_INCOME_BIAS * Math.tanh(chemicalSample);
  return { light, water, soil, chemical };
}
/** Probability a new piece detaches as a spore rather than attaching. */
export const SPORE_GROWTH_PROBABILITY = 0.1;
/** Probability being eaten dislodges a spore. */
export const EAT_DISLODGE_PROBABILITY = 0.015;
/** Maximum plant clusters the ecosystem sustains (a multiple of the start count). */
export const MAX_PLANT_CLUSTERS_SCALE = 4.0;
/** A settling spore sprouts this many leaves. */
export const SPORE_PLANT_LEAVES = 3;
/**
 * Drift ticks before a spore settles (baseline for a small world). Scaled by
 * `sporeLifespanFor` so dispersal distance grows with the arena — a spore
 * should be able to cross a meaningful fraction of the world, never landing
 * next to its parent where a camped carnivore can farm it.
 */
export const SPORE_LIFESPAN = 40;
/** Minimum scaled drift lifetime (ticks). */
export const SPORE_LIFESPAN_MIN = 60;
/** Scaled drift lifetime = world perimeter × this factor, capped. */
export const SPORE_LIFESPAN_MAX = 320;
/**
 * Per-tick wind speed for drifting spores (world units/tick): a random-walk
 * wander applied on top of the ejection velocity so spores roam instead of
 * coasting a short ballistic arc.
 */
export const SPORE_WIND_SPEED = 0.45;
/** Deterministic drift lifetime scaled from the world's perimeter. */
export function sporeLifespanFor(width: number, height: number): number {
  const perimeter = 2 * (Math.abs(width) + Math.abs(height));
  return Math.round(clampRange(SPORE_LIFESPAN_MIN, SPORE_LIFESPAN_MAX, perimeter * 0.14));
}
function clampRange(lo: number, hi: number, v: number): number {
  return Math.min(hi, Math.max(lo, v));
}

/** Deterministic wobble phase for a leaf id (0..2π) — used for draw-time wiggle. */
export function wobblePhase(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return ((h >>> 0) / 4294967296) * Math.PI * 2;
}

/** Make a leaf node resource at a world position belonging to `clusterId`. */
export function makeLeaf(
  id: string,
  clusterId: string,
  x: number,
  y: number,
  capacity: number,
  quantity?: number,
): ResourcePatch {
  return {
    id,
    x,
    y,
    quantity: quantity ?? capacity * (0.4 + 0.5 * wobblePhase(id)),
    regenerationRate: 0.05,
    clusterId,
    capacity,
  };
}

/** Make a drifting spore resource (a detached clump that will settle). */
export function makeSpore(
  id: string,
  x: number,
  y: number,
  vx: number,
  vy: number,
  lifespan: number,
): ResourcePatch {
  return {
    id,
    x,
    y,
    quantity: 1,
    regenerationRate: 0,
    type: "molecules" as ResourceType,
    spore: true,
    sporeAge: 0,
    sporeLifespan: lifespan,
    sporeVx: vx,
    sporeVy: vy,
  };
}

/**
 * Even ring placement for a plant body: leaves are spaced at exactly one
 * orb diameter on concentric rings (so neighbours JUST TOUCH, never overlap
 * and never leave gaps). Ring 0 is the centre; ring k holds 6k sites at
 * hex-like packing — the same topology the growth system uses when it adds
 * leaves on the spacing ring. Deterministic.
 */
export function leafRingPosition(index: number, spacing: number): { x: number; y: number } {
  if (index === 0) return { x: 0, y: 0 };
  let remaining = index - 1;
  let ring = 1;
  while (remaining >= ring * 6) {
    remaining -= ring * 6;
    ring++;
  }
  const ang = (remaining / (ring * 6)) * Math.PI * 2;
  const rad = spacing * ring;
  return { x: Math.cos(ang) * rad, y: Math.sin(ang) * rad };
}

/** Cluster id for a freshly settled plant. */
export function plantClusterId(tick: number, seq: number): string {
  return `p${tick.toString(36)}:${seq.toString(36)}`;
}