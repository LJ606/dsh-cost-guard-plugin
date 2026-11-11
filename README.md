# dsh-cost-guard-plugin

DeepSeek Harness (dsh) 代码插件，Cordis 插件形态。和任何个人经历无关：只算 DeepSeek API 花了多少钱，谁用 API 都能用。

> 状态：DSH 本身还在 developer preview，API 可能变。本插件按 2026-11-09 查到的官方文档写成，结构与已跑通的 `dsh-file-organizer-plugin` 完全一致（index.js + src/core.js + test/test.mjs）。

## 3 个工具

| 工具 | 输入 | 输出 | 说明 |
|---|---|---|---|
| `estimate_cost` | model、inputTokens（必填）、outputTokens、cacheHitTokens、peak | 分项 + 总价（USD） | inputTokens 是未命中缓存的输入 token，命中缓存的单独放 cacheHitTokens |
| `check_budget` | 同上 + budgetUsd（必填） | 预计花费、剩余预算、用了百分之几、超没超 | 超了会给最便宜的降本建议（换 flash、走非高峰、减输出、用缓存） |
| `session_cost_report` | calls 数组（最多 100 条）+ 可选 budgetUsd | 会话总价、分模型合计、最贵的一次调用、逐条明细 | 一次会话花了多少钱，一眼看清 |

不联网、不要 API Key、不花一分钱——三个工具只是在本地做乘法。

## 价格表（快照，正式算钱前务必核对官网）

表版本：2026-09-10，2026-08-16 起生效。核对时间 2026-11-10，来源为 DeepSeek 官方定价页的第三方汇总（benchlm.ai、felloai.com）。高峰时段为周一至周五 01:00–04:00 与 06:00–10:00 UTC（中国法定节假日除外），非高峰正好是高峰的一半。

| 模型 | 非高峰 输入 / 输出 / 缓存命中（每 1M token） | 高峰 |
|---|---|---|
| `deepseek-flash`（V4.1 Flash） | $0.15 / $0.60 / $0.003 | $0.30 / $1.20 / $0.006 |
| `deepseek-v4-pro` | $0.66 / $1.98 / $0.022 | $1.32 / $3.96 / $0.044 |

注意：旧别名 `deepseek-chat` / `deepseek-reasoner` 已于 2026-07-24 退役，插件故意不收——传了会直接报错，而不是悄悄按旧价算。DeepSeek 改价后，改 `src/core.js` 里 `PRICING` 一处即可；`estimate_cost` 也接受自定义单价（inputRatePerM / outputRatePerM / cacheHitRatePerM）临时覆盖。

## 目录

```
dsh-cost-guard-plugin/
├── package.json          # dsh.bundle 声明，engines.dsh >=0.2.0 <0.3.0
├── cordis.patch.yml      # bundle 的 patch 层
├── index.js              # 上线入口：纯 JS，无需 build（git 安装不跑 build）
├── src/
│   ├── core.js           # 纯逻辑：estimateCost / checkBudget / sessionCostReport + 价格表
│   └── index.ts          # TypeScript 对照版
├── test/
│   └── test.mjs          # mock 测试，不需要 Harness、不需要 Key
└── README.md
```

## 安装

前置：Node.js >= 18，已装好 `dsh` CLI。

```bash
dsh plugin --profile demo add ./dsh-cost-guard-plugin
dsh --profile demo --dump-config   # 应能看到 "# == dsh-cost-guard-plugin" 一层
dsh --profile demo
```

打开 `http://127.0.0.1:3080`，问：

> 这次会话调了 3 次 deepseek-flash，分别是 10 万输入 2 万输出、5 万输入 1 万输出（高峰）、还有一次 v4-pro 1 万输入 5 千输出，帮我算下总共花了多少钱，预算是 1 美元，超了没有？

模型会依次调工具，先给你分项和总价，你确认后再决定要不要换模型或改时间。

## 本地验证（已跑通过）

```bash
cd dsh-cost-guard-plugin
node test/test.mjs   # 或 npm test
```

2026-11-10 实测，测试用的全是中性 token 数：

- `estimate_cost`：flash 非高峰 10 万输入 / 2 万输出 = $0.027；同量高峰正好翻倍 $0.054；100 万缓存命中输入只要 $0.003；v4-pro 同量非高峰 $0.1056。
- `check_budget`：$0.027 的调用对 $0.02 预算判 OVER BUDGET、剩余 -$0.007 并给降本建议；对 $1 预算判 within budget、用了 2.7%。
- `session_cost_report`：3 次调用合计 $0.0705，$1 预算用了 7.05%，最贵的是第 1 次。
- 报错不瞎猜：退役别名、负 token、0 预算、空 calls 都会抛错。
- 用真实 `@deepseek-ai/dsh-tools@0.0.1-rc.1` 加载 `index.js`：3 个工具注册成功，`execute` 直接调用返回正确结果（estimate_cost $0.027、check_budget 判 OVER BUDGET、session_cost_report 合计 $0.027）。

没验证的部分：完整的 dsh Web UI 端到端（需要 clone harness 仓库 + pnpm install + 配 DeepSeek API Key）。上面安装命令是按官方文档写的，在这台机器上没跑全套 UI。


## 许可证

Apache-2.0
