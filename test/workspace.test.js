import test from 'node:test'
import assert from 'node:assert/strict'
import { answerWorkspaceQuestion, buildFleetGraph, buildIncidentGraph, buildIncidents, normalizedRepository } from '../server/workspace.js'

function record(id, completedAt, verdict, repository = 'acme/app', advisoryId = 'GHSA-AAAA-BBBB-CCCC') {
  return {
    id,
    investigation: {
      status: 'complete',
      completedAt,
      evidence: { repositories: [{ repository, repositoryUrl: `https://github.com/${repository}` }] },
      report: {
        mode: 'advisory',
        advisory: { id: advisoryId, summary: 'Prototype pollution', sourceUrl: `https://osv.dev/vulnerability/${advisoryId}` },
        advisories: [{ id: advisoryId, summary: 'Prototype pollution', sourceUrl: `https://osv.dev/vulnerability/${advisoryId}` }],
        repositories: [{
          repository,
          repositoryUrl: `https://github.com/${repository}`,
          advisoryId,
          packageName: 'minimist',
          resolvedVersion: '1.2.5',
          verdict,
          imports: verdict === 'REACHED' ? [{ path: 'src/index.js', line: 8, owners: ['@security'], sourceUrl: `https://github.com/${repository}/blob/HEAD/src/index.js` }] : [],
        }],
        challenge: [{ repository, advisoryId, status: 'FIX_SURVIVES', proposedVersion: '1.2.6' }],
        graph: {
          nodes: [
            { id: `advisory:${advisoryId}`, label: advisoryId, type: 'advisory' },
            { id: 'package:minimist@1.2.5', label: 'minimist@1.2.5', type: 'package' },
            { id: `repo:${repository}`, label: repository, type: 'repository' },
          ],
          edges: [[`advisory:${advisoryId}`, 'package:minimist@1.2.5'], ['package:minimist@1.2.5', `repo:${repository}`]],
        },
      },
    },
  }
}

function repositorySnapshot(id, completedAt, repository, graph) {
  return {
    id,
    investigation: {
      status: 'complete',
      completedAt,
      evidence: { repositories: [{ repository, repositoryUrl: `https://github.com/${repository}` }] },
      report: { mode: 'repository', repositories: [], graph },
    },
  }
}

test('repository identity remains stable across URLs and refs', () => {
  assert.equal(normalizedRepository('https://github.com/Acme/App/tree/v1.0.0'), 'acme/app')
  assert.equal(normalizedRepository('acme/app@v1.0.0'), 'acme/app')
})

test('incidents retain only the latest verdict for each repository', () => {
  const incidents = buildIncidents([
    record('old', '2026-08-19T00:00:00Z', 'REACHED'),
    record('new', '2026-08-20T00:00:00Z', 'NOT_AFFECTED'),
  ])
  assert.equal(incidents.length, 1)
  assert.equal(incidents[0].status, 'clear')
  assert.equal(incidents[0].summary.reached, 0)
  assert.equal(incidents[0].summary.notAffected, 1)
  assert.equal(incidents[0].findings[0].caseId, 'new')
})

test('a newer repository inventory retires advisory findings absent from that snapshot', () => {
  const records = [
    record('old-advisory', '2026-08-19T00:00:00Z', 'REACHED'),
    repositorySnapshot('new-inventory', '2026-08-20T00:00:00Z', 'acme/app', {
      nodes: [{ id: 'repo:acme/app', label: 'acme/app', type: 'repository' }],
      edges: [],
    }),
  ]
  assert.deepEqual(buildIncidents(records), [])
})

test('fleet graph uses each watch latest case without leaking a stale sibling repository', () => {
  const advisoryId = 'GHSA-AAAA-BBBB-CCCC'
  const old = record('shared-case', '2026-08-19T00:00:00Z', 'REACHED', 'acme/app@v1', advisoryId)
  old.investigation.evidence.repositories.push({ repository: 'other/service', repositoryUrl: 'https://github.com/other/service' })
  old.investigation.report.repositories.push({
    ...old.investigation.report.repositories[0],
    repository: 'other/service',
    repositoryUrl: 'https://github.com/other/service',
    verdict: 'DECLARED_ONLY',
    imports: [],
  })
  old.investigation.report.graph.nodes.push({ id: 'repo:other/service', label: 'other/service', type: 'repository' })
  old.investigation.report.graph.edges.push(['package:minimist@1.2.5', 'repo:other/service'])
  const current = repositorySnapshot('current-acme', '2026-08-20T00:00:00Z', 'acme/app', {
    nodes: [
      { id: 'package:current@2.0.0', label: 'current@2.0.0', type: 'package', meta: { repository: 'acme/app' } },
      { id: 'repo:acme/app', label: 'acme/app', type: 'repository' },
    ],
    edges: [['package:current@2.0.0', 'repo:acme/app']],
  })
  const records = [old, current]
  const watches = [
    { repository: 'acme/app', latestCaseId: 'current-acme' },
    { repository: 'other/service', latestCaseId: 'shared-case' },
  ]
  const fleet = buildFleetGraph(records, watches, buildIncidents(records))
  assert.ok(fleet.nodes.some((node) => node.id === 'repo:acme/app'))
  assert.ok(fleet.nodes.some((node) => node.id === 'repo:other/service'))
  assert.ok(!fleet.nodes.some((node) => node.id === 'repo:acme/app@v1'))
  assert.ok(fleet.edges.every((edge) => edge.repositories.length === 1))
})

test('fleet and incident graphs are computed from evidence records', () => {
  const records = [record('current', '2026-08-20T00:00:00Z', 'REACHED')]
  const incidents = buildIncidents(records)
  const watches = [{ repository: 'acme/app', latestCaseId: 'current' }]
  const fleet = buildFleetGraph(records, watches, incidents)
  const incident = buildIncidentGraph(records, 'GHSA-AAAA-BBBB-CCCC')
  assert.equal(fleet.nodes.length, 3)
  assert.equal(fleet.edges.length, 2)
  assert.equal(incident.nodes.length, 3)
  assert.equal(incident.edges.length, 2)
})

test('workspace questions return typed, cited rows', () => {
  const incidents = buildIncidents([record('current', '2026-08-20T00:00:00Z', 'REACHED')])
  const answer = answerWorkspaceQuestion('Who owns the reached path?', { incidents, repositories: [] })
  assert.equal(answer.intent, 'owners')
  assert.equal(answer.rows[0].secondary, '@security')
  assert.match(answer.rows[0].source, /src\/index\.js/)
})

test('workspace questions remain bounded to the selected repository', () => {
  const incidents = buildIncidents([
    record('acme', '2026-08-20T00:00:00Z', 'REACHED', 'acme/app'),
    record('other', '2026-08-20T00:00:00Z', 'REACHED', 'other/service'),
  ])
  const workspace = {
    incidents,
    repositories: [
      { repository: 'acme/app', scanCount: 2, needsAction: 1 },
      { repository: 'other/service', scanCount: 3, needsAction: 1 },
    ],
  }
  const answer = answerWorkspaceQuestion('Who owns the reached path?', workspace, { type: 'repository', value: 'other/service' })
  assert.equal(answer.rows.length, 1)
  assert.equal(answer.rows[0].primary, 'other/service')
})
