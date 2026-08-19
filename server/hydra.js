const DEFAULT_API_URL = 'https://api.hydradb.com'
const MAX_MEMORY_CHARS = 2200
const MAX_METADATA_SOURCE_URLS = 4

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
    'API-Version': '2',
    ...(json ? { 'content-type': 'application/json' } : {}),
  }
}

function errorMessage(payload, response) {
  return payload?.detail?.message || payload?.detail || payload?.message || response.statusText
}

function networkError(url, error) {
  const code = error?.cause?.code || error?.code
  return new Error(`HydraDB request failed for ${url}${code ? ` (${code})` : ''}: ${error.message}`, { cause: error })
}

async function fetchWithNetworkRetry(url, options = {}) {
  const configured = Number.parseInt(process.env.RECOIL_NETWORK_RETRIES || '3', 10)
  const attempts = Number.isFinite(configured) ? Math.min(Math.max(configured, 1), 10) : 3
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await fetch(url, options)
    } catch (error) {
      if (attempt === attempts - 1 || error?.name === 'AbortError') throw error
      await new Promise((resolve) => setTimeout(resolve, 75 * (attempt + 1)))
    }
  }
  throw new Error(`HydraDB request failed for ${url}`)
}

function unwrap(payload) {
  return payload?.data?.inner || payload?.data || payload
}

function annotateIndexing(result) {
  const statuses = result?.results || []
  const completed = statuses.length > 0 && statuses.every((item) => ['completed', 'complete'].includes(indexingStatus(item)))
  return { ...result, indexingStatus: completed ? 'completed' : 'queued' }
}

function normalizeIndexingStatus(payload) {
  const value = unwrap(payload)
  return String(value?.indexing_status || value?.indexingStatus || value?.status || value?.state || '').toLowerCase()
}

function indexingStatus(item) {
  return String(item?.indexing_status || item?.indexingStatus || item?.status || item?.state || '').toLowerCase()
}

// HydraDB responses have used both the resource `id` and the memory's
// `source_id` naming across ingestion/status surfaces. Normalize the identity
// at the adapter boundary so a successful cloud response cannot be mistaken
// for a partial acknowledgement by the recording gate.
function resultId(item) {
  return item?.id || item?.source_id || item?.sourceId || null
}

function chunkMetadata(chunk) {
  return chunk?.additional_metadata || chunk?.additionalMetadata || chunk?.metadata?.additional_metadata || chunk?.metadata?.additionalMetadata || {}
}

export function priorScenarioIds(chunks = [], excludeScenarioId = null) {
  return [...new Set(chunks.map((chunk) => chunkMetadata(chunk).recoil_scenario_id).filter(Boolean))]
    .filter((scenarioId) => scenarioId !== excludeScenarioId)
}

function metadataSourceUrls(metadata) {
  const value = metadata?.source_urls || metadata?.sourceUrls
  if (Array.isArray(value)) return value.filter(Boolean)
  if (typeof value !== 'string') return []
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed.filter(Boolean) : []
  } catch {
    return []
  }
}

function compactSourceUrls(sourceUrls = []) {
  return [...new Set((Array.isArray(sourceUrls) ? sourceUrls : [sourceUrls]).filter(Boolean).map(String))]
    .slice(0, MAX_METADATA_SOURCE_URLS)
}

function sourceMetadata(sourceUrls = []) {
  return JSON.stringify(compactSourceUrls(sourceUrls))
}

/**
 * Expose useful cross-case memory context without returning raw HydraDB chunks.
 * A summary is only created when the returned chunk identifies its source case.
 */
export function summarizeRelatedCases(chunks = [], excludeScenarioId = null) {
  const groups = new Map()
  for (const chunk of chunks) {
    const metadata = chunkMetadata(chunk)
    const scenarioId = metadata.recoil_scenario_id
    if (!scenarioId || scenarioId === excludeScenarioId) continue
    const group = groups.get(scenarioId) || {
      scenarioId,
      kinds: new Set(),
      repositories: new Set(),
      validFrom: [],
      sourceUrls: new Set(),
    }
    if (metadata.recoil_kind) group.kinds.add(metadata.recoil_kind)
    if (metadata.recoil_repository) group.repositories.add(metadata.recoil_repository)
    if (metadata.valid_from) group.validFrom.push(metadata.valid_from)
    for (const sourceUrl of metadataSourceUrls(metadata)) group.sourceUrls.add(sourceUrl)
    groups.set(scenarioId, group)
  }
  return [...groups.values()].map((group) => ({
    scenarioId: group.scenarioId,
    kinds: [...group.kinds].sort(),
    repositories: [...group.repositories].sort(),
    validFrom: group.validFrom.sort()[0] || null,
    sourceUrls: [...group.sourceUrls].slice(0, 8),
  })).sort((left, right) => left.scenarioId.localeCompare(right.scenarioId))
}

