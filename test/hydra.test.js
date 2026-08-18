import test from 'node:test'
import assert from 'node:assert/strict'
import { buildInvestigationMemories } from '../server/hydra.js'

test('HydraDB investigation memories preserve graph topology and temporal evidence', () => {
  const ingestion = {
    scenarioId: 'hydra-test',
    package: 'minimist',
    sources: ['https://osv.dev/vulnerability/GHSA-test'],
    graph: {
      nodes: [
        { id: 'advisory:GHSA-test', label: 'GHSA-test', type: 'advisory' },
        { id: 'repo:example/app', label: 'example/app', type: 'repository' },
      ],
      edges: [['advisory:GHSA-test', 'repo:example/app']],
    },
  }
  const report = {
    advisory: { id: 'GHSA-test', published: '2022-03-18T00:00:00Z', fixedVersions: ['1.2.6'], sourceUrl: 'https://osv.dev/vulnerability/GHSA-test' },
    repositories: [{
      repository: 'example/app',
      packageName: 'minimist',
      resolvedVersion: '1.2.5',
      declaredRange: '^1.2.0',
      verdict: 'REACHED',
      imports: [{ path: 'src/cli.js', line: 1 }],
      pathObservedAt: '2022-01-01T00:00:00Z',
      path: ['GHSA-test', 'minimist@1.2.5', 'example/app'],
      reason: 'imported',
      evidenceSources: ['https://github.com/example/app/blob/HEAD/src/cli.js'],
    }],
    challenge: [{ repository: 'example/app', status: 'FIX_SURVIVES', proposedVersion: '1.2.6', detail: 'fixed', residualPath: [] }],
  }
  const memories = buildInvestigationMemories(ingestion, report)
  assert.ok(memories.some((memory) => memory.additional_metadata.recoil_kind === 'observed_graph'))
  assert.ok(memories.some((memory) => memory.additional_metadata.recoil_kind === 'temporal_fact' && memory.additional_metadata.valid_from === '2022-01-01T00:00:00Z'))
  const graphMemory = memories.find((memory) => memory.additional_metadata.recoil_kind === 'observed_graph')
  assert.match(graphMemory.text, /advisory:GHSA-test → repo:example\/app/)
  assert.equal(memories.every((memory) => memory.metadata.app === 'recoil'), true)
  assert.equal(memories.every((memory) => memory.additional_metadata.app === 'recoil'), true)
})
