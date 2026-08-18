const CUSTOMER_RECORD = Object.freeze({
  id: 'fixture-customer-001',
  marker: 'SENSITIVE_FIXTURE_RECORD',
  plan: 'enterprise',
})

function has(controls, id) {
  return controls.includes(id)
}

function blocked(reason, control, request) {
  return {
    statusCode: 403,
    sensitiveData: false,
    body: { error: 'blocked by fixture policy' },
    reason,
    control,
    request,
  }
}

/**
 * A tiny, owned application boundary. It is executable code, but has no
 * network, filesystem, child-process, or package-install path. Recoil's
 * probes call this handler just like a local service would.
 */
export function executeFixtureRequest({ probe, controls = [], revision = 0, path = [] }) {
  const request = {
    probe,
    revision,
    path,
    identity: 'untrusted-package-process',
    artifact: 'storefront-release-2026.08.18',
  }
  const quarantined = has(controls, 'quarantine')
  const safeRelease = has(controls, 'upgrade') || has(controls, 'restore')
  const artifactSafe = safeRelease || has(controls, 'revoke')

  if (quarantined) return blocked('The fixture process is quarantined before it reaches a sensitive handler.', 'quarantine', request)

  if (probe === 'read-runtime-secret') {
    if (safeRelease || has(controls, 'rotate-secrets')) return blocked('Runtime credentials were rotated before the request reached the secret store.', safeRelease ? 'upgrade' : 'rotate-secrets', request)
    return {
      statusCode: 200,
      sensitiveData: true,
      body: { marker: 'SENSITIVE_FIXTURE_RUNTIME_SECRET', scope: 'checkout-worker' },
      reason: 'The fixture accepted a credential-assisted runtime request.',
      control: null,
      request,
    }
  }

  if (probe === 'replay-promoted-artifact') {
    if (artifactSafe) return blocked('Artifact provenance or publisher trust was remediated before replay.', safeRelease ? 'upgrade' : 'revoke', request)
    return {
      statusCode: 200,
      sensitiveData: true,
      body: CUSTOMER_RECORD,
      reason: has(controls, 'block-promotion')
        ? 'Promotion is blocked, but the already-promoted artifact remains executable.'
        : 'The fixture replayed the existing promoted artifact.',
      control: null,
      request,
    }
  }

  if (safeRelease) return blocked('The upgraded release requires an authenticated service identity before customer data is returned.', 'upgrade', request)

  return {
    statusCode: 200,
    sensitiveData: true,
    body: CUSTOMER_RECORD,
    reason: 'The fixture route lacks the authorization boundary required by the customer-data handler.',
    control: null,
    request,
  }
}
