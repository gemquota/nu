// Experimentation plane — the experiment runner (Part 11 §§11.11–11.14,
// Part 13 §13.16 checkpoint/replay).
//
// An experiment is a declarative definition + seed + tick budget. The runner
// advances the kernel tick by tick, records metrics per tick, and can
// checkpoint/restore authoritative state at tick boundaries. It uses no UI
// and no wall-clock inputs (K6): everything derives from the definition +
// seed. Experiments run without any UI (Part 11 §11.13).

import { Kernel, type System, type TickResult } from "../kernel/kernel";
import { RngStreams, type RngStreamsState } from "../kernel/rng";
import { MODEL_VERSION, SCHEMA_VERSION } from "../kernel/version";
import { infraEvent, type DomainEvent, type InfrastructureEvent } from "../kernel/events";
import { World, type SerializedWorld, type WorldConfig, type WorldSnapshotMeta } from "../world/world";
import { initializeWorld, resetIdCounters, type ExperimentDefinition } from "../world/initialization";
import { computeMetrics, defaultSystems, type TickMetrics } from "../systems/systems";

export interface RunnerConfig extends WorldConfig {
  readonly consumeRadius: number;
  readonly biteSize: number;
  readonly corpseEnergyFraction: number;
  readonly maturityAge: number;
  readonly mutationRate: number;
  readonly mutationSigma: number;
  /** Per-tick probability a mature, well-fed organism attempts to divide. */
  readonly reproductionProbability: number;
  /** Part 14 optional sexual recombination probability (0 = asexual heredity). */
  readonly recombination?: number;
  /** Part 16 lifetime plasticity: Hebbian learning rate (0 = no learning). */
  readonly learningRate?: number;
  /**
   * Part 18 §18.1 S3 — optional direct selection (researcher-defined objective).
   * An additive system: culls organisms scoring below `cutoff`. When absent,
   * selection is purely ecological. Emits SelectionApplied events (I18-D).
   */
  readonly directSelection?: { objective: (o: import("../world/world").OrganismRecord) => number; cutoff: number };
}

export interface Checkpoint {
  readonly world: SerializedWorld;
  readonly metrics: readonly TickMetrics[];
  readonly metricsUpTo: number;
}

export interface RunSummary {
  readonly experimentId: string;
  readonly replicateId: string;
  readonly seed: string;
  readonly modelVersion: string;
  readonly schemaVersion: number;
  readonly ticksRequested: number;
  readonly ticksCompleted: number;
  readonly rollbacks: number;
  readonly lastError?: string;
  readonly finalMetrics: TickMetrics;
  /** Aggregate stats across the run. */
  readonly totalBirths: number;
  readonly totalDeaths: number;
  readonly peakPopulation: number;
}

/**
 * Run an experiment headlessly. Returns per-tick metrics and a summary.
 * Optional checkpoint hook receives a serializable snapshot every
 * `checkpointEvery` ticks (and at the final tick).
 */
