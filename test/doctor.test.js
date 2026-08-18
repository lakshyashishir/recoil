import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'

const root = resolve(new URL('..', import.meta.url).pathname)

function run(args, env = {}) {
  return spawnSync(process.execPath, ['scripts/doctor.mjs', ...args], {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, ...env },
  })
}

test('doctor can validate local replay without network calls', () => {
  const result = run([], { HYDRA_DB_API_KEY: '', HYDRADB_DATABASE_ID: '', RECOIL_DOCTOR_QUERY: '' })
  assert.equal(result.status, 0)
  assert.match(result.stdout, /READY FOR LOCAL REPLAY/)
  assert.match(result.stdout, /not probed/)
})

test('doctor recording mode catches missing contrast and HydraDB configuration', () => {
  const result = run(['--recording', 'GHSA-test https://github.com/example/one'], { HYDRA_DB_API_KEY: '', HYDRADB_DATABASE_ID: '' })
  assert.equal(result.status, 1)
  assert.match(result.stdout, /needs 3 public GitHub repositories/)
  assert.match(result.stdout, /needs HYDRA_DB_API_KEY and HYDRADB_DATABASE_ID/)
})

test('doctor accepts a fully specified recording preflight without contacting services', () => {
  const result = run(['--recording', 'GHSA-test https://github.com/example/one https://github.com/example/two https://github.com/example/three'], {
    HYDRA_DB_API_KEY: 'configured',
    HYDRADB_DATABASE_ID: 'database',
  })
  assert.equal(result.status, 0)
  assert.match(result.stdout, /READY TO RUN RECORDING GATE/)
})
