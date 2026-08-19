import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { collectRepository, readRawGitHubFile, runMultiRepositoryIngestion } from '../server/collectors.js'
import { buildInvestigationReport } from '../src/core/investigation.js'

const advisory = {
  id: 'GHSA-test-1234-5678',
  aliases: ['CVE-2099-1234'],
  summary: 'Test advisory for a vulnerable argument parser',
  published: '2022-03-18T00:01:09Z',
  modified: '2022-03-20T00:01:09Z',
  affected: [{
    package: { ecosystem: 'npm', name: 'minimist' },
    ranges: [{ type: 'SEMVER', events: [{ introduced: '0' }, { fixed: '1.2.6' }] }],
  }],
  references: [{ type: 'WEB', url: 'https://osv.dev/vulnerability/GHSA-test-1234-5678' }],
  sourceUrl: 'https://api.osv.dev/v1/vulns/GHSA-test-1234-5678',
}

function response(payload, status = 200, headers = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 404 ? 'Not Found' : 'OK',
    headers: { get: (name) => headers[name.toLowerCase()] || null },
    json: async () => payload,
    text: async () => typeof payload === 'string' ? payload : JSON.stringify(payload),
  }
}

function githubFile(path, text, repository) {
  return {
    type: 'file',
    name: path.split('/').at(-1),
    path,
    content: Buffer.from(text).toString('base64'),
    html_url: `https://github.com/${repository}/blob/HEAD/${path}`,
  }
}

function packageLock(version) {
  return JSON.stringify({
    lockfileVersion: 3,
    packages: {
      '': { dependencies: { minimist: '^1.2.0' } },
      [`node_modules/minimist`]: { version, resolved: `https://registry.npmjs.org/minimist/-/minimist-${version}.tgz`, dependencies: {} },
    },
  })
}

test('raw GitHub source reads replay from the bounded cache', async () => {
  const previousFetch = globalThis.fetch
  const previousCache = process.env.RECOIL_CACHE_DIR
  const cacheDir = mkdtempSync(join(tmpdir(), 'recoil-raw-cache-'))
  process.env.RECOIL_CACHE_DIR = cacheDir
  let requests = 0
  globalThis.fetch = async () => {
    requests += 1
    return response('export const cached = true')
  }

  try {
    const repository = { slug: 'example/cache-app' }
    const first = await readRawGitHubFile(repository, 'src/main.js')
    const second = await readRawGitHubFile(repository, 'src/main.js')
    assert.equal(requests, 1)
    assert.deepEqual(second, first)
    assert.equal(second.text, 'export const cached = true')
  } finally {
    globalThis.fetch = previousFetch
    if (previousCache === undefined) delete process.env.RECOIL_CACHE_DIR
    else process.env.RECOIL_CACHE_DIR = previousCache
    rmSync(cacheDir, { recursive: true, force: true })
  }
})

