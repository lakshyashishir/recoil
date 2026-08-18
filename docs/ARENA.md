# Adaptive arena

Recoil's primary product is a bounded red/blue episode over a software supply-chain graph.

## The loop

1. Public package, advisory, and repository evidence is collected.
2. The evidence becomes a bounded graph with observed and modeled edges separated.
3. Red chooses a reachable route toward a high-value asset.
4. Blue chooses a control using the current route, response budget, and recalled round memory.
5. The graph is recomputed.
6. The new residual route becomes the next red observation.

The current policy is deliberately explainable. It uses graph reachability, alternate-path reconstruction, route-aware control selection, and bounded response cost. An LLM can later narrate or propose candidate actions, but it is not trusted to invent graph state or declare an exploit successful.

## What HydraDB stores

HydraDB receives the incident anchor, evidence collector results, topology, and one memory per arena round. An arena memory contains:

- red move and intent;
- exact route selected from the graph;
- blue control and rationale;
- exposure before and after the control;
- residual high-value targets and route;
- episode status and scenario provenance.

The arena recalls prior Recoil memories before starting. If a previous episode contains a relevant control precedent, the blue policy can use it and the UI marks that decision as memory-assisted.

## Safety boundary

Red moves are graph actions such as promotion, re-resolution, artifact reuse, or credential-assisted pivot. They are not exploit payloads. Recoil never installs dependencies, executes package code, attacks a public repository, or mutates a production system.

## Synthetic deployment input

Public repositories rarely expose their complete runtime topology. Recoil therefore labels deployment fan-out as modeled unless stronger runtime evidence is supplied. Synthetic inputs are acceptable for the demo, but every traversal, route, exposure score, and control outcome is computed from the graph at runtime.
