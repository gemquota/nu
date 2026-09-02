### ChatGPT

# Explain Conceptual Architecture

02/09/2026, 5:40:45 pm

1 1 1

next. . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . Start Part 11 — Master Technical Specification: Target Architecture & System Contracts. . . . . . . . . . . . . . . . . . . . . . . . . . . . . next. . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . .

### next

# Part 3/10 — Bounded Contexts & Architectural Paradigm

### The next step is to stop looking at the codebase as a collection of modules and instead ask:

### What conceptual subsystems does the simulation actually contain, and where are the

### boundaries between them?

### This is important because the system is not fundamentally a “simulation program.” It is closer to a

### layered artificial-life research platform containing a simulation kernel, an evolutionary/law system, an

### experimental framework, an observation system, and a presentation layer.

# 3.1 The Conceptual Architecture

### At the highest level, the system can be represented approximately as:

┌─────────────────────────┐ │ USER / UI │ └────────────┬────────────┘ │ ▼ ┌─────────────────────────┐ │ OBSERVATION │ │ metrics / visualization │ │ telemetry / inspection │ └────────────┬────────────┘ │ ▼ ┌───────────────────────────────────────────────────────────────────┐ │ EXPERIMENTAL WORLD │ │ │ │ ┌──────────────┐ ┌──────────────┐ ┌────────────────────┐ │ │ │ World │ │ Organisms │ │ Environment │ │ │ └──────┬───────┘ └──────┬───────┘ └─────────┬──────────┘ │ │ │ │ │ │ │ └──────────────────┼─────────────────────┘ │ │ ▼ │ │ ┌────────────────┐ │ │ │ SIMULATION │ │ │ │ KERNEL │ │ │ └───────┬────────┘ │ │ │ │ └────────────────────────────┼─────────────────────────────────────┘ │ ┌────────────┴─────────────┐ ▼ ▼ ┌────────────────┐ ┌────────────────┐ │ LAW SYSTEM │ │ GENETICS │ │ physics/rules │ │ mutation/etc. │ └────────────────┘ └────────────────┘ │ │ └────────────┬─────────────┘ ▼ ┌────────────────┐ │ HISTORY / │ │ STATE │ └────────────────┘

### The crucial observation is that these aren't all the same kind of thing.

### Some are domains.

### Some are mechanisms.

### Some are representations.

### Some are experimental infrastructure.

### And some are interfaces to the underlying system.

### The architecture becomes considerably clearer once those categories are separated.

# 3.2 The Simulation Kernel

### The kernel is the most fundamental subsystem.

### Conceptually it answers:

### Given the current world state and the governing rules, what is the next world state?

### That gives the fundamental transition:

State(t) │ │ simulation step ▼ Rules + interactions + dynamics │ ▼ State(t+1)

### Everything else ultimately depends on this transition.

### The kernel therefore represents the closest thing the project has to a computational ontology.

### It determines what can exist, what can interact, and how causality propagates.

### A useful conceptual decomposition is:

Simulation Kernel │ ├── State ├── Time ├── Entities ├── Interactions ├── Dynamics ├── Constraints └── Transition

### This distinction matters enormously.

### For example, rendering should not determine simulation state.

### Statistics should not determine simulation state.

### Experiment orchestration should not determine simulation state.

### They should observe or configure the kernel.

### The kernel should remain capable of operating without them.

# 3.3 The Law System

### The next boundary is more interesting.

### The simulation does not merely contain objects. It contains rules governing those objects.

### That makes the law system conceptually distinct from the kernel.

### Think of it as:

Kernel = mechanism for evolving state

Law System = rules determining how state evolves

### This distinction creates a potentially powerful abstraction:

┌────────────────┐ │ Simulation │ │ Kernel │ └───────┬────────┘ │ ▼ ┌────────────────┐ │ Law Interface │ └───────┬────────┘ │ ┌─────────────────┼─────────────────┐ ▼ ▼ ▼ Physics Biology Environment laws laws laws

### This is architecturally significant because it opens the possibility that the simulation's rules themselves

### become experimental variables.

### That is much more sophisticated than merely evolving organisms inside a fixed simulator.

### You potentially have two evolutionary levels:

Level 1 Organisms evolve within the world

Level 2 The rules governing organisms can themselves vary

### That moves the project toward a meta-evolutionary simulation architecture.

# 3.4 World / Domain Model

### The world is another distinct conceptual boundary.

### It represents the persistent state in which the simulation occurs:

World │ ├── Spatial state ├── Environmental state ├── Entities ├── Resources ├── Physical structures ├── Organisms └── Temporal state

### The important architectural question is whether the world is treated as:

### a passive data container

### or

### an active domain model.

### The latter is substantially more powerful.

### A mature architecture would ideally make the world represent domain truth, while the simulation

### engine performs transitions against that truth.

### In other words:

World = what exists

Kernel = how it changes

### That distinction should remain extremely clear.

# 3.5 Genetics as Its Own Bounded Context

### Genetics deserves its own boundary because it represents a fundamentally different abstraction from

### physics.

### Physics asks:

### What happens when entities interact?

### Genetics asks:

### What information is inherited, altered, expressed, and transmitted?

### Conceptually:

Genome │ ├── Mutation ├── Recombination ├── Inheritance ├── Expression └── Phenotype │ ▼ Organism

### The dangerous architectural mistake would be collapsing genome and organism into one object.

### A stronger conceptual model is:

GENOTYPE │ │ expression ▼ PHENOTYPE │ │ interaction ▼ WORLD

### That gives the simulation an explicit genotype → phenotype → environment causal chain.

# 3.6 Lifecycle

### The lifecycle subsystem sits between genetics and simulation.

### It answers questions such as:

Birth ↓ Development ↓ Growth ↓ Interaction ↓ Reproduction ↓ Mutation / inheritance ↓ Death

### This is fundamentally different from raw physics.

### A physics engine might calculate forces.

### It does not inherently know what birth means.

### Likewise, genetics may describe mutation.

### It does not inherently determine when an organism reproduces.

### Lifecycle therefore represents biological semantics layered over physical dynamics.

### That distinction is one of the most important architectural boundaries in the entire system.

# 3.7 Experimentation / Multiplexing

### The experiment subsystem is conceptually above the simulation.

### It should not define what the world is.

### Instead, it defines how worlds are instantiated, varied, compared, and measured.

### For example:

Experiment │ ├── Configuration ├── Initial conditions ├── Random seed ├── Population ├── Parameters ├── Replication ├── Duration ├── Measurements └── Results

### This allows:

Experiment A ├── seed 1 ├── seed 2 └── seed 3

Experiment B ├── seed 1 ├── seed 2 └── seed 3

### The distinction is critical:

### The simulation produces a trajectory.

### The experiment produces knowledge from trajectories.

### That is a much higher-level abstraction.

# 3.8 Observation and History

### Observation should conceptually be downstream of simulation.

Simulation │ ▼ State transitions │ ├──────────► Metrics │ ├──────────► Events │ ├──────────► Snapshots │ └──────────► Visualization

### History is particularly important because the system isn't merely representing the current world.

### It is potentially representing:

### the evolution of a world through time.

### That creates a second major data model:

Current State + Temporal State

### A mature architecture should treat historical state as a first-class concept rather than an incidental

### logging mechanism.

# 3.9 Renderer / UI

### The renderer belongs firmly outside the simulation domain.

### Its conceptual relationship should be:

Simulation │ │ read-only projection ▼ Visualization Model │ ▼ Renderer │ ▼ UI

### Not:

UI │ ▼ Simulation internals

### The distinction matters because a simulation may eventually run:

### headless

### remotely

### at accelerated time

### in batch experiments

### inside workers

### without a browser

### If the simulation requires the UI to function, the architecture has accidentally coupled research

### infrastructure to presentation.

# 3.10 Workers and Infrastructure

### Workers are not part of the domain.

### They are an execution strategy.

### That means:

