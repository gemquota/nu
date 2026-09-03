# Part 12 — Master Technical Specification: Domain Model, State Architecture & Canonical Data Contracts

> **Status: [source]** — from the PDF export, cleaned of transcript artifacts. Covers specification outline section 5 (simulation state model / canonical data contracts).

Part 11 established the architectural boundaries and system contracts. Part 12 now defines the thing those boundaries operate upon: **the canonical domain model.**

The central requirement is that the simulation must have one coherent answer to:

> What exists, what state does it possess, who owns that state, how can it change, and what information is required to reproduce that change?

If those questions are ambiguous, every higher-level property — evolution, ecology, emergence, determinism, experimentation — eventually becomes ambiguous as well.

## 12.1 Canonical Domain Model

The target domain can be represented as:

```
UNIVERSE
│
├── MODEL
│     ├── Laws
│     ├── Rules
│     ├── Parameters
│     └── Version
│
├── WORLD
│     ├── Environment
│     ├── Resources
│     ├── Spatial State
│     └── World Processes
│
├── POPULATIONS
│     └── ORGANISMS
│           ├── Identity
│           ├── Genome
│           ├── Development
│           ├── Phenotype
│           ├── Physiology
│           ├── Behaviour
│           ├── Internal State
│           ├── Reproductive State
│           └── Lineage
│
├── INTERACTIONS
│     ├── Organism ↔ Organism
│     ├── Organism ↔ Environment
│     └── Organism ↔ Resource
│
└── HISTORY
      ├── Events
      ├── Snapshots
      ├── Lineages
      └── Branches
```

Above this sits:

```
EXPERIMENT
    └── RUN
          └── WORLD
```

This distinction is important. An Experiment is not a World. A world is a particular simulated universe. An experiment is the scientific specification under which one or more worlds are generated and observed.

## 12.2 Entity Taxonomy

The domain should distinguish five fundamentally different kinds of things.

### 12.2.1 Entities

Things with persistent identity. Examples: organism, population, resource patch, world, experiment, lineage. They possess stable identifiers.

### 12.2.2 Value Objects

Things defined entirely by their value. Examples:

```
Vector2 • Vector3 • Energy • Temperature • GenomeHash • Position
• Velocity • Time • Age • MutationRate
```

They do not require independent identity.

### 12.2.3 Components

State attached to an entity. For example:

```
Organism
├── TransformComponent
├── PhysicsComponent
├── GenomeComponent
├── PhysiologyComponent
├── BehaviourComponent
└── ReproductionComponent
```

Components should represent state and semantic capability, not arbitrary service containers.

### 12.2.4 Systems

Processes that transform state. Examples:

```
PhysicsSystem • DevelopmentSystem • BehaviourSystem
• EcologySystem • ReproductionSystem • MutationSystem
```

A system answers: *Given this state, what transition should occur?*

### 12.2.5 Events

Immutable descriptions of things that occurred:

```
OrganismBorn • ResourceConsumed • MutationOccurred
• OrganismDied • EnvironmentChanged
```

Events are historical facts, not commands.

## 12.3 Identity Architecture

Every persistent domain entity should have an identity that is independent of array position, memory address, or UI index.

Conceptually:

```
EntityId
├── namespace
├── localId
└── generation/version metadata
```

For example:

```
world:7f8…    organism:92a…    lineage:1bc…    experiment:42e…
```

The exact identifier encoding is implementation-specific. The semantic requirements are not.

**Requirements.** An ID must:

- remain stable during an entity's lifetime
- survive serialization
- survive checkpoint restoration
- remain distinguishable from other entities
- not depend on rendering order
- not depend on array index

## 12.4 Organism Identity

An organism should be distinguished from its genome. This is critical.

```
Organism A
│
├── organismId = 1827
└── genomeId   = genome-7f91
```

Two organisms may have different organism IDs and the same or equivalent genome. Likewise, a lineage may contain many genetically distinct genomes. Therefore:

```
Organism ≠ Genome ≠ Lineage
```

These three concepts must never collapse into one identifier.

## 12.5 Organism State

The conceptual organism model is:

```
Organism
│
├── Identity
├── Lineage
├── Genome Reference
├── Developmental State
├── Phenotype
├── Transform
├── Physics State
├── Physiology
├── Energy / Resources
├── Sensors
├── Behaviour State
├── Reproductive State
├── Age
└── Lifecycle State
```

