import { EDGES, NODES, createEvents } from '../src/core/scenario.js'

const DEFAULT_API_URL = 'https://api.hydradb.com'
const MAX_MEMORY_CHARS = 2200

function databaseId() {
  return process.env.HYDRADB_DATABASE_ID || ''
}

function collectionId() {
  return process.env.HYDRADB_COLLECTION_ID || 'recoil'
}

function apiBase() {
  return process.env.HYDRADB_API_URL || process.env.HYDRADB_API_BASE || DEFAULT_API_URL
}

function enabled() {
  return Boolean(process.env.HYDRA_DB_API_KEY && databaseId())
}

function headers(json = true) {
  return {
    authorization: `Bearer ${process.env.HYDRA_DB_API_KEY}`,
    ...(json ? { 'content-type': 'application/json' } : {}),
  }
}

function errorMessage(payload, response) {
  return payload?.detail?.message || payload?.detail || payload?.message || response.statusText
}

function unwrap(payload) {
  return payload?.data?.inner || payload?.data || payload
}

function annotateIndexing(result) {
  const statuses = result?.results || []
  const completed = statuses.length > 0 && statuses.every((item) => ['completed', 'complete'].includes(item.status))
  return { ...result, indexingStatus: completed ? 'completed' : 'queued' }
}

function normalizeIndexingStatus(payload) {
  const value = unwrap(payload)
  return String(value?.indexing_status || value?.indexingStatus || value?.status || value?.state || '').toLowerCase()
}

async function ingest(memories, signal) {
  const results = []
  let lastResult = {}
  for (let offset = 0; offset < memories.length; offset += 1) {
    const batch = memories.slice(offset, offset + 1)
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const form = new FormData()
      form.append('database', databaseId())
      form.append('collection', collectionId())
      form.append('type', 'memory')
      form.append('memories', JSON.stringify(batch))
      form.append('upsert', 'true')

      const response = await fetch(`${apiBase()}/context/ingest`, {
        method: 'POST',
        headers: headers(false),
        body: form,
        signal,
      })
      const payload = await response.json().catch(() => ({}))
      if (response.ok) {
        lastResult = unwrap(payload)
        if (Array.isArray(lastResult.results)) results.push(...lastResult.results)
        break
      }

      const retryable = [429, 500, 502, 503, 504].includes(response.status)
      if (!retryable || attempt === 2) throw new Error(`${response.status}: ${errorMessage(payload, response)}`)
      await new Promise((resolve) => setTimeout(resolve, 250 * (2 ** attempt)))
    }
  }
  return annotateIndexing({ ...lastResult, results })
}

async function query(body, signal) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const response = await fetch(`${apiBase()}/query`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify(body),
      signal,
    })
    const payload = await response.json().catch(() => ({}))
    if (response.ok) return unwrap(payload)

    const retryable = [429, 500, 502, 503, 504].includes(response.status)
    if (!retryable || attempt === 2) throw new Error(`${response.status}: ${errorMessage(payload, response)}`)
    await new Promise((resolve) => setTimeout(resolve, 250 * (2 ** attempt)))
  }
  throw new Error('HydraDB query failed after retries')
}

