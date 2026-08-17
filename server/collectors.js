const DEFAULT_PACKAGE = 'ua-parser-js'
const DEFAULT_ADVISORY = 'CVE-2021-4229'
const KNOWN_AFFECTED_VERSIONS = ['0.7.29', '0.8.0', '1.0.0']

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

function inferTarget(query = '') {
  const text = String(query)
  const advisoryId = text.match(/\b(?:CVE-\d{4}-\d+|GHSA-[a-z0-9-]+)\b/i)?.[0]?.toUpperCase() || null
  const packageCandidates = [...text.matchAll(/(?:npm:)?(@[a-z0-9._-]+\/[a-z0-9._-]+|[a-z0-9][a-z0-9._-]+)(?:@(\d+\.\d+\.\d+))?/gi)]
  const packageMatch = packageCandidates.find((match) => {
    const value = match[1].toLowerCase()
    return !value.startsWith('cve-') && !value.startsWith('ghsa-') && !['fixture', 'storefront-api', 'package', 'npm'].includes(value)
  })
  return {
    packageName: packageMatch?.[1] || DEFAULT_PACKAGE,
    version: packageMatch?.[2] || null,
    advisoryId,
    inferred: Boolean(packageMatch),
  }
}

async function collectRegistry(packageName) {
  const payload = await readJson(`https://registry.npmjs.org/${encodeURIComponent(packageName)}`)
  const versions = Object.keys(payload.versions || {})
  return {
    collector: 'registry-resolver',
    status: 'completed',
    sourceUrl: `https://registry.npmjs.org/${packageName}`,
    entities: versions.length,
    package: payload.name,
    latest: payload['dist-tags']?.latest,
    affectedVersions: packageName === DEFAULT_PACKAGE ? KNOWN_AFFECTED_VERSIONS : [],
    fixedVersions: packageName === DEFAULT_PACKAGE
      ? ['0.7.30', '0.8.1', '1.0.1'].filter((version) => versions.includes(version))
      : [],
    maintainers: (payload.maintainers || []).map((maintainer) => maintainer.name),
    observedAt: new Date().toISOString(),
  }
}

async function collectAdvisories(packageName, advisoryId) {
  const payload = await readJson('https://api.osv.dev/v1/query', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ package: { ecosystem: 'npm', name: packageName } }),
  })
  const vulnerabilities = payload.vulns || []
  const normalizedAdvisory = advisoryId?.toUpperCase()
  const targetAdvisory = vulnerabilities.find((vulnerability) => {
    if (!normalizedAdvisory) return false
    return vulnerability.id?.toUpperCase() === normalizedAdvisory
      || (vulnerability.aliases || []).some((alias) => alias.toUpperCase() === normalizedAdvisory)
      || (vulnerability.references || []).some((reference) => reference.url?.toUpperCase().includes(normalizedAdvisory))
  }) || null
  return {
    collector: 'advisory-resolver',
    status: 'completed',
    sourceUrl: 'https://api.osv.dev/v1/query',
    entities: vulnerabilities.length,
    targetAdvisory,
    vulnerabilities: vulnerabilities.map((vulnerability) => ({
      id: vulnerability.id,
      aliases: vulnerability.aliases,
      summary: vulnerability.summary,
      published: vulnerability.published,
      modified: vulnerability.modified,
      references: (vulnerability.references || []).slice(0, 8),
    })),
    observedAt: new Date().toISOString(),
  }
}

async function collectIncidentSources(packageName) {
  const sources = packageName === DEFAULT_PACKAGE
    ? incidentSources
    : [
        { label: 'npm package page', url: `https://www.npmjs.com/package/${encodeURIComponent(packageName)}` },
        { label: 'OSV package query', url: `https://osv.dev/list?q=${encodeURIComponent(packageName)}` },
      ]
  const results = await Promise.all(sources.map(async (source) => {
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

function collectRepositoryFixture(packageName, version) {
  const dependencyRange = version ? `^${version}` : packageName === DEFAULT_PACKAGE ? '^0.7.28' : '*'
  const resolvedVersion = version || (packageName === DEFAULT_PACKAGE ? '0.7.29' : 'registry-latest')
  return {
    collector: 'repository-extractor',
    status: 'completed',
    sourceUrl: 'fixture://storefront-api/package-lock.json',
    entities: 1,
    repository: 'fixture/storefront-api',
    synthetic: true,
    manifest: {
      dependencies: { [packageName]: dependencyRange },
      resolved: { [packageName]: resolvedVersion },
      deploymentEvents: [
        { service: 'storefront-web', region: 'us-east-1', deployedAt: '2021-10-22T14:10:00Z' },
        { service: 'checkout-worker', region: 'eu-west-1', deployedAt: '2021-10-22T15:40:00Z' },
      ],
    },
    observedAt: new Date().toISOString(),
  }
}

export async function runIngestion({ query = `${DEFAULT_ADVISORY} / fixture/storefront-api`, scenarioId = '0017' } = {}) {
  const target = inferTarget(query)
  const packageName = target.packageName
  const collectors = []
  const run = async (name, fn) => {
    try {
      collectors.push(await fn())
    } catch (error) {
      collectors.push({ collector: name, status: 'failed', error: error.message, observedAt: new Date().toISOString() })
    }
  }

  await run('registry-resolver', () => collectRegistry(packageName))
  await run('advisory-resolver', () => collectAdvisories(packageName, target.advisoryId))
  await run('incident-researcher', () => collectIncidentSources(packageName))
  collectors.push(collectRepositoryFixture(packageName, target.version))

  return {
    status: collectors.some((collector) => collector.status === 'failed') ? 'partial' : 'completed',
    query,
    scenarioId,
    package: packageName,
    target,
    collectors,
    completedAt: new Date().toISOString(),
  }
}
