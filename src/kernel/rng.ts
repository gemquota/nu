// Kernel plane — deterministic randomness.
// Implements Part 11 §11.10 (Randomness Contract) and Part 13 §13.9
// (Deterministic RNG Streams).
//
// Rules (K4 — stream discipline):
//   - one named stream per concern; never share a generator across concerns
//   - each stream is seeded deterministically from the experiment seed
//   - stream state is authoritative state: it is checkpointed and restored
//     (Part 12 §12.39). The states record IS the generator state — every draw
//     advances it in place — so `state()` is always exact and a snapshot taken
//     after N draws resumes with draw N+1 (Invariant 5).
//   - streams are never shared across phases (Part 13 §13.2 maps phases to
//     streams; see version.ts PHASE_STREAMS).

import { hashSeed } from "./seed";

export const STREAM_NAMES = [
  "genetics",
  "behaviour",
  "environment",
  "reproduction",
  "experiment",
  "kernel",
] as const;

export type StreamName = (typeof STREAM_NAMES)[number];

/** Stream state is part of the authoritative world state (Part 12 §12.24). */
export type RngStreamsState = Record<StreamName, number>;


/**
 * mulberry32 step: advance `states[name]` in place and return the draw.
 * The state record is the single source of generator truth.
 */
function draw(name: StreamName, states: RngStreamsState): number {
  const a = (states[name] + 0x6d2b79f5) | 0;
  states[name] = a;
  let t = a;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export class RngStreams {
  private readonly states: RngStreamsState;

  private constructor(states: RngStreamsState) {
    this.states = states;
  }

  /** Derive every stream deterministically from an experiment seed. */
  static fromSeed(seed: string): RngStreams {
    const states = {} as RngStreamsState;
    for (const name of STREAM_NAMES) {
      states[name] = hashSeed(`${seed}:${name}`);
    }
    return new RngStreams(states);
  }

  /** Restore from serialized authoritative state (Invariant 5). */
  static restore(states: RngStreamsState): RngStreams {
    const copy = {} as RngStreamsState;
    for (const name of STREAM_NAMES) copy[name] = states[name] >>> 0;
    return new RngStreams(copy);
  }

  /** Serialize authoritative stream state for checkpoints. */
  state(): RngStreamsState {
    const out = {} as RngStreamsState;
    for (const name of STREAM_NAMES) out[name] = this.states[name];
    return out;
  }

  /** Draw a float in [0,1) from a named stream. */
  next(stream: StreamName): number {
    return draw(stream, this.states);
  }

  /** Draw an integer in [0, n). */
  int(stream: StreamName, n: number): number {
    return Math.floor(this.next(stream) * n);
  }

  /** Draw a float in [min, max). */
  range(stream: StreamName, min: number, max: number): number {
    return min + this.next(stream) * (max - min);
  }

  /** Draw a standard-normal value (Box–Muller, exactly two draws) from a named stream. */
  normal(stream: StreamName, mean: number, stdDev: number): number {
    const u1 = Math.max(this.next(stream), Number.EPSILON);
    const u2 = this.next(stream);
    const mag = Math.sqrt(-2 * Math.log(u1));
    return mean + stdDev * mag * Math.cos(2 * Math.PI * u2);
  }
}
