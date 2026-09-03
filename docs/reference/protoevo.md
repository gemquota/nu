# ProtoEvo — System Study: Simulating an Evolving Microcosmos

> **Status: [source]** — a user-supplied research summary of Dylan Cope's ProtoEvo / "Simulating an Evolving Microcosmos" project and its ALIFE paper, preserved as the canonical description of the system. Incorporated into this library as the primary comparable system for nu's architecture (see the [mapping](protoevo-to-nu-mapping.md) for how its mechanisms correspond to the Master Technical Specification).

## 1. What ProtoEvo fundamentally is

ProtoEvo is an interactive, real-time artificial-life ecosystem in which protozoan-like cells are subjected to physics, resource constraints, reproduction, mutation, and natural selection.

The important distinction is that it isn't primarily a conventional "creature evolution" simulation where an evolutionary algorithm directly optimizes a predefined genome toward a fitness function.

Instead, Cope constructs an ecological world in which organisms have to acquire resources, expend those resources to construct functional machinery, survive environmental interactions, reproduce, and compete. Selection emerges from those interactions.

The central research question is considerably more ambitious:

> Can multicellularity, cell differentiation, and increasingly complex biological organization emerge from relatively simple evolving cells?

The project specifically investigates how independent cells might evolve to become attached, cooperate, communicate, share resources, and eventually specialize.

## 2. The simulated world

The environment is fundamentally 2D and physically simulated.

There are several major categories of entities:

- protozoan cells
- plant cells
- dead/meat cells
- environmental structures/rocks
- chemical/pheromone fields
- the surrounding physical environment

The world is bounded by procedurally generated rigid bodies. Outside the playable ecosystem is effectively a hostile void without useful resources.

So there is an actual ecological cycle rather than simply `creature → eat food → reproduce`. It is closer to:

```
plants
   ↓
protozoa consume plants
   ↓
resources accumulated
   ↓
cell constructs machinery
   ↓
movement / sensing / feeding / reproduction
   ↓
protozoan dies
   ↓
resources become meat/debris
   ↓
other protozoa consume it
   ↓
resources re-enter ecosystem
```

This resource recycling is important because death itself becomes an ecological process.

## 3. Plants are not simply "food objects"

Plant cells form one of the primary resource bases.

They emit chemical pheromones, which diffuse through the environment and provide both:

1. nutritional resources
2. information about where resources are located

Protozoa can detect these chemical signals.

That means an organism can potentially evolve not merely to have more movement, but to sense gradients and navigate toward resources.

This creates an interesting evolutionary coupling:

```
environment
     │
     ▼
chemical field
     │
     ▼
sensory node
     │
     ▼
gene-regulatory network
     │
     ▼
motor node
     │
     ▼
movement
```

Consequently, sensing and behaviour can co-evolve.

## 4. Protozoa have no permanently fixed morphology

This is one of the most important aspects of ProtoEvo.

An organism isn't born with a predetermined body plan like:

```
BODY
 ├── mouth
 ├── eyes
 ├── legs
 └── brain
```

Instead, it possesses resources and a developmental/control system capable of constructing functional components.

The cell surface can acquire different nodes, including things such as:

- flagella
- photoreceptors
- adhesion receptors
- receptors associated with feeding
- other functional components

These nodes effectively become the organism's physical interface with the world.

So morphology itself becomes an evolvable phenotype.

## 5. The really clever part: functional nodes

The surface-node architecture is arguably the most interesting part of the simulation.

Think of a node as a modular biological organ.

A node has an interface to the organism's internal regulatory system.

For example:

```
CELL
                     │
          ┌──────────┴──────────┐
          │                     │
      INTERNAL GRN          SURFACE NODES
          │                     │
          │          ┌──────────┼──────────┐
          │          │          │          │
          ▼          ▼          ▼          ▼
       signals   flagellum  receptor  adhesion
```

The key idea is that the regulatory machinery and the physical machinery are somewhat decoupled.

A developmental/regulatory pathway can therefore potentially remain useful even if the physical component it controls changes.

