# Recoil

**Prove the path. Prove the fix.**

Recoil is an evidence-backed software-supply-chain investigation tool. Give it one public GitHub repository for an inventory-first scan, or an OSV/GHSA/CVE advisory plus one to four repositories for a focused comparison. It reads public advisory, registry, lockfile, repository, source-import, and commit-history evidence, then answers:

1. Does the affected version actually reach sampled application code?
2. When did that path first appear in the repository history?
3. Does a real fixed version remove the path, or does the repository need a manifest change?

Recoil is deliberately not a vulnerability dashboard and not a live exploit runner. Every conclusion is tied to collected public evidence, and incomplete collection is reported as `UNKNOWN` rather than guessed.

## Why this is different from a dependency dashboard

The winning demo is not “we drew a larger package graph.” It is a controlled contrast that ordinary
dependency scanners collapse into one alert:

- **Reachability, not declaration:** an affected lockfile entry is separated from an observed import in
  application source. The same proof works across npm/JavaScript and Cargo/Rust repositories.
- **Source impact, not just package presence:** for a reached import, Recoil follows a bounded cone of
  resolved local-import edges through the sampled files and links each observed file back to its public
  source. It labels this precisely as static source context-not a runtime call graph or execution trace.
- **A dated answer:** the lockfile’s public history and the advisory publication date produce a
  pre-disclosure rewind. The question becomes “was this path already present when the advisory was
  published?” rather than “is this package somewhere in the tree?”
- **A fix that has to survive:** Recoil does not recommend an arbitrary upgrade. It checks the advisory’s
  actual fixed version against the repository’s declared range and reports when a manifest change is
  required.
- **A model with a narrow job:** when enabled, the OpenAI step extracts a likely affected symbol from
  advisory prose. Recoil validates that name against indexed source and appends the matched symbol to
  the evidence path; an invalid model answer cannot create a finding.
- **An actionable handoff:** the fix proof includes a package-manager-aware command for the observed
  lockfile, plus a copyable evidence note. The command is only a suggestion; Recoil never edits or
  executes the repository.
- **A remediation queue:** the Fix Check view rolls the same proof up across every supplied repository,
  showing the observed resolution, the next action, the source record, and a copyable command only when
  the advisory-backed version check supports one.
- **HydraDB as the evidence timeline:** HydraDB stores the advisory, observed paths, graph provenance,
  change impact, and fix proofs as dated memories. Recoil recalls prior related cases, while the local
  source-cited classifier remains the verdict authority.
- **Cross-repository overlap:** when multiple repositories resolve the same package version, Recoil
  surfaces that observed overlap and stores it as a separate HydraDB correlation memory instead of
  hiding the blast-radius relationship inside a graph dump.
- **Separate case sessions:** each browser submission creates a new case record, so a completed
  investigation is never overwritten by the next one. Receipts and briefs follow that case ID,
  while HydraDB keeps the durable cross-case history.
- **Repository-first handoff:** a judge can paste any public repository without knowing its package or
  advisory. Recoil inventories its recorded manifests and lockfiles, checks bounded package versions
  against OSV in one batch, and returns a complete negative result or expands only the affected advisory
  paths. No prepared package selector is required.

This positions Recoil as a **cross-ecosystem reachability and remediation proof layer** for Track 2:
Track 2A’s supply-chain blast radius is the entry point, while Cargo/Rust source proof, changed-symbol
impact, temporal rewind, and fix verification give the project a credible Track 2B-quality depth. We do
not claim a runtime compromise; the strength is that every displayed hop can be opened and audited.

## The product loop

```text
repository → recorded dependency inventory → advisory match → real lockfile → source import
       → REACHED / DECLARED_ONLY / NOT_AFFECTED / UNKNOWN
       → temporal rewind → OSV fixed version → residual-path fix proof
```

The proof sequence is evidence-first:

