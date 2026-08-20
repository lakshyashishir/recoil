import test from 'node:test'
import assert from 'node:assert/strict'
import { buildInvestigationMemories, persistInvestigation, priorScenarioIds, recallStoredGraph, recallTemporal, settleHydraIndexing, summarizeRelatedCases } from '../server/hydra.js'
import { summarizeGraphContext } from '../src/core/graph-context.js'

test('HydraDB recall distinguishes prior cases from the current case', () => {
  const chunks = [
    { additional_metadata: { recoil_scenario_id: 'current' } },
    { additional_metadata: { recoil_scenario_id: 'prior-a' } },
    { metadata: { additionalMetadata: { recoil_scenario_id: 'prior-b' } } },
    { additional_metadata: { recoil_scenario_id: 'prior-a' } },
  ]
  assert.deepEqual(priorScenarioIds(chunks, 'current'), ['prior-a', 'prior-b'])
})

test('HydraDB recall summarizes prior case metadata without exposing chunks', () => {
  const summaries = summarizeRelatedCases([
    { additional_metadata: { recoil_scenario_id: 'prior-b', recoil_kind: 'temporal_fact', recoil_repository: 'example/b', valid_from: '2024-02-01T00:00:00Z', source_urls: '["https://example.com/b"]' } },
    { additional_metadata: { recoil_scenario_id: 'prior-a', recoil_kind: 'observed_graph', recoil_repository: 'example/a', valid_from: '2023-01-01T00:00:00Z', source_urls: '["https://example.com/a"]' } },
    { additional_metadata: { recoil_scenario_id: 'prior-a', recoil_kind: 'temporal_fact', recoil_repository: 'example/a', valid_from: '2023-02-01T00:00:00Z', source_urls: '["https://example.com/a/path"]' } },
    { additional_metadata: { recoil_scenario_id: 'current', recoil_kind: 'temporal_fact', recoil_repository: 'example/current' } },
  ], 'current')
  assert.deepEqual(summaries, [
    { scenarioId: 'prior-a', kinds: ['observed_graph', 'temporal_fact'], repositories: ['example/a'], validFrom: '2023-01-01T00:00:00Z', sourceUrls: ['https://example.com/a', 'https://example.com/a/path'] },
    { scenarioId: 'prior-b', kinds: ['temporal_fact'], repositories: ['example/b'], validFrom: '2024-02-01T00:00:00Z', sourceUrls: ['https://example.com/b'] },
  ])
})

test('HydraDB current graph verification is scoped to the case metadata', async () => {
  const previousFetch = globalThis.fetch
  const previousKey = process.env.HYDRA_DB_API_KEY
  const previousDatabase = process.env.HYDRADB_DATABASE_ID
  process.env.HYDRA_DB_API_KEY = 'test-key'
  process.env.HYDRADB_DATABASE_ID = 'test-database'
  let requestBody
  globalThis.fetch = async (input, options = {}) => {
    assert.match(String(input), /\/query$/)
    requestBody = JSON.parse(options.body)
    return {
      ok: true,
      status: 200,
      json: async () => ({ data: { inner: {
        chunks: [{ id: 'graph-memory', additional_metadata: { app: 'recoil', recoil_scenario_id: 'current-case', recoil_kind: 'observed_graph' } }],
        graph_context: { query_paths: [{ triplets: [{ source: { name: 'entry.js' }, relation: { canonical_predicate: 'IMPORTS', origin: 'byog' }, target: { name: 'server.js' } }] }] },
      } } }),
    }
  }
  try {
    const result = await recallStoredGraph('current-case', 'minimist', {
      nodes: [{ id: 'entry', label: 'entry.js', type: 'code' }, { id: 'server', label: 'server.js', type: 'code' }],
      edges: [['entry', 'server']],
    })
    assert.equal(result.status, 'verified')
    assert.equal(result.memoryCount, 1)
    assert.equal(result.tripletCount, 1)
    assert.deepEqual(result.graphContext.triplets, [{ source: 'entry.js', predicate: 'IMPORTS', target: 'server.js', origin: 'byog' }])
    assert.deepEqual(requestBody.metadata_filters, { additional_metadata: { app: 'recoil', recoil_scenario_id: 'current-case' } })
    assert.match(requestBody.query, /current-case/)
  } finally {
    globalThis.fetch = previousFetch
    if (previousKey === undefined) delete process.env.HYDRA_DB_API_KEY
    else process.env.HYDRA_DB_API_KEY = previousKey
    if (previousDatabase === undefined) delete process.env.HYDRADB_DATABASE_ID
    else process.env.HYDRADB_DATABASE_ID = previousDatabase
  }
})

