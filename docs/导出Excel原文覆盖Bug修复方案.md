# 导出 Excel 原文跨分析覆盖 Bug 修复方案

> 状态：修复方案（待评审，未实施）
> 日期：2026-09-10
> 关联规范：`DEVELOPMENT_RULES.md`

## 1. 问题现象

多个标签页分析的场景下，导出对照翻译 Excel 时：

- **先分析的专利原文会被最新分析的原文（部分）覆盖**——只有新一轮分析开始时处于激活状态的那个旧标签页受害，其余旧标签页完好，故表现为"部分覆盖"
- 对照翻译部分基本各自保留（各标签页有独立的翻译快照，且未被新一轮权利要求编号覆盖到的条目幸存）

用户诉求：**每个分析独立保留其原文与对照翻译，导出的 Excel 中也是如此体现。**

## 2. 根因定位（三条，均已代码核实）

### 根因 ①：Tab 切换保存/恢复存在时序竞态（直接造成"原文被覆盖"）

两处代码存在同一个失效的"保护补丁"：

- `useAIExtract.extract()`（单条模式）：`addTab(..., activate=true)` 后立即同步恢复旧 Tab 数据
- `useParallelExtract.runParallel()`（并行模式）：`graphStore.setActiveTabId(firstSuccess.tabId)` 后立即同步恢复旧 Tab 数据

补丁意图（源码注释自述）：Tab 切换 watcher（`AppLayout.vue` 的 `watch(activeTabId)`）会把**当时的全局 claimStore** 存入旧 Tab，覆盖其原始数据；补丁想在覆盖后把旧 Tab 恢复回来。

**实际执行顺序（Vue watcher 默认 pre-flush 异步）**：

```
1. setActiveTabId(新Tab)          → watcher 任务入队（尚未执行）
2. 同步执行"恢复旧 Tab"补丁        → 旧 Tab 恢复为原始数据 ✓
3. 微任务队列 flush，watcher 执行  → 把全局 claimStore（= 新一轮 B 的 claims + B 的 rawText）
                                      存入旧 Tab ✗ ← 覆盖了第 2 步的恢复！
```

补丁跑在 watcher **之前**而非之后，恢复完全失效。净效果：**旧 Tab（A 的激活 Tab）的 rawText/claims 被替换为 B 的内容**——切回该 Tab 导出 Excel 时，"原文"列读到 B 的句子。

### 根因 ②：claimId / sentenceId 跨分析碰撞（造成翻译全局副本串扰、分析中切 Tab 串扰）

`services/claim/parser.ts`：

```ts
id: `claim-${index + 1}`                    // 仅按文本内序号编号
sentences: splitSentences(text, index + 1)  // 句子 id: `claim-${claimIndex}-sent-${idx}`
```

两次分析（专利 A、专利 B）的 ID 空间完全重叠（都有 `claim-1`、`claim-1-sent-1`…）。后果：

1. 翻译 store 的 `Map<claimId, ClaimTranslation>`：B 的 `initClaimTranslation("claim-1")` 直接覆盖全局 Map 里 A 的同名条目（A 权利要求数多于 B 时，多出的条目幸存——这正是"翻译部分保留、原文被覆盖"的不对称来源之一）
2. 若用户在 B 分析**进行中**切回 A 的 Tab：watcher 把 A 的 claims 恢复进全局 store，B 后续任务的 `updateClaimSentences("claim-N", B句子)` 会把 B 的句子写进 **A 的 claim 对象**

### 根因 ③：Tab 快照为引用共享 + 导出直读全局可变 store

- `updateTabClaimData(oldTabId, claimStore.claims, ...)` 存的是**数组引用**；恢复侧 `claimStore.setClaims(newTab.claims)` 也是引用赋值。Tab 快照与全局 store 共享同一对象，任何一侧的原地修改（如 `updateClaimSentences` 直接改 `claim.sentences`）都会穿透到所有共享方，污染范围随引用链扩散
- `useExportExcel.exportToExcel()` 直接读 `claimStore.getActiveClaim()` + `translationStore`——全局态被污染即直接反映到导出结果

## 3. 修复方案（四项，组合实施）

### 修复 A：纠正保存/恢复时序（堵住"覆盖"动作）

`useAIExtract.extract()` 与 `useParallelExtract.runParallel()` 中，在激活新 Tab 之后**先 `await nextTick()` 让 watcher 完成保存，再执行旧 Tab 数据恢复**：

```ts
import { nextTick } from 'vue'

graphStore.setActiveTabId(firstSuccess.tabId)   // 或 addTab(..., activate=true)
await nextTick()                                 // ← 新增：等 watcher 的"污染式保存"先落地
if (savedClaimData) {                            // 原有恢复补丁（真正生效）
  graphStore.updateTabClaimData(...)
  graphStore.updateTabTranslations(...)
}
```