A useful canonical abstraction is:

```
OrganismState
├── identity
├── ancestry
├── genome
├── development
├── phenotype
├── physiology
├── behaviour
├── reproduction
├── spatial
└── lifecycle
```

Not all of these need to be stored together physically. They are a semantic aggregate, not necessarily a memory-layout prescription.

## 12.6 Lifecycle State Machine

The organism lifecycle should be explicit. A conceptual state machine:

```
┌──────────────┐
│   CREATED    │
└──────┬───────┘
       │
       ▼
┌──────────────┐
│ DEVELOPMENT  │
└──────┬───────┘
       │
       ▼
┌──────────────┐
│  JUVENILE    │
└──────┬───────┘
       │
       ▼
┌──────────────┐
│    MATURE    │
└──────┬───────┘
   ┌───┴────────┐
   ▼            ▼
┌──────────────┐  ┌──────────────┐
│ REPRODUCING  │  │    AGING     │
└──────┬───────┘  └──────┬───────┘
       │                 │
       └────────┬────────┘
                ▼
         ┌──────────────┐
         │     DEAD     │
         └──────────────┘
```

The exact states may evolve. The important requirement is that lifecycle transitions have explicit semantics.

## 12.7 Genome Model

The genome is not merely a JavaScript object containing random numbers. It is the system's heritable information substrate.

Conceptually:

```
Genome
│
├── GenomeIdentity
├── ParentReferences
├── Chromosomal / Structural Data
├── Functional Genes
├── Regulatory Information
├── Developmental Instructions
├── Behavioural Parameters
└── Mutation Metadata
```

A future genome may therefore contain multiple representational layers:

```
GENOME
├── STRUCTURE
├── REGULATION
├── DEVELOPMENT
├── PHYSIOLOGY
├── BEHAVIOUR
└── REPRODUCTION
```

The architecture should not require all of these initially. It should simply avoid preventing them later.

## 12.8 Genome → Phenotype Separation

The canonical causal chain is:

```
Genome → Expression → Development → Phenotype
```

not:

```
Genome → direct body parameters
```

The second approach can be useful for an early prototype. But the architecture must permit the first. Why? Because developmental processes create evolutionary phenomena that direct parameter mutation cannot reproduce naturally:

- developmental constraints
- pleiotropy
- modularity
- gene regulation
- indirect encoding
- canalization
- robustness
- evolvability

## 12.9 Genotype and Phenotype

The system must preserve the distinction:

```
GENOTYPE  = heritable information
```

versus:

```
PHENOTYPE = expressed organismal state
```

Phenotype may include:

```
Morphology • Physiology • Behavioural tendencies • Metabolism
• Sensory capability • Actuator capability • Developmental state
```

The same genome may produce different phenotypes under different environmental conditions. Therefore:

```
Phenotype = f(Genome, Environment, DevelopmentalHistory)
```

This is a foundational requirement for later ecological and developmental evolution.

## 12.10 Developmental State

Development should maintain explicit state. Conceptually:

```
DevelopmentState
├── stage
├── age
├── developmentalClock
├── regulatoryState
├── morphologyState
├── tissue/structureState
└── completionStatus
```

Development should be capable of being:

- continuous
- multi-stage
- environmentally responsive
- partially stochastic
- genetically constrained

without requiring the genome itself to encode the entire final structure.

## 12.11 Phenotype Architecture

Phenotype should be treated as a potentially structured object:

```
Phenotype
│
├── Morphology
│     ├── body structure
│     ├── appendages
│     └── geometry
├── Physiology
│     ├── metabolism
│     ├── energy
│     └── homeostasis
├── Sensory System
│     ├── vision
│     ├── chemical
│     ├── mechanical
│     └── environmental
└── Actuation
      ├── movement
      ├── manipulation
      └── communication
```

This creates a pathway toward genuinely evolvable bodies.

## 12.12 Spatial State

Spatial state should be separated from semantic identity. An organism may have:

```
SpatialState
├── position
├── velocity
├── acceleration
├── orientation
├── angularVelocity
└── bounds
```

The spatial index is not authoritative. For example, `Organism.position` is authoritative; `SpatialHash.cells` is derived infrastructure. The latter must be reconstructible.

## 12.13 Environment Model

The environment must become a first-class entity. Conceptually:

