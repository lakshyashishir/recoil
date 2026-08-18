import { spawnSync } from 'node:child_process'

const checks = [
  ['tests', ['run', 'test']],
  ['evidence benchmark', ['run', 'benchmark']],
  ['production build', ['run', 'build']],
]

for (const [label, args] of checks) {
  console.log(`\n[verify] ${label}`)
  const result = spawnSync('npm', args, { stdio: 'inherit', env: process.env })
  if (result.error) {
    console.error(`[verify] ${label} could not start: ${result.error.message}`)
    process.exit(1)
  }
  if (result.status !== 0) {
    console.error(`[verify] ${label} failed with exit code ${result.status}`)
    process.exit(result.status || 1)
  }
}

console.log('\n[verify] all checks passed')

