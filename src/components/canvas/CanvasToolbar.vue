<template>
  <div class="canvas-toolbar">
    <div class="toolbar-group">
      <el-tooltip content="打开项目" placement="bottom">
        <el-button size="small" @click="handleLoadProject">打开</el-button>
      </el-tooltip>
      <el-tooltip content="保存项目" placement="bottom">
        <el-button size="small" @click="handleSaveProject">保存</el-button>
      </el-tooltip>
    </div>

    <div class="toolbar-divider" />

    <div class="toolbar-group">
      <el-tooltip content="撤销 (Ctrl+Z)" placement="bottom">
        <el-button size="small" :icon="RefreshLeft" @click="engine.undo()" />
      </el-tooltip>
      <el-tooltip content="重做 (Ctrl+Y)" placement="bottom">
        <el-button size="small" :icon="RefreshRight" @click="engine.redo()" />
      </el-tooltip>
    </div>

    <div class="toolbar-divider" />

    <div class="toolbar-group">
      <el-tooltip content="放大" placement="bottom">
        <el-button size="small" @click="engine.zoomIn()">+</el-button>
      </el-tooltip>
      <el-tooltip content="缩小" placement="bottom">
        <el-button size="small" @click="engine.zoomOut()">−</el-button>
      </el-tooltip>
      <el-tooltip content="适配画布" placement="bottom">
        <el-button size="small" @click="engine.fitView()">适配</el-button>
      </el-tooltip>
      <el-tooltip content="居中" placement="bottom">
        <el-button size="small" @click="engine.centerContent()">居中</el-button>
      </el-tooltip>
    </div>

    <div class="toolbar-divider" />

    <div class="toolbar-group">
      <el-tooltip content="自动布局" placement="bottom">
        <el-button size="small" @click="engine.applyLayout()">自动布局</el-button>
      </el-tooltip>
      <el-tooltip content="恢复到初始生成状态" placement="bottom">
        <el-button size="small" :disabled="!engine.hasInitialState()" @click="handleResetToInitial">重置</el-button>
      </el-tooltip>
    </div>

    <div class="toolbar-divider" />

    <div class="toolbar-group">
      <el-tooltip content="添加新节点" placement="bottom">
        <el-button size="small" type="success" @click="handleAddNode">+ 节点</el-button>
      </el-tooltip>
      <el-tooltip content="添加组合框" placement="bottom">
        <el-button size="small" type="warning" @click="handleAddGroup">+ 组合框</el-button>
      </el-tooltip>
    </div>

    <div class="toolbar-divider" />

    <div class="toolbar-group">
      <el-tooltip content="统一调节字号" placement="bottom">
        <div class="font-size-control">
          <span class="font-size-label">字号</span>
          <el-button size="small" @click="handleFontSizeChange(-1)" :disabled="globalFontSize <= 10">−</el-button>
          <span class="font-size-value">{{ globalFontSize }}px</span>
          <el-button size="small" @click="handleFontSizeChange(1)" :disabled="globalFontSize >= 28">+</el-button>
        </div>
      </el-tooltip>
    </div>

    <div class="toolbar-divider" />

    <div class="toolbar-group">
      <el-tooltip content="清空画布" placement="bottom">
        <el-button size="small" type="danger" @click="handleClearCanvas">清空</el-button>
      </el-tooltip>
    </div>

    <div class="toolbar-spacer" />

    <div class="toolbar-group">
      <el-dropdown trigger="click" @command="handleExport">
        <el-button size="small" type="primary">
          导出 <el-icon class="el-icon--right"><ArrowDown /></el-icon>
        </el-button>
        <template #dropdown>
          <el-dropdown-menu>
            <el-dropdown-item command="png">导出 PNG</el-dropdown-item>
            <el-dropdown-item command="png-hd">导出高清 PNG (3x)</el-dropdown-item>
            <el-dropdown-item command="svg">导出 SVG</el-dropdown-item>
            <el-dropdown-item command="json">导出 JSON</el-dropdown-item>
          </el-dropdown-menu>
        </template>
      </el-dropdown>
    </div>

    <CellEditDialog
      v-model:visible="addDialogVisible"
      :is-node="addDialogMode === 'node'"
      :initial-original-text="addOriginalText"
      :initial-chinese-text="addChineseText"
      :initial-node-type="addNodeType"
      @save="handleAddSave"
    />
  </div>
