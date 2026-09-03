// World plane — the node-based cellular body plan (ProtoEvo morphology, Part 15).
//
// An organism is not a point particle with a scalar genome: it is a set of
// INTERCONNECTED NODES (its body) plus a small neural network (its brain).
// Every perception and interaction with the world happens THROUGH these nodes:
//   - photoreceptor   — casts a ray in its orientation to sense light/daylight
//                       and occlusion (directional vision)
//   - chemoreceptor   — samples the food/pheromone gradient in its orientation
//                       (smell)
//   - mechanoreceptor — senses nearby organisms and walls within reach (touch)
//   - flagellum       — motor node; its activation produces locomotion
//   - spike           — effector node; its activation damages prey in reach
//
// The brain is a fixed-topology feed-forward network that maps per-node sensory
// readings (aggregated into a fixed-size input vector) to motor/effector
// activations. Behaviours — movement, feeding, combat, reproduction triggers,
// environmental responses — emerge from morphology × neural dynamics, not from
// hard-coded external logic. This is the foundational system the rest of the
// simulation is layered on.

import type { RngStreams } from "../kernel/rng";

export type NodeKind =
  | "photoreceptor"
  | "chemoreceptor"
  | "mechanoreceptor"
  | "flagellum"
  | "spike";

/** A node fixed to the organism's body. Its world orientation is node.angle
 * relative to the organism's facing direction. */
export interface CellNode {
  readonly id: string;
  readonly kind: NodeKind;
  /** Orientation (radians) relative to the organism's facing. */
  readonly angle: number;
  /** Reach / length beyond the cell membrane (raycast length, spike reach). */
  readonly length: number;
  /** Sensitivity / power multiplier. */
  readonly gain: number;
}

/** Trophic strategy: a continuum from plant-eater to cell-eater. */
export type TrophicStrategy = "herbivore" | "generalist" | "carnivore";

export const TROPHIC_BY_BIAS = (bias: number): TrophicStrategy =>
  bias <= -0.33 ? "herbivore" : bias >= 0.33 ? "carnivore" : "generalist";

/** Fixed neural-network topology (input/hidden/output sizes). */
export const BRAIN_INPUTS = 11;
export const BRAIN_HIDDEN = 6;
export const BRAIN_OUTPUTS = 4;
export const BRAIN_WEIGHTS = BRAIN_INPUTS * BRAIN_HIDDEN + BRAIN_HIDDEN * BRAIN_OUTPUTS;

/** Brain input index constants (self-documenting at call sites). */
export const INPUT = {
  light: 0,
  foodX: 1,
  foodY: 2,
  preyX: 3,
  preyY: 4,
  wallX: 5,
  wallY: 6,
  energy: 7,
  biomass: 8,
  daylight: 9,
  aggression: 10,
} as const;

/** Brain output index constants. */
export const OUTPUT = {
  moveX: 0,
  moveY: 1,
  speed: 2,
  attack: 3,
} as const;

export interface NeuralNet {
  /** Flat weights [in*hidden + hidden*out], row-major. */
  readonly weights: number[];
}

/** Hidden + output activations for one feed-forward pass (Part 16 recurrence/plasticity). */
export function brainStep(net: NeuralNet, input: readonly number[]): { hidden: number[]; out: number[] } {
  const w = net.weights;
  const hidden = new Array<number>(BRAIN_HIDDEN);
  for (let h = 0; h < BRAIN_HIDDEN; h++) {
    let s = 0;
    for (let i = 0; i < BRAIN_INPUTS; i++) {
      s += w[h * BRAIN_INPUTS + i]! * input[i]!;
    }
    hidden[h] = Math.tanh(s);
  }
  const out = new Array<number>(BRAIN_OUTPUTS);
  const off = BRAIN_INPUTS * BRAIN_HIDDEN;
  for (let o = 0; o < BRAIN_OUTPUTS; o++) {
    let s = 0;
    for (let h = 0; h < BRAIN_HIDDEN; h++) {
      s += w[off + o * BRAIN_HIDDEN + h]! * hidden[h]!;
    }
    out[o] = Math.tanh(s);
  }
  return { hidden, out };
}

