import { Graph } from '@antv/x6'
import { Selection } from '@antv/x6-plugin-selection'
import { Snapline } from '@antv/x6-plugin-snapline'
import { History } from '@antv/x6-plugin-history'
import { Clipboard } from '@antv/x6-plugin-clipboard'
import { MiniMap } from '@antv/x6-plugin-minimap'
import { Export } from '@antv/x6-plugin-export'
import { Transform } from '@antv/x6-plugin-transform'
import type { NodeData, EdgeData } from '@/types/graph'
import type { ExtractResult, ExtractGroup } from '@/types/ai'
import { buildNode, updateNodeStyle, calculateNodeSize } from './node-builder'
import { buildEdge, buildTrunkEdge, buildBranchEdge, updateEdgeStyle } from './edge-builder'
import { applyElkLayout, type ElkLayoutOptions } from './layout'
import { getDefaultNodeStyle, getDefaultEdgeStyle, getHierarchyNodeStyle } from './style-registry'
import { setupCustomEdge } from './custom-edge'
import { timingStart, timingEnd } from '@/utils/timing'

export class GraphEngine {
  private graph: Graph | null = null
  private initialGraphJSON: Record<string, unknown> | null = null

  init(container: HTMLElement): void {
    setupCustomEdge()

    this.graph = new Graph({
      container,
      autoResize: true,
      background: { color: '#f5f7fa' },
      grid: {
        visible: true,
        type: 'dot',
        args: { color: '#ddd', thickness: 1 },
      },
      panning: { enabled: true, eventTypes: ['rightMouseDown', 'mouseWheel'] },
      mousewheel: { enabled: true, zoomAtMousePosition: true, modifiers: null, minScale: 0.1, maxScale: 3 },
      connecting: {
        router: { name: 'perpendicularManhattan', args: { padding: 20, step: 10 } },
        connector: { name: 'rounded', args: { radius: 8 } },
        anchor: 'center',
        connectionPoint: 'boundary',
        allowBlank: false,
        allowLoop: false,
        allowMulti: true,
        snap: { radius: 30 },
        createEdge() {
          return this.createEdge({
            shape: 'edge',
            attrs: {
              line: {
                stroke: '#a2b1c3',
                strokeWidth: 4.5,
                targetMarker: { name: 'block', width: 12, height: 8 },
              },
            },
            zIndex: 10,
          })
        },
        validateConnection({ edge, sourceCell, targetCell, type }) {
          if (!sourceCell || !targetCell) return false

          if (edge) {
            const edgeData = edge.getData() as Record<string, unknown> | undefined

            if (edgeData?.isTrunk) {
              const realSourceId = edgeData.realSourceId as string
              const forkNodeId = edgeData.forkNodeId as string
              if (type === 'source') {
                return sourceCell.id === realSourceId && targetCell.id === forkNodeId
              }
              return sourceCell.id === realSourceId && targetCell.id === forkNodeId
            }

            if (edgeData?.isBranch) {
              const forkNodeId = edgeData.forkNodeId as string
              const realTargetId = edgeData.realTargetId as string
              if (type === 'source') {
                return sourceCell.id === forkNodeId && targetCell.id === realTargetId
              }
              return sourceCell.id === forkNodeId && targetCell.id === realTargetId
            }

            if (edgeData?.originalText !== undefined) {
              const originalSource = edge.getSourceCellId()
              const originalTarget = edge.getTargetCellId()
              if (type === 'source') {
                return sourceCell.id === originalSource && targetCell.id === originalTarget
              }
              return sourceCell.id === originalSource && targetCell.id === originalTarget
            }
          }

          return true
        },
      },
      interacting: {
        nodeMovable: true,
        edgeMovable: true,
        edgeLabelMovable: true,
        arrowheadMovable: true,
        vertexMovable: false,
        vertexAddable: false,
        vertexDeletable: false,
      },
      highlighting: {
        magnetAdsorbed: {
          name: 'stroke',
          args: { attrs: { fill: '#1890FF', stroke: '#1890FF' } },
        },
      },
    })

    this.graph.on('edge:mouseenter', ({ edge }: { edge: any }) => {
      edge.addTools([
        { name: 'source-arrowhead', args: { attrs: { fill: '#e63946', stroke: '#e63946' } } },
        { name: 'target-arrowhead', args: { attrs: { fill: '#e63946', stroke: '#e63946' } } },
      ])
    })

    this.graph.on('edge:mouseleave', ({ edge }: { edge: any }) => {
      edge.removeTools()
    })

    this.graph.on('edge:click', ({ edge }: { edge: any }) => {
      const data = edge.getData() as Record<string, unknown> | undefined
      if (data?.isBranch) return
      this.highlightEdge(edge.id)
    })

    this.graph.on('edge:label:click', ({ edge }: { edge: any }) => {
      const data = edge.getData() as Record<string, unknown> | undefined
      if (data?.isBranch) return
      this.highlightEdge(edge.id)
    })

    this.graph.on('blank:click', () => {
      this.clearHighlight()
    })

    this.graph.use(new Selection({
      enabled: true,
      rubberband: true,
      showNodeSelectionBox: true,
      modifiers: [],
      filter(this: Graph, cell) {
        if (cell.isNode()) {
          const data = cell.getData()
          if (data?.hidden || data?.isForkNode) return false
        }
        return true
      },
    }))
    this.graph.use(new Snapline({ enabled: true }))
    this.graph.use(new History({ enabled: true }))
    this.graph.use(new Clipboard({ enabled: true }))
    this.graph.use(new MiniMap({ width: 160, height: 100, padding: 10 }))
    this.graph.use(new Export())
    this.graph.use(new Transform({
      resizing: {
        enabled: true,
        preserveAspectRatio: false,
        allowReverse: false,
      },
    }))
  }

  destroy(): void {
    if (this.graph) {
      this.graph.dispose()
      this.graph = null
    }
  }

  getGraph(): Graph | null {
    return this.graph
  }

