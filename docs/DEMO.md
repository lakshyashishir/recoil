# Recoil demo runbook

## One-sentence framing

> A vulnerable dependency is not the same as vulnerable application code. Recoil traces the evidence path, rewinds when it became true, and proves whether the proposed fix closes it.

## Start

```bash
npm install
cp .env.example .env
# fill HYDRA_DB_API_KEY and HYDRADB_DATABASE_ID for the hosted memory proof
npm run doctor -- --recording "<verified advisory> https://github.com/<owner>/<repository-a> https://github.com/<owner>/<repository-b> https://github.com/<owner>/<repository-c>"
npm run start
```

Open `http://127.0.0.1:5173`. The API and browser are started together.

## Input

Use a verified advisory and real public repositories. Do not use placeholder repository URLs in the recording.

The prepared candidate case is documented in [RECORDING-CASE.md](RECORDING-CASE.md). It is intentionally
only a live-run input: do not replace the strict gate with its candidate roles or with cached output.

```text
<verified GHSA/CVE identifier>
https://github.com/<owner>/<repository-a>
https://github.com/<owner>/<repository-b>
https://github.com/<owner>/<repository-c>
```

For a historical comparison, pin a repository URL to a public tag or commit, for example `https://github.com/<owner>/<repository>/tree/<tag-or-sha>`. Recoil records that ref in every source URL and uses it for manifest, lockfile, source, tree, and commit-history reads.

The strongest case contains three different outcomes: one repository that imports the affected package, one that only declares it, and one already outside the affected range. Validate the advisory and repository lockfiles before recording; Recoil must not be presented with invented evidence.

Use the exact same query with the strict smoke gate before recording:

```bash
RECOIL_SMOKE_QUERY="<verified advisory> https://github.com/<owner>/<repository-a> https://github.com/<owner>/<repository-b> https://github.com/<owner>/<repository-c>" \
npm run smoke:recording
```

`smoke:recording` is the single strict recording command. It refuses to pass unless all three verdicts are
present and HydraDB persistence succeeds. It also checks OSV, GitHub, and HydraDB reachability before collection,
so a disconnected run fails without spending collector or memory requests.
Recoil waits for HydraDB's async indexing status before it performs the recall; if the status endpoint cannot
be reached, the run stays queued and the smoke gate fails rather than presenting an unverified memory read.
Recording mode requires a GHSA/CVE advisory, completed indexing, a successful temporal recall with dated facts, and at least one
returned graph triplet. Strict mode also checks for three repository URLs and HydraDB credentials before
starting collection, so it does not spend API calls on an invalid recording setup. If the network doctor
reports `ENOTFOUND`, stop and retry later; do not use a cached or partial run as the final recording.

When that strict smoke passes, it also saves the sanitized portable receipt under
`.recoil-recordings/<scenario-id>.json`. Keep that artifact for the recording; the directory is ignored by
git and does not contain raw HydraDB chunks or credentials.

### Verified reference recording

The current reference case has been run against live OSV, npm, GitHub, and HydraDB services:

```text
GHSA-xvch-5gv4-984h
  http-party/http-server@v13.0.2  → REACHED
  tweenjs/tween.js                → DECLARED_ONLY
  axios/axios@v1.x                → NOT_AFFECTED

HydraDB: persisted · 8 memories · 17 dated facts · 12 graph triplets
Sources: 84 public URLs
Boundary: no install · no repository execution · no exploit payload
Receipt: .recoil-recordings/real-1787176142283.json
```

This is a real source-backed contrast, not a fixture: the first repository has a sampled import,
the second has the affected resolution without a sampled import, and the third resolves outside the
advisory range. Keep the receipt locally for the presentation; do not commit it.

## What the judge sees

After one click, the investigation runs automatically:

```text
Reading public records
Reading each repository manifest and lockfile
Sampling source imports without installing anything
Proving REACHED / DECLARED_ONLY / NOT_AFFECTED / UNKNOWN
Rewinding lockfile history
Checking the real fixed version against each declared range
Writing and recalling dated HydraDB evidence
```

