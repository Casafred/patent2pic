import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useEditorStore = defineStore('editor', () => {
  const selectedNodeIds = ref<string[]>([])
  const selectedEdgeIds = ref<string[]>([])
  const activePanel = ref<'style' | 'ai' | null>(null)
  const zoom = ref(1)
  const isDirty = ref(false)

  function selectNodes(ids: string[]): void {
    selectedNodeIds.value = ids
    selectedEdgeIds.value = []
  }

  function selectEdges(ids: string[]): void {
    selectedEdgeIds.value = ids
    selectedNodeIds.value = []
  }

  function clearSelection(): void {
    selectedNodeIds.value = []
    selectedEdgeIds.value = []
  }

  function togglePanel(panel: 'style' | 'ai' | null): void {
    activePanel.value = activePanel.value === panel ? null : panel
  }

  function setZoom(value: number): void {
    zoom.value = Math.max(0.1, Math.min(3, value))
  }

  function markDirty(): void {
    isDirty.value = true
  }

  function markClean(): void {
    isDirty.value = false
  }

  return {
    selectedNodeIds,
    selectedEdgeIds,
    activePanel,
    zoom,
    isDirty,
    selectNodes,
    selectEdges,
    clearSelection,
    togglePanel,
    setZoom,
    markDirty,
    markClean,
  }
})
