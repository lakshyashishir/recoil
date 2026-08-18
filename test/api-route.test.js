import test from 'node:test'
import assert from 'node:assert/strict'
import { route } from '../server/index.js'

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
  return JSON.stringify({ lockfileVersion: 3, packages: {
    '': { dependencies: { minimist: '^1.2.0' } },
    'node_modules/minimist': { version, resolved: `https://registry.npmjs.org/minimist/-/minimist-${version}.tgz`, dependencies: {} },
  } })
}

function request(method, path, payload) {
  let statusCode
  let headers
  let output = ''
  const res = {
    get headersSent() { return Boolean(headers) },
    writeHead(status, nextHeaders) { statusCode = status; headers = nextHeaders },
    end(value = '') { output += value },
  }
  const body = payload === undefined ? '' : JSON.stringify(payload)
  const req = {
    method,
    url: path,
    headers: { host: '127.0.0.1' },
    async *[Symbol.asyncIterator]() { if (body) yield body },
  }
  return Promise.resolve(route(req, res)).then(() => ({ statusCode, headers, body: output ? JSON.parse(output) : null }))
}

test('API route chain starts, completes, rewinds, and exports a receipt', async () => {
  const previousFetch = globalThis.fetch
  const previousKey = process.env.OPENAI_API_KEY
  const previousScope = process.env.RECOIL_ADVISORY_AGENT
  delete process.env.OPENAI_API_KEY
  process.env.RECOIL_ADVISORY_AGENT = 'off'
  const advisory = {
    id: 'GHSA-route-1234-5678',
    summary: 'Test parser advisory',
    published: '2022-03-18T00:01:09Z',
    affected: [{ package: { ecosystem: 'npm', name: 'minimist' }, ranges: [{ events: [{ introduced: '0' }, { fixed: '1.2.6' }] }] }],
    references: [{ url: 'https://osv.dev/vulnerability/GHSA-route-1234-5678' }],
  }
  const repository = 'example/route-app'
  globalThis.fetch = async (input) => {
    const url = new URL(input)
    if (url.hostname === 'api.osv.dev') return response(advisory)
    if (url.hostname === 'registry.npmjs.org') return response({ name: 'minimist', versions: { '1.2.5': {}, '1.2.6': {} }, maintainers: [] })
    if (url.hostname !== 'api.github.com') return response({}, 404)
    const match = url.pathname.match(/^\/repos\/([^/]+\/[^/]+)\/(.*)$/)
    if (!match || match[1] !== repository) return response({}, 404)
    const operation = match[2]
    if (operation.startsWith('git/trees/')) return response({ tree: [{ type: 'blob', path: 'src/cli.js' }] })
    if (operation.startsWith('commits')) {
      if (url.searchParams.has('path')) return response([{ html_url: `https://github.com/${repository}/commit/oldest`, commit: { author: { date: '2021-01-01T00:00:00Z' } } }])
      return response([])
    }
    if (operation.startsWith('contents/')) {
      const path = decodeURIComponent(operation.slice('contents/'.length))
      if (path === 'package.json') return response(githubFile(path, JSON.stringify({ name: 'route-app', dependencies: { minimist: '^1.2.0' } }), repository))
      if (path === 'package-lock.json') return response(githubFile(path, packageLock('1.2.5'), repository))
      if (path === 'src/cli.js') return response(githubFile(path, "import minimist from 'minimist'\nexport function main() { return minimist(process.argv) }", repository))
      return response({}, 404)
    }
    return response({}, 404)
  }
  try {
    const id = 'api-route-proof'
    const started = await request('POST', `/api/scenarios/${id}/investigate`, { query: `GHSA-route-1234-5678 https://github.com/${repository}` })
    assert.equal(started.statusCode, 202)
    let current = started.body
    const deadline = Date.now() + 3000
    while (current.investigation?.status !== 'complete' && current.investigation?.status !== 'failed' && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 10))
      current = (await request('GET', `/api/scenarios/${id}`)).body
    }
    assert.equal(current.investigation.status, 'complete')
    assert.equal(current.investigation.report.summary.reached, 1)
    assert.equal(current.investigation.report.evidenceQuality.readyForRecording, true)
    assert.equal(current.investigation.events.find((event) => event.key === 'complete').title, 'Case complete')
    assert.equal(current.investigation.hydra.status, 'skipped')

    const receipt = await request('GET', `/api/scenarios/${id}/receipt`)
    assert.equal(receipt.statusCode, 200)
    assert.equal(receipt.body.schema, 'recoil.evidence-receipt/v1')
    assert.equal(receipt.body.repositories[0].verdict, 'REACHED')

    const rewind = await request('POST', `/api/scenarios/${id}/rewind`, { asOf: '2020-01-01T00:00:00Z' })
    assert.equal(rewind.statusCode, 200)
    assert.equal(rewind.body.report.rewind.findings[0].verdict, 'NOT_YET_OBSERVED')

    const health = await request('GET', '/api/health')
    assert.equal(health.statusCode, 200)
    assert.equal(health.body.product, 'evidence-proof')
    assert.equal('legacyArenaAgents' in health.body, false)
    const retiredArena = await request('POST', `/api/scenarios/${id}/arena/start`, {})
    assert.equal(retiredArena.statusCode, 404)
  } finally {
    globalThis.fetch = previousFetch
    if (previousKey === undefined) delete process.env.OPENAI_API_KEY
    else process.env.OPENAI_API_KEY = previousKey
    if (previousScope === undefined) delete process.env.RECOIL_ADVISORY_AGENT
    else process.env.RECOIL_ADVISORY_AGENT = previousScope
  }
})
