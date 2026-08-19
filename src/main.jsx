import { Component, useEffect, useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { ArrowUpRight, Check, CircleAlert, CircleCheck, Clock3, Copy, Database, Download, ExternalLink, FileCode2, LoaderCircle, Moon, PackageCheck, RotateCcw, ShieldCheck, Sun, Waypoints } from 'lucide-react'
import './style.css'

const SCENARIO_ID = '0017'
const DEFAULT_INPUT = ''
const INVESTIGATION_EXAMPLES = [
  {
    label: 'Verified three-way case',
    value: 'GHSA-xvch-5gv4-984h\nhttps://github.com/http-party/http-server/tree/v13.0.2\nhttps://github.com/tweenjs/tween.js\nhttps://github.com/axios/axios/tree/v1.x',
  },
  {
    label: 'Explore a package',
    value: 'npm:minimist\nhttps://github.com/http-party/http-server/tree/v13.0.2\nhttps://github.com/axios/axios/tree/v1.x',
  },
  {
    label: 'One repository',
    value: 'GHSA-xvch-5gv4-984h\nhttps://github.com/http-party/http-server/tree/v13.0.2',
  },
]

const THEME_STORAGE_KEY = 'recoil-theme'

function initialTheme() {
  if (typeof window === 'undefined') return 'light'
  const stored = window.localStorage.getItem(THEME_STORAGE_KEY)
  if (stored === 'dark' || stored === 'light') return stored
  // Light is the product default. A deliberate user choice is persisted, so
  // the OS preference cannot make a first visit unexpectedly look different.
  return 'light'
}

function useTheme() {
  const [theme, setTheme] = useState(initialTheme)
  useEffect(() => {
    document.documentElement.dataset.theme = theme
    window.localStorage.setItem(THEME_STORAGE_KEY, theme)
  }, [theme])
  return [theme, () => setTheme((current) => current === 'dark' ? 'light' : 'dark')]
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

function repositoryKey(value = '') {
  return repositoryName(value).replace(/@[^/]+$/, '')
}

function queryRepositories(query = '') {
  return [...query.matchAll(/https?:\/\/github\.com\/[^\s]+/gi)]
    .map((match) => repositoryName(match[0]))
    .filter(Boolean)
    .filter((repository, index, repositories) => repositories.indexOf(repository) === index)
    .slice(0, 4)
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

function ThemeToggle({ theme, onToggle }) {
  const nextTheme = theme === 'dark' ? 'light' : 'dark'
  return <button className="theme-toggle" type="button" onClick={onToggle} aria-label={`Switch to ${nextTheme} mode`} title={`Switch to ${nextTheme} mode`}><span aria-hidden="true">{theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />}</span><span>{theme === 'dark' ? 'Light' : 'Dark'}</span></button>
}

function Verdict({ value, compact = false }) {
  const label = value === 'REACHED'
    ? 'Source reached'
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

function Landing({ value, setValue, onSubmit, busy, error, theme, onToggleTheme }) {
  return <main className="landing-page">
    <header className="landing-header">
      <div className="brand"><span className="brand-mark" /> RECOIL</div>
      <div className="landing-header-tools"><span className="brand-note">Evidence path analysis</span><ThemeToggle theme={theme} onToggle={onToggleTheme} /></div>
    </header>
    <section className="landing-grid">
      <div className="landing-intro">
        <p className="landing-kicker">Public evidence, one answer</p>
        <h1>Which repositories actually reach <span>affected code?</span></h1>
        <p>Give Recoil an advisory and real repositories. It follows the lockfile to source, dates the path, and checks the smallest defensible fix.</p>
      </div>
      <div className="landing-form-wrap">
        <form className="investigate-form" onSubmit={(event) => { event.preventDefault(); onSubmit() }}>
          <label htmlFor="investigation-input">Advisory and repositories</label>
          <textarea id="investigation-input" value={value} onChange={(event) => setValue(event.target.value)} placeholder={'GHSA-xvch-5gv4-984h\nhttps://github.com/org/repository'} rows={5} />
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

function InvestigationHeader({ investigation, hydra, onNewCase, theme, onToggleTheme }) {
  const report = investigation?.report
  const id = report?.advisory?.id || investigation?.evidence?.target?.advisoryId || 'investigation'
  const state = investigation?.status === 'complete' ? 'Complete' : investigation?.status === 'failed' ? 'Incomplete' : investigation?.status === 'finalizing' ? 'Storing history' : 'Reading'
  const hydraReadFailed = hydra?.recall?.status === 'failed'
  const hydraRecalled = hydra?.recall?.status === 'recalled'
  const hydraPending = hydra?.indexingPending === true
  const hydraInFlight = hydraPending || investigation?.status === 'finalizing'
  const hydraLabel = hydraReadFailed ? 'HydraDB read failed' : hydraRecalled ? `HydraDB context recalled${hydraInFlight ? ' · indexing' : hydra?.status === 'queued' ? ' · write unconfirmed' : ''}` : hydraInFlight ? 'HydraDB indexing' : hydra?.status === 'persisted' ? 'HydraDB connected' : hydra?.status === 'queued' ? 'HydraDB write unconfirmed' : hydra?.status === 'failed' ? 'HydraDB unavailable' : 'Local evidence record'
  const hydraLive = hydra?.status === 'persisted' || (hydraRecalled && !hydraPending)
  return <header className="product-header">
    <div className="brand"><span className="brand-mark" /> RECOIL</div>
    <div className="header-case"><strong>{id}</strong><span>{report?.package ? `${report.package} · ${state.toLowerCase()}` : state}</span></div>
    <div className="header-actions"><div className="header-status"><span className={`connection-mark ${hydraReadFailed || hydra?.status === 'failed' ? 'is-failed' : hydraLive ? 'is-live' : ''}`} /> {hydraLabel}</div><ThemeToggle theme={theme} onToggle={onToggleTheme} />{onNewCase && <button className="header-new-case" type="button" onClick={onNewCase}>New case <RotateCcw size={13} /></button>}</div>
  </header>
}

function currentInvestigationActivity(events = [], investigationStatus) {
  const working = events.find((event) => event.status === 'working')
  if (working) return working
  if (investigationStatus === 'finalizing') return { title: 'Storing evidence history', detail: 'Writing the dated graph to HydraDB and recalling related context.' }
  if (investigationStatus === 'running') return { title: 'Collecting public evidence', detail: 'Reading advisory, registry, lockfile, and source records.' }
  return null
}

function LiveRepositoryProgress({ query, events = [] }) {
  const repositories = queryRepositories(query)
  if (!repositories.length) return null
  const latestByRepository = new Map()
  events.filter((event) => event.repository).forEach((event) => latestByRepository.set(repositoryKey(event.repository), event))
  return <section className="live-repositories" aria-label="Repository collection status">
    <div className="live-repositories-heading"><span>Repositories</span><span>{repositories.length} targets</span></div>
    <div className="live-repository-list">
      {repositories.map((repository, index) => {
        const event = latestByRepository.get(repositoryKey(repository))
        const status = event?.status || 'waiting'
        const statusLabel = status === 'complete' ? 'read' : status === 'working' ? 'reading' : status === 'failed' ? 'failed' : 'queued'
        return <div className={`live-repository live-repository-${status}`} key={repository}>
          <span className="live-repository-index">0{index + 1}</span>
          <div><strong>{repository}</strong><small>{event?.detail || 'Waiting for the public lockfile and source sample.'}</small></div>
          <span className="live-repository-status">{statusLabel}</span>
        </div>
      })}
    </div>
  </section>
}

function EventStream({ events = [], investigationStatus, query }) {
  const [expanded, setExpanded] = useState(false)
  const eventCurrent = events.find((event) => event.status === 'working')
  const current = currentInvestigationActivity(events, investigationStatus)
  const active = Boolean(eventCurrent || ['running', 'finalizing'].includes(investigationStatus))
  const recentKeys = new Set(events.slice(-5).map((event) => event.key))
  const visibleEvents = expanded ? events : events.filter((event) => recentKeys.has(event.key) || event.key === eventCurrent?.key)
  return <section className="event-journal" aria-label="Investigation progress" aria-busy={active}>
    <div className="journal-heading"><div><span className="section-kicker">Progress</span><h2 aria-live="polite" aria-atomic="true">{current?.title || 'Evidence is ready'}</h2></div><span className="journal-state" role="status" aria-live="polite">{active ? 'working' : 'up to date'}</span></div>
    <LiveRepositoryProgress query={query} events={events} />
    <div className="journal-activity-heading"><span>Recent activity</span>{events.length > 5 && <button type="button" onClick={() => setExpanded((value) => !value)}>{expanded ? 'Show recent' : `Show all ${events.length}`}</button>}</div>
    <div className="event-list">
      {!eventCurrent && current && <article className="event-row event-working event-current-fallback"><div className="event-status"><StatusIcon status="working" /></div><div className="event-copy"><div className="event-title"><strong>{current.title}</strong></div><p>{current.detail}</p></div><span className="event-now">now</span></article>}
      {visibleEvents.map((event) => <article className={`event-row event-${event.status}`} key={event.id || event.key}>
        <div className="event-status"><StatusIcon status={event.status} /></div>
        <div className="event-copy"><div className="event-title"><strong>{event.title}</strong>{event.repository && <span>{event.repository}</span>}</div><p>{event.detail}</p>{event.graphProgress && <span className="event-evidence-count">{event.graphProgress.completedRepositories}/{event.graphProgress.totalRepositories} repositories mapped · {event.graph?.nodes?.length || 0} nodes · {event.graph?.edges?.length || 0} edges</span>}{event.sourceUrls?.[0] && <SourceLink href={event.sourceUrls[0]} />}</div>
        {event.status === 'working' && <span className="event-now">now</span>}
      </article>)}
    </div>
    {!events.length && <div className="journal-empty">The investigation will stream here after you start it.</div>}
  </section>
}

function eventStatus(events, keys = []) {
  const matches = events.filter((event) => keys.includes(event.key) || keys.some((key) => event.key?.startsWith(key)))
  if (matches.some((event) => event.status === 'failed')) return 'failed'
  if (matches.some((event) => event.status === 'working')) return 'working'
  if (matches.some((event) => event.status === 'complete' || event.status === 'persisted')) return 'complete'
  return 'waiting'
}

function EvidencePhaseRail({ events = [], live = false, investigationStatus, investigationStep }) {
  const phases = [
    { key: 'records', label: 'Read records', detail: 'OSV, registry, repositories', keys: ['public-records', 'repository:', 'registry'], icon: <SearchIcon /> },
    { key: 'route', label: 'Trace routes', detail: 'Lockfiles and source imports', keys: ['classification', 'proving-paths'], icon: <Waypoints size={16} /> },
    { key: 'proof', label: 'Prove the fix', detail: 'Range and residual path', keys: ['fix-plan'], icon: <PackageCheck size={16} /> },
    { key: 'memory', label: 'Store history', detail: 'HydraDB temporal record', keys: ['hydra'], icon: <Database size={16} /> },
  ]
  return <div className={`phase-rail ${live ? 'phase-rail-live' : ''}`} aria-label="Investigation stages" role="list">
    {phases.map((phase, index) => {
      const eventPhaseStatus = eventStatus(events, phase.keys)
      const status = phase.key === 'memory' && investigationStep === 'hydra' && investigationStatus === 'finalizing'
        ? 'working'
        : eventPhaseStatus
      const statusLabel = status === 'complete' ? 'complete' : status === 'working' ? 'working now' : status === 'failed' ? 'needs attention' : 'waiting'
      return <div className={`phase ${status}`} key={phase.key} role="listitem" aria-label={`${phase.label}: ${statusLabel}`}>
        <div className="phase-icon">{status === 'complete' ? <Check size={15} /> : status === 'working' ? <LoaderCircle className="spin" size={15} /> : phase.icon}</div>
        <div className="phase-copy"><strong>{phase.label}</strong><span>{phase.detail}</span></div>
        {index < phases.length - 1 && <i className="phase-connector" aria-hidden="true" />}
      </div>
    })}
  </div>
}

function SearchIcon() {
  return <span className="phase-search-icon" aria-hidden="true" />
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
  if (node.type === 'package' && part.split(',').map((value) => value.trim()).includes(node.label)) return true
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
    // Keep the 154px node frame inside the viewBox so the first/last column
    // remains readable when the SVG is scaled down by the workspace.
    const horizontalGutter = 90
    const x = horizontalGutter + (layer / maxLayer) * (width - horizontalGutter * 2)
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

function nodeDescription(node, report) {
  if (node.type === 'advisory') return 'Public advisory record'
  if (node.type === 'package') return node.meta?.role === 'affected-dependency' ? 'Resolved dependency in the repository lockfile' : node.meta?.role === 'transitive-dependency' ? 'Observed transitive lockfile dependency' : 'Resolved package version'
  if (node.type === 'lockfile') return 'Public lockfile resolution record'
  if (node.type === 'repository') {
    const finding = report?.repositories?.find((item) => item.repository === node.label)
    return finding ? `${finding.verdict === 'REACHED' ? 'Source-backed path' : finding.verdict === 'DECLARED_ONLY' ? 'Declared without sampled import' : finding.verdict === 'NOT_AFFECTED' ? 'Outside affected range' : 'Evidence needs review'} · repository record` : 'Repository record'
  }
  if (node.type === 'code') return 'Sampled source file'
  if (node.type === 'symbol') return 'Validated advisory symbol'
  return 'Observed evidence entity'
}

function GraphInspector({ node, report, graph, selectedFinding }) {
  if (!node) return <div className="graph-inspector graph-inspector-empty"><span>Select a node to inspect its evidence.</span></div>
  const verdict = nodeVerdict(node, report)
  const nodesById = new Map((graph?.nodes || []).map((item) => [item.id, item]))
  const relations = (graph?.edges || []).flatMap(([from, to]) => {
    if (from === node.id) return [{ direction: 'out', node: nodesById.get(to) }]
    if (to === node.id) return [{ direction: 'in', node: nodesById.get(from) }]
    return []
  }).filter((relation) => relation.node)
  const metadata = node.meta?.resolvedVersions?.length ? `resolved versions: ${node.meta.resolvedVersions.join(', ')}` : nodeDescription(node, report)
  const importer = selectedFinding?.imports?.[0]
  const routeEvidence = selectedFinding && node.type === 'repository'
    ? importer
      ? `${importer.path}${importer.line ? `:${importer.line}` : ''}`
      : selectedFinding.verdict === 'DECLARED_ONLY' ? 'No sampled import' : 'Source evidence needs review'
    : null
  return <div className="graph-inspector" aria-live="polite"><div className="graph-inspector-copy"><span>Selected {node.type}</span><strong>{node.label}</strong><small>{metadata}</small></div>{routeEvidence && <div className="graph-inspector-evidence"><span>{importer ? 'Source check' : 'Reachability check'}</span><strong>{routeEvidence}</strong>{importer?.snippet && <code>{importer.snippet}</code>}{importer?.sourceUrl && <SourceLink href={importer.sourceUrl}>Open source line</SourceLink>}</div>}<div className="graph-inspector-relations" aria-label="Observed relationships">{relations.slice(0, 2).map((relation) => <span key={`${relation.direction}-${relation.node.id}`}><i>{relation.direction === 'out' ? '→' : '←'}</i>{shorten(relation.node.label, 25)}</span>)}{relations.length > 2 && <small>+{relations.length - 2} more</small>}</div><div className="graph-inspector-actions">{verdict && <Verdict value={verdict} compact />}{node.sourceUrl && <SourceLink href={node.sourceUrl}>Open source</SourceLink>}</div></div>
}

function EvidenceMap({ report, selectedFinding, onSelectFinding, onSelectNode, selectedNodeId, events = [], live = false, graphProgress = null }) {
  const graph = report?.graph || { nodes: [], edges: [] }
  const layout = useMemo(() => graphLayout(graph, selectedFinding), [graph, selectedFinding])
  const selected = layout.selected
  const selectedNode = layout.nodes.find((node) => node.id === selectedNodeId) || layout.nodes.find((node) => node.type === 'repository' && node.label === selectedFinding?.repository) || null
  const selectedEdges = new Set(layout.edges.filter(([from, to]) => selected.has(from) && selected.has(to)).map(([from, to]) => `${from}>${to}`))
  const layerLabels = [{ label: 'Advisory', type: 'advisory' }, { label: 'Dependency', type: 'package' }, { label: 'Repository', type: 'repository' }, { label: 'Source', type: 'code' }]
  if (!layout.nodes.length) {
    const current = events.find((event) => event.status === 'working')
    return <section className="evidence-map map-empty" aria-label="Evidence map">
      <div className="map-heading"><div><span className="section-kicker">Evidence map</span><h2>{live ? 'Building the route' : 'No graph to show'}</h2><p className="map-heading-detail">{live ? 'Records appear here as each repository finishes.' : 'Start an investigation to draw the collected relationships.'}</p></div><span className="map-count">{live ? `${graphProgress?.completedRepositories || 0}/${graphProgress?.totalRepositories || 0} repositories` : '0 nodes'}</span></div>
      <div className="map-empty-body"><div className="empty-route"><span /><i /><span /><i /><span /></div><strong>{current?.title || 'The evidence map appears here'}</strong><p>{current?.detail || 'Start an investigation to draw the advisory, dependency, repository, and source relationships.'}</p></div>
    </section>
  }
  return <section className="evidence-map" aria-label="Observed evidence map">
    <div className="map-heading"><div><span className="section-kicker">Observed graph</span><h2>{live ? graphProgress?.completedRepositories === graphProgress?.totalRepositories && graphProgress?.totalRepositories ? 'Evidence map ready' : 'Evidence arriving' : 'Follow the path to code'}</h2><p className="map-heading-detail">{live ? 'Each edge is added from a public record as it is collected.' : 'Read left to right: advisory → resolved package → repository → sampled source. Select a node to inspect its cited relationship.'}</p></div><span className="map-count">{live && graphProgress ? `${graphProgress.completedRepositories}/${graphProgress.totalRepositories} repositories · ` : ''}{layout.nodes.length} nodes · {layout.edges.length} edges</span></div>
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
            const findingIndex = node.type === 'repository' ? (report?.repositories || []).findIndex((finding) => finding.repository === node.label) : -1
            const selectable = Boolean(onSelectNode || (findingIndex >= 0 && onSelectFinding))
            const selectNode = () => { if (findingIndex >= 0 && onSelectFinding) onSelectFinding(findingIndex); if (onSelectNode) onSelectNode(node.id) }
            return <g className={`map-node node-${node.type} ${isSelected ? 'node-selected' : ''} ${verdict ? `node-${verdict.toLowerCase()}` : ''} ${selectable ? 'node-selectable' : ''}`} key={node.id} transform={`translate(${position.x - 77} ${position.y - 24})`} role={selectable ? 'button' : undefined} aria-label={selectable ? `${node.type}: ${node.label}` : undefined} tabIndex={selectable ? 0 : undefined} onClick={selectNode} onKeyDown={(event) => { if (selectable && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); selectNode() } }}>
              <title>{node.label}</title>
              <rect width="154" height="48" rx="6" />
              <text className="map-node-type" x="10" y="15">{node.type}</text>
              <text className="map-node-label" x="10" y="33">{shorten(node.label, 23)}</text>
            </g>
          })}
        </g>
      </svg>
      <div className="map-legend" aria-label="Graph legend"><span><i className="legend-line legend-observed" /> observed</span><span><i className="legend-line legend-selected" /> selected path</span><span><i className="legend-dot legend-reached" /> reached</span><span><i className="legend-dot legend-declared" /> declared only</span><span><i className="legend-dot legend-safe" /> safe</span><span className="map-direction">arrows follow the evidence</span></div>
      {!live && onSelectNode && <GraphInspector node={selectedNode} report={report} graph={graph} selectedFinding={selectedFinding} />}
    </div>
  </section>
}

function SharedResolution({ correlations = [] }) {
  const visible = correlations.filter((group) => group.repositories?.length > 1).slice(0, 2)
  if (!visible.length) return null
  return <section className="shared-resolution" aria-label="Shared dependency resolution">
    <div className="shared-resolution-heading"><div><span className="section-kicker">Cross-repository signal</span><strong>One resolution, multiple repositories</strong></div><span>{visible.length} shared</span></div>
    {visible.map((group) => <article className="shared-resolution-group" key={`${group.packageName}@${group.version}`}>
      <div className="shared-resolution-package"><strong>{group.packageName}@{group.version}</strong><span>{group.repositoryCount} repositories resolve this exact version</span></div>
      <div className="shared-resolution-repos">{group.repositories.slice(0, 4).map((repository) => <span key={repository.repository}><i className={`shared-resolution-dot shared-resolution-${String(repository.verdict || 'UNKNOWN').toLowerCase()}`} />{repositoryName(repository.repository)}</span>)}</div>
      {group.sourceUrls?.[0] && <SourceLink href={group.sourceUrls[0]}>Open shared evidence</SourceLink>}
    </article>)}
    <p className="shared-resolution-note">This is a resolved-version correlation from the supplied lockfiles, not a claim that the repositories share runtime infrastructure.</p>
  </section>
}

function routeActionLabel(finding, challenge, historical) {
  if (historical) return 'Historical evidence'
  if (challenge?.status === 'FIX_SURVIVES') return `Upgrade to ${challenge.proposedVersion}`
  if (challenge?.status === 'MANIFEST_CHANGE_REQUIRED') return `Change manifest to ${challenge.proposedVersion}`
  if (challenge?.status === 'NO_REACHABLE_PATH') return `Refresh to ${challenge.proposedVersion}`
  if (challenge?.status === 'ALREADY_SAFE') return 'No version change required'
  if (finding?.verdict === 'REACHED') return 'Review fix proof'
  if (finding?.verdict === 'DECLARED_ONLY') return 'Review dependency declaration'
  if (finding?.verdict === 'NOT_AFFECTED') return 'No action from this case'
  return 'Complete evidence'
}

function routeEvidenceLabel(finding) {
  if (finding?.verdict === 'REACHED') return `${finding.imports?.length || 0} sampled import${finding.imports?.length === 1 ? '' : 's'} found`
  if (finding?.verdict === 'DECLARED_ONLY') return 'present in lockfile; no sampled import'
  if (finding?.verdict === 'NOT_AFFECTED') return 'resolved outside affected range'
  return 'evidence needs review'
}

function routePathLabel(finding) {
  const parts = findingParts(finding).map((part) => routeDisplayPart(part, finding)).filter(Boolean)
  return parts.length ? parts.join(' → ') : 'No observed path'
}

function RouteList({ findings, selectedIndex, onSelect, challenges = [], correlations = [], historical = false, onInspectProof }) {
  const reached = findings.filter((finding) => finding.verdict === 'REACHED').length
  const selected = findings[selectedIndex] || findings[0]
  const selectedChallenge = challenges.find((item) => item.repository === selected?.repository)
  const importer = selected?.imports?.[0]
  const challengeLabel = historical
    ? 'Current view only'
    : selectedChallenge?.status === 'FIX_SURVIVES'
    ? 'Fixed version verified'
    : selectedChallenge?.status === 'ALREADY_SAFE'
      ? 'Already outside range'
      : selectedChallenge?.status === 'NO_REACHABLE_PATH'
        ? 'No reachable path'
        : selectedChallenge?.status === 'MANIFEST_CHANGE_REQUIRED'
          ? 'Manifest change required'
          : 'Review required'
  return <aside className="route-panel">
    <div className="route-panel-heading"><div><span className="section-kicker">Repository comparison</span><h2>What the evidence says</h2></div><span>{findings.length} checked</span></div>
    <p className="route-panel-note">Select a repository to inspect the exact path behind its decision.</p>
    {reached > 0 && <div className="route-panel-callout"><CircleAlert size={15} /><span>{reached} {reached === 1 ? 'repository reaches' : 'repositories reach'} the affected code in sampled source.</span></div>}
    {selected && <div className="route-selected" aria-live="polite">
      <div className="route-selected-heading"><span>Selected repository</span><Verdict value={selected.verdict} compact /></div>
      <strong>{repositoryName(selected.repository)}</strong>
      <p>{selected.reason || 'The available public evidence does not support a stronger conclusion.'}</p>
      <dl><div><dt>Resolved</dt><dd>{selected.resolvedVersions?.length > 1 ? selected.resolvedVersions.join(', ') : selected.resolvedVersion || 'not resolved'}</dd></div><div><dt>Source imports</dt><dd>{selected.imports?.length || 0}</dd></div></dl>
      <div className="route-selected-proof"><div><span>Source check</span><strong>{importer ? `${importer.path}${importer.line ? `:${importer.line}` : ''}` : 'No sampled import'}</strong></div><div><span>Fix check</span><strong>{challengeLabel}</strong></div></div>
      <button className="route-selected-action" type="button" onClick={onInspectProof}>Open fix details <ArrowUpRight size={13} /></button>
    </div>}
    <div className="route-list">
      {findings.map((finding, index) => <button className={`route-item ${selectedIndex === index ? 'route-item-selected' : ''}`} key={finding.repository || index} type="button" onClick={() => onSelect(index)}>
        <span className="route-index">0{index + 1}</span>
        <span className="route-item-copy"><strong>{repositoryName(finding.repository)}</strong><small>{finding.packageName || 'package unresolved'} · {finding.resolvedVersions?.length > 1 ? finding.resolvedVersions.join(', ') : finding.resolvedVersion || 'not resolved'}</small><em><b>{routeActionLabel(finding, challenges.find((item) => item.repository === finding.repository), historical)}</b> · {routeEvidenceLabel(finding)}</em><code title={routePathLabel(finding)}>{routePathLabel(finding)}</code></span>
        <Verdict value={finding.verdict} compact />
      </button>)}
    </div>
    {!historical && <SharedResolution correlations={correlations} />}
  </aside>
}

function routeDisplayPart(part, finding) {
  if (part === finding?.repository) return repositoryName(part)
  if (part === finding?.advisoryId) return part
  if (part === finding?.path?.[3]) return part
  if (part.startsWith('symbol:')) return part.replace(/^symbol:/, '').replace('@', ' / ')
  return part
}

function ImportProof({ finding }) {
  const importer = finding?.imports?.[0]
  if (!importer) return <div className="import-proof import-proof-empty"><FileCode2 size={16} /><div><span className="section-kicker">Source check</span><strong>No sampled import</strong><p>{finding?.verdict === 'DECLARED_ONLY' ? 'The package is present in the lockfile, but no sampled source file imports it.' : finding?.sourceBound || 'The source evidence does not support a stronger conclusion.'}</p></div></div>
  return <div className="import-proof"><FileCode2 size={16} /><div><span className="section-kicker">Observed in source</span><strong>{importer.path}{importer.line ? `:${importer.line}` : ''}</strong><code>{importer.snippet || `imports ${importer.specifier || finding.packageName}`}</code><SourceLink href={importer.sourceUrl}>Open source line</SourceLink></div></div>
}

function remediationNote(finding, challenge) {
  const path = findingParts(finding).map((part) => routeDisplayPart(part, finding)).join(' -> ')
  const sources = [...new Set([
    finding.repositoryUrl,
    finding.lockfileSource,
    ...(finding.imports || []).map((item) => item.sourceUrl),
  ].filter(Boolean))].slice(0, 4)
  return [
    'Recoil remediation review',
    `Repository: ${repositoryName(finding.repository)}`,
    `Advisory: ${finding.advisoryId || 'not identified'}`,
    `Finding: ${finding.verdict}`,
    `Observed resolution: ${finding.packageName || 'package'}@${finding.resolvedVersion || finding.resolvedVersions?.join(', ') || 'unresolved'}`,
    `Evidence path: ${path || 'no observed path'}`,
    `Recommendation: ${challenge.detail || 'Review the available evidence before changing the dependency.'}`,
    `Proposed resolution: ${finding.packageName || 'package'}@${challenge.proposedVersion || 'not established'}`,
    'Boundary: static public evidence only; Recoil did not install packages, execute code, or apply a change.',
    'Sources:',
    ...sources.map((source) => `- ${source}`),
  ].join('\n')
}

function CopyRemediationNote({ finding, challenge }) {
  const [status, setStatus] = useState('idle')
  useEffect(() => {
    if (status !== 'copied') return undefined
    const timer = window.setTimeout(() => setStatus('idle'), 1800)
    return () => window.clearTimeout(timer)
  }, [status])
  const copy = async () => {
    const text = remediationNote(finding, challenge)
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text)
      } else {
        const field = document.createElement('textarea')
        field.value = text
        field.setAttribute('readonly', '')
        field.style.position = 'fixed'
        field.style.opacity = '0'
        document.body.appendChild(field)
        field.select()
        const copied = document.execCommand('copy')
        field.remove()
        if (!copied) throw new Error('clipboard unavailable')
      }
      setStatus('copied')
    } catch {
      setStatus('failed')
    }
  }
  const label = status === 'copied' ? 'Copied' : status === 'failed' ? 'Copy unavailable' : 'Copy review note'
  return <button className="copy-remediation-note" type="button" onClick={copy} aria-live="polite"><span>{status === 'copied' ? <Check size={13} /> : <Copy size={13} />}{label}</span><small>evidence-derived</small></button>
}

