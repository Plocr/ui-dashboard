/**
 * ui-dashboard · Host 半边
 *
 * 提供 Package-private RPC：
 *  - `current-model`：读取当前默认模型选择（provider / model），供费用估算使用；
 *  - `balance`：查询当前 provider 的账户余额。DeepSeek 官方路由
 *    （api.deepseek.com/user/balance，见 https://api-docs.deepseek.com/zh-cn/api/get-user-balance）
 *    用 credentials 解析对应 API key（key 不离开 harness 进程）；订阅制或第三方
 *    路由无统一余额接口，返回 `unsupported` 由界面明确提示，不再显示无关余额。
 *
 * 用法：将本文件内容作为 cordis_define 的 code.host 传入（纯 JS 函数体）。
 */

/** 内置余额来源映射：provider 路由 → { keyRef, baseUrl }。 */
const DEFAULT_BALANCE_SOURCES = {
  'deepseek-official': { keyRef: 'DEEPSEEK_API_KEY', baseUrl: 'https://api.deepseek.com' }
}

/** 查询当前 provider 的账户余额；无对应来源时返回 unsupported。 */
async function queryBalance(ctx, config) {
  // 当前默认 provider（供余额来源选择与界面提示）
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
  try {
    const res = await fetch(`${baseUrl}/user/balance`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${key}`, Accept: 'application/json' },
      signal: AbortSignal.timeout(10_000)
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) return { status: 'error', message: data?.error?.message ?? `HTTP ${res.status}` }
    return {
      status: 'ok',
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
