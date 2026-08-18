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
const FOCUS_NODE_IDS = new Set([
  'maintainer',
  'release',
  'resolver',
  'lockfile',
  'repo',
  'runner',
  'ci',
  'artifact',
  'payments',
  'customer-db',
])

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

function Graph({ snapshot, selectedNode, setSelectedNode, view = 'focus' }) {
  const graph = snapshot?.graph || { nodes: NODES, edges: EDGES, activeNodeIds: [], blockedNodeIds: [], primaryPath: [] }
  const active = new Set(graph.activeNodeIds || [])
  const blocked = new Set(graph.blockedNodeIds || [])
  const primaryPath = graph.primaryPath || []
  const route = new Set(primaryPath.map((id, index, path) => index ? `${path[index - 1]}->${id}` : null).filter(Boolean))
  const focusIds = new Set(FOCUS_NODE_IDS)
  primaryPath.forEach((id) => focusIds.add(id))
  if (selectedNode) focusIds.add(selectedNode)
  const visibleNodes = view === 'full' ? graph.nodes : graph.nodes.filter((node) => focusIds.has(node.id))
  const visibleIds = new Set(visibleNodes.map((node) => node.id))
  const visibleEdges = graph.edges.filter(([from, to]) => visibleIds.has(from) && visibleIds.has(to))
  const omitted = Math.max(0, graph.nodes.length - visibleNodes.length)
  return (
    <div className="graph-wrap">
      <div className="graph-meta"><span><i className="legend attack" /> red route</span><span><i className="legend active" /> reachable</span><span><i className="legend blocked" /> cut by blue</span><span className="graph-note">{view === 'focus' ? `${omitted} evidence nodes hidden · focus view` : 'all collected evidence · full view'}</span></div>
      <svg className="graph-lines" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
        {visibleEdges.map(([from, to]) => {
          const start = visibleNodes.find((node) => node.id === from)
          const end = visibleNodes.find((node) => node.id === to)
          if (!start || !end) return null
          const live = active.has(from) && active.has(to)
          const isRoute = route.has(`${from}->${to}`)
          return <line key={`${from}-${to}`} x1={start.x} y1={start.y} x2={end.x} y2={end.y} className={`edge ${live ? 'live' : ''} ${isRoute ? 'route' : ''}`} />
        })}
      </svg>
      <div className="graph-grid" />
      <div className="graph-label graph-label-left">TRUST ORIGIN</div>
      <div className="graph-label graph-label-right">CROWN JEWELS</div>
      {visibleNodes.map((node) => {
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
      {round.red.candidates?.length > 1 && <details className="decision-details"><summary>red evaluated {round.red.candidates.length} reachable routes</summary><div className="decision-candidates">{round.red.candidates.map((candidate, index) => <div className={`decision-candidate ${candidate.selected ? 'selected' : ''}`} key={`${round.round}-route-${index}`}><span>{candidate.selected ? 'chosen' : candidate.fresh ? 'available' : 'repeated'}</span><strong>{candidate.pathLabel}</strong></div>)}</div></details>}
      <div className="round-defense"><span className="blue-tag">BLUE</span><strong>{round.blue.title || 'No control'}</strong><span>{round.blue.rationale}</span>{round.blue.memoryUsed && <em>HydraDB precedent</em>}</div>
      {round.blue.candidates?.length > 0 && <details className="decision-details"><summary>blue compared {round.blue.candidates.length} affordable controls</summary><div className="decision-candidates">{round.blue.candidates.map((candidate) => <div className={`decision-candidate ${candidate.selected ? 'selected' : ''}`} key={`${round.round}-${candidate.id}`}><span>{candidate.selected ? 'chosen' : candidate.routeMatch ? 'route match' : 'counterfactual'}</span><strong>{candidate.title}</strong><small>{candidate.predictedExposure}% exposure · {candidate.cost}pt{candidate.memoryMatch ? ' · memory' : ''}</small></div>)}</div></details>}
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
  const responsePlans = report?.responsePlans || []
  const interventionTitles = new Map(INTERVENTIONS.map((action) => [action.id, action.title]))
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
          <div><dt>source graph</dt><dd>{observed.codeGraph ? `${observed.codeGraph.files} files · ${observed.codeGraph.imports} imports · ${observed.codeGraph.symbols} symbols · ${observed.codeGraph.surfaces} surfaces` : 'not collected'}</dd></div>
          <div><dt>latest change</dt><dd>{observed.codeGraph?.recentChange ? `${observed.codeGraph.recentChange.sha.slice(0, 8)} · ${observed.codeGraph.recentChange.sampledFilesChanged} sampled files` : 'not available'}</dd></div>
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
    {observed.codeGraph?.impactCandidates?.length > 0 && <div className="impact-strip"><div className="section-caption">inferred code-to-deployment links</div><div className="impact-items">{observed.codeGraph.impactCandidates.slice(0, 6).map((candidate) => <span key={`${candidate.file}-${candidate.surface}`}><strong>{candidate.surface}</strong><i>→</i>{candidate.target}<small>{candidate.changedSymbols?.length ? `changed: ${candidate.changedSymbols.join(' · ')}` : candidate.owners?.length ? `owner: ${candidate.owners.join(' ')}` : candidate.confidence}</small></span>)}</div></div>}
    {responsePlans.length > 0 && <div className="counterfactual-section"><div className="section-caption">counterfactual response plans</div><p className="counterfactual-note">Top affordable graph mutations, ranked by residual exposure then response cost.</p><div className="plan-table">{responsePlans.map((plan, index) => <div className={`plan-row ${index === 0 ? 'recommended' : ''}`} key={`${plan.actions.join('-')}-${plan.cost}`}><span className="plan-rank">{index === 0 ? 'best' : `0${index + 1}`}</span><strong>{plan.actions.length ? plan.actions.map((action) => interventionTitles.get(action) || action).join(' + ') : 'Observe only'}</strong><span>{formatPct(plan.exposure)}</span><span>{plan.cost}pt</span><small>{plan.activeNodes} active nodes</small></div>)}</div></div>}
  </section>
}

function DecisionRail({ snapshot, selectedNode }) {
  const arena = snapshot?.arena
  const graph = snapshot?.graph || { nodes: [] }
  const selected = graph.nodes.find((node) => node.id === selectedNode)
  const last = arena?.lastRound
  const used = new Set(arena?.selectedActions || [])
  const waiting = !last && !['contained', 'breached', 'exhausted'].includes(arena?.status)
  return <aside className="decision-rail">
    <div className="rail-heading"><div><div className="section-caption">attack / defense loop</div><h2>What happens next</h2></div><span className={`arena-state ${arena?.status || 'ready'}`}>{arena?.status || 'ready'}</span></div>
    <section className="agent-block red-block">
      <div className="agent-title"><span className="agent-mark red-mark">R</span><div><strong>Red · finds a path</strong><small>attacker</small></div><span className="agent-state">{waiting ? 'ready' : arena?.status === 'running' ? 'thinking' : 'complete'}</span></div>
      <div className="agent-value">{last?.red?.label || 'Choose the first route'}</div>
      <p>{last?.red?.pathLabel || 'Red searches valid graph edges toward a high-value asset. It cannot invent a route.'}</p>
    </section>
    <section className="agent-block blue-block">
      <div className="agent-title"><span className="agent-mark blue-mark">B</span><div><strong>Blue · blocks the path</strong><small>defender</small></div><span className="agent-state">{waiting ? 'next' : last?.blue?.memoryUsed ? 'memory-assisted' : 'route-aware'}</span></div>
      <div className="agent-value">{last?.blue?.title || 'Will respond to Red'}</div>
      <p>{last?.blue?.rationale || 'Blue compares affordable controls against the route Red actually chose, then cuts the best one.'}</p>
    </section>
    {waiting ? <section className="waiting-rail"><div className="section-caption">first round</div><strong>Run the round to see a real result.</strong><p>Red picks a reachable route. Blue tests a control against that exact route. The graph and exposure score update after both moves.</p></section> : <>
      <section className="score-block">
        <div className="score-line"><span>current exposure</span><strong className={arena?.currentExposure < 50 ? 'good' : ''}>{formatPct(arena?.currentExposure)}</strong></div>
        <div className="score-bar"><span style={{ width: `${arena?.currentExposure || 0}%` }} /></div>
        <div className="score-line"><span>high-value targets</span><strong>{arena?.reachableTargets?.length || 0}</strong></div>
        <div className="score-line"><span>controls committed</span><strong>{arena?.metrics?.controlsUsed || 0} / {arena?.responseBudget || 8}</strong></div>
        <div className="score-line"><span>episode rounds</span><strong>{arena?.round || 0} / {arena?.maxRounds || 6}</strong></div>
      </section>
      <section className="controls-block"><div className="section-caption">available defenses</div>{(snapshot?.interventions || INTERVENTIONS).map((action) => <div className={`control-line ${used.has(action.id) ? 'used' : ''}`} key={action.id}><span>{used.has(action.id) ? <Check size={13} /> : <span className="control-empty" />}</span><span>{action.title}</span><b>{action.cost}pt</b></div>)}</section>
      <section className="selected-block"><div className="section-caption">selected entity</div><strong>{selected?.label || '—'}</strong><span>{selected?.meta || 'Click a node in the graph to inspect its current state.'}</span></section>
    </>}
  </aside>
}

function CaseWorkspace({ snapshot, report, query, setQuery, onStart, onStep, onPause, onReset, busy, autoRun, setAutoRun, selectedNode, setSelectedNode, graphView, setGraphView, error }) {
  const arena = snapshot?.arena
  const terminal = ['contained', 'breached', 'exhausted'].includes(arena?.status)
  const waiting = !terminal && !arena?.lastRound
  const repo = snapshot?.ingestion?.collectors?.find((item) => item.collector === 'repository-extractor')
  const graph = snapshot?.graph || { nodes: NODES, edges: EDGES }
  const headerTitle = terminal ? (arena.winner === 'defender' ? 'Route contained.' : 'Attacker reached the limit.') : waiting ? 'Ready to run the first round.' : 'Red found a route.'
  const headerCopy = terminal ? `Blue used ${arena.metrics.controlsUsed} controls. The final route is ${arena.currentPath.length ? 'still reachable' : 'severed'}.` : waiting ? 'Press “run first round”. Red finds a reachable path, then Blue tests a defense against that exact path.' : 'Blue has responded. Run the next round to see whether the attacker finds another way through.'
  function handleRun() {
    if (arena?.status === 'ready') {
      onStep()
      return
    }
    setAutoRun(!autoRun)
  }
  return <div className="case-layout">
    <aside className="case-rail">
      <div className="case-rail-top"><div className="brand-mini"><span className="brand-square" /> RECOIL</div><span className="case-id">CASE 0017</span></div>
      <div className="case-target"><div className="section-caption">target</div><input value={query} onChange={(event) => setQuery(event.target.value)} /><button onClick={onStart} disabled={busy}><RotateCcw size={13} /> re-run evidence</button></div>
      <div className="case-purpose"><span className="signal-dot" />{repo?.repository || 'public target'}<p>{repo?.ecosystem === 'cargo' ? 'Rust workspace evidence' : 'dependency evidence'} · no package execution</p></div>
      <SourceRail snapshot={snapshot} />
      <div className="case-rail-bottom"><span><ShieldCheck size={13} /> defensive simulation</span><span>graph v0.7 arena</span></div>
    </aside>
    <main className="arena-main">
      <header className="arena-header"><div><div className="section-caption">investigation / {arena?.round || 0} rounds</div><h1>{headerTitle}</h1><p>{headerCopy}</p></div><div className="arena-actions"><span className={`hydra-chip ${snapshot?.hydra?.status === 'persisted' ? 'connected' : ''}`}><Database size={13} /> {snapshot?.hydra?.status || 'local replay'}</span><button className={`quiet-button ${waiting ? 'primary-button' : ''}`} onClick={handleRun} disabled={busy}>{autoRun ? <><Pause size={14} /> pause loop</> : <><Play size={14} /> {waiting ? 'start first round' : terminal ? 'replay stopped' : 'run loop'}</>}</button><button className="quiet-button" onClick={onReset}><RotateCcw size={14} /> reset</button></div></header>
      <section className="score-ribbon"><div><span>initial exposure</span><strong className={waiting ? 'is-pending' : ''}>{waiting ? '—' : formatPct(arena?.initialExposure)}</strong></div><ArrowRight size={16} /><div><span>current exposure</span><strong className={waiting ? 'is-pending' : arena?.currentExposure < 50 ? 'good' : ''}>{waiting ? '—' : formatPct(arena?.currentExposure)}</strong></div><div className="ribbon-divider" /><div><span>targets in reach</span><strong className={waiting ? 'is-pending' : ''}>{waiting ? '—' : arena?.reachableTargets?.length || 0}</strong></div><div><span>memory</span><strong>{arena?.memory?.used ? 'used' : arena?.memory?.available ? 'available' : waiting ? 'ready' : 'local only'}</strong></div></section>
      {waiting && <section className="start-guide"><div className="start-guide-number">01</div><div><div className="section-caption">your next move</div><h2>Start the investigation</h2><p>Red will choose the first reachable route. Blue will compare controls against it. Pause after every round to inspect why.</p></div><button className="primary-button" onClick={onStep} disabled={busy}><Play size={14} /> run first round</button></section>}
      <section className="graph-section"><div className="graph-toolbar"><div><div className="section-caption">attack path map</div><strong>{graphView === 'focus' ? 'The route, at a glance' : 'All collected evidence'}</strong><span>{graphView === 'focus' ? 'The few nodes that matter for the next decision' : 'Open this only when you need the full graph'}</span></div><div className="graph-toggle"><button className={graphView === 'focus' ? 'active' : ''} onClick={() => setGraphView('focus')}>route view</button><button className={graphView === 'full' ? 'active' : ''} onClick={() => setGraphView('full')}>all evidence</button></div></div><Graph snapshot={snapshot} selectedNode={selectedNode} setSelectedNode={setSelectedNode} view={graphView} /></section>
      <section className="episode-section"><div className="episode-head"><div><div className="section-caption">what happened</div><strong>{arena?.history?.length ? `${arena.history.length} computed rounds` : 'waiting for the first round'}</strong></div><button className="step-button" onClick={onStep} disabled={busy || terminal}><Zap size={14} /> {waiting ? 'run first round' : 'step one round'}</button></div><RoundFeed arena={arena} graph={graph} /></section>
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
  const [graphView, setGraphView] = useState('focus')
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
    <header className="topbar"><div className="brand-mini"><span className="brand-square" /> RECOIL <small>adaptive supply-chain defense</small></div><div className="topbar-center"><span className="live-mark" /> trace a dependency · test a defense</div><div className="topbar-right"><span className={`connection ${backend}`}><span /> {backend === 'connected' ? 'HydraDB connected' : backend === 'local' ? 'local replay' : backend}</span><button className="help-button" aria-label="About Recoil"><CircleHelp size={15} /></button></div></header>
    {hasCase ? <CaseWorkspace snapshot={snapshot} report={report} query={query} setQuery={setQuery} onStart={startCase} onStep={stepArena} onPause={() => setAutoRun(false)} onReset={resetCase} busy={busy} autoRun={autoRun} setAutoRun={setAutoRun} selectedNode={selectedNode} setSelectedNode={setSelectedNode} graphView={graphView} setGraphView={setGraphView} error={error} /> : <Landing query={query} setQuery={setQuery} onStart={startCase} busy={busy} error={error} />}
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
