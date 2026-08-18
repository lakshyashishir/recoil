import { randomUUID } from 'node:crypto'

const apiBase = (process.env.RECOIL_API_URL || 'http://127.0.0.1:8787').replace(/\/$/, '')
const args = process.argv.slice(2)
const jsonOutput = args.includes('--json')
const fast = args.includes('--fast')
const query = args.filter((arg) => !arg.startsWith('--')).join(' ').trim()
const pollDelay = fast ? 100 : 650
const maxWaitMs = 180000

function usage() {
  console.log('Usage: npm run cli -- "GHSA-xxxx-yyyy-zzzz https://github.com/org/repository"')
  console.log('       npm run cli -- "CVE-2021-4229 https://github.com/org/repo-a https://github.com/org/repo-b" [--fast] [--json]')
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
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function printEvents(events, seen) {
  for (const event of events || []) {
    const marker = `${event.key}:${event.status}`
    if (seen.has(marker)) continue
    seen.add(marker)
    const prefix = event.status === 'complete' ? 'done  ' : event.status === 'failed' ? 'fail  ' : event.status === 'working' ? 'work  ' : 'info  '
    line(`${prefix}${event.title}${event.repository ? ` · ${event.repository}` : ''}`)
    if (event.detail) line(`      ${event.detail}`)
    if (event.sourceUrls?.length) line(`      source ${event.sourceUrls[0]}`)
  }
}

function finalResult(id, queryText, snapshot) {
  const investigation = snapshot.investigation || {}
  const report = investigation.report || {}
  return {
    scenarioId: id,
    query: queryText,
    status: investigation.status,
    evidenceStatus: investigation.evidence?.status || 'unknown',
    report,
    hydra: investigation.hydra,
    events: investigation.events || [],
  }
}

async function main() {
  if (!query || query === '--help' || query === '-h') {
    usage()
    return
  }

  const id = `cli-${randomUUID().slice(0, 8)}`
  line(`RECOIL  ${id}`)
  line(`target  ${query}`)
  line('scope   public evidence only · no install · no execution')
  await request(`/api/scenarios/${id}/investigate`, { method: 'POST', body: JSON.stringify({ query }) })

  const seen = new Set()
  const startedAt = Date.now()
  let snapshot
  while (true) {
    snapshot = await request(`/api/scenarios/${id}`)
    printEvents(snapshot.investigation?.events, seen)
    const status = snapshot.investigation?.status
    if (status === 'complete' || status === 'failed') break
    if (Date.now() - startedAt > maxWaitMs) throw new Error(`Investigation exceeded ${maxWaitMs / 1000}s; inspect case ${id} through the API`)
    await sleep(pollDelay)
  }

  const result = finalResult(id, query, snapshot)
  if (jsonOutput) {
    console.log(JSON.stringify(result, null, 2))
    if (result.status === 'failed') process.exitCode = 1
    return
  }

  if (result.status === 'failed') {
    line(`result  failed · ${result.report?.error || snapshot.investigation?.error || 'investigation incomplete'}`)
    process.exitCode = 1
    return
  }

  const summary = result.report.summary || {}
  line(`result  ${summary.reached || 0} reached · ${summary.declaredOnly || 0} declared only · ${summary.notAffected || 0} not affected · ${summary.unknown || 0} unknown`)
  for (const finding of result.report.repositories || []) {
    line(`repo    ${finding.verdict.padEnd(14)} ${finding.repository || 'unknown'} · ${finding.packageName || 'package'}@${finding.resolvedVersion || 'unresolved'}`)
  }
  for (const item of result.report.challenge || []) {
    line(`fix     ${item.status.padEnd(22)} ${item.repository} · ${item.proposedVersion || 'no version'}`)
  }
  line(`rewind  ${result.report.rewind?.currentAsOf?.slice(0, 10) || 'undated'} current · ${result.report.rewind?.beforeAdvisory?.slice(0, 10) || 'unavailable'} before advisory`)
  line(`hydra   ${result.hydra?.status || 'skipped'} · ${result.hydra?.memoryCount || 0} memories · ${result.hydra?.recall?.datedChunkCount || 0} dated facts recalled · ${result.hydra?.recall?.relatedCaseCount || 0} related cases`)
  line(`sources ${result.report.sources?.length || 0} public sources`)
}

main().catch((error) => {
  console.error(`Recoil CLI error: ${error.message}`)
  process.exitCode = 1
})
