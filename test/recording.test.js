import test from 'node:test'
import assert from 'node:assert/strict'
import { recordingBlockers, recordingPreflight } from '../src/core/recording.js'

test('recording preflight requires contrast repositories and HydraDB only in strict mode', () => {
  assert.deepEqual(recordingPreflight({ advisoryId: 'GHSA-test', repositoryCount: 1, hydraConfigured: false, requireContrast: true, requireHydra: true }), [
    'requires 3 public GitHub repositories; found 1',
    'requires HYDRA_DB_API_KEY and HYDRADB_DATABASE_ID',
  ])
  assert.deepEqual(recordingPreflight({ repositoryCount: 1, hydraConfigured: false }), [])
})

test('recording preflight rejects a package-only strict run before collection', () => {
  assert.deepEqual(recordingPreflight({ repositoryCount: 3, hydraConfigured: true, requireContrast: true, requireHydra: true }), [
    'requires a GHSA/CVE advisory ID for dated reachability and fixed-version proof',
  ])
})

test('recording blockers accept a complete contrast with HydraDB temporal recall', () => {
  const report = {
    evidenceQuality: { readyForRecording: true, reason: 'complete' },
    repositories: [{ verdict: 'REACHED' }, { verdict: 'DECLARED_ONLY' }, { verdict: 'NOT_AFFECTED' }],
  }
  assert.deepEqual(recordingBlockers({ report, evidenceStatus: 'completed', hydra: { status: 'persisted', memoryCount: 4, sourceIds: ['a', 'b', 'c', 'd'], recall: { status: 'recalled', datedChunkCount: 2, graphContext: { triplets: [{ source: 'package', predicate: 'RESOLVED_IN', target: 'repository' }] } } }, requireContrast: true, requireHydra: true }), [])
})

test('recording blockers reject a HydraDB read without graph triplets', () => {
  const report = {
    evidenceQuality: { readyForRecording: true, reason: 'complete' },
    repositories: [{ verdict: 'REACHED' }, { verdict: 'DECLARED_ONLY' }, { verdict: 'NOT_AFFECTED' }],
  }
  assert.deepEqual(recordingBlockers({ report, evidenceStatus: 'completed', hydra: { status: 'persisted', memoryCount: 4, sourceIds: ['a', 'b', 'c', 'd'], recall: { status: 'recalled', datedChunkCount: 2, graphContext: { triplets: [] } } }, requireContrast: true, requireHydra: true }), ['HydraDB graph recall returned no triplets'])
})

test('recording blockers reject an empty HydraDB temporal read', () => {
  const report = {
    evidenceQuality: { readyForRecording: true, reason: 'complete' },
    repositories: [{ verdict: 'REACHED' }, { verdict: 'DECLARED_ONLY' }, { verdict: 'NOT_AFFECTED' }],
  }
  assert.deepEqual(recordingBlockers({ report, evidenceStatus: 'completed', hydra: { status: 'persisted', memoryCount: 4, sourceIds: ['a', 'b', 'c', 'd'], recall: { status: 'recalled', datedChunkCount: 0 } }, requireContrast: true, requireHydra: true }), ['HydraDB temporal recall returned no dated facts'])
})

test('recording blockers reject a persisted case with no HydraDB memories', () => {
  const report = {
    evidenceQuality: { readyForRecording: true, reason: 'complete' },
    repositories: [{ verdict: 'REACHED' }, { verdict: 'DECLARED_ONLY' }, { verdict: 'NOT_AFFECTED' }],
  }
  assert.deepEqual(recordingBlockers({ report, evidenceStatus: 'completed', hydra: { status: 'persisted', memoryCount: 0, recall: { status: 'recalled', datedChunkCount: 2 } }, requireContrast: true, requireHydra: true }), ['HydraDB persisted zero evidence memories'])
})

test('recording blockers reject a partial HydraDB acknowledgement', () => {
  const report = {
    evidenceQuality: { readyForRecording: true, reason: 'complete' },
    repositories: [{ verdict: 'REACHED' }, { verdict: 'DECLARED_ONLY' }, { verdict: 'NOT_AFFECTED' }],
  }
  assert.deepEqual(recordingBlockers({ report, evidenceStatus: 'completed', hydra: { status: 'persisted', memoryCount: 4, sourceIds: ['a', 'b'], recall: { status: 'recalled', datedChunkCount: 2 } }, requireContrast: true, requireHydra: true }), ['HydraDB acknowledged 2/4 evidence memories'])
})

test('recording blockers preserve incomplete evidence and HydraDB failures', () => {
  const report = { evidenceQuality: { readyForRecording: false, reason: 'one repository is unknown' }, repositories: [{ verdict: 'UNKNOWN' }] }
  const blockers = recordingBlockers({ report, evidenceStatus: 'partial', hydra: { status: 'failed', recall: { status: 'failed' } }, requireContrast: true, requireHydra: true })
  assert.deepEqual(blockers, [
    'one repository is unknown',
    'missing contrast verdicts: REACHED, DECLARED_ONLY, NOT_AFFECTED',
    'HydraDB write failed',
    'HydraDB write status is failed',
    'HydraDB temporal read status is failed',
  ])
})
