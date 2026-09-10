import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { NodeData, EdgeData, GroupData, GraphJSON } from '@/types/graph'
import type { ExtractResult } from '@/types/ai'
import type { Claim } from '@/types/claim'

export interface TabData {
  id: string
  name: string
  extractResult: ExtractResult | null
  serializedGraph: Record<string, unknown> | null
  isChinese: boolean
  claimId: string | null
  rawText: string
  claims: Claim[]
  activeClaimId: string | null
  translations: Record<string, { claimId: string; sentences: { sentenceId: string; originalText: string; translatedText: string; status: string; error: string | null }[]; overallStatus: string }> | null
  /** AI 重构版本链：来源 Tab */
  sourceTabId?: string
  /** AI 重构版本链：本次重构的指令 */
  redrawInstructions?: string
  /** AI 重构版本链：版本号（源 Tab 为 1，重构 Tab 从 2 递增） */
  redrawVersion?: number
}

type TabTranslations = NonNullable<TabData['translations']>

function deepClone<T>(data: T): T {
  return JSON.parse(JSON.stringify(data))
}

export const useGraphStore = defineStore('graph', () => {
  const tabs = ref<TabData[]>([])
  const activeTabId = ref<string>('')
  const nodes = ref<NodeData[]>([])
  const edges = ref<EdgeData[]>([])
  const groups = ref<GroupData[]>([])
  const extractResult = ref<ExtractResult | null>(null)

  const globalNodeFontSize = ref<number>(15)
  const globalEdgeFontSize = ref<number>(15)

  const activeTab = computed(() =>
    tabs.value.find(t => t.id === activeTabId.value) || null,
  )

  let tabCounter = 0

  function addTab(name?: string, isChinese: boolean = false, activate: boolean = true, claimId: string | null = null, rawText: string = '', claims: Claim[] = [], activeClaimId: string | null = null, redraw?: { sourceTabId: string; instructions: string; version: number }): TabData {
    tabCounter++
    const tab: TabData = {
      id: `tab-${Date.now()}-${tabCounter}`,
      name: name || `画布 ${tabCounter}`,
      extractResult: null,
      serializedGraph: null,
      isChinese,
      claimId,
      rawText,
      // 深拷贝入参：Tab 快照与全局 store 不共享引用，避免任一侧原地修改互相穿透
      claims: claims ? deepClone(claims) : [],
      activeClaimId,
      translations: null,
      sourceTabId: redraw?.sourceTabId,
      redrawInstructions: redraw?.instructions,
      redrawVersion: redraw?.version,
    }
    tabs.value.push(tab)
    if (activate) {
      activeTabId.value = tab.id
    }
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
      // 深拷贝入参：Tab 快照与全局 store 不共享引用，避免任一侧原地修改互相穿透
      tab.extractResult = result ? deepClone(result) : null
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

  function updateTabClaimData(id: string, rawText: string, claims: Claim[], activeClaimId: string | null): void {
    const tab = tabs.value.find(t => t.id === id)
    if (tab) {
      tab.rawText = rawText
      // 深拷贝入参：Tab 快照与全局 store 不共享引用，避免任一侧原地修改互相穿透
      tab.claims = claims ? deepClone(claims) : []
      tab.activeClaimId = activeClaimId
    }
  }

  function updateTabTranslations(id: string, translations: TabTranslations | null): void {
    const tab = tabs.value.find(t => t.id === id)
    if (tab) {
      // 深拷贝入参：Tab 快照与全局 store 不共享引用，避免任一侧原地修改互相穿透
      tab.translations = translations ? deepClone(translations) : null
    }
  }

  function updateTabClaimSentences(id: string, claimId: string, sentences: Claim['sentences']): void {
    const tab = tabs.value.find(t => t.id === id)
    const claim = tab?.claims.find(c => c.id === claimId)
    if (claim) {
      // 深拷贝入参：Tab 快照与全局 store 不共享引用，避免任一侧原地修改互相穿透
      claim.sentences = deepClone(sentences)
    }
  }

  function mergeTabTranslation(id: string, claimId: string, translation: TabTranslations[string] | null | undefined): void {
    const tab = tabs.value.find(t => t.id === id)
    if (!tab || !translation) return
    // 定向合并单条权利要求的翻译快照，不影响 Tab 内其他条目
    const merged: TabTranslations = { ...(tab.translations ?? {}) }
    merged[claimId] = deepClone(translation)
    tab.translations = merged
  }

  function setTabs(data: TabData[]): void {
    tabs.value = data
  }

  function setActiveTabId(id: string): void {
    activeTabId.value = id
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

  function setGlobalNodeFontSize(size: number): void {
    globalNodeFontSize.value = size
  }

  function setGlobalEdgeFontSize(size: number): void {
    globalEdgeFontSize.value = size
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
    globalNodeFontSize,
    globalEdgeFontSize,
    addTab,
    removeTab,
    setActiveTab,
    setActiveTabId,
    setTabs,
    updateTabExtractResult,
    updateTabSerializedGraph,
    updateTabName,
    updateTabClaimData,
    updateTabTranslations,
    updateTabClaimSentences,
    mergeTabTranslation,
    setExtractResult,
    setNodes,
    setEdges,
    setGroups,
    updateNodeStyle,
    updateEdgeStyle,
    setGlobalNodeFontSize,
    setGlobalEdgeFontSize,
    clearGraph,
    clearActiveTabGraph,
    toJSON,
  }
})