test('HydraDB graph summaries count unique relations when provider paths repeat them', () => {
  const summary = summarizeGraphContext({
    triplets: [
      { source: { name: 'entry.js' }, predicate: 'IMPORTS', target: { name: 'server.js' } },
      { source: { name: 'entry.js' }, predicate: 'IMPORTS', target: { name: 'server.js' } },
    ],
  })
  assert.equal(summary.tripletCount, 1)
  assert.equal(summary.triplets.length, 1)
})

test('HydraDB recall keeps the latest comparable repository snapshot', () => {
  const summaries = summarizeRelatedCases([
    { additional_metadata: { recoil_scenario_id: 'prior-old', recoil_kind: 'temporal_fact', recoil_repository: 'example/app', valid_from: '2023-01-01T00:00:00Z', recoil_observed_at: '2023-01-02T00:00:00Z', recoil_snapshot: JSON.stringify({ repository: 'example/app', packageName: 'minimist', resolvedVersion: '1.2.5', verdict: 'REACHED', importCount: 1 }) } },
    { additional_metadata: { recoil_scenario_id: 'prior-new', recoil_kind: 'temporal_fact', recoil_repository: 'example/app', valid_from: '2024-01-01T00:00:00Z', recoil_observed_at: '2024-01-02T00:00:00Z', recoil_snapshot: JSON.stringify({ repository: 'example/app', packageName: 'minimist', resolvedVersion: '1.2.6', verdict: 'NOT_AFFECTED', importCount: 0 }) } },
    { additional_metadata: { recoil_scenario_id: 'current', recoil_kind: 'temporal_fact', recoil_repository: 'example/app' } },
  ], 'current')
  assert.deepEqual(summaries.map(({ scenarioId, observedAt, snapshots }) => ({ scenarioId, observedAt, snapshots })), [
    {
      scenarioId: 'prior-new',
      observedAt: '2024-01-02T00:00:00Z',
      snapshots: [{ repository: 'example/app', packageName: 'minimist', resolvedVersion: '1.2.6', verdict: 'NOT_AFFECTED', importCount: 0, observedAt: '2024-01-02T00:00:00Z' }],
    },
    {
      scenarioId: 'prior-old',
      observedAt: '2023-01-02T00:00:00Z',
      snapshots: [{ repository: 'example/app', packageName: 'minimist', resolvedVersion: '1.2.5', verdict: 'REACHED', importCount: 1, observedAt: '2023-01-02T00:00:00Z' }],
    },
  ])
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
      dependencyPath: [
        { name: 'parent', version: '2.0.0' },
        { name: 'minimist', version: '1.2.5' },
      ],
      pathObservedAt: '2022-01-01T00:00:00Z',
      path: ['GHSA-test', 'minimist@1.2.5', 'example/app'],
      reason: 'imported',
      evidenceSources: ['https://github.com/example/app/blob/HEAD/src/cli.js'],
    }],
    challenge: [{ repository: 'example/app', status: 'FIX_SURVIVES', proposedVersion: '1.2.6', detail: 'fixed', residualPath: [] }],
    crossRepositoryCorrelations: [{
      packageName: 'minimist',
      version: '1.2.5',
      repositoryCount: 2,
      repositories: [{ repository: 'example/app', verdict: 'REACHED', pathObservedAt: '2022-01-01T00:00:00Z' }, { repository: 'example/other', verdict: 'DECLARED_ONLY', pathObservedAt: '2022-02-01T00:00:00Z' }],
      sourceUrls: ['https://github.com/example/app/blob/HEAD/package-lock.json'],
    }],
  }
  const memories = buildInvestigationMemories(ingestion, report)
  assert.ok(memories.some((memory) => memory.additional_metadata.recoil_kind === 'observed_graph'))
  assert.ok(memories.some((memory) => memory.additional_metadata.recoil_kind === 'temporal_fact' && memory.additional_metadata.valid_from === '2022-01-01T00:00:00Z'))
  const correlationMemory = memories.find((memory) => memory.additional_metadata.recoil_kind === 'cross_repository_correlation')
  assert.equal(correlationMemory.additional_metadata.valid_from, '2022-01-01T00:00:00Z')
  assert.match(correlationMemory.text, /minimist@1\.2\.5/)
  assert.deepEqual(correlationMemory._recoilGraphPayload.relations.map((relation) => relation.predicate), ['RESOLVED_IN', 'RESOLVED_IN'])
  assert.equal(Object.values(correlationMemory._recoilGraphPayload.entities).some((entity) => entity.name === 'example/other'), true)
  const graphMemory = memories.find((memory) => memory.additional_metadata.recoil_kind === 'observed_graph')
  assert.match(graphMemory.text, /advisory:GHSA-test → repo:example\/app/)
  assert.equal(graphMemory._recoilGraphPayload.entities.node_0.name, 'GHSA-test')
  assert.equal(graphMemory._recoilGraphPayload.relations[0].predicate, 'CONNECTED_TO')
  const reachabilityMemory = memories.find((memory) => memory.additional_metadata.recoil_kind === 'temporal_fact' && /Reachability fact/.test(memory.text))
  assert.match(reachabilityMemory.text, /parent@2\.0\.0 -> minimist@1\.2\.5/)
  assert.deepEqual(JSON.parse(reachabilityMemory.additional_metadata.recoil_snapshot), {
    repository: 'example/app',
    packageName: 'minimist',
    resolvedVersion: '1.2.5',
    verdict: 'REACHED',
    importCount: 1,
    declaredRange: '^1.2.0',
    fixStatus: 'FIX_SURVIVES',
    proposedVersion: '1.2.6',
  })
  const fixMemory = memories.find((memory) => memory.additional_metadata.recoil_kind === 'fix_proof')
  assert.equal(fixMemory.additional_metadata.valid_from, null)
  assert.equal(memories.every((memory) => memory.metadata.app === 'recoil'), true)
  assert.equal(memories.every((memory) => memory.additional_metadata.app === 'recoil'), true)
})

