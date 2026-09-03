# Part 11 — Master Technical Specification: Target Architecture & System Contracts

> **Status: [source]** — from the PDF export, cleaned of transcript artifacts ("next", ads, flattened diagrams). Covers specification outline sections 1–4 and establishes the contract model used by all later parts.

## 11.0 Purpose

This specification converts the preceding architectural audit into a target-state engineering contract.

The objective is not to prescribe a particular implementation language, framework, rendering technology, or deployment topology. The objective is to define the semantic boundaries, invariants, contracts, data flows, and architectural obligations that the implementation must satisfy.

The target system is:

> A deterministic, experimentally reproducible artificial-life platform in which physical dynamics, generative development, heredity, behaviour, ecology, and selection form a coupled dynamical system, while an independent scientific layer makes resulting phenomena observable, reproducible, and falsifiable.

The architecture must therefore optimize for five properties simultaneously:

1. **Causal integrity** — the simulation means what its model claims to mean.
2. **Evolutionary integrity** — variation, heredity, selection, and population dynamics form a genuine causal loop.
3. **Reproducibility** — experiments can be replayed, replicated, branched, and compared.
4. **Extensibility** — new mechanisms can be introduced without destabilizing the kernel.
5. **Scientific falsifiability** — interesting observations can be distinguished from artifacts, implementation effects, and researcher expectations.

## 11.1 Architectural North Star

The system should ultimately implement this causal structure:

```
┌───────────────────┐
│      GENOME       │
└─────────┬─────────┘
          │
          ▼
┌───────────────────┐
│    DEVELOPMENT    │
└─────────┬─────────┘
          │
          ▼
┌───────────────────┐
│ BODY / PHYSIOLOGY │
└─────────┬─────────┘
          │
          ▼
┌───────────────────┐
│     BEHAVIOUR     │
└─────────┬─────────┘
          │
┌────────┴─────────────────────────────────────┐
│                                              │
▼                                              ▼
┌───────────────┐              ┌────────────────┐
│  ENVIRONMENT  │◄────────────►│ OTHER ORGANISMS│
└───────┬───────┘              └───────┬────────┘
        │                              │
        └──────────────┬───────────────┘
                       ▼
          ┌───────────────────┐
          │ RESOURCE / ENERGY │
          │    CONSEQUENCES   │
          └─────────┬─────────┘
                    │
                    ▼
          ┌───────────────────┐
          │    REPRODUCTIVE   │
          │      SUCCESS      │
          └─────────┬─────────┘
                    │
                    ▼
          ┌───────────────────┐
          │     HEREDITY /    │
          │   RECOMBINATION / │
          │      MUTATION     │
          └─────────┬─────────┘
                    │
                    └──────────────► GENOME
```

This loop is embedded within a second loop:

```
WORLD STATE(t)
      │
      ▼
SIMULATION KERNEL
      │
      ▼
WORLD STATE(t+1)
      │
      ▼
OBSERVATIONS
      │
      ▼
ANALYSIS
      │
      ▼
EXPERIMENTAL INTERVENTION
      │
      └──────────────► WORLD
```

The first loop is **evolutionary causality**. The second is **scientific causality**. The architecture must preserve both.

## 11.2 The System-of-Systems Model

The target platform is divided into six architectural planes.

```
┌──────────────────────────────────────────────────────────────┐
│                     SCIENTIFIC PLANE                         │
│  hypotheses • experiments • replicates • analysis • results  │
├──────────────────────────────────────────────────────────────┤
│                     OBSERVATION PLANE                        │
│   metrics • events • lineage • telemetry • projections       │
├──────────────────────────────────────────────────────────────┤
│                    EVOLUTIONARY PLANE                        │
│  genetics • development • behaviour • ecology • selection    │
├──────────────────────────────────────────────────────────────┤
│                       WORLD PLANE                            │
│     organisms • resources • environment • spatial state      │
├──────────────────────────────────────────────────────────────┤
│                      KERNEL PLANE                            │
│   state transitions • laws • scheduling • RNG • time         │
├──────────────────────────────────────────────────────────────┤
│                    EXECUTION PLANE                           │
│ CPU • workers • GPU • persistence • storage • transport      │
└──────────────────────────────────────────────────────────────┘
```

