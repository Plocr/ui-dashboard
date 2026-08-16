/**
 * ui-dashboard · Host 半边（持久安装版）
 *
 * 提供 Package-private RPC：
 *  - `current-model`：读取当前默认模型选择（provider / model），供费用估算使用；
 *  - `balance`：查询 DeepSeek 账户余额（https://api.deepseek.com/user/balance），
 *    API key 只在 harness 进程内解析（credentials 服务），不会下发到浏览器。
 *
 * 与动态版（src/host.js 的 harness.handle）等价：持久插件通过
 * `ctx.connection.rpc.handle` 挂载一个 `/rpc` 通道，浏览器半边用
 * `ctx.connection.rpc.call('/rpc', method, …)` 调用。
 */
export const name = 'ui-dashboard'

/** 需要 connection 服务以挂载 RPC 通道。 */
export const inject = ['connection']

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

export function apply(ctx) {
  ctx.effect(() => ctx.connection.rpc.handle('/rpc', async (endpoint) => {
    if (endpoint === 'current-model') {
      const svc = ctx.get('agentDefaultModel')
      if (svc === undefined) return { ok: true, value: { provider: null, model: null } }
      try {
        const sel = svc.currentSelection()
        return { ok: true, value: { provider: sel?.provider ?? null, model: sel?.model ?? null } }
      } catch (e) {
        return { ok: true, value: { provider: null, model: null } }
      }
    }
    if (endpoint === 'balance') {
      return { ok: true, value: await queryBalance(ctx) }
    }
    return {
      ok: false,
      error: {
        code: 'internal',
        message: `ui-dashboard: unknown rpc endpoint "${String(endpoint)}"`,
        details: {}
      }
    }
  }, { authority: 'loopback' }), 'ui-dashboard: current-model & balance rpc')
}
