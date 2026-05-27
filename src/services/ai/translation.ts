import type { ChatMessage } from '@/types/ai'
import type { TranslationTargetLanguage } from '@/types/translation'
import { TARGET_LANGUAGE_LABELS } from '@/types/translation'

const DEFAULT_TRANSLATION_SYSTEM_PROMPT = `你是一个专业的专利文献翻译专家。请将用户提供的专利权利要求句子翻译为{targetLanguage}。

翻译要求：
1. 严格保持技术术语的准确性和一致性
2. 保留原文的逻辑结构和限定关系
3. "所述"、"上述"等指代词需翻译为对应的表达
4. 专利术语如"comprising"、"including"等需使用规范的专利翻译用语
5. 只输出翻译结果，不要输出任何解释或注释
6. 保持与原文一致的标点风格`

const TRANSLATION_PROMPT_STORAGE_KEY = 'patent2pic-translation-prompt'

let _translationSystemPrompt: string = DEFAULT_TRANSLATION_SYSTEM_PROMPT

function loadTranslationPrompt(): void {
  try {
    const raw = localStorage.getItem(TRANSLATION_PROMPT_STORAGE_KEY)
    if (raw) {
      const data = JSON.parse(raw)
      if (data.systemPrompt) _translationSystemPrompt = data.systemPrompt
    }
  } catch {}
}

function saveTranslationPrompt(): void {
  localStorage.setItem(TRANSLATION_PROMPT_STORAGE_KEY, JSON.stringify({
    systemPrompt: _translationSystemPrompt,
  }))
}

loadTranslationPrompt()

export function buildTranslationMessages(
  originalText: string,
  targetLanguage: TranslationTargetLanguage,
): ChatMessage[] {
  const langLabel = TARGET_LANGUAGE_LABELS[targetLanguage] || targetLanguage
  const systemContent = _translationSystemPrompt.replace('{targetLanguage}', langLabel)
  return [
    { role: 'system', content: systemContent },
    { role: 'user', content: originalText },
  ]
}

export function getTranslationSystemPrompt(): string {
  return _translationSystemPrompt
}

export function setTranslationSystemPrompt(prompt: string): void {
  _translationSystemPrompt = prompt
  saveTranslationPrompt()
}

export function getDefaultTranslationSystemPrompt(): string {
  return DEFAULT_TRANSLATION_SYSTEM_PROMPT
}
