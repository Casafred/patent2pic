export type AIProviderType = 'openai' | 'zhipu' | 'deepseek'

export interface AIProviderConfig {
  type: AIProviderType
  name: string
  apiKey: string
  baseUrl: string
  models: AIModelConfig[]
  defaultModel: string
}

export interface AIModelConfig {
  id: string
  name: string
  enabled: boolean
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface ChatParams {
  model: string
  messages: ChatMessage[]
  temperature?: number
  maxTokens?: number
  stream?: boolean
  responseFormat?: { type: 'json_object' } | { type: 'text' }
  thinking?: { type: 'enabled' | 'disabled' }
  reasoningEffort?: 'high' | 'max'
}

export interface ChatChunk {
  content: string
  done: boolean
}

export interface ExtractResult {
  claimId: string
  nodes: ExtractNode[]
  edges: ExtractEdge[]
  groups: ExtractGroup[]
}

export interface ExtractNode {
  id: string
  originalText: string
  chineseText: string
  nodeType: 'component' | 'subsystem' | 'feature'
  hierarchyLevel: number
  sourceSentence: string
}

export interface ExtractEdge {
  id: string
  source: string
  target: string
  originalText: string
  chineseText: string
  relationType: 'position' | 'action' | 'containment' | 'logical'
}

export interface ExtractGroup {
  id: string
  label: { original: string; chinese: string }
  memberNodeIds: string[]
}

export interface ConnectionTestResult {
  success: boolean
  message: string
  latency?: number
  modelInfo?: string
}
