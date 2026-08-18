import http from 'node:http'
import { randomUUID } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import { hydraStatus } from './hydra.js'
import { startInvestigation, rewindInvestigation } from './investigation.js'
import { advisoryAgentStatus } from './advisory-agent.js'
import { parseInvestigationInput } from './collectors.js'
import { buildEvidenceReceipt } from '../src/core/receipt.js'

const port = Number(process.env.RECOIL_PORT || 8787)
const host = process.env.RECOIL_HOST || '127.0.0.1'
const scenarios = new Map()

function json(res, status, payload) {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'access-control-allow-origin': '*',
    'access-control-allow-headers': 'content-type',
    'access-control-allow-methods': 'GET, POST, OPTIONS',
  })
  res.end(JSON.stringify(payload))
}

function downloadJson(res, status, filename, payload) {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-disposition': `attachment; filename="${filename}"`,
    'access-control-allow-origin': '*',
    'access-control-allow-headers': 'content-type',
  })
  res.end(JSON.stringify(payload, null, 2))
}

async function body(req) {
  let raw = ''
  for await (const chunk of req) raw += chunk
  return raw ? JSON.parse(raw) : {}
}

function investigationSnapshot(record) {
  const investigation = record.investigation
  const evidence = investigation?.evidence || record.ingestion || { status: 'not_started', collectors: [] }
  const graph = evidence.graph || { nodes: [], edges: [] }
  const collectors = new Map((evidence.collectors || []).map((collector) => [collector.collector, collector]))
  const sourceStatus = (collectorName) => collectors.get(collectorName)?.status
    || (investigation?.status === 'running' || investigation?.status === 'finalizing' ? 'working' : 'ready')
  return {
    id: record.id,
    scenario: { id: record.id, query: record.query, mode: 'evidence' },
    graph,
    events: investigation?.events || [],
    state: { status: investigation?.status || 'idle', step: investigation?.step || 'idle' },
    ingestion: evidence,
    hydra: investigation?.hydra || { status: 'not_started', memoryCount: 0 },
    investigation,
    sources: [
      { id: 'osv', label: 'OSV advisory', type: 'advisory', status: sourceStatus('advisory-resolver') },
      { id: 'registry', label: evidence.registry?.ecosystem === 'cargo' ? 'crates.io registry' : 'npm registry', type: 'registry', status: sourceStatus('registry-resolver') },
      ...((evidence.repositories || []).map((repository) => ({
        id: `github:${repository.repository}`,
        label: repository.repository,
        type: 'repository',
        status: repository.status || 'ready',
      }))),
      { id: 'hydra', label: 'HydraDB temporal memory', type: 'memory', status: investigation?.hydra?.status || 'ready' },
    ],
  }
}

function snapshot(record) {
  return investigationSnapshot(record)
}

function getOrCreate(id = '0017', initial = {}) {
  if (!scenarios.has(id)) {
    scenarios.set(id, {
      id,
      query: typeof initial.query === 'string' ? initial.query : '',
      mode: 'evidence',
      ingestion: { status: 'not_started', collectors: [] },
      hydra: { status: 'not_started', memoryCount: 0 },
      investigation: null,
    })
  }
  return scenarios.get(id)
}

function resetRecord(record) {
  record.query = ''
  record.ingestion = { status: 'not_started', collectors: [] }
  record.hydra = { status: 'not_started', memoryCount: 0 }
  record.investigation = null
}

