/**
 * ui-dashboard · Host 半边
 *
 * 提供 Package-private RPC：
 *  - `current-model`：读取当前默认模型选择（provider / model），供费用估算使用；
 *  - `balance`：查询 DeepSeek 账户余额（https://api.deepseek.com/user/balance）。
 *    API key 只在 harness 进程内解析（credentials 服务），不会下发到浏览器。
 *
 * 用法：将本文件内容作为 cordis_define 的 code.host 传入（纯 JS 函数体）。
 */

/** 查询 DeepSeek 账户余额（与 dsh-desktop-bridge 的 billing.balance 同源实现）。 */
async function queryBalance(ctx) {
  const credentials = ctx.get('credentials')
  if (credentials === undefined || typeof credentials.resolve !== 'function') {
    return { status: 'error', message: 'credentials service unavailable' }
  }
  let key = ''
  try {
    const hit = await credentials.resolve('DEEPSEEK_API_KEY')
    if (hit && typeof hit.value === 'string' && hit.value.length > 0) key = hit.value
  } catch (e) {
    return { status: 'error', message: `credentials.resolve failed: ${e instanceof Error ? e.message : String(e)}` }
  }
  if (!key) return { status: 'no-key' }
  try {
    const res = await fetch('https://api.deepseek.com/user/balance', {
      method: 'GET',
      headers: { Authorization: `Bearer ${key}`, Accept: 'application/json' },
      signal: AbortSignal.timeout(10_000)
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) return { status: 'error', message: data?.error?.message ?? `HTTP ${res.status}` }
    return {
      status: 'ok',
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
  apply(ctx) {
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

    ctx.effect(() => harness.handle('balance', async () => queryBalance(ctx)), 'ui-dashboard: balance rpc')
  }
}
