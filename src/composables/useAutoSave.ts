import { graphEngine } from '@/services/graph/engine'
import { useGraphStore, migrateLegacyTabs, type CanvasFile } from '@/stores/graph'
import { useClaimStore } from '@/stores/claim'
import { useEditorStore } from '@/stores/editor'
import { useTranslationStore } from '@/stores/translation'

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
      const activeFile = graphStore.activeFile

      // 活动文件的当前画布（含手动编辑）写回其活动版本
      if (activeFile && graph && activeFile.activeVersionId) {
        graphStore.updateVersionSerializedGraph(
          activeFile.id,
          activeFile.activeVersionId,
          graphEngine.toJSON(),
        )
      }

      const data = {
        version: '1.1.0',
        isInputCollapsed: claimStore.isInputCollapsed,
        files: graphStore.files.map(file =>
          file.id === activeFile?.id
            // 活动文件的翻译以全局翻译 store 为准（切换文件时才会写回快照）
            ? { ...file, translations: translationStore.toJSON() }
            : file,
        ),
        activeFileId: graphStore.activeFileId,
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

      // 极旧格式：只有输入文本，落到默认文件
      if (data.claimText) {
        graphStore.ensureDefaultFile()
        claimStore.setText(data.claimText)
        if (data.activeClaimId) {
          claimStore.setActiveClaim(data.activeClaimId)
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
