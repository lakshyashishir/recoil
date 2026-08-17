import { EDGES, NODES, createEvents } from '../src/core/scenario.js'

const DEFAULT_API_URL = 'https://api.hydradb.com'

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

async function ingest(memories, signal) {
  const results = []
  let lastResult = {}
  for (let offset = 0; offset < memories.length; offset += 2) {
    const batch = memories.slice(offset, offset + 2)
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

function buildMemories(ingestion) {
  const scenarioId = ingestion.scenarioId || '0017'
  const packageName = ingestion.package || 'ua-parser-js'
  const advisoryId = ingestion.target?.advisoryId || 'not specified'
  const events = createEvents(packageName, advisoryId)
  const graphNodes = NODES.map((node) => `${node.id}: ${node.label} (${node.meta})`).join('\n')
  const graphEdges = EDGES.map(([from, to]) => `${from} -> ${to}`).join('\n')
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
      recoil_graph_node_count: NODES.length,
      recoil_graph_edge_count: EDGES.length,
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

  return memories
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
  return { status: result.indexingStatus === 'completed' ? 'persisted' : 'queued', memoryCount: memories.length, result }
}

export async function persistDecision({ scenarioId, queryText, action, selectedActions, exposure, activeNodeIds }, signal) {
  if (!enabled()) return { status: 'skipped', reason: 'HydraDB credentials are not configured', memoryCount: 0 }
  const decisionKey = `${scenarioId}:${queryText}:${action}:${selectedActions.join(',')}`
  const decision = memory({
    id: `recoil:decision:${stableId(decisionKey)}`,
    title: `Recoil response decision · ${action}`,
    text: `# Recoil response decision\n\n- Scenario: ${scenarioId}\n- Query: ${queryText}\n- Control selected: ${action}\n- Selected controls: ${selectedActions.join(', ') || 'none'}\n- Reachable exposure after decision: ${exposure}%\n- Active graph nodes after decision: ${activeNodeIds.join(', ') || 'none'}\n- This record describes a defensive state change; no package code was executed.`,
    additionalMetadata: {
      recoil_kind: 'defense_decision',
      recoil_scenario_id: scenarioId,
      recoil_query: queryText,
      recoil_action: action,
      recoil_selected_actions: selectedActions.join(','),
      recoil_exposure: exposure,
      recoil_active_node_ids: activeNodeIds.join(','),
    },
  })
  const result = await ingest([decision], signal)
  return { status: result.indexingStatus === 'completed' ? 'persisted' : 'queued', action, memoryCount: 1, result }
}

export async function recall(queryText, signal, scenarioId = '0017') {
  if (!enabled()) return { status: 'skipped', reason: 'HydraDB credentials are not configured', chunks: [], graphContext: null }
  const result = await query({
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
    metadataFilters: { additionalMetadata: { recoil_scenario_id: scenarioId } },
    additionalContext: 'This is a software supply-chain attack-defense investigation. Prioritize packages, advisories, repositories, maintainers, source provenance, dates, propagation edges, and contradictions.',
  }, signal)
  return {
    status: 'recalled',
    chunks: result?.chunks || result?.results || [],
    sources: result?.sources || result?.documents || [],
    graphContext: result?.graph_context || result?.graphContext || null,
    raw: result,
  }
}
