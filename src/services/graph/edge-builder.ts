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
    connector: { name: 'smooth' },
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
            refX: '-35%',
            refY: '-40%',
            refWidth: '170%',
            refHeight: '180%',
            fill: style.labelBgColor || '#ffffff',
            fillOpacity: 1,
            stroke: style.labelBgColor || '#ffffff',
            strokeWidth: 8,
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
            lineHeight: style.fontSize * 1.6,
            stroke: style.labelBgColor || '#ffffff',
            strokeWidth: 8,
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
      const existingBg = (existingAttrs.bg || {}) as Record<string, unknown>
      const existingLabelText = (existingAttrs.labelText || {}) as Record<string, unknown>
      
      const newLabelText: Record<string, unknown> = { ...existingLabelText }
      if (style.fontSize !== undefined) newLabelText.fontSize = style.fontSize
      if (style.fontFamily !== undefined) newLabelText.fontFamily = style.fontFamily
      if (style.fontColor !== undefined) newLabelText.fill = style.fontColor

      const newBg: Record<string, unknown> = { ...existingBg }
      if (style.labelBgColor !== undefined) {
        newBg.fill = style.labelBgColor
        newLabelText.stroke = style.labelBgColor
      }

      const newLabel = {
        ...existingLabel,
        attrs: {
          bg: newBg,
          labelText: newLabelText,
        },
      }
      e.setLabels([newLabel])
    }
  }
}
