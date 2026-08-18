import test from 'node:test'
import assert from 'node:assert/strict'
import { applySandboxControl, createSandboxState, probeSandbox, runRegressionSuite } from '../sandbox/fixture.js'

test('sandbox probe is vulnerable before a control and records execution', () => {
  const state = createSandboxState()
  const result = probeSandbox(state, 'route-to-customer-data', ['release', 'artifact', 'payments', 'customer-db'])

  assert.equal(result.executed, true)
  assert.equal(result.status, 'vulnerable')
  assert.equal(result.execution.statusCode, 200)
  assert.equal(result.execution.sensitiveData, true)
  assert.equal(state.lastProbe.probe, 'route-to-customer-data')
})

test('blocking promotion does not pretend an already-promoted artifact is fixed', () => {
  const state = createSandboxState()
  applySandboxControl(state, 'block-promotion')

  const result = probeSandbox(state, 'replay-promoted-artifact')

  assert.equal(result.status, 'vulnerable')
  assert.match(result.reason, /already-promoted/i)
})

test('upgrade fixes the local fixture and regression checks turn green', () => {
  const state = createSandboxState()
  applySandboxControl(state, 'upgrade')
  const result = probeSandbox(state, 'route-to-customer-data')
  const checks = runRegressionSuite(state)

  assert.equal(result.status, 'blocked')
  assert.equal(result.execution.statusCode, 403)
  assert.equal(checks.length, 3)
  assert.ok(checks.every((check) => check.status === 'passed'))
})
