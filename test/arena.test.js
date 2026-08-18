import test from 'node:test'
import assert from 'node:assert/strict'
import { createArenaState, runArena, stepArena } from '../src/core/arena.js'
import { EDGES, NODES } from '../src/core/scenario.js'

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