test('known repository files prefer raw content and reuse the recursive tree for workflows', async () => {
  const previousFetch = globalThis.fetch
  const previousCache = process.env.RECOIL_CACHE_DIR
  process.env.RECOIL_CACHE_DIR = '/dev/null'
  const requests = []
  const manifest = JSON.stringify({ name: 'raw-app', version: '1.0.0', dependencies: { minimist: '^1.2.0' } })
  const source = "import minimist from 'minimist'\nexport function main() { return minimist(process.argv) }"

  globalThis.fetch = async (input) => {
    const url = new URL(input)
    requests.push(url)
    if (url.hostname === 'raw.githubusercontent.com') {
      if (url.pathname.endsWith('/package.json')) return response(manifest)
      if (url.pathname.endsWith('/package-lock.json')) return response(packageLock('1.2.5'))
      if (url.pathname.endsWith('/src/main.js')) return response(source)
      if (url.pathname.endsWith('/.github/workflows/ci.yml')) return response('name: ci\nrun-name: test')
      return response({}, 404)
    }
    if (url.hostname !== 'api.github.com') return response({}, 404)
    const operation = url.pathname.split('/repos/example/raw-app/')[1] || ''
    if (operation.startsWith('git/trees/')) return response({ tree: [{ type: 'blob', path: 'src/main.js' }, { type: 'blob', path: '.github/workflows/ci.yml' }] })
    if (operation.startsWith('commits')) {
      if (url.searchParams.has('path')) return response([{ html_url: 'https://github.com/example/raw-app/commit/oldest', commit: { author: { date: '2024-01-01T00:00:00Z' } } }])
      return response([])
    }
    return response({}, 404)
  }

  try {
    const repository = await collectRepository({ owner: 'example', name: 'raw-app', slug: 'example/raw-app' }, 'minimist')
    assert.equal(repository.sourceUrl, 'https://raw.githubusercontent.com/example/raw-app/HEAD/package.json')
    assert.ok(repository.sources.some((source) => source.url === 'https://raw.githubusercontent.com/example/raw-app/HEAD/package-lock.json'))
    assert.equal(repository.manifest.ciSignals.status, 'collected')
    assert.deepEqual(repository.manifest.ciSignals.workflowFiles, ['.github/workflows/ci.yml'])
    assert.equal(requests.some((url) => url.hostname === 'api.github.com' && url.pathname.endsWith('/contents/package.json')), false)
    assert.equal(requests.some((url) => url.hostname === 'api.github.com' && url.pathname.endsWith('/contents/package-lock.json')), false)
    assert.equal(requests.some((url) => url.hostname === 'api.github.com' && url.pathname.endsWith('/contents/.github/workflows')), false)
    assert.equal(requests.filter((url) => url.pathname.includes('/git/trees/')).length, 1)
  } finally {
    globalThis.fetch = previousFetch
    if (previousCache === undefined) delete process.env.RECOIL_CACHE_DIR
    else process.env.RECOIL_CACHE_DIR = previousCache
  }
})

test('workflow directory is the fallback when recursive tree discovery fails', async () => {
  const previousFetch = globalThis.fetch
  const previousCache = process.env.RECOIL_CACHE_DIR
  const previousRetries = process.env.RECOIL_NETWORK_RETRIES
  process.env.RECOIL_CACHE_DIR = '/dev/null'
  process.env.RECOIL_NETWORK_RETRIES = '1'
  const requests = []
  globalThis.fetch = async (input) => {
    const url = new URL(input)
    requests.push(url)
    if (url.hostname === 'raw.githubusercontent.com') {
      if (url.pathname.endsWith('/package.json')) return response(JSON.stringify({ name: 'fallback-app', dependencies: { minimist: '^1.2.0' } }))
      if (url.pathname.endsWith('/package-lock.json')) return response(packageLock('1.2.5'))
      if (url.pathname.endsWith('/.github/workflows/ci.yml')) return response('name: ci')
      return response({}, 404)
    }
    if (url.hostname !== 'api.github.com') return response({}, 404)
    const operation = url.pathname.split('/repos/example/fallback-app/')[1] || ''
    if (operation.startsWith('git/trees/')) throw new Error('tree endpoint offline')
    if (operation === 'contents/.github/workflows') return response([{ type: 'file', name: 'ci.yml', path: '.github/workflows/ci.yml' }])
    if (operation.startsWith('commits')) return response([])
    return response({}, 404)
  }

  try {
    const repository = await collectRepository({ owner: 'example', name: 'fallback-app', slug: 'example/fallback-app' }, 'minimist')
    assert.equal(repository.manifest.ciSignals.status, 'collected')
    assert.deepEqual(repository.manifest.ciSignals.workflowFiles, ['.github/workflows/ci.yml'])
    assert.equal(repository.manifest.collection.sourceFiles.status, 'unavailable')
    assert.equal(requests.filter((url) => url.pathname.includes('/git/trees/')).length, 1)
    assert.equal(requests.some((url) => url.pathname.endsWith('/contents/.github/workflows')), true)
  } finally {
    globalThis.fetch = previousFetch
    if (previousCache === undefined) delete process.env.RECOIL_CACHE_DIR
    else process.env.RECOIL_CACHE_DIR = previousCache
    if (previousRetries === undefined) delete process.env.RECOIL_NETWORK_RETRIES
    else process.env.RECOIL_NETWORK_RETRIES = previousRetries
  }
})

