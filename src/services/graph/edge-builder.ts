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
            refX: -8,
            refY: -6,
            refWidth: '140%',
            refHeight: '140%',
            fill: '#ffffff',
            stroke: '#d9d9d9',
            strokeWidth: 1,
            rx: 4,
            ry: 4,
          },
          labelText: {
            text: getEdgeLabelText(data, isChinese),
            fontSize: style.fontSize,
            fontFamily: style.fontFamily,
            fill: style.fontColor,
            fontWeight: 'bold',
            textAnchor: 'middle',
            textVerticalAnchor: 'middle',
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
    },
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

  if (style.fontSize || style.fontFamily || style.fontColor || style.labelBgColor) {
    const label = e.getLabels()[0]
    if (label) {
      const existingLabel = label as Record<string, unknown>
      const existingAttrs = (existingLabel.attrs || {}) as Record<string, unknown>
      const existingBg = (existingAttrs.bg || {}) as Record<string, unknown>
      const existingLabelText = (existingAttrs.labelText || {}) as Record<string, unknown>
      
      const newLabel = {
        ...existingLabel,
        attrs: {
          bg: {
            ...existingBg,
            fill: style.labelBgColor || existingBg.fill,
          },
          labelText: {
            ...existingLabelText,
            fontSize: style.fontSize || existingLabelText.fontSize,
            fontFamily: style.fontFamily || existingLabelText.fontFamily,
            fill: style.fontColor || existingLabelText.fill,
          },
        },
      }
      e.setLabels([newLabel])
    }
  }
}
