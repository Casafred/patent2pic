import { Graph, Path, Edge, EdgeView } from '@antv/x6'
import type { KeyValue, Markup } from '@antv/x6'

interface LabelPositionObject {
  distance: number
  offset?: number | { x?: number; y?: number }
  angle?: number
  options?: KeyValue
}

type LabelPosition = number | LabelPositionObject

interface EdgeLabel extends KeyValue {
  markup?: Markup
  attrs?: KeyValue
  position?: LabelPosition
  size?: { width: number; height: number }
}

class EdgeViewWithGap extends EdgeView {
  confirmUpdate(flag: number, options: KeyValue = {}): number {
    const hadUpdate = this.hasAction(flag, 'update')
    const ret = super.confirmUpdate(flag, options)
    if (hadUpdate) {
      try {
        this.updateLineWithGap()
      } catch {
        // ignore gap update errors to not break the render cycle
      }
    }
    return ret
  }

  private updateLineWithGap(): void {
    const edge = this.cell as Edge
    const labels = edge.labels as EdgeLabel[]

    if (!labels || labels.length === 0) {
      return
    }

    const label = labels[0]
    if (!label) return

    const linePath = this.findOne('line') as SVGPathElement | null
    const wrapPath = this.findOne('wrap') as SVGPathElement | null
    if (!linePath || !wrapPath) return

    const connection = this.getConnection()
    if (!connection) return

    const segments = connection.segments
    if (!segments || segments.length === 0) return

    const hasCurve = segments.some(seg => {
      const type = seg.type
      return type === 'C' || type === 'S' || type === 'Q' || type === 'T'
    })
    if (hasCurve) return

    const totalLength = connection.length()
    if (totalLength === 0) return

    const position = label.position as LabelPosition | undefined
    let distance = 0.5
    if (position !== undefined) {
      if (typeof position === 'number') {
        distance = position
      } else if (typeof position.distance === 'number') {
        distance = position.distance
      }
    }

    const absoluteDistance = distance >= 0 && distance <= 1
      ? distance * totalLength
      : totalLength / 2

    const gapSize = 80
    const halfGap = gapSize / 2

    const gapStartLength = Math.max(0, absoluteDistance - halfGap)
    const gapEndLength = Math.min(totalLength, absoluteDistance + halfGap)

    if (gapEndLength - gapStartLength < 10) {
      return
    }

    const gapPath = this.createPathWithGap(connection, gapStartLength, gapEndLength)

    linePath.setAttribute('d', gapPath.serialize())
    wrapPath.setAttribute('d', gapPath.serialize())
  }

  private createPathWithGap(
    connection: Path,
    gapStartLength: number,
    gapEndLength: number
  ): Path {
    const gapPath = new Path()

    const segments = connection.segments
    if (!segments || segments.length === 0) {
      return connection
    }

    let accumulatedLength = 0
    let isFirstSegment = true

    for (const segment of segments) {
      const segmentLength = segment.length()
      const segmentStartLength = accumulatedLength
      const segmentEndLength = accumulatedLength + segmentLength

      if (gapEndLength <= segmentStartLength) {
        if (isFirstSegment) {
          gapPath.appendSegment(Path.createSegment('M', segment.start))
          isFirstSegment = false
        }
        gapPath.appendSegment(segment.clone())
      } else if (gapStartLength >= segmentEndLength) {
        if (isFirstSegment) {
          gapPath.appendSegment(Path.createSegment('M', segment.start))
          isFirstSegment = false
        }
        gapPath.appendSegment(segment.clone())
      } else {
        const start = segment.start
        const end = segment.end
        const diff = end.diff(start)
        const length = Math.sqrt(diff.x * diff.x + diff.y * diff.y)
        const direction = length > 0 ? { x: diff.x / length, y: diff.y / length } : { x: 0, y: 0 }

        if (gapStartLength > segmentStartLength) {
          const gapStartPoint = start.clone().move(direction, gapStartLength - segmentStartLength)
          if (isFirstSegment) {
            gapPath.appendSegment(Path.createSegment('M', start))
            isFirstSegment = false
          }
          gapPath.appendSegment(Path.createSegment('L', gapStartPoint))
        }

        if (gapEndLength < segmentEndLength) {
          const gapEndPoint = start.clone().move(direction, gapEndLength - segmentStartLength)
          gapPath.appendSegment(Path.createSegment('M', gapEndPoint))
          gapPath.appendSegment(Path.createSegment('L', end))
        }
      }

      accumulatedLength += segmentLength
    }

    return gapPath
  }
}

Graph.registerEdge('edge-with-gap', {
  inherit: 'edge',
  attrs: {
    wrap: {
      connection: true,
      strokeWidth: 10,
      strokeLinejoin: 'round',
    },
    line: {
      connection: true,
      stroke: '#333333',
      strokeWidth: 2,
      strokeLinejoin: 'round',
      targetMarker: {
        tagName: 'path',
        d: 'M 10 -5 0 0 10 5 z',
      },
    },
  },
}, true)

export function setupCustomEdge(): void {
  EdgeView.registry.register('edge-with-gap-view', EdgeViewWithGap, true)
}

export { EdgeViewWithGap }
