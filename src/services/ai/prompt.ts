import type { ChatMessage } from '@/types/ai'

const SYSTEM_PROMPT = `你是一个专利权利要求分析专家。你的任务是从专利独立权利要求文本中：
1. 提取所有部件/组件名词作为节点
2. 识别部件之间的关系作为边
3. 关系类型分为：位置关系(position)、动作关系(action)、包含关系(containment)、逻辑关系(logical)
4. 必须保留原文语言，不得替换用其他词
5. 同时提供中文对照翻译

输出严格 JSON 格式，不要输出任何其他内容：
{
  "nodes": [
    {
      "id": "n1",
      "originalText": "原文部件名称",
      "chineseText": "中文翻译",
      "nodeType": "component",
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
      "relationType": "position"
    }
  ],
  "groups": [
    {
      "id": "g1",
      "label": { "original": "原文组名", "chinese": "中文组名" },
      "memberNodeIds": ["n1", "n2"]
    }
  ]
}`

const USER_PROMPT_TEMPLATE = `请分析以下专利独立权利要求，提取部件节点和关系边：

---
{claimText}
---

要求：
- 每个节点必须包含 originalText（原文用词）和 chineseText（中文翻译）
- 每条边必须包含 originalText（原文关系词）和 chineseText（中文翻译）
- "所述"、"所述的"等指代词需还原为实际指代的部件
- 包含关系（"包括"、"包含"、"由...组成"）归入 containment 类型
- 位置关系（"设置于"、"位于"、"连接于"）归入 position 类型
- 动作关系（"驱动"、"控制"、"触发"）归入 action 类型
- 逻辑关系（"当...时"、"若...则"）归入 logical 类型
- 只输出 JSON，不要输出任何解释`

export function buildMessages(claimText: string): ChatMessage[] {
  return [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: USER_PROMPT_TEMPLATE.replace('{claimText}', claimText) },
  ]
}

export function getSystemPrompt(): string {
  return SYSTEM_PROMPT
}

export function getUserPromptTemplate(): string {
  return USER_PROMPT_TEMPLATE
}
