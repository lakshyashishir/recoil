import { Component, useEffect, useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Check,
  ChevronRight,
  CircleHelp,
  Database,
  ExternalLink,
  GitBranch,
  LockKeyhole,
  Pause,
  Play,
  RotateCcw,
  Server,
  Shield,
  ShieldCheck,
  Terminal,
  Target,
  Waypoints,
  Zap,
} from 'lucide-react'
import { EDGES, EVENTS, INTERVENTIONS, NODES, SCENARIO } from './core/scenario.js'
import './style.css'

const DEFAULT_QUERY = 'https://github.com/axios/axios axios'

function formatPct(value) {
  return `${Math.max(0, Math.min(100, value || 0))}%`
}

function sourceHost(value) {
  try {
    return new URL(value).hostname.replace(/^www\./, '')
  } catch {
    return value
  }
}

function nodeIcon(node) {
  if (node.type === 'package') return <GitBranch size={13} />
  if (node.type === 'service') return <Server size={13} />
  if (node.type === 'data') return <Database size={13} />
  if (node.type === 'person') return <Shield size={13} />
  if (node.type === 'infra') return <Waypoints size={13} />
  return <Activity size={13} />
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: { ...(options.body ? { 'content-type': 'application/json' } : {}), ...(options.headers || {}) },
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(payload.error || `${response.status} ${response.statusText}`)
  return payload
}

function Landing({ query, setQuery, onStart, busy, error }) {
  return (
    <main className="landing-shell">
      <div className="landing-kicker"><span className="signal-dot" /> memory-backed red / blue analysis</div>
      <h1>Find the route<br /><em>before it spreads.</em></h1>
      <p className="landing-copy">Recoil turns public package evidence into a live supply-chain attack-defense episode. Red searches. Blue adapts. Every route is computed and remembered.</p>
      <form className="trace-form" onSubmit={(event) => { event.preventDefault(); onStart() }}>
        <div className="trace-form-label"><Terminal size={14} /> target to investigate</div>
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Package, advisory, or public GitHub repository" aria-label="Target to investigate" />
        <div className="trace-form-bottom">
          <span>public evidence only · no code execution</span>
          <button type="submit" disabled={busy}>{busy ? 'Collecting evidence…' : <>Open arena <ArrowRight size={15} /></>}</button>
        </div>
      </form>
      <div className="landing-examples"><span>try a live repository</span><button onClick={() => setQuery(DEFAULT_QUERY)}>axios / axios</button><button onClick={() => setQuery('https://github.com/hydra-db/hydradb')}>hydra-db / hydradb</button></div>
      {error && <div className="error-line"><AlertTriangle size={14} /> {error}</div>}
    </main>
  )
}

function SourceRail({ snapshot }) {
  const collectors = snapshot?.ingestion?.collectors || []
  const repo = collectors.find((item) => item.collector === 'repository-extractor')
  const registry = repo?.ecosystem === 'cargo' ? 'crates.io registry' : 'npm registry'
  const status = (name) => collectors.find((item) => item.collector === name)?.status || 'ready'
  const hydra = snapshot?.hydra?.status || 'not started'
  return (
    <div className="source-rail">
      <div className="section-caption">evidence mesh</div>
      <div className="source-item"><span className="source-glyph amber"><Activity size={13} /></span><span>OSV advisories</span><b>{status('advisory-resolver')}</b></div>
      <div className="source-item"><span className="source-glyph blue"><GitBranch size={13} /></span><span>{registry}</span><b>{status('registry-resolver')}</b></div>
      <div className="source-item"><span className="source-glyph neutral"><Waypoints size={13} /></span><span>repository graph</span><b>{status('repository-extractor')}</b></div>
      <div className="source-item"><span className="source-glyph green"><Database size={13} /></span><span>HydraDB memory</span><b>{hydra}{snapshot?.hydra?.arenaMemoryCount ? ` · ${snapshot.hydra.arenaMemoryCount}` : ''}</b></div>
    </div>
  )
}

