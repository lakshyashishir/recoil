import { randomUUID } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { hasIncompleteEvidence } from '../src/core/validation.js'
import { parseGitHubRepositories, parseInvestigationInput } from '../server/collectors.js'
import { startInvestigation } from '../server/investigation.js'
import { getOrCreate, snapshot as getScenarioSnapshot } from '../server/index.js'
import { recordingBlockers as buildRecordingBlockers, recordingPreflight as buildRecordingPreflight } from '../src/core/recording.js'
import { recordingNetworkFailures } from '../src/core/network-preflight.js'
import { buildEvidenceReceipt, verifyEvidenceReceipt } from '../src/core/receipt.js'
import { summarizeGraphContext } from '../src/core/graph-context.js'
import { hydraStatus } from '../server/hydra.js'

const apiBase = (process.env.RECOIL_API_URL || 'http://127.0.0.1:8787').replace(/\/$/, '')
const args = process.argv.slice(2)
const jsonOutput = args.includes('--json')
const fast = args.includes('--fast')
const proofOutput = args.includes('--proof')
const recordingMode = args.includes('--recording')
const directMode = args.includes('--direct')
const caseFlagIndex = args.findIndex((arg) => arg === '--case')
const caseFlagValue = caseFlagIndex >= 0 ? args[caseFlagIndex + 1] : null
const caseInlineValue = args.find((arg) => arg.startsWith('--case='))?.slice('--case='.length) || null
const requestedCaseId = caseInlineValue || caseFlagValue || process.env.RECOIL_CLI_CASE_ID || null
const verifyReceiptIndex = args.findIndex((arg) => arg === '--verify-receipt' || arg.startsWith('--verify-receipt='))
const verifyReceiptPath = verifyReceiptIndex >= 0
  ? (args[verifyReceiptIndex].includes('=') ? args[verifyReceiptIndex].slice(args[verifyReceiptIndex].indexOf('=') + 1) : args[verifyReceiptIndex + 1])
  : null
const query = args.filter((arg, index) => {
  if (arg.startsWith('--')) return false
  if (caseFlagIndex >= 0 && index === caseFlagIndex + 1) return false
  return true
}).join(' ').trim()
const pollDelay = fast ? 100 : 650
const maxWaitMs = 180000

function usage() {
  console.log('Usage: npm run cli -- "GHSA-xxxx-yyyy-zzzz https://github.com/org/repository"')
  console.log('       npm run cli -- "CVE-2021-4229 https://github.com/org/repo-a https://github.com/org/repo-b" [--fast] [--proof] [--recording] [--json]')
  console.log('       npm run cli -- "GHSA-xxxx-yyyy-zzzz https://github.com/org/repository" --direct')
  console.log('       npm run cli -- "GHSA-xxxx-yyyy-zzzz https://github.com/org/repository" --case 0017')
  console.log('       npm run cli -- --verify-receipt .recoil-recordings/<scenario-id>.json')
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
  const target = parseInvestigationInput(queryText)
  return buildRecordingPreflight({
    advisoryId: target.advisoryId,
    repositoryCount: parseGitHubRepositories(queryText).length,
    hydraConfigured: Boolean(process.env.HYDRA_DB_API_KEY && process.env.HYDRADB_DATABASE_ID),
    requireContrast: true,
    requireHydra: true,
  })
}

function recordingBlockers(result) {
  return buildRecordingBlockers({ report: result.report, evidenceStatus: result.evidenceStatus, hydra: result.hydra, requireContrast: true, requireHydra: true })
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

function packageFixCommand(finding, challenge) {
  const version = challenge?.proposedVersion
  const packageName = finding?.packageName
  if (!version || !packageName) return null
  const lockfile = (finding.path || []).find((part) => /(?:package-lock\.json|npm-shrinkwrap\.json|yarn\.lock|pnpm-lock\.yaml|Cargo\.lock)/i.test(part)) || ''
  if (/Cargo\.lock/i.test(lockfile)) return `cargo update -p ${packageName} --precise ${version}`
  if (/yarn\.lock/i.test(lockfile)) return `yarn add ${packageName}@${version}`
  if (/pnpm-lock\.yaml/i.test(lockfile)) return `pnpm add ${packageName}@${version}`
  return `npm install ${packageName}@${version}`
}

function nextAction(finding, challenge) {
  if (!challenge) return 'review the available evidence'
  if (challenge.status === 'ALREADY_SAFE') return 'no version change required'
  const command = packageFixCommand(finding, challenge)
  if (challenge.status === 'FIX_SURVIVES' && command) return `review, then ${command}`
  if (challenge.status === 'MANIFEST_CHANGE_REQUIRED' && command) return `update the manifest, then ${command}`
  if (challenge.status === 'NO_REACHABLE_PATH' && command) return `consider defense-in-depth: ${command}`
  return 'review the proposed fix before changing the repository'
}

function finalResult(id, queryText, snapshot, receiptPath = `/api/scenarios/${id}/receipt`) {
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
    receiptPath,
    recording: { requested: recordingMode, ready: false, blockers: [] },
  }
}

