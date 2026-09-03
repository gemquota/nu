// World plane — cross-phase intent shapes (Part 13 §13.3).
// Intents are ephemeral proposals: visible only to later phases within the
// same tick, never persisted, never authoritative state (Part 12 §12.24).
//
// Every intent carries a `type` discriminant: a consumer phase may only act
// on intents of its own type. This prevents cross-phase leakage (e.g. an
// INHERIT system mistaking a DECIDE move intent for a reproduction intent).

/** DECIDE → ACT: a proposed heading. */
export interface MoveIntent {
  readonly type: "move";
  readonly actorId: string;
  readonly headingX: number;
  readonly headingY: number;
  readonly speed: number;
}

/** INTERACT → RESOLVE: a proposed consumption. */
export interface ConsumptionIntent {
  readonly type: "consume";
  readonly actorId: string;
  readonly resourceId: string;
  readonly amount: number;
}

/** REPRODUCE → INHERIT: a proposed reproduction. */
export interface ReproductionIntent {
  readonly type: "reproduce";
  readonly actorId: string;
  readonly investmentShare: number;
  readonly reproductionCost: number;
}

/** DECIDE → UPDATE: a proposed spike attack on another cell (predation). */
export interface AttackIntent {
  readonly type: "attack";
  readonly actorId: string;
  readonly targetId: string;
  readonly damage: number;
}

export type Intent = MoveIntent | ConsumptionIntent | ReproductionIntent | AttackIntent;
