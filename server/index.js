import http from 'node:http'
import { randomUUID } from 'node:crypto'
import {
  EDGES,
  EVENTS,
  INTERVENTIONS,
  NODES,
  SCENARIO,
  advanceState,
  createInitialState,
  createEvents,
  evaluateInterventions,
  getActiveNodeIds,
  getExposure,
  toggleAction,
} from '../src/core/scenario.js'
import { runIngestion } from './collectors.js'
import { hydraStatus, persistDecision, persistEvaluation, persistIngestion, recall } from './hydra.js'

const port = Number(process.env.RECOIL_PORT || 8787)
const scenarios = new Map()

function buildGraph(ingestion) {
  const packageName = ingestion?.package || 'ua-parser-js'
  const repository = ingestion?.collectors?.find((collector) => collector.collector === 'repository-extractor')
  const resolvedVersion = repository?.manifest?.resolved?.[packageName] || ingestion?.target?.version || 'unresolved'
  const registry = ingestion?.collectors?.find((collector) => collector.collector === 'registry-resolver')
  const advisory = ingestion?.target?.advisoryId || registry?.latest || 'advisory target'
  const nodes = NODES.map((node) => {
      if (node.id === 'release') return { ...node, label: `${packageName}@${resolvedVersion}`, meta: advisory === 'CVE-2021-4229' ? 'compromised release' : 'resolved package target' }
      if (node.id === 'maintainer' && registry?.maintainers?.[0]) return { ...node, label: `maintainer: ${registry.maintainers[0]}`, meta: 'registry publisher' }
      if (node.id === 'repo') return { ...node, label: repository?.repository || 'fixture / storefront-api', meta: repository?.synthetic ? 'synthetic demo repo' : 'public repository' }
      return node
    })
  const edges = [...EDGES]
  const manifest = repository?.manifest
  if (repository && !repository.synthetic && manifest) {
    const manifestId = 'manifest:observed'
    nodes.push({ id: manifestId, label: `${repository.repository} manifest`, type: 'repo', meta: manifest.lockfile ? 'public lockfile' : 'public package.json', x: 36, y: 14, activeAt: 4 })
    edges.push(['repo', manifestId])
    const dependencies = Object.entries(manifest.dependencies || {}).slice(0, 12)
    dependencies.forEach(([name, range], index) => {
      const isTarget = name === packageName
      const id = `dependency:${name}`
      nodes.push({
        id,
        label: `${name}${isTarget && manifest.resolved?.[name] ? `@${manifest.resolved[name]}` : ''}`,
        type: 'package',
        meta: isTarget ? `target · ${range}` : `direct · ${range}`,
        role: isTarget ? 'target-dependency' : 'observed-dependency',
        x: 46 + ((index % 4) * 13),
        y: 12 + (Math.floor(index / 4) * 23),
        activeAt: 4,
      })
      edges.push([manifestId, id])
      if (isTarget) edges.push([id, 'release'])
    })
  }
  return { nodes, edges }
}

function buildEvents(ingestion) {
  const repository = ingestion?.collectors?.find((collector) => collector.collector === 'repository-extractor')
  return createEvents(ingestion?.package || 'ua-parser-js', ingestion?.target?.advisoryId || 'advisory target', {
    repository: repository?.synthetic ? null : repository?.repository,
    dependencyCount: Object.keys(repository?.manifest?.dependencies || {}).length || null,
  })
}

function buildReport(record) {
  const ingestion = record.ingestion || {}
  const registry = ingestion.collectors?.find((collector) => collector.collector === 'registry-resolver')
  const advisory = ingestion.collectors?.find((collector) => collector.collector === 'advisory-resolver')
  const repository = ingestion.collectors?.find((collector) => collector.collector === 'repository-extractor')
  const plans = evaluateInterventions(record.state, record.graph.nodes)
  const recommended = plans[0]
  const activeNodeIds = [...getActiveNodeIds({ ...record.state, eventIndex: record.events.length }, record.graph.nodes)]
  const sources = (ingestion.collectors || []).flatMap((collector) => [collector.sourceUrl, ...(collector.sources || []).map((source) => source.url)]).filter(Boolean)
  return {
    scenarioId: record.id,
    query: record.query,
    conclusion: ingestion.status === 'completed'
      ? `${ingestion.package || 'Target'} was traced from public ecosystem evidence into a bounded deployment model. The reachable path is modeled, not proof of compromise.`
      : 'The investigation is incomplete; the available evidence does not support a complete conclusion.',
    observed: {
      package: ingestion.package || null,
      advisory: ingestion.target?.advisoryId || null,
      advisoryRecord: advisory?.targetAdvisory ? { id: advisory.targetAdvisory.id, summary: advisory.targetAdvisory.summary, references: advisory.targetAdvisory.references?.length || 0 } : null,
      affectedVersions: registry?.affectedVersions || [],
      fixedVersions: registry?.fixedVersions || [],
      repository: repository?.repository || null,
      repositorySynthetic: repository?.synthetic ?? null,
      resolvedVersion: repository?.manifest?.resolved?.[ingestion.package] || null,
    },
    modeled: {
      graphNodes: record.graph.nodes.length,
      graphEdges: record.graph.edges.length,
      activeNodes: activeNodeIds.length,
      reachableExposure: getExposure(record.state),
      eventCount: record.events.length,
      completed: record.state.eventIndex >= record.events.length,
    },
    recommendation: recommended,
    uncertainty: [
      repository?.synthetic ? 'Deployment and service fan-out are synthetic demo records.' : null,
      repository && !repository.manifest?.lockfile ? 'The public repository did not expose a lockfile; dependency resolution is range-based.' : null,
      'No package code or exploit payload was executed.',
    ].filter(Boolean),
    sources: [...new Set(sources)],
  }
}