- **Observed path:** constructs a cited route from the advisory to the resolved package and sampled source import.
- **Proposed change:** chooses an OSV-supported fixed version and checks whether each declared range admits it.
- **Re-check:** checks whether the proposed change leaves an affected route or requires a manifest change.

Completed browser cases open in a persistent security console. A repository is a durable watched asset;
every rescan creates a new immutable case beneath it. Incidents keeps only the latest verdict for each
repository/advisory pair, so an old vulnerable scan cannot keep an already-fixed incident open. Graph opens
on one connected incident or repository neighborhood instead of dumping the whole workspace at once.
History exposes HydraDB-backed evidence changes, Ask resolves bounded workspace questions, and Connect
exposes the same engine through MCP, CLI, Markdown briefs, and verifiable receipts. The graph is an inspection
surface rather than the verdict itself.

The landing input is the watch entry point. Pasting one repository creates the durable watch and runs its
first full dependency inventory. Pasting an advisory with repositories runs a focused comparison and adds
those repositories to the same watchlist. Returning to the landing page never deletes prior watches or cases.

### Workspace and account model

The hackathon build is intentionally one tenant and does not require an account. The Node service owns one
workspace file (`.recoil-data/workspace.json` by default) containing the watchlist, immutable case snapshots,
monitor state, and notification history. This keeps the public demo instant while preserving repositories
across process restarts. An account-enabled version only needs to partition this same workspace contract by
tenant ID; it does not require changing the evidence engine or incident model.

`Check all` rescans every watched repository within the configured concurrency limit. Set
`RECOIL_WATCH_INTERVAL_MS` to opt into scheduled checks, and optionally set
`RECOIL_NOTIFICATION_WEBHOOK_URL` to receive a JSON event when a latest verdict becomes reachable or changes.
Synthetic inputs are not used: every incident is recomputed from a real scan case.

The included App Runner configuration checks active watches every six hours. Set the interval to `0` when
running a quota-constrained local demo; watches remain durable and can still be checked manually.

This is a bounded defensive analysis. Recoil never installs dependencies, executes public repository code, sends exploit payloads, or probes a live target.

## Why HydraDB is central

HydraDB stores the investigation as dated evidence memories rather than as a final score:

- advisory publication and modification facts;
- repository reachability facts with `valid_from`, source URLs, and verdicts;
- fix proofs and residual-path results;
- observed graph topology and provenance;
- bounded local-import cones behind reached package imports, including source URLs and indexed symbols;
- latest public commit impact on sampled importers, with CODEOWNERS attribution when available;
- cross-case retrieval of related package/repository evidence.

The observed graph is written through HydraDB's documented Bring-Your-Own-Graph (`graph_payload`) path:
explicit advisory, package, repository, lockfile, source, and symbol entities are attached to the
corresponding evidence memory with typed relations. When a lockfile exposes install paths, Recoil also
resolves a bounded root-to-affected transitive chain and writes each observed package-to-package
`DEPENDS_ON` edge and repeats that chain in the dated reachability memory; ambiguous package versions are left unresolved rather than guessed. Recoil never
sends its internal graph helper field as a memory property. Raw HTTP queries use HydraDB's documented v2 field names, including
`query_by`, `metadata_filters`, and `graph_context: true`; the report keeps only a bounded summary of
returned triplets so the receipt proves graph retrieval without copying raw chunks.

Local source-to-source edges from the bounded cone are persisted as typed `IMPORTS` relations in the
HydraDB graph payload, and the same bounded source context is included in the browser proof, CLI/TUI
summary, and portable receipt. Historical rewind removes that context when the source evidence was not
yet observed.

The report exposes the write and recall result. Recoil polls HydraDB's asynchronous indexing status for a
bounded window before recalling, so `persisted` means the submitted memories reached `completed`; a timeout
remains visibly `queued` with its indexing error. Temporal rewind is computed from the collected lockfile
history and uses HydraDB’s dated evidence as the durable investigation record. Without HydraDB credentials,
the same local evidence proof remains available and is labelled local replay.

