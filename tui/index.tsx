/** @jsxImportSource @opentui/react */

import { createCliRenderer } from '@opentui/core'
import { createRoot, useKeyboard, useRenderer } from '@opentui/react'
import { useEffect, useState } from 'react'
import { parseGitHubRepositories, parseInvestigationInput } from '../server/collectors.js'
import { hydraStatus } from '../server/hydra.js'
import { startInvestigation } from '../server/investigation.js'
import { recordingNetworkFailures } from '../src/core/network-preflight.js'
import { recordingBlockers, recordingPreflight } from '../src/core/recording.js'

const C = {
  bg: '#0b0e0c',
  panel: '#121714',
  line: '#2b352e',
  text: '#e6ebe6',
  muted: '#86938a',
  faint: '#56635a',
  amber: '#d6a064',
  red: '#dc7b64',
  blue: '#8dbbb0',
  green: '#a5cf9d',
}

const apiBase = (process.env.RECOIL_API_URL || 'http://127.0.0.1:8787').replace(/\/$/, '')
const tuiArgs = process.argv.slice(2)
const directMode = tuiArgs.includes('--direct') || process.env.RECOIL_TUI_DIRECT === '1'
const recordingMode = tuiArgs.includes('--recording')
const query = tuiArgs.filter((arg) => !['--direct', '--recording'].includes(arg)).join(' ').trim() || process.env.RECOIL_TUI_QUERY || ''
const caseId = `tui-${Math.random().toString(16).slice(2, 10)}`
const recordingPreflightBlockers = recordingMode && query
  ? recordingPreflight({
      advisoryId: parseInvestigationInput(query).advisoryId,
      repositoryCount: parseGitHubRepositories(query).length,
      hydraConfigured: Boolean(process.env.HYDRA_DB_API_KEY && process.env.HYDRADB_DATABASE_ID),
      requireContrast: true,
      requireHydra: true,
    })
  : []
const directRecord = directMode ? {
  id: caseId,
  query: '',
  ingestion: { status: 'not_started', collectors: [] },
  hydra: { status: 'not_started', memoryCount: 0 },
  investigation: null,
} : null

function Panel({ title, children, style }) {
  return <box title={title} titleColor={C.amber} style={{ border: true, borderColor: C.line, backgroundColor: C.panel, padding: 1, flexDirection: 'column', gap: 1, ...style }}>{children}</box>
}

