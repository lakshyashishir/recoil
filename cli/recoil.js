import { randomUUID } from 'node:crypto'

const apiBase = (process.env.RECOIL_API_URL || 'http://127.0.0.1:8787').replace(/\/$/, '')
const args = process.argv.slice(2)
const jsonOutput = args.includes('--json')
const fast = args.includes('--fast')
const query = args.filter((arg) => !arg.startsWith('--')).join(' ').trim()

function usage() {
  console.log('Usage: npm run cli -- "https://github.com/axios/axios axios"')
  console.log('       npm run cli -- "npm:lodash@4.17.21" [--fast] [--json]')
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

function sleep(ms) {
  return ms ? new Promise((resolve) => setTimeout(resolve, ms)) : Promise.resolve()
}

async function main() {
  if (!query || query === '--help' || query === '-h') {
    usage()
    return
  }

  const id = `cli-${randomUUID().slice(0, 8)}`
  line(`RECOIL  ${id}`)
  line(`target  ${query}`)
  await request(`/api/scenarios/${id}/run`, { method: 'POST', body: JSON.stringify({ query }) })
  line('scope   collecting public evidence')
  let snapshot = await request(`/api/scenarios/${id}/ingest`, { method: 'POST' })
  const failedCollectors = (snapshot.ingestion.collectors || []).filter((collector) => collector.status === 'failed')
  line(`evidence ${snapshot.ingestion.status} · ${(snapshot.ingestion.collectors || []).length} collectors · ${snapshot.graph.nodes.length} nodes / ${snapshot.graph.edges.length} edges`)
  line(`hydra   ${snapshot.hydra.status}${snapshot.hydra.memoryCount ? ` · ${snapshot.hydra.memoryCount} memories` : ''}`)
  if (failedCollectors.length) line(`warning ${failedCollectors.map((collector) => `${collector.collector}: ${collector.error}`).join('; ')}`)

  snapshot = await request(`/api/scenarios/${id}/arena/start`, { method: 'POST' })
  const recallCount = snapshot.hydra?.arenaRecall?.chunks?.length || 0
  line(`arena   adaptive red/blue episode${recallCount ? ` · ${recallCount} prior memories recalled` : ''}`)

  while (!['contained', 'breached', 'exhausted'].includes(snapshot.arena?.status)) {
    await sleep(fast ? 0 : 360)
    snapshot = await request(`/api/scenarios/${id}/arena/step`, { method: 'POST' })
    const round = snapshot.arena.lastRound
    line(`round   ${String(round.round).padStart(2, '0')} · RED  ${round.red.label}`)
    line(`        path     ${round.red.pathLabel || 'no reachable high-value route'}`)
    line(`        BLUE ${round.blue.title || 'no control'} · ${round.blue.rationale}`)
    line(`        result   ${round.before.exposure}% → ${round.after.exposure}% · ${round.after.reachableTargets.length} targets remain`)
  }

  if (snapshot.hydra?.status === 'queued') {
    snapshot = await request(`/api/scenarios/${id}/hydra-status`, { method: 'POST' })
  }
  const report = await request(`/api/scenarios/${id}/report`)
  const arena = snapshot.arena
  const result = {
    scenarioId: id,
    query,
    status: arena.status,
    winner: arena.winner,
    evidenceStatus: snapshot.ingestion.status,
    conclusion: report.conclusion,
    observed: report.observed,
    arena,
    graph: report.modeled,
    sources: report.sources,
    uncertainty: report.uncertainty,
    hydra: snapshot.hydra,
  }
  if (jsonOutput) console.log(JSON.stringify(result, null, 2))
  else {
    line(`report  ${result.status} · ${result.winner || 'no winner'}`)
    line(`route   ${arena.currentPath.length ? arena.currentPath.join(' → ') : 'severed'}`)
    line(`score   ${arena.initialExposure}% → ${arena.currentExposure}% · ${arena.metrics.controlsUsed} controls · contained round ${arena.metrics.containedRound || '—'}`)
    line(`hydra   ${snapshot.hydra.status}${snapshot.hydra.arenaMemoryCount ? ` · ${snapshot.hydra.arenaMemoryCount} arena rounds` : ''}`)
    line(`note    ${report.uncertainty[0]}`)
  }
}

main().catch((error) => {
  console.error(`Recoil CLI error: ${error.message}`)
  process.exitCode = 1
})
