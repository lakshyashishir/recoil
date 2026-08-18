# Recoil demo runbook

## One-sentence framing

> A vulnerable dependency is not the same as vulnerable application code. Recoil traces the evidence path, rewinds when it became true, and proves whether the proposed fix closes it.

## Start

```bash
npm install
cp .env.example .env
# fill HYDRA_DB_API_KEY and HYDRADB_DATABASE_ID for the hosted memory proof
npm run start
```

Open `http://127.0.0.1:5173`. The API and browser are started together.

## Input

Use a verified advisory and real public repositories. Do not use placeholder repository URLs in the recording.

```text
<verified GHSA/CVE identifier>
https://github.com/<owner>/<repository-a>
https://github.com/<owner>/<repository-b>
https://github.com/<owner>/<repository-c>
```

For a historical comparison, pin a repository URL to a public tag or commit, for example `https://github.com/<owner>/<repository>/tree/<tag-or-sha>`. Recoil records that ref in every source URL and uses it for manifest, lockfile, source, tree, and commit-history reads.

The strongest case contains three different outcomes: one repository that imports the affected package, one that only declares it, and one already outside the affected range. Validate the advisory and repository lockfiles before recording; Recoil must not be presented with invented evidence.

Use `RECOIL_SMOKE_REQUIRE_CONTRAST=1` with the same query before recording. The smoke command then refuses
to pass unless all three verdicts are present and HydraDB persistence succeeds. Recoil waits for HydraDB's
async indexing status before it performs the recall; if the status endpoint cannot be reached, the run stays
queued and the smoke gate fails rather than presenting an unverified memory read. Recording mode requires
completed indexing and a successful temporal recall. Strict mode also checks for
three repository URLs and HydraDB credentials before starting collection, so it does not spend API calls on
an invalid recording setup.

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

The final report shows the exact source-backed path, repository verdict, exposure window, fixed-version result, residual-path status, source links, and limits. On a Cargo case, the same path begins with a real Rust crate import; when the optional scope pass finds a matching symbol in that importing file, the symbol is shown as an additional cited hop.

## Spoken demo script

1. “Most tools stop at ‘this dependency is vulnerable’. Recoil asks whether the vulnerable code is actually reached.”
2. Submit the advisory and three repositories.
3. “Red has found a path only when the lockfile, resolved version, and source import support every hop.” Open the `REACHED` repository and show the links.
4. “This second repository declares the package but does not import it, so it is `DECLARED_ONLY`, not a fabricated compromise.”
5. If present, “The latest public commit touched the importing file; Recoil links the commit and owners without turning that into a runtime claim.”
6. “This is the temporal question: the lockfile path existed before the advisory was public.” Click **Before advisory**.
7. “Blue proposes the fixed version. Recoil checks the declared semver range instead of assuming an upgrade is safe.”
8. “Red verifies the residual graph. The fix is either proven, requires a manifest change, or remains unknown.”
9. “HydraDB stores the dated evidence and retrieves related facts; it is the investigation memory, not a green connection badge.”
10. Download the evidence receipt and show that the result is a portable, source-cited artifact with an integrity hash.

## Terminal proof

```bash
npm run cli -- "<verified advisory> https://github.com/<owner>/<repository>"
npm run cli -- "<verified advisory> https://github.com/<owner>/<repository>" --json
```

The CLI and browser consume the same autonomous API state machine. `--json` is useful for showing that the report is structured evidence rather than terminal animation.

The CLI exits nonzero when public collection is partial or any repository is `UNKNOWN`; keep the printed
receipt for diagnosis, but do not record that run as the final demo.

Look for `evidence complete · recording-ready` in the terminal and the matching Evidence Status line in
the browser report. If the case is partial or requires review, the same quality object lists the failed
collector, unknown repository, or mixed resolved versions that must be fixed before recording.

The CLI prints a receipt URL after completion. The browser exposes the same receipt as a download from the case result.

## Safety statement

Recoil observes public records and performs static graph/reachability analysis. It does not install dependencies, execute package code, send exploit payloads, or probe a live repository or service. Benchmark cases are deterministic evidence inputs; their outputs are computed by the same evidence engine used by the product. There is no executable target fixture in the shipped application.
