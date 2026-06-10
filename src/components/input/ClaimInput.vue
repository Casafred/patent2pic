<template>
  <div class="claim-input">
    <template v-if="!claimStore.isInputCollapsed">
      <div class="section-header">
        <h3>权利要求输入</h3>
        <div class="section-header-right">
          <el-button
            v-if="hasGraphData"
            size="small"
            text
            @click="claimStore.collapseInput()"
          >
            <el-icon><ArrowUp /></el-icon>
            收起
          </el-button>
          <el-button
            size="small"
            type="primary"
            :disabled="!claimStore.rawText.trim() || aiStore.isExtracting || !aiStore.activeApiKey"
            @click="handleGenerate"
          >
            <el-icon v-if="aiStore.isExtracting && !parallelExtract.isRunning.value" class="is-loading"><Loading /></el-icon>
            {{ aiStore.isExtracting && !parallelExtract.isRunning.value ? '抽取中...' : '生成分解图' }}
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
          <div class="claim-list-header-row">
            <h4>识别到 {{ claimStore.claims.length }} 条权利要求</h4>
            <el-button
              size="small"
              type="success"
              :disabled="aiStore.isExtracting || !aiStore.activeApiKey"
              @click="handleParallelGenerate"
            >
              并行处理全部 ({{ parallelExtract.maxConcurrency.value }} 并发)
            </el-button>
          </div>
          <div class="concurrency-hint">
            <el-icon :size="12"><InfoFilled /></el-icon>
            当前模型 {{ aiStore.activeModel }} 最大并发: {{ parallelExtract.maxConcurrency.value }}
            <span v-if="parallelExtract.maxConcurrency.value < claimStore.claims.length" class="concurrency-warn">
              · 如需更高并发请选择并发数更高的模型
            </span>
          </div>
        </div>
        <div
          v-for="claim in claimStore.claims"
          :key="claim.id"
          :class="['claim-item', { active: claim.id === claimStore.activeClaimId }]"
          @click="claimStore.setActiveClaim(claim.id)"
        >
          <span class="claim-index">{{ claim.index }}</span>
          <span class="claim-preview">{{ getClaimPreview(claim) }}</span>
          <span v-if="getTaskForClaim(claim.id)" class="claim-task-status">
            <el-icon v-if="getTaskForClaim(claim.id)!.status === 'running'" class="is-loading" :size="14"><Loading /></el-icon>
            <el-icon v-else-if="getTaskForClaim(claim.id)!.status === 'success'" :size="14" style="color: #67c23a"><CircleCheckFilled /></el-icon>
            <el-icon v-else-if="getTaskForClaim(claim.id)!.status === 'error'" :size="14" style="color: #f56c6c"><CircleCloseFilled /></el-icon>
            <el-icon v-else-if="getTaskForClaim(claim.id)!.status === 'aborted'" :size="14" style="color: #909399"><CircleCloseFilled /></el-icon>
          </span>
        </div>
      </div>

      <!-- Single extraction progress -->
      <div v-if="aiStore.isExtracting && !parallelExtract.isRunning.value" class="extract-progress">
        <el-progress :percentage="100" :indeterminate="true" :show-text="false" />
        <div class="progress-row">
          <p class="progress-text">AI 正在分析权利要求结构...</p>
          <el-button size="small" type="danger" @click="abort">终止</el-button>
        </div>
      </div>

      <!-- Parallel extraction progress -->
      <div v-if="parallelExtract.isRunning.value" class="extract-progress">
        <el-progress
          :percentage="parallelProgress"
          :format="() => `${parallelExtract.completedCount.value}/${parallelExtract.totalCount.value}`"
        />
        <div class="progress-row">
          <p class="progress-text">
            并行处理中... {{ parallelExtract.completedCount.value }}/{{ parallelExtract.totalCount.value }} 完成
          </p>
          <el-button size="small" type="danger" @click="handleParallelAbort">终止全部</el-button>
        </div>
        <div class="parallel-tasks">
          <div
            v-for="task in parallelExtract.tasks.value"
            :key="task.claimId"
            :class="['parallel-task-item', task.status]"
          >
            <span class="task-index">{{ task.claimIndex }}</span>
            <el-progress
              :percentage="task.progress"
              :stroke-width="4"
              :show-text="false"
              :status="task.status === 'success' ? 'success' : task.status === 'error' ? 'exception' : undefined"
              class="task-progress"
            />
            <span class="task-status-text">
              {{ task.status === 'pending' ? '等待中' : task.status === 'running' ? '处理中' : task.status === 'success' ? '完成' : task.status === 'aborted' ? '已终止' : '失败' }}
            </span>
          </div>
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
import { Loading, ArrowDown, ArrowUp, InfoFilled, CircleCheckFilled, CircleCloseFilled } from '@element-plus/icons-vue'
import { useClaimStore } from '@/stores/claim'
import { useAIStore } from '@/stores/ai'
import { useGraphStore } from '@/stores/graph'
import { useAIExtract } from '@/composables/useAIExtract'
import { useParallelExtract } from '@/composables/useParallelExtract'
import { parseClaims, getClaimPreview } from '@/services/claim/parser'

