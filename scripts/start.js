import { spawn } from 'node:child_process'

const children = [
  spawn(process.execPath, ['--env-file-if-exists=.env', 'server/index.js'], { stdio: 'inherit' }),
  spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1'], { stdio: 'inherit' }),
]

let stopping = false

function stop(code = 0) {
  if (stopping) return
  stopping = true
  children.forEach((child) => child.kill('SIGTERM'))
  setTimeout(() => process.exit(code), 200)
}

process.on('SIGINT', () => stop(0))
process.on('SIGTERM', () => stop(0))
children.forEach((child) => child.on('exit', (code) => {
  if (!stopping) stop(code || 0)
}))
