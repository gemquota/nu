# Architectural Audit — Series Overview

> **Status: [filled-in]** — reconstructed overview. The PDF export began mid-series at Part 3/10; this page restores the framing the original audit would have established, using only claims the source document itself makes about the system and the series.

## What this series is

A sequential, 10-part architectural audit of **nu** — a browser-based artificial-life simulation — conducted by examining the codebase as a *conceptual system* rather than as a collection of files. The audit asks, for each layer of the system:

- What conceptual subsystem does this code implement?
- Where are the boundaries between subsystems?
- Where does the implementation violate those boundaries?
- What does the system implicitly *want* to become?

The series proceeds from the whole to the parts:

1. **Part 1** — what the system is and is trying to be.
2. **Part 2** — how the codebase is currently organized.
3. **Part 3** — the conceptual subsystems and their boundaries.
4. **Part 4** — coupling, dependency direction, and hidden state.
5. **Part 5** — simulation semantics: time, ticks, causality.
6. **Part 6** — genetics, development, phenotype.
7. **Part 7** — behaviour, ecology, selection.
8. **Part 8** — experimentation, history, reproducibility.
9. **Part 9** — execution, performance, infrastructure.
10. **Part 10** — synthesis: the gap between the conceptual architecture and the implementation, and the path forward.

## What the system is

As established by the source document, nu is closer to a **layered artificial-life research platform** than a "simulation program." It contains, conceptually:

- a **simulation kernel**,
- an **evolutionary / law system**,
- an **experimental framework**,
- an **observation system**, and
- a **presentation layer**.

The audit's central finding, stated at the end of Part 3 and carried through the series: *the gap between the architecture the system appears to want and the architecture the implementation actually guarantees is where many of the deeper problems emerge.*

## How to read this series

- Parts 1–2 establish context: intent and current structure.
- Part 3 is the pivot: it defines the target conceptual architecture that all later parts measure the codebase against.
- Parts 4–9 audit each layer against that model.
- Part 10 consolidates findings and hands off to the [Master Technical Specification](../spec/00-outline.md), which converts conclusions into an engineering contract.

## Conventions

- Each part uses `N.M` numbered sections.
- ASCII diagrams preserve the original document's style.
- "The kernel," "the world," "the law system," etc. refer to the conceptual subsystems defined in [Part 3](03-bounded-contexts.md), regardless of how they are named in code today.
