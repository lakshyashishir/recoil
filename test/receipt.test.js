import test from 'node:test'
import assert from 'node:assert/strict'
import { buildEvidenceReceipt } from '../src/core/receipt.js'

test('evidence receipt is portable, source-cited, and integrity-addressed', () => {
  const report = {
    query: 'GHSA-test https://github.com/example/app',
    generatedAt: '2026-08-19T00:00:00.000Z',
    advisory: { id: 'GHSA-test', published: '2026-01-01T00:00:00.000Z', sourceUrl: 'https://osv.dev/vulnerability/GHSA-test' },
    repositories: [{
      repository: 'example/app', repositoryUrl: 'https://github.com/example/app', packageName: 'minimist', resolvedVersion: '1.2.5',
      resolvedVersions: ['1.2.5'],
      verdict: 'REACHED', path: ['GHSA-test', 'minimist@1.2.5', 'example/app', 'src/cli.js'],
      imports: [{ path: 'src/cli.js', line: 1, specifier: 'minimist', packageName: 'minimist', sourceUrl: 'https://github.com/example/app/blob/HEAD/src/cli.js' }],
      advisoryScope: { status: 'VALIDATED_SYMBOL', symbols: [{ name: 'parseArgs', path: 'src/cli.js', line: 4 }] },
      evidenceSources: ['https://github.com/example/app/blob/HEAD/package-lock.json'], sourceSampleSize: 3,
      proof: [
        { kind: 'advisory', label: 'GHSA-test', status: 'observed', source: 'https://osv.dev/vulnerability/GHSA-test', detail: 'Published 2026-01-01' },
        { kind: 'resolution', label: 'minimist@1.2.5', status: 'observed', source: 'https://github.com/example/app/blob/HEAD/package-lock.json', detail: 'Declared ^1.2.0' },
        { kind: 'repository', label: 'example/app', status: 'observed', source: 'https://github.com/example/app', detail: 'Repository history was collected' },
        { kind: 'import', label: 'src/cli.js:1', status: 'observed', source: 'https://github.com/example/app/blob/HEAD/src/cli.js', detail: 'Imports minimist' },
        { kind: 'symbol', label: 'parseArgs · src/cli.js:4', status: 'validated', source: 'https://github.com/example/app/blob/HEAD/src/cli.js', detail: 'Advisory scope matched an indexed symbol in an importing file' },
        { kind: 'temporal', label: 'First observed 2025-12-31', status: 'observed', source: 'https://github.com/example/app/commits/HEAD/package-lock.json', detail: '1 days before advisory publication' },
      ],
    }],
    challenge: [{ repository: 'example/app', status: 'FIX_SURVIVES', proposedVersion: '1.2.6' }],
    evidenceQuality: { status: 'complete', readyForRecording: true, reason: 'All requested public sources completed.' },
    graph: { nodes: [{ id: 'repo:example/app', label: 'example/app', type: 'repository' }], edges: [] },
    sources: ['https://osv.dev/vulnerability/GHSA-test'],
    limits: ['sampled source only'],
    rewind: {
      asOf: '2026-08-19T00:00:00.000Z', beforeAdvisory: '2025-12-31T00:00:00.000Z',
      memory: {
        status: 'recalled', datedChunkCount: 2, relatedCaseCount: 1, priorScenarioIds: ['prior-case'], sourceUrls: [],
        graphContext: { queryPathCount: 1, chunkRelationCount: 0, tripletCount: 1, triplets: [{ source: 'advisory', predicate: 'AFFECTS', target: 'minimist', origin: 'byog' }] },
      },
    },
  }
  const receipt = buildEvidenceReceipt({ scenarioId: 'case-1', report, hydra: { status: 'persisted', memoryCount: 4, result: { indexingStatus: 'completed' }, recall: { datedChunkCount: 3, relatedCaseCount: 1 } } })
  assert.equal(receipt.schema, 'recoil.evidence-receipt/v1')
  assert.equal(receipt.scenarioId, 'case-1')
  assert.equal(receipt.repositories[0].verdict, 'REACHED')
  assert.equal(receipt.repositories[0].imports[0].sourceUrl, 'https://github.com/example/app/blob/HEAD/src/cli.js')
  assert.equal(receipt.repositories[0].imports[0].packageName, 'minimist')
  assert.equal(receipt.repositories[0].advisoryScope.status, 'VALIDATED_SYMBOL')
  assert.equal(receipt.repositories[0].proof.length, 6)
  assert.equal(receipt.repositories[0].proof.find((step) => step.kind === 'import').source, 'https://github.com/example/app/blob/HEAD/src/cli.js')
  assert.equal(receipt.hydra.memoryCount, 4)
  assert.equal(receipt.hydra.error, null)
  assert.equal(receipt.hydra.indexingStatus, 'completed')
  assert.deepEqual(receipt.hydra.graphContext.triplets[0], { source: 'advisory', predicate: 'AFFECTS', target: 'minimist', origin: 'byog' })
  assert.equal('chunks' in receipt.hydra, false)
  assert.equal(receipt.integrity.algorithm, 'SHA-256')
  assert.match(receipt.integrity.value, /^[a-f0-9]{64}$/)
  assert.equal(receipt.execution.executedRepositoryCode, false)
  assert.equal(receipt.evidenceQuality.readyForRecording, true)
  assert.equal(receipt.temporal.memory.status, 'recalled')
  assert.equal(receipt.temporal.memory.datedChunkCount, 2)
})

test('missing report does not produce a misleading receipt', () => {
  assert.equal(buildEvidenceReceipt({ scenarioId: 'empty' }), null)
})
