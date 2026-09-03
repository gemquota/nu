// Experimentation plane — replication & counterfactual branching
// (Part 19; Part 11 §§11.12–11.13; Part 12 §§12.40–12.43).
//
//   R-1  Seed derivation is deterministic: replicate i uses derive(seed, i).
//   R-2  Replicates share nothing but the frozen definition (Invariant 6).
//   B-1  Branches inherit state + RNG + provenance; new branch id (12.40).
//   B-2  A counterfactual differs from its baseline by exactly one declared
//        config-domain diff (12.41).
//   B-3  Branches record parentId, branchPointTick, and the intervention.

import { runExperiment, type Checkpoint, type RunnerConfig } from "./runner";
import type { ExperimentDefinition } from "../world/initialization";
import { hashSeed } from "../kernel/seed";
import { World } from "../world/world";
import { RngStreams } from "../kernel/rng";
import { Kernel } from "../kernel/kernel";
import { defaultSystems, computeMetrics, type TickMetrics } from "../systems/systems";
import { MODEL_VERSION, SCHEMA_VERSION } from "../kernel/version";
import type { RunSummary } from "./runner";

/** R-1: deterministic replicate seed derivation (pure, documented). */
export function deriveSeed(rootSeed: string, replicateIndex: number): string {
  return `rep:${hashSeed(`${rootSeed}:${replicateIndex}`).toString(36)}`;
}

export interface ReplicateResult {
  readonly replicateIndex: number;
  readonly replicateId: string;
  readonly seed: string;
  readonly metrics: TickMetrics[];
  readonly summary: RunSummary;
}

/** Run a single replicate of a definition with a derived seed (R-1, R-2). */
export function runReplicate(
  def: ExperimentDefinition,
  runner: RunnerConfig,
  replicateIndex: number,
  options: { readonly ticks: number; readonly debug?: boolean },
): ReplicateResult {
  const seed = deriveSeed(def.seed, replicateIndex);
  const replicateDef: ExperimentDefinition = {
    ...def,
    seed,
    replicateId: `r${replicateIndex}`,
  };
  const { metrics, summary } = runExperiment(replicateDef, runner, {
    ticks: options.ticks,
    debug: options.debug,
  });
  return { replicateIndex, replicateId: `r${replicateIndex}`, seed, metrics, summary };
}

export interface AggregateStats {
  /** Per-metric final-tick mean across replicates. */
  readonly finalMean: Record<string, number>;
  /** Per-metric final-tick variance across replicates. */
  readonly finalVariance: Record<string, number>;
  /** Extinction tick per replicate; undefined = survived the run. */
  readonly extinctions: (number | undefined)[];
  readonly replicates: number;
  readonly survivors: number;
}

/** Statistical aggregation across replicates (R-3, I19-D). */
export function aggregate(results: readonly ReplicateResult[]): AggregateStats {
  const finals = results.filter((r) => r.metrics.length > 0).map((r) => r.metrics[r.metrics.length - 1]!);
  const finalMean: Record<string, number> = {};
  const finalVariance: Record<string, number> = {};
  if (finals.length > 0) {
    const keys = Object.keys(finals[0]!);
    for (const key of keys) {
      const values = finals.map((m) => (m as unknown as Record<string, number>)[key]!);
      const mean = values.reduce((a, b) => a + b, 0) / values.length;
      finalMean[key] = mean;
      finalVariance[key] =
        values.reduce((a, b) => a + (b - mean) * (b - mean), 0) / values.length;
    }
  }
  const extinctions = results.map((r) =>
    r.metrics.length > 0 && r.metrics[r.metrics.length - 1]!.population === 0
      ? r.metrics[r.metrics.length - 1]!.tick
      : undefined,
  );
  return {
    finalMean,
    finalVariance,
    extinctions,
    replicates: results.length,
    survivors: extinctions.filter((e) => e === undefined).length,
  };
}

/** Run N replicates and aggregate (§11.13; I19-A holds per replicate). */
export function runReplicatedExperiment(
  def: ExperimentDefinition,
  runner: RunnerConfig,
  options: {
    readonly ticks: number;
    readonly replicates: number;
    readonly onReplicate?: (result: ReplicateResult) => void;
    readonly debug?: boolean;
  },
): { results: ReplicateResult[]; stats: AggregateStats } {
  const results: ReplicateResult[] = [];
  for (let i = 0; i < options.replicates; i++) {
    const r = runReplicate(def, runner, i, options);
    results.push(r);
    options.onReplicate?.(r);
  }
  return { results, stats: aggregate(results) };
}

