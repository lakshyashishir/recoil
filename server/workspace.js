function normalizedRepository(value = '') {
  return String(value)
    .replace(/^https?:\/\/(?:www\.)?github\.com\//i, '')
    .replace(/\/(?:tree|commit)\/.*$/i, '')
    .replace(/\.git$/i, '')
    .replace(/@[^/]+$/, '')
    .replace(/^\/+|\/+$/g, '')
    .toLowerCase()
}

function findingRepository(finding = {}) {
  return normalizedRepository(finding.repositoryUrl || finding.repository)
}

function incidentStatus(summary = {}) {
  if (summary.reached > 0) return 'open'
  if (summary.unknown > 0) return 'review'
  if (summary.declaredOnly > 0) return 'observed'
  return 'clear'
}

function advisoryMetadata(report, advisoryId) {
  return (report?.advisories || []).find((item) => String(item.id).toUpperCase() === advisoryId)
    || (String(report?.advisory?.id).toUpperCase() === advisoryId ? report.advisory : null)
    || {}
}

function recordRepositoryKeys(record = {}) {
  const repositories = record.investigation?.evidence?.repositories || record.ingestion?.repositories || []
  const explicit = repositories.map((repository) => normalizedRepository(repository.repositoryUrl || repository.sourceUrl || repository.repository)).filter(Boolean)
  if (explicit.length) return [...new Set(explicit)]
  return [...new Set((record.investigation?.report?.repositories || []).map(findingRepository).filter(Boolean))]
}

export function buildIncidents(records = []) {
  const latestFindings = new Map()
  const reports = [...records]
    .filter((record) => record.investigation?.status === 'complete' && record.investigation?.report)
    .sort((left, right) => String(right.investigation.completedAt || '').localeCompare(String(left.investigation.completedAt || '')))

  const repositoryBoundaries = new Map()
  for (const record of reports) {
    if (record.investigation.report.mode !== 'repository') continue
    const observedAt = record.investigation.completedAt || record.updatedAt || ''
    for (const repository of recordRepositoryKeys(record)) {
      if (!repositoryBoundaries.has(repository)) repositoryBoundaries.set(repository, observedAt)
    }
  }

  for (const record of reports) {
    const report = record.investigation.report
    const observedAt = record.investigation.completedAt || record.updatedAt || ''
    for (const finding of report.repositories || []) {
      const advisoryId = String(finding.advisoryId || report.advisory?.id || '').toUpperCase()
      const repository = findingRepository(finding)
      if (!advisoryId || !repository) continue
      const repositoryBoundary = repositoryBoundaries.get(repository)
      if (repositoryBoundary && repositoryBoundary > observedAt) continue
      const key = `${advisoryId}:${repository}`
      if (latestFindings.has(key)) continue
      latestFindings.set(key, {
        ...finding,
        advisoryId,
        repositoryKey: repository,
        caseId: record.id,
        scannedAt: record.investigation.completedAt || record.updatedAt || null,
        challenge: (report.challenge || []).find((item) => item.repository === finding.repository && (!item.advisoryId || String(item.advisoryId).toUpperCase() === advisoryId)) || null,
        metadata: advisoryMetadata(report, advisoryId),
      })
    }
  }

  const grouped = new Map()
  for (const finding of latestFindings.values()) {
    const incident = grouped.get(finding.advisoryId) || {
      id: finding.advisoryId,
      title: finding.metadata.summary || finding.advisoryId,
      published: finding.metadata.published || null,
      modified: finding.metadata.modified || null,
      sourceUrl: finding.metadata.sourceUrl || null,
      findings: [],
      repositories: new Set(),
      cases: new Set(),
      summary: { reached: 0, declaredOnly: 0, notAffected: 0, unknown: 0 },
      firstObservedAt: finding.scannedAt,
      lastObservedAt: finding.scannedAt,
    }
    incident.findings.push(finding)
    incident.repositories.add(finding.repositoryKey)
    incident.cases.add(finding.caseId)
    incident.firstObservedAt = [incident.firstObservedAt, finding.scannedAt].filter(Boolean).sort()[0] || null
    incident.lastObservedAt = [incident.lastObservedAt, finding.scannedAt].filter(Boolean).sort().at(-1) || null
    if (finding.verdict === 'REACHED') incident.summary.reached += 1
    else if (finding.verdict === 'DECLARED_ONLY') incident.summary.declaredOnly += 1
    else if (finding.verdict === 'NOT_AFFECTED') incident.summary.notAffected += 1
    else incident.summary.unknown += 1
    grouped.set(finding.advisoryId, incident)
  }

  return [...grouped.values()].map((incident) => ({
    ...incident,
    status: incidentStatus(incident.summary),
    repositoryCount: incident.repositories.size,
    caseCount: incident.cases.size,
    repositories: [...incident.repositories],
    cases: [...incident.cases],
    findings: incident.findings.sort((left, right) => {
      const order = { REACHED: 0, UNKNOWN: 1, DECLARED_ONLY: 2, NOT_AFFECTED: 3 }
      return (order[left.verdict] ?? 1) - (order[right.verdict] ?? 1)
    }),
  })).sort((left, right) => {
    const order = { open: 0, review: 1, observed: 2, clear: 3 }
    return order[left.status] - order[right.status] || String(right.lastObservedAt || '').localeCompare(String(left.lastObservedAt || ''))
  })
}

function edgeParts(edge) {
  if (Array.isArray(edge)) return [edge[0], edge[1], null]
  return [edge?.source || edge?.from, edge?.target || edge?.to, edge?.predicate || edge?.label || null]
}

function nodeBelongsToRepository(node = {}, repository = '') {
  const target = normalizedRepository(repository)
  if (!target) return false
  if (normalizedRepository(node.meta?.repository) === target) return true
  if (normalizedRepository(node.label) === target) return true
  const haystack = `${node.id || ''} ${node.sourceUrl || ''}`.toLowerCase()
  return haystack.includes(target)
}

function repositoryGraph(graph = {}, repository = '') {
  const nodes = graph.nodes || []
  const edges = (graph.edges || []).map((edge) => {
    const [source, target, predicate] = edgeParts(edge)
    return { source, target, predicate }
  }).filter((edge) => edge.source && edge.target)
  const byId = new Map(nodes.map((node) => [node.id, node]))
  const incoming = new Map()
  const outgoing = new Map()
  for (const edge of edges) {
    incoming.set(edge.target, [...(incoming.get(edge.target) || []), edge.source])
    outgoing.set(edge.source, [...(outgoing.get(edge.source) || []), edge.target])
  }
  const seeds = nodes.filter((node) => node.type === 'repository' && nodeBelongsToRepository(node, repository)).map((node) => node.id)
  const visible = new Set(seeds)
  let frontier = [...seeds]
  for (let depth = 0; depth < 8 && frontier.length; depth += 1) {
    const next = []
    for (const id of frontier) for (const parent of incoming.get(id) || []) if (!visible.has(parent)) { visible.add(parent); next.push(parent) }
    frontier = next
  }
  frontier = [...visible].filter((id) => nodeBelongsToRepository(byId.get(id), repository) || byId.get(id)?.type === 'repository')
  for (let depth = 0; depth < 8 && frontier.length; depth += 1) {
    const next = []
    for (const id of frontier) {
      for (const child of outgoing.get(id) || []) {
        if (visible.has(child) || !nodeBelongsToRepository(byId.get(child), repository)) continue
        visible.add(child)
        next.push(child)
      }
    }
    frontier = next
  }
  return {
    nodes: nodes.filter((node) => visible.has(node.id)),
    edges: edges.filter((edge) => visible.has(edge.source) && visible.has(edge.target)),
  }
}

export function buildFleetGraph(records = [], watches = [], incidents = []) {
  const nodes = new Map()
  const edges = new Map()
  for (const watch of watches) {
    const record = records.find((item) => item.id === watch.latestCaseId && item.investigation?.report)
    if (!record) continue
    const scoped = repositoryGraph(record.investigation.report.graph, watch.repository)
    for (const node of scoped.nodes) {
      if (!node?.id || nodes.size >= 180) continue
      const current = nodes.get(node.id)
      nodes.set(node.id, { ...current, ...node, repositories: [...new Set([...(current?.repositories || []), watch.repository])], caseIds: [...new Set([...(current?.caseIds || []), record.id])] })
    }
    for (const edge of scoped.edges) {
      const [source, target, predicate] = edgeParts(edge)
      if (!source || !target || !nodes.has(source) || !nodes.has(target) || edges.size >= 260) continue
      const key = `${source}|${target}|${predicate || ''}`
      const current = edges.get(key)
      edges.set(key, { source, target, predicate, repositories: [...new Set([...(current?.repositories || []), watch.repository])], caseIds: [...new Set([...(current?.caseIds || []), record.id])] })
    }
  }
  const reachedNodeIds = new Set(incidents.flatMap((incident) => incident.findings)
    .filter((finding) => finding.verdict === 'REACHED')
    .flatMap((finding) => [
      `advisory:${finding.advisoryId}`,
      `package:${finding.packageName}@${finding.resolvedVersion}`,
      `repo:${finding.repository}`,
      ...((finding.imports || []).map((item) => `code:${finding.repository}:${item.path}`)),
    ]))
  return {
    nodes: [...nodes.values()].map((node) => ({ ...node, reached: reachedNodeIds.has(node.id) })),
    edges: [...edges.values()],
    counts: [...nodes.values()].reduce((result, node) => ({ ...result, [node.type || 'unknown']: (result[node.type || 'unknown'] || 0) + 1 }), {}),
    truncated: nodes.size >= 180 || edges.size >= 260,
  }
}

export function buildIncidentGraph(records = [], advisoryId = '') {
  const target = String(advisoryId).toUpperCase()
  const nodes = new Map()
  const edges = new Map()
  const incident = buildIncidents(records).find((item) => item.id === target)
  for (const finding of incident?.findings || []) {
    const record = records.find((item) => item.id === finding.caseId)
    const graph = repositoryGraph(record?.investigation?.report?.graph, finding.repositoryKey)
    for (const node of graph.nodes) if (nodes.size < 140) nodes.set(node.id, node)
    for (const edge of graph.edges) {
      if (nodes.has(edge.source) && nodes.has(edge.target) && edges.size < 220) edges.set(`${edge.source}|${edge.target}|${edge.predicate || ''}`, edge)
    }
  }
  return { nodes: [...nodes.values()], edges: [...edges.values()], truncated: nodes.size >= 140 || edges.size >= 220 }
}

function summarizeScopedFindings(findings = []) {
  const summary = { reached: 0, declaredOnly: 0, notAffected: 0, unknown: 0 }
  for (const finding of findings) {
    if (finding.verdict === 'REACHED') summary.reached += 1
    else if (finding.verdict === 'DECLARED_ONLY') summary.declaredOnly += 1
    else if (finding.verdict === 'NOT_AFFECTED') summary.notAffected += 1
    else summary.unknown += 1
  }
  return summary
}

function scopeWorkspace(workspace = {}, scope = {}) {
  if (!scope?.type || scope.type === 'workspace') return workspace
  const incidents = workspace.incidents || []
  const watches = workspace.repositories || []
  const cases = workspace.cases || []
  if (scope.type === 'incident') {
    const id = String(scope.value || '').toUpperCase()
    const selected = incidents.filter((incident) => incident.id === id)
    const repositories = new Set(selected.flatMap((incident) => incident.repositories || []))
    const caseIds = new Set(selected.flatMap((incident) => incident.cases || []))
    return { ...workspace, incidents: selected, repositories: watches.filter((watch) => repositories.has(watch.repository)), cases: cases.filter((item) => caseIds.has(item.id) || String(item.advisoryId || '').toUpperCase() === id) }
  }
  if (scope.type === 'repository') {
    const repository = normalizedRepository(scope.value)
    const selected = incidents.map((incident) => {
      const findings = incident.findings.filter((finding) => finding.repositoryKey === repository)
      if (!findings.length) return null
      const summary = summarizeScopedFindings(findings)
      return { ...incident, findings, summary, status: incidentStatus(summary), repositories: [repository], repositoryCount: 1, cases: [...new Set(findings.map((finding) => finding.caseId))] }
    }).filter(Boolean)
    return {
      ...workspace,
      incidents: selected,
      repositories: watches.filter((watch) => watch.repository === repository),
      cases: cases.filter((item) => (item.scannedRepositories || []).some((entry) => normalizedRepository(entry.repositoryUrl || entry.repository) === repository) || (item.repositories || []).some((entry) => normalizedRepository(entry.repositoryUrl || entry.repository) === repository)),
    }
  }
  return workspace
}

export function answerWorkspaceQuestion(question, workspace, scope = { type: 'workspace' }) {
  const query = String(question || '').trim().toLowerCase()
  if (!query) return null
  const scoped = scopeWorkspace(workspace, scope)
  const incidents = scoped.incidents || []
  const watches = scoped.repositories || []
  const open = incidents.filter((incident) => incident.status === 'open')
  if (/who|owner|owns|route/.test(query)) {
    const rows = open.flatMap((incident) => incident.findings.filter((finding) => finding.verdict === 'REACHED').map((finding) => ({
      primary: finding.repositoryKey,
      secondary: [...new Set((finding.imports || []).flatMap((item) => item.owners || []))].join(', ') || 'No CODEOWNERS match',
      source: finding.imports?.[0]?.sourceUrl || finding.repositoryUrl,
      caseId: finding.caseId,
    })))
    return { intent: 'owners', sentence: rows.length ? `${rows.length} reached path${rows.length === 1 ? '' : 's'} can be routed from current evidence.` : 'No open reached path has an owner to route.', rows }
  }
  if (/fix|upgrade|remedi|close/.test(query)) {
    const rows = open.flatMap((incident) => incident.findings.filter((finding) => finding.verdict === 'REACHED').map((finding) => ({
      primary: `${incident.id} · ${finding.repositoryKey}`,
      secondary: finding.challenge?.proposedVersion ? `Upgrade ${finding.packageName} to ${finding.challenge.proposedVersion} · ${String(finding.challenge.status).replaceAll('_', ' ').toLowerCase()}` : finding.challenge?.detail || 'No verified version change',
      source: finding.evidenceSources?.[0] || incident.sourceUrl,
      caseId: finding.caseId,
    })))
    return { intent: 'fixes', sentence: `${rows.filter((row) => /fix survives/.test(row.secondary)).length} verified fix${rows.length === 1 ? '' : 'es'} are available across open incidents.`, rows }
  }
  if (/change|previous|since|delta|history|new/.test(query)) {
    const changed = (scoped.cases || []).filter((item) => item.changes && Object.values(item.changes).some(Number)).slice(0, 12)
    return { intent: 'changes', sentence: `${changed.length} recent scan${changed.length === 1 ? '' : 's'} contain graph changes against prior evidence.`, rows: changed.map((item) => ({ primary: item.advisoryId || item.scannedRepositories?.[0]?.repository || item.id, secondary: `${item.changes.addedNodes} entities added · ${item.changes.removedNodes} removed`, caseId: item.id })) }
  }
  if (/repo|watch|inventory|coverage/.test(query)) {
    return { intent: 'repositories', sentence: `${watches.length} repositories are on watch; ${watches.filter((watch) => watch.needsAction > 0).length} currently have a reached path.`, rows: watches.map((watch) => ({ primary: watch.repository, secondary: `${watch.scanCount || 0} scans · ${watch.needsAction || 0} open · ${watch.lastScannedAt || 'never scanned'}`, source: watch.repositoryUrl, caseId: watch.latestCaseId })) }
  }
  const rows = incidents.map((incident) => ({ primary: incident.id, secondary: `${incident.status} · ${incident.summary.reached} reached · ${incident.repositoryCount} repositories`, source: incident.sourceUrl, caseId: incident.cases?.[0] }))
  return { intent: 'incidents', sentence: `${open.length} of ${incidents.length} incidents have a source-backed reached path.`, rows }
}

export { normalizedRepository }
