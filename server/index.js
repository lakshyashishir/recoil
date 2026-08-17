import http from 'node:http'
import { randomUUID } from 'node:crypto'
import {
  EDGES,
  EVENTS,
  INTERVENTIONS,
  NODES,
  SCENARIO,
  createInitialState,
  getActiveNodeIds,
  getExposure,
  toggleAction,
} from '../src/core/scenario.js'
import { runIngestion } from './collectors.js'
import { hydraStatus, persistIngestion, recall } from './hydra.js'

const port = Number(process.env.RECOIL_PORT || 8787)
const scenarios = new Map()

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
  return {
    id: record.id,
    scenario: { ...SCENARIO, query: record.query, mode: record.mode },
    graph: { nodes: NODES, edges: EDGES, activeNodeIds: [...getActiveNodeIds(state)] },
    events: EVENTS,
    interventions: INTERVENTIONS,
    state,
    metrics: { exposure, contained: 100 - exposure, eventIndex: state.eventIndex, complete: state.eventIndex >= EVENTS.length },
    ingestion: record.ingestion,
    hydra: record.hydra,
    sources: [
      { id: 'osv', label: 'OSV advisory', type: 'advisory', status: 'fixture' },
      { id: 'npm', label: 'npm registry', type: 'registry', status: 'fixture' },
      { id: 'github', label: 'GitHub manifest', type: 'repository', status: 'fixture' },
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
    if (req.method === 'POST' && action === 'reset') {
      record.state = createInitialState()
      record.ingestion = { status: 'not_started', collectors: [] }
      record.hydra = { status: 'not_started', memoryCount: 0, recall: null }
      return json(res, 200, snapshot(record))
    }
    if (req.method === 'POST' && action === 'ingest') {
      record.ingestion = { status: 'running', collectors: [] }
      return runIngestion().then((result) => {
        record.ingestion = result
        return persistIngestion(result).then((persisted) => {
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
      return persistIngestion(record.ingestion).then((persisted) => {
        record.hydra = { ...record.hydra, ...persisted, persistedAt: persisted.status === 'persisted' ? new Date().toISOString() : null }
        return json(res, 200, snapshot(record))
      }).catch((error) => json(res, 502, { error: error.message, hydra: hydraStatus() }))
    }
    if (req.method === 'POST' && action === 'recall') {
      return body(req).then((payload) => recall(payload.query || record.query)).then((result) => {
        record.hydra = { ...record.hydra, recall: result, recalledAt: new Date().toISOString() }
        return json(res, 200, snapshot(record))
      }).catch((error) => json(res, 502, { error: error.message, hydra: hydraStatus() }))
    }
    if (req.method === 'POST' && action === 'action') {
      return body(req).then((payload) => {
        if (!INTERVENTIONS.some((item) => item.id === payload.id)) return json(res, 422, { error: 'Unknown intervention' })
        record.state = toggleAction(record.state, payload.id)
        return json(res, 200, snapshot(record))
      }).catch(() => json(res, 400, { error: 'Invalid JSON body' }))
    }
    if (req.method === 'POST' && action === 'run') {
      record.state = { ...record.state, running: true, eventIndex: 0 }
      return json(res, 202, snapshot(record))
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
