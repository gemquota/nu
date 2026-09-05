// Presentation plane — the nu web lab (Part 11 §11.14, Part 12 §12.44).
// The engine is imported, never modified: the lab is a renderer + intervention
// surface. It runs the same deterministic kernel the CLI runs; rendering state
// (camera, selection, speed) lives HERE, not in the world (§12.44).
//
// Renderer independence (Invariant 1 / Test G): the lab only reads world state
// and applies interventions through the world's delta path — never by editing
// organism records directly — so causality stays explicit (Test I).

import { Kernel } from "../kernel/kernel";
import { RngStreams } from "../kernel/rng";
import { World, type Genome, type OrganismRecord, type WorldConfig } from "../world/world";
import { defaultSystems, computeMetrics, type TickMetrics } from "../systems/systems";
import { initializeWorld, randomGenome, makeOrganism, nextOrganismId, resetIdCounters } from "../world/initialization";
import { DEFAULT_RUNNER } from "../experiment/config";
import type { RunnerConfig } from "../experiment/runner";
import type { ExperimentDefinition } from "../world/initialization";

export interface LabSettings {
  /** Simulation ticks per rendered frame. */
  ticksPerFrame: number;
  showField: boolean;
  showResources: boolean;
  showOrganisms: boolean;
}

/** World + runner parameters exposed by the lab's Parameters tab. */
export type LabParameters = WorldConfig &
  Pick<
    RunnerConfig,
    | "consumeRadius"
    | "biteSize"
    | "corpseEnergyFraction"
    | "mutationRate"
    | "mutationSigma"
    | "reproductionProbability"
    | "recombination"
    | "learningRate"
  >;

export const DEFAULT_LAB_SETTINGS: LabSettings = {
  ticksPerFrame: 2,
  showField: true,
  showResources: true,
  showOrganisms: true,
};

const DEFAULT_LAB_PARAMETERS: LabParameters = { ...DEFAULT_RUNNER };

export class Lab {
  world: World;
  private kernel: Kernel;
  private rng: RngStreams;
  private currentSeed: string;
  private spawnCount = 0;
  settings: LabSettings = { ...DEFAULT_LAB_SETTINGS };
  parameters: LabParameters;
  /** Presentation-only selection (§12.44: never authoritative state). */
  selectedId: string | null = null;
  /** I1.6: presentation-only selected plant cluster (tooltip reads the cluster's pool/income/queue). */
  selectedClusterId: string | null = null;
  /** Ring-buffer of per-tick metrics for the live charts. */
  readonly history: TickMetrics[] = [];
  /** Cumulative counters for the header readout. */
  births = 0;
  deaths = 0;

  constructor(readonly def: ExperimentDefinition) {
    this.parameters = { ...DEFAULT_LAB_PARAMETERS, ...def.config };
    this.currentSeed = def.seed;
    resetIdCounters();
    this.rng = RngStreams.fromSeed(def.seed);
    this.world = initializeWorld(this.definition(), this.rng);
    this.kernel = new Kernel(defaultSystems(this.world, this.parameters));
  }

  get seed(): string {
    return this.currentSeed;
  }

  getParameters(): LabParameters {
    return { ...this.parameters };
  }

  /** Apply declarative parameters and start a new deterministic run. */
  setParameters(partial: Partial<LabParameters>, seed = this.currentSeed): void {
    this.parameters = { ...this.parameters, ...partial };
    this.reset(seed);
  }

  /** Reset from the current definition and parameters. */
  reset(seed = this.currentSeed): void {
    this.currentSeed = seed;
    resetIdCounters();
    this.rng = RngStreams.fromSeed(seed);
    this.world = initializeWorld(this.definition(), this.rng);
    this.kernel = new Kernel(defaultSystems(this.world, this.parameters));
    this.history.length = 0;
    this.births = 0;
    this.deaths = 0;
    this.selectedId = null;
    this.spawnCount = 0;
  }

  private definition(): ExperimentDefinition {
    const config: WorldConfig = { ...this.parameters };
    return { ...this.def, seed: this.currentSeed, config };
  }

  /** Advance exactly one tick (deterministic; identical to the CLI run). */
  step(): TickMetrics | null {
    const r = this.kernel.tick(this.world, this.rng);
    if (!r.committed) return null;
    const births = r.events.reduce((n, e) => (e.eventType === "OrganismBorn" ? n + 1 : n), 0);
    const deaths = r.events.reduce((n, e) => (e.eventType === "OrganismDied" ? n + 1 : n), 0);
    this.births += births;
    this.deaths += deaths;
    const m = computeMetrics(this.world, births, deaths);
    this.history.push(m);
    if (this.history.length > 720) this.history.shift();
    this.world.ephemeral.lastEvents = [...r.events];
    return m;
  }

  /** Advance up to ticksPerFrame ticks, stopping at extinction. */
  advance(): TickMetrics | null {
    let last: TickMetrics | null = null;
    for (let i = 0; i < this.settings.ticksPerFrame; i++) {
      if (this.world.liveOrganisms().length === 0) break;
      last = this.step();
    }
    return last;
  }

  // -- Interventions (explicit causality, Test I: via deltas, never hand edits) --

  /** Spawn a founder organism at (x, y) with a fresh random genome. */
  spawn(x: number, y: number): void {
    const genome: Genome = randomGenome(this.spawnRng());
    const o = makeOrganism(
      nextOrganismId(this.world.tick),
      genome,
      clamp(x, 1, this.world.config.width - 1),
      clamp(y, 1, this.world.config.height - 1),
      80,
      [],
      this.world.tick,
      this.spawnRng(),
    );
    this.world.applyDelta({ kind: "add", scope: "organism", entity: o });
  }

  /** Kill organisms within radius r of (x, y) — the "lightning tool". */
  cull(x: number, y: number, r = 12): number {
    let killed = 0;
    for (const o of this.world.liveOrganisms()) {
      const dx = o.x - x;
      const dy = o.y - y;
      if (dx * dx + dy * dy <= r * r) {
        this.world.applyDelta({ kind: "set", scope: "organism.lifecycle", key: o.id, value: "DYING" });
        this.world.applyDelta({ kind: "remove", scope: "organism", id: o.id });
        killed++;
      }
    }
    return killed;
  }

  /** Serialize a checkpoint (browser-safe: no Bun APIs). */
  serializeCheckpoint(): string {
    return JSON.stringify({ world: this.world.serialize() });
  }

  /** Presentation-only intervention stream; kernel streams remain untouched. */
  private spawnRng(): RngStreams {
    return RngStreams.fromSeed(`lab:${this.currentSeed}:${this.world.tick}:${this.spawnCount++}`);
  }
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}
