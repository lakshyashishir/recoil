import test from 'node:test'
import assert from 'node:assert/strict'
import { advisoryLookupId, buildRepositoryInventoryGraph, inferTarget, packageNameFromNodeModulesPath, parseCargoLock, parseCargoManifest, parseInvestigationInput, parseNpmLockPackages, parsePnpmLock, parsePnpmWorkspace, parseYarnLock, resolvePackageSelection } from '../server/collectors.js'

test('keeps GHSA advisory IDs canonical for the case-sensitive OSV lookup', () => {
  assert.equal(advisoryLookupId('ghsa-vh95-rmgr-6w4m'), 'GHSA-VH95-RMGR-6W4M')
  assert.equal(advisoryLookupId('CVE-2020-7598'), 'CVE-2020-7598')
})

test('target inference keeps a GitHub repository separate from an optional package selector', () => {
  const target = inferTarget('https://github.com/hydra-db/hydradb hydradb')

  assert.deepEqual(target.repository, {
    owner: 'hydra-db',
    name: 'hydradb',
    slug: 'hydra-db/hydradb',
    url: 'https://github.com/hydra-db/hydradb',
  })
  assert.equal(target.packageName, 'hydradb')
})

test('clean repository scans retain a bounded observed dependency and source graph', () => {
  const graph = buildRepositoryInventoryGraph([{
    status: 'completed',
    repository: 'example/app',
    repositoryUrl: 'https://github.com/example/app',
    ecosystem: 'npm',
    sourceUrl: 'https://github.com/example/app/blob/HEAD/package.json',
    sources: [{ path: 'package-lock.json', url: 'https://github.com/example/app/blob/HEAD/package-lock.json' }],
    manifest: {
      lockfile: 'package-lock.json',
      dependencies: { minimist: '^1.2.8' },
      lockPackages: [{ name: 'minimist', version: '1.2.8' }],
      codeGraph: { externalImports: [{ path: 'src/cli.js', sourceUrl: 'https://github.com/example/app/blob/HEAD/src/cli.js#L3', packageName: 'minimist', line: 3, owners: ['@platform'] }] },
    },
  }])
  assert.equal(graph.inventory, true)
  assert.ok(graph.nodes.some((node) => node.id === 'package:example/app:minimist@1.2.8'))
  assert.ok(graph.nodes.some((node) => node.id === 'code:example/app:src/cli.js' && node.meta.owners[0] === '@platform'))
  assert.ok(graph.edges.some(([from, to]) => from.includes('minimist@1.2.8') && to === 'code:example/app:src/cli.js'))
})

test('investigation input accepts one advisory and multiple repositories', () => {
  const input = parseInvestigationInput('GHSA-xvch-5gv4-984h https://github.com/acme/one https://github.com/acme/two')
  assert.equal(input.advisoryId, 'GHSA-XVCH-5GV4-984H')
  assert.deepEqual(input.repositories.map((repository) => repository.slug), ['acme/one', 'acme/two'])
})

test('investigation input preserves an explicit GitHub historical ref', () => {
  const input = parseInvestigationInput('GHSA-xvch-5gv4-984h https://github.com/apache/arrow-rs/tree/caf1c6022c71af00ef712e9e865acfee74169f0d')
  assert.equal(input.packageName, null)
  assert.deepEqual(input.repositories, [{
    owner: 'apache',
    name: 'arrow-rs',
    refKind: 'tree',
    ref: 'caf1c6022c71af00ef712e9e865acfee74169f0d',
    slug: 'apache/arrow-rs',
    url: 'https://github.com/apache/arrow-rs/tree/caf1c6022c71af00ef712e9e865acfee74169f0d',
  }])
})

test('investigation input preserves a commit URL ref kind', () => {
  const input = parseInvestigationInput('GHSA-xvch-5gv4-984h https://github.com/apache/arrow-rs/commit/caf1c6022c71af00ef712e9e865acfee74169f0d')
  assert.equal(input.repositories[0].refKind, 'commit')
  assert.equal(input.repositories[0].ref, 'caf1c6022c71af00ef712e9e865acfee74169f0d')
  assert.equal(input.repositories[0].url, 'https://github.com/apache/arrow-rs/commit/caf1c6022c71af00ef712e9e865acfee74169f0d')
})

test('investigation input keeps distinct snapshots of the same repository', () => {
  const input = parseInvestigationInput('GHSA-xvch-5gv4-984h https://github.com/apache/arrow-rs/tree/old https://github.com/apache/arrow-rs')
  assert.deepEqual(input.repositories.map((repository) => repository.url), [
    'https://github.com/apache/arrow-rs/tree/old',
    'https://github.com/apache/arrow-rs',
  ])
})

test('Cargo evidence parser preserves workspace dependencies and lockfile edges', () => {
  const manifest = parseCargoManifest(`
[package]
name = "recoil-fixture"
version = "0.1.0"

[dependencies]
serde = { version = "1.0", features = ["derive"] }
hydra-client = "0.4"
`)
  const lock = parseCargoLock(`
[[package]]
name = "recoil-fixture"
version = "0.1.0"
dependencies = ["hydra-client", "serde"]

[[package]]
name = "serde"
version = "1.0.210"
`)

  assert.equal(manifest.name, 'recoil-fixture')
  assert.equal(manifest.dependencies.serde, '1.0')
  assert.equal(manifest.dependencies['hydra-client'], '0.4')
  assert.deepEqual(manifest.dependencyAliases, {})
  assert.deepEqual(lock[0], { name: 'recoil-fixture', version: '0.1.0', dependencies: ['hydra-client', 'serde'] })
})

