# ProtoEvo → nu: Mapping the Reference System onto the Master Specification

> **Status: [filled-in]** — aligns the [ProtoEvo system study](protoevo.md) with nu's Master Technical Specification. Its purpose: extract validated mechanisms worth adopting, identify where the spec's target architecture already matches the reference, and record where nu's ambition goes beyond it. Contract references (Part 11 §x, Part 12 §x, Part 13 §x) point into [the specification](00-outline.md).

## Why this mapping exists

The spec describes *what* nu must guarantee (contracts, invariants, schemas) but is deliberately silent on *mechanisms*. ProtoEvo is a working, published instance of a closely related system — ecological selection, development, evolvable morphology, multicellularity research — and therefore serves as the reference for which concrete mechanisms can realize the spec's contracts. Where the spec says "the architecture must permit," ProtoEvo shows "this mechanism permits."

## 1. Contract-by-contract alignment

| nu spec contract | ProtoEvo mechanism (study §) | Assessment |
|---|---|---|
| **11.17 Genetics Contract** — genome ≠ organism ≠ lineage; variation creation separated from selection | Regulatory/genetic machinery inherited by offspring; tags propagate to descendants (§10, §19) | **Aligned.** ProtoEvo separates heritable information from the cell and tracks lineages; nu must additionally keep `Organism ≠ Genome ≠ Lineage` as distinct identifiers (12.4) |
| **11.18 Development Contract** — development as interpreter: genome + environment + developmental state → phenotype | GRN participates in both development and behaviour; surface nodes constructed by regulation (§5, §6) | **Aligned and concretized.** The "interpreter" is a neural network acting as a gene-regulatory network; construction is paid in resources |
| **11.19 Behaviour Contract** — action is a proposal; world determines consequence | Physics-mediated movement, collision, pushing (§17) | **Aligned.** Flagellar motion succeeds or fails through the 2D physics engine; behaviour never teleports |
| **11.20 Ecology Contract** — interactions produce real consequences; feedback creates selection | Trophic cycle plants → protozoa → death → meat → protozoa (§2, §16) | **Aligned and concretized.** Death is an ecological process; corpses become resources. nu's spec should treat death explicitly as resource redistribution |
| **11.21 Selection Contract** — ecological selection preferred; never a hidden fitness field | No fitness function; reproductive success is the only "score" (§9) | **Aligned.** This is the reference implementation of "fitness emerges from ecological success" |
| **11.10 Randomness Contract** — named streams | (not modeled in the study) | **Gap in the reference; spec requirement stands.** ProtoEvo is a real-time sandbox, not a determinism-first experiment platform |
| **11.12 Experiment Contract** — declarative, UI-free experiments | Interactive lab features (§18) — manipulate, spawn, kill, save, tag, fork | **Partially aligned.** ProtoEvo has excellent *observation and intervention* infrastructure, but interventions are interactive, not declarative. nu's counterfactual contract (12.41) requires interventions as declared diffs |
| **11.22 Renderer Contract** — headless ≡ rendered trajectory | Headless mode exists (§18) | **Aligned in spirit.** nu must additionally guarantee identical authoritative trajectories, not merely a headless mode |
| **12.13 Environment Model** — environment as first-class, evolving entity | Pheromone fields that diffuse; plants as resource + information source (§3) | **Aligned and concretized.** Chemical fields = the spec's `Fields` (temperature/light/chemical) with a concrete, evolvable role: niche information |
| **12.14 Resource Model** — resources as explicit state | Mass, energy, and complex molecules distinguished (§7, §8) | **Aligned and concretized.** Multi-resource accounting creates genuine trade-offs; the spec's single `energy` model (12.20) should be extended |
| **12.16 Lineage Model** — lineage as first-class historical structure | `.cell` files, lineage tags (§19) | **Aligned.** Practical lineage-inspection workflow the spec's history plane should support |
| **12.46 Data-Model Principle** — never encode desired outcome into state | No `fitness`/`survivalScore` fields anywhere (§9) | **Aligned.** ProtoEvo is the existence proof that causal variables suffice |

## 2. Mechanisms nu's specification should adopt

These fill gaps where the spec's contracts are realized by nothing yet concrete:

### 2.1 Surface nodes as the evolvable morphology interface (study §4–5)

The spec's `Phenotype` (12.11) lists morphology, physiology, sensory, actuation — but gives no concrete mechanism. ProtoEvo's answer: **modular functional nodes on the organism's boundary**, each an organ with an interface to internal regulation.

Adoption for nu: phenotype components (`sensory`, `actuation`, `adhesion`) as *evolvable, resource-constructed modules* rather than fixed component types. The spec's component taxonomy (12.2.3) already permits this; the node model supplies the design.

### 2.2 Regulation/physical decoupling for exaptation (study §5, §14)

