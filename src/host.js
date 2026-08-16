/**
 * ui-dashboard · Host 半边
 *
 * 提供 Package-private RPC：
 *  - `current-model`：读取当前默认模型选择（provider / model），供费用估算使用；
 *  - `balance`：查询当前 provider 的**余额/套餐用量**，按 provider 路由分发到对应
 *    官方 API（key 只在 harness 进程内解析，不离开进程）：
 *      · DeepSeek 官方 → GET {base}/user/balance（金额，见
 *        https://api-docs.deepseek.com/zh-cn/api/get-user-balance）
 *      · OpenCode Go   → GET {base}/usage（rolling/weekly/monthly 用量百分比 + 重置时间）
 *    订阅制或未在映射中的第三方路由返回 `unsupported`，由界面明确提示。
 *
 * 用法：将本文件内容作为 cordis_define 的 code.host 传入（纯 JS 函数体）。
 */

/** 内置 provider → 余额/用量来源。kind: 'money'（金额）| 'usage'（用量百分比）。 */
const DEFAULT_BALANCE_SOURCES = {
  'deepseek-official': { kind: 'money', keyRef: 'DEEPSEEK_API_KEY', baseUrl: 'https://api.deepseek.com', path: '/user/balance' },
  'opencode-go': { kind: 'usage', keyRef: 'OPENCODE_GO_API_KEY', baseUrl: 'https://opencode.ai/zen/go/v1', path: '/usage' }
}

/** 查询当前 provider 的余额/用量；无对应来源时返回 unsupported。 */
async function queryBalance(ctx, config) {
  let provider = null
  const svc = ctx.get('agentDefaultModel')
  if (svc !== undefined) {
    try {
      provider = svc.currentSelection()?.provider ?? null
    } catch {
      /* ignore */
    }
  }
  const sources = { ...DEFAULT_BALANCE_SOURCES, ...(config?.balance?.providers ?? {}) }
  const source = provider === null ? undefined : sources[provider]
  if (source === undefined) return { status: 'unsupported', provider }

  const keyRef = source.keyRef ?? 'DEEPSEEK_API_KEY'
  const credentials = ctx.get('credentials')
  if (credentials === undefined || typeof credentials.resolve !== 'function') {
    return { status: 'error', message: 'credentials service unavailable' }
  }
  let key = ''
  try {
    const hit = await credentials.resolve(keyRef)
    if (hit && typeof hit.value === 'string' && hit.value.length > 0) key = hit.value
  } catch (e) {
    return { status: 'error', message: `credentials.resolve failed: ${e instanceof Error ? e.message : String(e)}` }
  }
  if (!key) return { status: 'no-key', keyRef }

  const baseUrl = (source.baseUrl ?? 'https://api.deepseek.com').replace(/\/+$/, '')
  const path = source.path ?? (source.kind === 'usage' ? '/usage' : '/user/balance')
  try {
    const res = await fetch(`${baseUrl}${path}`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${key}`, Accept: 'application/json' },
      signal: AbortSignal.timeout(10_000)
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) return { status: 'error', message: data?.error?.message ?? data?.message ?? `HTTP ${res.status}` }

    if (source.kind === 'usage') {
      // OpenCode Go 用量：usage.{rolling,weekly,monthly}.{status,percent,resetsAt}
      const usage = data?.usage ?? data
      const pick = (name) => {
        const w = usage?.[name]
        if (w === null || w === undefined) return undefined
        return {
          status: w?.status ?? 'ok',
          percent: typeof w?.percent === 'number' ? w.percent : undefined,
          resetsAt: typeof w?.resetsAt === 'string' ? w.resetsAt : undefined
        }
      }
      return {
        status: 'ok',
        kind: 'usage',
        provider,
        windows: {
          rolling: pick('rolling'),
          weekly: pick('weekly'),
          monthly: pick('monthly')
        },
        fetchedAt: Date.now()
      }
    }

    // DeepSeek 官方余额：is_available + balance_infos
    return {
      status: 'ok',
      kind: 'money',
      provider,
      isAvailable: data?.is_available !== false,
      infos: Array.isArray(data?.balance_infos)
        ? data.balance_infos.map((i) => ({
            currency: i?.currency,
            totalBalance: i?.total_balance,
            grantedBalance: i?.granted_balance,
            toppedUpBalance: i?.topped_up_balance
          }))
        : [],
      fetchedAt: Date.now()
    }
  } catch (e) {
    return { status: 'error', message: e instanceof Error ? e.message : String(e) }
  }
}

return {
  apply(ctx, config) {
    ctx.effect(() => harness.handle('current-model', async () => {
      const svc = ctx.get('agentDefaultModel')
      if (svc === undefined) return { provider: null, model: null }
      try {
        const sel = svc.currentSelection()
        return { provider: sel?.provider ?? null, model: sel?.model ?? null }
      } catch (e) {
        return { provider: null, model: null }
      }
    }), 'ui-dashboard: current-model rpc')

    ctx.effect(() => harness.handle('balance', async () => queryBalance(ctx, config)), 'ui-dashboard: balance rpc')
  }
}
