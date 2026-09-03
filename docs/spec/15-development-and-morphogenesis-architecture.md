# Part 15 — Development & Morphogenesis Architecture

> **Status: [filled-in]** — Part 15 of the Master Technical Specification. The source PDF does not contain this part; it is written against the outline sections the document enumerates ([outline §8](00-outline.md)), the contracts it must implement (11 §11.18), and the domain model it must realize (12 §§12.8–12.11, 12.36 lifecycle). The [ProtoEvo mapping](../reference/protoevo-to-nu-mapping.md) §§2.1–2.2 supply the reference mechanisms: surface-node phenotype modules and regulation/effector decoupling for exaptation.

## 15.0 Scope and dependencies

Part 15 specifies **development**: the interpreter that turns genome + environment + developmental state into phenotype.

Depends on: 11 §11.18 (development contract), 12 §§12.8 (genome→phenotype separation), 12.9 (phenotype = f(genome, environment, developmental history)), 12.10–12.11 (developmental state, phenotype architecture); genetics outputs from [Part 14](14-genetics-and-heredity-architecture.md) (construction requests, §14.3).

The contract, restated from §11.18:

```
Genome + Environment + Developmental State
            │
            ▼
    Developmental Process
            │
            ▼
        Phenotype
```

## 15.1 Development as interpreter

Development is a **process with state**, not a function evaluated once at birth (§12.10). Canonical state:

```
DevelopmentState
├── stage               — named lifecycle stage (embryonic, juvenile, mature, senescent)
├── developmentalClock  — ticks in development, independent of age
├── regulatoryState     — current expression levels per regulatory channel
├── morphologyState     — constructed phenotype modules and their maturity
├── constructionQueue   — pending construction requests (from Part 14 express)
└── completionStatus    — open | canalized (fixed) | complete
```

Rules:

- **D1 (Continuous development).** Development runs every tick while `completionStatus = open`, driven by the organism's own regulatory state and local environment — not only at birth.
- **D2 (Environmentally responsive).** The same genome in different environments may produce different phenotypes (§12.9, Test B plasticity). Environmental reads during development come from the organism's sensory interface, never from raw world state (§12.22).
- **D3 (Canalization is a domain transition).** A module's maturity reaching `canalized` is a lifecycle event; canalized morphology no longer consumes maintenance resources at construction rates.

## 15.2 Phenotype modules (the surface-node model)

The phenotype is a set of **modules** attached to the organism (§12.11), adopted from ProtoEvo's surface nodes (mapping §2.1):

```
PhenotypeModule
├── moduleId          — instance identity
├── moduleType        — sensory | actuation | adhesion | feeding | signalling | ...
├── regulatoryBinding — which regulatory channel drives this module
├── constructionCost  — paid at build time (14.3, G7)
├── maintenanceCost   — per-tick physiological cost
├── maturity          — growing | mature | canalized
└── geometry          — placement/bearing, for spatial phenotype
```

Rules:

- **M1 (Modules are constructed, not configured).** A module exists only after its construction cost is paid from organismal resources. Unpaid requests expire as domain events (Part 14 G8).
- **M2 (Regulation and effector are decoupled layers).** The regulatory binding is stored *on the module*, so mutation can rebind a pathway to a different module type without inventing new control structure — the exaptation mechanism (mapping §2.2). A movement pathway may become an adhesion pathway by rebinding, not by redesign.
- **M3 (Module types are a registry, not an enum in the kernel).** The kernel knows nothing about specific module types; only the developmental and behavioural systems interpret them (Part 13's separation: kernel = state/laws, not semantics).

## 15.3 Morphogenesis pipeline

Per tick, the developmental system executes:

```
1. READ     regulatory state + local environment (sensory interface)
2. SCHEDULE pick from constructionQueue per DEVELOPMENT layer priority
3. PAY      deduct construction cost; on failure → ExpressionFailed event
4. GROW     mature modules accumulate maturity; apply maintenance costs
5. EXPRESS  write module effects into phenotype state (speed, senseRadius, ...)
```

Kernel integration:

| Concern | Phase | Stream | Writes |
|---|---|---|---|
| Steps 1–2, 4 | UPDATE | — (deterministic order) | `organism.phenotype.*`, `organism.energy` (maintenance) |
| Step 3 | UPDATE | — | `organism.energy`, `organism.phenotype.modules` (add), events |
| Step 5 | UPDATE | — | `organism.phenotype.*` |

Boundary invariants:

- **I15-A.** Development never draws from an RNG stream unless the experiment declares developmental stochasticity; when it does, draws come from `genetics` and are fixed-point per organism (K4).
- **I15-B.** Phenotype is derivable from (genome, environment history, developmental history). Checkpoints store developmental state; they do not need to store a separate "phenotype cache."
- **I15-C.** Two organisms with the same genome and same developmental history in the same environment produce identical phenotypes; different environments may diverge them (plasticity without nondeterminism).

## 15.4 Development and lifecycle

Development integrates with the lifecycle machine (§12.36):

```
DEVELOPING → ACTIVE (canalization complete or maturity threshold)
ACTIVE     → DEVELOPING (new module construction opens — optional model)
ACTIVE     → DYING → DEAD (ecology plane, Part 17)
```

- **D4 (Birth is development's exit, not a clock).** An organism becomes `ACTIVE` when its developmental process reaches a genome-defined completion condition, not at a fixed age. The current implementation's age-based maturity is the stage-0 approximation; the interface (lifecycle transition events) is identical.

## 15.5 What Part 15 forbids

- No direct genome→phenotype mapping (`genome.speed → organism.speed`) outside the interpreter — that is the §12.8 anti-pattern and it forecloses pleiotropy, modularity, and evolvability.
- No module construction without resource payment (breaks §12.20 feedback).
- No kernel awareness of module semantics (breaks §11.27's boundary: the engine does not know it is simulating biology).
- No phenotype fields that encode desired outcomes (§12.46): modules have costs and capabilities, never `quality` or `fitness`.
