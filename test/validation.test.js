import test from 'node:test'
import assert from 'node:assert/strict'
import { hasIncompleteEvidence, missingRequiredVerdicts } from '../src/core/validation.js'

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
