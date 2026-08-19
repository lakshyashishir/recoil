import { spawnSync } from 'node:child_process'
import { unlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const output = join(tmpdir(), `recoil-tui-verify-${process.pid}.js`)
let result
try {
  result = spawnSync('bun', ['build', 'tui/index.tsx', '--outfile', output, '--target', 'bun', '--no-bundle'], { stdio: 'inherit' })
} finally {
  try { unlinkSync(output) } catch {}
}

if (result?.error) {
  console.error(`[verify] TUI build could not start: ${result.error.message}`)
  process.exit(1)
}
if (result?.status !== 0) {
  console.error(`[verify] TUI build failed with exit code ${result?.status}`)
  process.exit(result?.status || 1)
}
