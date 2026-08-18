const DEFAULT_PACKAGE = 'ua-parser-js'
const KNOWN_AFFECTED_VERSIONS = ['0.7.29', '0.8.0', '1.0.0']

import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { buildChangeImpact, buildCodeGraph, enrichImpactCandidates, parseCodeowners } from '../src/core/codegraph.js'
import { buildObservedGraph, classifyRepository, fixedVersionsFromAdvisory } from '../src/core/evidence.js'

const incidentSources = [
  { label: 'CERT-EU advisory', url: 'https://cert.europa.eu/publications/security-advisories/2021-057/' },
  { label: 'Mandiant analysis', url: 'https://cloud.google.com/blog/topics/threat-intelligence/supply-chain-node-js/' },
  { label: 'GitHub incident thread', url: 'https://github.com/faisalman/ua-parser-js/issues/536' },
]

async function readJson(url, options) {
  const cached = readCache(url, options)
  if (cached !== null) return cached
  let response
  try {
    response = await fetchWithNetworkRetry(url, { ...options, headers: { accept: 'application/json', 'user-agent': 'Recoil-HackHydra/0.1', ...githubHeaders(), ...(options?.headers || {}) } })
  } catch (error) {
    throw networkError(url, error)
  }
  if (!response.ok) throw httpError(response, url)
  const payload = await response.json()
  writeCache(url, options, payload)
  return payload
}

async function readOptionalJson(url, options) {
  const cached = readCache(url, options)
  if (cached !== null) return cached
  let response
  try {
    response = await fetchWithNetworkRetry(url, { ...options, headers: { accept: 'application/json', 'user-agent': 'Recoil-HackHydra/0.1', ...githubHeaders(), ...(options?.headers || {}) } })
  } catch (error) {
    throw networkError(url, error)
  }
  if (response.status === 404) return null
  if (!response.ok) throw httpError(response, url)
  const payload = await response.json()
  writeCache(url, options, payload)
  return payload
}

function githubHeaders() {
  return process.env.GITHUB_TOKEN ? { authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {}
}

function networkError(url, error) {
  const code = error?.cause?.code || error?.code
  return new Error(`Unable to fetch ${url}${code ? ` (${code})` : ''}: ${error.message}`, { cause: error })
}

async function fetchWithNetworkRetry(url, options = {}) {
  const configured = Number.parseInt(process.env.RECOIL_NETWORK_RETRIES || '3', 10)
  const attempts = Number.isFinite(configured) ? Math.min(Math.max(configured, 1), 10) : 3
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await fetch(url, options)
    } catch (error) {
      if (attempt === attempts - 1 || error?.name === 'AbortError') throw error
      await new Promise((resolve) => setTimeout(resolve, 75 * (attempt + 1)))
    }
  }
  throw new Error(`Unable to fetch ${url}`)
}

function httpError(response, url) {
  if (response.status === 403 && response.headers.get('x-ratelimit-remaining') === '0') {
    return new Error(`GitHub API rate limit exhausted while reading ${url}; set GITHUB_TOKEN or retry later`)
  }
  return new Error(`${response.status} ${response.statusText}`)
}

