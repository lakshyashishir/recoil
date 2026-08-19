import { Component, useEffect, useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { ArrowUpRight, Check, CircleAlert, CircleCheck, Clock3, Database, Download, ExternalLink, FileCode2, LoaderCircle, PackageCheck, RotateCcw, ShieldCheck, Waypoints } from 'lucide-react'
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

function Landing({ value, setValue, onSubmit, busy, error }) {
  return <main className="landing-page">
    <header className="landing-header">
      <div className="brand"><span className="brand-mark" /> RECOIL</div>
      <span className="brand-note">Evidence path analysis</span>
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

function InvestigationHeader({ investigation, hydra, onNewCase }) {
  const report = investigation?.report
  const id = report?.advisory?.id || investigation?.evidence?.target?.advisoryId || 'investigation'
  const state = investigation?.status === 'complete' ? 'Complete' : investigation?.status === 'failed' ? 'Incomplete' : 'Reading'
  const hydraReadFailed = hydra?.recall?.status === 'failed'
  const hydraLabel = hydraReadFailed ? 'HydraDB read failed' : hydra?.status === 'persisted' ? 'HydraDB connected' : hydra?.status === 'queued' ? 'HydraDB indexing' : hydra?.status === 'failed' ? 'HydraDB unavailable' : 'Local evidence record'
  return <header className="product-header">
    <div className="brand"><span className="brand-mark" /> RECOIL</div>
    <div className="header-case"><strong>{id}</strong><span>{report?.package ? `${report.package} · ${state.toLowerCase()}` : state}</span></div>
    <div className="header-actions"><div className="header-status"><span className={`connection-mark ${hydraReadFailed || hydra?.status === 'failed' ? 'is-failed' : hydra?.status === 'persisted' ? 'is-live' : ''}`} /> {hydraLabel}</div>{onNewCase && <button className="header-new-case" type="button" onClick={onNewCase}>New case <RotateCcw size={13} /></button>}</div>
  </header>
}

function EventStream({ events = [] }) {
  const current = events.find((event) => event.status === 'working')
  return <section className="event-journal" aria-label="Investigation progress">
    <div className="journal-heading"><div><span className="section-kicker">Progress</span><h2>{current?.title || 'Evidence is ready'}</h2></div><span className="journal-state">{current ? 'working' : 'up to date'}</span></div>
    <div className="event-list">
      {events.map((event) => <article className={`event-row event-${event.status}`} key={event.id || event.key}>
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

function EvidencePhaseRail({ events = [], live = false }) {
  const phases = [
    { key: 'records', label: 'Read records', detail: 'OSV, registry, repositories', keys: ['public-records', 'repository:', 'registry'], icon: <SearchIcon /> },
    { key: 'route', label: 'Trace routes', detail: 'Lockfiles and source imports', keys: ['classification', 'proving-paths'], icon: <Waypoints size={16} /> },
    { key: 'proof', label: 'Prove the fix', detail: 'Range and residual path', keys: ['fix-plan'], icon: <PackageCheck size={16} /> },
    { key: 'memory', label: 'Store history', detail: 'HydraDB temporal record', keys: ['hydra'], icon: <Database size={16} /> },
  ]
  return <div className={`phase-rail ${live ? 'phase-rail-live' : ''}`} aria-label="Investigation stages">
    {phases.map((phase, index) => {
      const status = eventStatus(events, phase.keys)
      return <div className={`phase ${status}`} key={phase.key}>
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

function EvidenceMap({ report, selectedFinding, onSelectFinding, events = [], live = false, graphProgress = null }) {
  const graph = report?.graph || { nodes: [], edges: [] }
  const layout = useMemo(() => graphLayout(graph, selectedFinding), [graph, selectedFinding])
  const selected = layout.selected
  const selectedEdges = new Set(layout.edges.filter(([from, to]) => selected.has(from) && selected.has(to)).map(([from, to]) => `${from}>${to}`))
  const layerLabels = [{ label: 'Advisory', type: 'advisory' }, { label: 'Dependency', type: 'package' }, { label: 'Repository', type: 'repository' }, { label: 'Source', type: 'code' }]
  if (!layout.nodes.length) {
    const current = events.find((event) => event.status === 'working')
    return <section className="evidence-map map-empty" aria-label="Evidence map">
      <div className="map-heading"><div><span className="section-kicker">Evidence map</span><h2>{live ? 'Building the route' : 'No graph to show'}</h2></div><span className="map-count">{live ? `${graphProgress?.completedRepositories || 0}/${graphProgress?.totalRepositories || 0} repositories` : '0 nodes'}</span></div>
      <div className="map-empty-body"><div className="empty-route"><span /><i /><span /><i /><span /></div><strong>{current?.title || 'The evidence map appears here'}</strong><p>{current?.detail || 'Start an investigation to draw the advisory, dependency, repository, and source relationships.'}</p></div>
    </section>
  }
  return <section className="evidence-map" aria-label="Observed evidence map">
    <div className="map-heading"><div><span className="section-kicker">Observed graph</span><h2>{live ? 'Evidence arriving' : 'Follow the path to code'}</h2></div><span className="map-count">{live && graphProgress ? `${graphProgress.completedRepositories}/${graphProgress.totalRepositories} repositories · ` : ''}{layout.nodes.length} nodes · {layout.edges.length} edges</span></div>
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
            const selectable = findingIndex >= 0 && onSelectFinding
            const selectNode = () => { if (selectable) onSelectFinding(findingIndex) }
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
    </div>
  </section>
}

function RouteList({ findings, selectedIndex, onSelect }) {
  const reached = findings.filter((finding) => finding.verdict === 'REACHED').length
  const selected = findings[selectedIndex] || findings[0]
  return <aside className="route-panel">
    <div className="route-panel-heading"><div><span className="section-kicker">Repository comparison</span><h2>What the evidence says</h2></div><span>{findings.length} checked</span></div>
    <p className="route-panel-note">Select a repository to inspect the exact path behind its decision.</p>
    {reached > 0 && <div className="route-panel-callout"><CircleAlert size={15} /><span>{reached} repository{reached === 1 ? '' : 'ies'} reach the affected code in sampled source.</span></div>}
    {selected && <div className="route-selected" aria-live="polite">
      <div className="route-selected-heading"><span>Selected repository</span><Verdict value={selected.verdict} compact /></div>
      <strong>{repositoryName(selected.repository)}</strong>
      <p>{selected.reason || 'The available public evidence does not support a stronger conclusion.'}</p>
      <dl><div><dt>Resolved</dt><dd>{selected.resolvedVersions?.length > 1 ? selected.resolvedVersions.join(', ') : selected.resolvedVersion || 'not resolved'}</dd></div><div><dt>Source imports</dt><dd>{selected.imports?.length || 0}</dd></div></dl>
      <button className="route-selected-action" type="button" onClick={() => document.getElementById('case-proof')?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' })}>Inspect proof <ArrowUpRight size={13} /></button>
    </div>}
    <div className="route-list">
      {findings.map((finding, index) => <button className={`route-item ${selectedIndex === index ? 'route-item-selected' : ''}`} key={finding.repository || index} type="button" onClick={() => onSelect(index)}>
        <span className="route-index">0{index + 1}</span>
        <span className="route-item-copy"><strong>{repositoryName(finding.repository)}</strong><small>{finding.packageName || 'package unresolved'} · {finding.resolvedVersions?.length > 1 ? finding.resolvedVersions.join(', ') : finding.resolvedVersion || 'not resolved'}</small><em>{finding.verdict === 'REACHED' ? `${finding.imports?.length || 0} sampled import${finding.imports?.length === 1 ? '' : 's'} found` : finding.verdict === 'DECLARED_ONLY' ? 'present in lockfile; no sampled import' : finding.verdict === 'NOT_AFFECTED' ? 'resolved outside affected range' : 'evidence needs review'}</em></span>
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

function ImportProof({ finding }) {
  const importer = finding?.imports?.[0]
  if (!importer) return <div className="import-proof import-proof-empty"><FileCode2 size={16} /><div><span className="section-kicker">Source check</span><strong>No sampled import</strong><p>{finding?.verdict === 'DECLARED_ONLY' ? 'The package is present in the lockfile, but no sampled source file imports it.' : finding?.sourceBound || 'The source evidence does not support a stronger conclusion.'}</p></div></div>
  return <div className="import-proof"><FileCode2 size={16} /><div><span className="section-kicker">Observed in source</span><strong>{importer.path}{importer.line ? `:${importer.line}` : ''}</strong><code>{importer.snippet || `imports ${importer.specifier || finding.packageName}`}</code><SourceLink href={importer.sourceUrl}>Open source line</SourceLink></div></div>
}

function FixProof({ finding, challenge }) {
  if (!finding || !challenge) return null
  const currentVersion = finding.resolvedVersion || finding.resolvedVersions?.join(', ') || 'unresolved'
  const proposedVersion = challenge.proposedVersion || 'no fixed version'
  const verified = ['FIX_SURVIVES', 'ALREADY_SAFE'].includes(challenge.status)
  const lockfileSource = (finding.evidenceSources || []).find((source) => /(?:lock|package\.json|cargo\.toml|cargo\.lock)/i.test(source)) || finding.evidenceSources?.[0]
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
  const triplets = [...new Map((memory?.graphContext?.triplets || []).map((triplet) => {
    const key = [triplet.source, triplet.predicate, triplet.target].map((value) => String(value || '').trim().toLowerCase()).join('|')
    return [key, triplet]
  })).values()]
  return <section className="temporal-proof" id="case-history">
    <div className="temporal-copy"><span className="section-kicker">HydraDB history</span><h2>See the case at two points in time.</h2><p>The advisory was published {report.advisory?.published?.slice(0, 10) || 'on an unknown date'}. Recoil uses dated lockfile evidence and HydraDB recall to keep the timeline inspectable.</p><div className={`memory-line ${memory?.status === 'recalled' ? '' : 'memory-line-muted'}`}><span className="memory-mark" /> {memory?.status === 'recalled' ? 'Dated context returned from HydraDB.' : memory?.status === 'queued' ? 'Memory is indexing in HydraDB.' : 'HydraDB history is unavailable.'}</div></div>
    <div className="temporal-controls"><button className={beforeActive ? 'active' : ''} onClick={() => onRewind(before)}><Clock3 size={15} /><span>Before disclosure</span><small>{before.slice(0, 10)}</small></button><button className={!beforeActive ? 'active' : ''} onClick={() => onRewind(current)}><ShieldCheck size={15} /><span>Current evidence</span><small>{current?.slice(0, 10) || 'today'}</small></button></div>
    <div className="temporal-stats"><span><strong>{memory?.datedChunkCount || 0}</strong><small>dated facts</small></span><span><strong>{memory?.graphContext?.tripletCount || 0}</strong><small>graph triplets</small></span><span><strong>{memory?.relatedCaseCount || 0}</strong><small>related cases</small></span></div>
    <details className="memory-evidence"><summary>Inspect recalled relationships <span>{triplets.length} returned</span></summary>{triplets.length ? <div className="memory-triplets">{triplets.slice(0, 6).map((triplet, index) => <div className="memory-triplet" key={`${triplet.source}-${triplet.predicate}-${triplet.target}-${index}`}><strong>{triplet.source || 'entity'}</strong><span>{triplet.predicate || 'connected to'}</span><strong>{triplet.target || 'entity'}</strong></div>)}</div> : <p>No graph relationships were returned for this temporal read.</p>}</details>
  </section>
}

function IntegrityDetails({ report, hydra, evidenceStatus }) {
  const quality = report?.evidenceQuality || {}
  const sourceCount = report?.sources?.length || 0
  const graph = report?.graph || { nodes: [], edges: [] }
  return <details className="integrity-details" id="case-audit"><summary>Audit record <span>{quality.readyForRecording ? 'recording-ready' : 'review required'}</span></summary><div className="integrity-grid"><div><strong>{sourceCount}</strong><span>public sources</span></div><div><strong>{graph.nodes.length}</strong><span>observed nodes</span></div><div><strong>{graph.edges.length}</strong><span>observed edges</span></div><div><strong>{hydra?.memoryCount || 0}</strong><span>HydraDB memories</span></div></div><p>{quality.reason || 'Reachability is based on cited lockfile and sampled source imports. It is not a claim of compromise.'}</p><p className="integrity-note">Evidence status: {evidenceStatus}. No package code or exploit payload was executed.</p></details>
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

function CaseConclusion({ report, findings, summary, historical }) {
  const imports = findings.reduce((total, finding) => total + (finding.imports?.length || 0), 0)
  const challenge = report?.challenge || []
  const verified = challenge.filter((item) => item.status === 'FIX_SURVIVES').length
  const alreadySafe = challenge.filter((item) => item.status === 'ALREADY_SAFE').length
  const noReachablePath = challenge.filter((item) => item.status === 'NO_REACHABLE_PATH').length
  const history = historical ? `reconstructed ${report?.rewind?.asOf?.slice(0, 10) || 'historical date'}` : summary.exposureDays != null ? `${summary.exposureDays.toLocaleString()} days before disclosure` : 'not dated'
  const remediation = historical
    ? 'current evidence'
    : [verified ? `${verified} fix verified` : null, alreadySafe ? `${alreadySafe} already safe` : null, noReachablePath ? `${noReachablePath} unreachable` : null].filter(Boolean).join(' · ') || 'review required'
  return <section className="case-conclusion" aria-label="Case decision">
    <div className="case-conclusion-copy"><h2>Why this verdict holds</h2><p>{historical ? 'This is a dated reconstruction. The current report keeps reachability, timing, and remediation as separate evidence rather than collapsing them into one score.' : `Recoil compared ${report?.package || 'the affected package'} across the supplied repositories. A lockfile entry becomes a reachable path only when a sampled source import supports it.`}</p></div>
    <dl className="case-conclusion-facts"><div><dt>Reachability</dt><dd>{imports} sampled import{imports === 1 ? '' : 's'}</dd></div><div><dt>History</dt><dd>{history}</dd></div><div><dt>Remediation</dt><dd>{remediation}</dd></div></dl>
  </section>
}

function CaseNavigator({ finding }) {
  if (!finding) return null
  const jumpTo = (id) => {
    const element = document.getElementById(id)
    if (!element) return
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    element.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'start' })
  }
  return <nav className="case-navigator" aria-label="Case sections">
    <div className="case-navigator-selection"><span>Selected route</span><strong>{repositoryName(finding.repository)}</strong><Verdict value={finding.verdict} compact /></div>
    <div className="case-navigator-links">
      <button type="button" onClick={() => jumpTo('case-graph')}>Graph</button>
      <button type="button" onClick={() => jumpTo('case-proof')}>Proof</button>
      <button type="button" onClick={() => jumpTo('case-history')}>History</button>
      <button type="button" onClick={() => jumpTo('case-audit')}>Audit</button>
    </div>
  </nav>
}

function FinalReport({ report, hydra, evidenceStatus, onRewind }) {
  const [selectedIndex, setSelectedIndex] = useState(0)
  const historical = Boolean(report?.rewind?.asOf && report?.rewind?.currentAsOf && report.rewind.asOf !== report.rewind.currentAsOf)
  const findings = historical ? report?.rewind?.findings || report?.repositories || [] : report?.repositories || []
  const selectedFinding = findings[selectedIndex] || findings[0]
  const challenge = historical ? null : report?.challenge?.find((item) => item.repository === selectedFinding?.repository)
  const summary = historical ? summarizeFindings(findings) : report?.summary || {}
  const recordingReady = report?.evidenceQuality?.readyForRecording
  const total = summary.totalRepositories || findings.length
  const historicalDate = report?.rewind?.asOf?.slice(0, 10)
  const headline = historical
    ? summary.unknown ? `${summary.unknown} of ${total} repositories were not yet evidenced by ${historicalDate}.` : summary.reached ? `${summary.reached} of ${total} repositories still reached sampled code by ${historicalDate}.` : 'No repository reached sampled code at this date.'
    : summary.unknown ? `${summary.unknown} of ${total} repositories need evidence.` : summary.reached ? `${summary.reached} of ${total} repositories reach sampled code.` : total ? 'No repository reaches sampled code.' : 'No repository was checked.'
  const summaryLine = report?.advisory?.summary ? `${report.advisory.summary} · ${report.package || 'package identity unavailable'}` : `The report compares ${report.package || 'the affected package'} across the collected repositories.`
  const earliestReached = findings.filter((finding) => finding.verdict === 'REACHED' && finding.pathObservedAt).sort((left, right) => new Date(left.pathObservedAt) - new Date(right.pathObservedAt))[0]
  return <main className="case-page">
    <section className={`case-hero ${historical ? 'case-hero-historical' : ''}`}><div><span className="section-kicker">{historical ? 'Historical evidence' : 'Evidence report'}</span><h1>{headline}</h1><div className="case-advisory"><strong>{report?.advisory?.id || 'Advisory unavailable'}</strong><span>{summaryLine}</span></div><p>{historical ? `This is the evidence graph rebuilt as of ${historicalDate}. Current remediation proof is hidden until you return to the present.` : summary.unknown ? 'The available records do not support a complete verdict yet.' : 'The graph separates a vulnerable package from a package that actually reaches sampled code.'}</p>{earliestReached && <div className="case-temporal-signal"><Clock3 size={15} /><span><strong>Path first observed {earliestReached.pathObservedAt.slice(0, 10)}</strong><small>{earliestReached.exposureDays != null ? `${earliestReached.exposureDays} days before disclosure` : 'dated repository evidence'}</small></span></div>}</div><div className="case-actions"><span className={`case-state ${recordingReady ? 'case-state-ready' : ''}`}><StatusIcon status={recordingReady ? 'complete' : 'working'} /> {recordingReady ? 'Evidence complete' : 'Review required'}</span><ReceiptLink /></div></section>
    <section className="case-summary"><div><strong>{summary.reached || 0}</strong><span>reached code</span></div><div><strong>{summary.declaredOnly || 0}</strong><span>declared only</span></div><div><strong>{summary.notAffected || 0}</strong><span>outside affected range</span></div><div><strong>{historical ? '—' : summary.fixSurvives || 0}</strong><span>{historical ? 'fix proof is current' : 'fixes verified'}</span></div></section>
    <CaseConclusion report={report} findings={findings} summary={summary} historical={historical} />
    <CaseNavigator finding={selectedFinding} />
    <div className="case-workspace" id="case-graph"><EvidenceMap report={{ ...report, graph: historical ? report?.rewind?.graph || { nodes: [], edges: [] } : report?.graph }} selectedFinding={selectedFinding} onSelectFinding={setSelectedIndex} /><RouteList findings={findings} selectedIndex={selectedIndex} onSelect={setSelectedIndex} /></div>
    <RouteProof finding={selectedFinding} challenge={challenge} />
    <TemporalProof report={report} onRewind={onRewind} />
    <IntegrityDetails report={report} hydra={hydra} evidenceStatus={evidenceStatus} />
  </main>
}

function RunningView({ snapshot }) {
  const investigation = snapshot?.investigation
  const events = investigation?.events || []
  const graph = snapshot?.graph?.nodes?.length ? snapshot.graph : investigation?.graph || investigation?.evidence?.graph || { nodes: [], edges: [] }
  const graphReport = { graph, repositories: investigation?.report?.repositories || [] }
  const progress = snapshot?.graphProgress || investigation?.graphProgress
  const progressLabel = progress?.totalRepositories ? `${progress.completedRepositories || 0} of ${progress.totalRepositories} repositories mapped` : 'Preparing the case'
  return <main className="live-page"><div className="live-heading"><div><span className="section-kicker">Live investigation</span><h1>Building the proof.</h1><p>{progressLabel}. Recoil adds only relationships supported by public evidence.</p></div><span className="live-safety">No install · no execution</span></div><EvidencePhaseRail events={events} live /><div className="live-workspace"><EventStream events={events} /><EvidenceMap report={graphReport} events={events} live graphProgress={progress} /></div></main>
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
  return <div className="product-shell"><InvestigationHeader investigation={investigation} hydra={hydra || investigation?.hydra} onNewCase={newInvestigation} />{isComplete ? <FinalReport report={activeReport} hydra={hydra || investigation?.hydra} evidenceStatus={investigation?.evidence?.status || 'unknown'} onRewind={rewind} /> : <RunningView snapshot={snapshot} />}{error && <div className="floating-error"><CircleAlert size={14} /> {error}</div>}</div>
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
