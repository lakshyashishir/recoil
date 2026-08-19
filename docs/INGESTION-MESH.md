# Evidence ingestion mesh

Recoil’s current ingestion path is a bounded public-evidence pipeline:

```text
OSV advisory ─┐
npm/crates.io ├→ normalized evidence → source-backed graph → report
GitHub repo ──┘                                  ↓
                                      HydraDB dated memories
```

## Collectors

- **Advisory resolver:** retrieves one OSV record by GHSA/CVE identifier.
- **Registry resolver:** retrieves published versions and maintainers from npm or crates.io.
- **Repository extractor:** reads `package.json`/`Cargo.toml`, npm/Yarn/Cargo lockfiles, bounded source files, workflows, containers, CODEOWNERS, and lockfile commit history. Yarn classic and Berry selectors are normalized without treating them as an npm install tree.
- **Source graph:** resolves local imports/modules and preserves external package imports with source URLs and line numbers.
- **Advisory scope agent:** optional structured extraction of candidate affected symbols; exact source-index matching is mandatory before attachment.

## Failure policy

- GitHub JSON responses are cached locally for the configured TTL to reduce API usage.
- Rate limits and source failures are shown explicitly.
- Partial source collection cannot produce `DECLARED_ONLY`; it produces `UNKNOWN` unless an affected import was positively observed.
- No collector silently substitutes the retired fixture for a public repository.
- A missing lockfile or missing source history removes temporal confidence rather than inventing dates.

## Normalized graph

The primary graph contains only evidence entities:

```text
advisory → package@version → repository → lockfile → sampled source file
```

Every source-backed node retains a URL, repository identity, and collection timestamp where available. Deployment, customer, service, and runtime nodes are not synthesized in the current product.

## HydraDB write policy

Each completed investigation writes bounded, idempotent memories for:

1. advisory facts;
2. observed graph topology;
3. repository reachability facts;
4. per-repository fix proofs.

Temporal fields are explicit metadata: `valid_from`, `valid_until`, `recoil_scenario_id`, `recoil_repository`, and `source_urls`. Ingestion status is surfaced as `persisted`, `queued`, `failed`, or `skipped`; local replay is never presented as cloud persistence.