test('multi-repository ingestion computes real evidence contrast without synthetic graph nodes', async () => {
  const previousFetch = globalThis.fetch
  const previousCache = process.env.RECOIL_CACHE_DIR
  process.env.RECOIL_CACHE_DIR = '/dev/null'
  const repositories = {
    'example/reached': { version: '1.2.5', sourcePath: 'bin/reached-cli.js', source: "import minimist from 'minimist'\nexport function main() { return minimist(process.argv) }", firstCommit: '2021-01-01T00:00:00Z' },
    'example/declared': { version: '1.2.5', sourcePath: 'src/main.js', source: 'export function main() { return true }', firstCommit: '2021-02-01T00:00:00Z' },
    'example/fixed': { version: '1.2.6', sourcePath: 'src/main.js', source: 'export function main() { return true }', firstCommit: '2022-04-01T00:00:00Z' },
  }
  const events = []
  const requests = []

  globalThis.fetch = async (input) => {
    const url = new URL(input)
    requests.push(url)
    if (url.hostname === 'api.osv.dev') return response(advisory)
    if (url.hostname === 'registry.npmjs.org') return response({ name: 'minimist', 'dist-tags': { latest: '1.2.8' }, versions: { '1.2.5': {}, '1.2.6': {}, '1.2.8': {} }, maintainers: [{ name: 'fixture-maintainer' }] })
    if (url.hostname !== 'api.github.com') return response({}, 404)

    const match = url.pathname.match(/^\/repos\/([^/]+\/[^/]+)\/(.*)$/)
    if (!match) return response({}, 404)
    const repository = repositories[match[1]]
    if (!repository) return response({}, 404)
    const operation = match[2]
    if (operation.startsWith('git/trees/')) return response({ tree: [{ type: 'blob', path: 'src/main.js' }, { type: 'blob', path: repository.sourcePath }] })
    if (operation.startsWith('commits')) {
      if (url.searchParams.has('path')) return response([{ html_url: `https://github.com/${match[1]}/commit/oldest`, commit: { author: { date: repository.firstCommit }, committer: { date: repository.firstCommit } } }])
      return response([])
    }
    if (operation.startsWith('contents/')) {
      const path = decodeURIComponent(operation.slice('contents/'.length))
      if (path === 'package.json') return response(githubFile(path, JSON.stringify({ name: match[1].split('/')[1], version: '1.0.0', dependencies: { minimist: '^1.2.0' } }), match[1]))
      if (path === 'package-lock.json') return response(githubFile(path, packageLock(repository.version), match[1]))
      if (path === repository.sourcePath) return response(githubFile(path, repository.source, match[1]))
      return response({}, 404)
    }
    return response({}, 404)
  }

  try {
    const ingestion = await runMultiRepositoryIngestion({
      query: 'GHSA-test-1234-5678 https://github.com/example/reached/tree/fixture-ref https://github.com/example/declared https://github.com/example/fixed',
      scenarioId: 'integration-test',
      onProgress: (event) => events.push(event),
    })
    const report = buildInvestigationReport(ingestion)
    assert.equal(ingestion.status, 'completed')
    assert.deepEqual(report.repositories.map((finding) => finding.verdict), ['REACHED', 'DECLARED_ONLY', 'NOT_AFFECTED'])
    assert.equal(report.summary.reached, 1)
    assert.equal(report.summary.declaredOnly, 1)
    assert.equal(report.summary.notAffected, 1)
    assert.equal(report.summary.fixSurvives, 1)
    assert.equal(report.summary.alreadySafe, 1)
    assert.equal(report.repositories[0].repositoryUrl, 'https://github.com/example/reached/tree/fixture-ref')
    assert.ok(requests.some((url) => url.pathname.endsWith('/contents/package.json') && url.searchParams.get('ref') === 'fixture-ref'))
    assert.ok(requests.some((url) => url.pathname.endsWith('/git/trees/fixture-ref')))
    assert.ok(requests.some((url) => url.hostname === 'raw.githubusercontent.com' && url.pathname.endsWith('/bin/reached-cli.js')))
    assert.ok(report.repositories[0].imports[0].sourceUrl.includes('/blob/fixture-ref/'))
    assert.ok(report.repositories[0].evidenceSources.some((source) => source.includes('bin/reached-cli.js')))
    assert.equal(report.repositories[0].pathObservedAt, '2021-01-01T00:00:00.000Z')
    assert.equal(report.graph.nodes.some((node) => node.label === 'customer database'), false)
    assert.equal(ingestion.repositories.every((item) => !('impactCandidates' in item.manifest.codeGraph)), true)
    assert.ok(events.some((event) => event.key === 'classification' && event.status === 'complete'))
  } finally {
    globalThis.fetch = previousFetch
    if (previousCache === undefined) delete process.env.RECOIL_CACHE_DIR
    else process.env.RECOIL_CACHE_DIR = previousCache
  }
})

