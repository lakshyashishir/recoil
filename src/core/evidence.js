const VERSION_PATTERN = /^(\d+)(?:\.(\d+))?(?:\.(\d+))?(?:-([0-9A-Za-z.-]+))?/

function parseVersion(value) {
  const match = String(value || '').trim().replace(/^v/, '').match(VERSION_PATTERN)
  if (!match) return null
  return { major: Number(match[1]), minor: Number(match[2] || 0), patch: Number(match[3] || 0), prerelease: match[4] || '' }
}

function versionKey(version) {
  return [version.major, version.minor, version.patch]
}

export function compareVersions(left, right) {
  const a = (left && typeof left === 'object') ? left : parseVersion(left) || left
  const b = (right && typeof right === 'object') ? right : parseVersion(right) || right
  if (typeof a === 'string' || typeof b === 'string') return String(left).localeCompare(String(right))
  for (const index of [0, 1, 2]) {
    if (versionKey(a)[index] !== versionKey(b)[index]) return versionKey(a)[index] - versionKey(b)[index]
  }
  if (!a.prerelease && b.prerelease) return 1
  if (a.prerelease && !b.prerelease) return -1
  return a.prerelease.localeCompare(b.prerelease)
}

function increment(version, position) {
  const parsed = version && typeof version === 'object' ? version : parseVersion(version)
  if (!parsed) return null
  if (position === 'major') return `${parsed.major + 1}.0.0`
  if (position === 'minor') return `${parsed.major}.${parsed.minor + 1}.0`
  return `${parsed.major}.${parsed.minor}.${parsed.patch + 1}`
}

function normalizeRange(range) {
  return String(range || '*')
    .trim()
    .replace(/^(?:npm:|workspace:)/, '')
    .replace(/\s+-\s+/g, ' - ')
}

function satisfiesComparator(version, comparator) {
  const match = comparator.trim().match(/^(<=|>=|<|>|=|\^|~)?\s*[v=]?([^\s]+)$/)
  if (!match) return false
  const operator = match[1] || '='
  const target = parseVersion(match[2])
  const current = parseVersion(version)
  if (!target || !current) return false
  const comparison = compareVersions(current, target)
  if (operator === '>') return comparison > 0
  if (operator === '>=') return comparison >= 0
  if (operator === '<') return comparison < 0
  if (operator === '<=') return comparison <= 0
  if (operator === '^') {
    const upper = target.major > 0 ? increment(target, 'major') : target.minor > 0 ? increment(target, 'minor') : increment(target, 'patch')
    return comparison >= 0 && compareVersions(current, upper) < 0
  }
  if (operator === '~') return comparison >= 0 && compareVersions(current, increment(target, 'minor')) < 0
  return comparison === 0
}

function satisfiesPartial(version, token) {
  const normalized = token.trim().replace(/^[v=]/, '')
  if (!normalized || normalized === '*' || normalized.toLowerCase() === 'x') return true
  const parts = normalized.split('.')
  if (parts.some((part) => /^(x|X|\*)$/.test(part))) {
    const current = parseVersion(version)
    if (!current) return false
    return parts.every((part, index) => /^(x|X|\*)$/.test(part) || Number(part) === versionKey(current)[index])
  }
  return satisfiesComparator(version, `=${normalized}`)
}

function satisfiesClause(version, clause) {
  const normalized = clause.trim()
  if (!normalized || normalized === '*' || normalized.toLowerCase() === 'latest') return true
  const hyphen = normalized.match(/^([^\s]+)\s+-\s+([^\s]+)$/)
  if (hyphen) return compareVersions(version, hyphen[1]) >= 0 && compareVersions(version, hyphen[2]) <= 0
  const comparators = normalized.match(/(?:\^|~|>=|<=|>|<|=)?\s*[v=]?[^\s]+/g) || []
  return comparators.every((token) => {
    const value = token.trim()
    if (/^(?:\^|~|>=|<=|>|<|=)/.test(value)) return satisfiesComparator(version, value)
    return satisfiesPartial(version, value)
  })
}

