import {
  EDGES,
  INTERVENTIONS,
  NODES,
  RESPONSE_BUDGET,
  getReachability,
} from './scenario.js'

export const ARENA_MAX_ROUNDS = 6

function peakEventIndex(graphNodes = NODES) {
  return Math.max(10, ...graphNodes.map((node) => node.activeAt || 0))
}

function routeKey(path = []) {
  return path.join('>')
}

function routeLabel(path, graphNodes) {
  const labels = new Map(graphNodes.map((node) => [node.id, node.label]))
  return path.map((id) => labels.get(id) || id).join(' → ')
}

function firstRouteWithNewShape(routes, usedRoutes) {
  return routes.find((path) => !usedRoutes.has(routeKey(path))) || routes[0] || []
}

function describeAttack(path) {
  if (path.includes('ci')) return { label: 'Promote through shared CI', intent: 'cross the release gate' }
  if (path.includes('resolver') || path.includes('lockfile')) return { label: 'Re-resolve a transitive dependency', intent: 'find an alternate promotion route' }
  if (path.includes('secrets')) return { label: 'Follow a credential-assisted route', intent: 'pivot through runtime trust' }
  if (path.includes('artifact')) return { label: 'Pivot through a promoted artifact', intent: 'reuse an existing foothold' }
  return { label: 'Probe the reachable crown-jewel route', intent: 'find a path to high-value data' }
}

function memorySuggestsAction(memory, actionId, path = []) {
  if (!memory) return false
  const chunks = Array.isArray(memory?.chunks) ? memory.chunks : [memory]
  const routeTerms = new Set(path.flatMap((id) => {
    if (id === 'ci' || id === 'runner') return ['ci', 'promotion', 'runner']
    if (id === 'resolver' || id === 'lockfile') return ['resolver', 'lockfile', 'dependency']
    if (id === 'secrets') return ['secret', 'credential', 'runtime']
    if (id === 'artifact') return ['artifact', 'release']
    if (id === 'payments' || id === 'checkout') return ['payment', 'checkout', 'service']
    return []
  }))
  return chunks.some((chunk) => {
    const text = JSON.stringify(chunk).toLowerCase()
    const actionMatch = text.includes(actionId) || (actionId === 'block-promotion' && text.includes('promotion'))
    const routeMatch = routeTerms.size === 0 || [...routeTerms].some((term) => text.includes(term))
    return actionMatch && routeMatch
  })
}

function chooseAttack(state, reachability, graphNodes) {
  const routes = [
    reachability.primaryPath,
    ...(reachability.alternatePaths || []).filter((path) => routeKey(path) !== routeKey(reachability.primaryPath)),
  ].filter((path) => path.length > 1)
  const usedRoutes = new Set((state.history || []).map((round) => routeKey(round.red?.path || [])))
  const path = firstRouteWithNewShape(routes, usedRoutes)
  const description = describeAttack(path)
  const target = path.at(-1) || 'no high-value target'
  return {
    id: `red-${state.round + 1}`,
    label: description.label,
    intent: description.intent,
    path,
    pathLabel: routeLabel(path, graphNodes),
    target,
    result: path.length ? 'route found' : 'no route available',
  }
}

function actionById(id) {
  return INTERVENTIONS.find((action) => action.id === id) || null
}

function chooseDefense(state, reachability, attack, graphNodes, graphEdges, memory) {
  const spent = state.selectedActions.reduce((sum, id) => sum + (actionById(id)?.cost || 0), 0)
  const candidates = INTERVENTIONS.filter((action) => !state.selectedActions.includes(action.id) && spent + action.cost <= RESPONSE_BUDGET)
  if (!candidates.length) return { action: null, rationale: 'The response budget is exhausted.', memoryUsed: false }

  const route = new Set(attack.path)
  const routePriority = [
    route.has('ci') ? 'block-promotion' : null,
    route.has('resolver') || route.has('lockfile') ? 'upgrade' : null,
    route.has('secrets') ? 'rotate-secrets' : null,
    route.has('artifact') && !route.has('ci') ? 'restore' : null,
    route.has('payments') || route.has('checkout') ? 'quarantine' : null,
    'revoke',
  ].filter(Boolean)
  const remembered = candidates.find((action) => memorySuggestsAction(memory, action.id, attack.path))
  const routeAction = routePriority.map((id) => candidates.find((action) => action.id === id)).find(Boolean)
  const selected = remembered || routeAction || [...candidates].sort((left, right) => {
    const leftResult = getReachability({ eventIndex: peakEventIndex(graphNodes), selectedActions: [...state.selectedActions, left.id] }, graphNodes, graphEdges)
    const rightResult = getReachability({ eventIndex: peakEventIndex(graphNodes), selectedActions: [...state.selectedActions, right.id] }, graphNodes, graphEdges)
    return leftResult.exposure - rightResult.exposure || left.cost - right.cost
  })[0]
  const predicted = getReachability({ eventIndex: peakEventIndex(graphNodes), selectedActions: [...state.selectedActions, selected.id] }, graphNodes, graphEdges)
  const memoryUsed = Boolean(remembered)
  const rationale = memoryUsed
    ? `HydraDB recalled a prior ${selected.title.toLowerCase()} response for this propagation shape.`
    : routeAction
      ? `${selected.title} cuts the observed ${routeAction === 'block-promotion' ? 'CI promotion' : routeAction === 'upgrade' ? 'resolver' : 'runtime'} edge before the attacker can reuse it.`
      : `The control produces the lowest modeled exposure within the remaining ${Math.max(0, RESPONSE_BUDGET - spent)} response points.`
  return {
    action: selected.id,
    title: selected.title,
    cost: selected.cost,
    rationale,
    predictedExposure: predicted.exposure,
    memoryUsed,
  }
}

