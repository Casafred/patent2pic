export type ExportFormat = 'png' | 'svg' | 'p2p' | 'html'

export interface ExportOptions {
  format: ExportFormat
  padding: number
  background: string
  quality: number
  watermark?: string
}

export interface AppConfig {
  ai: {
    activeProviderType: string
    providers: Record<string, AIProviderSettings>
  }
  graph: {
    defaultLayout: 'dagre' | 'force'
  }
  editor: {
    autoSave: boolean
    maxHistorySize: number
  }
}

export interface AIProviderSettings {
  apiKey: string
  baseUrl: string
  models: string[]
  defaultModel: string
}