test('repository-only ingestion does not choose a package or spend resolver calls when identities differ', async () => {
  const previousFetch = globalThis.fetch
  const previousCache = process.env.RECOIL_CACHE_DIR
  const previousRetries = process.env.RECOIL_NETWORK_RETRIES
  process.env.RECOIL_CACHE_DIR = '/dev/null'
  process.env.RECOIL_NETWORK_RETRIES = '1'
  const repositories = {
    'example/first-app': { name: 'first-app', source: 'export function first() { return true }' },
    'example/second-app': { name: 'second-app', source: 'export function second() { return true }' },
  }
  const events = []
  globalThis.fetch = async (input) => {
    const url = new URL(input)
    if (url.hostname === 'api.osv.dev' || url.hostname === 'registry.npmjs.org') throw new Error('unexpected resolver call')
    if (url.hostname === 'raw.githubusercontent.com') return response({}, 404)
    if (url.hostname !== 'api.github.com') return response({}, 404)
    const match = url.pathname.match(/^\/repos\/([^/]+\/[^/]+)\/(.*)$/)
    if (!match || !repositories[match[1]]) return response({}, 404)
    const repository = repositories[match[1]]
    const operation = match[2]
    if (operation.startsWith('git/trees/')) return response({ tree: [{ type: 'blob', path: 'src/index.js' }] })
    if (operation.startsWith('commits')) return response([])
    if (operation.startsWith('contents/')) {
      const path = decodeURIComponent(operation.slice('contents/'.length))
      if (path === 'package.json') return response(githubFile(path, JSON.stringify({ name: repository.name, version: '1.0.0' }), match[1]))
      if (path === 'src/index.js') return response(githubFile(path, repository.source, match[1]))
      return response({}, 404)
    }
    return response({}, 404)
  }

  try {
    const ingestion = await runMultiRepositoryIngestion({
      query: 'https://github.com/example/first-app https://github.com/example/second-app',
      scenarioId: 'ambiguous-package-test',
      onProgress: (event) => events.push(event),
    })
    assert.equal(ingestion.package, null)
    assert.equal(ingestion.packageResolution.status, 'ambiguous')
    assert.deepEqual(ingestion.packageResolution.candidates, ['first-app', 'second-app'])
    assert.equal(ingestion.findings.every((finding) => finding.packageName === null && finding.verdict === 'UNKNOWN'), true)
    assert.ok(events.some((event) => event.key === 'registry' && event.detail.includes('provide an advisory or package selector')))
  } finally {
    globalThis.fetch = previousFetch
    if (previousCache === undefined) delete process.env.RECOIL_CACHE_DIR
    else process.env.RECOIL_CACHE_DIR = previousCache
    if (previousRetries === undefined) delete process.env.RECOIL_NETWORK_RETRIES
    else process.env.RECOIL_NETWORK_RETRIES = previousRetries
  }
})

