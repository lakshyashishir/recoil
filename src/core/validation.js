const REQUIRED_CONTRAST = ['REACHED', 'DECLARED_ONLY', 'NOT_AFFECTED']

export function missingRequiredVerdicts(report, required = REQUIRED_CONTRAST) {
  const findings = report?.repositories || []
  return required.filter((verdict) => !findings.some((finding) => finding.verdict === verdict))
}

export function hasIncompleteEvidence(result = {}) {
  const evidenceStatus = result.evidenceStatus || result.ingestion?.status || 'unknown'
  const hasUnknown = (result.report?.repositories || []).some((finding) => finding.verdict === 'UNKNOWN')
  return evidenceStatus !== 'completed' || hasUnknown
}

export { REQUIRED_CONTRAST }
