// Part 19 — replication & counterfactual branching invariants.
import { describe, expect, test } from "bun:test";
import { runExperiment } from "../src/experiment/runner";
import {
  runReplicatedExperiment,
  runReplicate,
  deriveSeed,
  branchFromCheckpoint,
  type ReplicateResult,
} from "../src/experiment/replication";
import { DEFAULT_RUNNER } from "../src/experiment/config";
import { makeDef } from "./helpers";

describe("Part 19 §19.2 — replication", () => {
  test("R-1: seed derivation is deterministic and injective over small i", () => {
    expect(deriveSeed("s", 0)).toBe(deriveSeed("s", 0));
    const seeds = new Set([0, 1, 2, 3, 4].map((i) => deriveSeed("s", i)));
    expect(seeds.size).toBe(5);
    expect(deriveSeed("s", 0)).not.toBe(deriveSeed("t", 0));
  });

  test("I19-A: replicate i re-runs bit-identically", () => {
    const def = makeDef("repl-seed");
    const a = runReplicate(def, DEFAULT_RUNNER, 3, { ticks: 150 });
    const b = runReplicate(def, DEFAULT_RUNNER, 3, { ticks: 150 });
    expect(a.seed).toBe(b.seed);
    expect(a.metrics).toEqual(b.metrics);
    expect(a.summary).toEqual(b.summary);
  });

  test("R-2: replicates are isolated — same definition, different trajectories", () => {
    const def = makeDef("iso-seed");
    const a = runReplicate(def, DEFAULT_RUNNER, 0, { ticks: 150 });
    const b = runReplicate(def, DEFAULT_RUNNER, 1, { ticks: 150 });
    expect(a.seed).not.toBe(b.seed);
    // With different seeds the trajectories must diverge (no shared state).
    expect(a.metrics).not.toEqual(b.metrics);
  });

  test("R-3: aggregate stats summarize across replicates", () => {
    const def = makeDef("agg-seed");
    const { results, stats } = runReplicatedExperiment(def, DEFAULT_RUNNER, {
      ticks: 150,
      replicates: 3,
    });
    expect(results.length).toBe(3);
    expect(stats.replicates).toBe(3);
    expect(Object.keys(stats.finalMean).length).toBeGreaterThan(0);
    expect(stats.finalMean.population).toBeGreaterThan(0);
    // Variance entries exist for every metric and are finite.
    for (const [k, v] of Object.entries(stats.finalVariance)) {
      expect(Number.isFinite(v)).toBe(true);
      expect(stats.finalMean[k]).toBeDefined();
    }
  });
});

describe("Part 19 §19.3 — branching & counterfactuals", () => {
  test("B-1/I19-B: branching leaves the parent checkpoint byte-identical (Test E)", () => {
    let saved: Parameters<typeof branchFromCheckpoint>[0] | null = null;
    runExperiment(makeDef(), DEFAULT_RUNNER, {
      ticks: 80,
      onCheckpoint: (cp) => {
        saved = cp;
      },
    });
    const cp = saved!;
    const parentBefore = JSON.stringify(cp.world);

    branchFromCheckpoint(cp, DEFAULT_RUNNER, {
      branchId: "b1",
      ticks: 60,
      intervention: { domain: "config", key: "pulseProbability", value: 0.2 },
    });

    const parentAfter = JSON.stringify(cp.world);
    expect(parentAfter).toBe(parentBefore);
  });

  test("I19-C: a counterfactual differs from baseline in exactly the declared key", () => {
    let saved: Parameters<typeof branchFromCheckpoint>[0] | null = null;
    runExperiment(makeDef(), DEFAULT_RUNNER, {
      ticks: 80,
      onCheckpoint: (cp) => {
        saved = cp;
      },
    });
    const cp = saved!;
    const baseline = branchFromCheckpoint(cp, DEFAULT_RUNNER, {
      branchId: "base",
      ticks: 100,
    });
    const counterfactual = branchFromCheckpoint(cp, DEFAULT_RUNNER, {
      branchId: "cf",
      ticks: 100,
      intervention: { domain: "config", key: "pulseProbability", value: 0.2 },
    });

    expect(baseline.provenance.intervention).toBeNull();
    expect(counterfactual.provenance.intervention).toEqual({
      domain: "config",
      key: "pulseProbability",
      value: 0.2,
    });
    expect(counterfactual.provenance.branchPointTick).toBe(80);
    expect(counterfactual.provenance.parentId).toBe(cp.world.meta.worldId);
    // Baseline from the same point reproduces the uninterrupted trajectory tail.
    const full = runExperiment(makeDef(), DEFAULT_RUNNER, { ticks: 180 });
    expect(baseline.metrics[99]!.population).toBe(full.metrics[179]!.population);
  });

  test("B-3: the intervention is measurable — big pulse change diverges trajectories", () => {
    let saved: Parameters<typeof branchFromCheckpoint>[0] | null = null;
    runExperiment(makeDef(), DEFAULT_RUNNER, {
      ticks: 80,
      onCheckpoint: (cp) => {
        saved = cp;
      },
    });
    const cp = saved!;
    const baseline = branchFromCheckpoint(cp, DEFAULT_RUNNER, {
      branchId: "base2",
      ticks: 200,
    });
    const counterfactual = branchFromCheckpoint(cp, DEFAULT_RUNNER, {
      branchId: "cf2",
      ticks: 200,
      intervention: { domain: "config", key: "energyPerResource", value: 1.0 },
    });
    // At some tick the two trajectories must differ measurably.
    let diverged = false;
    for (let i = 0; i < Math.min(baseline.metrics.length, counterfactual.metrics.length); i++) {
      if (Math.abs(baseline.metrics[i]!.population - counterfactual.metrics[i]!.population) > 0) {
        diverged = true;
        break;
      }
    }
    expect(diverged).toBe(true);
  });
});
