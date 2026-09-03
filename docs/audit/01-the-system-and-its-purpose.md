# Part 1/10 — The System and Its Purpose

> **Status: [filled-in]** — reconstructed from the series' own forward references. Part 3 explicitly opens with "The next step is to stop looking at the codebase as a collection of modules…", which implies Part 1 established what the system *is* before examining its structure.

## 1.1 The Question of Intent

Before auditing code, it is worth stating what the project is trying to be. A codebase can only be judged against intent, and nu has an unusually ambitious one: not merely to *render* evolving creatures, but to be a platform on which **genuine evolution can occur and be studied**.

That distinction separates three things the project could be:

1. A **simulation toy** — organisms move, eat, reproduce; the visuals are the point.
2. An **evolution demonstration** — the system is arranged so that evolution-like behaviour reliably appears.
3. An **artificial-life research platform** — mechanisms are modeled causally, and phenomena that emerge from those mechanisms can be distinguished from artifacts of the implementation.

The architecture the document argues for is the third.

## 1.2 What nu Contains Conceptually

At the highest level, nu is composed of the subsystems that Part 3 formalizes as bounded contexts:

- a **simulation kernel** that evolves world state;
- a **law system** governing how state may change;
- a **world** containing organisms, resources, and environment;
- **genetics** providing heritable information;
- **lifecycle** giving that information biological semantics;
- **experiments** that instantiate, vary, and compare worlds;
- **observation** that measures what happened;
- a **renderer / UI** that presents it;
- **infrastructure** (workers, persistence) that executes it.

The audit's premise: most of these already exist in some form in the codebase, but not yet as *separated* responsibilities.

## 1.3 The Two Causal Loops

The system is defined by two loops that the architecture must both preserve (as later formalized in Part 11):

1. **Evolutionary causality** — genome → development → phenotype → behaviour → ecological consequence → reproductive success → heredity → next genome.
2. **Scientific causality** — world state → observation → analysis → experimental intervention → new world.

A system that accidentally merges these loops — for example, a UI action that silently mutates simulation state, or a "fitness" field that drives its own outcome — can still look impressive while producing results that are scientifically meaningless.

## 1.4 What "Working" Means Here

For a platform like nu, correctness is not only "does it run." The deeper criteria, which recur throughout this audit:

- **Causal integrity** — the simulation means what the model claims to mean.
- **Reproducibility** — the same experiment can be replayed and compared.
- **Falsifiability** — an observation can be attributed to the model rather than to an implementation accident.

The remaining parts of this audit ask how far the current implementation satisfies these, one layer at a time.

---

*Part 2/10 examines how the codebase is actually organized today: its modules, their responsibilities, and where state lives.*
