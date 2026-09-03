# Specification Roadmap & Status

> **Status: [filled-in]** — planning and implementation-status document. The source PDF contains Parts 11–12 in full; Parts 13–19 are reconstructed documents with runtime coverage ranging from implemented to stage-1 partial. Parts 20–39 remain unwritten. Runtime coverage is audited separately in [`docs/implementation-status.md`](../implementation-status.md).

## Where the specification stands

| Part | Topic | Status |
|---|---|---|
| 11 | Target Architecture & System Contracts | ✅ [written (source)](11-target-architecture-and-system-contracts.md) |
| 12 | Domain Model, State Architecture & Canonical Data Contracts | ✅ [written (source)](12-domain-model-and-state-architecture.md) |
| 13 | Simulation Kernel, Tick Semantics & Deterministic State Transition | ✅ [written (filled-in)](13-simulation-kernel-and-tick-semantics.md) — **implemented** in [`src/kernel/`](../../src/kernel), invariants verified in [`tests/`](../../tests/kernel.test.ts) |
| 14 | Genetics & Heredity Architecture | ✅ [written (filled-in)](14-genetics-and-heredity-architecture.md) — **stage 1 / partial** |
| 15 | Development / Morphogenesis Architecture | ✅ [written (filled-in)](15-development-and-morphogenesis-architecture.md) — **stage 1 / partial** |
| 16 | Behaviour & Agent Architecture | ✅ [written (filled-in)](16-behaviour-and-agent-architecture.md) — **stage 1 / partial** |
| 17 | Ecology & Environment Architecture | ✅ [written (filled-in)](17-ecology-and-environment-architecture.md) — **stage 1 / partial** |
| 18 | Evolution / Selection Architecture | ✅ [written (filled-in)](18-evolution-and-selection-architecture.md) — **partially implemented**: lineage tracking + observables in [`src/world/lineage.ts`](../../src/world/lineage.ts), invariants I18-A/B/C verified in [`tests/lineage.test.ts`](../../tests/lineage.test.ts) |
| 19 | Experiment & Replication Framework | ✅ [written (filled-in)](19-experiment-and-replication-framework.md) — **implemented subset**: replicate runner + counterfactual branching in [`src/experiment/replication.ts`](../../src/experiment/replication.ts), invariants verified in [`tests/replication.test.ts`](../../tests/replication.test.ts) |
| 20–39 | remaining outline sections 13–26 | ⬜ not written or implemented |

> **Implementation note.** `src/` contains a deterministic headless kernel, a stage-1 evolutionary/ecological null model, replication/branching utilities, and a browser presentation layer. Parts 14–18 are intentionally partial stage-1 realizations; Part 19 is an implemented subset. This is not full compliance with every target architecture in those documents. Parts 20–39 remain both unwritten and unimplemented.

## Remaining parts

Ordered by dependency, mapped to the [outline](00-outline.md) sections each would cover:

| Order | Outline section(s) | Working title | Depends on | Primary source constraints |
|---|---|---|---|---|
| 20 | 13 | Observation / Telemetry / Analysis | 13, 19 | 11 §§11.3.9, 11.14; 12 §§12.33–12.34 |
| 21 | 14 | History, Replay & Branching | 13, 19 | 11 §§11.3.10, 11.16; 12 §§12.37–12.41 |
| 22 | 15 | Persistence & Provenance | 21 | 11 §§11.24–11.25; 12 §12.34 |
| 23 | 16 | Determinism & Reproducibility | 13, 22 | 11 §11.11; Part 13 throughout |
| 24 | 17 | Worker / Parallel Execution Architecture | 13, 23 | 11 §11.23; Part 13 §§13.12–13.13 |
| 25 | 18 | Performance & Data-Oriented Design | 12, 24 | 12 §§12.26–12.27 |
| 26 | 19 | UI / Visualization Architecture | 20 | 11 §§11.3.1 (must-not-know list), 11.22; 12 §12.44 |
| 27 | 20 | Scientific Validation Framework | 19, 21 | 11 §11.30; 12 §12.47 |
| 28 | 21 | Adversarial / Null-Model Test Suite | 27 | 11 §11.26; Part 13 §13.19 |
| 29 | 22 | Migration Strategy from the Existing Codebase | all above | 11 §11.28 (topology caveat) |
| 30 | 23–24 | Phased Roadmap & Atomic Implementation Tasks | 29 | 11 §11.30 (the 15-step acceptance experiment) |
| 31 | 25 | Acceptance Criteria & Invariants (consolidated) | all | 11 §11.26; 12 §12.47; 13 §13.18 |
| 32 | 26 | Long-Term Open-Ended Evolution Roadmap | 18, 31 | 11 §11.31 |

## Conventions for future parts

- Follow the established section pattern (`NN.M`), keep ASCII diagrams in fenced code blocks, and preserve the source document's voice: contracts and invariants stated as testable rules.
- Every future part must cite the Part 11 contract numbers and Part 12 schema sections it implements, so the specification remains a single coherent graph rather than parallel essays.
- A part is complete when its invariants can be turned into automated tests (the standard Part 13 §13.19 applies to the whole specification).
