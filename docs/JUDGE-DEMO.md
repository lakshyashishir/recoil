# Recoil judge demo

Recoil should be presented as a proof dashboard, not as a vulnerability list.

The sentence to keep in the room is:

> An affected dependency is not automatically an incident. Recoil proves whether it reaches source code, when that path appeared, and whether the fix actually cuts it.

## 90-second path

1. Open the landing page and paste a public repository URL. Do not begin with a preselected CVE unless a judge asks for the controlled comparison.
2. Let the live view finish. The UI is deliberately explicit about public evidence, bounded source sampling, and the fact that nothing is installed or executed.
3. On the case dashboard, read the headline and the four reachability counts. That is the product answer.
4. Point to the selected evidence graph. Select the repository node or source node and show the route that produced the verdict. Open the cited source line in GitHub, not a raw response.
5. Open **Response and fix checks**. Show the advisory-backed version check and the package-manager-aware command. Recoil recommends the change; it does not edit the repository.
6. Open **Timeline and HydraDB memory**. Show the date the path entered the public history, the advisory publication date, and the recalled dated evidence. This is where HydraDB changes the product from a one-shot scanner into a durable exposure record.
7. Copy the handoff note, then run the same query in the CLI. The terminal output and the browser report share the same evidence contract.

## Controlled comparison

Use this case when the room wants to see the three-way distinction:

```text
GHSA-xvch-5gv4-984h npm:minimist
https://github.com/http-party/http-server/tree/v13.0.2
https://github.com/tweenjs/tween.js
https://github.com/axios/axios/tree/v1.x
```

The important moment is not the number of graph nodes. It is that the same advisory produces different
answers per repository: a source-backed path, a declared-only resolution, or a version already outside the
affected range. The dashboard keeps those rows visible while the graph focuses one route at a time.

## Repository-first handoff

When a judge says “use a repository I choose,” paste only the public URL:

```text
https://github.com/hydra-db/hydradb
```

If no affected advisory is found, that is a valid negative result. Say: “The inventory was checked against
public advisories and there is no affected edge to draw.” Do not force a graph where the collected evidence
contains no relationship. If an advisory is found, Recoil expands only those package paths and keeps the
same proof dashboard.

## CLI handoff

```bash
npm run cli -- --direct --fast --proof \
  "GHSA-xvch-5gv4-984h https://github.com/http-party/http-server/tree/v13.0.2"
```

Use `--direct` only when the API is not available. In the normal demo, the CLI is API-backed so it can share
the same case with the browser. End with the receipt verification, not with a second dashboard:

```bash
npm run cli -- --direct --fast --json \
  "GHSA-xvch-5gv4-984h https://github.com/http-party/http-server/tree/v13.0.2"
```

## What to emphasize

- HydraDB stores dated, typed evidence and graph relations, not just a final model summary.
- The graph is computed from collected records. It is not a decorative attack animation or a scripted blast-radius picture.
- Every route can open a public source, and uncertainty remains visible as `UNKNOWN`.
- The same report is portable: browser, CLI, Markdown brief, and integrity-addressed receipt.

## What not to claim

Recoil does not install dependencies, execute repository code, run exploit payloads, prove runtime reachability,
or make a claim about a live production deployment. Its advantage is evidence depth and auditability, not a
severity score.