Domain │ ▼ Simulation API │ ┌────────┼────────┐ ▼ ▼ ▼ Worker A Worker B Worker C

### The simulation should conceptually not care whether it is running:

in the browser in Node in a worker on another machine in batch mode

### That is infrastructure.

### Keeping this distinction clean is what makes future distributed experimentation possible.

# 3.11 The Deeper Architectural Pattern

### Taken together, the project resembles a hybrid of:

### Domain-driven architecture + discrete-event simulation + artificial-life engine + experimental

### laboratory.

### Its natural hierarchy is approximately:

EXPERIMENT │ ┌─────────┴─────────┐ │ │ Analysis Replication │ │ └─────────┬─────────┘ ▼ WORLD │ ┌─────────┴─────────┐ ▼ ▼ ORGANISMS ENVIRONMENT │ │ └─────────┬─────────┘ ▼ SIMULATION KERNEL │ ┌─────────┴─────────┐ ▼ ▼ LAWS TIME │ ▼ TRANSITION

### And surrounding all of it:

┌───────────────────────────┐ │ INFRASTRUCTURE │ │ workers / persistence / │ │ serialization / runtime │ └─────────────┬─────────────┘ │ ┌──────────────────┴──────────────────┐ ▼ ▼ Simulation Experiment │ │ ▼ ▼ Observation ───────────────────────────► Analysis │ ▼ UI

### This is the architectural shape the system is implicitly moving toward.

### The key issue is that the codebase may not yet enforce these boundaries as strongly as the

### conceptual model suggests.

### That gap—between the architecture the system appears to want and the architecture the

### implementation actually guarantees—is where many of the deeper problems emerge.

### Part 4/10 will examine that gap: architectural coupling, dependency direction, hidden state, and

### where the system's conceptual boundaries are likely being violated.

### We’ve reached the end of the original 10-part architectural audit.

### The natural next step is to convert the audit into an actionable engineering artifact rather than

### continuing the conceptual analysis. I’d recommend a Master Technical Specification + Migration

### Roadmap that turns the conclusions into a concrete target architecture.

### I can structure it as:

### 1. Executive Architecture Definition

### 2. Target System Architecture

### 3. Bounded Contexts & Module Responsibilities

### 4. Dependency Architecture

### 5. Simulation State Model

### 6. Authoritative Tick / Causal Semantics

### 7. Genetics & Heredity Architecture

### 8. Development / Morphogenesis Architecture

### 9. Behaviour & Agent Architecture

### 10. Ecology & Environment Architecture

### 11. Evolution / Selection Architecture

### 12. Experiment & Replication Framework

### 13. Observation / Telemetry / Analysis

### 14. History, Replay & Branching

### 15. Persistence & Provenance

### 16. Determinism & Reproducibility

### 17. Worker / Parallel Execution Architecture

### 18. Performance & Data-Oriented Design

### 19. UI / Visualization Architecture

### 20. Scientific Validation Framework

### 21. Adversarial / Null-Model Test Suite

### 22. Migration Strategy from the Existing Codebase

### 23. Phased Development Roadmap

### 24. Atomically Decomposed Implementation Tasks

### 25. Acceptance Criteria & Invariants

### 26. Long-Term Open-Ended Evolution Roadmap

### The important difference from the audit is that this would specify exactly what should be built, in

### what order, what interfaces should exist, what invariants must hold, and how each stage can be

### experimentally validated.

### The resulting architecture would effectively be:

┌──────────────────────────┐ │ SCIENTIFIC LAYER │ │ experiments / hypotheses │ │ replication / analysis │ └────────────┬─────────────┘ │ ┌────────────▼─────────────┐ │ OBSERVATION LAYER │ │ metrics / events / │ │ lineage / telemetry │ └────────────┬─────────────┘ │ ┌───────────────────▼───────────────────┐ │ EVOLUTIONARY WORLD │ │ │ │ Environment ↔ Organisms ↔ Resources │ │ ↕ ↕ │ │ Ecology Development │ │ ↕ ↕ │ │ Selection ← Behaviour ← Genome │ └───────────────────┬───────────────────┘ │ ┌────────────▼─────────────┐ │ SIMULATION KERNEL │ │ state / tick / physics │ │ scheduling / RNG │ │ deterministic reduction │ └────────────┬─────────────┘ │ ┌────────────▼─────────────┐ │ EXECUTION INFRASTRUCTURE │ │ workers / CPU / GPU │ │ persistence / snapshots │ └──────────────────────────┘

### And the central scientific loop becomes:

┌───────────────┐ │ HYPOTHESIS │ └───────┬───────┘ ↓ ┌───────────────┐ │ EXPERIMENT │ └───────┬───────┘ ↓ ┌───────────────┐ │ WORLD │ └───────┬───────┘ ↓ ┌──────────────────────┐ │ SIMULATION │ │ │ │ Genome │ │ ↓ │ │ Development │ │ ↓ │ │ Body / Physiology │ │ ↓ │ │ Behaviour │ │ ↓ │ │ Ecology │ │ ↓ │ │ Reproduction │ │ ↓ │ │ Heredity │ └──────────┬───────────┘ ↓ ┌───────────────┐ │ OBSERVATIONS │ └───────┬───────┘ ↓ ┌───────────────┐ │ ANALYSIS │ └───────┬───────┘ ↓ ┌───────────────┐ │ REPLICATE │ │ / INTERVENE │ └───────┬───────┘ │ └──────────────→ new experiment

### That is the point where the project stops being merely a simulation architecture and starts becoming a

### research architecture for artificial life.

### If you want to continue in the same “proceed through enormous document” style, I can start Part 11

### — Master Technical Specification: Target Architecture & System Contracts and build the

### specification sequentially from there.

Digital Ocean

Kimi K3 on DigitalOcean Run Kimi K3 with serverless inference.

Ad

### Start Part 11 — Master Technical Specification: Target Architecture & System Contracts

# Part 11 — Master Technical Specification

# Target Architecture & System Contracts

## 11.0 Purpose

### This specification converts the preceding architectural audit into a target-state engineering contract.

### The objective is not to prescribe a particular implementation language, framework, rendering

### technology, or deployment topology. The objective is to define the semantic boundaries, invariants,

### contracts, data flows, and architectural obligations that the implementation must satisfy.

### The target system is:

### A deterministic, experimentally reproducible artificial-life platform in which physical

### dynamics, generative development, heredity, behaviour, ecology, and selection form a

### coupled dynamical system, while an independent scientific layer makes resulting

### phenomena observable, reproducible, and falsifiable.

### The architecture must therefore optimize for five properties simultaneously:

### 1. Causal integrity — the simulation means what its model claims to mean.

### 2. Evolutionary integrity — variation, heredity, selection, and population dynamics form a genuine

### causal loop.

### 3. Reproducibility — experiments can be replayed, replicated, branched, and compared.

### 4. Extensibility — new mechanisms can be introduced without destabilizing the kernel.

### 5. Scientific falsifiability — interesting observations can be distinguished from artifacts,

### implementation effects, and researcher expectations.

# 11.1 Architectural North Star

### The system should ultimately implement this causal structure:

┌───────────────────┐ │ GENOME │ └─────────┬─────────┘ │ ▼ ┌───────────────────┐ │ DEVELOPMENT │ └─────────┬─────────┘ │ ▼ ┌───────────────────┐ │ BODY / PHYSIOLOGY │ └─────────┬─────────┘ │ ▼ ┌───────────────────┐ │ BEHAVIOUR │ └─────────┬─────────┘ │ ▼ ┌──────────────────────┴──────────────────────┐ │ │ ▼ ▼ ┌───────────────┐ ┌────────────────┐ │ ENVIRONMENT │◄───────────────────────────►│ OTHER ORGANISMS│ └───────┬───────┘ └───────┬────────┘ │ │ └──────────────────┬──────────────────────────┘ ▼ ┌───────────────────┐ │ RESOURCE / ENERGY │ │ CONSEQUENCES │ └─────────┬─────────┘ │ ▼ ┌───────────────────┐ │ REPRODUCTIVE │ │ SUCCESS │ └─────────┬─────────┘ │ ▼ ┌───────────────────┐ │ HEREDITY / │ │ RECOMBINATION / │ │ MUTATION │ └─────────┬─────────┘ │ └──────────────► GENOME

