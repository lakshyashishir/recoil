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

async function ingest(memories, signal) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const form = new FormData()
    form.append('database', databaseId())
    form.append('collection', collectionId())
    form.append('type', 'memory')
    form.append('memories', JSON.stringify(memories))
    form.append('upsert', 'true')

    const response = await fetch(`${apiBase()}/context/ingest`, {
      method: 'POST',
      headers: headers(false),
      body: form,
      signal,
    })
    const payload = await response.json().catch(() => ({}))
    if (response.ok) return unwrap(payload)

    const retryable = [429, 500, 502, 503, 504].includes(response.status)
    if (!retryable || attempt === 2) throw new Error(`${response.status}: ${errorMessage(payload, response)}`)
    await new Promise((resolve) => setTimeout(resolve, 250 * (2 ** attempt)))
  }
  throw new Error('HydraDB ingest failed after retries')
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
  const memories = [memory({
    id: `recoil:scenario:${stableId('0017')}`,
    title: 'Recoil incident anchor · ua-parser-js compromise',
    text: `# Recoil incident anchor\n\n- Scenario: 0017\n- Query: CVE-2021-4229 / fixture/storefront-api\n- Package: ua-parser-js\n- Compromised releases: 0.7.29, 0.8.0, 1.0.0\n- Fixed releases: 0.7.30, 0.8.1, 1.0.1\n- Synthetic deployment data is explicitly marked synthetic.\n- No package code is executed by Recoil.`,
    additionalMetadata: {
      recoil_kind: 'incident',
      recoil_scenario_id: '0017',
      recoil_package: 'ua-parser-js',
      recoil_advisory: 'CVE-2021-4229',
      recoil_graph_node_id: 'release',
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
        recoil_scenario_id: '0017',
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
  return { status: 'persisted', memoryCount: memories.length, result }
}

export async function recall(queryText, signal) {
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
    metadataFilters: { additionalMetadata: { recoil_scenario_id: '0017' } },
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
