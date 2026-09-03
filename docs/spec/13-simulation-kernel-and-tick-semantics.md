# Part 13 — Master Technical Specification: Simulation Kernel, Tick Semantics & Deterministic State Transition Architecture

> **Status: [filled-in]** — the source document closes by announcing Part 13 and enumerating its scope (tick lifecycle, phase ordering, read/write boundaries, double buffering, state transition semantics, system scheduling, conflict resolution, event generation, deterministic RNG streams, numerical integration, collision/interactions, parallel execution, deterministic reduction, rollback, checkpoint/replay, failure recovery, headless execution, causal invariants, kernel-level testing) and its formal execution contract. This document builds the part out along that exact scope, consistent with the contracts of Part 11 and the domain model of Part 12.

Part 11 established the boundaries. Part 12 established what exists. Part 13 establishes **how anything changes** — the canonical execution pipeline and the formal temporal contract upon which all evolutionary and ecological behaviour operates.

## 13.0 The Formal Execution Contract

Most importantly, this part establishes the formal execution contract:

```
STATE(t)
   ↓
 OBSERVE
   ↓
 DECIDE
   ↓
   ACT
   ↓
INTERACT
   ↓
 RESOLVE
   ↓
 UPDATE
   ↓
REPRODUCE
   ↓
 INHERIT
   ↓
 COMMIT
   ↓
STATE(t+1)
```

That is the actual temporal skeleton upon which the evolutionary and ecological architecture can safely operate. Every subsequent concern in this part is a discipline for making that pipeline deterministic, inspectable, and recoverable.

## 13.1 Tick Lifecycle

A tick is the indivisible unit of causal progress. Its lifecycle has four administrative stages wrapped around the pipeline:

