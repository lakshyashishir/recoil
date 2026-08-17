/** @jsxImportSource @opentui/react */

import { createCliRenderer } from '@opentui/core'
import { createRoot, useKeyboard, useRenderer } from '@opentui/react'
import { useEffect, useMemo, useState } from 'react'
import {
  EVENTS,
  EDGES,
  INTERVENTIONS,
  NODES,
  RESPONSE_BUDGET,
  SCENARIO,
  advanceState,
  createInitialState,
  evaluateInterventions,
  getActiveNodeIds,
  getExposure,
  getSpent,
  isComplete,
  startDefenseRound,
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
  const renderer = useRenderer()
  const [state, setState] = useState(createInitialState())
  const [events, setEvents] = useState(EVENTS)
  const [mode, setMode] = useState('incident')

  const compact = renderer.width < 126
  const complete = isComplete(state, events.length)
  const round = Math.floor((events.length - EVENTS.length) / 3)
  const activeNodes = getActiveNodeIds(state)
  const exposure = getExposure(state)
  const reduction = 100 - exposure
  const remainingBudget = Math.max(0, RESPONSE_BUDGET - getSpent(state))
  const currentEvent = events[Math.min(state.eventIndex, events.length - 1)]
  const bestPlan = evaluateInterventions(state)[0]

  useEffect(() => {
    if (!state.running || complete) return undefined
    const timer = setTimeout(() => {
      setState((current) => {
        const next = advanceState(current, events.length)
        return { ...next, running: !isComplete(next, events.length) }
      })
    }, 700)
    return () => clearTimeout(timer)
  }, [state.running, state.eventIndex, complete, events.length])

  function applyAction(action) {
    setState((current) => {
      const next = toggleAction(current, action.id)
      if (next === current) return current
      if (current.eventIndex >= events.length) {
        const round = startDefenseRound(next, events, action.id)
        setEvents(round.events)
        return round.state
      }
      return next
    })
  }

  useKeyboard((key) => {
    if (key.name === 'q' || key.name === 'escape') process.exit(0)
    if (key.name === 's') {
      setEvents(EVENTS)
      setState((current) => ({ ...current, running: true, eventIndex: 0 }))
    }
    if (key.name === 'space') setState((current) => {
      const next = advanceState(current, events.length)
      return { ...next, running: !isComplete(next, events.length) }
    })
    if (key.name === 'r') {
      setEvents(EVENTS)
      setState(createInitialState())
    }
    if (key.name === 'i') setMode('incident')
    if (key.name === 'c') setMode('ctf')
    if (['1', '2', '3'].includes(key.name)) {
      const action = INTERVENTIONS[Number(key.name) - 1]
      if (action) applyAction(action)
    }
  })

  const graphRows = useMemo(() => {
    const visibleNodes = NODES.filter((node) => activeNodes.has(node.id))
    const rows = visibleNodes.length ? visibleNodes : [NODES.find((node) => node.id === 'release')]
    return rows.slice(0, compact ? 8 : 12).map((node, index) => ({
      arrow: index === 0 ? '◉' : index === rows.length - 1 ? ' └─' : ' ↓',
      label: compact && node.label.length > 24 ? `${node.label.slice(0, 21)}…` : node.label,
      meta: compact ? '' : node.meta.toUpperCase(),
      color: node.type === 'package' || node.type === 'person' ? C.orange : node.type === 'service' || node.type === 'data' ? C.blue : C.muted,
      active: activeNodes.has(node.id),
    }))
  }, [activeNodes, compact])

  const casePanel = (
    <Panel title="CASE" style={{ width: compact ? 25 : 31 }}>
      <Label>INVESTIGATION TARGET</Label>
      <text fg={C.text}>{SCENARIO.query}</text>
      <text fg={C.muted}>Public evidence only</text>
      <box style={{ border: true, borderColor: C.orange, padding: 1, marginTop: 1 }}>
        <text fg={C.orange}>{mode === 'incident' ? 'EVIDENCE REVIEW' : 'ADVERSARIAL DRILL'}</text>
        <text fg={C.muted}>{mode === 'incident' ? 'Observed package → response' : 'Attacker → defender → path'}</text>
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
  )

  const pathPanel = (
    <Panel title="ATTACK PATH / REACHABILITY" style={{ flexGrow: 1 }}>
      <box style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <box style={{ flexDirection: 'column', flexGrow: 1 }}>
          <text fg={C.text}>Package to deployment surface</text>
          <text fg={C.muted}>{currentEvent.detail}</text>
        </box>
        <text fg={currentEvent.side === 'attack' ? C.orange : currentEvent.side === 'defense' ? C.green : C.muted}>{currentEvent.side.toUpperCase()} · {state.running ? 'MOVING' : complete ? 'WAITING FOR CONTROL' : 'STANDBY'}</text>
      </box>
      <box style={{ border: true, borderColor: C.line, backgroundColor: '#0d1011', padding: 1, flexGrow: 1, flexDirection: 'column', justifyContent: 'center', gap: 1 }}>
        {graphRows.map((row) => (
          <box key={row.label} style={{ flexDirection: 'row', gap: 1 }}>
            <text fg={row.color}>{row.arrow}</text>
            <text fg={row.active ? row.color : C.faint}>{row.label}</text>
            {row.meta && <text fg={C.faint}>  {row.meta}</text>}
            {row.active && <text fg={row.color}>  ●</text>}
          </box>
        ))}
        {!compact && <>
          <text fg={C.faint}> </text>
          <text fg={C.faint}>────────────────────────────────────────────</text>
          <text fg={C.muted}>Graph-native path reconstruction · no package code executed</text>
        </>}
      </box>
      <box style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <text fg={C.faint}>attack source ●  reachable ●  observed ●</text>
        <text fg={C.muted}>events {state.eventIndex}/{events.length}</text>
      </box>
    </Panel>
  )

  const responsePanel = (
    <Panel title="RESPONSE PLAN" style={{ width: compact ? undefined : 36, height: compact ? 9 : undefined }}>
      <box style={{ flexDirection: 'row', justifyContent: 'space-between' }}><text fg={C.text}>Cut the path.</text><text fg={C.muted}>{remainingBudget} pts</text></box>
      <box style={{ border: true, borderColor: exposure < 50 ? C.green : C.orange, padding: 1, flexDirection: 'column', gap: 1 }}>
        <box style={{ flexDirection: 'row', justifyContent: 'space-between' }}><Label>REACHABLE EXPOSURE</Label><text fg={exposure < 50 ? C.green : C.orange}>{exposure}%</text></box>
        <text fg={exposure < 50 ? C.green : C.orange}>{'█'.repeat(Math.max(1, Math.round(exposure / 7)))}{'░'.repeat(14 - Math.max(1, Math.round(exposure / 7)))}</text>
      </box>
      {!compact && <text fg={C.green}>planner: {bestPlan.exposure}% exposure via {bestPlan.actions.length} controls</text>}
      {!compact && <Label>RESPONSE BUDGET · {remainingBudget} PTS LEFT</Label>}
      {INTERVENTIONS.slice(0, compact ? 3 : INTERVENTIONS.length).map((action, index) => {
        const selected = state.selectedActions.includes(action.id)
        return <box key={action.id} style={{ border: true, borderColor: selected ? C.orange : C.line, backgroundColor: selected ? '#201614' : C.panel2, padding: 1, flexDirection: 'row', gap: 1 }}>
          <text fg={selected ? C.orange : C.muted}>[{index + 1}]</text>
          <box style={{ flexDirection: 'column', flexGrow: 1 }}><text fg={selected ? C.text : C.muted}>{action.title}</text><text fg={C.faint}>{compact ? `${action.cost}pt · ${action.reduction}% reduction` : action.description}</text></box>
          <text fg={selected ? C.green : C.faint}>{selected ? '✓' : `${action.cost}pt`}</text>
        </box>
      })}
      {!compact && <box style={{ flexGrow: 1 }} />}
      <text fg={C.faint}>{compact ? '[1-3] select controls' : `Mode: ${mode}  /  scenario: ${SCENARIO.id}`}</text>
    </Panel>
  )

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
        {compact ? (
          <>
            {casePanel}
            <box style={{ flexGrow: 1, flexDirection: 'column', gap: 1 }}>
              {pathPanel}
              {responsePanel}
            </box>
          </>
        ) : (
          <>
            {casePanel}
            {pathPanel}
            {responsePanel}
          </>
        )}
      </box>

      <Panel title={`ATTACK / DEFENSE SEQUENCE · ROUND ${round}`} style={{ height: compact ? 3 : 8 }}>
        {compact ? <text fg={currentEvent.side === 'attack' ? C.orange : currentEvent.side === 'defense' ? C.green : C.muted}>{state.eventIndex}/{events.length} · {currentEvent.side.toUpperCase()} · {currentEvent.label} · {currentEvent.detail}</text> : <box style={{ flexDirection: 'row', gap: 2 }}>
          {events.map((event, index) => {
            const completeEvent = index < state.eventIndex
            return <box key={event.id} style={{ flexDirection: 'column', flexGrow: 1 }}>
              <text fg={completeEvent ? C.green : index === state.eventIndex ? C.orange : C.faint}>{completeEvent ? '✓' : index === state.eventIndex ? '●' : '○'} {event.label}</text>
              <text fg={C.faint}>{event.detail}</text>
            </box>
          })}
        </box>}
      </Panel>
  </box>
  )
}

const renderer = await createCliRenderer({ exitOnCtrlC: true, targetFps: 30 })
createRoot(renderer).render(<App />)
