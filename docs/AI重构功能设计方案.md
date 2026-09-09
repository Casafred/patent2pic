# 「AI 重绘重构」功能设计方案 V1

> 状态：设计稿（待评审）
> 日期：2026-09-09
> 关联规范：`DEVELOPMENT_RULES.md`

## 1. 功能定义

基于当前画布的**已生成结构**（含用户手动编辑过的节点文字、关系、层级），结合用户用自然语言描述的**新要求**（改节点文字、调属性、增删连接关系、调整分级层次等），让 AI 重新生成一个完整版本，**另开新标签页**保留旧版本，形成版本链。

**V1 范围内**：

- 整图重构（以当前图或原始抽取为基准）
- 新 Tab 保留旧版本，形成版本链（`sourceTabId` 元数据）
- 流式输出、可中断、生成后照常支持手动编辑与导出
- 重构摘要 `changes` 字段展示

**V1 明确不做**（留作 V2）：

- 仅对选中子图的局部重构
- 重绘指令历史回放
- 重绘前后 diff 视图 / 版本树

## 2. 交互设计

**入口**：`CanvasToolbar` 新增「AI 重构」按钮（当前 Tab 有图且有 API Key 时可用），点击弹出 `RedrawDialog`。

**对话框内容**（自上而下）：

| 区块 | 内容 |
|---|---|
| 基准信息 | 只读摘要：当前图 N 节点 / M 关系 / K 分组，基准来源单选：**当前画布（含手动编辑）** / 原始抽取结果 |
| 重构要求 | 多行文本框（核心输入），下方快捷指令条：点击填入模板，如「将…改名为…」「把…与…建立…关系」「将…提升为一级部件」「合并含义重复的节点」「按功能重新划分层级」 |
| 附加选项 | ☑ 引用权利要求原文作为参考上下文；☑ 保留原图 frames 动画帧 |
| 执行 | 「开始重构」主按钮；进行中显示流式输出预览 + 终止按钮；完成后对话框自动关闭 |

**结果**：新 Tab 命名 `权利要求 N · 重构V2`（V3、V4 递增，同一源 Tab 链上计数），旧 Tab 原样保留；新 Tab 的 claim 数据、翻译数据从源 Tab 复制，ClaimReader 正常工作。

## 3. 数据流

```
当前画布 → engine.toJSON() ──┐
                              ├→ 基准转换器(x6-to-extract) → buildRedrawMessages
原始 extractResult(备选基准) ─┘         +
                                   用户指令(对话框)
                                         ↓
                                   streamChat(流式，可中断)
                                         ↓
                                   parseExtractResult(复用现有校验/修复)
                                         ↓
                                   新Tab + updateTabExtractResult
                                         ↓
                                   graphEngine.batchBuild(result) ← 复用现有自动布局成图
```

关键点：**重构输出完全复用现有 `ExtractResult` schema 和 `batchBuild` 成图管线**——AI 只需要产出一份新的标准抽取 JSON，下游（布局、样式、播放动画、导出）零改动。

## 4. 模块级改动清单

严格遵循 `DEVELOPMENT_RULES` 分层（组件 → Composable → Service → Store，X6 只经 graphEngine）。

### 新增文件（4 个）

**① `src/services/graph/x6-to-extract.ts`** —— 基准转换器（纯函数，无 X6 依赖）

- 输入：`graphEngine.toJSON()` 的 X6 JSON
- 遍历 cells，按 data 标记过滤：剔除 `isForkNode`（分叉伪节点）、`isAttributeTag`（属性标签）；`isGroup: true` 的格子节点还原为 `ExtractGroup`（读 `memberNodeIds`、label）
- 普通节点 → `ExtractNode`（读 `data` 里的 `originalText/chineseText/nodeType/hierarchyLevel`）；边 → `ExtractEdge`（读 `source/target/relationType/originalText/chineseText`）
- 丢弃样式与坐标（AI 不需要）；用户手动改过的文字优先进入基准
- 预计约 90 行

**② `src/services/ai/redraw-prompt.ts`**（若嫌 prompt.ts 过长则独立，否则并入 prompt.ts）

- `buildRedrawMessages(base: ExtractResult, instructions: string, options)` 返回 `ChatMessage[]`，结构与现有 `buildMessages` 一致（system + user）
- Prompt 设计见第 5 节

**③ `src/composables/useAIRedraw.ts`** —— 编排层（参照 `useAIExtract` 写法）

```ts
async function redraw(sourceTabId: string, instructions: string, options: RedrawOptions): Promise<ExtractResult | null> {
  // 1. 取基准：options.base === 'current' ? x6ToExtractResult(engine.toJSON(), ...)
  //    : graphStore.tabs.find(id).extractResult（无图时自动降级到原始抽取）
  // 2. 复制源Tab的 rawText/claims/translations → graphStore.addTab(新Tab, 记录 sourceTabId + instructions + 版本号)
  // 3. aiStore.isExtracting = true（与普通抽取互斥）
  // 4. streamChat(buildRedrawMessages(...)) 流式累计 → streamContent ref 供对话框预览
  // 5. parseExtractResult() → 后处理：ID 去重兜底（AI 新造 ID 撞旧 ID 时重映射）
  // 6. graphStore.updateTabExtractResult(newTabId, result) + graphEngine.batchBuild(result, undefined, isChinese)
  // 7. 成功：初始化播放帧；失败/中断：removeTab(新Tab) + 回切源Tab + 错误提示
}
// 对外：redraw / streamContent / isRunning / abort(AbortController)
```

**④ `src/components/ai/RedrawDialog.vue`** —— UI 组件（参照 `AIConfigDialog` 的 el-dialog 风格），只调用 `useAIRedraw`，不直接碰 AI。

