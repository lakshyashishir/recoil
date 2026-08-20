function text(value, fallback = 'not available') {
  const normalized = String(value ?? '').replace(/\s+/g, ' ').trim()
  return normalized || fallback
}

function cell(value, fallback = '-') {
  return text(value, fallback).replaceAll('|', '\\|')
}

function repositoryName(value = '') {
  return value.replace(/^https?:\/\/github\.com\//, '').replace(/\/tree\/.*$/, '').replace(/\.git$/, '')
}

function verdictLabel(value) {
  return String(value || 'UNKNOWN').replaceAll('_', ' ').toLowerCase().replace(/^\w/, (letter) => letter.toUpperCase())
}

function sourceLink(value) {
  if (!value) return 'source unavailable'
  try {
    const url = new URL(value)
    return `[${url.hostname.replace(/^www\./, '')}](${value})`
  } catch {
    return `<${value}>`
  }
}

function fixLabel(challenge) {
  if (!challenge) return 'No fix check'
  if (challenge.status === 'FIX_SURVIVES') return `Upgrade to ${challenge.proposedVersion} (verified)`
  if (challenge.status === 'ALREADY_SAFE') return 'Already outside affected range'
  if (challenge.status === 'MANIFEST_CHANGE_REQUIRED') return `Manifest change required for ${challenge.proposedVersion || 'fixed version'}`
  if (challenge.status === 'NO_REACHABLE_PATH') return `Defense-in-depth update to ${challenge.proposedVersion || 'fixed version'}`
  return `${verdictLabel(challenge.status)}: ${text(challenge.detail)}`
}

function findingPath(finding) {
  const proof = (finding.proof || []).filter((step) => step.kind !== 'temporal')
  if (proof.length) return proof.map((step) => step.label).join(' → ')
  return (finding.path || []).join(' → ') || 'No observed path'
}

function findingSources(finding) {
  return [...new Set([
    ...(finding.proof || []).map((step) => step.source),
    finding.repositoryUrl,
    finding.lockfileSource,
    ...(finding.imports || []).map((item) => item.sourceUrl),
    ...(finding.evidenceSources || []),
  ].filter(Boolean))]
}

/**
 * Build a human-readable handoff from the same source-backed report used by
 * the browser and JSON receipt. No new claims are introduced here: this is a
 * presentation/export layer over computed evidence.
 */
export function buildEvidenceBrief({ scenarioId, query, report, hydra } = {}) {
  if (!report) return null
  const findings = report.repositories || []
  const summary = report.summary || {}
  const repositoryScan = report.mode === 'repository'
  const challenges = new Map((report.challenge || []).map((challenge) => [challenge.repository, challenge]))
  const total = repositoryScan ? (summary.totalFindings ?? findings.length) : (summary.totalRepositories ?? findings.length)
  const reached = summary.reached || 0
  const headline = repositoryScan
    ? summary.totalAdvisories
      ? `${reached} of ${total} advisory checks reach sampled vulnerable code.`
      : `No affected advisory was found across ${summary.packagesChecked || 0} recorded packages.`
    : summary.unknown
      ? `${summary.unknown} of ${total} repositories need more evidence.`
      : reached
        ? `${reached} of ${total} repositories reach sampled vulnerable code.`
        : `No repository reaches sampled vulnerable code.`
  const temporal = report.rewind || {}
  const memory = temporal.memory || {}
  const graphContext = memory.graphContext || {}
  const allSources = [...new Set([
    report.advisory?.sourceUrl,
    ...(report.sources || []),
    ...findings.flatMap(findingSources),
  ].filter(Boolean))]
  const lines = [
    '# Recoil evidence brief',
    '',
    `**Case:** ${cell(scenarioId)}`,
    `**Generated:** ${cell(report.generatedAt)}`,
    `**Query:** ${cell(query || report.query)}`,
    '',
    '> This brief is generated from collected public evidence. Recoil did not install dependencies, execute repository code, send exploit payloads, or claim runtime compromise.',
    '',
    '## Decision',
    '',
    `**${headline}**`,
    '',
    repositoryScan
      ? `The repository scan separates recorded package presence from source-backed reachability across ${summary.packagesChecked || 0} packages. ${summary.declaredOnly || 0} checks were declared-only and ${summary.unknown || 0} need more evidence.`
      : `The case separates an affected dependency from a source-backed path. ${reached ? `${summary.declaredOnly || 0} repository${summary.declaredOnly === 1 ? '' : 'ies'} were declared-only and ${summary.notAffected || 0} were outside the affected range.` : 'The collected evidence does not support a stronger reachability claim.'}`,
    '',
    '## Repository findings',
    '',
    '| Repository | Verdict | Resolved version | Sampled imports | Fix check |',
    '| --- | --- | --- | ---: | --- |',
    ...findings.map((finding) => {
      const challenge = challenges.get(finding.repository)
      const resolved = finding.resolvedVersions?.length > 1 ? finding.resolvedVersions.join(', ') : finding.resolvedVersion
      return `| ${cell(repositoryName(finding.repository))} | ${cell(verdictLabel(finding.verdict))} | ${cell(resolved)} | ${finding.imports?.length || 0} | ${cell(fixLabel(challenge))} |`
    }),
    '',
    '## Smallest fix set',
    '',
    ...(report.smallestFixSet?.items?.length
      ? report.smallestFixSet.items.map((item, index) => `${index + 1}. **${cell(item.packageName)}@${cell(item.targetVersion)}** closes ${item.closesFindings} observed finding${item.closesFindings === 1 ? '' : 's'} across ${item.repositories.length} ${item.repositories.length === 1 ? 'repository' : 'repositories'}: ${item.repositories.map((repository) => cell(repositoryName(repository))).join(', ')}.`)
      : ['No verified fix set was computed from the collected findings.']),
    '',
    report.smallestFixSet?.note || 'Fix prioritization is based on observed evidence, not a mathematical minimum cut.',
    '',
    '## Cited evidence paths',
    '',
    ...findings.flatMap((finding) => {
      const proof = (finding.proof || []).filter((step) => step.kind !== 'temporal')
      const path = findingPath(finding)
      const sourceLines = proof.length
        ? proof.map((step) => `  - ${cell(step.label)} - ${step.source ? sourceLink(step.source) : 'source unavailable'}`)
        : [`  - ${cell(path)}`]
      return [`### ${cell(repositoryName(finding.repository))} · ${cell(verdictLabel(finding.verdict))}`, '', `**Path:** \`${path}\``, ...sourceLines, '', `**Reason:** ${text(finding.reason)}`, '']
    }),
    '## Provenance',
    '',
    ...findings.flatMap((finding) => {
      const observation = finding.pathObservation
      const owners = finding.codeOwners || []
      if (!observation && !owners.length) return []
      const lines = [`### ${cell(repositoryName(finding.repository))}`]
      if (observation) {
        lines.push(`- Lockfile path first observed: ${cell(observation.observedAt)}`)
        lines.push(`- Introducing commit: ${cell(observation.commit || 'not available')} · ${cell(observation.author || 'author unavailable')}`)
        lines.push(`- Commit subject: ${cell(observation.message || 'message unavailable')}`)
        lines.push(`- Boundary: ${cell(observation.caveat)}`)
      }
      if (owners.length) lines.push(`- Code owner at sampled import: ${owners.map(cell).join(', ')}`)
      lines.push('')
      return lines
    }),
    '## Temporal evidence',
    '',
    `- Advisory published: ${cell(report.advisory?.published)}`,
    `- Before-disclosure snapshot: ${cell(temporal.beforeAdvisory)}`,
    `- Current evidence snapshot: ${cell(temporal.currentAsOf || temporal.asOf)}`,
    `- Longest dated exposure: ${summary.exposureDays == null ? 'not dated' : `${summary.exposureDays} days before disclosure`}`,
    '',
    'The temporal view is rebuilt from dated repository evidence. It is not a relabelled copy of the current graph.',
    '',
    '## HydraDB record',
    '',
    `- Status: ${cell(hydra?.status || memory.status, 'not available')}`,
    `- Evidence memories: ${hydra?.memoryCount || 0}`,
    `- Dated facts recalled: ${memory.datedChunkCount || 0}`,
    `- Related cases: ${memory.relatedCaseCount || 0}`,
    `- Graph triplets returned: ${graphContext.tripletCount || 0}`,
    `- Current case graph: ${hydra?.graphVerification?.status || 'not verified'} · ${hydra?.graphVerification?.tripletCount || 0} scoped relations`,
    '',
    'HydraDB stores and recalls dated evidence context. It does not override the local source-backed verdict.',
    '',
    '## Limits and boundaries',
    '',
    ...(report.limits || ['Reachability is bounded to the collected public source sample.']),
    '',
    '## Sources',
    '',
    ...(allSources.length ? allSources.map(sourceLink) : ['No source URLs were collected.']),
    '',
    '---',
    '',
    'Generated by Recoil · source-backed supply-chain evidence',
  ]
  return `${lines.join('\n')}\n`
}