test('HydraDB graph payload preserves observed package dependency edges', () => {
  const memories = buildInvestigationMemories({
    scenarioId: 'dependency-graph-test',
    package: 'minimist',
    graph: {
      nodes: [
        { id: 'package:parent@2.0.0', label: 'parent@2.0.0', type: 'package' },
        { id: 'package:minimist@1.2.5', label: 'minimist@1.2.5', type: 'package' },
      ],
      edges: [['package:parent@2.0.0', 'package:minimist@1.2.5']],
    },
  }, { advisory: { id: 'GHSA-test' }, repositories: [], challenge: [] })
  const graphMemory = memories.find((memory) => memory.additional_metadata.recoil_kind === 'observed_graph')
  assert.equal(graphMemory._recoilGraphPayload.relations[0].predicate, 'DEPENDS_ON')
})

test('HydraDB graph payload preserves local source imports as typed edges', () => {
  const memories = buildInvestigationMemories({
    scenarioId: 'source-cone-graph-test',
    package: 'minimist',
    graph: {
      nodes: [
        { id: 'code:example/app:src/cli.js', label: 'src/cli.js', type: 'code' },
        { id: 'code:example/app:src/parse.js', label: 'src/parse.js', type: 'code', meta: { role: 'local-import', depth: 1 } },
      ],
      edges: [['code:example/app:src/cli.js', 'code:example/app:src/parse.js']],
    },
  }, { advisory: { id: 'GHSA-test' }, repositories: [], challenge: [] })
  const graphMemory = memories.find((memory) => memory.additional_metadata.recoil_kind === 'observed_graph')
  assert.equal(graphMemory._recoilGraphPayload.relations[0].predicate, 'IMPORTS')
  assert.match(graphMemory.text, /Local source edges mean resolved imports/)
})

test('HydraDB metadata keeps large source collections under the cloud limit', () => {
  const memories = buildInvestigationMemories({
    scenarioId: 'metadata-bound-test',
    package: 'minimist',
    sources: Array.from({ length: 80 }, (_, index) => `https://github.com/example/repository/blob/HEAD/source-${index}.js`),
    graph: { nodes: [{ id: 'advisory:GHSA-test', label: 'GHSA-test', type: 'advisory' }], edges: [] },
  }, { advisory: { id: 'GHSA-test', published: '2022-03-18T00:00:00Z' }, repositories: [], challenge: [] })
  assert.ok(memories.length > 0)
  assert.ok(memories.every((memory) => Buffer.byteLength(JSON.stringify(memory.additional_metadata)) <= 1024))
  const graphMemory = memories.find((memory) => memory.additional_metadata.recoil_kind === 'observed_graph')
  assert.equal(JSON.parse(graphMemory.additional_metadata.source_urls).length, 4)
})

