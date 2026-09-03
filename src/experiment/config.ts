// Experimentation plane — default experiment definition (Part 11 §11.12).
// A declarative definition + seed; no hidden state, no wall-clock inputs.

import type { RunnerConfig } from "./runner";
import type { ExperimentDefinition } from "../world/initialization";
import { DEFAULT_TERRAIN } from "../world/terrain";

export const DEFAULT_EXPERIMENT: ExperimentDefinition = {
  experimentId: "exp-null-model-v1",
  hypothesis:
    "Under neutral drift with heritable variation and ecological resource competition, " +
    "node-based morphologies and neural strategies (herbivore↔carnivore) co-evolve " +
    "with the terrain, water, and day/night cycle.",
  replicateId: "r0",
  seed: "nu-seed-0001",
  config: {
    // Default world is PORTRAIT 9:20 (Moto Edge 50 Neo: 1080×2400 held upright)
    // so the arena fills a phone held in portrait. Same land area as before,
    // fewer plants/founders: the ecosystem settles at a lighter population
    // (a few hundred cells instead of six hundred-plus).
    width: 240,
    height: 560,
    resourcePatches: 8,
    initialPopulation: 40,
    basalCost: 0.2,
    movementCost: 0.02,
    patchCapacity: 22,
    energyPerResource: 2.4,
    reproductionCost: 6,
    maxAge: 900,
    maturityAge: 60,
    pulseProbability: 0.01,
    pulseAmount: 6,
    walls: { top: "solid", right: "solid", bottom: "solid", left: "solid" },
    zoneCount: 5,
    terrain: DEFAULT_TERRAIN,
    moveScale: 0.42,
    inaccessiblePocketCount: 4,
    inaccessiblePocketInhabitants: 2,
    outsidePlantCount: 2,
  },
};

export const DEFAULT_RUNNER: RunnerConfig = {
  ...DEFAULT_EXPERIMENT.config,
  consumeRadius: 3,
  biteSize: 3,
  corpseEnergyFraction: 0.5,
  maturityAge: 60,
  mutationRate: 0.15,  mutationSigma: 0.08,
  reproductionProbability: 0.4,
  recombination: 0.2,
  learningRate: 0.02,
};
