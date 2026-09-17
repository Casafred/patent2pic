<template>
  <div class="app-layout">
    <div
      class="sidebar-toggle"
      :title="sidebarCollapsed ? '展开工作区' : '收起工作区'"
      @click="toggleSidebar"
    >
      <svg width="9" height="12" viewBox="0 0 9 12">
        <polyline
          :points="sidebarCollapsed ? '1.5,1 7,6 1.5,11' : '7,1 1.5,6 7,11'"
          stroke="currentColor"
          fill="none"
          stroke-width="1.5"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
      </svg>
    </div>
    <WorkspaceSidebar v-if="!sidebarCollapsed" />
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
import WorkspaceSidebar from './WorkspaceSidebar.vue'
import { useEditorStore } from '@/stores/editor'
import { useGraphStore } from '@/stores/graph'
import { usePlaybackStore } from '@/stores/playback'
import { graphEngine } from '@/services/graph/engine'

const editorStore = useEditorStore()
const graphStore = useGraphStore()
const playback = usePlaybackStore()
const graphCanvasRef = ref<InstanceType<typeof GraphCanvas> | null>(null)
const leftPanelRef = ref<HTMLElement | null>(null)
const rightPanelRef = ref<HTMLElement | null>(null)

const leftPanelWidth = ref(360)
const rightPanelWidth = ref(280)

// 工作区侧栏折叠状态（持久化）
const sidebarCollapsed = ref(localStorage.getItem('patent2pic-sidebar-collapsed') === '1')

function toggleSidebar(): void {
  sidebarCollapsed.value = !sidebarCollapsed.value
  localStorage.setItem('patent2pic-sidebar-collapsed', sidebarCollapsed.value ? '1' : '0')
}

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

// 启动即保证存在活动画布文件：输入状态（rawText/claims）是活动文件的投影，
// 没有活动文件时输入框将无法写入
graphStore.ensureDefaultFile()

/**
 * 渲染键：活动文件 + 活动版本。任一变化即重渲染画布。
 * 这是画布渲染的唯一入口（切换文件 / 切换版本 / 分析追加版本 / 重构追加版本）。
 * 输入与翻译状态无需在此处理：输入是文件投影，翻译随 activateFile 切换。
 */
const renderKey = computed(() => `${graphStore.activeFileId}::${graphStore.activeFile?.activeVersionId ?? ''}`)

watch(renderKey, async (_newKey, oldKey) => {
  // 保存旧活动版本的画布快照（含手动编辑）
  if (oldKey) {
    const [oldFileId, oldVersionId] = oldKey.split('::')
    const graph = graphEngine.getGraph()
    if (oldFileId && oldVersionId && graph && graph.getCells().length > 0) {
      graphStore.updateVersionSerializedGraph(oldFileId, oldVersionId, graphEngine.toJSON())
    }
  }

  const graph = graphEngine.getGraph()
  if (!graph) return
  graph.clearCells()
  playback.clearFrames()

  const version = graphStore.activeVersion
  if (!version) return

  if (version.serializedGraph && Object.keys(version.serializedGraph).length > 0) {
    graphEngine.fromJSON(version.serializedGraph)
    if (playback.animationMode && version.extractResult?.frames?.length) {
      playback.setFrames(version.extractResult.frames)
    } else {
      graphEngine.showFullGraph()
    }
  } else if (version.extractResult) {
    await graphEngine.batchBuild(version.extractResult, undefined, graphStore.activeFile?.isChinese ?? false)
    if (playback.animationMode && version.extractResult.frames?.length) {
      playback.setFrames(version.extractResult.frames)
    } else {
      graphEngine.showFullGraph()
    }
  }
})
</script>

<style scoped>
.app-layout {
  display: flex;
  height: 100%;
  overflow: hidden;
}

.sidebar-toggle {
  width: 14px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  color: var(--text-tertiary);
  background: transparent;
  transition: background 0.2s, color 0.2s;
}

.sidebar-toggle:hover {
  background: var(--bg-tertiary, #e8eaed);
  color: var(--color-primary, #1890ff);
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
