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

The proof loop is retained as a product explanation:

```text
observed path → proposed fix → residual re-check
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
- [x] Add a network-free recording doctor with optional bounded endpoint probes so demo readiness is diagnosed before collection.
- [x] Add CLI `--recording` enforcement for the three-way contrast plus completed HydraDB write and temporal-read proof.
- [x] Share the same recording blocker contract between the CLI and real smoke, with regression coverage for ready and failed cases.
- [x] Normalize HydraDB graph-context response shapes so top-level triplets remain visible in rewind, browser, and receipts.
- [x] Resolve bounded transitive lockfile paths and preserve observed package-to-package `DEPENDS_ON` edges in the graph, HydraDB payload, receipt, and report.
- [x] Surface each observed transitive package hop as a source-cited proof step in the report and portable receipt.
- [x] Repeat the resolved dependency chain in HydraDB's dated reachability memory for explainable temporal recall.
- [x] Print observed transitive package chains in the default CLI summary for a legible terminal demo.
- [x] Retain a sanitized, git-ignored recording receipt when the strict real smoke gate passes.
- [x] Bring the OpenTUI report pane to parity with browser/CLI evidence paths, proof coverage, and transitive chains.
- [x] Surface API startup failures in the browser landing state instead of silently rendering an empty product.
- [x] Skip HydraDB writes for incomplete evidence by default so failed/unknown runs do not consume credits or become durable precedent.
- [x] Expose the recording contract and evidence-proof capabilities through `/api/health` for operator and demo readiness checks.
- [x] Require non-empty HydraDB memory and dated temporal recall before strict recording can pass.
- [x] Prefer raw GitHub source reads after tree discovery to protect the strict recording workflow from API-rate exhaustion.
- [x] Remove heuristic source-to-deployment surface inference so every displayed path remains tied to observed repository evidence.
- [x] Keep counterfactual fix proofs undated so generated remediation output cannot masquerade as historical evidence.
- [x] Require strict recording to account for every HydraDB memory acknowledgement, not just HTTP success.
- [x] Keep ordinary HydraDB status queued until the complete memory batch is acknowledged across all clients.
- [x] Cache bounded raw GitHub source reads so repeat recordings reduce public requests without changing evidence semantics.
- [x] Surface sanitized prior-case summaries from HydraDB recall so memory is inspectable without exposing raw chunks.
- [x] Show the bounded observed import line inside each source-backed proof step for fast human verification.
- [x] Add offline SHA-256 receipt verification so exported evidence can be checked without the running app.
- [x] Render the safe observed-path → proposed-change → re-check proof consistently in browser, CLI, and TUI clients.
- [x] Persist cross-repository shared-resolution correlations as explicit HydraDB graph edges.
- [x] Isolate mocked test responses from the live GitHub evidence cache.
- [x] Prefer raw GitHub reads for known manifests, lockfiles, workflows, containers, and ownership files; keep optional directory metadata non-fatal during API outages.
- [x] Add an explicit in-process CLI transport that reuses the autonomous state machine when an API server is not available.
- [x] Make strict recording require an actual HydraDB graph triplet, not only a successful memory write and dated recall.
- [x] Reuse one recursive GitHub tree for source and workflow discovery, keeping the workflow directory API as a failure fallback.
- [x] Allow the CLI to target a caller-supplied case ID so browser and terminal clients can inspect the same API-backed investigation.
- [x] Include OpenTUI compilation in the reproducible `npm run verify` gate.
- [x] Align the judge-facing demo runbook with the strict HydraDB graph-recall recording gate.
- [x] Resolve repository-only package identity deterministically; ambiguous multi-repository identities remain `UNKNOWN` with an explicit reason in the report, CLI, and receipt.
- [x] Make strict recording preflight require an advisory ID so dated exposure and fixed-version claims cannot start from a package-only query.
- [x] Reject repository-only client requests before collection; the browser, API, and direct CLI now share a clear advisory/package input contract.
- [x] Keep Vite alive when the API process cannot bind, so startup failures are visible in the browser instead of appearing as a blank page.
- [x] Align operator documentation with the advisory/package input contract and strict recording gate.

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
6. Show the advisory’s real fixed version and semver verdict.
7. Show the residual re-check.
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

- `f1a0cc8` — isolate mocked public responses from the live evidence cache
- `d52eac9` — graph-link shared package resolutions across repositories
- `a755e08` — expose the Red → Blue → Red proof loop across browser, CLI, and TUI
- `d8534c7` — add offline SHA-256 receipt verification
- `fc5fdbe` — print observed proof excerpts and prior-case summaries in the CLI
- `f0f76d9` — show bounded observed import excerpts in evidence proof chains
- `29fe29e` — surface sanitized prior evidence from HydraDB recall
- `8705c86` — cache bounded raw GitHub source reads
- `830aa05` — benchmark shared-resolution evidence and UNKNOWN overlap
- `c12ce52` — surface cross-repository resolution evidence across clients and HydraDB
- `57cf931` — explain model-scope fallback without overstating failure
- `2a83f36` — make the browser's new-case action reset server state
- `4313dcd` — surface evidence paths in the OpenTUI report pane
- `b080e77` — retain verified smoke receipts outside version control
- `f46817d` — explain resolved dependency paths in HydraDB temporal memories
- `7370f34` — cite transitive dependency hops in reports and receipts
- `b62adaa` — preserve observed transitive dependency paths across graph and receipt surfaces
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
- `131c1ce` — normalize HydraDB memory acknowledgements across response shapes
- `a3090f8` — normalize asynchronous HydraDB status identities
- `4bd53fb` — make JSON CLI runs fail on incomplete evidence
- `9c476aa` — require completed HydraDB indexing and temporal recall in recording smoke
- `32868b1` — load project `.env` from the CLI entrypoint
- `4ceb322` — align browser metadata with the evidence-proof product claim
- `2a24a9a` — distinguish HydraDB writes from temporal-read failures across surfaces
- `87f45f8` — expose the recording contract in API health
- `2987888` — record the API health checkpoint
- `642cdc5` — require non-empty HydraDB temporal proof
- `a0b9c43` — expose strict recording requirements
- `7439468` — prefer raw GitHub source reads for bounded source sampling
- `6d10e24` — remove inferred deployment surfaces
- `48255fe` — keep generated fixes out of temporal proof
- `ef7a122` — require complete HydraDB memory acknowledgement
- `17be7f9` — keep partial HydraDB writes queued across all clients
- `852675e` — reject investigations without repository evidence before collection
- `dc1cfed` — surface HydraDB read status and graph triplets in the TUI
- `003661d` — attach a per-hop evidence provenance chain to findings and receipts
- `594ff00` — expose provenance-hop summaries and expansion in the CLI
- `43fc7ce` — record provenance checkpoints
- `6937360` — add recording preflight doctor
- `59b82d2` — enforce strict recording mode in the CLI
- `eae4387` — share strict recording blockers between CLI and smoke
- `168b01b` — preserve HydraDB graph triplets across report surfaces
- `8ba1a10` — make strict recording workflow explicit in the demo runbook
- `0298623` — surface API startup failures in the browser
- `2635831` — defer HydraDB writes for incomplete evidence
- `87f45f8` — expose recording contract in API health

Keep committing after each green validation gate. Never commit `.env`, GitHub cache contents, or HydraDB response data containing credentials.

The reproducible local gate is `npm run verify`; it runs the regression suite, evidence benchmark, browser production build, and OpenTUI compilation in order.
