// dsh-cost-guard-plugin — DeepSeek Harness (Cordis) tool plugin.
// Official shape: export `name`, `inject`, `apply(ctx)`; register tools
// with `ctx.tools.register(defineTool({...}))`.
// https://deepseek-harness.github.io/deepseek-harness/en/develop/basic/tool
// Pure logic lives in ./src/core.js. This file only wires it up.
// SAFETY: these tools only do arithmetic over a hardcoded price table.
// They never call the DeepSeek API, never spend money, never need a key.
import { defineTool } from '@deepseek-ai/dsh-tools'
import { estimateCost, checkBudget, sessionCostReport } from './src/core.js'

export const name = 'cost-guard-plugin'
export const inject = ['tools']

export function apply(ctx) {
  ctx.tools.register(defineTool({
    name: 'estimate_cost',
    description: 'Estimate the USD cost of one DeepSeek API call from token counts (input = cache-miss tokens, cacheHitTokens separate). Uses a dated price-table snapshot (2026-09-10); no API key, no network.',
    parameters: {
      model: { type: 'string', required: true, description: 'deepseek-flash or deepseek-v4-pro' },
      inputTokens: { type: 'number', required: true, description: 'Cache-miss input tokens' },
      outputTokens: { type: 'number', description: 'Output tokens, default 0' },
      cacheHitTokens: { type: 'number', description: 'Cache-hit input tokens, default 0' },
      peak: { type: 'boolean', description: 'Peak hours (01:00-04:00 / 06:00-10:00 UTC Mon-Fri)? Default false = off-peak' },
      inputRatePerM: { type: 'number', description: 'Optional custom input rate USD per 1M tokens, overrides the table' },
      outputRatePerM: { type: 'number', description: 'Optional custom output rate USD per 1M tokens, overrides the table' },
      cacheHitRatePerM: { type: 'number', description: 'Optional custom cache-hit rate USD per 1M tokens, overrides the table' },
    },
    output: {
      schema: { type: 'object', additionalProperties: true },
      render: (_args, value) => [{ type: 'text', text: JSON.stringify(value, null, 2) }],
    },
    async execute(args) {
      return estimateCost(args)
    },
  }))

  ctx.tools.register(defineTool({
    name: 'check_budget',
    description: 'Check whether one DeepSeek API call fits a USD budget. Returns projected cost, remaining budget, % used, and a cheaper alternative when over budget. No API key, no network.',
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
      return checkBudget(args)
    },
  }))

  ctx.tools.register(defineTool({
    name: 'session_cost_report',
    description: 'Total the USD cost of a whole DeepSeek session from a list of calls (max 100). Returns total cost, per-call breakdown, per-model totals, and the most expensive call. Optional budgetUsd adds remaining / % used. No API key, no network.',
    parameters: {
      calls: { type: 'array', required: true, description: 'Array of {model, inputTokens, outputTokens?, cacheHitTokens?, peak?}, max 100' },
      budgetUsd: { type: 'number', description: 'Optional session budget in USD' },
    },
    output: {
      schema: { type: 'object', additionalProperties: true },
      render: (_args, value) => [{ type: 'text', text: JSON.stringify(value, null, 2) }],
    },
    async execute(args) {
      return sessionCostReport(args)
    },
  }))

  console.log('[cost-guard-plugin] plugin loaded! tools: estimate_cost, check_budget, session_cost_report')
}
