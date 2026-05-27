import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { AIProviderType, ConnectionTestResult, TranslationConfig } from '@/types/ai'
import { getDefaultBaseUrl, getDefaultModels } from '@/services/ai/client'

interface ProviderConfig {
  apiKey: string
  baseUrl: string
  models: string[]
  defaultModel: string
}

const STORAGE_KEY = 'patent2pic-ai-config'
const TRANSLATION_STORAGE_KEY = 'patent2pic-translation-config'

function loadFromStorage(): Record<string, ProviderConfig> | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

function saveToStorage(config: Record<string, ProviderConfig>): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(config))
}

function createDefaultConfig(type: AIProviderType): ProviderConfig {
  return {
    apiKey: '',
    baseUrl: getDefaultBaseUrl(type),
    models: getDefaultModels(type),
    defaultModel: getDefaultModels(type)[0] || '',
  }
}

function loadTranslationConfig(): TranslationConfig {
  try {
    const raw = localStorage.getItem(TRANSLATION_STORAGE_KEY)
    if (raw) return JSON.parse(raw)
  } catch {}
  return {
    enabled: true,
    useSeparateModel: false,
    providerType: 'zhipu',
    model: 'glm-4-flash',
    targetLanguage: 'zh-CN',
    autoTranslate: true,
  }
}

function saveTranslationConfig(config: TranslationConfig): void {
  localStorage.setItem(TRANSLATION_STORAGE_KEY, JSON.stringify(config))
}

export const useAIStore = defineStore('ai', () => {
  const activeProviderType = ref<AIProviderType>('zhipu')
  const providers = ref<Record<string, ProviderConfig>>({
    openai: createDefaultConfig('openai'),
    zhipu: createDefaultConfig('zhipu'),
    deepseek: createDefaultConfig('deepseek'),
  })

  const saved = loadFromStorage()
  if (saved) {
    for (const [key, value] of Object.entries(saved)) {
      if (providers.value[key]) {
        providers.value[key] = { ...providers.value[key], ...value }
      }
    }
  }

  const activeProvider = computed(() => providers.value[activeProviderType.value])

  const activeApiKey = computed(() => activeProvider.value?.apiKey || '')
  const activeBaseUrl = computed(() => activeProvider.value?.baseUrl || '')
  const activeModel = computed(() => activeProvider.value?.defaultModel || '')
  const activeModels = computed(() => activeProvider.value?.models || [])

  const isExtracting = ref(false)
  const extractError = ref<string | null>(null)
  const extractStreamContent = ref('')

  const isTesting = ref(false)
  const testResult = ref<ConnectionTestResult | null>(null)

  const translationConfig = ref<TranslationConfig>(loadTranslationConfig())

  const translationProvider = computed(() => {
    if (!translationConfig.value.useSeparateModel) return activeProvider.value
    return providers.value[translationConfig.value.providerType]
  })

  const translationApiKey = computed(() => translationProvider.value?.apiKey || '')
  const translationBaseUrl = computed(() => translationProvider.value?.baseUrl || '')
  const translationModel = computed(() => {
    if (!translationConfig.value.useSeparateModel) return activeModel.value
    return translationConfig.value.model
  })

  function updateTranslationConfig(partial: Partial<TranslationConfig>): void {
    translationConfig.value = { ...translationConfig.value, ...partial }
    saveTranslationConfig(translationConfig.value)
  }

  function setActiveProvider(type: AIProviderType): void {
    activeProviderType.value = type
    testResult.value = null
  }

  function updateApiKey(type: AIProviderType, apiKey: string): void {
    if (providers.value[type]) {
      providers.value[type].apiKey = apiKey
      persist()
    }
  }

  function updateBaseUrl(type: AIProviderType, baseUrl: string): void {
    if (providers.value[type]) {
      providers.value[type].baseUrl = baseUrl
      persist()
    }
  }

  function updateDefaultModel(type: AIProviderType, model: string): void {
    if (providers.value[type]) {
      providers.value[type].defaultModel = model
      if (!providers.value[type].models.includes(model)) {
        providers.value[type].models.push(model)
      }
      persist()
    }
  }

  function addModel(type: AIProviderType, modelName: string): void {
    if (providers.value[type] && !providers.value[type].models.includes(modelName)) {
      providers.value[type].models.push(modelName)
      persist()
    }
  }

  function removeModel(type: AIProviderType, modelName: string): void {
    if (providers.value[type]) {
      providers.value[type].models = providers.value[type].models.filter(m => m !== modelName)
      if (providers.value[type].defaultModel === modelName) {
        providers.value[type].defaultModel = providers.value[type].models[0] || ''
      }
      persist()
    }
  }

  function resetToDefault(type: AIProviderType): void {
    providers.value[type] = createDefaultConfig(type)
    persist()
  }

  function persist(): void {
    saveToStorage(providers.value)
  }

  return {
    activeProviderType,
    providers,
    activeProvider,
    activeApiKey,
    activeBaseUrl,
    activeModel,
    activeModels,
    isExtracting,
    extractError,
    extractStreamContent,
    isTesting,
    testResult,
    translationConfig,
    translationProvider,
    translationApiKey,
    translationBaseUrl,
    translationModel,
    setActiveProvider,
    updateApiKey,
    updateBaseUrl,
    updateDefaultModel,
    addModel,
    removeModel,
    resetToDefault,
    updateTranslationConfig,
  }
})