async function main() {
  if (verifyReceiptIndex >= 0) {
    if (!verifyReceiptPath) throw new Error('Receipt verification requires a JSON file path')
    let receipt
    try {
      receipt = JSON.parse(readFileSync(verifyReceiptPath, 'utf8'))
    } catch (error) {
      throw new Error(`Could not read receipt ${verifyReceiptPath}: ${error.message}`)
    }
    const verification = verifyEvidenceReceipt(receipt)
    if (jsonOutput) {
      console.log(JSON.stringify({ file: verifyReceiptPath, schema: receipt.schema || null, ...verification }, null, 2))
    } else {
      console.log(`RECOIL receipt verification`)
      console.log(`file    ${verifyReceiptPath}`)
      console.log(`schema  ${receipt.schema || 'missing'}`)
      console.log(`hash    ${verification.valid ? 'valid' : 'INVALID'} · ${verification.reason}`)
      if (verification.valid) console.log(`case    ${receipt.scenarioId || 'unknown'} · ${receipt.repositories?.length || 0} repositories`)
    }
    if (!verification.valid) process.exitCode = 1
    return
  }
  if (!query || query === '--help' || query === '-h') {
    usage()
    return
  }

  const target = parseInvestigationInput(query)
  if (!target.advisoryId && !target.packageName) {
    throw new Error('Investigation requires a GHSA/CVE advisory or package selector plus at least one public GitHub repository URL')
  }

  if (recordingMode) {
    const blockers = recordingPreflight(query)
    if (blockers.length) throw new Error(`Recording preflight failed: ${blockers.join(' · ')}`)
    const networkFailures = await recordingNetworkFailures({ hydraApiBase: hydraStatus().apiBase })
    if (networkFailures.length) throw new Error(`Recording network preflight failed: ${networkFailures.join(' · ')}`)
  }

  if (caseFlagIndex >= 0 && (!caseFlagValue || caseFlagValue.startsWith('--'))) throw new Error('--case requires a case identifier')
  const id = requestedCaseId || `cli-${randomUUID().slice(0, 8)}`
  line(`RECOIL  ${id}`)
  line(`target  ${query}`)
  line('scope   public evidence only · no install · no execution')
  const directRecord = directMode ? getOrCreate(id) : null
  if (directRecord) {
    line('transport direct · in-process state machine · no API server required')
    startInvestigation(directRecord, query)
  } else {
    await request(`/api/scenarios/${id}/investigate`, { method: 'POST', body: JSON.stringify({ query }) })
  }

  const seen = new Set()
  const startedAt = Date.now()
  let snapshot
  while (true) {
    snapshot = directRecord ? getScenarioSnapshot(directRecord) : await request(`/api/scenarios/${id}`)
    printEvents(snapshot.investigation?.events, seen)
    const status = snapshot.investigation?.status
    if (status === 'complete' || status === 'failed') break
    if (Date.now() - startedAt > maxWaitMs) throw new Error(`Investigation exceeded ${maxWaitMs / 1000}s; inspect case ${id} through the API`)
    await sleep(pollDelay)
  }

  const directReceiptPath = `.recoil-recordings/${id}.json`
  const result = finalResult(id, query, snapshot, directMode ? directReceiptPath : undefined)
  const blockers = recordingMode ? recordingBlockers(result) : []
  result.recording = { requested: recordingMode, ready: recordingMode && blockers.length === 0, blockers }
  if (directMode && result.status === 'complete') {
    const receipt = buildEvidenceReceipt({ scenarioId: id, query, report: result.report, hydra: result.hydra })
    if (receipt) {
      mkdirSync('.recoil-recordings', { recursive: true })
      writeFileSync(directReceiptPath, `${JSON.stringify(receipt, null, 2)}\n`)
    }
  }
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
  const packageResolution = result.report.packageResolution || {}
  if (packageResolution.status === 'ambiguous' || packageResolution.status === 'unresolved') {
    line(`input   ${packageResolution.reason || 'Package identity could not be resolved safely.'}`)
  }
  line(`result  ${summary.reached || 0} reached · ${summary.declaredOnly || 0} declared only · ${summary.notAffected || 0} not affected · ${summary.unknown || 0} unknown`)
  line(`evidence ${quality.status || 'unknown'} · ${quality.readyForRecording ? 'recording-ready' : 'review required'} · ${quality.reason || 'quality not available'}`)
  if (quality.ambiguousVersions?.length) line(`ambiguity ${quality.ambiguousVersions.map((item) => `${item.repository}: ${item.versions.join(', ')}`).join(' · ')}`)
  if (quality.collectorIssues?.length) line(`blocker  ${quality.collectorIssues.map((item) => `${item.collector}: ${item.status}`).join(' · ')}`)
  if (quality.sourceCoverage) {
    const coverage = quality.sourceCoverage
    const bounded = coverage.boundedRepositories ? ` · ${coverage.boundedRepositories} used a sample limit` : ''
    line(`sampling ${coverage.sampledFiles}/${coverage.candidateFiles} eligible source files across ${coverage.repositories} repositories${bounded}`)
  }
  for (const correlation of result.report.crossRepositoryCorrelations || []) line(`shared  ${correlation.packageName}@${correlation.version} · ${correlation.repositories.map((item) => `${item.repository} (${item.verdict})`).join(' · ')}`)
  for (const finding of result.report.repositories || []) {
    line(`repo    ${finding.verdict.padEnd(14)} ${finding.repository || 'unknown'} · ${finding.packageName || 'package'}@${finding.resolvedVersion || 'unresolved'}`)
    const proof = finding.proof || []
    const cited = proof.filter((step) => ['observed', 'validated'].includes(step.status) && step.source).length
    if (proof.length) line(`proof   ${cited}/${proof.length} hops have cited public evidence`)
    if (finding.dependencyPath?.length > 1) line(`chain   ${finding.dependencyPath.map((item) => `${item.name}@${item.version}`).join(' -> ')}`)
    if (finding.sourceImpact?.files?.length) line(`impact  ${finding.sourceImpact.sampledFileCount} sampled source files · ${finding.sourceImpact.observedEdgeCount} local import edges · bounded depth ${finding.sourceImpact.maxDepth}`)
    const challenge = (result.report.challenge || []).find((item) => item.repository === finding.repository)
    if (challenge) line(`next    ${nextAction(finding, challenge)} · no repository change executed`)
    if (proofOutput && finding.sourceImpact?.edges?.length) for (const [from, to] of finding.sourceImpact.edges.slice(0, 12)) line(`        local-import ${from} -> ${to}`)
    if (proofOutput) for (const step of proof) line(`        ${step.status.padEnd(12)} ${step.kind.padEnd(10)} ${step.label}${step.detail ? ` · ${step.detail}` : ''}${step.source ? ` · ${step.source}` : ''}`)
  }
  for (const item of result.report.challenge || []) {
    line(`fix     ${item.status.padEnd(22)} ${item.repository} · ${item.proposedVersion || 'no version'}`)
    const finding = (result.report.repositories || []).find((candidate) => candidate.repository === item.repository)
    line(`check   ${finding?.verdict || 'UNKNOWN'} → ${item.proposedVersion ? `upgrade ${item.proposedVersion}` : 'no admissible fix'} → ${item.status}`)
  }
  line(`rewind  ${result.report.rewind?.currentAsOf?.slice(0, 10) || 'undated'} current · ${result.report.rewind?.beforeAdvisory?.slice(0, 10) || 'unavailable'} before advisory`)
  const graphContext = summarizeGraphContext(result.hydra?.recall?.graphContext) || summarizeGraphContext(result.report.rewind?.memory?.graphContext)
  const tripletCount = graphContext?.tripletCount ?? graphContext?.triplets?.length ?? 0
  const relatedCases = result.hydra?.recall?.relatedCases || []
  line(`hydra   ${result.hydra?.status || 'skipped'} · read ${result.hydra?.recall?.status || 'not-run'} · ${result.hydra?.memoryCount || 0} memories · ${result.hydra?.recall?.datedChunkCount || 0} dated facts recalled · ${relatedCases.length} prior records · ${tripletCount} graph triplets`)
  for (const relatedCase of relatedCases.slice(0, 4)) line(`prior   ${relatedCase.scenarioId} · ${(relatedCase.kinds || []).join(', ') || 'evidence'} · ${(relatedCase.repositories || []).join(', ') || 'repository not recorded'}`)
  if (relatedCases.length > 4) line(`prior   +${relatedCases.length - 4} more records available in HydraDB history`)
  if (result.hydra?.indexingError) line(`hydra-note ${result.hydra.indexingError}`)
  if (result.hydra?.recall?.error) line(`hydra-read ${result.hydra.recall.error}`)
  line(`sources ${result.report.sources?.length || 0} public sources`)
  line(`receipt ${directMode ? result.receiptPath : `${apiBase}${result.receiptPath}`}`)
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
