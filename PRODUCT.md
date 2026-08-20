# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Security engineers, maintainers, and developers investigating whether a public software dependency
actually reaches application code across one or more repositories.

## Product Purpose

Recoil turns a vulnerability advisory and public GitHub repositories into a source-cited investigation.
It distinguishes an affected package that reaches sampled source, an affected package that is only listed,
an already-safe resolution, and evidence that is incomplete. It also dates when the path was first observed,
checks an advisory-backed fixed version, and leaves a portable evidence handoff.

## Positioning

Recoil is a proof layer rather than a dependency dashboard: every conclusion is built from public advisory,
registry, lockfile, source-import, and history records, with HydraDB providing dated evidence memory and
cross-case context. The product does not claim runtime compromise or execute repository code.

## Operating Context

The user pastes a GHSA/CVE advisory or package selector plus one to four public GitHub repository URLs.
The browser runs one autonomous investigation, streams collection progress, then opens a report with the
repository contrast, cited path, fix check, timeline, HydraDB context, and downloadable handoff. The same
case can be inspected through the CLI and OpenTUI client.

## Capabilities and Constraints

- Public npm, Cargo, OSV, GitHub, and HydraDB evidence collection.
- Bounded JavaScript/TypeScript/Rust source sampling and local-import graph construction.
- Reachability verdicts: `REACHED`, `DECLARED_ONLY`, `NOT_AFFECTED`, and `UNKNOWN`.
- Temporal rewind based on dated repository evidence and HydraDB recall.
- Advisory-backed fixed-version and semver remediation proof.
- Optional advisory-symbol scope is accepted only after exact source validation.
- The browser, CLI, TUI, and receipt share the same evidence contract.
- No dependency installation, repository execution, exploit payloads, or inferred production topology.
- Missing or incomplete evidence must remain visible as uncertainty.

## Brand Commitments

The product name is Recoil. The voice is direct, calm, specific, and evidence-first. The interface should
feel like a serious investigation instrument: understandable to a first-time user, useful to an engineer,
and credible to a judge reading the source links and limits.

## Evidence on Hand

The implementation and tests provide real collector boundaries and network-free benchmark evidence at
`src/core/`, `server/`, `test/`, and `scripts/evidence-benchmark.js`. The live product is designed to use
public OSV, npm, Cargo, GitHub, and configured HydraDB records. No customer data, testimonials, runtime
compromise claim, or synthetic production topology may be presented as real.

## Product Principles

1. Lead with the decision a maintainer needs to make.
2. Make every meaningful hop inspectable and source-cited.
3. Treat uncertainty as a product state, not a failure to hide.
4. Use HydraDB for dated context and relationships, not decorative connectivity.
5. Keep the product autonomous to operate and restrained in what it claims.