function stableId(value) {
  let hash = 2166136261
  for (const character of value) {
    hash ^= character.charCodeAt(0)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(16)
}

function memory({ id, title, text, additionalMetadata = {} }) {
  return {
    id,
    source_id: id,
    title,
    text,
    is_markdown: true,
    infer: true,
    metadata: { app: 'recoil' },
    additional_metadata: additionalMetadata,
  }
}

function chunkMemory(item, maxChars = MAX_MEMORY_CHARS) {
  if (item.text.length <= maxChars) return [item]
  const chunks = []
  let remaining = item.text
  while (remaining.length > maxChars) {
    const boundary = remaining.lastIndexOf('\n', maxChars)
    const splitAt = boundary > Math.floor(maxChars * 0.55) ? boundary : maxChars
    chunks.push(remaining.slice(0, splitAt))
    remaining = remaining.slice(splitAt).replace(/^\n+/, '')
  }
  if (remaining) chunks.push(remaining)
  return chunks.map((text, index) => ({
    ...item,
    id: `${item.id}:part-${index + 1}`,
    source_id: `${item.id}:part-${index + 1}`,
    title: `${item.title} · part ${index + 1}/${chunks.length}`,
    text,
    additional_metadata: {
      ...item.additional_metadata,
      recoil_chunk_index: index + 1,
      recoil_chunk_count: chunks.length,
      recoil_chunked: true,
    },
  }))
}

function buildMemories(ingestion) {
  const scenarioId = ingestion.scenarioId || '0017'
  const packageName = ingestion.package || 'ua-parser-js'
  const advisoryId = ingestion.target?.advisoryId || 'not specified'
  const graph = ingestion.graph || { nodes: NODES, edges: EDGES }
  const events = ingestion.events || createEvents(packageName, advisoryId)
  const graphNodes = graph.nodes.map((node) => `${node.id}: ${node.label} (${node.meta})`).join('\n')
  const graphEdges = graph.edges.map(([from, to]) => `${from} -> ${to}`).join('\n')
  const memories = [memory({
    id: `recoil:scenario:${stableId(`${scenarioId}:${ingestion.query || packageName}`)}`,
    title: `Recoil incident anchor · ${packageName}`,
    text: `# Recoil incident anchor\n\n- Scenario: ${scenarioId}\n- Query: ${ingestion.query || packageName}\n- Package: ${packageName}\n- Advisory target: ${advisoryId}\n- Synthetic deployment data is explicitly marked synthetic.\n- No package code is executed by Recoil.`,
    additionalMetadata: {
      recoil_kind: 'incident',
      recoil_scenario_id: scenarioId,
      recoil_package: packageName,
      recoil_advisory: advisoryId,
      recoil_graph_node_id: 'release',
    },
  }), memory({
    id: `recoil:graph:${stableId(`${scenarioId}:${packageName}:topology`)}`,
    title: `Recoil attack graph · ${packageName}`,
    text: `# Recoil attack graph\n\n## Nodes\n${graphNodes}\n\n## Propagation edges\n${graphEdges}\n\nThis is a temporal reachability model. It describes possible propagation and does not claim that every edge was observed in production.`,
    additionalMetadata: {
      recoil_kind: 'graph_topology',
      recoil_scenario_id: scenarioId,
      recoil_package: packageName,
      recoil_graph_node_count: graph.nodes.length,
      recoil_graph_edge_count: graph.edges.length,
    },
  }), memory({
    id: `recoil:timeline:${stableId(`${scenarioId}:${packageName}:timeline`)}`,
    title: `Recoil attack-defense timeline · ${packageName}`,
    text: `# Recoil attack-defense timeline\n\n${events.map((event, index) => `${index + 1}. **${event.side.toUpperCase()} — ${event.label}**: ${event.detail}`).join('\n')}`,
    additionalMetadata: {
      recoil_kind: 'event_timeline',
      recoil_scenario_id: scenarioId,
      recoil_package: packageName,
      recoil_event_count: events.length,
      recoil_event_sides: JSON.stringify(events.map((event) => event.side)),
    },
  })]

  for (const collector of ingestion.collectors || []) {
    const id = `recoil:collector:${collector.collector}:${stableId(JSON.stringify(collector))}`
    const sourceUrl = collector.sourceUrl || collector.sources?.[0]?.url || `fixture://${collector.collector}`
    memories.push(memory({
      id,
      title: `Recoil evidence · ${collector.collector}`,
      text: `# ${collector.collector}\n\nSource: ${sourceUrl}\nStatus: ${collector.status}\nEntities: ${collector.entities || 0}\n\n\`\`\`json\n${JSON.stringify(collector, null, 2)}\n\`\`\``,
      additionalMetadata: {
        recoil_kind: 'collector_result',
        recoil_collector: collector.collector,
        recoil_status: collector.status,
        recoil_source_url: sourceUrl,
        recoil_synthetic: Boolean(collector.synthetic),
        recoil_scenario_id: scenarioId,
        recoil_graph_node_id: collector.collector,
        recoil_graph_edges: JSON.stringify(collector.collector === 'repository-extractor'
          ? [['release', 'repo'], ['repo', 'payments'], ['repo', 'gateway']]
          : collector.collector === 'registry-resolver'
            ? [['release', 'resolver']]
            : collector.collector === 'advisory-resolver'
              ? [['advisory', 'release']]
              : []),
      },
    }))
  }

  return memories.flatMap((item) => chunkMemory(item))
}

export function hydraStatus() {
  const hasKey = Boolean(process.env.HYDRA_DB_API_KEY)
  const hasDatabase = Boolean(databaseId())
  return {
    configured: hasKey && hasDatabase,
    status: hasKey && hasDatabase ? 'ready' : hasKey || hasDatabase ? 'needs-database-id' : 'replay-only',
    apiVersion: 'v2',
    databaseId: hasDatabase ? databaseId() : null,
    collection: hasDatabase ? collectionId() : null,
    apiBase: apiBase(),
  }
}

export async function persistIngestion(ingestion, signal) {
  if (!enabled()) return { status: 'skipped', reason: 'HydraDB credentials are not configured', memoryCount: 0 }
  const memories = buildMemories(ingestion)
  const result = await ingest(memories, signal)
  return {
    status: result.indexingStatus === 'completed' ? 'persisted' : 'queued',
    memoryCount: memories.length,
    sourceIds: result.results?.map((item) => item.id).filter(Boolean) || [],
    result,
  }
}

function temporalMemory({ id, title, text, kind, scenarioId, repository, validFrom, validUntil = null, sourceUrls = [] }) {
  return memory({
    id,
    title,
    text,
    additionalMetadata: {
      recoil_kind: kind,
      recoil_scenario_id: scenarioId,
      recoil_repository: repository || null,
      valid_from: validFrom || null,
      valid_until: validUntil,
      source_urls: JSON.stringify(sourceUrls),
    },
  })
}

export function buildInvestigationMemories(ingestion, report) {
  const scenarioId = ingestion.scenarioId || '0017'
  const advisory = report.advisory
  const graph = ingestion.graph || { nodes: [], edges: [] }
  const memories = []
  memories.push(temporalMemory({
    id: `recoil:temporal:advisory:${stableId(`${scenarioId}:${advisory?.id || ingestion.package}`)}`,
    title: `Recoil advisory fact · ${advisory?.id || ingestion.package || 'unknown'}`,
    kind: 'temporal_fact',
    scenarioId,
    validFrom: advisory?.published,
    sourceUrls: [advisory?.sourceUrl].filter(Boolean),
    text: `# Advisory fact\n\n- Advisory: ${advisory?.id || 'unknown'}\n- Package: ${ingestion.package || 'unknown'}\n- Published: ${advisory?.published || 'unknown'}\n- Fixed versions: ${(advisory?.fixedVersions || []).join(', ') || 'not available'}\n- Source: ${advisory?.sourceUrl || 'not available'}`,
  }))
  memories.push(memory({
    id: `recoil:observed-graph:${stableId(`${scenarioId}:${ingestion.package || advisory?.id || 'unknown'}`)}`,
    title: `Recoil observed graph · ${ingestion.package || advisory?.id || 'unknown'}`,
    text: `# Observed evidence graph\n\n- Case: ${scenarioId}\n- Package: ${ingestion.package || 'unknown'}\n- Nodes: ${graph.nodes.length}\n- Edges: ${graph.edges.length}\n\n## Nodes\n${graph.nodes.map((node) => `- ${node.id} · ${node.label} · ${node.type}`).join('\n') || '- none'}\n\n## Edges\n${graph.edges.map(([from, to]) => `- ${from} → ${to}`).join('\n') || '- none'}\n\nThis topology contains only observed advisory, package, repository, lockfile, and sampled source evidence. It does not imply runtime execution.`,
    additionalMetadata: {
      recoil_kind: 'observed_graph',
      recoil_scenario_id: scenarioId,
      recoil_package: ingestion.package || null,
      recoil_graph_node_count: graph.nodes.length,
      recoil_graph_edge_count: graph.edges.length,
      source_urls: JSON.stringify(ingestion.sources || []),
    },
  }))
  for (const finding of report.repositories || []) {
    memories.push(temporalMemory({
      id: `recoil:temporal:path:${stableId(`${scenarioId}:${finding.repository}:${finding.packageName}:${finding.resolvedVersion}`)}`,
      title: `Recoil reachability fact · ${finding.repository}`,
      kind: 'temporal_fact',
      scenarioId,
      repository: finding.repository,
      validFrom: finding.pathObservedAt,
      sourceUrls: finding.evidenceSources,
      text: `# Reachability fact\n\n- Repository: ${finding.repository}\n- Verdict: ${finding.verdict}\n- Package: ${finding.packageName}@${finding.resolvedVersion || 'unresolved'}\n- Declared range: ${finding.declaredRange || 'not found'}\n- Imports: ${(finding.imports || []).map((item) => `${item.path}:${item.line || '?'}`).join(', ') || 'none in sampled files'}\n- Path observed from: ${finding.pathObservedAt || 'unknown'}\n- Evidence path: ${finding.path.join(' -> ')}\n- Reason: ${finding.reason}\n- Sources: ${(finding.evidenceSources || []).join(', ')}`,
    }))
    const challenge = (report.challenge || []).find((item) => item.repository === finding.repository)
    if (challenge) memories.push(temporalMemory({
      id: `recoil:temporal:fix:${stableId(`${scenarioId}:${finding.repository}:${challenge.proposedVersion || challenge.status}`)}`,
      title: `Recoil fix proof · ${finding.repository}`,
      kind: 'fix_proof',
      scenarioId,
      repository: finding.repository,
      validFrom: new Date().toISOString(),
      sourceUrls: finding.evidenceSources,
      text: `# Fix proof\n\n- Repository: ${finding.repository}\n- Proposed version: ${challenge.proposedVersion || 'none'}\n- Status: ${challenge.status}\n- Detail: ${challenge.detail}\n- Residual path: ${(challenge.residualPath || []).join(' -> ') || 'none found by the bounded verifier.'}`,
    }))
  }
  return memories.flatMap((item) => chunkMemory(item))
}

export async function persistInvestigation(ingestion, report, signal) {
  if (!enabled()) return { status: 'skipped', reason: 'HydraDB credentials are not configured', memoryCount: 0 }
  const memories = buildInvestigationMemories(ingestion, report)
  const result = await ingest(memories, signal)
  return {
    status: result.indexingStatus === 'completed' ? 'persisted' : 'queued',
    memoryCount: memories.length,
    sourceIds: result.results?.map((item) => item.id).filter(Boolean) || [],
    result,
  }
}

export async function pollIngestion(sourceIds = [], signal) {
  if (!enabled()) return { status: 'skipped', sourceIds: [], statuses: [] }
  const uniqueIds = [...new Set(sourceIds.filter(Boolean))]
  const statuses = await Promise.all(uniqueIds.map(async (sourceId) => {
    const url = new URL(`${apiBase()}/context/status`)
    url.searchParams.set('database', databaseId())
    url.searchParams.set('id', sourceId)
    try {
      const response = await fetch(url, { headers: headers(false), signal })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) return { id: sourceId, status: response.status === 404 ? 'unknown' : 'error', error: errorMessage(payload, response) }
      return { id: sourceId, status: normalizeIndexingStatus(payload) || 'unknown' }
    } catch (error) {
      return { id: sourceId, status: 'unknown', error: error.message }
    }
  }))
  const terminal = statuses.length > 0 && statuses.every((item) => ['completed', 'complete', 'errored', 'error', 'failed'].includes(item.status))
  const failed = statuses.some((item) => ['errored', 'error', 'failed'].includes(item.status))
  return {
    status: failed ? 'failed' : terminal ? 'persisted' : 'queued',
    sourceIds: uniqueIds,
    statuses,
    completedCount: statuses.filter((item) => ['completed', 'complete'].includes(item.status)).length,
    failedCount: statuses.filter((item) => ['errored', 'error', 'failed'].includes(item.status)).length,
  }
}