Cope describes this as allowing existing genetic/control pathways to be repurposed rather than requiring evolution to invent completely new control structures for every new function.

This is a major departure from simplistic evolutionary simulations.

## 6. Artificial gene regulation

The organism's controller is modelled using an artificial neural network that simultaneously acts as a gene-regulatory network.

This is fundamental to the project.

Rather than having:

```
GENOME → BODY
```

the architecture is more like:

```
GENOME / REGULATORY SYSTEM
                           │
                           ▼
                   artificial GRN
                           │
            ┌──────────────┼──────────────┐
            ▼              ▼              ▼
        construct       sensory        behavioural
         nodes           inputs          outputs
            │              │              │
            └──────────────┴──────────────┘
                           │
                           ▼
                       phenotype
```

The same regulatory system therefore participates in both development and behaviour.

That means evolution can modify:

- what physical structures develop
- how many develop
- what signals activate them
- how sensory information affects them
- how one part of the organism influences another

This coupling is what makes developmental evolution possible.

## 7. Complex molecules

Another layer sits between the organism's resources and its functional machinery.

ProtoEvo models complex molecules as discrete molecular types represented by signatures in the interval [0,1].

They are conceptually analogous to proteins.

They have three particularly important roles:

**A. They implement functions.** Complex molecules ultimately enable cellular machinery to operate.

**B. They participate in lock-and-key interactions.** This allows molecular interactions to function as conditional switches.

**C. Their production is regulated.** The gene-regulatory system determines which molecules the organism invests resources into producing.

So the chain becomes approximately:

```
environmental resources
       ↓
mass + energy
       ↓
complex molecules
       ↓
functional construction
       ↓
cellular machinery
       ↓
phenotype
```

This introduces an additional evolutionary bottleneck: organisms must not merely possess a genetic instruction but must be able to pay the energetic/material cost of expressing it.

## 8. Energy and construction mass

ProtoEvo distinguishes different forms of resources.

Broadly:

```
MASS
ENERGY
COMPLEX MOLECULES
```

are involved in maintaining and constructing organisms.

Food therefore isn't simply `+10 HP`. Instead, consumption provides resources that can subsequently be allocated to competing biological purposes.

For example:

```
FOOD
               │
       ┌───────┴────────┐
       ▼                ▼
     ENERGY            MASS
       │                │
       ▼                ▼
 movement           construction
       │                │
       └───────┬────────┘
               ▼
         functional nodes
```

That creates genuine opportunity costs.

- An organism investing heavily in movement has fewer resources available for growth.
- An organism investing in sensory machinery has fewer resources available for reproduction.
- An organism investing in adhesion may sacrifice individual mobility in exchange for multicellular cooperation.

This is where evolutionary trade-offs become interesting.

## 9. Reproduction

The basic reproductive mechanism is cell division.

An organism has to acquire sufficient resources to reproduce.

Consequently, there is no externally imposed "fitness score" saying: *"this organism is good."*

Instead:

```
Can it obtain resources?
        ↓
Can it survive?
        ↓
Can it accumulate enough resources?
        ↓
Can it reproduce?
        ↓
Do its descendants reproduce?
```

Fitness emerges from ecological success.

That is one reason the project is closer to an artificial ecosystem than a conventional genetic algorithm.

## 10. Mutation and inheritance

Offspring inherit the parent's underlying regulatory/genetic machinery, with mutations producing variation.

This variation can alter both:

- morphology/development
- behaviour/control

Consequently, selection acts on an integrated genotype–phenotype system.

A mutation could potentially produce changes such as:

- more flagella
- less flagella
- different receptor
- different regulatory response
- different adhesion behaviour
- different sensory pathway
- different construction behaviour

The crucial thing is that these aren't independent manually programmed evolutionary traits. They interact through the regulatory architecture.

## 11. Multicellularity is the central experiment

This is where ProtoEvo becomes much more interesting than a standard evolving-particles simulation.

Cope specifically wants to see whether independently reproducing cells can evolve stable multicellular associations.

