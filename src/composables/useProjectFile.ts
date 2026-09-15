import { graphEngine } from '@/services/graph/engine'
import { useGraphStore, migrateLegacyTabs, type CanvasFile } from '@/stores/graph'
import { useClaimStore } from '@/stores/claim'
import { useTranslationStore } from '@/stores/translation'
import { parseClaims } from '@/services/claim/parser'

function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}

export function useProjectFile() {
  const graphStore = useGraphStore()
  const claimStore = useClaimStore()
  const translationStore = useTranslationStore()

  async function saveProject(): Promise<void> {
    const graph = graphEngine.getGraph()
    if (!graph) return

    const activeFile = graphStore.activeFile
    // 活动文件的当前画布（含手动编辑）写回其活动版本
    if (activeFile && activeFile.activeVersionId) {
      graphStore.updateVersionSerializedGraph(
        activeFile.id,
        activeFile.activeVersionId,
        graphEngine.toJSON(),
      )
    }

    const projectData = {
      version: '1.1.0',
      isInputCollapsed: claimStore.isInputCollapsed,
      files: graphStore.files.map(file =>
        file.id === activeFile?.id
          ? { ...file, translations: translationStore.toJSON() }
          : file,
      ),
      activeFileId: graphStore.activeFileId,
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

      if (typeof data.isInputCollapsed === 'boolean') {
        if (data.isInputCollapsed) {
          claimStore.collapseInput()
        } else {
          claimStore.expandInput()
        }
      }

      // 新模型：files 数组；旧模型：tabs 数组（迁移为单版本文件）
      let files: CanvasFile[] | null = null
      if (Array.isArray(data.files) && data.files.length > 0) {
        files = data.files
      } else if (Array.isArray(data.tabs) && data.tabs.length > 0) {
        files = migrateLegacyTabs(data.tabs)
      }

      if (files) {
        graphStore.setFiles(files)
        // activateFile 完成输入投影与翻译切换；画布渲染由 AppLayout 的 renderKey watcher 完成
        graphStore.activateFile(data.activeFileId || files[0].id)
        return true
      }

      // 旧版单图格式（graphJSON / graph）：落到一个全新文件
      const graphJSON = data.graphJSON || data.graph
      if (graphJSON) {
        graphStore.setFiles([])
        const file = graphStore.ensureDefaultFile()
        if (data.claimText) {
          claimStore.setText(data.claimText)
          if (Array.isArray(data.claims) && data.claims.length > 0) {
            claimStore.setClaims(data.claims)
          } else {
            claimStore.setClaims(parseClaims(data.claimText))
          }
          if (data.activeClaimId) {
            claimStore.setActiveClaim(data.activeClaimId)
          }
        }
        if (data.translations && typeof data.translations === 'object') {
          graphStore.updateFileTranslations(file.id, data.translations)
          translationStore.fromJSON(data.translations)
        }
        // renderKey 未变化（同文件无版本），手动渲染
        const graph = graphEngine.getGraph()
        if (graph) {
          graph.clearCells()
          graphEngine.fromJSON(graphJSON)
          graphEngine.rebindGroupTracking()
          graphEngine.showFullGraph()
          setTimeout(() => graphEngine.fitView(), 100)
        }
        return true
      }

      // 只有输入文本的旧格式
      if (data.claimText) {
        graphStore.setFiles([])
        graphStore.ensureDefaultFile()
        claimStore.setText(data.claimText)
        if (Array.isArray(data.claims) && data.claims.length > 0) {
          claimStore.setClaims(data.claims)
        } else {
          claimStore.setClaims(parseClaims(data.claimText))
        }
        if (data.activeClaimId) {
          claimStore.setActiveClaim(data.activeClaimId)
        }
        return true
      }

      return false
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