  async batchBuild(result: ExtractResult, layoutOptions?: ElkLayoutOptions, isChinese: boolean = false): Promise<void> {
    if (!this.graph) return

    const timingKey = `    │  图谱 batchBuild`
    timingStart(timingKey)

    this.graph.startBatch('build')

    this.graph.clearCells()

    const nodeDataList: NodeData[] = result.nodes.map(n => {
      const baseStyle = getDefaultNodeStyle(n.nodeType)
      const hierarchyStyle = getHierarchyNodeStyle(n.hierarchyLevel ?? 0, n.nodeType)
      const mergedStyle = { ...baseStyle, ...hierarchyStyle }
      const size = calculateNodeSize(n.originalText, n.chineseText, isChinese, mergedStyle.fontSize, mergedStyle.fontFamily, mergedStyle.fontWeight, mergedStyle.width, mergedStyle.height)
      return {
        id: n.id,
        originalText: n.originalText,
        chineseText: n.chineseText,
        nodeType: n.nodeType,
        hierarchyLevel: n.hierarchyLevel ?? 0,
        style: { ...mergedStyle, width: size.width, height: size.height },
      }
    })

    const edgeDataList: EdgeData[] = result.edges.map(e => ({
      id: e.id,
      source: e.source,
      target: e.target,
      originalText: e.originalText,
      chineseText: e.chineseText,
      relationType: e.relationType,
      style: getDefaultEdgeStyle(e.relationType),
    }))

    const autoGroupInfoMap = new Map<string, { memberNodeIds: string[] }>()
    const outgoingInfoMap = new Map<string, {
      containmentTargets: Set<string>
      hasOtherOutgoing: boolean
    }>()
    for (const edgeData of edgeDataList) {
      const existing = outgoingInfoMap.get(edgeData.source)
      if (edgeData.relationType === 'containment') {
        if (existing) {
          existing.containmentTargets.add(edgeData.target)
        } else {
          outgoingInfoMap.set(edgeData.source, {
            containmentTargets: new Set([edgeData.target]),
            hasOtherOutgoing: false,
          })
        }
      } else {
        if (existing) {
          existing.hasOtherOutgoing = true
        } else {
          outgoingInfoMap.set(edgeData.source, {
            containmentTargets: new Set(),
            hasOtherOutgoing: true,
          })
        }
      }
    }
    for (const [nodeId, info] of outgoingInfoMap) {
      if (!info.hasOtherOutgoing && info.containmentTargets.size >= 3) {
        autoGroupInfoMap.set(nodeId, {
          memberNodeIds: [...info.containmentTargets],
        })
      }
    }

    timingStart(`    │    布局计算 (ELK)`)
    const positions = await applyElkLayout(nodeDataList, edgeDataList, layoutOptions)
    timingEnd(`    │    布局计算 (ELK)`)
    for (const nodeData of nodeDataList) {
      const pos = positions.get(nodeData.id)
      if (pos) {
        nodeData.x = pos.x
        nodeData.y = pos.y
      }
    }

    timingStart(`    │    添加节点和边`)
    for (const nodeData of nodeDataList) {
      const config = buildNode(nodeData, isChinese)
      this.graph.addNode(config)
    }

    const mergeGroupMap = new Map<string, EdgeData[]>()
    for (const edgeData of edgeDataList) {
      const key = `${edgeData.source}||${edgeData.originalText}`
      if (!mergeGroupMap.has(key)) {
        mergeGroupMap.set(key, [])
      }
      mergeGroupMap.get(key)!.push(edgeData)
    }

    const mergedEdgeIds = new Set<string>()
    for (const [, groupEdges] of mergeGroupMap) {
      const uniqueTargets = new Set(groupEdges.map(e => e.target))
      if (groupEdges.length >= 2 && uniqueTargets.size >= 2) {
        for (const edgeData of groupEdges) {
          mergedEdgeIds.add(edgeData.id)
        }
      }
    }

    const nonMergedEdges = edgeDataList.filter(e => !mergedEdgeIds.has(e.id))
    const edgeDistanceMap = new Map<string, number>()
    for (const edgeData of nonMergedEdges) {
      const key = `${edgeData.source}->${edgeData.target}`
      const count = edgeDistanceMap.get(key) || 0
      edgeDistanceMap.set(key, count + 1)
    }

    const edgeIndexMap = new Map<string, number>()

    let forkGroupIndex = 0
    for (const [, groupEdges] of mergeGroupMap) {
      const uniqueTargets = new Set(groupEdges.map(e => e.target))
      if (groupEdges.length >= 2 && uniqueTargets.size >= 2) {
        const sourceId = groupEdges[0].source
        const targetIds = [...new Set(groupEdges.map(e => e.target))]
        const forkNodeId = `fork-${sourceId}-${forkGroupIndex}`
        forkGroupIndex++

        const forkPos = this.calculateForkPosition(sourceId, targetIds)

        this.graph.addNode({
          id: forkNodeId,
          x: forkPos.x,
          y: forkPos.y,
          width: 1,
          height: 1,
          shape: 'rect',
          zIndex: -10,
          attrs: {
            body: {
              fill: 'transparent',
              stroke: 'transparent',
              strokeWidth: 0,
            },
          },
          data: {
            isForkNode: true,
            sourceId,
            targetIds,
          },
        })

        const mergedIds = groupEdges.map(e => e.id)
        const trunkConfig = buildTrunkEdge(groupEdges[0], forkNodeId, mergedIds, isChinese)
        this.graph.addEdge(trunkConfig)

        for (const edgeData of groupEdges) {
          const branchConfig = buildBranchEdge(edgeData, forkNodeId)
          this.graph.addEdge(branchConfig)
        }
      }
    }

    for (const edgeData of nonMergedEdges) {
      const key = `${edgeData.source}->${edgeData.target}`
      const totalCount = edgeDistanceMap.get(key) || 1
      const currentIndex = edgeIndexMap.get(key) || 0
      edgeIndexMap.set(key, currentIndex + 1)

      const config = buildEdge(edgeData, isChinese)
      if (totalCount > 1) {
        const step = 1 / (totalCount + 1)
        const distance = step * (currentIndex + 1)
        const labels = config.labels as Record<string, unknown>[]
        if (labels && labels.length > 0) {
          const label = labels[0] as Record<string, unknown>
          label.position = { distance }
        }
      }
      this.graph.addEdge(config)
    }
    timingEnd(`    │    添加节点和边`)

    if (autoGroupInfoMap.size > 0) {
      this.convertAutoGroupNodes(autoGroupInfoMap, isChinese)
    }

    if (result.groups && result.groups.length > 0) {
      const autoGroupMemberIds = new Set<string>()
      for (const [, info] of autoGroupInfoMap) {
        for (const memberId of info.memberNodeIds) {
          autoGroupMemberIds.add(memberId)
        }
      }

      const filteredGroups = result.groups.filter(group => {
        const overlap = group.memberNodeIds.filter(id => autoGroupMemberIds.has(id))
        return overlap.length < group.memberNodeIds.length * 0.5
      })

      if (filteredGroups.length > 0) {
        timingStart(`    │    渲染分组`)
        this.renderGroups(filteredGroups, isChinese)
        timingEnd(`    │    渲染分组`)
      }
    }

    this.graph.stopBatch('build')

    this.initialGraphJSON = this.graph.toJSON()

    setTimeout(() => this.fitView(), 100)

    timingEnd(timingKey)
  }

