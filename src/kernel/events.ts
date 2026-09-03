// Kernel plane — canonical event schema (Part 12 §12.32) and the two event
// categories (Part 11 §11.15): domain events and infrastructure events.
// Events are immutable facts, never commands (Part 12 §12.32).
//
// Event ids are derived from (tick, seq) where `seq` is the per-tick sequence
// supplied by the kernel — so ids are stable under replay and checkpoint
// restore (no hidden module-global counters in the identity).

export type DomainEventType =
  | "OrganismBorn"
  | "OrganismDied"
  | "OrganismReproduced"
  | "GenomeMutated"
  | "ResourceConsumed"
  | "PredationOccurred"
  | "EnvironmentChanged"
  | "PopulationSplit"
  /** Part 17 plant ecology: a drifting spore settled and sprouted a plant. */
  | "SporeSettled"
  /** Part 15 D4: an organism reached full maturity. */
  | "DevelopmentCompleted"
  /** Part 14 G6: a named mutation operator acted on a gene layer. */
  | "MutationOperatorApplied"
  /** Part 14: an offspring genome was produced by two-parent recombination. */
  | "GenomeRecombined"
  /** Part 18 S3: direct selection intervened (never present in ecological-only runs). */
  | "SelectionApplied"
  /** ProtoEvo metabolism: a mature cell spent molecules upgrading a node. */
  | "NodeUpgraded"
  /** §12.13 environment as mechanism: an organism met a world boundary. */
  | "WallCollision";

export type InfrastructureEventType =
  | "CheckpointWritten"
  | "SimulationCompleted"
  | "RunStarted";

/** Canonical event schema (Part 12 §12.32). */
export interface DomainEvent {
  readonly eventId: string;
  readonly eventType: DomainEventType;
  readonly tick: number;
  readonly actorIds: readonly string[];
  readonly targetIds: readonly string[];
  readonly payload: Readonly<Record<string, unknown>>;
  readonly modelVersion: string;
}

export interface InfrastructureEvent {
  readonly eventId: string;
  readonly eventType: InfrastructureEventType;
  readonly tick: number;
  readonly payload: Readonly<Record<string, unknown>>;
  readonly modelVersion: string;
}

/** Deterministic event id: sequential within a tick, stable under replay. */
export function makeEventId(tick: number, seq: number): string {
  return `e${tick.toString(36)}-${seq.toString(36)}`;
}

export function domainEvent(
  eventType: DomainEventType,
  tick: number,
  seq: number,
  actorIds: readonly string[],
  targetIds: readonly string[],
  payload: Record<string, unknown>,
  modelVersion: string,
): DomainEvent {
  return Object.freeze({
    eventId: makeEventId(tick, seq),
    eventType,
    tick,
    actorIds: Object.freeze([...actorIds]),
    targetIds: Object.freeze([...targetIds]),
    payload: Object.freeze({ ...payload }),
    modelVersion,
  });
}

export function infraEvent(
  eventType: InfrastructureEventType,
  tick: number,
  seq: number,
  payload: Record<string, unknown>,
  modelVersion: string,
): InfrastructureEvent {
  return Object.freeze({
    eventId: makeEventId(tick, seq),
    eventType,
    tick,
    payload: Object.freeze({ ...payload }),
    modelVersion,
  });
}
