// Evolutionary plane — the sensory interface (Part 16 §§16.1–16.2, B1–B3).
//
// Policies receive Observation records, never world access. Sensor capability
// comes from the organism's phenotype (evolvable, paid for). B1: the decision
// function consumes Observation { modality, direction, intensity, confidence,
// tick } records assembled by the sensory system — no organism map, no world
// config. The node body (photoreceptors/chemoreceptors/mechanoreceptors) IS
// the sensory interface: each node produces observations, so perception is
// directional, degradable, and evolvable.

/** Observation modalities the sensory system can emit (B2). */
export type ObservationModality =
  | "resource"
  | "pheromone"
  | "prey"
  | "wall"
  | "light"
  | "own-state";

/** Formal observation record (Part 16 B1). */
export interface ObservationRecord {
  readonly modality: ObservationModality;
  /** Relative direction (unit vector) toward the stimulus, if directional. */
  readonly dirX?: number;
  readonly dirY?: number;
  /** Normalized intensity 0..1 (own-state may carry raw readings). */
  readonly intensity: number;
  /** Confidence 0..1 — fidelity degrades with distance/occlusion (B2). */
  readonly confidence: number;
  /** Tick the observation was taken (B1). */
  readonly tick: number;
  /** Own-state extras (B3). */
  readonly energy?: number;
  readonly maturity?: number;
}

/** A single directional stimulus fed to the policy. */
export interface ObservationInput {
  readonly modality: ObservationModality;
  readonly dirX: number;
  readonly dirY: number;
  readonly intensity: number;
  readonly confidence: number;
}

/**
 * Assemble a directional stimulus (dir + intensity + confidence). Legacy
 * helper retained for callers that want the raw gradient form.
 */
export interface GradientProbe {
  readonly x: number;
  readonly y: number;
  readonly intensity: number;
}