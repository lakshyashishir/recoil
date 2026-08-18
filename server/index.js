import http from 'node:http'
import { randomUUID } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
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
  getReachability,
  startDefenseRound,
  toggleAction,
} from '../src/core/scenario.js'
import { runIngestion } from './collectors.js'
import { createArenaState, stepArena } from '../src/core/arena.js'
import { hydraStatus, persistArenaRound, persistDecision, persistEvaluation, persistIngestion, pollIngestion, recall } from './hydra.js'
import { getAgentStatus, runAgentRound } from './agents.js'
import { applySandboxControl, createSandboxState, runRegressionSuite, sandboxSummary } from '../sandbox/fixture.js'
import { rewindInvestigation, startInvestigation } from './investigation.js'
import { advisoryAgentStatus } from './advisory-agent.js'
import { buildEvidenceReceipt } from '../src/core/receipt.js'

const port = Number(process.env.RECOIL_PORT || 8787)
const scenarios = new Map()

function buildGraph(ingestion) {
  const packageName = ingestion?.package || 'ua-parser-js'
  const repository = ingestion?.collectors?.find((collector) => collector.collector === 'repository-extractor')
  const ecosystem = repository?.ecosystem || 'npm'
  const requestedRepository = ingestion?.target?.repository?.slug || ingestion?.target?.repository?.url
  const resolvedVersion = repository?.manifest?.resolved?.[packageName] || ingestion?.target?.version || 'unresolved'
  const registry = ingestion?.collectors?.find((collector) => collector.collector === 'registry-resolver')
  const advisory = ingestion?.target?.advisoryId || registry?.latest || 'advisory target'
  const nodes = NODES.map((node) => {
      if (node.id === 'release') return { ...node, label: `${packageName}@${resolvedVersion}`, meta: advisory === 'CVE-2021-4229' ? 'compromised release' : 'resolved package target' }
      if (node.id === 'registry') return { ...node, label: ecosystem === 'cargo' ? 'crates.io registry' : 'npm registry', meta: 'public package source' }
      if (node.id === 'resolver') return { ...node, label: ecosystem === 'cargo' ? 'Cargo resolver' : 'npm semver resolver', meta: ecosystem === 'cargo' ? 'Cargo dependency resolution' : 'transitive resolution' }
      if (node.id === 'lockfile') return { ...node, label: repository?.manifest?.lockfile || (ecosystem === 'cargo' ? 'Cargo manifest' : 'package lockfile'), meta: repository?.manifest?.lockfile ? 'resolved dependency evidence' : 'range-based dependency evidence' }
      if (node.id === 'maintainer' && registry?.maintainers?.[0]) return { ...node, label: `maintainer: ${registry.maintainers[0]}`, meta: 'registry publisher' }
      if (node.id === 'repo') {
        if (repository?.status === 'failed') return { ...node, label: requestedRepository || 'repository unavailable', meta: 'collection failed' }
        return { ...node, label: repository?.repository || 'fixture / storefront-api', meta: repository?.synthetic ? 'synthetic demo repo' : 'public repository' }
      }
      return node
  })
  const edges = [...EDGES]
  const radius = { lockfilePackages: 0, transitiveAvailable: 0, transitiveIncluded: 0 }
  const manifest = repository?.manifest
  if (repository && !repository.synthetic && manifest) {
    const manifestId = 'manifest:observed'
    nodes.push({ id: manifestId, label: `${repository.repository} manifest`, type: 'repo', meta: manifest.lockfile ? 'public lockfile' : 'public package.json', x: 36, y: 14, activeAt: 4 })
    edges.push(['repo', manifestId], [manifestId, 'repo'])
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
    const directNames = new Set(Object.keys(manifest.dependencies || {}))
    const directIds = new Map(Object.keys(manifest.dependencies || {}).map((name) => [name, `dependency:${name}`]))
    const transitivePackages = (manifest.lockPackages || [])
      .filter((item) => item?.name && !directNames.has(item.name))
      .slice(0, 12)
    radius.lockfilePackages = manifest.lockPackages?.length || 0
    radius.transitiveAvailable = (manifest.lockPackages || []).filter((item) => item?.name && !directNames.has(item.name)).length
    radius.transitiveIncluded = transitivePackages.length
    const transitiveIds = new Map(transitivePackages.map((item) => [item, `lock:${item.name}@${item.version}`]))
    transitivePackages.forEach((item, index) => {
      const id = transitiveIds.get(item)
      nodes.push({
        id,
        label: `${item.name}@${item.version}`,
        type: 'package',
        meta: 'lockfile transitive dependency',
        role: 'transitive-dependency',
        x: 34 + ((index % 6) * 11),
        y: 6 + (Math.floor(index / 6) * 17),
        activeAt: 4,
      })
      edges.push([manifestId, id])
      const parent = item.dependencies?.map((name) => {
        if (directIds.has(name)) return directIds.get(name)
        const matchingPackage = transitivePackages.find((candidate) => candidate.name === name)
        return matchingPackage ? transitiveIds.get(matchingPackage) : null
      }).find((candidate) => candidate && nodes.some((node) => node.id === candidate))
      if (parent) edges.push([parent, id])
    })
    if (manifest.ciSignals?.workflowFiles?.length) {
      const ciId = 'observed:ci'
      nodes.push({ id: ciId, label: `GitHub Actions · ${manifest.ciSignals.workflowFiles.length}`, type: 'infra', meta: manifest.ciSignals.runners.join(', ') || 'workflow evidence', x: 36, y: 88, activeAt: 5 })
      edges.push(['repo', ciId], [ciId, 'ci'])
    }
    if (manifest.deploymentSignals?.length) {
      const runtimeId = 'observed:runtime'
      nodes.push({ id: runtimeId, label: `${manifest.deploymentSignals.length} container manifest${manifest.deploymentSignals.length > 1 ? 's' : ''}`, type: 'artifact', meta: 'repository evidence', x: 64, y: 94, activeAt: 6 })
      edges.push(['repo', runtimeId], [runtimeId, 'artifact'])
    }
    if (manifest.codeGraph?.nodes?.length) {
      const changedPaths = new Set((manifest.codeGraph.recentChange?.files || []).map((file) => file.path))
      const codeNodes = manifest.codeGraph.nodes.map((node) => changedPaths.has(node.label)
        ? { ...node, changed: true, meta: `${node.meta} · latest public change` }
        : node)
      nodes.push(...codeNodes)
      edges.push(['repo', codeNodes[0].id], ...manifest.codeGraph.edges)
    }
  }
  return { nodes, edges, radius }
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
  const plans = evaluateInterventions(record.state, record.graph.nodes, record.graph.edges)
  const recommended = plans[0]
  const peakState = { ...record.state, eventIndex: record.events.length }
  const reachability = getReachability(peakState, record.graph.nodes, record.graph.edges)
  const arenaReachability = record.arena
    ? getReachability({ ...peakState, selectedActions: record.arena.selectedActions }, record.graph.nodes, record.graph.edges)
    : reachability
  const simulationComplete = record.arena
    ? ['contained', 'breached', 'exhausted'].includes(record.arena.status)
    : record.state.eventIndex >= record.events.length
  const baselineReachability = getReachability({ ...peakState, selectedActions: [] }, record.graph.nodes, record.graph.edges)
  const activeNodeIds = arenaReachability.activeNodeIds
  const sources = (ingestion.collectors || []).flatMap((collector) => [collector.sourceUrl, ...(collector.sources || []).map((source) => source.url)]).filter(Boolean)
  return {
    scenarioId: record.id,
    query: record.query,
    conclusion: ingestion.status === 'completed'
      ? record.arena?.status === 'contained'
        ? `${ingestion.package || 'Target'} was traced from public ecosystem evidence into a bounded deployment model. The adaptive red/blue episode contained the modeled high-value paths in ${record.arena.round} rounds. This is a modeled result, not proof of compromise.`
        : `${ingestion.package || 'Target'} was traced from public ecosystem evidence into a bounded deployment model. ${arenaReachability.reachableTargetIds.length ? 'A residual high-value route remains after the selected controls.' : 'The selected controls sever the modeled high-value paths.'} This is a modeled result, not proof of compromise.`
      : 'The investigation is incomplete; the available evidence does not support a complete conclusion.',
    observed: {
      package: ingestion.package || null,
      ecosystem: repository?.ecosystem || 'npm',
      advisory: ingestion.target?.advisoryId || null,
      advisoryRecord: advisory?.targetAdvisory ? { id: advisory.targetAdvisory.id, summary: advisory.targetAdvisory.summary, references: advisory.targetAdvisory.references?.length || 0 } : null,
      affectedVersions: registry?.affectedVersions || [],
      fixedVersions: registry?.fixedVersions || [],
      repository: repository?.repository || ingestion.target?.repository?.slug || null,
      repositorySynthetic: repository?.synthetic ?? null,
      resolvedVersion: repository?.manifest?.resolved?.[ingestion.package] || null,
      ciSignals: repository?.manifest?.ciSignals || null,
      deploymentSignals: repository?.manifest?.deploymentSignals || [],
      codeGraph: repository?.manifest?.codeGraph ? {
        files: repository.manifest.codeGraph.fileCount,
        imports: repository.manifest.codeGraph.importEdgeCount,
        symbols: repository.manifest.codeGraph.symbolCount,
        surfaces: repository.manifest.codeGraph.surfaceCount,
        impactCandidates: repository.manifest.codeGraph.impactCandidates,
        recentChange: repository.manifest.codeGraph.recentChange,
        unresolved: repository.manifest.codeGraph.unresolved?.length || 0,
      } : null,
      lockfilePackageCount: repository?.manifest?.lockPackages?.length || 0,
      transitiveDependencyCount: record.graph.radius?.transitiveAvailable || 0,
    },
    modeled: {
      graphNodes: record.graph.nodes.length,
      graphEdges: record.graph.edges.length,
      activeNodes: activeNodeIds.length,
      reachableExposure: arenaReachability.exposure,
      eventCount: record.events.length,
      defenseRounds: record.round || 0,
      simulationComplete,
      evidenceComplete: ingestion.status === 'completed',
      completed: simulationComplete && ingestion.status === 'completed',
      mode: ingestion.status === 'completed' ? 'evidence-backed-model' : 'modeled-only',
      reachableTargets: arenaReachability.reachableTargetIds,
      primaryPath: arenaReachability.primaryPath,
      alternatePaths: arenaReachability.alternatePaths,
      baselineExposure: baselineReachability.exposure,
      baselinePath: baselineReachability.primaryPath,
      baselineAlternatePaths: baselineReachability.alternatePaths,
      baselineTargets: baselineReachability.reachableTargetIds,
      blockedNodes: arenaReachability.blockedNodeIds,
      graphRadius: record.graph.radius || null,
    },
    arena: record.arena,
    recommendation: recommended,
    responsePlans: plans.slice(0, 6),
    uncertainty: [
      repository?.synthetic ? 'Deployment and service fan-out are synthetic demo records.' : 'Service and data fan-out is modeled; repository evidence is not a runtime inventory.',
      registry?.status === 'not_found' ? `No published ${repository?.ecosystem === 'cargo' ? 'crate' : 'package'} registry record was found; repository files are the primary evidence.` : null,
      repository?.status === 'failed' ? `Repository evidence collection failed: ${repository.error || 'unknown error'}.` : null,
      repository && !repository.manifest?.lockfile ? 'The public repository did not expose a lockfile; dependency resolution is range-based.' : null,
      record.graph.radius?.transitiveAvailable > record.graph.radius?.transitiveIncluded
        ? `The graph includes ${record.graph.radius.transitiveIncluded} of ${record.graph.radius.transitiveAvailable} available transitive lockfile packages to keep the live view bounded.`
        : null,
      repository?.manifest?.codeGraph?.unresolved?.length
        ? `${repository.manifest.codeGraph.unresolved.length} local source imports could not be resolved inside the bounded public-file sample.`
        : null,
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

function downloadJson(res, status, filename, payload) {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-disposition': `attachment; filename="${filename}"`,
    'access-control-allow-origin': '*',
    'access-control-allow-headers': 'content-type',
  })
  res.end(JSON.stringify(payload, null, 2))
}

function snapshot(record) {
  if (record.mode === 'evidence') return investigationSnapshot(record)
  const state = record.state
  const arenaState = record.arena
    ? { ...state, eventIndex: Math.max(10, ...record.graph.nodes.map((node) => node.activeAt || 0)), selectedActions: record.arena.selectedActions }
    : state
  const reachability = getReachability(arenaState, record.graph.nodes, record.graph.edges)
  const exposure = reachability.exposure
  const collectors = new Map((record.ingestion?.collectors || []).map((collector) => [collector.collector, collector]))
  const repositoryCollector = collectors.get('repository-extractor')
  const registryLabel = repositoryCollector?.ecosystem === 'cargo' ? 'crates.io registry' : 'npm registry'
  const sourceStatus = (collectorName) => collectors.get(collectorName)?.status || (record.ingestion?.status === 'running' ? 'working' : 'ready')
  return {
    id: record.id,
    scenario: { ...SCENARIO, query: record.query, mode: record.mode, round: record.round || 0 },
    graph: {
      ...record.graph,
      activeNodeIds: reachability.activeNodeIds,
      blockedNodeIds: reachability.blockedNodeIds,
      primaryPath: reachability.primaryPath,
      alternatePaths: reachability.alternatePaths,
      reachableTargetIds: reachability.reachableTargetIds,
      exposure: reachability.exposure,
    },
    events: record.events,
    interventions: INTERVENTIONS,
    state,
    metrics: record.arena
      ? {
          exposure,
          contained: 100 - exposure,
          eventIndex: state.eventIndex,
          round: record.arena.round,
          attackMoves: record.arena.metrics.attackMoves,
          defenseMoves: record.arena.metrics.defenseMoves,
          complete: ['contained', 'breached', 'exhausted'].includes(record.arena.status),
        }
      : { exposure, contained: 100 - exposure, eventIndex: state.eventIndex, complete: state.eventIndex >= (record.events?.length || EVENTS.length) },
    ingestion: record.ingestion,
    hydra: record.hydra,
    arena: record.arena,
    sandbox: sandboxSummary(record.sandbox),
    investigation: record.investigation,
    sources: [
      { id: 'osv', label: 'OSV advisory', type: 'advisory', status: sourceStatus('advisory-resolver') },
      { id: 'registry', label: registryLabel, type: 'registry', status: sourceStatus('registry-resolver') },
      { id: 'incident', label: 'Incident sources', type: 'research', status: sourceStatus('incident-researcher') },
      { id: 'github', label: 'Repository manifest', type: 'repository', status: sourceStatus('repository-extractor') },
      { id: 'hydra', label: 'HydraDB memory graph', type: 'memory', status: record.hydra?.status || 'ready' },
    ],
  }
}

function investigationSnapshot(record) {
  const investigation = record.investigation
  const evidence = investigation?.evidence || record.ingestion || { status: 'not_started', collectors: [] }
  const graph = evidence.graph || { nodes: [], edges: [] }
  const collectors = new Map((evidence.collectors || []).map((collector) => [collector.collector, collector]))
  const sourceStatus = (collectorName) => collectors.get(collectorName)?.status || (investigation?.status === 'running' || investigation?.status === 'finalizing' ? 'working' : 'ready')
  return {
    id: record.id,
    scenario: { id: record.id, query: record.query, mode: 'evidence', round: 0 },
    graph,
    events: investigation?.events || [],
    interventions: [],
    state: { status: investigation?.status || 'idle', step: investigation?.step || 'idle' },
    metrics: null,
    ingestion: evidence,
    hydra: investigation?.hydra || { status: 'not_started', memoryCount: 0 },
    arena: null,
    sandbox: null,
    investigation,
    sources: [
      { id: 'osv', label: 'OSV advisory', type: 'advisory', status: sourceStatus('advisory-resolver') },
      { id: 'registry', label: evidence.registry?.ecosystem === 'cargo' ? 'crates.io registry' : 'npm registry', type: 'registry', status: sourceStatus('registry-resolver') },
      ...((evidence.repositories || []).map((repository) => ({ id: `github:${repository.repository}`, label: repository.repository, type: 'repository', status: repository.status || 'ready' }))),
      { id: 'hydra', label: 'HydraDB temporal memory', type: 'memory', status: investigation?.hydra?.status || 'ready' },
    ],
  }
}

function getOrCreate(id = '0017', body = {}) {
  if (!scenarios.has(id)) {
    scenarios.set(id, {
      id,
      query: body.query || SCENARIO.query,
      mode: 'evidence',
      state: createInitialState(),
      graph: { nodes: NODES, edges: EDGES },
      events: EVENTS,
      round: 0,
      ingestion: { status: 'not_started', collectors: [] },
      hydra: { status: 'not_started', memoryCount: 0, recall: null },
      arena: null,
      sandbox: createSandboxState(),
      investigation: null,
    })
  }
  return scenarios.get(id)
}

async function body(req) {
  let raw = ''
  for await (const chunk of req) raw += chunk
  return raw ? JSON.parse(raw) : {}
}

async function route(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`)
  if (req.method === 'OPTIONS') return json(res, 204, {})
  if (req.method === 'GET' && url.pathname === '/api/health') {
    return json(res, 200, { ok: true, service: 'recoil-api', product: 'evidence-proof', version: 'evidence-v1', mode: 'autonomous', hydra: hydraStatus(), legacyArenaAgents: { ...getAgentStatus(), status: 'retired-from-evidence-path' }, advisoryScopeAgent: advisoryAgentStatus(), capabilities: ['npm', 'cargo', 'osv', 'repository-evidence', 'source-reachability', 'temporal-rewind', 'fix-proof', 'hydradb-temporal-memory', 'evidence-receipt'], time: new Date().toISOString() })
  }
  if (req.method === 'GET' && url.pathname === '/api/scenario') return json(res, 200, snapshot(getOrCreate()))
  if (req.method === 'POST' && url.pathname === '/api/scenarios') {
    return body(req).then((payload) => {
      const id = payload.id || randomUUID().slice(0, 8)
      const record = getOrCreate(id, payload)
      return json(res, 201, snapshot(record))
    }).catch(() => json(res, 400, { error: 'Invalid JSON body' }))
  }

  const scenarioMatch = url.pathname.match(/^\/api\/scenarios\/([^/]+)(?:\/([^/]+)(?:\/([^/]+))?)?$/)
  if (scenarioMatch) {
    const [, id, action, subaction] = scenarioMatch
    const operation = subaction ? `${action}/${subaction}` : action
    const record = getOrCreate(id)
    if (req.method === 'GET' && !action) return json(res, 200, snapshot(record))
    if (req.method === 'GET' && action === 'investigation') return json(res, 200, { scenarioId: record.id, investigation: record.investigation })
    if (req.method === 'POST' && action === 'investigate') {
      return body(req).then((payload) => {
        if (typeof payload.query !== 'string' || !payload.query.trim()) return json(res, 422, { error: 'Provide an advisory, package, or public GitHub repositories' })
        if (['running', 'finalizing'].includes(record.investigation?.status)) return json(res, 409, { error: 'An investigation is already running for this case' })
        record.mode = 'evidence'
        record.state = createInitialState()
        record.graph = { nodes: [], edges: [] }
        record.events = []
        record.round = 0
        record.ingestion = { status: 'not_started', collectors: [] }
        record.hydra = { status: 'not_started', memoryCount: 0, recall: null }
        record.arena = null
        record.sandbox = createSandboxState()
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
    if (record.mode === 'evidence' && action && !['investigation', 'investigate', 'rewind', 'code-graph', 'graph', 'report', 'receipt'].includes(action)) {
      return json(res, 410, { error: 'Legacy arena endpoint retired; use /investigate and /rewind for the evidence product.' })
    }
    if (record.mode === 'evidence' && req.method === 'GET' && action === 'report') {
      return json(res, record.investigation?.report ? 200 : 202, { scenarioId: record.id, report: record.investigation?.report || null })
    }
    if (record.mode === 'evidence' && req.method === 'GET' && action === 'receipt') {
      const receipt = buildEvidenceReceipt({
        scenarioId: record.investigation?.caseId || record.id,
        query: record.query,
        report: record.investigation?.report,
        hydra: record.investigation?.hydra || record.hydra,
      })
      if (!receipt) return json(res, 202, { scenarioId: record.id, receipt: null, error: 'Investigation report is not ready' })
      return downloadJson(res, 200, `recoil-${record.investigation?.caseId || record.id}-evidence-receipt.json`, receipt)
    }
    if (req.method === 'GET' && action === 'events') return json(res, 200, { scenarioId: record.id, events: record.events, state: record.state })
    if (req.method === 'GET' && action === 'graph') return json(res, 200, { scenarioId: record.id, graph: snapshot(record).graph })
    if (req.method === 'GET' && action === 'code-graph') {
      const repository = record.ingestion?.collectors?.find((collector) => collector.collector === 'repository-extractor')
      return json(res, 200, { scenarioId: record.id, codeGraph: repository?.manifest?.codeGraph || null })
    }
    if (req.method === 'GET' && action === 'report') return json(res, 200, buildReport(record))
    if (req.method === 'POST' && action === 'reset') {
      record.state = createInitialState()
      record.graph = { nodes: NODES, edges: EDGES }
      record.events = EVENTS
      record.round = 0
      record.ingestion = { status: 'not_started', collectors: [] }
      record.hydra = { status: 'not_started', memoryCount: 0, recall: null }
      record.arena = null
      record.sandbox = createSandboxState()
      record.investigation = null
      return json(res, 200, snapshot(record))
    }
    if (req.method === 'POST' && action === 'ingest') {
      record.state = { ...createInitialState(), running: true }
      record.round = 0
      record.ingestion = { status: 'running', collectors: [] }
      record.hydra = { status: 'running', memoryCount: 0, recall: null }
      record.sandbox = createSandboxState()
      return runIngestion({ query: record.query, scenarioId: record.id }).then((result) => {
        record.ingestion = result
        record.graph = buildGraph(result)
        record.events = buildEvents(result)
        record.arena = createArenaState({
          scenarioId: record.id,
          query: record.query,
          packageName: result.package,
          graphNodes: record.graph.nodes,
          graphEdges: record.graph.edges,
        })
        return persistIngestion({ ...result, graph: record.graph, events: record.events }).then((persisted) => {
          record.hydra = { ...record.hydra, ...persisted, persistedAt: persisted.status === 'persisted' ? new Date().toISOString() : null }
          return json(res, 200, snapshot(record))
        }).catch((error) => {
          record.hydra = { status: 'failed', memoryCount: 0, error: error.message, recall: null }
          return json(res, 200, snapshot(record))
        })
      })
    }
    if (req.method === 'GET' && operation === 'arena') return json(res, 200, { scenarioId: record.id, arena: record.arena, graph: snapshot(record).graph, hydra: record.hydra })
    if (req.method === 'POST' && operation === 'arena/start') {
      if (!record.ingestion || record.ingestion.status === 'not_started') return json(res, 409, { error: 'Collect evidence before starting the arena' })
      return recall(record.query, undefined, record.id, { allEpisodes: true }).catch((error) => ({ status: 'failed', error: error.message, chunks: [] })).then((arenaRecall) => {
        record.hydra = { ...record.hydra, arenaRecall }
        record.arena = createArenaState({
          scenarioId: record.id,
          query: record.query,
          packageName: record.ingestion.package,
          graphNodes: record.graph.nodes,
          graphEdges: record.graph.edges,
          memory: arenaRecall,
        })
        record.arena = { ...record.arena, status: 'running', phase: 'red' }
        return json(res, 200, snapshot(record))
      })
    }
    if (req.method === 'POST' && operation === 'arena/step') {
      if (!record.arena) return json(res, 409, { error: 'Start the arena after collecting evidence' })
      if (['contained', 'breached', 'exhausted'].includes(record.arena.status)) return json(res, 200, snapshot(record))
      const previous = record.arena
      const deterministic = stepArena(previous, record.graph.nodes, record.graph.edges, { memory: record.hydra?.arenaRecall })
      const fallback = { redPath: deterministic.lastRound.red.path, blueAction: deterministic.lastRound.blue.action }
      let agentRound
      try {
        agentRound = await runAgentRound({
          state: previous,
          graphNodes: record.graph.nodes,
          graphEdges: record.graph.edges,
          memory: record.hydra?.arenaRecall,
          sandbox: record.sandbox,
          evidence: record.ingestion,
          packageName: record.ingestion?.package || 'target',
          query: record.query,
          scenarioId: record.id,
          fallback,
        })
      } catch (error) {
        agentRound = { mode: 'deterministic-fallback', policy: fallback, red: { trace: [], reason: `Red fallback: ${error.message}` }, blue: { trace: [], reason: `Blue fallback: ${error.message}` } }
      }
      const next = stepArena(previous, record.graph.nodes, record.graph.edges, { memory: record.hydra?.arenaRecall, policy: agentRound.policy })
      const sandboxControl = applySandboxControl(record.sandbox, next.lastRound.blue.action)
      const sandboxRegression = runRegressionSuite(record.sandbox)
      const sandboxRound = {
        probe: agentRound.probe || null,
        control: sandboxControl,
        regression: sandboxRegression,
        summary: sandboxSummary(record.sandbox),
      }
      const agentTrace = {
        mode: agentRound.mode,
        red: agentRound.red,
        blue: agentRound.blue,
      }
      record.arena = {
        ...next,
        agentMode: agentRound.mode,
        agents: agentTrace,
        lastRound: { ...next.lastRound, agentMode: agentRound.mode, agents: agentTrace, sandbox: sandboxRound },
      }
      const round = record.arena.lastRound
      const terminal = ['contained', 'breached', 'exhausted'].includes(record.arena.status)
      const plans = terminal ? evaluateInterventions(record.state, record.graph.nodes, record.graph.edges) : []
      record.hydra = { ...record.hydra, arenaPersistStatus: 'queued' }
      persistArenaRound({
        scenarioId: record.id,
        queryText: record.query,
        packageName: record.ingestion?.package || 'target',
        round: round.round,
        red: round.red,
        blue: round.blue,
        before: round.before,
        after: round.after,
        status: round.status,
      }).then((persisted) => {
        const planPromise = terminal && plans[0]
          ? persistEvaluation({ scenarioId: record.id, queryText: record.query, recommended: plans[0], alternatives: plans.slice(0, 6) }).catch((error) => ({ status: 'failed', error: error.message, memoryCount: 0 }))
          : Promise.resolve(null)
        return planPromise.then((planPersisted) => {
          record.hydra = {
            ...record.hydra,
            arenaPersistStatus: persisted.status === 'failed' ? 'failed' : 'persisted',
            arenaLastRound: persisted,
            arenaPlan: planPersisted,
            arenaMemoryCount: (record.hydra.arenaMemoryCount || 0) + (persisted.memoryCount || 0) + (planPersisted?.memoryCount || 0),
          }
        })
      }).catch((error) => {
        record.hydra = { ...record.hydra, arenaPersistStatus: 'failed', arenaError: error.message }
      })
      return json(res, 200, snapshot(record))
    }
    if (req.method === 'POST' && operation === 'arena/reset') {
      if (!record.ingestion || record.ingestion.status === 'not_started') return json(res, 409, { error: 'Collect evidence before resetting the arena' })
      record.arena = createArenaState({
        scenarioId: record.id,
        query: record.query,
        packageName: record.ingestion.package,
        graphNodes: record.graph.nodes,
        graphEdges: record.graph.edges,
        memory: record.hydra?.arenaRecall,
      })
      record.sandbox = createSandboxState()
      return json(res, 200, snapshot(record))
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
    if (req.method === 'POST' && action === 'hydra-status') {
      return pollIngestion(record.hydra?.sourceIds || []).then((status) => {
        record.hydra = { ...record.hydra, ...status, persistedAt: status.status === 'persisted' ? new Date().toISOString() : record.hydra.persistedAt || null }
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
        const wasComplete = record.state.eventIndex >= record.events.length
        if (wasComplete) {
          const round = startDefenseRound(record.state, record.events, payload.id, record.graph.nodes, record.graph.edges)
          record.state = round.state
          record.events = round.events
          record.round = round.round
        }
        const decisionReachability = getReachability(record.state, record.graph.nodes, record.graph.edges)
        return persistDecision({
          scenarioId: record.id,
          queryText: record.query,
          action: payload.id,
          selectedActions: record.state.selectedActions,
          exposure: decisionReachability.exposure,
          activeNodeIds: decisionReachability.activeNodeIds,
          blockedNodeIds: decisionReachability.blockedNodeIds,
          attackPath: decisionReachability.primaryPath,
          alternatePaths: decisionReachability.alternatePaths,
          controlEnabled: record.state.selectedActions.includes(payload.id),
          round: record.round || 0,
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
        record.graph = { nodes: NODES, edges: EDGES }
        record.events = EVENTS
        record.round = 0
        record.ingestion = { status: 'not_started', collectors: [] }
        record.hydra = { status: 'not_started', memoryCount: 0, recall: null }
        record.arena = null
        record.sandbox = createSandboxState()
        record.investigation = null
        return json(res, 202, snapshot(record))
      }).catch(() => json(res, 400, { error: 'Invalid JSON body' }))
    }
    if (req.method === 'POST' && action === 'advance') {
      record.state = advanceState(record.state, record.events.length)
      return json(res, 200, snapshot(record))
    }
    if (req.method === 'POST' && action === 'evaluate') {
      const plans = evaluateInterventions(record.state, record.graph.nodes, record.graph.edges)
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

  server.listen(port, '127.0.0.1', () => {
    console.log(`Recoil API listening on http://127.0.0.1:${port}`)
  })
}
