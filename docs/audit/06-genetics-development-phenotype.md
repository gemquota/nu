# Part 6/10 — Genetics, Development & Phenotype

> **Status: [filled-in]** — follows the audit sequence. Content is constrained by Part 3 §3.5 (genetics as bounded context, the genotype→phenotype→environment chain) and formalized later by Part 12 §§12.7–12.11 (genome model, genome→phenotype separation, developmental state).

## 6.1 What Evolves

Parts 4–5 examined structure and time. This part examines the substrate of evolution itself: the heritable information, the process that turns it into an organism, and the separation between the two. Part 3's warning governs the whole layer: *the dangerous architectural mistake would be collapsing genome and organism into one object.*

## 6.2 The Canonical Causal Chain

The architecture the system is moving toward (Parts 3, 11, 12 agree on this chain):

```
Genome
   ↓
Expression
   ↓
Development
   ↓
Phenotype
   ↓
(interaction with the world)
```

Not:

```
Genome
   ↓
direct body parameters
```

The direct approach is acceptable for an early prototype, but the architecture must permit the first, because development creates evolutionary phenomena that direct parameter mutation cannot reproduce naturally: developmental constraints, pleiotropy, modularity, gene regulation, indirect encoding, canalization, robustness, and evolvability (Part 12 §12.8).

## 6.3 Genotype ≠ Phenotype ≠ Lineage ≠ Organism

Four identities that must never collapse into one (Part 12 §12.4):

```
GENOTYPE   = heritable information
PHENOTYPE  = expressed organismal state
ORGANISM   = a situated instance with its own identity and lifecycle
LINEAGE    = the historical ancestry structure
```

Phenotype is a function of genome *and* environment *and* developmental history:

```
Phenotype = f(Genome, Environment, DevelopmentalHistory)
```

The audit question: in the current code, is there one identifier where there should be four? Can two organisms share an equivalent genome and remain distinct organisms? Can the same genome produce different phenotypes under different conditions? If not, the domain model (Part 12's acceptance Tests A and B) cannot pass.

## 6.4 Development as an Interpreter

The mature model treats development as an interpreter (Part 11 §11.18):

```
Genome + Environment + Developmental State
        │
        ▼
Developmental Process
        │
        ▼
     Phenotype
```

Development keeps explicit state — stage, clock, regulatory state, morphology state (Part 12 §12.10) — and may be continuous, multi-stage, environmentally responsive, partially stochastic, and genetically constrained without the genome encoding the final structure.

## 6.5 Mutation Is Not Evolution

Part 11 states the distinction this layer must respect:

> Mutation must not be synonymous with evolution. The genetics subsystem creates variation. The ecological/evolutionary system determines which variation persists.

Mutation should be an explicit, typed transformation (Part 12 §12.18) — parameter mutation, gene mutation, deletion, duplication, insertion, inversion, recombination, regulatory, structural, developmental — each independently measurable, so that experiments can ask whether different mutation classes produce qualitatively different trajectories.

## 6.6 Audit Findings to Establish

For this layer, the audit checklist is:

- Is the genome a first-class, versioned structure — or "a JavaScript object containing random numbers" (Part 12's phrase)?
- Are genotype, phenotype, organism, and lineage separably identified?
- Is there any developmental step between inheritance and body, or does mutation directly set body parameters?
- Is mutation explicit and typed, or ad-hoc numeric tweaking scattered across systems?
- Is heredity a domain process (Part 12 §12.17: parent selection → recombination → mutation → offspring genome → development → birth) rather than `clone(parent)`?

## 6.7 Why This Layer Decides the Project's Ceiling

Every phenomenon the project ultimately wants to claim — open-ended evolution, emergent ecological dynamics, evolvability — depends on this layer being causally honest. A flattened genome=organism model can display interesting visuals, but it cannot support the scientific claims the platform exists to make.

---

*Part 7/10 moves outward from the organism to its world: behaviour, ecology, and selection.*
