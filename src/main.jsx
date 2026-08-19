import { Component, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { ArrowUpRight, Check, ChevronDown, CircleAlert, CircleCheck, Clock3, Download, ExternalLink, LoaderCircle, RotateCcw, Search, ShieldCheck } from 'lucide-react'
import './style.css'

const SCENARIO_ID = '0017'
const DEFAULT_INPUT = ''
const INVESTIGATION_EXAMPLES = [
  {
    label: 'three-repository case',
    value: 'GHSA-xvch-5gv4-984h\nhttps://github.com/gitpod-io/openvscode-server/tree/3381c7c\nhttps://github.com/dojo/dojo\nhttps://github.com/axios/axios',
  },
  {
    label: 'package + repositories',
    value: 'npm:minimist\nhttps://github.com/dojo/dojo\nhttps://github.com/axios/axios',
  },
  {
    label: 'single repository',
    value: 'GHSA-xvch-5gv4-984h\nhttps://github.com/dojo/dojo',
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

function StatusIcon({ status }) {
  if (status === 'complete' || status === 'persisted') return <Check size={14} strokeWidth={2.5} />
  if (status === 'failed') return <CircleAlert size={14} />
  if (status === 'working') return <LoaderCircle className="spin" size={14} />
  if (status === 'skipped') return <span className="status-dash">—</span>
  return <span className="status-dot" />
}

function SourceLink({ href, children }) {
  if (!href) return <span className="source-link muted-source">source unavailable</span>
  return <a className="source-link" href={href} target="_blank" rel="noreferrer">{children || sourceHost(href)} <ExternalLink size={11} /></a>
}

function Landing({ value, setValue, onSubmit, busy, error }) {
  return <main className="landing-page">
    <div className="landing-wordmark"><span className="wordmark-mark" /> RECOIL <span>evidence proof</span></div>
    <section className="landing-content">
      <p className="eyebrow">PUBLIC SUPPLY-CHAIN EVIDENCE</p>
      <h1>Which repositories<br /><i>actually reach</i> vulnerable code?</h1>
      <p className="landing-lede">Give Recoil an advisory and the repositories you care about. It reads the public record, proves the path, rewinds the timeline, and checks the fix.</p>
      <form className="investigate-form" onSubmit={(event) => { event.preventDefault(); onSubmit() }}>
        <label htmlFor="investigation-input">Advisory, package, or repository URLs</label>
        <textarea id="investigation-input" value={value} onChange={(event) => setValue(event.target.value)} placeholder="GHSA-… or npm:package@version\nhttps://github.com/org/repository" rows={4} />
        <div className="form-footer"><span>Nothing is installed or executed.</span><button type="submit" disabled={busy}>{busy ? <><LoaderCircle className="spin" size={14} /> Reading</> : <>Investigate <ArrowUpRight size={15} /></>}</button></div>
      </form>
      <div className="example-picker" aria-label="Example investigations">
        <span className="example-picker-label">try a shape</span>
        {INVESTIGATION_EXAMPLES.map((example) => <button className="example-chip" key={example.label} type="button" onClick={() => setValue(example.value)}>{example.label}</button>)}
      </div>
      <div className="example-row"><span>input format</span><span>GHSA or CVE + one to four public GitHub repository URLs</span></div>
      {error && <div className="error-banner" role="alert"><CircleAlert size={15} /> {error}</div>}
    </section>
    <footer className="landing-footer"><span>OSV · npm · GitHub · HydraDB</span><span>Observed facts are cited. Inference is labeled.</span></footer>
  </main>
}

function InvestigationHeader({ investigation, hydra }) {
  const report = investigation?.report
  const id = report?.advisory?.id || investigation?.evidence?.target?.advisoryId || 'investigation'
  const state = investigation?.status === 'complete' ? 'complete' : investigation?.status === 'failed' ? 'failed' : 'working'
  const hydraReadFailed = hydra?.recall?.status === 'failed'
  return <header className="product-header">
    <div className="header-brand"><span className="wordmark-mark" /> RECOIL <span>evidence proof</span></div>
    <div className="header-case"><span>{id}</span><small>{state === 'complete' ? 'case complete' : state === 'failed' ? 'incomplete' : 'investigating'}</small></div>
    <div className="header-status"><span className={`connection-mark ${hydraReadFailed || hydra?.status === 'failed' ? 'is-failed' : hydra?.status === 'persisted' ? 'is-live' : ''}`} /> {hydraReadFailed ? 'HydraDB read failed' : hydra?.status === 'persisted' ? 'HydraDB stored' : hydra?.status === 'queued' ? 'HydraDB indexing' : hydra?.status === 'failed' ? 'HydraDB unavailable' : 'local evidence record'}</div>
  </header>
}

function EventStream({ events = [] }) {
  return <section className="event-stream" aria-label="Investigation progress">
    {events.map((event) => <article className={`event-row event-${event.status}`} key={event.id || event.key}>
      <div className="event-status"><StatusIcon status={event.status} /></div>
      <div className="event-copy"><div className="event-title"><strong>{event.title}</strong>{event.repository && <span>{event.repository}</span>}</div><p>{event.detail}</p>{event.sourceUrls?.[0] && <SourceLink href={event.sourceUrls[0]} />}</div>
      {event.status === 'working' && <span className="event-now">now</span>}
    </article>)}
  </section>
}

function Verdict({ value }) {
  const label = value === 'REACHED' ? 'Reached' : value === 'DECLARED_ONLY' ? 'Declared only' : value === 'NOT_AFFECTED' ? 'Not affected' : value === 'NOT_YET_OBSERVED' ? 'Not observed yet' : 'Unknown'
  return <span className={`verdict verdict-${value?.toLowerCase()}`}>{value === 'REACHED' ? <CircleAlert size={14} /> : value === 'NOT_AFFECTED' ? <CircleCheck size={14} /> : <span className="verdict-dot" />}{label}</span>
}

function EvidencePath({ finding, advisorySource }) {
  const sources = [advisorySource, finding.repositoryUrl, ...(finding.imports || []).map((item) => item.sourceUrl), ...(finding.evidenceSources || [])].filter(Boolean)
  const uniqueSources = [...new Set(sources)]
  const dependencyHops = (finding.dependencyPath || []).map((item) => `${item.name}@${item.version}`)
  const displayedPath = dependencyHops.length > 1
    ? [...(finding.path || []).slice(0, 1), ...dependencyHops, ...(finding.path || []).slice(2)]
    : finding.path || []
  const labelFor = (part) => {
    const symbol = String(part).match(/^symbol:([^@]+)@(.+):(\d+)$/)
    return symbol ? `${symbol[1]} · ${symbol[2]}:${symbol[3]}` : part
  }
  return <div className="proof-path">
    <div className="path-line">{displayedPath.map((part, index) => <span className="path-hop" key={`${part}-${index}`}><span title={part}>{labelFor(part)}</span>{index < displayedPath.length - 1 && <b>→</b>}</span>)}</div>
    {finding.proof?.length > 0 ? <div className="proof-chain" aria-label="Evidence proof chain">{finding.proof.map((step, index) => <div className={`proof-step proof-step-${step.status}`} key={`${step.kind}-${step.label}-${index}`}><span className="proof-step-kind">{step.kind}</span><strong>{step.label}</strong><span className="proof-step-detail">{step.detail}</span>{step.source ? <SourceLink href={step.source}>{sourceHost(step.source)}</SourceLink> : <span className="proof-step-source">no source</span>}</div>)}</div> : <div className="path-sources">{uniqueSources.slice(0, 4).map((source) => <SourceLink href={source} key={source}>{sourceHost(source)}</SourceLink>)}</div>}
  </div>
}

function RepositoryFinding({ finding, advisorySource }) {
  const versions = finding.resolvedVersions?.length > 1 ? finding.resolvedVersions.join(', ') : finding.resolvedVersion || 'unresolved'
  return <details className={`repository-finding finding-${finding.verdict?.toLowerCase()}`}>
    <summary><div className="finding-main"><Verdict value={finding.verdict} /><strong>{finding.repository || 'Unknown repository'}</strong></div><div className="finding-version">{finding.packageName}@{versions} <ChevronDown size={15} /></div></summary>
    <div className="finding-detail"><p className="finding-reason">{finding.reason}</p><EvidencePath finding={finding} advisorySource={advisorySource} />{finding.advisoryScope?.status === 'VALIDATED_SYMBOL' && <p className="scope-proof">Advisory scope matched indexed symbol{finding.advisoryScope.symbols.length === 1 ? '' : 's'}: {finding.advisoryScope.symbols.map((symbol) => `${symbol.name} (${symbol.path}:${symbol.line})`).join(', ')}</p>}{finding.changeEvidence?.importerFilesChanged?.length > 0 && <p className="change-note">Latest public change touched the importing file{finding.changeEvidence.importerFilesChanged.length === 1 ? '' : 's'}: {finding.changeEvidence.importerFilesChanged.map((item) => item.path).join(', ')}{finding.changeEvidence.sourceUrl && <> · <SourceLink href={finding.changeEvidence.sourceUrl}>commit</SourceLink></>}</p>}<dl className="finding-facts"><div><dt>declared range</dt><dd>{finding.declaredRange || 'not found'}</dd></div><div><dt>sampled imports</dt><dd>{finding.imports?.length || 0}</dd></div><div><dt>source boundary</dt><dd>{finding.sourceBound || 'not recorded'}</dd></div><div><dt>fix</dt><dd>{finding.targetVersion ? `${finding.targetVersion}${finding.rangeAllowsFix ? ' · range allows it' : ' · manifest change required'}` : 'not available'}</dd></div>{finding.exposureDays !== null && finding.exposureDays !== undefined && <div><dt>exposure window</dt><dd>{finding.exposureDays} days before publication</dd></div>}</dl></div>
  </details>
}

function EvidenceQuality({ quality }) {
  if (!quality) return null
  const complete = quality.readyForRecording
  const sourceCoverage = quality.sourceCoverage
  const blockers = [
    ...(quality.collectorIssues || []).map((item) => `${item.collector}: ${item.status}`),
    ...(quality.unknownFindings || []).map((item) => `${item.repository}: ${item.verdict}`),
  ]
  return <section className={`evidence-quality quality-${quality.status}`} aria-label="Evidence quality">
    <div className="quality-copy"><p className="eyebrow">EVIDENCE STATUS</p><strong>{complete ? 'Ready to record' : quality.status === 'review' ? 'Review before recording' : 'Evidence collection incomplete'}</strong><p>{quality.reason}</p>{blockers.length > 0 && <p className="quality-blockers">{blockers.slice(0, 3).join(' · ')}{blockers.length > 3 ? ` · +${blockers.length - 3} more` : ''}</p>}</div>
    <div className="quality-facts"><span>{quality.unknownFindings?.length || 0}<small>unclassified</small></span><span>{quality.ambiguousVersions?.length || 0}<small>version ambiguities</small></span>{sourceCoverage && <span>{sourceCoverage.sampledFiles}/{sourceCoverage.candidateFiles}<small>source files sampled</small></span>}</div>
  </section>
}

function CrossRepositoryEvidence({ correlations = [] }) {
  if (!correlations.length) return null
  return <section className="correlation-section" aria-label="Cross-repository evidence">
    <div className="section-heading"><div><p className="eyebrow">CROSS-REPOSITORY EVIDENCE</p><h2>Where the same version appears</h2></div><span>{correlations.length} shared resolution{correlations.length === 1 ? '' : 's'}</span></div>
    <p className="correlation-lede">These links come from observed lockfile resolutions across the repositories in this case. They show dependency overlap, not runtime compromise.</p>
    <div className="correlation-list">{correlations.map((correlation) => <div className="correlation-row" key={`${correlation.packageName}@${correlation.version}`}><strong>{correlation.packageName}@{correlation.version}</strong><div>{correlation.repositories.map((repository) => <span key={repository.repository}><Verdict value={repository.verdict} /> {repository.repository}</span>)}</div></div>)}</div>
  </section>
}

function Rewind({ report, activeReport, onSelect }) {
  const before = report?.rewind?.beforeAdvisory
  const current = report?.rewind?.currentAsOf || report?.rewind?.asOf || new Date().toISOString()
  if (!before) return <section className="rewind-section rewind-unavailable"><div><p className="eyebrow">TEMPORAL EVIDENCE</p><h2>Rewind unavailable for this case.</h2><p>No dated lockfile history was collected, so Recoil will not invent an exposure window.</p></div></section>
  const active = activeReport?.rewind?.asOf === before ? 'before' : 'current'
  const memory = activeReport?.rewind?.memory
  return <section className="rewind-section"><div className="rewind-copy"><p className="eyebrow">TEMPORAL EVIDENCE · HYDRADB</p><h2>What was true when?</h2><p>Same evidence graph, different point in time. The advisory became public on {report.advisory?.published?.slice(0, 10)}. Showing evidence as of {activeReport?.rewind?.asOf?.slice(0, 10)}.</p>{memory && <p className="rewind-memory">HydraDB temporal read · {memory.status} · {memory.datedChunkCount} dated fact{memory.datedChunkCount === 1 ? '' : 's'} · {memory.relatedCaseCount} related case{memory.relatedCaseCount === 1 ? '' : 's'} · {memory.graphContext?.tripletCount || 0} graph triplet{memory.graphContext?.tripletCount === 1 ? '' : 's'}</p>}<div className="temporal-findings">{(activeReport?.rewind?.findings || []).map((finding) => <div key={finding.repository}><span>{finding.repository}</span><Verdict value={finding.verdict} /></div>)}</div></div><div className="rewind-controls"><button className={active === 'before' ? 'active' : ''} onClick={() => onSelect(before)}><Clock3 size={14} /><span>Before advisory</span><small>{before.slice(0, 10)}</small></button><button className={active === 'current' ? 'active' : ''} onClick={() => onSelect(current)}><Search size={14} /><span>Current record</span><small>{current.slice(0, 10)}</small></button></div></section>
}

function HydraProof({ hydra, graphContext }) {
  const status = hydra?.status || 'skipped'
  const recall = hydra?.recall
  const recallFailed = recall?.status === 'failed'
  const triplets = graphContext?.triplets || []
  const relatedCases = recall?.relatedCases || []
  const label = recallFailed ? 'Stored; temporal read failed' : status === 'persisted' ? 'Stored and queried' : status === 'queued' ? 'Stored; indexing is still queued' : status === 'failed' ? 'HydraDB write failed' : 'Local replay only'
  const description = recallFailed
    ? recall.error || 'HydraDB accepted the write, but the temporal query did not complete.'
    : status === 'skipped'
    ? hydra?.reason || 'Configure HydraDB to persist this case.'
    : status === 'failed'
      ? hydra?.error || 'The local evidence report is complete, but HydraDB did not accept the write.'
      : `${hydra?.indexingError ? `${hydra.indexingError} ` : ''}Recoil wrote ${hydra?.memoryCount || 0} evidence memories with dated validity and retrieved ${recall?.datedChunkCount || 0} dated facts from ${recall?.relatedCaseCount || 0} prior case${recall?.relatedCaseCount === 1 ? '' : 's'}.`
  return <section className={`hydra-proof hydra-${recallFailed ? 'failed' : status}`}><div><p className="eyebrow">TEMPORAL MEMORY · HYDRADB</p><h2>{label}</h2><p>{description}</p></div><div className="hydra-proof-stat"><strong>{hydra?.memoryCount || 0}</strong><span>memories written</span></div><div className="hydra-proof-stat"><strong>{recall?.datedChunkCount || 0}</strong><span>dated facts recalled</span></div>{relatedCases.length > 0 && <details className="hydra-related-receipt"><summary>Prior evidence · {relatedCases.length} related case{relatedCases.length === 1 ? '' : 's'}</summary><div className="hydra-related-cases">{relatedCases.slice(0, 8).map((relatedCase) => <div key={relatedCase.scenarioId}><div><strong>{relatedCase.scenarioId}</strong><span>{relatedCase.kinds.join(' · ') || 'evidence'}</span></div><span>{relatedCase.repositories.join(', ') || 'repository not recorded'}{relatedCase.validFrom ? ` · from ${relatedCase.validFrom.slice(0, 10)}` : ''}</span>{relatedCase.sourceUrls[0] && <SourceLink href={relatedCase.sourceUrls[0]}>source</SourceLink>}</div>)}</div></details>}{triplets.length > 0 && <details className="hydra-graph-receipt"><summary>Graph context · {triplets.length} returned triplet{triplets.length === 1 ? '' : 's'}</summary><div className="hydra-triplets">{triplets.slice(0, 12).map((triplet, index) => <div key={`${triplet.source}-${triplet.predicate}-${triplet.target}-${index}`}><span>{triplet.source}</span><b>{triplet.predicate || 'CONNECTED_TO'}</b><span>{triplet.target}</span></div>)}</div></details>}</section>
}

function ReceiptLink() {
  return <a className="receipt-link" href={`/api/scenarios/${SCENARIO_ID}/receipt`} download="recoil-evidence-receipt.json"><Download size={14} /> Download evidence receipt</a>
}

function FinalReport({ report, hydra, onRewind }) {
  const summary = report?.summary || {}
  const scope = report?.advisoryScope || {}
  const quality = report?.evidenceQuality || {}
  const confirmedHeadline = quality.readyForRecording ? `${summary.reached || 0} of ${summary.totalRepositories || 0} repositories` : `${summary.reached || 0} confirmed path${summary.reached === 1 ? '' : 's'}`
  const scopeLabel = scope.status === 'completed'
    ? `${scope.affectedSymbols?.length || 0} advisory symbol candidate${scope.affectedSymbols?.length === 1 ? '' : 's'} checked against indexed code`
    : scope.status === 'failed'
      ? 'advisory scope unavailable; deterministic module-level package proof remains authoritative'
      : 'module-level package proof; symbol scope not enabled'
  return <main className="report-page">
    <section className="verdict-block"><p className="eyebrow">CASE RESULT</p><h1>{confirmedHeadline}<br /><i>{quality.readyForRecording ? 'reach vulnerable code.' : 'found so far.'}</i></h1><p className="verdict-lede">Recoil found {summary.reached || 0} reachable path{summary.reached === 1 ? '' : 's'}, {summary.declaredOnly || 0} declared-only dependency{summary.declaredOnly === 1 ? '' : 'ies'}, and {summary.notAffected || 0} repository{summary.notAffected === 1 ? '' : 'ies'} already outside the affected range.{summary.unknown ? ` ${summary.unknown} repository${summary.unknown === 1 ? '' : 'ies'} remain unclassified and are not counted as safe.` : ''}</p><div className="verdict-proof"><ShieldCheck size={17} /><span>Reachability is based on cited lockfile and sampled source imports. It is not a claim of compromise.</span></div><p className="scope-proof">Advisory scope · {scopeLabel}</p><ReceiptLink /></section>
    <EvidenceQuality quality={quality} />
    <CrossRepositoryEvidence correlations={report?.crossRepositoryCorrelations} />
    <section className="findings-section"><div className="section-heading"><div><p className="eyebrow">REPOSITORY FINDINGS</p><h2>What the evidence proves</h2></div><span>{report?.sources?.length || 0} public sources</span></div><div className="finding-list">{(report?.repositories || []).map((finding) => <RepositoryFinding key={finding.repository} finding={finding} advisorySource={report.advisory?.sourceUrl} />)}</div></section>
    <Rewind report={report} activeReport={report} onSelect={onRewind} />
    <HydraProof hydra={hydra} graphContext={report?.rewind?.memory?.graphContext} />
    <section className="fix-section"><div className="section-heading"><div><p className="eyebrow">ADVERSARIAL FIX CHECK</p><h2>Can the proposed fix survive?</h2></div><span>Red → Blue → Red</span></div><div className="fix-list">{(report?.challenge || []).map((item) => <div className={`fix-row fix-${item.status.toLowerCase()}`} key={item.repository}><div className="fix-icon">{item.status === 'FIX_SURVIVES' ? <Check size={15} /> : <CircleAlert size={15} />}</div><div><strong>{item.repository}</strong><p>{item.detail}</p></div><span>{item.proposedVersion || item.status.replaceAll('_', ' ').toLowerCase()}</span></div>)}</div></section>
    <details className="graph-proof"><summary><span>Observed graph · {report?.graph?.nodes?.length || 0} nodes · {report?.graph?.edges?.length || 0} edges</span><ChevronDown size={15} /></summary><div className="graph-edge-list">{(report?.graph?.edges || []).slice(0, 32).map(([from, to]) => <div key={`${from}-${to}`}><span>{from}</span><b>→</b><span>{to}</span></div>)}</div></details>
    <section className="limits-section"><p className="eyebrow">LIMITS & PROVENANCE</p>{(report?.limits || []).map((limit) => <p key={limit}>— {limit}</p>)}<div className="source-footer">{(report?.sources || []).slice(0, 8).map((source) => <SourceLink href={source} key={source}>{sourceHost(source)}</SourceLink>)}</div></section>
  </main>
}

function RunningView({ snapshot }) {
  const investigation = snapshot?.investigation
  return <main className="running-page"><div className="running-intro"><p className="eyebrow">AUTONOMOUS INVESTIGATION</p><h1>Building the proof.</h1><p>Recoil is reading public records and checking the evidence chain. You do not need to operate the run.</p></div><EventStream events={investigation?.events || []} /><footer className="running-footer"><span>{investigation?.evidence?.sources?.length || 0} sources discovered so far</span><span>Nothing installed or executed</span></footer></main>
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
    api('/api/scenarios/0017').then((next) => {
      if (active) setSnapshot(next)
    }).catch((cause) => {
      if (active) setError(`Recoil API unavailable. Start the app with npm run start. ${cause.message}`)
    })
    return () => { active = false }
  }, [])

  useEffect(() => {
    if (!busy) return undefined
    const poll = async () => {
      try {
        const next = await api(`/api/scenarios/${SCENARIO_ID}`)
        setSnapshot(next)
        if (next.investigation?.status === 'complete' || next.investigation?.status === 'failed') {
          setBusy(false)
          if (next.investigation.status === 'complete') setReport(next.investigation.report)
          if (next.investigation.status === 'failed') setError(next.investigation.error || 'Investigation incomplete')
          return
        }
      } catch (cause) {
        setError(cause.message)
        setBusy(false)
        return
      }
      window.setTimeout(poll, 650)
    }
    const timer = window.setTimeout(poll, 100)
    return () => window.clearTimeout(timer)
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
    } catch (cause) {
      setBusy(false); setError(cause.message)
    }
  }

  async function rewind(asOf) {
    if (!activeReport) return
    try {
      const next = await api(`/api/scenarios/${SCENARIO_ID}/rewind`, { method: 'POST', body: JSON.stringify({ asOf }) })
      setReport(next.report)
      setHydra({ ...(investigation?.hydra || {}), recall: { ...next.hydra, chunkCount: next.hydra?.chunks?.length || 0 }, temporalRecall: next.hydra })
    } catch (cause) { setError(cause.message) }
  }

  async function newInvestigation() {
    try {
      await api(`/api/scenarios/${SCENARIO_ID}/reset`, { method: 'POST' })
    } catch (cause) {
      setError(`Could not reset the case on the server. ${cause.message}`)
      return
    }
    setSnapshot(null); setReport(null); setHydra(null); setError(''); setInput(DEFAULT_INPUT)
  }

  if (!hasInvestigation) return <Landing value={input} setValue={setInput} onSubmit={investigate} busy={busy} error={error} />
  return <div className="product-shell"><InvestigationHeader investigation={investigation} hydra={hydra || investigation?.hydra} />{isComplete ? <><FinalReport report={activeReport} hydra={hydra || investigation?.hydra} onRewind={rewind} /><div className="new-case-wrap"><button type="button" onClick={newInvestigation}><RotateCcw size={14} /> New investigation</button></div></> : <RunningView snapshot={snapshot} />}{error && <div className="floating-error"><CircleAlert size={14} /> {error}</div>}</div>
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