// ---------------------------------------------------------------------------
// Counterfactual branching (§12.40–12.41; B-1..B-4).
// ---------------------------------------------------------------------------

/** B-2: a declared, single-key configuration-domain diff. */
export interface ConfigIntervention {
  readonly domain: "config";
  readonly key: string;
  readonly value: number | string | boolean;
}

export interface BranchProvenance {
  readonly parentId: string;
  readonly parentReplicateId: string;
  readonly branchId: string;
  readonly branchPointTick: number;
  readonly intervention: ConfigIntervention | null;
}

/**
 * B-1/B-2: branch from a checkpoint with one declared config diff.
 * The parent checkpoint object is never mutated (Test E / I19-B) — the diff is
 * applied to a copy of the config inside the restored world's definition.
 */
export function branchFromCheckpoint(
  cp: Checkpoint,
  runner: RunnerConfig,
  options: {
    readonly branchId: string;
    readonly ticks: number;
    readonly intervention?: ConfigIntervention;
    readonly onTick?: (tick: number, metrics: TickMetrics) => void;
  },
): { metrics: TickMetrics[]; summary: RunSummary; provenance: BranchProvenance } {
  // Deep-copy the checkpoint's world so the parent stays pristine (I19-B).
  const worldData = JSON.parse(JSON.stringify(cp.world)) as Checkpoint["world"];

  let intervention: ConfigIntervention | null = null;
  if (options.intervention) {
    intervention = options.intervention;
    const config: Record<string, unknown> = { ...worldData.config };
    config[intervention.key] = intervention.value;
    worldData.config = config as unknown as typeof worldData.config;
    // A changed world config is a different experiment identity (12.43, X1):
    // record it in provenance, not by mutating history.
    worldData.meta = {
      ...worldData.meta,
      worldId: `${worldData.meta.worldId}:${options.branchId}`,
    };
  }

  // Resume directly from the restored state via the low-level runner path.
  const { metrics, summary } = runResumed(cp, worldData, runner, options.ticks, options.onTick);

  return {
    metrics,
    summary,
    provenance: {
      parentId: cp.world.meta.worldId,
      parentReplicateId: cp.world.meta.replicateId,
      branchId: options.branchId,
      branchPointTick: cp.world.tick,
      intervention,
    },
  };
}

/** Resume from (possibly modified) checkpoint data — used by branching. */
function runResumed(
  cp: Checkpoint,
  worldData: Checkpoint["world"],
  runner: RunnerConfig,
  ticks: number,
  onTick?: (tick: number, metrics: TickMetrics) => void,
): { metrics: TickMetrics[]; summary: RunSummary } {
  const world = World.restore(worldData);
  const rng = RngStreams.restore(cp.world.rngState);
  const kernel = new Kernel(defaultSystems(world, runner));
  const metrics: TickMetrics[] = [];

  for (let i = 0; i < ticks; i++) {
    const result = kernel.tick(world, rng);
    if (!result.committed) continue;
    const births = result.events.reduce((n, e) => (e.eventType === "OrganismBorn" ? n + 1 : n), 0);
    const deaths = result.events.reduce((n, e) => (e.eventType === "OrganismDied" ? n + 1 : n), 0);
    const m = computeMetrics(world, births, deaths);
    metrics.push(m);
    onTick?.(result.tick, m);
    if (m.population === 0) break;
  }

  const finalMetrics = metrics[metrics.length - 1] ?? computeMetrics(world, 0, 0);
  return {
    metrics,
    summary: {
      experimentId: world.meta.experimentId,
      replicateId: world.meta.replicateId,
      seed: world.meta.seed,
      modelVersion: MODEL_VERSION,
      schemaVersion: SCHEMA_VERSION,
      ticksRequested: ticks,
      ticksCompleted: metrics.length,
      rollbacks: 0,
      finalMetrics,
      totalBirths: metrics.reduce((a, m) => a + m.births, 0),
      totalDeaths: metrics.reduce((a, m) => a + m.deaths, 0),
      peakPopulation: metrics.reduce((mx, m) => Math.max(mx, m.population), 0),
    },
  };
}
