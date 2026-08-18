import { compareVersions, versionAffectedByAdvisory } from './evidence.js'

function dateOrNull(value) {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

function daysBetween(start, end) {
  if (!start || !end) return null
  const milliseconds = new Date(end).getTime() - new Date(start).getTime()
  return milliseconds >= 0 ? Math.floor(milliseconds / 86400000) : null
}

function findingAsOf(finding, asOf) {
  const observedAt = dateOrNull(finding.pathObservedAt)
  if (observedAt && new Date(observedAt) > new Date(asOf)) {
    return { ...finding, verdict: 'NOT_YET_OBSERVED', reason: `The relevant lockfile/source evidence was first observed after ${asOf.slice(0, 10)}.`, asOf }
  }
  return { ...finding, asOf }
}

function challengeFinding(finding, advisory) {
  const proposedVersion = finding.allowedVersion || finding.targetVersion
  if (!proposedVersion) {
    return { repository: finding.repository, status: 'NO_FIXED_VERSION', detail: 'The advisory did not provide a fixed version that Recoil can verify.' }
  }
  if (finding.verdict === 'DECLARED_ONLY') {
    return { repository: finding.repository, status: 'NO_REACHABLE_PATH', detail: `The dependency is present, but no sampled source import reaches it. Update to ${proposedVersion} is still recommended for defense in depth.`, proposedVersion, residualPath: [] }
  }
  if (finding.verdict === 'REACHED' && !finding.rangeAllowsFix) {
    return { repository: finding.repository, status: 'MANIFEST_CHANGE_REQUIRED', detail: `The declared range ${finding.declaredRange || 'unknown'} does not admit ${proposedVersion}.`, proposedVersion, residualPath: finding.path }
  }
  const afterAffected = versionAffectedByAdvisory(advisory, finding.packageName, proposedVersion)
  if (afterAffected !== false) {
    return { repository: finding.repository, status: 'UNVERIFIED', detail: `${proposedVersion} could not be proven outside the advisory range.`, proposedVersion, residualPath: finding.path }
  }
  return {
    repository: finding.repository,
    status: 'FIX_SURVIVES',
    detail: `Changing the resolved version to ${proposedVersion} removes the advisory-affected version from the cited path.`,
    proposedVersion,
    residualPath: [],
  }
}

export function buildInvestigationReport(ingestion, { asOf = new Date().toISOString() } = {}) {
  const findings = ingestion?.findings || []
  const advisory = ingestion?.advisory || ingestion?.collectors?.find((collector) => collector.collector === 'advisory-resolver')?.targetAdvisory || null
  const advisoryPublishedAt = dateOrNull(ingestion?.temporal?.advisoryPublishedAt || advisory?.published)
  const currentFindings = findings.map((finding) => ({
    ...finding,
    pathObservedAt: dateOrNull(finding.pathObservedAt),
    exposureDays: daysBetween(dateOrNull(finding.pathObservedAt), advisoryPublishedAt),
  }))
  const rewindFindings = currentFindings.map((finding) => findingAsOf(finding, asOf))
  const challenge = currentFindings.map((finding) => challengeFinding(finding, advisory))
  const reached = currentFindings.filter((finding) => finding.verdict === 'REACHED')
  const declaredOnly = currentFindings.filter((finding) => finding.verdict === 'DECLARED_ONLY')
  const unaffected = currentFindings.filter((finding) => finding.verdict === 'NOT_AFFECTED')
  const fixSurvives = challenge.filter((item) => item.status === 'FIX_SURVIVES')
  const residual = challenge.filter((item) => !['FIX_SURVIVES', 'NO_FIXED_VERSION', 'NO_REACHABLE_PATH'].includes(item.status))
  return {
    status: ingestion?.status || 'partial',
    query: ingestion?.query || '',
    package: ingestion?.package || null,
    advisory: advisory ? {
      id: advisory.id || ingestion?.target?.advisoryId || null,
      summary: advisory.summary || null,
      published: advisoryPublishedAt,
      modified: dateOrNull(advisory.modified),
      fixedVersions: [...new Set(currentFindings.flatMap((finding) => finding.fixedVersions || []))].sort(compareVersions),
      sourceUrl: advisory.sourceUrl || ingestion?.collectors?.find((collector) => collector.collector === 'advisory-resolver')?.sourceUrl || null,
    } : null,
    repositories: currentFindings,
    challenge,
    rewind: {
      asOf,
      advisoryPublic: advisoryPublishedAt ? new Date(asOf) >= new Date(advisoryPublishedAt) : null,
      findings: rewindFindings,
      beforeAdvisory: advisoryPublishedAt ? new Date(new Date(advisoryPublishedAt).getTime() - 86400000).toISOString() : null,
    },
    summary: {
      totalRepositories: currentFindings.length,
      reached: reached.length,
      declaredOnly: declaredOnly.length,
      notAffected: unaffected.length,
      unknown: currentFindings.filter((finding) => !['REACHED', 'DECLARED_ONLY', 'NOT_AFFECTED'].includes(finding.verdict)).length,
      fixSurvives: fixSurvives.length,
      residualPaths: residual.length,
      exposureDays: reached.map((finding) => finding.exposureDays).filter((value) => value !== null).sort((a, b) => b - a)[0] || null,
    },
    graph: ingestion?.graph || { nodes: [], edges: [] },
    sources: ingestion?.sources || [],
    limits: [
      ...currentFindings.filter((finding) => finding.sourceSampleSize).map((finding) => `${finding.repository}: ${finding.sourceBound}.`),
      'Reachability is proven only from the collected public source sample; it is not proof of runtime execution.',
      'No package code or exploit payload was executed.',
    ],
    generatedAt: new Date().toISOString(),
  }
}

export function createInvestigationState(query = '') {
  return {
    status: 'idle',
    query,
    step: 'idle',
    events: [],
    evidence: null,
    report: null,
    hydra: { status: 'not_started', memoryCount: 0 },
    error: null,
    startedAt: null,
    completedAt: null,
  }
}
