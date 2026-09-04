// World plane — genetics & heredity (Part 14).
//
// The genome is a full multi-layer registry (`GENE_LAYERS` in world.ts): every
// gene lives in exactly one layer so operators act per-layer and the
// regulatory/effector boundary stays explicit. This module implements the
// complete operator model and optional sexual recombination:
//
//   Operators (Part 14, mapping §2.2):
//     point       — continuous perturbation of a single gene (the classic
//                   parameter mutation), applied per layer
//     deletion    — a gene is removed, i.e. reset to its floor (loss of
//                   function / gene deletion)
//     duplication — a gene's effect is duplicated: continuous genes double
//                   (clamped), count genes gain one unit (extra node)
//     rewiring    — a sensory channel's regulatory binding is re-bound to a
//                   different phenotype axis (exaptation, Part 15 M2)
//
//   Recombination (optional sexual heredity):
//     When enabled, an offspring genome and brain are produced by uniform
//     crossover between two parents before mutation — restoring two-parent
//     heredity alongside the default asexual division path.

import type { RngStreams } from "../kernel/rng";
import { GENE_LAYERS, REGULATORY_AXES, SENSOR_CHANNELS } from "./world";
import type { GeneName, GeneLayer, Genome, RegulatoryAxis, RegulatoryBinding, SensorChannel } from "./world";
import type { NeuralNet } from "./body";
import { BRAIN_WEIGHTS } from "./body";

/** The four canonical mutation operator families (Part 14). */
export type MutationOperator = "point" | "deletion" | "duplication" | "rewiring";

export interface OperatorApplication {
  readonly operator: MutationOperator;
  readonly layer: GeneLayer;
  /** Gene or channel the operator acted on. */
  readonly target: string;
}

export interface MutateResult {
  readonly genome: Genome;
  readonly mutated: boolean;
  readonly operators: OperatorApplication[];
}

/** Per-gene bounds and point-mutation sigma factor (relative to config sigma). */
interface GeneMeta {
  readonly lo: number;
  readonly hi: number;
  /** point-mutation noise = sigma * sigmaFactor */
  readonly sigmaFactor: number;
  /** Integer/Count genes round to whole numbers (node morphology). */
  readonly count?: boolean;
}

const GENE_META: Record<GeneName, GeneMeta> = {
  speed: { lo: 0.05, hi: 4, sigmaFactor: 1.0 },
  senseRadius: { lo: 2, hi: 60, sigmaFactor: 4.0 },
  metabolism: { lo: 0.2, hi: 3, sigmaFactor: 0.5 },
  reproductionThreshold: { lo: 30, hi: 200, sigmaFactor: 8.0 },
  offspringInvestment: { lo: 0.05, hi: 0.6, sigmaFactor: 0.2 },
  nodeCount: { lo: 3, hi: 16, sigmaFactor: 0.0 }, // derived; never mutated directly
  aggression: { lo: 0, hi: 1, sigmaFactor: 0.5 },
  trophic: { lo: -1, hi: 1, sigmaFactor: 0.5 },
  attackPower: { lo: 0, hi: 3, sigmaFactor: 0.6 },
  growthEfficiency: { lo: 0.4, hi: 1.5, sigmaFactor: 0.2 },
  daySensitivity: { lo: 0, hi: 1, sigmaFactor: 0.3 },
  photoreceptorCount: { lo: 0, hi: 3, sigmaFactor: 1.2, count: true },
  chemoreceptorCount: { lo: 1, hi: 4, sigmaFactor: 1.2, count: true },
  mechanoreceptorCount: { lo: 1, hi: 3, sigmaFactor: 1.2, count: true },
  flagellumCount: { lo: 1, hi: 3, sigmaFactor: 1.2, count: true },
  spikeCount: { lo: 0, hi: 2, sigmaFactor: 1.2, count: true },
  sizeScale: { lo: 0.6, hi: 1.8, sigmaFactor: 0.3 },
  hue: { lo: 0, hi: 1, sigmaFactor: 0.15 },
  adhesion: { lo: 0, hi: 1, sigmaFactor: 0.25 },
};

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

/** Layer a gene belongs to, via the authoritative registry (`GENE_LAYERS`). */
export function geneLayer(gene: GeneName): GeneLayer {
  for (const layer of Object.keys(GENE_LAYERS) as GeneLayer[]) {
    if ((GENE_LAYERS[layer] as readonly GeneName[]).includes(gene)) return layer;
  }
  return "BEHAVIOUR";
}

/** All numeric gene names (the union's keys), in a stable order. */
const ALL_GENES = Object.keys(GENE_META) as GeneName[];

/** Genes we mutate directly (nodeCount is derived from the node counts). */
const MUTABLE_GENES = ALL_GENES.filter((g) => g !== "nodeCount");

/**
 * Recompute the derived `nodeCount` from the node-count genes. Must run after
 * any operator that changes morphology counts.
 */
function recomputeNodeCount(g: Genome["genes"]): void {
  g.nodeCount =
    g.photoreceptorCount +
    g.chemoreceptorCount +
    g.mechanoreceptorCount +
    g.flagellumCount +
    g.spikeCount;
}

