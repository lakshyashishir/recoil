import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// Mocked GitHub responses must never land in the developer's real evidence
// cache. This keeps `npm test` and `npm run verify` safe to run before a live
// recording, while individual cache tests can still override the directory.
const cacheDir = mkdtempSync(join(tmpdir(), 'recoil-test-cache-'))
process.env.RECOIL_CACHE_DIR = cacheDir
process.on('exit', () => rmSync(cacheDir, { recursive: true, force: true }))
