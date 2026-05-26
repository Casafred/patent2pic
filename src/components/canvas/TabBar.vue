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
          v-if="graphStore.tabs.length > 1"
        >×</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useGraphStore } from '@/stores/graph'

const graphStore = useGraphStore()

function handleTabClick(id: string): void {
  graphStore.setActiveTab(id)
}

function handleTabClose(id: string): void {
  graphStore.removeTab(id)
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