async function request(path, options = {}) {
  const response = await fetch(`${apiBase}${path}`, {
    ...options,
    headers: { ...(options.body ? { 'content-type': 'application/json' } : {}), ...(options.headers || {}) },
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(payload.error || `${response.status} ${response.statusText}`)
  return payload
}

function verdictColor(verdict) {
  if (verdict === 'REACHED') return C.red
  if (verdict === 'NOT_AFFECTED') return C.green
  if (verdict === 'DECLARED_ONLY') return C.amber
  return C.muted
}

function App() {
  const renderer = useRenderer()
  const compact = renderer.width < 125
  const [state, setState] = useState({ status: recordingPreflightBlockers.length ? 'failed' : query ? recordingMode ? 'preflight' : 'starting' : 'idle', evidenceStatus: 'unknown', events: [], report: null, hydra: null, error: recordingPreflightBlockers.length ? recordingPreflightBlockers.join(' · ') : null })

  useEffect(() => {
    if (!query || recordingPreflightBlockers.length) return undefined
    let cancelled = false
    async function run() {
      try {
        if (recordingMode) {
          const networkFailures = await recordingNetworkFailures({ hydraApiBase: hydraStatus().apiBase })
          if (networkFailures.length) {
            if (!cancelled) setState((current) => ({ ...current, status: 'failed', error: `Recording network preflight failed: ${networkFailures.join(' · ')}` }))
            return
          }
        }
        if (directMode) startInvestigation(directRecord, query)
        else await request(`/api/scenarios/${caseId}/investigate`, { method: 'POST', body: JSON.stringify({ query }) })
        while (!cancelled) {
          const snapshot = directMode
            ? { investigation: directRecord.investigation }
            : await request(`/api/scenarios/${caseId}`)
          const investigation = snapshot.investigation || {}
          setState({ status: investigation.status, evidenceStatus: investigation.evidence?.status || 'unknown', events: investigation.events || [], report: investigation.report, hydra: investigation.hydra, error: investigation.error })
          if (['complete', 'failed'].includes(investigation.status)) break
          await new Promise((resolve) => setTimeout(resolve, 650))
        }
      } catch (error) {
        if (!cancelled) setState((current) => ({ ...current, status: 'failed', error: error.message }))
      }
    }
    run()
    return () => { cancelled = true }
  }, [])

  useKeyboard((key) => {
    if (key.name === 'q' || key.name === 'escape') process.exit(0)
  })

  const report = state.report
  const summary = report?.summary || {}
  const quality = report?.evidenceQuality || {}
  const terminal = state.status === 'complete' || state.status === 'failed'
  const hydraReadFailed = state.hydra?.recall?.status === 'failed'
  const graphTriplets = state.hydra?.recall?.graphContext?.tripletCount ?? state.hydra?.recall?.graphContext?.triplets?.length ?? 0
  const blockers = recordingMode && report
    ? recordingBlockers({ report, evidenceStatus: state.evidenceStatus, hydra: state.hydra, requireContrast: true, requireHydra: true })
    : []
  const recordingReady = quality.readyForRecording && blockers.length === 0
  const completeLabel = recordingMode
    ? recordingReady ? '● RECORDING READY' : '● REVIEW REQUIRED'
    : quality.readyForRecording ? '● CASE COMPLETE' : '● REVIEW REQUIRED'
  const completeColor = recordingMode ? recordingReady ? C.green : C.amber : quality.readyForRecording ? C.green : C.amber

  return <box style={{ width: '100%', height: '100%', backgroundColor: C.bg, padding: 1, flexDirection: 'column', gap: 1 }}>
    <box style={{ height: 2, flexDirection: 'row', justifyContent: 'space-between' }}>
      <box style={{ flexDirection: 'row', gap: 2 }}><text fg={C.amber}>▣ RECOIL</text><text fg={C.muted}>EVIDENCE OPERATOR CONSOLE</text><text fg={C.faint}>/</text><text fg={C.muted}>PATH PROOF</text></box>
      <text fg={state.status === 'complete' ? completeColor : state.status === 'failed' ? C.red : C.amber}>{state.status === 'idle' ? '○ WAITING FOR QUERY' : state.status === 'preflight' ? '● CHECKING SERVICES' : state.status === 'complete' ? completeLabel : state.status === 'failed' ? '× CASE FAILED' : '● INVESTIGATION RUNNING'}</text>
    </box>
    <box style={{ flexDirection: 'row', gap: 1, flexGrow: 1 }}>
      <Panel title="CASE" style={{ width: compact ? 31 : 38 }}>
        <text fg={C.faint}>TARGET</text>
        <text fg={C.text}>{query || 'No query supplied'}</text>
        <text fg={C.muted}>{query ? 'public advisory and repository evidence' : 'run: npm run tui -- "<advisory> <github-url>"'}</text>
        <text fg={C.faint}>TRANSPORT</text>
        <text fg={C.muted}>{directMode ? 'direct · in-process state machine' : 'API · shared case state'}</text>
        <text fg={C.faint}>GATE</text>
        <text fg={recordingMode ? completeColor : C.muted}>{recordingMode ? 'strict three-way + HydraDB' : 'local report'}</text>
        <text fg={C.faint}>HYDRADB</text>
        <text fg={hydraReadFailed ? C.red : state.hydra?.status === 'persisted' ? C.green : C.muted}>{hydraReadFailed ? 'read failed' : state.hydra?.status || 'not started'}</text>
        <text fg={C.muted}>{state.hydra?.memoryCount || 0} memories · read {state.hydra?.recall?.status || 'not-run'} · {state.hydra?.recall?.datedChunkCount || 0} dated · {state.hydra?.recall?.relatedCaseCount || 0} related · {graphTriplets} graph triplets</text>
        <box style={{ flexGrow: 1 }} />
        <text fg={C.faint}>[q] quit</text>
      </Panel>
      <Panel title="INVESTIGATION TIMELINE" style={{ flexGrow: 1 }}>
        {state.error && <text fg={C.red}>{state.error}</text>}
        {!query && <><text fg={C.amber}>No case is running.</text><text fg={C.muted}>The TUI is a read-only view of the same autonomous API flow as the browser and CLI.</text></>}
        {query && (state.events || []).map((event) => <box key={`${event.key}:${event.status}`} style={{ flexDirection: 'column', gap: 1, borderBottom: true, borderColor: C.line, paddingBottom: 1 }}><text fg={event.status === 'failed' ? C.red : event.status === 'complete' ? C.green : C.amber}>{event.status === 'complete' ? '✓' : event.status === 'failed' ? '×' : '·'} {event.title}{event.repository ? ` · ${event.repository}` : ''}</text><text fg={C.muted}>{event.detail}</text></box>)}
        {query && !terminal && <text fg={C.amber}>… collecting the next evidence record</text>}
      </Panel>
      <Panel title="REPORT" style={{ width: compact ? 34 : 44 }}>
        {!report ? <text fg={C.faint}>The report appears after collection and proof complete.</text> : <><text fg={recordingMode ? completeColor : quality.readyForRecording ? C.green : C.amber}>{recordingMode ? recordingReady ? 'RECORDING-READY' : 'REVIEW REQUIRED' : quality.readyForRecording ? 'RECORDING-READY' : 'REVIEW REQUIRED'}</text><text fg={C.muted}>{quality.reason || 'Evidence quality unavailable.'}</text>{recordingMode && blockers.length > 0 && <><text fg={C.amber}>GATE BLOCKERS</text>{blockers.slice(0, compact ? 3 : 6).map((blocker) => <text key={blocker} fg={C.amber}>· {blocker}</text>)}</>}<text fg={C.text}>{summary.reached || 0} reached</text><text fg={C.red}>{summary.declaredOnly || 0} declared only</text><text fg={C.green}>{summary.notAffected || 0} not affected</text><text fg={C.muted}>{summary.unknown || 0} unknown</text>{(report.crossRepositoryCorrelations || []).length > 0 && <><text fg={C.faint}>SHARED RESOLUTIONS</text>{(report.crossRepositoryCorrelations || []).slice(0, compact ? 2 : 4).map((correlation) => <text key={`${correlation.packageName}@${correlation.version}`} fg={C.blue}>{correlation.packageName}@{correlation.version} · {correlation.repositoryCount} repos</text>)}</>}<text fg={C.faint}>EVIDENCE PATHS</text>{(report.repositories || []).slice(0, compact ? 2 : 4).map((finding) => { const cited = (finding.proof || []).filter((step) => ['observed', 'validated'].includes(step.status) && step.source).length; const chain = finding.dependencyPath?.length > 1 ? finding.dependencyPath.map((item) => `${item.name}@${item.version}`).join(' -> ') : null; return <box key={finding.repository} style={{ flexDirection: 'column', gap: 0, paddingBottom: 1 }}><text fg={verdictColor(finding.verdict)}>{finding.verdict} · {finding.repository}</text><text fg={C.muted}>{chain || `${cited}/${finding.proof?.length || 0} cited proof hops`}</text></box> })}<text fg={C.faint}>FIX CHECK</text>{(report.challenge || []).slice(0, compact ? 3 : 6).map((item) => { const finding = (report.repositories || []).find((candidate) => candidate.repository === item.repository); return <box key={item.repository} style={{ flexDirection: 'column', gap: 0, paddingBottom: 1 }}><text fg={item.status === 'FIX_SURVIVES' || item.status === 'ALREADY_SAFE' ? C.green : verdictColor(item.status)}>{item.repository}: {item.status}</text><text fg={C.muted}>{finding?.verdict || 'UNKNOWN'} → {item.proposedVersion ? `upgrade ${item.proposedVersion}` : 'no admissible fix'} → {item.status}</text></box>})}</>}
        <box style={{ flexGrow: 1 }} />
        <text fg={C.faint}>public sources: {report?.sources?.length || 0}</text>
      </Panel>
    </box>
  </box>
}

const renderer = await createCliRenderer({ exitOnCtrlC: true, targetFps: 30 })
createRoot(renderer).render(<App />)