test('Cargo manifest preserves renamed package identity for source normalization', () => {
  const manifest = parseCargoManifest('[dependencies]\nbytes_alias = { package = "bytes", version = "1.10" }')

  assert.equal(manifest.dependencies.bytes_alias, '1.10')
  assert.deepEqual(manifest.dependencyAliases, { bytes_alias: 'bytes' })
})

test('npm lockfile paths normalize nested and scoped package identities', () => {
  assert.equal(packageNameFromNodeModulesPath('node_modules/minimist'), 'minimist')
  assert.equal(packageNameFromNodeModulesPath('node_modules/parent/node_modules/minimist'), 'minimist')
  assert.equal(packageNameFromNodeModulesPath('node_modules/parent/node_modules/@scope/parser'), '@scope/parser')
})

test('npm lock parser keeps a requested package beyond the bounded prefix', () => {
  const packages = Object.fromEntries(Array.from({ length: 161 }, (_, index) => [
    `node_modules/package-${index}`,
    { version: '1.0.0' },
  ]))
  packages['node_modules/target-package'] = { version: '2.3.4' }
  const parsed = parseNpmLockPackages({ packages }, 'target-package')
  assert.ok(parsed.some((entry) => entry.name === 'target-package' && entry.version === '2.3.4'))
})

test('legacy npm lockfile parser preserves nested dependency paths', () => {
  const entries = parseNpmLockPackages({
    dependencies: {
      parent: {
        version: '2.0.0',
        dependencies: {
          minimist: { version: '1.2.5', resolved: 'https://registry.npmjs.org/minimist/-/minimist-1.2.5.tgz' },
        },
      },
    },
  })

  assert.deepEqual(entries.map((entry) => `${entry.path}:${entry.name}@${entry.version}`), [
    'node_modules/parent:parent@2.0.0',
    'node_modules/parent/node_modules/minimist:minimist@1.2.5',
  ])
})

test('Yarn lock parser preserves classic, Berry, scoped, and dependency entries', () => {
  const entries = parseYarnLock(`
minimist@^1.2.5, minimist@^1.2.6:
  version "1.2.8"
  resolved "https://registry.npmjs.org/minimist/-/minimist-1.2.8.tgz"
  dependencies:
    wordwrap "~1.0.0"

"@scope/parser@npm:^2.0.0":
  version: 2.1.0
  resolution: "@scope/parser@npm:2.1.0"
`)

  assert.deepEqual(entries.map((entry) => [entry.name, entry.version]), [
    ['minimist', '1.2.8'],
    ['minimist', '1.2.8'],
    ['@scope/parser', '2.1.0'],
  ])
  assert.equal(entries[0].dependencies[0], 'wordwrap')
  assert.equal(entries[2].resolved, '@scope/parser@npm:2.1.0')
  assert.match(entries[2].path, /^yarn:/)
})

test('pnpm lock parser preserves v6 and v9 package identities and edges', () => {
  const entries = parsePnpmLock(`
lockfileVersion: '9.0'

packages:
  minimist@1.2.5:
    resolution: {integrity: sha512-test}
  '@scope/parser@2.1.0(peer@1.0.0)':
    resolution: {integrity: sha512-test}
snapshots:
  '@scope/parser@2.1.0(peer@1.0.0)':
    dependencies:
      minimist: 1.2.5
`)

  assert.deepEqual(entries.map((entry) => [entry.name, entry.version]), [
    ['minimist', '1.2.5'],
    ['@scope/parser', '2.1.0'],
  ])
  assert.deepEqual(entries[1].dependencies, ['minimist'])
  assert.match(entries[0].path, /^pnpm:/)
})

test('pnpm workspace parser preserves bounded include and exclude patterns', () => {
  assert.deepEqual(parsePnpmWorkspace(`
packages:
  - 'packages/*'
  - apps/**
  - '!packages/fixtures'
catalog:
  typescript: 5.0.0
`), ['packages/*', 'apps/**', '!packages/fixtures'])
})

test('package selection never chooses the first repository when repository-only input is ambiguous', () => {
  const selection = resolvePackageSelection({
    repositoryResults: [
      { status: 'completed', inferredPackage: 'first-app' },
      { status: 'completed', inferredPackage: 'second-app' },
    ],
  })

  assert.equal(selection.status, 'ambiguous')
  assert.equal(selection.packageName, null)
  assert.deepEqual(selection.candidates, ['first-app', 'second-app'])
  assert.match(selection.reason, /provide an advisory or package selector/)
})

test('package selection accepts an advisory package before repository inference', () => {
  const selection = resolvePackageSelection({
    advisoryPackage: 'minimist',
    repositoryResults: [{ status: 'completed', inferredPackage: 'app-one' }],
  })

  assert.equal(selection.status, 'advisory')
  assert.equal(selection.packageName, 'minimist')
  assert.deepEqual(selection.candidates, ['minimist'])
})
