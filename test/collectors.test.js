import test from 'node:test'
import assert from 'node:assert/strict'
import { inferTarget, parseCargoLock, parseCargoManifest, parseInvestigationInput } from '../server/collectors.js'

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
