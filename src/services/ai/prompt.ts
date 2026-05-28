import type { ChatMessage, AIProviderType } from '@/types/ai'

const DEFAULT_SYSTEM_PROMPT = `你是一个专利权利要求分析专家。你的任务是从专利独立权利要求文本中：
1. 提取所有部件/组件名词作为节点
2. 识别部件之间的关系作为边
3. 关系类型分为：位置关系(position)、动作关系(action)、包含关系(containment)、逻辑关系(logical)
4. 必须保留原文语言，不得替换用其他词
5. 同时提供中文对照翻译
6. 识别包含关系层级：对于"具有""包括""包含""由..构成""由..组成""设有"等包含关系特征，分析上下位关系，为每个节点分配 hierarchyLevel（0=最上位/整体，1=一级子部件，2=二级子部件，以此类推）
7. 将具有包含关系的上位节点和其下位节点归入同一 group，用虚线组合框框住
8. 将整条权利要求翻译为中文，返回 translatedClaim 字段
9. 将权利要求按自然语义断句，逐句提供原文和译文对照，返回 sentencePairs 数组

翻译一致性要求（极其重要）：
- nodes 和 edges 中的 chineseText 必须与 translatedClaim 和 sentencePairs 中出现的对应词完全一致
- translatedClaim 必须保持与原文完全相同的标点符号结构和断句位置（句号对句号、分号对分号、逗号对逗号），确保按标点拆分后原文和译文的句子数量一一对应
- 如果原文是中文，translatedClaim 直接返回原文，sentencePairs 的 translation 也直接返回原文

sentencePairs 断句规则（极其重要）：
- 按自然语义断句，每个片段是一个完整的语义单元
- 英文权利要求通常在分号(;)、句号(.)、"wherein"、"such that"、"whereby"等处断开
- 中文权利要求通常在分号(；)、句号(。)、"其中"、"使得"等处断开
- 片段按原文顺序排列，覆盖整条权利要求，不遗漏不重叠
- original 必须与原文对应片段完全一致（包括标点符号）
- translation 必须与 original 一一对应，翻译准确完整

层级颜色规则：
- hierarchyLevel 0（最上位）：红色系
- hierarchyLevel 1：橙色系
- hierarchyLevel 2：绿色系
- hierarchyLevel 3：紫色系
- hierarchyLevel 4：青色系
- hierarchyLevel 5+：深红色系

输出严格 JSON 格式，不要输出任何其他内容：
{
  "nodes": [
    {
      "id": "n1",
      "originalText": "原文部件名称",
      "chineseText": "中文翻译",
      "nodeType": "component",
      "hierarchyLevel": 0,
      "sourceSentence": "来源句子原文"
    }
  ],
  "edges": [
    {
      "id": "e1",
      "source": "n1",
      "target": "n2",
      "originalText": "原文关系词",
      "chineseText": "中文关系词",
      "relationType": "containment"
    }
  ],
  "groups": [
    {
      "id": "g1",
      "label": { "original": "原文组名", "chinese": "中文组名" },
      "memberNodeIds": ["n1", "n2"]
    }
  ],
  "translatedClaim": "整条权利要求的中文翻译，保持与原文相同的标点符号结构",
  "sentencePairs": [
    { "original": "原文第一句;", "translation": "中文翻译第一句；" },
    { "original": "原文第二句.", "translation": "中文翻译第二句。" }
  ]
}`

const DEFAULT_USER_PROMPT_TEMPLATE = `请分析以下专利独立权利要求，提取部件节点和关系边：

---
{claimText}
---

要求：
- 每个节点必须包含 originalText（原文用词）和 chineseText（中文翻译）
- 每条边必须包含 originalText（原文关系词）和 chineseText（中文翻译）
- "所述"、"所述的"等指代词需还原为实际指代的部件
- 包含关系（"包括"、"包含"、"具有"、"由...组成"、"由...构成"、"设有"）归入 containment 类型
- 位置关系（"设置于"、"位于"、"连接于"）归入 position 类型
- 动作关系（"驱动"、"控制"、"触发"）归入 action 类型
- 逻辑关系（"当...时"、"若...则"）归入 logical 类型
- 为每个节点分配 hierarchyLevel：0表示最上位/整体部件，1表示一级子部件，2表示二级子部件，以此类推
- 对于包含关系，将上位节点及其所有下位节点归入同一个group
- group的label应为上位节点的名称
- 必须返回 translatedClaim：整条权利要求的中文翻译，保持与原文完全相同的标点符号结构和断句位置
- 必须返回 sentencePairs：将权利要求按自然语义断句，逐句提供原文(original)和译文(translation)对照，片段覆盖整条权利要求不遗漏不重叠
- nodes/edges 的 chineseText 必须与 translatedClaim 和 sentencePairs 中的对应词完全一致
- 只输出 JSON，不要输出任何解释`