These planes should not be treated merely as folders. They represent different semantic responsibilities.

## 11.3 Bounded Contexts

The target architecture defines the following bounded contexts.

### 11.3.1 Simulation Kernel

Responsible for:

- simulation time
- state transitions
- update scheduling
- deterministic execution
- random-number streams
- system ordering
- transaction/commit semantics
- numerical integration
- execution contracts

The kernel must **not** know about:

- UI
- React/DOM/canvas
- persistence implementations
- experiment dashboards
- database schemas
- analytics presentation
- worker transport
- specific evolutionary experiments

The kernel should be the most stable subsystem.

### 11.3.2 Law System

Defines the rules governing physical and environmental state transitions.

Potential laws include:

- gravity
- friction
- collision
- fluid dynamics
- energy transfer
- diffusion
- temperature
- chemical interaction
- resource regeneration
- environmental decay

A law should conceptually be:

```
LAW: observe relevant state → calculate consequences → emit/apply deterministic state changes
```

A law should **not** secretly:

- mutate unrelated domains
- query the UI
- create experimental metadata
- alter genetic state directly without an explicit causal pathway
- consume uncontrolled randomness

### 11.3.3 World

The World represents the simulated universe.

Conceptually:

```
World
├── Environment
├── SpatialIndex
├── Resources
├── Organisms
├── PopulationState
├── Time
├── RNG State
├── World Parameters
└── Model Version
```

The World must be serializable at semantic boundaries.

A world should be capable of answering: *"Given this world state, model version, configuration, and RNG state, what happens next?"*

### 11.3.4 Genetics

Genetics owns:

- genomes
- genes
- alleles
- inheritance
- recombination
- mutation
- expression
- genetic identity
- lineage relationships

Genetics should not assume that a genome directly equals behaviour. The intended architecture is:

```
Genome
  │
  ▼
Expression
  │
  ▼
Development
  │
  ▼
Phenotype
```

This allows increasingly sophisticated developmental systems later without invalidating the genetic model.

### 11.3.5 Lifecycle

Lifecycle owns biological state transitions such as:

```
BIRTH → DEVELOPMENT → MATURE → ACTIVE → REPRODUCTION → AGING → DEATH
```

Lifecycle must distinguish:

- biological existence
- physical existence
- reproductive eligibility
- developmental state
- physiological state

Death should therefore be a domain transition, not merely `entity.active = false`.

### 11.3.6 Behaviour

Behaviour converts organism state and sensed information into actions.

Conceptually:

```
SENSORS → PERCEPTION → INTERNAL STATE → DECISION / POLICY → ACTION
```

Behaviour must not directly rewrite the world. Instead:

```
Behaviour → Intent / Action → Kernel / Laws → World State
```

This preserves causal traceability.

### 11.3.7 Ecology

Ecology owns interactions among organisms and their environment. Examples:

- competition
- predation
- cooperation
- parasitism
- mating
- resource consumption
- territoriality
- population density
- niche occupancy
- ecological succession

Ecology is especially important because it allows selection to become **distributed** rather than dependent on a single explicit fitness function.

### 11.3.8 Experimentation

Experimentation defines:

- hypotheses
- initial conditions
- parameter sets
- seeds
- replicates
- interventions
- stopping conditions
- measurements
- analysis plans
- comparison groups

The Experiment becomes the fundamental unit of scientific execution.

```
Experiment
├── Replicate 1
├── Replicate 2
├── Replicate 3
└── …
```

### 11.3.9 Observation

Observation is read-only with respect to authoritative simulation state.

It produces:

- measurements
- projections
- statistics
- events
- lineage information
- spatial samples
- behavioural traces
- population summaries

Observation must never become an implicit control mechanism.

### 11.3.10 History

History owns:

- snapshots
- event streams
- lineage records
- checkpoints
- replay metadata
- branch points
- provenance

This enables:

```
Run
├── Snapshot A
│     ├── Snapshot B
│     │     ├── Branch X
│     │     └── Branch Y
│     └── Snapshot C
```

