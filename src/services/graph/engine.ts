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
import { buildEdge, updateEdgeStyle } from './edge-builder'
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
        router: { name: 'orth' },
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
        validateConnection({ targetMagnet }) {
          return !!targetMagnet
        },
      },
      interacting: {
        edgeMovable: true,
        edgeLabelMovable: true,
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

    this.graph.use(new Selection({ enabled: true, rubberband: true, showNodeSelectionBox: true, modifiers: [] }))
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

    this.bindEdgeLabelConstraint()
  }

  private bindEdgeLabelConstraint(): void {
    if (!this.graph) return

    let isConstraining = false

    const constrainLabelPosition = (edge: {
      getData: () => Record<string, unknown> | undefined
      getLabels: () => unknown[]
      prop: (path: string, value: unknown) => void
    }) => {
      if (isConstraining) return

      const data = edge.getData()
      if (data?.labelDetached) return

      const labels = edge.getLabels()
      if (labels.length === 0) return

      const label = labels[0] as Record<string, unknown>
      const position = label.position as { distance?: number; offset?: { x: number; y: number } } | undefined

      if (!position) return

      const hasOffset = position.offset && (position.offset.x !== 0 || position.offset.y !== 0)
      const distanceOutOfRange = typeof position.distance === 'number' && (position.distance < 0 || position.distance > 1)
      const noDistance = typeof position.distance !== 'number'

      if (hasOffset || distanceOutOfRange || noDistance) {
        isConstraining = true
        const distance = typeof position.distance === 'number'
          ? Math.max(0, Math.min(1, position.distance))
          : 0.5
        edge.prop('labels/0/position', {
          distance,
          offset: { x: 0, y: 0 },
        })
        isConstraining = false
      }
    }

    this.graph.on('edge:label:drag:end', ({ edge }: { edge: Record<string, unknown> }) => {
      constrainLabelPosition(edge as unknown as Parameters<typeof constrainLabelPosition>[0])
    })

    this.graph.on('edge:change:labels', ({ edge }: { edge: Record<string, unknown> }) => {
      constrainLabelPosition(edge as unknown as Parameters<typeof constrainLabelPosition>[0])
    })
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

    for (const edgeData of edgeDataList) {
      const config = buildEdge(edgeData, isChinese)
      this.graph.addEdge(config)
    }
    timingEnd(`    │    添加节点和边`)

    if (result.groups && result.groups.length > 0) {
      timingStart(`    │    渲染分组`)
      this.renderGroups(result.groups, isChinese)
      timingEnd(`    │    渲染分组`)
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

    this.graph.on('node:moved', ({ node }: { node: { id: string; getData: () => Record<string, unknown> | undefined } }) => {
      if (isUpdatingGroup) return
      const data = node.getData()
      if (data?.isGroup) return
      isUpdatingGroup = true
      this.updateGroupBoundsForMember(node.id)
      isUpdatingGroup = false
    })

    this.graph.on('node:change:position', ({ node }: { node: { id: string; getData: () => Record<string, unknown> | undefined } }) => {
      if (isUpdatingGroup) return
      const data = node.getData()
      if (data?.isGroup) return
      isUpdatingGroup = true
      this.updateGroupBoundsForMember(node.id)
      isUpdatingGroup = false
    })
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
    const nodes = this.graph.getNodes()
    for (const node of nodes) {
      const data = (node.getData() as Record<string, unknown>) || {}
      if (data.isGroup) {
        const n = node as unknown as { attr: (path: string, value?: unknown) => unknown }
        if (visible) {
          n.attr('body/stroke', data.detached ? '#999' : '#fa8c16')
          n.attr('body/fill', data.detached ? '#f5f5f5' : '#fafafa')
          n.attr('body/fillOpacity', 0.5)
          n.attr('label/fill', data.detached ? '#999' : '#fa8c16')
          n.attr('body/strokeWidth', 1.5)
        } else {
          n.attr('body/stroke', 'transparent')
          n.attr('body/fill', 'transparent')
          n.attr('body/fillOpacity', 0)
          n.attr('label/fill', 'transparent')
          n.attr('body/strokeWidth', 0)
        }
      }
    }
  }

  rebindGroupTracking(): void {
    this.bindGroupTracking()
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
      updateNodeStyle(cell, style)
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
      updateEdgeStyle(cell, style)
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

    const data = edge.getData() || {}
    const isDetached = !(data.labelDetached as boolean)
    
    edge.setData({ ...data, labelDetached: isDetached })

    const labels = edge.getLabels()
    if (labels.length > 0) {
      const label = labels[0] as Record<string, unknown>
      const existingAttrs = (label.attrs || {}) as Record<string, unknown>
      const existingBg = (existingAttrs.bg || {}) as Record<string, unknown>
      const existingLabelText = (existingAttrs.labelText || {}) as Record<string, unknown>
      
      edge.setLabels([{
        ...label,
        attrs: {
          bg: {
            ...existingBg,
            stroke: isDetached ? '#fa8c16' : '#d9d9d9',
            strokeWidth: isDetached ? 2 : 1,
          },
          labelText: existingLabelText,
        },
      }])
    }

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
      const z = cell.getZIndex() ?? 0
      cell.setZIndex(z + 1)
    }
  }

  sendBackward(id: string): void {
    if (!this.graph) return
    const cell = this.graph.getCellById(id)
    if (cell) {
      const z = cell.getZIndex() ?? 0
      cell.setZIndex(z - 1)
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
      cell.setZIndex(maxZ + 1)
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
      cell.setZIndex(minZ - 1)
    }
  }

  setAllNodeFontSize(fontSize: number): void {
    if (!this.graph) return
    this.graph.startBatch('fontSize')
    const nodes = this.graph.getNodes()
    for (const node of nodes) {
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

    const nodeDataList: NodeData[] = nodes.map(n => {
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

    const edgeDataList: EdgeData[] = edges.map(e => {
      const data = e.getData() as Record<string, unknown>
      return {
        id: e.id,
        source: (e.getSourceCellId() as string) || '',
        target: (e.getTargetCellId() as string) || '',
        originalText: (data?.originalText as string) || '',
        chineseText: (data?.chineseText as string) || '',
        relationType: (data?.relationType as EdgeData['relationType']) || 'position',
        style: {} as EdgeData['style'],
      }
    }).filter(e => e.source && e.target)

    const positions = await applyElkLayout(nodeDataList, edgeDataList, options)

    this.graph.startBatch('layout')
    for (const node of nodes) {
      const pos = positions.get(node.id)
      if (pos) {
        node.setPosition(pos.x, pos.y)
      }
    }
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
    this.graph?.getCells().forEach(c => this.graph!.select(c))
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
