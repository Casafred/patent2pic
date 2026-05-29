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

interface ElkLabel {
  text: string
  width: number
  height: number
  layoutOptions?: Record<string, string>
}

interface ElkEdge {
  id: string
  sources: string[]
  targets: string[]
  labels?: ElkLabel[]
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

function estimateLabelSize(text: string, fontSize: number): { width: number; height: number } {
  const lines = text.split('\n')
  const maxLineLength = Math.max(...lines.map(l => l.length))
  const charWidth = fontSize * 0.65
  const lineHeight = fontSize * 1.6
  const width = Math.max(80, maxLineLength * charWidth * 1.7)
  const height = Math.max(24, lines.length * lineHeight * 1.8)
  return { width, height }
}

export async function applyElkLayout(
  nodes: NodeData[],
  edges: EdgeData[],
  options?: ElkLayoutOptions,
): Promise<Map<string, { x: number; y: number }>> {
  const maxNodeWidth = Math.max(...nodes.map(n => n.style.width), 120)
  const maxNodeHeight = Math.max(...nodes.map(n => n.style.height), 40)

  const direction = options?.rankdir ?? 'LR'

  const nodesep = options?.nodesep ?? Math.max(80, maxNodeWidth * 0.6)
  const ranksep = options?.ranksep ?? Math.max(100, maxNodeWidth * 0.8)

  const elkNodes: ElkNode[] = nodes.map(n => ({
    id: n.id,
    width: n.style.width,
    height: n.style.height,
  }))

  const elkEdges: ElkEdge[] = edges.map(e => {
    const labelText = e.chineseText || e.originalText
    const fontSize = 12
    const labelSize = estimateLabelSize(labelText, fontSize)

    return {
      id: e.id,
      sources: [e.source],
      targets: [e.target],
      labels: [{
        text: labelText,
        width: labelSize.width,
        height: labelSize.height,
        layoutOptions: {
          'elk.edgeLabels.placement': 'CENTER',
          'elk.edgeLabels.inline': 'true',
        },
      }],
    }
  })

  const graph = {
    id: 'root',
    layoutOptions: {
      'elk.algorithm': 'layered',
      'elk.direction': directionToElk(direction),
      'elk.spacing.nodeNode': String(nodesep),
      'elk.layered.spacing.nodeNodeBetweenLayers': String(ranksep),
      'elk.padding': '[top=60,left=60,bottom=60,right=60]',

      'elk.aspectRatio': '1.6',

      'elk.layered.crossingMinimization.strategy': 'LAYER_SWEEP',
      'elk.layered.crossingMinimization.sweepStrategy': 'CAREFUL',
      'elk.layered.crossingMinimization.semiInteractive': 'true',

      'elk.layered.nodePlacement.strategy': 'LINEAR_SEGMENTS',

      'elk.edgeRouting.orthogonalEdges': 'true',
      'elk.spacing.edgeNode': String(Math.max(50, maxNodeHeight * 0.8)),
      'elk.spacing.edgeEdge': String(Math.max(30, maxNodeHeight * 0.5)),

      'elk.layered.considerModelOrder.strategy': 'NODES_AND_EDGES',

      'elk.layered.cycleBreaking.strategy': 'GREEDY',

      'elk.layered.edgeSpacing.factor': '2.0',

      'elk.layered.compaction.postCompaction.strategy': 'LEFT_RIGHT',
      'elk.layered.compaction.connectedComponents': 'true',
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
