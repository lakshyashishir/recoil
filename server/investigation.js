import { randomUUID } from 'node:crypto'
import { applyAdvisoryScope } from '../src/core/evidence.js'
import { attachHydraRewind, buildInvestigationReport, createInvestigationState } from '../src/core/investigation.js'
import { resolveAdvisoryScope } from './advisory-agent.js'
import { runMultiRepositoryIngestion } from './collectors.js'
import { persistInvestigation, recallStoredGraph, recallTemporal, settleHydraIndexing } from './hydra.js'

function graphSize(graph) {
  return (graph?.nodes?.length || 0) + (graph?.edges?.length || 0)
}

function mergeLiveEvidence(current = {}, next = {}) {
  const currentProgress = current.graphProgress || { completedRepositories: 0, totalRepositories: 0 }
  const nextProgress = next.graphProgress || currentProgress
  const currentCompleted = Number(currentProgress.completedRepositories || 0)
  const nextCompleted = Number(nextProgress.completedRepositories || 0)
  const adoptNextGraph = Boolean(next.graph) && (!current.graph
    || nextCompleted > currentCompleted
    || nextCompleted === currentCompleted && graphSize(next.graph) > graphSize(current.graph))
  const graphProgress = {
    ...currentProgress,
    ...nextProgress,
    completedRepositories: Math.max(currentCompleted, nextCompleted),
    totalRepositories: Math.max(Number(currentProgress.totalRepositories || 0), Number(nextProgress.totalRepositories || 0)),
  }
  return {
    graph: adoptNextGraph ? next.graph : current.graph,
    graphProgress,
  }
}

function pushEvent(state, event) {
  const previous = state.events.find((item) => item.key === event.key)
  const next = {
    id: previous?.id || `${Date.now()}-${state.events.length}`,
    timestamp: new Date().toISOString(),
    ...event,
  }
  state.events = previous ? state.events.map((item) => item.key === event.key ? next : item) : [...state.events, next]
  if (event.graph || event.graphProgress) {
    const liveEvidence = mergeLiveEvidence(state, event)
    state.graph = liveEvidence.graph
    state.graphProgress = liveEvidence.graphProgress
  }
  state.step = event.key
  return next
}

function hydraState(persisted, recall, graphVerification = null) {
  return {
    ...persisted,
    status: persisted.status,
    memoryCount: persisted.memoryCount || 0,
    recall: {
      ...recall,
      chunkCount: recall.chunks?.length || 0,
      datedChunkCount: recall.datedChunkCount || 0,
      relatedCaseCount: recall.priorScenarioIds?.length || recall.relatedCases?.length || 0,
      priorScenarioIds: recall.priorScenarioIds || [],
      relatedCases: recall.relatedCases || [],
    },
    graphVerification: graphVerification || { status: persisted.status === 'skipped' ? 'skipped' : 'not_requested', tripletCount: 0, memoryCount: 0, sourceIds: [] },
  }
}

function hydraEventDetail(persisted, recall, graphVerification) {
  const memories = persisted?.memoryCount || 0
  const memoryLabel = persisted?.status === 'persisted'
    ? `${memories} evidence memories stored`
    : persisted?.status === 'queued'
      ? `${memories} evidence memories accepted; indexing pending`
      : 'Local evidence record ready'
  const recallLabel = recall?.status === 'recalled'
    ? `${recall.datedChunkCount || 0} dated facts recalled`
    : recall?.status === 'failed'
      ? 'temporal recall failed'
    : 'temporal recall unavailable'
  const graphLabel = graphVerification?.status === 'verified'
    ? `${graphVerification.tripletCount || 0} current graph relation${graphVerification.tripletCount === 1 ? '' : 's'} verified`
    : graphVerification?.status === 'skipped'
      ? 'current graph read skipped'
      : graphVerification?.status === 'failed'
        ? 'current graph read failed'
        : 'current graph read not verified'
  return `${memoryLabel} · ${recallLabel} · ${graphLabel}`
}

