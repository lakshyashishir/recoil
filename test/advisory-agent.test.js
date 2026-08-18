import test from 'node:test'
import assert from 'node:assert/strict'
import { resolveAdvisoryScope } from '../server/advisory-agent.js'

test('optional advisory agent parses structured scope and remains isolated from verdicts', async () => {
  const previousFetch = globalThis.fetch
  const previousKey = process.env.OPENAI_API_KEY
  const previousMode = process.env.RECOIL_ADVISORY_AGENT
  process.env.OPENAI_API_KEY = 'test-key'
  process.env.RECOIL_ADVISORY_AGENT = 'on'
  globalThis.fetch = async (url, options) => {
    assert.equal(url, 'https://api.openai.com/v1/responses')
    assert.equal(options.method, 'POST')
    return {
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => ({ output_text: JSON.stringify({ affectedSymbols: [{ name: 'parseArgs', reason: 'parser entry point' }], confidence: 'medium', note: 'candidate only' }) }),
    }
  }
  try {
    const result = await resolveAdvisoryScope({
      advisory: { id: 'GHSA-test', summary: 'parser issue', details: 'parseArgs accepts unsafe keys', references: [] },
      repositories: [{ repository: 'example/app', manifest: { codeGraph: { symbols: [{ name: 'parseArgs', path: 'src/cli.js', line: 2 }] } } }],
    })
    assert.equal(result.status, 'completed')
    assert.equal(result.affectedSymbols[0].name, 'parseArgs')
  } finally {
    globalThis.fetch = previousFetch
    if (previousKey === undefined) delete process.env.OPENAI_API_KEY
    else process.env.OPENAI_API_KEY = previousKey
    if (previousMode === undefined) delete process.env.RECOIL_ADVISORY_AGENT
    else process.env.RECOIL_ADVISORY_AGENT = previousMode
  }
})

test('optional advisory agent preserves model endpoint failures', async () => {
  const previousFetch = globalThis.fetch
  const previousKey = process.env.OPENAI_API_KEY
  const previousMode = process.env.RECOIL_ADVISORY_AGENT
  process.env.OPENAI_API_KEY = 'test-key'
  process.env.RECOIL_ADVISORY_AGENT = 'on'
  globalThis.fetch = async () => { throw new Error('fetch failed', { cause: { code: 'ENOTFOUND' } }) }
  try {
    const result = await resolveAdvisoryScope({
      advisory: { id: 'GHSA-test', summary: 'parser issue', details: 'details', references: [] },
      repositories: [{ repository: 'example/app', manifest: { codeGraph: { symbols: [{ name: 'parseArgs', path: 'src/cli.js', line: 2 }] } } }],
    })
    assert.equal(result.status, 'failed')
    assert.match(result.error, /api\.openai\.com.*ENOTFOUND/)
  } finally {
    globalThis.fetch = previousFetch
    if (previousKey === undefined) delete process.env.OPENAI_API_KEY
    else process.env.OPENAI_API_KEY = previousKey
    if (previousMode === undefined) delete process.env.RECOIL_ADVISORY_AGENT
    else process.env.RECOIL_ADVISORY_AGENT = previousMode
  }
})
