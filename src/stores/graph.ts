import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { NodeData, EdgeData, GroupData, GraphJSON } from '@/types/graph'
import type { ExtractResult } from '@/types/ai'

export interface TabData {
  id: string
  name: string
  extractResult: ExtractResult | null
  serializedGraph: Record<string, unknown> | null
  isChinese: boolean
}

export const useGraphStore = defineStore('graph', () => {
  const tabs = ref<TabData[]>([])
  const activeTabId = ref<string>('')
  const nodes = ref<NodeData[]>([])
  const edges = ref<EdgeData[]>([])
  const groups = ref<GroupData[]>([])
  const extractResult = ref<ExtractResult | null>(null)

  const activeTab = computed(() =>
    tabs.value.find(t => t.id === activeTabId.value) || null,
  )

  let tabCounter = 0

  function addTab(name?: string, isChinese: boolean = false): TabData {
    tabCounter++
    const tab: TabData = {
      id: `tab-${Date.now()}-${tabCounter}`,
      name: name || `画布 ${tabCounter}`,
      extractResult: null,
      serializedGraph: null,
      isChinese,
    }
    tabs.value.push(tab)
    activeTabId.value = tab.id
    return tab
  }

  function removeTab(id: string): void {
    const index = tabs.value.findIndex(t => t.id === id)
    if (index === -1) return

    tabs.value.splice(index, 1)

    if (activeTabId.value === id) {
      if (tabs.value.length > 0) {
        const newIndex = Math.min(index, tabs.value.length - 1)
        activeTabId.value = tabs.value[newIndex].id
      } else {
        activeTabId.value = ''
      }
    }
  }

  function setActiveTab(id: string): void {
    if (activeTabId.value !== id) {
      activeTabId.value = id
    }
  }

  function updateTabExtractResult(id: string, result: ExtractResult): void {
    const tab = tabs.value.find(t => t.id === id)
    if (tab) {
      tab.extractResult = result
    }
  }

  function updateTabSerializedGraph(id: string, json: Record<string, unknown>): void {
    const tab = tabs.value.find(t => t.id === id)
    if (tab) {
      tab.serializedGraph = json
    }
  }

  function updateTabName(id: string, name: string): void {
    const tab = tabs.value.find(t => t.id === id)
    if (tab) {
      tab.name = name
    }
  }

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

  function clearActiveTabGraph(): void {
    const tab = activeTab.value
    if (tab) {
      tab.extractResult = null
      tab.serializedGraph = null
    }
    clearGraph()
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
    tabs,
    activeTabId,
    activeTab,
    nodes,
    edges,
    groups,
    extractResult,
    addTab,
    removeTab,
    setActiveTab,
    updateTabExtractResult,
    updateTabSerializedGraph,
    updateTabName,
    setExtractResult,
    setNodes,
    setEdges,
    setGroups,
    updateNodeStyle,
    updateEdgeStyle,
    clearGraph,
    clearActiveTabGraph,
    toJSON,
  }
})
