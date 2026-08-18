# Recoil attack / defense loop

Recoil is designed as a computed red/blue episode rather than a collection of decorative agents.

```text
public evidence
    ↓
graph builder establishes scope
    ↓
red policy selects a reachable route
    ↓
blue policy selects a route-aware control
    ↓
graph recalculates alternate routes
    ↓
round and rationale are written to HydraDB
    ↓
red searches again until containment or budget exhaustion
```

## Attacker side

The attacker is a bounded graph policy, not an exploit runner. Its objective is to maximize reachable impact through relationships that already exist in the evidence/model:

1. Find a publisher or release trust edge.
2. Introduce the package version into dependency resolution.
3. Cross the lockfile and build-promotion boundary.
4. Fan out through the modeled artifact and services.
5. Reach a high-value data node.

The policy chooses the primary route first, then selects an unused alternate route after a control changes the graph. Each move has an intent, label, exact path, and explanation. Recoil records the route as node IDs, not just a score, so the operator can see exactly which trust edges remain. No package code, payload, or target system is executed.

## Defender side

The defender has a bounded response budget. It first responds to the route it actually sees, then falls back to exhaustive evaluation of the small intervention space. Candidate controls are ranked by:

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

The control is a counterfactual graph result. Applying it blocks concrete graph nodes, recalculates reachable high-value assets, and exposes the next route to red. Each round writes the red move, blue rationale, before/after exposure, blocked nodes, and residual paths to an `arena_round` memory in HydraDB.

The browser also exposes the decision trace for each round: Red's fresh and repeated route candidates, plus Blue's affordable controls with predicted exposure, cost, route-match, and memory-match signals. The selected action is therefore inspectable as a computed choice among alternatives.

Controls are phase-aware: blocking artifact promotion closes the CI gate for future releases but does not pretend that an artifact already promoted into the incident disappeared. A later upgrade, restore, quarantine, or secret rotation must address that residual state.

## Reachability model

The baseline graph currently includes publisher/release trust, registry resolution, lockfile and CI promotion, artifact fan-out, five services, and multiple high-value data surfaces: customer data, payment tokens, analytics, feature flags, and audit evidence. Repository ingestion can add observed manifest, dependency, workflow, and container nodes around this baseline.

The modeled exposure is a weighted reachable-risk ratio against the full no-control graph. It is not a claim that every modeled deployment edge exists in production. A path is considered high-value when it reaches a data node; the report preserves both the primary path and bounded alternate paths so a control can be judged by what it actually cuts.

## HydraDB role

Each case writes separate memories for:

- incident anchor and target;
- explicit graph topology;
- computed red/blue arena rounds;
- each collector result and provenance;
- every defender decision;
- the ranked containment plan.

Before an episode starts, Recoil recalls prior Recoil rounds across scenarios. If a relevant prior control is found, the blue policy can use that precedent and the UI marks the round as memory-assisted. Writes are chunked to respect hosted ingestion limits and are marked queued while HydraDB indexes them asynchronously.

## Observed versus modeled

Repository manifests, package metadata, advisory records, workflow files, and container files are observed public evidence. The deployment fan-out is modeled unless a repository exposes equivalent runtime records. The report includes uncertainty rather than blending these categories together.

The source layer adds a second, deliberately separate signal: a bounded sample of public source files is indexed for local imports, symbols, inferred operational surfaces, and public CODEOWNERS attribution when available. The latest public commit can add changed-file and changed-symbol evidence when GitHub provides patch hunks. This refines where a modeled blast radius may enter the codebase; it does not silently convert static code hints into runtime exposure or change the core reachability score.

## Why this can become an RL environment

The deterministic loop is the reliable product path and the baseline environment:

- state: active graph, event position, exposure, remaining response budget;
- attacker actions: traverse the next permitted trust/dependency edge;
- defender actions: choose a response control or stop;
- reward: negative reachable exposure minus cost and disruption.

An RL or beam-search policy can be evaluated against this environment later, but the demo does not depend on a trained policy or unsafe external execution.
