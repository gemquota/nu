# Part 14 — Genetics & Heredity Architecture

> **Status: [filled-in]** — Part 14 of the Master Technical Specification. The source PDF does not contain this part; it is written against the outline sections the document enumerates ([outline §7](00-outline.md)), the contracts it must implement (11 §§11.17, 11.10), and the domain model it must realize (12 §§12.4, 12.7–12.9, 12.16–12.18). The [ProtoEvo mapping](../reference/protoevo-to-nu-mapping.md) §5.1 supplies the reference mechanisms (surface-node modules, regulation/effector decoupling, expression cost).

## 14.0 Scope and dependencies

Part 14 specifies the **genetics subsystem**: the heritable information substrate, the operators that transform it, and the boundary between creating variation and selecting it.

Depends on: [Part 11](11-target-architecture-and-system-contracts.md) §§11.5 (system contracts), 11.10 (randomness), 11.17 (genetics contract); [Part 12](12-domain-model-and-state-architecture.md) §§12.4 (organism ≠ genome), 12.7–12.9 (genome model, genome→phenotype separation, genotype/phenotype), 12.16 (lineage), 12.17–12.18 (reproduction, mutation); [Part 13](13-simulation-kernel-and-tick-semantics.md) §§13.2 (phase→stream mapping), 13.6 (scheduling).

The governing contract, restated from §11.17:

> **Mutation must not be synonymous with evolution.** The genetics subsystem creates variation. The ecological/evolutionary system determines which variation persists.

## 14.1 Genome as information substrate

The genome is an immutable, versioned value object — never a mutable bag of numbers (§12.7). Canonical structure:

```
Genome
├── genomeId          — stable, content-derived identity
├── parents           — parent genome references (lineage edges, §12.16)
├── layers            — ordered gene layers (see 14.2)
├── metadata          — modelVersion, createdTick, operator history
└── formatVersion     — genome schema version (§11.25)
```

Rules:

- **G1 (Identity).** `genomeId` identifies information, not organisms. Two organisms may share a genomeId; two genomes may not share a genomeId (Test A, §12.47).
- **G2 (Immutability).** Genomes are never edited in place. Every operator produces a new genome with a new identity; the old genome remains valid for as long as any organism, lineage node, or checkpoint references it.
- **G3 (Versioning).** A genome records the genome-format version that produced it. Checkpoints may restore genomes of older format versions, but the interpretation is fixed by that version (§11.25).

The current implementation's `Genome` (a single regulatory layer of five genes) is a valid *stage-0* genome under this part: it satisfies G1–G3 and the layer registry below simply starts with one entry.

## 14.2 Gene layers

The genome is a registry of **layers**, each independently versioned and independently mutable (§12.7's multi-layer sketch):

```
GENOME LAYERS
├── REGULATION     — expression weights; wiring from inputs → outputs
├── STRUCTURE      — which phenotype modules may be constructed (14.3)
├── DEVELOPMENT    — when and in what order modules are expressed
├── PHYSIOLOGY     — metabolism, cost coefficients
├── BEHAVIOUR      — policy parameters over observations
└── REPRODUCTION   — thresholds, investment, gamete parameters
```

Rules:

- **G4 (Layer registry).** A genome format declares which layers it carries. Layers are optional by design: a minimal genome may carry only REGULATION and PHYSIOLOGY (this is exactly the current null-model genome).
- **G5 (No cross-layer shortcuts).** A system may read a layer only through its declared contract reads; phenotype construction may not reach into BEHAVIOUR to decide morphology (that is DEVELOPMENT's role — §11.18).
- **G6 (Independent measurability).** Every mutation operator names the layer it acts on, so the count of structural vs parameter vs regulatory mutations is a first-class observation (§12.18).

## 14.3 Expression and the material bottleneck

Expression is the causal chain (§12.8):

```
Genome → Expression → Development → Phenotype
```

Part 15 owns Development; Part 14 owns what feeds it. The key mechanism adopted from ProtoEvo (mapping §2.3):

> **Expression must be paid for.** Constructing a phenotype module consumes mass/energy/molecules; possessing a gene does not.

Consequences:

- **G7 (Expression cost).** The `express` operation returns a *construction request* (module type, placement, cost estimate), not a phenotype. The developmental system pays the cost from organismal resources before the module exists.
- **G8 (Bottleneck observability).** Expression failures (insufficient resources) are domain events, not silent no-ops — they are data for asking whether organisms evolve cheaper development.

## 14.4 Operators

The genetics subsystem exposes exactly four operations (§11.17):

```
recombine(parentA, parentB)  → Genome      # sexual; may be absent in cloning models
mutate(genome, ctx)          → Genome      # asexual variation; ctx fixes rate/σ/layer targets
express(genome, env)         → ConstructionRequest[]  # what development should try to build
inherit(parentState, ctx)    → OffspringGenome  # recombine|mutate|copy per model + lineage bookkeeping
```

Rules:

- **G9 (Operator purity).** Operators are pure functions of (genome, context, genetics-stream draws). No world state, no wall-clock, no other streams (K4).
- **G10 (Draw discipline).** Every operator fixes its draw order in its specification — the current `mutate` draws one rate-check and one offset per gene in declared gene order. Changing draw order is a model-version change, not a refactor (§11.25).
- **G11 (Mutation operators are enumerable).** The operator set must include at minimum: parameter mutation, gene deletion, gene duplication, regulatory rewiring (§12.18). Each is independently toggleable in the experiment definition, so experiments can isolate their effects.

## 14.5 Lineage

Lineage is the historical structure (§12.16), updated by genetics at `inherit`:

```
LineageNode
├── organismId
├── parentIds
├── birthTick
├── deathTick        — written by the ecology plane at OrganismDied
└── genomeReference
```

Rules:

- **G12 (Lineage is append-only).** Nodes are added at birth, annotated at death. Lineage is authoritative history, checkpointed with the world (it is *not* derived state, because death makes organisms unanalyzable if lineage is lost).
- **G13 (Lineage survives death).** Dead organisms remain analyzable without remaining active (Test C, §12.47) — lineage nodes and genomes outlive organism records.

## 14.6 Kernel integration

| Concern | Phase | Stream | Writes |
|---|---|---|---|
| `inherit` / `mutate` | INHERIT | `genetics` | `organism` (add), `organism.energy` (parent cost), `lineage` (add) |
| `express` | INHERIT | `genetics` | construction requests (intents for Part 15's developmental system) |

Boundary invariants (testable per §13.19):

- **I14-A.** Genetics never draws outside INHERIT, and never from a stream other than `genetics`.
- **I14-B.** Genome objects staged by INHERIT are values: two runs with the same seed produce genome-identical populations at every tick (strengthening Invariant 1 to genome granularity).
- **I14-C.** Deleting the genetics stream's draws (mutation rate 0) yields a cloning population whose mean phenotype drifts only by sampling — the null model for "variation exists."

## 14.7 Relationship to selection

Part 18 (Evolution/Selection) consumes this subsystem's outputs; it never reaches into it. The division, from §11.21:

```
GENETICS creates variation  →  ECOLOGY imposes consequences  →  SELECTION measures persistence
```

No component between them may compute a "fitness" field and store it on an organism (§12.46). Fitness is measured, post hoc, from lineage outcomes.