test('Cargo ingestion resolves an external crate import and registry fixed version', async () => {
  const previousFetch = globalThis.fetch
  const previousCache = process.env.RECOIL_CACHE_DIR
  process.env.RECOIL_CACHE_DIR = '/dev/null'
  const cargoAdvisory = {
    id: 'GHSA-cargo-1234-5678',
    summary: 'Test advisory for a vulnerable bytes release',
    published: '2026-01-01T00:00:00Z',
    affected: [{ package: { ecosystem: 'crates.io', name: 'bytes' }, ranges: [{ events: [{ introduced: '0' }, { fixed: '1.11.1' }] }] }],
    sourceUrl: 'https://api.osv.dev/v1/vulns/ghsa-cargo-1234-5678',
  }
  const cargoManifest = '[package]\nname = "rust-app"\nversion = "0.1.0"\n\n[dependencies]\nbytes_alias = { package = "bytes", version = "1.10" }\n'
  const cargoLock = '[[package]]\nname = "rust-app"\nversion = "0.1.0"\ndependencies = ["bytes"]\n\n[[package]]\nname = "bytes"\nversion = "1.10.0"\n'
  globalThis.fetch = async (input) => {
    const url = new URL(input)
    if (url.hostname === 'api.osv.dev') return response(cargoAdvisory)
    if (url.hostname === 'crates.io') return response({ crate: { name: 'bytes', max_version: '1.11.1' }, versions: [{ num: '1.10.0', yanked: false }, { num: '1.11.1', yanked: false }] })
    if (url.hostname !== 'api.github.com') return response({}, 404)
    const match = url.pathname.match(/^\/repos\/([^/]+\/[^/]+)\/(.*)$/)
    if (!match || match[1] !== 'example/rust-app') return response({}, 404)
    const operation = match[2]
    if (operation.startsWith('git/trees/')) return response({ tree: [{ type: 'blob', path: 'src/lib.rs' }] })
    if (operation.startsWith('commits')) {
      if (url.searchParams.has('path')) return response([{ html_url: 'https://github.com/example/rust-app/commit/oldest', commit: { author: { date: '2025-01-01T00:00:00Z' }, committer: { date: '2025-01-01T00:00:00Z' } } }])
      return response([])
    }
    if (operation.startsWith('contents/')) {
      const path = decodeURIComponent(operation.slice('contents/'.length))
      if (path === 'Cargo.toml') return response(githubFile(path, cargoManifest, 'example/rust-app'))
      if (path === 'Cargo.lock') return response(githubFile(path, cargoLock, 'example/rust-app'))
      if (path === 'src/lib.rs') return response(githubFile(path, 'use bytes_alias::BytesMut;\npub fn parse() { let _ = BytesMut::new(); }', 'example/rust-app'))
      return response({}, 404)
    }
    return response({}, 404)
  }
  try {
    const ingestion = await runMultiRepositoryIngestion({ query: 'GHSA-cargo-1234-5678 https://github.com/example/rust-app', scenarioId: 'cargo-integration-test' })
    const finding = ingestion.findings[0]
    assert.equal(ingestion.status, 'completed')
    assert.equal(ingestion.registry.ecosystem, 'cargo')
    assert.deepEqual(ingestion.registry.fixedVersions, ['1.11.1'])
    assert.equal(finding.verdict, 'REACHED')
    assert.equal(finding.imports[0].packageName, 'bytes')
    assert.equal(finding.imports[0].packageAlias, 'bytes_alias')
    assert.equal(ingestion.repositories[0].manifest.codeGraph.externalImports[0].packageName, 'bytes')
    assert.equal(ingestion.repositories[0].manifest.codeGraph.files[0].language, 'rust')
  } finally {
    globalThis.fetch = previousFetch
    if (previousCache === undefined) delete process.env.RECOIL_CACHE_DIR
    else process.env.RECOIL_CACHE_DIR = previousCache
  }
})

