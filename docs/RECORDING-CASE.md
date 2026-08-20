# Verified live recording case

This case passed the strict live gate again on 20 August 2026. Re-run it before recording so the verdicts and
HydraDB receipt are freshly calculated from public OSV, GitHub, registry, source, and HydraDB responses.
The receipt is a handoff artifact, not hardcoded product output.

## Query

```text
GHSA-xvch-5gv4-984h
npm:minimist
https://github.com/http-party/http-server/tree/v13.0.2
https://github.com/tweenjs/tween.js
https://github.com/axios/axios/tree/v1.x
```

## Why this case is useful

The advisory is for `minimist` and documents affected ranges before `1.2.6` (and the older `0.2.x`
line) with fixed versions `1.2.6` and `0.2.4`:

- <https://osv.dev/vulnerability/GHSA-xvch-5gv4-984h>
- The `http-server@13.0.2` CLI imports the affected `minimist@1.2.5`: <https://raw.githubusercontent.com/http-party/http-server/v13.0.2/bin/http-server>
- Tween.js contains an affected `minimist@0.0.8` lockfile resolution but the bounded source sample imports it zero times: <https://raw.githubusercontent.com/tweenjs/tween.js/main/package-lock.json>
- Axios's `v1.x` lockfile resolves `minimist@1.2.8`, outside the advisory range: <https://raw.githubusercontent.com/axios/axios/v1.x/package-lock.json>

The live run produced the intended three-way contrast: `REACHED`, `DECLARED_ONLY`, and `NOT_AFFECTED`.
If a future run cannot prove one of those roles, the report must show `UNKNOWN` and the case must not be
recorded as a successful contrast.

## Run sequence

```bash
QUERY='GHSA-xvch-5gv4-984h npm:minimist https://github.com/http-party/http-server/tree/v13.0.2 https://github.com/tweenjs/tween.js https://github.com/axios/axios/tree/v1.x'

npm run doctor -- --recording --network "$QUERY"
HYDRADB_INDEX_WAIT_MS=120000 RECOIL_SMOKE_SCENARIO=recording-minimist-2026-08-19 RECOIL_SMOKE_QUERY="$QUERY" npm run smoke:recording
npm run cli -- "$QUERY" --recording --proof
npm run tui -- --recording "$QUERY"
```

Use the receipt written by `smoke:recording` only when the strict gate passes. Keep it outside Git; it
contains the live evidence summary and is not a substitute for the browser/CLI cross-client check.
