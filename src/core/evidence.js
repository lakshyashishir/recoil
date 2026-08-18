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

export function chooseFixedVersion(advisory, packageName, declaredRange = '') {
  const fixedVersions = fixedVersionsFromAdvisory(advisory, packageName)
  const allowed = fixedVersions.find((version) => satisfiesRange(declaredRange, version))
  return { fixedVersions, targetVersion: fixedVersions[0] || null, rangeAllowsFix: Boolean(allowed), allowedVersion: allowed || null }
}

function repositoryLockEntry(manifest, packageName) {
  return (manifest?.lockPackages || []).find((item) => item.name === packageName) || null
}

export function classifyRepository({ repository, packageName, advisory, advisoryId }) {
  const manifest = repository?.manifest || {}
  const codeGraph = manifest.codeGraph || {}
  const sourceCollection = manifest.collection?.sourceFiles || {}
  const sourceSampleLimit = sourceCollection.limit || sourceCollection.requested || codeGraph.fileCount || 0
  const resolvedVersion = manifest.resolved?.[packageName] || repositoryLockEntry(manifest, packageName)?.version || null
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
  const fix = chooseFixedVersion(advisory, packageName, declaredRange)
  const sourceEvidenceIncomplete = ['unavailable', 'partial'].includes(sourceCollection.status)
  let verdict = 'UNKNOWN'
  let reason = 'The available public evidence is insufficient to classify this repository.'
  if (!resolvedVersion) {
    verdict = 'UNKNOWN'
    reason = manifest.lockfile ? `The lockfile did not resolve ${packageName} in the sampled record.` : 'No lockfile resolution was found; reachability cannot be proven.'
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
  const path = resolvedVersion
    ? [advisoryLabel, `${packageName}@${resolvedVersion}`, repository?.repository || 'repository', lockfilePath, ...imports.slice(0, 4).map((item) => item.path)]
    : [advisoryLabel, repository?.repository || 'repository']
  return {
    repository: repository?.repository || null,
    repositoryUrl: repository?.repositoryUrl || null,
    packageName,
    advisoryId: advisoryLabel,
    verdict,
    reason,
    resolvedVersion,
    declaredRange,
    pathObservedAt: manifest.temporal?.pathObservedAt || null,
    pathObservationSource: manifest.temporal?.sourceUrl || null,
    imports,
    path,
    fixedVersions: fix.fixedVersions,
    targetVersion: fix.targetVersion,
    rangeAllowsFix: fix.rangeAllowsFix,
    allowedVersion: fix.allowedVersion,
    sourceSampleSize: codeGraph.fileCount || 0,
    sourceSampleLimit: sourceSampleLimit || null,
    sourceBound: codeGraph.fileCount
      ? `${codeGraph.fileCount} of ${sourceSampleLimit || codeGraph.fileCount} candidate source files analyzed${imports.length ? ` · ${imports.length} import${imports.length === 1 ? '' : 's'} found` : ' · no import found'}${sourceEvidenceIncomplete ? ` · collection ${sourceCollection.status}` : ''}`
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
    const packageId = `package:${finding.packageName}@${finding.resolvedVersion || 'unresolved'}`
    const lockId = `lock:${finding.repository}:${finding.path[3] || 'unknown'}`
    nodes.push(
      { id: packageId, label: packageId.replace('package:', ''), type: 'package' },
      { id: repoId, label: finding.repository || 'unknown repository', type: 'repository', sourceUrl: finding.repositoryUrl },
      { id: lockId, label: finding.path[3] || 'lockfile', type: 'lockfile' },
    )
    edges.push([`advisory:${advisoryId}`, packageId], [packageId, repoId], [repoId, lockId])
    for (const item of finding.imports || []) {
      const codeId = `code:${finding.repository}:${item.path}`
      nodes.push({ id: codeId, label: item.path, type: 'code', sourceUrl: item.sourceUrl })
      edges.push([lockId, codeId])
    }
  }
  return { nodes: [...new Map(nodes.map((node) => [node.id, node])).values()], edges: [...new Set(edges.map((edge) => edge.join('>')))].map((edge) => edge.split('>')), packageName }
}

export function applyAdvisoryScope(ingestion, scope) {
  const candidates = (scope?.affectedSymbols || []).filter((item) => item?.name).slice(0, 12)
  const findings = (ingestion?.findings || []).map((finding) => {
    const repository = (ingestion?.repositories || []).find((item) => item.repository === finding.repository)
    const symbols = repository?.manifest?.codeGraph?.symbols || []
    const matches = candidates.flatMap((candidate) => symbols.filter((symbol) => symbol.name.toLowerCase() === candidate.name.toLowerCase()).map((symbol) => ({
      ...symbol,
      candidate: candidate.name,
      reason: candidate.reason || null,
    })))
    return {
      ...finding,
      advisoryScope: matches.length
        ? { status: 'VALIDATED_SYMBOL', symbols: [...new Map(matches.map((symbol) => [`${symbol.path}:${symbol.line}:${symbol.name}`, symbol])).values()] }
        : { status: candidates.length ? 'MODULE_LEVEL_ONLY' : 'NOT_REQUESTED', symbols: [] },
      evidenceSources: [...new Set([...(finding.evidenceSources || []), ...matches.map((symbol) => symbol.sourceUrl).filter(Boolean)])],
    }
  })
  return { ...ingestion, advisoryScope: scope || { status: 'skipped', affectedSymbols: [] }, findings }
}
