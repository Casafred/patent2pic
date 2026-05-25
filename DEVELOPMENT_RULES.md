# Patent2Pic 开发规范与守则

> **本文件为项目开发前置必读文件。每次开始开发前必须完整阅读并遵循。**
> 任何违反本规范的代码提交将被要求重写。

---

## 一、项目概述

Patent2Pic 是一个基于 Tauri 2.0 + Vue 3 + AntV X6 的桌面应用，用于从专利独立权利要求文本中自动抽取部件与关系，生成可编辑的功能分解图，并支持导出。

核心价值链：**文本输入 → AI 抽取 → 自动成图 → 手动调整 → 导出**

---

## 二、技术栈锁定

以下为项目确定的技术栈，**未经讨论不得替换**：

| 层级 | 技术 | 版本约束 |
|------|------|----------|
| 桌面框架 | Tauri | 2.x |
| 前端框架 | Vue 3 | 3.5+ |
| 状态管理 | Pinia | 2.x |
| 画布引擎 | @antv/x6 | 2.x |
| 布局算法 | @antv/layout | 1.x |
| UI 组件库 | Element Plus | 2.x |
| 构建工具 | Vite | 6.x |
| 语言 | TypeScript | 5.x（strict 模式） |
| 后端 | Rust（Tauri 内置） | - |

**禁止引入的**：
- ❌ jQuery / Lodash / Moment.js（用原生 API 或 dayjs）
- ❌ 任何超过 500KB 的依赖（打包前 gzipped）
- ❌ 任何需要 native addon 的 npm 包（Tauri WebView 环境不兼容）
- ❌ Electron 或任何 Chromium 嵌入方案
- ❌ Python 运行时或 Python 桥接库

---

## 三、架构原则

### 3.1 分层架构（严格遵循）

```
Vue 组件层（只做 UI 渲染 + 事件绑定）
    │
    ▼
Composable 层（连接 Vue 与 Service，管理响应式状态和生命周期）
    │
    ▼
Service 层（纯逻辑，纯函数/类，不依赖 Vue 响应式系统）
    │
    ▼
Store 层（只存数据，不放业务逻辑方法）
    │
    ▼
Tauri 后端（文件系统、系统对话框、剪贴板等原生能力）
```

**强制规则**：

1. **组件层禁止直接调用 Service**。必须通过 Composable 中转。
2. **Service 层禁止 import Vue 相关 API**（`ref`, `reactive`, `computed`, `watch` 等）。Service 是纯 TypeScript 逻辑层。
3. **Store 只存数据**。业务逻辑写在 Service 或 Composable 中，Store 只提供 `state` 和 `action`（action 只做简单的赋值，不含复杂逻辑）。
4. **Tauri 后端只做前端做不到的事**：文件读写、系统对话框、剪贴板、窗口管理。所有能在前端完成的逻辑不要放到 Rust 端。

### 3.2 单一职责

- 每个文件只做一件事
- 每个函数只做一件事
- 每个类只负责一个领域

判断标准：如果一个文件的描述需要用"和"连接，就应该拆分。

### 3.3 依赖方向

依赖只能从上层指向下层，**禁止反向依赖**，禁止循环依赖：

```
组件 → Composable → Service → Store
组件 → Store（只读 state）
禁止：Store → Service → Composable → 组件
禁止：Service 之间循环引用
```

---

## 四、命名规范

### 4.1 文件命名

| 类型 | 规范 | 示例 |
|------|------|------|
| Vue 组件 | PascalCase | `ClaimInput.vue`, `GraphCanvas.vue` |
| Composable | camelCase，use 前缀 | `useGraph.ts`, `useAIExtract.ts` |
| Service | kebab-case | `node-builder.ts`, `edge-builder.ts` |
| Store | kebab-case | `claim.ts`, `graph.ts` |
| 类型文件 | kebab-case | `claim.ts`, `graph.ts` |
| 工具函数 | kebab-case | `id-generator.ts` |

### 4.2 代码命名