Completed runs perform two deliberately different HydraDB reads. Temporal recall excludes the active case so
it can provide prior dated context without echoing the current write. A second, case-scoped graph read filters
`recoil_scenario_id` to the active case and includes observed graph labels in its query; strict recording requires
that read to return at least one current relation. This prevents an unrelated historical triplet from being
presented as proof that the current graph was stored. Recoil also intersects returned triplets with the local
observed edge endpoints; a scoped but unmatched relation remains review-required.

Provider recall payloads stay server-side. Browser/API snapshots expose only bounded counts, source URLs,
prior-case metadata, and normalized graph triplets; raw HydraDB chunks and transport responses are not sent
to the client. The report and receipt use the same sanitized temporal summary.

The rewind report also carries a sanitized temporal-read receipt: the as-of timestamp, HydraDB status,
dated fact count, related prior-case IDs, prior-case evidence kinds/repositories, and returned source URLs.
Raw retrieved chunks are never copied into the browser report or downloadable receipt, and HydraDB retrieval
cannot change a local verdict. The report keeps this prior-evidence summary collapsed until the reviewer
chooses to inspect it.

Each reachability memory also carries a small structured scan snapshot: repository, resolved version,
classification, sampled import count, and fix status. On a later scan, Recoil compares the newest prior
snapshot for each repository with the current public-evidence result and shows only real changes in the
History view. This is a durable HydraDB comparison, not a client-side cache or a claim that a deployment
changed; repositories without comparable prior snapshots are omitted from the delta.

When a dated reconstruction is opened, the History view also compares its observed graph with the current
case graph. It reports added and removed evidence entities and relationships, with labels taken from the
two collected snapshots. This is a temporal graph diff over Recoil evidence-not a simulated attack route
and not a claim about runtime infrastructure.

## Run locally

```bash
npm install
cp .env.example .env
# fill HYDRA_DB_API_KEY and HYDRADB_DATABASE_ID when persistence is wanted
npm run start
```

The browser runs at `http://127.0.0.1:5173`; the API runs at `http://127.0.0.1:8787`. Set `RECOIL_HOST=0.0.0.0` and point `RECOIL_API_URL` at the reachable API address when serving the app from a container or hosted environment. `GET /api/health` exposes the product capability and recording contract: the required three verdicts, HydraDB persistence and temporal-recall requirements, and whether partial HydraDB writes have been explicitly enabled.

For a hosted demo, Recoil can serve the built frontend and API from one long-running process. The repository includes a multi-stage `Dockerfile`, an App Runner source configuration, CloudFront infrastructure, public-demo request limits, immutable asset caching, and SPA fallback. See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

Repository source sampling reads the GitHub tree once, then prefers `raw.githubusercontent.com` for the
bounded source files so a three-repository recording does not spend one API request per source file. Raw
source responses are cached under the same bounded TTL as GitHub JSON, making a second run replayable
without re-reading every source file from the public endpoint.
Known manifests, lockfiles, workflow files, container files, and ownership metadata prefer raw GitHub
content, then fall back to the Contents API with cache and explicit rate-limit errors. The recursive
repository tree is reused for source and workflow discovery, avoiding a second directory request per repo;
the workflow directory endpoint is retained only as a fallback when tree discovery fails. Commit history
still uses the API, and optional metadata degrades to an explicit `unavailable` signal when unreachable.
For known public paths, a raw GitHub 404 is treated as an observed missing file rather than retried through
the API; transport failures still use the API fallback. This keeps a multi-repository recording within a
predictable public-request budget.
For JavaScript repositories, Recoil accepts root and bounded workspace `package.json` manifests, npm `package-lock.json`/`npm-shrinkwrap.json` (including legacy nested lockfile trees), bounded Yarn
classic/Berry `yarn.lock` entries, and the stable package/dependency records in pnpm v6-v9 lockfiles.
Selectors are retained as lock-entry provenance; multiple resolved versions remain ambiguous instead of
being collapsed into a confident path.

