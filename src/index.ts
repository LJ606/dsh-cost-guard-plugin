// TypeScript source for dsh-cost-guard-plugin.
// Shipped entry point is index.js (plain JS, no build step — a git install
// never runs `build`, so the bundle must ship runnable JS).
// Keep in sync with index.js + src/core.js; `npm test` covers the shipped JS.
import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { estimateCost, checkBudget, sessionCostReport } from './core.js'

export const name = 'cost-guard-plugin'
export const inject = ['tools']

export function apply(ctx: Context) {
  ctx.tools.register(defineTool({
    name: 'estimate_cost',
    description: 'Estimate the USD cost of one DeepSeek API call from token counts.',
    parameters: {
      model: { type: 'string', required: true, description: 'deepseek-flash or deepseek-v4-pro' },
      inputTokens: { type: 'number', required: true, description: 'Cache-miss input tokens' },
      outputTokens: { type: 'number', description: 'Output tokens, default 0' },
      cacheHitTokens: { type: 'number', description: 'Cache-hit input tokens, default 0' },
      peak: { type: 'boolean', description: 'Peak hours? Default false = off-peak' },
    },
    output: {
      schema: { type: 'object', additionalProperties: true },
      render: (_args, value) => [{ type: 'text', text: JSON.stringify(value, null, 2) }],
    },
    async execute(args) {
      return estimateCost(args as Parameters<typeof estimateCost>[0])
    },
  }))

  ctx.tools.register(defineTool({
    name: 'check_budget',
    description: 'Check whether one DeepSeek API call fits a USD budget.',
    parameters: {
      model: { type: 'string', required: true, description: 'deepseek-flash or deepseek-v4-pro' },
      inputTokens: { type: 'number', required: true, description: 'Cache-miss input tokens' },
      outputTokens: { type: 'number', description: 'Output tokens, default 0' },
      cacheHitTokens: { type: 'number', description: 'Cache-hit input tokens, default 0' },
      peak: { type: 'boolean', description: 'Peak hours? Default false = off-peak' },
      budgetUsd: { type: 'number', required: true, description: 'Budget in USD for this call' },
    },
    output: {
      schema: { type: 'object', additionalProperties: true },
      render: (_args, value) => [{ type: 'text', text: JSON.stringify(value, null, 2) }],
    },
    async execute(args) {
      return checkBudget(args as Parameters<typeof checkBudget>[0])
    },
  }))

  ctx.tools.register(defineTool({
    name: 'session_cost_report',
    description: 'Total the USD cost of a whole DeepSeek session from a list of calls.',
    parameters: {
      calls: { type: 'array', required: true, description: 'Array of calls, max 100' },
      budgetUsd: { type: 'number', description: 'Optional session budget in USD' },
    },
    output: {
      schema: { type: 'object', additionalProperties: true },
      render: (_args, value) => [{ type: 'text', text: JSON.stringify(value, null, 2) }],
    },
    async execute(args) {
      return sessionCostReport(args as Parameters<typeof sessionCostReport>[0])
    },
  }))
}