async function route(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`)
  if (req.method === 'OPTIONS') return json(res, 204, {})

  if (req.method === 'GET' && url.pathname === '/api/health') {
    return json(res, 200, {
      ok: true,
      service: 'recoil-api',
      product: 'evidence-proof',
      version: 'evidence-v1',
      mode: 'autonomous',
      hydra: hydraStatus(),
      advisoryScopeAgent: advisoryAgentStatus(),
      capabilities: [
        'npm',
        'cargo',
        'osv',
        'repository-evidence',
        'source-reachability',
        'temporal-rewind',
        'fix-proof',
        'hydradb-temporal-memory',
        'evidence-receipt',
      ],
      time: new Date().toISOString(),
    })
  }

  if (req.method === 'GET' && url.pathname === '/api/scenario') {
    return json(res, 200, snapshot(getOrCreate()))
  }

  if (req.method === 'POST' && url.pathname === '/api/scenarios') {
    return body(req).then((payload) => {
      const id = payload.id || randomUUID().slice(0, 8)
      return json(res, 201, snapshot(getOrCreate(id, payload)))
    }).catch(() => json(res, 400, { error: 'Invalid JSON body' }))
  }

  const match = url.pathname.match(/^\/api\/scenarios\/([^/]+)(?:\/([^/]+))?$/)
  if (!match) return json(res, 404, { error: 'Not found' })

  const [, id, action] = match
  const record = getOrCreate(id)

  if (req.method === 'GET' && !action) return json(res, 200, snapshot(record))

  if (req.method === 'GET' && action === 'investigation') {
    return json(res, 200, { scenarioId: record.id, investigation: record.investigation })
  }

  if (req.method === 'POST' && action === 'investigate') {
    return body(req).then((payload) => {
      if (typeof payload.query !== 'string' || !payload.query.trim()) {
        return json(res, 422, { error: 'Provide an advisory or package plus at least one public GitHub repository URL' })
      }
      if (parseInvestigationInput(payload.query).repositories.length === 0) {
        return json(res, 422, { error: 'Add at least one public GitHub repository URL so Recoil can prove reachability' })
      }
      if (['running', 'finalizing'].includes(record.investigation?.status)) {
        return json(res, 409, { error: 'An investigation is already running for this case' })
      }
      record.ingestion = { status: 'not_started', collectors: [] }
      record.hydra = { status: 'not_started', memoryCount: 0 }
      startInvestigation(record, payload.query)
      return json(res, 202, snapshot(record))
    }).catch(() => json(res, 400, { error: 'Invalid JSON body' }))
  }

  if (req.method === 'POST' && action === 'rewind') {
    return body(req).then((payload) => {
      const asOf = typeof payload.asOf === 'string' ? payload.asOf : new Date().toISOString()
      return rewindInvestigation(record, asOf).then((result) => json(res, result.error ? 409 : 200, { scenarioId: record.id, ...result }))
    }).catch((error) => json(res, 400, { error: error.message }))
  }

  if (req.method === 'GET' && action === 'report') {
    return json(res, record.investigation?.report ? 200 : 202, { scenarioId: record.id, report: record.investigation?.report || null })
  }

  if (req.method === 'GET' && action === 'receipt') {
    const receipt = buildEvidenceReceipt({
      scenarioId: record.investigation?.caseId || record.id,
      query: record.query,
      report: record.investigation?.report,
      hydra: record.investigation?.hydra || record.hydra,
    })
    if (!receipt) return json(res, 202, { scenarioId: record.id, receipt: null, error: 'Investigation report is not ready' })
    return downloadJson(res, 200, `recoil-${record.investigation?.caseId || record.id}-evidence-receipt.json`, receipt)
  }

  if (req.method === 'GET' && action === 'events') {
    return json(res, 200, {
      scenarioId: record.id,
      events: record.investigation?.events || [],
      state: { status: record.investigation?.status || 'idle', step: record.investigation?.step || 'idle' },
    })
  }

  if (req.method === 'GET' && action === 'graph') {
    return json(res, 200, { scenarioId: record.id, graph: snapshot(record).graph })
  }

  if (req.method === 'GET' && action === 'code-graph') {
    const evidence = record.investigation?.evidence || record.ingestion
    const repository = evidence?.repositories?.find((item) => item?.manifest?.codeGraph)
      || evidence?.collectors?.find((collector) => collector.collector === 'repository-extractor')
    return json(res, 200, { scenarioId: record.id, codeGraph: repository?.manifest?.codeGraph || null })
  }

  if (req.method === 'POST' && action === 'reset') {
    resetRecord(record)
    return json(res, 200, snapshot(record))
  }

  return json(res, 404, { error: 'Not found' })
}

export { route, getOrCreate, snapshot }

const runningAsEntryPoint = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])
if (runningAsEntryPoint) {
  const server = http.createServer((req, res) => {
    Promise.resolve(route(req, res)).catch((error) => {
      console.error(error)
      if (!res.headersSent) json(res, 500, { error: 'Internal server error' })
    })
  })

  server.on('error', (error) => {
    console.error(`Recoil API could not listen on ${port}: ${error.message}`)
    process.exitCode = 1
  })

  server.listen(port, host, () => {
    console.log(`Recoil API listening on http://${host}:${port}`)
  })
}