```
Environment
│
├── Geometry
├── Fields
│     ├── temperature
│     ├── light
│     ├── chemical
│     └── pressure
├── Resources
├── Hazards
├── Boundaries
├── Environmental Dynamics
└── Regeneration Processes
```

The environment is not a static background. It should potentially evolve:

```
Environment(t+1) = G(Environment(t), Organisms(t), ExternalForces)
```

This is what permits niche construction and ecological feedback.

## 12.14 Resource Model

Resources should be explicit entities or fields. Examples:

```
Food • Water • Energy • Nutrients • Light • Chemical substrates
• Shelter • Space
```

Resource state may include:

```
Resource
├── quantity
├── location
├── regenerationRate
├── accessibility
├── diffusionRate
└── depletionState
```

Resource consumption should create actual state changes.

## 12.15 Population Model

A population is not merely `organisms.filter(...)`. It is a domain-level aggregate. Conceptually:

```
Population
├── populationId
├── members
├── lineage
├── demographicState
├── reproductiveState
├── geneticStatistics
└── ecologicalStatistics
```

Population-level derived metrics can include:

- population size
- mean genome distance
- diversity
- mortality
- birth rate
- reproductive variance
- phenotype distribution
- lineage distribution

## 12.16 Lineage Model

Lineage should be a first-class historical structure. Conceptually:

```
Ancestor
├── Child A
│     ├── Grandchild A1
│     └── Grandchild A2
└── Child B
      └── Grandchild B1
```

A lineage node should record:

```
LineageNode
├── organismId
├── parentIds
├── offspringIds
├── birthTick
├── deathTick
├── genomeReference
└── ancestry metadata
```

This enables:

- phylogenetic analysis
- lineage fitness
- evolutionary transitions
- population bottleneck analysis
- ancestry reconstruction

## 12.17 Reproduction Model

Reproduction should be an explicit domain process. Conceptually:

```
Parent Selection
      ↓
Mating / Reproductive Interaction
      ↓
Gamete / Genetic Contribution
      ↓
Recombination
      ↓
Mutation
      ↓
Offspring Genome
      ↓
Development
      ↓
Birth
```

The offspring should not simply be `clone(parent)` unless cloning is the explicit model.

## 12.18 Mutation Model

Mutation should be represented as an explicit transformation:

```
Genome(t) + MutationContext
        ↓
   MutationOperator
        ↓
     Genome(t+1)
```

Mutation types should eventually include:

```
Parameter mutation • Gene mutation • Deletion • Duplication
• Insertion • Inversion • Recombination • Regulatory mutation
• Structural mutation • Developmental mutation
```

Each should be independently measurable. This allows experiments such as: *does structural mutation produce qualitatively different evolutionary trajectories from parameter mutation?*

## 12.19 Interaction Model

Interactions should be explicit enough to support causal analysis. Conceptually:

```
Interaction
├── interactionId
├── tick
├── initiator
├── recipient
├── interactionType
├── location
├── inputs
├── consequences
└── energy/resource transfer
```

Examples:

```
Predation • Competition • Mating • Cooperation • Collision
• Communication • ResourceConsumption
```

This becomes extremely valuable for ecological analysis.

## 12.20 Energy Model

If organisms are expected to evolve meaningful behaviour, energy/resource accounting should eventually become explicit. A minimal conceptual model:

```
Energy(t+1) = Energy(t)
            + intake
            − basalCost
            − movementCost
            − interactionCost
            − reproductionCost
```

The exact biological realism is configurable. The architectural principle is:

> Organismal actions should have consequences that feed back into survival and reproduction.

This is much more powerful than manually assigning fitness to desired behaviour.

## 12.21 Internal State

An organism may require internal state beyond observable phenotype. Examples:

```
InternalState
├── hunger
├── fatigue
├── stress
├── memory
├── learned associations
├── reproductive drive
└── internal predictions
```

Not all simulations need these. But the model should allow them without redefining the organism architecture.

## 12.22 Sensor Model

Sensors should produce observations, not direct world access. Conceptually:

```
WORLD STATE
     ↓
SENSORY INTERFACE
     ↓
   PERCEPTION
     ↓
AGENT INTERNAL REPRESENTATION
```

This distinction matters enormously. An organism with omniscient access to world state is not equivalent to one with limited local sensory information. Partial observability can itself create evolutionary pressure.

