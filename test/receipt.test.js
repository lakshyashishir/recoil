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
      verdict: 'REACHED', path: ['GHSA-test', 'minimist@1.2.5', 'example/app', 'src/cli.js'],
      imports: [{ path: 'src/cli.js', line: 1, specifier: 'minimist', sourceUrl: 'https://github.com/example/app/blob/HEAD/src/cli.js' }],
      evidenceSources: ['https://github.com/example/app/blob/HEAD/package-lock.json'], sourceSampleSize: 3,
    }],
    challenge: [{ repository: 'example/app', status: 'FIX_SURVIVES', proposedVersion: '1.2.6' }],
    graph: { nodes: [{ id: 'repo:example/app', label: 'example/app', type: 'repository' }], edges: [] },
    sources: ['https://osv.dev/vulnerability/GHSA-test'],
    limits: ['sampled source only'],
    rewind: { asOf: '2026-08-19T00:00:00.000Z', beforeAdvisory: '2025-12-31T00:00:00.000Z' },
  }
  const receipt = buildEvidenceReceipt({ scenarioId: 'case-1', report, hydra: { status: 'persisted', memoryCount: 4, recall: { datedChunkCount: 3, relatedCaseCount: 1 } } })
  assert.equal(receipt.schema, 'recoil.evidence-receipt/v1')
  assert.equal(receipt.scenarioId, 'case-1')
  assert.equal(receipt.repositories[0].verdict, 'REACHED')
  assert.equal(receipt.repositories[0].imports[0].sourceUrl, 'https://github.com/example/app/blob/HEAD/src/cli.js')
  assert.equal(receipt.hydra.memoryCount, 4)
  assert.equal('chunks' in receipt.hydra, false)
  assert.equal(receipt.integrity.algorithm, 'SHA-256')
  assert.match(receipt.integrity.value, /^[a-f0-9]{64}$/)
  assert.equal(receipt.execution.executedRepositoryCode, false)
})

test('missing report does not produce a misleading receipt', () => {
  assert.equal(buildEvidenceReceipt({ scenarioId: 'empty' }), null)
})

