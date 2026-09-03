// Kernel plane — model and schema versioning (Part 11 §11.25, Part 12 §12.35).
// Model version = what the simulation means. Schema version = how data is encoded.
//
// nu-core-v3 (environment topology):
//   - per-edge wall policies: solid | wrap | reflect (§12.13 environment laws)
//   - heterogeneous environmental zones: fertile | harsh | viscous (Part 17 §17.4)
// nu-core-v2 (Parts 14–18 stage-1):
//   - authoritative pheromone field with deposit/decay (Part 17 E1–E4)
//   - developmental maturity with DevelopmentCompleted transitions (Part 15 D1, D4)
//   - phenotype scaling during development; upkeep costs for expression (Part 15)
//   - observation-based sensing incl. pheromone gradients (Part 16 B1–B3)
//   - offspring module metadata with developmental upkeep costs (Part 15 stage 1)
//   - operator-tagged mutation events (Part 14 G6)
//   - optional direct-selection system emitting SelectionApplied (Part 18 S3)

import type { StreamName } from "./rng";

export const MODEL_VERSION = "nu-core-v3";
export const SCHEMA_VERSION = 3;

/** The phases of the tick pipeline, in canonical order (Part 13 §13.0/§13.2). */
export const PHASES = [
  "OBSERVE",
  "DECIDE",
  "ACT",
  "INTERACT",
  "RESOLVE",
  "UPDATE",
  "REPRODUCE",
  "INHERIT",
  "COMMIT",
] as const;

export type Phase = (typeof PHASES)[number];

/** Which RNG stream each phase may draw from (Part 13 §13.2 table; K4). */
export const PHASE_STREAMS: Record<Exclude<Phase, "OBSERVE" | "ACT" | "INTERACT" | "COMMIT">, StreamName> = {
  DECIDE: "behaviour",
  RESOLVE: "environment",
  UPDATE: "environment",
  REPRODUCE: "reproduction",
  INHERIT: "genetics",
};