The mechanism begins with adhesion.

Cells can evolve surface components that allow them to attach to other cells.

Then:

```
CELL A ←→ CELL B
```

can become:

```
CELL A ←→ CELL B ←→ CELL C
```

and potentially:

```
CELL
      /    \
    CELL  CELL
      \    /
       CELL
```

At this point the evolutionary unit potentially changes.

Instead of selection operating exclusively on *individual cells*, it can begin operating on *groups of cooperating cells*.

## 12. Why adhesion alone isn't enough

Simply making cells stick together wouldn't necessarily produce useful multicellularity.

In fact, adhesion could be costly. An attached cell may lose:

- mobility
- access to food
- independence
- reproductive opportunities

Therefore, multicellularity requires some compensating benefit.

The simulation allows attached cells to share resources and signals, making cooperation potentially advantageous.

That produces an evolutionary problem approximately like:

```
Individual lifestyle          Multicellular lifestyle

      CELL                     CELL ←→ CELL
       │                         │       │
       ├── finds food            ├───────┤
       ├── moves                 │ shared │
       └── reproduces            │resource│
                                 │signals │
                                 ▼       ▼
                          specialised collective
```

The evolutionary question is whether the second architecture can outperform the first.

## 13. Cell specialization

This is arguably the project's ultimate target.

Once cells are attached, they don't necessarily need to remain identical. Instead:

```
CELL A → feeding
CELL B → sensing
CELL C → movement
CELL D → reproduction
```

could emerge.

That is essentially division of labour.

And the fascinating aspect is that Cope's architecture makes this plausible without explicitly programming "cell type A should become a feeding cell."

Instead, specialization can arise because different cells within a collective experience different regulatory inputs and evolutionary pressures.

The paper reports the emergence of multicellular cell specialization as one of its key results.

## 14. Repurposing existing pathways

Here is perhaps the deepest conceptual idea in the whole system.

Suppose a regulatory pathway initially evolves:

```
chemical signal
      ↓
regulatory pathway
      ↓
flagellum
      ↓
movement
```

Now suppose the physical node associated with the pathway mutates into something else. For example:

```
chemical signal
      ↓
same regulatory pathway
      ↓
adhesion node
      ↓
signal another cell
```

The evolutionary system has effectively repurposed an existing piece of biological machinery.

Cope explicitly designed the surface-node/IO architecture to facilitate this kind of evolutionary exaptation.

That is important because real biological evolution frequently works by modifying and recombining existing mechanisms rather than inventing everything from scratch.

## 15. Information can cross cells

Once adhesion and signalling are available, the regulatory network effectively becomes capable of extending beyond a single cell.

Conceptually:

```
CELL A

sensory input
     ↓
   GRN
     ↓
adhesion/signalling node
     │
     │
     ▼
─────────────────────
     │
     ▼
CELL B

signal input
     ↓
   GRN
     ↓
construct photoreceptor
```

Cope gives essentially this kind of example in discussing evolved regulatory pathways between cells and functional nodes.

That opens the door to something much more profound than simple aggregation: **distributed biological computation.**

## 16. Death is part of the ecosystem

When a protozoan dies, it doesn't simply disappear.

Its resources are redistributed into newly created "meat" cells.

Those contain resources inherited from the dead organism, including things such as:

- stored energy
- construction mass
- complex molecules

Other protozoa can then consume them.

This creates a trophic cycle:

```
PLANTS
   ↓
PROTOZOA
   ↓
DEATH
   ↓
MEAT
   ↓
PROTOZOA
```

And meat is more energy-dense than plants, creating another ecological niche and another potential evolutionary strategy.

## 17. Physics matters

The organisms aren't merely points moving through an abstract mathematical space.

The environment contains actual physical interactions.

- Cells have bodies and surface structures that interact with the physical world.
- Rocks are rigid bodies.
- Cells collide.
- Cells can push each other.
- Multicellular structures physically deform.

The player can even interact directly with the physics. For example, the current simulation provides:

- cell grabbing/movement
- cell spawning
- cell killing via a lightning tool
- environmental shockwaves
- camera tracking
- physics debugging

The simulation therefore operates simultaneously as an evolutionary experiment and an interactive physics sandbox.

## 18. It is unusually interactive

The user isn't merely watching an offline evolutionary run.

You can actually intervene. The current project allows the observer to:

- pause/resume
- manipulate cells
- kill cells
- spawn cells
- follow particular organisms
- inspect detailed cellular statistics
- save individual organisms
- tag lineages
- load cells into other simulations
- run the simulation headlessly
- fork remote simulations locally

This makes it closer to an interactive scientific artificial-life laboratory than a conventional game.

## 19. Lineages become first-class objects

An especially useful feature is the ability to save cells as `.cell` files and attach tags to cells.

Tags propagate to descendants, making them useful for tracking evolutionary lineages.

That enables an experimental workflow such as:

```
run simulation
       ↓
observe interesting organism
       ↓
save organism
       ↓
tag lineage
       ↓
continue evolution
       ↓
observe descendants
       ↓
compare morphology/behaviour
```

So the system isn't merely designed to produce pretty emergent behaviour; it has infrastructure for investigating it.

## 20. The entire architecture in one diagram

A useful abstraction of ProtoEvo is:

```
┌─────────────────────┐
│     ENVIRONMENT     │
│                     │
│ plants / chemicals  │
│ rocks / physics     │
│ dead organisms      │
└──────────┬──────────┘
           │
    resources + signals
           │
           ▼
┌──────────────────────┐
│        CELL          │
│                      │
│  resources           │
│  complex molecules   │
│  regulatory network  │
│  surface nodes       │
└──────────┬───────────┘
           │
┌──────────┼──────────────────┐
▼          ▼                  ▼
sensing   movement          feeding
│          │                  │
└──────────┼──────────────────┘
           ▼
     resource gain
           ▼
   growth / construction
           ▼
      reproduction
           ▼
        mutation
           ▼
   natural selection
           ▼
┌────────────────────────┐
│      DESCENDANTS       │
└────────────┬───────────┘
             ▼
  increasingly complex
    morphologies /
      behaviours
             ▼
    adhesion evolves
             ▼
    MULTICELLULARITY
             ▼
     signal/resource
        sharing
             ▼
   CELL SPECIALIZATION
             ▼
    emergent organism
```

That final transition is the heart of the project.

## 21. What makes it different from a typical "evolution simulator"

| Conventional artificial-life creature sim | ProtoEvo |
|---|---|
| Fixed body | Body can develop |
| Fixed number of organs | Functional nodes can evolve |
| Genome directly controls traits | Genome/regulatory network controls development |
| Individual organisms | Potential multicellular collectives |
| Fitness function | Ecological selection |
| Abstract movement | Physical 2D environment |
| Food = scalar energy | Mass, energy and complex molecules |
| Neural network | Neural network + gene regulatory system |
| Evolution of individuals | Potential evolution of collectives |
| Predetermined specialization | Specialization can emerge |
| Dead organisms vanish | Dead organisms become resources |
| Offline evolutionary experiment | Real-time interactive ecosystem |

The project is therefore sitting at the intersection of:

**artificial life + evolutionary computation + developmental biology + neural networks + physics simulation + ecology.**

## 22. The really important conceptual insight

The most useful way to understand Cope's simulation — especially in relation to the simulation this library designs — is this:

> ProtoEvo isn't primarily trying to evolve increasingly complicated creatures. It is trying to create the conditions under which increasingly complicated biological organization becomes advantageous.

That is a subtle but enormous difference.

Instead of:

```
complexity ← evolutionary objective
```

it tries to establish:

```
environment
    ↓
resource constraints
    ↓
competition
    ↓
evolution
    ↓
new capabilities
    ↓
new ecological opportunities
    ↓
new selection pressures
    ↓
cooperation
    ↓
multicellularity
    ↓
specialization
    ↓
higher-level organization
```

That creates a **bootstrapping evolutionary process**.
