# ui-dashboard

DeepSeek Harness（DSH）仪表盘 UI 插件。

以可视化方式展示当前会话的**上下文占用、Token 用量与费用估算、DeepSeek 账户余额、会话统计、目标、待办、后台任务与工作区信息**，支持两种展示形态：

- **右侧栏**：占据 shell 内置的 `details` 槽位（右侧第三栏，同官方 `ui-sidebar` 占据 `sidebar` 的方式），通过会话头部工具区的「仪表盘」按钮打开；
- **会话标签页**：注册进 `conversation.view` 槽位（加法席位），与内置「对话」「轨迹」标签并列，点击「仪表盘」标签整页查看。

## 功能

| 卡片 | 内容 | 数据来源 |
| --- | --- | --- |
| 上下文 | 左：粗圆环（14px 描边，按系统提示/工具/消息三色分段，百分比内嵌环心）；右：组成列表 + 比例条 | `contextPressure` / `contextBreakdown` 投影 |
| 用量 · 费用 · 统计（融合版块） | KPI 汇总格（轮次/步骤/总 Token/费用 ¥）→ 金额占比单条图 → 行内 `token · 金额` → 合计 → 统计徽章（模型/工具耗时、平均首字延迟、生成速度） | `tokenUsage` / `sessionStats` 投影 + Host 模型选择 |
| 余额 | DeepSeek 账户余额：按币种总额 + 充值/赠送明细，带手动刷新按钮；余额查询**跟随当前 provider**——订阅制/第三方路由明确提示"不可用" | Host RPC `balance`（按 provider 路由选 key 与端点；DeepSeek 官方为 `api.deepseek.com/user/balance`，见[官方文档](https://api-docs.deepseek.com/zh-cn/api/get-user-balance/)） |
| 目标 | 目标文（两行截断）+ 阶段 + 轮次进度条 | `goal` 投影 |
| 待办 | 完成进度条 + 状态圆点列表 + 汇总 | `todos` 投影 |
| 后台任务 | 状态计数徽章 + 任务列表 | `useSessions().jobsBySession` |
| 工作区 | 标题 + 路径 | `useWorkspaces` 反查 |

费用估算：按 DeepSeek 官方人民币公开价（deepseek-chat：未缓存输入 ¥2 / 缓存命中 ¥0.5 / 输出 ¥8 每百万 tokens；deepseek-reasoner：¥4 / ¥1 / ¥16），
基于 `tokenUsage` 投影分桶计算；当前模型由 Host 半边通过 RPC `current-model` 读取默认模型选择。仅为估算，可能与实际账单不符。

### 余额：跟随 provider，订阅制/第三方不硬查

余额查询**跟随当前默认模型的 provider 路由**（`agentDefaultModel.currentSelection()`）：

- `deepseek-official`（DSH 内置 DeepSeek 官方）→ 用 `DEEPSEEK_API_KEY` 查
  `https://api.deepseek.com/user/balance`（[官方文档](https://api-docs.deepseek.com/zh-cn/api/get-user-balance/)），
  展示按币种总额与充值/赠送明细；
- **其他路由（订阅制、pi-ai/OpenAI 兼容网关、自定义代理等）→ 卡片明确提示
  "provider 非 DeepSeek 官方，余额不可用"**，不会显示无关的 DeepSeek 余额；
- 未配置对应 key → 提示"未配置 {keyRef}"。

API key 只在 harness 进程内解析（credentials 服务），不会下发到浏览器。

**自定义余额来源**：如果某个 provider 有自己的余额 API，可在插件配置中声明
`balance.providers`（持久安装版在 profile 的 `cordis.patch.yml` 条目里加 `config`，
例如把 `opencode-go` 路由也指向 DeepSeek 官方余额）：

```yaml
- insert:
    - id: ui-dashboard
      name: ui-dashboard
      config:
        balance:
          providers:
            opencode-go:            # 你的 provider 路由名
              keyRef: DEEPSEEK_API_KEY
              baseUrl: https://api.deepseek.com
```

只要 `baseUrl` 提供同构的 `GET /user/balance`（Bearer key，返回
`is_available` + `balance_infos`），即可接入任意平台。

## 安装（给其他人）

三种方式任选。**方式一最省事且热生效（无需重启）**；方式二是 DSH 官方插件管理路径；方式三是内存态动态插件。

### 方式一：一键安装脚本（推荐）

```bash
git clone https://github.com/Plocr/ui-dashboard.git
cd ui-dashboard
node scripts/install.mjs                  # 默认安装到 desktop profile
node scripts/install.mjs --profile=web    # 指定 profile
```

脚本会把 `package.json` + `lib/`（已构建的持久插件双半）复制到
`$DSH_HOME/profiles/<profile>/node_modules/ui-dashboard/`，并在该 profile 的
`cordis.patch.yml` 中幂等插入插件条目（`cordis.patch.yml` 被 DSH 热监听，通常立即生效）。
然后刷新 DSH 页面（未热生效就重启 app），打开任意会话即可看到入口。

### 方式二：DSH 官方插件管理（`dsh plugin`）

仓库同时是合规的 DSH **bundle**（`package.json` 声明 `dsh.bundle.patch`），可用官方命令安装：

```bash
# 需要 pnpm（dsh plugin 会在 profile 目录转发给 pnpm）
dsh plugin --profile desktop add git+https://github.com/Plocr/ui-dashboard.git
```

`lib/` 已随仓库提交、安装无需构建（无需 allowBuilds）。完成后**重启 app**（bundle 层在启动时解析），
插件会作为 profile 层自动加载。卸载：`dsh plugin --profile desktop remove ui-dashboard`。

### 方式三：动态插件（内存态，重启即失）

在 DSH 会话中用 Cordis 动态插件机制加载：

1. 用 `cordis_define` 定义插件（`idPrefix` 建议 `udash`）：`src/client.js` 内容作为 `code.client`、`src/host.js` 内容作为 `code.host`；
2. `cordis_run` 激活（首次需在界面批准）；
3. 打开任意会话 → 会话头部「仪表盘」按钮 / 会话标签「仪表盘」。

动态包只存在于共享 DSH 进程内存，`cordis_stop`/`cordis_undefine` 或重启后消失；要保留请用方式一或二。

## 使用

打开任意会话 → 点会话头部工具区「仪表盘」按钮（右侧栏展开仪表盘），或点会话标签栏的「仪表盘」标签（整页查看）。
右上角 × 关闭右侧栏。

## 架构

- **`src/client.js`**：Client 半边源码（动态插件函数体，无 JSX/TS）。注册：
  - `details` 槽位（single / session 作用域）→ 右侧栏仪表盘主体 `DashboardPanel`
  - `conversation.view` 槽位（list，加法席位，id: `dashboard`，order: 20）→ 会话标签页「仪表盘」
  - `conversation.session.header.utilities` 槽位（list，加法席位，id: `dashboard`）→ 「仪表盘」入口按钮
  - 包级样式经 `styles.insert()` 注入（`udash-` 前缀类名，随插件卸载自动清理）
  - 中英文文案经 `ctx.locale.register('dashboard', { zh, en })`
- **`src/host.js`**：Host 半边源码（动态形式，`harness.handle('current-model')`）。
- **`lib/`**：持久插件构建产物（随仓库提交）。`lib/client.js` 由 `build-client.js` 从 `src/client.js` 生成
  （`__ModuleLoader__` 包装、`require('react')`、`styles`/`host` 替身、`details` 注册补 `priority: -100` 遮蔽内置面板）；
  `lib/index.js` 是持久 Host 半边（`ctx.connection.rpc.handle('/rpc')` 提供 `current-model`）。
- **`scripts/install.mjs`**：一键安装脚本（方式一）。
- **`bundle.patch.yml`**：bundle 层 patch（方式二）。

改动 `src/client.js` 后运行 `node build-client.js` 重新生成 `lib/client.js`。

## 卸载

- 方式一安装：删除 `<profile>/cordis.patch.yml` 里的 `- insert: … ui-dashboard …` 块，并删除 `<profile>/node_modules/ui-dashboard/`；
- 方式二安装：`dsh plugin --profile <profile> remove ui-dashboard`。

## 兼容性

- 依赖 DSH 官方 Client 槽位与投影接口（`details`、`conversation.view`、`conversation.session.header.utilities`、`contextPressure`、`contextBreakdown`、`tokenUsage`、`sessionStats`、`goal`、`todos`、`jobsBySession`），随 DSH 版本演进可能需要适配。
- 占据 `details` 槽位会替换内置的「工具调用详情」面板（官方标注 replaceRisk: shadows-shipped-ui），当前版本未内嵌 `conversation.details.tool` 子席位。

## License

MIT
