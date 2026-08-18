# Recoil

## Working title

**Recoil — a memory-backed red/blue cyber range for the open-source software supply chain.**

> When a package, maintainer, or shared build system is compromised, Recoil runs an adaptive attacker and defender over the dependency graph, remembers every attempted route, and finds the smallest set of controls that stops the next one.

This is a new project for Hack Hydra. The existing ClaimTrace application lives beside this directory at `../claimtrace` and is intentionally isolated from Recoil. Recoil has its own Git history, dependencies, and runtime so the side project cannot collide with the hackathon build.

## 0.1 Shipped checkpoint — 18 August 2026

- [x] Public npm, Cargo, OSV, and repository evidence collectors with honest partial-failure reporting.
- [x] Bounded graph with observed repository nodes separated from modeled deployment fan-out.
- [x] Adaptive red/blue arena: Red selects a reachable route, Blue responds to that route, and Red searches again after the graph changes.
- [x] HydraDB persistence for evidence, topology, decisions, and every arena round; prior rounds can influence a route-matched Blue decision.
- [x] Browser workspace, CLI, and OpenTUI operator console backed by the same arena engine.
- [x] Twenty regression tests, a network-free adaptive benchmark, and a production bundle build.
- [x] Bounded static source graph for public JavaScript/TypeScript/Rust files, including imports, symbols, and unresolved-import uncertainty.
- [x] Latest public commit impact mapped from changed hunks to sampled source files and indexed symbols.
- [ ] Hosted HydraDB live smoke run against the configured hackathon database.
- [x] Private GitHub repository setup and push.
- [ ] Deeper Track 2B impact analysis: ownership and verified code-to-deployment paths.

### LLM boundary

There is intentionally no `OPENAI_API_KEY` in the current required environment. Recoil's core policies are deterministic and testable; adding an LLM now would make the security result less reproducible without improving the graph computation. If narration is added, it will consume the final observed/modelled report as read-only context and return prose only.

## 0. Current product contract: the adaptive arena

The one-shot deterministic timeline is not the product. It remains as a compatibility path for the early API and TUI, but the primary experience is now an adaptive episode:

```text
public evidence → typed/bounded graph → red move → blue control
       ↑                                               ↓
       └──────── HydraDB round memory ← residual route ─┘
```

The red policy chooses a valid path from the current graph. The blue policy chooses a control based on the observed route, remaining response budget, and recalled prior rounds. After the control changes the graph, red searches again. The episode ends only when all modeled high-value targets are disconnected, the defender exhausts its budget, or the round cap is reached.

This is a bounded defensive simulation. It never executes package code, sends exploit payloads, probes a target, or mutates a real deployment.

### Acceptance criteria for the new core

- The first red path and every alternate path are reconstructed from the current graph, not hardcoded event text.
- Blocking one route causes the next red move to select a different reachable route when one exists.
- Blue controls are evaluated against the current state and can be justified by the path they cut.
- Each round records before/after exposure, red route, blue action, rationale, and residual route.
- HydraDB recall can influence a blue decision, and the episode remains useful without HydraDB in local replay mode.
- The CLI and browser show the same episode state from the API rather than implementing separate simulations.
- Each round exposes Red's candidate routes and Blue's computed counterfactual controls, not only the selected actions.
- The network-free benchmark proves route adaptation and containment from graph state, with no scripted final score.

### Future Track 2 coverage

The code-graph evidence layer now includes bounded local imports/modules, indexed symbols, inferred deployment surfaces, and the latest public commit mapped from changed hunks to sampled symbols. The next layer can add ownership and verified code-to-deployment paths without diluting the adaptive supply-chain arena.

## 1. Product framing

Recoil is not another vulnerability scanner, package search engine, or generic CTF interface.

The product is a graph-native **software supply-chain incident simulator**. It combines:

1. A live dependency and ecosystem graph.
2. An attacker model that propagates compromise through that graph.
3. A defender model that evaluates upgrades, pins, quarantines, and revocations.
4. A temporal evidence layer showing what was reachable at a particular time.
5. An explanation layer that returns the exact path, evidence, uncertainty, and recommended action.

The important product question is not merely:

> Is this package vulnerable?

It is:

> If this package or release is compromised, what can it reach, when was it reachable, and which intervention gives us the greatest reduction in exposure with the least disruption?

## 2. Hack Hydra fit

### Primary track: Track 2A — Supply-chain blast radius

