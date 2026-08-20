import test from 'node:test'
import assert from 'node:assert/strict'
import { answerWorkspaceQuestion, buildFleetGraph, buildIncidentGraph, buildIncidents, normalizedRepository } from '../server/workspace.js'

function record(id, completedAt, verdict, repository = 'acme/app', advisoryId = 'GHSA-AAAA-BBBB-CCCC') {
  return {
    id,
    investigation: {
      status: 'complete',
      completedAt,
      report: {
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
