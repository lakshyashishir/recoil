# Recoil implementation plan

## Product decision

Recoil is an evidence-backed supply-chain investigation product, not a fictional enterprise cyber range.

> **Prove the path. Prove the fix.**

Given an advisory and public repositories, Recoil must distinguish:

```text
REACHED          affected version + sampled source import
DECLARED_ONLY    affected version, but no sampled source import
NOT_AFFECTED     resolved version outside the advisory range
UNKNOWN          evidence incomplete or identity unresolved
```

The adversarial loop is retained as a product explanation:

```text
RED path prover → BLUE fix planner → RED residual verifier
```

## Current state

### Completed

- [x] Independent Recoil repository and runtime, isolated from ClaimTrace.
- [x] Public npm, Cargo, OSV, and GitHub repository collectors.
- [x] GitHub API caching with explicit rate-limit and partial-collection errors.
- [x] Bounded JavaScript/TypeScript/Rust source graph with local imports, external package imports, symbols, and source URLs.
- [x] Lockfile resolution for npm and Cargo evidence.
- [x] OSV affected-range and fixed-version evaluation.
- [x] Multi-repository ingestion for up to four public GitHub repositories.
- [x] Three-way reachability classification plus honest `UNKNOWN` behavior when source collection is incomplete.
- [x] Lockfile commit-history collection for temporal exposure evidence.
- [x] Source-backed observed graph with no fictional deployment or customer nodes.
- [x] Latest public commit impact attached to sampled importer paths with optional CODEOWNERS attribution.
- [x] Temporal rewind report that refuses to claim a path before its evidence existed.
- [x] Counterfactual fixed-version check and per-repository remediation status.
- [x] HydraDB temporal evidence memories with dated metadata, chunking, retries, and indexing status.
- [x] HydraDB temporal recall surfaced in the final report.
- [x] Autonomous browser flow: one input, progress timeline, result report.
- [x] Autonomous CLI flow using the same API state machine.
- [x] Network-free integration test with mocked public records.
- [x] Product benchmark covering `REACHED`, `DECLARED_ONLY`, `NOT_AFFECTED`, `UNKNOWN`, fix proof, and rewind.
- [x] Portable source-cited evidence receipt with integrity hash and explicit non-execution boundary.
- [x] Cross-ecosystem external-import proof for JavaScript/npm and Rust/Cargo, including qualified Rust crate paths.
- [x] Optional advisory-symbol scope is validated against indexed source and appended to the cited path/receipt.
- [x] Browser production build and regression suite.
- [x] Repeatable real smoke command with strict partial/unknown failure status.
- [x] Shared evidence-quality contract across report, CLI, browser, and receipt.
- [x] Attach a sanitized HydraDB temporal-read receipt to rewind reports and exported receipts.
- [x] Persist the observed evidence topology through HydraDB's documented `graph_payload` contract and summarize returned graph-context triplets.
- [x] Poll HydraDB's asynchronous indexing status before recalling graph context; expose queued timeouts without claiming persistence.
- [x] Attach a per-hop provenance chain to each repository finding and portable receipt: advisory, lockfile resolution, repository, import/symbol, and dated observation.

### Still required before calling the hackathon build complete

- [ ] Validate and freeze one real advisory plus three real public repositories for the recording.
- [ ] Run that case against the configured HydraDB cloud database, with completed indexing and temporal recall, and retain the successful output without committing secrets or cache files.
- [ ] Verify the browser and CLI against the same real case.
- [x] Improve source-level path precision by connecting advisory-described symbols to indexed symbols with a validated optional model step.
- [x] Add cross-case HydraDB recall that visibly relates a new case to a prior package/repository fact.
- [x] Add a final provenance/limitations pass so every displayed claim has an explicit evidence boundary.
- [x] Delete the retired fictional arena, executable fixture, agent loop, and legacy routes from the shipped product path.
- [ ] Render and inspect the browser at common desktop and mobile widths.
- [ ] Update the final demo recording and repository instructions after the real smoke run.

## Architecture

```text
browser / CLI
      ↓
POST /api/scenarios/:id/investigate
      ↓
server/investigation.js
      ├── server/collectors.js
      │     ├── OSV advisory
      │     ├── npm / crates.io registry
      │     ├── GitHub manifests and lockfiles
      │     ├── bounded source files
      │     └── lockfile commit history
      ├── src/core/evidence.js
      │     ├── semver predicate
      │     ├── reachability classifier
      │     └── observed graph builder
      ├── src/core/investigation.js
      │     ├── temporal report
      │     ├── fix challenge
      │     └── rewind
      └── server/hydra.js
            ├── dated memory ingestion
            └── temporal/cross-case recall
```

## Evidence contract

Observed facts:

- advisory identifier, summary, publication date, affected ranges, references;
- registry versions and maintainers;
- repository manifest and lockfile;
- resolved package version;
- sampled source file and external import;
- lockfile’s public commit history;
- optional workflow, container, and CODEOWNERS signals.

Inferences:

- source-level path classification from observed import edges;
- exposure duration from observed lockfile history and advisory publication;
- fixed-version counterfactual from OSV and semver.

Not claimed:

- runtime execution;
- production deployment reachability;
- successful compromise;
- a negative result when source collection failed.

## HydraDB contract

Each investigation writes bounded, idempotent memories:

1. advisory fact;
2. one reachability fact per repository;
3. one fix proof per repository;
4. observed graph topology and provenance.

Temporal fields are explicit metadata:

```text
valid_from
valid_until
recoil_scenario_id
recoil_repository
source_urls
```

The application must show whether each write was persisted, queued, failed, or skipped. HydraDB recall is evidence context and cross-case memory; the deterministic report builder remains the authority for the local, source-cited verdict.

## Optional model boundary

Do not use an LLM to invent paths, choose arbitrary controls, or execute code. If enabled, the model may:

1. read advisory prose;
2. identify a likely affected export/function/configuration;
3. propose a symbol candidate;
4. pass that candidate to server-side validation against the indexed source graph.

An invalid or absent symbol degrades to module-level evidence or `UNKNOWN`. This makes the model useful without allowing it to manufacture security conclusions.

## Killer demo

The recording uses one advisory and three real repositories:

```text
repository A → REACHED
repository B → DECLARED_ONLY
repository C → NOT_AFFECTED
```

The spoken sequence:

1. “A vulnerable dependency is not automatically vulnerable application code.”
2. Submit the advisory and repositories.
3. Show the exact source-backed path for A.
4. Show why B is declared-only rather than compromised.
5. Rewind before disclosure and show the path’s first observed date.
6. Show Blue’s real fixed version and semver verdict.
7. Show Red’s residual verification.
8. Show HydraDB memory count and temporal recall.

The visual product is a calm investigation timeline and a result-first report. The judge should never need to operate an arena, understand a fictional deployment graph, or interpret an exposure percentage.

The competitive claim is intentionally narrow: Recoil turns “package appears in the dependency tree” into
three auditable outcomes across real repositories—reached source, declared-only noise, or already safe—then
rewinds the same evidence and proves whether the advisory’s fixed version is admissible. The graph and
HydraDB are the evidence substrate; they are not a decorative score or a simulated production environment.

## Validation gates

Before the final recording:

```bash
npm test
npm run benchmark
npm run build
npm run start
npm run smoke:real
npm run cli -- "<verified advisory> <real repository-a> <real repository-b> <real repository-c>"
```

Manual checks:

- every repository result opens at least one source URL;
- every `REACHED` result has an external import in the sampled graph;
- every `DECLARED_ONLY` result completed source collection;
- every `UNKNOWN` result explains the missing evidence;
- the fixed version comes from OSV;
- rewind uses a stable current timestamp;
- HydraDB status is visible and truthful;
- no fake placeholder repository is present in the demo;
- no public repository code is installed or executed.

## Checkpoint history

- `62b5786` — preserve real package reachability evidence
- `be9455d` — autonomous evidence investigation flow
- `97f19ad` — autonomous evidence investigation and CLI
- `f3b377f` — source reachability and fix-proof benchmark
- `b4f99b6` — shared evidence quality in report, CLI, browser, and receipt
- `b941677` — incomplete reports use non-definitive language
- `d5d82bc` — progress stream labels evidence gaps
- `618b37a` — inconsistent snapshots cannot bypass the recording gate
- `b1e0801` — TUI shares the evidence recording gate
- `32c396b` — preserve all resolved package versions in the graph
- `2b14446` — mark the pre-redesign review brief archived
- `86c1f0d` — persist observed topology through HydraDB BYOG
- `d1b38d2` — use HydraDB v2 REST query field names
- `cd21bcd` — bound optional advisory-scope model calls
- `60920c3` — wait for HydraDB graph indexing before recall
- `645eab9` — expose the sanitized HydraDB graph receipt in the final report
- `7a00cd3` — record the graph receipt checkpoint
- `98f520f` — cover strict recording preflight with a no-network regression test
- `c8e311a` — expose sanitized HydraDB graph context in the CLI and portable receipt
- `4bd53fb` — make JSON CLI runs fail on incomplete evidence
- `9c476aa` — require completed HydraDB indexing and temporal recall in recording smoke
- `32868b1` — load project `.env` from the CLI entrypoint
- `4ceb322` — align browser metadata with the evidence-proof product claim
- `2a24a9a` — distinguish HydraDB writes from temporal-read failures across surfaces
- `852675e` — reject investigations without repository evidence before collection
- `dc1cfed` — surface HydraDB read status and graph triplets in the TUI
- `003661d` — attach a per-hop evidence provenance chain to findings and receipts
- `594ff00` — expose provenance-hop summaries and expansion in the CLI

Keep committing after each green validation gate. Never commit `.env`, GitHub cache contents, or HydraDB response data containing credentials.

The reproducible local gate is `npm run verify`; it runs the regression suite, evidence benchmark, and production build in order.
