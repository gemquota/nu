// Headless CLI (Part 11 §11.13 — experiments run without any UI).
//
//   bun run src/cli.ts                              # default experiment, JSON summary
//   bun run src/cli.ts --ticks 2000                 # longer run
//   bun run src/cli.ts --seed my-seed               # override the root seed
//   bun run src/cli.ts --replicates 5               # N replicates + aggregate stats
//   bun run src/cli.ts --csv metrics.csv            # per-tick metrics CSV
//   bun run src/cli.ts --checkpoint state.json      # resumable checkpoint
//
// Counterfactual branching (Part 19 §19.3):
//   bun run src/cli.ts --branch state.json --branch-id cf1 \
//        --intervention pulseProbability=0.2 [--branch-ticks 500]

import { runExperiment, type Checkpoint } from "./experiment/runner";
import { runReplicatedExperiment, branchFromCheckpoint, type ConfigIntervention } from "./experiment/replication";
import { DEFAULT_EXPERIMENT, DEFAULT_RUNNER } from "./experiment/config";

function parseArgs(argv: string[]): Record<string, string> {
  const args: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith("--")) {
        args[key] = next;
        i++;
      } else {
        args[key] = "true";
      }
    }
  }
  return args;
}

const args = parseArgs(process.argv.slice(2));

// ---------------------------------------------------------------------------
// Branch mode: restore a checkpoint, apply one declared diff, resume.
// ---------------------------------------------------------------------------
if (args.branch) {
  const file = Bun.file(args.branch);
  const cp = JSON.parse(await file.text()) as Checkpoint;
  let intervention: ConfigIntervention | null = null;
  if (args.intervention) {
    const [key, value] = args.intervention.split("=", 2);
    if (!key || value === undefined) {
      console.error("--intervention expects key=value");
      process.exit(1);
    }
    const num = Number(value);
    intervention = { domain: "config", key, value: Number.isNaN(num) ? value : num };
  }
  const ticks = Number.parseInt(args["branch-ticks"] ?? "500", 10);
  const { metrics, summary, provenance } = branchFromCheckpoint(cp, DEFAULT_RUNNER, {
    branchId: args["branch-id"] ?? "b0",
    ticks,
    intervention: intervention ?? undefined,
  });
  if (args.csv) {
    const header = Object.keys(metrics[0] ?? { tick: 0 }).join(",");
    const rows = metrics.map((m) => Object.values(m).join(","));
    await Bun.write(args.csv, [header, ...rows].join("\n") + "\n");
  }
  console.log(JSON.stringify({ mode: "branch", provenance, ...summary, csv: args.csv ?? null }, null, 2));
  process.exit(0);
}

// ---------------------------------------------------------------------------
// Run mode: single run or N replicates.
// ---------------------------------------------------------------------------
const def = {
  ...DEFAULT_EXPERIMENT,
  seed: args.seed ?? DEFAULT_EXPERIMENT.seed,
  experimentId: args.experiment ?? DEFAULT_EXPERIMENT.experimentId,
};

const ticks = Number.parseInt(args.ticks ?? "1000", 10);
const replicates = Number.parseInt(args.replicates ?? "1", 10);

const started = Date.now();

if (replicates > 1) {
  const { results, stats } = runReplicatedExperiment(def, DEFAULT_RUNNER, {
    ticks,
    replicates,
    onReplicate: (r) => {
      const last = r.metrics[r.metrics.length - 1];
      console.error(
        `replicate ${r.replicateIndex}: seed=${r.seed} ticks=${r.summary.ticksCompleted} pop=${last?.population ?? 0}`,
      );
    },
  });
  const elapsedMs = Date.now() - started;
  console.log(
    JSON.stringify(
      {
        mode: "replicated",
        experimentId: def.experimentId,
        rootSeed: def.seed,
        replicates,
        ticksRequested: ticks,
        aggregate: stats,
        elapsedMs,
        summaries: results.map((r) => r.summary),
      },
      null,
      2,
    ),
  );
  process.exit(0);
}

const { metrics, summary } = runExperiment(def, DEFAULT_RUNNER, {
  ticks,
  checkpointEvery: Number.parseInt(args.checkpointEvery ?? "0", 10) || undefined,
  onCheckpoint: args.checkpoint
    ? (cp: Checkpoint) => Bun.write(args.checkpoint!, JSON.stringify(cp))
    : undefined,
});
const elapsedMs = Date.now() - started;

if (args.csv) {
  const header = Object.keys(metrics[0] ?? { tick: 0 }).join(",");
  const rows = metrics.map((m) => Object.values(m).join(","));
  await Bun.write(args.csv, [header, ...rows].join("\n") + "\n");
}

console.log(
  JSON.stringify(
    {
      ...summary,
      elapsedMs,
      csv: args.csv ?? null,
      checkpoint: args.checkpoint ?? null,
    },
    null,
    2,
  ),
);