  private renderGroups(groups: ExtractGroup[], isChinese: boolean = false): void {
    if (!this.graph) return

    for (const group of groups) {
      if (group.memberNodeIds.length === 0) continue

      const memberNodes = group.memberNodeIds
        .map(id => this.graph!.getCellById(id))
        .filter(cell => cell && cell.isNode())

      if (memberNodes.length === 0) continue

      const bounds = this.getNodesBounds(memberNodes)

      const padding = 20
      const groupLabel = isChinese
        ? (group.label.chinese || group.label.original)
        : `${group.label.original}\n${group.label.chinese}`

      this.graph.addNode({
        id: group.id,
        x: bounds.minX - padding,
        y: bounds.minY - padding - 24,
        width: bounds.maxX - bounds.minX + padding * 2,
        height: bounds.maxY - bounds.minY + padding * 2 + 24,
        shape: 'rect',
        zIndex: -1,
        attrs: {
          body: {
            fill: '#fafafa',
            fillOpacity: 0.5,
            stroke: '#fa8c16',
            strokeWidth: 1.5,
            strokeDasharray: '6 3',
            rx: 8,
            ry: 8,
            pointerEvents: 'stroke',
          },
          label: {
            text: groupLabel,
            fontSize: 11,
            fill: '#fa8c16',
            fontWeight: 'bold',
            textAnchor: 'left',
            textVerticalAnchor: 'top',
            refX: 12,
            refY: 8,
            pointerEvents: 'none',
          },
        },
        data: {
          isGroup: true,
          label: group.label,
          memberNodeIds: group.memberNodeIds,
          detached: false,
        },
      })
    }

    this.bindGroupTracking()
  }

  private getNodesBounds(nodes: unknown[]): { minX: number; minY: number; maxX: number; maxY: number } {
    let minX = Infinity
    let minY = Infinity
    let maxX = -Infinity
    let maxY = -Infinity

    for (const node of nodes) {
      const n = node as { getPosition: () => { x: number; y: number }; getSize: () => { width: number; height: number } }
      const pos = n.getPosition()
      const size = n.getSize()
      minX = Math.min(minX, pos.x)
      minY = Math.min(minY, pos.y)
      maxX = Math.max(maxX, pos.x + size.width)
      maxY = Math.max(maxY, pos.y + size.height)
    }

    return { minX, minY, maxX, maxY }
  }

  private bindGroupTracking(): void {
    if (!this.graph) return

    let isUpdatingGroup = false

    this.graph.on('node:moved', ({ node }: { node: { id: string; getData: () => Record<string, unknown> | undefined; attr: (path: string, value?: unknown) => unknown } }) => {
      if (isUpdatingGroup) return
      const data = node.getData()
      if (data?.isForkNode) return
      if (data?.isGroup) {
        this.restoreGroupVisibility(node)
        return
      }
      isUpdatingGroup = true
      this.updateGroupBoundsForMember(node.id)
      this.updateForkNodePositions()
      isUpdatingGroup = false
    })

    this.graph.on('node:change:position', ({ node }: { node: { id: string; getData: () => Record<string, unknown> | undefined; attr: (path: string, value?: unknown) => unknown } }) => {
      if (isUpdatingGroup) return
      const data = node.getData()
      if (data?.isForkNode) return
      if (data?.isGroup) {
        this.restoreGroupVisibility(node)
        return
      }
      isUpdatingGroup = true
      this.updateGroupBoundsForMember(node.id)
      this.updateForkNodePositions()
      isUpdatingGroup = false
    })
  }

  private restoreGroupVisibility(node: { getData: () => Record<string, unknown> | undefined; attr: (path: string, value?: unknown) => unknown }): void {
    const data = node.getData()
    if (!data?.isGroup) return
    if (data.hidden) {
      node.attr('root/pointerEvents', 'none')
      node.attr('body/stroke', 'transparent')
      node.attr('body/fill', 'transparent')
      node.attr('body/fillOpacity', 0)
      node.attr('body/strokeWidth', 0)
      node.attr('body/pointerEvents', 'none')
      node.attr('label/fill', 'transparent')
      node.attr('label/pointerEvents', 'none')
    } else {
      node.attr('root/pointerEvents', '')
      node.attr('body/stroke', data.detached ? '#999' : '#fa8c16')
      node.attr('body/fill', data.detached ? '#f5f5f5' : '#fafafa')
      node.attr('body/fillOpacity', 0.5)
      node.attr('body/strokeWidth', 1.5)
      node.attr('body/pointerEvents', 'stroke')
      node.attr('label/fill', data.detached ? '#999' : '#fa8c16')
      node.attr('label/pointerEvents', 'none')
    }
  }

