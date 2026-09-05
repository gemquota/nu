# Plant Expansion Series — Refined Development Plan (v2)

> **Status: [filled-in]** — refined by questionnaire (two design rounds). A single-page combined edition (intro + contents + full plan) is available at [`plant-expansion-series-combined.md`](plant-expansion-series-combined.md). Grounded in the current runtime as of the leaf-ring/adhesion update: touching-orb cluster bodies (`leafRingPosition`), edge-attached growth, rock-aware sprouting, cell `sizeScale`/`hue`/`adhesion` genes, directional wall-gradient sensing, and the ProtoEvo complex-molecule economy are live. Every instalment and bridge follows repo discipline: deterministic named-RNG streams only, world mutations as delta-tracked state (atomic rollback, K2), the conservation ledger for every energy/molecule transfer, and invariants stated so each can become an automated test in `tests/`.

## Questionnaire decisions (locked)

| Decision | Choice | Consequence |
|---|---|---|
| Photosynthesis | **Multi-field** | Income samples the live environment fields — light (day/night), water basins, soil fertility, chemical field — per Part 17's multi-field model, not a single daylight scalar. |
| Body plan | **Surface-node modules** | Plant bodies adopt the Part 15 surface-node module architecture; leaves are modules on a plant body, not ad-hoc orb bookkeeping. |
| Plant genome | **Shared gene registry** | Plant genes join the Part 14 multi-layer registry (a `FLORA` layer): same mutation operators, same species-clustering vectors. No forked genetics. |
| Body depth | **Hybrid, staged** | Stage A keeps the patch representation for edibility with cluster state attached; Stage B migrates structure to construction-queue modules. Both stages ship working, tested. |
| Growth | **Construction queue** | New leaves are queued, paid, and matured through Part 15 construction-queue semantics — never instantaneous probability spawns. |
| Mortality | **Budget only** | Death comes only from energy bankruptcy. The `LEAF_DEPLETION_TICKS` camping special-case is retired; grazing kills by draining the pool through the budget. |
| Heredity | **Rare recombination** | Flora is clonal by default; recombination is a rare event on spore founding, implemented once and shared with the cell-side crossover machinery. |
| Defence model | **Molecule-built** | Toxin/toughness/thorn compounds are synthesized through the complex-molecule biosynthesis economy — paid in molecules, not just energy. |
| Dispersal | **Hitchhike + nectar** | Spores ride `adhesion`-gated cells (zoochory) and plants pay nectar to attract visitors; wind drift remains as the baseline fallback. |
| Terrain loop | **Water + soil + microclimate** | Plant feedback formalized as three environment-field modifiers: basin retention, soil enrichment/depletion, local microclimate (humidity/temperature shading). |

## Series structure — instalments with interspersed bridge phases