For separate processes:

```bash
npm run server
npm run dev
```

Useful environment variables are documented in [.env.example](.env.example): `HYDRA_DB_API_KEY`, `HYDRADB_DATABASE_ID`, `HYDRADB_COLLECTION_ID`, `HYDRADB_INGEST_BATCH_SIZE`, `HYDRADB_INDEX_WAIT_MS`, `HYDRADB_INDEX_POLL_MS`, `HYDRADB_RECALL_WAIT_MS`, `HYDRADB_RECALL_POLL_MS`, `HYDRADB_TEMPORAL_RECALL_WAIT_MS`, `GITHUB_TOKEN`, `RECOIL_CACHE_DIR`, `RECOIL_NETWORK_RETRIES`, `RECOIL_SOURCE_FILE_LIMIT`, `RECOIL_WORKSPACE_FILE`, `RECOIL_WATCH_INTERVAL_MS`, and `RECOIL_NOTIFICATION_WEBHOOK_URL`. Recoil ingests a bounded memory batch and polls all acknowledged source IDs together; lower `HYDRADB_INGEST_BATCH_SIZE` only when diagnosing a provider limit. A GitHub token is optional but prevents unauthenticated API limits. The collector caches GitHub JSON reads locally for the configured TTL and retries transient network failures a bounded number of times; cached evidence is never treated as a substitute for a failed source. HydraDB recall retries an empty result for a bounded window because accepted memories can become searchable shortly after indexing reports completion. When graph memories arrive before temporal memories, the focused reachability query gets its own bounded `HYDRADB_TEMPORAL_RECALL_WAIT_MS` window; if it remains empty, the report keeps the cloud read visibly empty and strict recording fails. Raise `RECOIL_SOURCE_FILE_LIMIT` for a large, trusted demo repository only when you are comfortable with the extra public reads; the chosen bound is preserved in each finding.

Regression tests use a disposable temporary cache, so mocked public responses cannot contaminate a later
live recording through `.recoil-cache`.

HydraDB writes are skipped by default when evidence quality is incomplete. This avoids spending memory/indexing
calls on an unverified case and prevents partial findings from becoming durable precedent. Set
`RECOIL_HYDRA_PERSIST_PARTIAL=1` only when deliberately diagnosing a partial run.

Run the configuration doctor before a demo. It does not make network calls unless asked:

```bash
npm run doctor
npm run doctor -- --recording "GHSA-xxxx-yyyy-zzzz https://github.com/org/repo-a https://github.com/org/repo-b https://github.com/org/repo-c"
npm run doctor -- --network
# One command for the final three-way + HydraDB recording gate
RECOIL_SMOKE_QUERY="<verified advisory> https://github.com/org/repo-a https://github.com/org/repo-b https://github.com/org/repo-c" npm run smoke:recording
```

`--recording` requires a GHSA/CVE advisory, three public repositories, and HydraDB write/read credentials.
The `/api/health` recording contract also exposes that at least one memory and one dated
temporal fact must be present. `--network` performs bounded reachability checks against OSV, GitHub, and
HydraDB; failures are diagnostics, not evidence, and do not create a case.

The strict recording gate also requires HydraDB to report at least one stored memory, one dated fact from
temporal recall, and one relation from the current-case graph read; an HTTP-successful but empty or unrelated
query cannot be recorded as memory or graph proof.

To enable the optional advisory-scope pass, provide `OPENAI_API_KEY` and set `RECOIL_ADVISORY_AGENT=on`. It extracts candidate affected symbols from advisory prose using structured output, then the server attaches only exact matches found in the indexed source graph. Leave it off for a fully deterministic run; the package-import verdict does not depend on the model.

## Browser and terminal clients

### The judge console

