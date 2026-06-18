import type { AIProviderType, ChatParams, ChatChunk, ConnectionTestResult } from '@/types/ai'
import type { AIProviderAdapter } from './providers/types'
import { OpenAIProvider } from './providers/openai'
import { ZhipuProvider } from './providers/zhipu'
import { DeepSeekProvider } from './providers/deepseek'

const providerMap: Record<AIProviderType, () => AIProviderAdapter> = {
  openai: () => new OpenAIProvider(),
  zhipu: () => new ZhipuProvider(),
  deepseek: () => new DeepSeekProvider(),
}

function getProvider(type: AIProviderType): AIProviderAdapter {
  const factory = providerMap[type]
  if (!factory) throw new Error(`不支持的 AI 提供商: ${type}`)
  return factory()
}

export async function* streamChat(
  providerType: AIProviderType,
  apiKey: string,
  baseUrl: string,
  params: ChatParams,
  signal?: AbortSignal,
): AsyncGenerator<ChatChunk> {
  const provider = getProvider(providerType)
  const enrichedParams: ChatParams & { _meta: { baseUrl: string; apiKey: string; signal?: AbortSignal } } = {
    ...params,
    _meta: { baseUrl, apiKey, signal },
  }
  yield* provider.chat(enrichedParams)
}

export async function testConnection(
  providerType: AIProviderType,
  apiKey: string,
  baseUrl: string,
  model: string,
): Promise<ConnectionTestResult> {
  const provider = getProvider(providerType)
  return provider.testConnection(apiKey, baseUrl, model)
}

export function getDefaultBaseUrl(providerType: AIProviderType): string {
  switch (providerType) {
    case 'openai': return 'https://api.openai.com'
    case 'zhipu': return 'https://open.bigmodel.cn/api/paas'
    case 'deepseek': return 'https://api.deepseek.com'
  }
}

export function getDefaultModels(providerType: AIProviderType): string[] {
  switch (providerType) {
    case 'openai': return ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-3.5-turbo']
    case 'zhipu': return ['glm-4.5', 'glm-4-plus', 'glm-5.1', 'glm-5', 'glm-4.7', 'glm-4.6']
    case 'deepseek': return ['deepseek-v4-flash', 'deepseek-v4-pro']
  }
}

export function getModelConcurrency(providerType: AIProviderType, model: string): number {
  switch (providerType) {
    case 'openai': return 5
    case 'zhipu': {
      if (model === 'glm-4.5') return 10
      if (model === 'glm-4-plus') return 20
      if (model === 'glm-5.1') return 3
      if (model === 'glm-5') return 2
      if (model === 'glm-4.7') return 2
      if (model === 'glm-4.6') return 3
      return 3
    }
    case 'deepseek': {
      if (model === 'deepseek-v4-flash') return 2500
      if (model === 'deepseek-v4-pro') return 500
      return 500
    }
    default: return 3
  }
}

export function getProviderDisplayName(providerType: AIProviderType): string {
  switch (providerType) {
    case 'openai': return 'OpenAI'
    case 'zhipu': return '智谱 (GLM)'
    case 'deepseek': return 'DeepSeek'
  }
}