const claimStore = useClaimStore()
const aiStore = useAIStore()
const graphStore = useGraphStore()
const { extractActiveClaim, error: extractError, abort } = useAIExtract()
const parallelExtract = useParallelExtract()

const hasGraphData = computed(() => {
  const tab = graphStore.activeTab
  return !!(tab?.extractResult || tab?.serializedGraph)
})

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

const parallelProgress = computed(() => {
  const total = parallelExtract.totalCount.value
  if (total === 0) return 0
  const done = parallelExtract.completedCount.value
  return Math.round((done / total) * 100)
})

function getTaskForClaim(claimId: string) {
  return parallelExtract.tasks.value.find(t => t.claimId === claimId)
}

function handleTextInput(): void {
  const claims = parseClaims(claimStore.rawText)
  claimStore.setClaims(claims)
}

async function handleGenerate(): Promise<void> {
  if (!claimStore.rawText.trim()) return
  if (!aiStore.activeApiKey) return

  // Ensure claims are parsed
  if (claimStore.claims.length === 0) {
    handleTextInput()
  }

  // Ensure activeClaimId points to an existing claim
  if (claimStore.claims.length > 0) {
    const activeExists = claimStore.claims.some(c => c.id === claimStore.activeClaimId)
    if (!activeExists) {
      claimStore.setActiveClaim(claimStore.claims[0].id)
    }
  }

  // If multiple claims are detected, use parallel processing
  if (claimStore.claims.length > 1) {
    await parallelExtract.runParallel(claimStore.claims)
    return
  }

  // Single claim: use single extraction
  const result = await extractActiveClaim()
  if (result) {
    claimStore.collapseInput()
  }
}

async function handleParallelGenerate(): Promise<void> {
  if (claimStore.claims.length === 0) {
    handleTextInput()
  }
  if (claimStore.claims.length === 0) return
  if (!aiStore.activeApiKey) return

  await parallelExtract.runParallel(claimStore.claims)
}

function handleParallelAbort(): void {
  parallelExtract.abortAll()
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

.section-header-right {
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

.claim-list-header-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.claim-list-header h4 {
  font-size: var(--font-size-xs);
  font-weight: 600;
  color: var(--text-secondary);
}

.concurrency-hint {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-top: 6px;
  font-size: 11px;
  color: var(--text-tertiary);
}

.concurrency-warn {
  color: #e6a23c;
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
  flex: 1;
  min-width: 0;
}

.claim-task-status {
  flex-shrink: 0;
  display: flex;
  align-items: center;
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

.parallel-tasks {
  margin-top: 8px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.parallel-task-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 2px 0;
}

.parallel-task-item .task-index {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 18px;
  height: 18px;
  border-radius: 9px;
  font-size: 10px;
  font-weight: 600;
  flex-shrink: 0;
  background: var(--border-color);
  color: var(--text-secondary);
}

.parallel-task-item.success .task-index {
  background: #67c23a;
  color: white;
}

.parallel-task-item.error .task-index {
  background: #f56c6c;
  color: white;
}

.parallel-task-item.running .task-index {
  background: var(--color-primary);
  color: white;
}

.task-progress {
  flex: 1;
}

.task-status-text {
  font-size: 11px;
  color: var(--text-tertiary);
  min-width: 36px;
  text-align: right;
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