The fastest way to understand Recoil is to paste a public repository into the landing page. The case then
becomes a persistent evidence workspace:

1. **Answer:** one sentence says how many advisory checks reach sampled source code.
2. **Triage:** a computed remediation board separates fix-ready, present-only, safe, and uncertain findings.
3. **Proof:** Graph shows the exact advisory → package → lockfile → repository → source relationship. A clean
   repository scan still retains its bounded lockfile/import inventory instead of drawing an empty placeholder.
4. **History:** Changes compares dated evidence with prior HydraDB cases without allowing memory to overwrite
   the current source-backed verdict.
5. **Handoff:** Ask returns one sentence plus cited rows; Connect exposes the equivalent CLI command, Markdown
   brief, and integrity-addressed JSON receipt.

The console keeps each surface focused and persists completed cases under `.recoil-data/` so a restart does
not erase the incident library. Runtime state is ignored by git, and the test harness disables workspace
persistence so mocked evidence cannot enter the real case index. See
[docs/JUDGE-DEMO.md](docs/JUDGE-DEMO.md) for the 90-second walkthrough and the exact narration.

With the API running, the browser accepts either a repository-first scan:

```text
https://github.com/owner/repository
```

or a focused advisory comparison:

```text
GHSA-xxxx-yyyy-zzzz
https://github.com/owner/repository-a
https://github.com/owner/repository-b
```

Repository-first input inventories recorded package versions and discovers affected advisories through a
bounded OSV batch. If no affected advisory matches, Recoil presents that as a complete negative result;
if one does match, only those advisory/package/repository paths are classified. A package selector remains
useful for exploratory collection. Strict recording still requires a GHSA/CVE advisory so exposure dates,
fixed-version proofs, and the three-way contrast are dated and auditable.

Pin a repository to a public historical snapshot with a GitHub `/tree/<tag-or-commit>` or `/commit/<sha>` URL when a reproducible before/after comparison is useful. Recoil records that ref in source URLs and uses it for manifest, lockfile, source, tree, and commit-history reads.

The CLI uses the same API and state machine:

```bash
npm run cli -- "GHSA-xxxx-yyyy-zzzz https://github.com/owner/repository"
npm run cli -- "CVE-2021-4229 https://github.com/owner/repository-a https://github.com/owner/repository-b" --fast
npm run cli -- "GHSA-xxxx-yyyy-zzzz https://github.com/owner/repository" --json
# Expand every advisory → lockfile → import/date proof hop in terminal output
npm run cli -- "GHSA-xxxx-yyyy-zzzz https://github.com/owner/repository" --proof
# Let a judge hand over any public repository; no advisory or package selector is needed
npm run cli -- --direct --fast "https://github.com/owner/repository"
# Canonical positive-path reference case used for the proof/receipt demo
npm run cli -- --direct --fast --proof "GHSA-xvch-5gv4-984h https://github.com/http-party/http-server/tree/v13.0.2"
# Enforce the three-way contrast plus completed HydraDB write/read proof
npm run cli -- "GHSA-xxxx-yyyy-zzzz https://github.com/owner/repository-a https://github.com/owner/repository-b https://github.com/owner/repository-c" --recording
```

For terminal agents or environments where the API port is unavailable, add `--direct`. It runs the same
autonomous investigation state machine in-process, uses the same HydraDB and OpenAI configuration, and
writes a portable receipt to `.recoil-recordings/<case-id>.json`. The default CLI remains API-backed so it
can share a live case with the browser.

Use `--case 0017` (or `RECOIL_CLI_CASE_ID=0017`) when the CLI should address the browser’s stable API case
for a repeatable cross-client demo. Without it, the CLI creates an isolated case ID.

The CLI exits nonzero when collection is partial or a repository is `UNKNOWN`, including with `--json`, even though it still prints
the partial report and receipt URL. This makes it safe to use in CI and prevents an incomplete public case
from being recorded as a successful demo.