test('npm ingestion resolves a nested transitive package from package-lock paths', async () => {
  const previousFetch = globalThis.fetch
  const previousCache = process.env.RECOIL_CACHE_DIR
  process.env.RECOIL_CACHE_DIR = '/dev/null'
  const nestedAdvisory = {
    id: 'GHSA-nested-1234-5678',
    summary: 'Test advisory for a nested package',
    published: '2026-01-01T00:00:00Z',
    affected: [{ package: { ecosystem: 'npm', name: 'minimist' }, ranges: [{ events: [{ introduced: '0' }, { fixed: '1.2.6' }] }] }],
    sourceUrl: 'https://api.osv.dev/v1/vulns/ghsa-nested-1234-5678',
  }
  const nestedLock = JSON.stringify({
    lockfileVersion: 3,
    packages: {
      '': { dependencies: { parent: '^2.0.0' } },
      'node_modules/parent': { version: '2.0.0', dependencies: { minimist: '1.2.5' } },
      'node_modules/parent/node_modules/minimist': { version: '1.2.5', resolved: 'https://registry.npmjs.org/minimist/-/minimist-1.2.5.tgz' },
    },
  })
  globalThis.fetch = async (input) => {
    const url = new URL(input)
    if (url.hostname === 'api.osv.dev') return response(nestedAdvisory)
    if (url.hostname === 'registry.npmjs.org') return response({ name: 'minimist', versions: { '1.2.5': {}, '1.2.6': {} }, maintainers: [] })
    if (url.hostname !== 'api.github.com') return response({}, 404)
    const match = url.pathname.match(/^\/repos\/([^/]+\/[^/]+)\/(.*)$/)
    if (!match || match[1] !== 'example/nested-app') return response({}, 404)
    const operation = match[2]
    if (operation.startsWith('git/trees/')) return response({ tree: [{ type: 'blob', path: 'src/cli.js' }] })
    if (operation.startsWith('commits')) {
      if (url.searchParams.has('path')) return response([{ html_url: 'https://github.com/example/nested-app/commit/oldest', commit: { author: { date: '2025-01-01T00:00:00Z' } } }])
      return response([])
    }
    if (operation.startsWith('contents/')) {
      const path = decodeURIComponent(operation.slice('contents/'.length))
      if (path === 'package.json') return response(githubFile(path, JSON.stringify({ name: 'nested-app', dependencies: { parent: '^2.0.0' } }), 'example/nested-app'))
      if (path === 'package-lock.json') return response(githubFile(path, nestedLock, 'example/nested-app'))
      if (path === 'src/cli.js') return response(githubFile(path, "import minimist from 'minimist'\nexport function main() { return minimist(process.argv) }", 'example/nested-app'))
      return response({}, 404)
    }
    return response({}, 404)
  }
  try {
    const ingestion = await runMultiRepositoryIngestion({ query: 'GHSA-nested-1234-5678 https://github.com/example/nested-app', scenarioId: 'nested-integration-test' })
    assert.equal(ingestion.findings[0].resolvedVersion, '1.2.5')
    assert.equal(ingestion.findings[0].verdict, 'REACHED')
    assert.deepEqual(ingestion.findings[0].dependencyPath.map((item) => `${item.name}@${item.version}`), ['parent@2.0.0', 'minimist@1.2.5'])
    assert.ok(ingestion.graph.edges.some(([from, to]) => from === 'package:parent@2.0.0' && to === 'package:minimist@1.2.5'))
    assert.equal(ingestion.repositories[0].manifest.lockPackages.find((item) => item.name === 'minimist').path, 'node_modules/parent/node_modules/minimist')
  } finally {
    globalThis.fetch = previousFetch
    if (previousCache === undefined) delete process.env.RECOIL_CACHE_DIR
    else process.env.RECOIL_CACHE_DIR = previousCache
  }
})

test('npm ingestion resolves an affected package from a Yarn lock and extensionless entrypoint', async () => {
  const previousFetch = globalThis.fetch
  const previousCache = process.env.RECOIL_CACHE_DIR
  process.env.RECOIL_CACHE_DIR = '/dev/null'
  const yarnAdvisory = {
    id: 'GHSA-yarn-1234-5678',
    summary: 'Test advisory for a Yarn-managed package',
    published: '2026-01-01T00:00:00Z',
    affected: [{ package: { ecosystem: 'npm', name: 'minimist' }, ranges: [{ events: [{ introduced: '0' }, { fixed: '1.2.6' }] }] }],
    sourceUrl: 'https://api.osv.dev/v1/vulns/ghsa-yarn-1234-5678',
  }
  const manifest = JSON.stringify({ name: 'yarn-app', dependencies: { minimist: '^1.2.0' } })
  const yarnLock = `minimist@^1.2.0:\n  version "1.2.5"\n  resolved "https://registry.npmjs.org/minimist/-/minimist-1.2.5.tgz"\n`
  const source = "#!/usr/bin/env node\nconst minimist = require('minimist')\nmodule.exports = () => minimist(process.argv)"

  globalThis.fetch = async (input) => {
    const url = new URL(input)
    if (url.hostname === 'api.osv.dev') return response(yarnAdvisory)
    if (url.hostname === 'registry.npmjs.org') return response({ name: 'minimist', versions: { '1.2.5': {}, '1.2.6': {} }, maintainers: [] })
    if (url.hostname === 'raw.githubusercontent.com') {
      const path = url.pathname.split('/').slice(4).join('/')
      if (path === 'package.json') return response(manifest)
      if (path === 'yarn.lock') return response(yarnLock)
      if (path === 'bin/http-server') return response(source)
      return response({}, 404)
    }
    if (url.hostname !== 'api.github.com') return response({}, 404)
    const match = url.pathname.match(/^\/repos\/([^/]+\/[^/]+)\/(.*)$/)
    if (!match || match[1] !== 'example/yarn-app') return response({}, 404)
    const operation = match[2]
    if (operation.startsWith('git/trees/')) return response({ tree: [{ type: 'blob', path: 'bin/http-server' }] })
    if (operation.startsWith('commits')) {
      if (url.searchParams.has('path')) return response([{ html_url: 'https://github.com/example/yarn-app/commit/oldest', commit: { author: { date: '2025-01-01T00:00:00Z' } } }])
      return response([])
    }
    return response({}, 404)
  }
  try {
    const ingestion = await runMultiRepositoryIngestion({ query: 'GHSA-yarn-1234-5678 https://github.com/example/yarn-app', scenarioId: 'yarn-integration-test' })
    const repository = ingestion.repositories[0]
    const finding = ingestion.findings[0]
    assert.equal(ingestion.status, 'completed')
    assert.equal(repository.manifest.lockfile, 'yarn.lock')
    assert.equal(repository.manifest.resolved.minimist, '1.2.5')
    assert.equal(finding.verdict, 'REACHED')
    assert.equal(finding.imports[0].path, 'bin/http-server')
    assert.deepEqual(finding.dependencyPath.map((item) => `${item.name}@${item.version}`), ['minimist@1.2.5'])
  } finally {
    globalThis.fetch = previousFetch
    if (previousCache === undefined) delete process.env.RECOIL_CACHE_DIR
    else process.env.RECOIL_CACHE_DIR = previousCache
  }
})

