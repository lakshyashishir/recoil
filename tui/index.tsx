/** @jsxImportSource @opentui/react */

import { createCliRenderer } from '@opentui/core'
import { createRoot, useEffect, useKeyboard, useRenderer, useState } from '@opentui/react'

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
const query = process.argv.slice(2).join(' ').trim() || process.env.RECOIL_TUI_QUERY || ''
const caseId = `tui-${Math.random().toString(16).slice(2, 10)}`

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
  const [state, setState] = useState({ status: query ? 'starting' : 'idle', events: [], report: null, hydra: null, error: null })

  useEffect(() => {
    if (!query) return undefined
    let cancelled = false
    async function run() {
      try {
        await request(`/api/scenarios/${caseId}/investigate`, { method: 'POST', body: JSON.stringify({ query }) })
        while (!cancelled) {
          const snapshot = await request(`/api/scenarios/${caseId}`)
          const investigation = snapshot.investigation || {}
          setState({ status: investigation.status, events: investigation.events || [], report: investigation.report, hydra: investigation.hydra, error: investigation.error })
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
  const terminal = state.status === 'complete' || state.status === 'failed'

  return <box style={{ width: '100%', height: '100%', backgroundColor: C.bg, padding: 1, flexDirection: 'column', gap: 1 }}>
    <box style={{ height: 2, flexDirection: 'row', justifyContent: 'space-between' }}>
      <box style={{ flexDirection: 'row', gap: 2 }}><text fg={C.amber}>▣ RECOIL</text><text fg={C.muted}>EVIDENCE OPERATOR CONSOLE</text><text fg={C.faint}>/</text><text fg={C.muted}>PATH PROOF</text></box>
      <text fg={state.status === 'complete' ? C.green : state.status === 'failed' ? C.red : C.amber}>{state.status === 'idle' ? '○ WAITING FOR QUERY' : state.status === 'complete' ? '● CASE COMPLETE' : state.status === 'failed' ? '× CASE FAILED' : '● INVESTIGATION RUNNING'}</text>
    </box>
    <box style={{ flexDirection: 'row', gap: 1, flexGrow: 1 }}>
      <Panel title="CASE" style={{ width: compact ? 31 : 38 }}>
        <text fg={C.faint}>TARGET</text>
        <text fg={C.text}>{query || 'No query supplied'}</text>
        <text fg={C.muted}>{query ? 'public advisory and repository evidence' : 'run: npm run tui -- "<advisory> <github-url>"'}</text>
        <text fg={C.faint}>HYDRADB</text>
        <text fg={state.hydra?.status === 'persisted' ? C.green : C.muted}>{state.hydra?.status || 'not started'}</text>
        <text fg={C.muted}>{state.hydra?.memoryCount || 0} memories · {state.hydra?.recall?.chunkCount || 0} recalled</text>
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
        {!report ? <text fg={C.faint}>The report appears after collection and proof complete.</text> : <><text fg={C.text}>{summary.reached || 0} reached</text><text fg={C.red}>{summary.declaredOnly || 0} declared only</text><text fg={C.green}>{summary.notAffected || 0} not affected</text><text fg={C.muted}>{summary.unknown || 0} unknown</text><text fg={C.faint}>FIX PROOF</text>{(report.challenge || []).slice(0, compact ? 3 : 6).map((item) => <text key={item.repository} fg={item.status === 'FIX_SURVIVES' || item.status === 'ALREADY_SAFE' ? C.green : verdictColor(item.status)}>{item.repository}: {item.status}</text>)}</>}
        <box style={{ flexGrow: 1 }} />
        <text fg={C.faint}>public sources: {report?.sources?.length || 0}</text>
      </Panel>
    </box>
  </box>
}

const renderer = await createCliRenderer({ exitOnCtrlC: true, targetFps: 30 })
createRoot(renderer).render(<App />)
