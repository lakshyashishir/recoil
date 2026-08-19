import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

test('strict real smoke rejects an under-specified recording query before collection', () => {
  const result = spawnSync(process.execPath, ['scripts/smoke-real.mjs'], {
    cwd: root,
    encoding: 'utf8',
    env: {
      ...process.env,
      RECOIL_SMOKE_REQUIRE_CONTRAST: '1',
      RECOIL_SMOKE_QUERY: 'GHSA-434x-w66g-qw3r https://github.com/example/repository',
      HYDRA_DB_API_KEY: '',
      HYDRADB_DATABASE_ID: '',
    },
  })
  assert.equal(result.status, 2)
  assert.match(result.stdout, /contrast mode requires 3 public GitHub repositories/)
})

test('strict smoke flag enforces the recording contract without environment toggles', () => {
  const result = spawnSync(process.execPath, ['scripts/smoke-real.mjs', '--strict'], {
    cwd: root,
    encoding: 'utf8',
    env: {
      ...process.env,
      RECOIL_SMOKE_QUERY: 'GHSA-434x-w66g-qw3r https://github.com/example/repository',
      HYDRA_DB_API_KEY: 'configured',
      HYDRADB_DATABASE_ID: 'database',
      RECOIL_SMOKE_REQUIRE_CONTRAST: '',
      RECOIL_SMOKE_REQUIRE_HYDRA: '',
    },
  })
  assert.equal(result.status, 2)
  assert.match(result.stdout, /contrast mode requires 3 public GitHub repositories/)
})

test('strict real smoke rejects a package-only query before collection', () => {
  const result = spawnSync(process.execPath, ['scripts/smoke-real.mjs'], {
    cwd: root,
    encoding: 'utf8',
    env: {
      ...process.env,
      RECOIL_SMOKE_REQUIRE_CONTRAST: '1',
      RECOIL_SMOKE_QUERY: 'npm:minimist https://github.com/example/one https://github.com/example/two https://github.com/example/three',
      HYDRA_DB_API_KEY: 'configured',
      HYDRADB_DATABASE_ID: 'database',
    },
  })
  assert.equal(result.status, 2)
  assert.match(result.stdout, /recording mode requires a GHSA\/CVE advisory ID/)
})

test('strict real smoke rejects missing HydraDB credentials before collection', () => {
  const result = spawnSync(process.execPath, ['scripts/smoke-real.mjs'], {
    cwd: root,
    encoding: 'utf8',
    env: {
      ...process.env,
      RECOIL_SMOKE_REQUIRE_HYDRA: '1',
      RECOIL_SMOKE_QUERY: 'GHSA-434x-w66g-qw3r https://github.com/example/repository',
      HYDRA_DB_API_KEY: '',
      HYDRADB_DATABASE_ID: '',
    },
  })
  assert.equal(result.status, 2)
  assert.match(result.stdout, /HydraDB recording is required/)
})
