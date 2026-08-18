import { executeFixtureRequest } from './fixture-app.js'

const DEFAULT_FIXTURE = 'fixture/storefront-api'

export const SANDBOX_PROBES = [
  { id: 'route-to-customer-data', title: 'Follow the package route to customer data' },
  { id: 'replay-promoted-artifact', title: 'Replay the promoted artifact path' },
  { id: 'read-runtime-secret', title: 'Attempt credential-assisted runtime access' },
]

export function createSandboxState({ fixture = DEFAULT_FIXTURE } = {}) {
  return {
    fixture,
    revision: 0,
    controls: [],
    lastProbe: null,
    regression: [],
  }
}

export function probeSandbox(state, probeId = 'route-to-customer-data', path = []) {
  const execution = executeFixtureRequest({ probe: probeId, controls: state.controls, revision: state.revision, path })
  const vulnerable = execution.sensitiveData

  const result = {
    executed: true,
    fixture: state.fixture,
    revision: state.revision,
    probe: probeId,
    path,
    status: vulnerable ? 'vulnerable' : 'blocked',
    reason: execution.reason,
    target: vulnerable ? 'customer-data' : 'no sensitive target reached',
    execution: {
      statusCode: execution.statusCode,
      sensitiveData: execution.sensitiveData,
      request: execution.request,
    },
  }
  state.lastProbe = result
  return result
}

export function applySandboxControl(state, actionId) {
  if (!actionId || state.controls.includes(actionId)) return { applied: false, controls: state.controls }
  state.controls = [...state.controls, actionId]
  state.revision += 1
  return { applied: true, action: actionId, revision: state.revision, controls: state.controls }
}

export function runRegressionSuite(state) {
  const checks = SANDBOX_PROBES.map((probe) => {
    const result = probeSandbox(state, probe.id)
    return {
      id: probe.id,
      title: probe.title,
      status: result.status === 'blocked' ? 'passed' : 'failed',
      detail: result.reason,
    }
  })
  state.regression = checks
  return checks
}

export function sandboxSummary(state) {
  return {
    fixture: state.fixture,
    revision: state.revision,
    controls: state.controls,
    lastProbe: state.lastProbe,
    passingChecks: state.regression.filter((check) => check.status === 'passed').length,
    totalChecks: state.regression.length,
    boundary: 'local disposable fixture; no public target execution',
  }
}
