import { ref } from 'vue'
import { useAIStore } from '@/stores/ai'
import { useClaimStore } from '@/stores/claim'
import { useGraphStore } from '@/stores/graph'
import { streamChat } from '@/services/ai/client'
import { buildMessages } from '@/services/ai/prompt'
import { parseExtractResult } from '@/services/ai/extractor'
import { graphEngine } from '@/services/graph/engine'
import { useAITranslation } from '@/composables/useAITranslation'
import type { ExtractResult } from '@/types/ai'

function isChineseText(text: string): boolean {
  const chineseChars = text.match(/[\u4e00-\u9fff\u3400-\u4dbf]/g)
  const totalChars = text.replace(/[\s\d\p{P}]/gu, '').length
  if (totalChars === 0) return false
  return (chineseChars?.length ?? 0) / totalChars > 0.3
}

export function useAIExtract() {
  const aiStore = useAIStore()
  const claimStore = useClaimStore()
  const graphStore = useGraphStore()
  const { translateAllSentences } = useAITranslation()
  const streamContent = ref('')
  const error = ref<string | null>(null)

  async function extract(claimText: string): Promise<ExtractResult | null> {
    aiStore.isExtracting = true
    aiStore.extractError = null
    streamContent.value = ''
    error.value = null

    const isChinese = isChineseText(claimText)

    const tab = graphStore.addTab(undefined, isChinese)

    try {
      const messages = buildMessages(claimText)
      let fullContent = ''

      for await (const chunk of streamChat(
        aiStore.activeProviderType,
        aiStore.activeApiKey,
        aiStore.activeBaseUrl,
        {
          model: aiStore.activeModel,
          messages,
          temperature: 0.1,
          stream: true,
        },
      )) {
        if (chunk.done) break
        fullContent += chunk.content
        streamContent.value = fullContent
        aiStore.extractStreamContent = fullContent
      }

      const result = parseExtractResult(fullContent)
      result.claimId = claimStore.activeClaimId || ''

      graphStore.updateTabExtractResult(tab.id, result)
      graphStore.updateTabName(tab.id, `权利要求 ${graphStore.tabs.length}`)

      graphEngine.batchBuild(result, undefined, isChinese)

      return result
    } catch (err) {
      const message = (err as Error).message || '抽取失败'
      aiStore.extractError = message
      error.value = message
      graphStore.removeTab(tab.id)
      return null
    } finally {
      aiStore.isExtracting = false
    }
  }

  async function extractActiveClaim(): Promise<ExtractResult | null> {
    const claim = claimStore.getActiveClaim()
    if (!claim) {
      error.value = '请先选择一条权利要求'
      return null
    }
    if (!aiStore.activeApiKey) {
      error.value = '请先配置 API Key'
      return null
    }

    const shouldTranslate = aiStore.translationConfig.enabled
      && aiStore.translationConfig.autoTranslate
      && claim.sentences.length > 0

    if (shouldTranslate) {
      const [extractResult] = await Promise.allSettled([
        extract(claim.rawText),
        translateAllSentences(claim),
      ])
      if (extractResult.status === 'fulfilled' && extractResult.value) {
        return extractResult.value
      }
      return null
    }

    return extract(claim.rawText)
  }

  return {
    streamContent,
    error,
    extract,
    extractActiveClaim,
  }
}
