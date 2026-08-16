/**
 * ui-dashboard · Host 半边（持久安装版）
 *
 * 提供 Package-private RPC：读取当前默认模型选择（provider / model），
 * 供 Client 端费用估算使用。
 *
 * 与动态版（src/host.js 的 harness.handle('current-model')）等价：持久插件通过
 * `ctx.connection.rpc.handle` 挂载一个 `/rpc` 通道，浏览器半边用
 * `ctx.connection.rpc.call('/rpc', 'current-model', …)` 调用。
 */
export const name = 'ui-dashboard'

/** 需要 connection 服务以挂载 RPC 通道。 */
export const inject = ['connection']

export function apply(ctx) {
  ctx.effect(() => ctx.connection.rpc.handle('/rpc', async (endpoint) => {
    if (endpoint !== 'current-model') {
      return {
        ok: false,
        error: {
          code: 'internal',
          message: `ui-dashboard: unknown rpc endpoint "${String(endpoint)}"`,
          details: {}
        }
      }
    }
    const svc = ctx.get('agentDefaultModel')
    if (svc === undefined) return { ok: true, value: { provider: null, model: null } }
    try {
      const sel = svc.currentSelection()
      return { ok: true, value: { provider: sel?.provider ?? null, model: sel?.model ?? null } }
    } catch (e) {
      return { ok: true, value: { provider: null, model: null } }
    }
  }, { authority: 'loopback' }), 'ui-dashboard: current-model rpc')
}