### This loop is embedded within a second loop:

WORLD STATE(t) │ ▼ SIMULATION KERNEL │ ▼ WORLD STATE(t+1) │ ▼ OBSERVATIONS │ ▼ ANALYSIS │ ▼ EXPERIMENTAL INTERVENTION │ └──────────────► WORLD

### The first loop is evolutionary causality.

### The second is scientific causality.

### The architecture must preserve both.

# 11.2 The System-of-Systems Model

### The target platform is divided into six architectural planes.

┌──────────────────────────────────────────────────────────────┐ │ SCIENTIFIC PLANE │ │ hypotheses • experiments • replicates • analysis • results │ ├──────────────────────────────────────────────────────────────┤ │ OBSERVATION PLANE │ │ metrics • events • lineage • telemetry • projections │ ├──────────────────────────────────────────────────────────────┤ │ EVOLUTIONARY PLANE │ │ genetics • development • behaviour • ecology • selection │ ├──────────────────────────────────────────────────────────────┤ │ WORLD PLANE │ │ organisms • resources • environment • spatial state │ ├──────────────────────────────────────────────────────────────┤ │ KERNEL PLANE │ │ state transitions • laws • scheduling • RNG • time │ ├──────────────────────────────────────────────────────────────┤ │ EXECUTION PLANE │ │ CPU • workers • GPU • persistence • storage • transport │ └──────────────────────────────────────────────────────────────┘

### These planes should not be treated merely as folders.

### They represent different semantic responsibilities.

# 11.3 Bounded Contexts

### The target architecture defines the following bounded contexts.

# 11.3.1 Simulation Kernel

### Responsible for:

### simulation time

### state transitions

### update scheduling

### deterministic execution

### random-number streams

### system ordering

### transaction/commit semantics

### numerical integration

### execution contracts

### The kernel must not know about:

### UI

### React/DOM/canvas

### persistence implementations

### experiment dashboards

### database schemas

### analytics presentation

### worker transport

### specific evolutionary experiments

### The kernel should be the most stable subsystem.

# 11.3.2 Law System

### Defines the rules governing physical and environmental state transitions.

### Potential laws include:

### gravity

### friction

### collision

### fluid dynamics

### energy transfer

### diffusion

### temperature

### chemical interaction

### resource regeneration

### environmental decay

### A law should conceptually be:

LAW: observe relevant state calculate consequences emit/apply deterministic state changes

### A law should not secretly:

### mutate unrelated domains

### query the UI

### create experimental metadata

### alter genetic state directly without an explicit causal pathway

### consume uncontrolled randomness

# 11.3.3 World

### The World represents the simulated universe.

### Conceptually:

World ├── Environment ├── SpatialIndex ├── Resources ├── Organisms ├── PopulationState ├── Time ├── RNG State ├── World Parameters └── Model Version

### The World must be serializable at semantic boundaries.

### A world should be capable of answering:

### “Given this world state, model version, configuration, and RNG state, what happens next?”

# 11.3.4 Genetics

### Genetics owns:

### genomes

### genes

### alleles

### inheritance

### recombination

### mutation

### expression

### genetic identity

### lineage relationships

### Genetics should not assume that a genome directly equals behaviour.

### The intended architecture is:

Genome │ ▼ Expression │ ▼ Development │ ▼ Phenotype

### This allows increasingly sophisticated developmental systems later without invalidating the genetic

### model.

# 11.3.5 Lifecycle

### Lifecycle owns biological state transitions such as:

BIRTH ↓ DEVELOPMENT ↓ MATURE ↓ ACTIVE ↓ REPRODUCTION ↓ AGING ↓ DEATH

### Lifecycle must distinguish:

### biological existence

### physical existence

### reproductive eligibility

### developmental state

### physiological state

### Death should therefore be a domain transition, not merely:

entity.active = false

# 11.3.6 Behaviour

### Behaviour converts organism state and sensed information into actions.

### Conceptually:

SENSORS ↓ PERCEPTION ↓ INTERNAL STATE ↓ DECISION / POLICY ↓ ACTION

### Behaviour must not directly rewrite the world.

### Instead:

Behaviour → Intent / Action ↓ Kernel / Laws ↓ World State

### This preserves causal traceability.

# 11.3.7 Ecology

### Ecology owns interactions among organisms and their environment.

### Examples:

### competition

### predation

### cooperation

### parasitism

### mating

### resource consumption

### territoriality

### population density

### niche occupancy

### ecological succession

### Ecology is especially important because it allows selection to become distributed rather than

### dependent on a single explicit fitness function.

# 11.3.8 Experimentation

### Experimentation defines:

### hypotheses

### initial conditions

### parameter sets

### seeds

### replicates

### interventions

### stopping conditions

### measurements

### analysis plans

### comparison groups

### The Experiment becomes the fundamental unit of scientific execution.

Experiment │ ├── Replicate 1 ├── Replicate 2 ├── Replicate 3 └──...

# 11.3.9 Observation

### Observation is read-only with respect to authoritative simulation state.

### It produces:

### measurements

### projections

### statistics

### events

### lineage information

### spatial samples

### behavioural traces

### population summaries

### Observation must never become an implicit control mechanism.

# 11.3.10 History

### History owns:

### snapshots

### event streams

### lineage records

### checkpoints

### replay metadata

### branch points

### provenance

### This enables:

Run ├── Snapshot A │ ├── Snapshot B │ │ │ ├── Branch X │ └── Branch Y │ └── Snapshot C

### The architecture should eventually permit counterfactual experimentation:

### “What would have happened if this environmental event had not occurred?”

# 11.3.11 Execution Infrastructure

### Responsible for:

### worker scheduling

### process/thread isolation

### CPU execution

### GPU execution

### distributed execution

### serialization

### persistence

### transport

### It must remain subordinate to the semantic model.

### Execution technology should answer:

### “How do we execute this model efficiently?”

### not:

### “What does the model mean?”

# 11.4 Dependency Direction

### The target dependency graph should resemble:

SCIENCE │ ▼ EXPERIMENT │ ▼ OBSERVATION │ ▼ EVOLUTIONARY WORLD │ │ │ ┌────────┘ │ └────────┐ ▼ ▼ ▼ GENETICS BEHAVIOUR ECOLOGY │ │ │ └────────┬────┴────┬────────┘ ▼ ▼ WORLD LIFECYCLE \ / \ / ▼ ▼ KERNEL │ ▼ EXECUTION

### The critical principle is:

### Dependencies point toward more fundamental semantics, never toward presentation or

### infrastructure.

### Therefore:

Renderer → Observation → Domain

### is healthy.

### Whereas:

Domain → Renderer

### is architecturally forbidden.

### Likewise:

Kernel → Worker

### is undesirable.

### Prefer:

Worker → Kernel

# 11.5 System Contract Model

### Every major subsystem should expose a contract consisting of:

Inputs Outputs State Ownership Side Effects Determinism Requirements Randomness Requirements Temporal Semantics Failure Semantics Serialization Semantics Observability

### A subsystem should be understandable without reading its implementation.

### For example:

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

### This contract-first architecture is essential for both human engineering and future agent-assisted

### development.

# 11.6 Authoritative State Contract

### The most important state distinction in the system is:

AUTHORITATIVE STATE │ ├── determines future simulation │ └── must be serializable

### versus:

DERIVED STATE │ ├── calculated from authoritative state └── can be reconstructed

### and:

EPHEMERAL STATE │ ├── caches ├── render buffers ├── temporary allocations └── execution artifacts

## Rule

### Only authoritative state may influence future authoritative state.

### This eliminates a huge class of hidden dependencies.

# 11.7 World State Contract

