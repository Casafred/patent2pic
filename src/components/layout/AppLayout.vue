<template>
  <div class="app-layout">
    <div class="left-panel">
      <ClaimInput />
    </div>
    <div class="center-panel">
      <CanvasToolbar />
      <div class="canvas-area">
        <GraphCanvas />
      </div>
    </div>
    <div class="right-panel" v-if="editorStore.activePanel === 'style' || hasSelection">
      <StylePanel />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import ClaimInput from '../input/ClaimInput.vue'
import GraphCanvas from '../canvas/GraphCanvas.vue'
import CanvasToolbar from '../canvas/CanvasToolbar.vue'
import StylePanel from '../panel/StylePanel.vue'
import { useEditorStore } from '@/stores/editor'

const editorStore = useEditorStore()

const hasSelection = computed(() =>
  editorStore.selectedNodeIds.length > 0 || editorStore.selectedEdgeIds.length > 0,
)
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