The participant guide asks teams to reason about:

- Which services are transitively exposed.
- Which version introduced a vulnerability.
- Which applications resolved the bad version while it was live.
- Which packages share maintainers or infrastructure.
- Whether typosquats are nearby.
- What the complete blast radius is.

Recoil answers these questions and extends the problem from static reachability to counterfactual attack-and-defense planning.

### Why the framing is accurate

The core computation is graph traversal over versioned entities and relationships. A vector index may retrieve a package description, but it cannot reliably answer:

- `Repository -> Application -> Lockfile -> PackageVersion -> VulnerableRelease`
- whether the edge existed during an exposure window
- which shared maintainer or infrastructure node creates correlated risk
- which set of graph mutations disconnects the largest exposed subgraph

HydraDB is therefore central to the product rather than being used as a decorative persistence layer.

### Relationship to existing projects

The Discord channel shows other builders exploring static package reachability and dependency graphs. Recoil must not present itself as a faster vulnerability scanner.

The differentiator is the full incident loop:

```text
ecosystem graph
  -> attack scenario
  -> propagation path
  -> affected applications/services
  -> defensive interventions
  -> counterfactual graph comparison
  -> evidence-backed incident report
```

### Relationship to CodeAnt

CodeAnt is a real reference point for the defensive/offensive security framing: its platform combines code and dependency analysis with attack-surface and exploit-oriented security workflows.

Recoil should not try to reproduce CodeAnt's breadth. It should own one narrower and more distinctive surface:

> A graph-native attack/defense simulator for dependency ecosystems, with temporal exposure replay and minimum-cost containment.

CodeAnt is the inspiration for the attack-and-defense framing, not a feature checklist or an implementation target.

### CTF mode versus product mode

The CTF feeling is valuable for the demo, but it should be a mode inside the product rather than the entire product framing.

**Incident mode** starts from a real advisory, package, or repository and produces a defensive report.

**Simulation mode** lets the user choose an attack source, gives them a limited remediation budget, and scores how much exposure they remove. This creates the CTF-like moment:

```text
Attacker: choose the initial compromise
Defender: choose two interventions
Recoil: score containment and explain the remaining paths
```

The same HydraDB graph and traversal engine power both modes. This makes the game-like experience useful for security training and product demonstrations instead of being a disconnected mini-game.

## 3. Target users

### Primary user

Platform-security or application-security engineers responding to a newly disclosed package compromise or vulnerable release.

### Secondary users

- Open-source maintainers assessing ecosystem risk.
- Developers deciding whether an upgrade is safe.
- Security researchers studying transitive propagation.
- Engineering leaders reviewing supply-chain exposure.

## 4. The no-login public product

The first version should require no account.

The user enters one of:

- An OSV advisory URL or identifier.
- An npm package and version.
- A PyPI package and version.
- A public GitHub repository URL.

Recoil then builds a bounded public investigation. The demo should not require private repositories, OAuth, or enterprise setup.

Example input:

```text
Advisory: OSV-2024-...
Repository: https://github.com/example/example-app
```

## 5. Primary demo scenario

Use a reproducible, bounded scenario rather than claiming to assess arbitrary production systems.

### Scenario

1. Start with a known OSV/GitHub advisory or compromised package release.
2. Resolve the package's dependency history from npm or PyPI.
3. Ingest a public repository's package manifest or lockfile.
4. Add clearly labeled deployment records for the demo application.
5. Mark the vulnerable release as the attack source.
6. Propagate reachability through the graph.
7. Show affected repositories, applications, and services.
8. Run candidate interventions.
9. Compare the original and remediated graph states.
10. Produce a final incident report with citations and uncertainty.

### The key visual moment

The user sees Red select a path across the dependency graph, Blue apply the smallest route-aware control, and Red immediately search the residual graph:

```text
RED  release → runner → CI → artifact → payments → customer database
BLUE block artifact promotion
RED  release → resolver → lockfile → repository → artifact → payments → customer database
BLUE pin a known-good release
CONTAINED  0 high-value targets reachable
```

The system must label this as a modeled scenario, not proof that a real production system was compromised.

## 6. HydraDB graph model

### Nodes

- `Package`
- `PackageVersion`
- `Advisory`
- `Repository`
- `Manifest`
- `Lockfile`
- `Application`
- `Service`
- `Deployment`
- `Release`
- `Maintainer`
- `Organization`
- `BuildInfrastructure`
- `TyposquatCandidate`
- `AttackScenario`
- `Intervention`

