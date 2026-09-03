# Part 17 — Ecology & Environment Architecture

> **Status: [filled-in]** — Part 17 of the Master Technical Specification. The source PDF does not contain this part; it is written against the outline sections the document enumerates ([outline §10](00-outline.md)), the contracts it must implement (11 §§11.3.7, 11.20), and the domain model it must realize (12 §§12.13–12.15, 12.19–12.20). The [ProtoEvo mapping](../reference/protoevo-to-nu-mapping.md) §§2.4–2.5 supply the reference mechanisms: death-as-resource-redistribution and the information-bearing environment.

## 17.0 Scope and dependencies

Part 17 specifies the **ecological plane**: the environment as a first-class evolving entity, resources, interactions between organisms, and the population/lineage aggregates that make ecology measurable.

Depends on: 11 §11.20 (ecology contract), 11 §11.21 (selection contract — consumed, not implemented here), 12 §§12.13 (environment model), 12.14 (resource model), 12.15 (population model), 12.16 (lineage), 12.19 (interaction model), 12.20 (energy model); intents from [Part 16](16-behaviour-and-agent-architecture.md) and phenotype costs from [Part 15](15-development-and-morphogenesis-architecture.md) are what ecology resolves.

The contract, restated from §11.20:

```
Organism → resource consumption → environmental depletion
        → resource scarcity → competition → selection
```

Interactions must produce **real consequences** with **real feedback**.

## 17.1 The environment is a first-class entity

The environment is state that evolves (§12.13):

```
Environment(t+1) = G(Environment(t), Organisms(t), ExternalForces)
```

Canonical structure:

```
Environment
├── geometry          — bounds, obstacles, regions
├── fields            — scalar/vector fields: chemical, temperature, light
├── resources         — patches and their dynamics (17.2)
├── hazards           — regions with energetic/lethal consequences
├── dynamics          — pulse/diffusion/decay processes (declared, deterministic)
└── regeneration      — inflow processes per resource type
```

Rules:

- **E1 (Fields are authoritative, indexed views are derived).** Field values are authoritative state; any spatial acceleration structure over them is derived and rebuildable (§12.12 discipline extended to fields).
- **E2 (Fields carry information).** Emitted chemicals (resources, signals, corpses) enter fields and diffuse/decay by declared dynamics — the ProtoEvo pheromone mechanism (mapping §2.5). Organisms perceive fields only through the sensory interface (Part 16 B1), making gradient-following an evolvable strategy rather than a built-in.
- **E3 (Dynamics are declared systems).** Every environmental process (diffusion, decay, pulses, regeneration) is a system with a declared contract, phase, and — where stochastic — a named stream (`environment`), drawing at fixed points (K4/K5). No hidden environmental randomness.
- **E4 (Niche construction is permitted, not special-cased).** When organism actions write to fields or resources (consumption, emission, corpse deposition), the environment evolves because of organisms — G above — without any component named "niche construction."

## 17.2 Resources and conservation

Resources are explicit entities with explicit dynamics (§12.14):

```
ResourcePatch { quantity, location, regenerationRate, capacity, depletionState }
```

Rules:

- **R1 (Consumption is a resolved transfer, not a read).** Consumption intents (Part 16) are resolved against patch state in deterministic order with conservation capping — the current `ResolutionSystem` pattern: total depletion ≤ quantity, one feeding event per consumer per tick, every transfer emits `ResourceConsumed`.
- **R2 (Conservation).** Resource quantity never goes negative; inflow is bounded by capacity. Energy entering organisms is accounted; energy leaving organisms (corpses) returns to the environment (17.3). The books balance.
- **R3 (Multi-resource ready).** The patch model generalizes to multiple resource types (mass/energy/molecules, mapping §2.3); the delta scopes are namespaced per type (`resource.<type>.quantity`). The current single-type implementation is the stage-0 instance.

## 17.3 Death is an ecological process

Adopted from ProtoEvo (mapping §2.4): death transitions resources; it does not delete them.

