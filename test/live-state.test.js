import test from 'node:test'
import assert from 'node:assert/strict'
import { mergeLiveEvidence } from '../server/investigation.js'

function graph(nodes, edges = []) {
  return { nodes: Array.from({ length: nodes }, (_, index) => ({ id: `node-${index}` })), edges }
}

test('live evidence keeps the richest graph when repository collectors finish out of order', () => {
  const initial = mergeLiveEvidence({}, { graph: graph(1), graphProgress: { completedRepositories: 0, totalRepositories: 3 } })
  const richer = mergeLiveEvidence(initial, { graph: graph(12, [['a', 'b']]), graphProgress: { completedRepositories: 3, totalRepositories: 3 } })
  const lateStale = mergeLiveEvidence(richer, { graph: graph(4), graphProgress: { completedRepositories: 1, totalRepositories: 3 } })

  assert.equal(lateStale.graph.nodes.length, 12)
  assert.equal(lateStale.graphProgress.completedRepositories, 3)
  assert.equal(lateStale.graphProgress.totalRepositories, 3)
})

test('live evidence replaces an equally complete graph only when it contains more evidence', () => {
  const smaller = mergeLiveEvidence({}, { graph: graph(4), graphProgress: { completedRepositories: 1, totalRepositories: 2 } })
  const larger = mergeLiveEvidence(smaller, { graph: graph(8), graphProgress: { completedRepositories: 1, totalRepositories: 2 } })

  assert.equal(larger.graph.nodes.length, 8)
  assert.equal(larger.graphProgress.completedRepositories, 1)
})