export async function persistDecision({ scenarioId, queryText, action, selectedActions, exposure, activeNodeIds, blockedNodeIds = [], attackPath = [], alternatePaths = [], controlEnabled = true, round = 0 }, signal) {
  if (!enabled()) return { status: 'skipped', reason: 'HydraDB credentials are not configured', memoryCount: 0 }
  const decisionKey = `${scenarioId}:${queryText}:round-${round}:${action}:${selectedActions.join(',')}`
  const decision = memory({
    id: `recoil:decision:${stableId(decisionKey)}`,
    title: `Recoil response decision · ${action}`,
    text: `# Recoil response decision\n\n- Scenario: ${scenarioId}\n- Query: ${queryText}\n- Control selected: ${action}\n- Operation: ${controlEnabled ? 'enabled' : 'disabled'}\n- Selected controls: ${selectedActions.join(', ') || 'none'}\n- Reachable exposure after decision: ${exposure}%\n- Active graph nodes after decision: ${activeNodeIds.join(', ') || 'none'}\n- Blocked graph nodes: ${blockedNodeIds.join(', ') || 'none'}\n- Residual attack path: ${attackPath.join(' -> ') || 'none to a high-value target'}\n- Alternate paths considered: ${alternatePaths.length}\n- Defense round: ${round}\n- This record describes a defensive state change; no package code was executed.`,
    additionalMetadata: {
      recoil_kind: 'defense_decision',
      recoil_scenario_id: scenarioId,
      recoil_query: queryText,
      recoil_action: action,
      recoil_operation: controlEnabled ? 'enabled' : 'disabled',
      recoil_selected_actions: selectedActions.join(','),
      recoil_exposure: exposure,
      recoil_active_node_count: activeNodeIds.length,
      recoil_blocked_node_ids: blockedNodeIds.join(','),
      recoil_attack_path: attackPath.join('>'),
      recoil_alternate_path_count: alternatePaths.length,
      recoil_round: round,
    },
  })
  const result = await ingest([decision], signal)
  return {
    status: result.indexingStatus === 'completed' ? 'persisted' : 'queued',
    action,
    operation: controlEnabled ? 'enabled' : 'disabled',
    exposure,
    activeNodeIds,
    blockedNodeIds,
    attackPath,
    alternatePaths,
    round,
    memoryCount: 1,
    result,
  }
}

