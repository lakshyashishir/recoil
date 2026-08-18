# Recoil

**Prove the path. Prove the fix.**

Recoil is an evidence-backed software-supply-chain investigation tool. Give it an OSV/GHSA/CVE advisory and one to four public GitHub repositories. It reads public advisory, registry, lockfile, repository, source-import, and commit-history evidence, then answers:

1. Does the affected version actually reach sampled application code?
2. When did that path first appear in the repository history?
3. Does a real fixed version remove the path, or does the repository need a manifest change?

Recoil is deliberately not a vulnerability dashboard and not a live exploit runner. Every conclusion is tied to collected public evidence, and incomplete collection is reported as `UNKNOWN` rather than guessed.

## Why this is different from a dependency dashboard

The winning demo is not “we drew a larger package graph.” It is a controlled contrast that ordinary
dependency scanners collapse into one alert:

- **Reachability, not declaration:** an affected lockfile entry is separated from an observed import in
  application source. The same proof works across npm/JavaScript and Cargo/Rust repositories.
- **A dated answer:** the lockfile’s public history and the advisory publication date produce a
  pre-disclosure rewind. The question becomes “was this path already present when the advisory was
  published?” rather than “is this package somewhere in the tree?”
- **A fix that has to survive:** Blue does not recommend an arbitrary upgrade. It checks the advisory’s
  actual fixed version against the repository’s declared range and reports when a manifest change is
  required.
- **A model with a narrow job:** when enabled, the OpenAI step extracts a likely affected symbol from
  advisory prose. Recoil validates that name against indexed source and appends the matched symbol to
  the evidence path; an invalid model answer cannot create a finding.
- **HydraDB as the evidence timeline:** HydraDB stores the advisory, observed paths, graph provenance,
  change impact, and fix proofs as dated memories. Recoil recalls prior related cases, while the local
  source-cited classifier remains the verdict authority.

This positions Recoil as a **cross-ecosystem reachability and remediation proof layer** for Track 2:
Track 2A’s supply-chain blast radius is the entry point, while Cargo/Rust source proof, changed-symbol
impact, temporal rewind, and fix verification give the project a credible Track 2B-quality depth. We do
not claim a runtime compromise; the strength is that every displayed hop can be opened and audited.

## The product loop

```text
advisory → affected package/version → real lockfile → source import
       → REACHED / DECLARED_ONLY / NOT_AFFECTED / UNKNOWN
       → temporal rewind → OSV fixed version → residual-path fix proof
```

The red/blue structure remains, but it is evidence-first:

- **Red — path prover:** constructs a cited route from the advisory to the resolved package and sampled source import.
- **Blue — fix planner:** chooses an OSV-supported fixed version and checks whether each declared range admits it.
- **Red — residual verifier:** checks whether the proposed change leaves an affected route or requires a manifest change.

This is a bounded defensive analysis. Recoil never installs dependencies, executes public repository code, sends exploit payloads, or probes a live target.

## Why HydraDB is central

HydraDB stores the investigation as dated evidence memories rather than as a final score:

- advisory publication and modification facts;
- repository reachability facts with `valid_from`, source URLs, and verdicts;
- fix proofs and residual-path results;
- observed graph topology and provenance;
- latest public commit impact on sampled importers, with CODEOWNERS attribution when available;
- cross-case retrieval of related package/repository evidence.

The observed graph is written through HydraDB's documented Bring-Your-Own-Graph (`graph_payload`) path:
explicit advisory, package, repository, lockfile, source, and symbol entities are attached to the
corresponding evidence memory with typed relations. Recoil never sends its internal graph helper field
as a memory property. Raw HTTP queries use HydraDB's documented v2 field names, including
`query_by`, `metadata_filters`, and `graph_context: true`; the report keeps only a bounded summary of
returned triplets so the receipt proves graph retrieval without copying raw chunks.