## 12.23 Action Model

Behaviour should generate actions/intents. For example:

```
Action
├── actorId
├── actionType
├── target
├── magnitude
├── direction
└── duration
```

The action is a proposal. The world determines whether it succeeds. Example:

```
MOVE_FORWARD → Physics → collision → actual displacement
```

rather than:

```
MOVE_FORWARD → position += desiredDistance
```

This preserves environmental resistance.

## 12.24 Authoritative / Derived / Ephemeral State Matrix

Every state field should eventually be classified:

| State | Classification |
|---|---|
| Organism position | Authoritative |
| Organism velocity | Authoritative |
| Genome | Authoritative |
| Energy | Authoritative |
| Lifecycle state | Authoritative |
| Environment quantity | Authoritative |
| Spatial hash | Derived |
| Render mesh | Derived |
| UI selection | Ephemeral |
| Cached neighbourhood | Derived |
| Debug overlay | Ephemeral |
| Population histogram | Derived |
| RNG state | Authoritative |
| Render interpolation | Ephemeral |
| Serialized snapshot | Representation of authoritative state |

This classification should become part of the development specification.

## 12.25 Canonical State Object

A conceptual world state could therefore resemble:

```
WorldState
│
├── metadata
│     ├── worldId
│     ├── modelVersion
│     ├── schemaVersion
│     └── simulationTime
├── environment
├── resources
├── organisms
├── populations
├── lineages
├── interactions
├── rng
└── globalState
```

This does not mean the runtime should literally contain one enormous nested object. In fact, a high-performance implementation probably should not. The semantic model and physical memory layout should be allowed to diverge.

## 12.26 Semantic Model vs Runtime Representation

This distinction is fundamental.

**Semantic model** — what the simulation means:

```
Organism • Genome • Environment • Population • Interaction
```

**Runtime representation** — how the computer stores it:

```
Typed arrays • Sparse arrays • SoA buffers • Spatial grids
• Worker-local structures • GPU buffers
```

Therefore:

```
SEMANTIC MODEL → EXECUTION REPRESENTATION → HARDWARE
```

rather than allowing hardware constraints to silently define the scientific model.

## 12.27 Data-Oriented Representation

For large populations, the runtime may eventually use:

```
positionsX[]  positionsY[]
velocityX[]   velocityY[]
energy[]      age[]      populationId[]
genomeRefs[]  lifecycleState[]
```

rather than:

```
organisms[] = [ { position:…, velocity:…, energy:…, … } ]
```

The latter is often easier to reason about. The former can be dramatically more efficient. The architecture should support both through an abstraction boundary.

## 12.28 State Ownership

Each state category should have an owner. Example:

```
PhysicsState       owner → PhysicsSystem
GenomeState        owner → Genetics
DevelopmentState   owner → DevelopmentSystem
BehaviourState     owner → BehaviourSystem
EnvironmentState   owner → EnvironmentSystem
```

Ownership means: *this subsystem is responsible for defining valid transitions of this state.* It does not necessarily mean only one function can ever access the data.

## 12.29 Mutation Authority

The architecture should establish a strict principle:

> Systems may read broadly but should mutate narrowly.

For example:

```
BehaviourSystem
  READ:  organism sensory projection, environment projection
  WRITE: behaviour state, action buffer
```

It should not directly write:

```
environment.resources • otherOrganism.energy
• population.members • renderer.state
```

Those changes belong to downstream systems that own them.

## 12.30 Transactional Tick Model

A strong target architecture is:

```
STATE_t
  ├── read
  ├── generate intents
  ├── resolve interactions
  ├── calculate changes
  └── commit
      │
      ▼
   STATE_t+1
```

This reduces hidden ordering dependencies. An implementation may use buffers:

```
CurrentState • PendingChanges • Events • NextState
```

The exact mechanism is flexible. The semantic property is not.

## 12.31 State Transition Ownership Graph

A useful mental model is:

```
        ┌──────────────┐
        │    CURRENT   │
        │  WORLD STATE │
        └──────┬───────┘
               │
      ┌────────┼────────┐
      ▼        ▼        ▼
   Physics  Behaviour Ecology
      │        │        │
      └────┬───┴───┬────┘
           ▼       ▼
       Effects  Interactions
           │       │
           └───┬───┘
               ▼
          Resolution
               │
               ▼
           Next State
```