export async function persistEvaluation({ scenarioId, queryText, recommended, alternatives }, signal) {
  if (!enabled()) return { status: 'skipped', reason: 'HydraDB credentials are not configured', memoryCount: 0 }
  const planKey = `${scenarioId}:${queryText}:${recommended.actions.join(',')}:${recommended.exposure}`
  const plan = memory({
    id: `recoil:plan:${stableId(planKey)}`,
    title: `Recoil containment plan · ${scenarioId}`,
    text: `# Recoil containment plan\n\n- Scenario: ${scenarioId}\n- Query: ${queryText}\n- Recommended controls: ${recommended.actions.join(', ') || 'none'}\n- Modeled exposure after recommendation: ${recommended.exposure}%\n- Modeled containment: ${recommended.contained}%\n- Response cost: ${recommended.cost} points\n- Residual active nodes: ${recommended.activeNodes}\n\n## Alternatives\n${alternatives.map((item, index) => `${index + 1}. ${item.actions.join(', ') || 'observe only'} — ${item.exposure}% exposure, cost ${item.cost}`).join('\n')}\n\nThis is a bounded counterfactual analysis. It does not execute code or mutate a real deployment.`,
    additionalMetadata: {
      recoil_kind: 'counterfactual_plan',
      recoil_scenario_id: scenarioId,
      recoil_query: queryText,
      recoil_recommended_actions: recommended.actions.join(','),
      recoil_exposure: recommended.exposure,
      recoil_cost: recommended.cost,
      recoil_active_nodes: recommended.activeNodes,
    },
  })
  const result = await ingest([plan], signal)
  return { status: result.indexingStatus === 'completed' ? 'persisted' : 'queued', memoryCount: 1, result }
}