function cachePath(url, options = {}) {
  if (!/^https:\/\/api\.github\.com\//.test(url) || (options?.method && options.method !== 'GET')) return null
  const root = process.env.RECOIL_CACHE_DIR || '.recoil-cache'
  const key = createHash('sha256').update(url).digest('hex')
  return `${root}/${key}.json`
}

function readCache(url, options) {
  const path = cachePath(url, options)
  if (!path || !existsSync(path)) return null
  try {
    const cached = JSON.parse(readFileSync(path, 'utf8'))
    const ttl = Number(process.env.RECOIL_CACHE_TTL_MS || 86400000)
    if (Date.now() - cached.savedAt > ttl) return null
    return cached.payload
  } catch {
    return null
  }
}

function writeCache(url, options, payload) {
  const path = cachePath(url, options)
  if (!path) return
  try {
    mkdirSync(path.slice(0, path.lastIndexOf('/')), { recursive: true })
    writeFileSync(path, JSON.stringify({ savedAt: Date.now(), payload }))
  } catch {
    // Cache failure must never change evidence collection semantics.
  }
}

function parseGitHubRepository(query = '') {
  const match = String(query).match(/(?:https?:\/\/)?(?:www\.)?github\.com\/([^/\s]+)\/([^/#?\s]+)/i)
  if (!match) return null
  const owner = match[1]
  const name = match[2].replace(/\.git$/, '')
  return { owner, name, slug: `${owner}/${name}`, url: `https://github.com/${owner}/${name}` }
}

export function parseGitHubRepositories(query = '') {
  const repositories = []
  const pattern = /(?:https?:\/\/)?(?:www\.)?github\.com\/([^/\s]+)\/([^/#?\s]+)/gi
  for (const match of String(query).matchAll(pattern)) {
    const owner = match[1]
    const name = match[2].replace(/\.git$/, '')
    const repository = { owner, name, slug: `${owner}/${name}`, url: `https://github.com/${owner}/${name}` }
    if (!repositories.some((item) => item.slug.toLowerCase() === repository.slug.toLowerCase())) repositories.push(repository)
  }
  return repositories.slice(0, 4)
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

  const rawUrl = `https://raw.githubusercontent.com/${repository.slug}/HEAD/${path}`
  let rawResponse
  try {
    rawResponse = await fetchWithNetworkRetry(rawUrl, { headers: { 'user-agent': 'Recoil-HackHydra/0.1', ...githubHeaders() } })
  } catch (error) {
    throw networkError(rawUrl, error)
  }
  if (rawResponse.status === 404) return null
  if (!rawResponse.ok) throw httpError(rawResponse, rawUrl)
  return { path, sourceUrl: rawUrl, text: await rawResponse.text() }
}

async function readGitHubDirectory(repository, path) {
  try {
    const payload = await readOptionalJson(`https://api.github.com/repos/${repository.owner}/${repository.name}/contents/${path}`, {
      headers: { accept: 'application/vnd.github+json' },
    })
    if (Array.isArray(payload)) return { entries: payload.filter((entry) => entry.type === 'file').slice(0, 12), status: 'collected' }
    if (payload) return { entries: [], status: 'not_found' }
  } catch (error) {
    if (!error.message.includes('403') && !error.message.includes('rate limit')) throw error
    return { entries: [], status: 'unavailable', error: error.message }
  }
  return { entries: [], status: 'not_found' }
}

async function readGitHubTree(repository) {
  const payload = await readOptionalJson(`https://api.github.com/repos/${repository.owner}/${repository.name}/git/trees/HEAD?recursive=1`, {
    headers: { accept: 'application/vnd.github+json' },
  })
  return Array.isArray(payload?.tree) ? payload.tree.filter((entry) => entry.type === 'blob').map((entry) => entry.path) : []
}

async function readGitHubCommitHistory(repository, path) {
  if (!path) return null
  const base = `https://api.github.com/repos/${repository.owner}/${repository.name}/commits?path=${encodeURIComponent(path)}&per_page=1`
  const readPage = async (page = 1) => {
    const url = `${base}&page=${page}`
    const cached = readCache(url)
    if (cached && Array.isArray(cached.commits)) return cached
    let response
    try {
      response = await fetchWithNetworkRetry(url, { headers: { accept: 'application/vnd.github+json', 'user-agent': 'Recoil-HackHydra/0.1', ...githubHeaders() } })
    } catch (error) {
      throw networkError(url, error)
    }
    if (response.status === 404) return { commits: [], lastPage: 1 }
    if (!response.ok) throw httpError(response, url)
    const commits = await response.json()
    const link = response.headers.get('link') || ''
    const lastPage = Number(link.match(/[?&]page=(\d+)>; rel="last"/)?.[1] || page)
    const result = { commits, lastPage }
    writeCache(url, {}, result)
    return result
  }
  const first = await readPage(1)
  if (!first.commits.length) return null
  const oldestPage = first.lastPage > 1 ? await readPage(first.lastPage) : first
  const newest = first.commits[0]
  const oldest = oldestPage.commits.at(-1) || newest
  return {
    firstCommitAt: oldest.commit?.author?.date || oldest.commit?.committer?.date || null,
    latestCommitAt: newest.commit?.author?.date || newest.commit?.committer?.date || null,
    sourceUrl: oldest.html_url || newest.html_url || null,
  }
}

async function collectSourceFiles(repository) {
  let paths = []
  let status = 'collected'
  let error = null
  try {
    paths = await readGitHubTree(repository)
  } catch (cause) {
    paths = []
    status = 'unavailable'
    error = cause.message
  }
  const candidates = paths
    .filter((path) => /^(?:src|lib|app|packages|crates)\//.test(path) || /^(?:index|main|lib)\.(?:js|ts|rs)$/.test(path))
    .filter((path) => /\.(?:js|jsx|mjs|cjs|ts|tsx|rs)$/.test(path))
    .filter((path) => !/(?:node_modules|target|dist|build|vendor)\//.test(path))
    .slice(0, 24)
  const responses = await Promise.all(candidates.map(async (path) => {
    try {
      return { file: await readGitHubFile(repository, path), error: null }
    } catch (cause) {
      return { file: null, error: cause.message }
    }
  }))
  const failures = responses.map((item) => item.error).filter(Boolean)
  return { files: responses.map((item) => item.file).filter(Boolean), requested: candidates.length, status: failures.length && status === 'collected' ? 'partial' : status, error: error || failures[0] || null }
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
    ...(packageJson.devDependencies || {}),
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

export async function collectRepository(repository, requestedPackage) {
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
  const temporal = lockFile
    ? await readGitHubCommitHistory(repository, lockFile.path).catch((error) => ({ error: error.message, sourceUrl: lockFile.sourceUrl }))
    : null
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
  const workflowResult = await readGitHubDirectory(repository, '.github/workflows')
  const workflowFiles = (await Promise.all(workflowResult.entries.map((entry) => readGitHubFile(repository, `.github/workflows/${entry.name}`)))).filter(Boolean)
  const containerFiles = (await Promise.all(['Dockerfile', 'docker-compose.yml', 'compose.yml'].map((path) => readGitHubFile(repository, path)))).filter(Boolean)
  const sourceResult = await collectSourceFiles(repository)
  const sourceFiles = sourceResult.files
  const codeownersFile = await collectCodeowners(repository)
  let codeGraph = buildCodeGraph(sourceFiles, { inferSurfaces: false })
  codeGraph.recentChange = await collectLatestChange(repository, codeGraph)
  codeGraph = enrichImpactCandidates(codeGraph, parseCodeowners(codeownersFile?.text || ''))
  const workflowText = workflowFiles.map((file) => file.text).join('\n')
  const ciSignals = {
    status: workflowResult.status,
    error: workflowResult.error || null,
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
      collection: {
        sourceFiles: { status: sourceResult.status, error: sourceResult.error, sampled: sourceFiles.length, requested: sourceResult.requested || 0 },
      },
      temporal: {
        pathObservedAt: temporal?.firstCommitAt || null,
        latestPathCommitAt: temporal?.latestCommitAt || null,
        sourceUrl: temporal?.sourceUrl || lockFile?.sourceUrl || null,
        error: temporal?.error || null,
      },
      codeGraph,
    },
    sources: [packageFile || cargoManifestFile, lockFile, ...workflowFiles, ...containerFiles, ...sourceFiles, codeownersFile, codeGraph.recentChange?.sourceUrl ? { path: `commit:${codeGraph.recentChange.sha}`, sourceUrl: codeGraph.recentChange.sourceUrl } : null].filter(Boolean).map((file) => ({ path: file.path, url: file.sourceUrl })),
    observedAt: new Date().toISOString(),
  }
}

function inferTarget(query = '') {
  const text = String(query)
  const repositories = parseGitHubRepositories(text)
  const repository = repositories[0] || parseGitHubRepository(text)
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
    repositories,
  }
}

export function parseInvestigationInput(query = '') {
  const target = inferTarget(query)
  return {
    ...target,
    repositories: target.repositories?.length ? target.repositories : target.repository ? [target.repository] : [],
  }
}

async function collectRegistry(packageName, ecosystem = 'npm', advisory = null) {
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
    fixedVersions: fixedVersionsFromAdvisory(advisory, packageName).filter((version) => versions.includes(version)),
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
      affected: vulnerability.affected || [],
    })),
    observedAt: new Date().toISOString(),
  }
}

async function collectAdvisoryById(advisoryId) {
  if (!advisoryId) return null
  const lookupId = /^GHSA-/i.test(advisoryId) ? advisoryId.toLowerCase() : advisoryId
  const sourceUrl = `https://api.osv.dev/v1/vulns/${encodeURIComponent(lookupId)}`
  try {
    const advisory = await readJson(sourceUrl)
    return { ...advisory, sourceUrl }
  } catch (error) {
    return { id: advisoryId, sourceUrl, error: error.message }
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
      const response = await fetchWithNetworkRetry(source.url, { headers: { 'user-agent': 'Recoil-HackHydra/0.1' } })
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

export async function runIngestion() {
  throw new Error('The legacy ingestion endpoint is retired; use runMultiRepositoryIngestion through /investigate.')
}

function advisoryPackageName(advisory) {
  return advisory?.affected?.find((entry) => entry?.package?.ecosystem === 'npm' || entry?.package?.ecosystem === 'crates.io')?.package?.name || advisory?.affected?.[0]?.package?.name || null
}

function advisoryCollector(advisory, advisoryId) {
  const lookupId = advisoryId && /^GHSA-/i.test(advisoryId) ? advisoryId.toLowerCase() : advisoryId
  if (!advisory) return { collector: 'advisory-resolver', status: advisoryId ? 'failed' : 'not_requested', sourceUrl: advisoryId ? `https://api.osv.dev/v1/vulns/${encodeURIComponent(lookupId)}` : 'https://api.osv.dev', error: advisoryId ? 'Advisory record could not be fetched.' : null, entities: 0, targetAdvisory: null, vulnerabilities: [] }
  if (advisory.error) return { collector: 'advisory-resolver', status: 'failed', sourceUrl: advisory.sourceUrl, error: advisory.error, entities: 0, targetAdvisory: null, vulnerabilities: [] }
  return {
    collector: 'advisory-resolver',
    status: 'completed',
    sourceUrl: advisory.sourceUrl,
    entities: 1,
    targetAdvisory: advisory,
    vulnerabilities: [{ id: advisory.id, aliases: advisory.aliases || [], summary: advisory.summary || '', published: advisory.published || null, modified: advisory.modified || null, references: (advisory.references || []).slice(0, 12), affected: advisory.affected || [] }],
    observedAt: new Date().toISOString(),
  }
}

export async function runMultiRepositoryIngestion({ query = '', scenarioId = '0017', onProgress = () => {} } = {}) {
  const input = parseInvestigationInput(query)
  onProgress({ type: 'step', key: 'public-records', status: 'working', title: 'Reading public records', detail: 'Resolving the advisory and package identity from OSV and the public registry.' })
  let advisory = await collectAdvisoryById(input.advisoryId)
  let packageName = input.packageName || advisoryPackageName(advisory)
  const repositories = input.repositories || []
  onProgress({ type: 'step', key: 'public-records', status: 'complete', title: 'Public records ready', detail: advisory?.id ? `${advisory.id} · ${advisory.published ? `published ${advisory.published.slice(0, 10)}` : 'publication date unavailable'}` : 'No advisory identifier was supplied; repository evidence will be marked accordingly.', sourceUrls: [advisory?.sourceUrl].filter(Boolean) })
  const repositoryResults = await Promise.all(repositories.map(async (repository) => {
    onProgress({ type: 'repository', key: `repository:${repository.slug}`, status: 'working', title: `Reading ${repository.slug}`, detail: 'Reading manifest, lockfile, and bounded source imports. Nothing is installed.', repository: repository.slug })
    try {
      const result = await collectRepository(repository, packageName)
      if (!packageName && result.inferredPackage) packageName = result.inferredPackage
      onProgress({ type: 'repository', key: `repository:${repository.slug}`, status: 'complete', title: `${repository.slug} read`, detail: `${result.manifest?.lockfile || 'no lockfile'} · ${result.manifest?.codeGraph?.fileCount || 0} sampled source files`, repository: repository.slug, sourceUrls: [result.sourceUrl].filter(Boolean) })
      return result
    } catch (error) {
      onProgress({ type: 'repository', key: `repository:${repository.slug}`, status: 'failed', title: `${repository.slug} unavailable`, detail: error.message, repository: repository.slug })
      return {
        collector: 'repository-extractor',
        status: 'failed',
        repository: repository.slug,
        repositoryUrl: repository.url,
        sourceUrl: repository.url,
        synthetic: false,
        error: error.message,
        manifest: null,
        sources: [{ path: 'repository', url: repository.url }],
        observedAt: new Date().toISOString(),
      }
    }
  }))
  packageName = packageName || repositoryResults.find((result) => result.status === 'completed')?.inferredPackage || null
  if (!advisory && packageName) {
    const queried = await collectAdvisories(packageName, input.advisoryId, repositoryResults.find((result) => result.status === 'completed')?.ecosystem || 'npm').catch((error) => ({ collector: 'advisory-resolver', status: 'failed', error: error.message }))
    advisory = queried.targetAdvisory || null
  }
  const ecosystem = repositoryResults.find((result) => result.status === 'completed')?.ecosystem || 'npm'
  const registry = packageName
    ? await collectRegistry(packageName, ecosystem, advisory).catch((error) => ({ collector: 'registry-resolver', status: 'failed', package: packageName, ecosystem, error: error.message, fixedVersions: [], affectedVersions: [], maintainers: [] }))
    : { collector: 'registry-resolver', status: 'not_requested', package: null, ecosystem, fixedVersions: [], affectedVersions: [], maintainers: [] }
  onProgress({ type: 'step', key: 'registry', status: registry.status === 'failed' ? 'failed' : 'complete', title: 'Registry record ready', detail: packageName ? `${packageName} · ${registry.fixedVersions?.length || 0} fixed version${registry.fixedVersions?.length === 1 ? '' : 's'} found` : 'Package identity unavailable.', sourceUrls: [registry.sourceUrl].filter(Boolean) })
  const advisoryRecord = advisoryCollector(advisory, input.advisoryId)
  const findings = repositoryResults.map((repository) => repository.status === 'completed'
    ? classifyRepository({ repository, packageName, advisory, advisoryId: input.advisoryId || advisory?.id })
    : {
        repository: repository.repository,
        repositoryUrl: repository.repositoryUrl,
        packageName,
        advisoryId: input.advisoryId || advisory?.id || 'advisory',
        verdict: 'UNKNOWN',
        reason: repository.error || 'Repository evidence collection failed.',
        resolvedVersion: null,
        declaredRange: null,
        imports: [],
        path: [input.advisoryId || advisory?.id || 'advisory', repository.repository || 'repository'],
        fixedVersions: fixedVersionsFromAdvisory(advisory, packageName),
        targetVersion: fixedVersionsFromAdvisory(advisory, packageName)[0] || null,
        rangeAllowsFix: false,
        allowedVersion: null,
        sourceSampleSize: 0,
        sourceBound: 'Repository evidence unavailable',
        evidenceSources: [repository.repositoryUrl].filter(Boolean),
      })
  const graph = buildObservedGraph({ advisoryId: input.advisoryId || advisory?.id || 'advisory', packageName, repositoryFindings: findings })
  const sources = [...new Set([
    advisoryRecord.sourceUrl,
    registry.sourceUrl,
    ...repositoryResults.flatMap((result) => [result.sourceUrl, ...(result.sources || []).map((source) => source.url)]),
    ...(advisory?.references || []).map((reference) => reference.url),
  ].filter(Boolean))]
  const failed = [advisoryRecord, registry, ...repositoryResults].some((collector) => collector.status === 'failed')
  onProgress({ type: 'step', key: 'classification', status: 'complete', title: 'Reachability classified', detail: findings.map((finding) => `${finding.repository}: ${finding.verdict}`).join(' · ') || 'No repositories were classified.' })
  return {
    status: failed ? 'partial' : packageName && advisory ? 'completed' : 'partial',
    query,
    scenarioId,
    package: packageName,
    target: { ...input, packageName, advisoryId: input.advisoryId || advisory?.id || null, repositories },
    advisory,
    registry,
    collectors: [advisoryRecord, registry, ...repositoryResults],
    repositories: repositoryResults,
    findings,
    graph,
    sources,
    temporal: {
      advisoryPublishedAt: advisory?.published || null,
      advisoryModifiedAt: advisory?.modified || null,
      collectedAt: new Date().toISOString(),
    },
    completedAt: new Date().toISOString(),
  }
}

export { inferTarget, parseCargoLock, parseCargoManifest }
