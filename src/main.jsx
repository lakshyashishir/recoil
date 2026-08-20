import { Component, useEffect, useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { ArrowUpRight, Check, CircleAlert, CircleCheck, Clock3, Copy, Download, ExternalLink, FileCode2, FileText, LoaderCircle, Moon, PackageCheck, RotateCcw, ShieldCheck, Sun, Waypoints } from 'lucide-react'
import './style.css'

const DEFAULT_SCENARIO_ID = '0017'
const SCENARIO_STORAGE_KEY = 'recoil-case-id'
const LANDING_STORAGE_KEY = 'recoil-new-case'
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

function initialScenarioId() {
  if (typeof window === 'undefined') return DEFAULT_SCENARIO_ID
  return window.localStorage.getItem(SCENARIO_STORAGE_KEY) || DEFAULT_SCENARIO_ID
}

function initialLanding() {
  if (typeof window === 'undefined') return false
  return window.localStorage.getItem(LANDING_STORAGE_KEY) === '1'
}

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
  const advisory = value.match(/(?:GHSA|CVE)-[A-Z0-9-]+/i)?.[0]
  const packageSelector = value.match(/\b(?:npm|cargo):[^\s]+/i)?.[0]
  const repositories = queryRepositories(value)
  const target = advisory || packageSelector
  const ready = Boolean(target && repositories.length)
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
          <div className="input-readiness" aria-live="polite"><span className={target ? 'is-ready' : ''}><i aria-hidden="true" />{target || 'Add an advisory or package selector'}</span><span className={repositories.length ? 'is-ready' : ''}><i aria-hidden="true" />{repositories.length ? `${repositories.length} public repositor${repositories.length === 1 ? 'y' : 'ies'}` : 'Add at least one public GitHub repository'}</span></div>
          <div className="form-footer">
            <span>Public records only</span>
            <button type="submit" disabled={busy || !ready}>{busy ? <><LoaderCircle className="spin" size={15} /> Reading</> : <>Investigate <ArrowUpRight size={15} /></>}</button>
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
  const id = report?.advisory?.id || investigation?.evidence?.target?.advisoryId || investigation?.query?.match(/(?:GHSA|CVE)-[A-Z0-9-]+/i)?.[0] || 'investigation'
  const state = investigation?.status === 'complete' ? 'Complete' : investigation?.status === 'failed' ? 'Incomplete' : investigation?.status === 'finalizing' ? 'Storing history' : 'Reading'
  const hydraReadFailed = hydra?.recall?.status === 'failed'
  const hydraRecalled = hydra?.recall?.status === 'recalled'
  const hydraPending = hydra?.indexingPending === true
  const hydraWriteUnconfirmed = hydra?.status === 'queued' || Boolean(hydra?.indexingError)
  const hydraInFlight = hydraPending || investigation?.status === 'finalizing'
  const hydraLabel = hydraReadFailed ? 'HydraDB read failed' : hydraRecalled ? `HydraDB context recalled${hydraInFlight ? ' · indexing' : hydraWriteUnconfirmed ? ' · write unconfirmed' : ''}` : hydraInFlight ? 'HydraDB indexing' : hydra?.status === 'persisted' ? 'HydraDB connected' : hydraWriteUnconfirmed ? 'HydraDB write unconfirmed' : hydra?.status === 'failed' ? 'HydraDB unavailable' : 'Local evidence record'
  const hydraLive = hydra?.status === 'persisted' && !hydraPending && !hydraReadFailed
  return <header className="product-header">
    <div className="brand"><span className="brand-mark" /> RECOIL</div>
    <div className="header-case"><strong>{id}</strong><span>{report?.package ? `${report.package} · ${state.toLowerCase()}` : state}</span></div>
    <div className="header-actions"><div className="header-status" aria-label={hydraLabel} title={hydraLabel}><span className={`connection-mark ${hydraReadFailed || hydra?.status === 'failed' ? 'is-failed' : hydraLive ? 'is-live' : ''}`} /><span className="header-status-full">{hydraLabel}</span><span className="header-status-short">HydraDB</span></div><ThemeToggle theme={theme} onToggle={onToggleTheme} />{onNewCase && <button className="header-new-case" type="button" onClick={onNewCase}>New case <RotateCcw size={13} /></button>}</div>
  </header>
}

function currentInvestigationActivity(events = [], investigationStatus) {
  const working = events.find((event) => event.status === 'working')
  if (working) return working
  if (investigationStatus === 'finalizing') return { title: 'Storing evidence history', detail: 'Writing the dated graph to HydraDB and recalling related context.' }
  if (investigationStatus === 'running') return { title: 'Collecting public evidence', detail: 'Reading advisory, registry, lockfile, and source records.' }
  return null
}

function liveProgressSummary(events = [], investigationStatus, graphProgress = null, report = null) {
  const current = currentInvestigationActivity(events, investigationStatus)
  const graph = events.find((event) => event.graphProgress)?.graph || null
  const nodes = graph?.nodes?.length || 0
  const edges = graph?.edges?.length || 0
  const mapped = graphProgress?.totalRepositories
    ? `${graphProgress.completedRepositories || 0}/${graphProgress.totalRepositories} repositories mapped`
    : nodes || edges
      ? `${nodes} entities · ${edges} relationships`
      : 'Waiting for the first record'

  if (investigationStatus === 'finalizing') {
    return { label: 'Local proof complete', detail: 'The repository classifications are ready. Recoil is confirming the dated HydraDB record.', metric: mapped }
  }
  if (investigationStatus === 'complete' && report?.summary) {
    const summary = report.summary
    const result = `${summary.reached || 0} reached · ${summary.declaredOnly || 0} declared only · ${summary.notAffected || 0} outside range`
    return { label: 'Case ready to inspect', detail: result, metric: mapped }
  }
  if (current) {
    const repository = current.repository ? ` · ${repositoryName(current.repository)}` : ''
    return { label: current.title, detail: `${current.detail || 'Reading public evidence.'}${repository}`, metric: mapped }
  }
  return { label: 'Preparing the case', detail: 'Recoil adds only relationships supported by public evidence.', metric: mapped }
}

function liveStageStatus(stage, events = [], investigationStatus) {
  const relevant = events.filter((event) => stage.keys.some((key) => key === event.key || key.endsWith(':') && event.key?.startsWith(key)))
  if (relevant.some((event) => event.status === 'failed')) return 'failed'
  if (relevant.some((event) => event.status === 'working')) return 'working'
  if (stage.id === 'memory' && relevant.some((event) => /unconfirmed|follow-up failed|not persisted/i.test(`${event.title || ''} ${event.detail || ''}`))) return 'review'
  if (relevant.some((event) => ['complete', 'persisted'].includes(event.status))) return 'complete'
  if (stage.id === 'records' && investigationStatus === 'running' && events.length === 0) return 'working'
  if (stage.id === 'memory' && investigationStatus === 'finalizing') return 'working'
  if (stage.id === 'memory' && investigationStatus === 'complete') return 'complete'
  return 'waiting'
}

function LiveStageRail({ events = [], investigationStatus }) {
  const stages = [
    { id: 'records', label: 'Read records', detail: 'advisory · registry · repositories', keys: ['public-records', 'registry', 'repository:'] },
    { id: 'paths', label: 'Prove paths', detail: 'lockfile → source imports', keys: ['advisory-scope', 'proving-paths', 'classification'] },
    { id: 'fix', label: 'Check the fix', detail: 'fixed version · semver challenge', keys: ['fix-plan'] },
    { id: 'memory', label: 'Store history', detail: 'dated graph · HydraDB recall', keys: ['hydra', 'complete'] },
  ]
  const statuses = stages.map((stage) => liveStageStatus(stage, events, investigationStatus))
  const completed = statuses.filter((status) => status === 'complete').length
  const activeIndex = statuses.findIndex((status) => ['working', 'review', 'failed'].includes(status))
  const currentIndex = activeIndex >= 0 ? activeIndex : Math.min(completed, stages.length - 1)
  return <section className="live-stage-rail" aria-label="Investigation stages"><div className="live-stage-rail-heading"><span>Investigation path</span><span>{investigationStatus === 'complete' ? 'complete' : `step ${Math.min(currentIndex + 1, stages.length)} of ${stages.length}`}</span></div><ol>{stages.map((stage, index) => { const status = statuses[index]; const detail = status === 'review' ? 'accepted · indexing unconfirmed' : status === 'failed' ? 'provider follow-up failed' : stage.detail; const iconStatus = status === 'waiting' ? 'idle' : status === 'review' ? 'failed' : status; return <li className={`live-stage live-stage-${status}`} key={stage.id}><span className="live-stage-marker"><StatusIcon status={iconStatus} /></span><span className="live-stage-copy"><strong>{stage.label}</strong><small>{detail}</small></span></li> })}</ol></section>
}

function LiveRepositoryProgress({ query, events = [], report = null, graphProgress = null }) {
  const repositories = queryRepositories(query)
  if (!repositories.length) return null
  const total = Number(graphProgress?.totalRepositories || repositories.length)
  const completed = Math.min(total, Math.max(0, Number(graphProgress?.completedRepositories || 0)))
  const percentage = total ? Math.round((completed / total) * 100) : 0
  const latestByRepository = new Map()
  events.filter((event) => event.repository).forEach((event) => latestByRepository.set(repositoryKey(event.repository), event))
  return <section className="live-repositories" aria-label="Repository collection status">
    <div className="live-repositories-heading"><span>Repositories</span><span>{completed} of {total} complete</span></div>
    <div className="live-repository-progress" role="progressbar" aria-label="Repositories mapped" aria-valuemin="0" aria-valuemax={total} aria-valuenow={completed}><span style={{ width: `${percentage}%` }} /></div>
    <div className="live-repository-list">
      {repositories.map((repository, index) => {
        const event = latestByRepository.get(repositoryKey(repository))
        const finding = report?.repositories?.find((item) => repositoryKey(item.repository) === repositoryKey(repository))
        const status = finding ? 'complete' : event?.status || 'waiting'
        const statusLabel = finding ? String(finding.verdict || 'classified').replaceAll('_', ' ').toLowerCase() : status === 'complete' ? 'read' : status === 'working' ? 'reading' : status === 'failed' ? 'failed' : 'queued'
        const detail = finding
          ? routeEvidenceLabel(finding)
          : event?.detail || 'Waiting for the public lockfile and source sample.'
        return <div className={`live-repository live-repository-${status} ${finding ? `live-repository-verdict-${String(finding.verdict || 'UNKNOWN').toLowerCase()}` : ''}`} key={repository}>
          <span className="live-repository-index">0{index + 1}</span>
          <div><strong>{repository}</strong><small>{detail}</small></div>
          <span className="live-repository-status">{statusLabel}</span>
        </div>
      })}
    </div>
  </section>
}

