import http from 'node:http'
import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { hydraStatus } from './hydra.js'
import { startInvestigation, rewindInvestigation } from './investigation.js'
import { advisoryAgentStatus } from './advisory-agent.js'
import { parseInvestigationInput } from './collectors.js'
import { buildEvidenceReceipt } from '../src/core/receipt.js'
import { buildEvidenceBrief } from '../src/core/brief.js'
import { summarizeGraphContext } from '../src/core/graph-context.js'
import { answerWorkspaceQuestion, buildFleetGraph, buildIncidentGraph, buildIncidents, normalizedRepository } from './workspace.js'

const port = Number(process.env.RECOIL_PORT || process.env.PORT || 8787)
const host = process.env.RECOIL_HOST || '127.0.0.1'
const serveStaticEnabled = process.env.RECOIL_SERVE_STATIC === '1'
const staticDirectory = resolve(process.env.RECOIL_STATIC_DIR || 'dist')
const maxConcurrentInvestigations = Math.max(1, Number(process.env.RECOIL_MAX_CONCURRENT_INVESTIGATIONS || 3))
const maxRequestBytes = Math.max(1024, Number(process.env.RECOIL_MAX_REQUEST_BYTES || 64 * 1024))
const scanRateLimit = Math.max(1, Number(process.env.RECOIL_SCAN_RATE_LIMIT || 8))
const scanRateWindowMs = Math.max(60_000, Number(process.env.RECOIL_SCAN_RATE_WINDOW_MS || 15 * 60_000))
const configuredWatchIntervalMs = Math.max(0, Number(process.env.RECOIL_WATCH_INTERVAL_MS || 0))
const watchIntervalMs = configuredWatchIntervalMs > 0 ? Math.max(60_000, configuredWatchIntervalMs) : 0
const monitorStartedAt = new Date().toISOString()
const scanRequests = new Map()
const workspacePersistenceEnabled = !process.env.NODE_TEST_CONTEXT && process.env.RECOIL_DISABLE_WORKSPACE !== '1'
const workspaceFile = resolve(process.env.RECOIL_WORKSPACE_FILE || '.recoil-data/workspace.json')
const persistedWorkspace = loadWorkspace()
const scenarios = new Map(persistedWorkspace.records.map((record) => [record.id, record]))
const watches = new Map(persistedWorkspace.watches.map((watch) => [watch.id, watch]))
const workspaceState = {
  createdAt: persistedWorkspace.createdAt || new Date().toISOString(),
  lastMonitorAt: persistedWorkspace.lastMonitorAt || null,
  notifications: persistedWorkspace.notifications || [],
  processedCaseIds: new Set(persistedWorkspace.processedCaseIds?.length
    ? persistedWorkspace.processedCaseIds
    : persistedWorkspace.records.filter((record) => record.investigation?.status === 'complete').map((record) => record.id)),
}

function responseHeaders(contentType = 'application/json; charset=utf-8') {
  return {
    'content-type': contentType,
    'access-control-allow-origin': process.env.RECOIL_ALLOWED_ORIGIN || '*',
    'access-control-allow-headers': 'content-type',
    'access-control-allow-methods': 'GET, POST, PATCH, DELETE, OPTIONS',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'strict-origin-when-cross-origin',
    'x-frame-options': 'DENY',
  }
}

function json(res, status, payload) {
  res.writeHead(status, {
    ...responseHeaders(),
  })
  res.end(JSON.stringify(payload))
}

function downloadJson(res, status, filename, payload) {
  res.writeHead(status, {
    ...responseHeaders(),
    'content-disposition': `attachment; filename="${filename}"`,
  })
  res.end(JSON.stringify(payload, null, 2))
}

function downloadText(res, status, filename, contentType, payload) {
  res.writeHead(status, {
    ...responseHeaders(`${contentType}; charset=utf-8`),
    'content-disposition': `attachment; filename="${filename}"`,
  })
  res.end(payload)
}

async function body(req) {
  let raw = ''
  for await (const chunk of req) {
    raw += chunk
    if (Buffer.byteLength(raw) > maxRequestBytes) {
      const error = new Error('Request body is too large')
      error.statusCode = 413
      throw error
    }
  }
  return raw ? JSON.parse(raw) : {}
}

const staticContentTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
  '.woff2': 'font/woff2',
}

