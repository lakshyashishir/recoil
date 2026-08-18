import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'

const root = resolve(new URL('..', import.meta.url).pathname)

test('CLI recording mode fails before contacting the API when preflight is incomplete', () => {
  const result = spawnSync(process.execPath, ['cli/recoil.js', 'GHSA-test https://github.com/example/one', '--recording'], {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, HYDRA_DB_API_KEY: '', HYDRADB_DATABASE_ID: '' },
  })
  assert.equal(result.status, 1)
  assert.match(result.stderr, /Recording preflight failed/)
  assert.match(result.stderr, /requires 3 public GitHub repositories/)
  assert.match(result.stderr, /requires HYDRA_DB_API_KEY and HYDRADB_DATABASE_ID/)
})