  private convertAutoGroupNodes(
    autoGroupInfoMap: Map<string, { memberNodeIds: string[] }>,
    isChinese: boolean,
  ): void {
    if (!this.graph) return

    this.graph.startBatch('autoGroup')

    for (const [nodeId, info] of autoGroupInfoMap) {
      const cell = this.graph.getCellById(nodeId)
      if (!cell || !cell.isNode()) continue

      const edgesToRemove: unknown[] = []
      const forkNodeIdsToRemove = new Set<string>()

      for (const edge of this.graph.getEdges()) {
        const data = edge.getData() as Record<string, unknown> | undefined
        if (!data) continue

        if (data.relationType === 'containment' && !data.isTrunk && !data.isBranch && edge.getSourceCellId() === nodeId) {
          edgesToRemove.push(edge)
          continue
        }

        if (data.isTrunk && data.realSourceId === nodeId) {
          edgesToRemove.push(edge)
          forkNodeIdsToRemove.add(data.forkNodeId as string)
          continue
        }
      }

      for (const forkNodeId of forkNodeIdsToRemove) {
        for (const edge of this.graph.getEdges()) {
          const data = edge.getData() as Record<string, unknown> | undefined
          if (data?.isBranch && data.forkNodeId === forkNodeId) {
            if (!edgesToRemove.includes(edge)) {
              edgesToRemove.push(edge)
            }
          }
        }
      }

      for (const edge of edgesToRemove) {
        ;(edge as { remove: () => void }).remove()
      }

      for (const forkNodeId of forkNodeIdsToRemove) {
        const forkCell = this.graph.getCellById(forkNodeId)
        if (forkCell) forkCell.remove()
      }

      const memberNodes = info.memberNodeIds
        .map(id => this.graph!.getCellById(id))
        .filter(c => c && c.isNode())

      if (memberNodes.length === 0) continue

      const bounds = this.getNodesBounds(memberNodes)
      const padding = 20

      const nodeData = cell.getData() as Record<string, unknown>
      const groupLabel = isChinese
        ? ((nodeData?.chineseText as string) || (nodeData?.originalText as string) || '')
        : `${nodeData?.originalText || ''}\n${nodeData?.chineseText || ''}`

      const node = cell as unknown as {
        setPosition: (x: number, y: number) => void
        resize: (width: number, height: number) => void
        attr: (pathOrObj: string | Record<string, unknown>, value?: unknown) => void
        setData: (data: Record<string, unknown>) => void
        setZIndex: (z: number) => void
      }

      node.setPosition(bounds.minX - padding, bounds.minY - padding - 24)
      node.resize(
        bounds.maxX - bounds.minX + padding * 2,
        bounds.maxY - bounds.minY + padding * 2 + 24,
      )
      node.attr({
        body: {
          fill: '#fafafa',
          fillOpacity: 0.5,
          stroke: '#fa8c16',
          strokeWidth: 1.5,
          strokeDasharray: '6 3',
          rx: 8,
          ry: 8,
          pointerEvents: 'stroke',
        },
        label: {
          text: groupLabel,
          fontSize: 11,
          fill: '#fa8c16',
          fontWeight: 'bold',
          textAnchor: 'left',
          textVerticalAnchor: 'top',
          refX: 12,
          refY: 8,
          pointerEvents: 'none',
        },
      })
      node.setData({
        ...nodeData,
        isGroup: true,
        isAutoGroup: true,
        label: { original: nodeData?.originalText || '', chinese: nodeData?.chineseText || '' },
        memberNodeIds: info.memberNodeIds,
        detached: false,
      })
      node.setZIndex(-1)
    }

    this.updateGroupBoundsForMember('')

    this.graph.stopBatch('autoGroup')
  }

  private calculateForkPosition(sourceId: string, targetIds: string[]): { x: number; y: number } {
    if (!this.graph) return { x: 0, y: 0 }

    const sourceCell = this.graph.getCellById(sourceId)
    if (!sourceCell || !sourceCell.isNode()) return { x: 0, y: 0 }

    const sourceNode = sourceCell as unknown as {
      getPosition: () => { x: number; y: number }
      getSize: () => { width: number; height: number }
    }
    const sourcePos = sourceNode.getPosition()
    const sourceSize = sourceNode.getSize()
    const sourceCenterX = sourcePos.x + sourceSize.width / 2
    const sourceCenterY = sourcePos.y + sourceSize.height / 2

    let targetCenterSumX = 0
    let targetCenterSumY = 0
    let targetCount = 0

    for (const targetId of targetIds) {
      const targetCell = this.graph.getCellById(targetId)
      if (!targetCell || !targetCell.isNode()) continue

      const targetNode = targetCell as unknown as {
        getPosition: () => { x: number; y: number }
        getSize: () => { width: number; height: number }
      }
      const targetPos = targetNode.getPosition()
      const targetSize = targetNode.getSize()
      targetCenterSumX += targetPos.x + targetSize.width / 2
      targetCenterSumY += targetPos.y + targetSize.height / 2
      targetCount++
    }

    if (targetCount === 0) return { x: sourceCenterX, y: sourceCenterY }

    const targetCenterX = targetCenterSumX / targetCount
    const targetCenterY = targetCenterSumY / targetCount

    const forkX = sourceCenterX + 0.8 * (targetCenterX - sourceCenterX)
    const forkY = sourceCenterY + 0.8 * (targetCenterY - sourceCenterY)

    return { x: forkX, y: forkY }
  }

  private updateForkNodePositions(): void {
    if (!this.graph) return

    const forkNodes = this.graph.getNodes().filter(n => {
      const data = n.getData() as Record<string, unknown> | undefined
      return data?.isForkNode
    })

    for (const forkNode of forkNodes) {
      const data = forkNode.getData() as Record<string, unknown>
      const sourceId = data.sourceId as string
      const targetIds = data.targetIds as string[]

      const newPos = this.calculateForkPosition(sourceId, targetIds)
      const fn = forkNode as unknown as { setPosition: (x: number, y: number) => void }
      fn.setPosition(newPos.x, newPos.y)
    }
  }

  updateGroupBoundsForMember(nodeId: string): void {
    if (!this.graph) return

    const groups = this.graph.getNodes().filter(n => {
      const data = n.getData() as Record<string, unknown> | undefined
      return data?.isGroup && !data?.detached
    })

    for (const groupNode of groups) {
      const data = groupNode.getData() as Record<string, unknown>
      const memberIds = (data?.memberNodeIds as string[]) || []
      if (nodeId && !memberIds.includes(nodeId)) continue

      const memberNodes = memberIds
        .map(id => this.graph!.getCellById(id))
        .filter(cell => cell && cell.isNode())

      if (memberNodes.length === 0) continue

      const bounds = this.getNodesBounds(memberNodes)
      const padding = 20

      const g = groupNode as unknown as {
        setPosition: (x: number, y: number) => void
        resize: (width: number, height: number) => void
      }
      g.setPosition(bounds.minX - padding, bounds.minY - padding - 24)
      g.resize(
        bounds.maxX - bounds.minX + padding * 2,
        bounds.maxY - bounds.minY + padding * 2 + 24
      )
    }
  }

