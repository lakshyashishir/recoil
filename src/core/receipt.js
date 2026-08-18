import { createHash } from 'node:crypto'
import { summarizeGraphContext } from './graph-context.js'

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])]))
}

function canonicalJson(value) {
  return JSON.stringify(stableValue(value))
}

function sourceUrlsForFinding(finding) {
  return [...new Set([
    finding.repositoryUrl,
    ...(finding.imports || []).map((item) => item.sourceUrl),
    ...(finding.evidenceSources || []),
  ].filter(Boolean))]
}

function compactFinding(finding) {
  return {
    repository: finding.repository || null,
    repositoryUrl: finding.repositoryUrl || null,
    packageName: finding.packageName || null,
    resolvedVersion: finding.resolvedVersion || null,
    resolvedVersions: finding.resolvedVersions || (finding.resolvedVersion ? [finding.resolvedVersion] : []),
    declaredRange: finding.declaredRange || null,
    verdict: finding.verdict || 'UNKNOWN',
    reason: finding.reason || null,
    path: finding.path || [],
    dependencyPath: (finding.dependencyPath || []).map((item) => ({ name: item.name, version: item.version, path: item.path, sourceUrl: item.sourceUrl || null })),
    imports: (finding.imports || []).map((item) => ({ path: item.path, line: item.line, specifier: item.specifier, packageName: item.packageName, packageAlias: item.packageAlias || null, sourceUrl: item.sourceUrl })).filter((item) => item.path || item.sourceUrl),
    sourceSampleSize: finding.sourceSampleSize ?? null,
    sourceCandidateCount: finding.sourceCandidateCount ?? null,
    sourceSampleLimit: finding.sourceSampleLimit ?? null,
    sourceBound: finding.sourceBound || null,
    advisoryScope: finding.advisoryScope || { status: 'not_requested', symbols: [] },
    pathObservedAt: finding.pathObservedAt || null,
    exposureDays: finding.exposureDays ?? null,
    fixedVersions: finding.fixedVersions || [],
    targetVersion: finding.targetVersion || null,
    rangeAllowsFix: finding.rangeAllowsFix ?? null,
    evidenceSources: sourceUrlsForFinding(finding),
    changeEvidence: finding.changeEvidence || null,
    proof: (finding.proof || []).map((step) => ({
      kind: step.kind,
      label: step.label,
      status: step.status,
      source: step.source || null,
      detail: step.detail || null,
    })),
  }
}

function compactGraph(graph = {}) {
  return {
    nodes: (graph.nodes || []).map((node) => ({ id: node.id, label: node.label, type: node.type, meta: node.meta })).filter((node) => node.id),
    edges: graph.edges || [],
  }
}

/**
 * Build a portable, source-cited proof artifact. The receipt deliberately
 * excludes raw Hydra chunks and collector internals: it is safe to download,
 * review, and attach to an incident without turning retrieval output into a
 * second unbounded data store.
 */
export function buildEvidenceReceipt({ scenarioId, query, report, hydra } = {}) {
  if (!report) return null
  const reportGraphContext = summarizeGraphContext(report.rewind?.memory?.graphContext)
  const hydraGraphContext = summarizeGraphContext(hydra?.recall?.graphContext)
  const graphContext = reportGraphContext?.tripletCount || reportGraphContext?.queryPathCount || reportGraphContext?.chunkRelationCount
    ? reportGraphContext
    : hydraGraphContext || reportGraphContext
  const content = {
    schema: 'recoil.evidence-receipt/v1',
    scenarioId: scenarioId || null,
    query: query || report.query || '',
    generatedAt: report.generatedAt || new Date().toISOString(),
    advisory: report.advisory || null,
    advisoryScope: report.advisoryScope || { status: 'not_requested', affectedSymbols: [] },
    evidenceQuality: report.evidenceQuality || null,
    repositories: (report.repositories || []).map(compactFinding),
    temporal: report.rewind || null,
    fixProof: report.challenge || [],
    graph: compactGraph(report.graph),
    hydra: {
      status: hydra?.status || 'skipped',
      error: hydra?.error || null,
      indexingStatus: hydra?.result?.indexingStatus || (hydra?.status === 'persisted' ? 'completed' : null),
      indexingPending: Boolean(hydra?.indexingPending),
      indexingError: hydra?.indexingError || null,
      memoryCount: hydra?.memoryCount || 0,
      graphContext,
      recall: hydra?.recall ? {
        status: hydra.recall.status || null,
        datedChunkCount: hydra.recall.datedChunkCount || 0,
        relatedCaseCount: hydra.recall.relatedCaseCount ?? hydra.recall.priorScenarioIds?.length ?? hydra.recall.relatedScenarioIds?.length ?? 0,
        priorScenarioIds: hydra.recall.priorScenarioIds || [],
      } : null,
    },
    sources: [...new Set(report.sources || [])],
    limits: report.limits || [],
    execution: {
      installedDependencies: false,
      executedRepositoryCode: false,
      sentExploitPayloads: false,
      runtimeCompromiseClaimed: false,
    },
  }
  const digest = createHash('sha256').update(canonicalJson(content)).digest('hex')
  return {
    ...content,
    integrity: { algorithm: 'SHA-256', value: digest },
  }
}
