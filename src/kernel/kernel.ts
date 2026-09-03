// Kernel plane — the simulation kernel (Part 13).
//
// Implements:
//   §13.1  Tick lifecycle (begin → execute → commit → finalize)
//   §13.4  Double buffering: phases write intents/deltas to buffers; only
//          COMMIT applies them. Phases cannot observe uncommitted writes
//          (K2, K3).
//   §13.6  System scheduling: the schedule is a kernel-defined deterministic
//          total order over system contracts (K5) — not import order.
//   §13.8  Event generation: events are byproducts of a committed tick,
//          never inputs to one.
//   §13.14 Rollback: a failed phase discards its buffers; STATE(t) is
//          untouched and no events publish.
//   K6     Time advances only at commit; no wall-clock inputs.

import { RngStreams, STREAM_NAMES } from "./rng";
import type { StreamName } from "./rng";
import type { DomainEvent, DomainEventType } from "./events";
import { domainEvent } from "./events";
import { MODEL_VERSION, PHASES, type Phase } from "./version";

/** Read/write contract declared by every system (Part 11 §11.5, Part 13 §13.3). */
export interface SystemContract {
  readonly systemId: string;
  readonly phases: readonly Phase[];
  readonly reads: readonly string[];
  readonly writes: readonly string[];
  /** The stream this system draws from, if any (K4). */
  readonly stream?: StreamName;
}

/**
 * A state delta. The kernel stages deltas during a tick and applies them only
 * at COMMIT (§13.4 double buffering). Deltas are interpretable state changes,
 * not commands: the world owns how each is applied (Part 12 §12.28).
 */
export type Delta =
  | { readonly kind: "set"; readonly scope: string; readonly key: string; readonly value: number | string }
  | { readonly kind: "adjust"; readonly scope: string; readonly key: string; readonly amount: number }
  | { readonly kind: "add"; readonly scope: string; readonly entity: unknown }
  | { readonly kind: "remove"; readonly scope: string; readonly id: string };

export interface TickContext {
  readonly tick: number;
  readonly phase: Phase;
  readonly rng: RngStreams;
  /** Event sink; events publish only at commit (§13.8). */
  emit(
    eventType: DomainEventType,
    actorIds: string[],
    targetIds: string[],
    payload: Record<string, unknown>,
  ): void;
  /** Stage a delta for commit. */
  stage(delta: Delta): void;
  /** Record an intent for cross-phase resolution (DECIDE → ACT, INTERACT → RESOLVE, REPRODUCE → INHERIT). */
  recordIntent(intent: unknown): void;
  /** Intents recorded so far this tick — visible only to later phases (§13.3). */
  readonly intents: readonly unknown[];
  /** Debug-mode boundary assertion (K3, §13.19). Throws when scope is not in the active contract. */
  assertWrite(scope: string): void;
}

export interface System {
  readonly contract: SystemContract;
  /** Execute this system's contribution to one phase of one tick. */
  run(ctx: TickContext): void;
}

/**
 * The world-side application surface. The kernel never interprets deltas;
 * the world (which owns state transitions per Part 12 §12.28) applies them.
 * `applyDelta` + `advanceTime` must be atomic from the kernel's perspective.
 */
export interface WorldSurface {
  readonly tick: number;
  applyDelta(delta: Delta): void;
  advanceTime(): void;
}

export interface TickResult {
  readonly tick: number;
  readonly committed: boolean;
  readonly events: readonly DomainEvent[];
  readonly deltaCount: number;
  /** Present when the tick rolled back (§13.14). */
  readonly error?: string;
}

export class Kernel {
  private readonly systems: readonly System[];
  private readonly debug: boolean;

  constructor(systems: readonly System[], debug = false) {
    // §13.6: the schedule is a kernel-defined total order, not import order.
    // Systems sharing a phase keep the caller's relative order (stable sort).
    const order = new Map<Phase, number>(PHASES.map((p, i) => [p, i]));
    this.systems = [...systems].sort(
      (a, b) => order.get(a.contract.phases[0]!)! - order.get(b.contract.phases[0]!)!,
    );
    this.debug = debug;
  }

  get schedule(): readonly string[] {
    return this.systems.map((s) => s.contract.systemId);
  }

  /**
   * Advance one tick: STATE(t) → STATE(t+1) (§13.0 pipeline, §13.1 lifecycle).
   * A tick either commits completely or not at all (K2).
   */
  tick(world: WorldSurface, rng: RngStreams): TickResult {
    const t = world.tick;

    // §13.1 Begin — validate preconditions: all streams present, no stale
    // buffers. (Reading stream state performs no draws — K4.)
    for (const name of STREAM_NAMES) void rng.state()[name];

    const events: DomainEvent[] = [];
    const deltas: Delta[] = [];
    const intents: unknown[] = [];
    let eventSeq = 0;
    let activeContract: SystemContract | null = null;
    let currentPhase: Phase = PHASES[0]!;
    const debug = this.debug;

    const ctx: TickContext = {
      get tick() {
        return t;
      },
      get phase() {
        return currentPhase;
      },
      rng,
      intents,
      emit(eventType, actorIds, targetIds, payload) {
        events.push(domainEvent(eventType, t, eventSeq++, actorIds, targetIds, payload, MODEL_VERSION));
      },
      stage(delta) {
        deltas.push(delta);
      },
      recordIntent(intent) {
        intents.push(intent);
      },
      assertWrite(scope) {
        if (!debug || !activeContract) return;
        if (!activeContract.writes.includes(scope)) {
          throw new Error(
            `K3 boundary violation: system "${activeContract.systemId}" may not write scope "${scope}" (writes: ${activeContract.writes.join(", ")})`,
          );
        }
      },
    };

    // §13.1 Execute — phases in canonical order, systems in schedule order (K5).
    try {
      for (const phase of PHASES) {
        currentPhase = phase;
        if (phase === "COMMIT") break;
        for (const system of this.systems) {
          if (!system.contract.phases.includes(phase)) continue;
          activeContract = system.contract;
          system.run(ctx);
        }
        activeContract = null;
      }
    } catch (err) {
      // §13.14 Rollback — discard buffers; STATE(t) untouched. No events publish.
      return {
        tick: t,
        committed: false,
        events: [],
        deltaCount: 0,
        error: err instanceof Error ? err.message : String(err),
      };
    }

    // §13.1 Commit — atomically apply staged deltas (K2).
    for (const delta of deltas) world.applyDelta(delta);
    // §13.1 Finalize — time advances only at commit (K6).
    world.advanceTime();

    return { tick: t, committed: true, events, deltaCount: deltas.length };
  }
}
