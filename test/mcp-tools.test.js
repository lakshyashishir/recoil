import test from 'node:test'
import assert from 'node:assert/strict'
import { getOrCreate } from '../server/index.js'
import {
  caseSummary,
  compareHistory,
  exportHandoff,
  inspectGraph,
  listCases,
  reachedPaths,
  verifiedFixPlan,
} from '../mcp/tools.js'

function completedMcpCase(id) {
  const record = getOrCreate(id)
  record.query = 'GHSA-test https://github.com/example/app'
  record.investigation = {
    status: 'complete',
    completedAt: '2026-08-21T00:00:00.000Z',
    hydra: {
      status: 'persisted',
      memoryCount: 4,
      recall: { status: 'recalled', datedChunkCount: 2, relatedCases: [{ scenarioId: 'prior-case', validFrom: '2026-08-01T00:00:00.000Z' }] },
      graphVerification: { status: 'verified', tripletCount: 3, memoryCount: 2 },
    },
    report: {
      query: record.query,
      mode: 'advisory',
      generatedAt: '2026-08-21T00:00:00.000Z',
      package: 'minimist',
      advisory: { id: 'GHSA-test', sourceUrl: 'https://osv.dev/vulnerability/GHSA-test' },
      summary: { reached: 1, declaredOnly: 0, notAffected: 0, unknown: 0, exposureDays: 12 },
      repositories: [{
        repository: 'https://github.com/example/app',
        repositoryUrl: 'https://github.com/example/app',
        advisoryId: 'GHSA-test',
        packageName: 'minimist',
        resolvedVersion: '1.2.5',
        verdict: 'REACHED',
        reason: 'A sampled source file imports the affected package.',
        path: ['GHSA-test', 'minimist@1.2.5', 'example/app', 'src/cli.js:4'],
        imports: [{ path: 'src/cli.js', line: 4, snippet: "import minimist from 'minimist'", sourceUrl: 'https://github.com/example/app/blob/main/src/cli.js#L4', owners: ['@security'] }],
        codeOwners: ['@security'],
        pathObservation: { observedAt: '2026-01-01T00:00:00.000Z', commit: 'abc123', author: 'Example', message: 'add cli', sourceUrl: 'https://github.com/example/app/commit/abc123', caveat: 'Lockfile path first observed.' },
        evidenceSources: ['https://github.com/example/app/blob/main/package-lock.json'],
      }],
      challenge: [{ repository: 'https://github.com/example/app', packageName: 'minimist', status: 'FIX_SURVIVES', proposedVersion: '1.2.6', detail: 'The fixed version closes the affected range.' }],
      smallestFixSet: { items: [{ packageName: 'minimist', targetVersion: '1.2.6', closesFindings: 1, repositories: ['https://github.com/example/app'] }] },
      graph: {
        nodes: [{ id: 'advisory:GHSA-test', type: 'advisory', label: 'GHSA-test' }, { id: 'repository:example/app', type: 'repository', label: 'example/app' }],
        edges: [{ from: 'advisory:GHSA-test', to: 'repository:example/app', predicate: 'REACHES' }],
      },
      rewind: {
        beforeAdvisory: '2025-12-31T00:00:00.000Z',
        currentAsOf: '2026-08-21T00:00:00.000Z',
        graph: { nodes: [{ id: 'advisory:GHSA-test', type: 'advisory', label: 'GHSA-test' }], edges: [] },
        memory: { status: 'recalled', datedChunkCount: 2, relatedCases: [{ scenarioId: 'prior-case', validFrom: '2026-08-01T00:00:00.000Z' }] },
      },
      sources: ['https://osv.dev/vulnerability/GHSA-test'],
      limits: ['Sampled public source only.'],
    },
  }
  return record
}

test('MCP tools expose the same completed proof contract as the UI and CLI', () => {
  const id = `mcp-test-${Date.now()}`
  completedMcpCase(id)

  const summary = caseSummary(id)
  assert.equal(summary.query, 'GHSA-test https://github.com/example/app')
  assert.equal(summary.summary.reached, 1)
  assert.equal(summary.hydra.graphRelations, 3)

  const paths = reachedPaths(id)
  assert.equal(paths.count, 1)
  assert.equal(paths.paths[0].importSites[0].line, 4)
  assert.deepEqual(paths.paths[0].owners, ['@security'])
  assert.equal(paths.paths[0].firstObserved.commit, 'abc123')

  const fixes = verifiedFixPlan(id)
  assert.equal(fixes.verified, 1)
  assert.equal(fixes.fixes[0].targetVersion, '1.2.6')

  const history = compareHistory(id)
  assert.deepEqual(history.graphDelta.addedNodes, ['repository:example/app'])
  assert.equal(history.graphDelta.addedEdges.length, 1)
  assert.equal(history.datedFacts, 2)

  const graph = inspectGraph(id)
  assert.equal(graph.nodeCount, 2)
  assert.equal(graph.hydraVerification.status, 'verified')

  const brief = exportHandoff(id, 'brief')
  assert.match(brief.artifact, /# Recoil evidence brief/)
  const receipt = exportHandoff(id, 'receipt')
  assert.equal(receipt.artifact.scenarioId, id)
  assert.match(receipt.artifact.integrity.value, /^[a-f0-9]{64}$/)

  assert.ok(listCases().cases.some((item) => item.caseId === id))
})

test('MCP read tools refuse unknown or incomplete cases', () => {
  assert.throws(() => caseSummary('does-not-exist'), /Unknown Recoil case/)
  const id = `mcp-incomplete-${Date.now()}`
  getOrCreate(id).investigation = { status: 'running' }
  assert.equal(caseSummary(id).status, 'running')
  assert.equal(caseSummary(id).summary, null)
  assert.throws(() => reachedPaths(id), /is running/)
})
