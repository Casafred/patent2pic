import type { NodeStyle, EdgeStyle, RelationType, NodeType, ArrowType, LineStyle } from '@/types/graph'

const NODE_TYPE_STYLES: Record<NodeType, Pick<NodeStyle, 'fill' | 'stroke'>> = {
  component: { fill: '#e8f4fd', stroke: '#1890FF' },
  subsystem: { fill: '#fff7e6', stroke: '#fa8c16' },
  feature: { fill: '#f6ffed', stroke: '#52c41a' },
}

const HIERARCHY_LEVEL_COLORS: { fill: string; stroke: string }[] = [
  { fill: '#ffe4e4', stroke: '#e63946' },
  { fill: '#fff3e0', stroke: '#ff9800' },
  { fill: '#e8f5e9', stroke: '#4caf50' },
  { fill: '#f3e5f5', stroke: '#9c27b0' },
]

export function getHierarchyNodeStyle(hierarchyLevel: number, _nodeType: NodeType): Pick<NodeStyle, 'fill' | 'stroke'> {
  const level = Math.min(hierarchyLevel, HIERARCHY_LEVEL_COLORS.length - 1)
  if (level <= 0) return HIERARCHY_LEVEL_COLORS[0]
  return HIERARCHY_LEVEL_COLORS[level]
}

const RELATION_TYPE_STYLES: Record<RelationType, Pick<EdgeStyle, 'stroke' | 'strokeDasharray' | 'arrowType'>> = {
  position: { stroke: '#1890FF', strokeDasharray: null, arrowType: 'solid-triangle' },
  action: { stroke: '#52c41a', strokeDasharray: null, arrowType: 'solid-triangle' },
  containment: { stroke: '#fa8c16', strokeDasharray: '5 5', arrowType: 'hollow-triangle' },
  logical: { stroke: '#722ed1', strokeDasharray: '2 4 2 4 5 4', arrowType: 'diamond' },
}

export function getDefaultNodeStyle(nodeType: NodeType): NodeStyle {
  const colorMap = NODE_TYPE_STYLES[nodeType]
  return {
    fill: colorMap.fill,
    stroke: colorMap.stroke,
    strokeWidth: 1.5,
    strokeDasharray: null,
    fontSize: 15,
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif',
    fontColor: '#1d2129',
    fontWeight: 'bold',
    fontStyle: 'normal',
    width: 160,
    height: 60,
    borderRadius: 8,
  }
}

export function getDefaultEdgeStyle(relationType: RelationType): EdgeStyle {
  const styleMap = RELATION_TYPE_STYLES[relationType]
  return {
    stroke: styleMap.stroke,
    strokeWidth: 1.5,
    strokeDasharray: styleMap.strokeDasharray,
    arrowType: styleMap.arrowType,
    fontSize: 15,
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif',
    fontColor: '#4e5969',
    labelBgColor: '#ffffff',
    labelBgPadding: 4,
  }
}

export function lineStyleToDasharray(style: LineStyle): string | null {
  switch (style) {
    case 'solid': return null
    case 'dashed': return '6 3'
    case 'dotted': return '2 3'
    case 'dash-dot': return '6 3 2 3'
  }
}

export function arrowTypeToMarker(arrowType: ArrowType): string {
  switch (arrowType) {
    case 'solid-triangle': return 'block'
    case 'hollow-triangle': return 'block'
    case 'diamond': return 'diamond'
    case 'circle': return 'circle'
    case 'none': return ''
    case 'both': return 'block'
  }
}

export const NODE_TYPE_OPTIONS: { value: NodeType; label: string; color: string }[] = [
  { value: 'component', label: '部件', color: '#1890FF' },
  { value: 'subsystem', label: '子系统', color: '#fa8c16' },
  { value: 'feature', label: '特征', color: '#52c41a' },
]

export const RELATION_TYPE_OPTIONS: { value: RelationType; label: string; color: string }[] = [
  { value: 'position', label: '位置关系', color: '#1890FF' },
  { value: 'action', label: '动作关系', color: '#52c41a' },
  { value: 'containment', label: '包含关系', color: '#fa8c16' },
  { value: 'logical', label: '逻辑关系', color: '#722ed1' },
]

export const FONT_FAMILY_OPTIONS = [
  { value: '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif', label: '系统默认' },
  { value: '"SimSun", "宋体", serif', label: '宋体' },
  { value: '"SimHei", "黑体", sans-serif', label: '黑体' },
  { value: '"KaiTi", "楷体", serif', label: '楷体' },
  { value: '"FangSong", "仿宋", serif', label: '仿宋' },
]

export const FONT_SIZE_OPTIONS = [10, 11, 12, 13, 14, 16, 18, 20, 24]

export const LINE_STYLE_OPTIONS: { value: LineStyle; label: string }[] = [
  { value: 'solid', label: '实线' },
  { value: 'dashed', label: '虚线' },
  { value: 'dotted', label: '点线' },
  { value: 'dash-dot', label: '点划线' },
]

export const ARROW_TYPE_OPTIONS: { value: ArrowType; label: string }[] = [
  { value: 'solid-triangle', label: '实心三角' },
  { value: 'hollow-triangle', label: '空心三角' },
  { value: 'diamond', label: '菱形' },
  { value: 'circle', label: '圆形' },
  { value: 'none', label: '无箭头' },
  { value: 'both', label: '双向箭头' },
]
