<template>
  <div class="graph-canvas" ref="canvasContainerRef">
    <div class="canvas-viewport" ref="viewportRef"></div>
    <div class="canvas-status">
      <span class="zoom-label">{{ Math.round(editorStore.zoom * 100) }}%</span>
    </div>

    <CellEditDialog
      v-model:visible="editDialogVisible"
      :is-node="editIsNode"
      :initial-original-text="editOriginalText"
      :initial-chinese-text="editChineseText"
      :initial-node-type="editNodeType"
      :initial-relation-type="editRelationType"
      @save="handleEditSave"
    />

    <div
      v-if="contextMenu.visible"
      class="context-menu"
      :style="{ left: contextMenu.x + 'px', top: contextMenu.y + 'px' }"
    >
      <template v-if="contextMenu.type === 'node'">
        <div class="menu-item" @click="handleMenuAction('edit')">编辑</div>
        <div class="menu-item" @click="handleMenuAction('delete')">删除</div>
        <div class="menu-item" @click="handleMenuAction('addEdge')">添加连接</div>
        <div class="menu-divider" />
        <div class="menu-item" @click="handleMenuAction('createGroup')">添加到限定框</div>
      </template>
      <template v-if="contextMenu.type === 'edge'">
        <div class="menu-item" @click="handleMenuAction('edit')">编辑</div>
        <div class="menu-item" @click="handleMenuAction('delete')">删除</div>
      </template>
      <template v-if="contextMenu.type === 'blank'">
        <div class="menu-item" @click="handleMenuAction('fitView')">适配画布</div>
        <div class="menu-item" @click="handleMenuAction('autoLayout')">自动布局</div>
        <div class="menu-item" @click="handleMenuAction('selectAll')">全选</div>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted, onUnmounted, watch } from 'vue'
import { useGraph } from '@/composables/useGraph'
import { useKeyboard } from '@/composables/useKeyboard'
import { useEditorStore } from '@/stores/editor'
import { useGraphStore } from '@/stores/graph'
import { graphEngine } from '@/services/graph/engine'
import { getDefaultNodeStyle, getDefaultEdgeStyle } from '@/services/graph/style-registry'
import CellEditDialog from '../common/CellEditDialog.vue'
import type { NodeType, RelationType } from '@/types/graph'

const editorStore = useEditorStore()
const graphStore = useGraphStore()
const { initGraph, destroyGraph, engine } = useGraph()
useKeyboard()

const viewportRef = ref<HTMLElement | null>(null)

const editDialogVisible = ref(false)
const editIsNode = ref(true)
const editOriginalText = ref('')
const editChineseText = ref('')
const editNodeType = ref<NodeType>('component')
const editRelationType = ref<RelationType>('position')
const editCellId = ref('')

const contextMenu = reactive({
  visible: false,
  x: 0,
  y: 0,
  type: 'blank' as 'node' | 'edge' | 'blank',
  cellId: '',
})

onMounted(() => {
  if (viewportRef.value) {
    initGraph(viewportRef.value)
    bindExtraEvents()
  }
  window.addEventListener('click', hideContextMenu)
})

onUnmounted(() => {
  destroyGraph()
  window.removeEventListener('click', hideContextMenu)
})

watch(() => graphStore.extractResult, (newResult) => {
  if (newResult && engine.getGraph()) {
    engine.batchBuild(newResult)
  }
})

function bindExtraEvents(): void {
  engine.on('node:dblclick', ({ node }: { node: { id: string; getData: () => Record<string, unknown> } }) => {
    const data = node.getData()
    editCellId.value = node.id
    editIsNode.value = true
    editOriginalText.value = (data?.originalText as string) || ''
    editChineseText.value = (data?.chineseText as string) || ''
    editNodeType.value = (data?.nodeType as NodeType) || 'component'
    editDialogVisible.value = true
  })

  engine.on('edge:dblclick', ({ edge }: { edge: { id: string; getData: () => Record<string, unknown> } }) => {
    const data = edge.getData()
    editCellId.value = edge.id
    editIsNode.value = false
    editOriginalText.value = (data?.originalText as string) || ''
    editChineseText.value = (data?.chineseText as string) || ''
    editRelationType.value = (data?.relationType as RelationType) || 'position'
    editDialogVisible.value = true
  })

  engine.on('node:contextmenu', ({ node, e }: { node: { id: string }; e: { clientX: number; clientY: number } }) => {
    e.preventDefault?.()
    showContextMenu(e.clientX, e.clientY, 'node', node.id)
  })

  engine.on('edge:contextmenu', ({ edge, e }: { edge: { id: string }; e: { clientX: number; clientY: number } }) => {
    e.preventDefault?.()
    showContextMenu(e.clientX, e.clientY, 'edge', edge.id)
  })

  engine.on('blank:contextmenu', ({ e }: { e: { clientX: number; clientY: number } }) => {
    e.preventDefault?.()
    showContextMenu(e.clientX, e.clientY, 'blank', '')
  })
}

