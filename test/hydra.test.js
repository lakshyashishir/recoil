import test from 'node:test'
import assert from 'node:assert/strict'
import { buildInvestigationMemories, persistInvestigation, priorScenarioIds, recallTemporal } from '../server/hydra.js'

test('HydraDB recall distinguishes prior cases from the current case', () => {
  const chunks = [
    { additional_metadata: { recoil_scenario_id: 'current' } },
    { additional_metadata: { recoil_scenario_id: 'prior-a' } },
    { metadata: { additionalMetadata: { recoil_scenario_id: 'prior-b' } } },
    { additional_metadata: { recoil_scenario_id: 'prior-a' } },
  ]
  assert.deepEqual(priorScenarioIds(chunks, 'current'), ['prior-a', 'prior-b'])
})

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
  assert.equal(graphMemory._recoilGraphPayload.entities.node_0.name, 'GHSA-test')
  assert.equal(graphMemory._recoilGraphPayload.relations[0].predicate, 'CONNECTED_TO')
  assert.equal(memories.every((memory) => memory.metadata.app === 'recoil'), true)
  assert.equal(memories.every((memory) => memory.additional_metadata.app === 'recoil'), true)
})

test('HydraDB adapter persists memories and filters temporal recall locally', async () => {
  const previousFetch = globalThis.fetch
  const previousKey = process.env.HYDRA_DB_API_KEY
  const previousDatabase = process.env.HYDRADB_DATABASE_ID
  const previousCollection = process.env.HYDRADB_COLLECTION_ID
  const requests = []
  process.env.HYDRA_DB_API_KEY = 'test-key'
  process.env.HYDRADB_DATABASE_ID = 'test-database'
  process.env.HYDRADB_COLLECTION_ID = 'test-collection'
  globalThis.fetch = async (input, options = {}) => {
    const url = String(input)
    requests.push({ url, options })
    if (url.endsWith('/context/ingest')) {
      const memories = JSON.parse(await options.body.get('memories'))
      assert.equal(options.body.get('database'), 'test-database')
      assert.equal(options.body.get('collection'), 'test-collection')
      assert.equal(options.headers['API-Version'], '2')
      assert.equal(memories.length, 1)
      assert.equal(memories[0].additional_metadata.app, 'recoil')
      assert.equal('_recoilGraphPayload' in memories[0], false)
      const graphPayload = options.body.get('graph_payload')
      if (graphPayload) {
        const parsed = JSON.parse(graphPayload)
        assert.equal(Object.keys(parsed).length, 1)
        assert.ok(Object.values(parsed).every((graph) => Array.isArray(graph.relations) && graph.entities))
        assert.deepEqual(Object.values(parsed)[0].relations.map((relation) => relation.predicate), ['AFFECTS', 'RESOLVED_IN'])
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({ data: { inner: { results: [{ id: memories[0].id, status: 'completed' }] } } }),
      }
    }
    if (url.endsWith('/query')) {
      const request = JSON.parse(options.body)
      assert.match(request.query, /as of 2023-01-01T00:00:00\.000Z/)
      assert.equal(request.database, 'test-database')
      return {
        ok: true,
        status: 200,
        json: async () => ({ data: { inner: { chunks: [
          { additional_metadata: { app: 'recoil', recoil_scenario_id: 'prior-case', valid_from: '2022-01-01T00:00:00Z' } },
          { additional_metadata: { app: 'recoil', recoil_scenario_id: 'future-case', valid_from: '2024-01-01T00:00:00Z' } },
        ] } } }),
      }
    }
    throw new Error(`unexpected HydraDB URL: ${url}`)
  }
  try {
    const ingestion = {
      scenarioId: 'current-case',
      package: 'minimist',
      sources: ['https://osv.dev/vulnerability/GHSA-test'],
      graph: {
        nodes: [
          { id: 'advisory:GHSA-test', label: 'GHSA-test', type: 'advisory' },
          { id: 'package:minimist@1.2.5', label: 'minimist@1.2.5', type: 'package' },
          { id: 'repo:example/app', label: 'example/app', type: 'repository' },
        ],
        edges: [
          ['advisory:GHSA-test', 'package:minimist@1.2.5'],
          ['package:minimist@1.2.5', 'repo:example/app'],
        ],
      },
    }
    const report = {
      advisory: { id: 'GHSA-test', published: '2022-03-18T00:00:00Z', fixedVersions: ['1.2.6'], sourceUrl: 'https://osv.dev/vulnerability/GHSA-test' },
      repositories: [],
      challenge: [],
    }
    const persisted = await persistInvestigation(ingestion, report)
    assert.equal(persisted.status, 'persisted')
    assert.ok(persisted.memoryCount > 0)
    const recalled = await recallTemporal('minimist', '2023-01-01T00:00:00.000Z', undefined, { excludeScenarioId: 'current-case' })
    assert.equal(recalled.datedChunkCount, 1)
    assert.deepEqual(recalled.priorScenarioIds, ['prior-case'])
    assert.equal(requests.filter((request) => request.url.endsWith('/context/ingest')).length, persisted.memoryCount)
    assert.equal(requests.filter((request) => request.url.endsWith('/query')).length, 1)
  } finally {
    globalThis.fetch = previousFetch
    if (previousKey === undefined) delete process.env.HYDRA_DB_API_KEY
    else process.env.HYDRA_DB_API_KEY = previousKey
    if (previousDatabase === undefined) delete process.env.HYDRADB_DATABASE_ID
    else process.env.HYDRADB_DATABASE_ID = previousDatabase
    if (previousCollection === undefined) delete process.env.HYDRADB_COLLECTION_ID
    else process.env.HYDRADB_COLLECTION_ID = previousCollection
  }
})
