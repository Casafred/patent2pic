<template>
  <div class="tab-bar" v-if="graphStore.tabs.length > 0">
    <div class="tab-bar-scroll">
      <div
        v-for="tab in graphStore.tabs"
        :key="tab.id"
        :class="['tab-item', { active: tab.id === graphStore.activeTabId }]"
        @click="handleTabClick(tab.id)"
      >
        <span class="tab-name" :title="tab.name">{{ tab.name }}</span>
        <span
          class="tab-close"
          @click.stop="handleTabClose(tab.id)"
        >×</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useGraphStore } from '@/stores/graph'
import { ElMessageBox } from 'element-plus'
import { useProjectFile } from '@/composables/useProjectFile'
import { graphEngine } from '@/services/graph/engine'

const graphStore = useGraphStore()
const { saveProject } = useProjectFile()

function handleTabClick(id: string): void {
  graphStore.setActiveTab(id)
}

async function handleTabClose(id: string): Promise<void> {
  const tab = graphStore.tabs.find((t: { id: string }) => t.id === id)
  if (!tab) return

  // If this is the last tab, clear it to empty state instead of closing
  if (graphStore.tabs.length <= 1) {
    const graph = graphEngine.getGraph()
    if (graph) {
      graph.clearCells()
    }
    graphStore.clearActiveTabGraph()
    return
  }

  try {
    await ElMessageBox.confirm(
      '关闭标签页前是否保存当前项目？未保存的修改将会丢失。',
      '保存提醒',
      {
        confirmButtonText: '保存并关闭',
        cancelButtonText: '直接关闭',
        distinguishCancelAndClose: true,
        type: 'warning',
      },
    )
    await saveProject()
    graphStore.removeTab(id)
  } catch (action: unknown) {
    if (action === 'cancel') {
      graphStore.removeTab(id)
    }
  }
}
</script>

<style scoped>
.tab-bar {
  display: flex;
  align-items: center;
  height: 36px;
  background: var(--bg-tertiary, #e8eaed);
  border-bottom: 1px solid var(--border-color);
  overflow: hidden;
}

.tab-bar-scroll {
  display: flex;
  align-items: flex-end;
  height: 100%;
  overflow-x: auto;
  overflow-y: hidden;
  scrollbar-width: none;
}

.tab-bar-scroll::-webkit-scrollbar {
  display: none;
}

.tab-item {
  display: flex;
  align-items: center;
  gap: 4px;
  height: 30px;
  padding: 0 12px;
  margin: 6px 1px 0;
  background: var(--bg-secondary, #f0f0f0);
  border: 1px solid var(--border-color);
  border-bottom: none;
  border-radius: 6px 6px 0 0;
  cursor: pointer;
  white-space: nowrap;
  user-select: none;
  transition: background 0.15s;
  max-width: 180px;
}

.tab-item:hover {
  background: var(--bg-primary, #fff);
}

.tab-item.active {
  background: var(--bg-primary, #fff);
  border-color: var(--border-color);
  height: 32px;
  margin-top: 4px;
}

.tab-name {
  font-size: 12px;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 140px;
}

.tab-close {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  font-size: 14px;
  line-height: 1;
  color: var(--text-tertiary);
  border-radius: 50%;
  flex-shrink: 0;
  transition: all 0.15s;
}

.tab-close:hover {
  background: var(--border-color);
  color: var(--text-primary);
}
</style>
