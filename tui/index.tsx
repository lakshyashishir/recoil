/** @jsxImportSource @opentui/react */

import { createCliRenderer } from '@opentui/core'
import { createRoot, useKeyboard } from '@opentui/react'
import { useEffect, useMemo, useState } from 'react'
import {
  EVENTS,
  EDGES,
  INTERVENTIONS,
  NODES,
  SCENARIO,
  advanceState,
  createInitialState,
  getActiveNodeIds,
  getExposure,
  isComplete,
  toggleAction,
} from '../src/core/scenario.js'

const C = {
  bg: '#0b0e0f',
  panel: '#111516',
  panel2: '#151a1b',
  line: '#2a3332',
  text: '#e6ebe6',
  muted: '#7d8985',
  faint: '#4b5754',
  orange: '#ff6338',
  blue: '#83b8ff',
  green: '#a4d88b',
}

function Panel({ title, children, style }) {
  return (
    <box title={title} titleColor={C.orange} style={{ border: true, borderColor: C.line, backgroundColor: C.panel, padding: 1, flexDirection: 'column', gap: 1, ...style }}>
      {children}
    </box>
  )
}

function Label({ children }) {
  return <text fg={C.faint}>{children}</text>
}

function App() {
  const [state, setState] = useState(createInitialState())
  const [mode, setMode] = useState('incident')

  const complete = isComplete(state)
  const activeNodes = getActiveNodeIds(state)
  const exposure = getExposure(state)
  const reduction = 100 - exposure
  const remainingBudget = Math.max(0, 5 - state.selectedActions.reduce((sum, id) => sum + (INTERVENTIONS.find((item) => item.id === id)?.cost || 0), 0))

  useEffect(() => {
    if (!state.running || complete) return undefined
    const timer = setTimeout(() => {
      setState((current) => {
        const next = advanceState(current)
        return { ...next, running: !isComplete(next) }
      })
    }, 700)
    return () => clearTimeout(timer)
  }, [state.running, state.eventIndex, complete])

  useKeyboard((key) => {
    if (key.name === 'q' || key.name === 'escape') process.exit(0)
    if (key.name === 's') setState((current) => ({ ...current, running: true, eventIndex: 0 }))
    if (key.name === 'space') setState((current) => ({ ...advanceState(current), running: !isComplete(advanceState(current)) }))
    if (key.name === 'r') setState(createInitialState())
    if (key.name === 'i') setMode('incident')
    if (key.name === 'c') setMode('ctf')
    if (['1', '2', '3'].includes(key.name)) {
      const action = INTERVENTIONS[Number(key.name) - 1]
      if (action) setState((current) => toggleAction(current, action.id))
    }
  })

  const graphRows = useMemo(() => [
    { arrow: '◉', label: 'ua-parser-js@0.7.29', meta: 'COMPROMISED RELEASE', color: C.orange, active: activeNodes.has('release') },
    { arrow: ' ↓', label: 'lockfile resolver', meta: 'TRANSITIVE EDGE', color: activeNodes.has('resolver') ? C.orange : C.faint, active: activeNodes.has('resolver') },
    { arrow: '  ↓', label: 'fixture / storefront-api', meta: 'SYNTHETIC DEMO REPO', color: activeNodes.has('repo') ? C.orange : C.faint, active: activeNodes.has('repo') },
    { arrow: '   ├─', label: 'payments-worker', meta: 'DEPLOYED · US-EAST-1', color: activeNodes.has('payments') ? C.blue : C.faint, active: activeNodes.has('payments') },
    { arrow: '   └─', label: 'api-gateway', meta: 'DEPLOYED · EU-WEST-1', color: activeNodes.has('gateway') ? C.blue : C.faint, active: activeNodes.has('gateway') },
    { arrow: '  ↘', label: 'github-actions runner', meta: 'SHARED INFRASTRUCTURE', color: activeNodes.has('runner') ? C.blue : C.faint, active: activeNodes.has('runner') },
  ], [activeNodes])

  return (
    <box style={{ width: '100%', height: '100%', backgroundColor: C.bg, padding: 1, flexDirection: 'column', gap: 1 }}>
      <box style={{ flexDirection: 'row', justifyContent: 'space-between', height: 2 }}>
        <box style={{ flexDirection: 'row', gap: 2 }}>
          <text fg={C.orange}>▣ RECOIL</text>
          <text fg={C.muted}>OPERATOR CONSOLE</text>
          <text fg={C.faint}>/</text>
          <text fg={C.muted}>CASE {SCENARIO.id}</text>
        </box>
        <box style={{ flexDirection: 'row', gap: 2 }}>
          <text fg={C.green}>● HYDRA CONNECTED</text>
          <text fg={C.faint}>v0.1.0</text>
        </box>
      </box>

      <box style={{ flexDirection: 'row', gap: 1, flexGrow: 1 }}>
        <Panel title="MISSION" style={{ width: 31 }}>
          <Label>SCENARIO</Label>
          <text fg={C.text}>{SCENARIO.query}</text>
          <text fg={C.muted}>Public evidence only</text>
          <box style={{ border: true, borderColor: C.orange, padding: 1, marginTop: 1 }}>
            <text fg={C.orange}>{mode === 'incident' ? 'INCIDENT MODE' : 'CTF MODE'}</text>
            <text fg={C.muted}>{mode === 'incident' ? 'Observed advisory → response' : 'Attack → defend → score'}</text>
          </box>
          <Label>ATTACK SOURCE</Label>
          <text fg={C.orange}>⚠ ua-parser-js@0.7.29</text>
          <text fg={C.muted}>CVE-2021-4229 / GHSA</text>
          <Label>GRAPH SNAPSHOT</Label>
          <text fg={C.text}>{String(NODES.length).padStart(2, '0')} nodes  /  {String(EDGES.length).padStart(2, '0')} edges</text>
          <text fg={C.muted}>temporal state {SCENARIO.graphVersion}</text>
          <box style={{ flexGrow: 1 }} />
          <text fg={C.faint}>[s] start  [space] step</text>
          <text fg={C.faint}>[1-3] defend  [r] reset  [q] quit</text>
        </Panel>

        <Panel title="ATTACK PATH / LIVE GRAPH" style={{ flexGrow: 1 }}>
          <box style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <text fg={C.text}>Where can the compromise travel?</text>
            <text fg={state.running ? C.orange : complete ? C.green : C.muted}>{state.running ? 'PROPAGATING' : complete ? 'PATH RESOLVED' : 'STANDBY'}</text>
          </box>
          <box style={{ border: true, borderColor: C.line, backgroundColor: '#0d1011', padding: 1, flexGrow: 1, flexDirection: 'column', justifyContent: 'center', gap: 1 }}>
            {graphRows.map((row) => (
              <box key={row.label} style={{ flexDirection: 'row', gap: 1 }}>
                <text fg={row.color}>{row.arrow}</text>
                <text fg={row.active ? row.color : C.faint}>{row.label}</text>
                <text fg={C.faint}>  {row.meta}</text>
                {row.active && <text fg={row.color}>  ●</text>}
              </box>
            ))}
            <text fg={C.faint}> </text>
            <text fg={C.faint}>────────────────────────────────────────────</text>
            <text fg={C.muted}>Graph-native path reconstruction · no package code executed</text>
          </box>
          <box style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <text fg={C.faint}>attack source ●  reachable ●  observed ●</text>
            <text fg={C.muted}>events {state.eventIndex}/{EVENTS.length}</text>
          </box>
        </Panel>

        <Panel title="DEFENSE LAB" style={{ width: 36 }}>
          <text fg={C.text}>Find containment.</text>
          <text fg={C.muted}>Select actions and compare the graph state.</text>
          <box style={{ border: true, borderColor: exposure < 50 ? C.green : C.orange, padding: 1, flexDirection: 'column', gap: 1 }}>
            <box style={{ flexDirection: 'row', justifyContent: 'space-between' }}><Label>REACHABLE EXPOSURE</Label><text fg={exposure < 50 ? C.green : C.orange}>{exposure}%</text></box>
            <text fg={exposure < 50 ? C.green : C.orange}>{'█'.repeat(Math.max(1, Math.round(exposure / 7)))}{'░'.repeat(14 - Math.max(1, Math.round(exposure / 7)))}</text>
            <box style={{ flexDirection: 'row', justifyContent: 'space-between' }}><text fg={C.faint}>baseline 100%</text><text fg={C.green}>-{reduction}% contained</text></box>
          </box>
          <Label>RESPONSE BUDGET · {remainingBudget} PTS LEFT</Label>
          {INTERVENTIONS.map((action, index) => {
            const selected = state.selectedActions.includes(action.id)
            return <box key={action.id} style={{ border: true, borderColor: selected ? C.orange : C.line, backgroundColor: selected ? '#201614' : C.panel2, padding: 1, flexDirection: 'row', gap: 1 }}>
              <text fg={selected ? C.orange : C.muted}>[{index + 1}]</text>
              <box style={{ flexDirection: 'column', flexGrow: 1 }}><text fg={selected ? C.text : C.muted}>{action.title}</text><text fg={C.faint}>{action.description}</text></box>
              <text fg={selected ? C.green : C.faint}>{selected ? '✓' : `${action.cost}pt`}</text>
            </box>
          })}
          <box style={{ flexGrow: 1 }} />
          <text fg={C.faint}>Mode: {mode}  /  scenario: {SCENARIO.id}</text>
        </Panel>
      </box>

      <Panel title="INVESTIGATION LOG" style={{ height: 8 }}>
        <box style={{ flexDirection: 'row', gap: 2 }}>
          {EVENTS.map((event, index) => {
            const completeEvent = index < state.eventIndex
            return <box key={event.id} style={{ flexDirection: 'column', flexGrow: 1 }}>
              <text fg={completeEvent ? C.green : index === state.eventIndex ? C.orange : C.faint}>{completeEvent ? '✓' : index === state.eventIndex ? '●' : '○'} {event.label}</text>
              <text fg={C.faint}>{event.detail}</text>
            </box>
          })}
        </box>
      </Panel>
  </box>
  )
}

const renderer = await createCliRenderer({ exitOnCtrlC: true, targetFps: 30 })
createRoot(renderer).render(<App />)
