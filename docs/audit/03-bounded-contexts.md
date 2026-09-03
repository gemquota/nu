# Part 3/10 — Bounded Contexts & Architectural Paradigm

> **Status: [source]** — from the PDF export, cleaned of transcript artifacts. Diagrams re-flowed from flattened single-line form.

## 3.0 The Step Before

### The next step is to stop looking at the codebase as a collection of modules and instead ask:

### What conceptual subsystems does the simulation actually contain, and where are the boundaries between them?

### This is important because the system is not fundamentally a "simulation program." It is closer to a layered artificial-life research platform containing a simulation kernel, an evolutionary/law system, an experimental framework, an observation system, and a presentation layer.

## 3.1 The Conceptual Architecture

### At the highest level, the system can be represented approximately as:

```
┌─────────────────────────┐
│       USER / UI         │
└────────────┬────────────┘
             │
             ▼
┌─────────────────────────┐
│      OBSERVATION        │
│  metrics / visualization│
│  telemetry / inspection │
└────────────┬────────────┘
             │
             ▼
┌───────────────────────────────────────────────────────────────────┐
│                     EXPERIMENTAL WORLD                            │
│                                                                   │
│  ┌──────────────┐   ┌──────────────┐   ┌────────────────────┐     │
│  │    World     │   │  Organisms   │   │    Environment     │     │
│  └──────┬───────┘   └──────┬───────┘   └─────────┬──────────┘     │
│         │                  │                     │                │
│         └──────────────────┼─────────────────────┘                │
│                            ▼                                      │
│                   ┌────────────────┐                              │
│                   │   SIMULATION   │                              │
│                   │     KERNEL     │                              │
│                   └───────┬────────┘                              │
│                           │                                       │
└───────────────────────────┼───────────────────────────────────────┘
                            │
              ┌─────────────┴─────────────┐
              ▼                           ▼
      ┌────────────────┐          ┌────────────────┐
      │   LAW SYSTEM   │          │    GENETICS    │
      │  physics/rules │          │  mutation/etc. │
      └────────────────┘          └────────────────┘
              │                           │
              └────────────┬──────────────┘
                           ▼
                  ┌────────────────┐
                  │  HISTORY /     │
                  │    STATE       │
                  └────────────────┘
```

### The crucial observation is that these aren't all the same kind of thing.

### Some are domains.

### Some are mechanisms.

### Some are representations.

### Some are experimental infrastructure.

### And some are interfaces to the underlying system.

### The architecture becomes considerably clearer once those categories are separated.

## 3.2 The Simulation Kernel

### The kernel is the most fundamental subsystem.

### Conceptually it answers:

### Given the current world state and the governing rules, what is the next world state?

### That gives the fundamental transition:

```
State(t)
   │
   │ simulation step
   ▼
Rules + interactions + dynamics
   │
   ▼
State(t+1)
```

### Everything else ultimately depends on this transition.

### The kernel therefore represents the closest thing the project has to a computational ontology.

### It determines what can exist, what can interact, and how causality propagates.

### A useful conceptual decomposition is:

```
Simulation Kernel
│
├── State
├── Time
├── Entities
├── Interactions
├── Dynamics
├── Constraints
└── Transition
```

### This distinction matters enormously.

### For example, rendering should not determine simulation state.

### Statistics should not determine simulation state.

### Experiment orchestration should not determine simulation state.

### They should observe or configure the kernel.

### The kernel should remain capable of operating without them.

## 3.3 The Law System

### The next boundary is more interesting.

### The simulation does not merely contain objects. It contains rules governing those objects.

### That makes the law system conceptually distinct from the kernel.

### Think of it as:

```
Kernel     = mechanism for evolving state
Law System = rules determining how state evolves
```

### This distinction creates a potentially powerful abstraction:

```
┌────────────────┐
│   Simulation   │
│     Kernel     │
└───────┬────────┘
        │
        ▼
┌────────────────┐
│  Law Interface │
└───────┬────────┘
        │
   ┌────┴─────────────────┼─────────────────┐
   ▼                      ▼                 ▼
Physics               Biology          Environment
 laws                   laws               laws
```

### This is architecturally significant because it opens the possibility that the simulation's rules themselves become experimental variables.

### That is much more sophisticated than merely evolving organisms inside a fixed simulator.

### You potentially have two evolutionary levels:

```
Level 1  Organisms evolve within the world
Level 2  The rules governing organisms can themselves vary
```

### That moves the project toward a meta-evolutionary simulation architecture.

## 3.4 World / Domain Model

### The world is another distinct conceptual boundary.

### It represents the persistent state in which the simulation occurs:

```
World
│
├── Spatial state
├── Environmental state
├── Entities
├── Resources
├── Physical structures
├── Organisms
└── Temporal state
```

### The important architectural question is whether the world is treated as:

### a passive data container

### or

### an active domain model.

### The latter is substantially more powerful.

### A mature architecture would ideally make the world represent domain truth, while the simulation engine performs transitions against that truth.

### In other words:

```
World  = what exists
Kernel = how it changes
```

### That distinction should remain extremely clear.

## 3.5 Genetics as Its Own Bounded Context

