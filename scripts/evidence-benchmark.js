import assert from 'node:assert/strict'
import { buildObservedGraph, classifyRepository } from '../src/core/evidence.js'
import { buildInvestigationReport } from '../src/core/investigation.js'

const advisory = {
  id: 'GHSA-benchmark-1234-5678',
  published: '2022-03-18T00:01:09Z',
  affected: [{ package: { ecosystem: 'npm', name: 'minimist' }, ranges: [{ events: [{ introduced: '0' }, { fixed: '1.2.6' }] }] }],
  sourceUrl: 'https://osv.dev/vulnerability/GHSA-benchmark-1234-5678',
}

function repository(name, { version, imports, sourceStatus = 'collected', firstCommitAt = '2021-01-01T00:00:00Z', range = '^1.2.0' }) {
  return {
    repository: `benchmark/${name}`,
    repositoryUrl: `https://github.com/benchmark/${name}`,
    sourceUrl: `https://github.com/benchmark/${name}/blob/HEAD/package.json`,
    sources: [{ path: 'package-lock.json', url: `https://github.com/benchmark/${name}/blob/HEAD/package-lock.json` }],
    manifest: {
      dependencies: { minimist: range },
      resolved: { minimist: version },
      lockfile: 'package-lock.json',
      temporal: { pathObservedAt: firstCommitAt, sourceUrl: `https://github.com/benchmark/${name}/commits/main/package-lock.json` },
      collection: { sourceFiles: { status: sourceStatus, sampled: imports.length ? 2 : 3, requested: 3 } },
      codeGraph: {
        fileCount: imports.length ? 2 : 3,
        externalImports: imports.map((path) => ({ packageName: 'minimist', path, line: 1, sourceUrl: `https://github.com/benchmark/${name}/blob/HEAD/${path}` })),
      },
    },
  }
}

const cases = [
  repository('reached', { version: '1.2.5', imports: ['src/cli.js'] }),
  repository('declared-only', { version: '1.2.5', imports: [] }),
  repository('not-affected', { version: '1.2.6', imports: [] }),
  repository('incomplete', { version: '1.2.5', imports: [], sourceStatus: 'partial' }),
]
const findings = cases.map((item) => classifyRepository({ repository: item, packageName: 'minimist', advisory, advisoryId: advisory.id }))
const graph = buildObservedGraph({ advisoryId: advisory.id, packageName: 'minimist', repositoryFindings: findings })
const report = buildInvestigationReport({
  status: 'completed',
  query: 'benchmark',
  package: 'minimist',
  advisory,
  findings,
  graph,
  sources: [advisory.sourceUrl],
  temporal: { advisoryPublishedAt: advisory.published, collectedAt: '2022-04-01T00:00:00Z' },
})

assert.deepEqual(findings.map((finding) => finding.verdict), ['REACHED', 'DECLARED_ONLY', 'NOT_AFFECTED', 'UNKNOWN'])
assert.equal(report.summary.reached, 1)
assert.equal(report.summary.declaredOnly, 1)
assert.equal(report.summary.notAffected, 1)
assert.equal(report.summary.unknown, 1)
assert.equal(report.summary.fixSurvives, 1)
assert.equal(report.summary.alreadySafe, 1)
assert.equal(report.challenge.find((item) => item.repository === 'benchmark/reached').status, 'FIX_SURVIVES')
assert.equal(report.challenge.find((item) => item.repository === 'benchmark/not-affected').status, 'ALREADY_SAFE')
assert.equal(buildInvestigationReport({
  ...report,
  findings,
  advisory,
  temporal: { advisoryPublishedAt: advisory.published, collectedAt: '2022-04-01T00:00:00Z' },
}, { asOf: '2020-01-01T00:00:00Z' }).rewind.findings[0].verdict, 'NOT_YET_OBSERVED')
assert.equal(graph.nodes.some((node) => node.label === 'customer database'), false)

console.log(JSON.stringify({
  name: 'recoil evidence benchmark',
  policy: 'source-backed reachability + semver fix proof + temporal rewind',
  cases: findings.map((finding) => ({ repository: finding.repository, verdict: finding.verdict, sourceSampleSize: finding.sourceSampleSize })),
  report: {
    reached: report.summary.reached,
    declaredOnly: report.summary.declaredOnly,
    notAffected: report.summary.notAffected,
    unknown: report.summary.unknown,
    fixSurvives: report.summary.fixSurvives,
    alreadySafe: report.summary.alreadySafe,
    temporalRewind: true,
  },
  assertions: {
    outputsComputedFromInputs: true,
    fictionalDeploymentNodes: false,
    packageCodeExecuted: false,
  },
}, null, 2))
