import type { EdgeData } from '@/types/graph'
import { getDefaultEdgeStyle, arrowTypeToMarker } from './style-registry'

function getEdgeLabelText(data: EdgeData, isChinese: boolean): string {
  if (isChinese) {
    return data.chineseText || data.originalText
  }
  return `${data.originalText}\n${data.chineseText}`
}

export function buildEdge(data: EdgeData, isChinese: boolean = false): Record<string, unknown> {
  const style = data.style || getDefaultEdgeStyle(data.relationType)
  const marker = arrowTypeToMarker(style.arrowType)

  const edgeConfig: Record<string, unknown> = {
    id: data.id,
    shape: 'edge-with-gap',
    view: 'edge-with-gap-view',
    source: { cell: data.source, port: data.sourcePort },
    target: { cell: data.target, port: data.targetPort },
    router: { name: 'orth' },
    connector: { name: 'rounded', args: { radius: 8 } },
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
        markup: [
          {
            tagName: 'rect',
            selector: 'bg',
          },
          {
            tagName: 'text',
            selector: 'labelText',
          },
        ],
        attrs: {
          bg: {
            ref: 'labelText',
            refWidth: 1.2,
            refHeight: 1.4,
            refX: -0.1,
            refY: -0.2,
            fill: 'transparent',
            stroke: 'none',
            strokeWidth: 0,
            rx: 4,
            ry: 4,
            cursor: 'move',
          },
          labelText: {
            text: getEdgeLabelText(data, isChinese),
            fontSize: style.fontSize,
            fontFamily: style.fontFamily,
            fill: style.fontColor,
            fontWeight: 'bold',
            textAnchor: 'middle',
            textVerticalAnchor: 'middle',
            lineHeight: style.fontSize * 1.6,
            stroke: '#ffffff',
            strokeWidth: 6,
            paintOrder: 'stroke fill',
            strokeLinejoin: 'round',
          },
        },
        position: {
          distance: 0.5,
          offset: { x: 0, y: 0 },
        },
      },
    ],
    data: {
      originalText: data.originalText,
      chineseText: data.chineseText,
      relationType: data.relationType,
      labelDetached: false,
    },
    zIndex: 10,
  }

  return edgeConfig
}

export function updateEdgeStyle(edge: unknown, style: Partial<EdgeData['style']>): void {
  const marker = style.arrowType ? arrowTypeToMarker(style.arrowType) : undefined
  const e = edge as { attr: (attrs: Record<string, unknown>) => void; getLabels: () => unknown[]; setLabels: (labels: unknown[]) => void }

  e.attr({
    line: {
      stroke: style.stroke,
      strokeWidth: style.strokeWidth,
      strokeDasharray: style.strokeDasharray ?? '',
      sourceMarker: style.arrowType === 'both' ? { name: marker || 'block' } : undefined,
      targetMarker: marker ? { name: marker } : { name: '' },
    },
  })

  if (style.fontSize !== undefined || style.fontFamily !== undefined || style.fontColor !== undefined || style.labelBgColor !== undefined) {
    const label = e.getLabels()[0]
    if (label) {
      const existingLabel = label as Record<string, unknown>
      const existingAttrs = (existingLabel.attrs || {}) as Record<string, unknown>
      const existingLabelText = (existingAttrs.labelText || {}) as Record<string, unknown>

      const newLabelText: Record<string, unknown> = { ...existingLabelText }
      if (style.fontSize !== undefined) newLabelText.fontSize = style.fontSize
      if (style.fontFamily !== undefined) newLabelText.fontFamily = style.fontFamily
      if (style.fontColor !== undefined) newLabelText.fill = style.fontColor

      const newLabel = {
        ...existingLabel,
        attrs: {
          ...existingAttrs,
          labelText: newLabelText,
        },
      }
      e.setLabels([newLabel])
    }
  }
}