仅 2 处各加 1 行，行为与原补丁注释意图完全一致。

### 修复 B：claimId / sentenceId 全局唯一化（根治跨分析串扰）

1. `parseClaims(rawText, sessionId?)`：claim.id 改为 `claim-{sessionId}-{index}`；句子 id 改为 `${claim.id}-sent-{idx}`（不再使用独立的 claimIndex 前缀）
2. sessionId 由 parser 模块内递增计数器分配；**输入期不传 sessionId**（保持 `claim-N` 稳定格式，ClaimReader 展示/activeClaimId 跟随不受影响），**分析入口分配新 sessionId 并重新 parseClaims + setClaims**——整个分析链路（TabData.claimId、句子对齐、翻译 Map key）落入唯一 ID 空间
3. 入口位置：`ClaimInput.handleGenerate()` / `handleParallelGenerate()` 开头统一处理
4. 三处硬编码句子 ID 的位置同步收敛：`parser.ts`、`useAIExtract.applySentencePairs`、`useParallelExtract.applySentencePairs`

唯一化后：翻译 Map 的 key 天然不冲突；分析中切 Tab 后 `updateClaimSentences` 按唯一 ID 寻址不到对方数据，串扰窗口彻底关闭。

### 修复 C：Tab 快照深拷贝（切断引用穿透）

`stores/graph.ts` 的 `updateTabClaimData` / `addTab`（claims 参数）/ `updateTabTranslations` 内部对入参做深拷贝（`structuredClone` 或 `JSON.parse(JSON.stringify())`），保证 TabData 快照不可变；恢复侧 `setClaims` 同样拷贝后注入全局 store。快照与全局从此互不穿透。

### 修复 D：导出从活动 Tab 快照取数（最终防线 + 独立性体现）

`useExportExcel.exportToExcel()`：

1. 数据源改为**活动 Tab 的快照**：`graphStore.activeTab.claims`（结合该 Tab 的 `activeClaimId`）+ `activeTab.translations` 中对应 claim 的条目；仅当 Tab 快照缺失时回退全局 store。即便全局态被意外污染，导出的仍是该 Tab 自己的数据
2. 文件名增加 Tab 标识：`权利要求翻译_{tabName}_{claim.index}.xlsx`（tabName 如"权利要求 3"），多分析场景下导出文件天然可区分，满足"每个分析独立体现"的诉求

## 4. 改动文件清单

| 文件 | 改动 | 对应修复 |
|---|---|---|
| `src/composables/useAIExtract.ts` | `await nextTick()` 时序修复；句子 ID 挂 claimId | A、B |
| `src/composables/useParallelExtract.ts` | 同上 | A、B |
| `src/services/claim/parser.ts` | sessionId 参数 + 句子 ID 格式 | B |
| `src/components/input/ClaimInput.vue` | 分析入口分配 sessionId 重新解析 | B |
| `src/stores/graph.ts` | 快照写入深拷贝 | C |
| `src/composables/useExportExcel.ts` | Tab 快照取数 + 文件名 | D |
| 检查项（不改或微调） | `AppLayout.vue` watcher、`useAutoSave.ts`、`useProjectFile.ts` 恢复路径兼容性 | — |

## 5. 兼容性说明

- **旧 .p2p 工程文件 / localStorage 自动保存**：TabData.claims 自带旧格式 ID（`claim-N`），恢复路径直接使用存量数据不重新解析，照常工作；旧工程中再分析新文本则进入新 ID 空间，无冲突
- ClaimReader 展示、导出文件名使用 `claim.index`（纯数字），不受 ID 格式变化影响
- 单条/并行两条抽取链路共用同一套修复

## 6. 验证方案

1. **静态**：`npm run build`（vue-tsc strict）全绿
2. **端到端手测矩阵**：
   - 专利 A（多条权利要求，并行）→ 停留在某 Tab → 粘贴专利 B 并行分析 → 完成后**逐个 Tab** 导出 Excel：A 的 Tab 原文/译文均为 A 的内容，B 的 Tab 同理；特别验证 A 中"分析 B 时激活的那个 Tab"
   - 专利 A（单条）→ 专利 B（单条）重复上述验证
   - B 分析**进行中**切回 A 的 Tab 再切回，B 完成后无串扰
   - 恢复旧自动保存/工程文件后导出正常
3. **冒烟**：node 脚本验证 parser 两次解析的 ID 互不相同、句子 ID 跟随 claimId

## 7. 实施步骤（每步一个 git commit）

1. 修复 A：两处 `await nextTick()` 时序修复（最小改动，先行止血）
2. 修复 C：快照深拷贝
3. 修复 B：ID 唯一化三件套（parser / 入口 / 句子 ID 收敛）
4. 修复 D：导出取数与文件名
5. 全量验证 + README 如需更新
