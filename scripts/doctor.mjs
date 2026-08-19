import { parseInvestigationInput } from '../server/collectors.js'
import { advisoryAgentStatus } from '../server/advisory-agent.js'
import { hydraStatus } from '../server/hydra.js'
import { recordingNetworkProbe } from '../src/core/network-preflight.js'

const args = process.argv.slice(2)
const recording = args.includes('--recording')
const network = args.includes('--network')
const help = args.includes('--help') || args.includes('-h')
const query = process.env.RECOIL_DOCTOR_QUERY || args.filter((arg) => !arg.startsWith('--')).join(' ').trim()

function print(label, value) {
  console.log(`${label.padEnd(13)} ${value}`)
}

function usage() {
  print('usage', 'npm run doctor -- [--recording] [--network] "<advisory> <github-url>..."')
  print('env', 'RECOIL_DOCTOR_QUERY may provide the query instead of a positional argument')
  print('modes', '--recording requires 3 public repositories and HydraDB credentials; --network tests endpoints')
}

if (help) {
  usage()
  process.exit(0)
}

const failures = []
const target = parseInvestigationInput(query)
const hydra = hydraStatus()
const agent = advisoryAgentStatus()
const nodeMajor = Number(process.versions.node.split('.')[0])

print('RECOIL', 'preflight doctor')
print('mode', recording ? 'recording gate' : 'local configuration')
print('node', `${process.versions.node} · ${nodeMajor >= 20 ? 'supported' : 'requires Node 20+'}`)
if (nodeMajor < 20) failures.push('Node 20 or newer is required')

print('query', query || 'not supplied')
print('target', `${target.advisoryId || target.packageName || 'advisory/package unresolved'} · ${target.repositories.length} public GitHub repos`)
if (recording && target.repositories.length < 3) failures.push(`recording mode needs 3 public GitHub repositories; found ${target.repositories.length}`)
if (recording && !target.advisoryId) failures.push('recording mode needs a GHSA/CVE advisory ID for dated reachability and fixed-version proof')

print('hydra', `${hydra.status} · ${hydra.configured ? 'write/read configured' : 'local replay only'}`)
if (recording && !hydra.configured) failures.push('recording mode needs HYDRA_DB_API_KEY and HYDRADB_DATABASE_ID')
print('openai', `${agent.enabled ? 'advisory scope enabled' : 'deterministic module proof'} · ${agent.configured ? agent.model : 'no key configured'}`)
print('github', process.env.GITHUB_TOKEN ? 'token configured' : 'anonymous API mode · token optional')
print('cache', process.env.RECOIL_CACHE_DIR || '.recoil-cache')
print('network', network ? 'probing OSV, GitHub, HydraDB' : 'not probed · pass --network to test endpoints')

if (network) {
  const outcomes = await recordingNetworkProbe({ hydraApiBase: hydra.apiBase })
  for (const outcome of outcomes) {
    print(outcome.label, outcome.detail)
    if (!outcome.ok) failures.push(`${outcome.label} unavailable: ${outcome.detail}`)
  }
}

if (failures.length) {
  print('result', `NOT READY · ${failures.length} blocker${failures.length === 1 ? '' : 's'}`)
  for (const failure of failures) print('blocker', failure)
  process.exitCode = 1
} else {
  print('result', recording ? 'READY TO RUN RECORDING GATE' : 'READY FOR LOCAL REPLAY')
}