test('network failures preserve the endpoint and downgrade evidence honestly', async () => {
  const previousFetch = globalThis.fetch
  globalThis.fetch = async (input) => {
    const error = new Error('fetch failed', { cause: { code: 'ENOTFOUND' } })
    throw error
  }
  try {
    const ingestion = await runMultiRepositoryIngestion({
      query: 'GHSA-test-1234-5678 https://github.com/example/unavailable',
      scenarioId: 'network-error-test',
    })
    assert.equal(ingestion.status, 'partial')
    assert.match(ingestion.collectors.find((item) => item.collector === 'advisory-resolver').error, /api\.osv\.dev.*ENOTFOUND/)
    assert.match(ingestion.collectors.find((item) => item.collector === 'repository-extractor').error, /api\.github\.com.*ENOTFOUND/)
    assert.equal(ingestion.findings[0].verdict, 'UNKNOWN')
  } finally {
    globalThis.fetch = previousFetch
  }
})

test('transient network failures are retried before evidence is classified', async () => {
  const previousFetch = globalThis.fetch
  const previousRetries = process.env.RECOIL_NETWORK_RETRIES
  const attempts = new Map()
  const osvUrls = []
  process.env.RECOIL_NETWORK_RETRIES = '3'
  globalThis.fetch = async (input) => {
    const url = new URL(input)
    const count = (attempts.get(url.hostname) || 0) + 1
    attempts.set(url.hostname, count)
    if (url.hostname === 'api.osv.dev') {
      osvUrls.push(url.pathname)
      if (count < 3) throw new Error('temporary resolver failure', { cause: { code: 'EAI_AGAIN' } })
      return response(advisory)
    }
    if (url.hostname === 'registry.npmjs.org') return response({ name: 'minimist', 'dist-tags': { latest: '1.2.8' }, versions: { '1.2.8': {} }, maintainers: [] })
    return response({}, 404)
  }
  try {
    const ingestion = await runMultiRepositoryIngestion({ query: 'GHSA-test-1234-5678', scenarioId: 'network-retry-test' })
    assert.equal(attempts.get('api.osv.dev'), 3)
    assert.deepEqual(osvUrls, [
      '/v1/vulns/ghsa-test-1234-5678',
      '/v1/vulns/ghsa-test-1234-5678',
      '/v1/vulns/ghsa-test-1234-5678',
    ])
    assert.equal(ingestion.status, 'completed')
    assert.equal(ingestion.advisory.id, advisory.id)
  } finally {
    globalThis.fetch = previousFetch
    if (previousRetries === undefined) delete process.env.RECOIL_NETWORK_RETRIES
    else process.env.RECOIL_NETWORK_RETRIES = previousRetries
  }
})
