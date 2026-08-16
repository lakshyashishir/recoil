import { useEffect, useMemo, useState } from 'react'
import {
  Activity,
  AlertTriangle,
  ArrowDownRight,
  Check,
  ChevronRight,
  CircleHelp,
  Clock3,
  Crosshair,
  GitBranch,
  Layers3,
  LockKeyhole,
  Package,
  Play,
  RotateCcw,
  Server,
  Shield,
  ShieldCheck,
  Terminal,
  Target,
  Zap,
} from 'lucide-react'
import './style.css'

const graphNodes = [
  { id: 'release', label: 'parse-server@4.0.0', type: 'package', meta: 'compromised release', x: 16, y: 43 },
  { id: 'resolver', label: 'lockfile resolver', type: 'resolver', meta: 'transitive edge', x: 36, y: 43 },
  { id: 'repo', label: 'acme / checkout-api', type: 'repo', meta: 'public repository', x: 56, y: 26 },
  { id: 'payments', label: 'payments-worker', type: 'service', meta: 'deployed · us-east-1', x: 77, y: 18 },
  { id: 'gateway', label: 'api-gateway', type: 'service', meta: 'deployed · eu-west-1', x: 77, y: 42 },
  { id: 'runner', label: 'github-actions runner', type: 'infra', meta: 'shared infrastructure', x: 56, y: 68 },
  { id: 'maintainer', label: 'maintainer: devtools-labs', type: 'person', meta: 'shared publisher', x: 35, y: 76 },
]

const graphEdges = [
  ['release', 'resolver'],
  ['resolver', 'repo'],
  ['repo', 'payments'],
  ['repo', 'gateway'],
  ['release', 'runner'],
  ['runner', 'payments'],
  ['maintainer', 'release'],
]

const interventions = [
  { id: 'upgrade', title: 'Upgrade parse-server', description: 'Move to 4.1.1 or later', cost: 1, reduction: 58, icon: ArrowDownRight },
  { id: 'quarantine', title: 'Quarantine checkout-api', description: 'Stop release promotion', cost: 2, reduction: 28, icon: LockKeyhole },
  { id: 'revoke', title: 'Revoke publisher', description: 'Invalidate shared maintainer trust', cost: 3, reduction: 18, icon: Shield },
]

const timeline = [
  { label: 'Scenario armed', detail: 'OSV-2025-parse-server seeded as attack source', icon: Crosshair },
  { label: 'Package graph resolved', detail: '38 package versions · 7 dependency edges', icon: GitBranch },
  { label: 'Propagation path found', detail: 'parse-server → lockfile → checkout-api', icon: Zap },
  { label: 'Exposure window calculated', detail: '14 May 09:00 → 16 May 17:42 UTC', icon: Clock3 },
  { label: 'Containment search ready', detail: '3 interventions · budget 5', icon: Target },
]

function formatPct(value) {
  return `${Math.max(0, Math.min(100, value))}%`
}