Rules:

- **E5 (Death is a domain transition with material consequences).** `OrganismDied` is emitted by the physiology system; the corpse-formation process converts the organism's remaining energy into a resource patch (with type and quantity per model). The current implementation's `corpseEnergyFraction` is the stage-0 parameter of this process.
- **E6 (Corpses are ordinary resources).** Corpse patches use the same resource model and dynamics as any other patch — scavenging niches emerge from the accounting, not from special cases.

## 17.4 Interactions

Interactions are recorded facts (§12.19):

```
Interaction { interactionId, tick, initiator, recipient, interactionType,
              location, inputs, consequences, transfer }
```

Rules:

- **I1 (Interactions are events, not side effects).** Every resolved interaction between organisms — predation, competition, mating, cooperation, collision — emits its canonical event with both parties and the transfer, enabling causal analysis after the fact.
- **I2 (Predation is consumption between organisms).** A predator's feeding action resolves against a prey organism's energy/state using the same transfer machinery as resource consumption; there is no bespoke "kill" pathway. What differs is the target's response (damage, death), which is ordinary domain consequence.
- **I3 (Competition is emergent).** Two organisms depleting the same patch *are* competing; the interaction record is the pair of consumption events plus the scarcity outcome. No component computes a "competition score."

## 17.5 Population and lineage aggregates

Population is a domain-level aggregate (§12.15), and lineage is its historical backbone (§12.16, Part 14 G12–G13):

```
PopulationStatistics
├── size, birthRate, mortality
├── geneticStatistics   — diversity, mean pairwise genome distance
├── phenotypeDistribution
└── lineageDistribution — founder shares, surviving lineages
```

Rules:

- **P1 (Aggregates are observations).** Population statistics are computed by observation systems from authoritative state; they are derived, never authoritative, and never consulted by the simulation's causal path (Invariant 3).
- **P2 (Lineage closes the loop).] Death writes `deathTick` on lineage nodes (Part 14), so lineage fitness — descendants per founder — is measurable without touching the live simulation.

## 17.6 Kernel integration

| Concern | Phase | Stream | Writes |
|---|---|---|---|
| Field dynamics (diffusion/decay) | RESOLVE | `environment` | `field.*` |
| Resource regeneration | RESOLVE | — | `resource.quantity` |
| Pulses / external forcing | RESOLVE | `environment` | `resource.quantity`, `field.*` |
| Consumption resolution | RESOLVE | `environment` | `resource.quantity`, `organism.energy` |
| Corpse formation | UPDATE | — | `resource` (add) |
| Predation/mating resolution | RESOLVE | `environment` | `organism.energy`, events |

Boundary invariants:

- **I17-A (Conservation).** Summed energy (organisms + resources, converted at declared rates) changes only by declared inflows/outflows; a 10,000-tick run with corpses enabled shows no drift beyond float tolerance.
- **I17-B (Deterministic environment).** Two runs with the same seed produce identical field and resource trajectories tick by tick (Invariant 2 applied to the environment).
- **I17-C (Ecology without observers).** Disabling all observation systems changes nothing in the trajectory.

## 17.7 The feedback structure, end to end

Assembled from Parts 14–17:

```
ENVIRONMENT (fields, resources, dynamics)          [Part 17]
      ↓  observations                ↑  consumption, emission, corpses
SENSING → POLICY → ACTION INTENTS   [Part 16]
      ↓ resolved by
PHYSIOLOGY  (energy = intake − costs)              [Part 15 costs, 17 accounting]
      ↓ surplus + maturity
REPRODUCTION → MUTATION → OFFSPRING               [Part 14]
      ↓ lineage
SELECTION = who leaves descendants                 [§11.21, measured not stored]
      ↓
ENVIRONMENT(t+1) = G(Environment(t), Organisms(t)) [niche construction, E4]
```

No arrow may be replaced by a lookup of a stored fitness, and no arrow may skip the world's resolution steps. That is the whole content of §11.20–11.21 expressed as plumbing.
