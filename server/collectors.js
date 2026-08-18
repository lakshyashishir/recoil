const DEFAULT_PACKAGE = 'ua-parser-js'
const DEFAULT_ADVISORY = 'CVE-2021-4229'
const KNOWN_AFFECTED_VERSIONS = ['0.7.29', '0.8.0', '1.0.0']

import { buildChangeImpact, buildCodeGraph, enrichImpactCandidates, parseCodeowners } from '../src/core/codegraph.js'

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
  try {
    const payload = await readOptionalJson(`https://api.github.com/repos/${repository.owner}/${repository.name}/contents/${path}`, {
      headers: { accept: 'application/vnd.github+json' },
    })
    if (payload?.type === 'file' && payload.content) {
      return {
        path,
        sourceUrl: `https://github.com/${repository.slug}/blob/HEAD/${path}`,
        text: Buffer.from(payload.content.replace(/\s/g, ''), 'base64').toString('utf8'),
      }
    }
    if (payload) return null
  } catch (error) {
    if (!error.message.includes('403')) throw error
  }

  const rawResponse = await fetch(`https://raw.githubusercontent.com/${repository.slug}/HEAD/${path}`, { headers: { 'user-agent': 'Recoil-HackHydra/0.1' } })
  if (rawResponse.status === 404) return null
  if (!rawResponse.ok) throw new Error(`${rawResponse.status} ${rawResponse.statusText}`)
  return { path, sourceUrl: `https://raw.githubusercontent.com/${repository.slug}/HEAD/${path}`, text: await rawResponse.text() }
}

async function readGitHubDirectory(repository, path) {
  try {
    const payload = await readOptionalJson(`https://api.github.com/repos/${repository.owner}/${repository.name}/contents/${path}`, {
      headers: { accept: 'application/vnd.github+json' },
    })
    if (Array.isArray(payload)) return payload.filter((entry) => entry.type === 'file').slice(0, 12)
    if (payload) return []
  } catch (error) {
    if (!error.message.includes('403')) throw error
  }
  const commonWorkflowNames = ['ci.yml', 'codeql.yml', 'legacy.yml', 'scorecard.yml', 'release.yml', 'deploy.yml', 'test.yml']
  return commonWorkflowNames.map((name) => ({ name, type: 'file' }))
}

async function readGitHubTree(repository) {
  const payload = await readOptionalJson(`https://api.github.com/repos/${repository.owner}/${repository.name}/git/trees/HEAD?recursive=1`, {
    headers: { accept: 'application/vnd.github+json' },
  })
  return Array.isArray(payload?.tree) ? payload.tree.filter((entry) => entry.type === 'blob').map((entry) => entry.path) : []
}

