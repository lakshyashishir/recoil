export const RESPONSE_BUDGET = 8

export const NODES = [
  { id: 'maintainer', label: 'maintainer: devtools-labs', type: 'person', meta: 'publisher trust', x: 8, y: 80 },
  { id: 'release', label: 'ua-parser-js@0.7.29', type: 'package', meta: 'compromised release', x: 8, y: 45 },
  { id: 'registry', label: 'npm registry', type: 'registry', meta: 'public package source', x: 22, y: 24 },
  { id: 'resolver', label: 'npm semver resolver', type: 'resolver', meta: 'transitive resolution', x: 22, y: 45 },
  { id: 'runner', label: 'github-actions runner', type: 'infra', meta: 'shared build trust', x: 22, y: 72 },
  { id: 'lockfile', label: 'storefront lockfile', type: 'repo', meta: 'resolved dependency', x: 37, y: 45 },
  { id: 'repo', label: 'fixture / storefront-api', type: 'repo', meta: 'synthetic demo repo', x: 51, y: 27 },
  { id: 'ci', label: 'release promotion job', type: 'infra', meta: 'artifact gate', x: 51, y: 69 },
  { id: 'artifact', label: 'container artifact', type: 'artifact', meta: 'promoted build', x: 65, y: 27 },
  { id: 'secrets', label: 'deployment secrets', type: 'secret', meta: 'runtime trust', x: 65, y: 82 },
  { id: 'gateway', label: 'api-gateway', type: 'service', meta: 'deployed · eu-west-1', x: 78, y: 14 },
  { id: 'storefront', label: 'storefront-web', type: 'service', meta: 'deployed · us-east-1', x: 78, y: 31 },
  { id: 'payments', label: 'payments-worker', type: 'service', meta: 'deployed · us-east-1', x: 78, y: 48 },
  { id: 'checkout', label: 'checkout-worker', type: 'service', meta: 'deployed · eu-west-1', x: 78, y: 65 },
  { id: 'admin', label: 'admin-console', type: 'service', meta: 'internal surface', x: 78, y: 82 },
  { id: 'partner-webhook', label: 'partner-webhook', type: 'service', meta: 'external integration', x: 78, y: 94 },
  { id: 'customer-db', label: 'customer database', type: 'data', meta: 'high-value asset', x: 93, y: 48 },
  { id: 'billing-vault', label: 'billing vault', type: 'data', meta: 'payment tokens', x: 93, y: 20 },
  { id: 'analytics-lake', label: 'analytics lake', type: 'data', meta: 'behavioral data', x: 93, y: 76 },
  { id: 'feature-flags', label: 'feature flag store', type: 'data', meta: 'release control', x: 93, y: 94 },
  { id: 'observability', label: 'runtime telemetry', type: 'telemetry', meta: 'detection signal', x: 65, y: 50 },
  { id: 'audit-log', label: 'audit log archive', type: 'data', meta: 'forensic evidence', x: 65, y: 8 },
  { id: 'security', label: 'security response', type: 'person', meta: 'defender decision', x: 51, y: 92 },
]

export const EDGES = [
  ['maintainer', 'release'],
  ['release', 'registry'],
  ['release', 'resolver'],
  ['registry', 'resolver'],
  ['resolver', 'lockfile'],
  ['lockfile', 'repo'],
  ['lockfile', 'ci'],
  ['release', 'runner'],
  ['runner', 'ci'],
  ['repo', 'artifact'],
  ['ci', 'artifact'],
  ['ci', 'secrets'],
  ['artifact', 'gateway'],
  ['artifact', 'storefront'],
  ['artifact', 'payments'],
  ['artifact', 'checkout'],
  ['artifact', 'admin'],
  ['artifact', 'partner-webhook'],
  ['secrets', 'payments'],
  ['gateway', 'observability'],
  ['payments', 'observability'],
  ['checkout', 'customer-db'],
  ['payments', 'customer-db'],
  ['payments', 'billing-vault'],
  ['admin', 'customer-db'],
  ['admin', 'feature-flags'],
  ['storefront', 'analytics-lake'],
  ['partner-webhook', 'analytics-lake'],
  ['observability', 'security'],
  ['observability', 'audit-log'],
]

export const INTERVENTIONS = [
  { id: 'upgrade', title: 'Pin a known-good release', description: 'Stop the compromised package at resolution', cost: 1, reduction: 34 },
  { id: 'block-promotion', title: 'Block artifact promotion', description: 'Hold CI and future releases; keep existing artifacts in scope', cost: 2, reduction: 28 },
  { id: 'quarantine', title: 'Quarantine exposed services', description: 'Remove affected workloads from the path', cost: 2, reduction: 22 },
  { id: 'revoke', title: 'Revoke publisher trust', description: 'Invalidate the maintainer and release edge', cost: 3, reduction: 20 },
  { id: 'rotate-secrets', title: 'Rotate runtime secrets', description: 'Cut credential-assisted lateral movement', cost: 3, reduction: 14 },
  { id: 'restore', title: 'Restore and validate', description: 'Redeploy from a verified artifact', cost: 1, reduction: 9 },
]

