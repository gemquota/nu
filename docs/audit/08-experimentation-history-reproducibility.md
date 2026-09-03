# Part 8/10 — Experimentation, History & Reproducibility

> **Status: [filled-in]** — follows the audit sequence. Constrained by Part 3 §§3.7–3.8 (experimentation and observation/history as bounded contexts) and Part 11 §§11.12–11.16 (experiment, replicate, observation, event, and history contracts).

## 8.1 The Simulation Produces Trajectories; the Experiment Produces Knowledge

Part 3 draws the boundary this part audits:

> The simulation produces a trajectory. The experiment produces knowledge from trajectories.

An experiment defines how worlds are instantiated, varied, compared, and measured — it does not define what the world is. The audit question: does the codebase treat an experiment as a first-class, declarative object (Part 11 §11.12: hypothesis, model version, parameters, initial conditions, seed policy, replicate count, intervention plan, observation plan, stopping criteria, analysis plan), or as a pile of ad-hoc parameter tweaks made through the UI?

## 8.2 Replication Is Not "More Runs"

A replicate is not merely another random run. It must preserve (Part 11 §11.13):

```
experiment definition + replicate identifier + seed + model version
+ configuration + initial conditions + execution metadata
```

Only then can `Experiment E → Replicates 001…005` be analyzed as a statistical population. If seeds, parameters, or model versions are not recorded per run, the platform has activity, not replication.

## 8.3 The Hard Requirement: No UI

Part 11 is explicit: **an experiment must be executable without the UI. This is a hard requirement.**

The audit question: can a full experiment be launched from a script or worker message? Where experiments can only be configured through React components or button clicks, research infrastructure has been coupled to presentation (Part 3 §3.9's warning realized).

## 8.4 History as an Experimental Instrument

The system is not merely representing the current world; it is representing *the evolution of a world through time* (Part 3 §3.8). History must support at least (Part 11 §11.16):

```
snapshot(t)          snapshot(t+n)
replay(t → t+n)      branch(t)
compare(A, B)        lineage(entity)
```

This transforms historical data from passive logging into an instrument — enabling counterfactual experimentation: *"what would have happened if this environmental event had not occurred?"* The audit question: does history exist as first-class state (snapshots, event streams, lineage records, checkpoints, branch points, provenance — Part 11 §11.3.10), or as incidental arrays?

## 8.5 What Reproducibility Requires

Pulling the earlier threads together, reproducibility requires all of the following to be explicit, saved, and versioned:

1. Authoritative state (Part 5's S(t)) — including **RNG state**.
2. The model/laws L, with a **model version**.
3. The experiment configuration E, frozen at run start (Part 12 §12.43).
4. Controlled randomness R(t) with named streams (Part 5 §5.4).
5. Provenance chaining every result back to experiment → replicate → seed → model version → tick range (Part 11 Invariant 10).

A checkpoint that restores visual state but not RNG state is not a valid scientific checkpoint (Part 12 §12.39). A saved simulation without its semantic version and experimental context is not a scientifically useful artifact (Part 11 §11.24).

## 8.6 Events: Facts, Not Commands

Events record what occurred; they are immutable historical facts (Part 12 §12.32) and split into domain events (`OrganismBorn`, `PredationOccurred`, `EnvironmentChanged`, …) and infrastructure events (`CheckpointWritten`, `WorkerFailed`, …) which must never be conflated (Part 11 §11.15). The audit question: are events used as history, or as a hidden command bus that mutates state?

## 8.7 The Bar to Meet

The audit's one-sentence standard for this layer: **every reported result must be traceable to Experiment → Replicate → Seed → Model Version → Tick Range → Observation (Invariant 10), and rerunning that tuple must reproduce the trajectory.**

---

*Part 9/10 descends beneath the semantics: execution, performance, and infrastructure.*
