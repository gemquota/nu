# Cell Expansion Series — Refined Development Plan (v1)

> **Status: [filled-in]** — the cell-side companion to the [Plant Expansion Series](plant-expansion-series.md), same structure: instalments (C1–C4) with interspersed bridge phases (K1–K3). Where the plant series fixes the asymmetry that cells had genomes and plants did not, this series fixes the *other* asymmetry the plant series exposes: **cells are behavioural generalists with no developmental depth of their own**. Plant instalment 1 gives flora a budget, a construction queue, and budget-only death — cells already have parts of that, but their body is a fixed node ring decided at birth, their physiology is a flat energy scalar, and their sensory repertoire is hardcoded. Grounded in the current runtime: node-based bodies with upgradeable levels, Hebbian plasticity, the complex-molecule economy, adhesion/herd genes, day/night sensing, terrain water/walls, and (after I1) budgeted plants. Every instalment and bridge follows repo discipline: deterministic named-RNG streams only, delta-tracked world mutations (atomic rollback, K2), the conservation ledger for every energy/molecule transfer, invariants written so each becomes an automated test in `tests/`.

## Questionnaire decisions (locked)

| Decision | Choice | Consequence |
|---|---|---|
| Cell genome depth | **Developmental stage machine** | Cells gain explicit developmental stages (germination → juvenile → mature → senescent) driven by the existing Part 15 construction queue, not a flat maturity scalar. |
| Node differentiation | **Paid specialization** | Node *kinds* mutate at birth, but changing a node's function mid-life costs molecules (dedifferentiation is real economics, not free reconfiguration). |
| Sensory model | **Evolvable sensor budget** | The number/quality of photoreceptors/chemoreceptors/mechanoreceptors trades against upkeep — sensing is paid for from the cell's budget, exactly like plant leaves. |
| Metabolism | **Two-currency budget** | Cells keep energy *and* molecules as distinct budgets with a declared exchange (biosynthesis) — mirroring the plant pool so cross-kingdom traits are comparable. |
| Mortality | **Budget-only + senescence** | Death from energy bankruptcy (already live) plus a heritable senescence clock (dividing-like decay) — no age cliffs hardcoded. |
| Behaviour plasticity | **Lifetime learning stays, gains cost** | Hebbian plasticity remains, but each plastic update consumes a trickle of energy — learning is metabolically expensive. |
| Communication | **Chemical signalling** | Cells emit/tune pheromone signals paid in molecules (the existing field becomes a two-way medium, not just a trace). |
| Multicellularity | **Out of scope here** | Adhesion already enables clumping; true multicellularity (shared physiology, specialization) is a separate series. This series makes single cells honest organisms first. |

## Series structure — instalments with interspersed bridge phases

```
C1 Cellular Physiology ──► K1 Kernel & Sensing ──► C2 Evolvable Senses ──► K2 Heredity Refactor
                                                                            ──► C3 Social Ecology ──► K3 Signals & Ledger ──► C4 Life History
```

The **bridge phases (K1–K3)** are not cell features: each upgrades kernel/sensing, genetics, or signals/ledger infrastructure that the next cell instalment depends on.

| Order | Unit | Theme | Depends on |
|---|---|---|---|
| 1 | **C1** | Cellular Physiology (stage machine, two-currency budget, budget-only + senescence death) | — |
| 2 | **K1** | Kernel & Sensing (observation pipeline generalization, per-node tick accounting) | C1 |
| 3 | **C2** | Evolvable Senses (sensor budget, paid plasticity, differentiation costs) | C1, K1 |
| 4 | **K2** | Heredity Refactor (shared operators with flora, cell-side allele tracking) | C2 |
| 5 | **C3** | Social Ecology (chemical signalling, herd/adhesion dynamics, predation coevolution) | C2, K2 |
| 6 | **K3** | Signals & Ledger (pheromone recipes, cross-kingdom conservation harness) | C3 |
| 7 | **C4** | Life History (senescence evolution, reproductive strategies, observables) | C3, K3 |

---

## Instalment 1 — Cellular Physiology

**Goal.** Give cells the same budgetary honesty plants got in I1: an explicit stage machine, a two-currency budget, and death that is always an economic event.

**Phases.**

