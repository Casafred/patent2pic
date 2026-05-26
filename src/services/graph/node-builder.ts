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
    },
  }
}

export function updateNodeStyle(node: unknown, style: Partial<NodeData['style']>): void {
  const n = node as unknown as {
    attr: (path: string, value?: unknown) => unknown
    getSize: () => { width: number; height: number }
    resize: (width: number, height: number) => void
  }
  const currentStyle = {
    fill: n.attr('body/fill') as string,
    stroke: n.attr('body/stroke') as string,
    strokeWidth: n.attr('body/strokeWidth') as number,
    strokeDasharray: n.attr('body/strokeDasharray') as string | null,
    rx: n.attr('body/rx') as number,
    ry: n.attr('body/ry') as number,
    fontSize: n.attr('label/fontSize') as number,
    fontFamily: n.attr('label/fontFamily') as string,
    fontColor: n.attr('label/fill') as string,
    fontWeight: n.attr('label/fontWeight') as string,
    fontStyle: n.attr('label/fontStyle') as string,
  }

  const merged = { ...currentStyle, ...style }

  n.attr('body/fill', merged.fill)
  n.attr('body/stroke', merged.stroke)
  n.attr('body/strokeWidth', merged.strokeWidth)
  n.attr('body/strokeDasharray', merged.strokeDasharray ?? '')
  n.attr('body/rx', merged.rx ?? merged.borderRadius ?? 8)
  n.attr('body/ry', merged.ry ?? merged.borderRadius ?? 8)
  n.attr('label/fontSize', merged.fontSize)
  n.attr('label/fontFamily', merged.fontFamily)
  n.attr('label/fill', merged.fontColor)
  n.attr('label/fontWeight', merged.fontWeight)
  n.attr('label/fontStyle', merged.fontStyle)

  if (style.width || style.height) {
    const size = n.getSize()
    n.resize(style.width || size.width, style.height || size.height)
  }
}
