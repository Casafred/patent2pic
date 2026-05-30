import { Graph, Path, Edge, EdgeView } from '@antv/x6'
import type { KeyValue, Markup } from '@antv/x6'
import { ObjectExt } from '@antv/x6'

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

interface GapRegion {
  startLength: number
  endLength: number
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

  dragLabel(e: any, x: number, y: number) {
    const edge = this.cell as Edge
    const data = edge.getData() as Record<string, unknown> | undefined
    const isDetached = !!(data?.labelDetached)

    const eventData = this.getEventData(e) as {
      index: number
      positionAngle: number
      positionArgs?: KeyValue | null
    } | null

    if (!eventData || eventData.index == null) return

    const originLabel = edge.getLabelAt(eventData.index)
    const position = this.getLabelPosition(
      x,
      y,
      eventData.positionAngle,
      eventData.positionArgs,
    )

    if (!isDetached) {
      position.offset = { x: 0, y: 0 }
    }

    const label = ObjectExt.merge({}, originLabel, { position })
    edge.setLabelAt(eventData.index, label)
  }

  private updateLineWithGap(): void {
    const edge = this.cell as Edge
    const labels = edge.labels as EdgeLabel[]

    const linePath = this.findOne('line') as SVGPathElement | null
    const wrapPath = this.findOne('wrap') as SVGPathElement | null
    if (!linePath || !wrapPath) return

    const connection = this.getConnection()
    if (!connection) return

    const totalLength = connection.length()
    if (totalLength === 0) return

    const gapRegions: GapRegion[] = []

    if (labels && labels.length > 0) {
      const label = labels[0]
      if (label) {
        const distance = this.getLabelDistance(label)
        const absoluteDistance = distance >= 0 && distance <= 1
          ? distance * totalLength
          : totalLength / 2
        const gapSize = this.calculateGapSize(label)
        const halfGap = gapSize / 2
        gapRegions.push({
          startLength: Math.max(0, absoluteDistance - halfGap),
          endLength: Math.min(totalLength, absoluteDistance + halfGap),
        })
      }
    }

    const graph = edge.model
    if (graph) {
      const allEdges = graph.getEdges()
      for (const otherEdge of allEdges) {
        if (otherEdge.id === edge.id) continue

        const otherSource = otherEdge.getSourceCellId()
        const otherTarget = otherEdge.getTargetCellId()
        const mySource = edge.getSourceCellId()
        const myTarget = edge.getTargetCellId()

        if (otherSource !== mySource || otherTarget !== myTarget) continue

        const otherLabels = otherEdge.labels as EdgeLabel[]
        if (!otherLabels || otherLabels.length === 0) continue

        const otherLabel = otherLabels[0]
        if (!otherLabel) continue

        const otherDistance = this.getLabelDistance(otherLabel)
        const otherAbsoluteDistance = otherDistance >= 0 && otherDistance <= 1
          ? otherDistance * totalLength
          : totalLength / 2
        const otherGapSize = this.calculateGapSize(otherLabel)
        const otherHalfGap = otherGapSize / 2
        gapRegions.push({
          startLength: Math.max(0, otherAbsoluteDistance - otherHalfGap),
          endLength: Math.min(totalLength, otherAbsoluteDistance + otherHalfGap),
        })
      }
    }

    if (gapRegions.length === 0) return

    gapRegions.sort((a, b) => a.startLength - b.startLength)

    const mergedGaps: GapRegion[] = [gapRegions[0]]
    for (let i = 1; i < gapRegions.length; i++) {
      const last = mergedGaps[mergedGaps.length - 1]
      const current = gapRegions[i]
      if (current.startLength <= last.endLength + 5) {
        last.endLength = Math.max(last.endLength, current.endLength)
      } else {
        mergedGaps.push(current)
      }
    }

    const hasSignificantGap = mergedGaps.some(g => g.endLength - g.startLength >= 10)
    if (!hasSignificantGap) return

    const gapPath = this.createPathWithGaps(connection, mergedGaps)

    linePath.setAttribute('d', gapPath.serialize())
    wrapPath.setAttribute('d', gapPath.serialize())
  }

  private getLabelDistance(label: EdgeLabel): number {
    const position = label.position as LabelPosition | undefined
    if (position === undefined) return 0.5
    if (typeof position === 'number') return position
    if (typeof position.distance === 'number') return position.distance
    return 0.5
  }

  private calculateGapSize(label: EdgeLabel): number {
    const attrs = label.attrs as KeyValue | undefined
    const labelTextAttrs = attrs?.labelText as KeyValue | undefined
    const text = labelTextAttrs?.text as string | undefined
    const fontSize = (labelTextAttrs?.fontSize as number) || 12

    if (!text) return 60

    const lines = text.split('\n')
    const maxLineLength = Math.max(...lines.map(l => l.length))
    const charWidth = fontSize * 0.65
    const textPixelWidth = maxLineLength * charWidth
    const padding = fontSize * 2

    return Math.max(40, textPixelWidth + padding)
  }

  private createPathWithGaps(
    connection: Path,
    gaps: GapRegion[]
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

      const segmentGaps = gaps.filter(g =>
        g.endLength > segmentStartLength && g.startLength < segmentEndLength
      )

      if (segmentGaps.length === 0) {
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

        let prevEnd = segmentStartLength

        for (const gap of segmentGaps) {
          const gapStart = Math.max(gap.startLength, segmentStartLength)
          const gapEnd = Math.min(gap.endLength, segmentEndLength)

          if (gapStart > prevEnd) {
            const segStart = prevEnd === segmentStartLength
              ? start
              : start.clone().move(direction, prevEnd - segmentStartLength)
            const segEnd = start.clone().move(direction, gapStart - segmentStartLength)

            if (isFirstSegment) {
              gapPath.appendSegment(Path.createSegment('M', segStart))
              isFirstSegment = false
            }
            gapPath.appendSegment(Path.createSegment('L', segEnd))
          }

          prevEnd = gapEnd
        }

        if (prevEnd < segmentEndLength) {
          const resumePoint = start.clone().move(direction, prevEnd - segmentStartLength)
          gapPath.appendSegment(Path.createSegment('M', resumePoint))
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