function FixProof({ finding, challenge }) {
  if (!finding || !challenge) return null
  const currentVersion = finding.resolvedVersion || finding.resolvedVersions?.join(', ') || 'unresolved'
  const proposedVersion = challenge.proposedVersion || 'no fixed version'
  const verified = ['FIX_SURVIVES', 'ALREADY_SAFE'].includes(challenge.status)
  const lockfileSource = finding.lockfileSource || (finding.evidenceSources || []).find((source) => /(?:lock|package\.json|cargo\.toml|cargo\.lock)/i.test(source)) || finding.evidenceSources?.[0]
  const statusLabel = challenge.status === 'FIX_SURVIVES'
    ? 'Version-level proof'
    : challenge.status === 'ALREADY_SAFE'
      ? 'Already outside range'
      : challenge.status === 'MANIFEST_CHANGE_REQUIRED'
        ? 'Manifest change required'
        : challenge.status === 'NO_REACHABLE_PATH'
          ? 'Defense-in-depth update'
          : 'Review required'
  const boundary = challenge.status === 'ALREADY_SAFE'
    ? 'No version change is required for this observed resolution. The repository was not modified or executed.'
    : 'The repository was not modified or executed. Recoil proves the advisory range and declared-range relationship; the lockfile still needs to be updated and reviewed.'
  return <section className={`fix-proof fix-proof-${verified ? 'verified' : 'review'}`}>
    <div className="fix-proof-heading"><div><span className="section-kicker">Remediation</span><h3>{statusLabel}</h3></div><span className="fix-proof-badge">{verified ? <Check size={13} /> : <CircleAlert size={13} />}{verified ? 'verified' : 'not verified'}</span></div>
    <div className="fix-proof-compare">
      <div><span>Observed</span><strong>{finding.packageName}@{currentVersion}</strong><small>{finding.verdict === 'REACHED' ? 'affected import observed' : finding.verdict === 'DECLARED_ONLY' ? 'declared, not imported' : 'current resolution'}</small></div>
      <span className="fix-proof-arrow" aria-hidden="true">→</span>
      <div><span>Proposed</span><strong>{finding.packageName}@{proposedVersion}</strong><small>{challenge.status === 'MANIFEST_CHANGE_REQUIRED' ? `outside ${finding.declaredRange || 'the declared'} range` : verified ? 'outside the affected range' : 'not proven by this case'}</small></div>
    </div>
    <p className="fix-proof-detail">{challenge.detail}</p>
    <div className="fix-proof-boundary"><PackageCheck size={15} /><span>{boundary}</span>{lockfileSource && <SourceLink href={lockfileSource}>Open lockfile evidence</SourceLink>}</div>
    <div className="fix-proof-actions"><CopyRemediationNote finding={finding} challenge={challenge} /><span>Copies the finding, proposed resolution, boundary, and source links.</span></div>
  </section>
}