function json(res, status, payload) {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'access-control-allow-origin': '*',
    'access-control-allow-headers': 'content-type',
  })
  res.end(JSON.stringify(payload))
}

function snapshot(record) {
  const state = record.state
  const exposure = getExposure(state)
  const collectors = new Map((record.ingestion?.collectors || []).map((collector) => [collector.collector, collector]))
  const sourceStatus = (collectorName) => collectors.get(collectorName)?.status || (record.ingestion?.status === 'running' ? 'working' : 'ready')
  return {
    id: record.id,
    scenario: { ...SCENARIO, query: record.query, mode: record.mode },
    graph: { ...record.graph, activeNodeIds: [...getActiveNodeIds(state, record.graph.nodes)] },
    events: record.events,
    interventions: INTERVENTIONS,
    state,
    metrics: { exposure, contained: 100 - exposure, eventIndex: state.eventIndex, complete: state.eventIndex >= (record.events?.length || EVENTS.length) },
    ingestion: record.ingestion,
    hydra: record.hydra,
    sources: [
      { id: 'osv', label: 'OSV advisory', type: 'advisory', status: sourceStatus('advisory-resolver') },
      { id: 'npm', label: 'npm registry', type: 'registry', status: sourceStatus('registry-resolver') },
      { id: 'incident', label: 'Incident sources', type: 'research', status: sourceStatus('incident-researcher') },
      { id: 'github', label: 'Repository manifest', type: 'repository', status: sourceStatus('repository-extractor') },
      { id: 'hydra', label: 'HydraDB memory graph', type: 'memory', status: record.hydra?.status || 'ready' },
    ],
  }
}

function getOrCreate(id = '0017', body = {}) {
  if (!scenarios.has(id)) {
    scenarios.set(id, {
      id,
      query: body.query || SCENARIO.query,
      mode: body.mode || 'incident',
      state: createInitialState(),
      graph: { nodes: NODES, edges: EDGES },
      events: EVENTS,
      ingestion: { status: 'not_started', collectors: [] },
      hydra: { status: 'not_started', memoryCount: 0, recall: null },
    })
  }
  return scenarios.get(id)
}

async function body(req) {
  let raw = ''
  for await (const chunk of req) raw += chunk
  return raw ? JSON.parse(raw) : {}
}

