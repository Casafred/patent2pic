import { Graph } from '@antv/x6'
import { Selection } from '@antv/x6-plugin-selection'
import { Snapline } from '@antv/x6-plugin-snapline'
import { History } from '@antv/x6-plugin-history'
import { Clipboard } from '@antv/x6-plugin-clipboard'
import { MiniMap } from '@antv/x6-plugin-minimap'
import type { NodeData, EdgeData } from '@/types/graph'
import type { ExtractResult, ExtractGroup } from '@/types/ai'
import { buildNode, updateNodeStyle } from './node-builder'
import { buildEdge, updateEdgeStyle } from './edge-builder'
import { applyDagreLayout, type DagreLayoutOptions } from './layout'
import { getDefaultNodeStyle, getDefaultEdgeStyle } from './style-registry'

export class GraphEngine {
  private graph: Graph | null = null

  init(container: HTMLElement): void {
    this.graph = new Graph({
      container,
      autoResize: true,
      background: { color: '#f5f7fa' },
      grid: {
        visible: true,
        type: 'dot',
        args: { color: '#ddd', thickness: 1 },
      },
      panning: { enabled: true, eventTypes: ['leftMouseDown', 'mouseWheel'] },
      mousewheel: { enabled: true, zoomAtMousePosition: true, modifiers: null, minScale: 0.1, maxScale: 3 },
      connecting: {
        router: 'manhattan',
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
                strokeWidth: 1.5,
                targetMarker: { name: 'block', width: 12, height: 8 },
              },
            },
          })
        },
        validateConnection({ targetMagnet }) {
          return !!targetMagnet
        },
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

  batchBuild(result: ExtractResult, layoutOptions?: DagreLayoutOptions, isChinese: boolean = false): void {
    if (!this.graph) return

    this.graph.startBatch('build')

    this.graph.clearCells()

    const nodeDataList: NodeData[] = result.nodes.map(n => ({
      id: n.id,
      originalText: n.originalText,
      chineseText: n.chineseText,
      nodeType: n.nodeType,
      style: getDefaultNodeStyle(n.nodeType),
    }))

    const edgeDataList: EdgeData[] = result.edges.map(e => ({
      id: e.id,
      source: e.source,
      target: e.target,
      originalText: e.originalText,
      chineseText: e.chineseText,
      relationType: e.relationType,
      style: getDefaultEdgeStyle(e.relationType),
    }))

    const positions = applyDagreLayout(nodeDataList, edgeDataList, layoutOptions)
    for (const nodeData of nodeDataList) {
      const pos = positions.get(nodeData.id)
      if (pos) {
        nodeData.x = pos.x
        nodeData.y = pos.y
      }
    }

    for (const nodeData of nodeDataList) {
      const config = buildNode(nodeData, isChinese)
      this.graph.addNode(config)
    }

    for (const edgeData of edgeDataList) {
      const config = buildEdge(edgeData, isChinese)
      this.graph.addEdge(config)
    }

    if (result.groups && result.groups.length > 0) {
      this.renderGroups(result.groups, isChinese)
    }

    this.graph.stopBatch('build')

    setTimeout(() => this.fitView(), 100)
  }

  private renderGroups(groups: ExtractGroup[], isChinese: boolean = false): void {
    if (!this.graph) return

    for (const group of groups) {
      if (group.memberNodeIds.length === 0) continue

      const memberNodes = group.memberNodeIds
        .map(id => this.graph!.getCellById(id))
        .filter(cell => cell && cell.isNode())

      if (memberNodes.length === 0) continue

      let minX = Infinity
      let minY = Infinity
      let maxX = -Infinity
      let maxY = -Infinity

      for (const node of memberNodes) {
        const n = node as { getPosition: () => { x: number; y: number }; getSize: () => { width: number; height: number } }
        const pos = n.getPosition()
        const size = n.getSize()
        minX = Math.min(minX, pos.x)
        minY = Math.min(minY, pos.y)
        maxX = Math.max(maxX, pos.x + size.width)
        maxY = Math.max(maxY, pos.y + size.height)
      }

      const padding = 20
      const groupLabel = isChinese
        ? (group.label.chinese || group.label.original)
        : `${group.label.original}\n${group.label.chinese}`

      this.graph.addNode({
        id: group.id,
        x: minX - padding,
        y: minY - padding - 24,
        width: maxX - minX + padding * 2,
        height: maxY - minY + padding * 2 + 24,
        shape: 'rect',
        zIndex: -1,
        attrs: {
          body: {
            fill: '#fafafa',
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
        },
      })
    }
  }

  addNode(data: NodeData): string {
    if (!this.graph) throw new Error('画布未初始化')
    const config = buildNode(data)
    this.graph.addNode(config)
    return data.id
  }

  removeNode(id: string): void {
    this.graph?.getCellById(id)?.remove()
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

  applyLayout(options?: DagreLayoutOptions): void {
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

    const positions = applyDagreLayout(nodeDataList, edgeDataList, options)

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

  async toPNG(options?: { padding?: number; backgroundColor?: string }): Promise<Blob | null> {
    if (!this.graph) return null

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
        padding: options?.padding ?? 20,
        backgroundColor: options?.backgroundColor ?? '#ffffff',
      })
    })
  }

  toSVG(options?: { padding?: number }): string {
    if (!this.graph) return ''

    let svgStr = ''
    this.graph.toSVG((svg: string) => {
      svgStr = svg
    }, {
      padding: options?.padding ?? 20,
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
}

export const graphEngine = new GraphEngine()
