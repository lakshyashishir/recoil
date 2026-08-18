import { parseGitHubRepositories, runMultiRepositoryIngestion } from '../server/collectors.js'
import { buildInvestigationReport } from '../src/core/investigation.js'
import { persistInvestigation, recallTemporal } from '../server/hydra.js'
import { missingRequiredVerdicts } from '../src/core/validation.js'

const query = process.env.RECOIL_SMOKE_QUERY || 'GHSA-434x-w66g-qw3r https://github.com/hydra-db/hydradb'
const scenarioId = process.env.RECOIL_SMOKE_SCENARIO || `real-${Date.now()}`
const requiredContrast = process.env.RECOIL_SMOKE_REQUIRE_CONTRAST === '1'
const requiredHydra = process.env.RECOIL_SMOKE_REQUIRE_HYDRA === '1' || requiredContrast

function print(label, value) {
  console.log(`${label.padEnd(12)} ${value}`)
}

const repositoryCount = parseGitHubRepositories(query).length
if (requiredContrast && repositoryCount < 3) {
  print('preflight', `contrast mode requires 3 public GitHub repositories; found ${repositoryCount}`)
  process.exit(2)
}
if (requiredHydra && (!process.env.HYDRA_DB_API_KEY || !process.env.HYDRADB_DATABASE_ID)) {
  print('preflight', 'HydraDB recording is required; set HYDRA_DB_API_KEY and HYDRADB_DATABASE_ID')
  process.exit(2)
}

const ingestion = await runMultiRepositoryIngestion({ query, scenarioId })
const report = buildInvestigationReport(ingestion)
const hydra = await persistInvestigation(ingestion, report).catch((error) => ({ status: 'failed', error: error.message, memoryCount: 0 }))
const recall = ['persisted', 'queued'].includes(hydra.status)
  ? await recallTemporal([query, report.package, report.advisory?.id].filter(Boolean).join(' '), report.rewind.currentAsOf, undefined, { excludeScenarioId: scenarioId }).catch((error) => ({ status: 'failed', error: error.message, chunks: [] }))
  : { status: hydra.status, chunks: [] }

print('RECOIL', 'real evidence smoke')
print('target', query)
print('status', ingestion.status)
print('advisory', report.advisory?.id || 'unresolved')
print('package', report.package || 'unresolved')
for (const collector of ingestion.collectors || []) {
  print(`collector:${collector.collector}`, `${collector.status}${collector.error ? ` · ${collector.error}` : ''}`)
}
for (const finding of report.repositories || []) {
  print('finding', `${finding.verdict} · ${finding.repository} · ${finding.packageName || 'package'}@${finding.resolvedVersion || 'unresolved'} · ${finding.sourceSampleSize || 0} source files · ${finding.imports?.length || 0} imports`)
}
for (const fix of report.challenge || []) print('fix', `${fix.status} · ${fix.repository} · ${fix.proposedVersion || 'no fixed version'}`)
print('rewind', `${report.rewind?.currentAsOf?.slice(0, 10) || 'undated'} current · ${report.rewind?.beforeAdvisory?.slice(0, 10) || 'unavailable'} before advisory`)
print('hydra', `${hydra.status} · ${hydra.memoryCount || 0} memories · ${recall.datedChunkCount || 0} dated facts · ${recall.priorScenarioIds?.length || 0} prior cases`)
if (hydra.error) print('hydra-error', hydra.error)
print('sources', `${report.sources?.length || 0} public URLs`)
print('boundary', 'no install · no repository execution · no exploit payload')

const hasUnresolvedFinding = (report.repositories || []).some((finding) => finding.verdict === 'UNKNOWN')
const missingContrast = missingRequiredVerdicts(report)
if (requiredContrast && missingContrast.length) print('contrast', `missing ${missingContrast.join(', ')}`)
if (requiredHydra && !['persisted', 'queued'].includes(hydra.status)) print('hydra-gate', `required persistence, received ${hydra.status}`)
if (ingestion.status !== 'completed' || hasUnresolvedFinding || hydra.status === 'failed' || requiredHydra && !['persisted', 'queued'].includes(hydra.status) || missingContrast.length && requiredContrast) process.exitCode = 1