### A conceptual world snapshot should contain:

WorldSnapshot ├── schemaVersion ├── modelVersion ├── simulationTime ├── tick ├── worldParameters ├── environmentState ├── resourceState ├── organismState[] ├── populationState ├── lineageState ├── RNGState └── experimentContext

### The exact storage representation may change.

### The semantic contents may not disappear without an explicit versioned model change.

# 11.8 Tick Contract

### The tick is the fundamental causal boundary.

### A target semantic tick should conceptually execute:

STATE(t) │ ▼ READ │ ▼ SENSE │ ▼ DECIDE │ ▼ ACT │ ▼ INTERACT │ ▼ RESOLVE │ ▼ RESOURCE / ENERGY TRANSFER │ ▼ PHYSIOLOGY │ ▼ DEVELOPMENT │ ▼ REPRODUCTION │ ▼ INHERITANCE / MUTATION │ ▼ BIRTH / DEATH │ ▼ COMMIT │ ▼ STATE(t+1)

### Not every simulation must use precisely these phases.

### But the semantic ordering must be explicit.

### The system must never rely on accidental JavaScript call order to define biological causality.

# 11.9 State Transition Contract

### At the highest level:

S(t+1) = F( S(t), L, E, R(t) )

### Where:

### S(t) = authoritative state

### L = laws/model

### E = experiment configuration

### R(t) = controlled randomness

### For deterministic execution:

S(t), L, E, R(t) ↓ F ↓ S(t+1)

### must produce the same result under the defined reproducibility level.

# 11.10 Randomness Contract

### Randomness must never be an invisible global dependency.

### Instead:

Experiment Seed │ ▼ Deterministic RNG │ ├── genetics stream ├── behaviour stream ├── environment stream ├── reproduction stream └── experiment stream

### This provides:

### reproducibility

### debugging

### controlled intervention

### independent replication

### easier parallelism

### causal analysis

### Prefer named RNG streams over a single global random generator.

# 11.11 Determinism Contract

### The platform should define three levels.

## Level A — Logical determinism

### Same seed and configuration produce the same semantic trajectory.

## Level B — Bitwise determinism

### Same seed and execution conditions produce identical serialized state.

## Level C — Statistical reproducibility

### Different valid implementations produce statistically equivalent experimental outcomes.

### The architecture should strive for A universally and B where computationally practical.

### Level C is essential when GPU/parallel numerical differences make bitwise identity unreasonable.

# 11.12 Experiment Contract

### An experiment should minimally specify:

Experiment ├── id ├── hypothesis ├── modelVersion ├── parameters ├── initialConditions ├── environment ├── populationDefinition ├── genomeDefinition ├── seedPolicy ├── replicateCount ├── interventionPlan ├── observationPlan ├── stoppingCriteria └── analysisPlan

### An experiment must be executable without the UI.

### This is a hard requirement.

# 11.13 Replicate Contract

### A replicate is not merely another random run.

### It must preserve:

experiment definition + replicate identifier + seed + model version + configuration + initial conditions + execution metadata

### This allows:

Experiment E │ ├── Replicate 001 ├── Replicate 002 ├── Replicate 003 ├── Replicate 004 └── Replicate 005

### to be analyzed as a statistical population.

# 11.14 Observation Contract

### Observation must be causally downstream:

AUTHORITATIVE STATE │ ▼ OBSERVATION │ ├── metrics ├── projections ├── events ├── lineage └── visualization data

### The renderer should therefore consume:

VisualizationProjection

### rather than:

World

### directly.

### This prevents presentation logic from becoming coupled to simulation semantics.

# 11.15 Event Contract

### Events should be divided into two categories.

## Domain events

### Examples:

OrganismBorn OrganismDied OrganismReproduced GenomeMutated ResourceConsumed PredationOccurred EnvironmentChanged PopulationSplit

### These describe phenomena in the model.

## Infrastructure events

### Examples:

WorkerStarted CheckpointWritten SimulationPaused RenderFrameDropped WorkerFailed SnapshotUploaded

### These describe execution.

### They should never be conflated.

# 11.16 History Contract

### History must support at least:

snapshot(t) snapshot(t+n) replay(t → t+n) branch(t) compare(A, B) lineage(entity)

### Long-term:

World A │ ├── baseline continuation │ ├── intervention X │ └── intervention Y

### This transforms historical data from passive logging into an experimental instrument.

# 11.17 Genetics Contract

### The genetics subsystem must eventually support:

Genome │ ├── identity ├── loci / genes ├── regulatory information ├── structural information └── metadata

### with operations:

recombine(parentA, parentB) mutate(genome, mutationContext) express(genome, environment) inherit(parentState, offspringContext)

### Critically:

### Mutation must not be synonymous with evolution.

### The genetics subsystem creates variation.

### The ecological/evolutionary system determines which variation persists.

# 11.18 Development Contract

### Development should be treated as an interpreter:

Genome + Environment + Developmental State │ ▼ Developmental Process │ ▼ Phenotype

### This creates the possibility of:

### modularity

### pleiotropy

### gene regulation

### developmental constraints

### indirect encoding

### morphological innovation

### evolvability

### without requiring the genome to explicitly encode every final body parameter.

# 11.19 Behaviour Contract

### Behaviour should be modelled as:

Observation + Internal State + Inherited Policy + Learning State │ ▼ Decision │ ▼ Action

### Later architectures may distinguish:

### innate behaviour

### learned behaviour

### developmental behaviour

### social behaviour

### communication

### memory

### prediction

### But all must preserve the causal boundary:

agent chooses action ↓ world determines consequence

### not:

agent chooses desired outcome ↓ simulation grants outcome

# 11.20 Ecology Contract

### Ecological interactions should produce real consequences.

### For example:

Predator ↓ consumes ↓ Prey ↓ resource transfer ↓ Predator energy ↓ survival/reproduction

### Likewise:

Organism ↓ resource consumption ↓ environmental depletion ↓ resource scarcity ↓ competition ↓ selection

### This creates the desired feedback structure.

# 11.21 Selection Contract

### Selection should be explicitly classified.

## Direct selection

### Researcher defines:

fitness = objective(...)

### Useful for controlled evolutionary experiments.

## Ecological selection

### Fitness emerges from:

resource access survival competition predation mating environmental compatibility offspring success

### This is the preferred long-term mechanism for artificial-life experiments.

### The architecture must support both without conflating them.

# 11.22 Renderer Contract

### The renderer is a consumer.

### It may:

### observe

### interpolate

### project

### simplify

### aggregate

### visualize

### It may not:

### mutate authoritative state

### influence RNG

### alter simulation timing

### determine collision outcomes

### determine biological outcomes

### silently trigger simulation behaviour

### A strict invariant:

### A headless run and a rendered run must have identical authoritative trajectories when

### executed under equivalent conditions.

# 11.23 Worker Contract

### Workers should receive declarative execution requests:

RunRequest ├── experiment ├── seed ├── modelVersion ├── executionMode ├── checkpointPolicy └── observationPolicy

### and produce:

RunResult ├── finalState ├── observations ├── events ├── metrics ├── provenance └── executionSummary

### The worker should not redefine simulation semantics.

# 11.24 Persistence Contract

### Persistence must store enough information to reconstruct an experiment.

### At minimum:

Model Version + Experiment Definition + Configuration + Seed + Initial State + Checkpoint / Event History + Observation Metadata

### A saved simulation without its semantic version and experimental context is not a scientifically useful

### artifact.

# 11.25 Versioning Contract

### The system needs explicit versions for:

Model Schema Experiment Genome Format World Format Observation Format Execution Protocol

### A checkpoint should never be interpreted solely by “whatever the current code happens to do.”

# 11.26 Architectural Invariants

### The following should become automated tests.

## Invariant 1 — Renderer independence

rendering = OFF rendering = ON

⇒ same authoritative trajectory

## Invariant 2 — Replay determinism

same seed + same model + same initial state

⇒ same trajectory

