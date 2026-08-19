import test from 'node:test'
import assert from 'node:assert/strict'
import { applyAdvisoryScope, buildObservedGraph, chooseFixedVersion, classifyRepository, satisfiesRange, versionAffectedByAdvisory } from '../src/core/evidence.js'

const advisory = {
  id: 'GHSA-test',
  published: '2022-03-18T00:01:09Z',
  affected: [{
    package: { ecosystem: 'npm', name: 'minimist' },
    ranges: [{ type: 'SEMVER', events: [{ introduced: '0' }, { fixed: '1.2.6' }] }],
  }],
}

function repository({ version = '1.2.5', imports = ['src/cli.js'], range = '^1.2.0', recentChange = null } = {}) {
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
        recentChange,
      },
    },
  }
}

test('semver checks real declared ranges against a fixed version', () => {
  assert.equal(satisfiesRange('^1.2.0', '1.2.6'), true)
  assert.equal(satisfiesRange('1.2.5', '1.2.6'), false)
  assert.equal(satisfiesRange('~1.2.0', '1.3.0'), false)
})

test('fix planning stays on the advisory range branch for multi-range advisories', () => {
  const multiRangeAdvisory = {
    affected: [{
      package: { ecosystem: 'npm', name: 'minimist' },
      ranges: [
        { type: 'SEMVER', events: [{ introduced: '0' }, { fixed: '0.2.1' }] },
        { type: 'SEMVER', events: [{ introduced: '1.0.0' }, { fixed: '1.2.3' }] },
      ],
    }],
  }
  const branch = chooseFixedVersion(multiRangeAdvisory, 'minimist', '^1.2.0', '1.2.0')
  const pinned = chooseFixedVersion(multiRangeAdvisory, 'minimist', '1.2.5', '1.2.5')
  assert.deepEqual(branch.fixedVersions, ['0.2.1', '1.2.3'])
  assert.equal(branch.targetVersion, '1.2.3')
  assert.equal(branch.allowedVersion, '1.2.3')
  assert.equal(pinned.targetVersion, '1.2.3')
  assert.equal(pinned.rangeAllowsFix, false)
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

test('reachability can attach latest importer change evidence without changing the verdict', () => {
  const finding = classifyRepository({
    repository: repository({ recentChange: {
      sha: 'abc123',
      message: 'refactor parser boundary',
      committedAt: '2026-08-18T12:00:00Z',
      sourceUrl: 'https://github.com/example/app/commit/abc123',
      sampledFilesChanged: 1,
      totalFilesChanged: 2,
      files: [{ path: 'src/cli.js', symbols: ['main'], owners: ['@security'], symbolMatch: 'hunk-line' }],
    } }),
    packageName: 'minimist',
    advisory,
    advisoryId: advisory.id,
  })
  assert.equal(finding.verdict, 'REACHED')
  assert.equal(finding.changeEvidence.importerFilesChanged[0].path, 'src/cli.js')
  assert.deepEqual(finding.changeEvidence.importerFilesChanged[0].owners, ['@security'])
})

test('observed graph contains only advisory, repository, lockfile, and source evidence nodes', () => {
  const finding = classifyRepository({ repository: repository(), packageName: 'minimist', advisory, advisoryId: advisory.id })
  const graph = buildObservedGraph({ advisoryId: advisory.id, packageName: 'minimist', repositoryFindings: [finding] })

  assert.equal(graph.nodes.some((node) => node.label === 'customer database'), false)
  assert.ok(graph.edges.some(([from, to]) => from === `lock:example/app:package-lock.json` && to.includes('code:example/app:src/cli.js')))
})

test('dependency path follows nested lockfile resolution and declines ambiguous fallback', () => {
  const nested = repository({ imports: [] })
  nested.manifest.dependencies = { parent: '^2.0.0' }
  nested.manifest.resolved = { parent: '2.0.0', minimist: '1.2.5' }
  nested.manifest.lockPackages = [
    { name: 'parent', version: '2.0.0', path: 'node_modules/parent', dependencies: ['minimist'] },
    { name: 'minimist', version: '1.2.5', path: 'node_modules/parent/node_modules/minimist', dependencies: [] },
  ]
  const finding = classifyRepository({ repository: nested, packageName: 'minimist', advisory, advisoryId: advisory.id })
  assert.deepEqual(finding.dependencyPath.map((item) => item.name), ['parent', 'minimist'])

  const graph = buildObservedGraph({ advisoryId: advisory.id, packageName: 'minimist', repositoryFindings: [finding] })
  assert.ok(graph.edges.some(([from, to]) => from === 'package:parent@2.0.0' && to === 'package:minimist@1.2.5'))

  const ambiguous = repository({ imports: [] })
  ambiguous.manifest.dependencies = { parent: '^2.0.0' }
  ambiguous.manifest.lockPackages = [
    { name: 'parent', version: '2.0.0', dependencies: ['minimist'] },
    { name: 'minimist', version: '1.2.5', dependencies: [] },
    { name: 'minimist', version: '1.2.6', dependencies: [] },
  ]
  const ambiguousFinding = classifyRepository({ repository: ambiguous, packageName: 'minimist', advisory, advisoryId: advisory.id })
  assert.deepEqual(ambiguousFinding.dependencyPath, [])
})

test('incomplete source collection is unknown instead of falsely declared-only', () => {
  const partialRepository = repository({ imports: [] })
  partialRepository.repository = 'example/partial'
  partialRepository.manifest.collection = { sourceFiles: { status: 'partial', sampled: 3, requested: 5 } }
  const partial = classifyRepository({ repository: partialRepository, packageName: 'minimist', advisory, advisoryId: advisory.id })
  assert.equal(partial.verdict, 'UNKNOWN')
  assert.match(partial.reason, /source collection was partial/)
})

test('an affected dependency with no analyzable source sample is unknown', () => {
  const emptyRepository = repository({ imports: [] })
  emptyRepository.repository = 'example/no-source-sample'
  emptyRepository.manifest.codeGraph = { fileCount: 0, externalImports: [] }
  const finding = classifyRepository({ repository: emptyRepository, packageName: 'minimist', advisory, advisoryId: advisory.id })
  assert.equal(finding.verdict, 'UNKNOWN')
  assert.match(finding.reason, /no analyzable source files were sampled/)
})

test('mixed affected and safe lockfile versions remain unknown instead of collapsing to one version', () => {
  const repositoryWithDuplicateVersions = repository()
  repositoryWithDuplicateVersions.manifest.resolvedVersions = { minimist: ['1.2.5', '1.2.6'] }
  const finding = classifyRepository({ repository: repositoryWithDuplicateVersions, packageName: 'minimist', advisory, advisoryId: advisory.id })

  assert.equal(finding.verdict, 'UNKNOWN')
  assert.match(finding.reason, /multiple lockfile versions/)
  assert.deepEqual(finding.resolvedVersions, ['1.2.5', '1.2.6'])
})

test('observed graph retains every resolved package version', () => {
  const repositoryWithDuplicateVersions = repository()
  repositoryWithDuplicateVersions.manifest.resolvedVersions = { minimist: ['1.2.5', '1.2.6'] }
  const finding = classifyRepository({ repository: repositoryWithDuplicateVersions, packageName: 'minimist', advisory, advisoryId: advisory.id })
  const graph = buildObservedGraph({ advisoryId: advisory.id, packageName: 'minimist', repositoryFindings: [finding] })
  assert.ok(graph.nodes.some((node) => node.id === 'package:minimist@1.2.5'))
  assert.ok(graph.nodes.some((node) => node.id === 'package:minimist@1.2.6'))
  assert.ok(graph.edges.some(([from, to]) => from === 'package:minimist@1.2.5' && to === 'repo:example/app'))
  assert.ok(graph.edges.some(([from, to]) => from === 'package:minimist@1.2.6' && to === 'repo:example/app'))
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
  assert.equal(scoped.findings[0].path.at(-1), 'symbol:parseArgs@src/cli.js:4')
  assert.ok(scoped.findings[0].evidenceSources.includes('https://github.com/example/app/blob/HEAD/src/cli.js'))
  assert.ok(scoped.graph.nodes.some((node) => node.type === 'symbol' && node.label.startsWith('parseArgs')))
  assert.ok(scoped.graph.edges.some(([from, to]) => from === 'code:example/app:src/cli.js' && to.startsWith('symbol:example/app:src/cli.js:4:parseArgs')))
  const unscoped = applyAdvisoryScope(ingestion, { status: 'completed', affectedSymbols: [{ name: 'doesNotExist', reason: 'not indexed' }] })
  assert.equal(unscoped.findings[0].advisoryScope.status, 'MODULE_LEVEL_ONLY')
})

test('advisory symbol scope does not promote a symbol from a non-importing file', () => {
  const finding = classifyRepository({ repository: repository(), packageName: 'minimist', advisory, advisoryId: advisory.id })
  const ingestion = {
    findings: [finding],
    repositories: [{
      ...repository(),
      manifest: {
        ...repository().manifest,
        codeGraph: {
          ...repository().manifest.codeGraph,
          symbols: [{ name: 'parseArgs', kind: 'function', path: 'src/parser.js', line: 4, sourceUrl: 'https://github.com/example/app/blob/HEAD/src/parser.js' }],
        },
      },
    }],
  }
  const scoped = applyAdvisoryScope(ingestion, { status: 'completed', affectedSymbols: [{ name: 'parseArgs', reason: 'advisory names the parser entry point' }] })
  assert.equal(scoped.findings[0].advisoryScope.status, 'MODULE_LEVEL_ONLY')
  assert.deepEqual(scoped.findings[0].path, finding.path)
})
