export type TranslationStatus = 'idle' | 'loading' | 'done' | 'error'

export type TranslationTargetLanguage = 'zh-CN' | 'en' | 'ja' | 'ko' | 'de' | 'fr'

export interface SentenceTranslation {
  sentenceId: string
  originalText: string
  translatedText: string
  status: TranslationStatus
  error: string | null
}

export interface ClaimTranslation {
  claimId: string
  sentences: SentenceTranslation[]
  overallStatus: TranslationStatus
}

export const TARGET_LANGUAGE_LABELS: Record<TranslationTargetLanguage, string> = {
  'zh-CN': '中文（简体）',
  'en': 'English',
  'ja': '日本語',
  'ko': '한국어',
  'de': 'Deutsch',
  'fr': 'Français',
}