import { ref, onMounted, onUnmounted } from 'vue'
import { graphEngine } from '@/services/graph/engine'
import { useEditorStore } from '@/stores/editor'
import { useGraphStore } from '@/stores/graph'

export function useGraph() {
  const containerRef = ref<HTMLElement | null>(null)
  const editorStore = useEditorStore()
  const graphStore = useGraphStore()
  const isReady = ref(false)

  function initGraph(container: HTMLElement): void {
    containerRef.value = container
    graphEngine.init(container)
    isReady.value = true
    bindEvents()
  }

  function bindEvents(): void {
    graphEngine.on('node:click', ({ node }: { node: { id: string } }) => {
      editorStore.selectNodes([node.id])
    })

    graphEngine.on('edge:click', ({ edge }: { edge: { id: string } }) => {
      editorStore.selectEdges([edge.id])
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

    graphEngine.on('scale', ({ sx }: { sx: number }) => {
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
