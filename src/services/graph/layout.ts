import dagre from 'dagre'
import type { NodeData, EdgeData } from '@/types/graph'

export interface DagreLayoutOptions {
  rankdir?: 'TB' | 'BT' | 'LR' | 'RL'
  nodesep?: number
  ranksep?: number
  align?: 'UL' | 'UR' | 'DL' | 'DR'
}

export interface ForceLayoutOptions {
  enabled?: boolean
  iterations?: number
  minDistance?: number
  repulsionStrength?: number
  attractionStrength?: number
  maxDisplacement?: number
}

export interface LayoutOptions {
  dagre?: DagreLayoutOptions
  force?: ForceLayoutOptions
}

interface NodePosition {
  x: number
  y: number
  width: number
  height: number
}

function calculateAdaptiveSpacing(
  nodes: NodeData[],
  edges: EdgeData[],
): { nodesep: number; ranksep: number } {
  if (nodes.length === 0) return { nodesep: 80, ranksep: 100 }

  const avgWidth = nodes.reduce((sum, n) => sum + n.style.width, 0) / nodes.length
  const avgHeight = nodes.reduce((sum, n) => sum + n.style.height, 0) / nodes.length

  const baseNodeSep = Math.max(80, avgWidth * 0.7)
  const baseRankSep = Math.max(100, avgHeight * 2.0)

  const edgeDensity = nodes.length > 1 ? edges.length / nodes.length : 0
  const densityFactor = 1 + Math.min(edgeDensity * 0.15, 0.8)

  const sizeFactor = Math.pow(nodes.length / 8, 0.3)

  return {
    nodesep: Math.round(baseNodeSep * densityFactor * sizeFactor),
    ranksep: Math.round(baseRankSep * densityFactor * sizeFactor),
  }
}