  toggleGroupDetached(groupId: string): boolean {
    if (!this.graph) return false
    const cell = this.graph.getCellById(groupId)
    if (!cell || !cell.isNode()) return false

    const data = (cell.getData() as Record<string, unknown>) || {}
    if (!data.isGroup) return false

    this.graph.startBatch('groupDetach')
    const newDetached = !(data.detached as boolean)
    const n = cell as unknown as {
      setData: (data: Record<string, unknown>) => void
      attr: (path: string, value?: unknown) => unknown
    }
    n.setData({ ...data, detached: newDetached })

    n.attr('body/strokeDasharray', newDetached ? '3 3' : '6 3')
    n.attr('body/stroke', newDetached ? '#999' : '#fa8c16')
    n.attr('body/fill', newDetached ? '#f5f5f5' : '#fafafa')

    if (!newDetached) {
      this.updateGroupBoundsForMember('')
    }
    this.graph.stopBatch('groupDetach')

    return newDetached
  }

  isGroupDetached(groupId: string): boolean {
    if (!this.graph) return false
    const cell = this.graph.getCellById(groupId)
    if (!cell || !cell.isNode()) return false
    const data = (cell.getData() as Record<string, unknown>) || {}
    return !!(data.detached as boolean)
  }

  toggleGroupsVisible(visible: boolean): void {
    if (!this.graph) return
    this.graph.startBatch('groupsVisible')
    const nodes = this.graph.getNodes()
    for (const node of nodes) {
      const data = (node.getData() as Record<string, unknown>) || {}
      if (data.isGroup) {
        const n = node as unknown as { attr: (path: string, value?: unknown) => unknown; setData: (data: Record<string, unknown>) => void }
        n.setData({ ...data, hidden: !visible })
        if (visible) {
          n.attr('root/pointerEvents', '')
          n.attr('body/stroke', data.detached ? '#999' : '#fa8c16')
          n.attr('body/fill', data.detached ? '#f5f5f5' : '#fafafa')
          n.attr('body/fillOpacity', 0.5)
          n.attr('body/strokeWidth', 1.5)
          n.attr('body/pointerEvents', 'stroke')
          n.attr('label/fill', data.detached ? '#999' : '#fa8c16')
          n.attr('label/pointerEvents', 'none')
        } else {
          n.attr('root/pointerEvents', 'none')
          n.attr('body/stroke', 'transparent')
          n.attr('body/fill', 'transparent')
          n.attr('body/fillOpacity', 0)
          n.attr('body/strokeWidth', 0)
          n.attr('body/pointerEvents', 'none')
          n.attr('label/fill', 'transparent')
          n.attr('label/pointerEvents', 'none')
        }
      }
    }
    this.graph.stopBatch('groupsVisible')
  }

  rebindGroupTracking(): void {
    this.bindGroupTracking()
  }

  private highlightedEdgeId: string | null = null
  private highlightedNodeIds: string[] = []
  private highlightedBranchEdgeIds: string[] = []

  highlightEdge(edgeId: string): void {
    this.clearHighlight()
    if (!this.graph) return

    const cell = this.graph.getCellById(edgeId)
    if (!cell || !cell.isEdge()) return

    this.highlightedEdgeId = edgeId

    const edge = cell as unknown as {
      attr: (pathOrObj: string | Record<string, unknown>, value?: unknown) => void
      getSourceCellId: () => string | null
      getTargetCellId: () => string | null
      getData: () => Record<string, unknown> | undefined
    }

    edge.attr('line/strokeWidth', 6)
    edge.attr('line/stroke', '#e63946')

    const data = edge.getData()
    const isTrunk = data?.isTrunk as boolean | undefined

    const sourceId = edge.getSourceCellId()
    const targetId = edge.getTargetCellId()

    const nodeIdsToHighlight: string[] = []

    if (isTrunk && data) {
      const forkNodeId = data.forkNodeId as string
      const realSourceId = data.realSourceId as string
      nodeIdsToHighlight.push(realSourceId)

      const branchEdges = this.graph!.getEdges().filter(e => {
        const bd = e.getData() as Record<string, unknown> | undefined
        return bd?.isBranch && bd.forkNodeId === forkNodeId
      })

      for (const branchEdge of branchEdges) {
        const bd = branchEdge.getData() as Record<string, unknown> | undefined
        const realTargetId = bd?.realTargetId as string | undefined
        if (realTargetId) {
          nodeIdsToHighlight.push(realTargetId)
        }
        const be = branchEdge as unknown as { attr: (pathOrObj: string | Record<string, unknown>, value?: unknown) => void }
        be.attr('line/strokeWidth', 6)
        be.attr('line/stroke', '#e63946')
        this.highlightedBranchEdgeIds.push(branchEdge.id)
      }
    } else {
      if (sourceId) nodeIdsToHighlight.push(sourceId)
      if (targetId) nodeIdsToHighlight.push(targetId)
    }

    for (const nodeId of nodeIdsToHighlight) {
      if (!nodeId) continue
      const nodeCell = this.graph!.getCellById(nodeId)
      if (!nodeCell || !nodeCell.isNode()) continue
      const n = nodeCell as unknown as { attr: (path: string, value?: unknown) => void }
      n.attr('body/strokeWidth', 4)
      n.attr('body/stroke', '#e63946')
      this.highlightedNodeIds.push(nodeId)
    }
  }

