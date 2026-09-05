# nu — Architecture Documentation Library

This library is derived from `nu/Explain Conceptual Architecture.pdf` (a ChatGPT transcript covering an architectural audit and a Master Technical Specification for **nu**, a deterministic artificial-life research platform).

> **Provenance legend**
> - **[source]** — content present in the PDF export, cleaned from transcript artifacts.
> - **[filled-in]** — a missing part reconstructed so the series is complete. The reconstruction follows the document's own structure, terminology, tables of contents, and forward/back references. It states intent and principles, but it does not invent specifics (schemas, code, module names) that the original dialog may have contained.

## The two documents

The PDF interleaves two related works:

1. **The Architectural Audit** — a 10-part conceptual analysis of the existing codebase (Parts 1–10), ending with the recommendation to produce a Master Technical Specification.
2. **The Master Technical Specification** — a target-state engineering contract. The source document contains Part 11 and Part 12, and defines the outline for the remaining parts (13 onward) as a 26-section table of contents.

## Reading order

### I. Architectural Audit (10 parts)

| # | Document | Status |
|---|----------|--------|
| 0 | [Series Overview](audit/00-series-overview.md) | [filled-in] |
| 1 | [Part 1 — The System and Its Purpose](audit/01-the-system-and-its-purpose.md) | [filled-in] |
| 2 | [Part 2 — Modules, Structure & State](audit/02-modules-structure-and-state.md) | [filled-in] |
| 3 | [Part 3 — Bounded Contexts & Architectural Paradigm](audit/03-bounded-contexts.md) | [source] |
| 4 | [Part 4 — Coupling, Dependency Direction & Hidden State](audit/04-coupling-and-hidden-state.md) | [filled-in] |
| 5 | [Part 5 — Simulation Semantics: Time, Ticks & Causality](audit/05-simulation-semantics.md) | [filled-in] |
| 6 | [Part 6 — Genetics, Development & Phenotype](audit/06-genetics-development-phenotype.md) | [filled-in] |
| 7 | [Part 7 — Behaviour, Ecology & Selection](audit/07-behaviour-ecology-selection.md) | [filled-in] |
| 8 | [Part 8 — Experimentation, History & Reproducibility](audit/08-experimentation-history-reproducibility.md) | [filled-in] |
| 9 | [Part 9 — Execution, Performance & Infrastructure](audit/09-execution-performance-infrastructure.md) | [filled-in] |
| 10 | [Part 10 — Synthesis: The Gap and the Path](audit/10-synthesis-the-gap.md) | [filled-in] |

### II. Master Technical Specification

| # | Document | Status |
|---|----------|--------|
| — | [Specification Outline (26 sections)](spec/00-outline.md) | [source] |
| 11 | [Part 11 — Target Architecture & System Contracts](spec/11-target-architecture-and-system-contracts.md) | [source] |
| 12 | [Part 12 — Domain Model, State Architecture & Canonical Data Contracts](spec/12-domain-model-and-state-architecture.md) | [source] |
| 13 | [Part 13 — Simulation Kernel, Tick Semantics & Deterministic State Transition](spec/13-simulation-kernel-and-tick-semantics.md) | [filled-in] / implemented |
| 14 | [Part 14 — Genetics & Heredity Architecture](spec/14-genetics-and-heredity-architecture.md) | [filled-in] / stage 1 |
| 15 | [Part 15 — Development & Morphogenesis Architecture](spec/15-development-and-morphogenesis-architecture.md) | [filled-in] / stage 1 |
| 16 | [Part 16 — Behaviour & Agent Architecture](spec/16-behaviour-and-agent-architecture.md) | [filled-in] / stage 1 |
| 17 | [Part 17 — Ecology & Environment Architecture](spec/17-ecology-and-environment-architecture.md) | [filled-in] / stage 1 |
| 18 | [Part 18 — Evolution / Selection Architecture](spec/18-evolution-and-selection-architecture.md) | [filled-in] / stage 1 |
| 19 | [Part 19 — Experiment & Replication Framework](spec/19-experiment-and-replication-framework.md) | [filled-in] / implemented subset |
| 20–39 | Parts 20 onward | **not written or implemented** — see [roadmap](spec/99-roadmap.md) |

### III. Reference

| Document | Status |
|----------|--------|
| [ProtoEvo — System Study](reference/protoevo.md) | [source] (user-supplied research summary) |
| [ProtoEvo → nu Mapping](reference/protoevo-to-nu-mapping.md) | [filled-in] |
| [Full original transcript](../Explain%20Conceptual%20Architecture.md) | [source] (unmodified export) |

The [runtime implementation status](implementation-status.md) is the authoritative answer to whether a document's ideas are executable in the current simulation. It is intentionally conservative: written documentation is not counted as runtime implementation, and stage-1 mechanisms are labeled as partial.

### IV. Implementation

[`src/`](../src) is a TypeScript/Bun implementation of the deterministic kernel and a stage-1 artificial-life null model. It is verified against the invariants in [`tests/`](../tests/kernel.test.ts) and runnable via `bun run src/cli.ts`; the browser lab lives in [`src/web/`](../src/web). See the [runtime implementation status](implementation-status.md) for the full, conservative coverage audit and the [root README](../README.md#implementation) for the source layout.

### V. Planned expansion series

| Series | Scope | Status |
|---|---|---|
| [Plant Expansion Series](roadmaps/plant-expansion-series.md) | Four-instalment dev plan (I1–I4) with three interspersed bridge phases (B1–B3): plant physiology → sensing/surface integration → heritable flora → heredity pipeline → coupled plant–animal ecology → economy/environment hardening → communities & succession | planned |
| [Plant Series — Combined Edition](roadmaps/plant-expansion-series-combined.md) | One-page consolidated edition: intro, locked questionnaire decisions, contents, and the full refined plan (v2) merged into a single file for easy reading and sharing | planned |
| [Cell Expansion Series](roadmaps/cell-expansion-series.md) | Cell-side companion (C1–C4 with bridges K1–K3): cellular physiology → kernel/sensing → evolvable senses → heredity refactor → social ecology → signals/ledger → life history | planned |

> The combined edition is derived from the modular source (`plant-expansion-series.md`) and does not supersede it; edit the source and re-merge rather than editing the combined file directly.

## Series conventions

- The [Plant Expansion Series](roadmaps/plant-expansion-series.md) is the source of record for plant-layer planning; its [combined edition](roadmaps/plant-expansion-series-combined.md) is a generated one-page view, not an independent document.
- The [Cell Expansion Series](roadmaps/cell-expansion-series.md) is the cell-side companion and mirrors the plant series' structure and conventions (including the P0–P5 hardening layer).
- Parts of the audit use the heading pattern `N.M` (e.g., `3.2 The Simulation Kernel`).
- Spec parts use `11.x`, `12.x`, `13.x`, etc.
- ASCII diagrams are preserved from the source where the transcript flattened them; each has been re-flowed into a code block with original structure intact.
- Sections announced by the document ("Part 4/10 will examine that gap…") define each missing part's scope before it is written; the reconstructions follow those scopes.
- The [ProtoEvo reference](reference/protoevo.md) is external source material: Dylan Cope's ProtoEvo / "Simulating an Evolving Microcosmos" serves as the concrete comparable system for the specification's contracts, mapped in [the reference mapping](reference/protoevo-to-nu-mapping.md) and consumed by the [roadmap's](spec/99-roadmap.md) remaining parts.
