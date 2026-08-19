import test from 'node:test'
import assert from 'node:assert/strict'
import { buildEvidenceBrief } from '../src/core/brief.js'

test('evidence brief is a human handoff over the computed report', () => {
  const brief = buildEvidenceBrief({
    scenarioId: 'case-brief-1',
    query: 'GHSA-test https://github.com/example/app',
    report: {
      generatedAt: '2026-08-20T00:00:00.000Z',
      package: 'minimist',
      advisory: { id: 'GHSA-test', published: '2026-01-01T00:00:00.000Z', sourceUrl: 'https://osv.dev/vulnerability/GHSA-test' },
      summary: { totalRepositories: 1, reached: 1, declaredOnly: 0, notAffected: 0, unknown: 0, exposureDays: 21 },
      repositories: [{
        repository: 'example/app',
        repositoryUrl: 'https://github.com/example/app',
        packageName: 'minimist',
        resolvedVersion: '1.2.5',
        verdict: 'REACHED',
        reason: 'A sampled source file imports minimist.',
        path: ['GHSA-test', 'minimist@1.2.5', 'example/app', 'src/cli.js'],
        imports: [{ path: 'src/cli.js', line: 4, sourceUrl: 'https://github.com/example/app/blob/HEAD/src/cli.js' }],
        lockfileSource: 'https://github.com/example/app/blob/HEAD/package-lock.json',
        evidenceSources: ['https://github.com/example/app/blob/HEAD/package-lock.json'],
        proof: [
          { kind: 'advisory', label: 'GHSA-test', source: 'https://osv.dev/vulnerability/GHSA-test' },
          { kind: 'resolution', label: 'minimist@1.2.5', source: 'https://github.com/example/app/blob/HEAD/package-lock.json' },
          { kind: 'repository', label: 'example/app', source: 'https://github.com/example/app' },
          { kind: 'import', label: 'src/cli.js:4', source: 'https://github.com/example/app/blob/HEAD/src/cli.js' },
        ],
      }],
      challenge: [{ repository: 'example/app', status: 'FIX_SURVIVES', proposedVersion: '1.2.6' }],
      rewind: { beforeAdvisory: '2025-12-31T00:00:00.000Z', currentAsOf: '2026-08-20T00:00:00.000Z', memory: { status: 'recalled', datedChunkCount: 2, relatedCaseCount: 1, graphContext: { tripletCount: 3 } } },
      limits: ['Source sampling is bounded.'],
      sources: ['https://osv.dev/vulnerability/GHSA-test'],
    },
    hydra: { status: 'persisted', memoryCount: 4 },
  })

  assert.match(brief, /# Recoil evidence brief/)
  assert.match(brief, /1 of 1 repositories reach sampled vulnerable code/)
  assert.match(brief, /21 days before disclosure/)
  assert.match(brief, /Upgrade to 1\.2\.6 \(verified\)/)
  assert.match(brief, /GHSA-test.*minimist@1\.2\.5.*example\/app/s)
  assert.match(brief, /Graph triplets returned: 3/)
  assert.match(brief, /Source sampling is bounded\./)
  assert.match(brief, /https:\/\/github\.com\/example\/app\/blob\/HEAD\/src\/cli\.js/)
})

test('missing report does not produce a case brief', () => {
  assert.equal(buildEvidenceBrief({ scenarioId: 'empty' }), null)
})