  clearHighlight(): void {
    if (!this.graph) return
    if (!this.highlightedEdgeId && this.highlightedNodeIds.length === 0) return

    if (this.highlightedEdgeId) {
      const edgeId = this.highlightedEdgeId
      this.highlightedEdgeId = null

      const cell = this.graph.getCellById(edgeId)
      if (cell && cell.isEdge()) {
        const edge = cell as unknown as {
          attr: (pathOrObj: string | Record<string, unknown>, value?: unknown) => void
          getData: () => Record<string, unknown> | undefined
        }

        const data = edge.getData()
        const relationType = data?.relationType as string | undefined
        const defaultStyle = relationType ? getDefaultEdgeStyle(relationType) : null
        const customStyle = data?.style as Record<string, unknown> | undefined
        const stroke = (customStyle?.stroke as string) ?? defaultStyle?.stroke ?? '#333333'
        const strokeWidth = (customStyle?.strokeWidth as number) ?? defaultStyle?.strokeWidth ?? 2
        const strokeDasharray = (customStyle?.strokeDasharray as string) ?? defaultStyle?.strokeDasharray ?? ''
        edge.attr('line/strokeWidth', strokeWidth)
        edge.attr('line/stroke', stroke)
        edge.attr('line/strokeDasharray', strokeDasharray)
      }
    }

    for (const branchEdgeId of this.highlightedBranchEdgeIds) {
      const branchCell = this.graph.getCellById(branchEdgeId)
      if (branchCell && branchCell.isEdge()) {
        const be = branchCell as unknown as {
          attr: (pathOrObj: string | Record<string, unknown>, value?: unknown) => void
          getData: () => Record<string, unknown> | undefined
        }
        const bd = be.getData()
        const bRelationType = bd?.relationType as string | undefined
        const bDefaultStyle = bRelationType ? getDefaultEdgeStyle(bRelationType) : null
        const bCustomStyle = bd?.style as Record<string, unknown> | undefined
        const bStroke = (bCustomStyle?.stroke as string) ?? bDefaultStyle?.stroke ?? '#333333'
        const bStrokeWidth = (bCustomStyle?.strokeWidth as number) ?? bDefaultStyle?.strokeWidth ?? 2
        const bStrokeDasharray = (bCustomStyle?.strokeDasharray as string) ?? bDefaultStyle?.strokeDasharray ?? ''
        be.attr('line/strokeWidth', bStrokeWidth)
        be.attr('line/stroke', bStroke)
        be.attr('line/strokeDasharray', bStrokeDasharray)
      }
    }
    this.highlightedBranchEdgeIds = []

    for (const nodeId of this.highlightedNodeIds) {
      if (!nodeId) continue
      const nodeCell = this.graph.getCellById(nodeId)
      if (!nodeCell || !nodeCell.isNode()) continue
      const nodeData = nodeCell.getData() as Record<string, unknown> | undefined
      const nodeStyle = nodeData?.style as Record<string, unknown> | undefined
      const n = nodeCell as unknown as { attr: (path: string, value?: unknown) => void }
      n.attr('body/strokeWidth', (nodeStyle?.strokeWidth as number) ?? 1.5)
      n.attr('body/stroke', (nodeStyle?.stroke as string) ?? '#333333')
    }
    this.highlightedNodeIds = []
  }

  addNode(data: NodeData): string {
    if (!this.graph) throw new Error('画布未初始化')
    const config = buildNode(data)
    this.graph.addNode(config)
    return data.id
  }

  addGroup(id: string, label: string, x: number, y: number, width: number = 300, height: number = 200): string {
    if (!this.graph) throw new Error('画布未初始化')
    this.graph.addNode({
      id,
      x,
      y,
      width,
      height,
      shape: 'rect',
      zIndex: -1,
      attrs: {
        body: {
          fill: '#fafafa',
          fillOpacity: 0.5,
          stroke: '#fa8c16',
          strokeWidth: 1.5,
          strokeDasharray: '6 3',
          rx: 8,
          ry: 8,
          pointerEvents: 'stroke',
        },
        label: {
          text: label,
          fontSize: 11,
          fill: '#fa8c16',
          fontWeight: 'bold',
          textAnchor: 'left',
          textVerticalAnchor: 'top',
          refX: 12,
          refY: 8,
          pointerEvents: 'none',
        },
      },
      data: {
        isGroup: true,
        label: { original: label, chinese: '' },
        memberNodeIds: [],
        detached: false,
      },
    })
    return id
  }

  removeNode(id: string): void {
    this.graph?.getCellById(id)?.remove()
  }

  removeNodeWithOption(id: string, removeEdges: boolean = true): void {
    if (!this.graph) return
    const cell = this.graph.getCellById(id)
    if (!cell || !cell.isNode()) return

    if (removeEdges) {
      const edges = this.graph.getConnectedEdges(cell)
      edges.forEach(edge => edge.remove())
    }

    cell.remove()
  }

  getConnectedEdgeIds(nodeId: string): string[] {
    if (!this.graph) return []
    const cell = this.graph.getCellById(nodeId)
    if (!cell || !cell.isNode()) return []
    
    const edges = this.graph.getConnectedEdges(cell)
    return edges.map(e => e.id)
  }

  updateNodeStyle(id: string, style: Partial<NodeData['style']>): void {
    if (!this.graph) return
    const cell = this.graph.getCellById(id)
    if (cell && cell.isNode()) {
      this.graph.startBatch('nodeStyle')
      updateNodeStyle(cell, style)
      this.graph.stopBatch('nodeStyle')
    }
  }

  addEdge(data: EdgeData): string {
    if (!this.graph) throw new Error('画布未初始化')
    const config = buildEdge(data)
    this.graph.addEdge(config)
    return data.id
  }

  removeEdge(id: string): void {
    this.graph?.getCellById(id)?.remove()
  }

  updateEdgeStyle(id: string, style: Partial<EdgeData['style']>): void {
    if (!this.graph) return
    const cell = this.graph.getCellById(id)
    if (cell && cell.isEdge()) {
      this.graph.startBatch('edgeStyle')
      updateEdgeStyle(cell, style)
      this.graph.stopBatch('edgeStyle')
    }
  }

