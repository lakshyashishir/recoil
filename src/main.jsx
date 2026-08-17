import { useEffect, useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
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
import {
  EDGES,
  EVENTS,
  INTERVENTIONS,
  NODES,
  RESPONSE_BUDGET,
  SCENARIO,
  getActiveNodeIds,
  getExposure,
  getSpent,
  toggleAction as toggleScenarioAction,
} from './core/scenario.js'
import './style.css'

const eventIcons = {
  armed: Crosshair,
  maintainer_access: Shield,
  release_published: Package,
  dependency_resolved: GitBranch,
  lockfile_promoted: Layers3,
  deployment_fanout: Zap,
  runtime_exposed: Target,
  defender_alert: Activity,
  containment_window: Clock3,
  response_ready: ShieldCheck,
}

const actionIcons = {
  upgrade: ArrowDownRight,
  'block-promotion': ShieldCheck,
  quarantine: LockKeyhole,
  revoke: Shield,
  'rotate-secrets': LockKeyhole,
  restore: RotateCcw,
}

function formatPct(value) {
  return `${Math.max(0, Math.min(100, value))}%`
}

function App() {
  const [mode, setMode] = useState('incident')
  const [query, setQuery] = useState(SCENARIO.query)
  const [running, setRunning] = useState(false)
  const [eventIndex, setEventIndex] = useState(0)
  const [round, setRound] = useState(0)
  const [selectedActions, setSelectedActions] = useState(['upgrade'])
  const [selectedNode, setSelectedNode] = useState('release')
  const [backendStatus, setBackendStatus] = useState('checking')
  const [mesh, setMesh] = useState({ status: 'idle', collectors: [], hydra: 'not_started', recallChunks: 0, lastDecision: null })
  const [graph, setGraph] = useState({ nodes: NODES, edges: EDGES })
  const [events, setEvents] = useState(EVENTS)
  const [recommendation, setRecommendation] = useState(null)
  const [report, setReport] = useState(null)

  const completed = eventIndex >= events.length
  const exposure = getExposure({ eventIndex, selectedActions })
  const reduction = 100 - exposure
  const currentEvent = events[Math.min(eventIndex, events.length - 1)]

  useEffect(() => {
    if (!running || completed) return undefined
    const timer = window.setTimeout(() => {
      fetch('/api/scenarios/0017/advance', { method: 'POST' })
        .then((response) => response.ok ? response.json() : Promise.reject(new Error('Advance failed')))
        .then((payload) => {
          setEventIndex(payload.state?.eventIndex ?? events.length)
          setRunning(Boolean(payload.state?.running))
        })
        .catch(() => setEventIndex((value) => {
          const next = Math.min(events.length, value + 1)
          if (next >= events.length) setRunning(false)
          return next
        }))
    }, 780)
    return () => window.clearTimeout(timer)
  }, [running, eventIndex, completed, events])

  const activeNodes = useMemo(() => getActiveNodeIds({ eventIndex, selectedActions }, graph.nodes), [eventIndex, selectedActions, graph.nodes])

  useEffect(() => {
    fetch('/api/health')
      .then((response) => response.ok ? response.json() : Promise.reject(new Error('API unavailable')))
      .then((payload) => setBackendStatus(payload.hydra?.status === 'ready' ? 'ready' : 'offline'))
      .catch(() => setBackendStatus('offline'))
  }, [])

  useEffect(() => {
    if (!completed) return undefined
    const controller = new AbortController()
    fetch('/api/scenarios/0017/report', { signal: controller.signal })
      .then((response) => response.ok ? response.json() : Promise.reject(new Error('Report unavailable')))
      .then((payload) => setReport(payload))
      .catch(() => {})
    return () => controller.abort()
  }, [completed, selectedActions])

  function startSimulation() {
    setEventIndex(0)
    setRound(0)
    setRunning(true)
    setSelectedActions(['upgrade'])
    setRecommendation(null)
    setReport(null)
    setEvents(EVENTS)
    setGraph({ nodes: NODES, edges: EDGES })
    setMesh({ status: 'running', collectors: [], hydra: 'running', recallChunks: 0, lastDecision: null })
    fetch('/api/scenarios/0017/run', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ query }),
    }).then(() => fetch('/api/scenarios/0017/ingest', { method: 'POST' }))
      .then((response) => response.ok ? response.json() : Promise.reject(new Error('Ingestion failed')))
      .then((payload) => {
        setGraph({ nodes: payload.graph?.nodes || NODES, edges: payload.graph?.edges || EDGES })
        setEvents(payload.events || EVENTS)
        setRound(payload.scenario?.round || 0)
        setMesh({
          status: payload.ingestion?.status || 'partial',
          collectors: payload.ingestion?.collectors || [],
          hydra: payload.hydra?.status || 'skipped',
          recallChunks: 0,
          lastDecision: null,
        })
        return fetch('/api/scenarios/0017/recall', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ query }),
        })
      })
      .then((response) => response.ok ? response.json() : Promise.reject(new Error('Recall failed')))
      .then((payload) => setMesh((current) => ({ ...current, recallChunks: payload.hydra?.recall?.chunks?.length || 0 })))
      .catch(() => setMesh((current) => ({ ...current, status: 'failed', hydra: 'failed' })))
  }

  function resetSimulation() {
    setRunning(false)
    setEventIndex(0)
    setRound(0)
    setSelectedActions(['upgrade'])
    setGraph({ nodes: NODES, edges: EDGES })
    setEvents(EVENTS)
    setMesh({ status: 'idle', collectors: [], hydra: 'not_started', recallChunks: 0, lastDecision: null })
    setRecommendation(null)
    setReport(null)
    fetch('/api/scenarios/0017/reset', { method: 'POST' }).catch(() => {})
  }

  function findContainment() {
    fetch('/api/scenarios/0017/evaluate', { method: 'POST' })
      .then((response) => response.ok ? response.json() : Promise.reject(new Error('Evaluation failed')))
      .then((payload) => setRecommendation(payload.recommended || null))
      .catch(() => setRecommendation(null))
  }

  function applyRecommendation() {
    if (!recommendation) return
    const desired = recommendation.actions || []
    const changes = [...new Set([...selectedActions, ...desired])].filter((id) => selectedActions.includes(id) !== desired.includes(id))
    setSelectedActions(desired)
    changes.reduce((chain, id) => chain.then(() => fetch('/api/scenarios/0017/action', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id }),
    }).then((response) => response.ok ? response.json() : Promise.reject(new Error('Decision failed')))
      .then((payload) => {
        setSelectedActions(payload.state?.selectedActions || desired)
        setEvents(payload.events || EVENTS)
        setEventIndex(payload.state?.eventIndex ?? eventIndex)
        setRunning(Boolean(payload.state?.running))
        setRound(payload.scenario?.round || 0)
        setMesh((current) => ({ ...current, hydra: payload.hydra?.status || current.hydra, lastDecision: payload.hydra?.lastDecision || current.lastDecision }))
      })), Promise.resolve()).catch(() => {})
  }

  function collectorStatus(name) {
    const collector = mesh.collectors.find((item) => item.collector === name)
    if (collector) return collector.status
    return mesh.status === 'running' ? 'working' : 'ready'
  }

  function toggleAction(id) {
    setSelectedActions((current) => toggleScenarioAction({ selectedActions: current }, id).selectedActions)
    fetch('/api/scenarios/0017/action', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id }),
    }).then((response) => response.ok ? response.json() : Promise.reject(new Error('Decision failed')))
      .then((payload) => {
        setEvents(payload.events || EVENTS)
        setEventIndex(payload.state?.eventIndex ?? eventIndex)
        setRunning(Boolean(payload.state?.running))
        setSelectedActions(payload.state?.selectedActions || [])
        setRound(payload.scenario?.round || 0)
        setMesh((current) => ({
          ...current,
          hydra: payload.hydra?.status || current.hydra,
          lastDecision: payload.hydra?.lastDecision || current.lastDecision,
        }))
      })
      .catch(() => setMesh((current) => ({ ...current, lastDecision: { status: 'local-only', action: id } })))
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand-lockup">
            <div className="brand-mark" aria-hidden="true"><span /></div>
          <div>
            <div className="brand-name">RECOIL</div>
            <div className="brand-subtitle">incident operations</div>
          </div>
        </div>

        <div className="topbar-center">
          <span className="live-dot" />
          <span>live case workspace</span>
          <span className="topbar-separator">/</span>
          <span className="muted">evidence-led analysis</span>
        </div>

        <div className="topbar-actions">
          <button className="icon-button" aria-label="Help"><CircleHelp size={16} /></button>
          <div className="status-pill"><span className={`status-signal ${backendStatus === 'offline' ? 'offline' : ''}`} />{backendStatus === 'ready' ? 'HYDRA CONNECTED' : backendStatus === 'offline' ? 'LOCAL DEMO' : 'CONNECTING'}</div>
        </div>
      </header>

      <main className="workspace">
        <aside className="left-rail">
          <div className="eyebrow">CASE 0017  /  ACTIVE</div>
          <div className="case-heading">Supply-chain<br /><em>exposure</em></div>
          <p className="case-summary">Trace the package from publication to the services and data it can reach.</p>

          <div className="rail-section">
            <div className="section-label">Investigation target</div>
            <div className="scenario-input-wrap">
              <Terminal size={15} />
              <input value={query} onChange={(event) => setQuery(event.target.value)} aria-label="Scenario input" />
            </div>
            <button className="run-button" onClick={startSimulation} disabled={running && !completed}>
              <Play size={15} fill="currentColor" />
              {running && !completed ? 'Tracing attack path' : 'Start investigation'}
              <ChevronRight size={15} />
            </button>
          </div>

          <div className="rail-section mode-section">
            <div className="section-label">Operating context</div>
            <div className="mode-switch">
              <button className={mode === 'incident' ? 'active' : ''} onClick={() => setMode('incident')}>
                <ShieldCheck size={14} /> Evidence review
              </button>
              <button className={mode === 'simulation' ? 'active' : ''} onClick={() => setMode('simulation')}>
                <Crosshair size={14} /> Adversarial drill
              </button>
            </div>
            <p className="mode-note">
              {mode === 'incident' ? 'Start with an observed advisory or package event.' : 'Advance the attacker and spend controls to contain it.'}
            </p>
          </div>

          <div className="rail-section source-section">
            <div className="section-label">Collection status</div>
            <div className="source-row"><span className="source-icon orange"><AlertTriangle size={13} /></span><span>OSV advisory</span><span className="source-state">{collectorStatus('advisory-resolver')}</span></div>
            <div className="source-row"><span className="source-icon blue"><GitBranch size={13} /></span><span>npm registry</span><span className="source-state">{collectorStatus('registry-resolver')}</span></div>
            <div className="source-row"><span className="source-icon white"><GitBranch size={13} /></span><span>GitHub manifest</span><span className="source-state">{collectorStatus('repository-extractor')}</span></div>
            <div className="source-row"><span className="source-icon white"><Activity size={13} /></span><span>HydraDB graph</span><span className="source-state">{mesh.hydra === 'persisted' ? `${mesh.recallChunks} recalled` : mesh.hydra}</span></div>
          </div>

          <div className="rail-footer">
            <div><span className="muted">Graph state</span><strong>{SCENARIO.graphVersion}</strong></div>
            <div><span className="muted">Last sync</span><strong>just now</strong></div>
          </div>
        </aside>

        <section className="graph-panel">
          <div className="panel-header">
            <div>
              <div className="eyebrow">ATTACK PATH  /  REACHABILITY  /  ROUND {round}</div>
              <h1>Package to deployment surface</h1>
              <p className="phase-detail">{currentEvent.detail}</p>
              <div className="phase-meta"><span>{currentEvent.actor}</span><span>intent: {currentEvent.intent}</span></div>
            </div>
            <div className="panel-header-actions">
              <div className={`phase-summary ${currentEvent.side}`}><span className="phase-kicker">NOW</span><strong>{currentEvent.side === 'attack' ? 'ATTACKER' : currentEvent.side === 'defense' ? 'DEFENDER' : 'SYSTEM'}</strong><span>{currentEvent.label}</span></div>
              <div className="graph-stat"><span className="muted">nodes</span><strong>{String(graph.nodes.length).padStart(2, '0')}</strong></div>
              <div className="graph-stat"><span className="muted">edges</span><strong>{String(graph.edges.length).padStart(2, '0')}</strong></div>
              <button className="reset-button" onClick={resetSimulation}><RotateCcw size={14} /> reset</button>
            </div>
          </div>

          <div className="graph-canvas">
            <div className="canvas-watermark">CASE 0017  ·  LIVE REACHABILITY MODEL</div>
            <div className="grid-lines" />
            <svg className="edge-layer" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
              {graph.edges.map(([from, to]) => {
                const start = graph.nodes.find((node) => node.id === from)
                const end = graph.nodes.find((node) => node.id === to)
                const isActive = activeNodes.has(from) && activeNodes.has(to) && eventIndex >= 2
                return start && end ? <line key={`${from}-${to}`} x1={start.x} y1={start.y} x2={end.x} y2={end.y} className={isActive ? 'graph-edge active' : 'graph-edge'} /> : null
              })}
            </svg>
            <div className="graph-axis axis-x">dependency → service → data</div>
            <div className="graph-axis axis-y">trust boundary</div>
            {graph.nodes.map((node) => {
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
            <div className="event-strip-head"><span className="section-label">Attack / defense sequence</span><span className="event-count">round {round} · {eventIndex} / {events.length} steps</span></div>
            <div className="loop-legend"><span>observe</span><i>→</i><span>choose control</span><i>→</i><span>test residual path</span><i>→</i><span>recalculate</span></div>
            <div className="timeline-track">
              {events.map((event, index) => {
                const Icon = eventIcons[event.id] || Activity
                const isComplete = index < eventIndex
                const isCurrent = index === eventIndex && running
                return (
                  <div className={`timeline-event ${event.side} ${isComplete ? 'complete' : ''} ${isCurrent ? 'current' : ''}`} key={event.id}>
                    <div className="timeline-marker">{isComplete ? <Check size={12} /> : <Icon size={12} />}</div>
                    <div><strong>{event.label}</strong><span>{event.actor} · {event.detail}</span></div>
                  </div>
                )
              })}
            </div>
          </div>
        </section>

        <aside className="right-panel">
          <div className="right-panel-header">
            <div className="eyebrow">RESPONSE PLAN  /  DEFENDER</div>
            <h2>Cut the reachable path.</h2>
            <p>Controls change the active graph. Use the smallest response that closes the exposed route.</p>
          </div>

          <div className="impact-summary">
            <div className="impact-top"><span>reachable exposure</span><span className="impact-value">{formatPct(exposure)}</span></div>
            <div className="impact-bar"><span style={{ width: `${exposure}%` }} /></div>
            <div className="impact-bottom"><span>baseline 100%</span><span className="reduction-label">-{reduction}% contained</span></div>
          </div>

          <div className="budget-row"><span><Target size={14} /> response budget</span><strong>{Math.max(0, RESPONSE_BUDGET - getSpent({ selectedActions }))} pts left</strong></div>

          <div className="planner-row">
            <div><span className="section-label">Counterfactual planner</span><span>Search the bounded response space.</span></div>
            <button onClick={findContainment}>Find minimum containment</button>
          </div>

          {recommendation && (
            <div className="recommendation">
              <div className="decision-log-head"><span className="section-label">Recommended response</span><span className="decision-status">{recommendation.exposure}% exposure</span></div>
              <strong>{recommendation.actions.map((id) => INTERVENTIONS.find((action) => action.id === id)?.title).filter(Boolean).join(' + ') || 'Observe only'}</strong>
              <span>{recommendation.contained}% modeled containment · {recommendation.cost} response points · {recommendation.activeNodes} active nodes</span>
              <button onClick={applyRecommendation}>Apply plan</button>
            </div>
          )}

          <div className="intervention-list">
            <div className="response-window">{completed ? `Round ${round} complete · choose a control to open the next attack test.` : 'Controls are applied when the response window opens.'}</div>
            {INTERVENTIONS.map((action) => {
              const Icon = actionIcons[action.id]
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

          {mesh.lastDecision && (
            <div className="decision-log">
              <div className="decision-log-head"><span className="section-label">Latest defender action</span><span className="decision-status">{mesh.lastDecision.status}</span></div>
              <strong>{INTERVENTIONS.find((action) => action.id === mesh.lastDecision.result?.action || action.id === mesh.lastDecision.action)?.title || 'Response updated'}</strong>
              <span>{mesh.lastDecision.status === 'queued' ? 'Decision accepted by HydraDB; graph state updated locally.' : 'Decision recorded and graph state updated.'}</span>
            </div>
          )}

          <div className="report-card">
            <div className="report-card-head"><span className="section-label">Decision summary</span><span className="confidence"><span /> {mesh.recallChunks ? 'evidence linked' : 'awaiting trace'}</span></div>
            <p>{report?.conclusion || (completed ? 'The selected controls disconnect the highest-risk paths from the compromised release.' : 'Start an investigation to calculate the reachable path and expose response points.')}</p>
            <div className="report-line"><span>repository target</span><strong>{report?.observed?.repository || 'fixture'}</strong></div>
            <div className="report-line"><span>modeled graph</span><strong>{report ? `${report.modeled.graphNodes}n / ${report.modeled.graphEdges}e` : '—'}</strong></div>
            <div className="report-line"><span>observed CI / runtime</span><strong>{report?.observed ? `${report.observed.ciSignals?.workflowFiles?.length || 0} / ${report.observed.deploymentSignals?.length || 0}` : '—'}</strong></div>
            <div className="report-line"><span>evidence sources</span><strong>{report ? report.sources.length : '—'}</strong></div>
            <div className="report-line"><span>active nodes at peak</span><strong>{report ? report.modeled.activeNodes : '—'}</strong></div>
            <div className="report-line"><span>uncertainties</span><strong>{report ? report.uncertainty.length : '—'}</strong></div>
            <div className="report-line"><span>HydraDB evidence context</span><strong>{mesh.recallChunks ? `${mesh.recallChunks} chunks` : '—'}</strong></div>
            {report?.uncertainty?.[0] && <div className="report-uncertainty">Uncertainty · {report.uncertainty[0]}</div>}
          </div>

          <div className="right-footer"><ShieldCheck size={15} /><span>Analysis only. Recoil never executes package code.</span></div>
        </aside>
      </main>
    </div>
  )
}

export default App

createRoot(document.getElementById('root')).render(<App />)
