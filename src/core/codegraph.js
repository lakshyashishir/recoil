const SOURCE_EXTENSIONS = ['.js', '.jsx', '.mjs', '.cjs', '.ts', '.tsx', '.rs']

const SURFACE_RULES = [
  { id: 'billing', target: 'payments', tokens: ['payment', 'billing', 'checkout', 'invoice', 'stripe'] },
  { id: 'identity', target: 'secrets', tokens: ['auth', 'credential', 'secret', 'token', 'session', 'jwt'] },
  { id: 'data', target: 'customer-db', tokens: ['database', 'db', 'postgres', 'mysql', 'redis', 'prisma', 'sql', 'repository'] },
  { id: 'build', target: 'ci', tokens: ['deploy', 'release', 'docker', 'workflow', 'pipeline', 'build'] },
  { id: 'network', target: 'gateway', tokens: ['api', 'server', 'router', 'http', 'request', 'webhook'] },
]

function languageFor(path = '') {
  return path.endsWith('.rs') ? 'rust' : 'javascript'
}

function normalizePath(path) {
  const parts = []
  for (const part of path.split('/')) {
    if (!part || part === '.') continue
    if (part === '..') parts.pop()
    else parts.push(part)
  }
  return parts.join('/')
}

function javascriptSpecifiers(text = '') {
  return [...text.matchAll(/(?:import\s+(?:[\s\S]*?\s+from\s+)?|export\s+[\s\S]*?\s+from\s+|require\s*\(|import\s*\()\s*["']([^"']+)["']/g)]
    .map((match) => ({ specifier: match[1], line: lineNumber(text, match.index || 0) }))
}

function packageNameForSpecifier(specifier = '') {
  if (specifier.startsWith('@')) return specifier.split('/').slice(0, 2).join('/')
  return specifier.split('/')[0]
}

export function externalJavaScriptSpecifiers(text = '', path = '', sourceUrl = null) {
  return javascriptSpecifiers(text)
    .filter(({ specifier }) => !specifier.startsWith('.') && !specifier.startsWith('#') && !specifier.startsWith('node:'))
    .map(({ specifier, line }) => ({ path, sourceUrl, specifier, packageName: packageNameForSpecifier(specifier), line }))
}

function localRustSpecifiers(text = '') {
  const modules = [...text.matchAll(/\bmod\s+([A-Za-z_][A-Za-z0-9_]*)\s*;/g)].map((match) => match[1])
  const crateUses = [...text.matchAll(/\buse\s+crate::([A-Za-z_][A-Za-z0-9_]*)/g)].map((match) => match[1])
  return [...new Set([...modules, ...crateUses])]
}

function lineNumber(text, offset) {
  return text.slice(0, offset).split('\n').length
}

export function parseSourceSymbols(text = '', path = '') {
  const language = languageFor(path)
  const patterns = language === 'rust'
    ? [
        { kind: 'function', pattern: /(?:pub\s+)?(?:async\s+)?fn\s+([A-Za-z_][A-Za-z0-9_]*)/g },
        { kind: 'struct', pattern: /(?:pub\s+)?struct\s+([A-Za-z_][A-Za-z0-9_]*)/g },
        { kind: 'enum', pattern: /(?:pub\s+)?enum\s+([A-Za-z_][A-Za-z0-9_]*)/g },
        { kind: 'trait', pattern: /(?:pub\s+)?trait\s+([A-Za-z_][A-Za-z0-9_]*)/g },
      ]
    : [
        { kind: 'function', pattern: /(?:export\s+)?(?:default\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/g },
        { kind: 'class', pattern: /(?:export\s+)?(?:default\s+)?class\s+([A-Za-z_$][\w$]*)/g },
        { kind: 'function', pattern: /(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>/g },
      ]
  const symbols = []
  for (const { kind, pattern } of patterns) {
    for (const match of text.matchAll(pattern)) {
      symbols.push({ name: match[1], kind, language, line: lineNumber(text, match.index || 0) })
    }
  }
  return symbols.sort((left, right) => left.line - right.line || left.name.localeCompare(right.name))
}

function changedLinesFromPatch(patch = '') {
  const lines = new Set()
  let newLine = 0
  for (const rawLine of patch.split('\n')) {
    const hunk = rawLine.match(/^@@\s+-\d+(?:,\d+)?\s+\+(\d+)(?:,\d+)?\s+@@/)
    if (hunk) {
      newLine = Number(hunk[1])
      continue
    }
    if (!newLine || rawLine.startsWith('\\')) continue
    if (rawLine.startsWith('+++')) continue
    if (rawLine.startsWith('+')) {
      lines.add(newLine)
      newLine += 1
      continue
    }
    if (rawLine.startsWith('-')) continue
    newLine += 1
  }
  return lines
}

export function buildChangeImpact(codeGraph, commit) {
  if (!commit || !codeGraph?.files?.length) return null
  const sampledPaths = new Set(codeGraph.files.map((file) => file.path))
  const symbols = codeGraph.symbols || []
  const files = (commit.files || [])
    .filter((file) => sampledPaths.has(file.filename))
    .map((file) => {
      const changedLines = changedLinesFromPatch(file.patch || '')
      const fileSymbols = symbols.filter((symbol) => symbol.path === file.filename)
      const changedSymbols = changedLines.size
        ? fileSymbols.filter((symbol) => changedLines.has(symbol.line)).map((symbol) => symbol.name)
        : fileSymbols.map((symbol) => symbol.name)
      return {
        path: file.filename,
        status: file.status,
        additions: file.additions || 0,
        deletions: file.deletions || 0,
        changedLines: changedLines.size,
        symbols: changedSymbols,
        symbolMatch: changedLines.size ? 'hunk-line' : 'file-level',
      }
    })
  return {
    sha: commit.sha || null,
    message: commit.commit?.message?.split('\n')[0] || 'latest public commit',
    committedAt: commit.commit?.author?.date || commit.commit?.committer?.date || null,
    sourceUrl: commit.html_url || null,
    files,
    sampledFilesChanged: files.length,
    totalFilesChanged: commit.files?.length || 0,
  }
}

function codeownersRegex(pattern) {
  const normalized = pattern.trim().replace(/^\//, '')
  const escaped = normalized.replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*/g, '.*')
    .replace(/\*/g, '[^/]*')
    .replace(/\?/g, '[^/]')
  return normalized.includes('/')
    ? new RegExp(`^${escaped}${normalized.endsWith('/') ? '.*' : ''}$`)
    : new RegExp(`(?:^|/)${escaped}$`)
}

export function parseCodeowners(text = '') {
  return text.split(/\r?\n/).map((line) => line.trim()).filter((line) => line && !line.startsWith('#')).map((line) => {
    const [pattern, ...owners] = line.split(/\s+/)
    return { pattern, owners: owners.filter(Boolean) }
  }).filter((rule) => rule.pattern && rule.owners.length).map((rule) => ({ ...rule, matcher: codeownersRegex(rule.pattern) }))
}

function ownersForPath(path, rules) {
  let owners = []
  for (const rule of rules) {
    if (rule.matcher.test(path)) owners = rule.owners
  }
  return owners
}

export function enrichImpactCandidates(codeGraph, codeowners = []) {
  if (!codeGraph) return codeGraph
  const rules = Array.isArray(codeowners) ? codeowners : parseCodeowners(codeowners)
  const changedFiles = (codeGraph.recentChange?.files || []).map((file) => ({
    ...file,
    owners: file.owners?.length ? file.owners : ownersForPath(file.path, rules),
  }))
  const recentChange = codeGraph.recentChange
    ? { ...codeGraph.recentChange, files: changedFiles, ownershipRules: rules.length }
    : null
  const changes = new Map(changedFiles.map((file) => [file.path, file]))
  return {
    ...codeGraph,
    recentChange,
    ownershipRules: rules.length,
    impactCandidates: (codeGraph.impactCandidates || []).map((candidate) => {
      const change = changes.get(candidate.file)
      return {
        ...candidate,
        changed: Boolean(change),
        changedSymbols: change?.symbols || [],
        changeMatch: change?.symbolMatch || null,
        owners: change?.owners || [],
      }
    }),
  }
}

function resolveJavaScript(from, specifier, files) {
  const base = normalizePath(`${from.split('/').slice(0, -1).join('/')}/${specifier}`)
  const candidates = [base, ...SOURCE_EXTENSIONS.map((extension) => `${base}${extension}`), ...SOURCE_EXTENSIONS.map((extension) => `${base}/index${extension}`)]
  return candidates.find((candidate) => files.has(candidate)) || null
}

function resolveRust(from, specifier, files) {
  const root = from.split('/').slice(0, -1).join('/')
  const candidates = [
    normalizePath(`${root}/${specifier}.rs`),
    normalizePath(`${root}/${specifier}/mod.rs`),
    normalizePath(`src/${specifier}.rs`),
    normalizePath(`src/${specifier}/mod.rs`),
  ]
  return candidates.find((candidate) => files.has(candidate)) || null
}

function inferSurface(file, symbols) {
  const haystack = `${file.path} ${file.text}`.toLowerCase()
  const matches = SURFACE_RULES.map((rule) => ({
    rule,
    hits: rule.tokens.filter((token) => haystack.includes(token)),
  })).filter((item) => item.hits.length)
  if (!matches.length) return null
  const best = matches.sort((left, right) => right.hits.length - left.hits.length)[0]
  return {
    file: file.path,
    target: best.rule.target,
    surface: best.rule.id,
    matchedTerms: best.hits,
    symbols: symbols.filter((symbol) => symbol.path === file.path).map((symbol) => symbol.name).slice(0, 8),
    confidence: best.hits.length > 1 ? 'inferred' : 'weak-inference',
    reason: `${best.hits.join(', ')} matched in public source path or text`,
  }
}

export function buildCodeGraph(sourceFiles = [], { maxFiles = 24, inferSurfaces = true } = {}) {
  const selected = sourceFiles
    .filter((file) => file?.path && file?.text && SOURCE_EXTENSIONS.some((extension) => file.path.endsWith(extension)))
    .slice(0, maxFiles)
  const files = new Map(selected.map((file) => [normalizePath(file.path), { ...file, path: normalizePath(file.path) }]))
  const nodes = [...files.values()].map((file, index) => ({
    id: `code:${file.path}`,
    label: file.path,
    type: 'code',
    meta: `${languageFor(file.path)} source · observed public file`,
    sourceUrl: file.sourceUrl || null,
    activeAt: 5,
    x: 45 + ((index % 5) * 11),
    y: 10 + (Math.floor(index / 5) * 17),
  }))
  const symbols = [...files.values()].flatMap((file) => parseSourceSymbols(file.text, file.path).map((symbol) => ({ ...symbol, path: file.path, sourceUrl: file.sourceUrl || null })))
  const impactCandidates = inferSurfaces ? [...files.values()].map((file) => inferSurface(file, symbols)).filter(Boolean).slice(0, 24) : []
  const edges = []
  const unresolved = []
  const externalImports = []
  for (const file of files.values()) {
    const specifiers = languageFor(file.path) === 'rust'
      ? localRustSpecifiers(file.text).map((specifier) => ({ specifier, line: null }))
      : javascriptSpecifiers(file.text)
    for (const specifier of specifiers) {
      if (languageFor(file.path) !== 'rust' && !specifier.specifier.startsWith('.') && !specifier.specifier.startsWith('#') && !specifier.specifier.startsWith('node:')) {
        externalImports.push({
          path: file.path,
          sourceUrl: file.sourceUrl || null,
          specifier: specifier.specifier,
          packageName: packageNameForSpecifier(specifier.specifier),
          line: specifier.line,
        })
        continue
      }
      const resolved = languageFor(file.path) === 'rust'
        ? resolveRust(file.path, specifier.specifier, files)
        : resolveJavaScript(file.path, specifier.specifier, files)
      if (!resolved) {
        unresolved.push({ from: file.path, specifier: specifier.specifier })
        continue
      }
      edges.push([`code:${file.path}`, `code:${resolved}`])
    }
  }
  const uniqueEdges = [...new Set(edges.map(([from, to]) => `${from}>${to}`))].map((key) => key.split('>'))
  return {
    files: selected.map((file) => ({ path: normalizePath(file.path), sourceUrl: file.sourceUrl || null, language: languageFor(file.path) })),
    nodes,
    edges: uniqueEdges,
    unresolved: unresolved.slice(0, 40),
    externalImports: [...new Map(externalImports.map((item) => [`${item.path}>${item.specifier}>${item.line}`, item])).values()].slice(0, 160),
    symbols: symbols.slice(0, 80),
    impactCandidates,
    fileCount: nodes.length,
    importEdgeCount: uniqueEdges.length,
    symbolCount: Math.min(symbols.length, 80),
    surfaceCount: impactCandidates.length,
  }
}