function applyDagreLayout(
  nodes: NodeData[],
  edges: EdgeData[],
  options?: DagreLayoutOptions,
): Map<string, NodePosition> {
  const adaptive = calculateAdaptiveSpacing(nodes, edges)

  const g = new dagre.graphlib.Graph()
  g.setDefaultEdgeLabel(() => ({}))
  g.setGraph({
    rankdir: options?.rankdir ?? 'TB',
    nodesep: options?.nodesep ?? adaptive.nodesep,
    ranksep: options?.ranksep ?? adaptive.ranksep,
    align: options?.align,
    marginx: 60,
    marginy: 60,
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

  const positions = new Map<string, NodePosition>()
  for (const node of nodes) {
    const pos = g.node(node.id)
    if (pos) {
      positions.set(node.id, {
        x: pos.x - node.style.width / 2,
        y: pos.y - node.style.height / 2,
        width: node.style.width,
        height: node.style.height,
      })
    }
  }

  return positions
}

function rectOverlap(
  a: NodePosition,
  b: NodePosition,
  padding: number,
): boolean {
  return !(
    a.x + a.width + padding < b.x ||
    b.x + b.width + padding < a.x ||
    a.y + a.height + padding < b.y ||
    b.y + b.height + padding < a.y
  )
}

function rectDistance(a: NodePosition, b: NodePosition): number {
  const dx = Math.max(0, Math.max(a.x - (b.x + b.width), b.x - (a.x + a.width)))
  const dy = Math.max(0, Math.max(a.y - (b.y + b.height), b.y - (a.y + a.height)))
  return Math.sqrt(dx * dx + dy * dy)
}

function centerDistance(a: NodePosition, b: NodePosition): number {
  const ax = a.x + a.width / 2
  const ay = a.y + a.height / 2
  const bx = b.x + b.width / 2
  const by = b.y + b.height / 2
  const dx = ax - bx
  const dy = ay - by
  return Math.sqrt(dx * dx + dy * dy)
}

function applyForceSpreading(
  positions: Map<string, NodePosition>,
  _nodes: NodeData[],
  edges: EdgeData[],
  options?: ForceLayoutOptions,
): Map<string, { x: number; y: number }> {
  const enabled = options?.enabled ?? true
  if (!enabled) {
    const result = new Map<string, { x: number; y: number }>()
    for (const [id, pos] of positions) {
      result.set(id, { x: pos.x, y: pos.y })
    }
    return result
  }

  const iterations = options?.iterations ?? 60
  const minDistance = options?.minDistance ?? 40
  const repulsionStrength = options?.repulsionStrength ?? 0.6
  const attractionStrength = options?.attractionStrength ?? 0.02
  const maxDisplacement = options?.maxDisplacement ?? 30

  const posMap = new Map<string, NodePosition>()
  for (const [id, pos] of positions) {
    posMap.set(id, { ...pos })
  }

  const edgeMap = new Map<string, Set<string>>()
  for (const edge of edges) {
    if (!edgeMap.has(edge.source)) edgeMap.set(edge.source, new Set())
    if (!edgeMap.has(edge.target)) edgeMap.set(edge.target, new Set())
    edgeMap.get(edge.source)!.add(edge.target)
    edgeMap.get(edge.target)!.add(edge.source)
  }

  const ids = Array.from(posMap.keys())
  const n = ids.length

  for (let iter = 0; iter < iterations; iter++) {
    const displacement = new Map<string, { dx: number; dy: number }>()
    for (const id of ids) {
      displacement.set(id, { dx: 0, dy: 0 })
    }

    const coolingFactor = 1 - (iter / iterations) * 0.7

    for (let i = 0; i < n; i++) {
      const idA = ids[i]
      const posA = posMap.get(idA)!

      for (let j = i + 1; j < n; j++) {
        const idB = ids[j]
        const posB = posMap.get(idB)!

        const isOverlapping = rectOverlap(posA, posB, minDistance)

        if (isOverlapping) {
          const cA = { x: posA.x + posA.width / 2, y: posA.y + posA.height / 2 }
          const cB = { x: posB.x + posB.width / 2, y: posB.y + posB.height / 2 }

          let dx = cA.x - cB.x
          let dy = cA.y - cB.y
          const dist = Math.sqrt(dx * dx + dy * dy)

          if (dist < 0.1) {
            dx = (Math.random() - 0.5) * 2
            dy = (Math.random() - 0.5) * 2
          } else {
            dx /= dist
            dy /= dist
          }

          const overlapPenalty = rectDistance(posA, posB) < minDistance
            ? 1.5
            : 1.0

          const force = repulsionStrength * overlapPenalty * coolingFactor

          const dA = displacement.get(idA)!
          const dB = displacement.get(idB)!
          dA.dx += dx * force * maxDisplacement
          dA.dy += dy * force * maxDisplacement
          dB.dx -= dx * force * maxDisplacement
          dB.dy -= dy * force * maxDisplacement
        }
      }
    }

    for (const edge of edges) {
      const posA = posMap.get(edge.source)
      const posB = posMap.get(edge.target)
      if (!posA || !posB) continue

      const dist = centerDistance(posA, posB)
      const avgSize = ((posA.width + posA.height) + (posB.width + posB.height)) / 4
      const idealDist = avgSize * 3

      if (dist > idealDist) {
        const cA = { x: posA.x + posA.width / 2, y: posA.y + posA.height / 2 }
        const cB = { x: posB.x + posB.width / 2, y: posB.y + posB.height / 2 }

        let dx = cB.x - cA.x
        let dy = cB.y - cA.y
        const d = Math.sqrt(dx * dx + dy * dy)
        if (d < 0.1) continue

        dx /= d
        dy /= d

        const excess = (dist - idealDist) / idealDist
        const force = attractionStrength * excess * coolingFactor

        const dA = displacement.get(edge.source)!
        const dB = displacement.get(edge.target)!
        dA.dx += dx * force * maxDisplacement
        dA.dy += dy * force * maxDisplacement
        dB.dx -= dx * force * maxDisplacement
        dB.dy -= dy * force * maxDisplacement
      }
    }

    for (const id of ids) {
      const pos = posMap.get(id)!
      const d = displacement.get(id)!
      const len = Math.sqrt(d.dx * d.dx + d.dy * d.dy)
      if (len > maxDisplacement) {
        d.dx = (d.dx / len) * maxDisplacement
        d.dy = (d.dy / len) * maxDisplacement
      }
      pos.x += d.dx
      pos.y += d.dy
    }
  }

  const result = new Map<string, { x: number; y: number }>()
  for (const [id, pos] of posMap) {
    result.set(id, { x: pos.x, y: pos.y })
  }
  return result
}

export function applyLayout(
  nodes: NodeData[],
  edges: EdgeData[],
  options?: LayoutOptions,
): Map<string, { x: number; y: number }> {
  const dagrePositions = applyDagreLayout(nodes, edges, options?.dagre)
  return applyForceSpreading(dagrePositions, nodes, edges, options?.force)
}

export { applyDagreLayout }