function ChangeProof({ finding }) {
  const change = finding?.changeEvidence
  if (!change?.importerFilesChanged?.length) return null
  const owners = [...new Set(change.importerFilesChanged.flatMap((item) => item.owners || []))]
  return <div className="change-proof">
    <div className="change-proof-heading"><div><span className="section-kicker">Recent importer change</span><strong>{change.message || 'A public change touched the imported file'}</strong><small>{change.committedAt?.slice(0, 10) || 'date unavailable'} · {change.totalFilesChanged || change.sampledFilesChanged || 0} files changed</small></div>{change.sourceUrl && <SourceLink href={change.sourceUrl}>Open commit</SourceLink>}</div>
    <div className="change-proof-meta"><span><b>Importer</b>{change.importerFilesChanged.map((item) => `${item.path}${item.line ? `:${item.line}` : ''}`).join(', ')}</span><span><b>Owners</b>{owners.length ? owners.join(', ') : 'CODEOWNERS not collected'}</span></div>
    <p>This is change history for the observed importer, not a claim that the commit introduced the advisory.</p>
  </div>
}

function RouteProof({ finding, challenge }) {
  if (!finding) return null
  const parts = findingParts(finding)
  const sourceLinks = [...new Set([finding.repositoryUrl, ...(finding.evidenceSources || []), ...(finding.imports || []).map((item) => item.sourceUrl)].filter(Boolean))]
  return <section className="route-proof" id="case-proof">
    <div className="proof-heading"><div><span className="section-kicker">Route</span><h2>{finding.verdict === 'REACHED' ? 'Source reachable' : finding.verdict === 'DECLARED_ONLY' ? 'Declared only' : finding.verdict === 'NOT_AFFECTED' ? 'Not affected' : 'Unclassified'}</h2></div><Verdict value={finding.verdict} /></div>
    <p className="proof-reason">{finding.reason || 'The available public evidence does not support a stronger conclusion.'}</p>
    <div className="route-steps">{parts.map((part, index) => <div className="route-step" key={`${part}-${index}`}><span>{index + 1}</span><strong>{shorten(routeDisplayPart(part, finding), 38)}</strong><small>{index === 0 ? 'advisory' : index === parts.length - 1 ? 'source' : 'observed hop'}</small></div>)}</div>
    <ImportProof finding={finding} />
    <ChangeProof finding={finding} />
    <FixProof finding={finding} challenge={challenge} />
    <div className="proof-bottom">
      <div className="proof-sources"><span className="section-kicker">Sources</span><div>{sourceLinks.slice(0, 4).map((source) => <SourceLink key={source} href={source}>{sourceHost(source)}</SourceLink>)}</div></div>
    </div>
  </section>
}

