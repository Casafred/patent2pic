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
            <el-dropdown-item command="svg">导出 SVG</el-dropdown-item>
            <el-dropdown-item command="json">导出 JSON</el-dropdown-item>
          </el-dropdown-menu>
        </template>
      </el-dropdown>
    </div>
  </div>
</template>

<script setup lang="ts">
import { RefreshLeft, RefreshRight, ArrowDown } from '@element-plus/icons-vue'
import { graphEngine } from '@/services/graph/engine'
import { useExport } from '@/composables/useExport'
import { useProjectFile } from '@/composables/useProjectFile'
import type { ExportFormat } from '@/types/app'

const engine = graphEngine
const { downloadFile } = useExport()
const { saveProject, loadProject } = useProjectFile()

function handleExport(format: string): void {
  downloadFile(format as ExportFormat)
}

async function handleSaveProject(): Promise<void> {
  await saveProject()
}

async function handleLoadProject(): Promise<void> {
  await loadProject()
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
</style>
