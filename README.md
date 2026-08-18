# Recoil

Recoil is a memory-backed red/blue cyber range for software supply-chain incidents.

Give it an npm package, advisory, or public GitHub repository. Recoil collects public package and advisory evidence, reads Node or Rust repository manifests without installing dependencies, builds a bounded propagation graph, and runs an adaptive attacker-versus-defender episode over it. The red policy searches for alternate paths after every control; the blue policy chooses the smallest graph mutation that contains the current route.

The product is intentionally defensive. It never downloads or executes package code and never probes a target system.

## What makes the graph useful

The graph separates observed evidence from modeled reachability:

- real npm registry versions, maintainers, and OSV advisories;
- real public `package.json`, lockfile, GitHub Actions, Docker, and Compose signals when available;
- a bounded static JavaScript/TypeScript/Rust source graph that resolves local imports/modules and indexes symbols without executing code;
- latest public GitHub commit evidence mapped from changed hunks to sampled source files and indexed symbols;
- inferred operational surfaces now show whether the latest changed symbols touch the candidate surface;
- public `CODEOWNERS` rules are applied to changed files when available, with unknown ownership preserved as unknown;
- modeled build, deployment, service, and data fan-out, explicitly marked synthetic when no public runtime evidence exists;
- computed red/blue rounds where the attacker adapts after every defensive control;
- explainable policy traces showing Red's alternate routes and Blue's counterfactual control scores;
- a final response-plan table comparing the best affordable graph mutations by residual exposure and cost;
- temporal attack events, alternate-route reconstruction, and counterfactual defender controls;
- concrete route search over alternate dependency, CI, service, and data paths;
- HydraDB memories for incident evidence, topology, prior decisions, and arena rounds so later defenders can recall what worked.
- terminal arena rounds and the final ranked response plan persist their candidate decisions, not only the selected control.

## Run locally

```bash
npm install
npm run start
```

`npm run start` launches both processes. The browser runs at `http://127.0.0.1:5173` and the API at `http://127.0.0.1:8787`.

For separate terminals, use `npm run server` and `npm run dev`.

For HydraDB persistence, copy `.env.example` to `.env` and provide `HYDRA_DB_API_KEY` and `HYDRADB_DATABASE_ID`. `HYDRADB_COLLECTION_ID` defaults to `recoil`. Without credentials, the local graph and simulator still run in replay mode.

Recoil can run without an LLM key using the deterministic graph policy. When `OPENAI_API_KEY` is configured, Red and Blue become constrained policy agents: they can inspect the graph, public evidence, recalled HydraDB context, and an allowlisted local fixture probe, then return strict structured decisions. The server validates every proposed path and control against the graph before applying it; the deterministic policy remains the fallback.

When this workspace also contains the sibling `claimtrace/.env`, `npm run start` imports its OpenAI key and model into the server process at runtime; the key is not copied into Recoil or printed. To use a different file, set `RECOIL_SHARED_ENV_FILE`, or put `OPENAI_API_KEY` directly in Recoil's `.env`.

The execution boundary is deliberate. Recoil never installs or executes code from a public repository and never probes a live target. The agent loop can execute only the owned disposable fixture in `sandbox/fixture.js`, which records a probe result and runs a small regression suite after each defensive control. This lets the demo show a real observe → attack hypothesis → defense → regression loop without turning a public URL into an execution target. Set `RECOIL_AGENT_MODEL=gpt-5` or another available model to override the default.

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
Each CLI round also prints how many routes Red evaluated and how many affordable controls Blue compared; `--json` exposes the full candidate records.

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
GET  /api/scenarios/:id/code-graph return bounded source files, imports, symbols, inferred surfaces, and latest-change impact
```

HydraDB memory ingestion is asynchronous. Recoil reports accepted memories as queued, polls each accepted source through the status endpoint, and requests hybrid recall before the arena starts. During an episode, each red route, blue control, exposure change, and residual route is written as an arena-round memory. See the [HydraDB API reference](https://docs.hydradb.com/api-reference). Rust workspaces are read from `Cargo.toml`/`Cargo.lock`; a repository that is not published as a crate is reported as repository-primary evidence rather than as a collector failure.

## Safety and uncertainty

Every case distinguishes confirmed public evidence, inferred relationships, synthetic deployment records, and unknowns. A report is a modeled blast-radius analysis—not proof that a real service was compromised.

See [the attack/defense design](docs/ATTACK-DEFENSE.md), [the adaptive arena](docs/ARENA.md), and [the ingestion mesh](docs/INGESTION-MESH.md) for the architecture and evidence policy.