Every completed report also exposes one `evidenceQuality` object in the browser, CLI JSON, and downloaded
receipt. It says whether the case is `complete`, needs `review`, or is `partial`, names unclassified
repositories and failed collectors, and surfaces mixed lockfile-version ambiguity instead of hiding it.
`readyForRecording` is the single recording gate used by the CLI and report surfaces.

The browser also offers a human-readable Markdown case brief beside the machine-verifiable JSON receipt.
The brief is generated from the same report fields, includes the repository comparison, per-hop citations,
temporal evidence, fix checks, HydraDB summary, limits, and execution boundary, and does not introduce a
second verdict or copy raw HydraDB chunks.

Each repository finding also carries a compact provenance chain. It maps the readable path to the exact
public source for each hop-advisory, lockfile resolution, repository history, sampled import or validated
symbol, and first observation date. The observed import line is included inline so a reviewer can verify
the reachability claim without leaving the report. A missing or unobserved hop is shown as such; it is
never replaced by a generic source list or a confident inference. The same chain is included in the
downloadable receipt.
When a real lockfile exposes a transitive chain, the default CLI summary prints it; `--proof` expands
the individual dependency hop and its source URL.

### Coding-agent MCP

Recoil also ships an official-SDK stdio MCP server. It exposes eight tools over the same investigation
state used by the browser and CLI: one explicit write tool starts a public repository scan, while seven
read tools return retained cases, source-backed paths, CODEOWNERS and introducing commits, verified fix
plans, HydraDB graph history, observed graph evidence, and portable handoffs.

```bash
npm run mcp
npm run smoke:mcp
```

Unlike a generic graph-query wrapper, the MCP tools preserve Recoil's evidence boundary and return the
exact cited rows behind each conclusion. See [docs/MCP.md](docs/MCP.md) for client configuration and the
tool contract.

For a repeatable external smoke against the configured `.env` (defaulting to the real bytes advisory and HydraDB repository), run `npm run smoke:real`. Set `RECOIL_SMOKE_QUERY` to use a different advisory/repository set. The command exits nonzero when collection is partial, a finding is `UNKNOWN`, or HydraDB fails, so an incomplete demo cannot look green.
When the smoke gate passes, it writes the sanitized receipt to `.recoil-recordings/<scenario-id>.json`
(ignored by git). Set `RECOIL_SMOKE_RECEIPT` to choose another output path; no raw HydraDB chunks,
credentials, or GitHub cache data are written to the artifact.

Set `RECOIL_SMOKE_REQUIRE_CONTRAST=1` for the recording gate. In that mode the case must contain one
`REACHED`, one `DECLARED_ONLY`, and one `NOT_AFFECTED` repository, and HydraDB must finish indexing, return a
dated temporal recall, and return at least one graph relation scoped to the active case, in addition to the
normal completeness checks.
Use `RECOIL_SMOKE_REQUIRE_HYDRA=1` when you want to require the HydraDB write/read/graph proof without
requiring the three-way contrast. Strict modes fail before collection when the query has no GHSA/CVE
advisory, fewer than three GitHub repositories, or the required HydraDB credentials are missing,
avoiding a misleading partial run and unnecessary public/API requests.
`npm run smoke:recording` enables both strict requirements directly, so it is the preferred final command. When
the doctor reports `ENOTFOUND` for OSV, GitHub, or HydraDB, the recording gate must be retried after connectivity
returns; cached or partial evidence is never promoted to a recording receipt. Strict recording also performs a
bounded connectivity preflight before collection, so a disconnected run exits without spending collector or
HydraDB requests. There is no bypass for this preflight in strict mode; use the non-strict `smoke:real` command
for local diagnostics or replay work. The CLI's `--recording` mode performs the same connectivity preflight
before starting the API-backed investigation.

The OpenTUI console remains available for local operator use:

```bash
npm run tui
# Run without an API server; this uses the same in-process investigation state machine as CLI --direct
npm run tui -- --direct "GHSA-xxxx-yyyy-zzzz https://github.com/owner/repository"
# Apply the final three-way + HydraDB recording gate in the terminal view
npm run tui -- --recording "GHSA-xxxx-yyyy-zzzz https://github.com/owner/repository-a https://github.com/owner/repository-b https://github.com/owner/repository-c"
```

The primary browser and CLI flows are autonomous: one investigation request starts collection, classification, temporal proof, HydraDB persistence/recall, and the final report. There are no run-loop or step buttons in this path. In strict CLI recording mode, the client also waits for an explicitly pending HydraDB batch to reconcile before evaluating the recording gate; ordinary reports remain available while a non-strict write is queued.
Strict TUI recording mode performs the same connectivity check before starting its investigation.

## API flow

```text
POST /api/scenarios/:id/investigate  start one autonomous investigation
GET  /api/scenarios/:id              poll progress and retrieve the report
GET  /api/scenarios/:id/investigation retrieve investigation state directly
POST /api/scenarios/:id/rewind       rebuild the report at a supplied timestamp
GET  /api/scenarios/:id/receipt      download a hashed, source-cited evidence receipt
GET  /api/scenarios/:id/brief        download a human-readable Markdown case brief
GET  /api/scenarios/:id/code-graph   inspect the bounded source graph
GET  /api/health                     inspect service and HydraDB capability status
```

The retired arena/fixture prototype is not shipped. The product path contains only public-evidence collection, source reachability, temporal rewind, fix proof, HydraDB evidence memory, and receipt export. Historical design notes remain in `docs/` so the project history is auditable.

## Verification

```bash
npm test
npm run benchmark
npm run build
# or run all three gates in order
npm run verify
```

The tests cover semver and OSV range evaluation, JavaScript/Rust source graphs, nested lockfile dependency
paths, incomplete-source safety, temporal rewind, HydraDB memory construction, and an end-to-end mocked
multi-repository ingestion. The benchmark generates four deterministic evidence cases and asserts:

- one `REACHED` repository;
- one `DECLARED_ONLY` repository;
- one `NOT_AFFECTED` repository;
- one incomplete `UNKNOWN` repository;
- a computed fixed-version proof;
- a temporal rewind;
- no fictional deployment nodes;
- no package code execution.

Synthetic inputs in the benchmark are clearly test data. Outputs are computed by the same classifier and report builder used by the application. The regression suite additionally covers Rust external-crate import evidence, Cargo registry fixed-version resolution, and validated advisory-symbol path attachment.

The completed browser and CLI case can also be exported as a portable JSON evidence receipt. The receipt contains the advisory, repository verdicts, cited imports, temporal rewind, fix proof, observed graph, HydraDB write/recall summary, limitations, and a SHA-256 integrity value. Raw HydraDB chunks and credentials are intentionally excluded.
For transitive dependencies, the receipt also retains the lockfile-resolved package chain and cites each
package-to-package hop, so a reviewer can distinguish a direct import from a dependency-mediated path.

The receipt can be verified offline after download; verification does not contact the API or trust the
current database state:

```bash
npm run cli -- --verify-receipt .recoil-recordings/<scenario-id>.json
```

The command recomputes the SHA-256 over the canonical receipt content and exits nonzero if any field has
been changed. This is useful in a review or CI job where the evidence artifact must stand on its own.

## Evidence boundary

Repository files, lockfiles, advisory records, registry metadata, source imports, and commit dates are observed public evidence. Source-level reachability is bounded by the sampled files that GitHub makes available. It is not proof of runtime execution. Recoil preserves source failures-and treats an empty source sample as `UNKNOWN`-rather than converting missing evidence into a confident negative result.

See [PLAN.md](PLAN.md), [the demo runbook](docs/DEMO.md), and [the evidence proof contract](docs/ATTACK-DEFENSE.md) for the implementation and presentation plan.
