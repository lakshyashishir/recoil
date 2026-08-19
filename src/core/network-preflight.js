function failureDetail(error) {
  const code = error?.cause?.code || error?.code
  return `${code ? `${code} · ` : ''}${error.message}`
}

/**
 * Probe only the services required for a live strict recording. A response
 * with any HTTP status proves transport reachability; authentication and
 * schema failures remain the responsibility of the collector/adapter.
 */
export async function recordingNetworkProbe({
  hydraApiBase = 'https://api.hydradb.com',
  githubToken = process.env.GITHUB_TOKEN,
  fetchImpl = globalThis.fetch,
  timeoutMs = 3500,
} = {}) {
  const probes = [
    ['osv', 'https://api.osv.dev', {}],
    ['github', 'https://api.github.com/rate_limit', { accept: 'application/vnd.github+json', ...(githubToken ? { authorization: `Bearer ${githubToken}` } : {}) }],
    ['hydradb', `${hydraApiBase.replace(/\/$/, '')}/health`, { 'API-Version': '2' }],
  ]
  const results = []
  for (const [label, url, headers] of probes) {
    try {
      const response = await fetchImpl(url, { headers, signal: AbortSignal.timeout(timeoutMs) })
      results.push({ label, url, ok: true, detail: `reachable · HTTP ${response.status}` })
    } catch (error) {
      results.push({ label, url, ok: false, detail: failureDetail(error) })
    }
  }
  return results
}

export async function recordingNetworkFailures(options = {}) {
  const results = await recordingNetworkProbe(options)
  return results.filter((result) => !result.ok).map((result) => `${result.label} ${result.detail}`)
}
