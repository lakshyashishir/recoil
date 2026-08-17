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
  { id: 'customer-db', label: 'customer database', type: 'data', meta: 'high-value asset', x: 93, y: 48 },
  { id: 'observability', label: 'runtime telemetry', type: 'telemetry', meta: 'detection signal', x: 65, y: 50 },
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
  ['secrets', 'payments'],
  ['gateway', 'observability'],
  ['payments', 'observability'],
  ['checkout', 'customer-db'],
  ['payments', 'customer-db'],
  ['admin', 'customer-db'],
  ['observability', 'security'],
]

export const INTERVENTIONS = [
  { id: 'upgrade', title: 'Pin a known-good release', description: 'Stop the compromised package at resolution', cost: 1, reduction: 34 },
  { id: 'block-promotion', title: 'Block artifact promotion', description: 'Hold CI until the dependency is cleared', cost: 2, reduction: 28 },
  { id: 'quarantine', title: 'Quarantine exposed services', description: 'Remove affected workloads from the path', cost: 2, reduction: 22 },
  { id: 'revoke', title: 'Revoke publisher trust', description: 'Invalidate the maintainer and release edge', cost: 3, reduction: 20 },
  { id: 'rotate-secrets', title: 'Rotate runtime secrets', description: 'Cut credential-assisted lateral movement', cost: 3, reduction: 14 },
  { id: 'restore', title: 'Restore and validate', description: 'Redeploy from a verified artifact', cost: 1, reduction: 9 },
]

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
  graphVersion: 'v0.5.0',
}

export function createInitialState() {
  return {
    running: false,
    eventIndex: 0,
    selectedActions: ['upgrade'],
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

export function getExposure(state) {
  return Math.max(4, 100 - getReduction(state))
}

export function evaluateInterventions(state, graphNodes = NODES) {
  const plans = []
  const combinations = 1 << INTERVENTIONS.length
  for (let mask = 0; mask < combinations; mask += 1) {
    const selectedActions = INTERVENTIONS.filter((_, index) => mask & (1 << index)).map((action) => action.id)
    const candidate = { ...state, selectedActions }
    const cost = getSpent(candidate)
    if (cost > RESPONSE_BUDGET) continue
    const exposure = getExposure(candidate)
    const worstCase = { ...candidate, eventIndex: EVENTS.length }
    plans.push({
      actions: selectedActions,
      cost,
      exposure,
      contained: 100 - exposure,
      activeNodes: getActiveNodeIds(worstCase, graphNodes).size,
    })
  }
  return plans.sort((left, right) => left.exposure - right.exposure || left.cost - right.cost || left.activeNodes - right.activeNodes)
}

export function startDefenseRound(state, events, actionId, graphNodes = NODES) {
  const action = INTERVENTIONS.find((item) => item.id === actionId)
  if (!action || state.eventIndex < events.length) return { state, events, round: 0 }
  const round = Math.floor((events.length - EVENTS.length) / 3) + 1
  const activeNodes = getActiveNodeIds({ ...state, eventIndex: events.length }, graphNodes).size
  const prefix = `round-${round}-${events.length}`
  return {
    state: { ...state, running: true },
    events: [
      ...events,
      { id: `${prefix}-control`, side: 'defense', actor: 'defender operator', intent: 'apply a control', label: 'Control applied', detail: `${action.title} reduced modeled exposure to ${getExposure(state)}%` },
      { id: `${prefix}-countermove`, side: 'attack', actor: 'attack planner', intent: 'test the residual route', label: 'Residual route tested', detail: `The attacker searched the remaining graph after round ${round}` },
      { id: `${prefix}-recomputed`, side: 'system', actor: 'orchestrator', intent: 'rebuild reachability', label: 'Path recalculated', detail: `${activeNodes} active nodes remain; the next response window is ready` },
    ],
    round,
  }
}

export function getActiveNodeIds(state, graphNodes = NODES) {
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
  }
  if (state.eventIndex >= 7) {
    active.add('observability')
    active.add('customer-db')
  }
  if (state.eventIndex >= 8) active.add('security')
  graphNodes.filter((node) => !NODES.some((known) => known.id === node.id)).forEach((node) => {
    if (state.eventIndex >= (node.activeAt || 4)) active.add(node.id)
  })

  if (state.selectedActions.includes('upgrade')) {
    active.delete('resolver')
    active.delete('lockfile')
    graphNodes.filter((node) => node.role === 'target-dependency').forEach((node) => active.delete(node.id))
  }
  if (state.selectedActions.includes('block-promotion')) {
    ['repo', 'ci', 'artifact', 'secrets', 'gateway', 'storefront', 'payments', 'checkout', 'admin'].forEach((id) => active.delete(id))
  }
  if (state.selectedActions.includes('quarantine')) {
    ['gateway', 'storefront', 'payments', 'checkout', 'admin'].forEach((id) => active.delete(id))
  }
  if (state.selectedActions.includes('revoke')) active.delete('maintainer')
  if (state.selectedActions.includes('rotate-secrets')) {
    active.delete('secrets')
    active.delete('customer-db')
  }
  return active
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