/**
 * Part 14 operator model. Draw order is fixed (stable gene order; point,
 * deletion, duplication per gene; one rewiring pass), so the same RNG state
 * yields the same operator applications — determinism is preserved.
 */
export function mutateGenome(
  base: Genome,
  rng: RngStreams,
  genomeId: string,
  mutationRate: number,
  sigma: number,
): MutateResult {
  const next: Genome["genes"] = { ...base.genes };
  let mutated = false;
  const operators: OperatorApplication[] = [];

  const record = (operator: MutationOperator, target: string, layer: GeneLayer): void => {
    mutated = true;
    operators.push({ operator, layer, target });
  };

  for (const gene of MUTABLE_GENES) {
    const meta = GENE_META[gene]!;
    const layer = geneLayer(gene);

    // 1) Point mutation — perturb continuously (or round, for counts).
    if (rng.next("genetics") < mutationRate) {
      let v: number;
      if (meta.count) {
        v = Math.round(next[gene] + rng.normal("genetics", 0, sigma * meta.sigmaFactor));
      } else {
        v = next[gene] + rng.normal("genetics", 0, sigma * meta.sigmaFactor);
      }
      next[gene] = clamp(v, meta.lo, meta.hi);
      record("point", gene, layer);
    }

    // 2) Deletion — loss of function: reset toward the floor.
    if (rng.next("genetics") < mutationRate * 0.3) {
      next[gene] = meta.lo;
      record("deletion", gene, layer);
    }

    // 3) Duplication — double the effect (or add a node for counts).
    if (rng.next("genetics") < mutationRate * 0.3) {
      const v = meta.count ? next[gene] + 1 : next[gene] * 1.5;
      next[gene] = clamp(v, meta.lo, meta.hi);
      record("duplication", gene, layer);
    }
  }

  recomputeNodeCount(next);

  // 4) Regulatory rewiring — rebind a random sensory channel to a different
  //    phenotype axis (exaptation; Part 15 M2). Regulatory binding is a
  //    REGULATION-layer structure.
  let regulatory: RegulatoryBinding = base.regulatory;
  if (rng.next("genetics") < mutationRate * 0.4) {
    const channel: SensorChannel = SENSOR_CHANNELS[rng.int("genetics", SENSOR_CHANNELS.length)]!;
    const key = channelAxisKey(channel);
    const axisKey = base.regulatory[key] as RegulatoryAxis;
    const others = REGULATORY_AXES.filter((a) => a !== axisKey);
    const newAxis = others[rng.int("genetics", others.length)]!;
    regulatory = {
      photoreceptorAxis: key === "photoreceptorAxis" ? newAxis : base.regulatory.photoreceptorAxis,
      chemoreceptorAxis: key === "chemoreceptorAxis" ? newAxis : base.regulatory.chemoreceptorAxis,
      mechanoreceptorAxis: key === "mechanoreceptorAxis" ? newAxis : base.regulatory.mechanoreceptorAxis,
    };
    record("rewiring", channel, "REGULATION");
  }

  return {
    genome: { genomeId, genes: next, regulatory },
    mutated,
    operators,
  };
}

/** All numeric gene keys plus nodeCount, in a fixed order (for crossover). */
const ALL_GENE_KEYS = ALL_GENES;

/**
 * Uniform crossover of two genomes (optional sexual recombination): each gene
 * is drawn from parent A or parent B with equal probability, and each sensory
 * channel's regulatory binding is drawn from either parent. Deterministic —
 * fixed gene order, two draws per trait.
 */
export function recombineGenome(a: Genome, b: Genome, rng: RngStreams, genomeId: string): Genome {
  const next: Genome["genes"] = { ...a.genes };
  for (const gene of ALL_GENE_KEYS) {
    if (gene === "nodeCount") continue; // derived
    next[gene] = rng.next("genetics") < 0.5 ? a.genes[gene] : b.genes[gene];
  }
  recomputeNodeCount(next);
  const regulatory: RegulatoryBinding = {
    photoreceptorAxis: rng.next("genetics") < 0.5 ? a.regulatory.photoreceptorAxis : b.regulatory.photoreceptorAxis,
    chemoreceptorAxis: rng.next("genetics") < 0.5 ? a.regulatory.chemoreceptorAxis : b.regulatory.chemoreceptorAxis,
    mechanoreceptorAxis: rng.next("genetics") < 0.5 ? a.regulatory.mechanoreceptorAxis : b.regulatory.mechanoreceptorAxis,
  };
  return { genomeId, genes: next, regulatory };
}

/** Map a sensor-channel name to its RegulatoryBinding axis key (photoreceptor → photoreceptorAxis). */
function channelAxisKey(channel: SensorChannel): keyof RegulatoryBinding {
  return `${channel}Axis` as keyof RegulatoryBinding;
}


/** Uniform crossover of two brains (neural heredity through recombination). */
export function recombineBrain(a: NeuralNet, b: NeuralNet, rng: RngStreams): NeuralNet {
  const weights = new Array<number>(BRAIN_WEIGHTS);
  for (let i = 0; i < BRAIN_WEIGHTS; i++) {
    weights[i] = rng.next("genetics") < 0.5 ? a.weights[i]! : b.weights[i]!;
  }
  return { weights };
}