export function satisfiesRange(range, version) {
  if (!version || !range) return false
  return normalizeRange(range).split('||').some((clause) => satisfiesClause(version, clause))
}

function advisoryAffectedEntries(advisory, packageName) {
  return (advisory?.affected || []).filter((entry) => {
    const name = entry?.package?.name || entry?.package?.purl?.split('/')?.at(-1)
    return !packageName || name === packageName
  })
}

export function fixedVersionsFromAdvisory(advisory, packageName) {
  const versions = advisoryAffectedEntries(advisory, packageName).flatMap((entry) => (entry.ranges || []).flatMap((range) => (range.events || []).map((event) => event.fixed).filter(Boolean)))
  return [...new Set(versions)].sort(compareVersions)
}

function fixedVersionsForResolvedVersion(advisory, packageName, resolvedVersion) {
  if (!resolvedVersion || !parseVersion(resolvedVersion)) return []
  const resolved = parseVersion(resolvedVersion)
  const branchVersions = advisoryAffectedEntries(advisory, packageName).flatMap((entry) => (entry.ranges || []).flatMap((range) => {
    let introduced = null
    return (range.events || []).flatMap((event) => {
      if (event.introduced !== undefined) introduced = event.introduced === '0' ? '0.0.0' : event.introduced
      if (!event.fixed || !introduced) return []
      return compareVersions(resolved, introduced) >= 0 && compareVersions(resolved, event.fixed) < 0 ? [event.fixed] : []
    })
  }))
  if (branchVersions.length) return [...new Set(branchVersions)].sort(compareVersions)
  // A safe version has no active range to identify, but the most useful fix
  // shown beside it is still the fixed release for the same major line.
  const sameMajor = fixedVersionsFromAdvisory(advisory, packageName).filter((version) => parseVersion(version)?.major === resolved.major)
  return sameMajor.length ? sameMajor : fixedVersionsFromAdvisory(advisory, packageName)
}

export function versionAffectedByAdvisory(advisory, packageName, version) {
  const entries = advisoryAffectedEntries(advisory, packageName)
  if (!entries.length || !parseVersion(version)) return null
  for (const entry of entries) {
    if ((entry.versions || []).includes(version)) return true
    for (const range of entry.ranges || []) {
      let introduced = null
      for (const event of range.events || []) {
        if (event.introduced !== undefined) introduced = event.introduced === '0' ? '0.0.0' : event.introduced
        if (event.fixed && introduced && compareVersions(version, introduced) >= 0 && compareVersions(version, event.fixed) < 0) return true
      }
      if (introduced && compareVersions(version, introduced) >= 0 && !(range.events || []).some((event) => event.fixed && compareVersions(version, event.fixed) >= 0)) return true
    }
  }
  return false
}

export function chooseFixedVersion(advisory, packageName, declaredRange = '', resolvedVersion = '') {
  const fixedVersions = fixedVersionsFromAdvisory(advisory, packageName)
  const relevantVersions = fixedVersionsForResolvedVersion(advisory, packageName, resolvedVersion)
  const candidateVersions = relevantVersions.length ? relevantVersions : fixedVersions
  const allowed = candidateVersions.find((version) => satisfiesRange(declaredRange, version))
  return { fixedVersions, targetVersion: candidateVersions[0] || null, rangeAllowsFix: Boolean(allowed), allowedVersion: allowed || null }
}

function repositoryLockEntry(manifest, packageName) {
  return (manifest?.lockPackages || []).find((item) => item.name === packageName) || null
}

function dependencyName(value) {
  return String(value || '').trim().split(/\s+/)[0] || null
}

function packageParentPath(path = '') {
  if (!path) return null
  const nested = path.lastIndexOf('/node_modules/')
  if (nested >= 0) return path.slice(0, nested)
  return ''
}

