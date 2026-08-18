import test from 'node:test'
import assert from 'node:assert/strict'
import { buildChangeImpact, buildCodeGraph, enrichImpactCandidates, parseSourceSymbols } from '../src/core/codegraph.js'

test('JavaScript code graph resolves relative imports without executing source', () => {
  const graph = buildCodeGraph([
    { path: 'src/index.js', text: "import { run } from './engine.js'\nexport const start = () => run()", sourceUrl: 'https://example.test/src/index.js' },
    { path: 'src/engine.js', text: "const helper = require('./helper')", sourceUrl: 'https://example.test/src/engine.js' },
    { path: 'src/helper.ts', text: 'export const helper = true', sourceUrl: 'https://example.test/src/helper.ts' },
  ])

  assert.equal(graph.fileCount, 3)
  assert.equal(graph.importEdgeCount, 2)
  assert.equal(graph.symbolCount, 1)
  assert.deepEqual(graph.edges, [
    ['code:src/index.js', 'code:src/engine.js'],
    ['code:src/engine.js', 'code:src/helper.ts'],
  ])
  assert.equal(graph.files[0].sourceUrl, 'https://example.test/src/index.js')
})

test('Rust code graph resolves crate modules and records bounded unknowns', () => {
  const graph = buildCodeGraph([
    { path: 'src/lib.rs', text: 'mod policy;\nuse crate::graph::Graph;', sourceUrl: 'https://example.test/src/lib.rs' },
    { path: 'src/policy.rs', text: 'pub fn decide() {}', sourceUrl: 'https://example.test/src/policy.rs' },
  ])

  assert.equal(graph.fileCount, 2)
  assert.equal(graph.symbolCount, 1)
  assert.deepEqual(graph.edges, [['code:src/lib.rs', 'code:src/policy.rs']])
  assert.deepEqual(graph.unresolved, [{ from: 'src/lib.rs', specifier: 'graph' }])
})

test('code graph is bounded to the configured public-file sample', () => {
  const files = Array.from({ length: 6 }, (_, index) => ({ path: `src/file-${index}.js`, text: 'export const x = 1' }))
  const graph = buildCodeGraph(files, { maxFiles: 3 })

  assert.equal(graph.fileCount, 3)
  assert.equal(graph.importEdgeCount, 0)
})

test('code graph reports inferred deployment surfaces separately from exposure scoring', () => {
  const graph = buildCodeGraph([
    { path: 'src/payments/checkout.ts', text: 'export function chargePayment(token) { return stripe.charge(token) }' },
    { path: 'src/auth/session.ts', text: 'export function verifyToken(jwt) { return jwt.verify() }' },
  ])

  assert.equal(graph.surfaceCount, 2)
  assert.deepEqual(graph.impactCandidates.map((candidate) => candidate.target), ['payments', 'secrets'])
  assert.equal(graph.impactCandidates[0].confidence, 'inferred')
})

test('symbol index keeps kind and source line for later impact analysis', () => {
  const symbols = parseSourceSymbols('class Router {}\n\nexport function trace() {}', 'src/router.js')

  assert.deepEqual(symbols, [
    { name: 'Router', kind: 'class', language: 'javascript', line: 1 },
    { name: 'trace', kind: 'function', language: 'javascript', line: 3 },
  ])
})

test('latest public commit maps changed hunks to indexed symbols', () => {
  const graph = buildCodeGraph([
    { path: 'src/payments.ts', text: 'export function charge() {}\nexport function refund() {}' },
    { path: 'src/untouched.ts', text: 'export function keep() {}' },
  ])
  const impact = buildChangeImpact(graph, {
    sha: 'abc123456789',
    html_url: 'https://github.com/example/repo/commit/abc1234',
    commit: { message: 'Harden payments', author: { date: '2026-08-18T10:00:00Z' } },
    files: [
      { filename: 'src/payments.ts', status: 'modified', additions: 2, deletions: 1, patch: '@@ -1,2 +1,2 @@\n export function charge() {}\n-export function refund() {}\n+export function refund() { return true }' },
      { filename: 'README.md', status: 'modified', additions: 1, deletions: 0 },
    ],
  })

  assert.equal(impact.sampledFilesChanged, 1)
  assert.equal(impact.totalFilesChanged, 2)
  assert.deepEqual(impact.files[0].symbols, ['refund'])
  assert.equal(impact.files[0].symbolMatch, 'hunk-line')
})

test('impact candidates identify surfaces touched by the latest changed symbols', () => {
  const graph = buildCodeGraph([
    { path: 'src/payments.ts', text: 'export function chargePayment(token) { return stripe.charge(token) }' },
    { path: 'src/auth/session.ts', text: 'export function verifyToken(jwt) { return jwt.verify() }' },
  ])
  const enriched = enrichImpactCandidates({
    ...graph,
    recentChange: {
      files: [
        { path: 'src/payments.ts', symbols: ['chargePayment'], symbolMatch: 'hunk-line' },
      ],
    },
  })

  assert.deepEqual(enriched.impactCandidates.map((candidate) => candidate.changedSymbols), [['chargePayment'], []])
  assert.equal(enriched.impactCandidates[0].changed, true)
  assert.equal(enriched.impactCandidates[0].changeMatch, 'hunk-line')
})
