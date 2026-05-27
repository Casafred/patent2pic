<template>
  <div class="title-bar" data-tauri-drag-region>
    <div class="title-bar-left" data-tauri-drag-region>
      <span class="app-icon">P2P</span>
      <span class="app-title">Patent2Pic</span>
    </div>
    <div class="title-bar-center" data-tauri-drag-region>
      专利功能分解图工具
    </div>
    <div class="title-bar-right">
      <button class="title-btn" @click="showAIConfig = true" title="API 设置">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <path d="M8 10a2 2 0 100-4 2 2 0 000 4z" stroke="currentColor" stroke-width="1.5"/>
          <path d="M13.5 8c0-.5-.1-1-.2-1.5l1.3-.8-1.5-2.5-1.3.8c-.7-.6-1.5-1-2.5-1.2V1.5H6.7v1.3c-1 .2-1.8.6-2.5 1.2l-1.3-.8-1.5 2.5 1.3.8c-.2.5-.2 1-.2 1.5s.1 1 .2 1.5l-1.3.8 1.5 2.5 1.3-.8c.7.6 1.5 1 2.5 1.2v1.3h2.6v-1.3c1-.2 1.8-.6 2.5-1.2l1.3.8 1.5-2.5-1.3-.8c.1-.5.2-1 .2-1.5z" stroke="currentColor" stroke-width="1.2"/>
        </svg>
      </button>
    </div>
  </div>
  <AIConfigDialog v-model:visible="showAIConfig" />
</template>

<script setup lang="ts">
import { ref } from 'vue'
import AIConfigDialog from '../ai/AIConfigDialog.vue'

const showAIConfig = ref(false)
</script>

<style scoped>
.title-bar {
  display: flex;
  align-items: center;
  height: 40px;
  padding: 0 12px;
  background: var(--bg-secondary);
  border-bottom: 1px solid var(--border-color);
  user-select: none;
}

.title-bar-left {
  display: flex;
  align-items: center;
  gap: 8px;
}

.app-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: var(--radius-sm);
  background: var(--color-primary);
  color: white;
  font-size: 10px;
  font-weight: bold;
}

.app-title {
  font-size: var(--font-size-base);
  font-weight: 600;
  color: var(--text-primary);
}

.title-bar-center {
  flex: 1;
  text-align: center;
  font-size: var(--font-size-sm);
  color: var(--text-tertiary);
}

.title-bar-right {
  display: flex;
  align-items: center;
  gap: 4px;
}

.title-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border: none;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
  transition: all 0.15s;
}

.title-btn:hover {
  background: var(--bg-tertiary);
  color: var(--color-primary);
}
</style>
