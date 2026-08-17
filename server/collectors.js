const DEFAULT_PACKAGE = 'ua-parser-js'
const DEFAULT_ADVISORY = 'CVE-2021-4229'
const KNOWN_AFFECTED_VERSIONS = ['0.7.29', '0.8.0', '1.0.0']

const incidentSources = [
  { label: 'CERT-EU advisory', url: 'https://cert.europa.eu/publications/security-advisories/2021-057/' },
  { label: 'Mandiant analysis', url: 'https://cloud.google.com/blog/topics/threat-intelligence/supply-chain-node-js/' },
  { label: 'GitHub incident thread', url: 'https://github.com/faisalman/ua-parser-js/issues/536' },
]

async function readJson(url, options) {
  const response = await fetch(url, { ...options, headers: { accept: 'application/json', 'user-agent': 'Recoil-HackHydra/0.1', ...(options?.headers || {}) } })
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`)
  return response.json()
}

async function readOptionalJson(url, options) {
  const response = await fetch(url, { ...options, headers: { accept: 'application/json', 'user-agent': 'Recoil-HackHydra/0.1', ...(options?.headers || {}) } })
  if (response.status === 404) return null
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`)
  return response.json()
}

function parseGitHubRepository(query = '') {
  const match = String(query).match(/(?:https?:\/\/)?(?:www\.)?github\.com\/([^/\s]+)\/([^/#?\s]+)/i)
  if (!match) return null
  const owner = match[1]
  const name = match[2].replace(/\.git$/, '')
  return { owner, name, slug: `${owner}/${name}`, url: `https://github.com/${owner}/${name}` }
}

async function readGitHubFile(repository, path) {
  const payload = await readOptionalJson(`https://api.github.com/repos/${repository.owner}/${repository.name}/contents/${path}`, {
    headers: { accept: 'application/vnd.github+json' },
  })
  if (!payload || payload.type !== 'file' || !payload.content) return null
  return {
    path,
    sourceUrl: `https://github.com/${repository.slug}/blob/HEAD/${path}`,
    text: Buffer.from(payload.content.replace(/\s/g, ''), 'base64').toString('utf8'),
  }
}

function packageDependencies(packageJson) {
  return {
    ...(packageJson.dependencies || {}),
    ...(packageJson.optionalDependencies || {}),
  }
}

function resolveFromLockfile(lockfile, packageName) {
  if (!lockfile || !packageName) return null
  const packageEntry = lockfile.packages?.[`node_modules/${packageName}`]
  if (packageEntry?.version) return packageEntry.version
  const legacyEntry = lockfile.dependencies?.[packageName]
  return legacyEntry?.version || null
}

async function collectRepository(repository, requestedPackage) {
  const packageFile = await readGitHubFile(repository, 'package.json')
  if (!packageFile) throw new Error(`package.json not found in ${repository.slug}`)
  const packageJson = JSON.parse(packageFile.text)
  const dependencies = packageDependencies(packageJson)
  const inferredPackage = requestedPackage || Object.keys(dependencies)[0] || null
  const lockFile = await readGitHubFile(repository, 'package-lock.json')
    || await readGitHubFile(repository, 'npm-shrinkwrap.json')
  const lockfile = lockFile ? JSON.parse(lockFile.text) : null
  const resolvedVersion = resolveFromLockfile(lockfile, inferredPackage)
  const lockPackages = Object.entries(lockfile?.packages || {})
    .filter(([path, entry]) => path.startsWith('node_modules/') && entry?.version)
    .slice(0, 120)
    .map(([path, entry]) => ({ name: path.replace(/^node_modules\//, ''), version: entry.version, resolved: entry.resolved }))
  return {
    collector: 'repository-extractor',
    status: 'completed',
    sourceUrl: packageFile.sourceUrl,
    entities: Object.keys(dependencies).length + lockPackages.length,
    repository: repository.slug,
    repositoryUrl: repository.url,
    synthetic: false,
    inferredPackage,
    manifest: {
      name: packageJson.name || repository.name,
      version: packageJson.version || null,
      dependencies,
      resolved: inferredPackage ? { [inferredPackage]: resolvedVersion || 'range-only' } : {},
      lockfile: lockFile?.path || null,
      lockPackages,
    },
    observedAt: new Date().toISOString(),
  }
}

function inferTarget(query = '') {
  const text = String(query)
  const repository = parseGitHubRepository(text)
  const advisoryId = text.match(/\b(?:CVE-\d{4}-\d+|GHSA-[a-z0-9-]+)\b/i)?.[0]?.toUpperCase() || null
  const packageCandidates = [...text.replace(/(?:https?:\/\/)?(?:www\.)?github\.com\/[^/\s]+\/[^/#?\s]+/gi, '').matchAll(/(?:npm:)?(@[a-z0-9._-]+\/[a-z0-9._-]+|[a-z0-9][a-z0-9._-]+)(?:@(\d+\.\d+\.\d+))?/gi)]
  const packageMatch = packageCandidates.find((match) => {
    const value = match[1].toLowerCase()
    return !value.startsWith('cve-') && !value.startsWith('ghsa-') && !['fixture', 'storefront-api', 'package', 'npm'].includes(value)
  })
  return {
    packageName: packageMatch?.[1] || null,
    version: packageMatch?.[2] || null,
    advisoryId,
    inferred: Boolean(packageMatch),
    repository,
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
  const collectors = []
  const run = async (name, fn) => {
    try {
      collectors.push(await fn())
    } catch (error) {
      collectors.push({ collector: name, status: 'failed', error: error.message, observedAt: new Date().toISOString() })
    }
  }

  let packageName = target.packageName
  if (!packageName && target.repository) {
    await run('repository-extractor', async () => {
      const result = await collectRepository(target.repository, null)
      packageName = result.inferredPackage || DEFAULT_PACKAGE
      return result
    })
  }
  packageName = packageName || DEFAULT_PACKAGE
  await run('registry-resolver', () => collectRegistry(packageName))
  await run('advisory-resolver', () => collectAdvisories(packageName, target.advisoryId))
  await run('incident-researcher', () => collectIncidentSources(packageName))
  if (!collectors.some((collector) => collector.collector === 'repository-extractor' && collector.status === 'completed')) {
    if (target.repository) await run('repository-extractor', () => collectRepository(target.repository, packageName))
    else collectors.push(collectRepositoryFixture(packageName, target.version))
  }

  return {
    status: collectors.some((collector) => collector.status === 'failed') ? 'partial' : 'completed',
    query,
    scenarioId,
    package: packageName,
    target: { ...target, packageName, inferred: target.inferred || !target.packageName },
    collectors,
    completedAt: new Date().toISOString(),
  }
}
