# Part 18 — Evolution / Selection Architecture

> **Status: [filled-in]** — Part 18 of the Master Technical Specification. The source PDF does not contain this part; it is written against the outline sections the document enumerates ([outline §11](00-outline.md)), the contracts it must implement (11 §11.21, 12 §12.46), and the lineage/population machinery of [Part 14](14-genetics-and-heredity-architecture.md) and [Part 17](17-ecology-and-environment-architecture.md). The [ProtoEvo mapping](../reference/protoevo-to-nu-mapping.md) §3 and study §22 supply the guiding constraint: selection pressure comes from the ecology, never from a researcher's objective.

## 18.0 Scope and dependencies

Part 18 specifies the **selection plane**: how persistence of heritable configurations is *measured* and how direct (objective-defined) selection is supported *without* contaminating ecological selection.

Depends on: 11 §11.21 (selection contract), 11 §11.26 (invariants), 12 §12.15 (population), 12 §12.46 (data-model principle); lineage (Part 14 §§14.5, G12–G13), ecology (Part 17), genetics (Part 14).

The contract, restated from §11.21:

> **Ecological selection** — fitness emerges from resource access, survival, competition, predation, mating, environmental compatibility, and offspring success. This is the preferred long-term mechanism.
>
> **Direct selection** — the researcher defines `fitness = objective(...)`. Useful for controlled experiments.
>
> The architecture must support both **without conflating them**.

## 18.1 Selection is measurement, not mechanism

The decisive architectural move (§12.46): there is **no fitness field** anywhere in authoritative state. Selection is what happened, computed from records:

```
SELECTION = who left descendants          ← lineage (14.5)
          = who survived how long         ← lifecycle records
          = who reproduced when           ← reproduction events
          = under what ecology            ← interaction/environment history
```

Rules:

- **S1 (No stored fitness).** No organism, genome, or lineage record may carry `fitness`, `score`, or any researcher-intent field (§12.46, Test-level enforced). All selection observables are post-hoc projections over lineage + event history.
- **S2 (Ecological selection needs no code).** With direct selection disabled, the only force on allele frequencies is the ecology of Parts 15–17. The selection plane contributes *nothing* to the causal path — its absence must be undetectable in the trajectory.
- **S3 (Direct selection is an additive system).** Objective selection is implemented as an additional system with a declared contract (e.g. culling below an objective, or fecundity boost). It is enabled per experiment, appears in the schedule (K5), writes only through declared deltas, and is logged as an intervention (`SelectionApplied` events) so its influence is auditable.
- **S4 (Conflation is detectable).** A run's provenance records whether any direct-selection system was active; results from mixed regimes must be labeled as such (§11.24 provenance, §11.30 step 15).

## 18.2 Lineage fitness observables

Measured from lineage + events (all derived, P1):

```
LineageObservable
├── descendants          — count of offspring reaching reproduction
├── lineageSurvival      — ticks between founder birth and last descendant death
├── founderShare(t)      — fraction of live population per founder lineage
├── reproductionVariance — variance of offspring counts (selection intensity proxy)
└── extinctionTicks      — when a lineage's last member died
```

The null model's hypothesis (`config.ts`) is evaluated with exactly these observables: under neutral conditions founderShare should drift; under ecological selection it should shift toward energy-efficient phenotypes.

## 18.3 Kernel integration

| Concern | Phase | Stream | Writes |
|---|---|---|---|
| Direct selection (optional) | RESOLVE or UPDATE (declared) | per contract | `organism.energy`, `organism.lifecycle`, `SelectionApplied` events |
| Lineage bookkeeping | INHERIT (birth) / UPDATE (death close) | — | `lineage` (add, close) |
| Observables | OBSERVE (observation systems only) | — | none (projections) |

Boundary invariants (testable per §13.19):

- **I18-A (No-fitness-field).** Serializing the world at any tick and searching the state finds no fitness/score field on any entity.
- **I18-B (Lineage monotonicity).** Every organism born has a lineage node; every organism that dies has its node closed with `deathTick`. (Founder share sums to 1 over live organisms at every tick.)
- **I18-C (Neutral drift is possible).** With mutation rate 0 and uniform founder genomes, founder shares perform an unbiased random walk — the null model for "selection did nothing."
- **I18-D (Direct selection is visible).** Runs with a direct-selection system active carry `SelectionApplied` events; runs without it carry none.

## 18.4 Multicellularity hooks (forward reference)

The spec outline's §26 (open-ended evolution) needs group-level selection. Per the ProtoEvo mapping §2.6, the required primitives are adhesion + resource sharing + signalling — all genetics/ecology mechanisms. Part 18 adds only the measurement layer: **group observables** (collective size, resource-flow asymmetry, node-type divergence within collectives) computed the same way as individual lineage observables. No group-fitness field, ever.
