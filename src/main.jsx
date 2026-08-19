import { Component, useEffect, useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { ArrowUpRight, Check, CircleAlert, CircleCheck, Clock3, Download, ExternalLink, LoaderCircle, RotateCcw, ShieldCheck } from 'lucide-react'
import './style.css'

const SCENARIO_ID = '0017'
const DEFAULT_INPUT = ''
const INVESTIGATION_EXAMPLES = [
  {
    label: 'three-repository contrast',
    value: 'GHSA-xvch-5gv4-984h\nhttps://github.com/http-party/http-server/tree/v13.0.2\nhttps://github.com/tweenjs/tween.js\nhttps://github.com/axios/axios/tree/v1.x',
  },
  {
    label: 'package plus repositories',
    value: 'npm:minimist\nhttps://github.com/http-party/http-server/tree/v13.0.2\nhttps://github.com/axios/axios/tree/v1.x',
  },
  {
    label: 'single repository',
    value: 'GHSA-xvch-5gv4-984h\nhttps://github.com/http-party/http-server/tree/v13.0.2',
  },
]

async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: { ...(options.body ? { 'content-type': 'application/json' } : {}), ...(options.headers || {}) },
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(payload.error || `${response.status} ${response.statusText}`)
  return payload
}

function sourceHost(value) {
  try { return new URL(value).hostname.replace(/^www\./, '') } catch { return value || 'source' }
}

function shorten(value, limit = 26) {
  const text = String(value || '')
  return text.length > limit ? `${text.slice(0, Math.max(1, limit - 1))}…` : text
}