function Graph({ snapshot, selectedNode, setSelectedNode }) {
  const graph = snapshot?.graph || { nodes: NODES, edges: EDGES, activeNodeIds: [], blockedNodeIds: [], primaryPath: [] }
  const active = new Set(graph.activeNodeIds || [])
  const blocked = new Set(graph.blockedNodeIds || [])
  const route = new Set((graph.primaryPath || []).map((id, index, path) => index ? `${path[index - 1]}->${id}` : null).filter(Boolean))
  return (
    <div className="graph-wrap">
      <div className="graph-meta"><span><i className="legend attack" /> red route</span><span><i className="legend active" /> reachable</span><span><i className="legend blocked" /> cut by blue</span><span className="graph-note">computed from current episode state</span></div>
      <svg className="graph-lines" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
        {graph.edges.map(([from, to]) => {
          const start = graph.nodes.find((node) => node.id === from)
          const end = graph.nodes.find((node) => node.id === to)
          if (!start || !end) return null
          const live = active.has(from) && active.has(to)
          const isRoute = route.has(`${from}->${to}`)
          return <line key={`${from}-${to}`} x1={start.x} y1={start.y} x2={end.x} y2={end.y} className={`edge ${live ? 'live' : ''} ${isRoute ? 'route' : ''}`} />
        })}
      </svg>
      <div className="graph-grid" />
      <div className="graph-label graph-label-left">TRUST ORIGIN</div>
      <div className="graph-label graph-label-right">CROWN JEWELS</div>
      {graph.nodes.map((node) => {
        const isActive = active.has(node.id)
        const isBlocked = blocked.has(node.id)
        const isSelected = selectedNode === node.id
        return <button key={node.id} onClick={() => setSelectedNode(node.id)} className={`entity entity-${node.type} ${isActive ? 'is-active' : ''} ${isBlocked ? 'is-blocked' : ''} ${isSelected ? 'is-selected' : ''}`} style={{ left: `${node.x}%`, top: `${node.y}%` }}>
          <span className="entity-icon">{isBlocked ? <LockKeyhole size={13} /> : nodeIcon(node)}</span>
          <span className="entity-text"><strong>{node.label}</strong><small>{node.meta}</small></span>
          {isActive && <span className="entity-state-dot" />}
        </button>
      })}
      <div className="graph-axis">package → build → service → data</div>
    </div>
  )
}

function RoundFeed({ arena, graph }) {
  const labels = new Map((graph?.nodes || []).map((node) => [node.id, node.label]))
  if (!arena?.history?.length) return <div className="empty-feed">The arena is ready. Red will search the first reachable route.</div>
  return <div className="round-feed">{arena.history.map((round) => <article className="round-row" key={round.round}>
    <div className="round-index">{String(round.round).padStart(2, '0')}</div>
    <div className="round-body">
      <div className="round-head"><span className="red-tag">RED</span><strong>{round.red.label}</strong><span className="round-exposure">{round.before.exposure}% → {round.after.exposure}%</span></div>
      <p>{round.red.path.map((id) => labels.get(id) || id).join(' → ') || 'No reachable path'}</p>
      <div className="round-defense"><span className="blue-tag">BLUE</span><strong>{round.blue.title || 'No control'}</strong><span>{round.blue.rationale}</span>{round.blue.memoryUsed && <em>HydraDB precedent</em>}</div>
    </div>
    <div className={`round-outcome ${round.status}`}><span>{round.after.reachableTargets.length ? `${round.after.reachableTargets.length} targets` : 'contained'}</span><ChevronRight size={13} /></div>
  </article>)}</div>
}

