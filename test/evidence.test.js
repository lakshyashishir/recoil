import test from 'node:test'
import assert from 'node:assert/strict'
import { applyAdvisoryScope, buildObservedGraph, classifyRepository, satisfiesRange, versionAffectedByAdvisory } from '../src/core/evidence.js'

const advisory = {
  id: 'GHSA-test',
  published: '2022-03-18T00:01:09Z',
  affected: [{
    package: { ecosystem: 'npm', name: 'minimist' },
    ranges: [{ type: 'SEMVER', events: [{ introduced: '0' }, { fixed: '1.2.6' }] }],
  }],
}

function repository({ version = '1.2.5', imports = ['src/cli.js'], range = '^1.2.0' } = {}) {
  return {
    repository: 'example/app',
    repositoryUrl: 'https://github.com/example/app',
    sourceUrl: 'https://github.com/example/app/blob/HEAD/package.json',
    sources: [{ path: 'package-lock.json', url: 'https://github.com/example/app/blob/HEAD/package-lock.json' }],
    manifest: {
      dependencies: { minimist: range },
      resolved: { minimist: version },
      lockfile: 'package-lock.json',
      lockPackages: [{ name: 'minimist', version }],
      codeGraph: {
        fileCount: 3,
        externalImports: imports.map((path) => ({ packageName: 'minimist', path, sourceUrl: `https://github.com/example/app/blob/HEAD/${path}`, line: 1 })),
      },
    },
  }
}

test('semver checks real declared ranges against a fixed version', () => {
  assert.equal(satisfiesRange('^1.2.0', '1.2.6'), true)
  assert.equal(satisfiesRange('1.2.5', '1.2.6'), false)
  assert.equal(satisfiesRange('~1.2.0', '1.3.0'), false)
})

test('advisory ranges classify reached, declared-only, and fixed repositories', () => {
  const reached = classifyRepository({ repository: repository(), packageName: 'minimist', advisory, advisoryId: advisory.id })
  const declaredOnly = classifyRepository({ repository: repository({ imports: [] }), packageName: 'minimist', advisory, advisoryId: advisory.id })
  const fixed = classifyRepository({ repository: repository({ version: '1.2.6' }), packageName: 'minimist', advisory, advisoryId: advisory.id })

  assert.equal(versionAffectedByAdvisory(advisory, 'minimist', '1.2.5'), true)
  assert.equal(versionAffectedByAdvisory(advisory, 'minimist', '1.2.6'), false)
  assert.equal(reached.verdict, 'REACHED')
  assert.equal(declaredOnly.verdict, 'DECLARED_ONLY')
  assert.equal(fixed.verdict, 'NOT_AFFECTED')
  assert.equal(reached.targetVersion, '1.2.6')
  assert.equal(reached.rangeAllowsFix, true)
})

test('observed graph contains only advisory, repository, lockfile, and source evidence nodes', () => {
  const finding = classifyRepository({ repository: repository(), packageName: 'minimist', advisory, advisoryId: advisory.id })
  const graph = buildObservedGraph({ advisoryId: advisory.id, packageName: 'minimist', repositoryFindings: [finding] })

  assert.equal(graph.nodes.some((node) => node.label === 'customer database'), false)
  assert.ok(graph.edges.some(([from, to]) => from === `lock:example/app:package-lock.json` && to.includes('code:example/app:src/cli.js')))
})

test('incomplete source collection is unknown instead of falsely declared-only', () => {
  const partialRepository = repository({ imports: [] })
  partialRepository.repository = 'example/partial'
  partialRepository.manifest.collection = { sourceFiles: { status: 'partial', sampled: 3, requested: 5 } }
  const partial = classifyRepository({ repository: partialRepository, packageName: 'minimist', advisory, advisoryId: advisory.id })
  assert.equal(partial.verdict, 'UNKNOWN')
  assert.match(partial.reason, /source collection was partial/)
})

test('advisory symbol suggestions are attached only after exact source validation', () => {
  const finding = classifyRepository({ repository: repository(), packageName: 'minimist', advisory, advisoryId: advisory.id })
  const ingestion = {
    findings: [finding],
    repositories: [{
      ...repository(),
      manifest: {
        ...repository().manifest,
        codeGraph: {
          ...repository().manifest.codeGraph,
          symbols: [{ name: 'parseArgs', kind: 'function', path: 'src/cli.js', line: 4, sourceUrl: 'https://github.com/example/app/blob/HEAD/src/cli.js' }],
        },
      },
    }],
  }
  const scoped = applyAdvisoryScope(ingestion, { status: 'completed', affectedSymbols: [{ name: 'parseArgs', reason: 'advisory names the parser entry point' }] })
  assert.equal(scoped.findings[0].advisoryScope.status, 'VALIDATED_SYMBOL')
  assert.equal(scoped.findings[0].advisoryScope.symbols[0].name, 'parseArgs')
  const unscoped = applyAdvisoryScope(ingestion, { status: 'completed', affectedSymbols: [{ name: 'doesNotExist', reason: 'not indexed' }] })
  assert.equal(unscoped.findings[0].advisoryScope.status, 'MODULE_LEVEL_ONLY')
})