  toggleEdgeLabelDetached(edgeId: string): boolean {
    if (!this.graph) return false
    const cell = this.graph.getCellById(edgeId)
    if (!cell || !cell.isEdge()) return false

    const edge = cell as unknown as {
      getData: () => Record<string, unknown> | undefined
      setData: (data: Record<string, unknown>) => void
      getLabels: () => unknown[]
      setLabels: (labels: unknown[]) => void
    }

    this.graph.startBatch('labelDetach')
    const data = edge.getData() || {}
    const isDetached = !(data.labelDetached as boolean)
    
    edge.setData({ ...data, labelDetached: isDetached })

    const labels = edge.getLabels()
    if (labels.length > 0) {
      const label = labels[0] as Record<string, unknown>
      const existingAttrs = (label.attrs || {}) as Record<string, unknown>
      const existingBg = (existingAttrs.bg || {}) as Record<string, unknown>
      const existingLabelText = (existingAttrs.labelText || {}) as Record<string, unknown>
      
      const existingPosition = label.position as Record<string, unknown> | undefined
      const newPosition = isDetached
        ? existingPosition
        : {
            ...(existingPosition || {}),
            offset: { x: 0, y: 0 },
          }

      edge.setLabels([{
        ...label,
        position: newPosition,
        attrs: {
          ...existingAttrs,
          bg: {
            ...existingBg,
            stroke: isDetached ? '#fa8c16' : 'none',
            strokeWidth: isDetached ? 2 : 0,
          },
          labelText: existingLabelText,
        },
      }])
    }
    this.graph.stopBatch('labelDetach')

    return isDetached
  }

  isEdgeLabelDetached(edgeId: string): boolean {
    if (!this.graph) return false
    const cell = this.graph.getCellById(edgeId)
    if (!cell || !cell.isEdge()) return false

    const edge = cell as unknown as {
      getData: () => Record<string, unknown> | undefined
    }
    const data = edge.getData()
    return !!(data?.labelDetached as boolean)
  }

  bringForward(id: string): void {
    if (!this.graph) return
    const cell = this.graph.getCellById(id)
    if (cell) {
      this.graph.startBatch('zIndex')
      const z = cell.getZIndex() ?? 0
      cell.setZIndex(z + 1)
      this.graph.stopBatch('zIndex')
    }
  }

  sendBackward(id: string): void {
    if (!this.graph) return
    const cell = this.graph.getCellById(id)
    if (cell) {
      this.graph.startBatch('zIndex')
      const z = cell.getZIndex() ?? 0
      cell.setZIndex(z - 1)
      this.graph.stopBatch('zIndex')
    }
  }

  bringToFront(id: string): void {
    if (!this.graph) return
    const cells = this.graph.getCells()
    let maxZ = 0
    for (const c of cells) {
      const z = c.getZIndex() ?? 0
      if (z > maxZ) maxZ = z
    }
    const cell = this.graph.getCellById(id)
    if (cell) {
      this.graph.startBatch('zIndex')
      cell.setZIndex(maxZ + 1)
      this.graph.stopBatch('zIndex')
    }
  }

  sendToBack(id: string): void {
    if (!this.graph) return
    const cells = this.graph.getCells()
    let minZ = 0
    for (const c of cells) {
      const z = c.getZIndex() ?? 0
      if (z < minZ) minZ = z
    }
    const cell = this.graph.getCellById(id)
    if (cell) {
      this.graph.startBatch('zIndex')
      cell.setZIndex(minZ - 1)
      this.graph.stopBatch('zIndex')
    }
  }

  setAllNodeFontSize(fontSize: number): void {
    if (!this.graph) return
    this.graph.startBatch('fontSize')
    const nodes = this.graph.getNodes()
    for (const node of nodes) {
      const data = node.getData() as Record<string, unknown> | undefined
      if (data?.isForkNode || data?.isGroup) continue
      const n = node as unknown as { attr: (path: string, value?: unknown) => unknown }
      n.attr('label/fontSize', fontSize)
    }
    this.graph.stopBatch('fontSize')
  }

  setAllEdgeFontSize(fontSize: number): void {
    if (!this.graph) return
    this.graph.startBatch('fontSize')
    const edges = this.graph.getEdges()
    for (const edge of edges) {
      const e = edge as { getLabels: () => unknown[]; setLabels: (labels: unknown[]) => void }
      const labels = e.getLabels()
      if (labels.length > 0) {
        const firstLabel = labels[0] as Record<string, unknown>
        const existingAttrs = (firstLabel.attrs || {}) as Record<string, unknown>
        const existingBg = (existingAttrs.bg || {}) as Record<string, unknown>
        const existingLabelText = (existingAttrs.labelText || {}) as Record<string, unknown>
        const newLabel = {
          ...firstLabel,
          attrs: {
            ...existingAttrs,
            bg: existingBg,
            labelText: {
              ...existingLabelText,
              fontSize,
            },
          },
        }
        e.setLabels([newLabel])
      }
    }
    this.graph.stopBatch('fontSize')
  }

  async applyLayout(options?: ElkLayoutOptions): Promise<void> {
    if (!this.graph) return

    const nodes = this.graph.getNodes()
    const edges = this.graph.getEdges()

    const realNodes = nodes.filter(n => {
      const data = n.getData() as Record<string, unknown>
      return !data?.isForkNode && !data?.isGroup
    })

    const nodeDataList: NodeData[] = realNodes.map(n => {
      const data = n.getData() as Record<string, unknown>
      const size = n.getSize()
      return {
        id: n.id,
        originalText: (data?.originalText as string) || '',
        chineseText: (data?.chineseText as string) || '',
        nodeType: (data?.nodeType as NodeData['nodeType']) || 'component',
        hierarchyLevel: (data?.hierarchyLevel as number) ?? 0,
        style: { width: size.width, height: size.height } as NodeData['style'],
      }
    })

    const edgeDataList: EdgeData[] = []
    for (const e of edges) {
      const data = e.getData() as Record<string, unknown>

      if (data?.isBranch) continue

      if (data?.isTrunk) {
        const sourceId = data.realSourceId as string
        const forkNodeId = data.forkNodeId as string
        const branchEdges = edges.filter(be => {
          const bd = be.getData() as Record<string, unknown>
          return bd?.isBranch && bd.forkNodeId === forkNodeId
        })
        for (const be of branchEdges) {
          const bd = be.getData() as Record<string, unknown>
          edgeDataList.push({
            id: (bd.originalEdgeId as string) || be.id,
            source: sourceId,
            target: (bd.realTargetId as string) || '',
            originalText: (data.originalText as string) || '',
            chineseText: (data.chineseText as string) || '',
            relationType: (data.relationType as EdgeData['relationType']) || 'position',
            style: {} as EdgeData['style'],
          })
        }
        continue
      }

      edgeDataList.push({
        id: e.id,
        source: (e.getSourceCellId() as string) || '',
        target: (e.getTargetCellId() as string) || '',
        originalText: (data?.originalText as string) || '',
        chineseText: (data?.chineseText as string) || '',
        relationType: (data?.relationType as EdgeData['relationType']) || 'position',
        style: {} as EdgeData['style'],
      })
    }

    const groupNodeIds = new Set(
      nodes.filter(n => {
        const data = n.getData() as Record<string, unknown>
        return !!data?.isGroup
      }).map(n => n.id)
    )

    const filteredEdgeDataList = edgeDataList.filter(e =>
      e.source && e.target && !groupNodeIds.has(e.source) && !groupNodeIds.has(e.target)
    )

    const positions = await applyElkLayout(nodeDataList, filteredEdgeDataList, options)

    this.graph.startBatch('layout')
    for (const node of realNodes) {
      const pos = positions.get(node.id)
      if (pos) {
        node.setPosition(pos.x, pos.y)
      }
    }
    this.updateForkNodePositions()
    this.updateGroupBoundsForMember('')
    this.graph.stopBatch('layout')
  }