function temporalChunks(chunks, asOf) {
  const cutoff = new Date(asOf).getTime()
  if (Number.isNaN(cutoff)) return chunks
  return chunks.filter((chunk) => {
    const metadata = chunkMetadata(chunk)
    const validFrom = metadata.valid_from ? new Date(metadata.valid_from).getTime() : null
    const validUntil = metadata.valid_until ? new Date(metadata.valid_until).getTime() : null
    if (validFrom !== null && !Number.isNaN(validFrom) && validFrom > cutoff) return false
    if (validUntil !== null && !Number.isNaN(validUntil) && validUntil <= cutoff) return false
    return true
  })
}

function stripInternalMemoryFields(item) {
  const { _recoilGraphPayload, ...publicMemory } = item
  return publicMemory
}

function graphPayloadForBatch(batch) {
  return Object.fromEntries(batch
    .filter((item) => item._recoilGraphPayload)
    .map((item) => [item.id, item._recoilGraphPayload]))
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
      form.append('memories', JSON.stringify(batch.map(stripInternalMemoryFields)))
      const graphPayload = graphPayloadForBatch(batch)
      if (Object.keys(graphPayload).length) form.append('graph_payload', JSON.stringify(graphPayload))
      form.append('upsert', 'true')

      const url = `${apiBase()}/context/ingest`
      let response
      try {
        response = await fetchWithNetworkRetry(url, {
          method: 'POST',
          headers: headers(false),
          body: form,
          signal,
        })
      } catch (error) {
        throw networkError(url, error)
      }
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
    const url = `${apiBase()}/query`
    let response
    try {
      response = await fetchWithNetworkRetry(url, {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify(body),
        signal,
      })
    } catch (error) {
      throw networkError(url, error)
    }
    const payload = await response.json().catch(() => ({}))
    if (response.ok) return unwrap(payload)

    const retryable = [429, 500, 502, 503, 504].includes(response.status)
    if (!retryable || attempt === 2) throw new Error(`${response.status}: ${errorMessage(payload, response)}`)
    await new Promise((resolve) => setTimeout(resolve, 250 * (2 ** attempt)))
  }
  throw new Error('HydraDB query failed after retries')
}

async function contextStatus(sourceIds, signal) {
  const params = new URLSearchParams({ database: databaseId(), collection: collectionId() })
  for (const sourceId of sourceIds) params.append('ids', sourceId)
  const url = `${apiBase()}/context/status?${params.toString()}`
  let response
  try {
    response = await fetchWithNetworkRetry(url, { method: 'GET', headers: headers(false), signal })
  } catch (error) {
    throw networkError(url, error)
  }
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(`${response.status}: ${errorMessage(payload, response)}`)
  return unwrap(payload)
}

function pollDelayMs() {
  const configured = Number.parseInt(process.env.HYDRADB_INDEX_POLL_MS || '500', 10)
  return Number.isFinite(configured) ? Math.min(Math.max(configured, 0), 5000) : 500
}

function pollTimeoutMs() {
  const configured = Number.parseInt(process.env.HYDRADB_INDEX_WAIT_MS || '20000', 10)
  return Number.isFinite(configured) ? Math.min(Math.max(configured, 1000), 300000) : 20000
}

async function waitForIndexing(result, signal) {
  if (result.indexingStatus === 'completed') return result
  const sourceIds = [...new Set((result.results || []).map(resultId).filter(Boolean))]
  if (!sourceIds.length) return result
  const deadline = Date.now() + pollTimeoutMs()
  let latest = result
  while (Date.now() < deadline) {
    const statusPayload = await contextStatus(sourceIds, signal)
    const statuses = statusPayload?.statuses || statusPayload?.results || []
    const statusById = new Map(statuses.map((item) => [resultId(item), item]).filter(([id]) => id))
    const merged = sourceIds.map((id) => statusById.get(id) || (result.results || []).find((item) => resultId(item) === id)).filter(Boolean)
    const failed = merged.find((item) => ['failed', 'errored', 'error'].includes(indexingStatus(item)))
    if (failed) {
      const error = new Error(`HydraDB indexing failed for ${resultId(failed) || 'unknown memory'}: ${failed.error_message || failed.message || indexingStatus(failed)}`)
      error.code = 'HYDRA_INDEX_FAILED'
      throw error
    }
    latest = annotateIndexing({ ...latest, results: merged })
    if (merged.length === sourceIds.length && merged.every((item) => ['completed', 'complete'].includes(indexingStatus(item)))) return latest
    await new Promise((resolve) => setTimeout(resolve, pollDelayMs()))
  }
  return { ...latest, indexingStatus: 'queued', indexingPending: true }
}

