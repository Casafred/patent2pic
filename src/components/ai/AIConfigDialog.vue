<template>
  <el-dialog
    :model-value="visible"
    @update:model-value="$emit('update:visible', $event)"
    title="设置"
    width="640px"
    :close-on-click-modal="false"
    destroy-on-close
  >
    <div class="settings-tabs">
      <button
        v-for="tab in settingsTabs"
        :key="tab.key"
        :class="['settings-tab', { active: activeSettingsTab === tab.key }]"
        @click="activeSettingsTab = tab.key"
      >
        {{ tab.label }}
      </button>
    </div>

    <div v-if="activeSettingsTab === 'api'" class="ai-config">
      <div class="provider-tabs">
        <button
          v-for="p in providerTypes"
          :key="p.type"
          :class="['provider-tab', { active: aiStore.activeProviderType === p.type }]"
          @click="aiStore.setActiveProvider(p.type)"
        >
          <span class="provider-name">{{ p.label }}</span>
        </button>
      </div>

      <div class="config-form">
        <div class="form-group">
          <label>API Key</label>
          <div class="input-with-action">
            <el-input
              :model-value="aiStore.activeApiKey"
              @update:model-value="aiStore.updateApiKey(aiStore.activeProviderType, $event)"
              type="password"
              show-password
              placeholder="输入 API Key"
              size="default"
            />
          </div>
        </div>

        <div class="form-group">
          <label>
            API 端点
            <el-tooltip content="可自定义修改端点地址以适配代理或私有部署" placement="top">
              <el-icon :size="14" class="help-icon"><QuestionFilled /></el-icon>
            </el-tooltip>
          </label>
          <el-input
            :model-value="aiStore.activeBaseUrl"
            @update:model-value="aiStore.updateBaseUrl(aiStore.activeProviderType, $event)"
            placeholder="API Base URL"
            size="default"
          />
          <span class="field-hint">默认: {{ defaultUrl }}</span>
        </div>

        <div class="form-group">
          <label>模型</label>
          <div class="model-select-row">
            <el-select
              :model-value="aiStore.activeModel"
              @update:model-value="aiStore.updateDefaultModel(aiStore.activeProviderType, $event)"
              size="default"
              class="model-select"
              filterable
              allow-create
            >
              <el-option
                v-for="model in aiStore.activeModels"
                :key="model"
                :label="model"
                :value="model"
              />
            </el-select>
            <el-button size="default" @click="showAddModel = true">
              添加模型
            </el-button>
          </div>
          <div class="model-tags">
            <el-tag
              v-for="model in aiStore.activeModels"
              :key="model"
              :type="model === aiStore.activeModel ? '' : 'info'"
              size="small"
              closable
              :disable-transitions="false"
              @close="aiStore.removeModel(aiStore.activeProviderType, model)"
              @click="aiStore.updateDefaultModel(aiStore.activeProviderType, model)"
              class="model-tag"
            >
              {{ model }}
            </el-tag>
          </div>
        </div>

        <div class="form-group">
          <label>连通性测试</label>
          <div class="test-row">
            <el-button
              size="default"
              :loading="aiStore.isTesting"
              :disabled="!aiStore.activeApiKey || !aiStore.activeModel"
              @click="handleTestConnection"
            >
              {{ aiStore.isTesting ? '测试中...' : '测试连接' }}
            </el-button>
            <span v-if="aiStore.testResult" :class="['test-result', aiStore.testResult.success ? 'success' : 'error']">
              {{ aiStore.testResult.message }}
            </span>
          </div>
        </div>

        <div class="form-group">
          <el-button size="small" text type="warning" @click="handleReset">
            恢复默认设置
          </el-button>
        </div>
      </div>
    </div>

    <PromptSettings v-if="activeSettingsTab === 'prompt'" />

    <div v-if="activeSettingsTab === 'translation'" class="translation-config">
      <div class="config-form">
        <div class="form-group">
          <label>
            启用权利要求翻译
            <el-tooltip content="开启后，生成分解图时将同步翻译权利要求句子" placement="top">
              <el-icon :size="14" class="help-icon"><QuestionFilled /></el-icon>
            </el-tooltip>
          </label>
          <el-switch
            :model-value="aiStore.translationConfig.enabled"
            @update:model-value="aiStore.updateTranslationConfig({ enabled: $event })"
          />
        </div>

        <div class="form-group">
          <label>
            自动翻译
            <el-tooltip content="开启后，生成分解图时自动并行翻译；关闭后需手动点击翻译按钮" placement="top">
              <el-icon :size="14" class="help-icon"><QuestionFilled /></el-icon>
            </el-tooltip>
          </label>
          <el-switch
            :model-value="aiStore.translationConfig.autoTranslate"
            :disabled="!aiStore.translationConfig.enabled"
            @update:model-value="aiStore.updateTranslationConfig({ autoTranslate: $event })"
          />
        </div>

        <div class="form-group">
          <label>
            使用独立翻译模型
            <el-tooltip content="开启后可为翻译指定不同的模型（推荐使用轻量快速模型以降低成本）" placement="top">
              <el-icon :size="14" class="help-icon"><QuestionFilled /></el-icon>
            </el-tooltip>
          </label>
          <el-switch
            :model-value="aiStore.translationConfig.useSeparateModel"
            :disabled="!aiStore.translationConfig.enabled"
            @update:model-value="aiStore.updateTranslationConfig({ useSeparateModel: $event })"
          />
        </div>

        <template v-if="aiStore.translationConfig.useSeparateModel && aiStore.translationConfig.enabled">
          <div class="form-group">
            <label>翻译模型提供商</label>
            <div class="provider-tabs">
              <button
                v-for="p in providerTypes"
                :key="p.type"
                :class="['provider-tab', { active: aiStore.translationConfig.providerType === p.type }]"
                @click="aiStore.updateTranslationConfig({ providerType: p.type })"
              >
                <span class="provider-name">{{ p.label }}</span>
              </button>
            </div>
            <span class="field-hint">复用该提供商的 API Key 和端点配置</span>
          </div>

          <div class="form-group">
            <label>翻译模型</label>
            <el-select
              :model-value="aiStore.translationConfig.model"
              @update:model-value="aiStore.updateTranslationConfig({ model: $event })"
              size="default"
              class="model-select-full"
              filterable
              allow-create
            >
              <el-option
                v-for="model in translationModels"
                :key="model"
                :label="model"
                :value="model"
              />
            </el-select>
            <span class="field-hint">推荐轻量模型：glm-4-flash、deepseek-v4-flash</span>
          </div>

          <div class="form-group">
            <label>翻译连通性测试</label>
            <div class="test-row">
              <el-button
                size="default"
                :loading="isTranslationTesting"
                :disabled="!translationApiKey || !aiStore.translationConfig.model"
                @click="handleTestTranslationConnection"
              >
                {{ isTranslationTesting ? '测试中...' : '测试翻译连接' }}
              </el-button>
              <span v-if="translationTestResult" :class="['test-result', translationTestResult.success ? 'success' : 'error']">
                {{ translationTestResult.message }}
              </span>
            </div>
          </div>
        </template>

        <div class="form-group">
          <label>目标语言</label>
          <el-select
            :model-value="aiStore.translationConfig.targetLanguage"
            @update:model-value="aiStore.updateTranslationConfig({ targetLanguage: $event })"
            size="default"
            class="model-select-full"
            :disabled="!aiStore.translationConfig.enabled"
          >
            <el-option
              v-for="lang in targetLanguages"
              :key="lang.value"
              :label="lang.label"
              :value="lang.value"
            />
          </el-select>
        </div>

        <div class="form-group">
          <label>
            翻译提示词
            <el-tooltip content="自定义翻译提示词，{targetLanguage} 会被替换为目标语言名称" placement="top">
              <el-icon :size="14" class="help-icon"><QuestionFilled /></el-icon>
            </el-tooltip>
          </label>
          <el-input
            v-model="translationPrompt"
            type="textarea"
            :rows="4"
            placeholder="翻译提示词"
            @change="handleTranslationPromptChange"
          />
          <el-button size="small" text type="warning" @click="resetTranslationPrompt" style="align-self: flex-start;">
            恢复默认
          </el-button>
        </div>
      </div>
    </div>

    <div v-if="activeSettingsTab === 'logs'" class="logs-panel">
      <div class="logs-header">
        <span class="logs-count">共 {{ aiStore.extractLogs.length }} 条记录</span>
        <el-button size="small" type="danger" text @click="handleClearLogs">清空日志</el-button>
      </div>

      <div v-if="aiStore.extractLogs.length === 0" class="logs-empty">
        暂无调用记录
      </div>

      <div v-else class="logs-list">
        <div
          v-for="log in aiStore.extractLogs"
          :key="log.id"
          :class="['log-item', { 'log-error': log.status === 'error' }]"
        >
          <div class="log-header">
            <span :class="['log-status', log.status]">{{ log.status === 'success' ? '✓ 成功' : '✗ 失败' }}</span>
            <span class="log-provider">{{ getProviderLabel(log.provider) }}</span>
            <span class="log-model">{{ log.model }}</span>
            <span v-if="log.durationMs > 0" class="log-duration">⏱ {{ formatDuration(log.durationMs) }}</span>
            <span class="log-time">{{ log.timestamp }}</span>
          </div>
          <div v-if="log.errorMessage" class="log-error-msg">错误: {{ log.errorMessage }}</div>
          <div class="log-preview">权利要求: {{ log.claimPreview }}...</div>
          <div class="log-actions">
            <el-button size="small" text type="primary" @click="handleViewLog(log)">查看原始响应</el-button>
            <el-button size="small" text @click="handleCopyLog(log)">复制</el-button>
          </div>
        </div>
      </div>
    </div>

    <el-dialog
      v-model="showAddModel"
      title="添加模型"
      width="360px"
      append-to-body
    >
      <el-input
        v-model="newModelName"
        placeholder="输入模型名称，如 gpt-4o-2024-08-06"
        size="default"
        @keyup.enter="handleAddModel"
      />
      <template #footer>
        <el-button @click="showAddModel = false">取消</el-button>
        <el-button type="primary" :disabled="!newModelName.trim()" @click="handleAddModel">添加</el-button>
      </template>
    </el-dialog>

    <el-dialog
      v-model="showLogDetail"
      title="AI 原始响应"
      width="700px"
      append-to-body
    >
      <div class="log-detail-info">
        <span>服务商: {{ selectedLog ? getProviderLabel(selectedLog.provider) : '' }}</span>
        <span>模型: {{ selectedLog?.model }}</span>
        <span>状态: {{ selectedLog?.status === 'success' ? '成功' : '失败' }}</span>
        <span v-if="selectedLog?.errorMessage" class="log-error-msg">错误: {{ selectedLog.errorMessage }}</span>
      </div>
      <pre class="log-detail-content">{{ selectedLog?.rawResponse }}</pre>
      <template #footer>
        <el-button @click="handleCopyLog(selectedLog!)">复制内容</el-button>
        <el-button type="primary" @click="showLogDetail = false">关闭</el-button>
      </template>
    </el-dialog>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { QuestionFilled } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import { useAIStore, type ExtractLog } from '@/stores/ai'
