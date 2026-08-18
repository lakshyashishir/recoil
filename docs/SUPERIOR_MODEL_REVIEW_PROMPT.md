# Recoil — superior-model product review brief

> **Archived review input.** This brief captured the pre-redesign arena prototype on 19 August 2026.
> The fictional Red/Blue runtime described below was removed from the shipped product. For the current
> evidence-first architecture and demo contract, read [README.md](../README.md), [ATTACK-DEFENSE.md](ATTACK-DEFENSE.md),
> and [DEMO.md](DEMO.md).

**Date:** 19 August 2026
**Repository:** `recoil`
**Hackathon:** Hack Hydra 2026
**Request:** Give us a decisive product, interaction, architecture, and demo direction. Do not give generic encouragement.

## How to review this

Act as a senior product designer, security-product founder, technical architect, and hackathon judge at the same time.

We need an honest review of Recoil as it exists today. The goal is not to preserve every feature or defend previous decisions. If the current concept is weak, confusing, or too simulated, say so and replace it with a sharper concept that can still be built in the remaining hackathon time.

Please make one strong recommendation. Do not return five equally weighted directions. Tell us what to keep, what to delete, what to rename, what the user should see, and what the three-minute demo should prove.

## The current product in one sentence

Recoil takes a public package, advisory, or GitHub repository, builds a bounded software-supply-chain graph, and runs a Red attacker / Blue defender episode over that graph while storing evidence and decisions in HydraDB.

The intended “killer” moment is:

```text
public evidence → graph → Red finds a route → Blue applies a control
→ the route is retested → Red finds a residual route → containment is proven
```

## What is currently real

- Public npm, Cargo, OSV, and GitHub evidence can be collected.
- Node and Rust repository manifests, lockfiles, workflows, containers, imports, symbols, CODEOWNERS, and recent public commit evidence can be analyzed statically.
- A bounded graph is built from the collected evidence.
- Red routes are selected from actual graph reachability and alternate paths.
- Blue controls are evaluated against graph state, response budget, and residual routes.
- HydraDB can store evidence, topology, prior decisions, and arena rounds; recall can influence Blue decisions.
- When an OpenAI key is configured, constrained Red and Blue agents can inspect graph/evidence/HydraDB context and call allowlisted tools. Their path/control decisions are validated by the server.
- The owned local fixture contains executable request-handling logic. Recoil can probe it, apply a control, and run regression checks again.
- The CLI, TUI, and browser use the same arena engine.

## What is deliberately not real

- Recoil does not install or execute code from arbitrary public repositories.
- Recoil does not send exploit payloads to live systems.
- Recoil does not claim that a public repository was compromised.
- Deployment fan-out and some service/data relationships are modeled when public evidence does not provide runtime topology.
- The local fixture is a safe cyber-range target, not the target repository itself.

This boundary is intentional for safety and demo reliability, but it creates a major product question: does the current fixture-based attack/defense loop feel like a real security product, or like a graph game with security language?

## The current user experience problem

The person building and testing the product cannot understand what is happening without reading the code or documentation.

The browser currently exposes too many operator-level controls and concepts:

- `Run loop`
- `Run first round`
- `Step one round`
- `Reset`
- `Re-run evidence`
- `Route view`
- `All evidence`
- graph counters and exposure counters
- separate Red and Blue panels
- round history
- HydraDB state
- fixture probe state
- a final report

The user’s natural questions are not answered immediately:

1. What am I looking at?
2. What is Red doing right now?
3. What is Blue doing right now?
4. Is this an actual test or only a prediction?
5. What changed after the defense?
6. Why should I care about HydraDB?
7. What am I supposed to click?

The current interface still feels like an AI-generated cyber dashboard: multiple panels, technical labels, status chips, counters, and controls compete with the core story. The left/sidebar concepts do not help a first-time viewer. The graph often appears before the user understands the attack/defense loop. The product asks the user to operate the simulation instead of showing an autonomous system working.

## The interaction we actually want

The user should have one obvious action:

```text
Paste a package, advisory, repository, or scenario → Start
```

After that, Recoil should run autonomously. The user should not need to press `Run loop`, `Step`, or choose which agent moves next.

The experience should visibly progress through a small number of comprehensible states:

```text
1. Collecting evidence
2. Building the attack surface
3. Red is planning an attack
4. Red is testing the route
5. Blue is planning a defense
6. Blue is applying the control
7. Re-testing the same route
8. Red is searching the residual graph
9. Contained / not contained
```

The user should see a live, readable event stream such as:

```text
RED · planning
“The release can cross the CI promotion edge and reach customer data.”

RED · route tested
release → runner → CI → artifact → payments → customer database
fixture response: 200 · sensitive fixture record reached

BLUE · planning
“Blocking future promotion does not remove the artifact already in production.”

BLUE · control applied
block promotion

RETEST · residual exposure remains
The promoted artifact is still reachable.

RED · replanning
Searching alternate routes…
```

The interface should make the graph a supporting visualization of this story, not the main thing the user must decode.

## Current architecture and code landmarks

- Browser entry and product layout: `src/main.jsx`, `src/style.css`
- Core graph policy and episode state: `src/core/arena.js`, `src/core/scenario.js`
- HTTP API and orchestration: `server/index.js`
- Constrained OpenAI Red/Blue agents: `server/agents.js`
- Owned executable target: `sandbox/fixture-app.js`, `sandbox/fixture.js`
- HydraDB integration: `server/hydra.js`
- Public evidence collectors: `server/collectors.js`
- CLI: `cli/recoil.js`
- Terminal UI: `tui/index.tsx`
- Existing product/runbook docs: `README.md`, `PLAN.md`, `docs/ATTACK-DEFENSE.md`, `docs/ARENA.md`, `docs/DEMO.md`

