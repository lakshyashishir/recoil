import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'

const transport = new StdioClientTransport({
  command: process.execPath,
  args: ['--env-file-if-exists=.env', 'mcp/server.js'],
  cwd: process.cwd(),
  stderr: 'pipe',
})
const client = new Client({ name: 'recoil-smoke', version: '0.1.0' })

try {
  await client.connect(transport)
  const listed = await client.listTools()
  const expected = ['scan_repository', 'list_cases', 'case_summary', 'reached_paths', 'verified_fix_plan', 'compare_history', 'inspect_evidence_graph', 'export_handoff']
  const names = listed.tools.map((tool) => tool.name)
  const missing = expected.filter((name) => !names.includes(name))
  if (missing.length) throw new Error(`Missing MCP tools: ${missing.join(', ')}`)
  const response = await client.callTool({ name: 'list_cases', arguments: {} })
  if (response.isError) throw new Error(response.content?.[0]?.text || 'list_cases failed')
  const repository = process.env.RECOIL_MCP_SMOKE_REPOSITORY
  if (repository) {
    const scan = await client.callTool({ name: 'scan_repository', arguments: { repository } })
    if (scan.isError) throw new Error(scan.content?.[0]?.text || 'scan_repository failed')
    const caseId = scan.content?.[0]?.text?.match(/Started Recoil case ([a-zA-Z0-9_-]+)/)?.[1]
    if (!caseId) throw new Error('scan_repository returned no case ID')
    const startedAt = Date.now()
    while (true) {
      const status = await client.callTool({ name: 'case_summary', arguments: { caseId } })
      if (status.isError) throw new Error(status.content?.[0]?.text || 'case_summary failed')
      const state = status.content?.[0]?.text?.match(new RegExp(`Case ${caseId} is ([a-z]+)`))?.[1]
      if (!state) break
      if (state === 'failed') throw new Error(`Recoil case ${caseId} failed`)
      if (Date.now() - startedAt > 180_000) throw new Error(`Recoil case ${caseId} did not complete within 180 seconds`)
      await new Promise((resolve) => setTimeout(resolve, 650))
    }
    console.log(`Recoil MCP ready · ${names.length} tools · live scan passed · ${repository}`)
  } else {
    console.log(`Recoil MCP ready · ${names.length} tools · list_cases passed`)
  }
} finally {
  await client.close()
}
