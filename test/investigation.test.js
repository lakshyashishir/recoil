import test from 'node:test'
import assert from 'node:assert/strict'
import { attachHydraRewind, buildInvestigationReport } from '../src/core/investigation.js'

const baseEvidence = {
    status: 'completed',
  query: 'GHSA-test',
  package: 'minimist',
  target: { advisoryId: 'GHSA-test' },
  advisory: {
    id: 'GHSA-test',
    published: '2022-03-18T00:01:09Z',
    affected: [{ package: { name: 'minimist' }, ranges: [{ events: [{ introduced: '0' }, { fixed: '1.2.6' }] }] }],
    references: [],
    sourceUrl: 'https://osv.dev/vulnerability/GHSA-test',
  },
  findings: [
    {
      repository: 'example/reached', repositoryUrl: 'https://github.com/example/reached', packageName: 'minimist', advisoryId: 'GHSA-test', verdict: 'REACHED', reason: 'imported', resolvedVersion: '1.2.5', declaredRange: '^1.2.0', imports: [{ path: 'src/cli.js', line: 1, sourceUrl: 'https://github.com/example/reached/blob/HEAD/src/cli.js' }], path: ['GHSA-test', 'minimist@1.2.5', 'example/reached', 'package-lock.json', 'src/cli.js'], fixedVersions: ['1.2.6'], targetVersion: '1.2.6', rangeAllowsFix: true, allowedVersion: '1.2.6', sourceSampleSize: 4, sourceBound: 'No import found in 4 sampled source files', pathObservedAt: '2021-01-01T00:00:00Z', evidenceSources: ['https://github.com/example/reached/blob/HEAD/package-lock.json'],
    },
    {
      repository: 'example/declared', repositoryUrl: 'https://github.com/example/declared', packageName: 'minimist', advisoryId: 'GHSA-test', verdict: 'DECLARED_ONLY', reason: 'not imported', resolvedVersion: '1.2.5', declaredRange: '1.2.5', imports: [], path: ['GHSA-test', 'minimist@1.2.5', 'example/declared', 'package-lock.json'], fixedVersions: ['1.2.6'], targetVersion: '1.2.6', rangeAllowsFix: false, allowedVersion: null, sourceSampleSize: 3, sourceBound: 'No import found in 3 sampled source files', pathObservedAt: '2021-01-01T00:00:00Z', evidenceSources: [],
    },
    {
      repository: 'example/fixed', repositoryUrl: 'https://github.com/example/fixed', packageName: 'minimist', advisoryId: 'GHSA-test', verdict: 'NOT_AFFECTED', reason: 'fixed', resolvedVersion: '1.2.6', declaredRange: '^1.2.0', imports: [], path: ['GHSA-test', 'minimist@1.2.6', 'example/fixed', 'package-lock.json'], fixedVersions: ['1.2.6'], targetVersion: '1.2.6', rangeAllowsFix: true, allowedVersion: '1.2.6', sourceSampleSize: 2, sourceBound: 'No import found in 2 sampled source files', pathObservedAt: '2022-01-01T00:00:00Z', evidenceSources: [],
    },
  ],
  graph: { nodes: [], edges: [] },
  sources: ['https://osv.dev/vulnerability/GHSA-test'],
  temporal: { advisoryPublishedAt: '2022-03-18T00:01:09Z', collectedAt: '2022-04-01T00:00:00Z' },
}

test('investigation report preserves the three-way repository contrast and fix challenge', () => {
  const report = buildInvestigationReport(baseEvidence)

  assert.deepEqual(report.summary, {
    totalRepositories: 3,
    reached: 1,
    declaredOnly: 1,
    notAffected: 1,
    unknown: 0,
    fixSurvives: 1,
    alreadySafe: 1,
    residualPaths: 0,
    exposureDays: 441,
  })
  assert.equal(report.challenge.find((item) => item.repository === 'example/reached').status, 'FIX_SURVIVES')
  assert.equal(report.challenge.find((item) => item.repository === 'example/declared').status, 'NO_REACHABLE_PATH')
  assert.equal(report.challenge.find((item) => item.repository === 'example/fixed').status, 'ALREADY_SAFE')
  assert.equal(report.rewind.currentAsOf, '2022-04-01T00:00:00.000Z')
  assert.equal(report.evidenceQuality.status, 'complete')
  assert.equal(report.evidenceQuality.readyForRecording, true)
  assert.deepEqual(report.repositories[0].proof.slice(0, 3).map((step) => step.kind), ['advisory', 'resolution', 'repository'])
  assert.equal(report.repositories[0].proof.find((step) => step.kind === 'import').status, 'observed')
  assert.equal(report.repositories[1].proof.find((step) => step.kind === 'import').status, 'not-observed')
})

test('HydraDB rewind context is summarized without replacing local verdicts', () => {
  const report = buildInvestigationReport(baseEvidence)
  const attached = attachHydraRewind(report, {
    status: 'recalled',
    asOf: '2022-03-17T00:00:00.000Z',
    datedChunkCount: 3,
    priorScenarioIds: ['prior-case'],
    sources: ['https://osv.dev/vulnerability/GHSA-test'],
    graphContext: { query_paths: [{ triplets: [{ source: { name: 'advisory' }, relation: { canonical_predicate: 'AFFECTS', origin: 'byog' }, target: { name: 'minimist' } }] }] },
    chunks: [{ text: 'raw chunk must not be copied' }],
  })
  assert.equal(attached.repositories[0].verdict, 'REACHED')
  assert.deepEqual(attached.rewind.memory, {
    status: 'recalled',
    asOf: '2022-03-17T00:00:00.000Z',
    datedChunkCount: 3,
    relatedCaseCount: 1,
    priorScenarioIds: ['prior-case'],
    sourceUrls: ['https://osv.dev/vulnerability/GHSA-test'],
    graphContext: { queryPathCount: 1, chunkRelationCount: 0, tripletCount: 1, triplets: [{ source: 'advisory', predicate: 'AFFECTS', target: 'minimist', origin: 'byog' }] },
    reason: null,
  })
  assert.equal('chunks' in attached.rewind.memory, false)
})

test('HydraDB top-level graph triplets survive rewind normalization', () => {
  const report = buildInvestigationReport(baseEvidence)
  const attached = attachHydraRewind(report, {
    status: 'recalled',
    asOf: '2022-03-17T00:00:00.000Z',
    graphContext: { triplets: [{ source: 'advisory', predicate: 'AFFECTS', target: 'minimist', origin: 'byog' }] },
  })
  assert.deepEqual(attached.rewind.memory.graphContext, {
    queryPathCount: 0,
    chunkRelationCount: 0,
    tripletCount: 1,
    triplets: [{ source: 'advisory', predicate: 'AFFECTS', target: 'minimist', origin: 'byog' }],
  })
})

test('rewind refuses to claim a path before its evidence existed', () => {
  const report = buildInvestigationReport(baseEvidence, { asOf: '2020-01-01T00:00:00Z' })
  assert.equal(report.rewind.advisoryPublic, false)
  assert.equal(report.rewind.findings[0].verdict, 'NOT_YET_OBSERVED')
})
