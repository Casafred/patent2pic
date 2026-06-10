<template>
  <div class="app-layout">
    <div class="left-panel">
      <ClaimInput />
      <ClaimReader />
    </div>
    <div class="center-panel">
      <CanvasToolbar />
      <TabBar />
      <div class="canvas-area">
        <GraphCanvas ref="graphCanvasRef" />
      </div>
    </div>
    <div class="right-panel" v-if="editorStore.activePanel === 'style' || hasSelection">
      <StylePanel />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import ClaimInput from '../input/ClaimInput.vue'
import ClaimReader from '../input/ClaimReader.vue'
import GraphCanvas from '../canvas/GraphCanvas.vue'
import CanvasToolbar from '../canvas/CanvasToolbar.vue'
import TabBar from '../canvas/TabBar.vue'
import StylePanel from '../panel/StylePanel.vue'
import { useEditorStore } from '@/stores/editor'
import { useGraphStore } from '@/stores/graph'
import { useClaimStore } from '@/stores/claim'
import { graphEngine } from '@/services/graph/engine'

const editorStore = useEditorStore()
const graphStore = useGraphStore()
const claimStore = useClaimStore()
const graphCanvasRef = ref<InstanceType<typeof GraphCanvas> | null>(null)

const hasSelection = computed(() =>
  editorStore.selectedNodeIds.length > 0 || editorStore.selectedEdgeIds.length > 0,
)

watch(() => graphStore.activeTabId, async (newTabId, oldTabId) => {
  if (newTabId === oldTabId) return

  if (oldTabId) {
    const oldTab = graphStore.tabs.find(t => t.id === oldTabId)
    if (oldTab) {
      const json = graphEngine.toJSON()
      graphStore.updateTabSerializedGraph(oldTabId, json)
    }
  }

  const graph = graphEngine.getGraph()
  if (!graph) return

  // Clear the graph engine's canvas
  graph.clearCells()

  if (!newTabId) {
    // Last tab closed - reset to empty state
    graphStore.clearGraph()
    return
  }

  const newTab = graphStore.tabs.find(t => t.id === newTabId)
  if (!newTab) return

  // Sync the claim store's active claim with the new tab
  if (newTab.claimId) {
    claimStore.setActiveClaim(newTab.claimId)
  }

  if (newTab.serializedGraph && Object.keys(newTab.serializedGraph).length > 0) {
    graphEngine.fromJSON(newTab.serializedGraph)
  } else if (newTab.extractResult) {
    await graphEngine.batchBuild(newTab.extractResult, undefined, newTab.isChinese)
  }
  // If neither serializedGraph nor extractResult is available yet
  // (e.g., parallel processing still in progress), the canvas stays empty.
  // When extractResult becomes available, the watch below will build the graph.
})

// Watch for extractResult becoming available on the active tab
// This handles the case where the user switches to a tab whose
// parallel processing hasn't completed yet
watch(() => graphStore.activeTab?.extractResult, async (newResult, oldResult) => {
  if (!newResult || oldResult) return
  // extractResult just became available on the active tab (was null before)
  const tab = graphStore.activeTab
  if (!tab) return
  const graph = graphEngine.getGraph()
  if (!graph) return

  // Only build if the canvas is currently empty (no serializedGraph was loaded)
  if (graph.getCells().length === 0) {
    await graphEngine.batchBuild(newResult, undefined, tab.isChinese)
  }
})
</script>

<style scoped>
.app-layout {
  display: flex;
  height: 100%;
  overflow: hidden;
}

.left-panel {
  width: 360px;
  min-width: 300px;
  border-right: 1px solid var(--border-color);
  background: var(--bg-secondary);
  overflow-y: auto;
  display: flex;
  flex-direction: column;
}

.center-panel {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--bg-primary);
}

.canvas-area {
  flex: 1;
  overflow: hidden;
}

.right-panel {
  width: 280px;
  min-width: 240px;
  border-left: 1px solid var(--border-color);
  background: var(--bg-secondary);
  overflow-y: auto;
}
</style>