The report exposes the write and recall result. Recoil polls HydraDB's asynchronous indexing status for a
bounded window before recalling, so `persisted` means the submitted memories reached `completed`; a timeout
remains visibly `queued` with its indexing error. Temporal rewind is computed from the collected lockfile
history and uses HydraDB’s dated evidence as the durable investigation record. Without HydraDB credentials,
the same local evidence proof remains available and is labelled local replay.

The rewind report also carries a sanitized temporal-read receipt: the as-of timestamp, HydraDB status,
dated fact count, related prior-case IDs, and returned source URLs. Raw retrieved chunks are never copied
into the browser report or downloadable receipt, and HydraDB retrieval cannot change a local verdict.

## Run locally

```bash
npm install
cp .env.example .env
# fill HYDRA_DB_API_KEY and HYDRADB_DATABASE_ID when persistence is wanted
npm run start
```

The browser runs at `http://127.0.0.1:5173`; the API runs at `http://127.0.0.1:8787`. Set `RECOIL_HOST=0.0.0.0` and point `RECOIL_API_URL` at the reachable API address when serving the app from a container or hosted environment. Verify that the API reports `product: evidence-proof` before recording. `GET /api/health` also exposes the recording contract: the required three verdicts, HydraDB persistence and temporal-recall requirements, and whether partial HydraDB writes have been explicitly enabled.

For separate processes:

```bash
npm run server
npm run dev
```

Useful environment variables are documented in [.env.example](.env.example): `HYDRA_DB_API_KEY`, `HYDRADB_DATABASE_ID`, `HYDRADB_COLLECTION_ID`, `HYDRADB_INDEX_WAIT_MS`, `HYDRADB_INDEX_POLL_MS`, `GITHUB_TOKEN`, `RECOIL_CACHE_DIR`, `RECOIL_NETWORK_RETRIES`, and `RECOIL_SOURCE_FILE_LIMIT`. A GitHub token is optional but prevents unauthenticated API limits. The collector caches GitHub JSON reads locally for the configured TTL and retries transient network failures a bounded number of times; cached evidence is never treated as a substitute for a failed source. Raise `RECOIL_SOURCE_FILE_LIMIT` for a large, trusted demo repository only when you are comfortable with the extra public reads; the chosen bound is preserved in each finding.

HydraDB writes are skipped by default when evidence quality is incomplete. This avoids spending memory/indexing
calls on an unverified case and prevents partial findings from becoming durable precedent. Set
`RECOIL_HYDRA_PERSIST_PARTIAL=1` only when deliberately diagnosing a partial run.

Run the configuration doctor before a demo. It does not make network calls unless asked:

```bash
npm run doctor
npm run doctor -- --recording "GHSA-xxxx-yyyy-zzzz https://github.com/org/repo-a https://github.com/org/repo-b https://github.com/org/repo-c"
npm run doctor -- --network
```

`--recording` requires an advisory or package selector, three public repositories, and HydraDB write/read
credentials. The `/api/health` recording contract also exposes that at least one memory and one dated
temporal fact must be present. `--network` performs bounded reachability checks against OSV, GitHub, and
HydraDB; failures are diagnostics, not evidence, and do not create a case.

The strict recording gate also requires HydraDB to report at least one stored memory and one dated fact
from temporal recall; an HTTP-successful but empty query cannot be recorded as memory proof.

To enable the optional advisory-scope pass, provide `OPENAI_API_KEY` and set `RECOIL_ADVISORY_AGENT=on`. It extracts candidate affected symbols from advisory prose using structured output, then the server attaches only exact matches found in the indexed source graph. Leave it off for a fully deterministic run; the package-import verdict does not depend on the model.

## Browser and terminal clients

With the API running, the browser accepts an advisory plus repository URLs:

```text
GHSA-xxxx-yyyy-zzzz
https://github.com/owner/repository-a
https://github.com/owner/repository-b
```

Pin a repository to a public historical snapshot with a GitHub `/tree/<tag-or-commit>` or `/commit/<sha>` URL when a reproducible before/after comparison is useful. Recoil records that ref in source URLs and uses it for manifest, lockfile, source, tree, and commit-history reads.

The CLI uses the same API and state machine:

```bash
npm run cli -- "GHSA-xxxx-yyyy-zzzz https://github.com/owner/repository"
npm run cli -- "CVE-2021-4229 https://github.com/owner/repository-a https://github.com/owner/repository-b" --fast
npm run cli -- "GHSA-xxxx-yyyy-zzzz https://github.com/owner/repository" --json
# Expand every advisory → lockfile → import/date proof hop in terminal output
npm run cli -- "GHSA-xxxx-yyyy-zzzz https://github.com/owner/repository" --proof
# Enforce the three-way contrast plus completed HydraDB write/read proof
npm run cli -- "GHSA-xxxx-yyyy-zzzz https://github.com/owner/repository-a https://github.com/owner/repository-b https://github.com/owner/repository-c" --recording
```

The CLI exits nonzero when collection is partial or a repository is `UNKNOWN`, including with `--json`, even though it still prints
the partial report and receipt URL. This makes it safe to use in CI and prevents an incomplete public case
from being recorded as a successful demo.

Every completed report also exposes one `evidenceQuality` object in the browser, CLI JSON, and downloaded
receipt. It says whether the case is `complete`, needs `review`, or is `partial`, names unclassified
repositories and failed collectors, and surfaces mixed lockfile-version ambiguity instead of hiding it.
`readyForRecording` is the single recording gate used by the CLI and report surfaces.

Each repository finding also carries a compact provenance chain. It maps the readable path to the exact
public source for each hop—advisory, lockfile resolution, repository history, sampled import or validated
symbol, and first observation date. A missing or unobserved hop is shown as such; it is never replaced by
a generic source list or a confident inference. The same chain is included in the downloadable receipt.

For a repeatable external smoke against the configured `.env` (defaulting to the real bytes advisory and HydraDB repository), run `npm run smoke:real`. Set `RECOIL_SMOKE_QUERY` to use a different advisory/repository set. The command exits nonzero when collection is partial, a finding is `UNKNOWN`, or HydraDB fails, so an incomplete demo cannot look green.

Set `RECOIL_SMOKE_REQUIRE_CONTRAST=1` for the recording gate. In that mode the case must contain one
`REACHED`, one `DECLARED_ONLY`, and one `NOT_AFFECTED` repository, and HydraDB must finish indexing and return
a temporal recall, in addition to the normal completeness checks. Use `RECOIL_SMOKE_REQUIRE_HYDRA=1` when you
want to require the HydraDB write/read proof without requiring the three-way contrast. Strict modes fail before
collection when the query has fewer than three GitHub repositories or the required HydraDB credentials are
missing, avoiding a misleading partial run and unnecessary public/API requests.

The OpenTUI console remains available for local operator use:

```bash
npm run tui
```

The primary browser and CLI flows are autonomous: one investigation request starts collection, classification, temporal proof, HydraDB persistence/recall, and the final report. There are no run-loop or step buttons in this path.

## API flow

```text
POST /api/scenarios/:id/investigate  start one autonomous investigation
GET  /api/scenarios/:id              poll progress and retrieve the report
GET  /api/scenarios/:id/investigation retrieve investigation state directly
POST /api/scenarios/:id/rewind       rebuild the report at a supplied timestamp
GET  /api/scenarios/:id/receipt      download a hashed, source-cited evidence receipt
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

The tests cover semver and OSV range evaluation, JavaScript/Rust source graphs, incomplete-source safety, temporal rewind, HydraDB memory construction, and an end-to-end mocked multi-repository ingestion. The benchmark generates four deterministic evidence cases and asserts:

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

## Evidence boundary

Repository files, lockfiles, advisory records, registry metadata, source imports, and commit dates are observed public evidence. Source-level reachability is bounded by the sampled files that GitHub makes available. It is not proof of runtime execution. Recoil preserves source failures—and treats an empty source sample as `UNKNOWN`—rather than converting missing evidence into a confident negative result.

See [PLAN.md](PLAN.md), [the demo runbook](docs/DEMO.md), and [the attack/defense contract](docs/ATTACK-DEFENSE.md) for the implementation and presentation plan.