The final report opens with a plain-language decision derived from the findings—for the prepared case,
“Upgrade minimist to 1.2.6 in http-party/http-server.” It then presents one Graph view: the observed graph
and the repository comparison beside it. Select a repository or node to inspect the cited relationship;
the selected route exposes the exact source-backed hops and fix status. The remaining views have one job
each: Fix shows the version proof, History shows chronology plus temporal rewind and HydraDB recall, and
Audit shows the recording boundary. This keeps the report useful without repeating the same repository
list in multiple rails.

The report still shows the observed import line, repository verdict, exposure window, fixed-version result,
residual-path status, source links, and limits. Raw HydraDB chunks remain hidden; the interface exposes only
the bounded temporal and graph summary. On a Cargo case, the same path begins with a real Rust crate import;
when the optional scope pass finds a matching symbol in that importing file, the symbol is shown as an
additional cited hop.

## Spoken demo script

1. “Most tools stop at ‘this dependency is vulnerable’. Recoil asks whether the vulnerable code is actually reached.”
2. Submit the advisory and three repositories.
3. “Recoil has already turned that into a decision: upgrade `minimist` to `1.2.6` in the repository with a real source import.” Point to the decision line and open **Inspect fix proof**.
4. “The graph is read left to right: advisory, resolved package, repository, then sampled source.” Select the `REACHED` repository and open the source link.
5. “This second repository declares the package but does not import it, so it is `DECLARED_ONLY`, not a fabricated compromise.” Select it in the repository comparison.
6. If present, “The latest public commit touched the importing file; Recoil links the commit and owners without turning that into a runtime claim.”
7. Open **History**: “This is the temporal question: the lockfile path existed before the advisory was public.” Click **Before advisory**.
8. “The fix check compares the advisory’s fixed version with the declared semver range instead of assuming an upgrade is safe.”
9. “HydraDB stores the dated evidence and retrieves related facts; it is the investigation memory, not a green connection badge.”
10. Download the case brief for a human handoff, then download the evidence receipt and show that the result is a portable, source-cited artifact with an integrity hash.

## Terminal proof

```bash
npm run cli -- "<verified advisory> https://github.com/<owner>/<repository>"
npm run cli -- "<verified advisory> https://github.com/<owner>/<repository>" --json
npm run cli -- "<verified advisory> https://github.com/<owner>/<repository-a> https://github.com/<owner>/<repository-b> https://github.com/<owner>/<repository-c>" --recording --proof
```

The CLI and browser consume the same autonomous API state machine. `--json` is useful for showing that the report is structured evidence rather than terminal animation.

For a cross-client demonstration against the browser's stable case, use `--case 0017`; use `--direct` only
when an API server is unavailable. Direct mode preserves the same evidence and HydraDB boundaries.

The TUI has the same transport choices:

```bash
npm run tui -- "<verified advisory> https://github.com/<owner>/<repository>"
npm run tui -- --direct "<verified advisory> https://github.com/<owner>/<repository>"
npm run tui -- --recording "<verified advisory> https://github.com/<owner>/<repository-a> https://github.com/<owner>/<repository-b> https://github.com/<owner>/<repository-c>"
```

The first shares API state with the browser; the second runs the same in-process state machine as the CLI's
`--direct` mode and is useful for terminal-agent demonstrations without a local API process. `--recording`
shows the same strict three-way and HydraDB blockers used by the final CLI gate.

The CLI exits nonzero when public collection is partial or any repository is `UNKNOWN`; keep the printed
receipt for diagnosis, but do not record that run as the final demo.

Look for `evidence complete · recording-ready` in the terminal and the matching Evidence Status line in
the browser report. If the case is partial or requires review, the same quality object lists the failed
collector, unknown repository, or mixed resolved versions that must be fixed before recording.

For the strict terminal command, also require `recording ready · three-way contrast and HydraDB temporal
proof verified`. If it prints `recording not-ready`, do not use that run in the demo.

The CLI prints a receipt URL after completion. The browser exposes the same receipt as a download from the case result.

After downloading the receipt, demonstrate that it is independently verifiable:

```bash
npm run cli -- --verify-receipt ./case-receipt.json
```

This is an offline check. It recomputes the receipt's SHA-256 and exits nonzero if the JSON was altered.

## Safety statement

Recoil observes public records and performs static graph/reachability analysis. It does not install dependencies, execute package code, send exploit payloads, or probe a live repository or service. Benchmark cases are deterministic evidence inputs; their outputs are computed by the same evidence engine used by the product. There is no executable target fixture in the shipped application.
