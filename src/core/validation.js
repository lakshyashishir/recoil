const REQUIRED_CONTRAST = ['REACHED', 'DECLARED_ONLY', 'NOT_AFFECTED']

const CLASSIFIED_VERDICTS = new Set(['REACHED', 'DECLARED_ONLY', 'NOT_AFFECTED'])

function finiteNumber(value) {
  return Number.isFinite(Number(value)) ? Number(value) : 0
}

/**
 * Summarize whether a report is safe to present as a complete public-evidence
 * case. This is shared by the report, CLI, and receipt so one surface cannot
 * call a partial or ambiguous run complete by accident.
 */
export function buildEvidenceQuality({ status = 'unknown', collectors = [], repositories = [] } = {}) {
  const unknownFindings = repositories
    .filter((finding) => !CLASSIFIED_VERDICTS.has(finding.verdict))
    .map((finding) => ({ repository: finding.repository || 'unknown repository', verdict: finding.verdict || 'UNKNOWN', reason: finding.reason || null }))
  const collectorIssues = []
  for (const collector of collectors || []) {
    if (collector.status && collector.status !== 'completed') {
      collectorIssues.push({ collector: collector.collector || 'source', status: collector.status, error: collector.error || null })
    }
    const sourceFiles = collector.manifest?.collection?.sourceFiles
    if (sourceFiles?.status && sourceFiles.status !== 'collected') {
      collectorIssues.push({
        collector: `${collector.repository || collector.collector || 'repository'} source files`,
        status: sourceFiles.status,
        error: sourceFiles.error || null,
      })
    }
  }
  const ambiguousVersions = repositories
    .filter((finding) => Array.isArray(finding.resolvedVersions) && finding.resolvedVersions.length > 1 && finding.verdict === 'UNKNOWN')
    .map((finding) => ({ repository: finding.repository || 'unknown repository', packageName: finding.packageName || null, versions: finding.resolvedVersions }))
  const sourceCoverage = repositories.reduce((coverage, finding) => {
    const sampled = finiteNumber(finding.sourceSampleSize)
    const candidates = finiteNumber(finding.sourceCandidateCount)
    if (sampled || candidates) {
      coverage.sampledFiles += sampled
      coverage.candidateFiles += candidates || sampled
      coverage.repositories += 1
      if (candidates > sampled) coverage.boundedRepositories += 1
    }
    return coverage
  }, { sampledFiles: 0, candidateFiles: 0, repositories: 0, boundedRepositories: 0 })
  const complete = status === 'completed' && unknownFindings.length === 0 && collectorIssues.length === 0
  const qualityStatus = complete ? 'complete' : status === 'completed' ? 'review' : 'partial'
  const reason = complete
    ? 'All requested public sources completed and every repository has a classified verdict.'
    : status !== 'completed'
      ? `Public evidence collection is ${status}; this case is not recording-ready.`
      : `${unknownFindings.length} repository${unknownFindings.length === 1 ? '' : 'ies'} remain${unknownFindings.length === 1 ? 's' : ''} unclassified.`
  return {
    status: qualityStatus,
    readyForRecording: complete,
    reason,
    unknownFindings,
    collectorIssues,
    ambiguousVersions,
    sourceCoverage: sourceCoverage.repositories ? sourceCoverage : null,
  }
}

export function missingRequiredVerdicts(report, required = REQUIRED_CONTRAST) {
  const findings = report?.repositories || []
  return required.filter((verdict) => !findings.some((finding) => finding.verdict === verdict))
}

export function hasIncompleteEvidence(result = {}) {
  if (result.report?.evidenceQuality) {
    const evidenceStatus = result.evidenceStatus || result.ingestion?.status
    return !result.report.evidenceQuality.readyForRecording || Boolean(evidenceStatus && evidenceStatus !== 'completed')
  }
  const evidenceStatus = result.evidenceStatus || result.ingestion?.status || 'unknown'
  const hasUnknown = (result.report?.repositories || []).some((finding) => finding.verdict === 'UNKNOWN')
  return evidenceStatus !== 'completed' || hasUnknown
}

export { REQUIRED_CONTRAST }
