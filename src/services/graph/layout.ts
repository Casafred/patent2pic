import dagre from 'dagre'
import type { NodeData, EdgeData } from '@/types/graph'

export interface DagreLayoutOptions {
  rankdir?: 'TB' | 'BT' | 'LR' | 'RL'
  nodesep?: number
  ranksep?: number
  align?: 'UL' | 'UR' | 'DL' | 'DR'
}

export function applyDagreLayout(
  nodes: NodeData[],
  edges: EdgeData[],
  options?: DagreLayoutOptions,
): Map<string, { x: number; y: number }> {
  const g = new dagre.graphlib.Graph()
  g.setDefaultEdgeLabel(() => ({}))
  g.setGraph({
    rankdir: options?.rankdir ?? 'TB',
    nodesep: options?.nodesep ?? 80,
    ranksep: options?.ranksep ?? 100,
    align: options?.align,
    marginx: 40,
    marginy: 40,
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

  const positions = new Map<string, { x: number; y: number }>()
  for (const node of nodes) {
    const pos = g.node(node.id)
    if (pos) {
      positions.set(node.id, {
        x: pos.x - node.style.width / 2,
        y: pos.y - node.style.height / 2,
      })
    }
  }

  return positions
}
