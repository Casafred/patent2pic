import { Graph } from '@antv/x6'
import type { EdgeData } from '@/types/graph'
import { getDefaultEdgeStyle, arrowTypeToMarker } from './style-registry'

export function buildEdge(data: EdgeData): Graph.Metadata['edges'][number] {
  const style = data.style || getDefaultEdgeStyle(data.relationType)
  const marker = arrowTypeToMarker(style.arrowType)

  const edgeConfig: Graph.Metadata['edges'][number] = {
    id: data.id,
    source: { cell: data.source, port: data.sourcePort },
    target: { cell: data.target, port: data.targetPort },
    attrs: {
      line: {
        stroke: style.stroke,
        strokeWidth: style.strokeWidth,
        strokeDasharray: style.strokeDasharray ?? '',
        sourceMarker: data.style?.arrowType === 'both' ? { name: marker } : undefined,
        targetMarker: marker ? { name: marker } : { name: '' },
      },
    },
    labels: [
      {
        attrs: {
          label: {
            text: `${data.originalText}\n${data.chineseText}`,
            fontSize: style.fontSize,
            fontFamily: style.fontFamily,
            fill: style.fontColor,
          },
          rect: {
            fill: style.labelBgColor,
            rx: 4,
            ry: 4,
          },
        },
        position: {
          distance: 0.5,
        },
      },
    ],
    data: {
      originalText: data.originalText,
      chineseText: data.chineseText,
      relationType: data.relationType,
    },
  }

  return edgeConfig
}

export function updateEdgeStyle(edge: Graph.Edge, style: Partial<EdgeData['style']>): void {
  const marker = style.arrowType ? arrowTypeToMarker(style.arrowType) : undefined

  edge.attr({
    line: {
      stroke: style.stroke,
      strokeWidth: style.strokeWidth,
      strokeDasharray: style.strokeDasharray ?? '',
      sourceMarker: style.arrowType === 'both' ? { name: marker || 'block' } : undefined,
      targetMarker: marker ? { name: marker } : { name: '' },
    },
  })

  if (style.fontSize || style.fontFamily || style.fontColor || style.labelBgColor) {
    const label = edge.getLabels()[0]
    if (label) {
      edge.setLabels([{
        ...label,
        attrs: {
          label: {
            fontSize: style.fontSize,
            fontFamily: style.fontFamily,
            fill: style.fontColor,
          },
          rect: {
            fill: style.labelBgColor,
          },
        },
      }])
    }
  }
}