  fitView(): void {
    this.graph?.zoomToFit({ padding: 40, maxScale: 1.5 })
  }

  zoomTo(scale: number): void {
    this.graph?.zoomTo(scale)
  }

  zoomIn(): void {
    this.graph?.zoom(0.1)
  }

  zoomOut(): void {
    this.graph?.zoom(-0.1)
  }

  centerContent(): void {
    this.graph?.centerContent()
  }

  getSelectedNodeIds(): string[] {
    if (!this.graph) return []
    return this.graph.getCells().filter(c => c.isNode() && this.graph!.isSelected(c)).map(c => c.id)
  }

  getSelectedEdgeIds(): string[] {
    if (!this.graph) return []
    return this.graph.getCells().filter(c => c.isEdge() && this.graph!.isSelected(c)).map(c => c.id)
  }

  selectAll(): void {
    this.graph?.getCells().forEach(c => {
      if (c.isNode()) {
        const data = c.getData() as Record<string, unknown> | undefined
        if (data?.isForkNode || data?.isGroup) return
      }
      this.graph!.select(c)
    })
  }

  clearSelection(): void {
    this.graph?.getCells().forEach(c => this.graph!.unselect(c))
  }

  undo(): void {
    this.graph?.undo()
  }

  redo(): void {
    this.graph?.redo()
  }

  canUndo(): boolean {
    return this.graph?.canUndo() ?? false
  }

  canRedo(): boolean {
    return this.graph?.canRedo() ?? false
  }

  on(event: string, handler: (...args: unknown[]) => void): void {
    this.graph?.on(event, handler as (...args: never[]) => void)
  }

  off(event: string, handler: (...args: unknown[]) => void): void {
    this.graph?.off(event, handler as (...args: never[]) => void)
  }

  async toPNG(options?: { padding?: number; backgroundColor?: string; scale?: number }): Promise<Blob | null> {
    if (!this.graph) return null

    const padding = options?.padding ?? 40
    const backgroundColor = options?.backgroundColor ?? '#ffffff'
    const scale = options?.scale ?? 3

    return new Promise<Blob | null>((resolve) => {
      this.graph!.toPNG((dataUrl: string) => {
        try {
          const byteString = atob(dataUrl.split(',')[1])
          const mimeString = dataUrl.split(',')[0].split(':')[1].split(';')[0]
          const ab = new ArrayBuffer(byteString.length)
          const ia = new Uint8Array(ab)
          for (let i = 0; i < byteString.length; i++) {
            ia[i] = byteString.charCodeAt(i)
          }
          resolve(new Blob([ab], { type: mimeString }))
        } catch (err) {
          console.error('PNG 导出失败:', err)
          resolve(null)
        }
      }, {
        padding,
        backgroundColor,
        quality: 1,
        ratio: String(scale),
      })
    })
  }

  toSVG(_options?: { padding?: number }): string {
    if (!this.graph) return ''

    const padding = _options?.padding ?? 40
    const contentArea = this.graph.getContentArea()
    const contentBBox = contentArea.x !== undefined ? contentArea : null

    let svgStr = ''
    this.graph.toSVG((svg: string) => {
      if (contentBBox && (contentBBox as { x: number }).x !== undefined) {
        const bbox = contentBBox as { x: number; y: number; width: number; height: number }
        const svgWidth = bbox.width + padding * 2
        const svgHeight = bbox.height + padding * 2
        const viewBox = `${bbox.x - padding} ${bbox.y - padding} ${svgWidth} ${svgHeight}`
        svgStr = svg.replace(
          /<svg([^>]*)>/,
          (_, attrs: string) => {
            const cleaned = attrs
              .replace(/\s*viewBox\s*=\s*["'][^"']*["']/g, '')
              .replace(/\s*width\s*=\s*["'][^"']*["']/g, '')
              .replace(/\s*height\s*=\s*["'][^"']*["']/g, '')
            return `<svg${cleaned} viewBox="${viewBox}" width="${svgWidth}" height="${svgHeight}">`
          }
        )
      } else {
        svgStr = svg
      }
    })
    return svgStr
  }

  toJSON(): Record<string, unknown> {
    return this.graph?.toJSON() ?? {}
  }

  fromJSON(json: Record<string, unknown>): void {
    this.graph?.fromJSON(json)
  }

  getZoom(): number {
    return this.graph?.zoom() ?? 1
  }

  resetToInitial(): boolean {
    if (!this.graph || !this.initialGraphJSON) return false
    try {
      this.graph.fromJSON(this.initialGraphJSON)
      setTimeout(() => this.fitView(), 100)
      return true
    } catch {
      return false
    }
  }

  hasInitialState(): boolean {
    return this.initialGraphJSON !== null
  }
}

export const graphEngine = new GraphEngine()
