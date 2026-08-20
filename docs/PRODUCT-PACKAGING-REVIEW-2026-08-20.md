# Recoil product packaging review brief

## Purpose

This is a review request for a stronger product and hackathon-demo direction.
It is intentionally about packaging and experience, not another generic visual
refresh. Recoil's evidence engine is substantially stronger than the current
presentation makes visible. We need a clear product that a judge can understand
in 30 seconds, enjoy watching for 2 minutes, and believe after 5 minutes.

Please review this as a product strategist, security-tool founder, interaction
designer, and hackathon judge. Be decisive. Reject ideas that are flashy but
not implementable or that would require Recoil to claim evidence it did not
collect.

## The product in one sentence today

Recoil takes a public security advisory and public GitHub repositories, then
proves whether the affected dependency reaches sampled application code, when
the path appeared, and whether an advisory-backed fixed version closes the
observed path.

## What the engine actually does

The following are implemented and tested; they are not mock outputs:

- Collects public OSV/advisory, npm or Cargo registry, GitHub manifest,
  lockfile, source, and commit-history evidence.
- Builds a bounded source graph for JavaScript/TypeScript and Rust/Cargo
  repositories without executing package code.
- Computes a real contrast across repositories:
  `REACHED`, `DECLARED_ONLY`, `NOT_AFFECTED`, and honest `UNKNOWN`.
- Produces source-cited dependency paths, bounded local-import context, and
  dated first-observation evidence.
- Rewinds the evidence graph to an earlier date and refuses to claim a path
  before it was observed.
- Checks the advisory's fixed version against the repository's declared range
  and reports whether a manifest change is required.
- Persists dated evidence and typed graph relations through HydraDB, recalls
  prior related cases, and verifies current-case graph relations separately.
- Exposes the same case through browser, CLI, TUI, a portable evidence brief,
  and an integrity-addressed receipt.

The product does **not** install dependencies, execute untrusted repository
code, send exploit payloads, claim runtime production reachability, or pretend
that a generated topology is an observed system. Those boundaries are a
strength and must remain visible in the right place.

## Progress so far

Recoil is not a blank prototype. The repository already contains a substantial
evidence engine and three clients.

### Engine and evidence

- Public OSV, npm, Cargo, GitHub manifest, lockfile, source, workflow, and
  commit-history collectors.
- npm, legacy npm, Yarn, pnpm, and Cargo lockfile parsing with bounded source
  sampling.
- JavaScript/TypeScript and Rust/Cargo source graphs with external package
  imports, local-import edges, symbols, and source URLs.
- Four-way computed verdicts: `REACHED`, `DECLARED_ONLY`, `NOT_AFFECTED`, and
  `UNKNOWN`.
- Bounded transitive dependency paths and source-backed importer cones.
- Advisory fixed-version checks, semver range validation, residual-path checks,
  and manifest-change-required outcomes.
- Temporal exposure evidence from public repository history and a rewind that
  refuses to claim facts before they were observed.
- Optional OpenAI advisory-symbol assistance that is validated against indexed
  source and cannot create a finding or graph edge.

### HydraDB integration

- Dated evidence memories for advisories, repository findings, fix proofs,
  topology, and cross-repository shared resolutions.
- Explicit typed graph ingestion through the HydraDB `graph_payload` path.
- `AFFECTS`, `RESOLVED_IN`, `DEPENDS_ON`, `IMPORTS`, and symbol/provenance
  relationships preserved in the evidence graph.
- Asynchronous indexing reconciliation with honest `persisted`, `queued`,
  `failed`, and `skipped` states.
- Separate temporal recall for prior cases and current-case graph verification.
- Sanitized graph triplets, prior-case summaries, temporal receipts, and graph
  deltas exposed without leaking raw provider chunks.
- HydraDB-backed comparison of current and prior repository snapshots.

### Product surfaces

- Browser investigation flow with a landing input, live collection state,
  source-backed paths, final report, temporal rewind, fix check, audit view,
  receipts, and human-readable briefs.