function EventStream({ events = [], investigationStatus, query, graphProgress = null, report = null }) {
  const [expanded, setExpanded] = useState(false)
  const eventCurrent = events.find((event) => event.status === 'working')
  const current = currentInvestigationActivity(events, investigationStatus)
  const active = Boolean(eventCurrent || ['running', 'finalizing'].includes(investigationStatus))
  const readout = liveProgressSummary(events, investigationStatus, graphProgress, report)
  const recentKeys = new Set(events.slice(-5).map((event) => event.key))
  const visibleEvents = expanded ? events : events.filter((event) => recentKeys.has(event.key) || event.key === eventCurrent?.key)
  return <section className="event-journal" aria-label="Investigation progress" aria-busy={active}>
    <div className="journal-heading"><div><span className="section-kicker">What is happening</span><h2 aria-live="polite" aria-atomic="true">{current?.title || 'Evidence is ready'}</h2></div><span className="journal-state" role="status" aria-live="polite">{active ? 'working' : 'up to date'}</span></div>
    <div className="journal-readout" aria-live="polite"><div><span>Current read</span><strong>{readout.label}</strong><p>{readout.detail}</p></div><span className="journal-readout-metric">{readout.metric}</span></div>
    <LiveRepositoryProgress query={query} events={events} report={report} graphProgress={graphProgress} />
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

function LiveEvidenceCheckpoint({ report, hydra, onOpenReport }) {
  if (!report) return null
  const summary = report.summary || {}
  const reached = report.repositories?.find((finding) => finding.verdict === 'REACHED')
  const importer = reached?.imports?.[0]
  const ready = report.evidenceQuality?.readyForRecording
  const path = reached && importer
    ? `${reached.packageName}@${reached.resolvedVersion || 'unresolved'} → ${importer.path}${importer.line ? `:${importer.line}` : ''}`
    : null
  const hydraCopy = hydra?.status === 'queued'
    ? 'HydraDB accepted the batch; Recoil is waiting for indexing confirmation.'
    : hydra?.status === 'failed'
      ? 'HydraDB did not confirm persistence, so this remains a local evidence record.'
      : 'Recoil is writing the dated memory and will show its final status here.'
  return <section className="live-evidence-checkpoint" aria-live="polite">
    <div className="live-evidence-checkpoint-copy"><span className="section-kicker">Local proof ready</span><strong>{ready ? 'The repository paths are classified.' : 'A partial report is available for review.'}</strong><p>{ready ? hydraCopy : report.evidenceQuality?.reason || 'The report is not ready for a final recording.'}</p>{ready && onOpenReport && <button className="live-open-report" type="button" onClick={onOpenReport}>Open local report <ArrowUpRight size={13} /></button>}</div>
    <div className="live-evidence-checkpoint-result"><div className="live-evidence-checkpoint-stats"><span><strong>{summary.reached || 0}</strong><small>source path{summary.reached === 1 ? '' : 's'}</small></span><span><strong>{summary.declaredOnly || 0}</strong><small>listed only</small></span><span><strong>{summary.notAffected || 0}</strong><small>outside range</small></span></div>{path ? <div className="live-evidence-checkpoint-path"><span>Observed route</span><code>{path}</code>{importer.sourceUrl && <SourceLink href={importer.sourceUrl}>Open source line</SourceLink>}</div> : <span className="live-evidence-checkpoint-path-empty">No source-backed route was collected.</span>}</div>
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
  // The cited path ends at the package importer, but the observed source
  // cone continues through resolved local imports. Highlight those real
  // source nodes and edges together so the graph does not hide the impact
  // context we collected for the selected repository.
  for (const file of finding.sourceImpact?.files || []) {
    const sourceNode = (graph?.nodes || []).find((node) => node.id === `code:${finding.repository}:${file.path}`)
    if (sourceNode) ids.add(sourceNode.id)
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

function graphEdgeLabel(from, to) {
  const pair = `${from?.type || ''}:${to?.type || ''}`
  if (pair === 'advisory:package') return 'affects'
  if (pair === 'package:package') return 'depends on'
  if (pair === 'package:lockfile') return 'resolved in'
  if (pair === 'lockfile:repository') return 'belongs to'
  if (pair === 'repository:code') return 'contains'
  if (pair === 'lockfile:code') return 'imports'
  if (pair === 'code:code') return 'imports'
  if (pair === 'code:symbol') return 'indexes'
  return 'observed'
}

function nodeVerdict(node, report) {
  if (node.meta?.verdict) return node.meta.verdict
  if (node.type === 'repository') return report?.repositories?.find((finding) => finding.repository === node.label)?.verdict
  return null
}

function findingIndexForNode(node, findings = []) {
  if (!node) return -1
  if (node.type === 'repository') return findings.findIndex((finding) => finding.repository === node.label)
  if (node.meta?.repository) return findings.findIndex((finding) => finding.repository === node.meta.repository)
  const scopedPrefix = node.type === 'code' ? 'code:' : node.type === 'symbol' ? 'symbol:' : node.type === 'lockfile' ? 'lock:' : null
  if (scopedPrefix) {
    const index = findings.findIndex((finding) => node.id?.startsWith(`${scopedPrefix}${finding.repository}:`))
    if (index >= 0) return index
  }
  if (node.type !== 'package') return -1
  const candidates = findings
    .map((finding, index) => ({ finding, index }))
    .filter(({ finding }) => {
      const label = node.label || ''
      return label.startsWith(`${finding.packageName}@`) && (finding.resolvedVersions || [finding.resolvedVersion]).includes(label.slice(finding.packageName.length + 1))
    })
  return candidates.length === 1 ? candidates[0].index : -1
}

function nodeDescription(node, report) {
  if (node.type === 'advisory') return 'Public advisory record'
  if (node.type === 'package') return node.meta?.role === 'affected-dependency' ? 'Resolved dependency in the repository lockfile' : node.meta?.role === 'transitive-dependency' ? 'Observed transitive lockfile dependency' : 'Resolved package version'
  if (node.type === 'lockfile') return 'Public lockfile resolution record'
  if (node.type === 'repository') {
    const finding = report?.repositories?.find((item) => item.repository === node.label)
    return finding ? `${finding.verdict === 'REACHED' ? 'Source-backed path' : finding.verdict === 'DECLARED_ONLY' ? 'Declared without sampled import' : finding.verdict === 'NOT_AFFECTED' ? 'Outside affected range' : 'Evidence needs review'} · repository record` : 'Repository record'
  }
  if (node.type === 'code') return node.meta?.role === 'local-import'
    ? `Resolved local import at depth ${node.meta.depth ?? 1} · sampled source file`
    : 'Sampled source file'
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
  const selectedRouteNode = Boolean(selectedFinding?.repository && node.id?.includes(selectedFinding.repository))
  const importer = node.type === 'repository'
    ? selectedFinding?.imports?.[0]
    : node.type === 'code'
      ? selectedFinding?.imports?.find((item) => item.path === node.label)
      : null
  const routeEvidence = selectedFinding && node.type === 'repository'
    ? importer
      ? `${importer.path}${importer.line ? `:${importer.line}` : ''}`
      : selectedFinding.verdict === 'DECLARED_ONLY' ? 'No sampled import' : 'Source evidence needs review'
    : null
  const nodeEvidence = node.type === 'code'
    ? { label: 'Source file', value: node.label }
    : node.type === 'symbol'
      ? { label: 'Validated symbol', value: node.label }
      : node.type === 'lockfile'
        ? { label: 'Lockfile record', value: node.label }
      : node.type === 'package'
          ? { label: 'Resolution record', value: node.label }
          : node.type === 'advisory'
            ? { label: 'Advisory record', value: node.label }
            : node.type === 'repository'
              ? { label: 'Repository record', value: node.label }
            : null
  const evidenceLabel = routeEvidence ? (importer ? 'Source check' : 'Reachability check') : nodeEvidence?.label
  const evidenceValue = routeEvidence || nodeEvidence?.value
  const evidenceSource = importer?.sourceUrl || node.sourceUrl
  const sourceImpact = selectedRouteNode ? selectedFinding?.sourceImpact : null
  const sourceSummary = selectedRouteNode && selectedFinding
    ? selectedFinding.verdict === 'REACHED'
      ? `${selectedFinding.imports?.length || 0} sampled import${selectedFinding.imports?.length === 1 ? '' : 's'} · ${sourceImpact?.sampledFileCount || 0} source files · ${sourceImpact?.observedEdgeCount || 0} local import edges`
      : routeEvidenceLabel(selectedFinding)
    : null
  return <div className="graph-inspector" aria-live="polite"><div className="graph-inspector-copy"><span>Selected {node.type}</span><strong>{node.label}</strong><small>{metadata}</small></div>{evidenceValue && <div className="graph-inspector-evidence"><span>{evidenceLabel}</span><strong>{evidenceValue}</strong>{importer?.snippet && <code>{importer.snippet}</code>}{evidenceSource && <SourceLink href={evidenceSource}>{importer?.sourceUrl ? 'Open source line' : 'Open cited record'}</SourceLink>}</div>}{sourceSummary && <div className="graph-inspector-proof"><span>Selected route</span><strong>{sourceSummary}</strong></div>}<div className="graph-inspector-relations" aria-label="Observed relationships">{relations.slice(0, 2).map((relation) => <span key={`${relation.direction}-${relation.node.id}`}><i>{relation.direction === 'out' ? '→' : '←'}</i><strong>{graphEdgeLabel(relation.direction === 'out' ? node : relation.node, relation.direction === 'out' ? relation.node : node)}</strong><em>{shorten(relation.node.label, 25)}</em></span>)}{relations.length > 2 && <small>+{relations.length - 2} more</small>}</div><div className="graph-inspector-actions">{verdict && <Verdict value={verdict} compact />}</div></div>
}

function ProofMap({ findings = [], selectedIndex = 0, onSelectFinding, historical = false }) {
  const kindLabel = {
    advisory: 'advisory',
    resolved: 'resolved version',
    lockfile: 'lockfile',
    repository: 'repository',
    source: 'source file',
    symbol: 'validated symbol',
    evidence: 'evidence',
  }
  return <div className="proof-map-list">
    {findings.map((finding, index) => {
      const parts = findingParts(finding)
      const selected = index === selectedIndex
      const sourceImpact = finding.sourceImpact
      return <article className={`proof-map-lane ${selected ? 'proof-map-lane-selected' : ''}`} key={finding.repository || index}>
        <button className="proof-map-repository" type="button" onClick={() => onSelectFinding?.(index)} aria-pressed={selected}>
          <span className="proof-map-index">0{index + 1}</span>
          <span className="proof-map-repository-copy"><strong>{repositoryName(finding.repository)}</strong><small>{finding.packageName || 'package unresolved'} · {finding.resolvedVersions?.length > 1 ? `${finding.resolvedVersions.length} versions` : finding.resolvedVersion || 'unresolved'}</small></span>
          <Verdict value={finding.verdict} compact />
        </button>
        {parts.length ? <div className="proof-map-path" aria-label={`Evidence path for ${repositoryName(finding.repository)}`}>
          {parts.map((part, partIndex) => {
            const kind = traceKind(part, partIndex, finding)
            const source = traceSourceForPart(part, finding)
            return <div className="proof-map-hop-wrap" key={`${part}-${partIndex}`}>
              <div className={`proof-map-hop proof-map-hop-${kind}`}>
                <span>{kindLabel[kind] || kind}</span>
                <strong>{shorten(routeDisplayPart(part, finding), 34)}</strong>
                {source ? <SourceLink href={source}>source</SourceLink> : <small className="proof-map-hop-missing">not collected</small>}
              </div>
              {partIndex < parts.length - 1 && <i className="proof-map-arrow" aria-hidden="true">→</i>}
            </div>
          })}
        </div> : <div className="proof-map-no-path"><span>No observed path</span><small>{finding.reason || 'The available evidence does not support a stronger conclusion.'}</small></div>}
        {sourceImpact?.files?.length > 0 && <div className="proof-map-source-context"><span>Source context</span><strong>{sourceImpact.sampledFileCount} sampled file{sourceImpact.sampledFileCount === 1 ? '' : 's'} · {sourceImpact.observedEdgeCount} local import edge{sourceImpact.observedEdgeCount === 1 ? '' : 's'}</strong><small>{sourceImpact.files.slice(0, 4).map((file) => file.path).join(' → ')}{sourceImpact.files.length > 4 ? ' → …' : ''}</small></div>}
        <p className="proof-map-lane-note">{historical ? 'Dated reconstruction; current remediation is shown in the present case.' : finding.reason || 'Every displayed hop is taken from the collected public evidence.'}</p>
      </article>
    })}
  </div>
}

function EvidenceMap({ report, selectedFinding, onSelectFinding, onSelectNode, selectedNodeId, events = [], live = false, graphProgress = null, proofFirst = false, historical = false, onToggleGraph }) {
  const graph = report?.graph || { nodes: [], edges: [] }
  if (!live && proofFirst) {
    return <section className="evidence-map proof-map-shell" aria-label="Cited evidence paths">
      <div className="map-heading"><div><span className="section-kicker">Evidence paths</span><h2>One cited path per repository</h2><p className="map-heading-detail">Start with the relationships that decide the case. Select a repository, then open any source link to inspect the record behind that hop.</p></div><div className="map-heading-actions"><span className="map-count">{report?.repositories?.length || 0} paths · {graph.nodes.length} entities</span>{onToggleGraph && <button className="map-view-toggle" type="button" onClick={onToggleGraph}><Waypoints size={13} /> Open graph view</button>}</div></div>
      <ProofMap findings={report?.repositories || []} selectedIndex={Math.max(0, report?.repositories?.findIndex((finding) => finding.repository === selectedFinding?.repository) ?? 0)} onSelectFinding={onSelectFinding} historical={historical} />
    </section>
  }
  const layout = useMemo(() => graphLayout(graph, selectedFinding), [graph, selectedFinding])
  const selected = layout.selected
  const selectedNode = layout.nodes.find((node) => node.id === selectedNodeId) || layout.nodes.find((node) => node.type === 'repository' && node.label === selectedFinding?.repository) || null
  const selectedEdgeEntries = layout.edges.filter(([from, to]) => selected.has(from) && selected.has(to)).map(([from, to], index) => [`${from}>${to}`, index])
  const selectedEdges = new Set(selectedEdgeEntries.map(([key]) => key))
  const selectedEdgeOrder = new Map(selectedEdgeEntries)
  const selectedNodeOrder = new Map(layout.nodes.filter((node) => selected.has(node.id)).map((node, index) => [node.id, index]))
  const layerLabels = [{ label: 'Advisory', type: 'advisory' }, { label: 'Dependency', type: 'package' }, { label: 'Lockfile', type: 'lockfile' }, { label: 'Repository', type: 'repository' }, { label: 'Source', type: 'code' }, { label: 'Validated symbol', type: 'symbol' }]
  const sourceImpact = selectedFinding?.sourceImpact
  const finalFindings = !live ? (report?.repositories || []) : []
  const outcomeSummary = finalFindings.length
    ? [
      ['REACHED', 'reaches source'],
      ['DECLARED_ONLY', 'listed only'],
      ['NOT_AFFECTED', 'outside range'],
      ['UNKNOWN', 'needs review'],
    ].map(([verdict, label]) => {
      const count = finalFindings.filter((finding) => verdict === 'UNKNOWN'
        ? ['UNKNOWN', 'NOT_YET_OBSERVED'].includes(finding.verdict)
        : finding.verdict === verdict).length
      return count ? `${count} ${label}` : null
    }).filter(Boolean).join(' · ')
    : null
  const selectedContext = sourceImpact?.files?.length
    ? `Selected route: ${sourceImpact.sampledFileCount} sampled source files and ${sourceImpact.observedEdgeCount} local import edges.`
    : selectedFinding
      ? `Selected route: ${routeEvidenceLabel(selectedFinding)}.`
      : 'Select a repository or node to inspect the collected relationship.'
  if (!layout.nodes.length) {
    const current = events.find((event) => event.status === 'working')
    return <section className="evidence-map map-empty" aria-label="Evidence map">
      <div className="map-heading"><div><span className="section-kicker">Evidence map</span><h2>{live ? 'Building the route' : 'No graph to show'}</h2><p className="map-heading-detail">{live ? 'Records appear here as each repository finishes.' : 'Start an investigation to draw the collected relationships.'}</p></div><span className="map-count">{live ? `${graphProgress?.completedRepositories || 0}/${graphProgress?.totalRepositories || 0} repositories` : '0 nodes'}</span></div>
      <div className="map-empty-body"><div className="empty-route"><span /><i /><span /><i /><span /></div><strong>{current?.title || 'The evidence map appears here'}</strong><p>{current?.detail || 'Start an investigation to draw the advisory, dependency, repository, and source relationships.'}</p></div>
    </section>
  }
  return <section className="evidence-map" aria-label="Observed evidence map">
    <div className="map-heading"><div><span className="section-kicker">Observed graph</span><h2>{live ? graphProgress?.completedRepositories === graphProgress?.totalRepositories && graphProgress?.totalRepositories ? 'Evidence map ready' : 'Evidence arriving' : 'Follow the path to code'}</h2><p className="map-heading-detail">{live ? 'Each edge is added from a public record as it is collected.' : 'Read left to right: advisory → dependency → lockfile → repository → sampled source. The selected route is highlighted; click a node to inspect its cited relationship.'}</p>{outcomeSummary && <p className="map-heading-outcome"><strong>{outcomeSummary}</strong><span>computed from the repository evidence</span></p>}<p className="map-heading-context">{selectedContext}</p></div><div className="map-heading-actions"><span className="map-count">{live && graphProgress ? `${graphProgress.completedRepositories}/${graphProgress.totalRepositories} repositories · ` : ''}{layout.nodes.length} nodes · {layout.edges.length} edges</span>{!live && !historical && onToggleGraph && <button className="map-view-toggle" type="button" onClick={onToggleGraph}><FileText size={13} /> Show cited paths</button>}</div></div>
    <div className="map-canvas">
      <div className="map-svg-viewport" tabIndex="0" aria-label="Scrollable evidence graph">
      <svg width={layout.width} height={layout.height} viewBox={`0 0 ${layout.width} ${layout.height}`} role="img" aria-label="Evidence graph from advisory to repository source">
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
            const fromNode = layout.nodes.find((node) => node.id === from)
            const toNode = layout.nodes.find((node) => node.id === to)
            return <g key={key}><line className={`map-edge ${isSelected ? 'map-edge-selected' : ''}`} style={isSelected ? { '--map-route-delay': `${(selectedEdgeOrder.get(key) || 0) * 45}ms` } : undefined} x1={start.x + 77} y1={start.y} x2={end.x - 77} y2={end.y} markerEnd="url(#recoil-arrow)" />{isSelected && <text className="map-edge-label" x={(start.x + end.x) / 2} y={(start.y + end.y) / 2 - 5} textAnchor="middle">{graphEdgeLabel(fromNode, toNode)}</text>}</g>
          })}
        </g>
        <g className="map-nodes">
          {layout.nodes.map((node) => {
            const position = layout.positions.get(node.id)
            if (!position) return null
            const verdict = nodeVerdict(node, report)
            const isSelected = selected.has(node.id)
            const findingIndex = findingIndexForNode(node, report?.repositories || [])
            const selectable = Boolean(onSelectNode || (findingIndex >= 0 && onSelectFinding))
            const selectNode = () => { if (findingIndex >= 0 && onSelectFinding) onSelectFinding(findingIndex); if (onSelectNode) onSelectNode(node.id) }
            return <g className={`map-node node-${node.type} ${node.meta?.role ? `node-${node.meta.role}` : ''} ${isSelected ? 'node-selected' : ''} ${verdict ? `node-${verdict.toLowerCase()}` : ''} ${selectable ? 'node-selectable' : ''}`} style={isSelected ? { '--map-route-delay': `${(selectedNodeOrder.get(node.id) || 0) * 45}ms` } : undefined} key={node.id} transform={`translate(${position.x - 77} ${position.y - 24})`} role={selectable ? 'button' : undefined} aria-label={selectable ? `${node.type}: ${node.label}` : undefined} tabIndex={selectable ? 0 : undefined} onClick={selectNode} onKeyDown={(event) => { if (selectable && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); selectNode() } }}>
              <title>{node.label}</title>
              <rect width="154" height="48" rx="6" />
              <text className="map-node-type" x="10" y="15">{node.meta?.role === 'local-import' ? 'local import' : node.type}</text>
              <text className="map-node-label" x="10" y="33">{shorten(node.label, 23)}</text>
            </g>
          })}
        </g>
      </svg>
      </div>
      <div className="map-legend" aria-label="Graph legend"><span><i className="legend-line legend-observed" /> observed</span><span><i className="legend-line legend-selected" /> selected path</span><span><i className="legend-dot legend-reached" /> reached</span><span><i className="legend-dot legend-declared" /> declared only</span><span><i className="legend-dot legend-safe" /> safe</span><span className="map-direction">arrows follow the evidence</span></div>
      {onSelectNode && (!live || selectedNode) && <GraphInspector node={selectedNode} report={report} graph={graph} selectedFinding={selectedFinding} />}
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