/**
 * Resolve one lockfile dependency using Node's nearest-node_modules rule when
 * paths are available. Cargo entries do not carry install paths, so they are
 * resolved only when the lockfile has one unambiguous package version.
 */
function resolveDependencyEntry(entries, name, fromPath = '') {
  if (!name) return null
  const byPath = new Map(entries.filter((entry) => entry.path).map((entry) => [entry.path, entry]))
  let parent = fromPath || ''
  while (true) {
    const candidatePath = `${parent ? `${parent}/` : ''}node_modules/${name}`
    if (byPath.has(candidatePath)) return byPath.get(candidatePath)
    if (!parent) break
    parent = packageParentPath(parent)
    if (parent === null) break
  }
  const matches = entries.filter((entry) => entry.name === name)
  const versions = [...new Set(matches.map((entry) => entry.version).filter(Boolean))]
  return versions.length === 1 ? matches[0] : null
}

function dependencyPathFor(manifest, packageName, sourceUrl = null) {
  const entries = (manifest?.lockPackages || []).filter((entry) => entry?.name && entry?.version)
  if (!entries.length || !packageName) return []
  const roots = Object.keys({ ...(manifest.dependencies || {}), ...(manifest.devDependencies || {}) })
    .map((name) => resolveDependencyEntry(entries, name))
    .filter(Boolean)
  const queue = roots.map((entry) => ({ entry, path: [entry] }))
  const visited = new Set()
  while (queue.length) {
    const current = queue.shift()
    const key = current.entry.path || `${current.entry.name}@${current.entry.version}`
    if (visited.has(key)) continue
    visited.add(key)
    if (current.entry.name === packageName) {
      return current.path.slice(0, 12).map((entry) => ({
        name: entry.name,
        version: entry.version,
        path: entry.path || null,
        sourceUrl,
      }))
    }
    for (const rawDependency of current.entry.dependencies || []) {
      const name = dependencyName(rawDependency)
      const dependency = resolveDependencyEntry(entries, name, current.entry.path || '')
      if (dependency) queue.push({ entry: dependency, path: [...current.path, dependency] })
    }
  }
  return []
}