| Phase | Work | Files |
|---|---|---|
| 1.1 | Stage machine: replace the flat `maturity` scalar with stages derived from the construction queue + age (`GERMINATION` during development, `JUVENILE` until the queue empties, `MATURE`, `SENESCENT` past a heritable `senescenceOnset`). Stages gate reproduction and upgrade actions. | `src/world/world.ts`, `src/world/development.ts` |
| 1.2 | Two-currency budget: energy (existing) and molecules (existing) become a declared budget pair with exchange rates exported as constants; biosynthesis, scavenging, theft, and node construction all flow through one `cellBudget()` helper so C2+ traits can reweight it. | `src/world/metabolism.ts`, `src/systems/systems.ts` |
| 1.3 | Paid plasticity: each Hebbian update costs `LEARNING_COST_PER_UPDATE` energy; the learning rate becomes an evolvable gene (BEHAVIOUR layer) instead of a global runner constant. | `src/systems/systems.ts`, `src/world/genetics.ts` |
| 1.4 | Senescence: past `senescenceOnset` (a REGULATION gene), upkeep rises smoothly — no cliff. Death remains pool starvation (I-PL1.4 style, budget-only). | `src/world/world.ts`, `src/systems/systems.ts` |
| 1.5 | Ledger wiring: every stage transition, plasticity cost, and senescence upkeep increment is a conservation entry. | `src/systems/systems.ts`, tests |
| 1.6 | Lab: cell inspector shows stage, budget pair, senescence curve. Presentation-only. | `src/web/main.ts` |

**New config** (exported for tests): `LEARNING_COST_PER_UPDATE`, `SENESCENCE_UPKEEP_SLOPE`, `SENESCENCE_ONSET_RANGE`, `BIOSYNTH_ENERGY_PER_MOLECULE` (already live, exported through `cellBudget()`).

**Invariants** (`tests/cell-physiology.test.ts`):

- **I-CL1.1 (Closure).** Energy + molecules across all cells conserve against the ledger within tolerance over any window.
- **I-CL1.2 (Stage ordering).** Stage is a pure function of (age, queue state, senescenceOnset) — replay-stable, no hidden timers.
- **I-CL1.3 (Paid plasticity).** Learning never increases total energy; every brain-weight update has a matching debit.
- **I-CL1.4 (Budget-only death).** No code path removes a cell except bankruptcy (or predation); senescence only raises upkeep.

**Acceptance.** 5,000-tick run shows stage structure in the population (juveniles/mature/senescent all present); learning-rate gene differentiates under predation pressure. All existing tests stay green.

---

## Bridge K1 — Kernel & Sensing

**Goal.** Generalize the observation pipeline (Part 16) so sensor *arrays* are data, not hardcoded counts, and per-node metabolic accounting lands in the kernel's tick structure.

**Phases.**

| Phase | Work | Files |
|---|---|---|
| K1.1 | Observation records carry per-sensor metadata (kind, gain, reach) read from the node body — the pipeline no longer assumes three fixed channel types. | `src/systems/observations.ts`, `src/world/body.ts` |
| K1.2 | Per-node upkeep: every node type declares an energy cost; the physiology system sums the body's node bill (mirrors the plant per-leaf upkeep). | `src/world/body.ts`, `src/systems/systems.ts` |
| K1.3 | Deterministic sensor ordering: sensor reads enumerate in node-id order so K5 holds as arrays become dynamic. | `src/systems/observations.ts` |
| K1.4 | Lab: per-node cost breakdown in the inspector. | `src/web/main.ts` |

**Invariants:**

- **I-CLK1.1 (Ordered sensing).** Reordering node storage does not change observations (order is by node id, not array index).
- **I-CLK1.2 (Node bill).** Summing per-node costs equals the cell's total node upkeep (ledger-checked).

**Acceptance.** Tick-time profile shows no regression; inspector renders the node bill.

---

## Instalment 2 — Evolvable Senses

**Goal.** Sensory apparatus becomes an evolvable trade-off: more/better sensors cost more upkeep, so perception specializes under selection.

**Phases.**

