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
  const triplets = rawTriplets.map((triplet) => ({
    source: tripletValue(triplet.source),
    predicate: triplet.predicate || triplet.relation?.canonical_predicate || triplet.relation?.canonicalPredicate || triplet.relation?.predicate || null,
    target: tripletValue(triplet.target),
    origin: triplet.origin || triplet.relation?.origin || null,
  })).filter((triplet) => triplet.source && triplet.target).slice(0, 12)
  return {
    queryPathCount: context.queryPathCount ?? queryPaths.length,
    chunkRelationCount: context.chunkRelationCount ?? chunkRelations.length,
    tripletCount: context.tripletCount ?? triplets.length,
    triplets,
  }
}
