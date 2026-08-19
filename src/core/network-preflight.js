function failureDetail(error) {
  const code = error?.cause?.code || error?.code
  return `${code ? `${code} · ` : ''}${error.message}`
}

/**
 * Probe only the services required for a live strict recording. A response
 * with any HTTP status proves transport reachability; authentication and
 * schema failures remain the responsibility of the collector/adapter.
 */
export async function recordingNetworkFailures({
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
  const failures = []
  for (const [label, url, headers] of probes) {
    try {
      await fetchImpl(url, { headers, signal: AbortSignal.timeout(timeoutMs) })
    } catch (error) {
      failures.push(`${label} ${failureDetail(error)}`)
    }
  }
  return failures
}