const RISK_WEIGHTS = {
  data: 40,
  service: 12,
  artifact: 9,
  infra: 7,
  secret: 6,
  repo: 5,
  package: 4,
  resolver: 3,
  registry: 3,
  person: 2,
  telemetry: 2,
  default: 1,
}

export function createEvents(packageName = 'ua-parser-js', advisory = 'CVE-2021-4229', context = {}) {
  const repositoryLine = context.repository ? ` from ${context.repository}` : ''
  const dependencyLine = context.dependencyCount ? `${context.dependencyCount} manifest dependencies mapped` : 'Manifest and registry metadata mapped'
  return [
    { id: 'armed', side: 'system', actor: 'orchestrator', intent: 'establish scope', label: 'Case opened', detail: `${packageName} and ${advisory} registered for analysis${repositoryLine}` },
    { id: 'maintainer_access', side: 'attack', actor: 'attack planner', intent: 'find a trust edge', label: 'Trust path identified', detail: 'Maintainer privileges connect to the release channel' },
    { id: 'release_published', side: 'attack', actor: 'attack planner', intent: 'introduce the source', label: 'Release published', detail: `${packageName} becomes available to dependency resolvers` },
    { id: 'dependency_resolved', side: 'attack', actor: 'attack planner', intent: 'cross dependency edges', label: 'Dependency resolved', detail: dependencyLine },
    { id: 'lockfile_promoted', side: 'attack', actor: 'attack planner', intent: 'cross the build gate', label: 'Lockfile crosses promotion', detail: 'The dependency enters a build and release candidate' },
    { id: 'deployment_fanout', side: 'attack', actor: 'attack planner', intent: 'maximize reach', label: 'Deployment fan-out', detail: 'One artifact reaches five production surfaces' },
    { id: 'runtime_exposed', side: 'attack', actor: 'attack planner', intent: 'reach a valuable asset', label: 'High-value path exposed', detail: 'Payments and checkout can reach customer data' },
    { id: 'defender_alert', side: 'defense', actor: 'defender monitor', intent: 'surface evidence', label: 'Telemetry raises an alert', detail: `Runtime evidence connects ${packageName} to active services` },
    { id: 'containment_window', side: 'defense', actor: 'containment planner', intent: 'score counterfactuals', label: 'Containment window calculated', detail: 'Controls are scored against the reachable attack path' },
    { id: 'response_ready', side: 'defense', actor: 'defender operator', intent: 'choose a control', label: 'Response loop ready', detail: 'Choose a control, observe the new path, and continue' },
  ]
}

export const EVENTS = createEvents()

export const SCENARIO = {
  id: '0017',
  query: 'CVE-2021-4229  /  fixture/storefront-api',
  advisory: 'CVE-2021-4229 / GHSA-pjwm-rvh2-c87w',
  graphVersion: 'v0.6.0',
}

export function createInitialState() {
  return {
    running: false,
    eventIndex: 0,
    selectedActions: [],
    selectedNode: 'release',
  }
}

export function isComplete(state, eventCount = EVENTS.length) {
  return state.eventIndex >= eventCount
}

export function getSpent(state) {
  return state.selectedActions.reduce((sum, id) => sum + (INTERVENTIONS.find((item) => item.id === id)?.cost || 0), 0)
}

export function getReduction(state) {
  return state.selectedActions.reduce((sum, id) => sum + (INTERVENTIONS.find((item) => item.id === id)?.reduction || 0), 0)
}

function nodeWeight(node) {
  return node.riskWeight || RISK_WEIGHTS[node.type] || RISK_WEIGHTS.default
}

function getProgressNodeIds(state, graphNodes = NODES) {
  const active = new Set()
  if (state.eventIndex >= 1) active.add('maintainer')
  if (state.eventIndex >= 2) active.add('release')
  if (state.eventIndex >= 3) {
    active.add('registry')
    active.add('resolver')
  }
  if (state.eventIndex >= 4) active.add('lockfile')
  if (state.eventIndex >= 5) {
    active.add('repo')
    active.add('runner')
    active.add('ci')
  }
  if (state.eventIndex >= 6) {
    active.add('artifact')
    active.add('secrets')
    active.add('gateway')
    active.add('storefront')
    active.add('payments')
    active.add('checkout')
    active.add('admin')
    active.add('partner-webhook')
  }
  if (state.eventIndex >= 7) {
    active.add('observability')
    active.add('customer-db')
    active.add('billing-vault')
    active.add('analytics-lake')
    active.add('feature-flags')
    active.add('audit-log')
  }
  if (state.eventIndex >= 8) active.add('security')
  graphNodes.filter((node) => !NODES.some((known) => known.id === node.id)).forEach((node) => {
    if (state.eventIndex >= (node.activeAt || 4)) active.add(node.id)
  })
  return active
}

