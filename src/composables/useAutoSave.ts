import { graphEngine } from '@/services/graph/engine'
import { useGraphStore, type TabData } from '@/stores/graph'
import { useClaimStore } from '@/stores/claim'
import { useEditorStore } from '@/stores/editor'

const AUTOSAVE_KEY = 'patent2pic-autosave'
const AUTOSAVE_INTERVAL = 30_000

export function useAutoSave() {
  const graphStore = useGraphStore()
  const claimStore = useClaimStore()
  const editorStore = useEditorStore()

  let intervalId: ReturnType<typeof setInterval> | null = null

  function saveToLocalStorage(): void {
    try {
      const graph = graphEngine.getGraph()
      const claim = claimStore.getActiveClaim()

      const currentTab = graphStore.activeTab
      if (currentTab && graph) {
        const json = graphEngine.toJSON()
        graphStore.updateTabSerializedGraph(currentTab.id, json)
      }

      const data = {
        version: '1.0.0',
        claimText: claim?.rawText || claimStore.rawText,
        isInputCollapsed: claimStore.isInputCollapsed,
        tabs: graphStore.tabs.map((tab: TabData) => ({
          ...tab,
          serializedGraph: tab.id === graphStore.activeTabId && graph
            ? graphEngine.toJSON()
            : tab.serializedGraph,
        })),
        activeTabId: graphStore.activeTabId,
        savedAt: Date.now(),
      }

      localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(data))
      editorStore.markClean()
    } catch (err) {
      console.error('自动保存失败:', err)
    }
  }

  function loadFromLocalStorage(): boolean {
    try {
      const raw = localStorage.getItem(AUTOSAVE_KEY)
      if (!raw) return false

      const data = JSON.parse(raw)

      if (data.claimText) {
        claimStore.setText(data.claimText)
      }

      if (typeof data.isInputCollapsed === 'boolean') {
        if (data.isInputCollapsed) {
          claimStore.collapseInput()
        } else {
          claimStore.expandInput()
        }
      }

      if (data.tabs && Array.isArray(data.tabs) && data.tabs.length > 0) {
        graphStore.setTabs(data.tabs)
        graphStore.setActiveTabId(data.activeTabId || data.tabs[0].id)

        const activeTab = graphStore.activeTab
        if (activeTab?.serializedGraph) {
          const graph = graphEngine.getGraph()
          if (graph) {
            graph.clearCells()
            graphEngine.fromJSON(activeTab.serializedGraph)
            setTimeout(() => graphEngine.fitView(), 100)
          }
        } else if (activeTab?.extractResult) {
          const graph = graphEngine.getGraph()
          if (graph) {
            graphEngine.batchBuild(activeTab.extractResult, undefined, activeTab.isChinese).catch(console.error)
          }
        }

        return true
      }

      return false
    } catch (err) {
      console.error('自动保存恢复失败:', err)
      return false
    }
  }

  function clearAutoSave(): void {
    localStorage.removeItem(AUTOSAVE_KEY)
  }

  function hasAutoSave(): boolean {
    return !!localStorage.getItem(AUTOSAVE_KEY)
  }

  function registerBeforeUnload(): () => void {
    const handler = () => {
      saveToLocalStorage()
    }
    window.addEventListener('beforeunload', handler)
    return () => {
      window.removeEventListener('beforeunload', handler)
    }
  }

  function startIntervalSave(): () => void {
    if (intervalId) return () => {}

    intervalId = setInterval(() => {
      if (editorStore.isDirty) {
        saveToLocalStorage()
      }
    }, AUTOSAVE_INTERVAL)

    return () => {
      if (intervalId) {
        clearInterval(intervalId)
        intervalId = null
      }
    }
  }

  return {
    saveToLocalStorage,
    loadFromLocalStorage,
    clearAutoSave,
    hasAutoSave,
    registerBeforeUnload,
    startIntervalSave,
  }
}