function TemporalProof({ report, onRewind }) {
  const before = report?.rewind?.beforeAdvisory
  const current = report?.rewind?.currentAsOf || report?.rewind?.asOf
  const memory = report?.rewind?.memory
  if (!before) return <section className="temporal-proof temporal-unavailable" id="case-history"><div><span className="section-kicker">HydraDB history</span><h2>No dated history</h2><p>No dated repository evidence was collected, so Recoil cannot claim when this path existed.</p></div></section>
  const beforeActive = report?.rewind?.asOf === before
  const currentFindings = report?.repositories || []
  const beforeFindings = beforeActive ? report?.rewind?.findings || [] : []
  const currentSummary = summarizeFindings(currentFindings)
  const beforeSummary = summarizeFindings(beforeFindings)
  const currentLabel = temporalSummaryLabel(currentSummary)
  const beforeLabel = beforeActive ? temporalSummaryLabel(beforeSummary) : 'Not loaded'
  const changes = beforeActive
    ? currentFindings
      .map((finding) => {
        const historicalFinding = beforeFindings.find((item) => item.repository === finding.repository)
        return historicalFinding && historicalFinding.verdict !== finding.verdict
          ? { repository: finding.repository, before: historicalFinding.verdict, current: finding.verdict }
          : null
      })
      .filter(Boolean)
    : []
  const temporalConclusion = beforeActive
    ? changes.length
      ? `${changes.length} repository verdict${changes.length === 1 ? '' : 's'} changed across the disclosure boundary.`
      : currentSummary.reached > 0
        ? 'The sampled reachable path was already evidenced before disclosure.'
        : 'The sampled repository classifications stayed the same across the disclosure boundary.'
    : 'Rewind once to rebuild the graph at the day before disclosure.'
  const triplets = [...new Map((memory?.graphContext?.triplets || []).map((triplet) => {
    const key = [triplet.source, triplet.predicate, triplet.target].map((value) => String(value || '').trim().toLowerCase()).join('|')
    return [key, triplet]
  })).values()]
  const relatedCases = memory?.relatedCases?.length
    ? memory.relatedCases
    : (memory?.priorScenarioIds || []).map((scenarioId) => ({ scenarioId }))
  return <section className="temporal-proof" id="case-history">
    <div className="temporal-copy"><span className="section-kicker">HydraDB history</span><h2>See the case at two points in time.</h2><p>The advisory was published {report.advisory?.published?.slice(0, 10) || 'on an unknown date'}. Recoil uses dated lockfile evidence and HydraDB recall to keep the timeline inspectable.</p><div className={`memory-line ${memory?.status === 'recalled' ? '' : 'memory-line-muted'}`}><span className="memory-mark" /> {memory?.status === 'recalled' ? 'Dated context returned from HydraDB.' : memory?.status === 'queued' ? 'Memory is indexing in HydraDB.' : 'HydraDB history is unavailable.'}</div></div>
    <div className="temporal-controls"><button className={beforeActive ? 'active' : ''} onClick={() => onRewind(before)}><Clock3 size={15} /><span>Before disclosure</span><small>{before.slice(0, 10)}</small></button><button className={!beforeActive ? 'active' : ''} onClick={() => onRewind(current)}><ShieldCheck size={15} /><span>Current evidence</span><small>{current?.slice(0, 10) || 'today'}</small></button></div>
    <div className="temporal-compare" aria-live="polite">
      <div className="temporal-compare-heading"><span>Disclosure boundary</span><strong>{temporalConclusion}</strong></div>
      <div className="temporal-compare-points">
        <div className={`temporal-point ${beforeActive ? 'temporal-point-active' : ''}`}>
          <span>Before disclosure</span>
          <strong>{beforeLabel}</strong>
          <small>{beforeActive ? `${before.slice(0, 10)} · reconstructed from dated evidence` : 'Select the left control to load this snapshot'}</small>
        </div>
        <span className="temporal-compare-arrow" aria-hidden="true">→</span>
        <div className={`temporal-point ${!beforeActive ? 'temporal-point-active' : ''}`}>
          <span>Current evidence</span>
          <strong>{currentLabel}</strong>
          <small>{current?.slice(0, 10) || 'current collection'} · source-backed verdicts</small>
        </div>
      </div>
      {changes.length > 0 && <div className="temporal-changes"><span>Changed classifications</span>{changes.slice(0, 4).map((change) => <span className="temporal-change" key={change.repository}><strong>{repositoryName(change.repository)}</strong><small>{change.before.replaceAll('_', ' ').toLowerCase()} → {change.current.replaceAll('_', ' ').toLowerCase()}</small></span>)}</div>}
    </div>
    <div className="temporal-stats"><span><strong>{memory?.datedChunkCount || 0}</strong><small>dated facts</small></span><span><strong>{memory?.graphContext?.tripletCount || 0}</strong><small>graph triplets</small></span><span><strong>{memory?.relatedCaseCount || 0}</strong><small>related cases</small></span></div>
    <details className="memory-evidence"><summary>Inspect recalled relationships <span>{triplets.length} returned</span></summary>{triplets.length ? <div className="memory-triplets">{triplets.slice(0, 6).map((triplet, index) => <div className="memory-triplet" key={`${triplet.source}-${triplet.predicate}-${triplet.target}-${index}`}><strong>{triplet.source || 'entity'}</strong><span>{triplet.predicate || 'connected to'}</span><strong>{triplet.target || 'entity'}</strong></div>)}</div> : <p>No graph relationships were returned for this temporal read.</p>}</details>
    {relatedCases.length > 0 && <section className="related-cases" aria-label="Related HydraDB cases"><div className="related-cases-heading"><div><span className="section-kicker">HydraDB recall</span><strong>Related evidence from earlier cases</strong></div><span>{relatedCases.length} found</span></div><div className="related-case-list">{relatedCases.slice(0, 4).map((item) => <article className="related-case" key={item.scenarioId}><div className="related-case-main"><strong>{item.scenarioId}</strong><span>{item.repositories?.length ? item.repositories.join(' · ') : 'repository metadata unavailable'}</span></div><div className="related-case-meta"><span>{item.validFrom ? `dated ${dateLabel(item.validFrom)}` : 'date unavailable'}</span>{item.kinds?.length > 0 && <span>{item.kinds.join(' · ')}</span>}{item.sourceUrls?.[0] && <SourceLink href={item.sourceUrls[0]}>source</SourceLink>}</div></article>)}</div><p className="related-cases-note">HydraDB returned case metadata only. The current verdict is still computed from this investigation’s collected evidence.</p></section>}
  </section>
}

