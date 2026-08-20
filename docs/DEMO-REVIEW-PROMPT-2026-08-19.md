# Recoil - second demo/product review brief

**Date:** 19 August 2026  
**Ask:** Make the working product feel like a decisive, visible investigation rather than a text report.

## Why this review is needed

The evidence engine is now real and passes the strict recording case. It collects OSV/npm/GitHub evidence,
builds an observed dependency/source graph, classifies repositories as `REACHED`, `DECLARED_ONLY`, or
`NOT_AFFECTED`, proposes a version-backed fix, rewinds dated evidence through HydraDB, and exports a receipt.

The browser currently hides most of that value. The user pastes a query, waits through a text event list, and
lands on a long report. The graph is a collapsed edge list, not a visual explanation. There is no visible
attack path, no clear “why this repository is reached,” no before/after path change, and no single moment that
a judge can remember. The product is correct but emotionally flat and difficult to understand in a live demo.

We need a second, blunt review before changing the frontend and any supporting response shape.

## Current product contract

The current implementation is evidence-first and must remain honest:

- public repositories are read but never installed or executed;
- no exploit payload is sent to public systems;
- every claimed path must be based on collected lockfile/import evidence;
- inferred edges must stay visibly distinct from observed facts;
- HydraDB stores dated evidence memories and returns temporal/graph context;
- OpenAI is optional and only scopes advisory prose against an indexed symbol inventory;
- the browser, CLI, and TUI share the same investigation engine;
- the strict recording case is:

```text
GHSA-xvch-5gv4-984h npm:minimist
https://github.com/http-party/http-server/tree/v13.0.2
https://github.com/tweenjs/tween.js
https://github.com/axios/axios/tree/v1.x
```

It yields a real contrast:

```text
http-party/http-server@v13.0.2 → REACHED
tweenjs/tween.js                → DECLARED_ONLY
axios/axios@v1.x                → NOT_AFFECTED
```

## The experience we want

One input and one action. After submit, the app autonomously reveals a case in four visible beats:

1. **Read** - advisory, registry, and repository records appear as evidence sources.
2. **Map** - a real graph is drawn from advisory → package/version → lockfile → import/source file → repository.
3. **Test** - the system highlights each repository’s route and explains why it is reached, declared-only, or safe.
4. **Prove the fix** - the same route is shown before and after the OSV fixed version, with HydraDB’s dated memory
   and graph context visible as proof rather than as a status chip.

The judge should understand this in ten seconds:

```text
The same vulnerable package is present in three repositories.
Only one actually reaches code.
The graph shows the exact evidence hops.
The proposed version closes that path.
HydraDB lets us ask whether the path existed before disclosure.
```

## Design read for the next pass

Reading this as a trust-sensitive security investigation workspace for judges and engineers, with a restrained
dark instrument language and Apple-like state transitions. The visual direction is not a cockpit and not a
marketing landing page. It is a single evidence map with a calm event rail and a report that opens from the map.

The three working dials are:

- **Design variance: 6**. Use an asymmetric workspace, but keep the evidence geometry legible.
- **Motion intensity: 4**. Animate state changes and path emphasis, never decorate the screen with perpetual motion.
- **Visual density: 5**. The graph is information-dense; surrounding copy must get shorter, not smaller.

The one visual hero is an actual graph drawn from the report payload. Nodes are advisory, package/version,
repository, lockfile, source file, and validated symbol. Edges are observed graph relations. The selected route
is highlighted only when its hops exist in the finding or graph. A node that is inferred or not observed is styled
as such. The graph is not a decorative network background.

The “attack” story is honest and still compelling:

```text
possible path  = a statically observed route an attacker could follow
path tested    = evidence classification, not a live exploit
defense        = a version-backed remediation and counterfactual re-check
```

The first viewport after completion should show, in this order:

1. one sentence verdict;
2. the visible evidence map;
3. a compact list of real routes with the three-way contrast;
4. the selected route’s source-backed explanation;
5. HydraDB’s temporal rewind as a visible dated proof, not a status chip.

The live state should use the same map frame. Before graph data exists, the frame says exactly what evidence is
being collected. As soon as the observed graph arrives, nodes enter in their real dependency order. The event rail
describes the current collector and the map shows the evidence that has actually arrived. There is one primary
action, `Investigate`, and one exit action, `New case`; no operator controls, rounds, fake attacker buttons, or
collapsed graph edge dump.

## Design questions for the reviewer

Act as a senior product designer, security-product founder, graph-systems engineer, and Hack Hydra judge.
Do not defend the current layout. Give one recommendation, not a menu of generic dashboard ideas.

1. What is the strongest product framing now that the evidence engine is real?
2. What should the one killer visual be: a path graph, a before/after replay, a live event timeline, or a
   different composition?
3. How should we show “attack” without implying that we exploited public code? Is **attack path** / **path
   prover** the right language, or is there a better honest metaphor?
4. What is the minimum graph schema and visual encoding that makes HydraDB indispensable and understandable?
5. How can a single case visibly show three different repository outcomes without becoming a dashboard?
6. Where can an LLM add real value without turning the result into an unverifiable narrative?
7. What should be deleted from the current report, and what should be promoted into the first viewport?
8. What exact three-minute demo sequence and spoken narration would make this competitive in Track 2?
9. What can be implemented in one focused frontend/backend pass without compromising the strict evidence contract?

## Required response format

1. Verdict - what Recoil is and why the current demo is weak.
2. One recommended product framing.
3. Killer visual and interaction model.
4. Exact graph entities, edges, and state transitions to show.
5. Honest attack/defense language and boundaries.
6. HydraDB’s visible hero moment.
7. Exact three-minute demo script.
8. UI wireframe for landing, live run, and final proof.
9. Ordered implementation plan with cuts.
10. Risks and falsification tests.
11. Final decision.

The recommendation must preserve real evidence, make the graph visible, and give the viewer a reason to care
within the first thirty seconds. Do not recommend fabricated services, arbitrary exploit execution, generic
agent cards, decorative cyberpunk styling, or a graph that is merely a blob of nodes.
