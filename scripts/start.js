import { spawn } from 'node:child_process'

import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

function sharedEnvValue(file, name) {
  if (!existsSync(file)) return ''
  const line = readFileSync(file, 'utf8').split(/\r?\n/).find((item) => item.startsWith(`${name}=`))
  return line ? line.slice(name.length + 1).trim().replace(/^['"]|['"]$/g, '') : ''
}

const sharedEnvFile = process.env.RECOIL_SHARED_ENV_FILE || fileURLToPath(new URL('../../claimtrace/.env', import.meta.url))
const serverEnv = { ...process.env }
if (!serverEnv.OPENAI_API_KEY) {
  const sharedKey = sharedEnvValue(sharedEnvFile, 'OPENAI_API_KEY')
  const sharedModel = sharedEnvValue(sharedEnvFile, 'OPENAI_MODEL')
  if (sharedKey) serverEnv.OPENAI_API_KEY = sharedKey
  if (sharedModel && !serverEnv.OPENAI_MODEL) serverEnv.OPENAI_MODEL = sharedModel
}

const children = [
  spawn(process.execPath, ['--env-file-if-exists=.env', 'server/index.js'], { stdio: 'inherit', env: serverEnv }),
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
