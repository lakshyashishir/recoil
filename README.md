# Recoil

Recoil is a memory-backed red/blue cyber range for software supply-chain incidents.

Give it an npm package, advisory, or public GitHub repository. Recoil collects public package and advisory evidence, reads Node or Rust repository manifests without installing dependencies, builds a bounded propagation graph, and runs an adaptive attacker-versus-defender episode over it. The red policy searches for alternate paths after every control; the blue policy chooses the smallest graph mutation that contains the current route.

The product is intentionally defensive. It never downloads or executes package code and never probes a target system.

## What makes the graph useful

The graph separates observed evidence from modeled reachability:

- real npm registry versions, maintainers, and OSV advisories;
- real public `package.json`, lockfile, GitHub Actions, Docker, and Compose signals when available;
- modeled build, deployment, service, and data fan-out, explicitly marked synthetic when no public runtime evidence exists;
- computed red/blue rounds where the attacker adapts after every defensive control;
- temporal attack events, alternate-route reconstruction, and counterfactual defender controls;
- concrete route search over alternate dependency, CI, service, and data paths;
- HydraDB memories for incident evidence, topology, prior decisions, and arena rounds so later defenders can recall what worked.

## Run locally

```bash
npm install
npm run start
```

`npm run start` launches both processes. The browser runs at `http://127.0.0.1:5173` and the API at `http://127.0.0.1:8787`.

For separate terminals, use `npm run server` and `npm run dev`.

For HydraDB persistence, copy `.env.example` to `.env` and provide `HYDRA_DB_API_KEY` and `HYDRADB_DATABASE_ID`. `HYDRADB_COLLECTION_ID` defaults to `recoil`. Without credentials, the local graph and simulator still run in replay mode.

Recoil does not require an LLM key. The attack route, exposure score, intervention choice, and containment result are computed from the graph so the security decision is reproducible and auditable. HydraDB's `infer` ingestion and graph-enriched recall provide the memory layer. An LLM may be added later as an optional report narrator, but it will not be trusted to invent graph state or declare an attack successful.

The operator TUI is available with:

```bash
npm run tui
```

The terminal agent/client can run a complete adaptive episode through the API:

```bash
npm run cli -- "https://github.com/axios/axios axios"
npm run cli -- "https://github.com/axios/axios axios" --fast
npm run cli -- "npm:lodash@4.17.21" --json
```

It collects evidence, recalls prior Recoil episodes when HydraDB is available, runs red and blue policies round by round, persists each round, and prints the final modeled report. The API must be running first (`npm run start` is the simplest route).

Run the deterministic graph checks with:

```bash
npm test
npm run benchmark
```

The benchmark is a local, network-free regression check for the arena policy. It asserts that red changes route after a graph mutation, that blue contains the computed high-value paths, and that controls are selected from graph state. It does not fabricate a security finding or execute package code.

## Useful targets

```text
npm:lodash@4.17.21
CVE-2021-4229 / fixture/storefront-api
https://github.com/expressjs/express
```

The GitHub collector uses the public Contents API and falls back to raw GitHub files when the unauthenticated API is rate-limited. Repository failures are shown as failures; they are never silently replaced with the fixture.

## API flow

```text
POST /api/scenarios/:id/run       set the target and start a case
POST /api/scenarios/:id/ingest    collect public evidence and write HydraDB memories
POST /api/scenarios/:id/hydra-status  poll asynchronous HydraDB indexing status
POST /api/scenarios/:id/recall     retrieve indexed evidence and graph context
POST /api/scenarios/:id/arena/start  recall prior episodes and start adaptive red/blue mode
POST /api/scenarios/:id/arena/step   run one computed red move and blue response
POST /api/scenarios/:id/arena/reset  reset the current episode without recollecting evidence
POST /api/scenarios/:id/advance   advance one attack/defense event
POST /api/scenarios/:id/evaluate  rank bounded response combinations
POST /api/scenarios/:id/action    apply or remove a defensive control
GET  /api/scenarios/:id/report    return observed facts, modeled state, sources, and uncertainty
```

HydraDB memory ingestion is asynchronous. Recoil reports accepted memories as queued, polls each accepted source through the status endpoint, and requests hybrid recall before the arena starts. During an episode, each red route, blue control, exposure change, and residual route is written as an arena-round memory. See the [HydraDB API reference](https://docs.hydradb.com/api-reference). Rust workspaces are read from `Cargo.toml`/`Cargo.lock`; a repository that is not published as a crate is reported as repository-primary evidence rather than as a collector failure.

## Safety and uncertainty

Every case distinguishes confirmed public evidence, inferred relationships, synthetic deployment records, and unknowns. A report is a modeled blast-radius analysis—not proof that a real service was compromised.

See [the attack/defense design](docs/ATTACK-DEFENSE.md), [the adaptive arena](docs/ARENA.md), and [the ingestion mesh](docs/INGESTION-MESH.md) for the architecture and evidence policy.