The architecture should eventually permit counterfactual experimentation: *"What would have happened if this environmental event had not occurred?"*

### 11.3.11 Execution Infrastructure

Responsible for:

- worker scheduling
- process/thread isolation
- CPU execution
- GPU execution
- distributed execution
- serialization
- persistence
- transport

It must remain subordinate to the semantic model. Execution technology should answer *"How do we execute this model efficiently?"* — not *"What does the model mean?"*

## 11.4 Dependency Direction

The target dependency graph should resemble:

```
SCIENCE
   │
   ▼
EXPERIMENT
   │
   ▼
OBSERVATION
   │
   ▼
EVOLUTIONARY WORLD
   │        │
   ┌────────┘ │ └────────┐
   ▼          ▼          ▼
GENETICS  BEHAVIOUR   ECOLOGY
   │          │          │
   └────┬─────┴────┬─────┘
        ▼          ▼
      WORLD    LIFECYCLE
        \        /
         \      /
          ▼    ▼
        KERNEL
           │
           ▼
       EXECUTION
```

The critical principle:

> Dependencies point toward more fundamental semantics, never toward presentation or infrastructure.

Therefore:

```
Renderer → Observation → Domain
```

is healthy. Whereas:

```
Domain → Renderer
```

is architecturally forbidden. Likewise `Kernel → Worker` is undesirable. Prefer `Worker → Kernel`.

## 11.5 System Contract Model

Every major subsystem should expose a contract consisting of:

```
Inputs
Outputs
State Ownership
Side Effects
Determinism Requirements
Randomness Requirements
Temporal Semantics
Failure Semantics
Serialization Semantics
Observability
```

A subsystem should be understandable without reading its implementation.

For example:

```
BehaviourSystem

INPUTS
- organism state
- sensory projection
- internal state
- simulation time
- RNG stream

OUTPUTS
- proposed actions
- behavioural events

MUTATES
- behaviour-local state only

DOES NOT MUTATE
- environment
- other organisms
- renderer
- persistence

DETERMINISM
- deterministic given identical inputs and RNG state
```

This contract-first architecture is essential for both human engineering and future agent-assisted development.

## 11.6 Authoritative State Contract

The most important state distinction in the system is:

```
AUTHORITATIVE STATE
│
├── determines future simulation
└── must be serializable
```

versus:

```
DERIVED STATE
│
├── calculated from authoritative state
└── can be reconstructed
```

and:

```
EPHEMERAL STATE
│
├── caches
├── render buffers
├── temporary allocations
└── execution artifacts
```

**Rule:** Only authoritative state may influence future authoritative state. This eliminates a huge class of hidden dependencies.

## 11.7 World State Contract

A conceptual world snapshot should contain:

```
WorldSnapshot
├── schemaVersion
├── modelVersion
├── simulationTime
├── tick
├── worldParameters
├── environmentState
├── resourceState
├── organismState[]
├── populationState
├── lineageState
├── RNGState
└── experimentContext
```

The exact storage representation may change. The semantic contents may not disappear without an explicit versioned model change.

## 11.8 Tick Contract

The tick is the fundamental causal boundary.

A target semantic tick should conceptually execute:

```
STATE(t)
   │
   ▼
READ → SENSE → DECIDE → ACT → INTERACT → RESOLVE
   → RESOURCE / ENERGY TRANSFER → PHYSIOLOGY → DEVELOPMENT
   → REPRODUCTION → INHERITANCE / MUTATION → BIRTH / DEATH
   → COMMIT
   │
   ▼
STATE(t+1)
```

Not every simulation must use precisely these phases. But the semantic ordering must be explicit.

The system must never rely on accidental JavaScript call order to define biological causality.

## 11.9 State Transition Contract

At the highest level:

```
S(t+1) = F( S(t), L, E, R(t) )
```

Where:

- `S(t)` = authoritative state
- `L` = laws/model
- `E` = experiment configuration
- `R(t)` = controlled randomness

For deterministic execution, `S(t), L, E, R(t) → F → S(t+1)` must produce the same result under the defined reproducibility level.

## 11.10 Randomness Contract

Randomness must never be an invisible global dependency. Instead:

