import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { WorkspaceStore } from '../server/workspace-store.js'

test('workspace store preserves the operational snapshot locally', () => {
  const directory = mkdtempSync(join(tmpdir(), 'recoil-workspace-'))
  const file = join(directory, 'workspace.json')
  const store = new WorkspaceStore({ file })
  const payload = { schema: 'recoil.workspace/v2', updatedAt: '2026-08-21T00:00:00.000Z', watches: [{ id: 'repo-example' }], records: [] }

  store.save(payload)

  assert.deepEqual(store.loadLocal(), payload)
  assert.deepEqual(JSON.parse(readFileSync(file, 'utf8')), payload)
  assert.equal(store.status().mode, 'local')
  assert.equal(store.status().durable, false)
})

test('workspace store restores and updates an S3 snapshot', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'recoil-workspace-s3-'))
  const file = join(directory, 'workspace.json')
  const restored = { schema: 'recoil.workspace/v2', updatedAt: '2026-08-20T00:00:00.000Z', watches: [], records: [{ id: 'case-1' }] }
  const sent = []
  const client = {
    async send(command) {
      sent.push(command)
      if (sent.length === 1) return { Body: { transformToString: async () => JSON.stringify(restored) }, LastModified: new Date(restored.updatedAt) }
      return {}
    },
  }
  const store = new WorkspaceStore({ file, bucket: 'recoil-demo', key: 'workspace.json', client })

  assert.deepEqual(await store.loadRemote(), restored)
  const next = { ...restored, updatedAt: '2026-08-21T00:00:00.000Z' }
  store.save(next)
  await store.remoteQueue

  assert.equal(sent.length, 2)
  assert.equal(store.status().mode, 's3')
  assert.equal(store.status().status, 'ready')
  assert.deepEqual(store.loadLocal(), next)
})