## Invariant 3 — Observation purity

### Observation must not alter authoritative state.

## Invariant 4 — Persistence integrity

snapshot → restore → continue

### must produce the same future trajectory as uninterrupted execution.

## Invariant 5 — RNG reproducibility

### Saving/restoring RNG state must preserve subsequent random sequence.

## Invariant 6 — Experiment isolation

### Replicate A must not mutate state belonging to replicate B.

## Invariant 7 — Configuration isolation

### Changing presentation configuration must not alter simulation semantics.

## Invariant 8 — Execution equivalence

### Where supported:

single-thread ≈ parallel

### under the defined determinism level.

## Invariant 9 — Causal locality

### A subsystem must not mutate state outside its declared ownership without an explicit contract.

## Invariant 10 — Scientific traceability

### Every reported result must be traceable to:

Experiment → Replicate → Seed → Model Version → Tick Range → Observation

# 11.27 The Target Architectural Boundary

### The ultimate architecture should make the following statement true:

### The simulation engine does not know that it is being used to study evolution.

### It knows:

### state

### laws

### entities

### interactions

### time

### information

### environment

### reproduction mechanisms

### The evolutionary phenomena emerge from those mechanisms.

### Likewise:

### The scientific layer does not need to understand how every physical mechanism works.

### It needs stable contracts for:

### initialization

### execution

### observation

### intervention

### replay

### comparison

### analysis

### This separation is what permits the platform to evolve from a simulation into a scientific instrument.

# 11.28 Target Repository / Module Topology

### A conceptual target topology is:

src/ │ ├── kernel/ │ ├── state/ │ ├── time/ │ ├── rng/ │ ├── scheduler/ │ ├── transition/ │ └── execution/ │ ├── laws/ │ ├── physics/ │ ├── environment/ │ ├── resources/ │ └── interaction/ │ ├── world/ │ ├── world/ │ ├── spatial/ │ ├── organisms/ │ ├── resources/ │ └── environment/ │ ├── genetics/ │ ├── genome/ │ ├── mutation/ │ ├── recombination/ │ ├── expression/ │ └── lineage/ │ ├── development/ │ ├── developmental-state/ │ ├── morphogenesis/ │ └── phenotype/ │ ├── behaviour/ │ ├── sensing/ │ ├── cognition/ │ ├── policy/ │ └── action/ │ ├── ecology/ │ ├── competition/ │ ├── predation/ │ ├── cooperation/ │ ├── reproduction/ │ └── selection/ │ ├── experiment/ │ ├── definitions/ │ ├── initialization/ │ ├── replication/ │ ├── intervention/ │ └── execution/ │ ├── observation/ │ ├── metrics/ │ ├── events/ │ ├── projections/ │ ├── lineage/ │ └── analysis/ │ ├── history/ │ ├── snapshots/ │ ├── replay/ │ ├── branching/ │ └── provenance/ │ ├── execution/ │ ├── workers/ │ ├── parallel/ │ ├── gpu/ │ └── scheduling/ │ ├── persistence/ │ ├── checkpoints/ │ ├── storage/ │ └── serialization/ │ └── presentation/ ├── renderer/ ├── visualization/ └── ui/

### This is a semantic topology, not an instruction to blindly create directories.

### If the existing codebase can express these boundaries with fewer modules, that is preferable.

# 11.29 The Most Important Contract in the Entire System

### Everything ultimately reduces to this:

INITIAL STATE + MODEL + EXPERIMENT + CONTROLLED RANDOMNESS │ ▼ SIMULATION │ ▼ STATE TRAJECTORY │ ├──────────────► OBSERVATION │ ├──────────────► HISTORY │ └──────────────► ANALYSIS

### The simulation must not secretly depend upon:

UI state render timing database state worker scheduling uncontrolled randomness logging behaviour browser events

### If it does, the system ceases to be a reliable scientific model.

# 11.30 Architectural Acceptance Criterion

### The target architecture should not be considered complete merely because all modules exist.

### It is complete when the following experiment is possible:

1. Define an experiment declaratively.

2. Select a model version.

3. Select initial conditions.

4. Select a seed policy.

5. Generate N independent replicates.

6. Run them headlessly.

7. Capture complete provenance.

8. Observe population, organism,

environmental and evolutionary variables.

9. Replay an individual run.

10. Restore from checkpoint.

11. Branch from historical state.

12. Modify one causal condition.

13. Re-run the counterfactual.

14. Compare trajectories statistically.

15. Produce a reproducible result package.

### And critically:

No UI interaction is required for any of these operations.

### That is the dividing line between an impressive simulation application and a genuine artificial-life

### research platform.

# 11.31 Part 11 Conclusion

### The target architecture is therefore not fundamentally:

### a better-organized simulation codebase.

### It is:

### a causal computational laboratory.

### The simulation kernel provides the substrate.

### The world provides the dynamical environment.

### Genetics provides heritable information.

### Development converts information into phenotype.

### Behaviour couples organisms to their surroundings.

### Ecology couples organisms to one another.

### Selection determines which heritable configurations persist.

### History preserves trajectories.

### Observation makes phenomena measurable.

### Experimentation makes them falsifiable.

### Execution infrastructure makes the system scalable.

### And the architectural boundary between these concerns makes it possible to determine whether an

### apparent phenomenon is actually produced by the model rather than by an accidental property of the

### implementation.

## The central system contract is therefore:

MECHANISMS ↓ CAUSAL DYNAMICS ↓ STATE TRAJECTORY ↓ OBSERVABLE PHENOMENA ↓ REPLICABLE EXPERIMENT ↓ FALSIFIABLE CLAIM

### The next section should descend one level deeper:

# Part 12 — Master Technical Specification: Domain Model, State

# Architecture & Canonical Data Contracts

### That part will define the actual conceptual entities, state ownership, schemas, identifiers, lifecycle states,

### genome structures, world representation, population structures, lineage model, event model, and

### authoritative/derived/ephemeral state boundaries.

Digital Ocean

Kimi K3 on DigitalOcean Run Kimi K3 with serverless inference.

Ad

### next

# Part 12 — Master Technical Specification

# Domain Model, State Architecture & Canonical Data Contracts

### Part 11 established the architectural boundaries and system contracts.

### Part 12 now defines the thing those boundaries operate upon: the canonical domain model.

### The central requirement is that the simulation must have one coherent answer to:

### What exists, what state does it possess, who owns that state, how can it change, and

### what information is required to reproduce that change?

### If those questions are ambiguous, every higher-level property—evolution, ecology, emergence,

### determinism, experimentation—eventually becomes ambiguous as well.

# 12.1 Canonical Domain Model

### The target domain can be represented as:

UNIVERSE │ ├── MODEL │ ├── Laws │ ├── Rules │ ├── Parameters │ └── Version │ ├── WORLD │ ├── Environment │ ├── Resources │ ├── Spatial State │ └── World Processes │ ├── POPULATIONS │ │ │ └── ORGANISMS │ ├── Identity │ ├── Genome │ ├── Development │ ├── Phenotype │ ├── Physiology │ ├── Behaviour │ ├── Internal State │ ├── Reproductive State │ └── Lineage │ ├── INTERACTIONS │ ├── Organism ↔ Organism │ ├── Organism ↔ Environment │ └── Organism ↔ Resource │ └── HISTORY ├── Events ├── Snapshots ├── Lineages └── Branches

### Above this sits:

EXPERIMENT │ └── RUN │ └── WORLD

### This distinction is important.

### An Experiment is not a World.

### A world is a particular simulated universe.

### An experiment is the scientific specification under which one or more worlds are generated and

### observed.

# 12.2 Entity Taxonomy

### The domain should distinguish five fundamentally different kinds of things.

# 12.2.1 Entities

### Things with persistent identity.

### Examples:

### organism

### population

### resource patch

### world

### experiment

### lineage

### They possess stable identifiers.

# 12.2.2 Value Objects

### Things defined entirely by their value.

### Examples:

Vector2 Vector3 Energy Temperature GenomeHash Position Velocity Time Age MutationRate

### They do not require independent identity.

# 12.2.3 Components

### State attached to an entity.

### For example:

Organism ├── TransformComponent ├── PhysicsComponent ├── GenomeComponent ├── PhysiologyComponent ├── BehaviourComponent └── ReproductionComponent

### Components should represent state and semantic capability, not arbitrary service containers.

# 12.2.4 Systems

### Processes that transform state.

### Examples:

PhysicsSystem DevelopmentSystem BehaviourSystem EcologySystem ReproductionSystem MutationSystem

### A system answers:

### Given this state, what transition should occur?

# 12.2.5 Events

### Immutable descriptions of things that occurred.

OrganismBorn ResourceConsumed MutationOccurred OrganismDied EnvironmentChanged

### Events are historical facts, not commands.

# 12.3 Identity Architecture

### Every persistent domain entity should have an identity that is independent of array position, memory

### address, or UI index.

### Conceptually:

EntityId ├── namespace ├── localId └── generation/version metadata

### For example:

world:7f8... organism:92a... lineage:1bc... experiment:42e...

### The exact identifier encoding is implementation-specific.

### The semantic requirements are not.

## Requirements

### An ID must:

### remain stable during an entity's lifetime

### survive serialization

### survive checkpoint restoration

### remain distinguishable from other entities

### not depend on rendering order

### not depend on array index

# 12.4 Organism Identity

### An organism should be distinguished from its genome.

### This is critical.

Organism A │ ├── organismId = 1827 └── genomeId = genome-7f91

### Two organisms may have:

different organism IDs same or equivalent genome

### Likewise, a lineage may contain many genetically distinct genomes.

### Therefore:

Organism ≠ Genome ≠ Lineage

### These three concepts must never collapse into one identifier.

# 12.5 Organism State

### The conceptual organism model is:

Organism │ ├── Identity ├── Lineage ├── Genome Reference ├── Developmental State ├── Phenotype ├── Transform ├── Physics State ├── Physiology ├── Energy / Resources ├── Sensors ├── Behaviour State ├── Reproductive State ├── Age └── Lifecycle State

### A useful canonical abstraction is:

OrganismState ├── identity ├── ancestry ├── genome ├── development ├── phenotype ├── physiology ├── behaviour ├── reproduction ├── spatial └── lifecycle

### Not all of these need to be stored together physically.

### They are a semantic aggregate, not necessarily a memory-layout prescription.

# 12.6 Lifecycle State Machine

### The organism lifecycle should be explicit.

### A conceptual state machine:

┌──────────────┐ │ CREATED │ └──────┬───────┘ │ ▼ ┌──────────────┐ │ DEVELOPMENT │ └──────┬───────┘ │ ▼ ┌──────────────┐ │ JUVENILE │ └──────┬───────┘ │ ▼ ┌──────────────┐ │ MATURE │ └──────┬───────┘ │ ┌───────┴────────┐ ▼ ▼ ┌──────────────┐ ┌──────────────┐ │ REPRODUCING │ │ AGING │ └──────┬───────┘ └──────┬───────┘ │ │ └────────┬────────┘ ▼ ┌──────────────┐ │ DEAD │ └──────────────┘

### The exact states may evolve.

### The important requirement is that lifecycle transitions have explicit semantics.

# 12.7 Genome Model

### The genome is not merely a JavaScript object containing random numbers.

### It is the system's heritable information substrate.

### Conceptually:

Genome │ ├── GenomeIdentity ├── ParentReferences ├── Chromosomal / Structural Data ├── Functional Genes ├── Regulatory Information ├── Developmental Instructions ├── Behavioural Parameters └── Mutation Metadata

### A future genome may therefore contain multiple representational layers:

GENOME │ ├── STRUCTURE ├── REGULATION ├── DEVELOPMENT ├── PHYSIOLOGY ├── BEHAVIOUR └── REPRODUCTION

### The architecture should not require all of these initially.

### It should simply avoid preventing them later.

# 12.8 Genome → Phenotype Separation

### The canonical causal chain is:

Genome ↓ Expression ↓ Development ↓ Phenotype

### not:

Genome ↓ direct body parameters

### The second approach can be useful for an early prototype.

### But the architecture must permit the first.

### Why?

### Because developmental processes create evolutionary phenomena that direct parameter mutation

### cannot reproduce naturally:

### developmental constraints

### pleiotropy

### modularity

### gene regulation

### indirect encoding

### canalization

### robustness

### evolvability

# 12.9 Genotype and Phenotype

### The system must preserve the distinction:

GENOTYPE = heritable information

### versus:

PHENOTYPE = expressed organismal state

### Phenotype may include:

Morphology Physiology Behavioural tendencies Metabolism Sensory capability Actuator capability Developmental state

### The same genome may produce different phenotypes under different environmental conditions.

### Therefore:

Phenotype = f(Genome, Environment, DevelopmentalHistory)

### This is a foundational requirement for later ecological and developmental evolution.

# 12.10 Developmental State

### Development should maintain explicit state.

### Conceptually:

DevelopmentState ├── stage ├── age ├── developmentalClock ├── regulatoryState ├── morphologyState ├── tissue/structureState └── completionStatus

### Development should be capable of being:

### continuous

### multi-stage

### environmentally responsive

### partially stochastic

### genetically constrained

### without requiring the genome itself to encode the entire final structure.

# 12.11 Phenotype Architecture

### Phenotype should be treated as a potentially structured object.

Phenotype │ ├── Morphology │ ├── body structure │ ├── appendages │ └── geometry │ ├── Physiology │ ├── metabolism │ ├── energy │ └── homeostasis │ ├── Sensory System │ ├── vision │ ├── chemical │ ├── mechanical │ └── environmental │ └── Actuation ├── movement ├── manipulation └── communication

### This creates a pathway toward genuinely evolvable bodies.

# 12.12 Spatial State

### Spatial state should be separated from semantic identity.

### An organism may have:

SpatialState ├── position ├── velocity ├── acceleration ├── orientation ├── angularVelocity └── bounds

### The spatial index is not authoritative.

### For example:

Organism.position

### is authoritative.

SpatialHash.cells

### is derived infrastructure.

### The latter must be reconstructible.

# 12.13 Environment Model

### The environment must become a first-class entity.

### Conceptually:

Environment │ ├── Geometry ├── Fields │ ├── temperature │ ├── light │ ├── chemical │ └── pressure │ ├── Resources ├── Hazards ├── Boundaries ├── Environmental Dynamics └── Regeneration Processes

### The environment is not a static background.

### It should potentially evolve:

Environment(t+1) = G(Environment(t), Organisms(t), ExternalForces)

### This is what permits niche construction and ecological feedback.

# 12.14 Resource Model

### Resources should be explicit entities or fields.

### Examples:

Food Water Energy Nutrients Light Chemical substrates Shelter Space

### Resource state may include:

Resource ├── quantity ├── location ├── regenerationRate ├── accessibility ├── diffusionRate └── depletionState

### Resource consumption should create actual state changes.

# 12.15 Population Model

### A population is not merely:

organisms.filter(...)

### It is a domain-level aggregate.

### Conceptually:

Population ├── populationId ├── members ├── lineage ├── demographicState ├── reproductiveState ├── geneticStatistics └── ecologicalStatistics

### Population-level derived metrics can include:

### population size

### mean genome distance

### diversity

### mortality

### birth rate

### reproductive variance

### phenotype distribution

### lineage distribution

# 12.16 Lineage Model

### Lineage should be a first-class historical structure.

### Conceptually:

Ancestor │ ├── Child A │ ├── Grandchild A1 │ └── Grandchild A2 │ └── Child B └── Grandchild B1

### A lineage node should record:

LineageNode ├── organismId ├── parentIds ├── offspringIds ├── birthTick ├── deathTick ├── genomeReference └── ancestry metadata

### This enables:

### phylogenetic analysis

