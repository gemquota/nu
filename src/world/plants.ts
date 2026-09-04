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
 * Leaf fraction below which a leaf stops regrowing — the "wilt line". Only a
 * leaf grazed essentially EMPTY (≤ 6% of its capacity) counts as starved, so
 * light browsing never kills a plant; a hard-camped, emptied leaf accrues
 * depleted ticks and after LEAF_DEPLETION_TICKS the node dies and vanishes —
 * cells eating a plant can consume it away instead of feeding off an
 * infinitely regenerating orb.
 */
export const LEAF_WILT_FRACTION = 0.06;
/**
 * Empty-starved ticks before a leaf node dies. Long enough (~1.3 s of sim
 * time) that only a genuinely camped plant loses nodes, never light browsing.
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