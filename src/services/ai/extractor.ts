import type { ExtractResult, ExtractNode, ExtractEdge, ExtractGroup, SentencePair } from '@/types/ai'

export function parseExtractResult(raw: string): ExtractResult {
  const jsonStr = extractJSON(raw)
  let parsed: unknown
  try {
    parsed = JSON.parse(jsonStr)
  } catch {
    const repaired = tryRepairJSON(jsonStr)
    if (repaired) {
      parsed = JSON.parse(repaired)
    } else {
      throw new Error(`JSON 解析失败，原始响应长度: ${raw.length} 字符。响应可能被截断，请尝试增大 max_tokens`)
    }
  }
  return validateExtractResult(parsed)
}

function extractJSON(text: string): string {
  const codeBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (codeBlockMatch) {
    return codeBlockMatch[1].trim()
  }

  const braceMatch = text.match(/\{[\s\S]*\}/)
  if (braceMatch) {
    return braceMatch[0]
  }

  const partialBraceMatch = text.match(/\{[\s\S]*/)
  if (partialBraceMatch) {
    return partialBraceMatch[0]
  }

  throw new Error('无法从 AI 响应中提取 JSON')
}

function tryRepairJSON(jsonStr: string): string | null {
  let str = jsonStr.trim()

  try {
    JSON.parse(str)
    return str
  } catch {}

  for (let i = 0; i < 3; i++) {
    str = str.replace(/,\s*([}\]])/g, '$1')
    try {
      JSON.parse(str)
      return str
    } catch {}
  }

  let depth = 0
  let inStr = false
  let escape = false
  for (const ch of str) {
    if (escape) { escape = false; continue }
    if (ch === '\\') { escape = true; continue }
    if (ch === '"') { inStr = !inStr; continue }
    if (inStr) continue
    if (ch === '{' || ch === '[') depth++
    if (ch === '}' || ch === ']') depth--
  }

  if (inStr) str += '"'

  while (depth > 0) {
    str += '}'
    depth--
  }

  try {
    JSON.parse(str)
    return str
  } catch {}

  return null
}

function validateExtractResult(data: unknown): ExtractResult {
  if (!data || typeof data !== 'object') {
    throw new Error('抽取结果不是有效的对象')
  }

  const result = data as Record<string, unknown>

  const claimType = result.claimType === 'method' ? 'method' as const
    : result.claimType === 'mixed' ? 'mixed' as const
    : 'structure' as const
  const nodes = validateNodes(result.nodes, claimType)
  const edges = validateEdges(result.edges, nodes, claimType)
  const groups = validateGroups(result.groups, nodes)

  return {
    claimType,
    claimId: '',
    nodes,
    edges,
    groups,
    translatedClaim: String(result.translatedClaim || ''),
    sentencePairs: validateSentencePairs(result.sentencePairs),
  }
}

function validateNodes(raw: unknown, claimType: 'structure' | 'method' | 'mixed'): ExtractNode[] {
  if (!Array.isArray(raw)) throw new Error('nodes 必须是数组')
  const ids = new Set<string>()

  const structureTypes = ['component', 'subsystem', 'feature']
  const methodTypes = ['step', 'decision', 'condition']
  // mixed 类型允许所有节点类型
  const validTypes = claimType === 'method' ? methodTypes
    : claimType === 'mixed' ? [...structureTypes, ...methodTypes]
    : structureTypes

  return raw.map((item: unknown, index: number) => {
    if (!item || typeof item !== 'object') throw new Error(`nodes[${index}] 不是有效对象`)
    const node = item as Record<string, unknown>

    const id = String(node.id || `n${index + 1}`)
    if (ids.has(id)) throw new Error(`节点 ID 重复: ${id}`)
    ids.add(id)

    if (!node.originalText) throw new Error(`nodes[${index}] 缺少 originalText`)
    if (!node.chineseText) throw new Error(`nodes[${index}] 缺少 chineseText`)

    const nodeType = validTypes.includes(node.nodeType as string)
      ? node.nodeType as ExtractNode['nodeType']
      : (claimType === 'method' ? 'step' : 'component')

    return {
      id,
      originalText: String(node.originalText),
      chineseText: String(node.chineseText),
      nodeType,
      hierarchyLevel: typeof node.hierarchyLevel === 'number' ? node.hierarchyLevel : 0,
      sourceSentence: String(node.sourceSentence || ''),
    }
  })
}

function validateEdges(raw: unknown, nodes: ExtractNode[], claimType: 'structure' | 'method' | 'mixed'): ExtractEdge[] {
  if (!Array.isArray(raw)) throw new Error('edges 必须是数组')
  const nodeIds = new Set(nodes.map(n => n.id))

  const structureTypes = ['position', 'action', 'containment', 'logical', 'attribute']
  const methodTypes = ['sequence', 'branch_true', 'branch_false', 'trigger', 'feedback', 'parallel', 'attribute']
  // mixed 类型允许所有边类型
  const validTypes = claimType === 'method' ? methodTypes
    : claimType === 'mixed' ? [...structureTypes, ...methodTypes]
    : structureTypes

  return raw.map((item: unknown, index: number) => {
    if (!item || typeof item !== 'object') throw new Error(`edges[${index}] 不是有效对象`)
    const edge = item as Record<string, unknown>

    const source = String(edge.source)
    const target = String(edge.target)
    if (!nodeIds.has(source)) throw new Error(`edges[${index}] source "${source}" 不存在于节点中`)
    if (!nodeIds.has(target)) throw new Error(`edges[${index}] target "${target}" 不存在于节点中`)

    const relationType = validTypes.includes(edge.relationType as string)
      ? edge.relationType as ExtractEdge['relationType']
      : (claimType === 'method' ? 'sequence' : 'position')

    if (source === target && relationType !== 'attribute') {
      throw new Error(`edges[${index}] source 和 target 相同但不是 attribute 类型`)
    }

    if (!edge.originalText) throw new Error(`edges[${index}] 缺少 originalText`)
    if (!edge.chineseText) throw new Error(`edges[${index}] 缺少 chineseText`)

    return {
      id: String(edge.id || `e${index + 1}`),
      source,
      target,
      originalText: String(edge.originalText),
      chineseText: String(edge.chineseText),
      relationType,
    }
  })
}

function validateGroups(raw: unknown, nodes: ExtractNode[]): ExtractGroup[] {
  if (!raw) return []
  if (!Array.isArray(raw)) throw new Error('groups 必须是数组')
  const nodeIds = new Set(nodes.map(n => n.id))

  return raw.map((item: unknown, index: number) => {
    if (!item || typeof item !== 'object') throw new Error(`groups[${index}] 不是有效对象`)
    const group = item as Record<string, unknown>

    const label = group.label as { original?: string; chinese?: string } | undefined
    const memberNodeIds = Array.isArray(group.memberNodeIds)
      ? (group.memberNodeIds as string[]).filter(id => nodeIds.has(id))
      : []

    return {
      id: String(group.id || `g${index + 1}`),
      label: {
        original: label?.original || '',
        chinese: label?.chinese || '',
      },
      memberNodeIds,
    }
  })
}

function validateSentencePairs(raw: unknown): SentencePair[] {
  if (!raw || !Array.isArray(raw)) return []

  return raw
    .filter((item: unknown): item is Record<string, unknown> => {
      if (!item || typeof item !== 'object') return false
      const pair = item as Record<string, unknown>
      return typeof pair.original === 'string' && typeof pair.translation === 'string'
    })
    .map((pair: Record<string, unknown>) => ({
      original: String(pair.original),
      translation: String(pair.translation),
    }))
}