function temporalSummaryLabel(summary) {
  const parts = []
  if (summary.reached) parts.push(`${summary.reached} reached`)
  if (summary.declaredOnly) parts.push(`${summary.declaredOnly} declared only`)
  if (summary.notAffected) parts.push(`${summary.notAffected} outside range`)
  if (summary.unknown) parts.push(`${summary.unknown} unknown`)
  return parts.length ? parts.join(' · ') : 'No repository evidence'
}

function dateLabel(value) {
  if (!value) return 'not dated'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? 'not dated' : date.toISOString().slice(0, 10)
}

function CaseChronology({ finding, report, challenge, historical, onOpenHistory }) {
  if (!finding && !report?.advisory?.published) return null
  const lockfileSource = finding?.lockfileSource || (finding?.evidenceSources || []).find((source) => /(?:lock|package\.json|cargo\.toml|cargo\.lock)/i.test(source)) || finding?.evidenceSources?.[0]
  const fixLabel = historical
    ? 'Return to current evidence'
    : challenge?.status === 'FIX_SURVIVES'
      ? `${finding?.packageName || 'package'}@${challenge.proposedVersion}`
      : challenge?.status === 'ALREADY_SAFE'
        ? 'Already outside range'
        : challenge?.status === 'MANIFEST_CHANGE_REQUIRED'
          ? 'Manifest change required'
          : challenge?.status === 'NO_REACHABLE_PATH'
            ? `Update to ${challenge.proposedVersion || 'a fixed version'}`
            : 'Fix not proven'
  const fixDetail = historical
    ? 'Remediation is available in the current view.'
    : challenge?.status === 'FIX_SURVIVES'
      ? 'The proposed version is outside the affected range and admitted by the declared range.'
      : challenge?.status === 'ALREADY_SAFE'
        ? 'No version change is required for this observed resolution.'
        : challenge?.detail || 'The available evidence does not support a stronger fix claim.'
  const steps = [
    {
      kind: 'observed',
      label: finding?.verdict === 'REACHED' ? 'Path observed' : 'Repository evidence',
      date: finding?.pathObservedAt,
      detail: finding?.exposureDays != null ? `${finding.exposureDays} days before disclosure` : finding?.pathObservedAt ? 'First dated repository evidence' : 'No dated path collected',
      source: finding?.pathObservationSource || lockfileSource,
    },
    {
      kind: 'published',
      label: 'Advisory published',
      date: report?.advisory?.published,
      detail: report?.advisory?.id ? report.advisory.id : 'Public advisory date',
      source: report?.advisory?.sourceUrl,
    },
    {
      kind: 'fix',
      label: 'Fix check',
      date: null,
      value: fixLabel,
      detail: fixDetail,
      source: lockfileSource,
    },
  ]
  const chronologyAction = historical ? onOpenHistory : null
  return <section className="case-chronology" aria-label="Evidence chronology">
    <div className="case-chronology-heading"><div><span className="section-kicker">Evidence chronology</span><h2>What happened, in time.</h2><p>Dates come from public advisory and repository history. The fix is a version check, not a code change.</p></div>{report?.rewind?.beforeAdvisory && chronologyAction && <button className="chronology-action" type="button" onClick={chronologyAction}>Compare current evidence <ArrowUpRight size={13} /></button>}</div>
    <div className="case-chronology-track">
      {steps.map((step, index) => <article className={`chronology-step chronology-step-${step.kind}`} key={step.label}><span className="chronology-index">0{index + 1}</span><span className="chronology-label">{step.label}</span><strong>{step.value || dateLabel(step.date)}</strong><small>{step.detail}</small>{step.source ? <SourceLink href={step.source} /> : <span className="chronology-source-missing">source unavailable</span>}</article>)}
    </div>
  </section>
}