async function reconcileQueuedHydra(record, state, report, queued) {
  if (!queued?.result || queued.status !== 'queued') return
  try {
    const indexed = await settleHydraIndexing(queued.result)
    const acknowledged = [...new Set((indexed.results || []).map((item) => item.id || item.source_id || item.sourceId).filter(Boolean))]
    if (indexed.indexingStatus !== 'completed' || acknowledged.length < (queued.memoryCount || 0)) {
      if (record.investigation !== state) return
      const deferred = {
        ...queued,
        status: 'queued',
        sourceIds: acknowledged,
        indexingPending: false,
        indexingError: `HydraDB accepted ${queued.memoryCount || 0} evidence memories, but did not confirm indexing within the follow-up window.`,
        result: indexed,
      }
      state.hydra = hydraState(deferred, state.hydra?.recall || { status: 'skipped', chunks: [] })
      record.hydra = state.hydra
      pushEvent(state, {
        type: 'step',
        key: 'hydra',
        status: 'complete',
        title: 'Evidence graph accepted; indexing unconfirmed',
        detail: `${acknowledged.length}/${queued.memoryCount || 0} memories acknowledged. The source-backed report remains available; HydraDB persistence is not claimed.`,
      })
      state.step = 'complete'
      return
    }
    if (record.investigation !== state) return
    const recallQuery = [record.query, report.package, report.advisory?.id].filter(Boolean).join(' ')
    const [recall, graphVerification] = await Promise.all([
      recallTemporal(recallQuery, report.rewind.currentAsOf, undefined, { excludeScenarioId: state.caseId }).catch((error) => ({ status: 'failed', error: error.message, chunks: [] })),
      recallStoredGraph(state.caseId, report.package, report.graph).catch((error) => ({ status: 'failed', error: error.message, tripletCount: 0, memoryCount: 0, sourceIds: [] })),
    ])
    if (record.investigation !== state) return
    const persisted = { ...queued, status: 'persisted', sourceIds: acknowledged, indexingPending: false, indexingError: null, result: indexed }
    state.hydra = hydraState(persisted, recall, graphVerification)
    record.hydra = state.hydra
    state.report = attachHydraRewind(state.report, recall)
    pushEvent(state, {
      type: 'step',
      key: 'hydra',
      status: 'complete',
      title: 'Evidence graph stored in HydraDB',
      detail: hydraEventDetail(persisted, recall, graphVerification),
    })
    state.step = 'complete'
  } catch (error) {
    if (record.investigation !== state) return
    const deferred = {
      ...queued,
      status: 'queued',
      indexingPending: false,
      indexingError: error.message,
    }
    state.hydra = hydraState(deferred, state.hydra?.recall || { status: 'skipped', chunks: [] })
    record.hydra = state.hydra
    pushEvent(state, {
      type: 'step',
      key: 'hydra',
      status: 'complete',
      title: 'Evidence graph accepted; HydraDB follow-up failed',
      detail: 'The source-backed report remains available, but Recoil cannot claim that this batch was persisted.',
    })
    state.step = 'complete'
  }
}

export function startInvestigation(record, query) {
  record.query = query.trim()
  record.investigation = { ...createInvestigationState(record.query), caseId: `${record.id}-${randomUUID().slice(0, 8)}`, status: 'running', step: 'public-records', startedAt: new Date().toISOString() }
  void executeInvestigation(record)
  return record.investigation
}

