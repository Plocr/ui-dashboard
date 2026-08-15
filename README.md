# ui-dashboard

DeepSeek Harness（DSH）右侧仪表盘 UI 插件。

占据 Web 界面 shell 内置的 `details` 槽位（右侧第三栏，模仿官方 `ui-sidebar` 占据 `sidebar` 的方式），
在会话头部工具区提供「仪表盘」入口按钮，以可视化方式展示当前会话的上下文占用、Token 用量与费用估算、会话统计、目标、待办、后台任务与工作区信息。

## 功能

| 卡片 | 内容 | 数据来源 |
| --- | --- | --- |
| 上下文 | 左：粗圆环（14px 描边，按系统提示/工具/消息三色分段，百分比内嵌环心）；右：组成列表 + 比例条 | `contextPressure` / `contextBreakdown` 投影 |
| 用量 · 费用 · 统计（融合版块） | KPI 汇总格（轮次/步骤/总 Token/费用 ¥）→ 金额占比单条图 → 行内 `token · 金额` → 合计 → 统计徽章（模型/工具耗时、平均首字延迟、生成速度） | `tokenUsage` / `sessionStats` 投影 + Host 模型选择 |
| 目标 | 目标文（两行截断）+ 阶段 + 轮次进度条 | `goal` 投影 |
| 待办 | 完成进度条 + 状态圆点列表 + 汇总 | `todos` 投影 |
| 后台任务 | 状态计数徽章 + 任务列表 | `useSessions().jobsBySession` |
| 工作区 | 标题 + 路径 | `useWorkspaces` 反查 |

费用估算：按 DeepSeek 官方人民币公开价（deepseek-chat：未缓存输入 ¥2 / 缓存命中 ¥0.5 / 输出 ¥8 每百万 tokens；deepseek-reasoner：¥4 / ¥1 / ¥16），
基于 `tokenUsage` 投影分桶计算；当前模型由 Host 半边通过 `agentDefaultModel.currentSelection()` 读取（Package-private RPC `current-model`）。仅为估算，可能与实际账单不符。

## 架构

- **Client 半边**（`src/client.js`）：纯 JS 插件函数体，无 JSX/TS。注册：
  - `details` 槽位（single / session 作用域）→ 仪表盘主体 `DashboardPanel`
  - `conversation.session.header.utilities` 槽位（list，加法席位，id: `dashboard`）→ 「仪表盘」入口按钮
  - 包级样式经 `styles.insert()` 注入（`udash-` 前缀类名，随 Client run 自动清理）
  - 中英文文案经 `ctx.locale.register('dashboard', { zh, en })`
- **Host 半边**（`src/host.js`）：提供 `current-model` RPC（读取默认模型选择）。

命名遵循官方规则：插件名 `ui-dashboard`（`ui-*` 客户端 UI 插件前缀）。

## 使用方式

### 作为 DSH 动态插件（推荐）

在 DSH 会话中使用 Cordis 动态插件机制加载：

1. 用 `cordis_define` 定义插件（`idPrefix` 建议 `udash`），将 `src/client.js` 内容作为 `code.client`、`src/host.js` 内容作为 `code.host`；
2. `cordis_run` 激活（首次需在界面批准）；
3. 打开任意会话 → 点会话头部工具区「仪表盘」按钮 → 右侧栏展开仪表盘。

### 作为包源码

本仓库为纯源码工程（无构建步骤），`src/` 下即为可直接使用的插件函数体。

## 兼容性

- 依赖 DSH 官方 Client 槽位与投影接口（`details`、`conversation.session.header.utilities`、`contextPressure`、`contextBreakdown`、`tokenUsage`、`sessionStats`、`goal`、`todos`、`jobsBySession`），随 DSH 版本演进可能需要适配。
- 占据 `details` 槽位会替换内置的「工具调用详情」面板（官方标注 replaceRisk: shadows-shipped-ui），当前版本未内嵌 `conversation.details.tool` 子席位。

## License

MIT