### Edges

- `PACKAGE_HAS_VERSION`
- `DEPENDS_ON`
- `RESOLVES_TO`
- `CONTAINS_MANIFEST`
- `DEPLOYED_IN`
- `EXPOSES`
- `AFFECTED_BY`
- `FIXED_BY`
- `RELEASED_AT`
- `MAINTAINED_BY`
- `SHARES_INFRASTRUCTURE_WITH`
- `SUPERSEDES`
- `SIMILAR_TO`
- `REACHES`
- `BLOCKED_BY`
- `MITIGATED_BY`

### Temporal fields

Every important relationship should carry enough information to answer “what was true at time T”:

- `observed_at`
- `valid_from`
- `valid_until`
- `published_at`
- `resolved_at`
- `confidence`
- `source_url`
- `source_type`
- `scenario_id`

If HydraDB's temporal relation format is not stable or documented, store timestamp metadata explicitly and isolate the implementation in one adapter. Do not make the whole application depend on an undocumented field.

## 7. Attack model

The first release supports bounded scenario types rather than arbitrary exploit execution.

### Attack sources

- Compromised package release.
- Vulnerable package version.
- Compromised maintainer account.
- Typosquat package.
- Shared build or release infrastructure.

### Propagation rules

An attack can propagate when:

1. A repository resolves an affected package version.
2. The package is reachable through a transitive dependency path.
3. A deployment occurs during the affected time window.
4. Shared maintainer or infrastructure relationships create a modeled correlation.

Every propagated edge must retain an explanation path. The system must never return only a risk score without the path that produced it.

## 8. Defense model

Candidate actions:

- Upgrade a package version.
- Pin a transitive dependency.
- Replace a dependency.
- Quarantine a repository or service.
- Revoke a release.
- Block a maintainer or registry source.
- Rotate a shared build dependency.

Each action has an estimated cost:

- Number of affected repositories.
- Number of new dependency conflicts.
- Number of services temporarily unavailable.
- Number of lockfiles requiring changes.

The objective is:

```text
maximize exposure removed
while minimizing remediation cost and disruption
```

## 9. RL / planning layer

RL is optional and must serve the product.

### Environment state

- Current graph state.
- Active attack source.
- Reachable application/service nodes.
- Available defensive actions.
- Remediation cost.

### Actions

- Compromise a package release.
- Follow a dependency edge.
- Upgrade a package.
- Quarantine a node.
- Revoke a release.
- Stop the simulation.

### Reward

```text
negative reachable exposure
- remediation cost
- service disruption
```

### Implementation order

1. Implement deterministic graph propagation.
2. Implement exhaustive or beam-search intervention planning.
3. Store simulation states and outcomes in HydraDB.
4. Only then add a small RL or Monte Carlo policy if time permits.

The submission should demonstrate the environment and its result, not claim that a sophisticated RL model is required for the product to work.

## 10. Data sources

### Required

- OSV API or downloaded OSV records.
- GitHub Advisory Database data where available.
- npm registry metadata.
- PyPI metadata if time permits.
- Public GitHub `package.json`, lockfiles, or equivalent manifests.

### Optional

- Release timestamps.
- Maintainer and organization metadata.
- Package download history.
- Shared repository or CI infrastructure signals.
- Typosquat candidates.

### Synthetic data policy

Synthetic application and deployment records are allowed for the demo if clearly labeled. They should represent realistic repositories and deployment windows, not be presented as real customer data.

## 11. Benchmark plan

### Ground truth

Use held-out advisories from OSV and the GitHub Advisory Database.

For each advisory:

1. Build the ecosystem graph using data available before the advisory's publication time.
2. Hold out the advisory or affected relationship.
3. Ask Recoil to recover affected package versions and dependency paths.
4. Compare with the known affected versions and paths.

### Metrics

- Package/version precision.
- Package/version recall.
- Affected repository precision and recall.
- Path completeness.
- Exposure-window accuracy.
- Query latency.
- Ingestion cost.
- Containment ratio.
- Number of interventions required.

### Baselines

- `npm ls` or equivalent recursive resolver.
- Flat package-name matching.
- Similarity-only retrieval.
- A simple rule-based blast-radius implementation without HydraDB traversal.

The README should include both the benchmark result and one complete human-readable incident example.

## 12. Product UI

The interface should feel like a security operations tool, not a generic AI dashboard.

### Main views

