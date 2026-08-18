import { randomUUID } from 'node:crypto'

const apiBase = (process.env.RECOIL_API_URL || 'http://127.0.0.1:8787').replace(/\/$/, '')
const args = process.argv.slice(2)
const jsonOutput = args.includes('--json')
const query = args.filter((arg) => arg !== '--json').join(' ').trim()

function usage() {
  console.log('Usage: npm run cli -- "npm:lodash@4.17.21" [--json]')
  console.log('       npm run cli -- "https://github.com/axios/axios axios"')
}

async function request(path, options = {}) {
  let response
  try {
    response = await fetch(`${apiBase}${path}`, {
      ...options,
      headers: { ...(options.body ? { 'content-type': 'application/json' } : {}), ...(options.headers || {}) },
    })
  } catch (error) {
    throw new Error(`Cannot reach Recoil API at ${apiBase}. Start it with npm run start or npm run server. ${error.message}`)
  }
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(payload.error || `${response.status} ${response.statusText}`)
  return payload
}

function line(message) {
  if (!jsonOutput) console.log(message)
}

async function advanceToBoundary(id, snapshot) {
  let current = snapshot
  while (current.state.eventIndex < current.events.length) {
    current = await request(`/api/scenarios/${id}/advance`, { method: 'POST' })
    const event = current.events[current.state.eventIndex - 1]
    if (event) line(`  ${String(current.state.eventIndex).padStart(2, '0')}/${current.events.length}  ${event.side.padEnd(7)} ${event.label}`)
  }
  return current
}

async function main() {
  if (!query || query === '--help' || query === '-h') {
    usage()
    return
  }

  const id = `cli-${randomUUID().slice(0, 8)}`
  line(`RECOIL  ${id}`)
  line(`target  ${query}`)
  let snapshot = await request(`/api/scenarios/${id}/run`, { method: 'POST', body: JSON.stringify({ query }) })
  line('scope   collecting public evidence')
  snapshot = await request(`/api/scenarios/${id}/ingest`, { method: 'POST' })
  const failedCollectors = (snapshot.ingestion.collectors || []).filter((collector) => collector.status === 'failed')
  line(`evidence ${snapshot.ingestion.status} · ${(snapshot.ingestion.collectors || []).length} collectors · ${snapshot.graph.nodes.length} nodes / ${snapshot.graph.edges.length} edges`)
  line(`hydra   ${snapshot.hydra.status}${snapshot.hydra.memoryCount ? ` · ${snapshot.hydra.memoryCount} memories` : ''}`)
  if (failedCollectors.length) line(`warning ${failedCollectors.map((collector) => `${collector.collector}: ${collector.error}`).join('; ')}`)
  if (snapshot.hydra.status === 'skipped') line('warning HydraDB was not configured in the API process; this run is local-only.')

  line('attack  advancing propagation sequence')
  snapshot = await advanceToBoundary(id, snapshot)
  const baseline = snapshot.graph
  line(`exposure ${baseline.exposure}% · ${baseline.reachableTargetIds.length} high-value targets · ${baseline.alternatePaths.length} alternate paths`)

  const planPayload = await request(`/api/scenarios/${id}/evaluate`, { method: 'POST' })
  const recommendation = planPayload.recommended
  line(`plan    ${recommendation.actions.join(' + ') || 'observe only'} · ${recommendation.exposure}% exposure · cost ${recommendation.cost}`)

  for (const action of recommendation.actions) {
    snapshot = await request(`/api/scenarios/${id}/action`, { method: 'POST', body: JSON.stringify({ id: action }) })
    line(`defense ${action} · ${snapshot.hydra.lastDecision?.status || 'local'}`)
    snapshot = await advanceToBoundary(id, snapshot)
    line(`result  ${snapshot.graph.exposure}% exposure · ${snapshot.graph.reachableTargetIds.length} high-value targets remain`)
  }

  const report = await request(`/api/scenarios/${id}/report`)
  const result = {
    scenarioId: id,
    query,
    status: report.modeled.completed ? 'complete' : report.modeled.simulationComplete ? 'modeled-only' : 'incomplete',
    evidenceStatus: snapshot.ingestion.status,
    conclusion: report.conclusion,
    graph: report.modeled,
    sources: report.sources,
    uncertainty: report.uncertainty,
    hydra: snapshot.hydra,
  }
  if (jsonOutput) console.log(JSON.stringify(result, null, 2))
  else {
    line(`report  ${result.status}`)
    line(`route   ${report.modeled.primaryPath.length ? report.modeled.primaryPath.join(' → ') : 'severed'}`)
    line(`sources ${report.sources.length}`)
    line(`note    ${report.uncertainty[0]}`)
    if (result.status === 'modeled-only') line('warning The attack/defense result completed, but public evidence collection was partial.')
  }
}

main().catch((error) => {
  console.error(`Recoil CLI error: ${error.message}`)
  process.exitCode = 1
})