| 类型 | 规范 | 示例 |
|------|------|------|
| 组件名 | PascalCase | `ClaimInput` |
| Composable 函数 | use 前缀 + PascalCase | `useGraphInteraction` |
| 类 | PascalCase | `GraphEngine`, `NodeBuilder` |
| 函数/方法 | camelCase | `addNode()`, `applyLayout()` |
| 常量 | UPPER_SNAKE_CASE | `MAX_HISTORY_SIZE`, `DEFAULT_LAYOUT` |
| 类型/接口 | PascalCase | `NodeData`, `ExtractResult` |
| Store state | camelCase | `rawText`, `activeClaimId` |
| Store action | camelCase，动词前缀 | `setText()`, `addClaim()` |
| 事件处理 | handle 前缀 | `handleNodeClick()`, `handleExport()` |
| CSS 类名 | kebab-case | `claim-input`, `canvas-toolbar` |
| CSS 变量 | --前缀 + kebab-case | `--color-primary`, `--font-size-sm` |

### 4.3 禁止的命名

- ❌ 单字母变量（循环变量 `i` 除外）
- ❌ 缩写（`btn` → `button`, `cfg` → `config`, `ctx` → `context`）
- ❌ 无意义前缀（`data`, `info`, `item` 除非上下文明确）
- ❌ 布尔值非 is/has/can/should 开头（`visible` → `isVisible`）

---

## 五、TypeScript 规范

### 5.1 严格模式

`tsconfig.json` 必须开启：

```json
{
  "compilerOptions": {
    "strict": true,
    "noImplicitAny": true,
    "noImplicitThis": true,
    "strictNullChecks": true,
    "strictFunctionTypes": true
  }
}
```

### 5.2 类型优先

- **禁止使用 `any`**。如果类型不确定，用 `unknown` 并做类型守卫。
- **禁止使用 `as` 类型断言**，除非确信类型安全（如 X6 API 返回值），必须加注释说明原因。
- **所有函数参数和返回值必须显式声明类型**。
- **所有 export 的函数/类/接口必须有类型声明**。

### 5.3 类型定义位置

- 跨模块共享的类型 → `src/types/` 目录
- 仅模块内部使用的类型 → 文件顶部定义，不 export
- 组件 props 类型 → 使用 `defineProps<T>()` 泛型语法

### 5.4 枚举 vs 联合类型

- 固定值集合用 **字面量联合类型**：`type RelationType = 'position' | 'action' | 'containment' | 'logical'`
- 需要反向映射时用 **enum**：不推荐，除非有明确需求

---

## 六、Vue 组件规范

### 6.1 组件结构顺序

```vue
<script setup lang="ts">
// 1. 类型导入
// 2. 外部依赖导入
// 3. 内部模块导入（composable, service, store）
// 4. Props 定义
// 5. Emits 定义
// 6. Composable 调用
// 7. 响应式数据
// 8. 计算属性
// 9. 方法
// 10. 生命周期钩子
</script>

<template>
</template>

<style scoped>
</style>
```

### 6.2 强制规则

- **必须使用 `<script setup lang="ts">`**，禁止 Options API。
- **必须使用 `<style scoped>`**，禁止全局样式污染（`x6-overrides.css` 除外）。
- **Props 必须定义类型**，使用 `withDefaults` + 泛型。
- **组件内禁止直接操作 X6 实例**，必须通过 `useGraph` composable。
- **组件内禁止直接调用 AI API**，必须通过 `useAIExtract` composable。
- **模板中禁止复杂表达式**，超过一行逻辑提取为 computed 或方法。

### 6.3 组件拆分标准

当一个组件满足以下任一条件时必须拆分：
- `<script setup>` 超过 150 行
- `<template>` 超过 100 行
- 承担了两个以上的 UI 职责

---

## 七、X6 画布引擎规范

### 7.1 引擎封装原则

**X6 Graph 实例的唯一入口是 `GraphEngine` 类**。所有对画布的操作必须通过 `GraphEngine` 的方法，禁止在组件或 composable 中直接调用 `graph.addNode()` 等 X6 原生 API。

原因：如果未来需要替换画布引擎（如切换到 maxGraph），只需重写 `GraphEngine` 实现，不影响上层代码。

### 7.2 节点/边构建

- 节点构建统一通过 `NodeBuilder.build()`
- 边构建统一通过 `EdgeBuilder.build()`
- **禁止在组件中硬编码 X6 节点/边的样式配置**，样式预设集中在 `style-registry.ts`

### 7.3 事件处理

- X6 事件监听在 `useGraphInteraction` composable 中注册
- 组件通过 composable 暴露的方法/响应式变量获取事件结果
- **组件销毁时必须清理事件监听**，在 `onUnmounted` 中调用 `engine.off()`