export async function recall(queryText, signal, scenarioId = '0017', { allEpisodes = false } = {}) {
  if (!enabled()) return { status: 'skipped', reason: 'HydraDB credentials are not configured', chunks: [], graphContext: null }
  const request = {
    database: databaseId(),
    collection: collectionId(),
    type: 'all',
    query: String(queryText || '').slice(0, 900),
    queryBy: 'hybrid',
    mode: 'thinking',
    maxResults: 12,
    numRelatedChunks: 3,
    graphContext: true,
    recencyBias: 0.2,
    additionalContext: 'This is a software supply-chain attack-defense investigation. Prioritize packages, advisories, repositories, maintainers, source provenance, dates, propagation edges, and contradictions.',
  }
  if (!allEpisodes) request.metadataFilters = { additionalMetadata: { recoil_scenario_id: scenarioId } }
  const result = await query(request, signal)
  return {
    status: 'recalled',
    chunks: result?.chunks || result?.results || [],
    sources: result?.sources || result?.documents || [],
    graphContext: result?.graph_context || result?.graphContext || null,
    raw: result,
  }
}

export async function recallTemporal(queryText, asOf, signal) {
  if (!enabled()) return { status: 'skipped', reason: 'HydraDB credentials are not configured', chunks: [], graphContext: null, asOf }
  const result = await query({
    database: databaseId(),
    collection: collectionId(),
    type: 'all',
    query: `${String(queryText || '').slice(0, 700)} as of ${asOf}`,
    queryBy: 'hybrid',
    mode: 'thinking',
    maxResults: 24,
    numRelatedChunks: 3,
    graphContext: true,
    metadataFilters: { additionalMetadata: { app: 'recoil' } },
    additionalContext: `Return only Recoil evidence facts that were valid on or before ${asOf}. Each fact has valid_from and valid_until metadata; preserve dates and source URLs.`,
  }, signal)
  return { status: 'recalled', asOf, chunks: result?.chunks || result?.results || [], sources: result?.sources || result?.documents || [], graphContext: result?.graph_context || result?.graphContext || null, raw: result }
}