/** Feed-forward: input vector → tanh-output activations (convenience). */
export function brainForward(net: NeuralNet, input: readonly number[]): number[] {
  return brainStep(net, input).out;
}

/**
 * Build the body deterministically from a genome (no RNG draws): node kinds and
 * orientations are a pure function of the gene values, so the same genome always
 * yields the same morphology (reproducible, Part 14 heredity). Nodes are placed
 * around the cell at even angular spacing per kind.
 */
export function buildBody(
  genes: {
    photoreceptorCount: number;
    chemoreceptorCount: number;
    mechanoreceptorCount: number;
    flagellumCount: number;
    spikeCount: number;
  },
): CellNode[] {
  const nodes: CellNode[] = [];
  let seq = 0;
  const place = (kind: NodeKind, count: number, length: number, gain: number): void => {
    for (let i = 0; i < count; i++) {
      nodes.push({
        id: `n${seq++}`,
        kind,
        angle: (i / Math.max(1, count)) * Math.PI * 2 + kind.length * 0.37,
        length,
        gain,
      });
    }
  };
  // Sensory nodes.
  place("photoreceptor", genes.photoreceptorCount, 10, 1);
  place("chemoreceptor", genes.chemoreceptorCount, 4, 1);
  place("mechanoreceptor", genes.mechanoreceptorCount, 6, 1);
  // Motor + effector nodes.
  place("flagellum", genes.flagellumCount, 3, 1);
  place("spike", genes.spikeCount, 5, 1);
  return nodes;
}

/**
 * Construct a brain with a food-seeking genetic prior plus noise. Early
 * generations are biased to move up food gradients (so the population can
 * actually feed — a hard-wired taxis prior) while the noise lets evolution
 * tune, override, and specialise it toward predation and other strategies.
 * Draws come from the `genetics` stream, deterministically.
 */
export function randomBrain(genome: { genes: { aggression: number; photoreceptorCount: number; daySensitivity: number } }, rng: RngStreams): NeuralNet {
  const w = new Array<number>(BRAIN_WEIGHTS);
  const aggression = genome.genes.aggression;
  const vision = genome.genes.photoreceptorCount > 0 ? 1 : 0;
  for (let i = 0; i < BRAIN_WEIGHTS; i++) {
    // Tiny noise everywhere; then layer the innate prior.
    w[i] = rng.normal("genetics", 0, 0.18);
  }
  // Prior: follow food gradient (input foodX/foodY → output moveX/moveY).
  // Weights live in the hidden layer; a strong direct route is hard to encode,
  // so bias the hidden layer that feeds move outputs by injecting the food
  // inputs strongly into several hidden units and connecting them to move.
  const setIH = (i: number, h: number, v: number): void => {
    w[h * BRAIN_INPUTS + i]! += v;
  };
  // Hidden unit 0: forward food +X, unit 1: forward food +Y.
  setIH(INPUT.foodX, 0, 2.4);
  setIH(INPUT.foodY, 1, 2.4);
  // Hidden unit 2: forward prey (for aggression-based predation).
  setIH(INPUT.preyX, 2, 2.0 * aggression);
  setIH(INPUT.preyY, 3, 2.0 * aggression);
  // Hidden unit 4: seek light when photoreceptors exist (phototaxis).
  if (vision > 0) {
    setIH(INPUT.light, 4, 2.2 * genome.genes.daySensitivity);
    setIH(INPUT.daylight, 5, 1.2 * genome.genes.daySensitivity);
  }
  // Hidden → output: map hidden 0 → moveX, hidden 1 → moveY.
  const setHO = (h: number, o: number, v: number): void => {
    w[BRAIN_INPUTS * BRAIN_HIDDEN + o * BRAIN_HIDDEN + h]! += v;
  };
  setHO(0, OUTPUT.moveX, 2.2);
  setHO(1, OUTPUT.moveY, 2.2);
  setHO(2, OUTPUT.moveX, 2.2);
  setHO(3, OUTPUT.moveY, 2.2);
  setHO(4, OUTPUT.moveX, 1.6);
  setHO(5, OUTPUT.moveY, 1.6);
  // Hidden 5 drives speed and attack.
  setIH(INPUT.energy, 5, 0.7);
  setHO(5, OUTPUT.speed, 1.4);
  setHO(5, OUTPUT.attack, 0.6 + aggression);
  return { weights: w };
}

