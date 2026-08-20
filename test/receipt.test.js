import test from 'node:test'
import assert from 'node:assert/strict'
import { buildEvidenceReceipt, verifyEvidenceReceipt } from '../src/core/receipt.js'

test('evidence receipt is portable, source-cited, and integrity-addressed', () => {
  const report = {
    query: 'GHSA-test https://github.com/example/app',
    generatedAt: '2026-08-19T00:00:00.000Z',
    advisory: { id: 'GHSA-test', published: '2026-01-01T00:00:00.000Z', sourceUrl: 'https://osv.dev/vulnerability/GHSA-test' },
    repositories: [{
      repository: 'example/app', repositoryUrl: 'https://github.com/example/app', packageName: 'minimist', resolvedVersion: '1.2.5',
      resolvedVersions: ['1.2.5'],
      dependencyPath: [
        { name: 'parent', version: '2.0.0', path: 'node_modules/parent', sourceUrl: 'https://github.com/example/app/blob/HEAD/package-lock.json' },
        { name: 'minimist', version: '1.2.5', path: 'node_modules/parent/node_modules/minimist', sourceUrl: 'https://github.com/example/app/blob/HEAD/package-lock.json' },
      ],
      verdict: 'REACHED', path: ['GHSA-test', 'minimist@1.2.5', 'example/app', 'src/cli.js'],
      imports: [{ path: 'src/cli.js', line: 1, specifier: 'minimist', packageName: 'minimist', sourceUrl: 'https://github.com/example/app/blob/HEAD/src/cli.js' }],
      sourceImpact: {
        bounded: true,
        sampledFileCount: 2,
        observedEdgeCount: 1,
        maxFiles: 12,
        maxDepth: 3,
        note: 'Bounded local-import cone over 2 sampled source files; not a runtime call graph.',
        entryFiles: [{ path: 'src/cli.js', line: 1, sourceUrl: 'https://github.com/example/app/blob/HEAD/src/cli.js' }],
        files: [
          { path: 'src/cli.js', language: 'javascript', depth: 0, role: 'importer', sourceUrl: 'https://github.com/example/app/blob/HEAD/src/cli.js' },
          { path: 'src/parse.js', language: 'javascript', depth: 1, role: 'local-import', sourceUrl: 'https://github.com/example/app/blob/HEAD/src/parse.js' },
        ],
        edges: [['src/cli.js', 'src/parse.js']],
      },
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
  assert.deepEqual(receipt.repositories[0].sourceImpact.edges, [['src/cli.js', 'src/parse.js']])
  assert.equal(receipt.repositories[0].sourceImpact.bounded, true)
  assert.deepEqual(receipt.repositories[0].dependencyPath.map((item) => item.name), ['parent', 'minimist'])
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
  assert.deepEqual(verifyEvidenceReceipt(receipt), {
    valid: true,
    expected: receipt.integrity.value,
    actual: receipt.integrity.value,
    reason: 'integrity verified',
  })

  const tampered = { ...receipt, query: `${receipt.query} changed` }
  assert.equal(verifyEvidenceReceipt(tampered).valid, false)
})

test('missing report does not produce a misleading receipt', () => {
  assert.equal(buildEvidenceReceipt({ scenarioId: 'empty' }), null)
})

test('receipt falls back to top-level HydraDB graph triplets when rewind summary is empty', () => {
  const report = {
    query: 'GHSA-test https://github.com/example/app',
    repositories: [],
    graph: { nodes: [], edges: [] },
    sources: [],
    rewind: { memory: { graphContext: { queryPathCount: 0, chunkRelationCount: 0, tripletCount: 0, triplets: [] } } },
  }
  const receipt = buildEvidenceReceipt({ report, hydra: { recall: { graphContext: { triplets: [{ source: { name: 'advisory' }, relation: { canonical_predicate: 'AFFECTS' }, target: { name: 'minimist' } }] } } } })
  assert.deepEqual(receipt.hydra.graphContext.triplets, [{ source: 'advisory', predicate: 'AFFECTS', target: 'minimist', origin: null }])
})

test('receipt prefers the current-case HydraDB graph proof over prior recall context', () => {
  const report = {
    query: 'GHSA-test https://github.com/example/app',
    repositories: [],
    graph: { nodes: [], edges: [] },
    sources: [],
    rewind: { memory: { graphContext: { triplets: [{ source: 'prior', predicate: 'RELATED_TO', target: 'case' }] } } },
  }
  const receipt = buildEvidenceReceipt({
    report,
    hydra: {
      status: 'persisted',
      graphVerification: {
        status: 'verified',
        scenarioId: 'case-1',
        memoryCount: 2,
        tripletCount: 1,
        graphContext: { triplets: [{ source: 'entry.js', predicate: 'IMPORTS', target: 'server.js' }] },
      },
      recall: { graphContext: { triplets: [{ source: 'old', predicate: 'RELATED_TO', target: 'case' }] } },
    },
  })
  assert.deepEqual(receipt.hydra.graphContext.triplets, [{ source: 'entry.js', predicate: 'IMPORTS', target: 'server.js', origin: null }])
  assert.equal(receipt.hydra.graphVerification.status, 'verified')
  assert.equal(receipt.hydra.graphVerification.scenarioId, 'case-1')
})

test('receipt verifier rejects unsupported or malformed artifacts', () => {
  assert.equal(verifyEvidenceReceipt(null).valid, false)
  assert.match(verifyEvidenceReceipt({ schema: 'other/v1' }).reason, /unsupported receipt schema/)
  assert.match(verifyEvidenceReceipt({ schema: 'recoil.evidence-receipt/v1', integrity: {} }).reason, /valid SHA-256/)
})
