const PACKAGE_NAME = 'ua-parser-js'

const incidentSources = [
  { label: 'CERT-EU advisory', url: 'https://cert.europa.eu/publications/security-advisories/2021-057/' },
  { label: 'Mandiant analysis', url: 'https://cloud.google.com/blog/topics/threat-intelligence/supply-chain-node-js/' },
  { label: 'GitHub incident thread', url: 'https://github.com/faisalman/ua-parser-js/issues/536' },
]

async function readJson(url, options) {
  const response = await fetch(url, { ...options, headers: { accept: 'application/json', ...(options?.headers || {}) } })
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`)
  return response.json()
}

async function collectRegistry() {
  const payload = await readJson(`https://registry.npmjs.org/${PACKAGE_NAME}`)
  const versions = Object.keys(payload.versions || {})
  return {
    collector: 'registry-resolver',
    status: 'completed',
    sourceUrl: `https://registry.npmjs.org/${PACKAGE_NAME}`,
    entities: versions.length,
    package: payload.name,
    latest: payload['dist-tags']?.latest,
    affectedVersions: versions.filter((version) => ['0.7.29', '0.8.0', '1.0.0'].includes(version)),
    fixedVersions: ['0.7.30', '0.8.1', '1.0.1'].filter((version) => versions.includes(version)),
    maintainers: (payload.maintainers || []).map((maintainer) => maintainer.name),
    observedAt: new Date().toISOString(),
  }
}

async function collectAdvisories() {
  const payload = await readJson('https://api.osv.dev/v1/query', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ package: { ecosystem: 'npm', name: PACKAGE_NAME } }),
  })
  const vulnerabilities = payload.vulns || []
  return {
    collector: 'advisory-resolver',
    status: 'completed',
    sourceUrl: 'https://api.osv.dev/v1/query',
    entities: vulnerabilities.length,
    vulnerabilities: vulnerabilities.map((vulnerability) => ({
      id: vulnerability.id,
      summary: vulnerability.summary,
      published: vulnerability.published,
      modified: vulnerability.modified,
      references: (vulnerability.references || []).slice(0, 8),
    })),
    observedAt: new Date().toISOString(),
  }
}

async function collectIncidentSources() {
  const results = await Promise.all(incidentSources.map(async (source) => {
    try {
      const response = await fetch(source.url, { headers: { 'user-agent': 'Recoil-HackHydra/0.1' } })
      const html = await response.text()
      const title = html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]?.trim() || source.label
      return { ...source, status: response.ok ? 'reachable' : `http-${response.status}`, title }
    } catch (error) {
      return { ...source, status: 'unreachable', error: error.message }
    }
  }))
  return {
    collector: 'incident-researcher',
    status: 'completed',
    entities: results.length,
    sources: results,
    observedAt: new Date().toISOString(),
  }
}

function collectRepositoryFixture() {
  return {
    collector: 'repository-extractor',
    status: 'completed',
    sourceUrl: 'fixture://storefront-api/package-lock.json',
    entities: 1,
    repository: 'fixture/storefront-api',
    synthetic: true,
    manifest: {
      dependencies: { 'ua-parser-js': '^0.7.28' },
      resolved: { 'ua-parser-js': '0.7.29' },
      deploymentEvents: [
        { service: 'storefront-web', region: 'us-east-1', deployedAt: '2021-10-22T14:10:00Z' },
        { service: 'checkout-worker', region: 'eu-west-1', deployedAt: '2021-10-22T15:40:00Z' },
      ],
    },
    observedAt: new Date().toISOString(),
  }
}

export async function runIngestion() {
  const collectors = []
  const run = async (name, fn) => {
    try {
      collectors.push(await fn())
    } catch (error) {
      collectors.push({ collector: name, status: 'failed', error: error.message, observedAt: new Date().toISOString() })
    }
  }

  await run('registry-resolver', collectRegistry)
  await run('advisory-resolver', collectAdvisories)
  await run('incident-researcher', collectIncidentSources)
  collectors.push(collectRepositoryFixture())

  return {
    status: collectors.some((collector) => collector.status === 'failed') ? 'partial' : 'completed',
    package: PACKAGE_NAME,
    collectors,
    completedAt: new Date().toISOString(),
  }
}
