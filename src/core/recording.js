import { hasIncompleteEvidence, missingRequiredVerdicts } from './validation.js'
import { summarizeGraphContext } from './graph-context.js'

export function recordingPreflight({ advisoryId = null, repositoryCount = 0, hydraConfigured = false, requireContrast = false, requireHydra = false } = {}) {
  const blockers = []
  if ((requireContrast || requireHydra) && !advisoryId) blockers.push('requires a GHSA/CVE advisory ID for dated reachability and fixed-version proof')
  if (requireContrast && repositoryCount < 3) blockers.push(`requires 3 public GitHub repositories; found ${repositoryCount}`)
  if (requireHydra && !hydraConfigured) blockers.push('requires HYDRA_DB_API_KEY and HYDRADB_DATABASE_ID')
  return blockers
}

/**
 * One post-run gate shared by the real smoke and CLI recording mode. A case
 * is recordable only when public evidence is complete; strict recording adds
 * the three-way contrast and HydraDB write/read proof.
 */
export function recordingBlockers({ report, evidenceStatus, hydra, requireContrast = false, requireHydra = false } = {}) {
  const blockers = []
  const result = { report, evidenceStatus }
  if (hasIncompleteEvidence(result)) blockers.push(report?.evidenceQuality?.reason || 'public evidence is incomplete')
  if (requireContrast) {
    const missing = missingRequiredVerdicts(report)
    if (missing.length) blockers.push(`missing contrast verdicts: ${missing.join(', ')}`)
  }
  if (hydra?.status === 'failed') blockers.push('HydraDB write failed')
  if (requireHydra && hydra?.status !== 'persisted') blockers.push(`HydraDB write status is ${hydra?.status || 'unknown'}`)
  if (requireHydra && hydra?.status === 'persisted' && !(hydra.memoryCount > 0)) blockers.push('HydraDB persisted zero evidence memories')
  if (requireHydra && hydra?.status === 'persisted' && hydra.memoryCount > 0 && (!Array.isArray(hydra.sourceIds) || hydra.sourceIds.length < hydra.memoryCount)) {
    blockers.push(`HydraDB acknowledged ${hydra.sourceIds?.length || 0}/${hydra.memoryCount} evidence memories`)
  }
  if (requireHydra && hydra?.recall?.status !== 'recalled') blockers.push(`HydraDB temporal read status is ${hydra?.recall?.status || 'not-run'}`)
  if (requireHydra && hydra?.recall?.status === 'recalled' && !(hydra.recall.datedChunkCount > 0)) blockers.push('HydraDB temporal recall returned no dated facts')
  const hydraWriteComplete = hydra?.status === 'persisted' && hydra.memoryCount > 0 && Array.isArray(hydra.sourceIds) && hydra.sourceIds.length >= hydra.memoryCount
  if (requireHydra && hydraWriteComplete && hydra?.recall?.status === 'recalled' && hydra.recall.datedChunkCount > 0 && !(summarizeGraphContext(hydra.recall.graphContext)?.triplets?.length > 0)) blockers.push('HydraDB graph recall returned no triplets')
  return [...new Set(blockers)]
}
