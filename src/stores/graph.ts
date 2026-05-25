import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { NodeData, EdgeData, GroupData, GraphJSON } from '@/types/graph'
import type { ExtractResult } from '@/types/ai'

export const useGraphStore = defineStore('graph', () => {
  const nodes = ref<NodeData[]>([])
  const edges = ref<EdgeData[]>([])
  const groups = ref<GroupData[]>([])
  const extractResult = ref<ExtractResult | null>(null)

  function setExtractResult(result: ExtractResult): void {
    extractResult.value = result
  }

  function setNodes(data: NodeData[]): void {
    nodes.value = data
  }

  function setEdges(data: EdgeData[]): void {
    edges.value = data
  }

  function setGroups(data: GroupData[]): void {
    groups.value = data
  }

  function updateNodeStyle(id: string, style: Partial<NodeData['style']>): void {
    const node = nodes.value.find(n => n.id === id)
    if (node) {
      node.style = { ...node.style, ...style }
    }
  }

  function updateEdgeStyle(id: string, style: Partial<EdgeData['style']>): void {
    const edge = edges.value.find(e => e.id === id)
    if (edge) {
      edge.style = { ...edge.style, ...style }
    }
  }

  function clearGraph(): void {
    nodes.value = []
    edges.value = []
    groups.value = []
    extractResult.value = null
  }

  function toJSON(): GraphJSON {
    return {
      version: '1.0.0',
      claimId: '',
      nodes: nodes.value,
      edges: edges.value,
      groups: groups.value,
      viewport: { x: 0, y: 0, zoom: 1 },
    }
  }

  return {
    nodes,
    edges,
    groups,
    extractResult,
    setExtractResult,
    setNodes,
    setEdges,
    setGroups,
    updateNodeStyle,
    updateEdgeStyle,
    clearGraph,
    toJSON,
  }
})