function stableId(value) {
  let hash = 2166136261
  for (const character of value) {
    hash ^= character.charCodeAt(0)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(16)
}

function memory({ id, title, text, additionalMetadata = {}, graphPayload = null }) {
  return {
    id,
    source_id: id,
    title,
    text,
    is_markdown: true,
    infer: true,
    metadata: { app: 'recoil' },
    additional_metadata: { app: 'recoil', ...additionalMetadata },
    ...(graphPayload ? { _recoilGraphPayload: graphPayload } : {}),
  }
}

function graphEntityType(type) {
  return String(type || 'ENTITY').replace(/[^A-Za-z0-9_]+/g, '_').toUpperCase().slice(0, 64) || 'ENTITY'
}

function graphPredicate(from, to) {
  const pair = `${from?.type || ''}:${to?.type || ''}`
  if (pair === 'advisory:package') return 'AFFECTS'
  if (pair === 'package:package') return 'DEPENDS_ON'
  if (pair === 'package:lockfile') return 'RESOLVED_IN'
  if (pair === 'package:repository') return 'RESOLVED_IN'
  if (pair === 'repository:lockfile') return 'HAS_LOCKFILE'
  if (pair === 'lockfile:repository') return 'BELONGS_TO'
  if (pair === 'lockfile:code') return 'IMPORTS'
  if (pair === 'repository:code') return 'CONTAINS_SOURCE'
  if (pair === 'code:symbol') return 'INDEXES_SYMBOL'
  return 'CONNECTED_TO'
}

function buildGraphPayload(graph = {}, observedAt = null) {
  const nodes = graph.nodes || []
  const nodeKeys = new Map(nodes.map((node, index) => [node.id, `node_${index}`]))
  const entities = Object.fromEntries(nodes.map((node, index) => [`node_${index}`, {
    name: node.label || node.id,
    type: graphEntityType(node.type),
    namespace: 'recoil',
    identifier: node.id,
  }]))
  const relations = (graph.edges || []).flatMap(([fromId, toId]) => {
    const from = nodes.find((node) => node.id === fromId)
    const to = nodes.find((node) => node.id === toId)
    const source = nodeKeys.get(fromId)
    const target = nodeKeys.get(toId)
    if (!source || !target || !from || !to) return []
    return [{
      source,
      target,
      predicate: graphPredicate(from, to),
      context: `${from.label || from.id} ${graphPredicate(from, to).toLowerCase()} ${to.label || to.id}. Observed by Recoil from public evidence.`,
      temporal_details: observedAt ? `observed ${observedAt}` : undefined,
    }]
  })
  return { entities, relations }
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
    ...(index === 0 && item._recoilGraphPayload ? { _recoilGraphPayload: item._recoilGraphPayload } : { _recoilGraphPayload: undefined }),
  }))
}

export function hydraStatus() {
  const hasKey = Boolean(process.env.HYDRA_DB_API_KEY)
  const hasDatabase = Boolean(databaseId())
  return {
    configured: hasKey && hasDatabase,
    status: hasKey && hasDatabase ? 'ready' : hasKey ? 'needs-database-id' : hasDatabase ? 'needs-api-key' : 'replay-only',
    apiVersion: 'v2',
    databaseId: hasDatabase ? databaseId() : null,
    collection: hasDatabase ? collectionId() : null,
    apiBase: apiBase(),
  }
}

