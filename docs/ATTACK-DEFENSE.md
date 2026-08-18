# Recoil red / blue contract

Recoil keeps the adversarial structure because it makes the remediation claim testable. It does not role-play a compromise and it does not execute an exploit.

```text
public advisory + repository evidence
             ↓
RED  path prover
             ↓
BLUE fix planner
             ↓
RED  residual verifier
             ↓
dated report + HydraDB memory
```

## Red: path prover

Red is a constrained evidence agent, not an exploit runner. Its job is to construct a path only from observed records:

```text
advisory
  → affected package/version
  → repository lockfile
  → sampled source file importing the package
```

Every hop has a source URL or is marked unavailable. A repository with an affected lockfile but no sampled import is `DECLARED_ONLY`. A repository whose source collection was incomplete is `UNKNOWN`; Red is not allowed to turn missing evidence into a negative result.

The path prover is ecosystem-aware. JavaScript package specifiers and Rust crate imports (including
qualified paths such as `bytes::BytesMut`) are normalized to the package identity from the manifest and
lockfile. Local Rust modules and standard crates are not treated as third-party evidence. When the optional
advisory-scope model names an affected function, Recoil appends it only after an exact match in the indexed
symbol table; a model response can increase precision, but cannot create a route.

The optional model boundary is narrow: a model may read advisory prose and identify a likely affected symbol or entry point. The server validates that suggestion against the indexed source graph. It cannot create a graph edge, claim runtime execution, or override a verdict.

## Blue: fix planner

Blue receives the advisory’s fixed versions and each repository’s declared dependency range. It produces one of these defensible outcomes:

- `FIX_SURVIVES` — the proposed fixed version is outside the affected range and the declared range admits it;
- `MANIFEST_CHANGE_REQUIRED` — the fixed version is valid, but the declared range cannot resolve it;
- `NO_REACHABLE_PATH` — the dependency is declared but no sampled import reaches it;
- `ALREADY_SAFE` — the repository already resolves outside the affected range;
- `UNVERIFIED` — the evidence or advisory does not support a proof.

Blue cannot claim that “upgrade” is safe merely because a newer version exists. The fixed version must come from the advisory record, and the semver result is computed from the repository’s declaration.

## Red: residual verification

After Blue’s counterfactual version change, Red evaluates the affected-path predicate again. The result is not “the patch was deployed”; it is:

> If this repository resolved the proposed fixed version, the cited affected path would disappear under the collected evidence.

If the repository has alternate affected entries, an unresolved import, an incomplete source sample, or a range that excludes the fixed version, Recoil reports the residual uncertainty instead of marking the case contained.

## Temporal proof

The lockfile’s earliest public commit supplies `pathObservedAt`. The advisory’s publication date supplies the disclosure boundary. Recoil can therefore show:

```text
path observed → advisory published → current evidence → proposed fix
```

Rewind refuses to claim a path before the relevant evidence existed. The same dated facts are written to HydraDB with `valid_from`, source URLs, repository identity, and case identity.

## HydraDB role

HydraDB stores and retrieves:

- advisory facts;
- repository reachability facts;
- graph topology and provenance;
- fix proofs and residual-path decisions;
- cross-case evidence related to the package and repository.

Writes are chunked and idempotent. The application exposes `persisted`, `queued`, `failed`, or `skipped` honestly. A local report can still be produced when HydraDB is unavailable, but the UI labels it local replay rather than pretending that memory was stored.

## What this is not

- It is not a live red-team tool.
- It is not a package installer or malware sandbox.
- It is not runtime exploit confirmation.
- It is not a generic graph visualization.
- It is not a score derived from fictional services or “crown jewels.”

The product claim is narrower and stronger: **source-backed supply-chain reachability plus temporal remediation proof.**
