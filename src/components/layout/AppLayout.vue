<template>
  <div class="app-layout">
    <div class="left-panel" ref="leftPanelRef" :style="{ width: leftPanelWidth + 'px' }">
      <ClaimInput />
      <ClaimReader />
    </div>
    <div class="resize-handle resize-handle-left" @mousedown="startResizeLeft"></div>
    <div class="center-panel">
      <CanvasToolbar />
      <TabBar />
      <div class="canvas-area">
        <GraphCanvas ref="graphCanvasRef" />
      </div>
    </div>
    <div class="resize-handle resize-handle-right" v-if="editorStore.activePanel === 'style' || hasSelection" @mousedown="startResizeRight"></div>
    <div class="right-panel" v-if="editorStore.activePanel === 'style' || hasSelection" ref="rightPanelRef" :style="{ width: rightPanelWidth + 'px' }">
      <StylePanel />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch, onBeforeUnmount } from 'vue'
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
import { parseClaims } from '@/services/claim/parser'

const editorStore = useEditorStore()
const graphStore = useGraphStore()
const claimStore = useClaimStore()
const graphCanvasRef = ref<InstanceType<typeof GraphCanvas> | null>(null)
const leftPanelRef = ref<HTMLElement | null>(null)
const rightPanelRef = ref<HTMLElement | null>(null)

const leftPanelWidth = ref(360)
const rightPanelWidth = ref(280)

const hasSelection = computed(() =>
  editorStore.selectedNodeIds.length > 0 || editorStore.selectedEdgeIds.length > 0,
)

// Resize handle logic
let resizingSide: 'left' | 'right' | null = null
let startX = 0
let startWidth = 0

function startResizeLeft(e: MouseEvent): void {
  resizingSide = 'left'
  startX = e.clientX
  startWidth = leftPanelWidth.value
  document.addEventListener('mousemove', onResizeMove)
  document.addEventListener('mouseup', onResizeEnd)
  document.body.style.cursor = 'col-resize'
  document.body.style.userSelect = 'none'
}

function startResizeRight(e: MouseEvent): void {
  resizingSide = 'right'
  startX = e.clientX
  startWidth = rightPanelWidth.value
  document.addEventListener('mousemove', onResizeMove)
  document.addEventListener('mouseup', onResizeEnd)
  document.body.style.cursor = 'col-resize'
  document.body.style.userSelect = 'none'
}

function onResizeMove(e: MouseEvent): void {
  if (resizingSide === 'left') {
    const delta = e.clientX - startX
    leftPanelWidth.value = Math.max(280, Math.min(600, startWidth + delta))
  } else if (resizingSide === 'right') {
    const delta = startX - e.clientX
    rightPanelWidth.value = Math.max(200, Math.min(500, startWidth + delta))
  }
}

function onResizeEnd(): void {
  resizingSide = null
  document.removeEventListener('mousemove', onResizeMove)
  document.removeEventListener('mouseup', onResizeEnd)
  document.body.style.cursor = ''
  document.body.style.userSelect = ''
}

onBeforeUnmount(() => {
  document.removeEventListener('mousemove', onResizeMove)
  document.removeEventListener('mouseup', onResizeEnd)
})

watch(() => graphStore.activeTabId, async (newTabId, oldTabId) => {
  if (newTabId === oldTabId) return

  if (oldTabId) {
    const oldTab = graphStore.tabs.find(t => t.id === oldTabId)
    if (oldTab) {
      const json = graphEngine.toJSON()
      graphStore.updateTabSerializedGraph(oldTabId, json)
      // Save current claim data to the old tab
      graphStore.updateTabClaimData(oldTabId, claimStore.rawText, claimStore.claims, claimStore.activeClaimId)
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

  // Restore claim data from the new tab
  if (newTab.rawText !== undefined) {
    claimStore.setText(newTab.rawText)
    if (newTab.claims && newTab.claims.length > 0) {
      claimStore.setClaims(newTab.claims)
    } else if (newTab.rawText) {
      claimStore.setClaims(parseClaims(newTab.rawText))
    }
    if (newTab.activeClaimId) {
      claimStore.setActiveClaim(newTab.activeClaimId)
    }
  }

  // Sync the claim store's active claim with the new tab
  if (newTab.claimId) {
    claimStore.setActiveClaim(newTab.claimId)
  }

  if (newTab.serializedGraph && Object.keys(newTab.serializedGraph).length > 0) {
    graphEngine.fromJSON(newTab.serializedGraph)
  } else if (newTab.extractResult) {
    await graphEngine.batchBuild(newTab.extractResult, undefined, newTab.isChinese)
  }
  // If extractResult is not available yet (parallel processing in progress),
  // the canvas stays empty. The extractResult watcher below will build the graph
  // when it becomes available.
})

// Watch for extractResult becoming available on the active tab during parallel processing.
// This handles the case where the user switches to a tab whose processing hasn't completed yet.
watch(
  () => graphStore.activeTab?.extractResult,
  async (newResult) => {
    if (!newResult) return
    const graph = graphEngine.getGraph()
    if (!graph) return
    // Only build if the canvas is currently empty
    if (graph.getCells().length === 0) {
      const tab = graphStore.activeTab
      if (tab) {
        await graphEngine.batchBuild(newResult, undefined, tab.isChinese)
      }
    }
  },
)
</script>

<style scoped>
.app-layout {
  display: flex;
  height: 100%;
  overflow: hidden;
}

.left-panel {
  min-width: 280px;
  border-right: 1px solid var(--border-color);
  background: var(--bg-secondary);
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
}

.resize-handle {
  width: 5px;
  cursor: col-resize;
  background: transparent;
  flex-shrink: 0;
  z-index: 10;
  transition: background 0.2s;
}

.resize-handle:hover,
.resize-handle:active {
  background: var(--color-primary);
  opacity: 0.5;
}

.resize-handle-left {
  margin-left: -2px;
}

.resize-handle-right {
  margin-right: -2px;
}

.center-panel {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--bg-primary);
  min-width: 200px;
}

.canvas-area {
  flex: 1;
  overflow: hidden;
}

.right-panel {
  min-width: 200px;
  border-left: 1px solid var(--border-color);
  background: var(--bg-secondary);
  overflow-y: auto;
  flex-shrink: 0;
}
</style>