function citedProofLabel(finding) {
  const proof = finding?.proof || []
  if (!proof.length) return 'No cited path'
  const cited = proof.filter((step) => ['observed', 'validated'].includes(step.status) && step.source).length
  return `${cited}/${proof.length} cited hops`
}

function sourceCoverageLabel(finding) {
  if (finding?.sourceSampleSize == null && finding?.sourceCandidateCount == null) return null
  const sampled = Number(finding.sourceSampleSize || 0)
  const candidates = Number(finding.sourceCandidateCount || 0)
  if (!sampled) return 'no eligible source files sampled'
  return candidates > sampled
    ? `${sampled} of ${candidates} eligible files sampled`
    : `${sampled} eligible files sampled`
}

function RouteList({ findings, selectedIndex, onSelect, challenges = [], correlations = [], historical = false, compact = false, onInspectProof }) {
  const reached = findings.filter((finding) => finding.verdict === 'REACHED').length
  const selectedFinding = findings[selectedIndex]
  const selectedChallenge = challenges.find((item) => item.repository === selectedFinding?.repository)
  return <aside className="route-panel">
    <div className="route-panel-heading"><div><span className="section-kicker">Repository outcomes</span><h2>{compact ? 'What each repository means' : 'What to do with each repository'}</h2></div><span>{findings.length} checked</span></div>
    <p className="route-panel-note">{compact ? 'The cited paths above carry the detail; select a row to keep one repository in focus.' : 'Select a row to inspect its cited source evidence below.'}</p>
    {reached > 0 && <div className="route-panel-callout"><CircleAlert size={15} /><span>{reached} {reached === 1 ? 'repository reaches' : 'repositories reach'} the affected code in sampled source.</span></div>}
    {!compact && <SelectedRoute finding={selectedFinding} challenge={selectedChallenge} historical={historical} onInspectProof={onInspectProof} />}
    <div className={`route-list comparison-matrix ${compact ? 'route-list-compact' : ''}`} role="list" aria-label="Repository decisions">
      {!compact && <div className="comparison-matrix-header" aria-hidden="true"><span /> <span>Repository</span><span>Resolution</span><span>Source use</span><span>Next action</span><span /></div>}
      {findings.map((finding, index) => {
        const challenge = challenges.find((item) => item.repository === finding.repository)
        const importer = finding.imports?.[0]
        const version = finding.resolvedVersions?.length > 1 ? finding.resolvedVersions.join(', ') : finding.resolvedVersion || 'not resolved'
        const sourceUse = finding.verdict === 'REACHED'
          ? `${finding.imports?.length || 0} sampled import${finding.imports?.length === 1 ? '' : 's'}`
          : finding.verdict === 'DECLARED_ONLY'
            ? 'No sampled import'
            : finding.verdict === 'NOT_AFFECTED'
              ? 'Outside affected range'
              : 'Evidence needs review'
        const sourceDetail = [
          importer ? `${importer.path}${importer.line ? `:${importer.line}` : ''}` : finding.verdict === 'DECLARED_ONLY' ? 'lockfile only' : finding.verdict === 'NOT_AFFECTED' ? 'semver check' : 'incomplete sample',
          sourceCoverageLabel(finding),
        ].filter(Boolean).join(' · ')
        if (compact) return <button className={`route-item route-item-compact ${selectedIndex === index ? 'route-item-selected' : ''}`} key={finding.repository || index} type="button" onClick={() => onSelect(index)}>
          <span className="route-index">0{index + 1}</span>
          <span className="route-item-repository"><strong>{repositoryName(finding.repository)}</strong><small>{routeEvidenceLabel(finding)}</small></span>
          <span className="route-item-action"><b>{routeActionLabel(finding, challenge, historical)}</b><small>{challenge?.status === 'FIX_SURVIVES' ? `${finding.packageName || 'package'} ${challenge.proposedVersion}` : sourceDetail}</small></span>
          <Verdict value={finding.verdict} compact />
        </button>
        return <button className={`route-item ${selectedIndex === index ? 'route-item-selected' : ''}`} key={finding.repository || index} type="button" onClick={() => onSelect(index)}>
          <span className="route-index">0{index + 1}</span>
          <span className="route-item-repository"><strong>{repositoryName(finding.repository)}</strong><small>{finding.packageName || 'package unresolved'}</small></span>
          <span className="route-item-resolution"><b>{version}</b><small>resolved version</small></span>
          <span className="route-item-source"><b>{sourceUse}</b><small>{sourceDetail}</small></span>
          <span className="route-item-action"><b>{routeActionLabel(finding, challenge, historical)}</b><small>{challenge?.status === 'FIX_SURVIVES' ? 'advisory-backed fix' : routeEvidenceLabel(finding)}</small></span>
          <Verdict value={finding.verdict} compact />
        </button>
      })}
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

function ImportSite({ importer, packageName }) {
  return <div className="import-proof-site"><div className="import-proof-site-copy"><strong>{importer.path}{importer.line ? `:${importer.line}` : ''}</strong><code>{importer.snippet || `imports ${importer.specifier || packageName}`}</code></div>{importer.sourceUrl && <SourceLink href={importer.sourceUrl}>Open source line</SourceLink>}</div>
}

function ImportProof({ finding }) {
  const imports = finding?.imports || []
  if (!imports.length) return <div className="import-proof import-proof-empty"><FileCode2 size={16} /><div><span className="section-kicker">Source check</span><strong>No sampled import</strong><p>{finding?.verdict === 'DECLARED_ONLY' ? 'The package is present in the lockfile, but no sampled source file imports it.' : finding?.sourceBound || 'The source evidence does not support a stronger conclusion.'}</p></div></div>
  const importLabel = `${imports.length} sampled import site${imports.length === 1 ? '' : 's'}`
  return <div className="import-proof"><FileCode2 size={16} /><div><span className="section-kicker">Observed in source</span><strong>{importLabel}</strong>{imports.length === 1 ? <ImportSite importer={imports[0]} packageName={finding.packageName} /> : <details className="import-proof-details"><summary>Inspect all source sites</summary><div className="import-proof-list">{imports.map((importer, index) => <ImportSite key={`${importer.path}-${importer.line || index}`} importer={importer} packageName={finding.packageName} />)}</div></details>}</div></div>
}

function SelectedRoute({ finding, challenge, historical = false, onInspectProof }) {
  if (!finding) return null
  const importer = finding.imports?.[0]
  const version = finding.resolvedVersions?.length > 1 ? finding.resolvedVersions.join(', ') : finding.resolvedVersion || 'not resolved'
  const change = finding.changeEvidence?.importerFilesChanged?.[0]
  const owners = [...new Set(finding.changeEvidence?.importerFilesChanged?.flatMap((item) => item.owners || []) || [])]
  const validatedSymbol = finding.advisoryScope?.status === 'VALIDATED_SYMBOL' ? finding.advisoryScope.symbols?.[0] : null
  const action = routeActionLabel(finding, challenge, historical)
  const sourceLabel = importer
    ? `${importer.path}${importer.line ? `:${importer.line}` : ''}`
    : finding.verdict === 'DECLARED_ONLY'
      ? 'No sampled import'
      : finding.verdict === 'NOT_AFFECTED'
        ? 'Semver check only'
        : 'Evidence needs review'
  const source = importer?.sourceUrl || finding.lockfileSource || finding.evidenceSources?.[0]
  return <section className="route-selected" aria-label="Selected repository evidence">
    <div className="route-selected-heading"><span>Selected repository</span><Verdict value={finding.verdict} compact /></div>
    <strong>{repositoryName(finding.repository)}</strong>
    <p>{finding.reason || 'The available public evidence does not support a stronger conclusion.'}</p>
    <dl>
      <div><dt>Resolution</dt><dd>{finding.packageName ? `${finding.packageName}@${version}` : version}</dd></div>
      <div><dt>Next action</dt><dd>{action}</dd></div>
    </dl>
    <div className="route-selected-proof">
      <div><span>Source check</span><strong>{sourceLabel}</strong></div>
      <div><span>Evidence scope</span><strong>{sourceCoverageLabel(finding) || 'public record'}</strong></div>
    </div>
    {importer?.snippet && <div className="route-selected-snippet"><span>Observed line</span><code>{importer.snippet}</code></div>}
    {validatedSymbol && <div className="route-selected-scope"><span>Validated advisory scope</span><strong>{validatedSymbol.name} · {validatedSymbol.path}:{validatedSymbol.line}</strong>{validatedSymbol.sourceUrl && <SourceLink href={validatedSymbol.sourceUrl}>Open symbol</SourceLink>}</div>}
    {change && <div className="route-selected-change"><span>Latest importer change</span><strong>{change.symbols?.length ? change.symbols.join(', ') : finding.changeEvidence.message || 'public change touched the importer'}</strong><small>{finding.changeEvidence.committedAt?.slice(0, 10) || 'date unavailable'}{owners.length ? ` · ${owners.join(', ')}` : ''}</small></div>}
    <div className="route-selected-actions">{source && <SourceLink href={source}>{importer?.sourceUrl ? 'Open source line' : 'Open cited record'}</SourceLink>}{!historical && onInspectProof && <button className="route-selected-action" type="button" onClick={onInspectProof}>Open proof <ArrowUpRight size={13} /></button>}</div>
  </section>
}

function SourceImpactEvidence({ finding }) {
  const impact = finding?.sourceImpact
  if (!impact?.files?.length) return null
  const files = impact.files.slice(0, 8)
  const omittedFiles = Math.max(0, impact.files.length - files.length)
  return <div className="source-impact-evidence">
    <div className="source-impact-heading"><div><span className="section-kicker">Observed source cone</span><strong>{impact.sampledFileCount} sampled file{impact.sampledFileCount === 1 ? '' : 's'} · {impact.observedEdgeCount} local import edge{impact.observedEdgeCount === 1 ? '' : 's'}</strong><p>{impact.note}</p></div><Waypoints size={16} /></div>
    <div className="source-impact-files" aria-label="Observed local source files">
      {files.map((file) => <div className={`source-impact-file source-impact-file-${file.role}`} key={file.path}><span className="source-impact-depth">{file.depth}</span><div><strong>{file.path}</strong><small>{file.role === 'importer' ? `imports ${finding.packageName || 'the selected package'}` : 'resolved local import'}</small></div>{file.sourceUrl && <SourceLink href={file.sourceUrl}>Open source</SourceLink>}</div>)}
    </div>
    {omittedFiles > 0 && <p className="source-impact-omitted">+ {omittedFiles} more sampled file{omittedFiles === 1 ? '' : 's'} in the bounded cone</p>}
    {!!impact.edges?.length && <details className="source-impact-details"><summary>Inspect local import edges</summary><div className="source-impact-edge-list">{impact.edges.slice(0, 12).map(([from, to]) => <div key={`${from}>${to}`}><code>{from}</code><span>→</span><code>{to}</code></div>)}</div></details>}
  </div>
}

function packageFixCommand(finding, challenge) {
  const version = challenge?.proposedVersion
  const packageName = finding?.packageName
  if (!version || !packageName) return null
  const lockfile = (finding.path || []).find((part) => /(?:package-lock\.json|npm-shrinkwrap\.json|yarn\.lock|pnpm-lock\.yaml|Cargo\.lock)/i.test(part)) || ''
  if (/Cargo\.lock/i.test(lockfile)) return `cargo update -p ${packageName} --precise ${version}`
  if (/yarn\.lock/i.test(lockfile)) return `yarn add ${packageName}@${version}`
  if (/pnpm-lock\.yaml/i.test(lockfile)) return `pnpm add ${packageName}@${version}`
  return `npm install ${packageName}@${version}`
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
    `Suggested command: ${packageFixCommand(finding, challenge) || 'not established'}`,
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

function CopyFixCommand({ command }) {
  const [status, setStatus] = useState('idle')
  useEffect(() => {
    if (status !== 'copied') return undefined
    const timer = window.setTimeout(() => setStatus('idle'), 1800)
    return () => window.clearTimeout(timer)
  }, [status])
  if (!command) return null
  const copy = async () => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(command)
      } else {
        const field = document.createElement('textarea')
        field.value = command
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
  return <div className="fix-proof-command"><div><span>Suggested local change</span><code>{command}</code></div><button type="button" onClick={copy} aria-live="polite">{status === 'copied' ? <Check size={13} /> : <Copy size={13} />}{status === 'copied' ? 'Copied' : status === 'failed' ? 'Copy unavailable' : 'Copy command'}</button></div>
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
  const command = packageFixCommand(finding, challenge)
  return <section className={`fix-proof fix-proof-${verified ? 'verified' : 'review'}`}>
    <div className="fix-proof-heading"><div><span className="section-kicker">Remediation</span><h3>{statusLabel}</h3></div><span className="fix-proof-badge">{verified ? <Check size={13} /> : <CircleAlert size={13} />}{verified ? 'verified' : 'not verified'}</span></div>
    <div className="fix-proof-compare">
      <div><span>Observed</span><strong>{finding.packageName}@{currentVersion}</strong><small>{finding.verdict === 'REACHED' ? 'affected import observed' : finding.verdict === 'DECLARED_ONLY' ? 'declared, not imported' : 'current resolution'}</small></div>
      <span className="fix-proof-arrow" aria-hidden="true">→</span>
      <div><span>Proposed</span><strong>{finding.packageName}@{proposedVersion}</strong><small>{challenge.status === 'MANIFEST_CHANGE_REQUIRED' ? `outside ${finding.declaredRange || 'the declared'} range` : verified ? 'outside the affected range' : 'not proven by this case'}</small></div>
    </div>
    <p className="fix-proof-detail">{challenge.detail}</p>
    <div className="fix-proof-boundary"><PackageCheck size={15} /><span>{boundary}</span>{lockfileSource && <SourceLink href={lockfileSource}>Open lockfile evidence</SourceLink>}</div>
    <CopyFixCommand command={command} />
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

function AdvisoryScopeEvidence({ finding }) {
  const scope = finding?.advisoryScope
  if (!scope || scope.status === 'NOT_REQUESTED') return null
  const symbols = scope.symbols || []
  const validated = scope.status === 'VALIDATED_SYMBOL' && symbols.length > 0
  const title = validated
    ? symbols.map((symbol) => `${symbol.name} · ${symbol.path}:${symbol.line}`).join(', ')
    : 'Module-level proof retained'
  const detail = validated
    ? 'An advisory-named symbol matched an indexed symbol in an importing file.'
    : scope.note || 'No advisory-named symbol matched an importing file; the package-import proof remains authoritative.'
  return <div className={`advisory-scope-evidence ${validated ? 'advisory-scope-validated' : 'advisory-scope-module'}`}>
    <span className="section-kicker">Advisory scope</span>
    <div><strong>{title}</strong><p>{detail}</p>{validated && symbols[0]?.sourceUrl && <SourceLink href={symbols[0].sourceUrl}>Open validated symbol</SourceLink>}</div>
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
    <SourceImpactEvidence finding={finding} />
    <ChangeProof finding={finding} />
    <FixProof finding={finding} challenge={challenge} />
    <div className="proof-bottom">
      <div className="proof-sources"><span className="section-kicker">Sources</span><div>{sourceLinks.slice(0, 4).map((source) => <SourceLink key={source} href={source}>{sourceHost(source)}</SourceLink>)}</div></div>
    </div>
  </section>
}

function TemporalProof({ report, onRewind, loading = false, loadingTarget = null }) {
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
  const beforeLoading = loading && loadingTarget === before
  const currentLoading = loading && loadingTarget === current
  const beforeLabel = beforeActive ? temporalSummaryLabel(beforeSummary) : beforeLoading ? 'Rebuilding…' : 'Not loaded'
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
    : loading
      ? 'Rebuilding the graph from dated evidence…'
      : 'Rewind once to rebuild the graph at the day before disclosure.'
  const triplets = [...new Map((memory?.graphContext?.triplets || []).map((triplet) => {
    const key = [triplet.source, triplet.predicate, triplet.target].map((value) => String(value || '').trim().toLowerCase()).join('|')
    return [key, triplet]
  })).values()]
  const relatedCases = memory?.relatedCases?.length
    ? memory.relatedCases
    : (memory?.priorScenarioIds || []).map((scenarioId) => ({ scenarioId }))
  return <section className="temporal-proof" id="case-history" aria-busy={loading}>
    <div className="temporal-copy"><span className="section-kicker">HydraDB history</span><h2>See the case at two points in time.</h2><p>The advisory was published {report.advisory?.published?.slice(0, 10) || 'on an unknown date'}. Recoil uses dated lockfile evidence and HydraDB recall to keep the timeline inspectable.</p><div className={`memory-line ${memory?.status === 'recalled' ? '' : 'memory-line-muted'}`}><span className="memory-mark" /> {memory?.status === 'recalled' ? 'Dated context returned from HydraDB.' : memory?.status === 'queued' ? 'Memory is indexing in HydraDB.' : 'HydraDB history is unavailable.'}</div></div>
    <div className="temporal-controls"><button className={beforeActive ? 'active' : ''} disabled={loading} aria-busy={beforeLoading} onClick={() => onRewind(before)}>{beforeLoading ? <LoaderCircle className="spin" size={15} /> : <Clock3 size={15} />}<span>{beforeLoading ? 'Rebuilding…' : 'Before disclosure'}</span><small>{before.slice(0, 10)}</small></button><button className={!beforeActive ? 'active' : ''} disabled={loading} aria-busy={currentLoading} onClick={() => onRewind(current)}>{currentLoading ? <LoaderCircle className="spin" size={15} /> : <ShieldCheck size={15} />}<span>{currentLoading ? 'Restoring…' : 'Current evidence'}</span><small>{current?.slice(0, 10) || 'today'}</small></button></div>
    <div className="temporal-compare" aria-live="polite">
      <div className="temporal-compare-heading"><span>Disclosure boundary</span><strong>{temporalConclusion}</strong></div>
      <div className="temporal-compare-points">
        <div className={`temporal-point ${beforeActive ? 'temporal-point-active' : ''}`}>
          <span>Before disclosure</span>
          <strong>{beforeLabel}</strong>
          <small>{beforeActive ? `${before.slice(0, 10)} · reconstructed from dated evidence` : beforeLoading ? 'Reading dated repository evidence…' : 'Select the left control to load this snapshot'}</small>
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
    <div className="temporal-stats"><span><strong>{memory?.datedChunkCount || 0}</strong><small>dated facts</small></span><span><strong>{memory?.graphContext?.tripletCount || 0}</strong><small>graph triplets</small></span><span><strong>{memory?.relatedCaseCount || 0}</strong><small>prior records</small></span></div>
    <HistoryDelta findings={currentFindings} challenges={report.challenge || []} relatedCases={relatedCases} />
    <details className="memory-evidence"><summary>Inspect recalled relationships <span>{triplets.length} returned</span></summary>{triplets.length ? <div className="memory-triplets">{triplets.slice(0, 6).map((triplet, index) => <div className="memory-triplet" key={`${triplet.source}-${triplet.predicate}-${triplet.target}-${index}`}><strong>{triplet.source || 'entity'}</strong><span>{triplet.predicate || 'connected to'}</span><strong>{triplet.target || 'entity'}</strong></div>)}</div> : <p>No graph relationships were returned for this temporal read.</p>}</details>
    {relatedCases.length > 0 && <section className="related-cases" aria-label="Prior HydraDB records"><div className="related-cases-heading"><div><span className="section-kicker">HydraDB recall</span><strong>Prior evidence records</strong></div><span>{relatedCases.length} found</span></div><div className="related-case-list">{relatedCases.slice(0, 4).map((item) => <article className="related-case" key={item.scenarioId}><div className="related-case-main"><strong>{item.scenarioId}</strong><span>{item.repositories?.length ? item.repositories.join(' · ') : 'repository metadata unavailable'}</span></div><div className="related-case-meta"><span>{item.validFrom ? `dated ${dateLabel(item.validFrom)}` : 'date unavailable'}</span>{item.kinds?.length > 0 && <span>{item.kinds.join(' · ')}</span>}{item.sourceUrls?.[0] && <SourceLink href={item.sourceUrls[0]}>source</SourceLink>}</div></article>)}</div><p className="related-cases-note">HydraDB returned case metadata only. The current verdict is still computed from this investigation’s collected evidence.</p></section>}
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

function historyVerdictLabel(value) {
  return String(value || 'UNKNOWN').replaceAll('_', ' ').toLowerCase()
}

function latestPriorSnapshots(relatedCases = []) {
  const latest = new Map()
  for (const relatedCase of relatedCases) {
    for (const snapshot of relatedCase.snapshots || []) {
      if (!snapshot.repository) continue
      const candidate = { ...snapshot, scenarioId: relatedCase.scenarioId, observedAt: snapshot.observedAt || relatedCase.observedAt || relatedCase.validFrom || null }
      const previous = latest.get(snapshot.repository)
      if (!previous || String(candidate.observedAt || '').localeCompare(String(previous.observedAt || '')) > 0) latest.set(snapshot.repository, candidate)
    }
  }
  return [...latest.values()].sort((left, right) => left.repository.localeCompare(right.repository))
}

function historyDeltaRows(findings = [], challenges = [], relatedCases = []) {
  const currentByRepository = new Map(findings.map((finding) => {
    const challenge = challenges.find((item) => item.repository === finding.repository)
    return [finding.repository, {
      repository: finding.repository,
      packageName: finding.packageName || null,
      resolvedVersion: finding.resolvedVersion || null,
      verdict: finding.verdict || 'UNKNOWN',
      importCount: finding.imports?.length || 0,
      fixStatus: challenge?.status || null,
      proposedVersion: challenge?.proposedVersion || null,
    }]
  }))
  return latestPriorSnapshots(relatedCases)
    .map((previous) => {
      const current = currentByRepository.get(previous.repository)
      if (!current) return null
      const changes = []
      if ((previous.resolvedVersion || null) !== current.resolvedVersion) changes.push('resolution changed')
      if ((previous.verdict || 'UNKNOWN') !== current.verdict) changes.push('classification changed')
      if (Number(previous.importCount || 0) !== Number(current.importCount || 0)) changes.push('source use changed')
      if ((previous.fixStatus || null) !== current.fixStatus || (previous.proposedVersion || null) !== current.proposedVersion) changes.push('fix check changed')
      return { previous, current, changes }
    })
    .filter(Boolean)
}

function HistoryDelta({ findings = [], challenges = [], relatedCases = [] }) {
  const rows = historyDeltaRows(findings, challenges, relatedCases)
  if (!rows.length) return null
  const changedCount = rows.filter((row) => row.changes.length).length
  return <section className="history-delta" aria-label="HydraDB scan comparison">
    <div className="history-delta-heading"><div><span className="section-kicker">HydraDB comparison</span><h2>{changedCount ? `${changedCount} repository${changedCount === 1 ? '' : 'ies'} changed since the latest prior record.` : 'No material change since the latest prior record.'}</h2><p>Compared with the newest dated reachability snapshot returned for each repository. The current verdict still comes from this run’s public evidence.</p></div><span>{rows.length} comparable</span></div>
    <div className="history-delta-list">
      {rows.map(({ previous, current, changes }) => <article className="history-delta-row" key={current.repository}>
        <div className="history-delta-repository"><strong>{repositoryName(current.repository)}</strong><small>{current.packageName || previous.packageName || 'package unavailable'}</small></div>
        <div className="history-delta-state"><span>Previous</span><strong>{previous.resolvedVersion || 'unresolved'} · {historyVerdictLabel(previous.verdict)}</strong><small>{previous.importCount || 0} sampled import{Number(previous.importCount || 0) === 1 ? '' : 's'}</small></div>
        <div className="history-delta-arrow" aria-hidden="true">→</div>
        <div className="history-delta-state history-delta-current"><span>Current</span><strong>{current.resolvedVersion || 'unresolved'} · {historyVerdictLabel(current.verdict)}</strong><small>{current.importCount || 0} sampled import{Number(current.importCount || 0) === 1 ? '' : 's'}</small></div>
        <span className={`history-delta-result ${changes.length ? 'is-changed' : ''}`}>{changes.length ? changes.join(' · ') : 'unchanged'}</span>
      </article>)}
    </div>
  </section>
}

function HydraComparisonLine({ findings = [], challenges = [], report, hydra, historical = false, onOpenHistory }) {
  if (historical) return null
  const memory = report?.rewind?.memory || hydra?.recall || {}
  const relatedCases = memory.relatedCases?.length
    ? memory.relatedCases
    : (memory.priorScenarioIds || []).map((scenarioId) => ({ scenarioId }))
  const rows = historyDeltaRows(findings, challenges, relatedCases)
  if (!rows.length) return null
  const changed = rows.filter((row) => row.changes.length)
  const headline = changed.length
    ? `${changed.length} repository${changed.length === 1 ? '' : 'ies'} changed since the last comparable scan.`
    : `No material change across ${rows.length} prior repository snapshot${rows.length === 1 ? '' : 's'}.`
  const detail = changed.length
    ? changed.slice(0, 2).map(({ current, changes }) => `${repositoryName(current.repository)}: ${changes.join(', ')}`).join(' · ')
    : 'The current verdicts still come from this run’s public evidence; HydraDB supplied the comparison context.'
  return <section className="hydra-comparison-line" aria-label="HydraDB prior scan comparison">
    <div className="hydra-comparison-copy"><span className="section-kicker">HydraDB memory</span><strong>{headline}</strong><p>{detail}</p></div>
    <div className="hydra-comparison-meta"><span>{rows.length} comparable snapshot{rows.length === 1 ? '' : 's'}</span>{onOpenHistory && <button type="button" onClick={onOpenHistory}>Open history <ArrowUpRight size={13} /></button>}</div>
  </section>
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
  const graphVerification = hydra?.graphVerification
  const graphRelation = graphVerification?.graphContext?.triplets?.[0]
  return <details className="integrity-details" id="case-audit" open><summary>Audit record <span>{quality.readyForRecording ? 'recording-ready' : 'review required'}</span></summary><div className="integrity-grid"><div><strong>{sourceCount}</strong><span>public sources</span></div><div><strong>{sampled}</strong><span>source files sampled</span></div><div><strong>{graph.edges.length}</strong><span>observed relationships</span></div><div><strong>{hydra?.memoryCount || 0}</strong><span>HydraDB memories</span></div><div><strong>static only</strong><span>execution boundary</span></div></div><div className="audit-scope"><div><span className="section-kicker">Advisory scope</span><strong>{scopeLabel}</strong><p>{scope.note || (scope.model ? `OpenAI ${scope.model} proposed names; Recoil only attaches exact matches found in an importing file.` : scope.reason || 'The deterministic package-import proof remains authoritative.')}</p></div>{scope.affectedSymbols?.length > 0 && <div className="audit-symbols">{scope.affectedSymbols.slice(0, 6).map((symbol) => <span key={`${symbol.name}-${symbol.reason}`}>{symbol.name}</span>)}</div>}</div>{graphVerification && <div className={`audit-graph-verification audit-graph-verification-${graphVerification.status}`}><div><span className="section-kicker">Current HydraDB graph read</span><strong>{graphVerification.status === 'verified' ? `${graphVerification.tripletCount || 0} scoped relation${graphVerification.tripletCount === 1 ? '' : 's'} returned` : graphVerification.status.replaceAll('_', ' ')}</strong><p>{graphRelation ? `${graphRelation.source} ${graphRelation.predicate || 'connected to'} ${graphRelation.target}` : graphVerification.reason || 'The current case graph was not returned by the scoped read.'}</p></div><span>{graphVerification.memoryCount || 0} observed-graph memor{graphVerification.memoryCount === 1 ? 'y' : 'ies'}</span></div>}<p>{quality.reason || 'Reachability is based on cited lockfile and sampled source imports. It is not a claim of runtime execution.'}</p><p className="integrity-note">Evidence status: {evidenceStatus}. No package code or exploit payload was executed.</p></details>
}

function ReceiptLink({ scenarioId = DEFAULT_SCENARIO_ID }) {
  return <a className="receipt-link" href={`/api/scenarios/${scenarioId}/receipt`} download="recoil-evidence-receipt.json"><Download size={14} /> Download receipt</a>
}

function BriefLink({ scenarioId = DEFAULT_SCENARIO_ID }) {
  return <a className="brief-link" href={`/api/scenarios/${scenarioId}/brief`} download="recoil-evidence-brief.md"><FileText size={14} /> Download case brief</a>
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

function CaseFactsLine({ summary = {}, historical = false, onOpenProof, onOpenHistory }) {
  const unknown = summary.unknown || 0
  const facts = [
    {
      label: 'Reachability',
      value: unknown
        ? `${unknown} need review`
        : `${summary.reached || 0} source-backed path${summary.reached === 1 ? '' : 's'}`,
      detail: `${summary.declaredOnly || 0} listed only · ${summary.notAffected || 0} outside range${unknown ? ` · ${unknown} incomplete` : ''}`,
      action: onOpenProof ? { label: 'Inspect proof', onClick: onOpenProof } : null,
    },
    {
      label: 'Timing',
      value: historical
        ? 'Historical snapshot'
        : summary.exposureDays != null
          ? `${summary.exposureDays.toLocaleString()} days before disclosure`
          : 'Not dated',
      detail: historical ? 'Current evidence is available from the present case.' : 'Repository history compared with the advisory date.',
      action: onOpenHistory ? { label: historical ? 'Return to current' : 'Open dated view', onClick: onOpenHistory } : null,
    },
    {
      label: 'Remediation',
      value: historical
        ? 'Current proof hidden'
        : summary.fixSurvives
          ? `${summary.fixSurvives} fix proof${summary.fixSurvives === 1 ? '' : 's'} verified`
          : summary.alreadySafe
            ? `${summary.alreadySafe} already safe`
            : 'Fix proof needs review',
      detail: historical
        ? 'A dated view does not make a present-day fix claim.'
        : summary.alreadySafe
          ? `${summary.alreadySafe} resolution${summary.alreadySafe === 1 ? '' : 's'} already sit outside the affected range.`
          : 'The proposed version is checked against the observed path.',
      action: historical && onOpenHistory ? { label: 'Return to current', onClick: onOpenHistory } : onOpenProof ? { label: 'Inspect fix', onClick: onOpenProof } : null,
      positive: !historical && Boolean(summary.fixSurvives || summary.alreadySafe),
    },
  ]
  return <section className="case-facts-line" aria-label="Case proof summary">{facts.map((fact) => <article className="case-fact" key={fact.label}><span className="case-fact-label">{fact.label}</span><strong className={fact.positive ? 'is-positive' : ''}>{fact.value}</strong><small>{fact.detail}</small>{fact.action && <button type="button" onClick={fact.action.onClick}>{fact.action.label}<ArrowUpRight size={12} /></button>}</article>)}</section>
}

function CaseDecisionCallout({ findings = [], challenges = [], packageName, historical = false, onInspectProof, onOpenHistory }) {
  const reached = findings.filter((finding) => finding.verdict === 'REACHED')
  const declaredOnly = findings.filter((finding) => finding.verdict === 'DECLARED_ONLY')
  const notAffected = findings.filter((finding) => finding.verdict === 'NOT_AFFECTED')
  const unknown = findings.filter((finding) => ['UNKNOWN', 'NOT_YET_OBSERVED'].includes(finding.verdict))
  const primaryFinding = reached[0]
  const primaryChallenge = challenges.find((item) => item.repository === primaryFinding?.repository)
  const importer = primaryFinding?.imports?.[0]
  const proofFinding = primaryFinding || findings[0]
  const proofImporter = proofFinding?.imports?.[0]
  const proofSource = proofImporter?.sourceUrl || proofFinding?.lockfileSource || proofFinding?.evidenceSources?.[0]
  const proofRoute = proofFinding
    ? proofFinding.verdict === 'REACHED'
      ? `${repositoryName(proofFinding.repository)} · ${proofImporter ? `${proofImporter.path}${proofImporter.line ? `:${proofImporter.line}` : ''}` : 'sampled source'}`
      : `${repositoryName(proofFinding.repository)} · ${routeEvidenceLabel(proofFinding)}`
    : null
  const repositoryWord = (count) => count === 1 ? 'repository' : 'repositories'
  const evidenceBasis = `${reached.length} reached · ${declaredOnly.length} declared only · ${notAffected.length} outside range${unknown.length ? ` · ${unknown.length} needs review` : ''}`

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
    <div className="case-decision-meta">{proofRoute && <div className="case-decision-route"><span>Primary evidence</span><strong>{proofRoute}</strong><small>{citedProofLabel(proofFinding)}{sourceCoverageLabel(proofFinding) ? ` · ${sourceCoverageLabel(proofFinding)}` : ''}</small>{proofSource && <SourceLink href={proofSource}>Open evidence</SourceLink>}</div>}<div className="case-decision-basis"><span>Evidence basis</span><strong>{evidenceBasis}</strong></div>{action && <button type="button" onClick={action.onClick}>{action.label}<ArrowUpRight size={13} /></button>}</div>
  </section>
}

function TemporalHighlight({ report, summary = {}, finding, challenge, earliestReached, onOpenHistory, onInspectProof, historyLoading = false, historical = false }) {
  const before = report?.rewind?.beforeAdvisory
  if (historical || !before) return null
  const published = report?.advisory?.published
  const memory = report?.rewind?.memory
  const memoryLabel = memory?.status === 'recalled'
    ? `HydraDB recalled ${memory.datedChunkCount || 0} dated fact${memory.datedChunkCount === 1 ? '' : 's'}`
    : memory?.status === 'queued'
      ? 'HydraDB memory is indexing'
      : memory?.status === 'skipped'
        ? 'Local dated evidence available'
        : 'Dated memory unavailable'
  const observedDate = earliestReached?.pathObservedAt?.slice(0, 10) || 'not dated'
  const publishedDate = published?.slice(0, 10) || 'not dated'
  const exposureLabel = summary.exposureDays != null ? `${summary.exposureDays.toLocaleString()} days before disclosure` : 'A dated comparison is available'
  const importer = finding?.imports?.[0]
  const currentVersion = finding?.resolvedVersion || finding?.resolvedVersions?.join(', ') || 'unresolved'
  const proposedVersion = challenge?.proposedVersion || 'not established'
  const pathTitle = finding?.verdict === 'REACHED' ? 'A source path exists' : finding?.verdict === 'DECLARED_ONLY' ? 'Declared, not imported' : finding?.verdict === 'NOT_AFFECTED' ? 'Outside the affected range' : 'Path needs review'
  const pathDetail = finding?.verdict === 'REACHED'
    ? `${finding.packageName || 'The package'}@${currentVersion} reaches ${importer?.path || 'sampled source'}.`
    : finding?.reason || 'The available evidence does not support a stronger conclusion.'
  const observedPath = findingParts(finding)
  const fixTitle = challenge?.status === 'FIX_SURVIVES'
    ? 'The proposed fix cuts the path'
    : challenge?.status === 'ALREADY_SAFE'
      ? 'No fix is needed for this resolution'
      : challenge?.status === 'NO_REACHABLE_PATH'
        ? 'Defense-in-depth update available'
        : challenge?.status === 'MANIFEST_CHANGE_REQUIRED'
          ? 'The manifest must change first'
          : 'Fix proof needs review'
  const fixDetail = challenge?.proposedVersion
    ? `${finding?.packageName || 'Package'} ${currentVersion} → ${proposedVersion}`
    : challenge?.detail || 'No advisory-backed fixed version was established.'
  return <section className="proof-loop" aria-label="Evidence proof loop">
    <div className="proof-loop-heading"><div><span className="section-kicker">Proof loop</span><h2>From observed path to defensible response.</h2><p>Every stage below is computed from the records collected for this case.</p></div><div className="proof-loop-heading-actions">{onInspectProof && <button type="button" onClick={onInspectProof}>Inspect path <ArrowUpRight size={13} /></button>}{onOpenHistory && <button type="button" onClick={onOpenHistory} disabled={historyLoading}>{historyLoading ? <LoaderCircle className="spin" size={13} /> : <Clock3 size={13} />}{historyLoading ? 'Rebuilding…' : 'Open dated view'}</button>}</div></div>
    <div className="proof-loop-path-block"><div className="proof-loop-path-heading"><span>Observed path</span><span>{observedPath.length ? `${observedPath.length} cited hops` : 'No path collected'}</span></div>{observedPath.length ? <div className="proof-loop-path" aria-label="Observed cited path">{observedPath.map((part, index) => { const source = traceSourceForPart(part, finding); const kind = traceKind(part, index, finding); return <div className="proof-loop-hop-wrap" key={`${part}-${index}`}><article className={`proof-loop-hop proof-loop-hop-${kind}`}><span>{kind}</span><strong>{shorten(routeDisplayPart(part, finding), 29)}</strong>{source ? <SourceLink href={source}>cite</SourceLink> : <small>not collected</small>}</article>{index < observedPath.length - 1 && <span className="proof-loop-hop-arrow" aria-hidden="true">→</span>}</div> })}</div> : <p className="proof-loop-path-empty">The available records do not support a source-backed path for the selected finding.</p>}</div>
    <div className="proof-loop-grid">
      <article className="proof-loop-step proof-loop-observed"><span className="proof-loop-index">01 · Observe</span><strong>{pathTitle}</strong><code>{repositoryName(finding?.repository) || 'repository not selected'}</code><p>{pathDetail}</p>{importer?.snippet && <code className="proof-loop-snippet">{importer.snippet}</code>}{importer?.sourceUrl ? <SourceLink href={importer.sourceUrl}>Open source line</SourceLink> : <span className="proof-loop-muted">source citation unavailable</span>}</article>
      <div className="proof-loop-arrow" aria-hidden="true">→</div>
      <article className="proof-loop-step proof-loop-fix"><span className="proof-loop-index">02 · Re-check</span><strong>{fixTitle}</strong><code>{fixDetail}</code><p>{challenge?.detail || 'The version-level challenge could not be completed from the available advisory evidence.'}</p><span className={`proof-loop-status ${['FIX_SURVIVES', 'ALREADY_SAFE'].includes(challenge?.status) ? 'is-verified' : ''}`}>{['FIX_SURVIVES', 'ALREADY_SAFE'].includes(challenge?.status) ? <Check size={12} /> : <CircleAlert size={12} />}{challenge?.status === 'FIX_SURVIVES' ? 'version proof verified' : challenge?.status === 'ALREADY_SAFE' ? 'already safe' : 'review required'}</span></article>
      <div className="proof-loop-arrow" aria-hidden="true">→</div>
      <article className="proof-loop-step proof-loop-history"><span className="proof-loop-index">03 · Remember</span><strong>{exposureLabel}</strong><code>{observedDate} → {publishedDate}</code><p>{earliestReached ? 'The path was visible in public repository history before the advisory was published.' : 'Recoil has a dated comparison boundary for this case.'}</p><span className="proof-loop-memory"><i className={`memory-mark ${memory?.status === 'recalled' ? '' : 'memory-mark-muted'}`} />{memoryLabel}</span></article>
    </div>
  </section>
}

function CaseScopeLine({ report, hydra, historical = false }) {
  const sampledFiles = report?.evidenceQuality?.sourceCoverage?.sampledFiles
  const entities = report?.graph?.nodes?.length
  const memory = report?.rewind?.memory || hydra?.recall
  const datedFacts = memory?.datedChunkCount
  const graphVerification = hydra?.graphVerification
  const memoryLabel = memory?.status === 'recalled'
    ? `${datedFacts || 0} dated facts recalled`
    : memory?.status === 'queued'
      ? 'dated facts indexing'
      : 'dated facts unavailable'
  const signals = [
    Number.isFinite(sampledFiles) ? `${sampledFiles} files sampled` : null,
    Number.isFinite(entities) ? `${entities} graph entities` : null,
    historical ? 'historical snapshot' : memoryLabel,
    graphVerification?.status === 'verified' ? `${graphVerification.tripletCount || 0} HydraDB graph relation${graphVerification.tripletCount === 1 ? '' : 's'} verified` : graphVerification?.status && graphVerification.status !== 'skipped' ? `HydraDB graph ${graphVerification.status.replaceAll('_', ' ')}` : null,
  ].filter(Boolean)
  if (!signals.length) return null
  return <div className="case-scope-line" aria-label="Evidence scope"><span>{signals.join(' · ')}</span><span className="case-scope-boundary">No install · no execution</span></div>
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
      ? 'The proposed version cuts the path'
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
  const importer = finding.imports?.[0]
  const importCount = finding.imports?.length || 0
  const sourceTitle = finding.verdict === 'REACHED'
    ? `${importCount} sampled import site${importCount === 1 ? '' : 's'}`
    : finding.verdict === 'DECLARED_ONLY'
      ? 'No sampled import'
      : finding.resolvedVersion || finding.resolvedVersions?.join(', ') || 'Resolution unavailable'
  const sourceDetail = finding.verdict === 'REACHED'
    ? importer ? `${importer.path}${importer.line ? `:${importer.line}` : ''}` : 'The source location was not collected.'
    : finding.verdict === 'DECLARED_ONLY'
      ? 'The affected package is present in the lockfile, but no sampled source file imports it.'
      : finding.verdict === 'NOT_AFFECTED'
        ? 'The resolved version is outside the advisory’s affected ranges.'
        : 'The available source evidence needs review.'
  const sourceUrl = importer?.sourceUrl || finding.lockfileSource || finding.evidenceSources?.[0]
  const currentVersion = finding.resolvedVersion || finding.resolvedVersions?.join(', ') || 'unresolved'
  const proposedVersion = challenge?.proposedVersion
  const fixVersionLine = proposedVersion
    ? challenge?.status === 'ALREADY_SAFE'
      ? `${finding.packageName} ${currentVersion} · no change required`
      : `${finding.packageName} ${currentVersion} → ${proposedVersion}`
    : 'No advisory-backed version change established'
  return <section className="evidence-trace" aria-label="Source-backed evidence trace">
    <div className="evidence-trace-heading"><div><span className="section-kicker">Selected route</span><h2>{title}</h2><p>{detail}</p></div><div className="evidence-trace-heading-status"><span>{citedProofLabel(finding)}</span><Verdict value={finding.verdict} /></div></div>
    <div className="evidence-trace-proof-grid">
      <article className="evidence-trace-proof evidence-trace-source">
        <span className="section-kicker">Source evidence</span>
        <strong>{sourceTitle}</strong>
        <code>{sourceDetail}</code>
        {sourceCoverageLabel(finding) && <small className="trace-coverage">{sourceCoverageLabel(finding)}</small>}
        {importer?.snippet && <pre>{importer.snippet}</pre>}
        {sourceUrl ? <SourceLink href={sourceUrl}>{importer?.sourceUrl ? 'Open source line' : 'Open cited record'}</SourceLink> : <span className="trace-source-missing">source citation unavailable</span>}
      </article>
      <article className="evidence-trace-proof evidence-trace-fix">
        <span className="section-kicker">Fix check</span>
        <strong>{fixTitle}</strong>
        <code>{fixVersionLine}</code>
        <p>{fixDetail}</p>
        <div className="trace-defense-actions"><span className={`trace-fix-status ${verified ? 'is-verified' : ''}`}>{verified ? <Check size={13} /> : <CircleAlert size={13} />}{verified ? 'verified' : historical ? 'historical view' : 'review required'}</span>{!historical && <button className="case-proof-link" type="button" onClick={onInspectProof}>Open fix details <ArrowUpRight size={13} /></button>}</div>
      </article>
    </div>
    <SourceImpactEvidence finding={finding} />
    <AdvisoryScopeEvidence finding={finding} />
    <ChangeProof finding={finding} />
  </section>
}

function CaseNavigator({ finding, activeTab, onTabChange, tabMeta = {} }) {
  const tabs = [{ id: 'graph', label: 'Paths' }, { id: 'proof', label: 'Fix' }, { id: 'history', label: 'History' }, { id: 'audit', label: 'Evidence' }]
  return <nav className="case-navigator" aria-label="Case views">
    <div className="case-navigator-selection">{finding && <><span>Selected route</span><strong>{repositoryName(finding.repository)}</strong><Verdict value={finding.verdict} compact /></>}</div>
    <div className="case-navigator-links" role="tablist" aria-label="Case views">
      {tabs.map((tab) => <button key={tab.id} id={`case-tab-${tab.id}`} type="button" role="tab" aria-controls="case-tab-panel" aria-selected={activeTab === tab.id} tabIndex={activeTab === tab.id ? 0 : -1} className={activeTab === tab.id ? 'active' : ''} onClick={() => onTabChange(tab.id)}><span>{tab.label}</span>{tabMeta[tab.id] && <small>{tabMeta[tab.id]}</small>}</button>)}
    </div>
  </nav>
}

function FinalReport({ report, hydra, evidenceStatus, onRewind, scenarioId }) {
  const [selectedIndex, setSelectedIndex] = useState(() => {
    const reachedIndex = report?.repositories?.findIndex((finding) => finding.verdict === 'REACHED') ?? -1
    return reachedIndex >= 0 ? reachedIndex : 0
  })
  const [selectedNodeId, setSelectedNodeId] = useState(null)
  const [activeTab, setActiveTab] = useState('graph')
  // Start with the cited path because it is the shortest truthful explanation
  // of the case. The complete observed graph remains one click away for
  // reviewers who want to inspect the wider topology.
  const [graphView, setGraphView] = useState(false)
  const [historyLoading, setHistoryLoading] = useState(false)
  const [historyTarget, setHistoryTarget] = useState(null)
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
  const hydraReady = hydra?.status === 'persisted' && hydra?.recall?.status === 'recalled' && !hydra?.indexingError
  const hydraSkipped = hydra?.status === 'skipped'
  const reportState = !recordingReady
    ? { label: 'Review required', icon: 'working', className: '' }
    : hydra?.recall?.status === 'failed'
      ? { label: 'HydraDB read failed', icon: 'failed', className: 'case-state-error' }
      : hydraReady
        ? { label: 'Recording-ready', icon: 'complete', className: 'case-state-ready' }
        : hydraSkipped
          ? { label: 'Local evidence ready', icon: 'complete', className: 'case-state-local' }
          : { label: 'HydraDB pending', icon: 'working', className: 'case-state-pending' }
  const total = summary.totalRepositories || findings.length
  const historicalDate = report?.rewind?.asOf?.slice(0, 10)
  const advisorySummary = report?.advisory?.summary
  const packageLabel = report?.package || 'package identity unavailable'
  const headline = historical
    ? summary.unknown ? `${summary.unknown} of ${total} repositories were not yet evidenced by ${historicalDate}.` : summary.reached ? `A source-backed path existed in ${summary.reached} of ${total} repositories by ${historicalDate}.` : 'No source-backed path was evidenced at this date.'
    : summary.unknown ? `${summary.unknown} of ${total} repositories need evidence.` : summary.reached ? `${summary.reached} of ${total} repositories import the affected version.` : total ? 'No sampled source path reaches the affected package.' : 'No repository was checked.'
  const summaryLine = advisorySummary
    ? advisorySummary.toLowerCase().includes(packageLabel.toLowerCase()) ? advisorySummary : `${advisorySummary} · ${packageLabel}`
    : `The report compares ${packageLabel} across the collected repositories.`
  const listedOnlyText = `${summary.declaredOnly || 0} ${summary.declaredOnly === 1 ? 'repository is' : 'repositories are'} listed without a sampled import`
  const outsideRangeText = `${summary.notAffected || 0} ${summary.notAffected === 1 ? 'is' : 'are'} already outside the affected range`
  const contrastText = [summary.declaredOnly ? listedOnlyText : null, summary.notAffected ? outsideRangeText : null].filter(Boolean).join(' and ')
  const resultExplanation = historical
    ? `This is the evidence graph rebuilt as of ${historicalDate}. Current remediation proof is hidden until you return to the present.`
    : summary.unknown
      ? 'The available records do not support a complete verdict yet.'
      : summary.reached && (summary.declaredOnly || summary.notAffected)
        ? `${summary.reached === 1 ? 'One repository needs attention.' : `${summary.reached} repositories need attention.`} ${contrastText}.`
        : 'A package can be present without being used. Recoil shows the source-backed path, its timing, and the fix check.'
  const earliestReached = findings.filter((finding) => finding.verdict === 'REACHED' && finding.pathObservedAt).sort((left, right) => new Date(left.pathObservedAt) - new Date(right.pathObservedAt))[0]
  const primaryFinding = findings.find((finding) => finding.verdict === 'REACHED') || selectedFinding
  const primaryChallenge = report?.challenge?.find((item) => item.repository === primaryFinding?.repository)
  const primaryReachIndex = findings.findIndex((finding) => finding.verdict === 'REACHED')
  const tabMeta = {
    graph: findings.length ? `${findings.length} path${findings.length === 1 ? '' : 's'}` : null,
    proof: historical ? 'current hidden' : summary.fixSurvives ? `${summary.fixSurvives} verified` : summary.reached ? 'review' : 'no change',
    history: report?.rewind?.beforeAdvisory ? summary.exposureDays != null ? `${summary.exposureDays.toLocaleString()}d` : 'dated' : 'not dated',
    audit: report?.sources?.length ? `${report.sources.length} sources` : null,
  }
  const inspectProof = (index = primaryReachIndex >= 0 ? primaryReachIndex : selectedIndex) => {
    if (index >= 0) setSelectedIndex(index)
    setActiveTab('proof')
    window.requestAnimationFrame(() => document.getElementById('case-proof')?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
  }
  const rewindTo = async (asOf) => {
    if (!onRewind || !asOf || historyLoading) return
    setHistoryLoading(true)
    setHistoryTarget(asOf)
    try {
      await onRewind(asOf)
    } finally {
      setHistoryLoading(false)
      setHistoryTarget(null)
    }
  }
  const openHistory = async () => {
    setActiveTab('history')
    if (!historical && report?.rewind?.beforeAdvisory) await rewindTo(report.rewind.beforeAdvisory)
    window.requestAnimationFrame(() => document.getElementById('case-history')?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
  }
  const historyAction = historical
    ? report?.rewind?.currentAsOf ? () => rewindTo(report.rewind.currentAsOf) : null
    : report?.rewind?.beforeAdvisory ? openHistory : null
  const changeTab = (tab) => {
    setActiveTab(tab)
    window.requestAnimationFrame(() => document.getElementById('case-tab-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
  }
  return <main className="case-page">
    <section className={`case-hero ${historical ? 'case-hero-historical' : ''}`}><div><span className="section-kicker">{historical ? 'Historical evidence' : 'Evidence report'}</span><h1>{headline}</h1><div className="case-advisory"><strong>{report?.advisory?.id || 'Advisory unavailable'}</strong><span>{summaryLine}</span></div><p>{resultExplanation}</p><CaseScopeLine report={report} hydra={hydra} historical={historical} /></div><div className="case-actions"><span className={`case-state ${reportState.className}`}><StatusIcon status={reportState.icon} /> {reportState.label}</span><div className="case-export-actions"><BriefLink scenarioId={scenarioId} /><ReceiptLink scenarioId={scenarioId} /></div></div></section>
    <CaseFactsLine summary={summary} historical={historical} onOpenProof={() => inspectProof()} onOpenHistory={historyAction} />
    <CaseNavigator finding={selectedFinding} activeTab={activeTab} onTabChange={changeTab} tabMeta={tabMeta} />
    <div className="case-tab-panel" id="case-tab-panel" role="tabpanel" aria-labelledby={`case-tab-${activeTab}`}>
      {activeTab === 'graph' && <><div className={`case-workspace ${graphView && !historical ? 'case-workspace-graph' : 'case-workspace-paths'}`} id="case-graph"><EvidenceMap report={{ ...report, repositories: findings, graph: historical ? report?.rewind?.graph || { nodes: [], edges: [] } : report?.graph }} selectedFinding={selectedFinding} onSelectFinding={setSelectedIndex} onSelectNode={setSelectedNodeId} selectedNodeId={selectedNodeId} proofFirst={!graphView && !historical} historical={historical} onToggleGraph={() => setGraphView((value) => !value)} /><RouteList findings={findings} selectedIndex={selectedIndex} onSelect={(index) => { setSelectedIndex(index); setSelectedNodeId(null) }} challenges={historical ? [] : report?.challenge || []} correlations={report?.crossRepositoryCorrelations || []} historical={historical} compact={!graphView && !historical} onInspectProof={() => inspectProof(selectedIndex)} /></div><EvidenceTrace finding={selectedFinding} challenge={challenge} historical={historical} onInspectProof={() => inspectProof(selectedIndex)} /></>}
      {activeTab === 'proof' && <><CaseDecisionCallout findings={findings} challenges={historical ? [] : report?.challenge || []} packageName={report?.package} historical={historical} onInspectProof={() => inspectProof()} onOpenHistory={historical ? () => rewindTo(report?.rewind?.currentAsOf) : null} /><TemporalHighlight report={report} summary={summary} finding={primaryFinding} challenge={primaryChallenge} earliestReached={earliestReached} onInspectProof={() => inspectProof(primaryReachIndex >= 0 ? primaryReachIndex : selectedIndex)} onOpenHistory={!historical && report?.rewind?.beforeAdvisory ? openHistory : null} historyLoading={historyLoading} historical={historical} /><RouteProof finding={selectedFinding} challenge={challenge} /></>}
      {activeTab === 'history' && <><HydraComparisonLine findings={findings} challenges={historical ? [] : report?.challenge || []} report={report} hydra={hydra} historical={historical} /><CaseChronology finding={selectedFinding} report={report} challenge={challenge} historical={historical} onOpenHistory={historical ? () => rewindTo(report?.rewind?.currentAsOf) : null} /><TemporalProof report={report} onRewind={rewindTo} loading={historyLoading} loadingTarget={historyTarget} /></>}
      {activeTab === 'audit' && <IntegrityDetails report={report} hydra={hydra} evidenceStatus={evidenceStatus} />}
    </div>
    <CaseConclusion report={report} findings={findings} summary={summary} historical={historical} hydra={hydra} />
  </main>
}

function RunningView({ snapshot, onOpenReport }) {
  const [selectedNodeId, setSelectedNodeId] = useState(null)
  const investigation = snapshot?.investigation
  const events = investigation?.events || []
  const finalizing = investigation?.status === 'finalizing'
  const activity = currentInvestigationActivity(events, investigation?.status)
  const query = snapshot?.scenario?.query || investigation?.query || ''
  const advisory = query.match(/(?:GHSA|CVE)-[A-Z0-9-]+/i)?.[0] || query.split(/\s+/).find(Boolean) || 'public evidence'
  const repositoryCount = (query.match(/https?:\/\/github\.com\/[^\s]+/gi) || []).length
  const graph = snapshot?.graph?.nodes?.length ? snapshot.graph : investigation?.graph || investigation?.evidence?.graph || { nodes: [], edges: [] }
  const graphReport = { graph, repositories: investigation?.report?.repositories || [] }
  const selectedLiveNode = graph.nodes.find((node) => node.id === selectedNodeId)
  const selectedLiveFindingIndex = findingIndexForNode(selectedLiveNode, graphReport.repositories)
  const activeRepository = events.find((event) => event.status === 'working' && event.repository)?.repository
    || graphReport.repositories.find((finding) => finding.verdict === 'REACHED')?.repository
    || graphReport.repositories[0]?.repository
  const activeLiveFinding = graphReport.repositories.find((finding) => repositoryKey(finding.repository) === repositoryKey(activeRepository)) || null
  const selectedLiveFinding = selectedLiveFindingIndex >= 0 ? graphReport.repositories[selectedLiveFindingIndex] : activeLiveFinding
  const progress = snapshot?.graphProgress || investigation?.graphProgress
  const progressLabel = progress?.totalRepositories ? `${progress.completedRepositories || 0} of ${progress.totalRepositories} repositories mapped` : 'Preparing the case'
  const activityTitle = activity?.title || (finalizing ? 'Storing evidence history' : 'Collecting public evidence')
  const activityDetail = activity?.detail || (finalizing ? 'The observed graph is complete. Recoil is writing dated history and recalling related context.' : 'Recoil adds only relationships supported by public evidence.')
  return <main className="live-page"><div className="live-heading"><div><span className="section-kicker">Live investigation</span><div className="live-subject"><strong>{advisory}</strong><span>{repositoryCount ? `against ${repositoryCount} public repositor${repositoryCount === 1 ? 'y' : 'ies'}` : 'public records only'}</span></div><h1 aria-live="polite" aria-atomic="true">{activityTitle}</h1><p aria-live="polite" aria-atomic="true">{progressLabel}. {activityDetail}</p></div><span className="live-safety">No install · no execution</span></div><LiveStageRail events={events} investigationStatus={investigation?.status} />{finalizing && <LiveEvidenceCheckpoint report={investigation?.report} hydra={snapshot?.hydra || investigation?.hydra} onOpenReport={onOpenReport} />}<div className="live-workspace"><EventStream events={events} investigationStatus={investigation?.status} query={query} graphProgress={progress} report={investigation?.report} /><EvidenceMap report={graphReport} selectedFinding={selectedLiveFinding} selectedNodeId={selectedNodeId} onSelectNode={setSelectedNodeId} events={events} live graphProgress={progress} /></div></main>
}

function FailedView({ snapshot, onNewCase }) {
  const investigation = snapshot?.investigation || {}
  const events = investigation.events || []
  const failedEvent = [...events].reverse().find((event) => event.status === 'failed')
  const completedEvents = events.filter((event) => ['complete', 'persisted'].includes(event.status))
  const graph = snapshot?.graph?.nodes?.length ? snapshot.graph : investigation.graph || investigation.evidence?.graph || { nodes: [], edges: [] }
  const sources = new Set(events.flatMap((event) => event.sourceUrls || []).filter(Boolean))
  const lastCompleted = completedEvents.at(-1)
  const query = snapshot?.scenario?.query || investigation.query || ''
  return <main className="failure-page">
    <section className="failure-hero">
      <div>
        <span className="section-kicker">Investigation stopped</span>
        <h1>We could not finish this case.</h1>
        <p>Recoil kept the public evidence collected before the failure. Nothing was installed, executed, or presented as a completed verdict.</p>
      </div>
      <button className="failure-new-case" type="button" onClick={onNewCase}><RotateCcw size={14} /> Start a new case</button>
    </section>
    <section className="failure-summary" aria-label="Investigation failure summary">
      <div><span>Last completed step</span><strong>{lastCompleted?.title || 'No step completed'}</strong><small>{lastCompleted?.detail || 'The first public record could not be read.'}</small></div>
      <div><span>Evidence retained</span><strong>{graph.nodes?.length || 0} nodes · {graph.edges?.length || 0} edges</strong><small>Partial evidence remains inspectable, not a final report.</small></div>
      <div><span>Sources observed</span><strong>{sources.size}</strong><small>Only URLs emitted by completed collectors are counted.</small></div>
    </section>
    <section className="failure-detail">
      <div className="failure-detail-copy"><span className="section-kicker">What stopped the run</span><h2>{failedEvent?.title || 'Investigation failed'}</h2><p>{failedEvent?.detail || investigation.error || 'The server stopped before it could produce a source-backed report.'}</p><code>{query}</code></div>
      <div className="failure-steps"><span className="section-kicker">Completed before stop</span>{completedEvents.length ? completedEvents.slice(-5).map((event) => <div key={event.id || event.key}><Check size={14} /><span><strong>{event.title}</strong><small>{event.detail}</small></span></div>) : <p>No completed evidence step was recorded.</p>}</div>
    </section>
    {!!graph.nodes?.length && <section className="failure-evidence"><div className="failure-evidence-heading"><div><span className="section-kicker">Partial evidence</span><h2>What Recoil was able to observe</h2></div><span>{graph.nodes.length} nodes · {graph.edges?.length || 0} relationships</span></div><EvidenceMap report={{ graph, repositories: investigation.report?.repositories || [] }} events={events} live graphProgress={investigation.graphProgress} /></section>}
  </main>
}

function App() {
  const [input, setInput] = useState(DEFAULT_INPUT)
  const [scenarioId, setScenarioId] = useState(initialScenarioId)
  const [landing, setLanding] = useState(initialLanding)
  const [snapshot, setSnapshot] = useState(null)
  const [report, setReport] = useState(null)
  const [hydra, setHydra] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [showReportEarly, setShowReportEarly] = useState(false)
  const [theme, toggleTheme] = useTheme()
  const investigation = snapshot?.investigation

  useEffect(() => {
    window.localStorage.setItem(SCENARIO_STORAGE_KEY, scenarioId)
  }, [scenarioId])

  useEffect(() => {
    let active = true
    if (landing) return undefined
    api(`/api/scenarios/${scenarioId}`).then((next) => { if (active) setSnapshot(next) }).catch((cause) => { if (active) setError(`Recoil API unavailable. Start the app with npm run start. ${cause.message}`) })
    return () => { active = false }
  }, [landing, scenarioId])

  useEffect(() => {
    const activeStatus = snapshot?.investigation?.status
    const hydraPending = snapshot?.investigation?.hydra?.indexingPending === true
    const shouldPoll = busy || ['running', 'finalizing'].includes(activeStatus) || activeStatus === 'complete' && hydraPending
    if (!shouldPoll) return undefined
    let cancelled = false
    const poll = async () => {
      try {
        const next = await api(`/api/scenarios/${scenarioId}`)
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
  }, [busy, scenarioId, snapshot?.investigation?.status])

  const activeReport = report || investigation?.report
  const hasInvestigation = Boolean(investigation && investigation.status !== 'idle')
  const isComplete = investigation?.status === 'complete' && activeReport

  async function investigate() {
    if (!input.trim() || busy) return
    setBusy(true); setError(''); setReport(null); setHydra(null); setShowReportEarly(false)
    try {
      const created = await api('/api/scenarios', { method: 'POST', body: JSON.stringify({ query: input.trim() }) })
      const nextScenarioId = created.scenarioId || created.id || created.scenario?.id
      if (!nextScenarioId) throw new Error('The API did not return a case ID')
      window.localStorage.removeItem(LANDING_STORAGE_KEY)
      setLanding(false)
      setScenarioId(nextScenarioId)
      const next = await api(`/api/scenarios/${nextScenarioId}/investigate`, { method: 'POST', body: JSON.stringify({ query: input.trim() }) })
      setSnapshot(next)
    } catch (cause) { setBusy(false); setError(cause.message) }
  }

  async function rewind(asOf) {
    if (!activeReport || !asOf) return
    try {
      const next = await api(`/api/scenarios/${scenarioId}/rewind`, { method: 'POST', body: JSON.stringify({ asOf }) })
      setReport(next.report)
      const recalled = next.hydra || { status: 'failed', reason: 'The temporal read returned no summary.' }
      setHydra({ ...(investigation?.hydra || {}), recall: recalled, temporalRecall: recalled })
    } catch (cause) { setError(cause.message) }
  }

  function newInvestigation() {
    // A new case gets its own server-side record on the next submission. The
    // completed case remains available in HydraDB instead of being destroyed
    // by a UI reset.
    window.localStorage.setItem(LANDING_STORAGE_KEY, '1')
    setLanding(true); setSnapshot(null); setReport(null); setHydra(null); setError(''); setInput(DEFAULT_INPUT); setShowReportEarly(false); setBusy(false)
  }

  if (!hasInvestigation) return <Landing value={input} setValue={setInput} onSubmit={investigate} busy={busy} error={error} theme={theme} onToggleTheme={toggleTheme} />
  const showReport = Boolean(activeReport && (isComplete || showReportEarly))
  return <div className="product-shell"><InvestigationHeader investigation={investigation} hydra={hydra || investigation?.hydra} onNewCase={newInvestigation} theme={theme} onToggleTheme={toggleTheme} />{showReport ? <FinalReport report={activeReport} hydra={hydra || investigation?.hydra} evidenceStatus={investigation?.evidence?.status || 'unknown'} onRewind={rewind} scenarioId={scenarioId} /> : investigation?.status === 'failed' ? <FailedView snapshot={snapshot} onNewCase={newInvestigation} /> : <RunningView snapshot={snapshot} onOpenReport={() => setShowReportEarly(true)} />}{error && investigation?.status !== 'failed' && <div className="floating-error"><CircleAlert size={14} /> {error}</div>}</div>
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