function IntegrityDetails({ report, hydra, evidenceStatus }) {
  const quality = report?.evidenceQuality || {}
  const coverage = quality.sourceCoverage || {}
  const sourceCount = report?.sources?.length || 0
  const graph = report?.graph || { nodes: [], edges: [] }
  const sampled = coverage.sampledFiles != null ? `${coverage.sampledFiles}/${coverage.candidateFiles || coverage.sampledFiles}` : 'not measured'
  const scope = report?.advisoryScope || { status: 'not_requested', affectedSymbols: [] }
  const scopeLabel = scope.status === 'completed'
    ? `${scope.affectedSymbols?.length || 0} candidate${scope.affectedSymbols?.length === 1 ? '' : 's'} returned`
    : scope.status === 'skipped' || scope.status === 'not_requested'
      ? 'not enabled'
      : scope.status === 'failed'
        ? 'unavailable'
        : 'module-level only'
  return <details className="integrity-details" id="case-audit" open><summary>Audit record <span>{quality.readyForRecording ? 'recording-ready' : 'review required'}</span></summary><div className="integrity-grid"><div><strong>{sourceCount}</strong><span>public sources</span></div><div><strong>{sampled}</strong><span>source files sampled</span></div><div><strong>{graph.edges.length}</strong><span>observed relationships</span></div><div><strong>{hydra?.memoryCount || 0}</strong><span>HydraDB memories</span></div><div><strong>static only</strong><span>execution boundary</span></div></div><div className="audit-scope"><div><span className="section-kicker">Advisory scope</span><strong>{scopeLabel}</strong><p>{scope.model ? `OpenAI ${scope.model} proposed names; Recoil only attaches exact matches found in an importing file.` : scope.reason || 'The deterministic package-import proof remains authoritative.'}</p></div>{scope.affectedSymbols?.length > 0 && <div className="audit-symbols">{scope.affectedSymbols.slice(0, 6).map((symbol) => <span key={`${symbol.name}-${symbol.reason}`}>{symbol.name}</span>)}</div>}</div><p>{quality.reason || 'Reachability is based on cited lockfile and sampled source imports. It is not a claim of compromise.'}</p><p className="integrity-note">Evidence status: {evidenceStatus}. No package code or exploit payload was executed.</p></details>
}

function ReceiptLink() {
  return <a className="receipt-link" href={`/api/scenarios/${SCENARIO_ID}/receipt`} download="recoil-evidence-receipt.json"><Download size={14} /> Download receipt</a>
}

function summarizeFindings(findings = []) {
  const reached = findings.filter((finding) => finding.verdict === 'REACHED').length
  const declaredOnly = findings.filter((finding) => finding.verdict === 'DECLARED_ONLY').length
  const notAffected = findings.filter((finding) => finding.verdict === 'NOT_AFFECTED').length
  return {
    totalRepositories: findings.length,
    reached,
    declaredOnly,
    notAffected,
    unknown: findings.length - reached - declaredOnly - notAffected,
  }
}

function CaseDecisionCallout({ findings = [], challenges = [], packageName, historical = false, onInspectProof, onOpenHistory, historyAvailable = false }) {
  const reached = findings.filter((finding) => finding.verdict === 'REACHED')
  const declaredOnly = findings.filter((finding) => finding.verdict === 'DECLARED_ONLY')
  const notAffected = findings.filter((finding) => finding.verdict === 'NOT_AFFECTED')
  const unknown = findings.filter((finding) => ['UNKNOWN', 'NOT_YET_OBSERVED'].includes(finding.verdict))
  const primaryFinding = reached[0]
  const primaryChallenge = challenges.find((item) => item.repository === primaryFinding?.repository)
  const importer = primaryFinding?.imports?.[0]
  const repositoryWord = (count) => count === 1 ? 'repository' : 'repositories'
  const evidenceBasis = `${reached.length} reached · ${declaredOnly.length} declared only · ${notAffected.length} outside range${unknown.length ? ` · ${unknown.length} needs review` : ''}`
  const historyAction = !historical && historyAvailable && onOpenHistory ? { label: 'Open temporal history', onClick: onOpenHistory } : null

  let title = 'No sampled source path reaches the affected package.'
  let detail = `${declaredOnly.length} ${repositoryWord(declaredOnly.length)} retain an affected resolution without a sampled import, while ${notAffected.length} ${repositoryWord(notAffected.length)} ${notAffected.length === 1 ? 'is' : 'are'} outside the advisory range.`
  let action = null
  if (historical) {
    title = 'This is a dated reconstruction.'
    detail = 'The report shows what was evidenced at the selected date. Current remediation proof is available from the present-day case.'
    action = onOpenHistory ? { label: 'Open history', onClick: onOpenHistory } : null
  } else if (unknown.length) {
    title = `${unknown.length} ${repositoryWord(unknown.length)} need more evidence.`
    detail = 'Recoil will not turn an incomplete source sample into a reachability or remediation claim.'
  } else if (primaryFinding && primaryChallenge?.status === 'FIX_SURVIVES') {
    const repository = repositoryName(primaryFinding.repository)
    const location = importer ? `${importer.path}${importer.line ? `:${importer.line}` : ''}` : 'a sampled source file'
    title = `Upgrade ${packageName || primaryFinding.packageName || 'the package'} to ${primaryChallenge.proposedVersion} in ${repository}.`
    detail = `${packageName || primaryFinding.packageName || 'The affected package'}@${primaryFinding.resolvedVersion || 'the observed version'} is imported at ${location}. The proposed version is outside the advisory range.`
    action = onInspectProof ? { label: 'Inspect fix proof', onClick: onInspectProof } : null
  } else if (reached.length) {
    title = `${reached.length} reachable path${reached.length === 1 ? '' : 's'} need review.`
    detail = 'A sampled source import reaches an affected version, but the available records do not prove a surviving fixed-version path yet.'
  }

  return <section className={`case-decision-callout ${historical ? 'case-decision-callout-historical' : ''}`} aria-label="Case decision">
    <div className="case-decision-label"><span className="section-kicker">Decision</span><span>from collected evidence</span></div>
    <div className="case-decision-copy"><h2>{title}</h2><p>{detail}</p></div>
    <div className="case-decision-meta"><span>Evidence basis</span><strong>{evidenceBasis}</strong>{action && <button type="button" onClick={action.onClick}>{action.label}<ArrowUpRight size={13} /></button>}{historyAction && <button className="case-history-action" type="button" onClick={historyAction.onClick}>{historyAction.label}<Clock3 size={13} /></button>}</div>
  </section>
}