export function classifyRepository({ repository, packageName, advisory, advisoryId }) {
  const manifest = repository?.manifest || {}
  const codeGraph = manifest.codeGraph || {}
  const sourceCollection = manifest.collection?.sourceFiles || {}
  const sourceCandidateCount = sourceCollection.available || sourceCollection.requested || codeGraph.fileCount || 0
  const sourceSampleLimit = sourceCollection.limit || null
  const resolvedVersion = manifest.resolved?.[packageName] || repositoryLockEntry(manifest, packageName)?.version || null
  const resolvedVersions = [...new Set(manifest.resolvedVersions?.[packageName] || [resolvedVersion].filter(Boolean))]
  const declaredRange = manifest.dependencies?.[packageName] || manifest.devDependencies?.[packageName] || null
  const imports = (codeGraph.externalImports || []).filter((item) => item.packageName === packageName)
  const recentChange = codeGraph.recentChange || null
  const changedFiles = recentChange?.files || []
  const changedImportFiles = imports
    .map((item) => ({ item, change: changedFiles.find((file) => file.path === item.path) }))
    .filter(({ change }) => change)
  const changeEvidence = recentChange ? {
    sha: recentChange.sha || null,
    message: recentChange.message || null,
    committedAt: recentChange.committedAt || null,
    sourceUrl: recentChange.sourceUrl || null,
    totalFilesChanged: recentChange.totalFilesChanged || 0,
    sampledFilesChanged: recentChange.sampledFilesChanged || changedFiles.length,
    importerFilesChanged: changedImportFiles.map(({ item, change }) => ({
      path: item.path,
      line: item.line || null,
      sourceUrl: item.sourceUrl || null,
      symbols: change.symbols || [],
      owners: change.owners || [],
      symbolMatch: change.symbolMatch || null,
    })),
  } : null
  const affected = versionAffectedByAdvisory(advisory, packageName, resolvedVersion)
  const resolutionStates = resolvedVersions.map((version) => versionAffectedByAdvisory(advisory, packageName, version))
  const ambiguousResolution = resolvedVersions.length > 1 && (resolutionStates.includes(null) || new Set(resolutionStates).size > 1)
  const fix = chooseFixedVersion(advisory, packageName, declaredRange, resolvedVersion)
  const sourceEvidenceIncomplete = ['unavailable', 'partial'].includes(sourceCollection.status)
  let verdict = 'UNKNOWN'
  let reason = 'The available public evidence is insufficient to classify this repository.'
  if (!resolvedVersion) {
    const lockEntry = repositoryLockEntry(manifest, packageName)
    const packageAbsentFromRecordedTree = Boolean(manifest.lockfile && !declaredRange && !lockEntry && !imports.length && !sourceEvidenceIncomplete && codeGraph.fileCount)
    if (packageAbsentFromRecordedTree) {
      verdict = 'NOT_AFFECTED'
      reason = `${packageName} is not declared or resolved in the collected manifest and lockfile.`
    } else {
      verdict = 'UNKNOWN'
      reason = manifest.lockfile ? `The lockfile did not resolve ${packageName} in the sampled record.` : 'No lockfile resolution was found; reachability cannot be proven.'
    }
  } else if (ambiguousResolution) {
    verdict = 'UNKNOWN'
    reason = `${packageName} resolves to multiple lockfile versions (${resolvedVersions.join(', ')}), with different advisory states; the collected graph cannot prove which version the importer receives.`
  } else if (affected === false) {
    verdict = 'NOT_AFFECTED'
    reason = `${packageName}@${resolvedVersion} is outside the advisory’s affected ranges.`
  } else if (affected === true && imports.length) {
    verdict = 'REACHED'
    reason = `The affected ${packageName}@${resolvedVersion} is imported by ${imports.length} sampled source file${imports.length === 1 ? '' : 's'}.`
  } else if (affected === true && (sourceEvidenceIncomplete || !codeGraph.fileCount)) {
    verdict = 'UNKNOWN'
    reason = sourceEvidenceIncomplete
      ? `The affected ${packageName}@${resolvedVersion} is present, but source collection was ${sourceCollection.status}; Recoil will not infer that no import exists.`
      : `The affected ${packageName}@${resolvedVersion} is present, but no analyzable source files were sampled; Recoil will not infer that no import exists.`
  } else if (affected === true) {
    verdict = 'DECLARED_ONLY'
    reason = `The affected ${packageName}@${resolvedVersion} is present in the lockfile, but no sampled source file imports it.`
  }
  const advisoryLabel = advisoryId || advisory?.id || 'advisory'
  const lockfilePath = manifest.lockfile || 'lockfile not collected'
  const lockfileSource = manifest.lockfile ? (repository?.sources || []).find((source) => source.path === manifest.lockfile)?.url : null
  const versionLabel = resolvedVersions.length > 1 ? `${packageName}@${resolvedVersions.join(', ')}` : `${packageName}@${resolvedVersion || 'unresolved'}`
  const path = resolvedVersion
    ? [advisoryLabel, versionLabel, lockfilePath, repository?.repository || 'repository', ...imports.slice(0, 4).map((item) => item.path)]
    : [advisoryLabel, repository?.repository || 'repository']
  return {
    repository: repository?.repository || null,
    repositoryUrl: repository?.repositoryUrl || null,
    packageName,
    advisoryId: advisoryLabel,
    verdict,
    reason,
    resolvedVersion,
    resolvedVersions,
    declaredRange,
    pathObservedAt: manifest.temporal?.pathObservedAt || null,
    pathObservationSource: manifest.temporal?.sourceUrl || null,
    imports,
    path,
    dependencyPath: dependencyPathFor(manifest, packageName, lockfileSource),
    fixedVersions: fix.fixedVersions,
    targetVersion: fix.targetVersion,
    rangeAllowsFix: fix.rangeAllowsFix,
    allowedVersion: fix.allowedVersion,
    sourceSampleSize: codeGraph.fileCount || 0,
    sourceCandidateCount: sourceCandidateCount || null,
    sourceSampleLimit: sourceSampleLimit || null,
    sourceBound: codeGraph.fileCount
      ? `${codeGraph.fileCount} of ${sourceCandidateCount || codeGraph.fileCount} eligible source files analyzed${sourceSampleLimit && sourceCandidateCount > sourceSampleLimit ? ` · sample limit ${sourceSampleLimit}` : ''}${imports.length ? ` · ${imports.length} import${imports.length === 1 ? '' : 's'} found` : ' · no import found'}${sourceEvidenceIncomplete ? ` · collection ${sourceCollection.status}` : ''}`
      : `No source files sampled${sourceEvidenceIncomplete ? ` · collection ${sourceCollection.status}` : ''}`,
    evidenceSources: [...new Set([
      repository?.sourceUrl,
      manifest.lockfile ? (repository?.sources || []).find((source) => source.path === manifest.lockfile)?.url : null,
      manifest.temporal?.sourceUrl,
      ...imports.map((item) => item.sourceUrl),
    ].filter(Boolean))],
    changeEvidence,
  }
}