function serveStatic(req, res, pathname) {
  if (!serveStaticEnabled || !['GET', 'HEAD'].includes(req.method)) return false
  const requested = pathname === '/' ? '/index.html' : pathname
  const candidate = resolve(staticDirectory, `.${decodeURIComponent(requested)}`)
  const safeCandidate = candidate.startsWith(`${staticDirectory}/`) ? candidate : null
  const file = safeCandidate && existsSync(safeCandidate) && statSync(safeCandidate).isFile()
    ? safeCandidate
    : resolve(staticDirectory, 'index.html')
  if (!existsSync(file)) return false
  const extension = file.slice(file.lastIndexOf('.'))
  const immutableAsset = file.includes(`${staticDirectory}/assets/`)
  res.writeHead(200, {
    'content-type': staticContentTypes[extension] || 'application/octet-stream',
    'cache-control': immutableAsset ? 'public, max-age=31536000, immutable' : 'no-cache',
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'strict-origin-when-cross-origin',
    'x-frame-options': 'DENY',
  })
  if (req.method === 'HEAD') res.end()
  else res.end(readFileSync(file))
  return true
}

function activeInvestigationCount() {
  return [...scenarios.values()].filter((record) => ['running', 'finalizing'].includes(record.investigation?.status)).length
}

function clientAddress(req) {
  const forwarded = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim()
  return forwarded || req.socket?.remoteAddress || 'local'
}

function consumeScanBudget(req) {
  if (process.env.NODE_TEST_CONTEXT || process.env.RECOIL_DISABLE_RATE_LIMIT === '1') return true
  const now = Date.now()
  const key = clientAddress(req)
  const current = scanRequests.get(key)
  const entry = !current || now - current.startedAt >= scanRateWindowMs
    ? { startedAt: now, count: 0 }
    : current
  entry.count += 1
  scanRequests.set(key, entry)
  return entry.count <= scanRateLimit
}

/**
 * HydraDB recall can contain provider chunks and transport payloads that are
 * useful inside the server but are not part of the browser contract. Keep the
 * client on the same inspectable summary used by the report and receipt.
 */
export function publicHydraRecall(recall = {}) {
  const relatedCases = Array.isArray(recall.relatedCases) ? recall.relatedCases : []
  const priorScenarioIds = Array.isArray(recall.priorScenarioIds) ? recall.priorScenarioIds : []
  return {
    status: recall.status || 'skipped',
    asOf: recall.asOf || null,
    datedChunkCount: recall.datedChunkCount || 0,
    rawChunkCount: recall.rawChunkCount || recall.chunks?.length || 0,
    relatedCaseCount: recall.relatedCaseCount ?? (relatedCases.length || priorScenarioIds.length),
    priorScenarioIds,
    relatedCases,
    sources: Array.isArray(recall.sources) ? recall.sources.slice(0, 12) : [],
    graphContext: summarizeGraphContext(recall.graphContext),
    focusedRecall: Boolean(recall.focusedRecall),
    focusedRecallError: recall.focusedRecallError || null,
    reason: recall.reason || recall.error || null,
  }
}

function publicHydraGraphVerification(graph = {}) {
  return {
    status: graph.status || 'not_requested',
    scenarioId: graph.scenarioId || null,
    memoryCount: graph.memoryCount || 0,
    tripletCount: graph.tripletCount || 0,
    returnedTripletCount: graph.returnedTripletCount || graph.tripletCount || 0,
    sourceIds: Array.isArray(graph.sourceIds) ? graph.sourceIds : [],
    graphContext: summarizeGraphContext(graph.graphContext),
    reason: graph.reason || graph.error || null,
  }
}

export function publicHydraState(hydra = {}) {
  return {
    status: hydra.status || 'not_started',
    reason: hydra.reason || null,
    memoryCount: hydra.memoryCount || 0,
    sourceIds: Array.isArray(hydra.sourceIds) ? hydra.sourceIds : [],
    indexingPending: Boolean(hydra.indexingPending),
    indexingError: hydra.indexingError || null,
    recall: publicHydraRecall(hydra.recall || {}),
    graphVerification: publicHydraGraphVerification(hydra.graphVerification || {}),
  }
}

function publicInvestigation(investigation) {
  if (!investigation) return null
  return { ...investigation, hydra: publicHydraState(investigation.hydra || {}) }
}

function serializableRecord(record) {
  return {
    id: record.id,
    watchId: record.watchId || null,
    query: record.query || '',
    mode: record.mode || 'evidence',
    createdAt: record.createdAt || record.investigation?.startedAt || new Date().toISOString(),
    updatedAt: record.investigation?.completedAt || record.updatedAt || new Date().toISOString(),
    ingestion: record.ingestion || { status: 'not_started', collectors: [] },
    hydra: publicHydraState(record.investigation?.hydra || record.hydra || {}),
    graph: record.graph || record.investigation?.graph || record.investigation?.report?.graph || { nodes: [], edges: [] },
    investigation: publicInvestigation(record.investigation),
  }
}

