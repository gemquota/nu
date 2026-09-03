# Part 2/10 — Modules, Structure & State

> **Status: [filled-in]** — reconstructed from the series' own forward references. Part 3 opens by proposing to "stop looking at the codebase as a collection of modules," which implies Part 2 surveyed the codebase at that level.

## 2.1 The View from the Code

Seen as files and modules, the codebase presents a familiar browser-application shape: an entry point, a render loop, entities, systems, configuration, and UI wiring. The audit's purpose at this stage is not to review each file but to ask what *responsibilities* the modules actually carry — because responsibilities, not files, are what the conceptual architecture in Part 3 measures.

## 2.2 The Kinds of Things That Exist in Code

Across the codebase, code tends to fall into a small number of practical categories:

- **State containers** — objects holding organisms, resources, environment values.
- **Update logic** — per-frame functions that mutate that state.
- **Rendering** — drawing the current state.
- **Interaction wiring** — UI events reaching into simulation objects.
- **Configuration** — constants, parameters, magic numbers.
- **Bookkeeping** — statistics, counters, history-like arrays.

The important observation is that these categories do not map cleanly onto the conceptual subsystems of Part 3. One module frequently mixes state ownership, transition logic, and observation. That mixing is the raw material of the coupling problems examined in Part 4.

## 2.3 Where State Lives

The audit treats the question "who owns this state?" as primary. In practice the codebase's state can be classified as:

- **Authoritative** — determines future simulation (positions, genomes, energy, environment).
- **Derived** — reconstructible from authoritative state (spatial indexes, caches, histograms).
- **Ephemeral** — execution or presentation artifacts (render buffers, UI selections, debug overlays).

(This classification is later formalized in Part 12 as the authoritative/derived/ephemeral matrix.)

The typical failure mode in a young simulation codebase: derived and ephemeral state is written by the same functions that write authoritative state, with no recorded distinction. Nothing enforces which is which, so hidden dependencies accumulate.

## 2.4 The Update Loop as De Facto Architecture

In the absence of an explicit tick contract, the render loop becomes the architecture: whatever order functions happen to be called in `requestAnimationFrame` *is* the causal order of the simulation. Part 5 examines why that is the single most consequential structural fact about a simulation codebase.

## 2.5 Toward a Conceptual Model

The codebase is best understood at this stage as an implementation searching for its architecture: the pieces of a research platform exist (kernel-like update, genetics-like mutation, experiment-like parameter sweeps, observation-like statistics), but their boundaries are informal.

Part 3 now defines those boundaries explicitly.

---

*Part 3/10 — Bounded Contexts & Architectural Paradigm — defines the conceptual subsystems against which the rest of the audit proceeds.*
