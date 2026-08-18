import { randomUUID } from 'node:crypto'
import { applyAdvisoryScope } from '../src/core/evidence.js'
import { attachHydraRewind, buildInvestigationReport, createInvestigationState } from '../src/core/investigation.js'
import { resolveAdvisoryScope } from './advisory-agent.js'
import { runMultiRepositoryIngestion } from './collectors.js'
import { persistInvestigation, recallTemporal } from './hydra.js'

function pushEvent(state, event) {
  const previous = state.events.find((item) => item.key === event.key)
  const next = {
    id: previous?.id || `${Date.now()}-${state.events.length}`,
    timestamp: new Date().toISOString(),
    ...event,
  }
  state.events = previous ? state.events.map((item) => item.key === event.key ? next : item) : [...state.events, next]
  state.step = event.key
  return next
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
    pushEvent(state, {
      type: 'step',
      key: 'advisory-scope',
      status: 'working',
      title: 'Checking advisory scope',
      detail: 'Matching advisory language against indexed symbols without allowing the model to create graph edges.',
    })
    const scope = await resolveAdvisoryScope(collectedEvidence)
    const scopedEvidence = applyAdvisoryScope(collectedEvidence, scope)
    state.evidence = scopedEvidence
    record.ingestion = scopedEvidence
    record.graph = scopedEvidence.graph || { nodes: [], edges: [] }
    pushEvent(state, {
      type: 'step',
      key: 'advisory-scope',
      status: scope.status === 'failed' ? 'failed' : 'complete',
      title: scope.status === 'completed' ? 'Advisory scope checked' : 'Module-level scope retained',
      detail: scope.status === 'completed'
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
      title: report.evidenceQuality.readyForRecording ? 'Paths proved' : 'Evidence classified with gaps',
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
    const recall = persisted.status === 'persisted' || persisted.status === 'queued'
      ? await recallTemporal(recallQuery, report.rewind.currentAsOf, undefined, { excludeScenarioId: state.caseId }).catch((error) => ({ status: 'failed', error: error.message, chunks: [] }))
      : { status: persisted.status, reason: persisted.reason, chunks: [] }
    state.hydra = { ...persisted, status: persisted.status, memoryCount: persisted.memoryCount || 0, recall: { ...recall, chunkCount: recall.chunks?.length || 0, datedChunkCount: recall.datedChunkCount || 0, relatedCaseCount: recall.priorScenarioIds?.length || 0, priorScenarioIds: recall.priorScenarioIds || [] } }
    record.hydra = state.hydra
    report = attachHydraRewind(report, recall)
    state.report = report
    pushEvent(state, {
      type: 'step',
      key: 'hydra',
      status: persisted.status === 'failed' ? 'failed' : persisted.status === 'skipped' ? 'skipped' : 'complete',
      title: persisted.status === 'persisted' ? 'Evidence graph stored in HydraDB' : persisted.status === 'queued' ? 'Evidence graph queued in HydraDB' : 'Local evidence record ready',
      detail: persisted.status === 'failed' ? persisted.error : `${persisted.memoryCount || 0} temporal evidence memories · ${recall.chunks?.length || 0} recalled · ${recall.relatedScenarioIds?.length || 0} related cases`,
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
