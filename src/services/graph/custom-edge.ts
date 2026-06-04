import { Graph, Path, Edge, EdgeView, Registry } from '@antv/x6'
import type { KeyValue, Markup } from '@antv/x6'
import { ObjectExt } from '@antv/x6'
import { Line, Point, Rectangle } from '@antv/x6-geometry'

type Direction = 'top' | 'right' | 'bottom' | 'left'

function getConnectionSide(
  nodeCenterX: number,
  nodeCenterY: number,
  otherCenterX: number,
  otherCenterY: number,
  nodeWidth: number,
  nodeHeight: number,
): Direction {
  const dx = otherCenterX - nodeCenterX
  const dy = otherCenterY - nodeCenterY

  if (dx === 0 && dy === 0) return 'right'

  const halfWidth = nodeWidth / 2
  const halfHeight = nodeHeight / 2

  const tx = dx !== 0 ? halfWidth / Math.abs(dx) : Infinity
  const ty = dy !== 0 ? halfHeight / Math.abs(dy) : Infinity

  if (tx <= ty) {
    return dx > 0 ? 'right' : 'left'
  } else {
    return dy > 0 ? 'bottom' : 'top'
  }
}

function inferSideFromRefPoint(
  refX: number,
  refY: number,
  bbox: { x: number; y: number; width: number; height: number },
): Direction {
  const cx = bbox.x + bbox.width / 2
  const cy = bbox.y + bbox.height / 2
  const dx = refX - cx
  const dy = refY - cy
  const halfW = bbox.width / 2
  const halfH = bbox.height / 2

  if (dx === 0 && dy === 0) return 'right'

  const tx = dx !== 0 ? halfW / Math.abs(dx) : Infinity
  const ty = dy !== 0 ? halfH / Math.abs(dy) : Infinity

  if (tx <= ty) {
    return dx > 0 ? 'right' : 'left'
  } else {
    return dy > 0 ? 'bottom' : 'top'
  }
}

function getSideCenterPoint(
  bbox: { x: number; y: number; width: number; height: number },
  side: Direction,
): { x: number; y: number } {
  const cx = bbox.x + bbox.width / 2
  const cy = bbox.y + bbox.height / 2
  switch (side) {
    case 'right':  return { x: bbox.x + bbox.width, y: cy }
    case 'left':   return { x: bbox.x, y: cy }
    case 'bottom': return { x: cx, y: bbox.y + bbox.height }
    case 'top':    return { x: cx, y: bbox.y }
  }
}

const perpendicularBoundary = function (
  line: Line,
  view: any,
  _magnet: SVGElement,
  _options: Record<string, unknown>,
): Point {
  const refPoint = line.start
  const anchorPoint = line.end

  let bbox: Rectangle
  const cellView = view
  if (cellView && cellView.cell && cellView.cell.isNode()) {
    bbox = cellView.cell.getBBox()
  } else {
    bbox = new Rectangle(anchorPoint.x - 50, anchorPoint.y - 25, 100, 50)
  }

  const side = inferSideFromRefPoint(refPoint.x, refPoint.y, {
    x: bbox.x, y: bbox.y, width: bbox.width, height: bbox.height,
  })

  const pt = getSideCenterPoint(
    { x: bbox.x, y: bbox.y, width: bbox.width, height: bbox.height },
    side,
  )

  return new Point(pt.x, pt.y)
}

interface BBox {
  x: number
  y: number
  width: number
  height: number
}

function isHorizontal(side: Direction): boolean {
  return side === 'left' || side === 'right'
}

function getOutsidePoint(bbox: BBox, side: Direction, jetty: number): { x: number; y: number } {
  const cx = bbox.x + bbox.width / 2
  const cy = bbox.y + bbox.height / 2
  switch (side) {
    case 'right':  return { x: bbox.x + bbox.width + jetty, y: cy }
    case 'left':   return { x: bbox.x - jetty, y: cy }
    case 'bottom': return { x: cx, y: bbox.y + bbox.height + jetty }
    case 'top':    return { x: cx, y: bbox.y - jetty }
  }
}

function segmentCrossesBBox(
  x1: number, y1: number, x2: number, y2: number,
  bbox: BBox,
): boolean {
  if (y1 === y2) {
    const minX = Math.min(x1, x2)
    const maxX = Math.max(x1, x2)
    return minX < bbox.x + bbox.width && maxX > bbox.x &&
           y1 > bbox.y && y1 < bbox.y + bbox.height
  }
  if (x1 === x2) {
    const minY = Math.min(y1, y2)
    const maxY = Math.max(y1, y2)
    return x1 > bbox.x && x1 < bbox.x + bbox.width &&
           minY < bbox.y + bbox.height && maxY > bbox.y
  }
  return false
}