test('HydraDB persistence skips incomplete reports unless explicitly enabled', async () => {
  const previousFetch = globalThis.fetch
  const previousKey = process.env.HYDRA_DB_API_KEY
  const previousDatabase = process.env.HYDRADB_DATABASE_ID
  const previousPartial = process.env.RECOIL_HYDRA_PERSIST_PARTIAL
  process.env.HYDRA_DB_API_KEY = 'test-key'
  process.env.HYDRADB_DATABASE_ID = 'test-database'
  delete process.env.RECOIL_HYDRA_PERSIST_PARTIAL
  globalThis.fetch = async () => { throw new Error('HydraDB must not be contacted for incomplete evidence') }
  try {
    const result = await persistInvestigation({ scenarioId: 'partial-case', package: 'minimist', graph: { nodes: [], edges: [] } }, {
      evidenceQuality: { readyForRecording: false, reason: 'one repository is unknown' },
      advisory: { id: 'GHSA-test' },
      repositories: [],
      challenge: [],
    })
    assert.equal(result.status, 'skipped')
    assert.match(result.reason, /deferred/)
  } finally {
    globalThis.fetch = previousFetch
    if (previousKey === undefined) delete process.env.HYDRA_DB_API_KEY
    else process.env.HYDRA_DB_API_KEY = previousKey
    if (previousDatabase === undefined) delete process.env.HYDRADB_DATABASE_ID
    else process.env.HYDRADB_DATABASE_ID = previousDatabase
    if (previousPartial === undefined) delete process.env.RECOIL_HYDRA_PERSIST_PARTIAL
    else process.env.RECOIL_HYDRA_PERSIST_PARTIAL = previousPartial
  }
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
      assert.ok(memories.length > 0)
      assert.equal(memories.every((memory) => memory.additional_metadata.app === 'recoil'), true)
      assert.equal(memories.some((memory) => '_recoilGraphPayload' in memory), false)
      const graphPayload = options.body.get('graph_payload')
      if (graphPayload) {
        const parsed = JSON.parse(graphPayload)
        assert.ok(Object.keys(parsed).length <= memories.length)
        assert.ok(Object.values(parsed).every((graph) => Array.isArray(graph.relations) && graph.entities))
        assert.ok(Object.values(parsed).some((graph) => graph.relations.map((relation) => relation.predicate).join(',') === 'AFFECTS,RESOLVED_IN'))
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({ data: { inner: { indexingPending: true, results: memories.map((memory) => ({ source_id: memory.id, status: 'completed' })) } } }),
      }
    }
    if (url.endsWith('/query')) {
      const request = JSON.parse(options.body)
      assert.match(request.query, /as of 2023-01-01T00:00:00\.000Z/)
      assert.equal(request.database, 'test-database')
      assert.equal(request.query_by, 'hybrid')
      assert.equal(request.max_results, 24)
      assert.equal(request.graph_context, true)
      assert.deepEqual(request.metadata_filters, { additional_metadata: { app: 'recoil' } })
      assert.equal('queryBy' in request, false)
      assert.equal('graphContext' in request, false)
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
    assert.equal(persisted.sourceIds.length, persisted.memoryCount)
    assert.equal(persisted.indexingPending, false)
    assert.equal(persisted.indexingError, null)
    const recalled = await recallTemporal('minimist', '2023-01-01T00:00:00.000Z', undefined, { excludeScenarioId: 'current-case' })
    assert.equal(recalled.datedChunkCount, 1)
    assert.deepEqual(recalled.priorScenarioIds, ['prior-case'])
    assert.deepEqual(recalled.relatedCases, [{ scenarioId: 'prior-case', kinds: [], repositories: [], validFrom: '2022-01-01T00:00:00Z', sourceUrls: [] }])
    assert.equal(requests.filter((request) => request.url.endsWith('/context/ingest')).length, 1)
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

test('HydraDB adapter waits for asynchronous graph indexing before recall', async () => {
  const previousFetch = globalThis.fetch
  const previousKey = process.env.HYDRA_DB_API_KEY
  const previousDatabase = process.env.HYDRADB_DATABASE_ID
  const previousPoll = process.env.HYDRADB_INDEX_POLL_MS
  const previousWait = process.env.HYDRADB_INDEX_WAIT_MS
  process.env.HYDRA_DB_API_KEY = 'test-key'
  process.env.HYDRADB_DATABASE_ID = 'test-database'
  process.env.HYDRADB_INDEX_POLL_MS = '0'
  process.env.HYDRADB_INDEX_WAIT_MS = '1000'
  let statusCalls = 0
  const memoryIds = []
  const urls = []
  globalThis.fetch = async (input, options = {}) => {
    const url = String(input)
    urls.push(url)
    if (url.endsWith('/context/ingest')) {
      const memories = JSON.parse(await options.body.get('memories'))
      memoryIds.push(...memories.map((memory) => memory.id))
      return {
        ok: true,
        status: 202,
        json: async () => ({ data: { inner: { results: memories.map((memory) => ({ id: memory.id, status: 'queued' })) } } }),
      }
    }
    if (url.includes('/context/status?')) {
      statusCalls += 1
      return {
        ok: true,
        status: 200,
        json: async () => ({ data: { inner: { statuses: memoryIds.map((id) => ({ source_id: id, indexing_status: statusCalls > 1 ? 'completed' : 'embedding' })) } } }),
      }
    }
    throw new Error(`unexpected HydraDB URL: ${url}`)
  }
  try {
    const persisted = await persistInvestigation({ scenarioId: 'async-case', package: 'minimist', graph: { nodes: [], edges: [] } }, {
      generatedAt: '2026-08-19T00:00:00.000Z',
      advisory: { id: 'GHSA-test', published: '2022-03-18T00:00:00Z', fixedVersions: [] },
      repositories: [],
      challenge: [],
    })
    assert.equal(persisted.status, 'persisted')
    assert.equal(statusCalls, 2)
    assert.ok(urls.some((url) => url.includes('ids=')))
  } finally {
    globalThis.fetch = previousFetch
    if (previousKey === undefined) delete process.env.HYDRA_DB_API_KEY
    else process.env.HYDRA_DB_API_KEY = previousKey
    if (previousDatabase === undefined) delete process.env.HYDRADB_DATABASE_ID
    else process.env.HYDRADB_DATABASE_ID = previousDatabase
    if (previousPoll === undefined) delete process.env.HYDRADB_INDEX_POLL_MS
    else process.env.HYDRADB_INDEX_POLL_MS = previousPoll
    if (previousWait === undefined) delete process.env.HYDRADB_INDEX_WAIT_MS
    else process.env.HYDRADB_INDEX_WAIT_MS = previousWait
  }
})

test('HydraDB recall retries an empty post-index result before declaring no history', async () => {
  const previousFetch = globalThis.fetch
  const previousKey = process.env.HYDRA_DB_API_KEY
  const previousDatabase = process.env.HYDRADB_DATABASE_ID
  const previousWait = process.env.HYDRADB_RECALL_WAIT_MS
  const previousPoll = process.env.HYDRADB_RECALL_POLL_MS
  let queryCalls = 0
  process.env.HYDRA_DB_API_KEY = 'test-key'
  process.env.HYDRADB_DATABASE_ID = 'test-database'
  process.env.HYDRADB_RECALL_WAIT_MS = '1000'
  process.env.HYDRADB_RECALL_POLL_MS = '0'
  globalThis.fetch = async (input) => {
    assert.match(String(input), /\/query$/)
    queryCalls += 1
    return {
      ok: true,
      status: 200,
      json: async () => ({ data: { inner: queryCalls === 1
        ? { chunks: [], graph_context: { query_paths: [], chunk_relations: [] } }
        : { chunks: [{ additional_metadata: { app: 'recoil', valid_from: '2022-01-01T00:00:00Z' } }], graph_context: { triplets: [{ source: 'a', target: 'b', predicate: 'AFFECTS' }] } } } }),
    }
  }
  try {
    const recalled = await recallTemporal('minimist', '2023-01-01T00:00:00.000Z')
    assert.equal(queryCalls, 2)
    assert.equal(recalled.rawChunkCount, 1)
    assert.equal(recalled.datedChunkCount, 1)
  } finally {
    globalThis.fetch = previousFetch
    if (previousKey === undefined) delete process.env.HYDRA_DB_API_KEY
    else process.env.HYDRA_DB_API_KEY = previousKey
    if (previousDatabase === undefined) delete process.env.HYDRADB_DATABASE_ID
    else process.env.HYDRADB_DATABASE_ID = previousDatabase
    if (previousWait === undefined) delete process.env.HYDRADB_RECALL_WAIT_MS
    else process.env.HYDRADB_RECALL_WAIT_MS = previousWait
    if (previousPoll === undefined) delete process.env.HYDRADB_RECALL_POLL_MS
    else process.env.HYDRADB_RECALL_POLL_MS = previousPoll
  }
})

test('HydraDB temporal recall focuses on dated reachability facts when graph memories dominate', async () => {
  const previousFetch = globalThis.fetch
  const previousKey = process.env.HYDRA_DB_API_KEY
  const previousDatabase = process.env.HYDRADB_DATABASE_ID
  const previousWait = process.env.HYDRADB_RECALL_WAIT_MS
  let requests = []
  process.env.HYDRA_DB_API_KEY = 'test-key'
  process.env.HYDRADB_DATABASE_ID = 'test-database'
  process.env.HYDRADB_RECALL_WAIT_MS = '0'
  globalThis.fetch = async (input, options) => {
    assert.match(String(input), /\/query$/)
    const request = JSON.parse(options.body)
    requests.push(request)
    const focused = request.query.startsWith('Reachability fact')
    return {
      ok: true,
      status: 200,
      json: async () => ({ data: { inner: focused
        ? { chunks: [{ id: 'dated-fact', additional_metadata: { app: 'recoil', recoil_kind: 'temporal_fact', valid_from: '2022-01-01T00:00:00Z' } }], graph_context: { triplets: [{ source: 'package', target: 'repository', predicate: 'RESOLVED_IN' }] } }
        : { chunks: [{ id: 'graph-fact', additional_metadata: { app: 'recoil', recoil_kind: 'observed_graph' } }], graph_context: { query_paths: [], chunk_relations: [] } } } }),
    }
  }
  try {
    const recalled = await recallTemporal('minimist GHSA-test https://github.com/example/app https://github.com/example/other', '2023-01-01T00:00:00.000Z')
    assert.equal(requests.length, 2)
    assert.match(requests[1].query, /^Reachability fact minimist GHSA-test/)
    assert.doesNotMatch(requests[1].query, /https?:\/\//)
    assert.equal(recalled.focusedRecall, true)
    assert.equal(recalled.rawChunkCount, 2)
    assert.equal(recalled.datedChunkCount, 1)
    assert.deepEqual(recalled.graphContext.triplets, [{ source: 'package', target: 'repository', predicate: 'RESOLVED_IN' }])
  } finally {
    globalThis.fetch = previousFetch
    if (previousKey === undefined) delete process.env.HYDRA_DB_API_KEY
    else process.env.HYDRA_DB_API_KEY = previousKey
    if (previousDatabase === undefined) delete process.env.HYDRADB_DATABASE_ID
    else process.env.HYDRADB_DATABASE_ID = previousDatabase
    if (previousWait === undefined) delete process.env.HYDRADB_RECALL_WAIT_MS
    else process.env.HYDRADB_RECALL_WAIT_MS = previousWait
  }
})

test('HydraDB queued batches can settle after the report is already available', async () => {
  const previousFetch = globalThis.fetch
  const previousKey = process.env.HYDRA_DB_API_KEY
  const previousDatabase = process.env.HYDRADB_DATABASE_ID
  const previousPoll = process.env.HYDRADB_INDEX_POLL_MS
  const previousWait = process.env.HYDRADB_INDEX_WAIT_MS
  process.env.HYDRA_DB_API_KEY = 'test-key'
  process.env.HYDRADB_DATABASE_ID = 'test-database'
  process.env.HYDRADB_INDEX_POLL_MS = '0'
  process.env.HYDRADB_INDEX_WAIT_MS = '1000'
  globalThis.fetch = async (input) => {
    const url = String(input)
    if (url.includes('/context/status?')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({ data: { inner: { statuses: [{ source_id: 'memory-1', indexing_status: 'completed' }] } } }),
      }
    }
    throw new Error(`unexpected HydraDB URL: ${url}`)
  }
  try {
    const settled = await settleHydraIndexing({ indexingStatus: 'queued', results: [{ id: 'memory-1', indexing_status: 'embedding' }] })
    assert.equal(settled.indexingStatus, 'completed')
    assert.equal(settled.results[0].indexing_status, 'completed')
  } finally {
    globalThis.fetch = previousFetch
    if (previousKey === undefined) delete process.env.HYDRA_DB_API_KEY
    else process.env.HYDRA_DB_API_KEY = previousKey
    if (previousDatabase === undefined) delete process.env.HYDRADB_DATABASE_ID
    else process.env.HYDRADB_DATABASE_ID = previousDatabase
    if (previousPoll === undefined) delete process.env.HYDRADB_INDEX_POLL_MS
    else process.env.HYDRADB_INDEX_POLL_MS = previousPoll
    if (previousWait === undefined) delete process.env.HYDRADB_INDEX_WAIT_MS
    else process.env.HYDRADB_INDEX_WAIT_MS = previousWait
  }
})

test('HydraDB requests have a bounded timeout when the cloud does not respond', async () => {
  const previousFetch = globalThis.fetch
  const previousKey = process.env.HYDRA_DB_API_KEY
  const previousDatabase = process.env.HYDRADB_DATABASE_ID
  const previousRetries = process.env.RECOIL_NETWORK_RETRIES
  const previousTimeout = process.env.HYDRADB_REQUEST_TIMEOUT_MS
  process.env.HYDRA_DB_API_KEY = 'test-key'
  process.env.HYDRADB_DATABASE_ID = 'test-database'
  process.env.RECOIL_NETWORK_RETRIES = '1'
  process.env.HYDRADB_REQUEST_TIMEOUT_MS = '1000'
  globalThis.fetch = async (_input, { signal }) => new Promise((resolve, reject) => {
    signal.addEventListener('abort', () => reject(signal.reason), { once: true })
  })
  try {
    await assert.rejects(
      recallTemporal('timeout case', '2026-08-19T00:00:00.000Z'),
      /HydraDB request failed.*aborted due to timeout/,
    )
  } finally {
    globalThis.fetch = previousFetch
    if (previousKey === undefined) delete process.env.HYDRA_DB_API_KEY
    else process.env.HYDRA_DB_API_KEY = previousKey
    if (previousDatabase === undefined) delete process.env.HYDRADB_DATABASE_ID
    else process.env.HYDRADB_DATABASE_ID = previousDatabase
    if (previousRetries === undefined) delete process.env.RECOIL_NETWORK_RETRIES
    else process.env.RECOIL_NETWORK_RETRIES = previousRetries
    if (previousTimeout === undefined) delete process.env.HYDRADB_REQUEST_TIMEOUT_MS
    else process.env.HYDRADB_REQUEST_TIMEOUT_MS = previousTimeout
  }
})

test('HydraDB adapter does not call a partial acknowledgement persisted', async () => {
  const previousFetch = globalThis.fetch
  const previousKey = process.env.HYDRA_DB_API_KEY
  const previousDatabase = process.env.HYDRADB_DATABASE_ID
  process.env.HYDRA_DB_API_KEY = 'test-key'
  process.env.HYDRADB_DATABASE_ID = 'test-database'
  globalThis.fetch = async (input) => {
    const url = String(input)
    if (url.endsWith('/context/ingest')) return {
      ok: true,
      status: 200,
      json: async () => ({ data: { inner: { results: [] } } }),
    }
    throw new Error(`unexpected HydraDB URL: ${url}`)
  }
  try {
    const result = await persistInvestigation({ scenarioId: 'partial-ack', package: 'minimist', graph: { nodes: [], edges: [] } }, {
      generatedAt: '2026-08-19T00:00:00.000Z',
      advisory: { id: 'GHSA-test', published: '2022-03-18T00:00:00Z', fixedVersions: [] },
      repositories: [],
      challenge: [],
    })
    assert.equal(result.status, 'queued')
    assert.equal(result.sourceIds.length, 0)
    assert.match(result.indexingError, /0\//)
  } finally {
    globalThis.fetch = previousFetch
    if (previousKey === undefined) delete process.env.HYDRA_DB_API_KEY
    else process.env.HYDRA_DB_API_KEY = previousKey
    if (previousDatabase === undefined) delete process.env.HYDRADB_DATABASE_ID
    else process.env.HYDRADB_DATABASE_ID = previousDatabase
  }
})
