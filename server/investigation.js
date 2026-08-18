import { buildInvestigationReport, createInvestigationState } from '../src/core/investigation.js'
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
  record.investigation = { ...createInvestigationState(record.query), status: 'running', step: 'public-records', startedAt: new Date().toISOString() }
  void executeInvestigation(record)
  return record.investigation
}

export async function executeInvestigation(record) {
  const state = record.investigation
  try {
    const evidence = await runMultiRepositoryIngestion({
      query: record.query,
      scenarioId: record.id,
      onProgress: (event) => {
        pushEvent(state, event)
      },
    })
    state.evidence = evidence
    pushEvent(state, {
      type: 'step',
      key: 'proving-paths',
      status: 'working',
      title: 'Proving repository paths',
      detail: 'Comparing resolved versions with advisory ranges and sampled external imports.',
    })
    const report = buildInvestigationReport(evidence)
    state.report = report
    pushEvent(state, {
      type: 'step',
      key: 'proving-paths',
      status: 'complete',
      title: 'Paths proved',
      detail: `${report.summary.reached} reached · ${report.summary.declaredOnly} declared only · ${report.summary.notAffected} not affected`,
    })
    pushEvent(state, {
      type: 'step',
      key: 'fix-plan',
      status: 'complete',
      title: 'Fix plan ready',
      detail: report.challenge.map((item) => `${item.repository}: ${item.status}`).join(' · ') || 'No fix plan could be produced.',
    })
    state.status = 'complete'
    state.step = 'complete'
    state.completedAt = new Date().toISOString()
    const persisted = await persistInvestigation(evidence, report).catch((error) => ({ status: 'failed', error: error.message, memoryCount: 0 }))
    state.hydra = { ...persisted, status: persisted.status, memoryCount: persisted.memoryCount || 0 }
    pushEvent(state, {
      type: 'step',
      key: 'hydra',
      status: persisted.status === 'failed' ? 'failed' : persisted.status === 'skipped' ? 'skipped' : 'complete',
      title: persisted.status === 'persisted' ? 'Evidence graph stored in HydraDB' : persisted.status === 'queued' ? 'Evidence graph queued in HydraDB' : 'Local evidence record ready',
      detail: persisted.status === 'failed' ? persisted.error : `${persisted.memoryCount || 0} temporal evidence memories`,
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
  const report = buildInvestigationReport(record.investigation.evidence, { asOf })
  const hydra = await recallTemporal(record.query, asOf).catch((error) => ({ status: 'failed', error: error.message, chunks: [] }))
  return { report, hydra }
}
