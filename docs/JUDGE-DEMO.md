# Recoil three-minute judge demo

## One sentence

> Recoil watches public repositories, discovers vulnerable dependency versions, proves whether they reach source code, dates when the path appeared, and verifies whether a real fixed version cuts it.

The demo must show computed evidence, not a prepared animation. Every source link opens GitHub, OSV, npm, or crates.io. The graph is built from those records and the same case is available through the browser, CLI, MCP, Markdown brief, and integrity-addressed receipt.

## Architecture in ten seconds

```text
GitHub + OSV + npm/crates.io
        |
manifest, lockfile, source import, commit, CODEOWNERS collectors
        |
deterministic reachability classifier + advisory range fix check
        |
HydraDB typed evidence graph + dated cross-scan memory
        |
web console + CLI + MCP + Markdown brief + signed-by-hash receipt
```

The optional model pass has one narrow job: suggest an advisory symbol. Recoil accepts it only when that symbol exists in the indexed source. The model cannot create a graph edge or change a verdict.

## Recording state

Use one real historical case and one live clean repository:

- Controlled incident: `GHSA-xvch-5gv4-984h` against `http-party/http-server@v13.0.2`.
- Live judge handoff: `https://github.com/hydra-db/hydradb`.

The historical tag is not mock data. It is an immutable public snapshot whose lockfile resolves `minimist@1.2.5`. OSV fixes the affected range at `1.2.6`. Current HTTP Server resolves `1.2.6` and is classified `NOT_AFFECTED` when checked against the same advisory.

Before recording, seed the controlled case on the deployed service and wait for HydraDB to finish or visibly accept the evidence:

```bash
export RECOIL_DEMO_URL="https://YOUR_DEPLOYED_DOMAIN"
export RECOIL_DEMO_CASE="recoil-minimist-demo"

curl -fsS -X POST "$RECOIL_DEMO_URL/api/scenarios" \
  -H 'content-type: application/json' \
  --data "{\"id\":\"$RECOIL_DEMO_CASE\"}" >/dev/null

curl -fsS -X POST "$RECOIL_DEMO_URL/api/scenarios/$RECOIL_DEMO_CASE/investigate" \
  -H 'content-type: application/json' \
  --data '{"query":"GHSA-xvch-5gv4-984h https://github.com/http-party/http-server/tree/v13.0.2"}' >/dev/null

curl -fsS "$RECOIL_DEMO_URL/api/scenarios/$RECOIL_DEMO_CASE" \
  | jq '{status: .investigation.status, verdict: .investigation.report.repositories[0].verdict, hydra: .investigation.hydra.status}'
```

Expected terminal state:

```json
{"status":"complete","verdict":"REACHED","hydra":"persisted"}
```

`hydra: "queued"` is acceptable only when the UI also says indexing is pending. Never call a queued write persisted.

## Exact three-minute script

### 0:00 to 0:18: Open with the result

Screen: **Incidents**, with the controlled minimist incident selected.

Say:

> Hey, we built Recoil. Dependency scanners tell you a vulnerable package exists. Recoil proves whether that package reaches your source code, when the path entered the repository, and whether the proposed fix actually removes it. Everything you will see is computed from public records.

Point to `Action required`, `minimist@1.2.5`, and the source-backed route count.

### 0:18 to 0:35: Explain the system

Screen: remain on the incident route.

Say:

> Recoil reads OSV, the package registry, the repository manifest and lockfile, sampled imports, commit history, and CODEOWNERS. The verdict and fix check are deterministic. HydraDB stores the typed evidence graph and dated facts, so every later scan can ask what changed instead of starting from zero.

Do not explain every panel. Move immediately to a live repository.

### 0:35 to 1:05: Hand it a real Rust repository

Click **Repositories**. Paste:

```text
https://github.com/hydra-db/hydradb
```

Click **Add watch**.

Say:

> I will add HydraDB's own public Rust workspace. There is no prepared advisory here. Recoil reads its Cargo workspace members, complete Cargo lock inventory, Rust imports, and checks every resolved crate version against OSV.

During the live view, point once to `No install · no execution` and the evidence graph arriving. Do not narrate every event. When the report appears, say:

> It checked 371 recorded crates and sampled 48 Rust source files. No affected advisory matched, so Recoil refuses to draw a fake exposure path. The repository is now on durable watch, and HydraDB evidence can finish indexing in the background.

