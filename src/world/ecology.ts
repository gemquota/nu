// World plane — ecology aggregates (Part 17 §17.5 P1, Part 18 §18.2 species).
//
// Species are DERIVED observations, never authoritative state (P1): live
// organisms are clustered into taxa by genome similarity at observation time.
// No species field is stored anywhere; there is no fitness/score anywhere (S1).

import type { OrganismRecord } from "./world";

export interface SpeciesInfo {
  readonly speciesCount: number;
  /** Simpson index over species shares: 0 = one species, →1 = even mix. */
  readonly speciesDiversity: number;
}

/** A deterministic genome signature: genes discretized into a coarse bucket. */
function speciesSignature(o: OrganismRecord): string {
  const g = o.genome.genes;
  return [
    Math.round(g.trophic * 4),
    Math.round(g.nodeCount),
    Math.round(g.metabolism * 4),
    Math.round(g.aggression * 4),
    Math.round(g.speed * 4),
    Math.round(g.senseRadius / 4),
    Math.round(g.attackPower * 4),
    Math.round(g.growthEfficiency * 4),
    Math.round(g.daySensitivity * 4),
  ].join(":");
}

/**
 * Cluster live organisms into genome-bucketed species (Part 18 — genome-cluster
 * species). Deterministic and id-independent. Pure projection over authoritative
 * state; never consulted by the simulation's causal path.
 */
export function clusterSpecies(organisms: readonly OrganismRecord[]): SpeciesInfo {
  const buckets = new Map<string, number>();
  for (const o of organisms) {
    const sig = speciesSignature(o);
    buckets.set(sig, (buckets.get(sig) ?? 0) + 1);
  }
  const n = organisms.length;
  if (n === 0) return { speciesCount: 0, speciesDiversity: 0 };
  let sumSq = 0;
  for (const c of buckets.values()) {
    const p = c / n;
    sumSq += p * p;
  }
  return { speciesCount: buckets.size, speciesDiversity: 1 - sumSq };
}