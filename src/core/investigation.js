import { compareVersions, versionAffectedByAdvisory } from './evidence.js'
import { buildEvidenceQuality } from './validation.js'
import { summarizeGraphContext } from './graph-context.js'

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

function proofStep({ kind, label, status = 'observed', source = null, detail = null }) {
  return { kind, label, status, source, detail }
}

/**
 * Map every reported hop to the public record that supports it. This is kept
 * separate from the graph path because a path is readable, while a proof
 * chain is auditable: a reviewer can inspect the exact source for each hop.
 */
function buildProofChain(finding, advisory) {
  const lockfileSource = (finding.evidenceSources || []).find((source) => /(?:lock|package\.json|cargo\.toml|cargo\.lock)/i.test(source))
    || finding.evidenceSources?.[0]
    || null
  const steps = [
    proofStep({
      kind: 'advisory',
      label: advisory?.id || finding.advisoryId || 'advisory',
      source: advisory?.sourceUrl || null,
      status: advisory?.sourceUrl ? 'observed' : 'missing',
      detail: advisory?.published ? `Published ${advisory.published.slice(0, 10)}` : 'Advisory publication date unavailable',
    }),
    proofStep({
      kind: 'resolution',
      label: finding.packageName ? `${finding.packageName}@${finding.resolvedVersion || 'unresolved'}` : 'package unresolved',
      source: lockfileSource,
      status: finding.resolvedVersion && lockfileSource ? 'observed' : 'missing',
      detail: finding.declaredRange ? `Declared ${finding.declaredRange}` : 'No declared range collected',
    }),
    proofStep({
      kind: 'repository',
      label: finding.repository || 'repository unavailable',
      source: finding.repositoryUrl || null,
      status: finding.repositoryUrl ? 'observed' : 'missing',
      detail: finding.pathObservationSource ? 'Repository history was collected' : 'Repository history unavailable',
    }),
  ]

  const imports = (finding.imports || []).slice(0, 4)
  if (imports.length) {
    steps.push(...imports.map((item) => proofStep({
      kind: 'import',
      label: `${item.path}${item.line ? `:${item.line}` : ''}`,
      source: item.sourceUrl || null,
      status: item.sourceUrl ? 'observed' : 'missing',
      detail: `Imports ${item.specifier || finding.packageName || 'the resolved package'}`,
    })))
  } else {
    steps.push(proofStep({
      kind: 'import',
      label: 'No sampled import',
      status: finding.verdict === 'DECLARED_ONLY' ? 'not-observed' : 'incomplete',
      source: null,
      detail: finding.verdict === 'DECLARED_ONLY' ? 'The package is declared, but no sampled source file imports it' : finding.sourceBound || 'Source import evidence is incomplete',
    }))
  }

  const symbols = finding.advisoryScope?.status === 'VALIDATED_SYMBOL' ? (finding.advisoryScope.symbols || []).slice(0, 4) : []
  steps.push(...symbols.map((symbol) => proofStep({
    kind: 'symbol',
    label: `${symbol.name} · ${symbol.path}:${symbol.line}`,
    source: symbol.sourceUrl || null,
    status: symbol.sourceUrl ? 'validated' : 'missing',
    detail: 'Advisory scope matched an indexed symbol in an importing file',
  })))

  steps.push(proofStep({
    kind: 'temporal',
    label: finding.pathObservedAt ? `First observed ${finding.pathObservedAt.slice(0, 10)}` : 'Observation date unavailable',
    source: finding.pathObservationSource || null,
    status: finding.pathObservedAt && finding.pathObservationSource ? 'observed' : 'undated',
    detail: finding.exposureDays !== null && finding.exposureDays !== undefined ? `${finding.exposureDays} days before advisory publication` : 'No dated exposure window claimed',
  }))
  return steps
}

function findingAsOf(finding, asOf) {
  const observedAt = dateOrNull(finding.pathObservedAt)
  if (observedAt && new Date(observedAt) > new Date(asOf)) {
    return { ...finding, verdict: 'NOT_YET_OBSERVED', reason: `The relevant lockfile/source evidence was first observed after ${asOf.slice(0, 10)}.`, asOf }
  }
  return { ...finding, asOf }
}