export function getBlockedNodeIds(state, graphNodes = NODES) {
  const blocked = new Set()
  if (state.selectedActions.includes('upgrade')) {
    blocked.add('resolver')
    blocked.add('lockfile')
    graphNodes.filter((node) => node.role === 'target-dependency').forEach((node) => blocked.add(node.id))
  }
  if (state.selectedActions.includes('block-promotion')) {
    blocked.add('ci')
  }
  if (state.selectedActions.includes('quarantine')) {
    ;['gateway', 'storefront', 'payments', 'checkout', 'admin', 'partner-webhook'].forEach((id) => blocked.add(id))
  }
  if (state.selectedActions.includes('revoke')) blocked.add('maintainer')
  if (state.selectedActions.includes('rotate-secrets')) {
    blocked.add('secrets')
    blocked.add('customer-db')
  }
  if (state.selectedActions.includes('restore')) blocked.add('artifact')
  return blocked
}

function graphTraversal(graphNodes, graphEdges, state) {
  const eligible = getProgressNodeIds({ ...state, selectedActions: [] }, graphNodes)
  const blocked = getBlockedNodeIds(state, graphNodes)
  const traversable = new Set([...eligible].filter((id) => !blocked.has(id)))
  const adjacency = new Map([...traversable].map((id) => [id, []]))
  graphEdges.forEach(([from, to]) => {
    if (adjacency.has(from) && traversable.has(to)) adjacency.get(from).push(to)
  })
  const sources = ['release', 'maintainer'].filter((id) => traversable.has(id))
  const reachable = new Set()
  const previous = new Map()
  const queue = [...sources]
  sources.forEach((id) => reachable.add(id))
  while (queue.length) {
    const current = queue.shift()
    for (const next of adjacency.get(current) || []) {
      if (reachable.has(next)) continue
      reachable.add(next)
      previous.set(next, current)
      queue.push(next)
    }
  }
  return { eligible, blocked, traversable, adjacency, sources, reachable, previous }
}

function reconstructPath(previous, source, target) {
  if (source === target) return [source]
  if (!previous.has(target)) return []
  const path = [target]
  let current = target
  while (current !== source && previous.has(current)) {
    current = previous.get(current)
    path.unshift(current)
  }
  return path[0] === source ? path : []
}

function enumeratePaths(adjacency, sources, target, limit = 3) {
  const paths = []
  function walk(current, path) {
    if (paths.length >= limit) return
    if (current === target) {
      paths.push([...path])
      return
    }
    for (const next of adjacency.get(current) || []) {
      if (path.includes(next)) continue
      walk(next, [...path, next])
    }
  }
  sources.forEach((source) => walk(source, [source]))
  return paths
}

export function getReachability(state, graphNodes = NODES, graphEdges = EDGES) {
  const traversal = graphTraversal(graphNodes, graphEdges, state)
  const nodeById = new Map(graphNodes.map((node) => [node.id, node]))
  const targets = graphNodes.filter((node) => node.type === 'data' || node.role === 'high-value')
  const reachableTargets = targets.filter((node) => traversal.reachable.has(node.id))
  const primaryTarget = [...reachableTargets].sort((left, right) => nodeWeight(right) - nodeWeight(left))[0]
  const source = primaryTarget
    ? traversal.sources.find((candidate) => reconstructPath(traversal.previous, candidate, primaryTarget.id).length)
    : null
  const primaryPath = source ? reconstructPath(traversal.previous, source, primaryTarget.id) : []
  const alternatePaths = primaryTarget ? enumeratePaths(traversal.adjacency, traversal.sources, primaryTarget.id) : []
  const reachableRisk = [...traversal.reachable].reduce((sum, id) => sum + nodeWeight(nodeById.get(id) || {}), 0)
  const baselineEventIndex = Math.max(EVENTS.length, ...graphNodes.map((node) => node.activeAt || 0))
  const baselineTraversal = graphTraversal(graphNodes, graphEdges, { ...state, eventIndex: baselineEventIndex, selectedActions: [] })
  const baselineRisk = [...baselineTraversal.reachable].reduce((sum, id) => sum + nodeWeight(nodeById.get(id) || {}), 0)
  const exposure = baselineRisk ? Math.round((reachableRisk / baselineRisk) * 100) : 0
  return {
    activeNodeIds: [...traversal.reachable],
    blockedNodeIds: [...traversal.blocked],
    eligibleNodeIds: [...traversal.eligible],
    targetNodeIds: targets.map((node) => node.id),
    reachableTargetIds: reachableTargets.map((node) => node.id),
    primaryPath,
    primaryPathLabels: primaryPath.map((id) => nodeById.get(id)?.label || id),
    alternatePaths,
    exposure,
    reachableRisk,
    baselineRisk,
  }
}

