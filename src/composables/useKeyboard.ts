import { onMounted, onUnmounted } from 'vue'
import { graphEngine } from '@/services/graph/engine'
import { useEditorStore } from '@/stores/editor'

export function useKeyboard() {
  const editorStore = useEditorStore()

  function handleKeyDown(e: KeyboardEvent): void {
    const isCtrl = e.ctrlKey || e.metaKey

    if (isCtrl && e.key === 'z' && !e.shiftKey) {
      e.preventDefault()
      graphEngine.undo()
    }

    if (isCtrl && e.key === 'z' && e.shiftKey) {
      e.preventDefault()
      graphEngine.redo()
    }

    if (isCtrl && e.key === 'y') {
      e.preventDefault()
      graphEngine.redo()
    }

    if (isCtrl && e.key === 'a') {
      e.preventDefault()
      graphEngine.selectAll()
    }

    if (e.key === 'Delete' || e.key === 'Backspace') {
      const nodeIds = graphEngine.getSelectedNodeIds()
      const edgeIds = graphEngine.getSelectedEdgeIds()
      if (nodeIds.length > 0 || edgeIds.length > 0) {
        e.preventDefault()
        nodeIds.forEach(id => graphEngine.removeNode(id))
        edgeIds.forEach(id => graphEngine.removeEdge(id))
        editorStore.clearSelection()
      }
    }

    if (e.key === 'Escape') {
      graphEngine.clearSelection()
      editorStore.clearSelection()
    }
  }

  onMounted(() => {
    window.addEventListener('keydown', handleKeyDown)
  })

  onUnmounted(() => {
    window.removeEventListener('keydown', handleKeyDown)
  })
}