function showContextMenu(x: number, y: number, type: 'node' | 'edge' | 'blank', cellId: string): void {
  contextMenu.visible = true
  contextMenu.x = x
  contextMenu.y = y
  contextMenu.type = type
  contextMenu.cellId = cellId
}

function hideContextMenu(): void {
  contextMenu.visible = false
}

function handleMenuAction(action: string): void {
  contextMenu.visible = false
  const graph = engine.getGraph()
  if (!graph) return

  switch (action) {
    case 'edit': {
      const cell = graph.getCellById(contextMenu.cellId)
      if (!cell) return
      const data = cell.getData() as Record<string, unknown>
      editCellId.value = contextMenu.cellId
      if (cell.isNode()) {
        editIsNode.value = true
        editOriginalText.value = (data?.originalText as string) || ''
        editChineseText.value = (data?.chineseText as string) || ''
        editNodeType.value = (data?.nodeType as NodeType) || 'component'
      } else {
        editIsNode.value = false
        editOriginalText.value = (data?.originalText as string) || ''
        editChineseText.value = (data?.chineseText as string) || ''
        editRelationType.value = (data?.relationType as RelationType) || 'position'
      }
      editDialogVisible.value = true
      break
    }
    case 'delete':
      engine.removeNode(contextMenu.cellId)
      engine.removeEdge(contextMenu.cellId)
      editorStore.clearSelection()
      break
    case 'addEdge':
      break
    case 'createGroup':
      break
    case 'fitView':
      engine.fitView()
      break
    case 'autoLayout':
      engine.applyLayout()
      break
    case 'selectAll':
      engine.selectAll()
      break
  }
}

function handleEditSave(data: { originalText: string; chineseText: string; nodeType?: NodeType; relationType?: RelationType }): void {
  const graph = engine.getGraph()
  if (!graph) return

  const cell = graph.getCellById(editCellId.value)
  if (!cell) return

  if (cell.isNode()) {
    const node = cell as unknown as { attr: (path: string, value?: unknown) => unknown; setData: (data: Record<string, unknown>) => void }
    node.attr('label/text', `${data.originalText}\n${data.chineseText}`)
    const prevData = (cell.getData() as Record<string, unknown>) || {}
    node.setData({ ...prevData, originalText: data.originalText, chineseText: data.chineseText, nodeType: data.nodeType })

    if (data.nodeType) {
      const style = getDefaultNodeStyle(data.nodeType)
      engine.updateNodeStyle(editCellId.value, {
        fill: style.fill,
        stroke: style.stroke,
      })
    }
  } else {
    const edge = cell as unknown as { getLabels: () => unknown[]; setLabels: (labels: unknown[]) => void; setData: (data: Record<string, unknown>) => void }
    const labels = edge.getLabels()
    if (labels.length > 0) {
      edge.setLabels([{
        ...labels[0],
        attrs: {
          label: { text: `${data.originalText}\n${data.chineseText}` },
        },
      }])
    }
    const prevData = (cell.getData() as Record<string, unknown>) || {}
    edge.setData({ ...prevData, originalText: data.originalText, chineseText: data.chineseText, relationType: data.relationType })

    if (data.relationType) {
      const style = getDefaultEdgeStyle(data.relationType)
      engine.updateEdgeStyle(editCellId.value, {
        stroke: style.stroke,
        strokeDasharray: style.strokeDasharray,
        arrowType: style.arrowType,
      })
    }
  }
}
</script>

<style scoped>
.graph-canvas {
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
}

.canvas-viewport {
  width: 100%;
  height: 100%;
}

.canvas-status {
  position: absolute;
  bottom: 12px;
  right: 12px;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 10px;
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  box-shadow: var(--shadow-sm);
}

.zoom-label {
  font-size: var(--font-size-xs);
  color: var(--text-tertiary);
  min-width: 36px;
  text-align: center;
}

.context-menu {
  position: fixed;
  z-index: 1000;
  min-width: 140px;
  padding: 4px 0;
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-lg);
}

.menu-item {
  padding: 6px 16px;
  font-size: var(--font-size-sm);
  color: var(--text-primary);
  cursor: pointer;
  transition: background 0.15s;
}

.menu-item:hover {
  background: var(--color-primary-bg);
  color: var(--color-primary);
}

.menu-divider {
  height: 1px;
  margin: 4px 0;
  background: var(--border-color-light);
}
</style>