### lineage fitness

### evolutionary transitions

### population bottleneck analysis

### ancestry reconstruction

# 12.17 Reproduction Model

### Reproduction should be an explicit domain process.

### Conceptually:

Parent Selection ↓ Mating / Reproductive Interaction ↓ Gamete / Genetic Contribution ↓ Recombination ↓ Mutation ↓ Offspring Genome ↓ Development ↓ Birth

### The offspring should not simply be:

clone(parent)

### unless cloning is the explicit model.

# 12.18 Mutation Model

### Mutation should be represented as an explicit transformation.

Genome(t) + MutationContext ↓ MutationOperator ↓ Genome(t+1)

### Mutation types should eventually include:

Parameter mutation Gene mutation Deletion Duplication Insertion Inversion Recombination Regulatory mutation Structural mutation Developmental mutation

### Each should be independently measurable.

### This allows experiments such as:

### Does structural mutation produce qualitatively different evolutionary trajectories from

### parameter mutation?

# 12.19 Interaction Model

### Interactions should be explicit enough to support causal analysis.

### Conceptually:

Interaction ├── interactionId ├── tick ├── initiator ├── recipient ├── interactionType ├── location ├── inputs ├── consequences └── energy/resource transfer

### Examples:

Predation Competition Mating Cooperation Collision Communication ResourceConsumption

### This becomes extremely valuable for ecological analysis.

# 12.20 Energy Model

### If organisms are expected to evolve meaningful behaviour, energy/resource accounting should

### eventually become explicit.

### A minimal conceptual model:

Energy(t+1) = Energy(t) + intake

- basalCost

- movementCost

- interactionCost

- reproductionCost

### The exact biological realism is configurable.

### The architectural principle is:

### Organismal actions should have consequences that feed back into survival and

### reproduction.

### This is much more powerful than manually assigning fitness to desired behaviour.

# 12.21 Internal State

### An organism may require internal state beyond observable phenotype.

### Examples:

InternalState ├── hunger ├── fatigue ├── stress ├── memory ├── learned associations ├── reproductive drive └── internal predictions

### Not all simulations need these.

### But the model should allow them without redefining the organism architecture.

# 12.22 Sensor Model

### Sensors should produce observations, not direct world access.

### Conceptually:

WORLD STATE ↓ SENSORY INTERFACE ↓ PERCEPTION ↓ AGENT INTERNAL REPRESENTATION

### This distinction matters enormously.

### An organism with:

omniscient access to world state

### is not equivalent to one with:

limited local sensory information

### Partial observability can itself create evolutionary pressure.

# 12.23 Action Model

### Behaviour should generate actions/intents.

### For example:

Action ├── actorId ├── actionType ├── target ├── magnitude ├── direction └── duration

### The action is a proposal.

### The world determines whether it succeeds.

### Example:

MOVE_FORWARD ↓ Physics ↓ collision ↓ actual displacement

### rather than:

MOVE_FORWARD ↓ position += desiredDistance

### This preserves environmental resistance.

# 12.24 Authoritative / Derived / Ephemeral State Matrix

### Every state field should eventually be classified.

State Classification

Organism position Authoritative

Organism velocity Authoritative

Genome Authoritative

Energy Authoritative

Lifecycle state Authoritative

Environment quantity Authoritative

Spatial hash Derived

Render mesh Derived

UI selection Ephemeral

Cached neighbourhood Derived

Debug overlay Ephemeral

Population histogram Derived

RNG state Authoritative

Render interpolation Ephemeral

Serialized snapshot Representation of authoritative state

### This classification should become part of the development specification.

# 12.25 Canonical State Object

### A conceptual world state could therefore resemble:

WorldState │ ├── metadata │ ├── worldId │ ├── modelVersion │ ├── schemaVersion │ └── simulationTime │ ├── environment │ ├── resources │ ├── organisms │ ├── populations │ ├── lineages │ ├── interactions │ ├── rng │ └── globalState

### This does not mean the runtime should literally contain one enormous nested object.

### In fact, a high-performance implementation probably should not.

### The semantic model and physical memory layout should be allowed to diverge.

# 12.26 Semantic Model vs Runtime Representation

### This distinction is fundamental.

## Semantic model

### What the simulation means:

Organism Genome Environment Population Interaction

## Runtime representation

### How the computer stores it:

Typed arrays Sparse arrays SoA buffers Spatial grids Worker-local structures GPU buffers

### Therefore:

SEMANTIC MODEL ↓ EXECUTION REPRESENTATION ↓ HARDWARE

### rather than allowing hardware constraints to silently define the scientific model.

# 12.27 Data-Oriented Representation

### For large populations, the runtime may eventually use:

positionsX[] positionsY[]

velocityX[] velocityY[]

energy[] age[] populationId[]

genomeRefs[] lifecycleState[]

### rather than:

organisms[] = [ { position:..., velocity:..., energy:..., ... } ]

### The latter is often easier to reason about.

### The former can be dramatically more efficient.

### The architecture should support both through an abstraction boundary.

# 12.28 State Ownership

### Each state category should have an owner.

### Example:

PhysicsState owner → PhysicsSystem

GenomeState owner → Genetics

DevelopmentState owner → DevelopmentSystem

BehaviourState owner → BehaviourSystem

EnvironmentState owner → EnvironmentSystem

### Ownership means:

### This subsystem is responsible for defining valid transitions of this state.

### It does not necessarily mean only one function can ever access the data.

# 12.29 Mutation Authority

### The architecture should establish a strict principle:

### Systems may read broadly but should mutate narrowly.

### For example:

BehaviourSystem READ: organism sensory projection environment projection

WRITE: behaviour state action buffer

### It should not directly write:

environment.resources otherOrganism.energy population.members renderer.state

### Those changes belong to downstream systems that own them.

# 12.30 Transactional Tick Model

### A strong target architecture is:

STATE_t │ ├── read │ ├── generate intents │ ├── resolve interactions │ ├── calculate changes │ └── commit │ ▼ STATE_t+1

### This reduces hidden ordering dependencies.

### An implementation may use buffers:

CurrentState PendingChanges Events NextState

### The exact mechanism is flexible.

### The semantic property is not.

# 12.31 State Transition Ownership Graph

### A useful mental model is:

┌──────────────┐ │ CURRENT │ │ WORLD STATE │ └──────┬───────┘ │ ┌───────────┼───────────┐ ▼ ▼ ▼ Physics Behaviour Ecology │ │ │ └──────┬────┴────┬──────┘ ▼ ▼ Effects Interactions │ │ └────┬────┘ ▼ Resolution │ ▼ Next State

### This is the foundation for deterministic parallelization later.

# 12.32 Canonical Event Schema

### A domain event should minimally contain:

Event ├── eventId ├── eventType ├── worldId ├── tick ├── timestamp ├── actorIds ├── targetIds ├── payload └── modelVersion

### Events should be immutable.

### The event stream should never become a hidden command bus.

# 12.33 Canonical Observation Schema

### An observation should minimally contain:

Observation ├── observationId ├── experimentId ├── runId ├── worldId ├── tick ├── observationType ├── subject ├── value ├── units ├── provenance └── modelVersion

### This allows a measurement to answer:

### What was measured, where, when, from which run, under which model?

# 12.34 Provenance Model

### Every scientifically meaningful artifact should be traceable.

Result ↓ Analysis ↓ Observations ↓ Run ↓ Replicate ↓ Experiment ↓ Model Version ↓ Code / Configuration

### The system should never produce an important result with an unknown provenance chain.

# 12.35 Versioned Domain Schemas

### All persistent representations should have:

schemaVersion modelVersion

### These represent different concepts.

## Schema version

### How the data is encoded.

## Model version

### What the simulation means.

### For example:

schemaVersion = 4 modelVersion = "ecology-v2-development-v1"

### A schema migration does not necessarily mean the scientific model changed.

### A model change may invalidate direct comparison even if the schema remains identical.