import { testConnection, getDefaultBaseUrl, getDefaultModels } from '@/services/ai/client'
import type { AIProviderType, ConnectionTestResult } from '@/types/ai'
import { TARGET_LANGUAGE_LABELS } from '@/types/translation'
import type { TranslationTargetLanguage } from '@/types/translation'
import PromptSettings from './PromptSettings.vue'
import {
  getTranslationSystemPrompt,
  setTranslationSystemPrompt,
  getDefaultTranslationSystemPrompt,
} from '@/services/ai/translation'

defineProps<{ visible: boolean }>()
defineEmits<{ 'update:visible': [value: boolean] }>()

const aiStore = useAIStore()

const activeSettingsTab = ref<'api' | 'prompt' | 'logs' | 'translation'>('api')

const settingsTabs = [
  { key: 'api' as const, label: 'API 配置' },
  { key: 'prompt' as const, label: '提示词设置' },
  { key: 'translation' as const, label: '翻译设置' },
  { key: 'logs' as const, label: '调用日志' },
]

const providerTypes: { type: AIProviderType; label: string }[] = [
  { type: 'zhipu', label: '智谱 (GLM)' },
  { type: 'deepseek', label: 'DeepSeek' },
  { type: 'openai', label: 'OpenAI 兼容' },
]

