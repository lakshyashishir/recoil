import { createHash } from 'node:crypto'

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
    declaredRange: finding.declaredRange || null,
    verdict: finding.verdict || 'UNKNOWN',
    reason: finding.reason || null,
    path: finding.path || [],
    imports: (finding.imports || []).map((item) => ({ path: item.path, line: item.line, specifier: item.specifier, sourceUrl: item.sourceUrl })).filter((item) => item.path || item.sourceUrl),
    sourceSampleSize: finding.sourceSampleSize ?? null,
    sourceBound: finding.sourceBound || null,
    pathObservedAt: finding.pathObservedAt || null,
    exposureDays: finding.exposureDays ?? null,
    fixedVersions: finding.fixedVersions || [],
    targetVersion: finding.targetVersion || null,
    rangeAllowsFix: finding.rangeAllowsFix ?? null,
    evidenceSources: sourceUrlsForFinding(finding),
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
  const content = {
    schema: 'recoil.evidence-receipt/v1',
    scenarioId: scenarioId || null,
    query: query || report.query || '',
    generatedAt: report.generatedAt || new Date().toISOString(),
    advisory: report.advisory || null,
    advisoryScope: report.advisoryScope || { status: 'not_requested', affectedSymbols: [] },
    repositories: (report.repositories || []).map(compactFinding),
    temporal: report.rewind || null,
    fixProof: report.challenge || [],
    graph: compactGraph(report.graph),
    hydra: {
      status: hydra?.status || 'skipped',
      memoryCount: hydra?.memoryCount || 0,
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
