# Candidate live recording case

This is the handoff case for the final live demo. It is a candidate input, not a precomputed result.
The strict smoke gate must calculate the verdicts from live OSV, GitHub, registry, source, and HydraDB
responses before this case is used in a recording.

## Query

```text
GHSA-xvch-5gv4-984h
https://github.com/http-party/http-server/tree/v13.0.2
https://github.com/dojo/dojo
https://github.com/axios/axios/tree/v1.x
```

## Why this case is useful

The advisory is for `minimist` and documents affected ranges before `1.2.6` (and the older `0.2.x`
line) with fixed versions `1.2.6` and `0.2.4`:

- <https://github.com/advisories/GHSA-xvch-5gv4-984h>
- The `http-server` CLI imports `minimist`: <https://github.com/http-party/http-server/blob/master/bin/http-server>
- Dojo's public lockfile contains a `minimist@1.2.5` resolution: <https://github.com/dojo/dojo/blob/master/package-lock.json>
- Axios's `v1.x` lockfile declares a safe `minimist@^1.2.8` development dependency: <https://github.com/axios/axios/blob/v1.x/package-lock.json>

Those observations make this a strong candidate for a three-way contrast—source-backed reachability,
declaration without a sampled import, and an already-safe resolution—but they are not Recoil verdicts.
If the live collector cannot prove one of those roles, the report must show `UNKNOWN` and the case must
not be recorded as a successful contrast.

## Run sequence

```bash
QUERY='GHSA-xvch-5gv4-984h https://github.com/http-party/http-server/tree/v13.0.2 https://github.com/dojo/dojo https://github.com/axios/axios/tree/v1.x'

npm run doctor -- --recording --network "$QUERY"
RECOIL_SMOKE_QUERY="$QUERY" npm run smoke:recording
npm run cli -- "$QUERY" --recording --proof
npm run tui -- --recording "$QUERY"
```

Use the receipt written by `smoke:recording` only when the strict gate passes. Keep it outside Git; it
contains the live evidence summary and is not a substitute for the browser/CLI cross-client check.
