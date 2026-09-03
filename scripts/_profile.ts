// Temporary profiler — times each system per tick over a run.
import { RngStreams } from "../src/kernel/rng";
import { PHASES } from "../src/kernel/version";
import { initializeWorld } from "../src/world/initialization";
import { defaultSystems } from "../src/systems/systems";
import { DEFAULT_EXPERIMENT } from "../src/experiment/config";

const rng = RngStreams.fromSeed(DEFAULT_EXPERIMENT.seed);
const world = initializeWorld({ ...DEFAULT_EXPERIMENT, seed: DEFAULT_EXPERIMENT.seed }, rng);
const systems = defaultSystems(world, {
  consumeRadius: 3, biteSize: 3, corpseEnergyFraction: 0.5, maturityAge: 60, mutationRate: 0.15, mutationSigma: 0.08,
});

const totals: Record<string, number> = {};
const counts: Record<string, number> = {};
const phaseTime: Record<string, number> = {};
const N = 300;
let born = 0;
let died = 0;

for (let tick = 0; tick < N; tick++) {
  const intents: unknown[] = [];
  const deltas: unknown[] = [];
  const ctx = {
    tick,
    rng,
    intents,
    emit: (t: string) => { if (t === "OrganismBorn") born++; if (t === "OrganismDied") died++; },
    stage: (d: unknown) => deltas.push(d),
    recordIntent: (i: unknown) => intents.push(i),
    assertWrite: () => {},
  } as never;
  for (const phase of PHASES) {
    if (phase === "COMMIT") break;
    for (const s of systems) {
      if (!s.contract.phases.includes(phase)) continue;
      const t0 = performance.now();
      s.run(ctx);
      const dt = performance.now() - t0;
      const id = s.contract.systemId;
      totals[id] = (totals[id] ?? 0) + dt;
      counts[id] = (counts[id] ?? 0) + 1;
      phaseTime[phase] = (phaseTime[phase] ?? 0) + dt;
    }
  }
  // commit + advance
  for (const d of deltas) world.applyDelta(d as never);
  world.advanceTime();
  if (tick % 50 === 0 || tick === N - 1) {
    console.log(`tick ${tick}: pop=${world.liveOrganisms().length} born=${born} died=${died}`);
  }
}
console.log(`cumulative born=${born} died=${died}`);
// eslint-disable-next-line no-restricted-imports
import { __prof } from "../src/systems/systems";
console.log("behaviour breakdown:", JSON.stringify(__prof));

const rows = Object.entries(totals).sort((a, b) => b[1] - a[1]);
console.log(`\nTotal systems time over ${N} ticks: ${rows.reduce((s, r) => s + r[1], 0).toFixed(0)}ms`);
for (const [id, ms] of rows) {
  const c = counts[id]!;
  console.log(`  ${id.padEnd(26)} ${ms.toFixed(0).padStart(6)}ms total, ${(ms / c).toFixed(3).padStart(7)}ms/tick`);
}
console.log("\nBy phase:");
for (const [p, ms] of Object.entries(phaseTime).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${p.padEnd(12)} ${ms.toFixed(0).padStart(6)}ms (${(ms / N).toFixed(2)}ms/tick)`);
}