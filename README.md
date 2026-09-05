# nu

Architecture documentation library and reference implementation for **nu** — a deterministic artificial-life research platform.

## What's in this repository

| Path | Contents |
|---|---|
| [`nu/Explain Conceptual Architecture.pdf`](nu/Explain%20Conceptual%20Architecture.pdf) | Original PDF (ChatGPT transcript export) |
| [`Explain Conceptual Architecture.md`](Explain%20Conceptual%20Architecture.md) | Unmodified text extraction of the PDF |
| [`docs/`](docs/index.md) | **The organized library** — audit + specification, cleaned and completed |
| [`src/`](src) | **The implementation** — a TypeScript/Bun engine with a deterministic kernel, stage-1 null model, and browser lab |
| [`tests/`](tests/kernel.test.ts) | The spec's kernel, lineage, and replication invariants, as executable tests |
| [`docs/implementation-status.md`](docs/implementation-status.md) | Conservative runtime coverage audit for every document and spec part |

## The library

The source document contains one part of a 10-part **architectural audit** and two parts of a **Master Technical Specification**. This repository organizes that material into a navigable library, fills in Parts 0–2 and 4–19 where their announced scope permits, and records the remaining gaps rather than treating documentation as implemented runtime behavior:

- **[docs/index.md](docs/index.md)** — start here: full reading order with provenance for every file.
- **Architectural Audit** — [`docs/audit/`](docs/audit/00-series-overview.md), Parts 0–10. Part 3 is source-derived; the overview and Parts 1–2, 4–10 are filled-in reconstructions following the series' own announced scopes.
- **Master Technical Specification** — [`docs/spec/`](docs/spec/00-outline.md). Parts 11–12 are source-derived; Parts 13–19 (kernel, genetics, development, behaviour, ecology, selection, experimentation) are filled-in documents. Their runtime status ranges from implemented to stage-1 partial; Parts 20–39 are not written. See the [roadmap](docs/spec/99-roadmap.md) and [implementation-status audit](docs/implementation-status.md).
- **Reference** — [`docs/reference/`](docs/reference/protoevo.md): the ProtoEvo ("Simulating an Evolving Microcosmos") system study and its [mapping onto nu's specification](docs/reference/protoevo-to-nu-mapping.md), which feeds concrete mechanisms into the remaining spec parts.
- **Planned expansion series** — [`docs/roadmaps/plant-expansion-series.md`](docs/roadmaps/plant-expansion-series.md): the four-instalment plant plan (I1–I4) with three interspersed bridge phases (B1–B3), plus its [one-page combined edition](docs/roadmaps/plant-expansion-series-combined.md).

## Implementation

`src/` implements a deterministic headless kernel plus a stage-1 artificial-life null model. The headless experiment path does not touch wall-clock time, the DOM, or UI (Part 11 §11.13); experiments are pure functions of (definition, seed, ticks). The browser lab is a separate presentation layer over the same engine. The complete document set is not fully implemented: see the [runtime implementation status](docs/implementation-status.md).

```
src/
├── kernel/            # Kernel plane (Part 13)
│   ├── rng.ts         #   Named deterministic RNG streams (K4, §13.9)
│   ├── events.ts      #   Canonical event schema (§12.32)
│   ├── version.ts     #   Model/schema versioning, phase pipeline (§13.0)
│   └── kernel.ts      #   Tick lifecycle, double buffering, rollback (§13.1–13.14)
├── world/             # World plane (Part 12)
│   ├── world.ts       #   Authoritative state; sole delta applier (§12.28)
│   ├── spatial.ts     #   Derived spatial index (§12.12, §12.24)
│   ├── intents.ts     #   Cross-phase ephemeral intent shapes (§13.3)
│   ├── initialization.ts  # Seed-derived initial conditions (§11.12)
│   ├── development.ts     # Stage-1 maturity and phenotype scaling (Part 15)
│   ├── field.ts            # Stage-1 pheromone field (Part 17)
│   └── lineage.ts          # Append-only lineage history (Parts 14, 18)
├── systems/           # Evolutionary-plane systems (§12.2.4, §13.6)
│   ├── systems.ts     #   Behaviour, locomotion, consumption, physiology,
│   │                  #   development, selection, inheritance — declared contracts
│   └── observations.ts #  Typed sensory observations (Part 16)
├── experiment/        # Experimentation plane (Part 11)
│   ├── runner.ts      #   Headless runner, metrics, checkpoints (§11.11–11.14)
│   ├── config.ts      #   The null-model experiment definition
│   └── replication.ts #   Replicates and counterfactual branches (Part 19)
├── web/               # Presentation plane (Part 11 §11.14, Part 12 §12.44)
│   ├── lab.ts         #   Renderer-independent lab facade
│   ├── main.ts        #   Canvas renderer and interventions
│   ├── index.html     #   Static lab shell
│   └── style.css      #   Presentation-only styling
└── scripts/
    ├── build-lab.mjs  #   Produces the deployable dist/ artifact
    └── serve-lab.mjs  #   0.0.0.0 preview server
```

### Run it

```bash
bun install

# Typecheck + invariant tests (K2 atomicity, K3 boundaries, K4 stream
# discipline, K5 determinism, replay, restore-continue, stream isolation)
bun tsc --noEmit
bun test

# Run the null-model experiment headless (2000 ticks, ~10 s)
bun run src/cli.ts --ticks 2000

# Build the browser-based artificial-life lab
bun run build:lab
# Serve the built lab locally; the world fills the viewport
PORT=8000 bun run serve:lab

# In the lab: use Pan or middle-mouse drag, wheel/Zoom controls, Fit world,
# Fullscreen, and the drawer tabs for telemetry, data, parameters, and coverage.

# Write per-tick metrics CSV and a resumable checkpoint
bun run src/cli.ts --ticks 2000 --csv metrics.csv --checkpoint state.json

# N independent replicates with aggregate statistics (Part 19)
bun run src/cli.ts --ticks 1000 --replicates 5

# Counterfactual: branch from a checkpoint with one declared config diff
bun run src/cli.ts --branch state.json --branch-id cf1 --intervention pulseProbability=0.25

# Deploy the lab to Vercel (requires VERCEL_TOKEN — see below)
bun run deploy:vercel
```

### Deploying to Vercel

The lab builds to static output in `dist/` (see `vercel.json`). To deploy from the
sandbox, set a classic Vercel access token (`vcp_…`, created at
https://vercel.com/account/tokens) as `VERCEL_TOKEN` in the workspace environment,
then run `bun run deploy:vercel`. The token is read from the environment by the
Vercel CLI and is never printed or committed.

The null-model run demonstrates the ecological loop end to end: organisms sense and consume regenerating resource patches, spend energy on metabolism and movement, reproduce when they accumulate enough surplus, and die — returning their mass to the ecosystem (the ProtoEvo trophic cycle). A 2,000-tick run reaches a resource-limited population equilibrium (~2,400) with births ≈ deaths per tick.

### What the invariants guarantee

- **Same seed ⇒ identical trajectory** (replay); a checkpoint restored at tick *t* continues to the identical STATE(*t+n*) (restore-continue).
- **RNG streams are independent** (genetics/behaviour/environment/reproduction/experiment/kernel never share draw counts).
- **A failed tick is atomic**: buffers are discarded, state and streams untouched, no events publish.
- **Systems can only write what their contracts declare** (enforced in debug mode).

## Provenance conventions

Every document is labeled:

- **[source]** — present in the PDF export, cleaned of transcript artifacts; diagrams re-flowed.
- **[filled-in]** — missing in the source; reconstructed from the document's own forward references, tables of contents, and cross-links, without inventing specifics.

The unmodified extraction in `Explain Conceptual Architecture.md` is kept as the canonical source record.
