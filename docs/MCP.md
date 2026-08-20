# Recoil MCP agent bridge

Recoil exposes its existing proof engine as a local stdio MCP server. The MCP layer does not reclassify findings and does not ask a model to invent graph edges. Browser, CLI, receipts, and MCP all read the same completed investigation state.

## Start the server

Install dependencies, configure `.env`, then run:

```bash
npm run mcp
```

For clients that spawn MCP servers, point the client at the repository checkout:

```json
{
  "mcpServers": {
    "recoil": {
      "command": "npm",
      "args": ["run", "mcp"],
      "cwd": "/absolute/path/to/recoil"
    }
  }
}
```

Run the protocol smoke test with:

```bash
npm run smoke:mcp
# Optional real repository scan through the MCP transport
RECOIL_MCP_SMOKE_REPOSITORY=https://github.com/axios/axios npm run smoke:mcp
```

## Tools

| Tool | Mode | Result |
| --- | --- | --- |
| `scan_repository` | Write | Starts one real public-evidence investigation and immediately returns its case ID. |
| `list_cases` | Read | Lists retained cases, repositories, verdict totals, and graph sizes. |
| `case_summary` | Read | Returns the computed decision and HydraDB verification state. |
| `reached_paths` | Read | Returns exact import lines, routes, CODEOWNERS, and first-observed commits. |
| `verified_fix_plan` | Read | Returns version challenges and the smallest verified fix set. |
| `compare_history` | Read | Compares the current graph with its dated boundary and HydraDB recall. |
| `inspect_evidence_graph` | Read | Returns the bounded observed graph and current-case HydraDB read-back. |
| `export_handoff` | Read | Exports a Markdown brief or SHA-256 integrity-addressed receipt. |

`scan_repository` accepts one public GitHub repository. With no selector it inventories the repository and discovers affected advisories through OSV. An optional GHSA/CVE or package selector narrows the case. Recoil reads repository code statically; it does not install dependencies, execute the repository, or send exploit payloads.

## Suggested agent flow

1. Call `scan_repository` with the repository the user is editing.
2. Poll `case_summary` with the returned case ID until the status is `complete` or `failed`.
3. Call `reached_paths` before proposing a change.
4. Use `verified_fix_plan` to distinguish a safe lockfile update from a required manifest change.
5. Call `compare_history` when the user asks what changed since an earlier scan.
6. Attach `export_handoff` to the issue or review.

The returned evidence remains bounded and cited. HydraDB supplies durable dated context, but cannot override the current source-backed verdict.
