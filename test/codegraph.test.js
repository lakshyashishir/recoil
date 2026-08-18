import test from 'node:test'
import assert from 'node:assert/strict'
import { buildCodeGraph, parseSourceSymbols } from '../src/core/codegraph.js'

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

test('symbol index keeps kind and source line for later impact analysis', () => {
  const symbols = parseSourceSymbols('class Router {}\n\nexport function trace() {}', 'src/router.js')

  assert.deepEqual(symbols, [
    { name: 'Router', kind: 'class', language: 'javascript', line: 1 },
    { name: 'trace', kind: 'function', language: 'javascript', line: 3 },
  ])
})