export function runExperiment(
  def: ExperimentDefinition,
  runner: RunnerConfig,
  options: {
    readonly ticks: number;
    readonly checkpointEvery?: number;
    readonly onCheckpoint?: (cp: Checkpoint) => void;
    readonly onTick?: (tick: number, result: TickResult, metrics: TickMetrics) => void;
    readonly debug?: boolean;
  },
): { metrics: TickMetrics[]; summary: RunSummary } {
  const { ticks, checkpointEvery = 0, onCheckpoint, onTick, debug = false } = options;

  // Seed → streams: the whole run derives from the definition + seed (K6).
  const rng = RngStreams.fromSeed(def.seed);
  resetIdCounters();
  const world = initializeWorld(def, rng);
  const kernel = new Kernel(defaultSystems(world, runner), debug);

  const metrics: TickMetrics[] = [];
  let rollbacks = 0;
  let lastError: string | undefined;
  let totalBirths = 0;
  let totalDeaths = 0;
  let peakPopulation = 0;

  const checkpoint = (upTo: number): Checkpoint => ({
    world: world.serialize(),
    metrics,
    metricsUpTo: upTo,
  });

  for (let i = 0; i < ticks; i++) {
    const prePopulation = world.liveOrganisms().length;
    const result = kernel.tick(world, rng);
    if (!result.committed) {
      rollbacks += 1;
      lastError = result.error;
      continue;
    }
    const births = countEvents(result.events, "OrganismBorn");
    const deaths = countEvents(result.events, "OrganismDied");
    totalBirths += births;
    totalDeaths += deaths;

    const m = computeMetrics(world, births, deaths);
    metrics.push(m);
    peakPopulation = Math.max(peakPopulation, m.population);
    world.ephemeral.lastEvents = [...result.events];
    onTick?.(result.tick, result, m);

    if (checkpointEvery > 0 && (i + 1) % checkpointEvery === 0) {
      onCheckpoint?.(checkpoint(result.tick + 1));
    }
    if (prePopulation === 0) break; // extinct: nothing left to simulate
  }

  // Final checkpoint (always) — the resumable boundary.
  onCheckpoint?.(checkpoint(world.tick));

  const finalMetrics = metrics[metrics.length - 1] ?? computeMetrics(world, 0, 0);
  return {
    metrics,
    summary: {
      experimentId: def.experimentId,
      replicateId: def.replicateId,
      seed: def.seed,
      modelVersion: MODEL_VERSION,
      schemaVersion: SCHEMA_VERSION,
      ticksRequested: ticks,
      ticksCompleted: metrics.length,
      rollbacks,
      lastError,
      finalMetrics,
      totalBirths,
      totalDeaths,
      peakPopulation,
    },
  };
}

/** Restore a checkpoint and continue ticking from that exact state. */
export function resumeFromCheckpoint(
  cp: Checkpoint,
  runner: RunnerConfig,
  options: {
    readonly ticks: number;
    readonly onTick?: (tick: number, result: TickResult, metrics: TickMetrics) => void;
  },
): { metrics: TickMetrics[]; summary: RunSummary } {
  const world = World.restore(cp.world);
  const rng = RngStreams.restore(cp.world.rngState);
  const kernel = new Kernel(defaultSystems(world, runner));
  const metrics: TickMetrics[] = [...cp.metrics];

  for (let i = 0; i < options.ticks; i++) {
    const result = kernel.tick(world, rng);
    if (!result.committed) continue;
    const births = countEvents(result.events, "OrganismBorn");
    const deaths = countEvents(result.events, "OrganismDied");
    const m = computeMetrics(world, births, deaths);
    metrics.push(m);
    world.ephemeral.lastEvents = [...result.events];
    options.onTick?.(result.tick, result, m);
    if (m.population === 0) break;
  }

  const finalMetrics = metrics[metrics.length - 1] ?? computeMetrics(world, 0, 0);
  return {
    metrics,
    summary: {
      experimentId: cp.world.meta.experimentId,
      replicateId: cp.world.meta.replicateId,
      seed: cp.world.meta.seed,
      modelVersion: MODEL_VERSION,
      schemaVersion: SCHEMA_VERSION,
      ticksRequested: options.ticks,
      ticksCompleted: metrics.length,
      rollbacks: 0,
      finalMetrics,
      totalBirths: 0,
      totalDeaths: 0,
      peakPopulation: metrics.reduce((mx, m) => Math.max(mx, m.population), 0),
    },
  };
}

function countEvents(events: readonly DomainEvent[], type: string): number {
  return events.reduce((n, e) => (e.eventType === type ? n + 1 : n), 0);
}

export function makeInfraEvent(
  eventType: "CheckpointWritten" | "SimulationCompleted" | "RunStarted",
  tick: number,
  seq: number,
  payload: Record<string, unknown>,
): InfrastructureEvent {
  return infraEvent(eventType, tick, seq, payload, MODEL_VERSION);
}

export type { SerializedWorld, WorldSnapshotMeta, RngStreamsState };
