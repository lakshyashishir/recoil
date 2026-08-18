# Recoil

**Prove the path. Prove the fix.**

Recoil is an evidence-backed software-supply-chain investigation tool. Give it an OSV/GHSA/CVE advisory and one to four public GitHub repositories. It reads public advisory, registry, lockfile, repository, source-import, and commit-history evidence, then answers:

1. Does the affected version actually reach sampled application code?
2. When did that path first appear in the repository history?
3. Does a real fixed version remove the path, or does the repository need a manifest change?

Recoil is deliberately not a vulnerability dashboard and not a live exploit runner. Every conclusion is tied to collected public evidence, and incomplete collection is reported as `UNKNOWN` rather than guessed.

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

The report exposes the write and recall result. Temporal rewind is computed from the collected lockfile history and uses HydraDB’s dated evidence as the durable investigation record. Without HydraDB credentials, the same local evidence proof remains available and is labelled local replay.

## Run locally

```bash
npm install
cp .env.example .env
# fill HYDRA_DB_API_KEY and HYDRADB_DATABASE_ID when persistence is wanted
npm run start
```

The browser runs at `http://127.0.0.1:5173`; the API runs at `http://127.0.0.1:8787`. Set `RECOIL_HOST=0.0.0.0` and point `RECOIL_API_URL` at the reachable API address when serving the app from a container or hosted environment. Verify that the API reports `product: evidence-proof` before recording.

For separate processes:

```bash
npm run server
npm run dev
```

Useful environment variables are documented in [.env.example](.env.example): `HYDRA_DB_API_KEY`, `HYDRADB_DATABASE_ID`, `HYDRADB_COLLECTION_ID`, `GITHUB_TOKEN`, `RECOIL_CACHE_DIR`, `RECOIL_NETWORK_RETRIES`, and `RECOIL_SOURCE_FILE_LIMIT`. A GitHub token is optional but prevents unauthenticated API limits. The collector caches GitHub JSON reads locally for the configured TTL and retries transient network failures a bounded number of times; cached evidence is never treated as a substitute for a failed source. Raise `RECOIL_SOURCE_FILE_LIMIT` for a large, trusted demo repository only when you are comfortable with the extra public reads; the chosen bound is preserved in each finding.

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
```

For a repeatable external smoke against the configured `.env` (defaulting to the real bytes advisory and HydraDB repository), run `npm run smoke:real`. Set `RECOIL_SMOKE_QUERY` to use a different advisory/repository set. The command exits nonzero when collection is partial, a finding is `UNKNOWN`, or HydraDB fails, so an incomplete demo cannot look green.

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

Synthetic inputs in the benchmark are clearly test data. Outputs are computed by the same classifier and report builder used by the application.

The completed browser and CLI case can also be exported as a portable JSON evidence receipt. The receipt contains the advisory, repository verdicts, cited imports, temporal rewind, fix proof, observed graph, HydraDB write/recall summary, limitations, and a SHA-256 integrity value. Raw HydraDB chunks and credentials are intentionally excluded.

## Evidence boundary

Repository files, lockfiles, advisory records, registry metadata, source imports, and commit dates are observed public evidence. Source-level reachability is bounded by the sampled files that GitHub makes available. It is not proof of runtime execution. Recoil preserves source failures—and treats an empty source sample as `UNKNOWN`—rather than converting missing evidence into a confident negative result.

See [PLAN.md](PLAN.md), [the demo runbook](docs/DEMO.md), and [the attack/defense contract](docs/ATTACK-DEFENSE.md) for the implementation and presentation plan.
