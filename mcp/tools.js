import { randomUUID } from 'node:crypto'
import { buildEvidenceBrief } from '../src/core/brief.js'
import { buildEvidenceReceipt } from '../src/core/receipt.js'
import { parseInvestigationInput } from '../server/collectors.js'
import { startInvestigation } from '../server/investigation.js'
import { findScenario, getOrCreate, snapshot, workspaceSnapshot } from '../server/index.js'

function repositoryName(value = '') {
  return String(value).replace(/^https?:\/\/github\.com\//, '').replace(/\/tree\/.*$/, '').replace(/\.git$/, '')
}

function reportSummary(report = {}) {
  const summary = report.summary || {}
  return {
    mode: report.mode || 'advisory',
    advisoryId: report.advisory?.id || null,
    packageName: report.package || report.packageName || null,
    reached: Number(summary.reached || 0),
    presentOnly: Number(summary.declaredOnly || 0),
    notAffected: Number(summary.notAffected || 0),
    needsEvidence: Number(summary.unknown || 0),
    packagesChecked: Number(summary.packagesChecked || 0),
    advisoryChecks: Number(summary.totalAdvisories || summary.totalFindings || 0),
    exposureDays: summary.exposureDays ?? null,
    generatedAt: report.generatedAt || null,
  }
}

function challengeFor(report, finding) {
  return (report.challenge || []).find((item) => item.repository === finding.repository && (!item.packageName || item.packageName === finding.packageName))
    || (report.challenge || []).find((item) => item.repository === finding.repository)
    || null
}

function getCase(caseId, { requireReport = true } = {}) {
  const record = findScenario(caseId)
  if (!record) throw new Error(`Unknown Recoil case: ${caseId}`)
  const current = snapshot(record)
  const investigation = current.investigation || {}
  if (requireReport && !investigation.report) {
    throw new Error(`Case ${caseId} is ${investigation.status || 'not ready'}; wait for the investigation to complete`)
  }
  return { record, snapshot: current, investigation, report: investigation.report }
}

export function listCases() {
  const workspace = workspaceSnapshot()
  return {
    metrics: workspace.metrics,
    cases: workspace.cases.map((item) => ({
      caseId: item.id,
      query: item.query,
      status: item.status,
      completedAt: item.completedAt || null,
      advisoryId: item.advisoryId || null,
      summary: item.summary,
      graph: item.graph,
      repositories: item.repositories.map((finding) => ({
        repository: finding.repository,
        verdict: finding.verdict,
        packageName: finding.packageName,
        resolvedVersion: finding.resolvedVersion,
      })),
    })),
  }
}

export function caseSummary(caseId) {
  const { record, investigation, report } = getCase(caseId, { requireReport: false })
  if (!report) {
    return {
      caseId,
      query: record.query || null,
      status: investigation.status || 'idle',
      step: investigation.step || 'idle',
      summary: null,
      repositories: [],
      events: (investigation.events || []).slice(-8).map((event) => ({ key: event.key, status: event.status, title: event.title, detail: event.detail || null })),
      hydra: { status: investigation.hydra?.status || 'not started', memories: investigation.hydra?.memoryCount || 0, datedFacts: 0, graphRead: 'not verified', graphRelations: 0 },
    }
  }
  const findings = report.repositories || []
  return {
    caseId,
    query: report.query || record.query || null,
    status: investigation.status,
    summary: reportSummary(report),
    repositories: findings.map((finding) => ({
      repository: repositoryName(finding.repository),
      verdict: finding.verdict,
      packageName: finding.packageName || null,
      resolvedVersion: finding.resolvedVersion || null,
      importSites: finding.imports?.length || 0,
      reason: finding.reason || null,
    })),
    hydra: {
      status: investigation.hydra?.status || 'not available',
      memories: investigation.hydra?.memoryCount || 0,
      datedFacts: investigation.hydra?.recall?.datedChunkCount || 0,
      graphRead: investigation.hydra?.graphVerification?.status || 'not verified',
      graphRelations: investigation.hydra?.graphVerification?.tripletCount || 0,
    },
  }
}

export function reachedPaths(caseId) {
  const { report } = getCase(caseId)
  const findings = (report.repositories || []).filter((finding) => finding.verdict === 'REACHED')
  return {
    caseId,
    count: findings.length,
    paths: findings.map((finding) => {
      const owners = [...new Set([
        ...(finding.codeOwners || []),
        ...(finding.imports || []).flatMap((item) => item.owners || []),
      ])]
      return {
        repository: repositoryName(finding.repository),
        advisoryId: finding.advisoryId || report.advisory?.id || null,
        packageName: finding.packageName || null,
        resolvedVersion: finding.resolvedVersion || null,
        route: finding.path || [],
        importSites: (finding.imports || []).map((item) => ({
          path: item.path,
          line: item.line || null,
          symbol: item.symbol || null,
          snippet: item.snippet || null,
          owners: item.owners || [],
          sourceUrl: item.sourceUrl || null,
        })),
        owners,
        firstObserved: finding.pathObservation ? {
          at: finding.pathObservation.observedAt || null,
          commit: finding.pathObservation.commit || null,
          author: finding.pathObservation.author || null,
          message: finding.pathObservation.message || null,
          sourceUrl: finding.pathObservation.sourceUrl || null,
          caveat: finding.pathObservation.caveat || null,
        } : null,
        evidenceSources: finding.evidenceSources || [],
      }
    }),
  }
}

export function verifiedFixPlan(caseId) {
  const { report } = getCase(caseId)
  const findings = report.repositories || []
  const fixes = findings.map((finding) => {
    const challenge = challengeFor(report, finding)
    return {
      repository: repositoryName(finding.repository),
      packageName: finding.packageName || null,
      currentVersion: finding.resolvedVersion || null,
      targetVersion: challenge?.proposedVersion || null,
      status: challenge?.status || 'NOT_TESTED',
      detail: challenge?.detail || null,
      sourceBackedRoute: finding.verdict === 'REACHED',
    }
  })
  return {
    caseId,
    smallestFixSet: report.smallestFixSet || null,
    fixes,
    verified: fixes.filter((item) => item.status === 'FIX_SURVIVES').length,
  }
}

function nodeKey(node = {}) {
  return node.id || `${node.type || node.kind || 'node'}:${node.label || node.name || ''}`
}

function edgeKey(edge = {}) {
  return `${edge.from || edge.source}|${edge.predicate || edge.type || ''}|${edge.to || edge.target}`
}

export function compareHistory(caseId) {
  const { investigation, report } = getCase(caseId)
  const current = report.graph || { nodes: [], edges: [] }
  const before = report.rewind?.graph || { nodes: [], edges: [] }
  const beforeNodes = new Set((before.nodes || []).map(nodeKey))
  const currentNodes = new Set((current.nodes || []).map(nodeKey))
  const beforeEdges = new Set((before.edges || []).map(edgeKey))
  const currentEdges = new Set((current.edges || []).map(edgeKey))
  const difference = (left, right) => [...left].filter((item) => !right.has(item))
  const memory = report.rewind?.memory || investigation.hydra?.recall || {}
  return {
    caseId,
    before: report.rewind?.beforeAdvisory || null,
    current: report.rewind?.currentAsOf || report.rewind?.asOf || report.generatedAt || null,
    graphDelta: {
      addedNodes: difference(currentNodes, beforeNodes),
      removedNodes: difference(beforeNodes, currentNodes),
      addedEdges: difference(currentEdges, beforeEdges),
      removedEdges: difference(beforeEdges, currentEdges),
    },
    exposureDays: report.summary?.exposureDays ?? null,
    relatedCases: memory.relatedCases || [],
    datedFacts: memory.datedChunkCount || 0,
    hydraStatus: investigation.hydra?.status || memory.status || 'not available',
  }
}

export function inspectGraph(caseId) {
  const { investigation, report } = getCase(caseId)
  const graph = report.graph || { nodes: [], edges: [] }
  return {
    caseId,
    nodes: graph.nodes || [],
    edges: graph.edges || [],
    nodeCount: graph.nodes?.length || 0,
    edgeCount: graph.edges?.length || 0,
    hydraVerification: investigation.hydra?.graphVerification || null,
    boundary: 'Observed public evidence only. Recoil does not infer missing edges or claim runtime execution.',
  }
}

export function exportHandoff(caseId, format = 'brief') {
  const { record, investigation, report } = getCase(caseId)
  const query = report.query || record.query || ''
  if (format === 'receipt') {
    const receipt = buildEvidenceReceipt({ scenarioId: caseId, query, report, hydra: investigation.hydra })
    if (!receipt) throw new Error(`Case ${caseId} does not have a complete evidence receipt`)
    return { caseId, format, artifact: receipt }
  }
  const brief = buildEvidenceBrief({ scenarioId: caseId, query, report, hydra: investigation.hydra })
  if (!brief) throw new Error(`Case ${caseId} does not have a complete evidence brief`)
  return { caseId, format: 'brief', artifact: brief }
}

export function scanRepository({ repository, selector = '', caseId = null } = {}) {
  const query = [selector, repository].map((value) => String(value || '').trim()).filter(Boolean).join(' ')
  const target = parseInvestigationInput(query)
  if (target.repositories.length !== 1) throw new Error('scan_repository requires one public GitHub repository URL')
  if (selector && !target.advisoryId && !target.packageName) throw new Error('selector must be a GHSA/CVE advisory or package name')
  const id = caseId || `mcp-${randomUUID().slice(0, 8)}`
  if (findScenario(id)) throw new Error(`Recoil case ${id} already exists; choose a new caseId or omit it`)
  const record = getOrCreate(id)
  startInvestigation(record, query)
  return { caseId: id, query, status: 'running', next: `Call case_summary with caseId ${id} until status is complete or failed.` }
}