export function createArenaState({
  scenarioId = '0017',
  query = '',
  packageName = 'target',
  graphNodes = NODES,
  graphEdges = EDGES,
  memory = null,
} = {}) {
  const initial = getReachability({ eventIndex: peakEventIndex(graphNodes), selectedActions: [] }, graphNodes, graphEdges)
  return {
    id: `arena-${scenarioId}`,
    scenarioId,
    query,
    packageName,
    status: 'ready',
    phase: 'standby',
    round: 0,
    maxRounds: ARENA_MAX_ROUNDS,
    selectedActions: [],
    responseBudget: RESPONSE_BUDGET,
    initialExposure: initial.exposure,
    currentExposure: initial.exposure,
    reachableTargets: initial.reachableTargetIds,
    currentPath: initial.primaryPath,
    history: [],
    lastRound: null,
    memory: {
      available: Boolean(memory?.chunks?.length || memory?.available),
      chunks: memory?.chunks?.length || memory?.count || 0,
      used: false,
    },
    winner: null,
    metrics: {
      attackMoves: 0,
      defenseMoves: 0,
      controlsUsed: 0,
      containedRound: null,
      lowestExposure: initial.exposure,
    },
  }
}

export function stepArena(state, graphNodes = NODES, graphEdges = EDGES, { memory = null } = {}) {
  if (!state || ['contained', 'breached', 'exhausted'].includes(state.status)) return state
  const before = getReachability({ eventIndex: peakEventIndex(graphNodes), selectedActions: state.selectedActions }, graphNodes, graphEdges)
  const red = chooseAttack(state, before, graphNodes)
  const blue = chooseDefense(state, before, red, graphNodes, graphEdges, memory || state.memory)
  const selectedActions = blue.action ? [...state.selectedActions, blue.action] : [...state.selectedActions]
  const after = getReachability({ eventIndex: peakEventIndex(graphNodes), selectedActions }, graphNodes, graphEdges)
  const round = state.round + 1
  const contained = after.reachableTargetIds.length === 0
  const exhausted = round >= state.maxRounds
  const status = contained ? 'contained' : exhausted ? 'breached' : 'running'
  const roundRecord = {
    round,
    red,
    blue,
    before: {
      exposure: before.exposure,
      reachableTargets: before.reachableTargetIds,
      primaryPath: before.primaryPath,
      alternatePaths: before.alternatePaths,
    },
    after: {
      exposure: after.exposure,
      reachableTargets: after.reachableTargetIds,
      primaryPath: after.primaryPath,
      alternatePaths: after.alternatePaths,
    },
    status,
  }
  return {
    ...state,
    status,
    phase: status === 'running' ? 'red' : 'resolved',
    round,
    selectedActions,
    currentExposure: after.exposure,
    reachableTargets: after.reachableTargetIds,
    currentPath: after.primaryPath,
    lastRound: roundRecord,
    history: [...state.history, roundRecord],
    memory: {
      ...state.memory,
      used: state.memory.used || Boolean(blue.memoryUsed),
    },
    winner: contained ? 'defender' : exhausted ? 'attacker' : null,
    metrics: {
      attackMoves: state.metrics.attackMoves + 1,
      defenseMoves: state.metrics.defenseMoves + (blue.action ? 1 : 0),
      controlsUsed: selectedActions.length,
      containedRound: contained ? round : state.metrics.containedRound,
      lowestExposure: Math.min(state.metrics.lowestExposure, after.exposure),
    },
  }
}

export function runArena(state, graphNodes = NODES, graphEdges = EDGES, options = {}) {
  let next = state
  while (!['contained', 'breached', 'exhausted'].includes(next.status)) next = stepArena(next, graphNodes, graphEdges, options)
  return next
}