### Genetics deserves its own boundary because it represents a fundamentally different abstraction from physics.

### Physics asks:

### What happens when entities interact?

### Genetics asks:

### What information is inherited, altered, expressed, and transmitted?

### Conceptually:

```
Genome
│
├── Mutation
├── Recombination
├── Inheritance
├── Expression
└── Phenotype
        │
        ▼
    Organism
```

### The dangerous architectural mistake would be collapsing genome and organism into one object.

### A stronger conceptual model is:

```
GENOTYPE
   │
   │ expression
   ▼
PHENOTYPE
   │
   │ interaction
   ▼
 WORLD
```

### That gives the simulation an explicit genotype → phenotype → environment causal chain.

## 3.6 Lifecycle

### The lifecycle subsystem sits between genetics and simulation.

### It answers questions such as:

```
Birth
  ↓
Development
  ↓
Growth
  ↓
Interaction
  ↓
Reproduction
  ↓
Mutation / inheritance
  ↓
Death
```

### This is fundamentally different from raw physics.

### A physics engine might calculate forces.

### It does not inherently know what birth means.

### Likewise, genetics may describe mutation.

### It does not inherently determine when an organism reproduces.

### Lifecycle therefore represents biological semantics layered over physical dynamics.

### That distinction is one of the most important architectural boundaries in the entire system.

## 3.7 Experimentation / Multiplexing

### The experiment subsystem is conceptually above the simulation.

### It should not define what the world is.

### Instead, it defines how worlds are instantiated, varied, compared, and measured.

### For example:

```
Experiment
│
├── Configuration
├── Initial conditions
├── Random seed
├── Population
├── Parameters
├── Replication
├── Duration
├── Measurements
└── Results
```

### This allows:

```
Experiment A          Experiment B
├── seed 1            ├── seed 1
├── seed 2            ├── seed 2
└── seed 3            └── seed 3
```

### The distinction is critical:

### The simulation produces a trajectory.

### The experiment produces knowledge from trajectories.

### That is a much higher-level abstraction.

## 3.8 Observation and History

### Observation should conceptually be downstream of simulation.

```
Simulation
     │
     ▼
State transitions
     │
     ├──────────► Metrics
     ├──────────► Events
     ├──────────► Snapshots
     └──────────► Visualization
```

### History is particularly important because the system isn't merely representing the current world.

### It is potentially representing:

### the evolution of a world through time.

### That creates a second major data model:

```
Current State + Temporal State
```

### A mature architecture should treat historical state as a first-class concept rather than an incidental logging mechanism.

## 3.9 Renderer / UI

### The renderer belongs firmly outside the simulation domain.

### Its conceptual relationship should be:

```
Simulation
     │
     │ read-only projection
     ▼
Visualization Model
     │
     ▼
  Renderer
     │
     ▼
    UI
```

### Not:

```
UI
 │
 ▼
Simulation internals
```

### The distinction matters because a simulation may eventually run:

### headless

### remotely

### at accelerated time

### in batch experiments

### inside workers

### without a browser

### If the simulation requires the UI to function, the architecture has accidentally coupled research infrastructure to presentation.

## 3.10 Workers and Infrastructure

### Workers are not part of the domain.

### They are an execution strategy.

### That means:

```
Domain
   │
   ▼
Simulation API
   │
   ┌────────┼────────┐
   ▼        ▼        ▼
Worker A Worker B Worker C
```

### The simulation should conceptually not care whether it is running:

```
in the browser
in Node
in a worker
on another machine
in batch mode
```

### That is infrastructure.

### Keeping this distinction clean is what makes future distributed experimentation possible.

## 3.11 The Deeper Architectural Pattern

### Taken together, the project resembles a hybrid of:

### Domain-driven architecture + discrete-event simulation + artificial-life engine + experimental laboratory.

### Its natural hierarchy is approximately:

```
EXPERIMENT
     │
   ┌─┴─────────┐
   │           │
Analysis  Replication
   │           │
   └─────┬─────┘
         ▼
      WORLD
         │
   ┌─────┴─────────┐
   ▼               ▼
ORGANISMS     ENVIRONMENT
   │               │
   └───────┬───────┘
           ▼
    SIMULATION KERNEL
           │
   ┌───────┴─────────┐
   ▼                 ▼
 LAWS              TIME
                     │
                     ▼
                TRANSITION
```

### And surrounding all of it:

```
┌───────────────────────────┐
│      INFRASTRUCTURE       │
│  workers / persistence /  │
│  serialization / runtime  │
└─────────────┬─────────────┘
              │
      ┌───────┴──────────────────┐
      ▼                          ▼
Simulation                  Experiment
      │                          │
      ▼                          ▼
Observation ──────────────► Analysis
      │
      ▼
     UI
```

### This is the architectural shape the system is implicitly moving toward.

### The key issue is that the codebase may not yet enforce these boundaries as strongly as the conceptual model suggests.

### That gap—between the architecture the system appears to want and the architecture the implementation actually guarantees—is where many of the deeper problems emerge.

### Part 4/10 will examine that gap: architectural coupling, dependency direction, hidden state, and where the system's conceptual boundaries are likely being violated.