function ReportDossier({ report }) {
  const observed = report?.observed || {}
  const modeled = report?.modeled || {}
  const arena = report?.arena || {}
  const controls = arena.selectedActions || []
  const sources = report?.sources || []
  const uncertainty = report?.uncertainty || []
  return <section className="report-dossier">
    <div className="dossier-head"><div><div className="section-caption">case report</div><h2>Evidence, outcome, limits.</h2></div><span className="dossier-boundary">observed facts / modeled response</span></div>
    <div className="dossier-grid">
      <section className="dossier-section">
        <div className="section-caption">observed</div>
        <dl className="report-facts">
          <div><dt>package</dt><dd>{observed.package || 'not resolved'}</dd></div>
          <div><dt>ecosystem</dt><dd>{observed.ecosystem || 'unknown'}</dd></div>
          <div><dt>advisory</dt><dd>{observed.advisory || 'not specified'}</dd></div>
          <div><dt>repository</dt><dd>{observed.repository || 'not found'}</dd></div>
          <div><dt>resolved version</dt><dd>{observed.resolvedVersion || 'range only'}</dd></div>
          <div><dt>source graph</dt><dd>{observed.codeGraph ? `${observed.codeGraph.files} files · ${observed.codeGraph.imports} imports` : 'not collected'}</dd></div>
        </dl>
      </section>
      <section className="dossier-section">
        <div className="section-caption">computed outcome</div>
        <dl className="report-facts">
          <div><dt>graph</dt><dd>{modeled.graphNodes || 0} nodes · {modeled.graphEdges || 0} edges</dd></div>
          <div><dt>baseline exposure</dt><dd>{formatPct(modeled.baselineExposure)}</dd></div>
          <div><dt>final exposure</dt><dd className={modeled.reachableExposure < 50 ? 'report-good' : 'report-risk'}>{formatPct(modeled.reachableExposure)}</dd></div>
          <div><dt>controls used</dt><dd>{controls.length ? controls.join(' · ') : 'none'}</dd></div>
          <div><dt>arena</dt><dd>{arena.round || 0} rounds · {arena.winner || 'unresolved'}</dd></div>
        </dl>
      </section>
      <section className="dossier-section">
        <div className="section-caption">limits & provenance</div>
        <ul className="report-list">{uncertainty.slice(0, 4).map((item) => <li key={item}>{item}</li>)}</ul>
        <div className="report-sources"><div className="section-caption">sources</div>{sources.slice(0, 4).map((source) => <a href={source} target="_blank" rel="noreferrer" key={source}><span>{sourceHost(source)}</span><ExternalLink size={11} /></a>)}</div>
      </section>
    </div>
  </section>
}

