#!/usr/bin/env node

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import * as z from 'zod/v4'
import {
  caseSummary,
  compareHistory,
  exportHandoff,
  inspectGraph,
  listCases,
  reachedPaths,
  scanRepository,
  verifiedFixPlan,
} from './tools.js'

const server = new McpServer({ name: 'recoil', version: '0.1.0' })

function result(payload, message) {
  return {
    content: [{ type: 'text', text: `${message}\n\n${JSON.stringify(payload, null, 2)}` }],
  }
}

function failure(error) {
  return {
    isError: true,
    content: [{ type: 'text', text: error instanceof Error ? error.message : String(error) }],
  }
}

function register(name, config, handler) {
  server.registerTool(name, config, async (input) => {
    try {
      return await handler(input)
    } catch (error) {
      return failure(error)
    }
  })
}

register('scan_repository', {
  title: 'Scan repository',
  description: 'WRITE: start a real Recoil investigation against one public GitHub repository and return a case ID immediately. Poll case_summary until it completes. With no selector, discover affected advisories from the lockfile inventory. Repository code is read statically and never executed.',
  inputSchema: {
    repository: z.string().url().describe('Public GitHub repository URL'),
    selector: z.string().optional().describe('Optional GHSA/CVE advisory ID or package name'),
    caseId: z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/).optional().describe('Optional stable case ID'),
  },
}, async (input) => {
  const payload = scanRepository(input)
  return result(payload, `Started Recoil case ${payload.caseId}.`)
})

register('list_cases', {
  title: 'List Recoil cases',
  description: 'READ: list retained investigations, repositories, verdict totals, and graph sizes.',
  inputSchema: {},
}, async () => {
  const payload = listCases()
  return result(payload, `${payload.cases.length} retained Recoil case${payload.cases.length === 1 ? '' : 's'}.`)
})

register('case_summary', {
  title: 'Read case decision',
  description: 'READ: poll case progress, then return the computed verdict totals, repository outcomes, and HydraDB verification state when complete.',
  inputSchema: { caseId: z.string().describe('Recoil case ID') },
}, async ({ caseId }) => {
  const payload = caseSummary(caseId)
  return result(payload, payload.summary ? `${payload.summary.reached} source-backed route${payload.summary.reached === 1 ? '' : 's'} in case ${caseId}.` : `Case ${caseId} is ${payload.status}.`)
})

register('reached_paths', {
  title: 'Read reached source paths',
  description: 'READ: return exact source import sites, cited routes, CODEOWNERS, and the commit where each reached path was first observed.',
  inputSchema: { caseId: z.string().describe('Completed Recoil case ID') },
}, async ({ caseId }) => {
  const payload = reachedPaths(caseId)
  return result(payload, `${payload.count} source-backed route${payload.count === 1 ? '' : 's'} found.`)
})

register('verified_fix_plan', {
  title: 'Read verified fix plan',
  description: 'READ: return per-repository version challenges and Recoil’s smallest verified fix set. A fix is reported as verified only when the proposed version closes the observed affected range.',
  inputSchema: { caseId: z.string().describe('Completed Recoil case ID') },
}, async ({ caseId }) => {
  const payload = verifiedFixPlan(caseId)
  return result(payload, `${payload.verified} fix challenge${payload.verified === 1 ? '' : 's'} passed.`)
})

register('compare_history', {
  title: 'Compare exposure history',
  description: 'READ: compare the current observed graph with the dated pre-disclosure boundary and include related evidence records recalled from HydraDB.',
  inputSchema: { caseId: z.string().describe('Completed Recoil case ID') },
}, async ({ caseId }) => {
  const payload = compareHistory(caseId)
  return result(payload, `${payload.graphDelta.addedEdges.length} relationships appeared after the dated boundary.`)
})

register('inspect_evidence_graph', {
  title: 'Inspect evidence graph',
  description: 'READ: return the bounded observed graph and HydraDB current-case read-back status. Every edge comes from collected public evidence.',
  inputSchema: { caseId: z.string().describe('Completed Recoil case ID') },
}, async ({ caseId }) => {
  const payload = inspectGraph(caseId)
  return result(payload, `${payload.nodeCount} nodes and ${payload.edgeCount} observed edges.`)
})

register('export_handoff', {
  title: 'Export cited handoff',
  description: 'READ: export the completed case as a human-readable Markdown brief or a SHA-256 integrity-addressed JSON receipt.',
  inputSchema: {
    caseId: z.string().describe('Completed Recoil case ID'),
    format: z.enum(['brief', 'receipt']).default('brief'),
  },
}, async ({ caseId, format }) => {
  const payload = exportHandoff(caseId, format)
  return result(payload, `Generated ${format} for case ${caseId}.`)
})

const transport = new StdioServerTransport()
await server.connect(transport)
console.error('Recoil MCP server ready on stdio')
