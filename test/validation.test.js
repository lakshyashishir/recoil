import test from 'node:test'
import assert from 'node:assert/strict'
import { buildEvidenceQuality, hasIncompleteEvidence, missingRequiredVerdicts } from '../src/core/validation.js'

test('validation requires complete evidence and rejects unknown findings', () => {
  const report = { repositories: [{ verdict: 'REACHED' }, { verdict: 'UNKNOWN' }] }
  assert.equal(hasIncompleteEvidence({ evidenceStatus: 'completed', report }), true)
  assert.equal(hasIncompleteEvidence({ evidenceStatus: 'partial', report: { repositories: [{ verdict: 'REACHED' }] } }), true)
  assert.equal(hasIncompleteEvidence({ evidenceStatus: 'completed', report: { repositories: [{ verdict: 'REACHED' }] } }), false)
})

test('contrast validation names the missing verdicts', () => {
  assert.deepEqual(missingRequiredVerdicts({ repositories: [{ verdict: 'REACHED' }] }), ['DECLARED_ONLY', 'NOT_AFFECTED'])
  assert.deepEqual(missingRequiredVerdicts({ repositories: [{ verdict: 'REACHED' }, { verdict: 'DECLARED_ONLY' }, { verdict: 'NOT_AFFECTED' }] }), [])
})

test('evidence quality marks a complete classified case as recording-ready', () => {
  const quality = buildEvidenceQuality({
    status: 'completed',
    collectors: [{ collector: 'advisory-resolver', status: 'completed' }],
    repositories: [
      { repository: 'example/reached', verdict: 'REACHED', sourceSampleSize: 3, sourceCandidateCount: 8 },
      { repository: 'example/fixed', verdict: 'NOT_AFFECTED', sourceSampleSize: 2, sourceCandidateCount: 2 },
    ],
  })
  assert.equal(quality.status, 'complete')
  assert.equal(quality.readyForRecording, true)
  assert.equal(quality.unknownFindings.length, 0)
  assert.deepEqual(quality.sourceCoverage, { sampledFiles: 5, candidateFiles: 10, repositories: 2, boundedRepositories: 1 })
})

test('evidence quality exposes incomplete collectors and mixed-version ambiguity', () => {
  const quality = buildEvidenceQuality({
    status: 'partial',
    collectors: [
      { collector: 'advisory-resolver', status: 'failed', error: 'OSV unavailable' },
      { collector: 'repository-extractor', status: 'completed', repository: 'example/app', manifest: { collection: { sourceFiles: { status: 'partial', error: 'GitHub rate limit' } } } },
    ],
    repositories: [{ repository: 'example/app', packageName: 'bytes', verdict: 'UNKNOWN', resolvedVersions: ['1.10.0', '1.11.1'], reason: 'different advisory states' }],
  })
  assert.equal(quality.status, 'partial')
  assert.equal(quality.readyForRecording, false)
  assert.equal(quality.collectorIssues.length, 2)
  assert.deepEqual(quality.ambiguousVersions[0].versions, ['1.10.0', '1.11.1'])
  assert.equal(hasIncompleteEvidence({ report: { evidenceQuality: quality } }), true)
  assert.equal(hasIncompleteEvidence({ evidenceStatus: 'partial', report: { evidenceQuality: { readyForRecording: true } } }), true)
})

test('repository inventory with no affected advisories is a complete negative result', () => {
  const quality = buildEvidenceQuality({
    status: 'completed',
    noFindingsIsValid: true,
    collectors: [
      { collector: 'advisory-resolver', status: 'completed' },
      { collector: 'registry-resolver', status: 'not_requested' },
    ],
    repositories: [],
  })
  assert.equal(quality.status, 'complete')
  assert.equal(quality.readyForRecording, true)
  assert.match(quality.reason, /no affected advisory/i)
})
