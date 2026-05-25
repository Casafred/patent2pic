import { Graph, Shape } from '@antv/x6'
import type { NodeData } from '@/types/graph'
import { getDefaultNodeStyle } from './style-registry'

export function buildNode(data: NodeData): Graph.Metadata['nodes'][number] {
  const style = data.style || getDefaultNodeStyle(data.nodeType)

  return {
    id: data.id,
    x: data.x ?? 0,
    y: data.y ?? 0,
    width: style.width,
    height: style.height,
    shape: 'rect',
    attrs: {
      body: {
        fill: style.fill,
        stroke: style.stroke,
        strokeWidth: style.strokeWidth,
        strokeDasharray: style.strokeDasharray ?? undefined,
        rx: style.borderRadius,
        ry: style.borderRadius,
      },
      label: {
        text: `${data.originalText}\n${data.chineseText}`,
        fontSize: style.fontSize,
        fontFamily: style.fontFamily,
        fill: style.fontColor,
        fontWeight: style.fontWeight,
        fontStyle: style.fontStyle,
      },
    },
    ports: {
      groups: {
        top: { position: 'top', attrs: { circle: { r: 4, magnet: true, stroke: '#1890FF', strokeWidth: 1, fill: '#fff' } } },
        bottom: { position: 'bottom', attrs: { circle: { r: 4, magnet: true, stroke: '#1890FF', strokeWidth: 1, fill: '#fff' } } },
        left: { position: 'left', attrs: { circle: { r: 4, magnet: true, stroke: '#1890FF', strokeWidth: 1, fill: '#fff' } } },
        right: { position: 'right', attrs: { circle: { r: 4, magnet: true, stroke: '#1890FF', strokeWidth: 1, fill: '#fff' } } },
      },
      items: [
        { group: 'top', id: `${data.id}-top` },
        { group: 'bottom', id: `${data.id}-bottom` },
        { group: 'left', id: `${data.id}-left` },
        { group: 'right', id: `${data.id}-right` },
      ],
    },
    data: {
      originalText: data.originalText,
      chineseText: data.chineseText,
      nodeType: data.nodeType,
      sourceSentence: data.sourceSentence,
    },
  }
}

export function updateNodeStyle(node: Graph.Node, style: Partial<NodeData['style']>): void {
  const currentStyle = {
    fill: node.attr('body/fill') as string,
    stroke: node.attr('body/stroke') as string,
    strokeWidth: node.attr('body/strokeWidth') as number,
    strokeDasharray: node.attr('body/strokeDasharray') as string | null,
    rx: node.attr('body/rx') as number,
    ry: node.attr('body/ry') as number,
    fontSize: node.attr('label/fontSize') as number,
    fontFamily: node.attr('label/fontFamily') as string,
    fontColor: node.attr('label/fill') as string,
    fontWeight: node.attr('label/fontWeight') as string,
    fontStyle: node.attr('label/fontStyle') as string,
  }

  const merged = { ...currentStyle, ...style }

  node.attr({
    body: {
      fill: merged.fill,
      stroke: merged.stroke,
      strokeWidth: merged.strokeWidth,
      strokeDasharray: merged.strokeDasharray ?? '',
      rx: merged.rx ?? merged.borderRadius ?? 8,
      ry: merged.ry ?? merged.borderRadius ?? 8,
    },
    label: {
      fontSize: merged.fontSize,
      fontFamily: merged.fontFamily,
      fill: merged.fontColor,
      fontWeight: merged.fontWeight,
      fontStyle: merged.fontStyle,
    },
  })

  if (style.width || style.height) {
    node.resize(style.width || node.getSize().width, style.height || node.getSize().height)
  }
}
