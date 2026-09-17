import { useWorkspaceStore } from '@/stores/workspace'
import { useEditorStore } from '@/stores/editor'

const AUTOSAVE_INTERVAL = 30_000

/**
 * 自动保存：委托 workspace store 把当前项目状态持久化到
 * 独立的项目槽位（patent2pic-project-{id}）。
 */
export function useAutoSave() {
  const workspaceStore = useWorkspaceStore()
  const editorStore = useEditorStore()

  let intervalId: ReturnType<typeof setInterval> | null = null

  function saveToLocalStorage(): void {
    workspaceStore.saveActiveProject()
    editorStore.markClean()
  }

  function loadFromLocalStorage(): boolean {
    return workspaceStore.initWorkspace()
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
    registerBeforeUnload,
    startIntervalSave,
  }
}
