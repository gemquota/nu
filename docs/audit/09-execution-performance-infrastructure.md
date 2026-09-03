# Part 9/10 — Execution, Performance & Infrastructure

> **Status: [filled-in]** — follows the audit sequence. Constrained by Part 3 §§3.9–3.10 (renderer and workers as infrastructure) and Part 11 §§11.22–11.25 (renderer, worker, persistence, versioning contracts), §11.28 (target topology).

## 9.1 Execution Is a Strategy, Not a Semantics

Part 3 fixed the boundary: *workers are not part of the domain; they are an execution strategy.* The simulation should not care whether it runs in the browser, in Node, in a worker, on another machine, or in batch mode. This part audits whether the implementation honours that.

The healthy direction (Part 11 §11.4):

```
Worker → Kernel        (healthy)
Kernel → Worker        (undesirable)
```

## 9.2 The Worker Contract

Workers should receive *declarative* execution requests, not imperative scripts (Part 11 §11.23):

```
RunRequest
├── experiment
├── seed
├── modelVersion
├── executionMode
├── checkpointPolicy
└── observationPolicy

RunResult
├── finalState
├── observations
├── events
├── metrics
├── provenance
└── executionSummary
```

The audit question: are worker messages declarative requests and complete results, or do workers reach back into shared browser state, mutate DOM objects, or depend on which frame the main thread is rendering?

## 9.3 The Renderer Contract

The renderer is a consumer (Part 11 §11.22). It may observe, interpolate, project, simplify, aggregate, and visualize. It may **not** mutate authoritative state, influence RNG, alter simulation timing, determine collision or biological outcomes, or silently trigger simulation behaviour.

The strict invariant: *a headless run and a rendered run must have identical authoritative trajectories under equivalent conditions.* The audit question: could you unplug the renderer entirely and produce the same trajectory? Where the answer is no, presentation has become a hidden simulation input.

## 9.4 Persistence

Persistence must store enough to reconstruct an experiment (Part 11 §11.24):

```
Model Version + Experiment Definition + Configuration + Seed
+ Initial State + Checkpoint / Event History + Observation Metadata
```

And versioning must be explicit (Part 11 §11.25) for model, schema, experiment, genome format, world format, observation format, and execution protocol — a checkpoint is never interpreted by "whatever the current code happens to do."

## 9.5 Performance Without Semantic Corruption

Part 12 draws the line performance work must respect:

```
SEMANTIC MODEL → EXECUTION REPRESENTATION → HARDWARE
```

rather than allowing hardware constraints to silently define the scientific model. Data-oriented layouts (typed arrays, SoA buffers, spatial grids, worker-local structures) are encouraged — behind an abstraction boundary (§12.27) — but state classification (authoritative / derived / ephemeral, §12.24) must survive every optimization.

The audit questions: is any optimization currently writing derived state back into authoritative state? Is render interpolation or mesh construction leaking into the domain? Does a faster path exist for rendering that simulation code knows about?

## 9.6 Target Topology

Part 11 §11.28 sketches the semantic target: `kernel/`, `laws/`, `world/`, `genetics/`, `development/`, `behaviour/`, `ecology/`, `experiment/`, `observation/`, `history/`, `execution/`, `persistence/`, `presentation/` — with the caveat that it is *a semantic topology, not an instruction to blindly create directories*; if the existing codebase can express these boundaries with fewer modules, that is preferable.

The audit's contribution here is the *dependency test* for any proposed layout: every arrow in the import graph must point toward more fundamental semantics (Part 4 §4.2), and no module below the presentation layer may import from it.

## 9.7 Failure Semantics

Infrastructure is also allowed to fail: workers die, snapshots get interrupted, transports drop. The semantic layer must define what that means (retry, resume from checkpoint, mark replicate failed) — infrastructure must never silently invent its own recovery semantics that alter trajectories.

---

*Part 10/10 synthesizes the audit: the gap in one view, and the path from audit to specification.*