function App() {
  const [mode, setMode] = useState('incident')
  const [query, setQuery] = useState('OSV-2025-parse-server  /  acme/checkout-api')
  const [running, setRunning] = useState(false)
  const [eventIndex, setEventIndex] = useState(0)
  const [selectedActions, setSelectedActions] = useState(['upgrade'])
  const [selectedNode, setSelectedNode] = useState('release')

  const completed = eventIndex >= timeline.length
  const baseExposure = 100
  const reduction = selectedActions.reduce((sum, id) => sum + (interventions.find((item) => item.id === id)?.reduction || 0), 0)
  const exposure = Math.max(4, baseExposure - reduction)

  useEffect(() => {
    if (!running || completed) return undefined
    const timer = window.setTimeout(() => setEventIndex((value) => value + 1), 680)
    return () => window.clearTimeout(timer)
  }, [running, eventIndex, completed])

  const activeNodes = useMemo(() => {
    const active = new Set(['release'])
    if (eventIndex >= 2) active.add('resolver')
    if (eventIndex >= 3) active.add('repo')
    if (eventIndex >= 4) {
      active.add('payments')
      active.add('gateway')
      active.add('runner')
    }
    if (selectedActions.includes('upgrade')) active.delete('payments')
    if (selectedActions.includes('quarantine')) active.delete('repo')
    return active
  }, [eventIndex, selectedActions])

  function startSimulation() {
    setEventIndex(0)
    setRunning(true)
  }

  function resetSimulation() {
    setRunning(false)
    setEventIndex(0)
    setSelectedActions(['upgrade'])
  }

  function toggleAction(id) {
    setSelectedActions((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id])
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand-lockup">
          <div className="brand-mark"><span /><span /><span /><span /></div>
          <div>
            <div className="brand-name">RECOIL</div>
            <div className="brand-subtitle">software supply-chain defense</div>
          </div>
        </div>

        <div className="topbar-center">
          <span className="live-dot" />
          <span>simulation environment</span>
          <span className="topbar-separator">/</span>
          <span className="muted">public evidence only</span>
        </div>

        <div className="topbar-actions">
          <button className="icon-button" aria-label="Help"><CircleHelp size={16} /></button>
          <div className="status-pill"><span className="status-signal" />HYDRA CONNECTED</div>
        </div>
      </header>

      <main className="workspace">
        <aside className="left-rail">
          <div className="eyebrow">CASE FILE  /  0017</div>
          <div className="case-heading">Dependency<br /><em>aftershock</em></div>
          <p className="case-summary">Model a compromise, trace its blast radius, then find the smallest defensive move.</p>

          <div className="rail-section">
            <div className="section-label">Scenario</div>
            <div className="scenario-input-wrap">
              <Terminal size={15} />
              <input value={query} onChange={(event) => setQuery(event.target.value)} aria-label="Scenario input" />
            </div>
            <button className="run-button" onClick={startSimulation} disabled={running && !completed}>
              <Play size={15} fill="currentColor" />
              {running && !completed ? 'Simulating path' : 'Run simulation'}
              <ChevronRight size={15} />
            </button>
          </div>

          <div className="rail-section mode-section">
            <div className="section-label">Operating mode</div>
            <div className="mode-switch">
              <button className={mode === 'incident' ? 'active' : ''} onClick={() => setMode('incident')}>
                <ShieldCheck size={14} /> Incident
              </button>
              <button className={mode === 'simulation' ? 'active' : ''} onClick={() => setMode('simulation')}>
                <Crosshair size={14} /> CTF mode
              </button>
            </div>
            <p className="mode-note">
              {mode === 'incident' ? 'Start from an observed advisory or package event.' : 'Choose the attack. Defend with a fixed response budget.'}
            </p>
          </div>

          <div className="rail-section source-section">
            <div className="section-label">Evidence sources</div>
            <div className="source-row"><span className="source-icon orange"><AlertTriangle size={13} /></span><span>OSV advisory</span><span className="source-state">linked</span></div>
            <div className="source-row"><span className="source-icon blue"><GitBranch size={13} /></span><span>npm registry</span><span className="source-state">linked</span></div>
            <div className="source-row"><span className="source-icon white"><GitBranch size={13} /></span><span>GitHub manifest</span><span className="source-state">linked</span></div>
          </div>

          <div className="rail-footer">
            <div><span className="muted">Graph state</span><strong>v0.4.2</strong></div>
            <div><span className="muted">Last sync</span><strong>just now</strong></div>
          </div>
        </aside>

        <section className="graph-panel">
          <div className="panel-header">
            <div>
              <div className="eyebrow">LIVE GRAPH / ATTACK PATH</div>
              <h1>Where can the compromise travel?</h1>
            </div>
            <div className="panel-header-actions">
              <div className="graph-stat"><span className="muted">nodes</span><strong>07</strong></div>
              <div className="graph-stat"><span className="muted">edges</span><strong>11</strong></div>
              <button className="reset-button" onClick={resetSimulation}><RotateCcw size={14} /> reset</button>
            </div>
          </div>

          <div className="graph-canvas">
            <div className="canvas-watermark">RECOIL / GRAPH 0017</div>
            <div className="grid-lines" />
            <svg className="edge-layer" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
              {graphEdges.map(([from, to]) => {
                const start = graphNodes.find((node) => node.id === from)
                const end = graphNodes.find((node) => node.id === to)
                const isActive = activeNodes.has(from) && activeNodes.has(to) && eventIndex >= 2
                return <line key={`${from}-${to}`} x1={start.x} y1={start.y} x2={end.x} y2={end.y} className={isActive ? 'graph-edge active' : 'graph-edge'} />
              })}
            </svg>
            <div className="graph-axis axis-x">DEPENDENCY DIRECTION  →</div>
            <div className="graph-axis axis-y">TRUST SURFACE</div>
            {graphNodes.map((node) => {
              const isActive = activeNodes.has(node.id)
              const isSelected = selectedNode === node.id
              return (
                <button
                  key={node.id}
                  className={`graph-node node-${node.type} ${isActive ? 'active' : ''} ${isSelected ? 'selected' : ''}`}
                  style={{ left: `${node.x}%`, top: `${node.y}%` }}
                  onClick={() => setSelectedNode(node.id)}
                >
                  <span className="node-icon">{node.type === 'package' ? <Package size={15} /> : node.type === 'repo' ? <GitBranch size={15} /> : node.type === 'service' ? <Server size={15} /> : node.type === 'infra' ? <Layers3 size={15} /> : node.type === 'person' ? <Shield size={15} /> : <Activity size={15} />}</span>
                  <span className="node-copy"><strong>{node.label}</strong><small>{node.meta}</small></span>
                  {isActive && <span className="node-pulse" />}
                </button>
              )
            })}
            <div className="graph-legend">
              <span><i className="legend-dot attack" /> attack source</span>
              <span><i className="legend-dot path" /> reachable path</span>
              <span><i className="legend-dot neutral" /> observed entity</span>
            </div>
          </div>

          <div className="event-strip">
            <div className="event-strip-head"><span className="section-label">Investigation log</span><span className="event-count">{eventIndex} / {timeline.length} events</span></div>
            <div className="timeline-track">
              {timeline.map((event, index) => {
                const Icon = event.icon
                const isComplete = index < eventIndex
                const isCurrent = index === eventIndex && running
                return (
                  <div className={`timeline-event ${isComplete ? 'complete' : ''} ${isCurrent ? 'current' : ''}`} key={event.label}>
                    <div className="timeline-marker">{isComplete ? <Check size={12} /> : <Icon size={12} />}</div>
                    <div><strong>{event.label}</strong><span>{event.detail}</span></div>
                  </div>
                )
              })}
            </div>
          </div>
        </section>

        <aside className="right-panel">
          <div className="right-panel-header">
            <div className="eyebrow">DEFENSE LAB</div>
            <h2>Find containment.</h2>
            <p>Choose interventions. Recoil will compare the resulting graph state.</p>
          </div>

          <div className="impact-summary">
            <div className="impact-top"><span>reachable exposure</span><span className="impact-value">{formatPct(exposure)}</span></div>
            <div className="impact-bar"><span style={{ width: `${exposure}%` }} /></div>
            <div className="impact-bottom"><span>baseline 100%</span><span className="reduction-label">-{reduction}% contained</span></div>
          </div>

          <div className="budget-row"><span><Target size={14} /> response budget</span><strong>{Math.max(0, 5 - selectedActions.reduce((sum, id) => sum + (interventions.find((item) => item.id === id)?.cost || 0), 0))} pts left</strong></div>

          <div className="intervention-list">
            {interventions.map((action) => {
              const Icon = action.icon
              const isSelected = selectedActions.includes(action.id)
              return (
                <button key={action.id} className={`intervention ${isSelected ? 'selected' : ''}`} onClick={() => toggleAction(action.id)}>
                  <span className="intervention-icon"><Icon size={16} /></span>
                  <span className="intervention-copy"><strong>{action.title}</strong><small>{action.description}</small></span>
                  <span className="intervention-cost">{isSelected ? <Check size={15} /> : `${action.cost} pt`}</span>
                </button>
              )
            })}
          </div>

          <div className="report-card">
            <div className="report-card-head"><span className="section-label">Current finding</span><span className="confidence"><span /> modeled</span></div>
            <p>{completed ? 'The selected interventions disconnect the highest-risk paths from the compromised release.' : 'Run the simulation to calculate the full propagation path.'}</p>
            <div className="report-line"><span>affected repositories</span><strong>{completed ? (selectedActions.includes('quarantine') ? '01' : '03') : '—'}</strong></div>
            <div className="report-line"><span>services remaining</span><strong>{completed ? (selectedActions.includes('upgrade') ? '01' : '03') : '—'}</strong></div>
            <div className="report-line"><span>unknown deployment records</span><strong>02</strong></div>
          </div>

          <div className="right-footer"><ShieldCheck size={15} /><span>Defensive simulation only. No package code is executed.</span></div>
        </aside>
      </main>
    </div>
  )
}

export default App
