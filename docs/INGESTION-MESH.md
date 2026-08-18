# Recoil ingestion mesh

Recoil should show multiple evidence collectors, but each collector must have a distinct job. The system should not launch five browser agents that all perform the same search.

## Collector roles

| Collector | Best tool | Job | Output |
|---|---|---|---|
| Registry resolver | npm/PyPI APIs | Versions, ranges, manifests, maintainers, timestamps | Typed package entities and dependency edges |
| Advisory resolver | OSV/GitHub Advisory APIs | Affected ranges, fixed versions, severity, references | Advisory entities and affected/fixed edges |
| Repository extractor | GitHub REST/raw files | Public manifests and lockfiles | Repository, lockfile, and resolution edges |
| Incident researcher | Firecrawl or direct HTTP | Crawl official incident pages and references | Source documents, claims, quotes, timestamps |
| Browser witness | Browser Use | Open the source in a real browser and capture visible evidence | Evidence event and optional screenshot |
| Discovery fallback | Apify or search API | Find candidate public repositories or incident pages when APIs are insufficient | Candidate URLs only |
| Graph curator | Recoil worker + HydraDB | Normalize, deduplicate, attach provenance, resolve conflicts | Canonical graph mutations |

## Tool policy

The deterministic APIs are the critical path. Browser Use, Firecrawl, and Apify are evidence and discovery workers—not dependencies for basic package resolution.

This keeps the demo reliable and protects API credits:

1. Try a direct registry or advisory API first.
2. Use GitHub raw/API access for repository files.
   If the unauthenticated Contents API is rate-limited, fall back to raw GitHub files and a bounded workflow filename probe; never silently replace a failed public repository with the synthetic fixture.
3. Use Firecrawl for a small allowlist of incident pages.
4. Use Browser Use only for visible proof and a live evidence moment.
5. Use Apify only when discovery or blocked pages justify it.

## Target resolution

The scenario input is part of the ingestion contract. Recoil extracts an npm package and optional version from inputs such as `npm:lodash@4.17.21`, or infers a package from a public GitHub repository URL. CVE/GHSA identifiers are preserved as advisory targets. When no package is present, the ua-parser-js seed remains the deterministic fallback. Public repositories contribute real manifest, lockfile, workflow, and container signals when available; deployment fan-out remains explicitly synthetic unless a repository exposes stronger runtime evidence.

## Shared event contract

Every collector emits the same event shape:

```json
{
  "scenarioId": "0017",
  "collector": "registry-resolver",
  "kind": "entity|edge|claim|source|warning",
  "status": "started|emitted|completed|failed",
  "entityType": "PackageVersion",
  "entityId": "npm:ua-parser-js@0.7.29",
  "sourceUrl": "https://registry.npmjs.org/ua-parser-js",
  "observedAt": "2021-10-22T12:15:00Z",
  "confidence": "confirmed",
  "payload": {}
}
```

## Browser-facing live feed

The browser report should show a compact activity rail:

```text
REGISTRY RESOLVER       38 versions resolved       complete
ADVISORY RESOLVER       3 affected versions        complete
REPOSITORY EXTRACTOR    fixture lockfile parsed     complete
INCIDENT RESEARCHER     6 sources / 11 claims       complete
BROWSER WITNESS         source page captured        complete
GRAPH CURATOR           43 nodes / 61 edges         complete
CONTAINMENT ENGINE      12 interventions evaluated  complete
```

The TUI should show the same events as an operator stream. This is the shared boundary between the two clients.

## HydraDB write policy

- Write canonical typed entities, not raw page chunks.
- Keep source URLs and quote spans on claims and edges.
- Preserve observed time separately from valid time.
- Deduplicate package versions, repositories, people, and advisories before writing.
- Mark synthetic deployment data as synthetic.
- Store failed or conflicting evidence as first-class warnings rather than silently dropping it.
- Persist defender controls as decision memories with the selected controls, exposure after the decision, and the active node set so a case can be reconstructed after the live run.
- Persist the ranked counterfactual containment plan as a separate memory so a later operator can inspect why a response was recommended, not only which button was clicked.
- Persist one explicit graph-topology memory and one attack/defense timeline memory per case; keep the full topology in the memory body and compact counts/kinds in metadata so HydraDB can retrieve both structure and provenance.
- For public repositories, include a bounded static source graph for local JavaScript/TypeScript imports, Rust modules, and source symbols. Unresolved imports remain explicit uncertainty; source is never installed, built, or executed.
- When GitHub exposes the latest commit patch, map added lines to the sampled source symbols and preserve the commit URL, timestamp, changed files, and symbol-match mode as observed evidence. A file without a patch remains file-level impact rather than pretending to know the changed function.
- Surface candidates carry the changed symbols that overlap their sampled file, if any. This is a signal for operator review, not a verified runtime dependency or a security finding.
- Upload memory batches in small idempotent chunks because the hosted per-request memory-token budget is bounded; report the case as queued until every batch is accepted.
- Treat HydraDB memory ingestion as asynchronous: show accepted/queued in the operator feed and only call it indexed when the API result reports a terminal completed status.
- Poll `GET /context/status?database=<database>&id=<source_id>` for every accepted source through Recoil's `/hydra-status` route; do not issue a recall query until the sources are indexed.
- Preserve unique source IDs for chunked memories. A chunk must never reuse its parent source ID or an upsert can erase the other chunks.
- Never execute package code while ingesting.
