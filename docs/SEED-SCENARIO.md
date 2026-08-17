# Recoil seed scenario: the `ua-parser-js` release trap

## The story

On October 22, 2021, the npm account behind `ua-parser-js` was hijacked. Three published versions—`0.7.29`, `0.8.0`, and `1.0.0`—contained malicious installation behavior. The patched versions were `0.7.30`, `0.8.1`, and `1.0.1`.

The incident is a strong Recoil seed because the interesting question is not simply whether the package was malicious. The interesting question is:

> Which applications actually resolved the compromised versions, during which exposure window, through which direct or transitive path, and what is the smallest safe containment plan?

Recoil never downloads or executes the malicious package. It uses package metadata, advisory records, lockfiles, release timestamps, and public incident evidence only.

## Demo prompt

```text
Investigate the ua-parser-js account hijack.

Target package: ua-parser-js
Compromised versions: 0.7.29, 0.8.0, 1.0.0
Known fixes: 0.7.30, 0.8.1, 1.0.1
Demo application: fixture/storefront-api
```

## The graph question

```text
Given a repository whose manifest allows ua-parser-js ^0.7.28:

1. What version did its lockfile resolve?
2. Was that version inside the malicious release window?
3. Which deployment events occurred after resolution?
4. Which services were reachable through the dependency path?
5. Which upgrade, pin, or quarantine removes the most exposure?
```

## Evidence lanes

### Registry lane

Fetch version metadata, package manifests, dependency ranges, release timestamps, deprecation markers, and maintainers from the npm registry API.

### Advisory lane

Fetch CVE/GHSA/OSV records, affected ranges, fixed versions, severity, and references from OSV and public advisory databases.

### Incident lane

Collect the public incident timeline from the maintainer issue, CERT-EU, CISA references, and technical analyses. Extract claims with source URLs and quotes, but do not treat a narrative page as dependency ground truth.

### Repository lane

Read public `package.json`, `package-lock.json`, `npm-shrinkwrap.json`, `yarn.lock`, or equivalent manifests. Resolve the exact package version without installing dependencies.

### Simulation lane

Generate clearly labeled fixture deployment records for the demo application. These records demonstrate temporal exposure without pretending to be customer telemetry.

## The final report

The final report should say something like:

```text
INCIDENT: ua-parser-js account hijack

Observed:
  3 malicious versions published
  3 patched versions identified
  1 fixture repository resolved ^0.7.28 to 0.7.29

Modeled exposure:
  2 deployment events occurred during the malicious window
  3 downstream services reachable through the lockfile path

Recommended containment:
  upgrade to 0.7.30+
  regenerate the lockfile
  rotate credentials for affected build environments

Confidence:
  package/version relationship: confirmed
  deployment exposure: synthetic fixture
  credential impact: unknown
```

## Why this is better than the original fictional seed

- It has a real, documented incident timeline.
- It has precise malicious and fixed versions.
- It supports direct and transitive dependency questions.
- It has maintainer/account-takeover relationships.
- It supports OSV/GitHub advisory evaluation.
- It creates a compelling attack-and-defense story without executing malware.

## Sources

- [CERT-EU security advisory](https://cert.europa.eu/publications/security-advisories/2021-057/)
- [Mandiant analysis](https://cloud.google.com/blog/topics/threat-intelligence/supply-chain-node-js/)
- [CVE-2021-4229 advisory summary](https://advisories.gitlab.com/pkg/npm/ua-parser-js/CVE-2021-4229/)
- [ua-parser-js npm package](https://www.npmjs.com/package/ua-parser-js)