function orthRouter(
  sourceBBox: BBox,
  targetBBox: BBox,
  startSide: Direction,
  endSide: Direction,
  jetty: number,
): Array<{ x: number; y: number }> {
  const s = getOutsidePoint(sourceBBox, startSide, jetty)
  const e = getOutsidePoint(targetBBox, endSide, jetty)

  const startHoriz = isHorizontal(startSide)
  const endHoriz = isHorizontal(endSide)

  const points: Array<{ x: number; y: number }> = [{ x: s.x, y: s.y }]

  if (startHoriz && endHoriz) {
    if (startSide === endSide) {
      const midX = startSide === 'right'
        ? Math.max(s.x, e.x)
        : Math.min(s.x, e.x)
      points.push({ x: midX, y: s.y })
      points.push({ x: midX, y: e.y })
    } else {
      const midX = (s.x + e.x) / 2
      points.push({ x: midX, y: s.y })
      points.push({ x: midX, y: e.y })
    }
  } else if (!startHoriz && !endHoriz) {
    if (startSide === endSide) {
      const midY = startSide === 'bottom'
        ? Math.max(s.y, e.y)
        : Math.min(s.y, e.y)
      points.push({ x: s.x, y: midY })
      points.push({ x: e.x, y: midY })
    } else {
      const midY = (s.y + e.y) / 2
      points.push({ x: s.x, y: midY })
      points.push({ x: e.x, y: midY })
    }
  } else if (startHoriz && !endHoriz) {
    const lShapeCrossesTarget = segmentCrossesBBox(s.x, s.y, e.x, s.y, targetBBox)
    if (lShapeCrossesTarget) {
      const reverseCrossesSource = segmentCrossesBBox(s.x, s.y, s.x, e.y, sourceBBox)
      if (reverseCrossesSource) {
        const outerX = startSide === 'right'
          ? Math.max(sourceBBox.x + sourceBBox.width, targetBBox.x + targetBBox.width) + jetty
          : Math.min(sourceBBox.x, targetBBox.x) - jetty
        points.push({ x: outerX, y: s.y })
        points.push({ x: outerX, y: e.y })
      } else {
        points.push({ x: s.x, y: e.y })
      }
    } else {
      points.push({ x: e.x, y: s.y })
    }
  } else {
    const lShapeCrossesTarget = segmentCrossesBBox(s.x, s.y, s.x, e.y, targetBBox)
    if (lShapeCrossesTarget) {
      const reverseCrossesSource = segmentCrossesBBox(s.x, s.y, e.x, s.y, sourceBBox)
      if (reverseCrossesSource) {
        const outerY = startSide === 'bottom'
          ? Math.max(sourceBBox.y + sourceBBox.height, targetBBox.y + targetBBox.height) + jetty
          : Math.min(sourceBBox.y, targetBBox.y) - jetty
        points.push({ x: s.x, y: outerY })
        points.push({ x: e.x, y: outerY })
      } else {
        points.push({ x: e.x, y: s.y })
      }
    } else {
      points.push({ x: s.x, y: e.y })
    }
  }

  points.push({ x: e.x, y: e.y })
  return points
}

function perpendicularManhattanRouter(
  this: EdgeView,
  vertices: Array<{ x: number; y: number }>,
  options: Record<string, unknown>,
  edgeView: EdgeView,
): Array<{ x: number; y: number }> {
  const edge = edgeView.cell
  const sourceCell = edge.getSourceCell()
  const targetCell = edge.getTargetCell()

  if (!sourceCell || !targetCell) {
    return vertices
  }

  const sourceData = sourceCell.getData() as Record<string, unknown> | undefined
  const targetData = targetCell.getData() as Record<string, unknown> | undefined
  if (sourceData?.isForkNode || targetData?.isForkNode) {
    const manhattanFn = Registry.Router.registry.get('manhattan')
    return manhattanFn ? manhattanFn.call(edgeView, vertices, options, edgeView) : vertices
  }

  const sourceBBox = sourceCell.getBBox()
  const targetBBox = targetCell.getBBox()
  const sourceCenter = sourceBBox.center
  const targetCenter = targetBBox.center

  const startSide = getConnectionSide(
    sourceCenter.x, sourceCenter.y,
    targetCenter.x, targetCenter.y,
    sourceBBox.width, sourceBBox.height,
  )

  const endSide = getConnectionSide(
    targetCenter.x, targetCenter.y,
    sourceCenter.x, sourceCenter.y,
    targetBBox.width, targetBBox.height,
  )

  const jetty = (options.padding as number) || 20

  return orthRouter(
    { x: sourceBBox.x, y: sourceBBox.y, width: sourceBBox.width, height: sourceBBox.height },
    { x: targetBBox.x, y: targetBBox.y, width: targetBBox.width, height: targetBBox.height },
    startSide,
    endSide,
    jetty,
  )
}

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
  Graph.registerRouter('perpendicularManhattan', perpendicularManhattanRouter, true)
  Graph.registerConnectionPoint('perpendicularBoundary', perpendicularBoundary as any, true)
  EdgeView.registry.register('edge-with-gap-view', EdgeViewWithGap, true)
}

export { EdgeViewWithGap }