### 修改文件（4 个，改动都很小）

| 文件 | 改动 |
|---|---|
| `src/types/redraw.ts`（或并入 types/graph.ts） | `RedrawOptions` 接口；`TabData` 增加可选字段 `sourceTabId?: string`、`redrawInstructions?: string`、`redrawVersion?: number` |
| `src/stores/graph.ts` | `addTab` 增加可选 `redraw` 元信息参数（保持向后兼容，全有默认值） |
| `src/components/canvas/CanvasToolbar.vue` | 新增「AI 重构」按钮 + 打开对话框 |
| `README.md` | 功能清单补一行 |

## 5. Prompt 设计（功能成败的关键）

System prompt 核心结构（草案）：

```text
你是专利功能分解图的重构专家。用户将提供：①当前分解图的完整结构 JSON
②一条或多条自然语言重构指令。你的任务是输出一份【全新完整】的分解图 JSON，
其 schema 与输入结构完全相同（nodes/edges/groups/frames...）。

规则：
1. 未被指令涉及的节点/关系：原样保留，ID 不变，文本不变（这是版本对比的基础）
2. 被指令涉及的：按指令修改文本/类型/hierarchyLevel/relationType，保持 ID 稳定
3. 删除：指令要求删除时，同步清理引用该节点/关系的 groups 与 frames
4. 新增：新节点 ID 用 "n-new-1" 起编号，新边同理，禁止复用已存在的 ID
5. nodeType/relationType 只能取给定枚举值（结构类/方法类/混合类同现有约束）
6. 所有新增文本必须同时给出 originalText 与 chineseText 双语字段
7. groups 的 memberNodeIds 必须全部指向存在的节点
8. frames 动画帧按新结构重新编排（3-8 帧，规则同抽取）
9. 只输出 JSON，不要任何解释文字

注意：指令可能相互冲突或与结构矛盾，此时按"结构事实优先、指令次之，
并在 JSON 顶层 changes 字段中用中文说明你做了什么取舍"。
```

**亮点设计**：输出 JSON 顶层增加可选 `changes: string[]` 字段（重构摘要，如「已将 X 改名为 Y」「因冲突忽略指令 Z」），对话框完成后以 `el-alert` 展示，让用户立刻知道 AI 改了什么。`parseExtractResult` 校验时容忍该字段（不影响现有校验）。

**Provider 适配**：DeepSeek 走 thinking 模式 + `json_object`，与现有 `buildMessages` 对 provider 的分支处理保持一致；基准 JSON 作为 user 消息内嵌，指令置于 JSON 之后强调。

## 6. 关键设计决策

| 决策 | 理由 |
|---|---|
| 基准默认取**当前画布**而非原始抽取 | 用户手动改名/删边后的图才是“已生成的结构”本意；原始抽取作为单选备选 |
| 重绘产物走**标准 ExtractResult + batchBuild** | 下游管线（ELK 布局/样式/播放/导出/p2p 保存）全部免改，回归风险最小 |
| **新 Tab + 版本链元数据**而非覆盖 | 需求明确要求另开标签页；`sourceTabId` 字段让后续做 diff 视图、版本树成为可能 |
| 指令保存在 TabData | .p2p 工程文件与自动保存会一并持久化，用户重开文件能回溯每版重构依据 |
| 不新增任何 npm 依赖 | 遵守体积红线；纯前端逻辑即可完成 |
| 与抽取共用 `isExtracting` 互斥锁 | 避免并发流式请求破坏画布状态 |

## 7. 边界情况

1. **当前画布为空但 extractResult 存在** → 自动切换基准为原始抽取，对话框中提示
2. **AI 输出 ID 冲突/重复** → composable 后处理重映射 + 校验器已有去重逻辑兜底
3. **JSON 截断/解析失败** → 复用 `tryRepairJSON`；仍失败则删新 Tab、报错并保留重试按钮
4. **用户中途终止** → AbortController，删除半成品 Tab，回切源 Tab
5. **指令为空** → 对话框校验拦截（不允许“无指令全靠 AI 发挥”）
6. **fork 伪节点/组框误入基准** → 转换器按 data 标记过滤（标记已确认存在于 engine.ts）
7. **极大图 Token 超限** → 基准 JSON 只含 id/文本/类型/层级/关系，无样式坐标；超 200 节点时对话框给出警告

## 8. 实施步骤（每步一个 git commit）

1. **类型层**：`RedrawOptions`、`TabData` 扩展、`addTab` 兼容改造
2. **基准转换器**：`x6-to-extract.ts` + 用一个真实 .p2p 图 JSON 做手动冒烟验证
3. **Prompt**：`buildRedrawMessages` + changes 字段约定
4. **Composable**：`useAIRedraw.ts` 全流程 + ID 兜底
5. **UI**：`RedrawDialog.vue` + 工具栏入口 + 完成后的 changes 摘要展示
6. **整体验证**：`vue-tsc --noEmit && vite build` 全绿 + 浏览器 dev 模式跑通一次假数据全流程，更新 README

## 9. 验证方案

- **静态**：`npm run build`（含 vue-tsc strict 类型检查）
- **转换器**：node 脚本对样例 X6 JSON 跑转换，断言节点数/边数/组数与过滤规则
- **端到端**：dev 模式下用 mock（或真实 API Key）走「粘贴权利要求 → 生成 → 输入指令“把节点 X 改名并增加一条关系” → 新 Tab 出图 → 旧 Tab 未受影响」

## 10. 待确认事项

1. 对话框「基准来源」默认选**当前画布**（含手动编辑）还是原始抽取结果
2. 新 Tab 命名风格：「权利要求 N · 重构V2」
3. 实现顺序：先跑通核心链路（转换器→Prompt→流式→新Tab成图）再打磨对话框 UI