1. **Begin** — validate preconditions: RNG streams present, model version consistent, no pending uncommitted changes.
2. **Execute** — run the phases of §13.0 in order, writing intents and events, not final truth.
3. **Commit** — atomically apply validated changes; publish events (Part 12 §12.30's transactional model).
4. **Finalize** — advance time, snapshot if scheduled (§13.15), emit infrastructure events, release ephemera.

A tick either commits completely or not at all. Partial ticks must never become visible (Part 11 Invariant 4).

## 13.2 Phase Ordering

The pipeline above refines Part 11's Tick Contract into an executable phase ordering:

| Phase | Writes | Reads | Consumes |
|---|---|---|---|
| OBSERVE | observation records | authoritative state | — |
| DECIDE | intents, actions | sensory projections, internal state | behaviour RNG stream |
| ACT | proposed effects | intents | — |
| INTERACT | interaction records | proposed effects, spatial index (derived) | — |
| RESOLVE | validated state deltas | interaction records, laws | environment RNG stream |
| UPDATE | new authoritative values | deltas, laws | environment/physics streams |
| REPRODUCE | reproduction proposals | physiological state, energy | reproduction RNG stream |
| INHERIT | offspring genomes | parents, genetics laws | genetics RNG stream |
| COMMIT | new world state | all deltas | experiment RNG stream |

The ordering is semantic, not accidental: sensing precedes decision; all proposals precede resolution; nothing biological commits before physics resolves its constraints (Part 12 §12.23: the world determines whether an action succeeds).

The kernel must never rely on accidental call order to define biological causality (Part 11 §11.8). If a phase ordering changes, that is a **model version change** (Part 12 §12.35), not a refactor.

## 13.3 Read/Write Boundaries

The pipeline is safe because each phase has a declared boundary (Part 12 §12.29: read broadly, mutate narrowly):

- A phase **reads** only state classified as readable for that phase.
- A phase **writes** only to its declared buffers (intents, deltas, events) — never directly to the authoritative world state.
- The **commit** phase is the sole writer of authoritative state.

A phase that needs data outside its boundary must either receive it as input from a previous phase or have the dependency declared in its contract (Part 11 §11.5). Boundary violations are kernel-level test failures (§13.19), not style issues.

## 13.4 Double Buffering

The standard mechanism for enforcing the boundaries:

```
STATE(t)  ──read──►  PHASES  ──write──►  BUFFER(t+1)  ──commit/swap──►  STATE(t+1)
```

- All phases read from the immutable `STATE(t)`.
- All writes go to pending buffers (deltas, intents, events).
- Commit swaps or merges buffers atomically.

This makes two properties structural rather than aspirational: (a) no phase can observe another phase's mid-tick writes — the read/write race of Part 5 §5.5 cannot occur; (b) rollback (§13.14) is trivial — discard the buffer.

The representation is flexible (in-place with change logs, SoA delta arrays, structural sharing); the semantic property — phases cannot read uncommitted writes — is not.

## 13.5 State Transition Semantics

Each state delta must be classifiable (Part 12 §12.24) and carry explicit transition semantics:

- **Deterministic** — computed solely from declared inputs (position under physics).
- **Stochastic but controlled** — computed from a named RNG stream at a fixed draw point (mutation).
- **Emergent** — computed from resolved interactions (predation outcome).

For a delta to be reproducible, its provenance must be one of these three. A delta that cannot be classified — one that silently depends on wall-clock time, frame count, or shared mutable caches — is a defect (Part 5 §5.1).

Formally, the tick remains:

```
S(t+1) = F( S(t), L, E, R(t) )      (Part 11 §11.9)
```

with F decomposed into the phase ordering of §13.2 and R(t) decomposed into named streams (§13.9).

## 13.6 System Scheduling

Systems (Part 12 §12.2.4) are scheduled by the kernel, never by each other:

- The schedule is **data** (an explicit, versioned list), not implicit import order.
- Each system declares the phase(s) it participates in and its read/write contract (Part 11 §11.5).
- Systems within a phase must be **commutative by construction** — they may only conflict through the RESOLVE phase, never by direct writes.
- Deterministic iteration order: systems run in a total order derived from the schedule definition (stable, versioned), not object key order.

## 13.7 Conflict Resolution

When two systems' proposals touch the same state:

1. **Prevention first** — the ownership graph (Part 12 §12.28/§12.31) should make true conflicts rare: each authoritative field has exactly one writer per tick.
2. **Explicit resolution** — unavoidable overlaps are resolved by declared rules at the RESOLVE phase: priority by law (physics constrains motion before physiology consumes it), conservation checks (energy is never created by resolving), and idempotence requirements for repeated application.
3. **No silent last-writer-wins** — if two proposals genuinely disagree, that is a contract bug to surface as an event, not an accident to swallow.

## 13.8 Event Generation

Events are byproducts of commit, never inputs to causality (Part 12 §12.32: events are facts, not commands):

- Phases emit events describing what they did; COMMIT publishes them.
- Events carry the canonical schema (eventId, tick, actorIds, targetIds, payload, modelVersion).
- Domain events (birth, death, predation) and infrastructure events (checkpoint written, worker failed) are never mixed (Part 11 §11.15).
- Replay (§13.15) may reconstruct state from snapshots + event streams; it must never re-fire event *effects*, only record event *facts*.

## 13.9 Deterministic RNG Streams

Extending Part 11 §11.10 into execution rules:

- One **named stream per concern** — at minimum `genetics`, `behaviour`, `environment`, `reproduction`, `experiment` — plus `kernel` for kernel-internal decisions.
- Each phase draws only from its declared stream, at a **deterministic draw point** (fixed order within the phase).
- Stream state is authoritative (Part 12 §12.24) and belongs in every checkpoint (Part 12 §12.39).
- Streams are seedable per replicate (Part 11 §11.13) so that variation can be isolated: rerun with the same `genetics` seed but a new `environment` seed to separate hereditary from environmental luck.
- Never share a generator across concerns; never draw from streams outside a phase (no "UI-time" randomness).

## 13.10 Numerical Integration

Physics-like updates must be deterministic under the platform's declared determinism level (Part 11 §11.11):

- Fixed timestep semantics per tick; variable frame pacing is presentation, never integration (Part 5 §5.3).
- A single, versioned integrator (e.g., semi-implicit Euler) per model version; changing the integrator is a model change.
- Deterministic ordering of force/impulse application (entity iteration in kernel-defined order, not hash order).
- Floating-point discipline: no `Math.random`, no time-based jitter, no reliance on `Object.keys` iteration; where bitwise determinism (Level B) is required across machines, restrict to fixed-point or ordered integer math for accumulation.
- GPU/parallel paths fall to Level C (statistical reproducibility) with declared tolerance, never silently.

## 13.11 Collision & Interactions

Interactions are computed in two steps to preserve causal honesty:

1. **Detection** — pure query over spatial state (the derived spatial index may be used, but authoritative positions decide).
2. **Resolution** — by laws, in declared order: physical overlap → energy transfer → interaction records → downstream biological consequences (Part 11 §11.20's feedback chains).

Pairs are enumerated deterministically (sorted by entity ID, not insertion order). Interaction records follow the canonical schema of Part 12 §12.19 so predation, mating, and resource consumption are analyzable after the fact.

## 13.12 Parallel Execution

Parallelism is an execution strategy (Part 3 §3.10; Part 11 §11.23), never a semantic change:

- **Phase-internal parallelism** — systems within a phase may run concurrently when their write sets are disjoint by contract (§13.6).
- **Entity parallelism** — map-over-entities work with per-entity writes may run across workers, with reductions performed deterministically (§13.13).
- The commit boundary is the synchronization point; workers never commit independently.
- Equivalence requirement: parallel execution must satisfy Invariant 8 (Part 11) — `single-thread ≈ parallel` under the declared determinism level. The default and the fallback is single-threaded execution.

## 13.13 Deterministic Reduction

Any aggregation performed across parallel work (sums of energy transfers, population statistics, spatial bucket merges) must be order-independent:

- Use fixed-order reductions (sort by ID before summing) or order-insensitive operators (integer/monotonic accumulation) so results are identical regardless of worker scheduling.
- Reductions write to the commit buffer; they never mutate live state mid-reduction.
- This is what makes `parallel ≈ single-thread` a testable invariant rather than an aspiration.

## 13.14 Rollback

Because commits are atomic (§13.1) and writes are buffered (§13.4):

- A failed phase discards its buffers; `STATE(t)` is untouched; the tick is retried or the run is marked failed — declared in the failure semantics of the subsystem contract (Part 11 §11.5).
- Interactive-time manipulation (e.g., a UI slider changing a parameter) is **never** a mid-run rollback; it creates a branch from a checkpoint (Part 12 §12.40) under a new experiment identity (Part 12 §12.43).
- Rollback is a kernel mechanism for atomicity, not an instrument for retroactive experiment edits.

## 13.15 Checkpoint / Replay

Extending Part 12 §§12.38–12.40 with kernel obligations:

- **Checkpoint contents** — the full contract of Part 12 §12.39 (world state, tick, time, RNG streams, model/schema versions, experiment identity, execution config).
- **Cadence** — snapshots at declared intervals with event/delta streams between (Part 12 §12.38's compression strategy).
- **Replay contract** — `snapshot(t) + events(t → t+n)` reconstructs `STATE(t+n)` exactly at determinism Level A/B; replay at Level C is statistical.
- **Replay integrity** — replayed runs must satisfy Invariant 2 (same trajectory) and must not re-execute observation side effects.
- Restore-continue equivalence is Invariant 4: `snapshot → restore → continue` must produce the same future trajectory as uninterrupted execution — a kernel-level test (§13.19).

## 13.16 Failure Recovery

Infrastructure fails; semantics must not drift:

- Worker death mid-tick → the tick's buffers are discarded; the replicate resumes from its last checkpoint, or is marked failed with provenance intact (Part 11 §11.23's `RunResult.executionSummary`).
- Storage failure during snapshot → the checkpoint is invalid and excluded from the restore set (atomic write discipline: write-then-rename or equivalent).
- No silent retry semantics that alter trajectories: recovery must restore to a causally valid state or fail loudly. Recovery choices are declared in the execution protocol version (Part 11 §11.25).

## 13.17 Headless Execution

Headless is the reference execution mode, not a degraded one:

- The pipeline of §13.0 contains no presentation phase; rendering subscribes to observation projections (Part 11 §11.14).
- The strict invariant (Part 11 §11.22): a headless run and a rendered run have identical authoritative trajectories under equivalent conditions.
- Experiment execution (Part 11 §11.12's hard requirement) is headless by default; the UI attaches to a run, never the reverse.

## 13.18 Causal Invariants (Kernel-Level)

The kernel-specific invariants this part adds to Part 11's list:

- **K1 — Phase closure.** Every state change is attributable to exactly one phase of one tick.
- **K2 — Commit atomicity.** No partial tick is ever observable.
- **K3 — Boundary enforcement.** No phase writes outside its declared buffer; no phase reads uncommitted writes.
- **K4 — Stream discipline.** Every random draw comes from a named stream at a declared draw point.
- **K5 — Deterministic ordering.** All iteration that affects results is in kernel-defined total order.
- **K6 — Time purity.** Simulation time advances only at COMMIT; no wall-clock inputs to semantics.
- **K7 — Replay fidelity.** `snapshot + events` reproduces the trajectory (Levels A/B).
- **K8 — Execution equivalence.** Single-threaded, parallel, and headless modes agree under the declared determinism level.

## 13.19 Kernel-Level Testing

The kernel is tested as a substrate, independent of any biology:

- **Pipeline tests** — a trivial model (e.g., particles with energy) exercising every phase, verifying ordering, buffering, and commit atomicity.
- **Determinism tests** — same seed/two runs bitwise-identical (Level B where practical); restart-from-checkpoint equality (Invariant 4).
- **Boundary tests** — property-style checks that no system writes outside its contract (K3), enforced in debug builds.
- **Stream tests** — per-stream reproducibility and isolation (§13.9).
- **Execution-equivalence tests** — Invariant 8 across schedulers/worker counts.
- **Failure tests** — injected worker death and checkpoint corruption recover per §13.16.
- **Null-model tests** — the kernel running no laws produces no change; running only physics produces no biological events.

These tests are the executable form of the specification: they belong to outline section 25 (Acceptance Criteria & Invariants) and are prerequisites for the scientific validation framework of outline section 20.

## 13.20 Part 13 Synthesis

The kernel is now fully specified as the system's temporal skeleton:

```
SCHEDULE (versioned phase + system order)
        │
STATE(t) ──► OBSERVE → DECIDE → ACT → INTERACT → RESOLVE
        │                            → UPDATE → REPRODUCE → INHERIT
        │                                     │
        │                              BUFFERS (intents/deltas/events)
        │                                     │
        └────────────────► COMMIT ────────────┘
                                │
              STATE(t+1) + EVENTS + (snapshot if scheduled)
```

With this contract in place:

- evolution cannot depend on call order (K1, K5),
- experiments cannot depend on the UI (§13.17),
- history cannot lie (§13.15, K7),
- and parallel execution cannot change the science (§13.12–13.13, K8).

The next part of the specification descends into the evolutionary plane itself — [outline section 7: Genetics & Heredity Architecture](99-roadmap.md) — building on the inheritance phase this part established.
