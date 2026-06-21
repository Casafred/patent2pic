import { graphEngine } from '@/services/graph/engine'
import { useGraphStore, type TabData } from '@/stores/graph'
import { useClaimStore } from '@/stores/claim'
import { useEditorStore } from '@/stores/editor'
import { useTranslationStore } from '@/stores/translation'
import { parseClaims } from '@/services/claim/parser'

const AUTOSAVE_KEY = 'patent2pic-autosave'
const AUTOSAVE_INTERVAL = 30_000

export function useAutoSave() {
  const graphStore = useGraphStore()
  const claimStore = useClaimStore()
  const editorStore = useEditorStore()
  const translationStore = useTranslationStore()

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
        claims: claimStore.claims,
        activeClaimId: claimStore.activeClaimId,
        isInputCollapsed: claimStore.isInputCollapsed,
        translations: translationStore.toJSON(),
        tabs: graphStore.tabs.map((tab: TabData) => ({
          ...tab,
          serializedGraph: tab.id === graphStore.activeTabId && graph
            ? graphEngine.toJSON()
            : tab.serializedGraph,
          // Save current tab's claim data from claimStore if it's the active tab
          rawText: tab.id === graphStore.activeTabId ? claimStore.rawText : tab.rawText,
          claims: tab.id === graphStore.activeTabId ? claimStore.claims : tab.claims,
          activeClaimId: tab.id === graphStore.activeTabId ? claimStore.activeClaimId : tab.activeClaimId,
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
        if (data.claims && Array.isArray(data.claims) && data.claims.length > 0) {
          claimStore.setClaims(data.claims)
        } else {
          const parsed = parseClaims(data.claimText)
          claimStore.setClaims(parsed)
        }
        if (data.activeClaimId) {
          claimStore.setActiveClaim(data.activeClaimId)
        }
      }

      if (typeof data.isInputCollapsed === 'boolean') {
        if (data.isInputCollapsed) {
          claimStore.collapseInput()
        } else {
          claimStore.expandInput()
        }
      }

      if (data.translations && typeof data.translations === 'object') {
        translationStore.fromJSON(data.translations)
      }

      if (data.tabs && Array.isArray(data.tabs) && data.tabs.length > 0) {
        graphStore.setTabs(data.tabs)
        graphStore.setActiveTabId(data.activeTabId || data.tabs[0].id)

        const activeTab = graphStore.activeTab
        // Restore claim data from the active tab
        if (activeTab?.rawText !== undefined) {
          claimStore.setText(activeTab.rawText)
          if (activeTab.claims && activeTab.claims.length > 0) {
            claimStore.setClaims(activeTab.claims)
          } else if (activeTab.rawText) {
            const parsed = parseClaims(activeTab.rawText)
            claimStore.setClaims(parsed)
          }
          if (activeTab.activeClaimId) {
            claimStore.setActiveClaim(activeTab.activeClaimId)
          }
        }

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