function watchId(repository) {
  return `repo-${normalizedRepository(repository).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`
}

function watchForRepository(repository) {
  const normalized = normalizedRepository(repository)
  return [...watches.values()].find((watch) => normalizedRepository(watch.repository) === normalized) || null
}

function createWatch(repository, repositoryUrl, extra = {}) {
  const normalized = normalizedRepository(repositoryUrl || repository)
  if (!normalized || !normalized.includes('/')) return null
  const existing = watchForRepository(normalized)
  if (existing) return existing
  const now = new Date().toISOString()
  const watch = {
    id: watchId(normalized),
    repository: normalized,
    repositoryUrl: repositoryUrl || `https://github.com/${normalized}`,
    ref: extra.ref || null,
    ecosystem: extra.ecosystem || null,
    status: 'idle',
    autoScan: extra.autoScan !== false,
    createdAt: now,
    updatedAt: now,
    lastScannedAt: null,
    latestCaseId: null,
    scanCount: 0,
    lastError: null,
  }
  watches.set(watch.id, watch)
  return watch
}

function deriveWatches(records = []) {
  const result = []
  for (const record of records) {
    const evidenceRepositories = record.investigation?.evidence?.repositories || record.ingestion?.repositories || []
    for (const repository of evidenceRepositories) {
      const normalized = normalizedRepository(repository.repositoryUrl || repository.repository || repository.sourceUrl)
      if (!normalized || result.some((watch) => watch.repository === normalized)) continue
      result.push({
        id: watchId(normalized),
        repository: normalized,
        repositoryUrl: repository.repositoryUrl || repository.sourceUrl || `https://github.com/${normalized}`,
        ref: repository.ref || null,
        ecosystem: repository.ecosystem || repository.manifest?.ecosystem || null,
        status: 'idle',
        autoScan: true,
        createdAt: record.createdAt || record.investigation?.startedAt || new Date().toISOString(),
        updatedAt: record.investigation?.completedAt || record.updatedAt || new Date().toISOString(),
        lastScannedAt: null,
        latestCaseId: null,
        scanCount: 0,
        lastError: null,
      })
    }
  }
  return result
}

function loadWorkspace() {
  if (!workspacePersistenceEnabled) return { records: [], watches: [] }
  if (!existsSync(workspaceFile)) return { records: [], watches: [] }
  try {
    const payload = JSON.parse(readFileSync(workspaceFile, 'utf8'))
    const records = Array.isArray(payload?.records) ? payload.records : []
    return {
      records,
      watches: Array.isArray(payload?.watches) ? payload.watches : deriveWatches(records),
      createdAt: payload?.createdAt || null,
      lastMonitorAt: payload?.lastMonitorAt || null,
      notifications: Array.isArray(payload?.notifications) ? payload.notifications : [],
      processedCaseIds: Array.isArray(payload?.processedCaseIds) ? payload.processedCaseIds : [],
    }
  } catch (error) {
    console.warn(`Recoil workspace could not be read: ${error.message}`)
    return { records: [], watches: [] }
  }
}

