// Shared test fixtures.
import type { ExperimentDefinition } from "../src/world/initialization";

export function makeDef(seed = "test-seed-1"): ExperimentDefinition {
  return {
    experimentId: "exp-test",
    hypothesis: "test",
    replicateId: "r0",
    seed,
    config: {
      width: 100,
      height: 100,
      resourcePatches: 20,
      initialPopulation: 30,
      basalCost: 0.08,
      movementCost: 0.02,
      patchCapacity: 50,
      energyPerResource: 1.2,
      reproductionCost: 4,
      maxAge: 1200,
      maturityAge: 60,
      pulseProbability: 0.02,
      pulseAmount: 10,
    },
  };
}
