# Part 4/10 — Coupling, Dependency Direction & Hidden State

> **Status: [filled-in]** — Part 3 closes by announcing this part's exact scope: "architectural coupling, dependency direction, hidden state, and where the system's conceptual boundaries are likely being violated." This reconstruction follows that scope and uses the dependency rules later codified in Part 11.

## 4.1 The Gap Under Examination

Part 3 defined the architecture the system appears to want. This part examines the gap between that model and what the implementation actually guarantees. The gap rarely appears as one big mistake; it appears as many small, individually reasonable couplings that collectively make the conceptual boundaries unenforceable.

## 4.2 Dependency Direction

The healthy rule (later formalized in Part 11):

```
Dependencies point toward more fundamental semantics,
never toward presentation or infrastructure.
```

So these are healthy:

```
Renderer  → Observation → Domain
Worker    → Kernel
Experiment → Kernel
```

And these are architecturally forbidden:

```
Domain    → Renderer
Kernel    → Worker
Simulation → Experiment dashboard
```

The audit question for nu: does any domain-level module import from, or reach into, the presentation layer? Does the kernel know what a worker is? Every such edge is a boundary violation, regardless of how convenient it is locally.

## 4.3 Coupling Patterns to Look For

Typical coupling patterns in a simulation codebase of this kind:

- **Render-coupled simulation** — the update step and the draw step share mutable state with no read boundary, so changing rendering changes simulation behaviour.
- **UI-coupled state** — user selections (selected organism, camera, paused flag) living inside world or organism objects.
- **Cross-domain writes** — the behaviour system directly editing environment resources, or physics directly editing genome data, instead of emitting intents consumed by the owning subsystem.
- **Configuration leakage** — one global config object mutated at runtime from several places, so no run has a stable definition of its own parameters.
- **Implicit sequencing** — module A's correctness depends on module B having run first, with no contract stating so.

## 4.4 Hidden State

Hidden state is state that influences the future trajectory but is not recognized as part of the simulation's authoritative state. The dangerous categories:

1. **Unsaved RNG state** — if randomness is drawn from a global generator, checkpoints cannot reproduce trajectories (violating Invariant 5 of Part 11).
2. **Caches treated as truth** — a spatial index or neighbourhood cache mutated directly instead of being derived.
3. **Frame-dependent data** — anything that makes the result depend on render timing, requestAnimationFrame cadence, or how many frames the user watched.
4. **Module-level mutable globals** — counters, flags, "current selected organism," silently consulted by simulation code.
5. **Clock dependencies** — using wall-clock time inside the simulation instead of simulation time.

Hidden state does not merely add bugs; it destroys reproducibility, which for this project is the loss of the entire scientific premise.

## 4.5 Where Boundaries Are Likely Being Violated

Measured against Part 3's contexts, the likely violations in a codebase at this stage:

| Boundary | Likely violation |
|----------|------------------|
| Kernel ↔ Renderer | update loop and render loop interleaved without a read boundary |
| World ↔ UI | selection/presentation fields inside domain objects |
| Genetics ↔ Organism | genome collapsed into the organism object (Part 3's "dangerous mistake") |
| Lifecycle ↔ Physics | birth/death implemented as array operations rather than domain transitions |
| Experiment ↔ Simulation | experiment parameters reaching in at runtime instead of defining initial conditions |
| Observation ↔ Simulation | statistics collected by mutating simulation objects |
| Kernel ↔ Infrastructure | execution concerns (workers, transport) referenced from domain code |

The exact set must be confirmed against the code; the architectural audit's contribution is the checklist and the direction of the required fix for each.

## 4.6 The Cost of the Gap

Each violation has a compounding cost:

- Reproducibility silently fails (trajectories depend on UI or render timing).
- Parallelism becomes unsafe (writes cross ownership boundaries).
- Experiments lose meaning (uncontrolled variables leak into trajectories).
- Refactoring becomes risky (nothing tells you what a module may safely read or write).

## 4.7 Direction

The remedy is not a big-bang rewrite but a strict declaration of dependency direction and state ownership, subsystem by subsystem — the approach the Master Technical Specification takes as contracts in Part 11 and state ownership in Part 12.

---

*Part 5/10 descends into the deepest layer: simulation semantics — time, ticks, causality, and what the update loop must guarantee.*
