# Recoil demo runbook

## Start the product

```bash
npm install
cp .env.example .env
# fill HYDRA_DB_API_KEY and HYDRADB_DATABASE_ID
npm run start
```

Open `http://127.0.0.1:5173`. The API and browser are started by the same command.

## A real case

Paste one of these into the investigation target field:

```text
https://github.com/axios/axios axios
npm:lodash@4.17.21
CVE-2021-4229 / fixture/storefront-api
```

Recoil collects npm metadata, OSV advisory records, incident pages, and public repository files. It never installs or executes the package. The workspace then advances the bounded attack sequence, showing the current route and the high-value targets reachable through it.

When the response window opens, use **Find minimum containment** or choose controls directly. Each applied control creates a new round:

```text
defender control → attacker residual-route test → graph recalculation
```

The final case report preserves the initial route, alternate routes, current route, observed sources, HydraDB evidence state, and explicit uncertainty about modeled deployment edges.

## Terminal clients

With the API running:

```bash
npm run cli -- "https://github.com/axios/axios axios"
npm run cli -- "npm:lodash@4.17.21" --json
npm run tui
```

The CLI runs ingestion, event advancement, planning, recommended controls, and report generation. The TUI is a local operator view: `s` starts, `space` steps, `1–3` selects the first controls, `r` resets, and `q` exits.

## Evidence and safety boundary

Public repository and advisory facts are observed. Deployment fan-out and service/data reachability are modeled unless a public source supplies stronger runtime evidence. HydraDB memories are uploaded asynchronously in bounded, idempotent chunks; Recoil displays `queued` until source status becomes terminal and only then performs recall. No exploit payload, package code, or target system is executed.
