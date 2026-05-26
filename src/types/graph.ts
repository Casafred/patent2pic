export type RelationType = 'position' | 'action' | 'containment' | 'logical'
export type NodeType = 'component' | 'subsystem' | 'feature'
export type ArrowType = 'solid-triangle' | 'hollow-triangle' | 'diamond' | 'circle' | 'none' | 'both'
export type LineStyle = 'solid' | 'dashed' | 'dotted' | 'dash-dot'

export interface NodeStyle {
  fill: string
  stroke: string
  strokeWidth: number
  strokeDasharray: string | null
  fontSize: number
  fontFamily: string
  fontColor: string
  fontWeight: 'normal' | 'bold'
  fontStyle: 'normal' | 'italic'
  width: number
  height: number
  borderRadius: number
}

export interface EdgeStyle {
  stroke: string
  strokeWidth: number
  strokeDasharray: string | null
  arrowType: ArrowType
  fontSize: number
  fontFamily: string
  fontColor: string
  labelBgColor: string
  labelBgPadding: number
}

export interface NodeData {
  id: string
  originalText: string
  chineseText: string
  nodeType: NodeType
  style: NodeStyle
  containmentDepth?: number
  x?: number
  y?: number
}

export interface EdgeData {
  id: string
  source: string
  target: string
  sourcePort?: string
  targetPort?: string
  originalText: string
  chineseText: string
  relationType: RelationType
  style: EdgeStyle
}

export interface GroupData {
  id: string
  label: { original: string; chinese: string }
  memberNodeIds: string[]
  style: {
    stroke: string
    strokeDasharray: string | null
    fill: string
    borderRadius: number
  }
}

export interface GraphJSON {
  version: string
  claimId: string
  nodes: NodeData[]
  edges: EdgeData[]
  groups: GroupData[]
  viewport: { x: number; y: number; zoom: number }
}
