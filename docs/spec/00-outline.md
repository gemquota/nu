# Master Technical Specification — Outline

> **Status: [source]** — the outline as proposed in the source document, following the end of the audit: "I can structure it as: …"

## The 26 sections

1. Executive Architecture Definition
2. Target System Architecture
3. Bounded Contexts & Module Responsibilities
4. Dependency Architecture
5. Simulation State Model
6. Authoritative Tick / Causal Semantics
7. Genetics & Heredity Architecture
8. Development / Morphogenesis Architecture
9. Behaviour & Agent Architecture
10. Ecology & Environment Architecture
11. Evolution / Selection Architecture
12. Experiment & Replication Framework
13. Observation / Telemetry / Analysis
14. History, Replay & Branching
15. Persistence & Provenance
16. Determinism & Reproducibility
17. Worker / Parallel Execution Architecture
18. Performance & Data-Oriented Design
19. UI / Visualization Architecture
20. Scientific Validation Framework
21. Adversarial / Null-Model Test Suite
22. Migration Strategy from the Existing Codebase
23. Phased Development Roadmap
24. Atomically Decomposed Implementation Tasks
25. Acceptance Criteria & Invariants
26. Long-Term Open-Ended Evolution Roadmap

## The difference from the audit

In the source document's words:

> The important difference from the audit is that this would specify exactly what should be built, in what order, what interfaces should exist, what invariants must hold, and how each stage can be experimentally validated.

## Status of the parts

| Document part | Covers outline sections | Status |
|---|---|---|
| [Part 11](11-target-architecture-and-system-contracts.md) | 1–4 (and the contract model underlying 5–19) | [source] |
| [Part 12](12-domain-model-and-state-architecture.md) | 5 (domain/state model, canonical data contracts) | [source] |
| [Part 13](13-simulation-kernel-and-tick-semantics.md) | 6 (tick semantics, deterministic transition) | [filled-in] / implemented |
| [Parts 14–19](14-genetics-and-heredity-architecture.md) | 7–12 (genetics through replication) | [filled-in] / stage-1 or implemented subset |
| [Runtime implementation status](../implementation-status.md) | runtime coverage audit | [filled-in] |
| Parts 20–39 | 13–26 | **not yet written or implemented** — see the [roadmap](99-roadmap.md) |