function DecisionRail({ snapshot, selectedNode }) {
  const arena = snapshot?.arena
  const graph = snapshot?.graph || { nodes: [] }
  const selected = graph.nodes.find((node) => node.id === selectedNode)
  const last = arena?.lastRound
  const used = new Set(arena?.selectedActions || [])
  return <aside className="decision-rail">
    <div className="rail-heading"><div><div className="section-caption">live policies</div><h2>Red / Blue</h2></div><span className={`arena-state ${arena?.status || 'ready'}`}>{arena?.status || 'ready'}</span></div>
    <section className="agent-block red-block">
      <div className="agent-title"><span className="agent-mark red-mark">R</span><div><strong>Red agent</strong><small>route search</small></div><span className="agent-state">{arena?.status === 'running' ? 'thinking' : 'standby'}</span></div>
      <div className="agent-value">{last?.red?.label || 'Awaiting the first graph move'}</div>
      <p>{last?.red?.pathLabel || 'The attacker searches valid edges toward a high-value asset. It cannot invent a route outside the graph.'}</p>
    </section>
    <section className="agent-block blue-block">
      <div className="agent-title"><span className="agent-mark blue-mark">B</span><div><strong>Blue agent</strong><small>containment policy</small></div><span className="agent-state">{last?.blue?.memoryUsed ? 'memory-assisted' : 'route-aware'}</span></div>
      <div className="agent-value">{last?.blue?.title || 'Waiting for a red move'}</div>
      <p>{last?.blue?.rationale || 'The defender scores controls against the current route, remaining budget, and prior episode evidence.'}</p>
    </section>
    <section className="score-block">
      <div className="score-line"><span>current exposure</span><strong className={arena?.currentExposure < 50 ? 'good' : ''}>{formatPct(arena?.currentExposure)}</strong></div>
      <div className="score-bar"><span style={{ width: `${arena?.currentExposure || 0}%` }} /></div>
      <div className="score-line"><span>high-value targets</span><strong>{arena?.reachableTargets?.length || 0}</strong></div>
      <div className="score-line"><span>controls committed</span><strong>{arena?.metrics?.controlsUsed || 0} / {arena?.responseBudget || 8}</strong></div>
      <div className="score-line"><span>episode rounds</span><strong>{arena?.round || 0} / {arena?.maxRounds || 6}</strong></div>
    </section>
    <section className="controls-block"><div className="section-caption">controls in graph</div>{(snapshot?.interventions || INTERVENTIONS).map((action) => <div className={`control-line ${used.has(action.id) ? 'used' : ''}`} key={action.id}><span>{used.has(action.id) ? <Check size={13} /> : <span className="control-empty" />}</span><span>{action.title}</span><b>{action.cost}pt</b></div>)}</section>
    <section className="selected-block"><div className="section-caption">selected entity</div><strong>{selected?.label || '—'}</strong><span>{selected?.meta || 'Click a node in the graph to inspect its current state.'}</span></section>
  </aside>
}

