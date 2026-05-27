import type { ExtractResult, ExtractNode, ExtractEdge, ExtractGroup } from '@/types/ai'

export function parseExtractResult(raw: string): ExtractResult {
  const jsonStr = extractJSON(raw)
  const parsed = JSON.parse(jsonStr)
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
  throw new Error('无法从 AI 响应中提取 JSON')
}

function validateExtractResult(data: unknown): ExtractResult {
  if (!data || typeof data !== 'object') {
    throw new Error('抽取结果不是有效的对象')
  }

  const result = data as Record<string, unknown>

  const nodes = validateNodes(result.nodes)
  const edges = validateEdges(result.edges, nodes)
  const groups = validateGroups(result.groups, nodes)

  return {
    claimId: '',
    nodes,
    edges,
    groups,
  }
}

function validateNodes(raw: unknown): ExtractNode[] {
  if (!Array.isArray(raw)) throw new Error('nodes 必须是数组')
  const ids = new Set<string>()

  return raw.map((item: unknown, index: number) => {
    if (!item || typeof item !== 'object') throw new Error(`nodes[${index}] 不是有效对象`)
    const node = item as Record<string, unknown>

    const id = String(node.id || `n${index + 1}`)
    if (ids.has(id)) throw new Error(`节点 ID 重复: ${id}`)
    ids.add(id)

    if (!node.originalText) throw new Error(`nodes[${index}] 缺少 originalText`)
    if (!node.chineseText) throw new Error(`nodes[${index}] 缺少 chineseText`)

    const validTypes = ['component', 'subsystem', 'feature']
    const nodeType = validTypes.includes(node.nodeType as string)
      ? node.nodeType as ExtractNode['nodeType']
      : 'component'

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

function validateEdges(raw: unknown, nodes: ExtractNode[]): ExtractEdge[] {
  if (!Array.isArray(raw)) throw new Error('edges 必须是数组')
  const nodeIds = new Set(nodes.map(n => n.id))

  return raw.map((item: unknown, index: number) => {
    if (!item || typeof item !== 'object') throw new Error(`edges[${index}] 不是有效对象`)
    const edge = item as Record<string, unknown>

    const source = String(edge.source)
    const target = String(edge.target)
    if (!nodeIds.has(source)) throw new Error(`edges[${index}] source "${source}" 不存在于节点中`)
    if (!nodeIds.has(target)) throw new Error(`edges[${index}] target "${target}" 不存在于节点中`)

    if (!edge.originalText) throw new Error(`edges[${index}] 缺少 originalText`)
    if (!edge.chineseText) throw new Error(`edges[${index}] 缺少 chineseText`)

    const validTypes = ['position', 'action', 'containment', 'logical']
    const relationType = validTypes.includes(edge.relationType as string)
      ? edge.relationType as ExtractEdge['relationType']
      : 'position'

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
