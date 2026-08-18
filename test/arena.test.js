import test from 'node:test'
import assert from 'node:assert/strict'
import { createArenaState, runArena, stepArena } from '../src/core/arena.js'
import { EDGES, INTERVENTIONS, NODES, RESPONSE_BUDGET, getReachability } from '../src/core/scenario.js'

test('red agent adapts to the alternate route after promotion is blocked', () => {
  const initial = createArenaState({ scenarioId: 'arena-test', graphNodes: NODES, graphEdges: EDGES })
  const first = stepArena(initial, NODES, EDGES)
  const second = stepArena(first, NODES, EDGES)

  assert.equal(first.lastRound.red.label, 'Promote through shared CI')
  assert.equal(first.lastRound.blue.action, 'block-promotion')
  assert.ok(second.lastRound.red.path.includes('resolver'))
  assert.equal(second.lastRound.blue.action, 'upgrade')
  assert.equal(second.status, 'contained')
  assert.deepEqual(second.reachableTargets, [])
})

test('arena produces computed scores instead of a scripted final result', () => {
  const result = runArena(createArenaState({ scenarioId: 'score-test', graphNodes: NODES, graphEdges: EDGES }), NODES, EDGES)

  assert.equal(result.winner, 'defender')
  assert.equal(result.metrics.attackMoves, result.round)
  assert.ok(result.history[1].before.exposure < result.history[0].before.exposure)
  assert.ok(result.history.some((round) => round.red.path.join('>') !== result.history[0].red.path.join('>')))
})

test('defender can use a recalled promotion precedent', () => {
  const memory = { chunks: [{ text: 'Prior episode: block-promotion cut the first CI route.' }] }
  const initial = createArenaState({
    scenarioId: 'memory-test',
    graphNodes: NODES,
    graphEdges: EDGES,
    memory,
  })
  const result = stepArena(initial, NODES, EDGES, { memory })

  assert.equal(result.lastRound.blue.action, 'block-promotion')
  assert.equal(result.lastRound.blue.memoryUsed, true)
  assert.equal(result.memory.used, true)
})

test('defender does not apply an unrelated recalled control as a match', () => {
  const memory = { chunks: [{ text: 'Prior episode: block-promotion cut the first CI route.' }] }
  const initial = createArenaState({ scenarioId: 'memory-route-test', graphNodes: NODES, graphEdges: EDGES })
  const first = stepArena(initial, NODES, EDGES)
  const second = stepArena(first, NODES, EDGES, { memory })

  assert.equal(second.lastRound.red.path.includes('resolver'), true)
  assert.equal(second.lastRound.blue.action, 'upgrade')
  assert.equal(second.lastRound.blue.memoryUsed, false)
})

test('every affordable control set is monotonic against the no-control graph', () => {
  const baseline = getReachability({ eventIndex: 10, selectedActions: [] }, NODES, EDGES)
  let affordablePlans = 0
  for (let mask = 0; mask < (1 << INTERVENTIONS.length); mask += 1) {
    const selectedActions = INTERVENTIONS.filter((_, index) => mask & (1 << index)).map((action) => action.id)
    const cost = selectedActions.reduce((sum, id) => sum + INTERVENTIONS.find((action) => action.id === id).cost, 0)
    if (cost > RESPONSE_BUDGET) continue
    affordablePlans += 1
    const result = getReachability({ eventIndex: 10, selectedActions }, NODES, EDGES)
    assert.ok(result.exposure <= baseline.exposure, `${selectedActions.join(',')} increased exposure`)
    assert.ok(result.blockedNodeIds.every((id) => NODES.some((node) => node.id === id)))
  }
  assert.equal(affordablePlans, 52)
})

test('every recorded red route is a real path in the current graph', () => {
  const result = runArena(createArenaState({ scenarioId: 'path-integrity-test', graphNodes: NODES, graphEdges: EDGES }), NODES, EDGES)
  const edgeKeys = new Set(EDGES.map(([from, to]) => `${from}>${to}`))
  for (const round of result.history) {
    assert.ok(round.red.path.length > 1)
    round.red.path.slice(1).forEach((to, index) => {
      assert.ok(edgeKeys.has(`${round.red.path[index]}>${to}`), `${round.red.path[index]} -> ${to} is not an edge`)
    })
    assert.ok(round.after.exposure <= round.before.exposure)
  }
})
