function unwrapContext(context) {
  if (!context || typeof context !== 'object') return null
  return context.graph_context || context.graphContext || context
}

function tripletValue(value) {
  if (typeof value === 'string') return value
  return value?.name || value?.label || value?.id || null
}

/** Normalize the graph-context shapes returned by HydraDB v2. */
export function summarizeGraphContext(input) {
  const context = unwrapContext(input)
  if (!context) return null
  const queryPaths = context.query_paths || context.queryPaths || []
  const chunkRelations = context.chunk_relations || context.chunkRelations || []
  const rawTriplets = Array.isArray(context.triplets)
    ? context.triplets
    : [...queryPaths, ...chunkRelations].flatMap((path) => path?.triplets || [])
  const normalizedTriplets = rawTriplets.map((triplet) => ({
    source: tripletValue(triplet.source),
    predicate: triplet.predicate || triplet.relation?.canonical_predicate || triplet.relation?.canonicalPredicate || triplet.relation?.predicate || null,
    target: tripletValue(triplet.target),
    origin: triplet.origin || triplet.relation?.origin || null,
  })).filter((triplet) => triplet.source && triplet.target)
  const triplets = [...new Map(normalizedTriplets.map((triplet) => [
    `${triplet.source}\u0000${triplet.predicate || ''}\u0000${triplet.target}\u0000${triplet.origin || ''}`,
    triplet,
  ])).values()].slice(0, 12)
  return {
    queryPathCount: context.queryPathCount ?? queryPaths.length,
    chunkRelationCount: context.chunkRelationCount ?? chunkRelations.length,
    tripletCount: triplets.length,
    triplets,
  }
}