export function buildObservedGraph({ advisoryId, packageName, repositoryFindings = [] }) {
  const nodes = [{ id: `advisory:${advisoryId}`, label: advisoryId, type: 'advisory' }]
  const edges = []
  for (const finding of repositoryFindings) {
    const repoId = `repo:${finding.repository}`
    const evidencePath = finding.path || []
    const lockfileLabel = evidencePath.find((part) => /(?:package-lock\.json|npm-shrinkwrap\.json|yarn\.lock|pnpm-lock\.yaml|cargo\.lock)$/i.test(String(part))) || evidencePath[2] || evidencePath[3] || 'unknown'
    const lockId = `lock:${finding.repository}:${lockfileLabel}`
    const resolvedVersions = [...new Set(finding.resolvedVersions || [finding.resolvedVersion].filter(Boolean))]
    const packageVersions = resolvedVersions.length
      ? resolvedVersions
      : [finding.verdict === 'NOT_AFFECTED' ? 'not-present' : 'unresolved']
    nodes.push(
      { id: repoId, label: finding.repository || 'unknown repository', type: 'repository', sourceUrl: finding.repositoryUrl },
      { id: lockId, label: lockfileLabel, type: 'lockfile' },
    )
    for (const version of packageVersions) {
      const packageId = `package:${finding.packageName}@${version}`
      // A package/version can be shared by repositories with different
      // outcomes. Keep verdict color on repository nodes only; a shared
      // dependency node has no single truthful verdict of its own.
      nodes.push({ id: packageId, label: packageId.replace('package:', ''), type: 'package', meta: { resolvedVersions } })
      edges.push([`advisory:${advisoryId}`, packageId], [packageId, lockId])
    }
    const dependencyPath = finding.dependencyPath || []
    for (const [index, dependency] of dependencyPath.entries()) {
      const packageId = `package:${dependency.name}@${dependency.version}`
      nodes.push({
        id: packageId,
        label: packageId.replace('package:', ''),
        type: 'package',
        sourceUrl: dependency.sourceUrl || null,
        meta: { role: dependency.name === finding.packageName ? 'affected-dependency' : 'transitive-dependency', repository: finding.repository },
      })
      const next = dependencyPath[index + 1]
      if (next) edges.push([packageId, `package:${next.name}@${next.version}`])
    }
    edges.push([lockId, repoId])
    for (const item of finding.imports || []) {
      const codeId = `code:${finding.repository}:${item.path}`
      nodes.push({ id: codeId, label: item.path, type: 'code', sourceUrl: item.sourceUrl })
      edges.push([repoId, codeId])
    }
    for (const symbol of finding.advisoryScope?.symbols || []) {
      const codeId = `code:${finding.repository}:${symbol.path}`
      const symbolId = `symbol:${finding.repository}:${symbol.path}:${symbol.line}:${symbol.name}`
      nodes.push({ id: symbolId, label: `${symbol.name} · ${symbol.path}:${symbol.line}`, type: 'symbol', sourceUrl: symbol.sourceUrl || null })
      edges.push([codeId, symbolId])
    }
  }
  return { nodes: [...new Map(nodes.map((node) => [node.id, node])).values()], edges: [...new Set(edges.map((edge) => edge.join('>')))].map((edge) => edge.split('>')), packageName }
}