async function collectSourceFiles(repository) {
  let paths = []
  try {
    paths = await readGitHubTree(repository)
  } catch {
    paths = []
  }
  const candidates = paths
    .filter((path) => /^(?:src|lib|app|packages|crates)\//.test(path) || /^(?:index|main|lib)\.(?:js|ts|rs)$/.test(path))
    .filter((path) => /\.(?:js|jsx|mjs|cjs|ts|tsx|rs)$/.test(path))
    .filter((path) => !/(?:node_modules|target|dist|build|vendor)\//.test(path))
    .slice(0, 24)
  const files = await Promise.all(candidates.map(async (path) => {
    try {
      return await readGitHubFile(repository, path)
    } catch {
      return null
    }
  }))
  return files.filter(Boolean)
}

async function collectLatestChange(repository, codeGraph) {
  if (!codeGraph?.files?.length) return null
  try {
    const commits = await readOptionalJson(`https://api.github.com/repos/${repository.owner}/${repository.name}/commits?per_page=1`, {
      headers: { accept: 'application/vnd.github+json' },
    })
    const sha = Array.isArray(commits) ? commits[0]?.sha : null
    if (!sha) return null
    const commit = await readOptionalJson(`https://api.github.com/repos/${repository.owner}/${repository.name}/commits/${encodeURIComponent(sha)}`, {
      headers: { accept: 'application/vnd.github+json' },
    })
    return buildChangeImpact(codeGraph, commit)
  } catch {
    return null
  }
}

async function collectCodeowners(repository) {
  for (const path of ['.github/CODEOWNERS', 'CODEOWNERS', 'docs/CODEOWNERS']) {
    try {
      const file = await readGitHubFile(repository, path)
      if (file) return file
    } catch {
      // Ownership is optional evidence; a transient GitHub failure must not hide the repository graph.
    }
  }
  return null
}

function packageDependencies(packageJson) {
  return {
    ...(packageJson.dependencies || {}),
    ...(packageJson.optionalDependencies || {}),
  }
}

function parseTomlValue(value) {
  const trimmed = value.trim().replace(/\s+#.*$/, '')
  if (trimmed.startsWith('"') && trimmed.endsWith('"')) return trimmed.slice(1, -1)
  if (trimmed.startsWith("'") && trimmed.endsWith("'")) return trimmed.slice(1, -1)
  const version = trimmed.match(/\bversion\s*=\s*["']([^"']+)["']/)?.[1]
  return version || trimmed
}

function parseCargoManifest(text) {
  let section = ''
  const packageInfo = {}
  const dependencies = {}
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue
    const sectionMatch = line.match(/^\[([^\]]+)\]$/)
    if (sectionMatch) {
      section = sectionMatch[1]
      continue
    }
    const assignment = line.match(/^([A-Za-z0-9_.-]+)\s*=\s*(.+)$/)
    if (!assignment) continue
    const [, key, value] = assignment
    if (section === 'package' && ['name', 'version'].includes(key)) packageInfo[key] = parseTomlValue(value)
    if (section === 'dependencies' || section === 'workspace.dependencies' || section.startsWith('target.') && section.endsWith('.dependencies')) {
      dependencies[key] = parseTomlValue(value)
    }
  }
  return { ...packageInfo, dependencies }
}

function parseCargoLock(text) {
  return text.split(/\[\[package\]\]/).slice(1).map((block) => {
    const name = block.match(/^\s*name\s*=\s*["']([^"']+)["']/m)?.[1]
    const version = block.match(/^\s*version\s*=\s*["']([^"']+)["']/m)?.[1]
    const dependenciesBlock = block.match(/^\s*dependencies\s*=\s*\[([\s\S]*?)\]/m)?.[1] || ''
    const dependencies = [...dependenciesBlock.matchAll(/["']([^"']+)["']/g)]
      .map((match) => match[1].split(' ').at(0))
      .filter(Boolean)
    return name && version ? { name, version, dependencies: [...new Set(dependencies)].slice(0, 8) } : null
  }).filter(Boolean).slice(0, 160)
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
  const cargoManifestFile = packageFile ? null : await readGitHubFile(repository, 'Cargo.toml')
  if (!packageFile && !cargoManifestFile) throw new Error(`package.json or Cargo.toml not found in ${repository.slug}`)
  const ecosystem = cargoManifestFile ? 'cargo' : 'npm'
  const packageJson = packageFile ? JSON.parse(packageFile.text) : null
  const cargoManifest = cargoManifestFile ? parseCargoManifest(cargoManifestFile.text) : null
  const dependencies = packageJson ? packageDependencies(packageJson) : cargoManifest.dependencies
  const inferredPackage = requestedPackage || packageJson?.name || cargoManifest?.name || (cargoManifest ? repository.name : Object.keys(dependencies)[0]) || null
  const lockFile = cargoManifestFile
    ? await readGitHubFile(repository, 'Cargo.lock')
    : await readGitHubFile(repository, 'package-lock.json') || await readGitHubFile(repository, 'npm-shrinkwrap.json')
  const lockfile = lockFile && ecosystem === 'npm' ? JSON.parse(lockFile.text) : null
  const lockPackages = ecosystem === 'cargo'
    ? (lockFile ? parseCargoLock(lockFile.text) : [])
    : Object.entries(lockfile?.packages || {})
      .filter(([path, entry]) => path.startsWith('node_modules/') && entry?.version)
      .slice(0, 120)
      .map(([path, entry]) => ({
        name: path.replace(/^node_modules\//, ''),
        version: entry.version,
        resolved: entry.resolved,
        dependencies: Object.keys(entry.dependencies || {}).slice(0, 8),
      }))
  const workflowEntries = await readGitHubDirectory(repository, '.github/workflows')
  const workflowFiles = (await Promise.all(workflowEntries.map((entry) => readGitHubFile(repository, `.github/workflows/${entry.name}`)))).filter(Boolean)
  const containerFiles = (await Promise.all(['Dockerfile', 'docker-compose.yml', 'compose.yml'].map((path) => readGitHubFile(repository, path)))).filter(Boolean)
  const sourceFiles = await collectSourceFiles(repository)
  const codeownersFile = await collectCodeowners(repository)
  let codeGraph = buildCodeGraph(sourceFiles)
  codeGraph.recentChange = await collectLatestChange(repository, codeGraph)
  codeGraph = enrichImpactCandidates(codeGraph, parseCodeowners(codeownersFile?.text || ''))
  const workflowText = workflowFiles.map((file) => file.text).join('\n')
  const ciSignals = {
    workflowFiles: workflowFiles.map((file) => file.path),
    runners: [...new Set([...workflowText.matchAll(/runs-on:\s*([^\s#]+)/g)].map((match) => match[1].includes('${{') ? 'matrix' : match[1]))],
    deployHints: [...new Set(workflowText.split('\n').filter((line) => !line.trim().startsWith('#') && /\b(deploy|publish|release|production|staging)\b/i.test(line)).map((line) => line.trim()).filter(Boolean).slice(0, 12))],
  }
  const deploymentSignals = containerFiles.map((file) => ({ path: file.path, kind: file.path.toLowerCase().includes('compose') ? 'compose' : 'container' }))
  const resolvedVersion = ecosystem === 'cargo'
    ? lockPackages.find((item) => item.name === inferredPackage)?.version || null
    : resolveFromLockfile(lockfile, inferredPackage)
  return {
    collector: 'repository-extractor',
    status: 'completed',
    ecosystem,
    sourceUrl: (packageFile || cargoManifestFile).sourceUrl,
    entities: Object.keys(dependencies).length + lockPackages.length + workflowFiles.length + containerFiles.length + codeGraph.fileCount + codeGraph.importEdgeCount + codeGraph.symbolCount + (codeGraph.recentChange?.sampledFilesChanged || 0),
    repository: repository.slug,
    repositoryUrl: repository.url,
    synthetic: false,
    inferredPackage,
    manifest: {
      name: packageJson?.name || cargoManifest?.name || repository.name,
      version: packageJson?.version || cargoManifest?.version || null,
      dependencies,
      resolved: inferredPackage ? { [inferredPackage]: resolvedVersion || 'range-only' } : {},
      lockfile: lockFile?.path || null,
      lockPackages,
      ciSignals,
      deploymentSignals,
      codeGraph,
    },
    sources: [packageFile || cargoManifestFile, lockFile, ...workflowFiles, ...containerFiles, ...sourceFiles, codeownersFile, codeGraph.recentChange?.sourceUrl ? { path: `commit:${codeGraph.recentChange.sha}`, sourceUrl: codeGraph.recentChange.sourceUrl } : null].filter(Boolean).map((file) => ({ path: file.path, url: file.sourceUrl })),
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

async function collectRegistry(packageName, ecosystem = 'npm') {
  if (ecosystem === 'cargo') {
    const sourceUrl = `https://crates.io/api/v1/crates/${encodeURIComponent(packageName)}`
    const payload = await readOptionalJson(sourceUrl)
    if (!payload) {
      return {
        collector: 'registry-resolver',
        status: 'not_found',
        ecosystem,
        sourceUrl,
        entities: 0,
        package: packageName,
        latest: null,
        affectedVersions: [],
        fixedVersions: [],
        maintainers: [],
        note: 'No published crate was found; repository evidence remains the primary package source.',
        observedAt: new Date().toISOString(),
      }
    }
    const crate = payload.crate || {}
    const versions = payload.versions || []
    return {
      collector: 'registry-resolver',
      status: 'completed',
      ecosystem,
      sourceUrl,
      entities: versions.length,
      package: crate.name || packageName,
      latest: crate.max_version || versions.find((version) => version.yanked === false)?.num || null,
      affectedVersions: [],
      fixedVersions: [],
      maintainers: [],
      observedAt: new Date().toISOString(),
    }
  }
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

async function collectAdvisories(packageName, advisoryId, ecosystem = 'npm') {
  const payload = await readJson('https://api.osv.dev/v1/query', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ package: { ecosystem: ecosystem === 'cargo' ? 'crates.io' : 'npm', name: packageName } }),
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

async function collectIncidentSources(packageName, ecosystem = 'npm') {
  const sources = packageName === DEFAULT_PACKAGE
    ? incidentSources
    : ecosystem === 'cargo'
      ? [
          { label: 'crates.io package page', url: `https://crates.io/crates/${encodeURIComponent(packageName)}` },
          { label: 'OSV package query', url: `https://osv.dev/list?q=${encodeURIComponent(packageName)}` },
        ]
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
  let ecosystem = 'npm'
  if (!packageName && target.repository) {
    await run('repository-extractor', async () => {
      const result = await collectRepository(target.repository, null)
      packageName = result.inferredPackage || DEFAULT_PACKAGE
      ecosystem = result.ecosystem || ecosystem
      return result
    })
  }
  packageName = packageName || DEFAULT_PACKAGE
  const completedRepository = collectors.find((collector) => collector.collector === 'repository-extractor' && collector.status === 'completed')
  ecosystem = completedRepository?.ecosystem || ecosystem
  await run('registry-resolver', () => collectRegistry(packageName, ecosystem))
  await run('advisory-resolver', () => collectAdvisories(packageName, target.advisoryId, ecosystem))
  await run('incident-researcher', () => collectIncidentSources(packageName, ecosystem))
  if (!collectors.some((collector) => collector.collector === 'repository-extractor')) {
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

export { inferTarget, parseCargoLock, parseCargoManifest }
