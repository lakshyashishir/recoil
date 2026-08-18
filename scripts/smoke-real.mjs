import { mkdir, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { parseGitHubRepositories, runMultiRepositoryIngestion } from '../server/collectors.js'
import { buildInvestigationReport } from '../src/core/investigation.js'
import { persistInvestigation, recallTemporal } from '../server/hydra.js'
import { buildEvidenceReceipt } from '../src/core/receipt.js'
import { recordingBlockers, recordingPreflight } from '../src/core/recording.js'

const query = process.env.RECOIL_SMOKE_QUERY || 'GHSA-434x-w66g-qw3r https://github.com/hydra-db/hydradb'
const scenarioId = process.env.RECOIL_SMOKE_SCENARIO || `real-${Date.now()}`
const requiredContrast = process.env.RECOIL_SMOKE_REQUIRE_CONTRAST === '1'
const requiredHydra = process.env.RECOIL_SMOKE_REQUIRE_HYDRA === '1' || requiredContrast
const receiptPath = process.env.RECOIL_SMOKE_RECEIPT || `.recoil-recordings/${scenarioId}.json`

function print(label, value) {
  console.log(`${label.padEnd(12)} ${value}`)
}

const repositoryCount = parseGitHubRepositories(query).length
const preflightBlockers = recordingPreflight({
  repositoryCount,
  hydraConfigured: Boolean(process.env.HYDRA_DB_API_KEY && process.env.HYDRADB_DATABASE_ID),
  requireContrast: requiredContrast,
  requireHydra: requiredHydra,
})
if (preflightBlockers.length) {
  const messages = preflightBlockers.map((blocker) => blocker.startsWith('requires 3 public GitHub repositories')
    ? `contrast mode ${blocker}`
    : blocker.startsWith('requires HYDRA_DB_API_KEY')
      ? 'HydraDB recording is required; set HYDRA_DB_API_KEY and HYDRADB_DATABASE_ID'
      : blocker)
  print('preflight', messages.join(' · '))
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
const graphContext = recall.graphContext || {}
const graphTriplets = graphContext.tripletCount ?? graphContext.triplets?.length ?? 0
print('hydra', `${hydra.status} · read ${recall.status || 'not-run'} · ${hydra.memoryCount || 0} memories · ${recall.datedChunkCount || 0} dated facts · ${recall.priorScenarioIds?.length || 0} prior cases · ${graphTriplets} graph triplets`)
if (hydra.error) print('hydra-error', hydra.error)
if (hydra.indexingError) print('hydra-index', hydra.indexingError)
if (recall.error) print('hydra-read', recall.error)
if (requiredHydra && hydra.status !== 'persisted') print('hydra-gate', `required completed indexing, received ${hydra.status}`)
if (requiredHydra && recall.status !== 'recalled') print('hydra-gate', `required temporal recall, received ${recall.status}`)
print('sources', `${report.sources?.length || 0} public URLs`)
print('boundary', 'no install · no repository execution · no exploit payload')

const blockers = recordingBlockers({ report, evidenceStatus: ingestion.status, hydra: { ...hydra, recall }, requireContrast: requiredContrast, requireHydra: requiredHydra })
for (const blocker of blockers) print('gate', blocker)
if (requiredContrast && blockers.some((blocker) => blocker.startsWith('missing contrast'))) print('contrast', blockers.find((blocker) => blocker.startsWith('missing contrast')))
if (!blockers.length) {
  const receipt = buildEvidenceReceipt({ scenarioId, query, report, hydra: { ...hydra, recall } })
  await mkdir(dirname(receiptPath), { recursive: true })
  await writeFile(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`)
  print('receipt', receiptPath)
}
if (blockers.length) process.exitCode = 1