const providerLabelMap: Record<AIProviderType, string> = {
  zhipu: '智谱',
  deepseek: 'DeepSeek',
  openai: 'OpenAI',
}

const defaultUrl = computed(() => getDefaultBaseUrl(aiStore.activeProviderType))

const targetLanguages = Object.entries(TARGET_LANGUAGE_LABELS).map(([value, label]) => ({
  value: value as TranslationTargetLanguage,
  label,
}))

const translationModels = computed(() => {
  const providerType = aiStore.translationConfig.providerType
  const provider = aiStore.providers[providerType]
  if (!provider) return getDefaultModels(providerType)
  return provider.models
})

const translationApiKey = computed(() => {
  const providerType = aiStore.translationConfig.providerType
  return aiStore.providers[providerType]?.apiKey || ''
})

const showAddModel = ref(false)
const newModelName = ref('')
const showLogDetail = ref(false)
const selectedLog = ref<ExtractLog | null>(null)

const isTranslationTesting = ref(false)
const translationTestResult = ref<ConnectionTestResult | null>(null)

const translationPrompt = ref(getTranslationSystemPrompt())

function getProviderLabel(type: AIProviderType): string {
  return providerLabelMap[type] || type
}

function formatDuration(ms: number): string {
  if (ms < 1000) {
    return `${Math.round(ms)}ms`
  }
  if (ms < 60000) {
    return `${(ms / 1000).toFixed(2)}s`
  }
  const minutes = Math.floor(ms / 60000)
  const seconds = ((ms % 60000) / 1000).toFixed(1)
  return `${minutes}m ${seconds}s`
}