This is the foundation for deterministic parallelization later.

## 12.32 Canonical Event Schema

A domain event should minimally contain:

```
Event
├── eventId
├── eventType
├── worldId
├── tick
├── timestamp
├── actorIds
├── targetIds
├── payload
└── modelVersion
```

Events should be immutable. The event stream should never become a hidden command bus.

## 12.33 Canonical Observation Schema

An observation should minimally contain:

```
Observation
├── observationId
├── experimentId
├── runId
├── worldId
├── tick
├── observationType
├── subject
├── value
├── units
├── provenance
└── modelVersion
```

This allows a measurement to answer: *what was measured, where, when, from which run, under which model?*

## 12.34 Provenance Model

Every scientifically meaningful artifact should be traceable.

```
Result → Analysis → Observations → Run → Replicate
       → Experiment → Model Version → Code / Configuration
```

The system should never produce an important result with an unknown provenance chain.

## 12.35 Versioned Domain Schemas

All persistent representations should have:

```
schemaVersion    modelVersion
```

These represent different concepts.

**Schema version** — how the data is encoded.

**Model version** — what the simulation means.

For example:

```
schemaVersion = 4
modelVersion  = "ecology-v2-development-v1"
```

A schema migration does not necessarily mean the scientific model changed. A model change may invalidate direct comparison even if the schema remains identical.

## 12.36 Null / Missing / Dead Semantics

The system should avoid ambiguous representations such as:

```
null • undefined • 0 • false • inactive
```

all meaning "dead." Lifecycle semantics must be explicit. For example:

```
LifecycleState.DEVELOPING
LifecycleState.ACTIVE
LifecycleState.DYING
LifecycleState.DEAD
```

Likewise, absence from an active population should not automatically imply destruction of historical identity. A dead organism may still exist in:

```
history • lineage • analysis
```

## 12.37 Historical vs Active State

The system should distinguish:

```
ACTIVE STATE
```

from:

```
HISTORICAL RECORD
```

For example, `activeOrganisms` may contain 10,000 organisms while the lineage database contains 1,400,000 historical organisms. These should not be conflated.

This distinction enables evolutionary analysis without forcing historical entities to remain active in the simulation kernel.

## 12.38 State Compression

Long-running simulations cannot necessarily retain every full state. The architecture should eventually support:

```
Full Snapshot + Event Stream + Aggregated Observations + Lineage Records
```

Potential strategy:

```
Tick 0 FULL   Tick 1000 FULL   Tick 2000 FULL   …
Between: EVENTS / DELTAS
```

This supports replay while controlling storage.

## 12.39 Checkpoint Contract

A checkpoint must capture enough state to continue execution. At minimum:

```
Checkpoint
├── world state
├── simulation tick
├── simulation time
├── RNG state
├── model version
├── schema version
├── experiment identity
└── execution-relevant configuration
```

A checkpoint that restores visual state but not RNG state is not a valid scientific checkpoint.

## 12.40 Branching State

Historical branching should conceptually work like:

```
        Snapshot(t)
             │
      ┌──────┴──────┐
      ▼             ▼
  Baseline    Intervention
      │             │
      ▼             ▼
 Trajectory A  Trajectory B
```

The branch should inherit:

- world state
- genome state
- environment
- RNG state
- model version
- provenance

but receive a new branch identity.

## 12.41 Counterfactual Contract

A counterfactual experiment should differ from its parent by a declared intervention. Example:

```
Parent:        environment.temperature = 20°C
Counterfactual: environment.temperature = 25°C
```

Everything else should remain identical wherever possible. This is vastly more scientifically useful than simply launching another unrelated random run.

## 12.42 Configuration Model

Configuration should be divided by domain. Avoid:

```
config
```

as one enormous global object. Prefer:

```
SimulationConfig • PhysicsConfig • EnvironmentConfig
• GeneticsConfig • DevelopmentConfig • BehaviourConfig
• EcologyConfig • ExperimentConfig • ObservationConfig
• ExecutionConfig • RenderingConfig
```

Then compose:

```
SimulationConfiguration
├── model
├── world
├── genetics
├── development
├── behaviour
├── ecology
├── experiment
├── observation
└── execution
```

This allows experiments to vary one domain without unintentionally modifying unrelated domains.

## 12.43 Immutable Experiment Definition

Once a run begins, the experiment definition should be treated as immutable:

```
Experiment Definition
        │
        └── frozen
            │
            ▼
        Replicate
```

Runtime state may change. Experimental specification should not silently mutate. If it changes, create a new experiment version — or a new experiment.

## 12.44 Domain vs Presentation Data

The UI may want:

```
selectedOrganism • cameraPosition • zoom • trailVisibility
• colourMode • renderQuality
```

None of these belong in the World domain model. Likewise, simulation code should not know:

```
selectedOrganism • currentPanel • cameraZoom
```

This separation is mandatory.

## 12.45 Canonical State Flow

The entire domain model can now be expressed as:

```
EXPERIMENT
     │
     ▼
INITIAL WORLD
     │
  ┌──┴──────────┐
  │             │
  ▼             ▼
ENVIRONMENT  POPULATION
                │
             ┌──┴─────┐
             ▼        ▼
          GENOME  DEVELOPMENT
             │        │
             └───┬────┘
                 ▼
             PHENOTYPE
                 │
                 ▼
             BEHAVIOUR
                 │
                 └────────────┬──────┘
                              ▼
                          ECOLOGY
                              │
                              ▼
                         CONSEQUENCES
                              │
                      ┌───────┴───────┐
                      ▼               ▼
                  SURVIVAL       REPRODUCTION
                      │               │
                      └───────┬───────┘
                              ▼
                           HEREDITY
                              │
                              ▼
                      NEXT GENERATION
```

This is the canonical evolutionary state machine the implementation should converge toward.

## 12.46 The Most Important Data-Model Principle

The architecture should make it difficult to accidentally encode:

```
desired outcome
```

into:

```
state representation
```

For example, instead of:

```
Organism { fitness, intelligence, interestingness, survivalScore }
```

prefer causal variables:

```
Organism { energy, health, age, reproductiveState, sensoryCapabilities,
           morphology, behaviour, environmentInteractions }
```

Then `fitness` can be measured from consequences rather than becoming a magical property that drives them.

## 12.47 Domain Model Acceptance Criteria

The domain architecture should eventually pass these tests.

**Test A — Genome separation.** Two organisms can share equivalent genomes while remaining distinct organisms.

**Test B — Phenotype plasticity.** The same genome can potentially produce different phenotypes under different environmental/developmental conditions.

**Test C — Historical persistence.** Dead organisms remain analyzable without remaining active.

**Test D — Reproducible checkpoint.** Restoring a checkpoint reproduces the same subsequent trajectory.

**Test E — Branch independence.** A counterfactual branch cannot mutate its parent's historical state.

**Test F — Observation purity.** Measurements cannot alter domain state.

**Test G — Renderer independence.** Changing rendering settings cannot alter domain state.

**Test H — Explicit lifecycle.** Birth and death are domain transitions, not arbitrary array operations.

**Test I — Explicit causality.** Actions generate consequences through world mechanisms rather than directly setting desired outcomes.

**Test J — Provenance.** Every experimental observation can be traced back to its originating run and model version.

## 12.48 Part 12 Synthesis

The domain model now has a clear conceptual hierarchy:

```
EXPERIMENT
     │
     ▼
    RUN
     │
     ▼
   WORLD
     │
     ├── ENVIRONMENT
     ├── RESOURCES
     ├── POPULATIONS
     │        └── ORGANISMS
     │              ├── GENOME
     │              ├── DEVELOPMENT
     │              ├── PHENOTYPE
     │              ├── PHYSIOLOGY
     │              ├── BEHAVIOUR
     │              └── LIFECYCLE
     ├── INTERACTIONS
     └── RNG / CLOCK
```

Surrounding it:

```
HISTORY
   │
   ▼
WORLD ───────► OBSERVATION ───────► ANALYSIS
   │
   └──────────────► EXECUTION
```

The crucial architectural separation is:

```
WHAT EXISTS
     │
     ▼
DOMAIN STATE
     │
     ▼
WHAT CHANGES
     │
     ▼
  SYSTEMS
     │
     ▼
WHAT OCCURRED
     │
     ▼
   EVENTS
     │
     ▼
WHAT WE MEASURE
     │
     ▼
 OBSERVATIONS
```

This provides the foundation for the next layer: [Part 13 — Simulation Kernel, Tick Semantics & Deterministic State Transition](13-simulation-kernel-and-tick-semantics.md).
