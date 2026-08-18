import test from 'node:test'
import assert from 'node:assert/strict'
import { runMultiRepositoryIngestion } from '../server/collectors.js'
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

test('multi-repository ingestion computes real evidence contrast without synthetic graph nodes', async () => {
  const previousFetch = globalThis.fetch
  const previousCache = process.env.RECOIL_CACHE_DIR
  process.env.RECOIL_CACHE_DIR = '/dev/null'
  const repositories = {
    'example/reached': { version: '1.2.5', sourcePath: 'src/cli.js', source: "import minimist from 'minimist'\nexport function main() { return minimist(process.argv) }", firstCommit: '2021-01-01T00:00:00Z' },
    'example/declared': { version: '1.2.5', sourcePath: 'src/main.js', source: 'export function main() { return true }', firstCommit: '2021-02-01T00:00:00Z' },
    'example/fixed': { version: '1.2.6', sourcePath: 'src/main.js', source: 'export function main() { return true }', firstCommit: '2022-04-01T00:00:00Z' },
  }
  const events = []

  globalThis.fetch = async (input) => {
    const url = new URL(input)
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
      query: 'GHSA-test-1234-5678 https://github.com/example/reached https://github.com/example/declared https://github.com/example/fixed',
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
    assert.ok(report.repositories[0].evidenceSources.some((source) => source.includes('src/cli.js')))
    assert.equal(report.repositories[0].pathObservedAt, '2021-01-01T00:00:00.000Z')
    assert.equal(report.graph.nodes.some((node) => node.label === 'customer database'), false)
    assert.equal(ingestion.repositories.every((item) => item.manifest.codeGraph.impactCandidates.length === 0), true)
    assert.ok(events.some((event) => event.key === 'classification' && event.status === 'complete'))
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
  process.env.RECOIL_NETWORK_RETRIES = '3'
  globalThis.fetch = async (input) => {
    const url = new URL(input)
    const count = (attempts.get(url.hostname) || 0) + 1
    attempts.set(url.hostname, count)
    if (url.hostname === 'api.osv.dev' && count < 3) throw new Error('temporary resolver failure', { cause: { code: 'EAI_AGAIN' } })
    if (url.hostname === 'api.osv.dev') return response(advisory)
    if (url.hostname === 'registry.npmjs.org') return response({ name: 'minimist', 'dist-tags': { latest: '1.2.8' }, versions: { '1.2.8': {} }, maintainers: [] })
    return response({}, 404)
  }
  try {
    const ingestion = await runMultiRepositoryIngestion({ query: 'GHSA-test-1234-5678', scenarioId: 'network-retry-test' })
    assert.equal(attempts.get('api.osv.dev'), 3)
    assert.equal(ingestion.status, 'completed')
    assert.equal(ingestion.advisory.id, advisory.id)
  } finally {
    globalThis.fetch = previousFetch
    if (previousRetries === undefined) delete process.env.RECOIL_NETWORK_RETRIES
    else process.env.RECOIL_NETWORK_RETRIES = previousRetries
  }
})