function CaseWorkspace({ snapshot, report, query, setQuery, onStart, onStep, onPause, onReset, busy, autoRun, setAutoRun, selectedNode, setSelectedNode, error }) {
  const arena = snapshot?.arena
  const terminal = ['contained', 'breached', 'exhausted'].includes(arena?.status)
  const repo = snapshot?.ingestion?.collectors?.find((item) => item.collector === 'repository-extractor')
  const graph = snapshot?.graph || { nodes: NODES, edges: EDGES }
  return <div className="case-layout">
    <aside className="case-rail">
      <div className="case-rail-top"><div className="brand-mini"><span className="brand-square" /> RECOIL</div><span className="case-id">CASE 0017</span></div>
      <div className="case-target"><div className="section-caption">target</div><input value={query} onChange={(event) => setQuery(event.target.value)} /><button onClick={onStart} disabled={busy}><RotateCcw size={13} /> re-run evidence</button></div>
      <div className="case-purpose"><span className="signal-dot" />{repo?.repository || 'public target'}<p>{repo?.ecosystem === 'cargo' ? 'Rust workspace evidence' : 'dependency evidence'} · no package execution</p></div>
      <SourceRail snapshot={snapshot} />
      <div className="case-rail-bottom"><span><ShieldCheck size={13} /> defensive simulation</span><span>graph v0.7 arena</span></div>
    </aside>
    <main className="arena-main">
      <header className="arena-header"><div><div className="section-caption">adaptive arena / {arena?.round || 0} rounds</div><h1>{terminal ? (arena.winner === 'defender' ? 'Route contained.' : 'Attacker reached the limit.') : 'The graph is under pressure.'}</h1><p>{terminal ? `Blue used ${arena.metrics.controlsUsed} controls. The final route is ${arena.currentPath.length ? 'still reachable' : 'severed'}.` : 'Red searches the current graph. Blue responds to the route it actually sees.'}</p></div><div className="arena-actions"><span className={`hydra-chip ${snapshot?.hydra?.status === 'persisted' ? 'connected' : ''}`}><Database size={13} /> {snapshot?.hydra?.status || 'local replay'}</span><button className="quiet-button" onClick={() => setAutoRun(!autoRun)}>{autoRun ? <><Pause size={14} /> pause loop</> : <><Play size={14} /> {terminal ? 'replay stopped' : 'run loop'}</>}</button><button className="quiet-button" onClick={onReset}><RotateCcw size={14} /> reset</button></div></header>
      <section className="score-ribbon"><div><span>initial exposure</span><strong>{formatPct(arena?.initialExposure)}</strong></div><ArrowRight size={16} /><div><span>current exposure</span><strong className={arena?.currentExposure < 50 ? 'good' : ''}>{formatPct(arena?.currentExposure)}</strong></div><div className="ribbon-divider" /><div><span>targets in reach</span><strong>{arena?.reachableTargets?.length || 0}</strong></div><div><span>memory</span><strong>{arena?.memory?.used ? 'used' : arena?.memory?.available ? 'available' : 'local only'}</strong></div></section>
      <section className="graph-section"><Graph snapshot={snapshot} selectedNode={selectedNode} setSelectedNode={setSelectedNode} /></section>
      <section className="episode-section"><div className="episode-head"><div><div className="section-caption">episode trace</div><strong>{arena?.history?.length ? `${arena.history.length} computed rounds` : 'no rounds yet'}</strong></div><button className="step-button" onClick={onStep} disabled={busy || terminal}><Zap size={14} /> step one round</button></div><RoundFeed arena={arena} graph={graph} /></section>
      {terminal && <section className={`final-report ${arena.winner === 'defender' ? 'won' : 'lost'}`}><div className="final-icon">{arena.winner === 'defender' ? <ShieldCheck size={20} /> : <Target size={20} />}</div><div><div className="section-caption">episode result</div><h2>{arena.winner === 'defender' ? 'Defender contained the modeled blast radius.' : 'The attacker survived the response budget.'}</h2><p>{arena.winner === 'defender' ? `The red agent found ${arena.metrics.attackMoves} route${arena.metrics.attackMoves === 1 ? '' : 's'}, and blue cut them in ${arena.metrics.containedRound} rounds.` : 'The graph still contains a reachable high-value path. Re-run with a different target or response budget.'}</p></div><div className="final-score"><strong>{formatPct(arena.currentExposure)}</strong><span>final exposure</span></div></section>}
      {terminal && (report ? <ReportDossier report={report} /> : <div className="report-loading">Preparing the evidence-backed case report…</div>)}
      {error && <div className="error-line"><AlertTriangle size={14} /> {error}</div>}
    </main>
    <DecisionRail snapshot={snapshot} selectedNode={selectedNode} />
  </div>
}