function notifyWorkspaceChanges() {
  const completed = [...scenarios.values()]
    .filter((record) => record.investigation?.status === 'complete' && record.investigation?.report)
    .sort((left, right) => String(left.investigation.completedAt || '').localeCompare(String(right.investigation.completedAt || '')))
  for (const record of completed) {
    if (workspaceState.processedCaseIds.has(record.id)) continue
    const targetRepositories = parseInvestigationInput(record.query).repositories.map((repository) => normalizedRepository(repository.url))
    const prior = [...completed].reverse().find((candidate) => candidate.id !== record.id
      && String(candidate.investigation.completedAt || '') < String(record.investigation.completedAt || '')
      && parseInvestigationInput(candidate.query).repositories.some((repository) => targetRepositories.includes(normalizedRepository(repository.url))))
    const previousVerdicts = new Map((prior?.investigation?.report?.repositories || []).map((finding) => [`${String(finding.advisoryId).toUpperCase()}:${normalizedRepository(finding.repositoryUrl || finding.repository)}`, finding.verdict]))
    const changes = (record.investigation.report.repositories || []).filter((finding) => {
      const key = `${String(finding.advisoryId).toUpperCase()}:${normalizedRepository(finding.repositoryUrl || finding.repository)}`
      return previousVerdicts.get(key) !== finding.verdict
    })
    const important = changes.filter((finding) => finding.verdict === 'REACHED' || previousVerdicts.has(`${String(finding.advisoryId).toUpperCase()}:${normalizedRepository(finding.repositoryUrl || finding.repository)}`))
    if (important.length) {
      const notification = {
        id: `change-${record.id}`,
        caseId: record.id,
        createdAt: record.investigation.completedAt,
        severity: important.some((finding) => finding.verdict === 'REACHED') ? 'action' : 'resolved',
        title: important.some((finding) => finding.verdict === 'REACHED') ? 'New reachable exposure' : 'Exposure changed',
        detail: important.map((finding) => `${finding.advisoryId} · ${normalizedRepository(finding.repositoryUrl || finding.repository)} · ${finding.verdict}`).join(' | '),
      }
      workspaceState.notifications = [notification, ...workspaceState.notifications.filter((item) => item.id !== notification.id)].slice(0, 100)
      const webhook = process.env.RECOIL_NOTIFICATION_WEBHOOK_URL
      if (webhook) void fetch(webhook, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ schema: 'recoil.notification/v1', notification }) }).catch((error) => console.warn(`Recoil notification webhook failed: ${error.message}`))
    }
    workspaceState.processedCaseIds.add(record.id)
  }
}

function syncWatches() {
  const cases = [...scenarios.values()]
    .filter((record) => record.query)
    .sort((left, right) => String(left.investigation?.startedAt || left.createdAt || '').localeCompare(String(right.investigation?.startedAt || right.createdAt || '')))
  for (const watch of watches.values()) {
    const related = cases.filter((record) => {
      if (record.watchId === watch.id) return true
      const parsed = parseInvestigationInput(record.query)
      return parsed.repositories.some((repository) => normalizedRepository(repository.url) === watch.repository)
    })
    const latest = related.at(-1)
    const complete = related.filter((record) => record.investigation?.status === 'complete')
    const failed = related.filter((record) => record.investigation?.status === 'failed').at(-1)
    watch.scanCount = complete.length
    watch.latestCaseId = latest?.id || watch.latestCaseId || null
    watch.lastScannedAt = complete.at(-1)?.investigation?.completedAt || watch.lastScannedAt || null
    watch.status = ['running', 'finalizing'].includes(latest?.investigation?.status) ? 'scanning' : latest?.investigation?.status === 'failed' ? 'failed' : 'idle'
    watch.lastError = watch.status === 'failed' ? failed?.investigation?.error || 'Scan failed' : null
    watch.updatedAt = latest?.investigation?.completedAt || latest?.investigation?.startedAt || watch.updatedAt
  }
}

function persistWorkspace() {
  if (!workspacePersistenceEnabled) return
  try {
    syncWatches()
    notifyWorkspaceChanges()
    mkdirSync(dirname(workspaceFile), { recursive: true })
    const temporary = `${workspaceFile}.tmp`
    const records = [...scenarios.values()]
      .filter((record) => record.investigation || record.query)
      .map(serializableRecord)
    writeFileSync(temporary, JSON.stringify({
      schema: 'recoil.workspace/v2',
      createdAt: workspaceState.createdAt,
      updatedAt: new Date().toISOString(),
      lastMonitorAt: workspaceState.lastMonitorAt,
      notifications: workspaceState.notifications,
      processedCaseIds: [...workspaceState.processedCaseIds],
      watches: [...watches.values()],
      records,
    }, null, 2))
    renameSync(temporary, workspaceFile)
  } catch (error) {
    console.warn(`Recoil workspace could not be saved: ${error.message}`)
  }
}

function verdictBucket(verdict) {
  if (verdict === 'REACHED') return 'needs_action'
  if (verdict === 'DECLARED_ONLY') return 'present_only'
  if (verdict === 'NOT_AFFECTED') return 'safe'
  return 'needs_evidence'
}

