// Pure logic for dsh-cost-guard-plugin.
// No network, no API key, no model call. All three tools are arithmetic
// over a hardcoded DeepSeek price table — they estimate cost, they never
// spend anything and never call the API.
//
// PRICING SNAPSHOT — verify before quoting real money:
//   Table dated 2026-09-10, rates in force since 2026-08-16 (DeepSeek
//   official pricing page, via benchlm.ai / felloai.com summaries checked
//   2026-11-10). Peak hours are 01:00-04:00 and 06:00-10:00 UTC, Mon-Fri
//   (excluding Chinese public holidays); off-peak is exactly half of peak.
//   - deepseek-flash (V4.1 Flash): peak $0.30 in / $1.20 out / $0.006 cache-hit
//     per 1M tokens; off-peak $0.15 / $0.60 / $0.003.
//   - deepseek-v4-pro: peak $1.32 in / $3.96 out / $0.044 cache-hit per 1M;
//     off-peak $0.66 / $1.98 / $0.022.
//   Legacy aliases deepseek-chat / deepseek-reasoner were retired
//   2026-07-24 and are deliberately NOT in this table — passing one is an
//   error, not a silent guess. If DeepSeek changes prices, update PRICING
//   below (or pass custom per-1M rates to estimate_cost) and bump
//   PRICING_VERSION; the table is the single source of truth.
export const PRICING_VERSION = '2026-09-10 (rates in force since 2026-08-16)'

export const PRICING = {
  'deepseek-flash': {
    peak: { input: 0.3, output: 1.2, cacheHit: 0.006 },
    offPeak: { input: 0.15, output: 0.6, cacheHit: 0.003 },
  },
  'deepseek-v4-pro': {
    peak: { input: 1.32, output: 3.96, cacheHit: 0.044 },
    offPeak: { input: 0.66, output: 1.98, cacheHit: 0.022 },
  },
}

export const SUPPORTED_MODELS = Object.keys(PRICING)

function round6(x) {
  return Math.round(x * 1e6) / 1e6
}

function checkTokens(name, v) {
  if (v === undefined || v === null) return 0
  if (!Number.isFinite(v) || v < 0 || !Number.isInteger(v)) {
    throw new Error(`${name} must be a non-negative integer, got ${v}`)
  }
  return v
}

function resolveRates({ model, peak = false, inputRatePerM, outputRatePerM, cacheHitRatePerM }) {
  const table = PRICING[model]
  if (!table && (inputRatePerM === undefined || outputRatePerM === undefined)) {
    throw new Error(
      `unknown model: ${model}. Supported: ${SUPPORTED_MODELS.join(', ')} (legacy deepseek-chat / deepseek-reasoner aliases were retired 2026-07-24). Pass custom inputRatePerM/outputRatePerM to price another model.`,
    )
  }
  const band = peak ? 'peak' : 'offPeak'
  const base = table ? table[band] : { input: 0, output: 0, cacheHit: 0 }
  return {
    model,
    band,
    pricingVersion: PRICING_VERSION,
    inputRatePerM: inputRatePerM ?? base.input,
    outputRatePerM: outputRatePerM ?? base.output,
    cacheHitRatePerM: cacheHitRatePerM ?? base.cacheHit,
  }
}

