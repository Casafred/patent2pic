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
    graphEngine.on('node:click', () => {
    })

    graphEngine.on('edge:click', () => {
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
