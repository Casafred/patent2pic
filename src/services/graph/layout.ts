import dagre from 'dagre'
import type { NodeData, EdgeData } from '@/types/graph'

export interface DagreLayoutOptions {
  rankdir?: 'TB' | 'BT' | 'LR' | 'RL'
  nodesep?: number
  ranksep?: number
  align?: 'UL' | 'UR' | 'DL' | 'DR'
}

interface PositionedNode {
  id: string
  x: number
  y: number
  width: number
  height: number
}

interface Rect {
  x: number
  y: number
  width: number
  height: number
}

function rectsOverlap(a: Rect, b: Rect, margin: number): boolean {
  return (
    a.x - margin < b.x + b.width + margin &&
    a.x + a.width + margin > b.x - margin &&
    a.y - margin < b.y + b.height + margin &&
    a.y + a.height + margin > b.y - margin
  )
}

function expandLayout(
  positionedNodes: PositionedNode[],
  minHorizontalGap: number,
  minVerticalGap: number,
): Map<string, { x: number; y: number }> {
  if (positionedNodes.length <= 1) {
    const result = new Map<string, { x: number; y: number }>()
    for (const n of positionedNodes) {
      result.set(n.id, { x: n.x, y: n.y })
    }
    return result
  }

  const maxWidth = Math.max(...positionedNodes.map(n => n.width))
  const maxHeight = Math.max(...positionedNodes.map(n => n.height))

  const safeHGap = Math.max(minHorizontalGap, maxWidth * 2.5)
  const safeVGap = Math.max(minVerticalGap, maxHeight * 4)

  let hasOverlap = false
  for (let i = 0; i < positionedNodes.length; i++) {
    for (let j = i + 1; j < positionedNodes.length; j++) {
      const a = positionedNodes[i]
      const b = positionedNodes[j]
      const aRect: Rect = { x: a.x, y: a.y, width: a.width, height: a.height }
      const bRect: Rect = { x: b.x, y: b.y, width: b.width, height: b.height }
      if (rectsOverlap(aRect, bRect, 0)) {
        hasOverlap = true
        break
      }
    }
    if (hasOverlap) break
  }

  if (!hasOverlap) {
    const tooCloseGap = Math.min(safeHGap, safeVGap) * 0.6
    for (let i = 0; i < positionedNodes.length; i++) {
      for (let j = i + 1; j < positionedNodes.length; j++) {
        const a = positionedNodes[i]
        const b = positionedNodes[j]
        const aRect: Rect = { x: a.x, y: a.y, width: a.width, height: a.height }
        const bRect: Rect = { x: b.x, y: b.y, width: b.width, height: b.height }
        if (rectsOverlap(aRect, bRect, tooCloseGap)) {
          hasOverlap = true
          break
        }
      }
      if (hasOverlap) break
    }
  }

  if (!hasOverlap) {
    const result = new Map<string, { x: number; y: number }>()
    for (const n of positionedNodes) {
      result.set(n.id, { x: n.x, y: n.y })
    }
    return result
  }

  const iterations = 50
  const stepScale = 0.3

  let currentNodes = positionedNodes.map(n => ({ ...n }))

  for (let iter = 0; iter < iterations; iter++) {
    const displacements = currentNodes.map(() => ({ dx: 0, dy: 0 }))
    let maxDisplacement = 0

    for (let i = 0; i < currentNodes.length; i++) {
      for (let j = i + 1; j < currentNodes.length; j++) {
        const a = currentNodes[i]
        const b = currentNodes[j]

        const ax = a.x + a.width / 2
        const ay = a.y + a.height / 2
        const bx = b.x + b.width / 2
        const by = b.y + b.height / 2

        const dx = bx - ax
        const dy = by - ay
        const dist = Math.sqrt(dx * dx + dy * dy)

        const minDistX = (a.width + b.width) / 2 + safeHGap
        const minDistY = (a.height + b.height) / 2 + safeVGap

        const requiredDist = Math.max(minDistX, minDistY)
        const overlap = requiredDist - dist

        if (overlap > 0 && dist > 0.001) {
          const nx = dx / dist
          const ny = dy / dist
          const push = overlap * stepScale * 0.5

          displacements[i].dx -= nx * push
          displacements[i].dy -= ny * push
          displacements[j].dx += nx * push
          displacements[j].dy += ny * push

          maxDisplacement = Math.max(maxDisplacement, Math.abs(nx * push), Math.abs(ny * push))
        }
      }
    }

    if (maxDisplacement < 0.1) break

    for (let i = 0; i < currentNodes.length; i++) {
      currentNodes[i].x += displacements[i].dx
      currentNodes[i].y += displacements[i].dy
    }
  }

  let minX = Infinity
  let minY = Infinity
  for (const n of currentNodes) {
    minX = Math.min(minX, n.x)
    minY = Math.min(minY, n.y)
  }

  const offsetX = minX < 0 ? -minX + safeHGap : safeHGap
  const offsetY = minY < 0 ? -minY + safeVGap : safeVGap

  for (const n of currentNodes) {
    n.x += offsetX
    n.y += offsetY
  }

  const result = new Map<string, { x: number; y: number }>()
  for (const n of currentNodes) {
    result.set(n.id, { x: n.x, y: n.y })
  }
  return result
}

export function applyDagreLayout(
  nodes: NodeData[],
  edges: EdgeData[],
  options?: DagreLayoutOptions,
): Map<string, { x: number; y: number }> {
  const g = new dagre.graphlib.Graph()
  g.setDefaultEdgeLabel(() => ({}))

  const maxNodeWidth = Math.max(...nodes.map(n => n.style.width), 120)
  const maxNodeHeight = Math.max(...nodes.map(n => n.style.height), 40)

  const nodesep = options?.nodesep ?? Math.max(350, maxNodeWidth * 2.5)
  const ranksep = options?.ranksep ?? Math.max(280, maxNodeHeight * 4.5)

  g.setGraph({
    rankdir: options?.rankdir ?? 'TB',
    nodesep,
    ranksep,
    align: options?.align,
    marginx: 120,
    marginy: 120,
  })

  for (const node of nodes) {
    g.setNode(node.id, {
      width: node.style.width,
      height: node.style.height,
    })
  }

  for (const edge of edges) {
    g.setEdge(edge.source, edge.target)
  }

  dagre.layout(g)

  const positionedNodes: PositionedNode[] = []
  for (const node of nodes) {
    const pos = g.node(node.id)
    if (pos) {
      positionedNodes.push({
        id: node.id,
        x: pos.x - node.style.width / 2,
        y: pos.y - node.style.height / 2,
        width: node.style.width,
        height: node.style.height,
      })
    }
  }

  return expandLayout(positionedNodes, maxNodeWidth * 2.5, maxNodeHeight * 4)
}