# Recoil attack / defense loop

Recoil is designed as a legible incident loop rather than a collection of decorative agents.

```text
public evidence
    ↓
orchestrator establishes scope
    ↓
attack planner crosses trust and dependency edges
    ↓
defender monitor surfaces evidence
    ↓
containment planner evaluates counterfactuals
    ↓
defender operator applies a bounded control
    ↓
graph and HydraDB decision memory are updated
```

## Attacker side

The attacker is a bounded graph policy, not an exploit runner. Its objective is to maximize reachable impact through relationships that already exist in the evidence/model:

1. Find a publisher or release trust edge.
2. Introduce the package version into dependency resolution.
3. Cross the lockfile and build-promotion boundary.
4. Fan out through the modeled artifact and services.
5. Reach a high-value data node.

Each step has an actor (`attack planner`), intent, label, and explanation. No package code, payload, or target system is executed.

## Defender side

The defender has a bounded response budget. Recoil exhaustively evaluates the small intervention space and ranks plans by:

```text
lowest modeled exposure
then lowest response cost
then fewest residual active nodes
```

Current controls are:

- pin a known-good release;
- block artifact promotion;
- quarantine exposed services;
- revoke publisher trust;
- rotate runtime secrets;
- restore and validate.

The recommendation is a counterfactual graph result. Applying it updates the live graph and writes a `defense_decision` memory to HydraDB.

## HydraDB role

Each case writes separate memories for:

- incident anchor and target;
- explicit graph topology;
- attack/defense timeline;
- each collector result and provenance;
- every defender decision;
- the ranked containment plan.

This lets a later recall retrieve both semantic evidence and the graph/timeline explanation. Writes are chunked to respect hosted ingestion limits and are marked queued while HydraDB indexes them asynchronously.

## Observed versus modeled

Repository manifests, package metadata, advisory records, workflow files, and container files are observed public evidence. The deployment fan-out is modeled unless a repository exposes equivalent runtime records. The report includes uncertainty rather than blending these categories together.

## Why this can become an RL environment

The deterministic loop is the reliable product path and the baseline environment:

- state: active graph, event position, exposure, remaining response budget;
- attacker actions: traverse the next permitted trust/dependency edge;
- defender actions: choose a response control or stop;
- reward: negative reachable exposure minus cost and disruption.

An RL or beam-search policy can be evaluated against this environment later, but the demo does not depend on a trained policy or unsafe external execution.
