import type { ExtractEdge } from '@/types/ai'

export interface ContainmentLevelColor {
  fill: string
  stroke: string
  label: string
}

const DEPTH_PALETTE: ContainmentLevelColor[] = [
  { fill: '#d6e4ff', stroke: '#2f54eb', label: '顶层容器' },
  { fill: '#fff7e6', stroke: '#fa8c16', label: '一级子件' },
  { fill: '#f6ffed', stroke: '#52c41a', label: '二级子件' },
  { fill: '#f9f0ff', stroke: '#722ed1', label: '三级子件' },
  { fill: '#fff1f0', stroke: '#f5222d', label: '更深层级' },
]

export function getDepthPalette(): ContainmentLevelColor[] {
  return DEPTH_PALETTE
}

export function getContainmentLevelColor(depth: number): ContainmentLevelColor | null {
  if (depth < 0) return null
  const idx = Math.min(depth, DEPTH_PALETTE.length - 1)
  return DEPTH_PALETTE[idx]
}

export function computeContainmentDepth(
  edges: ExtractEdge[],
): Map<string, number> {
  const depthMap = new Map<string, number>()

  const containmentEdges = edges.filter(e => e.relationType === 'containment')
  if (containmentEdges.length === 0) return depthMap

  const childrenOf = new Map<string, string[]>()
  const isTarget = new Set<string>()

  for (const edge of containmentEdges) {
    const list = childrenOf.get(edge.source) || []
    list.push(edge.target)
    childrenOf.set(edge.source, list)
    isTarget.add(edge.target)
  }

  const roots: string[] = []
  for (const [source] of childrenOf) {
    if (!isTarget.has(source)) {
      roots.push(source)
    }
  }

  if (roots.length === 0) {
    for (const [source] of childrenOf) {
      roots.push(source)
    }
  }

  const visited = new Set<string>()
  const queue: Array<{ id: string; depth: number }> = []

  for (const root of roots) {
    if (!visited.has(root)) {
      visited.add(root)
      queue.push({ id: root, depth: 0 })
    }
  }

  while (queue.length > 0) {
    const { id, depth } = queue.shift()!
    depthMap.set(id, depth)

    const children = childrenOf.get(id) || []
    for (const child of children) {
      if (!visited.has(child)) {
        visited.add(child)
        queue.push({ id: child, depth: depth + 1 })
      } else {
        const existing = depthMap.get(child)
        if (existing !== undefined && depth + 1 > existing) {
          depthMap.set(child, depth + 1)
          queue.push({ id: child, depth: depth + 1 })
        }
      }
    }
  }

  for (const target of isTarget) {
    if (!depthMap.has(target)) {
      depthMap.set(target, 1)
    }
  }

  return depthMap
}
