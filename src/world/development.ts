// World plane — developmental state (Part 15 §§15.1, D1–D4).
//
// Development is a process with state, not a birth-time function: organisms
// mature over ticks, their phenotype scales with maturity, and reaching the
// maturity threshold is a domain transition (DevelopmentCompleted), not a
// clock lookup.

import type { OrganismRecord, Genome } from "./world";

export type DevelopmentStage = "EMBRYONIC" | "JUVENILE" | "MATURE" | "SENESCENT";

export interface DevelopmentState {
  readonly stage: DevelopmentStage;
  readonly maturity: number; // 0..1
}

/** A constructible phenotype module and its paid construction cost. */
export interface ConstructionModule {
  readonly name: string;
  readonly cost: number;
}

/**
 * Part 15 §15.2 — surface-node geometry: the phenotype modules an organism
 * constructs during development ARE its surface nodes (the ProtoEvo body).
 * Each node kind present in the genome (flagellum, sensory kinds, spike) is a
 * module with a cost proportional to its node count.
 */
export function buildConstructionModules(genes: Genome["genes"]): ConstructionModule[] {
  const kinds: Array<{ name: string; count: number; baseCost: number }> = [
    { name: "chemoreceptor", count: genes.chemoreceptorCount, baseCost: 2 },
    { name: "mechanoreceptor", count: genes.mechanoreceptorCount, baseCost: 2 },
    { name: "flagellum", count: genes.flagellumCount, baseCost: 3 },
    { name: "photoreceptor", count: genes.photoreceptorCount, baseCost: 4 },
    { name: "spike", count: genes.spikeCount, baseCost: 5 },
  ];
  const out: ConstructionModule[] = [];
  for (const k of kinds) {
    if (k.count > 0) out.push({ name: k.name, cost: k.count * k.baseCost });
  }
  return out;
}

export function constructionTotal(modules: readonly ConstructionModule[]): number {
  return modules.reduce((s, m) => s + m.cost, 0);
}

/**
 * Part 15 §15.1 — advance the construction queue for one tick. Construction
 * progresses toward the total cost at a rate that reaches completion at
 * `maturityTicks`. When the queue empties (maturity reaches 1), development
 * CANALIZES: the phenotype is locked and the domain transition fires.
 * Pure w.r.t. world state.
 */
export function advanceConstruction(
  progress: number,
  total: number,
  maturityTicks: number,
): { progress: number; maturity: number; completed: boolean } {
  if (total <= 0 || maturityTicks <= 0) {
    return { progress: 0, maturity: 1, completed: true };
  }
  const next = Math.min(total, progress + total / maturityTicks);
  const maturity = next / total;
  return { progress: next, maturity, completed: maturity >= 1 };
}

/** Which modules in the queue are fully constructed at a given progress. */
export function builtModules(modules: readonly ConstructionModule[], progress: number): string[] {
  const out: string[] = [];
  let cumulative = 0;
  for (const m of modules) {
    cumulative += m.cost;
    if (progress >= cumulative) out.push(m.name);
  }
  return out;
}

/**
 * Advance one organism's development for one tick (construction-based maturity,
 * Part 15 §15.1). Replaces the age-only approximation.
 */
export function advanceDevelopment(
  o: OrganismRecord,
  maturityTicks: number,
): { state: DevelopmentState; completed: boolean; nextProgress: number; queue: string[] } {
  const total = o.constructionTotal || 0;
  if (o.constructionQueue.length === 0) {
    return {
      state: { stage: "MATURE", maturity: 1 },
      completed: false,
      nextProgress: total,
      queue: [],
    };
  }
  const { progress, maturity, completed } = advanceConstruction(o.constructionProgress, total, maturityTicks);
  const stage = maturity < 0.25 ? "EMBRYONIC" : maturity < 1 ? "JUVENILE" : "MATURE";
  const queue = completed ? [] : o.constructionQueue;
  return {
    state: { stage, maturity },
    completed,
    nextProgress: progress,
    queue,
  };
}

export function stageOf(age: number, maturityTicks: number): DevelopmentStage {
  const m = maturityTicks <= 0 ? 1 : age / maturityTicks;
  if (m < 0.25) return "EMBRYONIC";
  if (m < 1) return "JUVENILE";
  if (m < 2) return "MATURE";
  return "SENESCENT";
}

/**
 * Part 15 §15.3 step 5 (EXPRESS): phenotype scales with developmental
 * maturity — juveniles are smaller/slower/weaker-sensing than adults.
 * Juvenile discount: 50% at birth → 100% at maturity.
 */
export function phenotypeScale(maturity: number): number {
  return 0.5 + 0.5 * Math.min(1, Math.max(0, maturity));
}