async function handleTestConnection(): Promise<void> {
  aiStore.isTesting = true
  aiStore.testResult = null
  try {
    const result = await testConnection(
      aiStore.activeProviderType,
      aiStore.activeApiKey,
      aiStore.activeBaseUrl,
      aiStore.activeModel,
    )
    aiStore.testResult = result
  } catch (err) {
    aiStore.testResult = {
      success: false,
      message: `测试失败: ${(err as Error).message}`,
    }
  } finally {
    aiStore.isTesting = false
  }
}

function handleAddModel(): void {
  const name = newModelName.value.trim()
  if (name) {
    aiStore.addModel(aiStore.activeProviderType, name)
    aiStore.updateDefaultModel(aiStore.activeProviderType, name)
    newModelName.value = ''
    showAddModel.value = false
  }
}

function handleReset(): void {
  aiStore.resetToDefault(aiStore.activeProviderType)
  aiStore.testResult = null
}

async function handleTestTranslationConnection(): Promise<void> {
  isTranslationTesting.value = true
  translationTestResult.value = null
  try {
    const providerType = aiStore.translationConfig.providerType
    const apiKey = aiStore.providers[providerType]?.apiKey || ''
    const baseUrl = aiStore.providers[providerType]?.baseUrl || ''
    const model = aiStore.translationConfig.model
    const result = await testConnection(providerType, apiKey, baseUrl, model)
    translationTestResult.value = result
  } catch (err) {
    translationTestResult.value = {
      success: false,
      message: `测试失败: ${(err as Error).message}`,
    }
  } finally {
    isTranslationTesting.value = false
  }
}

function handleTranslationPromptChange(): void {
  setTranslationSystemPrompt(translationPrompt.value)
}

function resetTranslationPrompt(): void {
  translationPrompt.value = getDefaultTranslationSystemPrompt()
  setTranslationSystemPrompt(translationPrompt.value)
}

function handleViewLog(log: ExtractLog): void {
  selectedLog.value = log
  showLogDetail.value = true
}

async function handleCopyLog(log: ExtractLog): Promise<void> {
  try {
    await navigator.clipboard.writeText(log.rawResponse)
    ElMessage.success('已复制到剪贴板')
  } catch {
    ElMessage.error('复制失败')
  }
}

function handleClearLogs(): void {
  aiStore.clearExtractLogs()
}
</script>

<style scoped>
.settings-tabs {
  display: flex;
  gap: var(--spacing-xs);
  padding: var(--spacing-xs);
  background: var(--bg-tertiary);
  border-radius: var(--radius-md);
  margin-bottom: var(--spacing-md);
}

.settings-tab {
  flex: 1;
  padding: var(--spacing-sm) var(--spacing-md);
  border: none;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--text-secondary);
  font-size: var(--font-size-sm);
  cursor: pointer;
  transition: all 0.2s;
}