function route(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`)
  if (req.method === 'OPTIONS') return json(res, 204, {})
  if (req.method === 'GET' && url.pathname === '/api/health') {
    return json(res, 200, { ok: true, service: 'recoil-api', hydra: hydraStatus(), sources: ['npm-registry', 'osv', 'incident-pages', 'synthetic-fixture'], time: new Date().toISOString() })
  }
  if (req.method === 'GET' && url.pathname === '/api/scenario') return json(res, 200, snapshot(getOrCreate()))
  if (req.method === 'POST' && url.pathname === '/api/scenarios') {
    return body(req).then((payload) => {
      const id = payload.id || randomUUID().slice(0, 8)
      const record = getOrCreate(id, payload)
      return json(res, 201, snapshot(record))
    }).catch(() => json(res, 400, { error: 'Invalid JSON body' }))
  }

  const scenarioMatch = url.pathname.match(/^\/api\/scenarios\/([^/]+)(?:\/([^/]+))?$/)
  if (scenarioMatch) {
    const [, id, action] = scenarioMatch
    const record = getOrCreate(id)
    if (req.method === 'GET' && !action) return json(res, 200, snapshot(record))
    if (req.method === 'GET' && action === 'events') return json(res, 200, { scenarioId: record.id, events: record.events, state: record.state })
    if (req.method === 'GET' && action === 'graph') return json(res, 200, { scenarioId: record.id, graph: snapshot(record).graph })
    if (req.method === 'GET' && action === 'report') return json(res, 200, buildReport(record))
    if (req.method === 'POST' && action === 'reset') {
      record.state = createInitialState()
      record.graph = { nodes: NODES, edges: EDGES }
      record.events = EVENTS
      record.ingestion = { status: 'not_started', collectors: [] }
      record.hydra = { status: 'not_started', memoryCount: 0, recall: null }
      return json(res, 200, snapshot(record))
    }
    if (req.method === 'POST' && action === 'ingest') {
      record.ingestion = { status: 'running', collectors: [] }
      return runIngestion({ query: record.query, scenarioId: record.id }).then((result) => {
        record.ingestion = result
        record.graph = buildGraph(result)
        record.events = buildEvents(result)
        return persistIngestion({ ...result, graph: record.graph, events: record.events }).then((persisted) => {
          record.hydra = { ...record.hydra, ...persisted, persistedAt: persisted.status === 'persisted' ? new Date().toISOString() : null }
          return json(res, 200, snapshot(record))
        }).catch((error) => {
          record.hydra = { status: 'failed', memoryCount: 0, error: error.message, recall: null }
          return json(res, 200, snapshot(record))
        })
      })
    }
    if (req.method === 'POST' && action === 'persist') {
      if (!record.ingestion || record.ingestion.status === 'not_started') return json(res, 409, { error: 'Run ingestion before persisting' })
      return persistIngestion({ ...record.ingestion, graph: record.graph, events: record.events }).then((persisted) => {
        record.hydra = { ...record.hydra, ...persisted, persistedAt: persisted.status === 'persisted' ? new Date().toISOString() : null }
        return json(res, 200, snapshot(record))
      }).catch((error) => json(res, 502, { error: error.message, hydra: hydraStatus() }))
    }
    if (req.method === 'POST' && action === 'recall') {
      return body(req).then((payload) => recall(payload.query || record.query, undefined, record.id)).then((result) => {
        record.hydra = { ...record.hydra, recall: result, recalledAt: new Date().toISOString() }
        return json(res, 200, snapshot(record))
      }).catch((error) => json(res, 502, { error: error.message, hydra: hydraStatus() }))
    }
    if (req.method === 'POST' && action === 'action') {
      return body(req).then((payload) => {
        if (!INTERVENTIONS.some((item) => item.id === payload.id)) return json(res, 422, { error: 'Unknown intervention' })
        const nextState = toggleAction(record.state, payload.id)
        const changed = nextState !== record.state
        record.state = nextState
        if (!changed) return json(res, 200, snapshot(record))
        return persistDecision({
          scenarioId: record.id,
          queryText: record.query,
          action: payload.id,
          selectedActions: record.state.selectedActions,
          exposure: getExposure(record.state),
          activeNodeIds: [...getActiveNodeIds(record.state, record.graph.nodes)],
        }).then((persisted) => {
          record.hydra = { ...record.hydra, lastDecision: persisted }
          return json(res, 200, snapshot(record))
        }).catch((error) => {
          record.hydra = { ...record.hydra, lastDecision: { status: 'failed', error: error.message } }
          return json(res, 200, snapshot(record))
        })
      }).catch(() => json(res, 400, { error: 'Invalid JSON body' }))
    }
    if (req.method === 'POST' && action === 'run') {
      return body(req).then((payload) => {
        if (typeof payload.query === 'string' && payload.query.trim()) record.query = payload.query.trim()
        record.state = { ...createInitialState(), running: true }
        return json(res, 202, snapshot(record))
      }).catch(() => json(res, 400, { error: 'Invalid JSON body' }))
    }
    if (req.method === 'POST' && action === 'advance') {
      record.state = advanceState(record.state)
      return json(res, 200, snapshot(record))
    }
    if (req.method === 'POST' && action === 'evaluate') {
      const plans = evaluateInterventions(record.state, record.graph.nodes)
      const recommended = plans[0]
      const alternatives = plans.slice(0, 6)
      return persistEvaluation({ scenarioId: record.id, queryText: record.query, recommended, alternatives }).then((persisted) => {
        record.hydra = { ...record.hydra, lastPlan: persisted }
        return json(res, 200, { scenarioId: record.id, recommended, alternatives, hydra: persisted })
      }).catch((error) => json(res, 200, { scenarioId: record.id, recommended, alternatives, hydra: { status: 'failed', error: error.message } }))
    }
  }
  return json(res, 404, { error: 'Not found' })
}

const server = http.createServer((req, res) => {
  Promise.resolve(route(req, res)).catch((error) => {
    console.error(error)
    if (!res.headersSent) json(res, 500, { error: 'Internal server error' })
  })
})

server.listen(port, '127.0.0.1', () => {
  console.log(`Recoil API listening on http://127.0.0.1:${port}`)
})
