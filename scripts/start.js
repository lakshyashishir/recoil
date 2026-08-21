import { spawn } from 'node:child_process'

const serverEnv = { ...process.env }
const host = process.env.RECOIL_HOST || '127.0.0.1'
const viteHost = process.env.RECOIL_VITE_HOST || host
serverEnv.RECOIL_HOST = host

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
