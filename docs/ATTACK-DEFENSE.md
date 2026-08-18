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

Each step has an actor (`attack planner`), intent, label, and explanation. At the response boundary, the planner runs a bounded path search over the current graph and selects the highest-value residual route. Recoil records the route as node IDs, not just a score, so the operator can see exactly which trust edges remain. No package code, payload, or target system is executed.

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

The recommendation is a counterfactual graph result. Applying it blocks concrete graph nodes, recalculates reachable high-value assets, tests the remaining route, and starts the next response round. Each decision writes the round, blocked nodes, primary route, and alternate paths considered to a `defense_decision` memory in HydraDB.

Controls are phase-aware: blocking artifact promotion closes the CI gate for future releases but does not pretend that an artifact already promoted into the incident disappeared. A later upgrade, restore, quarantine, or secret rotation must address that residual state.

## Reachability model

The baseline graph currently includes publisher/release trust, registry resolution, lockfile and CI promotion, artifact fan-out, five services, and multiple high-value data surfaces: customer data, payment tokens, analytics, feature flags, and audit evidence. Repository ingestion can add observed manifest, dependency, workflow, and container nodes around this baseline.

The modeled exposure is a weighted reachable-risk ratio against the full no-control graph. It is not a claim that every modeled deployment edge exists in production. A path is considered high-value when it reaches a data node; the report preserves both the primary path and bounded alternate paths so a control can be judged by what it actually cuts.

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
