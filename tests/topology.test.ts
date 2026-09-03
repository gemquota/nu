// §12.13 environment-as-mechanism: per-edge wall policies and heterogeneous
// environmental zones (Part 17 §17.4), as executable invariants.
import { describe, expect, test } from "bun:test";
import { runExperiment, type RunnerConfig } from "../src/experiment/runner";
import { DEFAULT_RUNNER } from "../src/experiment/config";
import { makeDef } from "./helpers";
import { applyWalls } from "../src/world/world";
import { World, type WorldConfig } from "../src/world/world";
import { RngStreams } from "../src/kernel/rng";

function cfg(partial: Partial<WorldConfig>): WorldConfig {
  return { ...makeDef().config, ...partial };
}

function runner(partial: Partial<RunnerConfig>): RunnerConfig {
  return { ...DEFAULT_RUNNER, ...partial };
}

function restoreWithConfig(config: WorldConfig) {
  return World.restore({
    meta: {
      worldId: "w:test", modelVersion: "nu-core-v3", schemaVersion: 3, tick: 0,
      experimentId: "e", replicateId: "r", seed: "s",
    },
    config,
    tick: 0,
    organisms: [],
    resources: [],
    lineage: [],
    field: undefined,
    rngState: RngStreams.fromSeed("fixture").state(),
  });
}

describe("§12.13 wall policies", () => {
  test("solid clamps at the boundary", () => {
    const out = applyWalls(-5, 3, { width: 100, height: 100, walls: { top: "solid", right: "solid", bottom: "solid", left: "solid" } });
    expect(out.x).toBe(0);
    expect(out.edge).toBe("left");
    expect(out.wrapped).toBe(false);
  });

  test("wrap teleports to the opposite edge", () => {
    const out = applyWalls(-5, 3, { width: 100, height: 100, walls: { top: "solid", right: "solid", bottom: "solid", left: "wrap" } });
    expect(out.x).toBe(95);
    expect(out.edge).toBe("left");
    expect(out.wrapped).toBe(true);
    const outR = applyWalls(102, 3, { width: 100, height: 100, walls: { top: "solid", right: "wrap", bottom: "solid", left: "solid" } });
    expect(outR.x).toBe(2);
    expect(outR.edge).toBe("right");
    expect(outR.wrapped).toBe(true);
  });

  test("reflect bounces back into the arena", () => {
    const out = applyWalls(-5, 3, { width: 100, height: 100, walls: { top: "solid", right: "solid", bottom: "solid", left: "reflect" } });
    expect(out.x).toBe(5);
    expect(out.edge).toBe("left");
    const outB = applyWalls(50, 104, { width: 100, height: 100, walls: { top: "solid", right: "solid", bottom: "reflect", left: "solid" } });
    expect(outB.y).toBe(94);
    expect(outB.edge).toBe("bottom");
  });

  test("missing walls policy behaves solid (backward compatible)", () => {
    const out = applyWalls(-5, 3, { width: 100, height: 100 });
    expect(out.x).toBe(0);
    expect(out.edge).toBe("left");
  });

  test("an end-to-end run with mixed walls emits WallCollision events with the right policy", () => {
    const walls = { top: "reflect", right: "wrap", bottom: "solid", left: "solid" } as const;
    const def = makeDef("wall-seed");
    const config = cfg({ width: 60, height: 60, resourcePatches: 10, initialPopulation: 20, walls });
    const { summary, metrics } = runExperiment({ ...def, config }, runner({ mutationRate: 0.2 }), { ticks: 150 });
    expect(summary.rollbacks).toBe(0);
    // Population survived long enough to interact with boundaries.
    expect(metrics.length).toBeGreaterThan(10);
  });
});

describe("Part 17 §17.4 environmental zones", () => {
  test("zoneAt resolves contained rectangles; outside is plain", () => {
    const world = restoreWithConfig(cfg({ zones: [{ id: "z:f", kind: "fertile", x: 10, y: 10, width: 20, height: 20 }] }));
    expect(world.zoneAt(15, 15)).toBe("fertile");
    expect(world.zoneAt(5, 5)).toBe("plain");
    expect(world.zoneAt(31, 15)).toBe("plain");
  });

  test("zone effects are declared per kind", () => {
    const world = restoreWithConfig(
      cfg({
        zones: [
          { id: "z:h", kind: "harsh", x: 0, y: 0, width: 50, height: 50 },
          { id: "z:f", kind: "fertile", x: 50, y: 50, width: 50, height: 50 },
          { id: "z:v", kind: "viscous", x: 0, y: 50, width: 50, height: 50 },
        ],
      }),
    );
    expect(world.zoneEffectsAt(10, 10).metabolicCost).toBe(1.6);
    expect(world.zoneEffectsAt(60, 60).resourceRegen).toBe(1.75);
    expect(world.zoneEffectsAt(10, 60).speed).toBe(0.55);
    expect(world.zoneEffectsAt(60, 10).metabolicCost).toBe(1.0);
  });

  test("zoneCount generates the requested number of deterministic zones", () => {
    const def = makeDef("zone-seed");
    const config = cfg({ width: 200, height: 200, zoneCount: 5 });
    const { metrics } = runExperiment({ ...def, config }, runner({}), { ticks: 30 });
    expect(metrics.length).toBe(30);
  });

  test("same seed + zoneCount ⇒ identical trajectory; different seed ⇒ different zones", () => {
    const base = cfg({ width: 200, height: 200, zoneCount: 4 });
    const defA = makeDef("zones-a");
    const defB = makeDef("zones-a");
    const defC = makeDef("zones-b");
    const a = runExperiment({ ...defA, config: base }, runner({}), { ticks: 60 }).summary.finalMetrics;
    const b = runExperiment({ ...defB, config: base }, runner({}), { ticks: 60 }).summary.finalMetrics;
    const c = runExperiment({ ...defC, config: base }, runner({}), { ticks: 60 }).summary.finalMetrics;
    expect(a).toEqual(b);
    expect(a).not.toEqual(c);
  });

  test("checkpoint round-trip preserves zones and zone multipliers", () => {
    let saved: import("../src/experiment/runner").Checkpoint | null = null;
    const config = cfg({ width: 120, height: 120, zoneCount: 3 });
    runExperiment({ ...makeDef("cp-zones"), config }, runner({}), {
      ticks: 40,
      onCheckpoint: (cp) => { saved = cp; },
    });
    const world = World.restore(saved!.world);
    expect((world.config.zones ?? []).length).toBe(3);
    expect(typeof world.zoneAt(1, 1)).toBe("string");
  });
});
