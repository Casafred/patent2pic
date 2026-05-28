
import { graphEngine } from '@/services/graph/engine'
import { useGraphStore } from '@/stores/graph'
import { useClaimStore } from '@/stores/claim'

function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}

export function useProjectFile() {
  const graphStore = useGraphStore()
  const claimStore = useClaimStore()

  async function saveProject(): Promise<void> {
    const graph = graphEngine.getGraph()
    if (!graph) return

    const claim = claimStore.getActiveClaim()

    const currentTab = graphStore.activeTab
    if (currentTab) {
      graphStore.updateTabSerializedGraph(currentTab.id, graphEngine.toJSON())
    }

    const projectData = {
      version: '1.0.0',
      claimText: claim?.rawText || claimStore.rawText,
      isInputCollapsed: claimStore.isInputCollapsed,
      graphJSON: graphEngine.toJSON(),
      tabs: graphStore.tabs,
      activeTabId: graphStore.activeTabId,
    }

    const content = JSON.stringify(projectData, null, 2)

    if (isTauri()) {
      await saveViaTauri(content)
    } else {
      saveViaBrowser(content)
    }
  }

  async function loadProject(): Promise<boolean> {
    if (isTauri()) {
      return loadViaTauri()
    } else {
      return loadViaBrowser()
    }
  }

  async function saveViaTauri(content: string): Promise<void> {
    try {
      const { save } = await import('@tauri-apps/plugin-dialog')
      const { writeFile } = await import('@tauri-apps/plugin-fs')

      const path = await save({
        defaultPath: 'patent2pic-project.p2p',
        filters: [{ name: 'Patent2Pic 项目', extensions: ['p2p'] }],
      })

      if (!path) return

      const encoder = new TextEncoder()
      await writeFile(path, encoder.encode(content))
    } catch (err) {
      console.error('Tauri 保存失败，回退到浏览器:', err)
      saveViaBrowser(content)
    }
  }

  function saveViaBrowser(content: string): void {
    const blob = new Blob([content], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'patent2pic-project.p2p'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  async function loadViaTauri(): Promise<boolean> {
    try {
      const { open } = await import('@tauri-apps/plugin-dialog')
      const { readFile } = await import('@tauri-apps/plugin-fs')

      const path = await open({
        filters: [{ name: 'Patent2Pic 项目', extensions: ['p2p'] }],
        multiple: false,
      })

      if (!path) return false

      const bytes = await readFile(path as string)
      const text = new TextDecoder().decode(bytes)
      return applyProjectData(text)
    } catch (err) {
      console.error('Tauri 加载失败:', err)
      return false
    }
  }

  function loadViaBrowser(): Promise<boolean> {
    return new Promise((resolve) => {
      const input = document.createElement('input')
      input.type = 'file'
      input.accept = '.p2p,.json'
      input.onchange = async () => {
        const file = input.files?.[0]
        if (!file) {
          resolve(false)
          return
        }
        const text = await file.text()
        resolve(applyProjectData(text))
      }
      input.click()
    })
  }

  function applyProjectData(text: string): boolean {
    try {
      const data = JSON.parse(text)

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
        const graphJSON = activeTab?.serializedGraph || data.graphJSON

        if (graphJSON) {
          const graph = graphEngine.getGraph()
          if (graph) {
            graph.clearCells()
            graphEngine.fromJSON(graphJSON)
            graphEngine.rebindGroupTracking()
            setTimeout(() => graphEngine.fitView(), 100)
          }
        }
      } else if (data.graphJSON) {
        const graph = graphEngine.getGraph()
        if (graph) {
          graph.clearCells()
          graphEngine.fromJSON(data.graphJSON)
          graphEngine.rebindGroupTracking()
          setTimeout(() => graphEngine.fitView(), 100)
        }
      } else if (data.graph) {
        const graph = graphEngine.getGraph()
        if (graph) {
          graph.clearCells()
          graphEngine.fromJSON(data.graph)
          graphEngine.rebindGroupTracking()
          setTimeout(() => graphEngine.fitView(), 100)
        }
      }

      return true
    } catch (err) {
      console.error('项目文件解析失败:', err)
      return false
    }
  }

  return {
    saveProject,
    loadProject,
  }
}