function challengeFinding(finding, advisory) {
  if (finding.verdict === 'NOT_AFFECTED') {
    return { repository: finding.repository, status: 'ALREADY_SAFE', detail: `${finding.packageName}@${finding.resolvedVersion || 'unknown'} is already outside the advisory range.`, proposedVersion: finding.resolvedVersion, residualPath: [] }
  }
  if (finding.verdict === 'UNKNOWN') {
    return { repository: finding.repository, status: 'UNVERIFIED', detail: 'The available evidence is incomplete, so Recoil will not claim that a proposed fix closes the path.', proposedVersion: finding.targetVersion || null, residualPath: finding.path || [] }
  }
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

function hydraRewindSummary(recall, asOf) {
  const priorScenarioIds = recall?.priorScenarioIds || recall?.relatedScenarioIds || []
  const graphContext = summarizeGraphContext(recall?.graphContext)
  return {
    status: recall?.status || 'skipped',
    asOf: recall?.asOf || asOf || null,
    datedChunkCount: recall?.datedChunkCount || 0,
    relatedCaseCount: recall?.relatedCaseCount ?? priorScenarioIds.length,
    priorScenarioIds,
    sourceUrls: [...new Set(recall?.sources || [])].filter(Boolean).slice(0, 12),
    graphContext: graphContext || { queryPathCount: 0, chunkRelationCount: 0, tripletCount: 0, triplets: [] },
    reason: recall?.reason || null,
  }
}

/** Attach only auditable HydraDB temporal-read metadata; raw chunks stay out. */
export function attachHydraRewind(report, recall) {
  if (!report) return report
  return {
    ...report,
    rewind: {
      ...report.rewind,
      memory: hydraRewindSummary(recall, report.rewind?.asOf),
    },
  }
}

export function buildInvestigationReport(ingestion, { asOf = new Date().toISOString() } = {}) {
  const findings = ingestion?.findings || []
  const advisory = ingestion?.advisory || ingestion?.collectors?.find((collector) => collector.collector === 'advisory-resolver')?.targetAdvisory || null
  const advisoryPublishedAt = dateOrNull(ingestion?.temporal?.advisoryPublishedAt || advisory?.published)
  const currentAsOf = dateOrNull(ingestion?.temporal?.collectedAt || ingestion?.completedAt) || new Date().toISOString()
  const requestedAsOf = dateOrNull(asOf) || currentAsOf
  const currentFindings = findings.map((finding) => ({
    ...finding,
    pathObservedAt: dateOrNull(finding.pathObservedAt),
    exposureDays: daysBetween(dateOrNull(finding.pathObservedAt), advisoryPublishedAt),
  })).map((finding) => ({ ...finding, proof: buildProofChain(finding, advisory) }))
  const rewindFindings = currentFindings.map((finding) => findingAsOf(finding, requestedAsOf))
  const challenge = currentFindings.map((finding) => challengeFinding(finding, advisory))
  const reached = currentFindings.filter((finding) => finding.verdict === 'REACHED')
  const declaredOnly = currentFindings.filter((finding) => finding.verdict === 'DECLARED_ONLY')
  const unaffected = currentFindings.filter((finding) => finding.verdict === 'NOT_AFFECTED')
  const fixSurvives = challenge.filter((item) => item.status === 'FIX_SURVIVES')
  const residual = challenge.filter((item) => !['FIX_SURVIVES', 'ALREADY_SAFE', 'NO_FIXED_VERSION', 'NO_REACHABLE_PATH'].includes(item.status))
  const evidenceQuality = buildEvidenceQuality({
    status: ingestion?.status || 'partial',
    collectors: ingestion?.collectors || [],
    repositories: currentFindings,
  })
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
    advisoryScope: ingestion?.advisoryScope || { status: 'not_requested', affectedSymbols: [] },
    evidenceQuality,
    repositories: currentFindings,
    challenge,
    rewind: {
      asOf: requestedAsOf,
      currentAsOf,
      advisoryPublic: advisoryPublishedAt ? new Date(requestedAsOf) >= new Date(advisoryPublishedAt) : null,
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
      alreadySafe: challenge.filter((item) => item.status === 'ALREADY_SAFE').length,
      residualPaths: residual.length,
      exposureDays: reached.map((finding) => finding.exposureDays).filter((value) => value !== null).sort((a, b) => b - a)[0] || null,
    },
    graph: ingestion?.graph || { nodes: [], edges: [] },
    sources: ingestion?.sources || [],
    limits: [
      ...currentFindings.filter((finding) => finding.sourceSampleSize).map((finding) => `${finding.repository}: ${finding.sourceBound}.`),
      'Reachability is proven only from the collected public source sample; it is not proof of runtime execution.',
      'No package code or exploit payload was executed.',
      ingestion?.advisoryScope?.status === 'failed' ? `Advisory symbol scope was unavailable: ${ingestion.advisoryScope.error || 'model request failed'}.` : null,
    ],
    generatedAt: new Date().toISOString(),
  }
}

export function createInvestigationState(query = '') {
  return {
    caseId: null,
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
