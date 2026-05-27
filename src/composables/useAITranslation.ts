import { useAIStore } from '@/stores/ai'
import { useClaimStore } from '@/stores/claim'
import { useTranslationStore } from '@/stores/translation'
import { streamChat } from '@/services/ai/client'
import { buildTranslationMessages } from '@/services/ai/translation'
import type { Claim, Sentence } from '@/types/claim'
import type { AIProviderType } from '@/types/ai'
import type { TranslationTargetLanguage } from '@/types/translation'

const MAX_CONCURRENT = 5

async function translateSentence(
  providerType: AIProviderType,
  apiKey: string,
  baseUrl: string,
  model: string,
  originalText: string,
  targetLanguage: TranslationTargetLanguage,
): Promise<string> {
  const messages = buildTranslationMessages(originalText, targetLanguage)
  let fullContent = ''
  for await (const chunk of streamChat(providerType, apiKey, baseUrl, {
    model,
    messages,
    temperature: 0.1,
    maxTokens: 1024,
    stream: true,
  })) {
    if (chunk.done) break
    fullContent += chunk.content
  }
  return fullContent.trim()
}

export function useAITranslation() {
  const aiStore = useAIStore()
  const claimStore = useClaimStore()
  const translationStore = useTranslationStore()

  async function translateAllSentences(claim: Claim): Promise<void> {
    const config = aiStore.translationConfig
    if (!config.enabled) return

    const providerType: AIProviderType = config.useSeparateModel
      ? config.providerType
      : aiStore.activeProviderType
    const model = config.useSeparateModel ? config.model : aiStore.activeModel
    const apiKey = aiStore.providers[providerType]?.apiKey || ''
    const baseUrl = aiStore.providers[providerType]?.baseUrl || ''

    if (!apiKey || !model) return

    translationStore.initClaimTranslation(claim.id, claim.sentences)
    translationStore.isTranslating = true
    translationStore.progress = { completed: 0, total: claim.sentences.length }

    const sentences = claim.sentences.filter(s => {
      const existing = translationStore.getSentenceTranslation(s.id)
      return !existing || existing.status !== 'done' || existing.originalText !== s.text
    })

    let nextIndex = 0
    const worker = async (): Promise<void> => {
      while (nextIndex < sentences.length) {
        const currentIndex = nextIndex++
        const sentence = sentences[currentIndex]

        translationStore.setSentenceTranslation(sentence.id, {
          sentenceId: sentence.id,
          originalText: sentence.text,
          translatedText: '',
          status: 'loading',
          error: null,
        })

        try {
          const result = await translateSentence(
            providerType,
            apiKey,
            baseUrl,
            model,
            sentence.text,
            config.targetLanguage,
          )
          translationStore.setSentenceTranslation(sentence.id, {
            sentenceId: sentence.id,
            originalText: sentence.text,
            translatedText: result,
            status: 'done',
            error: null,
          })
        } catch (err) {
          translationStore.setSentenceTranslation(sentence.id, {
            sentenceId: sentence.id,
            originalText: sentence.text,
            translatedText: '',
            status: 'error',
            error: (err as Error).message || '翻译失败',
          })
        } finally {
          translationStore.progress.completed++
        }
      }
    }

    const workerCount = Math.min(MAX_CONCURRENT, sentences.length)
    const workers = Array.from({ length: workerCount }, () => worker())
    await Promise.allSettled(workers)

    translationStore.isTranslating = false
  }

  async function retrySentence(sentenceId: string): Promise<void> {
    const config = aiStore.translationConfig
    const claim = claimStore.getActiveClaim()
    if (!claim) return

    const sentence = claim.sentences.find((s: Sentence) => s.id === sentenceId)
    if (!sentence) return

    const providerType: AIProviderType = config.useSeparateModel
      ? config.providerType
      : aiStore.activeProviderType
    const model = config.useSeparateModel ? config.model : aiStore.activeModel
    const apiKey = aiStore.providers[providerType]?.apiKey || ''
    const baseUrl = aiStore.providers[providerType]?.baseUrl || ''

    if (!apiKey || !model) return

    translationStore.setSentenceTranslation(sentenceId, {
      sentenceId,
      originalText: sentence.text,
      translatedText: '',
      status: 'loading',
      error: null,
    })

    try {
      const result = await translateSentence(
        providerType,
        apiKey,
        baseUrl,
        model,
        sentence.text,
        config.targetLanguage,
      )
      translationStore.setSentenceTranslation(sentenceId, {
        sentenceId,
        originalText: sentence.text,
        translatedText: result,
        status: 'done',
        error: null,
      })
    } catch (err) {
      translationStore.setSentenceTranslation(sentenceId, {
        sentenceId,
        originalText: sentence.text,
        translatedText: '',
        status: 'error',
        error: (err as Error).message || '翻译失败',
      })
    }
  }

  function clearTranslations(): void {
    translationStore.clearTranslations()
  }

  return { translateAllSentences, retrySentence, clearTranslations }
}