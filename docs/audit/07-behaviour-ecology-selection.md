# Part 7/10 — Behaviour, Ecology & Selection

> **Status: [filled-in]** — follows the audit sequence. Constrained by Part 11 §§11.19–11.21 (behaviour, ecology, selection contracts) and Part 12 §§12.19–12.23 (interactions, energy, sensors, actions).

## 7.1 From Organism to World

Part 6 audited what organisms inherit and become. This part audits how they act, how those actions feed back through the world, and how persistence of variants is determined. The governing boundary (Part 11):

> agent chooses action ↓ world determines consequence — **not** agent chooses desired outcome ↓ simulation grants outcome.

## 7.2 Behaviour: The Causal Boundary

Behaviour converts organism state and sensed information into *proposals*, not outcomes (Part 12 §12.23):

```
SENSORS
   ↓
PERCEPTION
   ↓
INTERNAL STATE
   ↓
DECISION / POLICY
   ↓
ACTION (a proposal)
   ↓
Kernel / Laws
   ↓
World State (the actual consequence)
```

Example of the required shape (Part 12): `MOVE_FORWARD → Physics → collision → actual displacement`, rather than `MOVE_FORWARD → position += desiredDistance`. The audit question: do actions pass through world mechanisms, or does behaviour code grant itself success? The second preserves environmental resistance; the first quietly deletes selection pressure.

## 7.3 Sensors: Observation, Not Omniscience

Sensors must produce observations, not direct world access (Part 12 §12.22):

```
WORLD STATE → SENSORY INTERFACE → PERCEPTION → AGENT INTERNAL REPRESENTATION
```

An organism with omniscient access to world state is not equivalent to one with limited local sensory information — and partial observability is itself an evolutionary pressure. If behaviour code reads world state directly, the audit flags both a boundary violation (Part 4) and a missing evolutionary force.

## 7.4 Ecology: Real Consequences

Ecological interactions must produce real state changes (Part 11 §11.20):

```
Predator → consumes → Prey → resource transfer
        → Predator energy → survival/reproduction

Organism → resource consumption → environmental depletion
        → resource scarcity → competition → selection
```

This feedback structure is what makes selection *distributed* rather than dependent on a single explicit fitness function. Interactions should be explicit enough for causal analysis (Part 12 §12.19: initiator, recipient, type, location, consequences, energy/resource transfer), and energy accounting should let actions feed back into survival and reproduction rather than manually assigning fitness to desired behaviour (Part 12 §12.20).

## 7.5 Selection: Two Mechanisms, Never Conflated

Part 11 requires the architecture to support both, explicitly classified:

- **Direct selection** — the researcher defines `fitness = objective(...)`. Useful for controlled experiments.
- **Ecological selection** — fitness *emerges* from resource access, survival, competition, predation, mating, environmental compatibility, and offspring success. This is the preferred long-term mechanism for artificial life.

The audit question: which one does the implementation actually have today, and is it labelled as such? A hidden, unnamed selection function baked into a "fitness" field is the worst case: it is neither a controlled instrument nor emergent dynamics — it is an unfalsifiable artifact (compare Part 12 §12.46: never encode desired outcome into state representation).

## 7.6 The Checkpoint Claim

If this layer is causally honest, the platform can eventually make the claim that distinguishes it from a demo: that a phenomenon — a population crash, a lineage's success, a behavioural strategy — was *produced by the model* rather than by an accidental property of the implementation.

---

*Part 8/10 turns from the simulated world to the scientific one: experimentation, history, and reproducibility.*
