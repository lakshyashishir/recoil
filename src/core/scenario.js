export const NODES = [
  { id: 'release', label: 'ua-parser-js@0.7.29', type: 'package', meta: 'compromised release', x: 16, y: 43 },
  { id: 'resolver', label: 'npm semver resolver', type: 'resolver', meta: 'transitive edge', x: 36, y: 43 },
  { id: 'repo', label: 'fixture / storefront-api', type: 'repo', meta: 'synthetic demo repo', x: 56, y: 26 },
  { id: 'payments', label: 'payments-worker', type: 'service', meta: 'deployed · us-east-1', x: 77, y: 18 },
  { id: 'gateway', label: 'api-gateway', type: 'service', meta: 'deployed · eu-west-1', x: 77, y: 42 },
  { id: 'runner', label: 'github-actions runner', type: 'infra', meta: 'shared infrastructure', x: 56, y: 68 },
  { id: 'maintainer', label: 'maintainer: devtools-labs', type: 'person', meta: 'shared publisher', x: 35, y: 76 },
]

export const EDGES = [
  ['release', 'resolver'],
  ['resolver', 'repo'],
  ['repo', 'payments'],
  ['repo', 'gateway'],
  ['release', 'runner'],
  ['runner', 'payments'],
  ['maintainer', 'release'],
]

export const INTERVENTIONS = [
  { id: 'upgrade', title: 'Upgrade ua-parser-js', description: 'Move to 0.7.30 or later', cost: 1, reduction: 58 },
  { id: 'quarantine', title: 'Quarantine storefront-api', description: 'Stop release promotion', cost: 2, reduction: 28 },
  { id: 'revoke', title: 'Revoke publisher', description: 'Invalidate shared maintainer trust', cost: 3, reduction: 18 },
]

export const EVENTS = [
  { id: 'armed', label: 'Scenario armed', detail: 'CVE-2021-4229 seeded as attack source' },
  { id: 'resolved', label: 'Package graph resolved', detail: '38 package versions · 7 dependency edges' },
  { id: 'propagated', label: 'Propagation path found', detail: 'ua-parser-js → lockfile → storefront-api' },
  { id: 'exposure', label: 'Exposure window calculated', detail: '14 May 09:00 → 16 May 17:42 UTC' },
  { id: 'ready', label: 'Containment search ready', detail: '3 interventions · budget 5' },
]

export const SCENARIO = {
  id: '0017',
  query: 'CVE-2021-4229  /  fixture/storefront-api',
  advisory: 'CVE-2021-4229 / GHSA-pjwm-rvh2-c87w',
  graphVersion: 'v0.4.2',
}

export function createInitialState() {
  return {
    running: false,
    eventIndex: 0,
    selectedActions: ['upgrade'],
    selectedNode: 'release',
  }
}

export function isComplete(state) {
  return state.eventIndex >= EVENTS.length
}

export function getReduction(state) {
  return state.selectedActions.reduce((sum, id) => sum + (INTERVENTIONS.find((item) => item.id === id)?.reduction || 0), 0)
}

export function getExposure(state) {
  return Math.max(4, 100 - getReduction(state))
}

export function getActiveNodeIds(state) {
  const active = new Set(['release'])
  if (state.eventIndex >= 2) active.add('resolver')
  if (state.eventIndex >= 3) active.add('repo')
  if (state.eventIndex >= 4) {
    active.add('payments')
    active.add('gateway')
    active.add('runner')
  }
  if (state.selectedActions.includes('upgrade')) active.delete('payments')
  if (state.selectedActions.includes('quarantine')) active.delete('repo')
  return active
}

export function advanceState(state) {
  return { ...state, eventIndex: Math.min(EVENTS.length, state.eventIndex + 1) }
}

export function toggleAction(state, id) {
  const selectedActions = state.selectedActions.includes(id)
    ? state.selectedActions.filter((item) => item !== id)
    : [...state.selectedActions, id]
  return { ...state, selectedActions }
}