function App() {
  const [query, setQuery] = useState(DEFAULT_QUERY)
  const [snapshot, setSnapshot] = useState(null)
  const [report, setReport] = useState(null)
  const [busy, setBusy] = useState(false)
  const [autoRun, setAutoRun] = useState(false)
  const [backend, setBackend] = useState('checking')
  const [selectedNode, setSelectedNode] = useState('release')
  const [error, setError] = useState('')

  const hasCase = Boolean(snapshot?.ingestion?.status && snapshot.ingestion.status !== 'not_started')
  const arena = snapshot?.arena

  useEffect(() => {
    api('/api/health').then((payload) => setBackend(payload.hydra?.status === 'ready' ? 'connected' : 'local')).catch(() => setBackend('offline'))
    api('/api/scenarios/0017').then((payload) => {
      if (payload.ingestion?.status !== 'not_started') setSnapshot(payload)
      if (['contained', 'breached', 'exhausted'].includes(payload.arena?.status)) api('/api/scenarios/0017/report').then(setReport).catch(() => {})
    }).catch(() => {})
  }, [])

  useEffect(() => {
    if (!['contained', 'breached', 'exhausted'].includes(arena?.status)) return undefined
    api('/api/scenarios/0017/report').then(setReport).catch(() => {})
    return undefined
  }, [arena?.status, arena?.round])

  useEffect(() => {
    if (!autoRun || busy || arena?.status !== 'running') return undefined
    const timer = window.setTimeout(() => {
      api('/api/scenarios/0017/arena/step', { method: 'POST' }).then((payload) => {
        setSnapshot(payload)
        if (['contained', 'breached', 'exhausted'].includes(payload.arena?.status)) setAutoRun(false)
      }).catch((cause) => { setError(cause.message); setAutoRun(false) })
    }, 1250)
    return () => window.clearTimeout(timer)
  }, [autoRun, busy, arena?.status, arena?.round])

  useEffect(() => {
    if (!snapshot?.hydra || snapshot.hydra.status !== 'queued') return undefined
    const timer = window.setTimeout(() => api('/api/scenarios/0017/hydra-status', { method: 'POST' }).then(setSnapshot).catch(() => {}), 2500)
    return () => window.clearTimeout(timer)
  }, [snapshot?.hydra?.status, snapshot?.hydra?.sourceIds?.length])

  async function startCase() {
    if (!query.trim()) return
    setBusy(true); setError(''); setAutoRun(false); setSnapshot(null); setReport(null)
    try {
      await api('/api/scenarios/0017/run', { method: 'POST', body: JSON.stringify({ query: query.trim() }) })
      await api('/api/scenarios/0017/ingest', { method: 'POST' })
      const started = await api('/api/scenarios/0017/arena/start', { method: 'POST' })
      setSnapshot(started)
      setAutoRun(true)
    } catch (cause) {
      setError(cause.message)
    } finally {
      setBusy(false)
    }
  }

  async function stepArena() {
    if (busy || !arena || ['contained', 'breached', 'exhausted'].includes(arena.status)) return
    setBusy(true); setError('')
    try {
      const next = await api('/api/scenarios/0017/arena/step', { method: 'POST' })
      setSnapshot(next)
      if (['contained', 'breached', 'exhausted'].includes(next.arena?.status)) setAutoRun(false)
    } catch (cause) {
      setError(cause.message)
    } finally {
      setBusy(false)
    }
  }

  async function resetCase() {
    setAutoRun(false); setError(''); setReport(null)
    try {
      const next = await api('/api/scenarios/0017/reset', { method: 'POST' })
      setSnapshot(next)
    } catch (cause) {
      setError(cause.message)
    }
  }

  return <div className="app-shell">
    <header className="topbar"><div className="brand-mini"><span className="brand-square" /> RECOIL <small>adaptive supply-chain defense</small></div><div className="topbar-center"><span className="live-mark" /> red / blue arena <span className="slash">/</span> graph-native incident response</div><div className="topbar-right"><span className={`connection ${backend}`}><span /> {backend === 'connected' ? 'HydraDB connected' : backend === 'local' ? 'local replay' : backend}</span><button className="help-button" aria-label="About Recoil"><CircleHelp size={15} /></button></div></header>
    {hasCase ? <CaseWorkspace snapshot={snapshot} report={report} query={query} setQuery={setQuery} onStart={startCase} onStep={stepArena} onPause={() => setAutoRun(false)} onReset={resetCase} busy={busy} autoRun={autoRun} setAutoRun={setAutoRun} selectedNode={selectedNode} setSelectedNode={setSelectedNode} error={error} /> : <Landing query={query} setQuery={setQuery} onStart={startCase} busy={busy} error={error} />}
  </div>
}

class AppBoundary extends Component {
  state = { error: null }

  static getDerivedStateFromError(error) {
    return { error }
  }

  render() {
    if (this.state.error) return <main className="runtime-error"><div><div className="section-caption">recoil / runtime</div><h1>Workspace unavailable.</h1><p>{this.state.error.message}</p><button onClick={() => window.location.reload()}>Reload workspace</button></div></main>
    return this.props.children
  }
}

createRoot(document.getElementById('root')).render(<AppBoundary><App /></AppBoundary>)
