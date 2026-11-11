// Mock test for dsh-cost-guard-plugin — no Harness, no API key, no network.
// All numbers are neutral made-up token counts — nothing from any personal
// or work history. Run: node test/test.mjs
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { estimateCost, checkBudget, sessionCostReport, PRICING } from '../src/core.js'

// 1. estimate_cost — deepseek-flash, off-peak:
//    100k in x $0.15/M = $0.015; 20k out x $0.60/M = $0.012; total $0.027.
const est = estimateCost({ model: 'deepseek-flash', inputTokens: 100000, outputTokens: 20000 })
assert.equal(est.totalCostUsd, 0.027, `expected 0.027, got ${est.totalCostUsd}`)
assert.equal(est.band, 'offPeak')
assert.equal(est.breakdownUsd.input, 0.015)
assert.equal(est.breakdownUsd.output, 0.012)
console.log('estimate_cost off-peak OK:', JSON.stringify(est))

// 2. Same call at peak must cost exactly double: $0.054.
const peak = estimateCost({ model: 'deepseek-flash', inputTokens: 100000, outputTokens: 20000, peak: true })
assert.equal(peak.totalCostUsd, 0.054, `expected 0.054, got ${peak.totalCostUsd}`)
console.log('estimate_cost peak OK:', JSON.stringify(peak))

// 3. Cache-hit tokens are far cheaper: 1M cached in on flash off-peak = $0.003.
const cached = estimateCost({ model: 'deepseek-flash', inputTokens: 0, cacheHitTokens: 1000000 })
assert.equal(cached.totalCostUsd, 0.003, `expected 0.003, got ${cached.totalCostUsd}`)
console.log('estimate_cost cache-hit OK:', JSON.stringify(cached))

// 4. v4-pro is pricier: 100k in / 20k out off-peak = 0.066 + 0.0396 = 0.1056.
const pro = estimateCost({ model: 'deepseek-v4-pro', inputTokens: 100000, outputTokens: 20000 })
assert.equal(pro.totalCostUsd, 0.1056, `expected 0.1056, got ${pro.totalCostUsd}`)
console.log('estimate_cost v4-pro OK:', JSON.stringify(pro))

// 5. check_budget — $0.027 call against a $0.02 budget is over; against $1 it is not.
const over = checkBudget({ model: 'deepseek-flash', inputTokens: 100000, outputTokens: 20000, budgetUsd: 0.02 })
assert.equal(over.overBudget, true)
assert.equal(over.verdict, 'OVER BUDGET')
assert.equal(over.remainingUsd, -0.007)
assert.ok(over.suggestion, 'over-budget result must suggest a cheaper alternative')
console.log('check_budget over OK:', JSON.stringify(over))
const ok = checkBudget({ model: 'deepseek-flash', inputTokens: 100000, outputTokens: 20000, budgetUsd: 1 })
assert.equal(ok.overBudget, false)
assert.equal(ok.pctUsed, 2.7)
console.log('check_budget within OK:', JSON.stringify(ok))

// 6. session_cost_report — 3 neutral calls, $1 session budget.
//    flash 100k/20k = 0.027; flash 50k/10k peak = 0.027; v4-pro 10k/5k off-peak = 0.0165.
//    Total = 0.0705; most expensive is a tie at 0.027 (first wins, index 0).
const report = sessionCostReport({
  calls: [
    { model: 'deepseek-flash', inputTokens: 100000, outputTokens: 20000 },
    { model: 'deepseek-flash', inputTokens: 50000, outputTokens: 10000, peak: true },
    { model: 'deepseek-v4-pro', inputTokens: 10000, outputTokens: 5000 },
  ],
  budgetUsd: 1,
})
assert.equal(report.totalCostUsd, 0.0705, `expected 0.0705, got ${report.totalCostUsd}`)
assert.equal(report.callCount, 3)
assert.equal(report.mostExpensiveCallIndex, 0)
assert.equal(report.pctUsed, 7.05)
assert.equal(report.overBudget, false)
console.log('session_cost_report OK:', JSON.stringify(report, null, 2))

// 7. Errors, not silent guesses: retired alias + negative tokens + bad budget.
assert.throws(() => estimateCost({ model: 'deepseek-chat', inputTokens: 1000 }), /unknown model/)
assert.throws(() => estimateCost({ model: 'deepseek-flash', inputTokens: -5 }), /non-negative integer/)
assert.throws(() => checkBudget({ model: 'deepseek-flash', inputTokens: 1000, budgetUsd: 0 }), /positive number/)
assert.throws(() => sessionCostReport({ calls: [] }), /non-empty array/)
console.log('error cases OK')

// 8. Wiring check — index.js registers exactly the 3 tools.
const indexSrc = readFileSync(new URL('../index.js', import.meta.url), 'utf8')
for (const tool of ['estimate_cost', 'check_budget', 'session_cost_report']) {
  assert.ok(indexSrc.includes(`name: '${tool}'`), `index.js missing ${tool}`)
}
assert.ok(indexSrc.includes("export const inject = ['tools']"))
assert.ok(indexSrc.includes('additionalProperties: true'), 'output schema must set additionalProperties explicitly')
assert.ok(PRICING['deepseek-flash'] && PRICING['deepseek-v4-pro'], 'price table must cover both current models')
console.log('wiring OK: index.js registers estimate_cost, check_budget, session_cost_report')

console.log('\nAll tests passed.')