| Phase | Work | Files |
|---|---|---|
| 2.1 | Sensor budget genes: `photoreceptorGain`, `chemoreceptorGain`, `mechanoreceptorGain` join the registry (MORPHOLOGY layer), each scaling both sensor *reach* and the node's upkeep bill. | `src/world/genetics.ts`, `src/world/body.ts` |
| 2.2 | Paid differentiation: mutating a node's kind mid-life (dedifferentiation) costs `NODE_DIFFERENTIATION_COST` molecules and takes ticks (a queue entry, like plant leaves). | `src/world/genetics.ts`, `src/systems/systems.ts` |
| 2.3 | Learning-rate gene: the Hebbian rate migrates from the runner config to a BEHAVIOUR gene; paid plasticity (C1.3) applies per update. | `src/world/genetics.ts`, `src/systems/systems.ts` |
| 2.4 | Trait-tracing test: under static vs patchy food distributions, sensor-gain allele frequencies diverge as predicted. | `tests/cell-genetics.test.ts` |

**Invariants:**

- **I-CL2.1 (Fidelity).** Zero-mutation reproduction preserves sensor genes bit-identically.
- **I-CL2.2 (Boundedness).** All new genes stay within lo/hi across 10⁶ mutation applications.
- **I-CL2.3 (Paid change).** No node changes kind without a molecule debit and a queue entry.

**Acceptance.** 20k-tick replicates show sensor specialization tracking food distribution; old checkpoints load (new genes default lazily).

---

## Bridge K2 — Heredity Refactor

**Goal.** One heredity story across kingdoms: cell-side allele tracking, shared mutation statistics, and cross-kingdom lineage observables (completes plant B2 symmetry).

**Phases.**

| Phase | Work | Files |
|---|---|---|
| K2.1 | Allele-frequency recorder for cell genes (mirrors the plant B2.4 series export). | `src/experiment/replication.ts` |
| K2.2 | Gene-knockout interventions for cell genes (declared-config, Part 19). | `src/experiment/replication.ts` |
| K2.3 | Cross-kingdom lineage: plant clusters join the lineage book as founder-tracked entities (plant B2.3 completion). | `src/world/lineage.ts` |
| K2.4 | Checkpoint compatibility: pre-C1 worlds derive stages/senescence lazily (no schema break). | `src/world/world.ts`, tests |

**Invariants:**

- **I-CLK2.1 (Kingdom isolation).** Cell and flora alleles never co-report in one series.
- **I-CLK2.2 (Lineage closure).** Every extant cell and cluster descends from exactly one recorded founder.

**Acceptance.** A `photoreceptorGain` knockout shows the expected fitness collapse vs control; old checkpoints run.

---

## Instalment 3 — Social Ecology

**Goal.** Close the cell–cell and cell–plant loops: paid chemical signalling, herd economics, and coevolution with defended plants (plant I3 counterpart).

**Phases.**