export async function executeInvestigation(record) {
  const state = record.investigation
  try {
    const collectedEvidence = await runMultiRepositoryIngestion({
      query: record.query,
      scenarioId: state.caseId || record.id,
      onProgress: (event) => {
        pushEvent(state, event)
      },
    })
    const repositoryScan = collectedEvidence.mode === 'repository'
    pushEvent(state, {
      type: 'step',
      key: 'advisory-scope',
      status: 'working',
      title: repositoryScan ? 'Keeping repository scan module-level' : 'Checking advisory scope',
      detail: repositoryScan ? 'Multiple advisories are being compared; Recoil keeps each result tied to its package and source path.' : 'Matching advisory language against indexed symbols without allowing the model to create graph edges.',
    })
    const scope = repositoryScan
      ? { status: 'skipped', reason: 'Repository scan intentionally keeps advisory scope at the package/import level across multiple advisories.', affectedSymbols: [] }
      : await resolveAdvisoryScope(collectedEvidence)
    const scopedEvidence = applyAdvisoryScope(collectedEvidence, scope)
    state.evidence = scopedEvidence
    record.ingestion = scopedEvidence
    record.graph = scopedEvidence.graph || { nodes: [], edges: [] }
    const scopeCompleted = scope.status === 'completed'
    pushEvent(state, {
      type: 'step',
      key: 'advisory-scope',
      // The model pass is optional. A model outage must not make a valid
      // deterministic investigation look failed; its limitation remains in
      // the report so the degradation is still explicit and auditable.
      status: 'complete',
      title: scopeCompleted ? 'Advisory scope checked' : repositoryScan ? 'Repository scan scope retained' : 'Module-level scope retained',
      detail: scopeCompleted
        ? `${scope.affectedSymbols?.length || 0} candidate symbol${scope.affectedSymbols?.length === 1 ? '' : 's'} returned; only exact indexed matches are attached.`
        : scope.reason || scope.error || 'The deterministic package-import proof remains authoritative.',
    })
    const evidence = scopedEvidence
    pushEvent(state, {
      type: 'step',
      key: 'proving-paths',
      status: 'working',
      title: 'Proving repository paths',
      detail: 'Comparing resolved versions with advisory ranges and sampled external imports.',
    })
    let report = buildInvestigationReport(evidence)
    state.report = report
    pushEvent(state, {
      type: 'step',
      key: 'proving-paths',
      status: 'complete',
      title: report.summary.totalAdvisories === 0 && report.mode === 'repository'
        ? 'No affected paths found'
        : report.evidenceQuality.readyForRecording ? 'Paths proved' : 'Evidence classified with gaps',
      detail: `${report.summary.reached} reached · ${report.summary.declaredOnly} declared only · ${report.summary.notAffected} not affected${report.summary.unknown ? ` · ${report.summary.unknown} unknown` : ''}`,
    })
    pushEvent(state, {
      type: 'step',
      key: 'fix-plan',
      status: 'complete',
      title: 'Fix plan ready',
      detail: report.challenge.map((item) => `${item.repository}: ${item.status}`).join(' · ') || 'No fix plan could be produced.',
    })
    state.status = 'finalizing'
    state.step = 'hydra'
    const persisted = await persistInvestigation(evidence, report).catch((error) => ({ status: 'failed', error: error.message, memoryCount: 0 }))
    const recallQuery = [record.query, report.package, report.advisory?.id].filter(Boolean).join(' ')
    const [recall, graphVerification] = persisted.status === 'persisted' || persisted.status === 'queued'
      ? await Promise.all([
        recallTemporal(recallQuery, report.rewind.currentAsOf, undefined, { excludeScenarioId: state.caseId }).catch((error) => ({ status: 'failed', error: error.message, chunks: [] })),
        recallStoredGraph(state.caseId, report.package, report.graph).catch((error) => ({ status: 'failed', error: error.message, tripletCount: 0, memoryCount: 0, sourceIds: [] })),
      ])
      : [{ status: persisted.status, reason: persisted.reason, chunks: [] }, { status: persisted.status, reason: persisted.reason, tripletCount: 0, memoryCount: 0, sourceIds: [] }]
    state.hydra = hydraState(persisted, recall, graphVerification)
    record.hydra = state.hydra
    report = attachHydraRewind(report, recall)
    state.report = report
    pushEvent(state, {
      type: 'step',
      key: 'hydra',
      status: persisted.status === 'failed' ? 'failed' : persisted.status === 'skipped' ? 'skipped' : 'complete',
      title: persisted.status === 'persisted' ? 'Evidence graph stored in HydraDB' : persisted.status === 'queued' ? 'Evidence graph queued in HydraDB' : 'Local evidence record ready',
      detail: persisted.status === 'failed' ? persisted.error : hydraEventDetail(persisted, recall, graphVerification),
    })
    state.status = 'complete'
    state.step = 'complete'
    state.completedAt = new Date().toISOString()
    pushEvent(state, {
      type: 'step',
      key: 'complete',
      status: 'complete',
      title: report.evidenceQuality.readyForRecording ? 'Case complete' : 'Case complete · review required',
      detail: report.evidenceQuality.readyForRecording
        ? 'The path, timeline, and remediation proof are ready to inspect.'
        : `${report.evidenceQuality.reason} The report is available for diagnosis, not final recording.`,
    })
    void reconcileQueuedHydra(record, state, report, persisted)
    return state
  } catch (error) {
    state.status = 'failed'
    state.error = error.message
    state.completedAt = new Date().toISOString()
    pushEvent(state, { type: 'step', key: 'investigation', status: 'failed', title: 'Investigation incomplete', detail: error.message })
    return state
  }
}

export async function rewindInvestigation(record, asOf) {
  if (!record.investigation?.report) return { error: 'Investigation has not completed' }
  const requested = new Date(asOf)
  if (Number.isNaN(requested.getTime())) return { error: 'Invalid rewind timestamp' }
  const normalized = requested.toISOString()
  const report = buildInvestigationReport(record.investigation.evidence, { asOf: normalized })
  const reportQuery = [record.query, report.package, report.advisory?.id].filter(Boolean).join(' ')
  const hydra = await recallTemporal(reportQuery, normalized, undefined, { excludeScenarioId: record.investigation.caseId }).catch((error) => ({ status: 'failed', error: error.message, chunks: [] }))
  return { report: attachHydraRewind(report, hydra), hydra }
}

export { mergeLiveEvidence }
