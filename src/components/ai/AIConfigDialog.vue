<template>
  <el-dialog
    :model-value="visible"
    @update:model-value="$emit('update:visible', $event)"
    title="API 配置"
    width="560px"
    :close-on-click-modal="false"
    destroy-on-close
  >
    <div class="ai-config">
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
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { QuestionFilled } from '@element-plus/icons-vue'
import { useAIStore } from '@/stores/ai'
import { testConnection, getDefaultBaseUrl } from '@/services/ai/client'
import type { AIProviderType } from '@/types/ai'

defineProps<{ visible: boolean }>()
defineEmits<{ 'update:visible': [value: boolean] }>()

const aiStore = useAIStore()

const providerTypes: { type: AIProviderType; label: string }[] = [
  { type: 'zhipu', label: '智谱 (GLM)' },
  { type: 'deepseek', label: 'DeepSeek' },
  { type: 'openai', label: 'OpenAI 兼容' },
]

const defaultUrl = computed(() => getDefaultBaseUrl(aiStore.activeProviderType))

const showAddModel = ref(false)
const newModelName = ref('')

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
</script>

<style scoped>
.ai-config {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-lg);
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
</style>
