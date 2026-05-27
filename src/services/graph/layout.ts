import ELK from 'elkjs/lib/elk.bundled.js'
import type { NodeData, EdgeData } from '@/types/graph'

export interface ElkLayoutOptions {
  rankdir?: 'TB' | 'BT' | 'LR' | 'RL'
  nodesep?: number
  ranksep?: number
  align?: 'UL' | 'UR' | 'DL' | 'DR'
}

interface ElkNode {
  id: string
  width: number
  height: number
  x?: number
  y?: number
}

interface ElkEdge {
  id: string
  sources: string[]
  targets: string[]
}

const elk = new ELK()

function directionToElk(rankdir: string): string {
  switch (rankdir) {
    case 'BT': return 'UP'
    case 'LR': return 'RIGHT'
    case 'RL': return 'LEFT'
    default: return 'DOWN'
  }
}

export async function applyElkLayout(
  nodes: NodeData[],
  edges: EdgeData[],
  options?: ElkLayoutOptions,
): Promise<Map<string, { x: number; y: number }>> {
  const maxNodeWidth = Math.max(...nodes.map(n => n.style.width), 120)
  const maxNodeHeight = Math.max(...nodes.map(n => n.style.height), 40)

  const nodesep = options?.nodesep ?? Math.max(350, maxNodeWidth * 2.5)
  const ranksep = options?.ranksep ?? Math.max(280, maxNodeHeight * 4.5)

  const elkNodes: ElkNode[] = nodes.map(n => ({
    id: n.id,
    width: n.style.width,
    height: n.style.height,
  }))

  const elkEdges: ElkEdge[] = edges.map(e => ({
    id: e.id,
    sources: [e.source],
    targets: [e.target],
  }))

  const graph = {
    id: 'root',
    layoutOptions: {
      'elk.algorithm': 'layered',
      'elk.direction': directionToElk(options?.rankdir ?? 'TB'),
      'elk.spacing.nodeNode': String(nodesep),
      'elk.layered.spacing.nodeNodeBetweenLayers': String(ranksep),
      'elk.padding': '[top=120,left=120,bottom=120,right=120]',
    },
    children: elkNodes,
    edges: elkEdges,
  }

  const layouted = await elk.layout(graph)
  const children = (layouted.children ?? []) as ElkNode[]

  const positions = new Map<string, { x: number; y: number }>()
  for (const child of children) {
    if (child.x !== undefined && child.y !== undefined) {
      positions.set(child.id, { x: child.x, y: child.y })
    }
  }

  return positions
}