| Phase | Work | Files |
|---|---|---|
| 3.1 | **Chemical signalling**: cells pay molecules to deposit a tuned pheromone (existing field gains a *signal* channel with per-emitter signature); receivers evolve response weights (NEURAL layer). | `src/world/field.ts`, `src/systems/systems.ts` |
| 3.2 | **Herd economics**: adhesion clumps share a fraction of scavenged molecules (pool tax — the group-selection primitive from the ProtoEvo mapping §2.6). | `src/systems/systems.ts` |
| 3.3 | **Predation coevolution**: spike attacks interact with plant defence compounds (toxin load from plant I3 reduces attacker yield); predator success feeds back into prey gene frequencies. | `src/systems/systems.ts` |
| 3.4 | Corpse-to-soil completion: cell deaths on depleted soil enrich it (links to plant I3.4's field). | `src/systems/systems.ts` |
| 3.5 | Lab: signal overlay + herd-pool readouts. | `src/web/main.ts` |

**Invariants:**

- **I-CL3.1 (Paid signals).** No pheromone deposit exists without a molecule debit (ledger-checked).
- **I-CL3.2 (Pool conservation).** Herd-pool shares redistribute; nothing is created or destroyed outside the ledger.
- **I-CL3.3 (Carrier accountability).** Every signal deposit traces to an emitter and tick.

**Acceptance.** Coevolution smoke test: signalling evolves when food is patchy, collapses when uniform; predator distributions shift against defended plants.

---

## Bridge K3 — Signals & Ledger

**Goal.** Formalize what C3 grew ad hoc: signal recipes as first-class molecule recipes, a cross-kingdom conservation stress harness (completes plant B3 symmetry).

**Phases.**

| Phase | Work | Files |
|---|---|---|
| K3.1 | Signal recipes: pheromone signatures become declared recipes (cost, decay, diffusion) in the molecule economy. | `src/world/metabolism.ts`, `src/world/field.ts` |
| K3.2 | Cross-kingdom stress harness: config matrix (signalling × herding × plant defence × feedbacks) asserting ledger drift in CI — the combined regression net. | `tests/`, `scripts/` |
| K3.3 | Performance: profile field channels + node bills at 2× population cap. | `scripts/` |

**Invariants:**

- **I-CLK3.1 (Recipe conservation).** Every signal molecule traces to a synthesis debit; decay is the only sink.
- **I-CLK3.2 (Stress matrix).** All harness configs pass drift tolerance in CI.

**Acceptance.** Stress matrix green; profile within budget.

---

## Instalment 4 — Life History

**Goal.** Zoom out to life-history evolution: senescence timing, reproductive strategy trade-offs, and research-grade cell observables.

**Phases.**

| Phase | Work | Files |
|---|---|---|
| 4.1 | Reproductive strategy: `offspringInvestment` interacts with the stage machine (early vs late reproduction) — emergent r/K selection under mortality regimes. | `src/systems/systems.ts` |
| 4.2 | Senescence evolution: `senescenceOnset` shifts under extrinsic vs intrinsic mortality (controlled-replicate allele tracking). | `src/world/genetics.ts`, `src/systems/systems.ts` |
| 4.3 | Life-history observables: survival curves, age-structure histograms, generation-time series through the experiment framework. | `src/experiment/replication.ts`, `src/web/main.ts` |
| 4.4 | Performance: full-system profile at 4× population cap; <15% median tick regression allowed. | profiling script |
| 4.5 | Docs: update `docs/implementation-status.md` + Coverage tab. | `docs/implementation-status.md` |

**Invariants:**

- **I-CL4.1 (Age-structure closure).** Every live cell is in exactly one stage; stage counts sum to population.
- **I-CL4.2 (Life-history sanity).** Higher extrinsic mortality selects for earlier reproduction across replicates.
- **I-CL4.3 (Perf budget).** 4×-cap median tick regression < 15%.

**Acceptance.** A 30k-tick, 3-replicate experiment exports survival curves + age structure showing the predicted r/K shift, reproducible across seeds; the lab renders it in the trajectory-chart framework.

---

## Series-wide conventions

- **P-layer compliance.** The plant series' P0–P5 hardening layer applies equally here: mechanism ownership for every new variable, no hidden state, ledger entry for every transfer.
- **Determinism:** named RNG streams only; stage machines and senescence clocks are pure functions of authoritative state.
- **Ledger:** every energy/molecule transfer enters the conservation ledger; a unit isn't done until the K3-style drift stress passes.
- **Shared machinery:** sensor metadata (K1), allele tracking (K2), signal recipes (K3), and the gene registry are implemented *once* and consumed by both kingdoms.
- **Constants:** every tunable is an exported const in `metabolism.ts`/`body.ts` or a registry gene range in `genetics.ts`.
- **Presentation:** the lab may display anything but never writes world state (§12.44).
- **Docs:** each unit updates `docs/implementation-status.md` and the Coverage tab in the same change.
- **Ordering:** state/design first, then behaviour, then tests, then lab.

## Definition of done for the series

1. Cells are stage-structured, two-currency, sensor-budgeted organisms whose life histories demonstrably respond to ecological pressure.
2. Every invariant I-CL1.*–I-CL4.* and I-CLK1.*–I-CLK3.* is an automated test in `tests/` and green.
3. The lab exposes stage, budget pair, sensor bills, signals, herd pools, and life-history observables.
4. `docs/implementation-status.md` reflects the coupled cell ecology, with the Coverage tab matching.

---

## Related documents

| Document | What it covers |
|---|---|
| [Plant Expansion Series](plant-expansion-series.md) | The companion flora series this mirrors (I1–I4, B1–B3) |
| [Docs library index](../index.md) | Audit, spec, and reference reading order |
| [ProtoEvo → nu mapping](../reference/protoevo-to-nu-mapping.md) | Source of the herd-economics and signalling primitives |
| [Runtime implementation status](../implementation-status.md) | Conservative coverage matrix the Coverage tab mirrors |
