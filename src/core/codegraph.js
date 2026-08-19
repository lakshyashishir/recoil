const SOURCE_EXTENSIONS = ['.js', '.jsx', '.mjs', '.cjs', '.ts', '.tsx', '.rs']

/**
 * Repository entrypoints are not always named with a source extension. A
 * committed executable such as bin/http-server is still JavaScript when it
 * has a Node shebang, and excluding it creates a false DECLARED_ONLY result.
 * Keep this allowlist narrow so arbitrary generated files are not promoted
 * into the bounded source sample.
 */
export function isAnalyzableSourcePath(path = '') {
  return SOURCE_EXTENSIONS.some((extension) => path.endsWith(extension))
    || /(?:^|\/)(?:bin|cmd|cli)\/[^/]+$/.test(path)
}

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

const RUST_BUILTIN_CRATES = new Set(['alloc', 'core', 'proc_macro', 'self', 'std', 'super', 'crate'])

function rustExternalSpecifiers(text = '') {
  const specifiers = []
  for (const match of text.matchAll(/\b(?:pub\s+)?use\s+([A-Za-z_][A-Za-z0-9_-]*)::/g)) {
    specifiers.push({ specifier: match[1], line: lineNumber(text, match.index || 0) })
  }
  for (const match of text.matchAll(/\bextern\s+crate\s+([A-Za-z_][A-Za-z0-9_-]*)\b/g)) {
    specifiers.push({ specifier: match[1], line: lineNumber(text, match.index || 0) })
  }
  // Capture qualified crate paths used without a `use` statement, such as
  // `bytes::BytesMut::new()`. The graph builder filters local modules and
  // standard crates before treating these as external package evidence.
  for (const match of text.matchAll(/(?<!:)(\b[a-z][A-Za-z0-9_-]*)::(?=[A-Za-z_][A-Za-z0-9_]*)(?!:)/g)) {
    specifiers.push({ specifier: match[1], line: lineNumber(text, match.index || 0) })
  }
  return [...new Map(specifiers.filter((item) => !RUST_BUILTIN_CRATES.has(item.specifier)).map((item) => [item.specifier, item])).values()]
}

function lineNumber(text, offset) {
  return text.slice(0, offset).split('\n').length
}

function sourceLine(text, line) {
  if (!line) return null
  return (text.split(/\r?\n/)[line - 1] || '').trim().slice(0, 240) || null
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

export function enrichChangeEvidence(codeGraph, codeowners = []) {
  if (!codeGraph) return codeGraph
  const rules = Array.isArray(codeowners) ? codeowners : parseCodeowners(codeowners)
  const changedFiles = (codeGraph.recentChange?.files || []).map((file) => ({
    ...file,
    owners: file.owners?.length ? file.owners : ownersForPath(file.path, rules),
  }))
  const recentChange = codeGraph.recentChange
    ? { ...codeGraph.recentChange, files: changedFiles, ownershipRules: rules.length }
    : null
  return {
    ...codeGraph,
    recentChange,
    ownershipRules: rules.length,
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

export function buildCodeGraph(sourceFiles = [], { maxFiles = 24 } = {}) {
  const selected = sourceFiles
    .filter((file) => file?.path && file?.text && isAnalyzableSourcePath(file.path))
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
  const edges = []
  const unresolved = []
  const externalImports = []
  for (const file of files.values()) {
    const language = languageFor(file.path)
    const localSpecifiers = language === 'rust'
      ? localRustSpecifiers(file.text).map((specifier) => ({ specifier, line: null, local: true }))
      : []
    const externalRust = language === 'rust'
      ? rustExternalSpecifiers(file.text).filter(({ specifier }) => !resolveRust(file.path, specifier, files)).map((item) => ({ ...item, local: false }))
      : []
    const specifiers = language === 'rust' ? [...localSpecifiers, ...externalRust] : javascriptSpecifiers(file.text)
    for (const specifier of specifiers) {
      if (language === 'rust' && !specifier.local) {
        externalImports.push({
          path: file.path,
          sourceUrl: file.sourceUrl || null,
          specifier: specifier.specifier,
          packageName: specifier.specifier.replace(/_/g, '-'),
          line: specifier.line,
          snippet: sourceLine(file.text, specifier.line),
        })
        continue
      }
      if (language !== 'rust' && !specifier.specifier.startsWith('.') && !specifier.specifier.startsWith('#') && !specifier.specifier.startsWith('node:')) {
        externalImports.push({
          path: file.path,
          sourceUrl: file.sourceUrl || null,
          specifier: specifier.specifier,
          packageName: packageNameForSpecifier(specifier.specifier),
          line: specifier.line,
          snippet: sourceLine(file.text, specifier.line),
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
    fileCount: nodes.length,
    importEdgeCount: uniqueEdges.length,
    symbolCount: Math.min(symbols.length, 80),
  }
}
