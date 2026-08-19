import { spawn } from 'node:child_process'

import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

function sharedEnvValue(file, name) {
  if (!existsSync(file)) return ''
  const line = readFileSync(file, 'utf8').split(/\r?\n/).find((item) => item.startsWith(`${name}=`))
  return line ? line.slice(name.length + 1).trim().replace(/^['"]|['"]$/g, '') : ''
}

const sharedEnvFile = process.env.RECOIL_SHARED_ENV_FILE || fileURLToPath(new URL('../../claimtrace/.env', import.meta.url))
const localEnvFile = fileURLToPath(new URL('../.env', import.meta.url))
const serverEnv = { ...process.env }
const host = process.env.RECOIL_HOST || sharedEnvValue(localEnvFile, 'RECOIL_HOST') || '127.0.0.1'
const viteHost = process.env.RECOIL_VITE_HOST || host
serverEnv.RECOIL_HOST = host
if (!serverEnv.OPENAI_API_KEY) {
  const sharedKey = sharedEnvValue(sharedEnvFile, 'OPENAI_API_KEY')
  const sharedModel = sharedEnvValue(sharedEnvFile, 'OPENAI_MODEL')
  if (sharedKey) serverEnv.OPENAI_API_KEY = sharedKey
  if (sharedModel && !serverEnv.OPENAI_MODEL) serverEnv.OPENAI_MODEL = sharedModel
}

const children = [
  spawn(process.execPath, ['--env-file-if-exists=.env', 'server/index.js'], { stdio: 'inherit', env: serverEnv }),
  spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', viteHost], { stdio: 'inherit' }),
]
const [serverProcess, viteProcess] = children

let stopping = false

function stop(code = 0) {
  if (stopping) return
  stopping = true
  children.forEach((child) => child.kill('SIGTERM'))
  setTimeout(() => process.exit(code), 200)
}

process.on('SIGINT', () => stop(0))
process.on('SIGTERM', () => stop(0))
serverProcess.on('error', (error) => {
  if (!stopping) console.error(`Recoil API process could not start: ${error.message}`)
})
serverProcess.on('exit', (code, signal) => {
  if (!stopping) console.error(`Recoil API stopped${code === null ? ` from ${signal}` : ` with code ${code}`}; Vite remains available so the browser can show the failure.`)
})
viteProcess.on('error', (error) => {
  if (!stopping) {
    console.error(`Vite process could not start: ${error.message}`)
    stop(1)
  }
})
viteProcess.on('exit', (code) => {
  if (!stopping) stop(code || 0)
})
