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

function localJavaScriptSpecifiers(text = '') {
  return [...text.matchAll(/(?:import\s+(?:[\s\S]*?\s+from\s+)?|export\s+[\s\S]*?\s+from\s+|require\s*\(|import\s*\()\s*["']([^"']+)["']/g)]
    .map((match) => match[1])
    .filter((specifier) => specifier.startsWith('.'))
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

export function buildCodeGraph(sourceFiles = [], { maxFiles = 24 } = {}) {
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
  const impactCandidates = [...files.values()].map((file) => inferSurface(file, symbols)).filter(Boolean).slice(0, 24)
  const edges = []
  const unresolved = []
  for (const file of files.values()) {
    const specifiers = languageFor(file.path) === 'rust'
      ? localRustSpecifiers(file.text)
      : localJavaScriptSpecifiers(file.text)
    for (const specifier of specifiers) {
      const resolved = languageFor(file.path) === 'rust'
        ? resolveRust(file.path, specifier, files)
        : resolveJavaScript(file.path, specifier, files)
      if (!resolved) {
        unresolved.push({ from: file.path, specifier })
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
    symbols: symbols.slice(0, 80),
    impactCandidates,
    fileCount: nodes.length,
    importEdgeCount: uniqueEdges.length,
    symbolCount: Math.min(symbols.length, 80),
    surfaceCount: impactCandidates.length,
  }
}