function repositoryName(value = '') {
  return value.replace(/^https?:\/\/github\.com\//, '').replace(/\/tree\/.*$/, '').replace(/\.git$/, '')
}

function StatusIcon({ status }) {
  if (status === 'complete' || status === 'persisted') return <Check size={15} strokeWidth={2.3} />
  if (status === 'failed') return <CircleAlert size={15} />
  if (status === 'working') return <LoaderCircle className="spin" size={15} />
  return <span className="status-ring" aria-hidden="true" />
}

function SourceLink({ href, children }) {
  if (!href) return <span className="source-link source-link-muted">source unavailable</span>
  return <a className="source-link" href={href} target="_blank" rel="noreferrer">{children || sourceHost(href)} <ExternalLink size={11} /></a>
}

function Verdict({ value, compact = false }) {
  const label = value === 'REACHED'
    ? 'Reached'
    : value === 'DECLARED_ONLY'
      ? 'Declared only'
      : value === 'NOT_AFFECTED'
        ? 'Not affected'
        : value === 'NOT_YET_OBSERVED'
          ? 'Not observed'
          : 'Unknown'
  const icon = value === 'REACHED' ? <CircleAlert size={compact ? 13 : 15} /> : value === 'NOT_AFFECTED' ? <CircleCheck size={compact ? 13 : 15} /> : <span className="verdict-ring" />
  return <span className={`verdict verdict-${String(value || 'UNKNOWN').toLowerCase()} ${compact ? 'verdict-compact' : ''}`}>{icon}{label}</span>
}

function Landing({ value, setValue, onSubmit, busy, error }) {
  return <main className="landing-page">
    <header className="landing-header">
      <div className="brand"><span className="brand-mark" /> RECOIL</div>
      <span className="brand-note">Evidence path analysis</span>
    </header>
    <section className="landing-grid">
      <div className="landing-intro">
        <p className="landing-kicker">Supply-chain evidence</p>
        <h1>Find the path to <span>vulnerable code.</span></h1>
        <p>A cited graph of package reachability, repository impact, and the fix that closes the route.</p>
      </div>
      <div className="landing-form-wrap">
        <form className="investigate-form" onSubmit={(event) => { event.preventDefault(); onSubmit() }}>
          <label htmlFor="investigation-input">Case input</label>
          <textarea id="investigation-input" value={value} onChange={(event) => setValue(event.target.value)} placeholder="GHSA-xvch-5gv4-984h\nhttps://github.com/org/repository" rows={5} />
          <div className="form-footer">
            <span>Public records only</span>
            <button type="submit" disabled={busy}>{busy ? <><LoaderCircle className="spin" size={15} /> Reading</> : <>Investigate <ArrowUpRight size={15} /></>}</button>
          </div>
        </form>
        <div className="example-picker" aria-label="Example investigations">
          <span>Examples</span>
          {INVESTIGATION_EXAMPLES.map((example) => <button className="example-chip" key={example.label} type="button" onClick={() => setValue(example.value)}>{example.label}</button>)}
        </div>
        {error && <div className="error-banner" role="alert"><CircleAlert size={15} /> {error}</div>}
      </div>
    </section>
    <footer className="landing-footer"><span>OSV / npm / GitHub / HydraDB</span><span>Observed facts are cited. Inference is labeled.</span></footer>
  </main>
}

function InvestigationHeader({ investigation, hydra }) {
  const report = investigation?.report
  const id = report?.advisory?.id || investigation?.evidence?.target?.advisoryId || 'investigation'
  const state = investigation?.status === 'complete' ? 'Complete' : investigation?.status === 'failed' ? 'Incomplete' : 'Reading'
  const hydraReadFailed = hydra?.recall?.status === 'failed'
  const hydraLabel = hydraReadFailed ? 'HydraDB read failed' : hydra?.status === 'persisted' ? 'HydraDB connected' : hydra?.status === 'queued' ? 'HydraDB indexing' : hydra?.status === 'failed' ? 'HydraDB unavailable' : 'Local evidence record'
  return <header className="product-header">
    <div className="brand"><span className="brand-mark" /> RECOIL</div>
    <div className="header-case"><strong>{id}</strong><span>{state}</span></div>
    <div className="header-status"><span className={`connection-mark ${hydraReadFailed || hydra?.status === 'failed' ? 'is-failed' : hydra?.status === 'persisted' ? 'is-live' : ''}`} /> {hydraLabel}</div>
  </header>
}

function EventStream({ events = [] }) {
  const current = events.find((event) => event.status === 'working')
  return <section className="event-journal" aria-label="Investigation progress">
    <div className="journal-heading"><div><span className="section-kicker">Progress</span><h2>{current?.title || 'Evidence is ready'}</h2></div><span className="journal-state">{current ? 'working' : 'up to date'}</span></div>
    <div className="event-list">
      {events.map((event) => <article className={`event-row event-${event.status}`} key={event.id || event.key}>
        <div className="event-status"><StatusIcon status={event.status} /></div>
        <div className="event-copy"><div className="event-title"><strong>{event.title}</strong>{event.repository && <span>{event.repository}</span>}</div><p>{event.detail}</p>{event.sourceUrls?.[0] && <SourceLink href={event.sourceUrls[0]} />}</div>
        {event.status === 'working' && <span className="event-now">now</span>}
      </article>)}
    </div>
    {!events.length && <div className="journal-empty">The investigation will stream here after you start it.</div>}
  </section>
}

function findingParts(finding) {
  const dependencyParts = (finding?.dependencyPath || []).map((item) => `${item.name}@${item.version}`)
  const path = finding?.path || []
  const parts = [...path]
  if (dependencyParts.length > 1) {
    const packageIndex = parts.findIndex((part) => part === dependencyParts[dependencyParts.length - 1])
    if (packageIndex >= 0) parts.splice(packageIndex, 0, ...dependencyParts.slice(0, -1))
  }
  return [...new Set(parts.filter(Boolean))]
}

function nodeMatchesPart(node, part, finding) {
  if (!node || !part) return false
  if (node.label === part) return true
  if (node.type === 'repository' && (part === finding?.repository || part === finding?.repositoryUrl)) return true
  if (node.type === 'advisory' && part === finding?.advisoryId) return true
  if (node.type === 'lockfile' && node.label === part && node.id.includes(finding?.repository || '')) return true
  if (node.type === 'code' && node.label === part && node.id.includes(finding?.repository || '')) return true
  if (part.startsWith('symbol:')) return node.type === 'symbol' && node.label.includes(part.split('@')[0].replace('symbol:', ''))
  return false
}

function routeNodeIds(graph, finding) {
  if (!finding) return new Set()
  const ids = new Set()
  for (const part of findingParts(finding)) {
    const match = (graph?.nodes || []).find((node) => nodeMatchesPart(node, part, finding))
    if (match) ids.add(match.id)
  }
  return ids
}

function graphLayout(graph = {}, finding = null) {
  const nodes = graph.nodes || []
  const edges = graph.edges || []
  const selected = routeNodeIds(graph, finding)
  const roots = nodes.filter((node) => node.type === 'advisory')
  const distance = new Map(roots.map((node) => [node.id, 0]))
  const queue = [...roots.map((node) => node.id)]
  while (queue.length) {
    const from = queue.shift()
    for (const [source, target] of edges) {
      if (source !== from || distance.has(target)) continue
      distance.set(target, distance.get(source) + 1)
      queue.push(target)
    }
  }
  const typeOrder = ['advisory', 'package', 'repository', 'lockfile', 'code', 'symbol']
  const layerFor = (node) => distance.get(node.id) ?? Math.max(0, typeOrder.indexOf(node.type))
  const layers = new Map()
  for (const node of nodes.slice(0, 48)) {
    const layer = layerFor(node)
    const group = layers.get(layer) || []
    group.push(node)
    layers.set(layer, group)
  }
  const maxLayer = Math.max(1, ...layers.keys())
  const width = 1060
  const maxRows = Math.max(1, ...[...layers.values()].map((group) => group.length))
  const height = Math.max(390, 88 + maxRows * 72)
  const positions = new Map()
  for (const [layer, group] of layers) {
    const x = 66 + (layer / maxLayer) * (width - 132)
    const gap = height / (group.length + 1)
    group.forEach((node, index) => positions.set(node.id, { x, y: gap * (index + 1) }))
  }
  return { nodes: nodes.slice(0, 48), edges, positions, selected, width, height }
}

function nodeVerdict(node, report) {
  if (node.meta?.verdict) return node.meta.verdict
  if (node.type === 'repository') return report?.repositories?.find((finding) => finding.repository === node.label)?.verdict
  return null
}

function EvidenceMap({ report, selectedFinding, events = [], live = false }) {
  const graph = report?.graph || { nodes: [], edges: [] }
  const layout = useMemo(() => graphLayout(graph, selectedFinding), [graph, selectedFinding])
  const selected = layout.selected
  const selectedEdges = new Set(layout.edges.filter(([from, to]) => selected.has(from) && selected.has(to)).map(([from, to]) => `${from}>${to}`))
  const layerLabels = [{ label: 'Advisory', type: 'advisory' }, { label: 'Dependency', type: 'package' }, { label: 'Repository', type: 'repository' }, { label: 'Source', type: 'code' }]
  if (!layout.nodes.length) {
    const current = events.find((event) => event.status === 'working')
    return <section className="evidence-map map-empty" aria-label="Evidence map">
      <div className="map-heading"><div><span className="section-kicker">Evidence map</span><h2>{live ? 'Building the route' : 'No graph to show'}</h2></div><span className="map-count">{live ? 'waiting for evidence' : '0 nodes'}</span></div>
      <div className="map-empty-body"><div className="empty-route"><span /><i /><span /><i /><span /></div><strong>{current?.title || 'The evidence map appears here'}</strong><p>{current?.detail || 'Start an investigation to draw the advisory, dependency, repository, and source relationships.'}</p></div>
    </section>
  }
  return <section className="evidence-map" aria-label="Observed evidence map">
    <div className="map-heading"><div><span className="section-kicker">Evidence map</span><h2>{live ? 'Evidence arriving' : 'The route in one view'}</h2></div><span className="map-count">{layout.nodes.length} nodes / {layout.edges.length} edges</span></div>
    <div className="map-canvas">
      <svg viewBox={`0 0 ${layout.width} ${layout.height}`} role="img" aria-label="Evidence graph from advisory to repository source">
        <defs><marker id="recoil-arrow" markerWidth="8" markerHeight="8" refX="7" refY="3" orient="auto"><path d="M0,0 L8,3 L0,6" fill="none" stroke="currentColor" strokeWidth="1.2" /></marker></defs>
        {layerLabels.map((layer) => {
          const layerNodes = layout.nodes.filter((node) => node.type === layer.type)
          const x = layerNodes[0] ? layout.positions.get(layerNodes[0].id)?.x : null
          return x ? <text className="map-layer-label" key={layer.type} x={x} y="22" textAnchor="middle">{layer.label}</text> : null
        })}
        <g className="map-edges">
          {layout.edges.map(([from, to]) => {
            const start = layout.positions.get(from)
            const end = layout.positions.get(to)
            if (!start || !end) return null
            const key = `${from}>${to}`
            const isSelected = selectedEdges.has(key)
            return <line key={key} className={`map-edge ${isSelected ? 'map-edge-selected' : ''}`} x1={start.x + 77} y1={start.y} x2={end.x - 77} y2={end.y} markerEnd="url(#recoil-arrow)" />
          })}
        </g>
        <g className="map-nodes">
          {layout.nodes.map((node) => {
            const position = layout.positions.get(node.id)
            if (!position) return null
            const verdict = nodeVerdict(node, report)
            const isSelected = selected.has(node.id)
            return <g className={`map-node node-${node.type} ${isSelected ? 'node-selected' : ''} ${verdict ? `node-${verdict.toLowerCase()}` : ''}`} key={node.id} transform={`translate(${position.x - 77} ${position.y - 24})`}>
              <rect width="154" height="48" rx="6" />
              <text className="map-node-type" x="10" y="15">{node.type}</text>
              <text className="map-node-label" x="10" y="33">{shorten(node.label, 23)}</text>
            </g>
          })}
        </g>
      </svg>
      <div className="map-legend" aria-label="Graph legend"><span><i className="legend-line legend-observed" /> observed</span><span><i className="legend-line legend-selected" /> selected path</span><span><i className="legend-dot legend-reached" /> reached</span><span><i className="legend-dot legend-safe" /> safe</span></div>
    </div>
  </section>
}

function RouteList({ findings, selectedIndex, onSelect }) {
  return <aside className="route-panel">
    <div className="route-panel-heading"><div><span className="section-kicker">Repositories</span><h2>Repository outcomes</h2></div><span>{findings.length}</span></div>
    <p className="route-panel-note">Select a repository to inspect its evidence path.</p>
    <div className="route-list">
      {findings.map((finding, index) => <button className={`route-item ${selectedIndex === index ? 'route-item-selected' : ''}`} key={finding.repository || index} type="button" onClick={() => onSelect(index)}>
        <span className="route-index">0{index + 1}</span>
        <span className="route-item-copy"><strong>{repositoryName(finding.repository)}</strong><small>{finding.packageName}@{finding.resolvedVersion || 'unresolved'}</small></span>
        <Verdict value={finding.verdict} compact />
      </button>)}
    </div>
  </aside>
}

function routeDisplayPart(part, finding) {
  if (part === finding?.repository) return repositoryName(part)
  if (part === finding?.advisoryId) return part
  if (part === finding?.path?.[3]) return part
  if (part.startsWith('symbol:')) return part.replace(/^symbol:/, '').replace('@', ' / ')
  return part
}

function RouteProof({ finding, challenge }) {
  if (!finding) return null
  const parts = findingParts(finding)
  const sourceLinks = [...new Set([finding.repositoryUrl, ...(finding.evidenceSources || []), ...(finding.imports || []).map((item) => item.sourceUrl)].filter(Boolean))]
  const fixLabel = challenge?.proposedVersion ? `Upgrade to ${challenge.proposedVersion}` : challenge?.status === 'ALREADY_SAFE' ? 'Already outside affected range' : 'No verified version change'
  const fixStatus = challenge?.status === 'FIX_SURVIVES' || challenge?.status === 'ALREADY_SAFE' ? 'verified' : 'review'
  return <section className="route-proof">
    <div className="proof-heading"><div><span className="section-kicker">Route</span><h2>{finding.verdict === 'REACHED' ? 'Reachable' : finding.verdict === 'DECLARED_ONLY' ? 'Declared only' : finding.verdict === 'NOT_AFFECTED' ? 'Not affected' : 'Unclassified'}</h2></div><Verdict value={finding.verdict} /></div>
    <p className="proof-reason">{finding.reason || 'The available public evidence does not support a stronger conclusion.'}</p>
    <div className="route-steps">{parts.map((part, index) => <div className="route-step" key={`${part}-${index}`}><span>{index + 1}</span><strong>{shorten(routeDisplayPart(part, finding), 38)}</strong><small>{index === 0 ? 'advisory' : index === parts.length - 1 ? 'source' : 'observed hop'}</small></div>)}</div>
    <div className="proof-bottom">
      <div className={`fix-result fix-result-${fixStatus}`}><span className="fix-icon">{fixStatus === 'verified' ? <Check size={15} /> : <CircleAlert size={15} />}</span><div><span className="section-kicker">Fix</span><strong>{fixLabel}</strong><p>{challenge?.detail || 'No remediation proof was produced for this path.'}</p></div></div>
      <div className="proof-sources"><span className="section-kicker">Sources</span><div>{sourceLinks.slice(0, 4).map((source) => <SourceLink key={source} href={source}>{sourceHost(source)}</SourceLink>)}</div></div>
    </div>
  </section>
}

function TemporalProof({ report, onRewind }) {
  const before = report?.rewind?.beforeAdvisory
  const current = report?.rewind?.currentAsOf || report?.rewind?.asOf
  const memory = report?.rewind?.memory
  if (!before) return <section className="temporal-proof temporal-unavailable"><div><span className="section-kicker">History</span><h2>No dated history</h2><p>No dated repository evidence was collected.</p></div></section>
  const beforeActive = report?.rewind?.asOf === before
  return <section className="temporal-proof">
    <div className="temporal-copy"><span className="section-kicker">History</span><h2>What was true before disclosure?</h2><p>Advisory published {report.advisory?.published?.slice(0, 10) || 'on an unknown date'}.</p><div className="memory-line"><span className="memory-mark" /> {memory?.status === 'recalled' ? 'HydraDB returned dated context.' : 'HydraDB history is unavailable.'}</div></div>
    <div className="temporal-controls"><button className={beforeActive ? 'active' : ''} onClick={() => onRewind(before)}><Clock3 size={15} /><span>Before disclosure</span><small>{before.slice(0, 10)}</small></button><button className={!beforeActive ? 'active' : ''} onClick={() => onRewind(current)}><ShieldCheck size={15} /><span>Current evidence</span><small>{current?.slice(0, 10) || 'today'}</small></button></div>
    <div className="temporal-stats"><span><strong>{memory?.datedChunkCount || 0}</strong><small>dated facts</small></span><span><strong>{memory?.graphContext?.tripletCount || 0}</strong><small>graph triplets</small></span><span><strong>{memory?.relatedCaseCount || 0}</strong><small>related cases</small></span></div>
  </section>
}

function IntegrityDetails({ report, hydra, evidenceStatus }) {
  const quality = report?.evidenceQuality || {}
  const sourceCount = report?.sources?.length || 0
  const graph = report?.graph || { nodes: [], edges: [] }
  return <details className="integrity-details"><summary>Audit record <span>{quality.readyForRecording ? 'recording-ready' : 'review required'}</span></summary><div className="integrity-grid"><div><strong>{sourceCount}</strong><span>public sources</span></div><div><strong>{graph.nodes.length}</strong><span>observed nodes</span></div><div><strong>{graph.edges.length}</strong><span>observed edges</span></div><div><strong>{hydra?.memoryCount || 0}</strong><span>HydraDB memories</span></div></div><p>{quality.reason || 'Reachability is based on cited lockfile and sampled source imports. It is not a claim of compromise.'}</p><p className="integrity-note">Evidence status: {evidenceStatus}. No package code or exploit payload was executed.</p></details>
}

function ReceiptLink() {
  return <a className="receipt-link" href={`/api/scenarios/${SCENARIO_ID}/receipt`} download="recoil-evidence-receipt.json"><Download size={14} /> Download receipt</a>
}

function FinalReport({ report, hydra, evidenceStatus, onRewind }) {
  const [selectedIndex, setSelectedIndex] = useState(0)
  const findings = report?.repositories || []
  const selectedFinding = findings[selectedIndex] || findings[0]
  const challenge = report?.challenge?.find((item) => item.repository === selectedFinding?.repository)
  const summary = report?.summary || {}
  const recordingReady = report?.evidenceQuality?.readyForRecording
  return <main className="case-page">
    <section className="case-hero"><div><span className="section-kicker">Case result</span><h1>{summary.reached || 0} of {summary.totalRepositories || findings.length} repositories <span>reach vulnerable code.</span></h1><p>The graph separates reachability from presence.</p></div><div className="case-actions"><span className={`case-state ${recordingReady ? 'case-state-ready' : ''}`}><StatusIcon status={recordingReady ? 'complete' : 'working'} /> {recordingReady ? 'Evidence complete' : 'Review required'}</span><ReceiptLink /></div></section>
    <section className="case-summary"><div><strong>{summary.reached || 0}</strong><span>reached</span></div><div><strong>{summary.declaredOnly || 0}</strong><span>declared only</span></div><div><strong>{summary.notAffected || 0}</strong><span>not affected</span></div><div><strong>{summary.fixSurvives || 0}</strong><span>fixes verified</span></div></section>
    <div className="case-workspace"><EvidenceMap report={report} selectedFinding={selectedFinding} /><RouteList findings={findings} selectedIndex={selectedIndex} onSelect={setSelectedIndex} /></div>
    <RouteProof finding={selectedFinding} challenge={challenge} />
    <TemporalProof report={report} onRewind={onRewind} />
    <IntegrityDetails report={report} hydra={hydra} evidenceStatus={evidenceStatus} />
  </main>
}

function RunningView({ snapshot }) {
  const investigation = snapshot?.investigation
  const graphReport = { graph: snapshot?.graph || investigation?.evidence?.graph || { nodes: [], edges: [] }, repositories: investigation?.report?.repositories || [] }
  return <main className="live-page"><div className="live-heading"><div><span className="section-kicker">Investigation</span><h1>Reading the case.</h1><p>Live work on the left. Evidence map on the right.</p></div><span className="live-safety">Public records only</span></div><div className="live-workspace"><EventStream events={investigation?.events || []} /><EvidenceMap report={graphReport} events={investigation?.events || []} live /></div></main>
}

function App() {
  const [input, setInput] = useState(DEFAULT_INPUT)
  const [snapshot, setSnapshot] = useState(null)
  const [report, setReport] = useState(null)
  const [hydra, setHydra] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const investigation = snapshot?.investigation

  useEffect(() => {
    let active = true
    api(`/api/scenarios/${SCENARIO_ID}`).then((next) => { if (active) setSnapshot(next) }).catch((cause) => { if (active) setError(`Recoil API unavailable. Start the app with npm run start. ${cause.message}`) })
    return () => { active = false }
  }, [])

  useEffect(() => {
    if (!busy) return undefined
    let cancelled = false
    const poll = async () => {
      try {
        const next = await api(`/api/scenarios/${SCENARIO_ID}`)
        if (cancelled) return
        setSnapshot(next)
        if (next.investigation?.status === 'complete' || next.investigation?.status === 'failed') {
          setBusy(false)
          if (next.investigation.status === 'complete') setReport(next.investigation.report)
          if (next.investigation.status === 'failed') setError(next.investigation.error || 'Investigation incomplete')
          return
        }
      } catch (cause) {
        if (!cancelled) { setError(cause.message); setBusy(false) }
        return
      }
      if (!cancelled) window.setTimeout(poll, 650)
    }
    const timer = window.setTimeout(poll, 100)
    return () => { cancelled = true; window.clearTimeout(timer) }
  }, [busy])

  const activeReport = report || investigation?.report
  const hasInvestigation = Boolean(investigation && investigation.status !== 'idle')
  const isComplete = investigation?.status === 'complete' && activeReport

  async function investigate() {
    if (!input.trim() || busy) return
    setBusy(true); setError(''); setReport(null); setHydra(null)
    try {
      const next = await api(`/api/scenarios/${SCENARIO_ID}/investigate`, { method: 'POST', body: JSON.stringify({ query: input.trim() }) })
      setSnapshot(next)
    } catch (cause) { setBusy(false); setError(cause.message) }
  }

  async function rewind(asOf) {
    if (!activeReport || !asOf) return
    try {
      const next = await api(`/api/scenarios/${SCENARIO_ID}/rewind`, { method: 'POST', body: JSON.stringify({ asOf }) })
      setReport(next.report)
      setHydra({ ...(investigation?.hydra || {}), recall: { ...next.hydra, chunkCount: next.hydra?.chunks?.length || 0 }, temporalRecall: next.hydra })
    } catch (cause) { setError(cause.message) }
  }

  async function newInvestigation() {
    try { await api(`/api/scenarios/${SCENARIO_ID}/reset`, { method: 'POST' }) } catch (cause) { setError(`Could not reset the case. ${cause.message}`); return }
    setSnapshot(null); setReport(null); setHydra(null); setError(''); setInput(DEFAULT_INPUT)
  }

  if (!hasInvestigation) return <Landing value={input} setValue={setInput} onSubmit={investigate} busy={busy} error={error} />
  return <div className="product-shell"><InvestigationHeader investigation={investigation} hydra={hydra || investigation?.hydra} />{isComplete ? <><FinalReport report={activeReport} hydra={hydra || investigation?.hydra} evidenceStatus={investigation?.evidence?.status || 'unknown'} onRewind={rewind} /><div className="new-case-wrap"><button type="button" onClick={newInvestigation}><RotateCcw size={14} /> New case</button></div></> : <RunningView snapshot={snapshot} />}{error && <div className="floating-error"><CircleAlert size={14} /> {error}</div>}</div>
}

class AppBoundary extends Component {
  state = { error: null }
  static getDerivedStateFromError(error) { return { error } }
  render() {
    if (this.state.error) return <main className="runtime-error"><h1>Recoil could not render this case.</h1><p>{this.state.error.message}</p><button onClick={() => window.location.reload()}>Reload</button></main>
    return this.props.children
  }
}

createRoot(document.getElementById('root')).render(<AppBoundary><App /></AppBoundary>)
