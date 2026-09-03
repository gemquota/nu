# Part 16 — Behaviour & Agent Architecture

> **Status: [filled-in]** — Part 16 of the Master Technical Specification. The source PDF does not contain this part; it is written against the outline sections the document enumerates ([outline §9](00-outline.md)), the contracts it must implement (11 §11.19), and the domain model it must realize (12 §§12.21–12.23). The [ProtoEvo mapping](../reference/protoevo-to-nu-mapping.md) §1 (11.19 alignment) and study §3 (sensing/behaviour co-evolution) supply the reference mechanisms.

## 16.0 Scope and dependencies

Part 16 specifies the **agent plane**: how organisms perceive, decide, and propose actions.

Depends on: 11 §11.19 (behaviour contract), 11 §11.5 (system contracts), 12 §§12.21 (internal state), 12.22 (sensor model), 12.23 (action model); phenotype modules from [Part 15](15-development-and-morphogenesis-architecture.md) define what can be sensed and actuated; kernel phases from [Part 13](13-simulation-kernel-and-tick-semantics.md) §13.2 (OBSERVE/DECIDE stream discipline).

The contract, restated from §11.19:

```
Observation + Internal State + Inherited Policy + Learning State
                    │
                    ▼
                  Decision
                    │
                    ▼
                  Action
```

with the causal boundary:

> **agent chooses action → world determines consequence** — never "agent chooses desired outcome → simulation grants outcome."

## 16.1 The observation interface

Sensors produce **observations**, never world access (§12.22):

```
WORLD STATE → SENSORY INTERFACE → PERCEPTION → AGENT INTERNAL REPRESENTATION
```

Rules:

- **B1 (Observation records are the only sensory input).** A decision function receives: `Observation { modality, position/direction, intensity, confidence, tick }` records assembled by the sensory system. It receives no organism map, no resource map, no world config.
- **B2 (Sensor capability comes from phenotype).** What an organism can sense — range, modalities, fidelity — is determined by its sensory modules (Part 15), so sensing is evolvable and paid for. Fidelity may be degraded (noise from the `behaviour` stream at fixed draw points) to make partial observability an evolutionary force.
- **B3 (Own-state observation).** Internal state (§12.21: energy, hunger, developmental status) is observable to the policy as a distinct modality; it is authoritative state read through the same interface discipline.

## 16.2 Policy and decision

The policy is the inherited decision function:

```
Policy = f(Observations, InternalState, Genome.BEHAVIOUR) → ActionProposal[]
```

Rules:

- **B4 (Policies are genome-expressed).** The policy's parameters (and in later models its wiring) come from the BEHAVIOUR gene layer (Part 14 G4). The policy may be: fixed chemotaxis (current implementation), a parameterized utility function, or a small network acting as policy — the interface does not change.
- **B5 (Decisions are pure per tick).** Given identical observations, internal state, genome, and behaviour-stream draws, the decision is identical. Learning state (if present in a model) is authoritative organism state, updated only in UPDATE — decisions read the state as of the start of the tick (K2/K3 double buffering).
- **B6 (Draw discipline).** All stochastic decision elements draw from the `behaviour` stream, one fixed set of draws per organism per tick, in declared order (K4). The current implementation's random-walk draw is the minimal example of this discipline.

## 16.3 Actions are intents

Actions are proposals (§12.23):

```
Action { type, actorId, target?, magnitude, direction, duration? }
```

Rules:

- **B7 (Intent, not command).** Actions are recorded as intents and resolved by the owning systems in later phases: movement by locomotion/physics, consumption by interaction/resolution, signalling by the communication system. Nothing in DECIDE mutates state.
- **B8 (Resolution belongs to the world).** `MOVE_FORWARD → Physics → collision → actual displacement` — the action model in §12.23 verbatim. A failed action (blocked, starved, no target) is a domain event, not an exception.
- **B9 (Action budget).** An organism may propose one primary action per tick plus reflexive micro-actions (e.g. feeding while moving) as declared by its phenotype; the resolution systems handle contention (e.g. one consumption per organism per tick in the current model).

## 16.4 Internal state and learning

- **B10 (Internal state is authoritative).** Hunger, fatigue, stress, memory, learned associations — when a model includes them, they live in organism state, are checkpointed, mutate only in UPDATE, and are read by policies through B1/B3. They are causal variables (energy balances, exposure counts), never scores (§12.46).
- **B11 (Learning is heritable state, not magic).** If a model includes lifetime learning, the learned state dies with the organism; only genome information crosses generations (Baldwinian, not Lamarckian) unless an experiment explicitly declares otherwise.
- **B12 (Communication is action + observation).** Signalling between organisms is symmetric with the sensor model: a signalling module emits into an environmental field or a direct channel; receiving organisms perceive it as observations (B1). There is no out-of-band telepathy.

## 16.5 Kernel integration

| Concern | Phase | Stream | Writes |
|---|---|---|---|
| Sensing (build observations) | OBSERVE | — | none (ephemeral observations) |
| Policy decision | DECIDE | `behaviour` | intents (move, feed, signal) |
| Action resolution | ACT/INTERACT/RESOLVE | per owning system | per owning system's contract |

Boundary invariants:

- **I16-A (Observation purity).** Running the sensory/policy systems with logging enabled changes no authoritative state (Invariant 3, §11.26).
- **I16-B (Policy isolation).** Replacing the policy system with an alternative of identical contract produces a valid run; no other system depends on its internals.
- **I16-C (No omniscience).** A blind organism (no sensory modules) still runs — it decides from internal state and noise alone. Omniscient access to world state is impossible by construction, not by convention.

## 16.6 The co-evolution payoff

Because sensing (B2), policy (B4), and actuation (via phenotype modules) are all genome-expressed and all pay costs, the environment → chemical field → sensory module → regulatory wiring → action chain of ProtoEvo (study §3) is reproducible without any bespoke machinery: it is the composition of Parts 14–16 contracts. That composition is the point of the architecture.
