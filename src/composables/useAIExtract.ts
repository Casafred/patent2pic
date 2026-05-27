import { ref } from 'vue'
import { useAIStore } from '@/stores/ai'
import { useClaimStore } from '@/stores/claim'
import { useGraphStore } from '@/stores/graph'
import { streamChat } from '@/services/ai/client'
import { buildMessages } from '@/services/ai/prompt'
import { parseExtractResult } from '@/services/ai/extractor'
import { graphEngine } from '@/services/graph/engine'
import type { ChatUsage, ExtractResult } from '@/types/ai'

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
  const reasoningContent = ref('')
  const lastUsage = ref<ChatUsage | null>(null)
  const error = ref<string | null>(null)
  let abortController: AbortController | null = null

  async function extract(claimText: string): Promise<ExtractResult | null> {
    aiStore.isExtracting = true
    aiStore.extractError = null
    streamContent.value = ''
    reasoningContent.value = ''
    lastUsage.value = null
    error.value = null

    abortController = new AbortController()

    const isChinese = isChineseText(claimText)
    const claimPreview = claimText.slice(0, 80).replace(/\n/g, ' ')
    const providerType = aiStore.activeProviderType
    const model = aiStore.activeModel

    const tab = graphStore.addTab(undefined, isChinese)

    let fullContent = ''
    let fullReasoning = ''
    let streamError: string | null = null

    try {
      const messages = buildMessages(claimText)
      const isDeepSeek = aiStore.activeProviderType === 'deepseek'

      for await (const chunk of streamChat(
        aiStore.activeProviderType,
        aiStore.activeApiKey,
        aiStore.activeBaseUrl,
        {
          model: aiStore.activeModel,
          messages,
          temperature: isDeepSeek ? undefined : 0.1,
          stream: true,
          responseFormat: isDeepSeek || aiStore.activeProviderType === 'openai'
            ? { type: 'json_object' }
            : undefined,
          thinking: isDeepSeek
            ? { type: 'enabled' }
            : undefined,
          reasoningEffort: isDeepSeek
            ? 'high'
            : undefined,
          userId: isDeepSeek ? 'patent2pic-user' : undefined,
          streamOptions: isDeepSeek ? { includeUsage: true } : undefined,
        },
        abortController.signal,
      )) {
        if (chunk.done) break
        if (chunk.usage) {
          lastUsage.value = chunk.usage
        }
        fullContent += chunk.content
        if (chunk.reasoningContent) {
          fullReasoning += chunk.reasoningContent
          reasoningContent.value = fullReasoning
        }
        streamContent.value = fullContent
        aiStore.extractStreamContent = fullContent
      }
    } catch (err) {
      const isAbort = (err as Error).name === 'AbortError'
      streamError = isAbort ? '用户终止分析' : ((err as Error).message || '流式请求失败')

      aiStore.addExtractLog({
        provider: providerType,
        model,
        status: 'error',
        rawResponse: fullContent || '(未收到任何响应内容)',
        errorMessage: streamError,
        claimPreview,
      })

      graphStore.removeTab(tab.id)
      aiStore.extractError = streamError
      error.value = streamError
      aiStore.isExtracting = false
      abortController = null
      return null
    }

    let parseError: string | null = null
    let result: ExtractResult | null = null

    try {
      result = parseExtractResult(fullContent)
      result.claimId = claimStore.activeClaimId || ''
    } catch (err) {
      parseError = (err as Error).message || '解析失败'
    }

    if (parseError || !result) {
      aiStore.addExtractLog({
        provider: providerType,
        model,
        status: 'error',
        rawResponse: fullContent,
        errorMessage: parseError || '解析结果为空',
        claimPreview,
      })

      graphStore.removeTab(tab.id)
      aiStore.extractError = parseError || '解析结果为空'
      error.value = parseError || '解析结果为空'
      aiStore.isExtracting = false
      abortController = null
      return null
    }

    aiStore.addExtractLog({
      provider: providerType,
      model,
      status: 'success',
      rawResponse: fullContent,
      claimPreview,
    })

    graphStore.updateTabExtractResult(tab.id, result)
    graphStore.updateTabName(tab.id, `权利要求 ${graphStore.tabs.length}`)
    await graphEngine.batchBuild(result, undefined, isChinese)

    aiStore.isExtracting = false
    abortController = null
    return result
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
    reasoningContent,
    lastUsage,
    error,
    extract,
    extractActiveClaim,
    abort,
  }
}