function CaseConclusion({ report, findings, summary, historical, hydra }) {
  const imports = findings.reduce((total, finding) => total + (finding.imports?.length || 0), 0)
  const challenge = report?.challenge || []
  const verified = challenge.filter((item) => item.status === 'FIX_SURVIVES').length
  const alreadySafe = challenge.filter((item) => item.status === 'ALREADY_SAFE').length
  const noReachablePath = challenge.filter((item) => item.status === 'NO_REACHABLE_PATH').length
  const history = historical ? `reconstructed ${report?.rewind?.asOf?.slice(0, 10) || 'historical date'}` : summary.exposureDays != null ? `${summary.exposureDays.toLocaleString()} days before disclosure` : 'not dated'
  const memory = report?.rewind?.memory
  const hydraPending = hydra?.indexingPending === true
  const memoryLabel = memory?.status === 'recalled'
    ? `${memory.datedChunkCount || 0} dated fact${memory.datedChunkCount === 1 ? '' : 's'} recalled${hydraPending ? ' · case indexing' : hydra?.status === 'persisted' ? ' · stored' : hydra?.status === 'queued' ? ' · write unconfirmed' : ''}`
    : memory?.status === 'queued'
      ? 'indexing in HydraDB'
      : 'not available'
  const remediation = historical
    ? 'current evidence'
    : [verified ? `${verified} fix verified` : null, alreadySafe ? `${alreadySafe} already safe` : null, noReachablePath ? `${noReachablePath} no reachable path` : null].filter(Boolean).join(' · ') || 'review required'
  return <section className="case-conclusion" aria-label="Case decision">
    <div className="case-conclusion-copy"><h2>Why this verdict holds</h2><p>{historical ? 'This is a dated reconstruction. The current report keeps reachability, timing, and remediation as separate evidence rather than collapsing them into one score.' : `Recoil compared ${report?.package || 'the affected package'} across the supplied repositories. A lockfile entry becomes a reachable path only when a sampled source import supports it.`}</p></div>
    <dl className="case-conclusion-facts"><div><dt>Reachability</dt><dd>{imports} sampled import{imports === 1 ? '' : 's'}</dd></div><div><dt>History</dt><dd>{history}</dd></div><div><dt>Remediation</dt><dd>{remediation}</dd></div><div><dt>Memory</dt><dd>{memoryLabel}</dd></div></dl>
  </section>
}

function traceProofForPart(part, finding) {
  const proofs = finding?.proof || []
  const normalizedPart = String(part || '').toLowerCase()
  const direct = proofs.find((item) => String(item.label || '').toLowerCase() === normalizedPart)
  if (direct) return direct
  return proofs.find((item) => {
    const label = String(item.label || '').toLowerCase()
    return label.includes(normalizedPart) || normalizedPart.includes(label)
  }) || null
}

function traceSourceForPart(part, finding) {
  const proof = traceProofForPart(part, finding)
  if (proof?.source) return proof.source
  if (/(?:lock|package\.json|cargo\.toml|cargo\.lock)/i.test(part)) return (finding?.evidenceSources || []).find((source) => /(?:lock|package\.json|cargo\.toml|cargo\.lock)/i.test(source)) || finding?.evidenceSources?.[0]
  return null
}

function traceKind(part, index, finding) {
  if (index === 0) return 'advisory'
  if (part === finding?.repository) return 'repository'
  if (/(?:lock|package\.json|cargo\.toml|cargo\.lock)/i.test(part)) return 'lockfile'
  if (part.startsWith('symbol:')) return 'symbol'
  if (finding?.imports?.some((item) => item.path === part)) return 'source'
  if (part.includes('@')) return 'resolved'
  return 'evidence'
}

function EvidenceTrace({ finding, challenge, historical, onInspectProof }) {
  if (!finding) return null
  const parts = findingParts(finding)
  const title = finding.verdict === 'REACHED'
    ? 'A source-backed route exists'
    : finding.verdict === 'DECLARED_ONLY'
      ? 'Present in the lockfile; no import observed'
      : finding.verdict === 'NOT_AFFECTED'
        ? 'The resolved version is outside the affected range'
        : 'The route needs review'
  const detail = finding.reason || 'The available public evidence does not support a stronger conclusion.'
  const fixTitle = historical
    ? 'Current fix proof is hidden in this view'
    : challenge?.status === 'FIX_SURVIVES'
      ? `${finding.packageName} ${finding.resolvedVersion || 'current'} → ${challenge.proposedVersion}`
      : challenge?.status === 'ALREADY_SAFE'
        ? 'No version change required'
        : challenge?.status === 'NO_REACHABLE_PATH'
          ? `Defense-in-depth update to ${challenge.proposedVersion || 'a fixed version'}`
          : challenge?.status === 'MANIFEST_CHANGE_REQUIRED'
            ? `Manifest change required for ${challenge.proposedVersion}`
            : 'No fix is proven yet'
  const fixDetail = historical
    ? 'Return to Current evidence to inspect remediation against the present lockfile.'
    : challenge?.detail || 'The advisory did not provide enough evidence for a fix proof.'
  const verified = challenge?.status === 'FIX_SURVIVES' || challenge?.status === 'ALREADY_SAFE'
  return <section className="evidence-trace" aria-label="Source-backed evidence trace">
    <div className="evidence-trace-heading"><div><span className="section-kicker">Selected route</span><h2>{title}</h2><p>{detail}</p></div><Verdict value={finding.verdict} /></div>
    <div className="trace-path" aria-label="Observed evidence hops">
      {parts.map((part, index) => {
        const source = traceSourceForPart(part, finding)
        const kind = traceKind(part, index, finding)
        return <div className="trace-hop-wrap" key={`${part}-${index}`}>
          <article className={`trace-hop trace-hop-${kind}`}>
            <span className="trace-hop-index">0{index + 1}</span>
            <span className="trace-hop-kind">{kind}</span>
            <strong>{shorten(routeDisplayPart(part, finding), 33)}</strong>
            {source ? <SourceLink href={source} /> : <span className="trace-source-missing">not collected</span>}
          </article>
          {index < parts.length - 1 && <span className="trace-arrow" aria-hidden="true">→</span>}
        </div>
      })}
    </div>
    <div className="trace-defense"><div><span className="section-kicker">Fix check</span><strong>{fixTitle}</strong><p>{fixDetail}</p></div><div className="trace-defense-actions"><span className={`trace-fix-status ${verified ? 'is-verified' : ''}`}>{verified ? <Check size={13} /> : <CircleAlert size={13} />}{verified ? 'verified' : historical ? 'historical view' : 'review required'}</span>{!historical && <button className="case-proof-link" type="button" onClick={onInspectProof}>Open fix details <ArrowUpRight size={13} /></button>}</div></div>
  </section>
}

function CaseNavigator({ finding, activeTab, onTabChange }) {
  const tabs = [{ id: 'graph', label: 'Evidence' }, { id: 'proof', label: 'Fix proof' }, { id: 'history', label: 'History' }, { id: 'audit', label: 'Audit' }]
  return <nav className="case-navigator" aria-label="Case views">
    <div className="case-navigator-selection">{finding && <><span>Selected route</span><strong>{repositoryName(finding.repository)}</strong><Verdict value={finding.verdict} compact /></>}</div>
    <div className="case-navigator-links" role="tablist" aria-label="Case views">
      {tabs.map((tab) => <button key={tab.id} id={`case-tab-${tab.id}`} type="button" role="tab" aria-controls="case-tab-panel" aria-selected={activeTab === tab.id} tabIndex={activeTab === tab.id ? 0 : -1} className={activeTab === tab.id ? 'active' : ''} onClick={() => onTabChange(tab.id)}>{tab.label}</button>)}
    </div>
  </nav>
}

