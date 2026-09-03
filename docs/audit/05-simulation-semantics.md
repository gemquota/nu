# Part 5/10 — Simulation Semantics: Time, Ticks & Causality

> **Status: [filled-in]** — follows the audit sequence (Part 4 announced "the deepest layer" work continuing into semantics; Part 11 later formalizes these findings as the Tick Contract and State Transition Contract, and Part 13 as the execution pipeline).

## 5.1 The Kernel's Question, Made Formal

Part 3 defined the kernel as answering: *given current world state and governing rules, what is the next world state?* This part examines whether the implementation actually answers that question deterministically.

The formal shape (Part 11's State Transition Contract):

```
S(t+1) = F( S(t), L, E, R(t) )

S(t) = authoritative state
L    = laws/model
E    = experiment configuration
R(t) = controlled randomness
```

For this to hold, every input to F must be explicit. The audit question: in the current implementation, what actually feeds the next state? If the answer includes render timing, UI events, wall-clock time, or a global RNG, then F is not a function of declared inputs and the platform's scientific premise fails at the foundation.

## 5.2 The Tick as Causal Boundary

The tick is the fundamental unit of causality. A target semantic tick (Part 11):

```
STATE(t)
   │
   ▼
READ → SENSE → DECIDE → ACT → INTERACT → RESOLVE
   → RESOURCE / ENERGY TRANSFER → PHYSIOLOGY → DEVELOPMENT
   → REPRODUCTION → INHERITANCE / MUTATION → BIRTH / DEATH
   → COMMIT
   │
   ▼
STATE(t+1)
```

The audit finding to verify: does the codebase have an *explicit* phase ordering, or is causality defined by accidental JavaScript call order inside a requestAnimationFrame callback? Part 3 warned that "the system must never rely on accidental JavaScript call order to define biological causality" (Part 11's phrasing); where that warning applies is measured here.

## 5.3 Time

Simulation time must be its own concept, owned by the kernel:

- **Simulation time** advances by tick, deterministically.
- **Wall-clock time** is an execution concern only — how fast ticks happen is presentation/scheduling, never semantics.

Failure modes: using `Date.now()` or frame deltas inside the simulation; linking tick count to frames rendered; pausing the simulation by skipping draws (which silently changes physics accumulation).

## 5.4 Randomness

Uncontrolled randomness is the most common reproducibility killer. The target (Part 11's Randomness Contract):

```
Experiment Seed
      │
      ▼
Deterministic RNG
      │
      ├── genetics stream
      ├── behaviour stream
      ├── environment stream
      ├── reproduction stream
      └── experiment stream
```

Named, per-domain streams — not one shared generator — because a single global stream makes trajectories order-sensitive and checkpoints unreproducible. The audit question: where does randomness enter today, and is its state part of any snapshot?

## 5.5 Read/Write Discipline Within a Tick

Causal integrity inside a tick requires that systems do not read state that a later-ordered system has already mutated this tick. The target discipline (Part 12's transactional tick):

```
STATE_t
  ├── read
  ├── generate intents
  ├── resolve interactions
  ├── calculate changes
  └── commit
      │
      ▼
   STATE_t+1
```

Where the implementation instead mutates shared state in place, mid-tick, the ordering of subsystem calls becomes semantically load-bearing and the simulation becomes impossible to parallelize or verify.

## 5.6 Consequences of Getting This Wrong

- Trajectories that cannot be replayed (violating Invariant 2, Part 11).
- Checkpoints that restore visuals but not causality (Part 12: "not a valid scientific checkpoint").
- Headless and rendered runs diverging (violating Invariant 1).
- Any claim about evolution becoming unfalsifiable.

## 5.7 The Bar to Meet

The auditable standard for this layer, in one sentence: **a headless run and a rendered run must have identical authoritative trajectories under equivalent conditions.** Part 6 applies the same scrutiny one level up — to what evolves.

---

*Part 6/10 examines the evolutionary substrate: genetics, development, and phenotype.*