export function applyAdvisoryScope(ingestion, scope) {
  const candidates = (scope?.affectedSymbols || []).filter((item) => item?.name).slice(0, 12)
  const findings = (ingestion?.findings || []).map((finding) => {
    const repository = (ingestion?.repositories || []).find((item) => item.repository === finding.repository)
    const symbols = repository?.manifest?.codeGraph?.symbols || []
    const importerPaths = new Set((finding.imports || []).map((item) => item.path))
    const matches = candidates.flatMap((candidate) => symbols.filter((symbol) => symbol.name.toLowerCase() === candidate.name.toLowerCase() && importerPaths.has(symbol.path)).map((symbol) => ({
      ...symbol,
      candidate: candidate.name,
      reason: candidate.reason || null,
    })))
    const validatedSymbols = [...new Map(matches.map((symbol) => [`${symbol.path}:${symbol.line}:${symbol.name}`, symbol])).values()]
    const symbolHops = validatedSymbols.slice(0, 4).map((symbol) => `symbol:${symbol.name}@${symbol.path}:${symbol.line}`)
    return {
      ...finding,
      advisoryScope: matches.length
        ? { status: 'VALIDATED_SYMBOL', symbols: validatedSymbols }
        : { status: candidates.length ? 'MODULE_LEVEL_ONLY' : 'NOT_REQUESTED', symbols: [], note: candidates.length ? 'No model-named symbol was found in an importing file.' : null },
      path: symbolHops.length ? [...(finding.path || []), ...symbolHops] : finding.path,
      evidenceSources: [...new Set([...(finding.evidenceSources || []), ...matches.map((symbol) => symbol.sourceUrl).filter(Boolean)])],
    }
  })
  const graph = ingestion?.graph || { nodes: [], edges: [] }
  const symbolNodes = findings.flatMap((finding) => (finding.advisoryScope?.symbols || []).map((symbol) => ({
    id: `symbol:${finding.repository}:${symbol.path}:${symbol.line}:${symbol.name}`,
    label: `${symbol.name} · ${symbol.path}:${symbol.line}`,
    type: 'symbol',
    sourceUrl: symbol.sourceUrl || null,
  })))
  const symbolEdges = findings.flatMap((finding) => (finding.advisoryScope?.symbols || []).map((symbol) => [
    `code:${finding.repository}:${symbol.path}`,
    `symbol:${finding.repository}:${symbol.path}:${symbol.line}:${symbol.name}`,
  ]))
  return {
    ...ingestion,
    advisoryScope: scope || { status: 'skipped', affectedSymbols: [] },
    findings,
    graph: {
      ...graph,
      nodes: [...new Map([...(graph.nodes || []), ...symbolNodes].map((node) => [node.id, node])).values()],
      edges: [...new Map([...(graph.edges || []), ...symbolEdges].map((edge) => [edge.join('>'), edge])).values()],
    },
  }
}