export function estimateCost(args) {
  const { model, peak = false } = args
  if (!model) throw new Error('model is required')
  const inputTokens = checkTokens('inputTokens', args.inputTokens)
  const outputTokens = checkTokens('outputTokens', args.outputTokens)
  const cacheHitTokens = checkTokens('cacheHitTokens', args.cacheHitTokens)
  const rates = resolveRates({ model, peak, inputRatePerM: args.inputRatePerM, outputRatePerM: args.outputRatePerM, cacheHitRatePerM: args.cacheHitRatePerM })
  const inputCost = (inputTokens / 1e6) * rates.inputRatePerM
  const outputCost = (outputTokens / 1e6) * rates.outputRatePerM
  const cacheHitCost = (cacheHitTokens / 1e6) * rates.cacheHitRatePerM
  const totalCostUsd = round6(inputCost + outputCost + cacheHitCost)
  return {
    ...rates,
    inputTokens,
    outputTokens,
    cacheHitTokens,
    totalTokens: inputTokens + outputTokens + cacheHitTokens,
    breakdownUsd: {
      input: round6(inputCost),
      output: round6(outputCost),
      cacheHit: round6(cacheHitCost),
    },
    totalCostUsd,
    note: 'Estimate only — inputTokens are cache-miss tokens; cached tokens go in cacheHitTokens. Prices are a dated snapshot; check the official DeepSeek pricing page before budgeting real money.',
  }
}

export function checkBudget(args) {
  const { budgetUsd } = args
  if (!Number.isFinite(budgetUsd) || budgetUsd <= 0) {
    throw new Error(`budgetUsd must be a positive number, got ${budgetUsd}`)
  }
  const est = estimateCost(args)
  const remainingUsd = round6(budgetUsd - est.totalCostUsd)
  const pctUsed = round6((est.totalCostUsd / budgetUsd) * 100)
  const overBudget = est.totalCostUsd > budgetUsd
  let suggestion = null
  if (overBudget) {
    suggestion =
      est.model === 'deepseek-v4-pro'
        ? 'Over budget. Cheapest fixes first: run this call on deepseek-flash off-peak, cut output tokens, or reuse cached context (cache-hit input is ~50x cheaper than a miss on flash).'
        : 'Over budget. Cheapest fixes first: run off-peak if this was a peak estimate, cut output tokens, or reuse cached context (cache-hit input is ~50x cheaper than a miss on flash).'
  } else if (pctUsed > 80) {
    suggestion = 'Within budget but over 80% used — same call once more would likely break it.'
  }
  return {
    ...est,
    budgetUsd,
    remainingUsd,
    pctUsed,
    overBudget,
    verdict: overBudget ? 'OVER BUDGET' : 'within budget',
    suggestion,
  }
}

export function sessionCostReport(args) {
  const { calls, budgetUsd } = args
  if (!Array.isArray(calls) || calls.length === 0) {
    throw new Error('calls must be a non-empty array of {model, inputTokens, outputTokens, cacheHitTokens?, peak?}')
  }
  if (calls.length > 100) throw new Error(`calls capped at 100 per report, got ${calls.length}`)
  const perCall = calls.map((c, i) => ({ callIndex: i, ...estimateCost(c) }))
  const totalCostUsd = round6(perCall.reduce((a, c) => a + c.totalCostUsd, 0))
  const totalTokens = perCall.reduce((a, c) => a + c.totalTokens, 0)
  const byModel = {}
  for (const c of perCall) {
    byModel[c.model] = round6((byModel[c.model] || 0) + c.totalCostUsd)
  }
  const mostExpensive = perCall.reduce((a, c) => (c.totalCostUsd > a.totalCostUsd ? c : a), perCall[0])
  const out = {
    pricingVersion: PRICING_VERSION,
    callCount: perCall.length,
    totalTokens,
    totalCostUsd,
    byModelUsd: byModel,
    mostExpensiveCallIndex: mostExpensive.callIndex,
    mostExpensiveCallUsd: mostExpensive.totalCostUsd,
    perCall,
  }
  if (budgetUsd !== undefined && budgetUsd !== null) {
    if (!Number.isFinite(budgetUsd) || budgetUsd <= 0) throw new Error(`budgetUsd must be a positive number, got ${budgetUsd}`)
    out.budgetUsd = budgetUsd
    out.remainingUsd = round6(budgetUsd - totalCostUsd)
    out.pctUsed = round6((totalCostUsd / budgetUsd) * 100)
    out.overBudget = totalCostUsd > budgetUsd
  }
  return out
}
