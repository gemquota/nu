# Runtime Implementation Status

> **Status: [filled-in]** — an implementation audit of the documents in this repository. This page separates executable specification contracts from architectural analysis and reference material.

## Summary

The current runtime is a deterministic TypeScript/Bun engine with a browser lab. It implements the kernel, a working artificial-life null model, and the full Parts 14–18 architectures (genetics/heredity, development/morphogenesis, behaviour/agent, ecology/environment, evolution/selection). The ecology layer additionally carries a ProtoEvo-inspired complex-molecule economy (biosynthesis, collection, scavenging, theft, node upgrades), terrain elevation with water basins and organic barrier walls, a day/night cycle, and ProtoEvo-style plant cluster bodies with spore dispersal. It does **not** fully implement every document in the repository: Parts 20–39 of the Master Technical Specification have not been written, and multicellular/specialization ecology remains on the roadmap.

## Coverage matrix

| Document | Runtime status | What is live |
|---|---|---|
| Architectural Audit, Parts 0–10 | Reference / analysis | The audit describes the system and its desired boundaries; it is not an executable contract. The engine follows the major dependency direction and keeps presentation state outside the world. |
| Part 11 — Target Architecture & System Contracts | Foundational subset | System contracts, phase ownership, headless execution, domain/infrastructure event distinction, and presentation separation are represented. The complete target architecture is broader than this implementation. |
| Part 12 — Domain Model & State Architecture | Foundational subset | Authoritative organisms/resources/config/RNG/tick state, derived spatial index, ephemeral intents, lineage, pheromone field, serialization, and world-owned deltas are live. Several future schemas remain unimplemented. |
| Part 13 — Simulation Kernel | Implemented | Nine-phase deterministic schedule, named RNG streams, double-buffered deltas, atomic rollback, commit-time advancement, debug write boundaries, and checkpoint-compatible state are live and tested. |
| Part 14 — Genetics & Heredity | Implemented | Full multi-layer gene registry (REGULATION/MORPHOLOGY/BEHAVIOUR/NEURAL), all four mutation operators (point, deletion, duplication, regulatory rewiring), optional sexual recombination with genome + brain crossover, offspring inheritance, and lineage heredity are live and tested. |
| Part 15 — Development & Morphogenesis | Implemented | Construction-queue development over surface-node modules, paid maturation with phenotype scaling, module metadata/upkeep, and canalization as a domain transition (`DevelopmentCompleted`) are live and tested. |
| Part 16 — Behaviour & Agent | Implemented | Formal observation records assembled from the node body (B1 discipline) — including occlusion-aware photoreceptor raycasts and day/night sensing — recurrent short-term memory (dies with the organism), lifetime Hebbian plasticity, proposal intents, and world-resolved consequences are live and tested. |
| Part 17 — Ecology & Environment | Implemented | Multi-field environment (pheromone trail + temperature + chemical), terrain elevation with water basins and hex-derived organic barrier walls, day/night cycle, strict conservation ledger (audit drift near float tolerance), full interaction records, corpse ecology, pulses, decay/diffusion, niche construction, the ProtoEvo complex-molecule economy (energy-paid biosynthesis, molecules from food, scavenging from corpses, spike-theft from prey, molecule-paid node creation and upgrades), and ProtoEvo-style plant cluster bodies (orb clusters that deplete under grazing and shed drifting spores that settle into new clusters) are live and tested. |
| Part 18 — Evolution & Selection | Implemented | Ecological selection with no stored fitness field, full lineage observables (descendants, survival, founder shares, extinction), genome-cluster species, neutral-drift tests, and optional auditable direct selection are live and tested. |
| Part 19 — Experiment & Replication | Implemented subset | Independent replicate seeds, aggregate statistics, checkpoint branching, declared config interventions, provenance, and branch-isolation tests are live. Broader analysis and persistence contracts depend on later parts. |
| Parts 20–39 | Not written / not implemented | The outline names observation analysis, history, persistence, determinism, workers, performance, UI architecture, validation, migration, acceptance criteria, and long-term roadmap parts. They remain on the roadmap. |
| Lab instrumentation | Implemented (presentation) | Individual cell selection with nodal map, neural activation histograms, gene/environment colouration, tracking camera follow mode, interactive stacked/paired trajectory charts with selectable timeframe, touch/pinch navigation, parameters accordion, data/event readouts, and checkpoint export live in the browser lab. Presentation-only: none of it feeds back into the world (§12.44). |
| ProtoEvo reference + mapping | Reference with selected mechanisms | Resource competition, death-as-resource, the complex-molecule economy, niche construction, lineage analysis, and surface-level developmental ideas inform the stage-1 engine. The reference document is not itself a runtime specification, and multicellularity/specialization are not implemented. |

## What “implemented” means here

A row marked **Implemented** means the named contract is represented in code and covered by tests or an end-to-end run. **Stage 1 / partial** means the runtime demonstrates the mechanism with a deliberately smaller model, while the document's broader architecture still has explicit gaps. **Foundational subset** means the runtime adopts the boundary principles but does not claim to satisfy every future schema or acceptance criterion.

The browser lab's **Coverage** tab presents this same matrix while the simulation is running. It is intentionally conservative so a visual demo cannot be mistaken for full specification compliance.