export async function persistArenaRound({ scenarioId, queryText, packageName, round, red, blue, before, after, status }, signal) {
  if (!enabled()) return { status: 'skipped', reason: 'HydraDB credentials are not configured', memoryCount: 0 }
  const key = `${scenarioId}:${queryText}:arena:${round}`
  const redCandidates = red.candidates || []
  const blueCandidates = blue.candidates || []
  const episode = memory({
    id: `recoil:arena:${stableId(key)}`,
    title: `Recoil arena round ${round} · ${packageName}`,
    text: `# Recoil adaptive arena · round ${round}\n\n- Scenario: ${scenarioId}\n- Query: ${queryText}\n- Package: ${packageName}\n- Red move: ${red.label}\n- Red intent: ${red.intent}\n- Red route: ${red.pathLabel || 'no reachable route'}\n- Red routes evaluated: ${redCandidates.map((candidate) => candidate.pathLabel).join(' | ') || 'none'}\n- Blue control: ${blue.title || 'none'}\n- Blue rationale: ${blue.rationale}\n- Blue controls compared: ${blueCandidates.map((candidate) => `${candidate.title} (${candidate.predictedExposure}% exposure)`).join(' | ') || 'none'}\n- Memory used: ${blue.memoryUsed ? 'yes' : 'no'}\n- Exposure before control: ${before.exposure}%\n- Exposure after control: ${after.exposure}%\n- Reachable high-value targets after control: ${after.reachableTargets.join(', ') || 'none'}\n- Episode status: ${status}\n\nThis is a bounded defensive simulation. No package code or exploit payload was executed.`,
    additionalMetadata: {
      recoil_kind: 'arena_round',
      recoil_scenario_id: scenarioId,
      recoil_package: packageName,
      recoil_round: round,
      recoil_red_move: red.label,
      recoil_blue_action: blue.action || 'none',
      recoil_before_exposure: before.exposure,
      recoil_after_exposure: after.exposure,
      recoil_status: status,
      recoil_attack_path: red.path.join('>'),
      recoil_residual_path: after.primaryPath.join('>'),
      recoil_red_candidate_count: redCandidates.length,
      recoil_blue_candidate_count: blueCandidates.length,
      recoil_blue_candidates: JSON.stringify(blueCandidates.slice(0, 8)),
    },
  })
  const result = await ingest([episode], signal)
  return {
    status: result.indexingStatus === 'completed' ? 'persisted' : 'queued',
    memoryCount: 1,
    round,
    action: blue.action || null,
    result,
  }
}