function caseSummary(record) {
  const investigation = record.investigation || {}
  const report = investigation.report || null
  const findings = report?.repositories || []
  const challenge = report?.challenge || []
  const repositories = findings.map((finding) => {
    const fix = challenge.find((item) => item.repository === finding.repository && (!item.advisoryId || !finding.advisoryId || item.advisoryId === finding.advisoryId))
    return {
      repository: finding.repository,
      repositoryUrl: finding.repositoryUrl,
      advisoryId: finding.advisoryId || report?.advisory?.id || null,
      packageName: finding.packageName || report?.package || null,
      resolvedVersion: finding.resolvedVersion || null,
      verdict: finding.verdict || 'UNKNOWN',
      bucket: verdictBucket(finding.verdict),
      imports: (finding.imports || []).slice(0, 3),
      owners: [...new Set((finding.imports || []).flatMap((item) => item.owners || []))],
      pathObservedAt: finding.pathObservedAt || null,
      exposureDays: finding.exposureDays ?? null,
      fix: fix ? { status: fix.status, proposedVersion: fix.proposedVersion || null, detail: fix.detail || null } : null,
    }
  })
  const graphDelta = report?.rewind?.graphDelta || report?.rewind?.delta?.graph || null
  const scannedRepositories = (investigation.evidence?.repositories || record.ingestion?.repositories || []).map((repository) => ({
    repository: repository.repository,
    repositoryUrl: repository.repositoryUrl || repository.sourceUrl,
    ecosystem: repository.ecosystem || repository.manifest?.ecosystem || null,
    lockfile: repository.manifest?.lockFile || repository.lockFile || null,
    sourceFiles: repository.manifest?.collection?.sourceFiles?.sampled || repository.manifest?.sourceFiles?.length || 0,
    status: repository.status || 'completed',
  }))
  return {
    id: record.id,
    query: record.query || '',
    status: investigation.status || 'idle',
    mode: report?.mode || 'evidence',
    startedAt: investigation.startedAt || record.createdAt || null,
    completedAt: investigation.completedAt || record.updatedAt || null,
    advisoryId: report?.advisory?.id || repositories[0]?.advisoryId || null,
    packageName: report?.package || repositories[0]?.packageName || null,
    summary: report?.summary || { reached: 0, declaredOnly: 0, notAffected: 0, unknown: 0, totalRepositories: repositories.length },
    evidenceReady: Boolean(report?.evidenceQuality?.readyForRecording),
    hydra: publicHydraState(investigation.hydra || record.hydra || {}),
    graph: { nodes: report?.graph?.nodes?.length || record.graph?.nodes?.length || 0, edges: report?.graph?.edges?.length || record.graph?.edges?.length || 0 },
    changes: graphDelta ? {
      addedNodes: graphDelta.addedNodes?.length || graphDelta.added || 0,
      removedNodes: graphDelta.removedNodes?.length || graphDelta.removed || 0,
      addedEdges: graphDelta.addedEdges?.length || 0,
      removedEdges: graphDelta.removedEdges?.length || 0,
    } : null,
    repositories,
    scannedRepositories,
  }
}

function workspaceSnapshot() {
  syncWatches()
  const cases = [...scenarios.values()]
    .filter((record) => record.investigation?.report || record.investigation?.status === 'running' || record.query)
    .map(caseSummary)
    .sort((left, right) => String(right.completedAt || right.startedAt || '').localeCompare(String(left.completedAt || left.startedAt || '')))
  const records = [...scenarios.values()]
  const incidents = buildIncidents(records)
  const repositories = [...watches.values()].map((watch) => {
    const findings = incidents.flatMap((incident) => incident.findings.filter((finding) => finding.repositoryKey === watch.repository))
    const latestCase = cases.find((item) => item.id === watch.latestCaseId)
    return {
      ...watch,
      cases: watch.scanCount,
      advisories: new Set(findings.map((finding) => finding.advisoryId)).size,
      needsAction: findings.filter((finding) => finding.verdict === 'REACHED').length,
      presentOnly: findings.filter((finding) => finding.verdict === 'DECLARED_ONLY').length,
      safe: findings.filter((finding) => finding.verdict === 'NOT_AFFECTED').length,
      needsEvidence: findings.filter((finding) => !['REACHED', 'DECLARED_ONLY', 'NOT_AFFECTED'].includes(finding.verdict)).length,
      sourceFiles: latestCase?.scannedRepositories?.find((item) => normalizedRepository(item.repositoryUrl || item.repository) === watch.repository)?.sourceFiles || 0,
    }
  }).sort((left, right) => String(right.lastScannedAt || right.createdAt || '').localeCompare(String(left.lastScannedAt || left.createdAt || '')))
  const fleetGraph = buildFleetGraph(records, repositories, incidents)
  return {
    schema: 'recoil.workspace-summary/v2',
    workspace: {
      mode: 'single-tenant',
      createdAt: workspaceState.createdAt,
      lastMonitorAt: workspaceState.lastMonitorAt,
      monitor: {
        enabled: watchIntervalMs > 0,
        intervalMs: watchIntervalMs || null,
        nextCheckAt: watchIntervalMs > 0 ? new Date(new Date(workspaceState.lastMonitorAt || monitorStartedAt).getTime() + watchIntervalMs).toISOString() : null,
        notificationWebhook: Boolean(process.env.RECOIL_NOTIFICATION_WEBHOOK_URL),
      },
    },
    cases,
    repositories,
    incidents,
    fleetGraph,
    notifications: workspaceState.notifications.slice(0, 20),
    metrics: {
      cases: cases.length,
      repositories: repositories.length,
      incidents: incidents.length,
      needsAction: incidents.reduce((total, item) => total + item.summary.reached, 0),
      presentOnly: incidents.reduce((total, item) => total + item.summary.declaredOnly, 0),
      safe: incidents.reduce((total, item) => total + item.summary.notAffected, 0),
      needsEvidence: incidents.reduce((total, item) => total + item.summary.unknown, 0),
      graphNodes: fleetGraph.nodes.length,
      graphEdges: fleetGraph.edges.length,
    },
  }
}

