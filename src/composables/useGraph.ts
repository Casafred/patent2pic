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

      // If clicking a group (combo), highlight its label text
      if (data?.isGroup) {
        graphEngine.clearHighlight()
        const comboId = node.id
        if (e.ctrlKey || e.metaKey) {
          const current = editorStore.highlightedComboIds
          const idx = current.indexOf(comboId)
          if (idx >= 0) {
            const newIds = [...current]
            newIds.splice(idx, 1)
            editorStore.highlightCombos(newIds)
          } else {
            editorStore.highlightCombos([...current, comboId])
          }
          // Also highlight member nodes
          const memberNodeIds = (data.memberNodeIds as string[]) || []
          const currentNodeIds = editorStore.highlightedNodeIds
          const merged = [...currentNodeIds]
          for (const mid of memberNodeIds) {
            if (!merged.includes(mid)) merged.push(mid)
          }
          editorStore.highlightNodes(merged)
        } else {
          editorStore.highlightCombos([comboId])
          const memberNodeIds = (data.memberNodeIds as string[]) || []
          editorStore.highlightNodes(memberNodeIds)
        }
        return
      }

      // If clicking an attribute tag, highlight its source node instead
      const targetId = (data?.isAttributeTag && data?.sourceNodeId) ? data.sourceNodeId as string : node.id
      graphEngine.clearHighlight()
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
        editorStore.highlightCombos([])
      } else {
        editorStore.highlightNodes([targetId])
        editorStore.highlightCombos([])
      }
    })

    graphEngine.on('edge:click', (args: unknown) => {
      const { edge, e } = args as { edge: { id: string; getData: () => Record<string, unknown> | undefined }; e: { ctrlKey: boolean; metaKey: boolean } }
      const data = edge.getData()
      if (data?.isBranch) return

      const nodeIds = graphEngine.highlightEdge(edge.id)
      editorStore.highlightCombos([])

      if (e.ctrlKey || e.metaKey) {
        const current = editorStore.highlightedNodeIds
        const merged = [...current]
        for (const nid of nodeIds) {
          if (!merged.includes(nid)) merged.push(nid)
        }
        editorStore.highlightNodes(merged)
      } else {
        editorStore.highlightNodes(nodeIds)
      }
    })

    graphEngine.on('edge:label:click', (args: unknown) => {
      const { edge, e } = args as { edge: { id: string; getData: () => Record<string, unknown> | undefined }; e: { ctrlKey: boolean; metaKey: boolean } }
      const data = edge.getData()
      if (data?.isBranch) return

      const nodeIds = graphEngine.highlightEdge(edge.id)
      editorStore.highlightCombos([])

      if (e.ctrlKey || e.metaKey) {
        const current = editorStore.highlightedNodeIds
        const merged = [...current]
        for (const nid of nodeIds) {
          if (!merged.includes(nid)) merged.push(nid)
        }
        editorStore.highlightNodes(merged)
      } else {
        editorStore.highlightNodes(nodeIds)
      }
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