1. **Scenario intake** — package, advisory, or repository input.
2. **Graph build** — live ingestion and entity resolution.
3. **Attack view** — propagation path and affected nodes.
4. **Defense view** — intervention controls and what-if comparison.
5. **Evidence view** — source URLs, timestamps, confidence, and unresolved data.
6. **Incident report** — final conclusion and recommended actions.

### The four investigator stages

- **Recon** — identify package, advisory, release, and repository entities.
- **Propagation** — trace dependency and infrastructure paths.
- **Exposure** — calculate temporal reachability and affected services.
- **Containment** — search for the safest defensive intervention.

These are real pipeline stages, not decorative agents.

### Final report

The final screen should answer:

- What happened?
- What is affected?
- Why do we believe it?
- What remains unknown?
- What should the user do next?

## 13. API shape

Suggested endpoints:

```text
POST /api/scenarios
GET  /api/scenarios/:id/events
GET  /api/scenarios/:id/graph
POST /api/scenarios/:id/simulate
POST /api/scenarios/:id/interventions/evaluate
GET  /api/scenarios/:id/report
```

The frontend should receive streamed events such as:

```text
scenario:started
source:ingested
package:resolved
edge:created
attack:path-found
exposure:calculated
intervention:evaluated
scenario:complete
```

## 14. Three-day execution plan

### Phase 1 — Vertical slice

- Create one scenario using one advisory and one public repository.
- Ingest package metadata and lockfile dependencies.
- Write typed nodes and edges to HydraDB.
- Query one complete attack path.
- Render the graph and final answer.

### Phase 2 — Defense loop

- Add two or three intervention types.
- Implement graph-state comparison.
- Add containment scoring.
- Show the best intervention in the UI.

### Phase 3 — Evaluation and polish

- Run a small held-out advisory benchmark.
- Record precision, recall, latency, and cost.
- Add source citations and uncertainty labels.
- Record a three-minute demo.
- Freeze features and test the deployed path.

Do not add a full enterprise connector system, arbitrary exploit execution, a full RL training pipeline, or a complete PyPI implementation unless the vertical slice is already reliable.

## 15. Security and trust boundaries

Recoil must be a defensive simulator.

- Do not execute downloaded package code.
- Do not exploit real systems.
- Do not publish actionable exploit payloads.
- Treat package metadata and repository files as untrusted input.
- Use static metadata and dependency relationships only.
- Clearly label modeled scenarios versus observed facts.
- Cite every external evidence source.
- Use confidence states: confirmed, inferred, synthetic, and unknown.

## 16. Winning submission narrative

### Problem

Modern dependency incidents spread transitively and temporally. Existing tools report vulnerable packages, but responders still need to know what was reachable and how to contain it.

### Product

Recoil turns the software supply chain into a living attack-and-defense graph.

### HydraDB contribution

HydraDB stores versioned package, repository, maintainer, deployment, and infrastructure relationships and enables multi-hop temporal and counterfactual queries.

### Demo

Compromise a package, watch the attack propagate, then find the smallest defensive intervention that disconnects the exposed graph.

### Result

The user receives a cited incident report with affected paths, exposure windows, remediation options, and uncertainty.

## 17. Definition of done

The adaptive arena is the first complete product slice. It is done when:

- [x] A no-login browser flow accepts an npm/Cargo package, advisory, or public repository.
- [x] Evidence collection produces sources, provenance, and explicit partial failures.
- [x] The graph shows a multi-hop path and alternate routes.
- [x] At least two controls are selected from current graph state and compared through recomputation.
- [x] The final report contains evidence, uncertainty, route history, and containment outcome.
- [x] CLI and TUI exercise the same engine as the browser.
- [x] The local benchmark asserts route adaptation and both containment and attacker-win outcomes.
- [x] A bounded source-level graph is collected without installing or executing repository code.
- [x] The latest public commit is mapped to sampled source files and symbols when GitHub exposes patch hunks.
- [x] No downloaded package code is executed.
- [ ] Hosted HydraDB round-trip is demonstrated in the recording.
- [x] A private GitHub push is verified.
- [ ] Ownership and verified function-to-deployment impact are added after more public evidence is available.

## 18. Decision rule

If the first vertical slice cannot answer one complete question end-to-end, stop expanding the scope.

The minimum successful product is:

> Given an advisory and repository, show one evidence-backed dependency path, one exposure window, and one intervention that reduces the blast radius.

Everything else is optional.