export function getGraphExposure(state, graphNodes = NODES, graphEdges = EDGES) {
  return getReachability(state, graphNodes, graphEdges).exposure
}

export function getExposure(state, graphNodes, graphEdges) {
  return graphNodes && graphEdges
    ? getGraphExposure(state, graphNodes, graphEdges)
    : Math.max(4, 100 - getReduction(state))
}

export function evaluateInterventions(state, graphNodes = NODES, graphEdges = EDGES) {
  const plans = []
  const combinations = 1 << INTERVENTIONS.length
  for (let mask = 0; mask < combinations; mask += 1) {
    const selectedActions = INTERVENTIONS.filter((_, index) => mask & (1 << index)).map((action) => action.id)
    const candidate = { ...state, selectedActions }
    const cost = getSpent(candidate)
    if (cost > RESPONSE_BUDGET) continue
    const worstCase = { ...candidate, eventIndex: Math.max(EVENTS.length, ...graphNodes.map((node) => node.activeAt || 0)) }
    const reachability = getReachability(worstCase, graphNodes, graphEdges)
    const exposure = reachability.exposure
    plans.push({
      actions: selectedActions,
      cost,
      exposure,
      contained: 100 - exposure,
      activeNodes: reachability.activeNodeIds.length,
      blockedNodes: reachability.blockedNodeIds,
      attackPath: reachability.primaryPath,
    })
  }
  return plans.sort((left, right) => left.exposure - right.exposure || left.cost - right.cost || left.activeNodes - right.activeNodes)
}

export function startDefenseRound(state, events, actionId, graphNodes = NODES, graphEdges = EDGES) {
  const action = INTERVENTIONS.find((item) => item.id === actionId)
  if (!action || state.eventIndex < events.length) return { state, events, round: 0 }
  const round = Math.floor((events.length - EVENTS.length) / 3) + 1
  const reachability = getReachability(state, graphNodes, graphEdges)
  const prefix = `round-${round}-${events.length}`
  const route = reachability.primaryPathLabels.join(' → ')
  const enabled = state.selectedActions.includes(actionId)
  const controlLabel = enabled ? 'Control applied' : 'Control withdrawn'
  const routeEvent = reachability.primaryPath.length
    ? { label: 'Residual route tested', detail: `The attacker tested ${route}` }
    : { label: 'High-value path severed', detail: `No path from the release to a high-value data node remains after ${action.title.toLowerCase()}` }
  return {
    state: { ...state, running: true },
    events: [
      ...events,
      { id: `${prefix}-control`, side: 'defense', actor: 'defender operator', intent: enabled ? 'apply a control' : 'withdraw a control', label: controlLabel, detail: `${action.title} ${enabled ? 'blocks' : 'releases'} ${reachability.blockedNodeIds.length} graph nodes; modeled exposure is now ${reachability.exposure}%` },
      { id: `${prefix}-countermove`, side: 'attack', actor: 'attack planner', intent: 'test the residual route', ...routeEvent },
      { id: `${prefix}-recomputed`, side: 'system', actor: 'orchestrator', intent: 'rebuild reachability', label: 'Path recalculated', detail: `${reachability.activeNodeIds.length} reachable nodes; ${reachability.reachableTargetIds.length} high-value targets remain reachable` },
    ],
    round,
  }
}

export function getActiveNodeIds(state, graphNodes = NODES, graphEdges = EDGES) {
  return new Set(getReachability(state, graphNodes, graphEdges).activeNodeIds)
}

export function advanceState(state, eventCount = EVENTS.length) {
  return { ...state, eventIndex: Math.min(eventCount, state.eventIndex + 1), running: state.eventIndex + 1 < eventCount }
}

export function toggleAction(state, id) {
  const action = INTERVENTIONS.find((item) => item.id === id)
  if (!action) return state
  if (state.selectedActions.includes(id)) {
    return { ...state, selectedActions: state.selectedActions.filter((item) => item !== id) }
  }
  if (getSpent(state) + action.cost > RESPONSE_BUDGET) return state
  return { ...state, selectedActions: [...state.selectedActions, id] }
}