</template>

<script setup lang="ts">
import { RefreshLeft, RefreshRight, ArrowDown } from '@element-plus/icons-vue'
import { ref, computed } from 'vue'
import { graphEngine } from '@/services/graph/engine'
import { useExport } from '@/composables/useExport'
import { useProjectFile } from '@/composables/useProjectFile'
import { useGraphStore } from '@/stores/graph'
import type { ExportFormat } from '@/types/app'
import type { NodeType } from '@/types/graph'
import { getDefaultNodeStyle } from '@/services/graph/style-registry'
import CellEditDialog from '../common/CellEditDialog.vue'

const engine = graphEngine
const graphStore = useGraphStore()
const globalFontSize = computed(() => Math.round((graphStore.globalNodeFontSize + graphStore.globalEdgeFontSize) / 2))
const { downloadFile } = useExport()
const { saveProject, loadProject } = useProjectFile()

const addDialogVisible = ref(false)
const addDialogMode = ref<'node' | 'group'>('node')
const addOriginalText = ref('')
const addChineseText = ref('')
const addNodeType = ref<NodeType>('component')

function handleFontSizeChange(delta: number): void {
  const newNodeSize = Math.max(10, Math.min(28, graphStore.globalNodeFontSize + delta))
  const newEdgeSize = Math.max(10, Math.min(28, graphStore.globalEdgeFontSize + delta))
  graphStore.setGlobalNodeFontSize(newNodeSize)
  graphStore.setGlobalEdgeFontSize(newEdgeSize)
  engine.setAllNodeFontSize(newNodeSize)
  engine.setAllEdgeFontSize(newEdgeSize)
  engine.applyLayout()
}

function handleResetToInitial(): void {
  engine.resetToInitial()
}

function handleExport(format: string): void {
  if (format === 'png-hd') {
    downloadFile('png-hd')
  } else {
    downloadFile(format as ExportFormat)
  }
}

async function handleSaveProject(): Promise<void> {
  await saveProject()
}

async function handleLoadProject(): Promise<void> {
  await loadProject()
}

function handleClearCanvas(): void {
  const graph = engine.getGraph()
  if (graph) {
    graph.clearCells()
  }
  graphStore.clearActiveTabGraph()
}

function handleAddNode(): void {
  addDialogMode.value = 'node'
  addOriginalText.value = ''
  addChineseText.value = ''
  addNodeType.value = 'component'
  addDialogVisible.value = true
}

function handleAddGroup(): void {
  addDialogMode.value = 'group'
  addOriginalText.value = ''
  addChineseText.value = ''
  addDialogVisible.value = true
}

function handleAddSave(data: { originalText: string; chineseText: string; nodeType?: NodeType }): void {
  const graph = engine.getGraph()
  if (!graph) return

  if (addDialogMode.value === 'node') {
    const id = `node-${Date.now()}`
    const style = getDefaultNodeStyle(data.nodeType || 'component')
    engine.addNode({
      id,
      originalText: data.originalText,
      chineseText: data.chineseText,
      nodeType: data.nodeType || 'component',
      style,
      x: 100,
      y: 100,
    })
  } else {
    const id = `group-${Date.now()}`
    const label = data.originalText || '新组合框'
    engine.addGroup(id, label, 50, 50)
  }
}
</script>

<style scoped>
.canvas-toolbar {
  display: flex;
  align-items: center;
  height: 40px;
  padding: 0 var(--spacing-sm);
  background: var(--bg-secondary);
  border-bottom: 1px solid var(--border-color);
  gap: var(--spacing-xs);
}

.toolbar-group {
  display: flex;
  align-items: center;
  gap: 2px;
}

.toolbar-divider {
  width: 1px;
  height: 20px;
  background: var(--border-color);
  margin: 0 var(--spacing-xs);
}

.toolbar-spacer {
  flex: 1;
}

.font-size-control {
  display: flex;
  align-items: center;
  gap: 4px;
}

.font-size-label {
  font-size: 11px;
  color: var(--text-tertiary);
  white-space: nowrap;
}

.font-size-value {
  font-size: 12px;
  color: var(--text-primary);
  min-width: 36px;
  text-align: center;
  font-variant-numeric: tabular-nums;
}
</style>