```
Experiment Seed
      │
      ▼
Deterministic RNG
      │
      ├── genetics stream
      ├── behaviour stream
      ├── environment stream
      ├── reproduction stream
      └── experiment stream
```

This provides:

- reproducibility
- debugging
- controlled intervention
- independent replication
- easier parallelism
- causal analysis

Prefer named RNG streams over a single global random generator.

## 11.11 Determinism Contract

The platform should define three levels.

**Level A — Logical determinism:** Same seed and configuration produce the same semantic trajectory.

**Level B — Bitwise determinism:** Same seed and execution conditions produce identical serialized state.

**Level C — Statistical reproducibility:** Different valid implementations produce statistically equivalent experimental outcomes.

The architecture should strive for A universally and B where computationally practical. Level C is essential when GPU/parallel numerical differences make bitwise identity unreasonable.

## 11.12 Experiment Contract

An experiment should minimally specify:

```
Experiment
├── id
├── hypothesis
├── modelVersion
├── parameters
├── initialConditions
├── environment
├── populationDefinition
├── genomeDefinition
├── seedPolicy
├── replicateCount
├── interventionPlan
├── observationPlan
├── stoppingCriteria
└── analysisPlan
```

An experiment must be executable without the UI. **This is a hard requirement.**

## 11.13 Replicate Contract

A replicate is not merely another random run. It must preserve:

```
experiment definition + replicate identifier + seed + model version
+ configuration + initial conditions + execution metadata
```

This allows:

```
Experiment E
├── Replicate 001
├── Replicate 002
├── Replicate 003
├── Replicate 004
└── Replicate 005
```

to be analyzed as a statistical population.

## 11.14 Observation Contract

Observation must be causally downstream:

```
AUTHORITATIVE STATE
        │
        ▼
    OBSERVATION
        │
        ├── metrics
        ├── projections
        ├── events
        ├── lineage
        └── visualization data
```

The renderer should therefore consume a `VisualizationProjection` rather than `World` directly. This prevents presentation logic from becoming coupled to simulation semantics.

## 11.15 Event Contract

Events should be divided into two categories.

**Domain events** — examples: `OrganismBorn`, `OrganismDied`, `OrganismReproduced`, `GenomeMutated`, `ResourceConsumed`, `PredationOccurred`, `EnvironmentChanged`, `PopulationSplit`. These describe phenomena in the model.

**Infrastructure events** — examples: `WorkerStarted`, `CheckpointWritten`, `SimulationPaused`, `RenderFrameDropped`, `WorkerFailed`, `SnapshotUploaded`. These describe execution.

They should never be conflated.

## 11.16 History Contract

History must support at least:

```
snapshot(t)          snapshot(t+n)
replay(t → t+n)      branch(t)
compare(A, B)        lineage(entity)
```

Long-term:

```
World A
  ├── baseline continuation
  ├── intervention X
  └── intervention Y
```

This transforms historical data from passive logging into an experimental instrument.

## 11.17 Genetics Contract

The genetics subsystem must eventually support:

```
Genome
├── identity
├── loci / genes
├── regulatory information
├── structural information
└── metadata
```

with operations:

```
recombine(parentA, parentB)
mutate(genome, mutationContext)
express(genome, environment)
inherit(parentState, offspringContext)
```

Critically: **mutation must not be synonymous with evolution.** The genetics subsystem creates variation. The ecological/evolutionary system determines which variation persists.

## 11.18 Development Contract

Development should be treated as an interpreter:

```
Genome + Environment + Developmental State
            │
            ▼
    Developmental Process
            │
            ▼
        Phenotype
```

This creates the possibility of:

- modularity
- pleiotropy
- gene regulation
- developmental constraints
- indirect encoding
- morphological innovation
- evolvability

without requiring the genome to explicitly encode every final body parameter.

## 11.19 Behaviour Contract

Behaviour should be modelled as:

```
Observation + Internal State + Inherited Policy + Learning State
                    │
                    ▼
                  Decision
                    │
                    ▼
                  Action
```

Later architectures may distinguish innate behaviour, learned behaviour, developmental behaviour, social behaviour, communication, memory, and prediction. But all must preserve the causal boundary:

