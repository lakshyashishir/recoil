# Recoil

Recoil is a graph-native attack-and-defense simulator for software supply-chain incidents.

Give it an npm package, advisory, or public GitHub repository. Recoil collects public package and advisory evidence, reads repository manifests without installing dependencies, builds a bounded propagation graph, then evaluates the smallest defensive response that disconnects the modeled path.

The product is intentionally defensive. It never downloads or executes package code and never probes a target system.

## What makes the graph useful

The graph separates observed evidence from modeled reachability:

- real npm registry versions, maintainers, and OSV advisories;
- real public `package.json`, lockfile, GitHub Actions, Docker, and Compose signals when available;
- modeled build, deployment, service, and data fan-out, explicitly marked synthetic when no public runtime evidence exists;
- temporal attack events and counterfactual defender controls;
- HydraDB memories for the incident anchor, topology, timeline, collector evidence, decisions, and ranked containment plans.

## Run locally

```bash
npm install
npm run server
npm run dev
```

The browser runs at `http://127.0.0.1:5173` and the API at `http://127.0.0.1:8787`.

For HydraDB persistence, provide `HYDRA_DB_API_KEY` and `HYDRADB_DATABASE_ID` in the environment. `HYDRADB_COLLECTION_ID` defaults to `recoil`. Without credentials, the local graph and simulator still run in replay mode.

The operator TUI is available with:

```bash
npm run tui
```

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
POST /api/scenarios/:id/advance   advance one attack/defense event
POST /api/scenarios/:id/evaluate  rank bounded response combinations
POST /api/scenarios/:id/action    apply or remove a defensive control
GET  /api/scenarios/:id/report    return observed facts, modeled state, sources, and uncertainty
```

HydraDB memory ingestion is asynchronous. Recoil reports accepted memories as queued and only treats an API response as indexed when it exposes a terminal completed status. See the [HydraDB API reference](https://docs.hydradb.com/api-reference).

## Safety and uncertainty

Every case distinguishes confirmed public evidence, inferred relationships, synthetic deployment records, and unknowns. A report is a modeled blast-radius analysis—not proof that a real service was compromised.

See [the attack/defense design](docs/ATTACK-DEFENSE.md) and [the ingestion mesh](docs/INGESTION-MESH.md) for the architecture and evidence policy.
