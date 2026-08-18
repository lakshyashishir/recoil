import test from 'node:test'
import assert from 'node:assert/strict'
import {
  EDGES,
  EVENTS,
  NODES,
  evaluateInterventions,
  getReachability,
  startDefenseRound,
} from '../src/core/scenario.js'

const complete = { eventIndex: EVENTS.length, selectedActions: [] }

test('baseline reaches multiple high-value surfaces through alternate paths', () => {
  const result = getReachability(complete, NODES, EDGES)
  assert.equal(result.exposure, 100)
  assert.equal(result.reachableTargetIds.length, 5)
  assert.ok(result.primaryPath.includes('artifact'))
  assert.equal(result.alternatePaths.length, 3)
})

test('promotion blocking preserves already-promoted artifacts in scope', () => {
  const result = getReachability({ ...complete, selectedActions: ['block-promotion'] }, NODES, EDGES)
  assert.ok(result.blockedNodeIds.includes('ci'))
  assert.ok(!result.blockedNodeIds.includes('artifact'))
  assert.ok(result.primaryPath.includes('artifact'))
  assert.ok(result.reachableTargetIds.includes('customer-db'))
})

test('upgrade plus promotion blocking severs every modeled high-value route', () => {
  const result = getReachability({ ...complete, selectedActions: ['block-promotion', 'upgrade'] }, NODES, EDGES)
  assert.ok(result.exposure <= 5)
  assert.deepEqual(result.primaryPath, [])
  assert.deepEqual(result.reachableTargetIds, [])
})

test('planner ranks a bounded response that removes the residual path', () => {
  const plans = evaluateInterventions(complete, NODES, EDGES)
  const plan = plans[0]
  assert.ok(plan.cost <= 8)
  assert.equal(plan.exposure, 4)
  assert.deepEqual(plan.attackPath, [])
  assert.ok(plans.length >= 6)
  assert.ok(plans.every((candidate, index) => index === 0 || candidate.exposure > plan.exposure || candidate.cost >= plan.cost))
})

test('defense round records an observed residual route', () => {
  const result = startDefenseRound({ ...complete, selectedActions: ['block-promotion'] }, EVENTS, 'block-promotion', NODES, EDGES)
  assert.equal(result.events.length, EVENTS.length + 3)
  assert.equal(result.events.at(-2).label, 'Residual route tested')
  assert.match(result.events.at(-2).detail, /artifact/)
})