- CLI using the same API state machine, JSON output, proof output, strict
  recording mode, direct in-process mode, case sharing, and receipt
  verification.
- OpenTUI client with the same evidence and recording contract.
- Regression suite, evidence benchmark, strict recording doctor, network
  preflight, and HydraDB recording gate.

### Verification status

The current repository has passed 120 automated tests, the four-case evidence
benchmark, production build, and TUI build. The benchmark computes one each of
`REACHED`, `DECLARED_ONLY`, `NOT_AFFECTED`, and `UNKNOWN`, plus fix proof and
temporal rewind. It also asserts that outputs are computed from inputs, that
fictional deployment nodes are absent, and that package code is not executed.

The important limitation is not engine correctness. The current browser still
feels like a collection of true capabilities rather than one product. It asks
the audience to understand an advisory input, a live journal, multiple graph
views, report tabs, HydraDB status, temporal controls, receipts, and an audit
boundary before they understand the result.

## The product must go beyond the track's basic input/output

The current track-shaped flow is:

```text
advisory + repository URLs → reachability verdict → suggested fix
```

That is valuable, but not enough to win attention. A user can already get a
basic vulnerable-dependency alert from GitHub, Dependabot, or an AI coding
agent. GitHub's dependency graph scans supported manifest and lockfile data,
Dependabot alerts expose affected files and fixed versions, and dependency
review evaluates dependency changes in pull requests. See the official
documentation for the [dependency graph](https://docs.github.com/en/code-security/concepts/supply-chain-security/dependency-graph-data),
[Dependabot alerts](https://docs.github.com/en/code-security/concepts/supply-chain-security/dependabot-alerts),
and [dependency review](https://docs.github.com/en/code-security/concepts/supply-chain-security/dependency-review).

Recoil should therefore own the layer after detection:

```text
discover → prove source exposure → explain history → plan containment
→ recompute the graph → preserve the decision
```

The product objective is to turn the strong existing engine into a viable,
winnable demo that a judge can understand in 30 seconds, enjoy watching for
two minutes, and believe after a deeper five-minute inspection.

## Repository-only discovery

The primary entry point should become:

```text
https://github.com/org/repository
```

Recoil should inventory the repository's supported manifests and lockfiles,
discover relevant advisories in bounded batches, then classify only the most
important candidates first. The user should not have to know which CVE to
paste before Recoil can begin.

The output should be a security state summary such as:

```text
12 advisories discovered
3 reach application code
2 are declared but unused
4 are already outside the affected range
3 require more evidence
```

This is more useful than the current one-advisory workflow, but repository-only
scanning is not itself the differentiator. A full unbounded scan could produce
too many OSV requests, noisy findings, duplicate transitive advisories, and a
long first-run experience. The feasible MVP is a bounded inventory plus
prioritized advisories based on severity, fixed-version availability, source
reachability, and historical change.

Repository-only discovery should be a new default mode, while the existing
advisory-plus-repository mode remains available for a focused investigation and
for deterministic recording cases.

## HydraDB as active security memory

HydraDB should not appear as a green connection badge or as a final write after
the interesting work is complete. It should become Recoil's persistent,
temporal security state.

The graph should represent entities such as:

```text
repository · package · resolved version · advisory · source importer
commit · owner · proposed fix · accepted decision · previous scan
```

With relationships such as:

```text
REPOSITORY RESOLVES PACKAGE
PACKAGE AFFECTED_BY ADVISORY
SOURCE IMPORTS PACKAGE
PATH INTRODUCED_IN COMMIT
ADVISORY FIXED_BY VERSION
FIX CLOSES PATH
REPOSITORY CHANGED_SINCE SCAN
```

The product should make these questions first-class:

- Which vulnerabilities became reachable since the previous scan?
- When did this package first enter application code?
- Which repositories share this vulnerable transitive dependency?
- Was this alert already reviewed or accepted?
- Which fix worked in another repository?
- Did a previously closed path return?
- What was true before the advisory became public?

HydraDB's documented context graph and graph-enriched recall are appropriate
for this role, and its temporal graph model makes the previous/current state
comparison a natural product interaction. See [HydraDB memories and context
graphs](https://docs.hydradb.com/essentials/memories) and [HydraDB's temporal
graph model](https://hydradb.com/blog/git-for-context-versioned-temporal-graphs-for-ai-agent-memory).

The most convincing HydraDB interaction is:

```text
Run the repository again → “What changed since the last scan?”
```

That demonstrates durable security memory rather than database connectivity.

## Real attack/defense packaging

The old arena was a simulator. It should not return as a fake cyber range. The
attack/defense shape can become a real supply-chain response loop.

### Red: exposure planner

The red agent is a constrained, tool-using planner. It reads the observed graph
and chooses the strongest evidence-backed route from an affected package to
application code. Its tools may query HydraDB, inspect OSV, read lockfiles and
source, inspect public history, and identify alternate paths.

The red agent may choose the next investigation action, but it may not invent a
node, create a relation, claim runtime execution, or override a deterministic
verdict.

### Blue: control planner

The blue agent reads the evidence graph and prior HydraDB decisions, then asks:

> What is the smallest real change that closes all observed paths?

It may propose a fixed-version upgrade, manifest range change, lockfile update
plan, dependency removal, or repository-specific remediation. Recoil then
re-runs the deterministic evidence engine against the proposed state.

The loop becomes:

```text
RED finds an observed path
BLUE proposes a control
RECOIL recomputes the graph
RED checks residual paths
HYDRADB stores the new state
```

This gives the product the visual energy of attack/defense while remaining a
real, source-backed security workflow. “Attack” means proving an exposure path;
“defense” means proving that a control removes that path. It does not imply
that Recoil executed an exploit.

The LLM should be used as a planner and researcher over explicit tools. The
deterministic collectors, graph builder, semver evaluator, and re-checker
remain the authority. A planner benchmark can compare graph-constrained
planning against a flat-context prompt using evidence coverage, invalid-action
rate, time to first valid path, closure rate, and repeated-case retrieval cost.

## Minimum remediation cut

The strongest graph-native feature to evaluate is a minimum remediation cut:

> What is the smallest set of changes needed to eliminate every reachable
> affected path?

For example:

```text
5 exposed routes across 3 repositories

Upgrade shared package X  → closes 3 routes
Change repository B       → closes 1 route
Repository C              → remains UNKNOWN; more evidence required
```

This converts the graph from a visualization into a decision engine. It is
more useful than listing alerts and gives the demo a concrete before/after
moment.

## Proposed beyond-track product loop

```text
repository URL
  → package and lockfile inventory
  → bounded advisory discovery
  → source-backed reachability
  → HydraDB baseline security graph
  → red exposure plan
  → blue minimum remediation plan
  → deterministic counterfactual re-check
  → graph diff, temporal explanation, and portable receipt
```

The 90-second demo should be:

1. Paste only a repository URL.
2. Recoil discovers relevant advisories automatically.
3. The exposure planner finds three real source-backed paths.
4. The control planner proposes the smallest remediation set.
5. Recoil recomputes the graph and visibly closes the paths it can prove.
6. Rewind to show when one path first appeared.
7. Ask HydraDB what changed since the previous scan.
8. Print the same incident as a CLI receipt.

The audience should remember:

> Recoil did not just find CVEs. It discovered the vulnerable paths, planned
> the smallest response, proved the response closed them, and remembered the
> incident.

## Feasibility boundaries

### High feasibility

- Repository-only intake for public GitHub repositories.
- Package and lockfile inventory using the existing collectors.
- Bounded OSV advisory discovery and deduplication.
- Multi-advisory report built from the existing reachability classifier.
- HydraDB security snapshots, prior/current comparisons, and temporal queries.
- Graph-derived remediation grouping and shared-resolution analysis.

### Feasible with focused scope

- LLM red/blue planners constrained to explicit graph and evidence tools.
- Manifest/range counterfactuals and generated remediation plans.
- A browser view with exposure lanes, control actions, and graph diffs.
- CLI/TUI commands that expose the same incident loop.
- GitHub Action or SARIF export as a post-demo integration.

### Too risky for the MVP

- Arbitrary code patching across every language and build system.
- Installing or executing untrusted package code.
- Runtime exploit validation against public targets.
- An unbounded scan of every advisory in a large repository.
- A simulated infrastructure arena presented as real attack evidence.

Do not force RL into the first version. A constrained tool-using planner over a
temporal graph is more feasible and more credible. RL can become a later
planner benchmark once the action space and real evidence environment are
stable.

## What the current product makes confusing

The problem is not a missing collector. It is that the interface currently
asks the viewer to assemble the product's mental model themselves.

1. The first action is an advisory plus one-to-four repository URLs, but the
   landing page does not make the best demonstration case feel immediate.
2. During collection, the viewer sees a journal, four evidence phases, a graph,
   repository progress, and several status labels. They do not know what
   question is being answered right now.
3. “Open local report” is an implementation phrase. A judge does not know what
   a local report is, why it is safe to open early, or why it matters.
4. The completed report contains a correct decision, outcome index, selected
   route, graph/path toggle, tabs, temporal rewind, fix queue, HydraDB context,
   audit record, receipts, and a conclusion. The truth is there, but the
   hierarchy is not.
5. The full graph is visually dense. It currently looks like a topology viewer,
   while the strongest product proof is a small number of cited routes and a
   before/after change.
6. The visible HydraDB state looks like infrastructure health. The judge does
   not immediately see the more interesting capability: durable, dated,
   queryable evidence that changes how the case can be reconstructed.
7. The output is a report, not a memorable event. There is no strong “this one
   advisory produced three different truths” moment, no clear path closure, and
   no single result the audience can repeat afterward.
8. The CLI currently feels like a one-shot command. Its real value-the same
   evidence contract and portable receipt-does not appear as part of one
   coherent product loop.

## What Strix does well publicly

Strix is a useful packaging reference, not a feature set to copy.

Its repository opens with a precise promise: “Open-source AI penetration
testing tool” and “autonomous AI hackers that find and fix your app's
vulnerabilities.” Its README then immediately gives a quick start, a target,
and a result-oriented loop. The README makes the differentiator concrete:
validated proof-of-concept exploits rather than false positives, followed by
remediation and reports. See the [Strix repository](https://github.com/usestrix/strix).

The public product page reinforces the same loop:

```text
discover and validate → show the issue and proof → generate a fix → verify the fix
```

It starts with one domain input and one “Start testing” action, then presents
status, issues, and a concrete issue detail. The issue detail includes impact,
location, reproduction, a proposed code change, and “Fix verified.” It also
connects the open-source CLI, local viewer, managed platform, CI, and coding
agent skills around the same scan. See [Strix's product page](https://www.strix.ai/)
and [Strix's documentation](https://docs.strix.ai/).

Transferable lessons:

- Lead with the job, not the architecture.
- Show a target and a result before explaining the machinery.
- Make the proof artifact the hero: location, evidence, reproduction or
  comparison, and a verified next state.
- Give the product a short loop with named stages.
- Let the CLI and browser be two views of one case, not separate products.
- Put advanced capabilities behind a deliberate inspection step.
- Make the README and demo repeat the same promise and vocabulary.
- State authorization and execution boundaries clearly; trust makes the
  impressive claims believable.

Do not copy Strix's “AI hacker,” exploit, PoC, or runtime claims. Recoil's edge
is different: it can prove the difference between dependency presence and
source-backed exposure across repositories, then replay that evidence over
time through HydraDB.

## Candidate product framing to evaluate

### Working direction: Recoil - dependency incident replay

> Turn a CVE into a replayable evidence case: which code was exposed, when it
> became exposed, and what closes the path.

This is narrower and more memorable than “supply-chain investigation tool.” It
gives the demo a natural event sequence:

```text
open the case → trace the path → compare repositories → rewind the date
→ challenge the fix → preserve the evidence
```

The product is not a graph viewer. The graph is the evidence substrate behind
an incident replay.

## Proposed demo spine to critique

The final experience should make one verified three-repository case feel like a
small investigation with a beginning, reveal, and closure.

### Act 1 - Open the case

The landing screen has one primary action, one preloaded judge-safe example,
and one sentence explaining the answer. The default case is the tested
three-way contrast:

```text
one advisory + three repositories
```

The user can replace the case, but the winning demo never starts by asking the
judge to understand four URLs and a package selector.

### Act 2 - Watch evidence become a case

The live view shows one clear question:

> “Which of these repositories actually uses the affected version?”

Then it reveals three repository lanes. Each lane moves through real collector
states and ends in one computed verdict. The source URL and the observed line
appear only when that lane has evidence. The graph should draw only the
selected proof route as the primary visual; the wider entity graph is an
explicit “inspect topology” action.

The audience should see the real contrast build:

```text
repo A  REACHED         affected version + source import
repo B  DECLARED_ONLY   affected version, no sampled import
repo C  NOT_AFFECTED    resolved version outside the advisory range
```

### Act 3 - Change the question

The report presents a large plain-language answer first, then a three-row
outcome strip. Selecting a repository opens one route, not an entire graph.
The route should read as a line of evidence:

```text
advisory → resolved version → lockfile → source import → first observed date
```

The audience should never need to understand SVG layout, graph density, or
internal terms such as “local report.”

### Act 4 - Rewind and close the path

One deliberate control rewinds to the advisory publication boundary. The
selected route changes because the dated evidence changes. A second deliberate
control shows the fixed-version challenge and the residual-path result. The
language should be:

```text
before disclosure: path not yet observed
current evidence: path reached
after fixed version: path closed / manifest change required
```

### Act 5 - Preserve the proof

HydraDB is shown as the durable evidence layer only after the result is clear:

```text
evidence preserved · current-case graph verified · prior case context available
```

The CLI can print the same answer and emit the receipt as a second act of the
demo. It should not be introduced as an unrelated terminal product.

## Questions for the superior model

Please answer these questions in order and make a single recommendation.

### 1. Positioning

Is “dependency incident replay” the strongest framing for this engine and
Track 2, or is there a better product category? Give three alternatives and
select one. Explain why a judge would remember it after ten other graph and
memory demos.

### 2. Demo narrative

Design a 90-second demo, a 3-minute demo, and a 7-minute deep dive. For each,
specify the exact user action, visible transition, spoken sentence, and proof
artifact. Identify the one moment that should create the wow factor.

### 3. Information hierarchy

What should be visible by default, what should be one click away, and what
should be hidden behind an audit/advanced view? Pay special attention to:

- full graph versus cited proof route;
- live event journal versus repository lanes;
- HydraDB state versus HydraDB-derived product value;
- receipts, briefs, sources, and audit limits;
- current report versus historical rewind.

### 4. Product architecture

Propose the smallest coherent browser experience that packages the current
engine without deleting capabilities. Name the screens or modes, their order,
and the single job of each. Avoid generic dashboards, agent chat, fake attack
animations, and “AI workspace” patterns.

### 5. Graph treatment

Give a concrete graph strategy that remains truthful and legible at 1280px:

- what nodes/edges are shown in the default route;
- how multiple repositories are compared;
- how the full graph is entered and exited;
- how source citations and selection work;
- what happens on mobile.

### 6. HydraDB differentiation

Explain how to make HydraDB visibly essential without showing a database
status badge. Which single interaction best demonstrates durable graph memory,
temporal recall, or current-case graph verification? Specify the exact visible
input and output.

### 7. Competitive edge

Compare Recoil's proposed experience against dependency dashboards, SBOM/
reachability scanners, temporal memory projects, and Strix-like autonomous
security products. State what Recoil can credibly own and what it should not
claim.

### 8. Implementation plan

Give a phased plan using the existing React/CSS/API/state model:

1. packaging and copy;
2. information architecture;
3. graph/proof visualization;
4. demo controls and real state transitions;
5. CLI/TUI parity;
6. README and recording.

For each phase, name concrete files/components and call out anything that is
too risky or too large for the hackathon.

### 9. Judge test

Write five questions a judge should be able to answer after watching the demo.
If the viewer cannot answer them, the product is still confusing.

## Constraints

- Do not recommend deleting the evidence engine or moving to a fake simulation.
- Do not recommend claiming runtime exploitation, deployment reachability, or
  execution that Recoil does not perform.
- Do not recommend a generic multi-agent dashboard, graph-only visualization,
  or an LLM chat wrapper.
- Do not add features merely because Strix has them; explain the product reason.
- Prefer one killer path with real evidence over ten shallow panels.
- Keep HydraDB cloud integration, temporal recall, graph payloads, CLI, TUI,
  receipts, and source citations available, but package them progressively.
- The recommendation must be feasible in the existing repository and testable
  with the current benchmark plus one real recording case.

## Required response format

Return:

1. **Verdict:** one paragraph on whether the engine is winnable and what is
   currently preventing it.
2. **Winning category and one-sentence promise.**
3. **The 90-second demo storyboard.**
4. **Default screen architecture.**
5. **Graph and HydraDB treatment.**
6. **Three features to build next.**
7. **Three things to remove from the default view without deleting them.**
8. **Risks and anti-claims.**
9. **A five-day implementation order.**

Also explicitly decide:

- whether repository-only intake should replace or complement the current
  advisory-plus-repository flow;
- whether the red/blue exposure-and-control loop is genuinely differentiated
  or still too close to existing security products;
- which HydraDB interaction should be the single judge-facing proof of value;
- whether minimum remediation cut is feasible and worth making the central
  graph interaction;
- what the first real public-repository recording case should be;
- which existing capabilities must remain accessible but disappear from the
  default view.

## Accepted implementation order - 2026-08-20

The superior review is accepted as the product direction. Recoil is now
packaged as repository-first reachability triage, while the explicit
advisory-plus-repositories flow remains available for a controlled comparison
case.

### The promise

> Recoil reads your repository, finds the advisories that apply, and proves
> which ones actually reach your source code - with the lockfile line, the
> importer, and the date the path appeared.

### Five-day build order

1. **Repository-only discovery:** accept one public repository, inventory its
   recorded dependency graph, query OSV in bounded batches, and classify only
   advisories whose affected versions are present. Keep the advisory-plus-
   repository path as the deterministic benchmark case.
2. **Proof provenance:** expose the first collected lockfile commit, subject,
   author, importer line, optional validated symbol, and CODEOWNERS owner. Use
   the precise caveat that lockfile history dates path appearance, not the
   creation of vulnerable code.
3. **Triage packaging:** make the first report view a declared-versus-reached
   ledger, grouped outcome rows, one expanded proof path, explicit UNKNOWN
   states, and a smallest-fix-set recommendation. Keep the full graph and
   audit surfaces behind inspection links.
4. **HydraDB delta:** make repeat scans the one judge-facing HydraDB proof:
   “two reachable paths closed; one new path appeared.” Do not lead with a
   connection badge or raw memory counts. Populate `valid_until` when a path
   is proven closed; otherwise call the history dated evidence rather than
   bitemporal truth.
5. **Unrehearsed demo and parity:** run ten public repositories never used as
   fixtures, including a monorepo and a repository without a lockfile. Make
   browser, CLI, TUI, brief, and receipt use identical verdict vocabulary and
   preserve the same honest refusal states.

### Explicit non-goals

The red/blue attack loop is not the core product. It remains an optional
research surface only if it can execute inside a safe sandbox with a real
artifact and a real control; a deterministic animation is not a security
claim. Agent chat, fake attack traces, severity gauges, SARIF, and a default
full-graph dashboard stay out of the judge path.

Be opinionated. We do not need more ideas; we need one consumable product.
