import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { AIProviderType, ConnectionTestResult } from '@/types/ai'
import type { TranslationTargetLanguage } from '@/types/translation'
import { getDefaultBaseUrl, getDefaultModels } from '@/services/ai/client'

interface ProviderConfig {
  apiKey: string
  baseUrl: string
  models: string[]
  defaultModel: string
}

export interface TranslationConfig {
  enabled: boolean
  useSeparateModel: boolean
  providerType: AIProviderType
  model: string
  targetLanguage: TranslationTargetLanguage
  autoTranslate: boolean
}

const TRANSLATION_CONFIG_STORAGE_KEY = 'patent2pic-translation-config'

function loadTranslationConfig(): TranslationConfig {
  try {
    const stored = localStorage.getItem(TRANSLATION_CONFIG_STORAGE_KEY)
    if (stored) {
      return JSON.parse(stored)
    }
  } catch {
    // ignore
  }
  return {
    enabled: false,
    useSeparateModel: false,
    providerType: 'zhipu',
    model: '',
    targetLanguage: 'zh-CN',
    autoTranslate: true,
  }
}

function saveTranslationConfig(config: TranslationConfig): void {
  try {
    localStorage.setItem(TRANSLATION_CONFIG_STORAGE_KEY, JSON.stringify(config))
  } catch {
    // ignore
  }
}

export interface ExtractLog {
  id: string
  timestamp: string
  provider: AIProviderType
  model: string
  status: 'success' | 'error'
  rawResponse: string
  errorMessage?: string
  claimPreview: string
  durationMs: number
}

const STORAGE_KEY = 'patent2pic-ai-config'
const LOG_STORAGE_KEY = 'patent2pic-extract-logs'
const MAX_LOGS = 50

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

function loadLogsFromStorage(): ExtractLog[] {
  try {
    const raw = localStorage.getItem(LOG_STORAGE_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

function saveLogsToStorage(logs: ExtractLog[]): void {
  localStorage.setItem(LOG_STORAGE_KEY, JSON.stringify(logs.slice(0, MAX_LOGS)))
}

function createDefaultConfig(type: AIProviderType): ProviderConfig {
  return {
    apiKey: '',
    baseUrl: getDefaultBaseUrl(type),
    models: getDefaultModels(type),
    defaultModel: getDefaultModels(type)[0] || '',
  }
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

  const translationConfig = ref<TranslationConfig>(loadTranslationConfig())

  const translationProvider = computed(() => providers.value[translationConfig.value.providerType])
  const translationApiKey = computed(() => translationProvider.value?.apiKey || '')
  const translationBaseUrl = computed(() => translationProvider.value?.baseUrl || '')
  const translationModel = computed(() => {
    if (translationConfig.value.useSeparateModel && translationConfig.value.model) {
      return translationConfig.value.model
    }
    return translationProvider.value?.defaultModel || ''
  })
  const translationModels = computed(() => translationProvider.value?.models || [])

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

  const extractLogs = ref<ExtractLog[]>(loadLogsFromStorage())

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
      providers.value[type].models = providers.value[type].models.filter((m: string) => m !== modelName)
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

  function addExtractLog(log: Omit<ExtractLog, 'id' | 'timestamp'>): void {
    const entry: ExtractLog = {
      ...log,
      id: `log-${Date.now()}`,
      timestamp: new Date().toLocaleString('zh-CN'),
      durationMs: log.durationMs ?? 0,
    }
    extractLogs.value.unshift(entry)
    if (extractLogs.value.length > MAX_LOGS) {
      extractLogs.value = extractLogs.value.slice(0, MAX_LOGS)
    }
    saveLogsToStorage(extractLogs.value)
  }

  function clearExtractLogs(): void {
    extractLogs.value = []
    saveLogsToStorage([])
  }

  function updateTranslationConfig(partial: Partial<TranslationConfig>): void {
    translationConfig.value = { ...translationConfig.value, ...partial }
    saveTranslationConfig(translationConfig.value)
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
    extractLogs,
    translationConfig,
    translationProvider,
    translationApiKey,
    translationBaseUrl,
    translationModel,
    translationModels,
    setActiveProvider,
    updateApiKey,
    updateBaseUrl,
    updateDefaultModel,
    addModel,
    removeModel,
    resetToDefault,
    addExtractLog,
    clearExtractLogs,
    updateTranslationConfig,
  }
})