function investigationSnapshot(record) {
  const investigation = publicInvestigation(record.investigation)
  const evidence = investigation?.evidence || record.ingestion || { status: 'not_started', collectors: [] }
  const graph = evidence.graph || investigation?.graph || record.graph || { nodes: [], edges: [] }
  const collectors = new Map((evidence.collectors || []).map((collector) => [collector.collector, collector]))
  const sourceStatus = (collectorName) => collectors.get(collectorName)?.status
    || (investigation?.status === 'running' || investigation?.status === 'finalizing' ? 'working' : 'ready')
  return {
    id: record.id,
    scenario: { id: record.id, query: record.query, mode: 'evidence' },
    graph,
    graphProgress: investigation?.graphProgress || { completedRepositories: 0, totalRepositories: 0 },
    events: investigation?.events || [],
    state: { status: investigation?.status || 'idle', step: investigation?.step || 'idle' },
    ingestion: evidence,
    hydra: investigation?.hydra || publicHydraState(),
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
      createdAt: new Date().toISOString(),
      persist: persistWorkspace,
    })
  }
  const record = scenarios.get(id)
  record.persist = persistWorkspace
  return record
}

function resetRecord(record) {
  record.query = ''
  record.ingestion = { status: 'not_started', collectors: [] }
  record.hydra = { status: 'not_started', memoryCount: 0 }
  record.investigation = null
}

function startWatchScan(watch) {
  if (!watch) return { error: 'Repository watch not found', statusCode: 404 }
  if (watch.status === 'scanning') return { error: 'This repository is already being scanned', statusCode: 409 }
  if (activeInvestigationCount() >= maxConcurrentInvestigations) return { error: 'The scanner is at capacity. Try again when another scan completes.', statusCode: 429 }
  const id = randomUUID().slice(0, 8)
  const record = getOrCreate(id, { query: watch.repositoryUrl })
  record.watchId = watch.id
  watch.status = 'scanning'
  watch.latestCaseId = id
  watch.updatedAt = new Date().toISOString()
  watch.lastError = null
  startInvestigation(record, watch.repositoryUrl)
  persistWorkspace()
  return { watch, record }
}

function scanAllWatches() {
  const started = []
  const skipped = []
  workspaceState.lastMonitorAt = new Date().toISOString()
  for (const watch of watches.values()) {
    if (!watch.autoScan || watch.status === 'scanning') {
      skipped.push({ id: watch.id, reason: watch.autoScan ? 'already scanning' : 'automatic scans disabled' })
      continue
    }
    const result = startWatchScan(watch)
    if (result.error) skipped.push({ id: watch.id, reason: result.error })
    else started.push({ watchId: watch.id, caseId: result.record.id, repository: watch.repository })
  }
  persistWorkspace()
  return { checkedAt: workspaceState.lastMonitorAt, started, skipped }
}