const DEEPSEEK_SYSTEM_PROMPT = `你是一个专利权利要求分析专家。你的任务是从专利独立权利要求文本中提取结构化信息。

## 提取规则

1. 提取所有部件/组件名词作为节点，必须保留原文语言，不得替换用其他词
2. 识别部件之间的关系作为边
3. 关系类型分为：位置关系(position)、动作关系(action)、包含关系(containment)、逻辑关系(logical)
4. 同时提供中文对照翻译
5. 识别包含关系层级：对于"具有""包括""包含""由..构成""由..组成""设有"等包含关系特征，分析上下位关系，为每个节点分配 hierarchyLevel（0=最上位/整体，1=一级子部件，2=二级子部件，以此类推）
6. 将具有包含关系的上位节点和其下位节点归入同一 group
7. 将整条权利要求翻译为中文，返回 translatedClaim 字段
8. 将权利要求按自然语义断句，逐句提供原文和译文对照，返回 sentencePairs 数组

## 翻译一致性要求（极其重要）

- nodes 和 edges 中的 chineseText 必须与 translatedClaim 和 sentencePairs 中出现的对应词完全一致
- translatedClaim 必须保持与原文完全相同的标点符号结构和断句位置（句号对句号、分号对分号、逗号对逗号），确保按标点拆分后原文和译文的句子数量一一对应
- 如果原文是中文，translatedClaim 直接返回原文，sentencePairs 的 translation 也直接返回原文

## sentencePairs 断句规则（极其重要）

- 按自然语义断句，每个片段是一个完整的语义单元
- 英文权利要求通常在分号(;)、句号(.)、"wherein"、"such that"、"whereby"等处断开
- 中文权利要求通常在分号(；)、句号(。)、"其中"、"使得"等处断开
- 片段按原文顺序排列，覆盖整条权利要求，不遗漏不重叠
- original 必须与原文对应片段完全一致（包括标点符号）
- translation 必须与 original 一一对应，翻译准确完整

## 输出格式

严格输出以下 JSON 结构，不要输出任何其他文字、解释或 markdown 代码块标记：
{
  "nodes": [
    {
      "id": "n1",
      "originalText": "原文部件名称",
      "chineseText": "中文翻译",
      "nodeType": "component",
      "hierarchyLevel": 0,
      "sourceSentence": "来源句子原文"
    }
  ],
  "edges": [
    {
      "id": "e1",
      "source": "n1",
      "target": "n2",
      "originalText": "原文关系词",
      "chineseText": "中文关系词",
      "relationType": "containment"
    }
  ],
  "groups": [
    {
      "id": "g1",
      "label": { "original": "原文组名", "chinese": "中文组名" },
      "memberNodeIds": ["n1", "n2"]
    }
  ],
  "translatedClaim": "整条权利要求的中文翻译，保持与原文相同的标点符号结构",
  "sentencePairs": [
    { "original": "原文第一句;", "translation": "中文翻译第一句；" },
    { "original": "原文第二句.", "translation": "中文翻译第二句。" }
  ]
}`

const DEEPSEEK_USER_PROMPT_TEMPLATE = `请分析以下专利独立权利要求，提取部件节点和关系边：

---
{claimText}
---

要求：
- 每个节点必须包含 originalText（原文用词）和 chineseText（中文翻译）
- 每条边必须包含 originalText（原文关系词）和 chineseText（中文翻译）
- "所述"、"所述的"等指代词需还原为实际指代的部件
- 包含关系（"包括"、"包含"、"具有"、"由...组成"、"由...构成"、"设有"）归入 containment 类型
- 位置关系（"设置于"、"位于"、"连接于"）归入 position 类型
- 动作关系（"驱动"、"控制"、"触发"）归入 action 类型
- 逻辑关系（"当...时"、"若...则"）归入 logical 类型
- 为每个节点分配 hierarchyLevel：0表示最上位/整体部件，1表示一级子部件，2表示二级子部件，以此类推
- 对于包含关系，将上位节点及其所有下位节点归入同一个group
- group的label应为上位节点的名称
- 必须返回 translatedClaim：整条权利要求的中文翻译，保持与原文完全相同的标点符号结构和断句位置
- 必须返回 sentencePairs：将权利要求按自然语义断句，逐句提供原文(original)和译文(translation)对照，片段覆盖整条权利要求不遗漏不重叠
- nodes/edges 的 chineseText 必须与 translatedClaim 和 sentencePairs 中的对应词完全一致
- 直接输出 JSON 对象，不要用 markdown 代码块包裹，不要输出任何解释性文字`

const PROMPT_STORAGE_KEY = 'patent2pic-prompt-config'

let _systemPrompt: string = DEFAULT_SYSTEM_PROMPT
let _userPromptTemplate: string = DEFAULT_USER_PROMPT_TEMPLATE

function loadPromptFromStorage(): void {
  try {
    const raw = localStorage.getItem(PROMPT_STORAGE_KEY)
    if (raw) {
      const data = JSON.parse(raw)
      if (data.systemPrompt) _systemPrompt = data.systemPrompt
      if (data.userPromptTemplate) _userPromptTemplate = data.userPromptTemplate
    }
  } catch {}
}

function savePromptToStorage(): void {
  localStorage.setItem(PROMPT_STORAGE_KEY, JSON.stringify({
    systemPrompt: _systemPrompt,
    userPromptTemplate: _userPromptTemplate,
  }))
}

loadPromptFromStorage()

export function buildMessages(claimText: string, providerType?: AIProviderType): ChatMessage[] {
  if (providerType === 'deepseek') {
    return [
      { role: 'system', content: DEEPSEEK_SYSTEM_PROMPT },
      { role: 'user', content: DEEPSEEK_USER_PROMPT_TEMPLATE.replace('{claimText}', claimText) },
    ]
  }
  return [
    { role: 'system', content: _systemPrompt },
    { role: 'user', content: _userPromptTemplate.replace('{claimText}', claimText) },
  ]
}

export function getSystemPrompt(): string {
  return _systemPrompt
}

export function getUserPromptTemplate(): string {
  return _userPromptTemplate
}

export function setSystemPrompt(prompt: string): void {
  _systemPrompt = prompt
  savePromptToStorage()
}

export function setUserPromptTemplate(template: string): void {
  _userPromptTemplate = template
  savePromptToStorage()
}

export function getDefaultSystemPrompt(): string {
  return DEFAULT_SYSTEM_PROMPT
}

export function getDefaultUserPromptTemplate(): string {
  return DEFAULT_USER_PROMPT_TEMPLATE
}