### 7.4 序列化

- 图数据序列化/反序列化统一通过 `serializer.ts`
- 导出 JSON 格式使用项目自定义的 `GraphJSON` 类型，不是 X6 原生的 `toJSON()` 输出
- 版本号字段 `version` 必须随格式变更递增

---

## 八、AI 服务规范

### 8.1 API Key 安全

- **API Key 禁止硬编码在源码中**
- **API Key 禁止写入版本控制**（.gitignore 中排除 .env 文件）
- API Key 存储在 Tauri 的安全存储中（`@tauri-apps/plugin-store`），或用户本地配置文件
- 日志中禁止打印 API Key 或完整请求体

### 8.2 Prompt 管理

- Prompt 模板集中在 `services/ai/prompt.ts`
- **禁止在组件或 composable 中内联 Prompt 文本**
- 用户自定义 Prompt 保存到本地配置，不覆盖默认模板

### 8.3 抽取结果校验

AI 返回的结果**必须经过 `extractor.ts` 校验**后才能进入图生成流程：

- JSON 格式校验
- 必填字段完整性校验
- 节点 ID 唯一性校验
- 边的 source/target 必须指向已存在的节点
- 校验失败时给出明确错误提示，不静默丢弃

### 8.4 错误处理

- API 调用失败：展示错误信息 + 重试按钮
- 超时（30秒）：提示用户检查网络或换模型
- 返回格式异常：展示原始返回内容，让用户手动修正
- **禁止静默吞掉任何 AI 相关错误**

---

## 九、样式与 UI 规范

### 9.1 设计语言

- 整体风格：**简洁、专业、工具感**，参考 Figma / Draw.io 的界面风格
- 主色调：蓝色系（`#1890FF` 为主色）
- 关系类型配色：位置=蓝、动作=绿、包含=橙、逻辑=紫（与 X6 边样式一致）
- 字体：系统默认字体栈，不引入外部字体文件
- 间距：4px 为基准单位，所有间距为 4 的倍数

### 9.2 CSS 规范

- 使用 CSS 变量管理主题色，定义在 `theme.css` 中
- 组件样式必须 `scoped`
- 禁止 `!important`（X6 样式覆盖除外）
- 禁止内联 style（动态样式用 `:style` 绑定 CSS 变量）
- 响应式布局使用 CSS Grid / Flexbox，不硬编码像素宽度

### 9.3 交互规范

- 所有可点击元素必须有 hover/active 视觉反馈
- 加载状态必须有进度指示（spinner / skeleton / 进度条）
- 危险操作（删除、清空）必须有二次确认
- 快捷键必须与系统惯例一致（Ctrl+Z 撤销、Ctrl+S 保存、Ctrl+E 导出）

---

## 十、数据与状态规范

### 10.1 双语数据原则

**所有节点标签和边标签必须同时包含原文和中文对照**：

```typescript
// 正确
{ originalText: "housing", chineseText: "壳体" }
{ originalText: "is disposed on", chineseText: "设置于" }

// 错误 — 只有中文
{ label: "壳体" }
```

- 原文必须严格遵循权利要求原文用词，**禁止替换、改写、意译**
- 中文对照为辅助翻译，帮助理解
- 显示时原文在上、中文在下，或根据用户设置切换

### 10.2 Store 数据不可变原则

Store 中的数组/对象更新必须替换整个引用，禁止直接修改：

```typescript
// 正确
claimStore.setClaims([...claims, newClaim])

// 错误
claims.push(newClaim)
```

### 10.3 撤销/重做

- 所有图数据变更（节点增删、样式修改、位置移动）必须记录到 historyStore
- 历史栈最大 50 条，超出时丢弃最早的记录
- 撤销/重做操作通过 `engine.fromJSON()` 整图恢复，不做增量操作

---

## 十一、性能约束

| 指标 | 阈值 | 说明 |
|------|------|------|
| 安装包体积 | ≤ 15 MB | NSIS 安装包 |
| 安装后体积 | ≤ 20 MB | 磁盘占用 |
| 冷启动时间 | ≤ 2 秒 | 从双击到界面可交互 |
| 画布渲染 | ≤ 500ms | 50 节点以内从数据到渲染完成 |
| AI 抽取 | ≤ 30 秒 | 单条权利要求（取决于 API 响应） |
| 内存占用 | ≤ 150 MB | 正常使用状态 |
| 前端打包体积 | ≤ 800 KB | Vite 构建产物（gzipped） |