async function route(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`)
  if (req.method === 'OPTIONS') return json(res, 204, {})

  if (!url.pathname.startsWith('/api/')) {
    if (serveStatic(req, res, url.pathname)) return undefined
    return json(res, 404, { error: 'Not found' })
  }

  if (req.method === 'GET' && url.pathname === '/api/health') {
    return json(res, 200, {
      ok: true,
      service: 'recoil-api',
      product: 'evidence-proof',
      version: 'evidence-v1',
      mode: 'autonomous',
      hydra: hydraStatus(),
      advisoryScopeAgent: advisoryAgentStatus(),
      recordingContract: {
        requiresAdvisoryId: true,
        requiredVerdicts: ['REACHED', 'DECLARED_ONLY', 'NOT_AFFECTED'],
        requiresHydraPersistence: true,
        requiresHydraMemory: true,
        requiresHydraTemporalRecall: true,
        requiresDatedTemporalFact: true,
        requiresHydraGraphContext: true,
        requiresHydraCurrentGraphVerification: true,
        incompleteHydraWrites: process.env.RECOIL_HYDRA_PERSIST_PARTIAL === '1',
      },
      capabilities: [
        'npm',
        'legacy-npm-lockfile',
        'yarn-lockfile',
        'pnpm-lockfile',
        'workspace-manifests',
        'cargo',
        'osv',
        'repository-evidence',
        'source-reachability',
        'temporal-rewind',
        'fix-proof',
        'hydradb-temporal-memory',
        'evidence-receipt',
        'per-hop-provenance',
        'strict-recording-gate',
        'evidence-brief',
        'persistent-repository-watchlist',
        'workspace-incident-aggregation',
        'scheduled-rescans',
        'workspace-graph-query',
      ],
      time: new Date().toISOString(),
    })
  }

  if (req.method === 'GET' && url.pathname === '/api/scenario') {
    return json(res, 200, snapshot(getOrCreate()))
  }

  if (req.method === 'GET' && url.pathname === '/api/workspace') {
    return json(res, 200, workspaceSnapshot())
  }

  if (req.method === 'GET' && url.pathname === '/api/incidents') {
    return json(res, 200, { incidents: buildIncidents([...scenarios.values()]) })
  }

  const incidentMatch = url.pathname.match(/^\/api\/incidents\/([^/]+)$/)
  if (req.method === 'GET' && incidentMatch) {
    const incidentId = decodeURIComponent(incidentMatch[1]).toUpperCase()
    const incident = buildIncidents([...scenarios.values()]).find((item) => item.id === incidentId)
    if (!incident) return json(res, 404, { error: 'Incident not found' })
    return json(res, 200, { incident, graph: buildIncidentGraph([...scenarios.values()], incidentId) })
  }

  if (req.method === 'POST' && url.pathname === '/api/ask') {
    return body(req).then((payload) => {
      if (typeof payload.question !== 'string' || !payload.question.trim()) return json(res, 422, { error: 'Ask a question about the workspace' })
      return json(res, 200, { answer: answerWorkspaceQuestion(payload.question, workspaceSnapshot(), payload.scope) })
    }).catch((error) => json(res, error.statusCode || 400, { error: error.message }))
  }

  if (req.method === 'POST' && url.pathname === '/api/watches') {
    return body(req).then((payload) => {
      const target = parseInvestigationInput(String(payload.repository || payload.url || ''))
      const repository = target.repositories[0]
      if (!repository) return json(res, 422, { error: 'Provide a public GitHub repository URL' })
      const watch = createWatch(repository.slug, repository.url, { ref: repository.ref, autoScan: payload.autoScan !== false })
      persistWorkspace()
      if (payload.scan === false) return json(res, 201, { watch, workspace: workspaceSnapshot() })
      const result = startWatchScan(watch)
      if (result.error) return json(res, result.statusCode, { error: result.error, watch })
      return json(res, 202, { watch, scenarioId: result.record.id, ...snapshot(result.record) })
    }).catch((error) => json(res, error.statusCode || 400, { error: error.message }))
  }

  const watchMatch = url.pathname.match(/^\/api\/watches\/([^/]+)(?:\/(scan))?$/)
  if (watchMatch && req.method === 'PATCH' && !watchMatch[2]) {
    return body(req).then((payload) => {
      const watch = watches.get(decodeURIComponent(watchMatch[1]))
      if (!watch) return json(res, 404, { error: 'Repository watch not found' })
      if (typeof payload.autoScan !== 'boolean') return json(res, 422, { error: 'Provide autoScan as a boolean' })
      watch.autoScan = payload.autoScan
      watch.updatedAt = new Date().toISOString()
      persistWorkspace()
      return json(res, 200, { watch, workspace: workspaceSnapshot() })
    }).catch((error) => json(res, error.statusCode || 400, { error: error.message }))
  }
  if (watchMatch && req.method === 'POST' && watchMatch[2] === 'scan') {
    const watch = watches.get(decodeURIComponent(watchMatch[1]))
    const result = startWatchScan(watch)
    if (result.error) return json(res, result.statusCode, { error: result.error })
    return json(res, 202, { watch: result.watch, scenarioId: result.record.id, ...snapshot(result.record) })
  }

  if (req.method === 'POST' && url.pathname === '/api/monitor/check') {
    return json(res, 202, scanAllWatches())
  }

  if (req.method === 'POST' && url.pathname === '/api/scenarios') {
    return body(req).then((payload) => {
      const id = payload.id || randomUUID().slice(0, 8)
      persistWorkspace()
      return json(res, 201, { scenarioId: id, ...snapshot(getOrCreate(id, payload)) })
    }).catch((error) => json(res, error.statusCode || 400, { error: error.statusCode ? error.message : 'Invalid JSON body' }))
  }

  const match = url.pathname.match(/^\/api\/scenarios\/([^/]+)(?:\/([^/]+))?$/)
  if (!match) return json(res, 404, { error: 'Not found' })

  const [, id, action] = match
  const record = getOrCreate(id)

  if (req.method === 'GET' && !action) return json(res, 200, snapshot(record))

  if (req.method === 'GET' && action === 'investigation') {
    return json(res, 200, { scenarioId: record.id, investigation: publicInvestigation(record.investigation) })
  }

  if (req.method === 'POST' && action === 'investigate') {
    return body(req).then((payload) => {
      if (typeof payload.query !== 'string' || !payload.query.trim()) {
        return json(res, 422, { error: 'Provide a public GitHub repository URL, or an advisory/package plus a repository URL' })
      }
      if (payload.query.length > 10_000) {
        return json(res, 413, { error: 'Investigation input is too large' })
      }
      const target = parseInvestigationInput(payload.query)
      if (!target.advisoryId && !target.packageName && target.repositories.length === 0) {
        return json(res, 422, { error: 'Provide a public GitHub repository URL, or an advisory/package selector plus one' })
      }
      if (target.repositories.length === 0) {
        return json(res, 422, { error: 'Add at least one public GitHub repository URL so Recoil can prove reachability' })
      }
      if (['running', 'finalizing'].includes(record.investigation?.status)) {
        return json(res, 409, { error: 'An investigation is already running for this case' })
      }
      if (activeInvestigationCount() >= maxConcurrentInvestigations) {
        return json(res, 429, { error: 'The public demo is at capacity. Try again when another scan completes.' })
      }
      if (!consumeScanBudget(req)) {
        return json(res, 429, { error: 'This public demo has reached its scan limit. Try again later.' })
      }
      record.ingestion = { status: 'not_started', collectors: [] }
      record.hydra = { status: 'not_started', memoryCount: 0 }
      for (const repository of target.repositories) createWatch(repository.slug, repository.url, { ref: repository.ref })
      startInvestigation(record, payload.query)
      persistWorkspace()
      return json(res, 202, snapshot(record))
    }).catch((error) => json(res, error.statusCode || 400, { error: error.statusCode ? error.message : 'Invalid JSON body' }))
  }

  if (req.method === 'POST' && action === 'rewind') {
    return body(req).then((payload) => {
      const asOf = typeof payload.asOf === 'string' ? payload.asOf : new Date().toISOString()
      return rewindInvestigation(record, asOf).then((result) => json(res, result.error ? 409 : 200, { scenarioId: record.id, report: result.report, hydra: publicHydraRecall(result.hydra), error: result.error }))
    }).catch((error) => json(res, error.statusCode || 400, { error: error.message }))
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

  if (req.method === 'GET' && action === 'brief') {
    const brief = buildEvidenceBrief({
      scenarioId: record.investigation?.caseId || record.id,
      query: record.query,
      report: record.investigation?.report,
      hydra: record.investigation?.hydra || record.hydra,
    })
    if (!brief) return json(res, 202, { scenarioId: record.id, brief: null, error: 'Investigation report is not ready' })
    return downloadText(res, 200, `recoil-${record.investigation?.caseId || record.id}-evidence-brief.md`, 'text/markdown', brief)
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
    persistWorkspace()
    return json(res, 200, snapshot(record))
  }

  return json(res, 404, { error: 'Not found' })
}

function findScenario(id) {
  return scenarios.get(id) || null
}

export { route, getOrCreate, findScenario, snapshot, workspaceSnapshot }

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
    persistWorkspace()
    console.log(`Recoil API listening on http://${host}:${port}`)
    if (watchIntervalMs > 0) {
      console.log(`Repository monitor enabled every ${watchIntervalMs}ms`)
      const timer = setInterval(() => scanAllWatches(), Math.max(60_000, watchIntervalMs))
      timer.unref()
    }
  })
}
