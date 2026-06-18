import { ref, onUnmounted } from 'vue'
import { graphEngine } from '@/services/graph/engine'
import { useEditorStore } from '@/stores/editor'

export function useGraph() {
  const containerRef = ref<HTMLElement | null>(null)
  const editorStore = useEditorStore()
  const isReady = ref(false)

  function initGraph(container: HTMLElement): void {
    containerRef.value = container
    graphEngine.init(container)
    isReady.value = true
    bindEvents()
  }

  function bindEvents(): void {
    graphEngine.on('node:click', (args: unknown) => {
      const { node, e } = args as { node: { id: string; getData: () => Record<string, unknown> | undefined }; e: { ctrlKey: boolean; metaKey: boolean } }
      const data = node.getData()
      // If clicking an attribute tag, highlight its source node instead
      const targetId = (data?.isAttributeTag && data?.sourceNodeId) ? data.sourceNodeId as string : node.id
      if (e.ctrlKey || e.metaKey) {
        const current = editorStore.highlightedNodeIds
        const idx = current.indexOf(targetId)
        if (idx >= 0) {
          const newIds = [...current]
          newIds.splice(idx, 1)
          editorStore.highlightNodes(newIds)
        } else {
          editorStore.highlightNodes([...current, targetId])
        }
      } else {
        editorStore.highlightNodes([targetId])
      }
    })

    graphEngine.on('edge:click', () => {
      editorStore.highlightNodes([])
    })

    graphEngine.on('blank:click', () => {
      editorStore.clearSelection()
    })

    graphEngine.on('node:moved', () => {
      editorStore.markDirty()
    })

    graphEngine.on('cell:changed', () => {
      editorStore.markDirty()
    })

    graphEngine.on('scale', (args: unknown) => {
      const { sx } = args as { sx: number }
      editorStore.setZoom(sx)
    })
  }

  function destroyGraph(): void {
    graphEngine.destroy()
    isReady.value = false
  }

  onUnmounted(() => {
    destroyGraph()
  })

  return {
    containerRef,
    isReady,
    initGraph,
    destroyGraph,
    engine: graphEngine,
  }
}