.settings-tab.active {
  background: var(--bg-secondary);
  color: var(--color-primary);
  font-weight: 600;
  box-shadow: var(--shadow-sm);
}

.settings-tab:hover:not(.active) {
  color: var(--text-primary);
}

.ai-config {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-lg);
}

.translation-config {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-md);
}

.provider-tabs {
  display: flex;
  gap: var(--spacing-xs);
  padding: var(--spacing-xs);
  background: var(--bg-tertiary);
  border-radius: var(--radius-md);
}

.provider-tab {
  flex: 1;
  padding: var(--spacing-sm) var(--spacing-md);
  border: none;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--text-secondary);
  font-size: var(--font-size-sm);
  cursor: pointer;
  transition: all 0.2s;
}

.provider-tab.active {
  background: var(--bg-secondary);
  color: var(--color-primary);
  font-weight: 600;
  box-shadow: var(--shadow-sm);
}

.provider-tab:hover:not(.active) {
  color: var(--text-primary);
}

.config-form {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-md);
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-xs);
}

.form-group label {
  font-size: var(--font-size-sm);
  font-weight: 500;
  color: var(--text-secondary);
  display: flex;
  align-items: center;
  gap: 4px;
}

.help-icon {
  color: var(--text-tertiary);
  cursor: help;
}

.field-hint {
  font-size: var(--font-size-xs);
  color: var(--text-tertiary);
}

.model-select-row {
  display: flex;
  gap: var(--spacing-sm);
}

.model-select {
  flex: 1;
}

.model-select-full {
  width: 100%;
}

.model-tags {
  display: flex;
  flex-wrap: wrap;
  gap: var(--spacing-xs);
  margin-top: var(--spacing-xs);
}

.model-tag {
  cursor: pointer;
}

.test-row {
  display: flex;
  align-items: center;
  gap: var(--spacing-md);
}

.test-result {
  font-size: var(--font-size-sm);
}

.test-result.success {
  color: var(--color-success);
}

.test-result.error {
  color: var(--color-danger);
}

.logs-panel {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-sm);
}

.logs-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.logs-count {
  font-size: var(--font-size-xs);
  color: var(--text-tertiary);
}

.logs-empty {
  text-align: center;
  padding: 40px 0;
  color: var(--text-tertiary);
  font-size: var(--font-size-sm);
}

.logs-list {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-xs);
  max-height: 400px;
  overflow-y: auto;
}

.log-item {
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  padding: var(--spacing-sm) var(--spacing-md);
  background: var(--bg-primary);
}

.log-item.log-error {
  border-left: 3px solid var(--color-danger);
}

.log-header {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  flex-wrap: wrap;
}

.log-status {
  font-size: var(--font-size-xs);
  font-weight: 600;
}

.log-status.success {
  color: var(--color-success);
}

.log-status.error {
  color: var(--color-danger);
}

.log-provider,
.log-model {
  font-size: var(--font-size-xs);
  color: var(--text-secondary);
  background: var(--bg-tertiary);
  padding: 1px 6px;
  border-radius: 3px;
}

.log-time {
  font-size: var(--font-size-xs);
  color: var(--text-tertiary);
  margin-left: auto;
}

.log-duration {
  font-size: var(--font-size-xs);
  color: var(--color-primary);
  background: var(--bg-tertiary);
  padding: 1px 6px;
  border-radius: 3px;
  font-variant-numeric: tabular-nums;
}

.log-error-msg {
  font-size: var(--font-size-xs);
  color: var(--color-danger);
  margin-top: 4px;
}

.log-preview {
  font-size: var(--font-size-xs);
  color: var(--text-tertiary);
  margin-top: 4px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.log-actions {
  display: flex;
  gap: var(--spacing-xs);
  margin-top: 4px;
}

.log-detail-info {
  display: flex;
  flex-wrap: wrap;
  gap: var(--spacing-md);
  font-size: var(--font-size-sm);
  color: var(--text-secondary);
  margin-bottom: var(--spacing-md);
}

.log-detail-content {
  background: var(--bg-tertiary);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  padding: var(--spacing-md);
  font-size: 11px;
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-word;
  max-height: 400px;
  overflow-y: auto;
  margin: 0;
  font-family: 'Consolas', 'Courier New', monospace;
}
</style>
