import { ref } from 'vue'
import { useAIStore } from '@/stores/ai'
import { useClaimStore } from '@/stores/claim'
import { useGraphStore } from '@/stores/graph'
import { streamChat } from '@/services/ai/client'
import { buildMessages } from '@/services/ai/prompt'
import { parseExtractResult } from '@/services/ai/extractor'
import { graphEngine } from '@/services/graph/engine'
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
  const streamContent = ref('')
  const error = ref<string | null>(null)
  let abortController: AbortController | null = null

  async function extract(claimText: string): Promise<ExtractResult | null> {
    aiStore.isExtracting = true
    aiStore.extractError = null
    streamContent.value = ''
    error.value = null

    abortController = new AbortController()

    const isChinese = isChineseText(claimText)
    const claimPreview = claimText.slice(0, 80).replace(/\n/g, ' ')
    const providerType = aiStore.activeProviderType
    const model = aiStore.activeModel

    const tab = graphStore.addTab(undefined, isChinese)

    let fullContent = ''

    try {
      const messages = buildMessages(claimText)

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
        abortController.signal,
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

      aiStore.addExtractLog({
        provider: providerType,
        model,
        status: 'success',
        rawResponse: fullContent,
        claimPreview,
      })

      return result
    } catch (err) {
      if ((err as Error).name === 'AbortError') {
        graphStore.removeTab(tab.id)
        error.value = '已终止分析'
        aiStore.extractError = '已终止分析'

        if (fullContent) {
          aiStore.addExtractLog({
            provider: providerType,
            model,
            status: 'error',
            rawResponse: fullContent,
            errorMessage: '用户终止分析',
            claimPreview,
          })
        }

        return null
      }
      const message = (err as Error).message || '抽取失败'
      aiStore.extractError = message
      error.value = message
      graphStore.removeTab(tab.id)

      aiStore.addExtractLog({
        provider: providerType,
        model,
        status: 'error',
        rawResponse: fullContent || '(无响应内容)',
        errorMessage: message,
        claimPreview,
      })

      return null
    } finally {
      aiStore.isExtracting = false
      abortController = null
    }
  }

  function abort(): void {
    if (abortController) {
      abortController.abort()
      abortController = null
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
    return extract(claim.rawText)
  }

  return {
    streamContent,
    error,
    extract,
    extractActiveClaim,
    abort,
  }
}