**禁止引入会突破以上约束的依赖或实现方式。**

---

## 十二、导出规范

### 12.1 支持的导出格式

| 格式 | 用途 | 实现方式 |
|------|------|----------|
| PNG | 文档插图 | `@antv/x6-plugin-export` + Tauri 写文件 |
| SVG | 矢量图 | `@antv/x6-plugin-export` + Tauri 写文件 |
| JSON | 数据交换/重新导入 | `serializer.ts` 序列化 |
| .p2p | 项目文件（含文本+图+配置） | JSON + gzip，Tauri 写文件 |

### 12.2 导出质量

- PNG 默认 2x 分辨率（Retina 适配）
- 导出边距默认 20px
- 背景色默认白色
- 导出前自动 fitView 确保所有内容可见

---

## 十三、错误处理原则

1. **用户可见的错误必须有人类可读的中文提示**，不展示技术性错误信息
2. **禁止静默吞掉异常**。所有 catch 块必须有处理逻辑（日志/提示/降级）
3. **网络错误提供重试机制**，不强制用户重启
4. **数据损坏时提供恢复选项**，不直接清空
5. **Tauri 命令失败时**，前端展示友好提示，不暴露 Rust panic 信息

---

## 十四、Git 规范

### 14.1 分支策略

```
main          ← 稳定发布版本
├── dev       ← 开发主分支，日常合并目标
├── feat/xxx  ← 功能分支
├── fix/xxx   ← 修复分支
└── refactor/xxx ← 重构分支
```

### 14.2 提交信息格式

```
<type>(<scope>): <description>

type: feat | fix | refactor | style | docs | test | chore
scope: canvas | ai | input | panel | export | store | tauri
```

示例：
- `feat(canvas): 添加限定框创建功能`
- `fix(ai): 修复抽取结果节点 ID 重复问题`
- `refactor(store): 拆分 graphStore 为 nodes 和 edges`

### 14.3 禁止提交

- ❌ .env 文件或包含 API Key 的文件
- ❌ node_modules /
- ❌ src-tauri/target/ 目录
- ❌ 任何构建产物（dist/）
- ❌ IDE 配置文件（.idea/, .vscode/ 除非团队统一）

---

## 十五、测试原则

- Service 层的核心函数必须有单元测试
- AI 抽取结果校验逻辑必须有测试
- 文本分段解析必须有测试
- 图数据序列化/反序列化必须有测试
- 测试框架：Vitest（与 Vite 集成）

---

## 十六、安全红线

1. **API Key 绝不出现在源码、日志、网络请求 URL 中**
2. **用户输入的权利要求文本仅存储在本地**，不上传到任何第三方服务器（AI API 调用除外）
3. **AI API 调用仅发送文本内容**，不发送用户系统信息、文件路径等
4. **导出文件不嵌入隐藏信息**
5. **Tauri 权限最小化**：只声明实际需要的权限（文件读写、对话框），不使用 `allow-all`

---

## 十七、开发前检查清单

每次开始开发前，确认以下事项：

- [ ] 已阅读本规范文件
- [ ] 了解当前任务涉及的模块层级（组件/Composable/Service/Store）
- [ ] 确认依赖方向正确（不反向依赖）
- [ ] 确认新增依赖不会突破体积约束
- [ ] 确认类型定义完整（无 any）
- [ ] 确认双语数据结构正确（originalText + chineseText）
- [ ] 确认错误处理到位（无静默吞异常）
- [ ] 确认 API Key 不硬编码

---

## 十八、术语表

| 术语 | 含义 |
|------|------|
| 权利要求 | Patent Claim，专利文档中的权利要求条款 |
| 独立权利要求 | Independent Claim，不引用其他权利要求的条款 |
| 部件 | Component，权利要求中的名词性实体（零件、模块、子系统） |
| 关系 | Relation，部件之间的连接（位置、动作、包含、逻辑） |
| 限定框 | Group Box，虚线矩形，用于包裹具有包含关系的多个节点 |
| 分解图 | Decomposition Graph，本项目生成的核心产出物 |
| 双语对照 | Bilingual，原文语言 + 中文翻译同时显示 |
| 抽取 | Extraction，从文本中识别部件和关系的过程 |
| .p2p | Patent2Pic 项目文件格式 |