If the public network takes longer than the video allows, use one visible time cut. Do not replace the result or replay a scripted animation.

### 1:05 to 1:48: Show the real incident proof

Click **Incidents**, then select `GHSA-xvch-5gv4-984h`.

Say:

> Now compare that clean scan with a real historical incident. This is HTTP Server version 13.0.2, an immutable GitHub tag. Its lockfile contains vulnerable `minimist@1.2.5`.

Point to the route and say:

> Recoil does not stop at package presence. It proves that `bin/http-server`, line 11 imports minimist. The lockfile path first appears in commit `b1b266c82b81`, 1,317 days before the advisory was published.

Click **Inspect full evidence**. Open the source citation if the recording remains readable.

Point to **Verified fix** and say:

> OSV fixes this at 1.2.6. Recoil checks the repository's declared range and reruns the affected-path predicate. Here the version challenge passes, so it produces a package-manager command and a cited handoff. It never edits the repository.

### 1:48 to 2:15: Show the graph and memory

Close the proof drawer. Click **Graph**. Keep the top context picker on the minimist incident.

Say:

> This graph is not decorative. Every edge is an observed advisory, package, lockfile, repository, or source relationship. Selecting a node opens the public evidence behind it.

Click **History**.

Say:

> Every scan is an immutable snapshot. HydraDB stores typed relations plus dated facts, and Recoil reads them back for verification. That gives us exposure history, change detection, and temporal rewind rather than another one-shot scanner.

Point to the HydraDB status strip, snapshot count, and evidence timeline.

### 2:15 to 2:38: Query the evidence

Click **Ask**. Choose **Who owns the reached source?** or **Which upgrade closes the paths?**

Say:

> Ask is not an open-ended chatbot. It translates the question into a bounded workspace query and returns only stored findings with citations. It can answer across incidents, repositories, fixes, owners, and changes without inventing evidence.

Open one returned evidence link.

### 2:38 to 3:00: Prove it is a platform

Click **Connect**.

Say:

> The browser is only one client. Recoil exposes the same classifier, graph, HydraDB history, and fix proof through a human CLI, structured JSON, and eight MCP tools for coding agents. It also exports a Markdown handoff and a SHA-256 addressed receipt.

Switch briefly to a terminal and run:

```bash
npm run cli -- --verify-receipt .recoil-recordings/recoil-minimist-demo.json
```

End with:

> So Recoil does not just report that a dependency is vulnerable. It proves the route, remembers when it changed, verifies the fix, and hands the same evidence to a human or an agent.

## Receipt preparation

Download the deployed receipt before recording the final terminal shot:

```bash
mkdir -p .recoil-recordings
curl -fsS "$RECOIL_DEMO_URL/api/scenarios/$RECOIL_DEMO_CASE/receipt" \
  -o .recoil-recordings/recoil-minimist-demo.json
npm run cli -- --verify-receipt .recoil-recordings/recoil-minimist-demo.json
```

Expected output includes `hash valid`.

## Recording rules

- Use App Runner plus CloudFront, not a static Vercel deployment. Recoil needs a long-running process for background scans and watch scheduling.
- Keep the single-tenant S3 workspace enabled so the seeded incident survives restarts.
- Record in dark mode at 1440 by 900 or larger.
- Hide bookmarks, personal tabs, API keys, and the local development URL.
- Keep browser zoom at 90 or 100 percent.
- Use one clean cut during the live network wait if needed.
- Never call static source reachability runtime exploitation.
- Never hide `UNKNOWN`, partial evidence, or queued HydraDB indexing.
- Do not spend time on the old attack and defense prototype. The winning loop is proof, fix, memory, and agent handoff.

## Final preflight

```bash
npm run verify
npm run doctor -- --recording --network \
  "GHSA-xvch-5gv4-984h https://github.com/http-party/http-server/tree/v13.0.2 https://github.com/tweenjs/tween.js https://github.com/axios/axios/tree/v1.x"
```

Then verify:

1. The controlled case says `REACHED`.
2. The source citation opens `bin/http-server` on GitHub.
3. The fixed version is `1.2.6`.
4. HydraDB shows persisted, or queued with indexing explicitly pending.
5. The HydraDB live scan reports 371 checked crates on the current repository snapshot.
6. History contains both the controlled case and the live repository scan.
7. Ask returns cited rows.
8. Connect shows CLI, JSON, MCP, brief, and receipt surfaces.
9. The downloaded receipt verifies locally.