function FinalReport({ report, hydra, evidenceStatus, onRewind }) {
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [selectedNodeId, setSelectedNodeId] = useState(null)
  const [activeTab, setActiveTab] = useState('graph')
  // A freshly built report uses `now` as its requested rewind timestamp while
  // the collectors finish a few milliseconds earlier. That is still the
  // current report. Only an as-of date before the collected evidence should
  // enter the historical state and hide current remediation proof.
  const rewindAt = report?.rewind?.asOf ? new Date(report.rewind.asOf).getTime() : NaN
  const currentAt = report?.rewind?.currentAsOf ? new Date(report.rewind.currentAsOf).getTime() : NaN
  const historical = Number.isFinite(rewindAt) && Number.isFinite(currentAt) && rewindAt < currentAt - 1000
  const findings = historical ? report?.rewind?.findings || report?.repositories || [] : report?.repositories || []
  const selectedFinding = findings[selectedIndex] || findings[0]
  const challenge = historical ? null : report?.challenge?.find((item) => item.repository === selectedFinding?.repository)
  const summary = historical ? summarizeFindings(findings) : report?.summary || {}
  const recordingReady = report?.evidenceQuality?.readyForRecording
  const total = summary.totalRepositories || findings.length
  const historicalDate = report?.rewind?.asOf?.slice(0, 10)
  const reachedPhrase = summary.reached === 1 ? 'repository reaches' : 'repositories reach'
  const headline = historical
    ? summary.unknown ? `${summary.unknown} of ${total} repositories were not yet evidenced by ${historicalDate}.` : summary.reached ? `${summary.reached} of ${total} repositories still reached sampled code by ${historicalDate}.` : 'No repository reached sampled code at this date.'
    : summary.unknown ? `${summary.unknown} of ${total} repositories need evidence.` : summary.reached ? `${summary.reached} of ${total} ${reachedPhrase} sampled code.` : total ? 'No repository reaches sampled code.' : 'No repository was checked.'
  const summaryLine = report?.advisory?.summary ? `${report.advisory.summary} · ${report.package || 'package identity unavailable'}` : `The report compares ${report.package || 'the affected package'} across the collected repositories.`
  const earliestReached = findings.filter((finding) => finding.verdict === 'REACHED' && finding.pathObservedAt).sort((left, right) => new Date(left.pathObservedAt) - new Date(right.pathObservedAt))[0]
  const primaryReachIndex = findings.findIndex((finding) => finding.verdict === 'REACHED')
  const inspectProof = (index = primaryReachIndex >= 0 ? primaryReachIndex : selectedIndex) => {
    if (index >= 0) setSelectedIndex(index)
    setActiveTab('proof')
    window.requestAnimationFrame(() => document.getElementById('case-proof')?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
  }
  const openHistory = () => {
    setActiveTab('history')
    window.requestAnimationFrame(() => document.getElementById('case-history')?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
  }
  const changeTab = (tab) => {
    setActiveTab(tab)
    window.requestAnimationFrame(() => document.getElementById('case-tab-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
  }
  return <main className="case-page">
    <section className={`case-hero ${historical ? 'case-hero-historical' : ''}`}><div><span className="section-kicker">{historical ? 'Historical evidence' : 'Evidence report'}</span><h1>{headline}</h1><div className="case-advisory"><strong>{report?.advisory?.id || 'Advisory unavailable'}</strong><span>{summaryLine}</span></div><p>{historical ? `This is the evidence graph rebuilt as of ${historicalDate}. Current remediation proof is hidden until you return to the present.` : summary.unknown ? 'The available records do not support a complete verdict yet.' : 'The graph separates a vulnerable package from a package that actually reaches sampled code.'}</p>{earliestReached && <div className="case-temporal-signal"><Clock3 size={15} /><span><strong>Path first observed {earliestReached.pathObservedAt.slice(0, 10)}</strong><small>{earliestReached.exposureDays != null ? `${earliestReached.exposureDays} days before disclosure` : 'dated repository evidence'}</small></span></div>}</div><div className="case-actions"><span className={`case-state ${recordingReady ? 'case-state-ready' : ''}`}><StatusIcon status={recordingReady ? 'complete' : 'working'} /> {recordingReady ? 'Evidence complete' : 'Review required'}</span><ReceiptLink /></div></section>
    <section className="case-summary"><div><strong>{summary.reached || 0}</strong><span>reached code</span></div><div><strong>{summary.declaredOnly || 0}</strong><span>declared only</span></div><div><strong>{summary.notAffected || 0}</strong><span>outside affected range</span></div><div><strong>{historical ? '—' : summary.fixSurvives || 0}</strong><span>{historical ? 'fix proof is current' : summary.fixSurvives === 1 ? 'fix verified' : 'fixes verified'}</span></div></section>
    <CaseDecisionCallout findings={findings} challenges={historical ? [] : report?.challenge || []} packageName={report?.package} historical={historical} onInspectProof={() => inspectProof()} onOpenHistory={openHistory} historyAvailable={Boolean(report?.rewind?.beforeAdvisory)} />
    <CaseNavigator finding={selectedFinding} activeTab={activeTab} onTabChange={changeTab} />
    <div className="case-tab-panel" id="case-tab-panel" role="tabpanel" aria-labelledby={`case-tab-${activeTab}`}>
      {activeTab === 'graph' && <><div className="case-workspace" id="case-graph"><EvidenceMap report={{ ...report, graph: historical ? report?.rewind?.graph || { nodes: [], edges: [] } : report?.graph }} selectedFinding={selectedFinding} onSelectFinding={setSelectedIndex} onSelectNode={setSelectedNodeId} selectedNodeId={selectedNodeId} /><RouteList findings={findings} selectedIndex={selectedIndex} onSelect={(index) => { setSelectedIndex(index); setSelectedNodeId(null) }} challenges={historical ? [] : report?.challenge || []} correlations={report?.crossRepositoryCorrelations || []} historical={historical} onInspectProof={() => inspectProof(selectedIndex)} /></div><EvidenceTrace finding={selectedFinding} challenge={challenge} historical={historical} onInspectProof={() => inspectProof(selectedIndex)} /></>}
      {activeTab === 'proof' && <RouteProof finding={selectedFinding} challenge={challenge} />}
      {activeTab === 'history' && <><CaseChronology finding={selectedFinding} report={report} challenge={challenge} historical={historical} onOpenHistory={historical ? () => onRewind(report?.rewind?.currentAsOf) : null} /><TemporalProof report={report} onRewind={onRewind} /></>}
      {activeTab === 'audit' && <IntegrityDetails report={report} hydra={hydra} evidenceStatus={evidenceStatus} />}
    </div>
    <CaseConclusion report={report} findings={findings} summary={summary} historical={historical} hydra={hydra} />
  </main>
}

function RunningView({ snapshot }) {
  const investigation = snapshot?.investigation
  const events = investigation?.events || []
  const finalizing = investigation?.status === 'finalizing'
  const activity = currentInvestigationActivity(events, investigation?.status)
  const query = snapshot?.scenario?.query || investigation?.query || ''
  const advisory = query.match(/(?:GHSA|CVE)-[A-Z0-9-]+/i)?.[0] || query.split(/\s+/).find(Boolean) || 'public evidence'
  const repositoryCount = (query.match(/https?:\/\/github\.com\/[^\s]+/gi) || []).length
  const graph = snapshot?.graph?.nodes?.length ? snapshot.graph : investigation?.graph || investigation?.evidence?.graph || { nodes: [], edges: [] }
  const graphReport = { graph, repositories: investigation?.report?.repositories || [] }
  const progress = snapshot?.graphProgress || investigation?.graphProgress
  const progressLabel = progress?.totalRepositories ? `${progress.completedRepositories || 0} of ${progress.totalRepositories} repositories mapped` : 'Preparing the case'
  const activityTitle = activity?.title || (finalizing ? 'Storing evidence history' : 'Collecting public evidence')
  const activityDetail = activity?.detail || (finalizing ? 'The observed graph is complete. Recoil is writing dated history and recalling related context.' : 'Recoil adds only relationships supported by public evidence.')
  return <main className="live-page"><div className="live-heading"><div><span className="section-kicker">Live investigation</span><div className="live-subject"><strong>{advisory}</strong><span>{repositoryCount ? `against ${repositoryCount} public repositor${repositoryCount === 1 ? 'y' : 'ies'}` : 'public records only'}</span></div><h1 aria-live="polite" aria-atomic="true">{activityTitle}</h1><p aria-live="polite" aria-atomic="true">{progressLabel}. {activityDetail}</p></div><span className="live-safety">No install · no execution</span></div><EvidencePhaseRail events={events} live investigationStatus={investigation?.status} investigationStep={investigation?.step} /><div className="live-workspace"><EventStream events={events} investigationStatus={investigation?.status} query={query} /><EvidenceMap report={graphReport} events={events} live graphProgress={progress} /></div></main>
}

function App() {
  const [input, setInput] = useState(DEFAULT_INPUT)
  const [snapshot, setSnapshot] = useState(null)
  const [report, setReport] = useState(null)
  const [hydra, setHydra] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [theme, toggleTheme] = useTheme()
  const investigation = snapshot?.investigation

  useEffect(() => {
    let active = true
    api(`/api/scenarios/${SCENARIO_ID}`).then((next) => { if (active) setSnapshot(next) }).catch((cause) => { if (active) setError(`Recoil API unavailable. Start the app with npm run start. ${cause.message}`) })
    return () => { active = false }
  }, [])

  useEffect(() => {
    const activeStatus = snapshot?.investigation?.status
    const hydraPending = snapshot?.investigation?.hydra?.indexingPending === true
    const shouldPoll = busy || ['running', 'finalizing'].includes(activeStatus) || activeStatus === 'complete' && hydraPending
    if (!shouldPoll) return undefined
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
          const nextHydraPending = next.investigation?.hydra?.indexingPending === true
          if (next.investigation.status === 'failed' || !nextHydraPending) return
        }
      } catch (cause) {
        if (!cancelled) { setError(cause.message); setBusy(false) }
        return
      }
      if (!cancelled) window.setTimeout(poll, 650)
    }
    const timer = window.setTimeout(poll, 100)
    return () => { cancelled = true; window.clearTimeout(timer) }
  }, [busy, snapshot?.investigation?.status])

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

  if (!hasInvestigation) return <Landing value={input} setValue={setInput} onSubmit={investigate} busy={busy} error={error} theme={theme} onToggleTheme={toggleTheme} />
  return <div className="product-shell"><InvestigationHeader investigation={investigation} hydra={hydra || investigation?.hydra} onNewCase={newInvestigation} theme={theme} onToggleTheme={toggleTheme} />{isComplete ? <FinalReport report={activeReport} hydra={hydra || investigation?.hydra} evidenceStatus={investigation?.evidence?.status || 'unknown'} onRewind={rewind} /> : <RunningView snapshot={snapshot} />}{error && <div className="floating-error"><CircleAlert size={14} /> {error}</div>}</div>
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