function temporalMemory({ id, title, text, kind, scenarioId, repository, validFrom, validUntil = null, sourceUrls = [], graphPayload = null }) {
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
      source_urls: sourceMetadata(sourceUrls),
    },
    graphPayload,
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
    text: `# Advisory fact\n\n- Advisory: ${advisory?.id || 'unknown'}\n- Package: ${ingestion.package || 'unknown'}\n- Published: ${advisory?.published || 'unknown'}\n- Fixed versions: ${(advisory?.fixedVersions || []).join(', ') || 'not available'}\n- Validated symbol scope: ${ingestion.advisoryScope?.status || 'not requested'}\n- Candidate symbols: ${(ingestion.advisoryScope?.affectedSymbols || []).map((item) => item.name).join(', ') || 'none'}\n- Source: ${advisory?.sourceUrl || 'not available'}`,
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
      source_urls: sourceMetadata(ingestion.sources || []),
    },
    graphPayload: buildGraphPayload(graph, report.generatedAt),
  }))
  for (const correlation of report.crossRepositoryCorrelations || []) {
    const datedObservations = (correlation.repositories || []).map((item) => item.pathObservedAt).filter(Boolean).sort()
    const repositories = (correlation.repositories || []).map((item) => `${item.repository} (${item.verdict})`).join(', ')
    const packageId = `package:${correlation.packageName}@${correlation.version}`
    const correlationGraph = {
      nodes: [
        { id: packageId, label: `${correlation.packageName}@${correlation.version}`, type: 'package' },
        ...(correlation.repositories || []).map((item) => ({ id: `repo:${item.repository}`, label: item.repository, type: 'repository' })),
      ],
      edges: (correlation.repositories || []).map((item) => [packageId, `repo:${item.repository}`]),
    }
    memories.push(temporalMemory({
      id: `recoil:temporal:correlation:${stableId(`${scenarioId}:${correlation.packageName}:${correlation.version}`)}`,
      title: `Recoil shared resolution · ${correlation.packageName}@${correlation.version}`,
      kind: 'cross_repository_correlation',
      scenarioId,
      validFrom: datedObservations[0] || null,
      sourceUrls: correlation.sourceUrls || [],
      graphPayload: buildGraphPayload(correlationGraph, datedObservations[0] || report.generatedAt || null),
      text: `# Cross-repository resolution\n\n- Package: ${correlation.packageName}@${correlation.version}\n- Repositories: ${repositories || 'none'}\n- Repository count: ${correlation.repositoryCount || correlation.repositories?.length || 0}\n- Evidence: the same resolved package version was observed in each listed repository. This is a dependency correlation, not proof of runtime execution.\n- Sources: ${(correlation.sourceUrls || []).join(', ') || 'not available'}`,
    }))
  }
  for (const finding of report.repositories || []) {
    memories.push(temporalMemory({
      id: `recoil:temporal:path:${stableId(`${scenarioId}:${finding.repository}:${finding.packageName}:${finding.resolvedVersion}`)}`,
      title: `Recoil reachability fact · ${finding.repository}`,
      kind: 'temporal_fact',
      scenarioId,
      repository: finding.repository,
      validFrom: finding.pathObservedAt,
      sourceUrls: finding.evidenceSources,
      text: `# Reachability fact\n\n- Repository: ${finding.repository}\n- Verdict: ${finding.verdict}\n- Package: ${finding.packageName}@${finding.resolvedVersion || 'unresolved'}\n- Declared range: ${finding.declaredRange || 'not found'}\n- Resolved dependency path: ${(finding.dependencyPath || []).map((item) => `${item.name}@${item.version}`).join(' -> ') || 'direct or not resolved'}\n- Imports: ${(finding.imports || []).map((item) => `${item.path}:${item.line || '?'}`).join(', ') || 'none in sampled files'}\n- Advisory symbol scope: ${finding.advisoryScope?.status || 'not requested'}\n- Validated symbols: ${(finding.advisoryScope?.symbols || []).map((item) => `${item.name} (${item.path}:${item.line})`).join(', ') || 'none'}\n- Path observed from: ${finding.pathObservedAt || 'unknown'}\n- Evidence path: ${finding.path.join(' -> ')}\n- Reason: ${finding.reason}\n- Sources: ${(finding.evidenceSources || []).join(', ')}`,
    }))
    if (finding.changeEvidence?.importerFilesChanged?.length) memories.push(temporalMemory({
      id: `recoil:temporal:change:${stableId(`${scenarioId}:${finding.repository}:${finding.changeEvidence.sha || finding.changeEvidence.committedAt}`)}`,
      title: `Recoil importer change · ${finding.repository}`,
      kind: 'change_impact',
      scenarioId,
      repository: finding.repository,
      validFrom: finding.changeEvidence.committedAt,
      sourceUrls: [finding.changeEvidence.sourceUrl, ...finding.changeEvidence.importerFilesChanged.map((item) => item.sourceUrl)].filter(Boolean),
      text: `# Importer change evidence\n\n- Repository: ${finding.repository}\n- Commit: ${finding.changeEvidence.message || 'latest public change'}\n- Committed: ${finding.changeEvidence.committedAt || 'unknown'}\n- Importer files touched: ${finding.changeEvidence.importerFilesChanged.map((item) => `${item.path}${item.symbols?.length ? ` (${item.symbols.join(', ')})` : ''}`).join(', ')}\n- Owners: ${[...new Set(finding.changeEvidence.importerFilesChanged.flatMap((item) => item.owners || []))].join(', ') || 'not collected'}\n- Source: ${finding.changeEvidence.sourceUrl || 'not available'}`,
    }))
    const challenge = (report.challenge || []).find((item) => item.repository === finding.repository)
    if (challenge) memories.push(temporalMemory({
      id: `recoil:temporal:fix:${stableId(`${scenarioId}:${finding.repository}:${challenge.proposedVersion || challenge.status}`)}`,
      title: `Recoil fix proof · ${finding.repository}`,
      kind: 'fix_proof',
      scenarioId,
      repository: finding.repository,
      // A counterfactual fix is computed at investigation time, not observed
      // historical evidence. Do not give it a temporal validity date or let it
      // satisfy the strict temporal-recording gate by itself.
      validFrom: null,
      sourceUrls: finding.evidenceSources,
      text: `# Fix proof\n\n- Repository: ${finding.repository}\n- Proposed version: ${challenge.proposedVersion || 'none'}\n- Status: ${challenge.status}\n- Detail: ${challenge.detail}\n- Residual path: ${(challenge.residualPath || []).join(' -> ') || 'none found by the bounded verifier.'}`,
    }))
  }
  return memories.flatMap((item) => chunkMemory(item))
}

