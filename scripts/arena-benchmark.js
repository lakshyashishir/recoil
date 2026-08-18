import assert from 'node:assert/strict'
import { createArenaState, runArena } from '../src/core/arena.js'
import { EDGES, NODES } from '../src/core/scenario.js'

function run(label, statePatch = {}, graphNodes = NODES, graphEdges = EDGES) {
  const initial = createArenaState({ scenarioId: `benchmark-${label}`, graphNodes, graphEdges })
  const result = runArena({ ...initial, ...statePatch }, graphNodes, graphEdges)
  return {
    label,
    winner: result.winner,
    status: result.status,
    rounds: result.round,
    routes: result.history.map((round) => round.red.path.join('>')),
    controls: result.selectedActions,
    initialExposure: result.initialExposure,
    finalExposure: result.currentExposure,
    targetCount: result.reachableTargets.length,
  }
}

const baseline = run('baseline')
const constrainedWindow = run('one-round-window', { maxRounds: 1 })

assert.equal(baseline.winner, 'defender')
assert.equal(baseline.targetCount, 0)
assert.ok(new Set(baseline.routes).size > 1, 'red should adapt to a changed route')
assert.ok(baseline.controls.includes('block-promotion'))
assert.ok(baseline.controls.includes('upgrade'))
assert.equal(constrainedWindow.winner, 'attacker')
assert.equal(constrainedWindow.status, 'breached')
assert.ok(constrainedWindow.targetCount > 0)

console.log(JSON.stringify({
  name: 'recoil adaptive arena benchmark',
  policy: 'graph-reachability + route-aware controls',
  cases: [baseline, constrainedWindow],
  assertions: {
    computedAlternateRoute: true,
    containmentComputed: true,
    packageCodeExecuted: false,
  },
}, null, 2))