## The product questions we need answered

### 1. Is the product concept strong enough?

Judge this against Hack Hydra Track 2 as a whole, not only Track 2A. Other participants are building dependency blast-radius tools, temporal memory, company brains, code change intelligence, OSV security tools, and graph-native enterprise context products.

Does “adaptive Red/Blue cyber range for supply-chain blast radius” have a meaningful wedge, or is it a thin layer over a deterministic graph simulator?

If it is weak, propose the sharper framing. Examples of possible reframings to evaluate—not assumptions to accept:

- an autonomous incident-response rehearsal for a real package compromise;
- a graph-native “prove the fix” system that executes attack and regression probes;
- a security control planner that searches for residual attack paths;
- an agent evaluation environment for supply-chain security policies;
- another direction you believe is materially better.

### 2. What should HydraDB uniquely do?

HydraDB must be central, not merely a persistence checkbox. Explain the strongest graph-native use of HydraDB in this product.

For example, should HydraDB hold:

- versioned attack-surface facts;
- temporal package/release/deployment relationships;
- prior attack routes and failed controls;
- a memory of which remediation worked against which propagation shape;
- a shared state that Red and Blue query independently;
- a benchmark corpus for comparing policies;
- a graph of evidence, claims, controls, and regression outcomes?

Tell us which one is the hero and which data should be removed from the demo.

### 3. Should LLM agents be autonomous?

We want Red and Blue to feel like agents, but we do not want an unsafe or fake demo.

Decide:

- where LLM reasoning creates real value over graph algorithms;
- which actions must remain deterministic and validated;
- which tools Red can use;
- which tools Blue can use;
- whether both agents should share HydraDB or have separate memory views;
- whether a model should choose routes, generate hypotheses, select probes, explain decisions, or all of these;
- how to show tool calls and reasoning without exposing confusing chain-of-thought;
- how to handle model failure, latency, hallucination, and invalid actions.

The proposed system must never allow a model to execute arbitrary commands or attack a public target. If a stronger demo requires code execution, specify the exact disposable sandbox boundary and how it proves a real result.

### 4. What is the single killer demo?

Choose one scenario that can be run reliably in three minutes. It should have:

- a clear initial compromise or vulnerable package;
- at least two genuinely different attack routes;
- a defense that fixes one route but leaves a residual route;
- an autonomous Red re-plan;
- a defense that eventually proves the fixture is blocked;
- HydraDB doing something visible and necessary;
- a final result that a judge understands without reading documentation.

Provide the exact spoken demo script and the exact visible events, not just a feature list.

### 5. What should the UI be?

Design the product from the first screen to the final result. We want a professional security product, not a generic AI dashboard and not a game UI.

Decide whether the main screen should be:

- a single autonomous investigation timeline;
- a Red/Blue split-screen;
- a live terminal-style event stream with a graph;
- a report-first interface with an expandable simulation;
- another structure.

The answer must explain:

- what is visible before starting;
- what automatically happens after starting;
- what the user can pause or inspect;
- what should never be a primary button;
- how the current event is emphasized;
- how the graph supports the narrative;
- how the final result communicates “contained” or “not contained”;
- how to make the product understandable at a glance in a recorded demo.

The default interaction should not require the user to understand simulation mechanics. If controls remain, explain why each one earns its place.

### 6. What should be deleted?

Be aggressive. Identify:

- UI elements to remove;
- buttons to remove or hide;
- metrics that do not help;
- technical terms to replace with plain language;
- features that make the project look generic or AI-generated;
- features that create claims we cannot prove;
- code paths that should not be demoed.

### 7. What makes it winnable?

Evaluate it as a Hack Hydra judge would:

- quality and correctness of HydraDB usage;
- product completeness and usability;
- originality;
- technical depth;
- clarity of the problem and solution;
- quality of the live demo;
- trustworthiness of the result;
- whether the project is clearly Track 2 rather than a forced fit.

Give a blunt score for the current project and a score for the recommended version. Explain the two or three changes most likely to move the score.

## Non-negotiable constraints

- No login for the public demo.
- A public package, advisory, repository, or included fixture must be enough to start.
- HydraDB cloud should be used where available.
- Public evidence can be collected, but arbitrary public code must not be executed.
- The system must distinguish observed facts, modeled graph edges, and executed fixture results.
- No fabricated vulnerability, fabricated attack success, or fabricated production claim.
- The product must be runnable from the browser and CLI/TUI.
- The demo must work even if the LLM or HydraDB temporarily fails, with an honest fallback.
- We have limited search/API credits and should avoid wasteful repeated collection.
- The implementation must be feasible in a hackathon, not a multi-month research project.

## Required response format

Return the review in this exact structure:

1. **Verdict in one paragraph** — Is Recoil worth continuing, and what is it really?
2. **The one recommended product** — one sentence and one paragraph.
3. **What to kill immediately** — concrete UI, architecture, and scope cuts.
4. **The autonomous state machine** — states, transitions, and what the user sees.
5. **The Red/Blue agent contract** — tools, permissions, model responsibilities, deterministic validation, and HydraDB role.
6. **The killer demo** — exact scenario, timeline, spoken narration, and visible proof.
7. **The new UI wireframe** — plain-text layout for landing, running, and final states.
8. **Hackathon positioning** — track fit, judging advantages, and likely objections.
9. **Implementation plan** — ordered tasks for the next 24 hours, with what not to build.
10. **Risks and falsification tests** — how we can discover quickly if this idea is not working.
11. **Final decision** — continue Recoil, pivot Recoil, or abandon it; do not hedge.

Do not recommend adding more dashboards, more decorative agent cards, generic chat, arbitrary exploit execution, or an RL training system unless you can show exactly why it improves the product and can be demonstrated reliably.