# 12.36 Null / Missing / Dead Semantics

### The system should avoid ambiguous representations such as:

null undefined 0 false inactive

### all meaning “dead.”

### Lifecycle semantics must be explicit.

### For example:

LifecycleState.DEVELOPING LifecycleState.ACTIVE LifecycleState.DYING LifecycleState.DEAD

### Likewise, absence from an active population should not automatically imply destruction of historical

### identity.

### A dead organism may still exist in:

history lineage analysis

# 12.37 Historical vs Active State

### The system should distinguish:

ACTIVE STATE

### from:

HISTORICAL RECORD

### For example:

activeOrganisms

### may contain 10,000 organisms.

### The lineage database may contain:

1,400,000 historical organisms

### These should not be conflated.

### This distinction enables evolutionary analysis without forcing historical entities to remain active in the

### simulation kernel.

# 12.38 State Compression

### Long-running simulations cannot necessarily retain every full state.

### The architecture should eventually support:

Full Snapshot + Event Stream + Aggregated Observations + Lineage Records

### Potential strategy:

Tick 0 FULL Tick 1000 FULL Tick 2000 FULL ... Between EVENTS / DELTAS

### This supports replay while controlling storage.

# 12.39 Checkpoint Contract

### A checkpoint must capture enough state to continue execution.

### At minimum:

Checkpoint ├── world state ├── simulation tick ├── simulation time ├── RNG state ├── model version ├── schema version ├── experiment identity └── execution-relevant configuration

### A checkpoint that restores visual state but not RNG state is not a valid scientific checkpoint.

# 12.40 Branching State

### Historical branching should conceptually work like:

Snapshot(t) │ ┌─────────┴─────────┐ ▼ ▼ Baseline Intervention │ │ ▼ ▼ Trajectory A Trajectory B

### The branch should inherit:

### world state

### genome state

### environment

### RNG state

### model version

### provenance

### but receive a new branch identity.

# 12.41 Counterfactual Contract

### A counterfactual experiment should differ from its parent by a declared intervention.

### Example:

Parent: environment.temperature = 20°C

Counterfactual: environment.temperature = 25°C

### Everything else should remain identical wherever possible.

### This is vastly more scientifically useful than simply launching another unrelated random run.

# 12.42 Configuration Model

### Configuration should be divided by domain.

### Avoid:

config

### as one enormous global object.

### Prefer:

SimulationConfig PhysicsConfig EnvironmentConfig GeneticsConfig DevelopmentConfig BehaviourConfig EcologyConfig ExperimentConfig ObservationConfig ExecutionConfig RenderingConfig

### Then compose:

SimulationConfiguration ├── model ├── world ├── genetics ├── development ├── behaviour ├── ecology ├── experiment ├── observation └── execution

### This allows experiments to vary one domain without unintentionally modifying unrelated domains.

# 12.43 Immutable Experiment Definition

### Once a run begins, the experiment definition should be treated as immutable.

Experiment Definition │ └── frozen │ ▼ Replicate

### Runtime state may change.

### Experimental specification should not silently mutate.

### If it changes, create:

new experiment version

### or:

new experiment

# 12.44 Domain vs Presentation Data

### The UI may want:

selectedOrganism cameraPosition zoom trailVisibility colourMode renderQuality

### None of these belong in the World domain model.

### Likewise, simulation code should not know:

selectedOrganism currentPanel cameraZoom

### This separation is mandatory.

# 12.45 Canonical State Flow

### The entire domain model can now be expressed as:

EXPERIMENT │ ▼ INITIAL WORLD │ ┌─────────┴─────────┐ │ │ ▼ ▼ ENVIRONMENT POPULATION │ │ │ ┌─────┴─────┐ │ ▼ ▼ │ GENOME DEVELOPMENT │ │ │ │ └─────┬─────┘ │ ▼ │ PHENOTYPE │ │ │ ▼ │ BEHAVIOUR │ │ └────────────┬──────┘ ▼ ECOLOGY │ ▼ CONSEQUENCES │ ┌────────┴────────┐ ▼ ▼ SURVIVAL REPRODUCTION │ │ └────────┬────────┘ ▼ HEREDITY │ ▼ NEXT GENERATION

### This is the canonical evolutionary state machine the implementation should converge toward.

# 12.46 The Most Important Data-Model Principle

### The architecture should make it difficult to accidentally encode:

desired outcome

### into:

state representation

### For example, instead of:

Organism { fitness, intelligence, interestingness, survivalScore }

### prefer causal variables:

Organism { energy, health, age, reproductiveState, sensoryCapabilities, morphology, behaviour, environmentInteractions }

### Then:

fitness

### can be measured from consequences rather than becoming a magical property that drives them.

# 12.47 Domain Model Acceptance Criteria

### The domain architecture should eventually pass these tests.

## Test A — Genome separation

### Two organisms can share equivalent genomes while remaining distinct organisms.

## Test B — Phenotype plasticity

### The same genome can potentially produce different phenotypes under different

### environmental/developmental conditions.

## Test C — Historical persistence

### Dead organisms remain analyzable without remaining active.

## Test D — Reproducible checkpoint

### Restoring a checkpoint reproduces the same subsequent trajectory.

## Test E — Branch independence

### A counterfactual branch cannot mutate its parent's historical state.

## Test F — Observation purity

### Measurements cannot alter domain state.

## Test G — Renderer independence

### Changing rendering settings cannot alter domain state.

## Test H — Explicit lifecycle

### Birth and death are domain transitions, not arbitrary array operations.

## Test I — Explicit causality

### Actions generate consequences through world mechanisms rather than directly setting desired

### outcomes.

## Test J — Provenance

### Every experimental observation can be traced back to its originating run and model version.

# 12.48 Part 12 Synthesis

### The domain model now has a clear conceptual hierarchy:

EXPERIMENT │ ▼ RUN │ ▼ WORLD │ ├── ENVIRONMENT │ ├── RESOURCES │ ├── POPULATIONS │ │ │ └── ORGANISMS │ │ │ ├── GENOME │ ├── DEVELOPMENT │ ├── PHENOTYPE │ ├── PHYSIOLOGY │ ├── BEHAVIOUR │ └── LIFECYCLE │ ├── INTERACTIONS │ └── RNG / CLOCK

### Surrounding it:

HISTORY │ ▼ WORLD ───────► OBSERVATION ───────► ANALYSIS │ └──────────────► EXECUTION

### The crucial architectural separation is:

WHAT EXISTS │ ▼ DOMAIN STATE │ ▼ WHAT CHANGES │ ▼ SYSTEMS │ ▼ WHAT OCCURRED │ ▼ EVENTS │ ▼ WHAT WE MEASURE │ ▼ OBSERVATIONS

### This provides the foundation for the next layer.

# Part 12 → Part 13

### The next specification should move from what the system contains to exactly how it changes.

# Part 13 — Master Technical Specification: Simulation Kernel, Tick

# Semantics & Deterministic State Transition Architecture

### That section will define the canonical execution pipeline in considerably more depth, including:

### tick lifecycle

### phase ordering

### read/write boundaries

### double buffering

### state transition semantics

### system scheduling

### conflict resolution

### event generation

### deterministic RNG streams

### numerical integration

### collision/interactions

### parallel execution

### deterministic reduction

### rollback

### checkpoint/replay

### failure recovery

### headless execution

### causal invariants

### kernel-level testing

### Most importantly, it will establish the formal execution contract:

STATE(t) ↓ OBSERVE ↓ DECIDE ↓ ACT ↓ INTERACT ↓ RESOLVE ↓ UPDATE ↓ REPRODUCE ↓ INHERIT ↓ COMMIT ↓ STATE(t+1)

### That becomes the actual temporal skeleton upon which the evolutionary and ecological architecture can

### safely operate.

Cloudflare

Start building for free Deploy serverless functions globally in seconds with Cloudflare Workers.

Ad

Printed using ChatGPT to PDF, powered by PDFCrowd HTML to PDF API. 1/1