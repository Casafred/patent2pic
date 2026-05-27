import type { NodeData } from '@/types/graph'
import { getDefaultNodeStyle } from './style-registry'

function getLabelText(data: NodeData, isChinese: boolean): string {
  if (isChinese) {
    return data.chineseText || data.originalText
  }
  return `${data.originalText}\n${data.chineseText}`
}

export function buildNode(data: NodeData, isChinese: boolean = false): Record<string, unknown> {
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
        text: getLabelText(data, isChinese),
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
      style: data.style,
    },
  }
}

export function updateNodeStyle(node: unknown, style: Partial<NodeData['style']>): void {
  const n = node as unknown as {
    attr: (pathOrObj: string | Record<string, unknown>, value?: unknown) => unknown
    getSize: () => { width: number; height: number }
    resize: (width: number, height: number) => void
    getData: () => Record<string, unknown> | undefined
    setData: (data: Record<string, unknown>) => void
  }

  const bodyAttrs: Record<string, unknown> = {}
  const labelAttrs: Record<string, unknown> = {}

  if (style.fill !== undefined) bodyAttrs.fill = style.fill
  if (style.stroke !== undefined) bodyAttrs.stroke = style.stroke
  if (style.strokeWidth !== undefined) bodyAttrs.strokeWidth = style.strokeWidth
  if (style.strokeDasharray !== undefined) bodyAttrs.strokeDasharray = style.strokeDasharray ?? ''
  if (style.borderRadius !== undefined) {
    bodyAttrs.rx = style.borderRadius
    bodyAttrs.ry = style.borderRadius
  }
  if (style.fontSize !== undefined) labelAttrs.fontSize = style.fontSize
  if (style.fontFamily !== undefined) labelAttrs.fontFamily = style.fontFamily
  if (style.fontColor !== undefined) labelAttrs.fill = style.fontColor
  if (style.fontWeight !== undefined) labelAttrs.fontWeight = style.fontWeight
  if (style.fontStyle !== undefined) labelAttrs.fontStyle = style.fontStyle

  if (Object.keys(bodyAttrs).length > 0) {
    n.attr({ body: bodyAttrs })
  }
  if (Object.keys(labelAttrs).length > 0) {
    n.attr({ label: labelAttrs })
  }

  if (style.width || style.height) {
    const size = n.getSize()
    n.resize(style.width || size.width, style.height || size.height)
  }

  const currentData = n.getData() || {}
  const currentStyle = (currentData.style as Record<string, unknown>) || {}
  n.setData({ ...currentData, style: { ...currentStyle, ...style } })
}
