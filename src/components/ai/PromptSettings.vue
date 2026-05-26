<template>
  <div class="prompt-settings">
    <div class="prompt-section">
      <div class="section-header">
        <h4>系统提示词 (System Prompt)</h4>
        <el-button size="small" text type="warning" @click="resetSystemPrompt">恢复默认</el-button>
      </div>
      <p class="section-desc">定义 AI 的角色和行为规范，影响抽取结果的质量和格式</p>
      <el-input
        v-model="systemPrompt"
        type="textarea"
        :rows="8"
        placeholder="输入系统提示词"
        @change="handleSystemPromptChange"
      />
    </div>

    <div class="prompt-section">
      <div class="section-header">
        <h4>用户提示词模板 (User Prompt)</h4>
        <el-button size="small" text type="warning" @click="resetUserPrompt">恢复默认</el-button>
      </div>
      <p class="section-desc">定义发送给 AI 的具体指令，<code>{claimText}</code> 会被替换为实际权利要求文本</p>
      <el-input
        v-model="userPromptTemplate"
        type="textarea"
        :rows="10"
        placeholder="输入用户提示词模板"
        @change="handleUserPromptChange"
      />
    </div>

    <div class="prompt-actions">
      <el-button size="small" @click="resetAll">全部恢复默认</el-button>
      <el-button size="small" type="primary" @click="handlePreview">预览完整提示词</el-button>
    </div>

    <el-dialog
      v-model="showPreview"
      title="提示词预览"
      width="600px"
      append-to-body
    >
      <div class="preview-content">
        <div class="preview-section">
          <h5>System Prompt</h5>
          <pre class="preview-text">{{ systemPrompt }}</pre>
        </div>
        <div class="preview-section">
          <h5>User Prompt</h5>
          <pre class="preview-text">{{ userPromptTemplate.replace('{claimText}', '[权利要求文本将插入此处]') }}</pre>
        </div>
      </div>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import {
  getSystemPrompt,
  getUserPromptTemplate,
  setSystemPrompt,
  setUserPromptTemplate,
  getDefaultSystemPrompt,
  getDefaultUserPromptTemplate,
} from '@/services/ai/prompt'

const systemPrompt = ref('')
const userPromptTemplate = ref('')
const showPreview = ref(false)

onMounted(() => {
  systemPrompt.value = getSystemPrompt()
  userPromptTemplate.value = getUserPromptTemplate()
})

function handleSystemPromptChange(): void {
  setSystemPrompt(systemPrompt.value)
}

function handleUserPromptChange(): void {
  setUserPromptTemplate(userPromptTemplate.value)
}

function resetSystemPrompt(): void {
  systemPrompt.value = getDefaultSystemPrompt()
  setSystemPrompt(systemPrompt.value)
}

function resetUserPrompt(): void {
  userPromptTemplate.value = getDefaultUserPromptTemplate()
  setUserPromptTemplate(userPromptTemplate.value)
}

function resetAll(): void {
  resetSystemPrompt()
  resetUserPrompt()
}

function handlePreview(): void {
  showPreview.value = true
}
</script>

<style scoped>
.prompt-settings {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-lg);
}

.prompt-section {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-xs);
}

.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.section-header h4 {
  font-size: var(--font-size-sm);
  font-weight: 600;
  color: var(--text-secondary);
}

.section-desc {
  font-size: var(--font-size-xs);
  color: var(--text-tertiary);
  margin-bottom: var(--spacing-xs);
}

.section-desc code {
  background: var(--bg-tertiary);
  padding: 1px 4px;
  border-radius: 3px;
  font-size: var(--font-size-xs);
  color: var(--color-primary);
}

.prompt-actions {
  display: flex;
  gap: var(--spacing-sm);
  padding-top: var(--spacing-sm);
  border-top: 1px solid var(--border-color-light);
}

.preview-content {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-md);
}

.preview-section h5 {
  font-size: var(--font-size-sm);
  font-weight: 600;
  color: var(--text-secondary);
  margin-bottom: var(--spacing-xs);
}

.preview-text {
  background: var(--bg-tertiary);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  padding: var(--spacing-sm);
  font-size: var(--font-size-xs);
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-word;
  max-height: 300px;
  overflow-y: auto;
  margin: 0;
}
</style>