```
agent chooses action → world determines consequence
```

not:

```
agent chooses desired outcome → simulation grants outcome
```

## 11.20 Ecology Contract

Ecological interactions should produce real consequences. For example:

```
Predator → consumes → Prey → resource transfer
        → Predator energy → survival/reproduction
```

Likewise:

```
Organism → resource consumption → environmental depletion
        → resource scarcity → competition → selection
```

This creates the desired feedback structure.

## 11.21 Selection Contract

Selection should be explicitly classified.

**Direct selection** — the researcher defines `fitness = objective(...)`. Useful for controlled evolutionary experiments.

**Ecological selection** — fitness emerges from resource access, survival, competition, predation, mating, environmental compatibility, and offspring success. This is the preferred long-term mechanism for artificial-life experiments.

The architecture must support both without conflating them.

## 11.22 Renderer Contract

The renderer is a consumer.

It **may**: observe, interpolate, project, simplify, aggregate, visualize.

It **may not**:

- mutate authoritative state
- influence RNG
- alter simulation timing
- determine collision outcomes
- determine biological outcomes
- silently trigger simulation behaviour

A strict invariant:

> A headless run and a rendered run must have identical authoritative trajectories when executed under equivalent conditions.

## 11.23 Worker Contract

Workers should receive declarative execution requests:

```
RunRequest
├── experiment
├── seed
├── modelVersion
├── executionMode
├── checkpointPolicy
└── observationPolicy
```

and produce:

```
RunResult
├── finalState
├── observations
├── events
├── metrics
├── provenance
└── executionSummary
```

The worker should not redefine simulation semantics.

## 11.24 Persistence Contract

Persistence must store enough information to reconstruct an experiment. At minimum:

```
Model Version + Experiment Definition + Configuration + Seed
+ Initial State + Checkpoint / Event History + Observation Metadata
```

A saved simulation without its semantic version and experimental context is not a scientifically useful artifact.

## 11.25 Versioning Contract

The system needs explicit versions for:

- Model
- Schema
- Experiment
- Genome Format
- World Format
- Observation Format
- Execution Protocol

A checkpoint should never be interpreted solely by "whatever the current code happens to do."

## 11.26 Architectural Invariants

The following should become automated tests.

**Invariant 1 — Renderer independence**

```
rendering = OFF  →  same authoritative trajectory
rendering = ON   →
```

**Invariant 2 — Replay determinism**

```
same seed + same model + same initial state ⇒ same trajectory
```

**Invariant 3 — Observation purity.** Observation must not alter authoritative state.

**Invariant 4 — Persistence integrity**

```
snapshot → restore → continue
```
must produce the same future trajectory as uninterrupted execution.

**Invariant 5 — RNG reproducibility.** Saving/restoring RNG state must preserve subsequent random sequence.

**Invariant 6 — Experiment isolation.** Replicate A must not mutate state belonging to replicate B.

**Invariant 7 — Configuration isolation.** Changing presentation configuration must not alter simulation semantics.

**Invariant 8 — Execution equivalence.** Where supported: `single-thread ≈ parallel` under the defined determinism level.

**Invariant 9 — Causal locality.** A subsystem must not mutate state outside its declared ownership without an explicit contract.

**Invariant 10 — Scientific traceability.** Every reported result must be traceable to:

```
Experiment → Replicate → Seed → Model Version → Tick Range → Observation
```

## 11.27 The Target Architectural Boundary

The ultimate architecture should make the following statement true:

> The simulation engine does not know that it is being used to study evolution.

It knows: state, laws, entities, interactions, time, information, environment, reproduction mechanisms. The evolutionary phenomena emerge from those mechanisms.

Likewise:

> The scientific layer does not need to understand how every physical mechanism works.

It needs stable contracts for: initialization, execution, observation, intervention, replay, comparison, analysis.

This separation is what permits the platform to evolve from a simulation into a scientific instrument.

## 11.28 Target Repository / Module Topology

A conceptual target topology is:

```
src/
├── kernel/
│   ├── state/
│   ├── time/
│   ├── rng/
│   ├── scheduler/
│   ├── transition/
│   └── execution/
├── laws/
│   ├── physics/
│   ├── environment/
│   ├── resources/
│   └── interaction/
├── world/
│   ├── world/
│   ├── spatial/
│   ├── organisms/
│   ├── resources/
│   └── environment/
├── genetics/
│   ├── genome/
│   ├── mutation/
│   ├── recombination/
│   ├── expression/
│   └── lineage/
├── development/
│   ├── developmental-state/
│   ├── morphogenesis/
│   └── phenotype/
├── behaviour/
│   ├── sensing/
│   ├── cognition/
│   ├── policy/
│   └── action/
├── ecology/
│   ├── competition/
│   ├── predation/
│   ├── cooperation/
│   ├── reproduction/
│   └── selection/
├── experiment/
│   ├── definitions/
│   ├── initialization/
│   ├── replication/
│   ├── intervention/
│   └── execution/
├── observation/
│   ├── metrics/
│   ├── events/
│   ├── projections/
│   ├── lineage/
│   └── analysis/
├── history/
│   ├── snapshots/
│   ├── replay/
│   ├── branching/
│   └── provenance/
├── execution/
│   ├── workers/
│   ├── parallel/
│   ├── gpu/
│   └── scheduling/
├── persistence/
│   ├── checkpoints/
│   ├── storage/
│   └── serialization/
└── presentation/
    ├── renderer/
    ├── visualization/
    └── ui/
```

This is a semantic topology, not an instruction to blindly create directories. If the existing codebase can express these boundaries with fewer modules, that is preferable.

## 11.29 The Most Important Contract in the Entire System

Everything ultimately reduces to this:

```
INITIAL STATE + MODEL + EXPERIMENT + CONTROLLED RANDOMNESS
                    │
                    ▼
                SIMULATION
                    │
                    ▼
              STATE TRAJECTORY
                    │
        ┌───────────┼───────────┐
        ▼           ▼           ▼
  OBSERVATION    HISTORY    ANALYSIS
```

The simulation must not secretly depend upon:

```
UI state • render timing • database state • worker scheduling
• uncontrolled randomness • logging behaviour • browser events
```

If it does, the system ceases to be a reliable scientific model.

## 11.30 Architectural Acceptance Criterion

The target architecture should not be considered complete merely because all modules exist. It is complete when the following experiment is possible:

1. Define an experiment declaratively.
2. Select a model version.
3. Select initial conditions.
4. Select a seed policy.
5. Generate N independent replicates.
6. Run them headlessly.
7. Capture complete provenance.
8. Observe population, organism, environmental and evolutionary variables.
9. Replay an individual run.
10. Restore from checkpoint.
11. Branch from historical state.
12. Modify one causal condition.
13. Re-run the counterfactual.
14. Compare trajectories statistically.
15. Produce a reproducible result package.

And critically:

> No UI interaction is required for any of these operations.

That is the dividing line between an impressive simulation application and a genuine artificial-life research platform.

## 11.31 Part 11 Conclusion

The target architecture is therefore not fundamentally a better-organized simulation codebase. It is **a causal computational laboratory.**

- The simulation kernel provides the substrate.
- The world provides the dynamical environment.
- Genetics provides heritable information.
- Development converts information into phenotype.
- Behaviour couples organisms to their surroundings.
- Ecology couples organisms to one another.
- Selection determines which heritable configurations persist.
- History preserves trajectories.
- Observation makes phenomena measurable.
- Experimentation makes them falsifiable.
- Execution infrastructure makes the system scalable.

And the architectural boundary between these concerns makes it possible to determine whether an apparent phenomenon is actually produced by the model rather than by an accidental property of the implementation.

The central system contract is therefore:

```
MECHANISMS
    ↓
CAUSAL DYNAMICS
    ↓
STATE TRAJECTORY
    ↓
OBSERVABLE PHENOMENA
    ↓
REPLICABLE EXPERIMENT
    ↓
FALSIFIABLE CLAIM
```

The next section descends one level deeper: [Part 12 — Domain Model, State Architecture & Canonical Data Contracts](12-domain-model-and-state-architecture.md).