export async function persistInvestigation(ingestion, report, signal) {
  if (!enabled()) return { status: 'skipped', reason: 'HydraDB credentials are not configured', memoryCount: 0 }
  if (report?.evidenceQuality && !report.evidenceQuality.readyForRecording && process.env.RECOIL_HYDRA_PERSIST_PARTIAL !== '1') {
    return { status: 'skipped', reason: 'Evidence is incomplete; HydraDB persistence is deferred to avoid storing an unverified case', memoryCount: 0 }
  }
  const memories = buildInvestigationMemories(ingestion, report)
  const queued = await ingest(memories, signal)
  let result
  try {
    result = await waitForIndexing(queued, signal)
  } catch (error) {
    if (error.code === 'HYDRA_INDEX_FAILED') throw error
    result = { ...queued, indexingStatus: 'queued', indexingPending: true, indexingError: error.message }
  }
  const sourceIds = [...new Set((result.results || []).map(resultId).filter(Boolean))]
  const acknowledgedAll = sourceIds.length >= memories.length
  return {
    status: result.indexingStatus === 'completed' && acknowledgedAll ? 'persisted' : 'queued',
    memoryCount: memories.length,
    sourceIds,
    indexingError: result.indexingError || (acknowledgedAll ? null : `HydraDB acknowledged ${sourceIds.length}/${memories.length} evidence memories`),
    indexingPending: result.indexingPending || !acknowledgedAll,
    result,
  }
}

export async function recallTemporal(queryText, asOf, signal, { excludeScenarioId = null } = {}) {
  if (!enabled()) return { status: 'skipped', reason: 'HydraDB credentials are not configured', chunks: [], graphContext: null, asOf }
  const result = await query({
    database: databaseId(),
    collection: collectionId(),
    type: 'all',
    query: `${String(queryText || '').slice(0, 700)} as of ${asOf}`,
    query_by: 'hybrid',
    mode: 'thinking',
    max_results: 24,
    graph_context: true,
    metadata_filters: { additional_metadata: { app: 'recoil' } },
    additional_context: `Return only Recoil evidence facts that were valid on or before ${asOf}. Each fact has valid_from and valid_until metadata; preserve dates and source URLs.`,
  }, signal)
  const rawChunks = result?.chunks || result?.results || []
  const chunks = temporalChunks(rawChunks, asOf)
  const datedChunkCount = chunks.filter((chunk) => {
    const metadata = chunkMetadata(chunk)
    return Boolean(metadata.valid_from || metadata.valid_until)
  }).length
  const relatedScenarioIds = [...new Set(chunks.map((chunk) => chunkMetadata(chunk).recoil_scenario_id).filter(Boolean))]
  const priorCases = priorScenarioIds(chunks, excludeScenarioId)
  const relatedCases = summarizeRelatedCases(chunks, excludeScenarioId)
  return { status: 'recalled', asOf, chunks, rawChunkCount: rawChunks.length, datedChunkCount, relatedScenarioIds, priorScenarioIds: priorCases, relatedCases, sources: result?.sources || result?.documents || [], graphContext: result?.graph_context || result?.graphContext || null, raw: result }
}
