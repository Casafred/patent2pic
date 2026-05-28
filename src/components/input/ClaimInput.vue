<template>
  <div class="claim-input">
    <template v-if="!claimStore.isInputCollapsed">
      <div class="section-header">
        <h3>权利要求输入</h3>
        <div class="section-header-actions">
          <el-button
            v-if="hasGraphData"
            size="small"
            @click="claimStore.collapseInput()"
          >
            收起
          </el-button>
          <el-button
            size="small"
            type="primary"
            :disabled="!claimStore.rawText.trim() || aiStore.isExtracting || !aiStore.activeApiKey"
            @click="handleGenerate"
          >
            <el-icon v-if="aiStore.isExtracting" class="is-loading"><Loading /></el-icon>
            {{ aiStore.isExtracting ? '抽取中...' : '生成分解图' }}
          </el-button>
        </div>
      </div>

      <el-input
        v-model="claimStore.rawText"
        type="textarea"
        :rows="16"
        placeholder="请粘贴专利独立权利要求文本...&#10;&#10;支持同时粘贴多条独立权利要求，系统将自动识别分段。"
        resize="none"
        class="claim-textarea"
        @input="handleTextInput"
      />

      <div class="input-footer">
        <span class="char-count">{{ claimStore.rawText.length }} 字</span>
        <el-button size="small" text @click="claimStore.rawText = ''">清空</el-button>
      </div>

      <div v-if="claimStore.claims.length > 1" class="claim-list">
        <div class="claim-list-header">
          <h4>识别到 {{ claimStore.claims.length }} 条权利要求</h4>
        </div>
        <div
          v-for="claim in claimStore.claims"
          :key="claim.id"
          :class="['claim-item', { active: claim.id === claimStore.activeClaimId }]"
          @click="claimStore.setActiveClaim(claim.id)"
        >
          <span class="claim-index">{{ claim.index }}</span>
          <span class="claim-preview">{{ getClaimPreview(claim) }}</span>
        </div>
      </div>

      <div v-if="aiStore.isExtracting" class="extract-progress">
        <el-progress :percentage="100" :indeterminate="true" :show-text="false" />
        <div class="progress-row">
          <p class="progress-text">AI 正在分析权利要求结构...</p>
          <el-button size="small" type="danger" @click="abort">终止</el-button>
        </div>
      </div>

      <div v-if="extractError" class="extract-error">
        <el-alert :title="extractError" type="error" :closable="false" show-icon />
        <el-button size="small" type="primary" @click="handleGenerate" style="margin-top: 8px">重试</el-button>
      </div>
    </template>

    <template v-else>
      <div class="collapsed-bar" @click="claimStore.expandInput()">
        <div class="collapsed-info">
          <span class="collapsed-label">权利要求 {{ activeClaimIndex }}</span>
          <span class="collapsed-preview">{{ collapsedPreview }}</span>
        </div>
        <el-button size="small" text class="expand-btn">
          <el-icon><ArrowDown /></el-icon>
          展开
        </el-button>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { Loading, ArrowDown } from '@element-plus/icons-vue'
import { useClaimStore } from '@/stores/claim'
import { useAIStore } from '@/stores/ai'
import { useGraphStore } from '@/stores/graph'
import { useAIExtract } from '@/composables/useAIExtract'
import { parseClaims, getClaimPreview } from '@/services/claim/parser'

const claimStore = useClaimStore()
const aiStore = useAIStore()
const graphStore = useGraphStore()
const { extractActiveClaim, error: extractError, abort } = useAIExtract()

const activeClaimIndex = computed(() => {
  const claim = claimStore.getActiveClaim()
  return claim ? claim.index : ''
})

const collapsedPreview = computed(() => {
  const claim = claimStore.getActiveClaim()
  if (!claim) return ''
  const preview = getClaimPreview(claim)
  return preview.length > 40 ? preview.slice(0, 40) + '...' : preview
})

const hasGraphData = computed(() => {
  const tab = graphStore.activeTab
  return !!(tab?.extractResult || tab?.serializedGraph)
})

function handleTextInput(): void {
  const claims = parseClaims(claimStore.rawText)
  claimStore.setClaims(claims)
}

async function handleGenerate(): Promise<void> {
  if (!claimStore.rawText.trim()) return
  if (!aiStore.activeApiKey) return

  if (claimStore.claims.length === 0) {
    handleTextInput()
  }

  const result = await extractActiveClaim()
  if (result) {
    claimStore.collapseInput()
  }
}
</script>

<style scoped>
.claim-input {
  padding: var(--spacing-md);
  display: flex;
  flex-direction: column;
  gap: var(--spacing-sm);
}

.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.section-header-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.section-header h3 {
  font-size: var(--font-size-base);
  font-weight: 600;
  color: var(--text-primary);
}

.claim-textarea :deep(.el-textarea__inner) {
  font-size: var(--font-size-sm);
  line-height: 1.8;
  border-radius: var(--radius-md);
  border-color: var(--border-color);
}

.claim-textarea :deep(.el-textarea__inner):focus {
  border-color: var(--color-primary);
}

.input-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.char-count {
  font-size: var(--font-size-xs);
  color: var(--text-tertiary);
}

.claim-list {
  margin-top: var(--spacing-sm);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  overflow: hidden;
}

.claim-list-header {
  padding: var(--spacing-sm) var(--spacing-md);
  background: var(--bg-tertiary);
}

.claim-list-header h4 {
  font-size: var(--font-size-xs);
  font-weight: 600;
  color: var(--text-secondary);
}

.claim-item {
  display: flex;
  align-items: flex-start;
  gap: var(--spacing-sm);
  padding: var(--spacing-sm) var(--spacing-md);
  cursor: pointer;
  border-top: 1px solid var(--border-color-light);
  transition: background 0.15s;
}

.claim-item:hover {
  background: var(--bg-tertiary);
}

.claim-item.active {
  background: var(--color-primary-bg);
  border-left: 3px solid var(--color-primary);
}

.claim-index {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 20px;
  height: 20px;
  border-radius: 10px;
  background: var(--color-primary);
  color: white;
  font-size: 11px;
  font-weight: 600;
  flex-shrink: 0;
}

.claim-preview {
  font-size: var(--font-size-xs);
  color: var(--text-secondary);
  line-height: 1.5;
}

.extract-progress {
  margin-top: var(--spacing-sm);
}

.progress-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: var(--spacing-xs);
}

.progress-text {
  font-size: var(--font-size-xs);
  color: var(--text-tertiary);
  text-align: center;
  margin-top: var(--spacing-xs);
}

.extract-error {
  margin-top: var(--spacing-sm);
}

.collapsed-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  background: var(--bg-tertiary);
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: background 0.15s;
  border: 1px solid var(--border-color-light);
}

.collapsed-bar:hover {
  background: var(--color-primary-bg);
  border-color: var(--color-primary);
}

.collapsed-info {
  display: flex;
  align-items: center;
  gap: 8px;
  overflow: hidden;
  flex: 1;
  min-width: 0;
}

.collapsed-label {
  font-size: var(--font-size-xs);
  font-weight: 600;
  color: var(--color-primary);
  white-space: nowrap;
  flex-shrink: 0;
}

.collapsed-preview {
  font-size: var(--font-size-xs);
  color: var(--text-tertiary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.expand-btn {
  flex-shrink: 0;
  color: var(--text-secondary) !important;
}
</style>