Alongside the seven units, a cross-cutting **Plant Architecture Hardening layer (P0–P5)** runs across the series — see [below](#cross-cutting-hardening-layer--plant-architecture-hardening-p0p5). It is not an eighth instalment: each unit inherits its P-layer obligations as part of that unit's phases.

```
I1 Living Physiology ──► B1 Sensing & Surface ──► I2 Heritable Flora ──► B2 Heredity Pipeline
                                                                        ──► I3 Coupled Ecology ──► B3 Economy & Environment ──► I4 Communities & Succession
```

The **bridge phases (B1–B3)** are not plant features: each upgrades and integrates the *other* systems the next plant instalment depends on — behaviour/kernel, genetics/experiment, economy/environment respectively.

| Order | Unit | Theme | Depends on |
|---|---|---|---|
| 1 | **I1** | Living Physiology (multi-field income, construction-queue growth, budget-only death) | — |
| 2 | **B1** | Sensing & Surface Integration (brain slots, spatial index, light field) | I1 |
| 3 | **I2** | Heritable Flora (shared registry genome, rare recombination) | I1, B1 |
| 4 | **B2** | Heredity Pipeline Unification (one recombination path, cross-kingdom species, allele tracking) | I2 |
| 5 | **I3** | Coupled Ecology (molecule-built defence, hitchhike + nectar dispersal) | I2, B2 |
| 6 | **B3** | Economy & Environment Hardening (defence recipes, three terrain feedback fields, ledger stress harness) | I3 |
| 7 | **I4** | Communities & Succession (spatial competition, succession, observables, perf) | I3, B3 |

---

## Instalment 1 — Living Physiology

**Goal.** Replace the free-growth probability model with a plant that earns its growth through a multi-field photosynthesis budget, grows through the construction queue, and dies only by energy bankruptcy.

**Phases.**

| Phase | Work | Files |
|---|---|---|
| 1.1 | Per-cluster state (Stage A hybrid): `energy` pool, `age`, `soilDepletion`, stored as a delta-tracked world map `plantClusters` (not on patches) so rollback semantics match the kernel's double-buffer discipline. | `src/world/world.ts`, `src/world/plants.ts` |
| 1.2 | **Multi-field photosynthesis**: per-tick income per leaf = `leafCapacity × lightField × waterField × soilField × chemicalModifier`. Light comes from `daylight()`/`dayPhase()`; water from basin proximity; soil from the local fertility map; the existing chemical field contributes a small clamped modifier. Each field sampled through one `photosynthesisInput()` helper so I2 genes can reweight it. | `src/systems/systems.ts` (`PlantEcologySystem`), `src/world/terrain.ts` |
| 1.3 | **Construction-queue growth**: a new leaf is *queued* when the pool holds `GROWTH_COST` + queue reserve; it matures over `LEAF_MATURATION_TICKS` (paid upkeep while under construction), then attaches via the existing edge-attach + `Terrain.clearance` siting. `GROWTH_PROBABILITY` becomes the *proposal* rate; energy gates everything. | `src/systems/systems.ts`, `src/world/plants.ts` |
| 1.4 | **Budget-only mortality**: leaves regenerate from the cluster pool (income − upkeep − grazed withdrawals). The `LEAF_WILT_FRACTION` line becomes a pool signal; `LEAF_DEPLETION_TICKS` is retired — an emptied leaf dies when the *pool* can't cover its upkeep for `UPKEEP_STARVATION_TICKS`. | `src/systems/systems.ts`, `src/world/plants.ts` |
| 1.5 | Ledger wiring: every income, queue payment, maturation cost, and grazed withdrawal is a conservation entry. | `src/systems/systems.ts`, tests |
| 1.6 | Lab: cluster tooltip shows pool, per-field income breakdown, queue depth. Presentation-only. | `src/web/main.ts` |

**New config** (exported for tests): `PHOTOSYNTHESIS_RATE`, `GROWTH_COST`, `LEAF_MATURATION_TICKS`, `UPKEEP_PER_LEAF`, `UPKEEP_STARVATION_TICKS`, `SOIL_DEPLETION_PER_TICK`, `SOIL_RECOVERY_PER_TICK`.

**Invariants** (`tests/plant-physiology.test.ts`):

- **I-PL1.1 (Closure).** Over any window with zero grazing, pool + leaf biomass − cumulative costs is conserved to ledger tolerance.
- **I-PL1.2 (Field responsiveness).** Zeroing any one field (light, water, soil) strictly reduces income; a full night stalls all growth.
- **I-PL1.3 (Queue honesty).** Every matured leaf corresponds to a prior `GROWTH_COST` debit; no leaf appears without a queue entry.
- **I-PL1.4 (Budget-only death).** No code path removes a leaf or cluster except pool starvation (or grazing withdrawal); `LEAF_DEPLETION_TICKS` is gone from the runtime.

**Acceptance.** 5,000-tick herbivore-free run self-limits plant count via soil + pool; with herbivores, biomass oscillates. Existing 53 tests stay green.

---

## Bridge B1 — Sensing & Surface Integration

**Goal.** Make plants first-class citizens of the Part 16 observation pipeline and the kernel's spatial index, so I2+ plant behaviour has real sensors and I4's canopy queries are cheap.

**Phases.**

| Phase | Work | Files |
|---|---|---|
| B1.1 | Plant brain slots: extend the observation-record pipeline with plant-side inputs — light gradient (per-leaf), water gradient, local soil state, queue fullness — assembled with the same B1 discipline as cell observations (world-owned, ephemeral). | `src/systems/systems.ts`, `src/world/world.ts` |
| B1.2 | Light as a sampled field: promote point-in-time `daylight()` sampling to a per-tick light field pass plants and cells both read (one computation, two consumers) — removes duplicated day/night math and preps microclimate shading. | `src/world/terrain.ts`, `src/systems/systems.ts` |
| B1.3 | Cluster spatial index: extend the existing cell spatial hash to clusters/leaves so grazing, hitchhiking (I3), and canopy competition (I4) are O(neighbours). | `src/world/world.ts` |
| B1.4 | Surface-node groundwork (Stage B prep): define the plant surface-node body type and its module metadata so construction-queue leaves in I2 target nodes rather than free positions; Stage A patch rendering stays until I2. | `src/world/plants.ts`, `src/world/body.ts` |
| B1.5 | Lab: plant-selection mode reusing the existing cell inspector (nodal map shows the surface-node layout). | `src/web/main.ts` |

**Invariants:**

- **I-PLB1.1 (One light pass).** Light field is computed once per tick; cell and plant readings at the same position are bit-identical.
- **I-PLB1.2 (Ephemeral observations).** Plant observation records never persist past their tick (Part 16 §B1 discipline).
- **I-PLB1.3 (Index parity).** Every grazing/spore-settle query returns the same result set as a brute-force scan over patches (property test).

**Acceptance.** Tick-time profile shows no regression from the light pass + index; plant inspector renders surface-node layout headlessly in tests via a deterministic snapshot.

---

## Instalment 2 — Heritable Flora

**Goal.** Plant genes join the shared Part 14 registry; spores carry mutated (and rarely recombined) parental genes; dispersal becomes a strategy under selection.

**Phases.**

| Phase | Work | Files |
|---|---|---|
| 2.1 | `FLORA` layer in the gene registry: `photosynthesisAffinity`, `growthRate`, `leafCapacity`, `sporeForce`, `sporeLifespanBias`, `waterPreference`, `wiltTolerance` — declared with `lo/hi/sigmaFactor` like cell genes; the registry's four mutation operators apply unchanged. | `src/world/genetics.ts` |
| 2.2 | Spore inheritance: `makeSpore` carries a genes payload; a settling spore founds its cluster with point/deletion/duplication mutations applied by the registry machinery. | `src/world/plants.ts`, `src/systems/systems.ts` |
| 2.3 | **Rare recombination**: on spore founding, a small probability triggers the shared crossover operator (the same genome+brain crossover path cells use) against a second parent cluster within dispersal range — one implementation, two kingdoms. | `src/world/genetics.ts`, `src/systems/systems.ts` |
| 2.4 | Gene → phenotype mapping: I1's `photosynthesisInput()` fields reweighted by `photosynthesisAffinity`/`waterPreference`; constants become clamped per-cluster overrides. | `src/systems/systems.ts` |
| 2.5 | Dispersal physics from genes: `sporeForce` scales ejection; `sporeLifespanBias` scales the perimeter-derived window. Wind wander stays world-level. | `src/systems/systems.ts` |
| 2.6 | Trait-tracing test: seed two genotypes in separate replicates; assert allele-frequency drift direction under grazing. | `tests/plant-genetics.test.ts` |

**Invariants:**

- **I-PL2.1 (Fidelity).** Mutation-probability-0 reproduction yields identical genes (fixed seed).
- **I-PL2.2 (Boundedness).** Every `FLORA` gene stays within `lo/hi` across 10⁶ mutation applications.
- **I-PL2.3 (Recombination rarity).** Crossover fires at the configured rate ±3σ across 10⁴ founding events, and only between clusters within dispersal range.
- **I-PL2.4 (Determinism).** Identical seeds → identical plant genomes at tick N.

**Acceptance.** 20k-tick replicate set shows at least one trait under directional environmental change. `sporeLifespanFor` remains the fallback for gene-less patches (old checkpoints load).

---

## Bridge B2 — Heredity Pipeline Unification

**Goal.** One heredity story for the whole world: shared recombination operators, cross-kingdom species clustering, lineage observables for plants, and allele tracking in the experiment framework.

**Phases.**

| Phase | Work | Files |
|---|---|---|
| B2.1 | Extract the recombination/crossover operator behind one interface consumed by both cell sexual reproduction and flora founding — delete the cell-side special case. | `src/world/genetics.ts` |
| B2.2 | Cross-kingdom species: run the existing genome-cluster species algorithm over cell and `FLORA` vectors; species ids namespaced per kingdom so richness is reported separately and jointly. | `src/world/lineage.ts` |
| B2.3 | Plant lineage observables: founder shares, extinction, and descent counts for plant clusters through the existing lineage recorder. | `src/world/lineage.ts` |
| B2.4 | Experiment framework: declared-config interventions can fix or knockout a `FLORA` gene; replicates export plant allele-frequency series (Part 19 alignment). | `src/experiment/replication.ts` |
| B2.5 | Checkpoint compatibility: pre-I2 worlds load with gene-less patches and derive default genes lazily (no schema break). | `src/world/world.ts`, tests |

**Invariants:**

- **I-PLB2.1 (One operator).** A single recombination implementation exists; cell and flora paths both call it (verified by construction + a shared property test).
- **I-PLB2.2 (Kingdom isolation).** Species clustering never merges a cell genome with a flora genome.
- **I-PLB2.3 (Lineage closure).** Every extant plant cluster descends from exactly one recorded founder; extinct founders have zero extant descendants.

**Acceptance.** A replicate with a `leafCapacity` knockout intervention shows the expected biomass collapse vs. control; old checkpoints load and run.

---

## Instalment 3 — Coupled Ecology

**Goal.** Close the loop with animals: molecule-built defence, hitchhike dispersal, nectar rewards — all paid for through the existing economies so every trait can evolve honestly.

**Phases.**

| Phase | Work | Files |
|---|---|---|
| 3.1 | **Molecule-built defence** (`FLORA` genes `toxicity`, `toughness`, `thornDensity`): each maps to a compound synthesized via the biosynthesis economy — molecules + pool energy paid up front, stored in cluster reserves. Grazing bites consume compound stocks: toxin reduces net bite yield and injects toxin load into the eater's molecule economy; toughness scales bite cost; thorns damage grazing-contact cells. | `src/world/genetics.ts`, `src/systems/systems.ts` |
| 3.2 | **Nectar**: mature leaves accrue a nectar budget (paid from the pool); a visiting cell that doesn't bite can collect it — the seed of pollination-style attraction. | `src/systems/systems.ts` |
| 3.3 | **Hitchhike dispersal**: spores attach to cells whose `adhesion` gene exceeds the cluster's `sporeStickiness` (new gene) and are carried until the cell dies or brushes terrain, then settle through the existing spore path — no new state machine. | `src/world/body.ts`, `src/systems/systems.ts` |
| 3.4 | Corpse-to-soil loop: cells dying on depleted soil enrich it, linking corpse ecology to the soil field. | `src/systems/systems.ts` |
| 3.5 | **Terrain feedback (all three channels)**: dense clusters raise basin water retention, enrich/deplete soil, and shade a local microclimate modifier (humidity↑, temperature↓) — each a clamped environment-field modifier with slow decay. | `src/world/terrain.ts`, `src/systems/systems.ts` |
| 3.6 | Lab: toxicity/toughness heat overlay on leaf orbs; nectar/hitchhike event log entries. | `src/web/main.ts` |

**Invariants:**

- **I-PL3.1 (Paid defence).** Compound synthesis draws from the molecule economy and pool; no compound stock exists without a matching paid debit.
- **I-PL3.2 (Ledger).** Nectar payouts, toxin-modified bites, and thorn damage are conservation entries; drift holds under a defence-heavy stress config.
- **I-PL3.3 (Carrier accountability).** Carried spores = attached ∪ in-transit ∪ settled; none are lost.
- **I-PL3.4 (Bounded feedback).** Water/soil/microclimate modifiers are clamped and decay to zero when plant cover clears.

**Acceptance.** Coevolution smoke test: mean `toxicity`/`toughness` rises in grazing replicates vs. no-grazing control, and cell-side `sizeScale`/dietary distributions shift in response.

---

## Bridge B3 — Economy & Environment Hardening

**Goal.** Formalize what I3 grew ad hoc: defence/nectar compound recipes in the molecule economy, the three terrain feedbacks as proper environment fields with diffusion/decay, and a standing ledger stress harness.

**Phases.**

| Phase | Work | Files |
|---|---|---|
| B3.1 | Compound recipes: toxin, toughening agent, thorn precursor, and nectar become first-class complex-molecule recipes (cost, biosynthesis path, decay) — the cluster reserve is a molecule inventory, not a scalar. | `src/systems/systems.ts` (molecule economy), `src/world/world.ts` |
| B3.2 | Environment fields: water retention, soil fertility, microclimate become named fields in the multi-field environment with the existing decay/diffusion machinery — I1/I3 helpers become readers of the shared fields. | `src/world/terrain.ts`, `src/systems/systems.ts` |
| B3.3 | Ledger stress harness: a config matrix (grazing × defence × dispersal × feedbacks on/off) run headlessly in CI asserting conservation drift within tolerance — the regression net for I4. | `tests/`, `scripts/` |
| B3.4 | Performance: profile fields + molecule inventory at 2× cluster cap; fix hot spots before I4's competition queries land. | `scripts/`, `src/world/world.ts` |
| B3.5 | Lab: environment-field overlays (soil fertility, microclimate) in the parameters accordion style. | `src/web/main.ts` |

**Invariants:**

- **I-PLB3.1 (Recipe conservation).** Every molecule in a cluster reserve traces to a synthesis debit or scavenged input; decay is the only sink.
- **I-PLB3.2 (Field decay closure).** A world with zero plants relaxes all three feedback fields monotonically to baseline.
- **I-PLB3.3 (Stress matrix).** All harness configs pass drift tolerance; the harness runs in CI.

**Acceptance.** Stress matrix green; 2×-capacity profile within budget; overlays render.

---

## Instalment 4 — Communities & Succession

**Goal.** Zoom out to communities: spatial competition, pioneer→climax successions, plant speciation, and research-grade observables.

**Phases.**

| Phase | Work | Files |
|---|---|---|
| 4.1 | Spatial competition: `CLUSTER_MIN_SPACING` becomes competitive — a growing cluster shades/steals income from neighbours within canopy radius (via B1's index); the loser's pool drains and leaves wilt by budget. Deterministic tie-breaks by cluster id. | `src/systems/systems.ts`, `src/world/plants.ts` |
| 4.2 | Succession ratchet: pioneer genotypes (fast, cheap, high `sporeForce`) get a founder bonus on depleted soil; climax genotypes (dense, tough, slow) dominate enriched soil — emerging from I1 soil + I3 defence costs plus one small pioneer-maturation bonus. | `src/systems/systems.ts` |
| 4.3 | Plant species tracking: B2's cross-kingdom species feed a richness time series. | `src/world/lineage.ts` |
| 4.4 | Ecosystem observables: biomass, succession-stage histogram, dispersal-kernel plots; exported through the experiment framework. | `src/experiment/replication.ts`, `src/web/main.ts` |
| 4.5 | Performance: canopy queries on B1's index at 4× cluster cap; <15% median tick regression allowed. | `src/world/world.ts`, profiling script |
| 4.6 | Docs: update `docs/implementation-status.md` Part 17 row + Coverage tab. | `docs/implementation-status.md` |

**Invariants:**

- **I-PL4.1 (Canopy determinism).** Displacement resolution is a pure function of (cluster state, spatial index) — replay-stable.
- **I-PL4.2 (Succession sanity).** Pioneers favoured on depleted soil, climax on enriched — controlled-replicate allele tracking.
- **I-PL4.3 (Richness bounded).** Plant species count ≤ cluster count; extinct species ⇒ zero extant carriers.
- **I-PL4.4 (Perf budget).** 4×-cap median tick regression < 15% vs. pre-I4 baseline.

**Acceptance.** A 30k-tick, 3-replicate experiment exports biomass + richness series showing at least one pioneer→climax turnover, reproducible across seeds; the lab renders it in the existing trajectory-chart framework.

---

## Cross-cutting hardening layer — Plant Architecture Hardening (P0–P5)

> Not new instalments. This layer runs *across* I1–I4 as a discipline each unit must satisfy; the existing series stays the delivery vehicle. It splits the platform into two concurrent tracks: **Architecture (P0–P2)** and **Ecology (I1–I4)**, both feeding **Evolution (B2, I4 observables)**.

```
PLANT SYSTEM
       │
   ┌───┴─────────┐
   │             │
ARCHITECTURE  ECOLOGY
   │             │
 P0–P2        I1–I4
   │             │
   └───┬─────────┘
       ▼
   EVOLUTION
```

| Layer | Scope | How the series already satisfies it / what each unit must add |
|---|---|---|
| **P0 — Simulation Contract** | Canonical phase ordering, state ownership, deterministic commit model. | Already owned by the kernel discipline (Part 13, named RNG streams, delta-tracked state). I1.1's `plantClusters` map and every later addition must declare its delta scope. |
| **P1 — Resource Accounting** | Energy, biomass, molecules — with provenance. | I1.5 and I3's ledger wiring; B3.3's stress harness is the standing enforcement. Provenance: every molecule in a cluster reserve traces to its synthesis debit (I-PLB3.1). |
| **P2 — Organism Model** | Individual vs cluster semantics, phenotype pipeline, module contracts. | Stage A/B body depth (I1.1, B1.4); the module contract below is P2's forward commitment. |
| **P3 — Ecological Causality** | Resource competition, feedback, saturation, disturbance, succession inference. | I4.1 competition, I3.5 feedback fields, I4.2 succession. Disturbance → resource/biomass change → *existing* ecological rules → new succession: succession must emerge from the same rules, not from a dedicated succession scheduler. |
| **P4 — Evolutionary Methodology** | Statistical experiments, ablations, counterfactual replay, genotype→phenotype→fitness tracing. | I2.6 trait tracing, B2.4 interventions/allele series, B3.3 config matrix, I4 acceptance (3-replicate reproducible turnover). |
| **P5 — Future-Proof Morphology** | Root/module contracts, transport abstraction, local defence, local resource storage. | Forward commitments only — see below. Nothing ships in I1–I4 beyond the contracts. |

### P5 forward commitments (design now, build never-in-this-series)

- **Module ontology reservation.** The Part 15 surface-node architecture is strongly surface/leaf-centric. Reserve these module kinds in the body-module ontology now so roots never require a second plant architecture: `SurfaceModule`, `RootModule`, `TransportModule`, `StorageModule`, `ReproductiveModule`, `DefenceModule`. The eventual physiological architecture is leaf → light / root → water+soil / stem → transport.
- **Transport as a future slot.** Without transport, every module effectively reads a global energy pool — acceptable for Stage A, but it forecloses emergent morphology from vascular efficiency, transport-distance bottlenecks, and source/sink relations. I1's `photosynthesisInput()` and the cluster pool must be designed so a per-module ledger can replace the global pool later without changing the module contract.
- **Local defence and storage.** I3's compound reserves are cluster-global; the P5 contract keeps the reserve an inventory keyed so per-module placement can be introduced without a schema break (B3.1's molecule-inventory design is the hook).

### State-discipline rules (apply to every unit)

1. **Mechanism ownership.** Every new state variable declares: who writes it, who reads it, when it can change, which ledger accounts for it, whether it is derivable, persisted, and deterministic. Example — `soilFertility`: writer = environment feedback phase; readers = plant physiology, experiment observer; ledger = nutrient ledger; persistence = yes; update = delta map; derived = no; render = read-only. The Tables in I1–I4 already name writers/files; each unit's tests assert the declaration.
2. **No hidden state.** Every simulation-relevant variable must exist in authoritative world state or be deterministically derivable from it. No closure variables, module-local timers, renderer state, cached behavioural state, implicit counters, or un-streamed randomness — unless explicitly classified as deterministic caches. This is what keeps rollback, replay, serialization, branching, experiment comparison, and parallel execution sound (Parts 11–13 contracts).

---

## Series-wide conventions

- **P-layer compliance.** Every unit satisfies the P0–P5 obligations in its own phases (state-discipline rules above); the hardening layer is never a separate deliverable.
- **Determinism:** no wall-clock or `Math.random`; all stochasticity through named RNG streams; new world state in delta-tracked maps so rollback (K2) stays atomic — the growth-rollback lesson from the last fix cycle is the standing cautionary tale.
- **Ledger:** every new energy/molecule transfer enters the conservation ledger; a unit isn't done until the B3-style drift stress passes for its features.
- **Shared machinery:** recombination (B2), the spatial index (B1), environment fields (B3), and the gene registry are implemented *once* and consumed by both kingdoms.
- **Constants:** every tunable is an exported const in `plants.ts` or a registry gene range in `genetics.ts`.
- **Presentation:** the lab may display anything but never writes world state (§12.44).
- **Docs:** each unit updates `docs/implementation-status.md` and the Coverage tab in the same change.
- **Ordering:** state/design first, then behaviour, then tests, then lab.

## Definition of done for the series

1. Plants are heritable, energy-budgeted, molecule-defended, spatially competing organisms whose traits demonstrably respond to animal pressure.
2. Every invariant I-PL1.*–I-PL4.* and I-PLB1.*–I-PLB3.* is an automated test in `tests/` and green.
3. The lab exposes plant physiology, genes, defence overlays, field overlays, and community observables.
4. `docs/implementation-status.md` Part 17 row describes the coupled flora ecology, with the Coverage tab matching.
5. Every unit satisfies its P0–P5 obligations: state-discipline rules declared and test-asserted, module ontology reserved (P5 contracts only).
