import test from 'node:test'
import assert from 'node:assert/strict'
import { recordingNetworkFailures } from '../src/core/network-preflight.js'

test('recording network preflight accepts reachable services regardless of HTTP status', async () => {
  const urls = []
  const failures = await recordingNetworkFailures({
    hydraApiBase: 'https://hydra.example.test/',
    fetchImpl: async (url) => {
      urls.push(url)
      return { status: 401 }
    },
  })
  assert.deepEqual(failures, [])
  assert.deepEqual(urls, [
    'https://api.osv.dev',
    'https://api.github.com/rate_limit',
    'https://hydra.example.test/health',
  ])
})

test('recording network preflight preserves service labels and transport errors', async () => {
  const failures = await recordingNetworkFailures({
    fetchImpl: async (url) => {
      const error = new Error(`fetch failed for ${url}`)
      error.cause = { code: 'ENOTFOUND' }
      throw error
    },
  })
  assert.deepEqual(failures, [
    'osv ENOTFOUND · fetch failed for https://api.osv.dev',
    'github ENOTFOUND · fetch failed for https://api.github.com/rate_limit',
    'hydradb ENOTFOUND · fetch failed for https://api.hydradb.com/health',
  ])
})