The spec requires the genome→phenotype chain to pass through development (12.8) but doesn't name the payoff. ProtoEvo does: **decoupling the regulatory pathway from the physical node it drives lets evolution repurpose machinery** (a movement pathway becoming an adhesion pathway) — evolutionary exaptation, one of the mechanisms real evolution uses.

Adoption for nu: keep regulatory wiring and effector modules as separate evolvable layers, so that mutations can rebind pathways to different nodes. This is a concrete design for the spec's "developmental instructions" (12.7).

### 2.3 Complex molecules as an expression bottleneck (study §7)

The spec's energy model (12.20) covers `reproductionCost`, but ProtoEvo adds a third resource class: **complex molecules** (signature-based, lock-and-key) whose production the GRN regulates.

Adoption for nu: expression of genetic instructions should cost material resources, not merely appear — the organism must *pay* to express. This creates the evolutionary bottleneck that makes regulatory evolution meaningful, and introduces conditional (lock-and-key) switching for molecular interactions.

### 2.4 Death as resource redistribution (study §2, §16)

The spec defines lifecycle states (12.36) and trophic feedback (11.20) but not what death *does*. ProtoEvo: death creates meat cells holding the organism's stored energy, mass, and molecules — a trophic cycle with niches (scavenging).

Adoption for nu: `OrganismDied` (domain event, 11.15) should be coupled to an explicit resource-reincarnation process owned by the environment system. Death transitions resources, it does not delete them.

### 2.5 Information-bearing environment (study §3)

Pheromones make the environment carry *information* (where resources are), enabling gradient-sensing behaviours and sensing/behaviour co-evolution.

Adoption for nu: the environment's fields (12.13) must be observable by organisms at configurable fidelity — partial observability (12.22) then becomes an evolutionary force, exactly as the spec requires.

### 2.6 Group-level selection pressure via resource/signal sharing (study §11–13)

Adhesion alone is a cost; sharing resources and signals makes collectives potentially superior. Specialization then emerges from differing regulatory inputs across attached cells — reported as a key result of the reference work.

Adoption for nu: the multicellular roadmap (spec outline §26) needs exactly these three primitives: **adhesion** (an evolvable node), **resource sharing** (an ecological interaction), **inter-cell signalling** (a communication pathway). None require new kernel machinery — they are genetics/ecology mechanisms — which is the architectural payoff of the spec's layering.

## 3. Where nu's specification deliberately goes beyond ProtoEvo

| Spec requirement | Why ProtoEvo doesn't satisfy it |
|---|---|
| Determinism levels A/B/C (11.11) | Real-time sandbox; no seed/trajectory guarantees |
| Named RNG streams, stream state in checkpoints (11.10, Part 13 §13.9) | Not modeled |
| Declarative, immutable experiment definitions with replicates (11.12–11.13, 12.43) | Interventions are interactive, not declarative specs |
| Statistical comparison of replicate populations (11.13) | Single interactive world |
| Provenance chain to code/config (12.34) | Not tracked |
| Scientific validation + null-model tests (outline §§20–21) | Not part of the reference project |
| `single-thread ≈ parallel` invariants (11.26, Part 13 §13.12–13.13) | Single-process real-time loop |

This is not a criticism: ProtoEvo optimizes for interactive exploration and emergent phenomena; nu's specification optimizes for falsifiable experiments. The overlap (ecology-driven selection, development, evolvable morphology) is exactly where ProtoEvo de-risks nu's design.

## 4. The shared central insight

The study's closing insight (§22) is also the correct reading of the spec's 11.31 conclusion:

> The system isn't trying to evolve increasingly complicated creatures. It is trying to create the conditions under which increasingly complicated biological organization becomes advantageous.

In spec terms: selection pressure comes from the ecology (11.20–11.21), never from a researcher's objective — and architecture (this library's whole subject) exists to make that claim *testable*.

## 5. Concrete deltas proposed to the specification

For the roadmap's remaining parts ([99-roadmap.md](../spec/99-roadmap.md)):

1. **Genetics & Heredity (outline §7)** — adopt surface-node phenotype modules and regulation/effector decoupling as the reference mechanism for 12.7's "developmental instructions"; specify complex molecules as a third resource type with lock-and-key semantics.
2. **Ecology & Environment (outline §10)** — specify death-as-resource-redistribution as a first-class process; specify chemical fields with diffusion as information-bearing resources.
3. **Evolution / Selection (outline §11)** — specify adhesion + resource sharing + signalling as the primitive set whose balance governs whether group-level selection can emerge; define observables for multicellularity and specialization (degree of attachment, resource-flow asymmetry, node-type divergence within collectives).
4. **Experiment framework (outline §12)** — keep interactive interventions (ProtoEvo-style) as *observation-plane* conveniences, but require them to be implemented as declared branch/intervention events (12.40–12.41) so sandbox play remains scientifically interpretable.
