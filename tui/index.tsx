/** @jsxImportSource @opentui/react */

import { createCliRenderer } from '@opentui/core'
import { createRoot, useKeyboard, useRenderer } from '@opentui/react'
import { useEffect, useMemo, useState } from 'react'
import { EDGES, NODES } from '../src/core/scenario.js'
import { createArenaState, stepArena } from '../src/core/arena.js'

const C = {
  bg: '#0b0e0c',
  panel: '#121714',
  panel2: '#171d19',
  line: '#2b352e',
  text: '#e6ebe6',
  muted: '#86938a',
  faint: '#56635a',
  amber: '#d6a064',
  red: '#dc7b64',
  blue: '#8dbbb0',
  green: '#a5cf9d',
}

function Panel({ title, children, style }) {
  return <box title={title} titleColor={C.amber} style={{ border: true, borderColor: C.line, backgroundColor: C.panel, padding: 1, flexDirection: 'column', gap: 1, ...style }}>{children}</box>
}

function App() {
  const renderer = useRenderer()
  const compact = renderer.width < 125
  const [arena, setArena] = useState(() => createArenaState({ scenarioId: 'tui', query: 'https://github.com/axios/axios axios', graphNodes: NODES, graphEdges: EDGES }))
  const [running, setRunning] = useState(false)
  const terminal = ['contained', 'breached', 'exhausted'].includes(arena.status)

  useEffect(() => {
    if (!running || terminal) return undefined
    const timer = setTimeout(() => setArena((current) => stepArena(current, NODES, EDGES)), 900)
    return () => clearTimeout(timer)
  }, [running, terminal, arena.round])

  useKeyboard((key) => {
    if (key.name === 'q' || key.name === 'escape') process.exit(0)
    if (key.name === 's') {
      setArena((current) => ({ ...current, status: 'running', phase: 'red' }))
      setRunning(true)
    }
    if (key.name === 'space') {
      setArena((current) => stepArena(current, NODES, EDGES))
      setRunning(false)
    }
    if (key.name === 'r') {
      setArena(createArenaState({ scenarioId: 'tui', query: 'https://github.com/axios/axios axios', graphNodes: NODES, graphEdges: EDGES }))
      setRunning(false)
    }
  })

  const last = arena.lastRound
  const rows = useMemo(() => (arena.history || []).map((round) => ({
    round,
    route: round.red.pathLabel || 'no reachable path',
  })), [arena.history])

  return <box style={{ width: '100%', height: '100%', backgroundColor: C.bg, padding: 1, flexDirection: 'column', gap: 1 }}>
    <box style={{ height: 2, flexDirection: 'row', justifyContent: 'space-between' }}>
      <box style={{ flexDirection: 'row', gap: 2 }}><text fg={C.amber}>▣ RECOIL</text><text fg={C.muted}>ADAPTIVE OPERATOR CONSOLE</text><text fg={C.faint}>/</text><text fg={C.muted}>RED / BLUE ARENA</text></box>
      <text fg={terminal ? C.green : running ? C.amber : C.faint}>{terminal ? `${arena.winner?.toUpperCase()} · ${arena.status.toUpperCase()}` : running ? '● LOOP RUNNING' : '○ PAUSED'}</text>
    </box>
    <box style={{ flexDirection: 'row', gap: 1, flexGrow: 1 }}>
      <Panel title="CASE" style={{ width: compact ? 27 : 32 }}>
        <text fg={C.faint}>TARGET</text><text fg={C.text}>axios / axios</text><text fg={C.muted}>public dependency evidence</text>
        <text fg={C.faint}>ARENA</text><text fg={C.amber}>round {arena.round} / {arena.maxRounds}</text><text fg={C.muted}>computed routes, no code execution</text>
        <text fg={C.faint}>SCORE</text><text fg={arena.currentExposure < 50 ? C.green : C.red}>{arena.initialExposure}% → {arena.currentExposure}% exposure</text><text fg={C.muted}>{arena.reachableTargets.length} high-value targets remain</text>
        <box style={{ flexGrow: 1 }} />
        <text fg={C.faint}>[s] start loop  [space] step</text><text fg={C.faint}>[r] reset  [q] quit</text>
      </Panel>
      <Panel title="LIVE PROPAGATION" style={{ flexGrow: 1 }}>
        <box style={{ flexDirection: 'row', justifyContent: 'space-between' }}><text fg={C.text}>{last?.red.label || 'Awaiting red agent'}</text><text fg={C.red}>{last ? 'RED MOVE' : 'STANDBY'}</text></box>
        <box style={{ border: true, borderColor: C.line, backgroundColor: '#0e120f', padding: 1, flexGrow: 1, flexDirection: 'column', justifyContent: 'center', gap: 1 }}>
          {last ? <><text fg={C.red}>RED  {last.red.pathLabel}</text><text fg={C.faint}>     ↓ recompute reachability</text><text fg={C.blue}>BLUE {last.blue.title || 'no control'}</text><text fg={C.muted}>     {last.blue.rationale}</text><text fg={last.after.reachableTargets.length ? C.amber : C.green}>     {last.before.exposure}% → {last.after.exposure}% · {last.after.reachableTargets.length} targets</text></> : <><text fg={C.faint}>No round has run.</text><text fg={C.muted}>The attacker will search the highest-value route in the graph.</text></>}
        </box>
        <text fg={C.faint}>red chooses from graph paths · blue chooses from bounded controls · every round is replayable</text>
      </Panel>
      <Panel title="ROUND MEMORY" style={{ width: compact ? 30 : 39 }}>
        {rows.length ? rows.map(({ round }) => <box key={round.round} style={{ borderBottom: true, borderColor: C.line, paddingBottom: 1, flexDirection: 'column', gap: 1 }}><text fg={C.amber}>ROUND {round.round}  {round.status}</text><text fg={C.red}>R · {round.red.label}</text><text fg={C.blue}>B · {round.blue.title || 'none'}</text><text fg={C.muted}>{compact ? `${round.before.exposure}% → ${round.after.exposure}%` : round.red.pathLabel}</text></box>) : <text fg={C.faint}>No memories yet.</text>}
        <box style={{ flexGrow: 1 }} />
        <text fg={arena.memory.used ? C.green : C.faint}>HydraDB precedent {arena.memory.used ? 'used' : 'not available in local TUI'}</text>
      </Panel>
    </box>
  </box>
}

const renderer = await createCliRenderer({ exitOnCtrlC: true, targetFps: 30 })
createRoot(renderer).render(<App />)
