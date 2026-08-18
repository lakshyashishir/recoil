import { randomUUID } from 'node:crypto'
import { hasIncompleteEvidence, missingRequiredVerdicts } from '../src/core/validation.js'
import { parseGitHubRepositories } from '../server/collectors.js'

const apiBase = (process.env.RECOIL_API_URL || 'http://127.0.0.1:8787').replace(/\/$/, '')
const args = process.argv.slice(2)
const jsonOutput = args.includes('--json')
const fast = args.includes('--fast')
const proofOutput = args.includes('--proof')
const recordingMode = args.includes('--recording')
const query = args.filter((arg) => !arg.startsWith('--')).join(' ').trim()
const pollDelay = fast ? 100 : 650
const maxWaitMs = 180000

function usage() {
  console.log('Usage: npm run cli -- "GHSA-xxxx-yyyy-zzzz https://github.com/org/repository"')
  console.log('       npm run cli -- "CVE-2021-4229 https://github.com/org/repo-a https://github.com/org/repo-b" [--fast] [--proof] [--recording] [--json]')
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

function recordingPreflight(queryText) {
  const blockers = []
  const repositoryCount = parseGitHubRepositories(queryText).length
  if (repositoryCount < 3) blockers.push(`requires 3 public GitHub repositories; found ${repositoryCount}`)
  if (!process.env.HYDRA_DB_API_KEY || !process.env.HYDRADB_DATABASE_ID) blockers.push('requires HYDRA_DB_API_KEY and HYDRADB_DATABASE_ID')
  return blockers
}

function recordingBlockers(result) {
  const blockers = []
  if (hasIncompleteEvidence(result)) blockers.push(result.report?.evidenceQuality?.reason || 'public evidence is incomplete')
  const missing = missingRequiredVerdicts(result.report)
  if (missing.length) blockers.push(`missing contrast verdicts: ${missing.join(', ')}`)
  if (result.hydra?.status !== 'persisted') blockers.push(`HydraDB write status is ${result.hydra?.status || 'unknown'}`)
  if (result.hydra?.recall?.status !== 'recalled') blockers.push(`HydraDB temporal read status is ${result.hydra?.recall?.status || 'not-run'}`)
  return blockers
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
    receiptPath: `/api/scenarios/${id}/receipt`,
    recording: { requested: recordingMode, ready: false, blockers: [] },
  }
}

async function main() {
  if (!query || query === '--help' || query === '-h') {
    usage()
    return
  }

  if (recordingMode) {
    const blockers = recordingPreflight(query)
    if (blockers.length) throw new Error(`Recording preflight failed: ${blockers.join(' · ')}`)
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
  const blockers = recordingMode ? recordingBlockers(result) : []
  result.recording = { requested: recordingMode, ready: recordingMode && blockers.length === 0, blockers }
  if (jsonOutput) {
    console.log(JSON.stringify(result, null, 2))
    if (result.status === 'failed' || hasIncompleteEvidence(result) || blockers.length) process.exitCode = 1
    return
  }

  if (result.status === 'failed') {
    line(`result  failed · ${result.report?.error || snapshot.investigation?.error || 'investigation incomplete'}`)
    process.exitCode = 1
    return
  }

  const summary = result.report.summary || {}
  const quality = result.report.evidenceQuality || {}
  line(`result  ${summary.reached || 0} reached · ${summary.declaredOnly || 0} declared only · ${summary.notAffected || 0} not affected · ${summary.unknown || 0} unknown`)
  line(`evidence ${quality.status || 'unknown'} · ${quality.readyForRecording ? 'recording-ready' : 'review required'} · ${quality.reason || 'quality not available'}`)
  if (quality.ambiguousVersions?.length) line(`ambiguity ${quality.ambiguousVersions.map((item) => `${item.repository}: ${item.versions.join(', ')}`).join(' · ')}`)
  if (quality.collectorIssues?.length) line(`blocker  ${quality.collectorIssues.map((item) => `${item.collector}: ${item.status}`).join(' · ')}`)
  if (quality.sourceCoverage?.boundedRepositories) line(`sampling ${quality.sourceCoverage.sampledFiles}/${quality.sourceCoverage.candidateFiles} eligible source files across ${quality.sourceCoverage.boundedRepositories} bounded repos`)
  for (const finding of result.report.repositories || []) {
    line(`repo    ${finding.verdict.padEnd(14)} ${finding.repository || 'unknown'} · ${finding.packageName || 'package'}@${finding.resolvedVersion || 'unresolved'}`)
    const proof = finding.proof || []
    const cited = proof.filter((step) => ['observed', 'validated'].includes(step.status) && step.source).length
    if (proof.length) line(`proof   ${cited}/${proof.length} hops have cited public evidence`)
    if (proofOutput) for (const step of proof) line(`        ${step.status.padEnd(12)} ${step.kind.padEnd(10)} ${step.label}${step.source ? ` · ${step.source}` : ''}`)
  }
  for (const item of result.report.challenge || []) {
    line(`fix     ${item.status.padEnd(22)} ${item.repository} · ${item.proposedVersion || 'no version'}`)
  }
  line(`rewind  ${result.report.rewind?.currentAsOf?.slice(0, 10) || 'undated'} current · ${result.report.rewind?.beforeAdvisory?.slice(0, 10) || 'unavailable'} before advisory`)
  const graphContext = result.hydra?.recall?.graphContext || result.report.rewind?.memory?.graphContext
  const tripletCount = graphContext?.tripletCount ?? graphContext?.triplets?.length ?? 0
  line(`hydra   ${result.hydra?.status || 'skipped'} · read ${result.hydra?.recall?.status || 'not-run'} · ${result.hydra?.memoryCount || 0} memories · ${result.hydra?.recall?.datedChunkCount || 0} dated facts recalled · ${result.hydra?.recall?.relatedCaseCount || 0} related cases · ${tripletCount} graph triplets`)
  if (result.hydra?.indexingError) line(`hydra-note ${result.hydra.indexingError}`)
  if (result.hydra?.recall?.error) line(`hydra-read ${result.hydra.recall.error}`)
  line(`sources ${result.report.sources?.length || 0} public sources`)
  line(`receipt ${apiBase}${result.receiptPath}`)
  if (hasIncompleteEvidence(result)) {
    line('warning incomplete evidence · do not treat this run as a verified case')
    process.exitCode = 1
  }
  if (recordingMode) {
    if (blockers.length) {
      line(`recording not-ready · ${blockers.join(' · ')}`)
      process.exitCode = 1
    } else {
      line('recording ready · three-way contrast and HydraDB temporal proof verified')
    }
  }
}

main().catch((error) => {
  console.error(`Recoil CLI error: ${error.message}`)
  process.exitCode = 1
})