/**
 * Mutate a brain in place (asexual heredity, Part 14): each weight is mutated
 * with `mutationRate` probability by a normal offset. Returns the count of
 * mutated weights for operator tagging. Draws from the `genetics` stream.
 */
export function mutateBrain(
  parent: NeuralNet,
  mutationRate: number,
  sigma: number,
  rng: RngStreams,
): { brain: NeuralNet; mutatedWeights: number } {
  const weights = [...parent.weights];
  let mutatedWeights = 0;
  for (let i = 0; i < weights.length; i++) {
    if (rng.next("genetics") < mutationRate) {
      weights[i] = Math.min(Math.max(weights[i]! + rng.normal("genetics", 0, sigma * 0.4), -4), 4);
      mutatedWeights++;
    }
  }
  return { brain: { weights }, mutatedWeights };
}

/** Node reach for an effector/sensor given the cell's current radius. */
export function nodeReach(node: CellNode, radius: number): number {
  return radius + node.length;
}

/**
 * Effective node gain including ProtoEvo upgrades. `nodeLevels` runs parallel
 * to the node array; an upgraded sensory node is more sensitive (its readings
 * are amplified and trusted more). Absent levels = no upgrade.
 */
export function nodeGain(
  node: CellNode,
  holder: { readonly nodes: readonly CellNode[]; readonly nodeLevels?: readonly number[] },
): number {
  const levels = holder.nodeLevels;
  if (!levels || levels.length === 0) return node.gain;
  const index = holder.nodes.indexOf(node);
  const level = index >= 0 && index < levels.length ? levels[index]! : 0;
  return node.gain * (1 + 0.25 * level);
}

/** Sum of upgrade levels across all nodes of a kind (effector boosts). */
export function nodeLevelTotal(
  kind: NodeKind,
  holder: { readonly nodes: readonly CellNode[]; readonly nodeLevels?: readonly number[] },
): number {
  const levels = holder.nodeLevels;
  if (!levels || levels.length === 0) return 0;
  let total = 0;
  for (let i = 0; i < holder.nodes.length; i++) {
    if (holder.nodes[i]!.kind === kind && i < levels.length) total += levels[i] ?? 0;
  }
  return total;
}

/**
 * Part 15 M2 — express a phenotype from genome + regulatory binding. The base
 * gene value is boosted by whichever sensory channels are rebound to that axis:
 * a photoreceptor-heavy genome accelerates best when its photoreceptor channel
 * is bound to "speed", etc. This is regulation/effector decoupling: rewiring a
 * channel to a different axis changes the phenotype without a new gene.
 */
export function expressPhenotype(genome: {
  genes: {
    speed: number;
    senseRadius: number;
    metabolism: number;
    photoreceptorCount: number;
    chemoreceptorCount: number;
    mechanoreceptorCount: number;
  };
  regulatory: {
    photoreceptorAxis: "speed" | "senseRadius" | "metabolism";
    chemoreceptorAxis: "speed" | "senseRadius" | "metabolism";
    mechanoreceptorAxis: "speed" | "senseRadius" | "metabolism";
  };
}): { speed: number; senseRadius: number } {
  const g = genome.genes;
  const r = genome.regulatory;
  const boost: { speed: number; senseRadius: number; metabolism: number } = { speed: 0, senseRadius: 0, metabolism: 0 };
  const channels: Array<[keyof typeof r, number]> = [
    ["photoreceptorAxis", g.photoreceptorCount],
    ["chemoreceptorAxis", g.chemoreceptorCount],
    ["mechanoreceptorAxis", g.mechanoreceptorCount],
  ];
  for (const [axisKey, count] of channels) {
    boost[r[axisKey]] += count * 0.08;
  }
  return {
    speed: Math.min(4, Math.max(0.05, g.speed + boost.speed)),
    senseRadius: Math.min(60, Math.max(2, g.senseRadius + boost.senseRadius * 6)),
  };
}