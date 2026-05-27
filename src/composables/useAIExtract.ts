import { ref } from 'vue'
import { useAIStore } from '@/stores/ai'
import { useClaimStore } from '@/stores/claim'
import { useGraphStore } from '@/stores/graph'
import { streamChat } from '@/services/ai/client'
import { buildMessages } from '@/services/ai/prompt'
import { parseExtractResult } from '@/services/ai/extractor'
import { graphEngine } from '@/services/graph/engine'
import { timingStart, timingEnd, timingLap } from '@/utils/timing'
import type { ChatUsage, ExtractResult } from '@/types/ai'
import { useAITranslation } from '@/composables/useAITranslation'

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
  const reasoningContent = ref('')
  const lastUsage = ref<ChatUsage | null>(null)
  const error = ref<string | null>(null)
  let abortController: AbortController | null = null

  async function extract(claimText: string): Promise<ExtractResult | null> {
    const timingKey = `权利要求分析 [${claimText.slice(0, 30).replace(/\n/g, ' ')}...]`
    timingStart(timingKey)

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
      timingStart(`  │ 构建提示词`)
      const messages = buildMessages(claimText, providerType)
      timingEnd(`  │ 构建提示词`)

      const isDeepSeek = aiStore.activeProviderType === 'deepseek'

      timingStart(`  │ API 流式请求 (${providerType}/${model})`)
      let firstChunkReceived = false

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
        if (!firstChunkReceived) {
          firstChunkReceived = true
          timingLap(`  首字节到达 (TTFB)`, `  │ API 流式请求 (${providerType}/${model})`)
        }
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

      if (!firstChunkReceived) {
        timingLap(`  未收到任何数据块`, `  │ API 流式请求 (${providerType}/${model})`)
      }

      if (lastUsage.value) {
        timingLap(`  Token 用量: prompt=${lastUsage.value.promptTokens} completion=${lastUsage.value.completionTokens} total=${lastUsage.value.totalTokens}`,
          `  │ API 流式请求 (${providerType}/${model})`)
      }

      timingEnd(`  │ API 流式请求 (${providerType}/${model})`)
    } catch (err) {
      timingEnd(`  │ API 流式请求 (${providerType}/${model})`)
      const isAbort = (err as Error).name === 'AbortError'
      streamError = isAbort ? '用户终止分析' : ((err as Error).message || '流式请求失败')

      const elapsed = timingEnd(timingKey)

      aiStore.addExtractLog({
        provider: providerType,
        model,
        status: 'error',
        rawResponse: fullContent || '(未收到任何响应内容)',
        errorMessage: streamError,
        claimPreview,
        durationMs: elapsed,
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
      timingStart(`  │ JSON 解析与验证`)
      result = parseExtractResult(fullContent)
      result.claimId = claimStore.activeClaimId || ''
      timingEnd(`  │ JSON 解析与验证`)
    } catch (err) {
      parseError = (err as Error).message || '解析失败'
      timingEnd(`  │ JSON 解析与验证`)
    }

    if (parseError || !result) {
      const elapsed = timingEnd(timingKey)

      aiStore.addExtractLog({
        provider: providerType,
        model,
        status: 'error',
        rawResponse: fullContent,
        errorMessage: parseError || '解析结果为空',
        claimPreview,
        durationMs: elapsed,
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
      durationMs: timingEnd(timingKey),
    })

    timingStart(`  │ 图谱构建`)
    graphStore.updateTabExtractResult(tab.id, result)
    graphStore.updateTabName(tab.id, `权利要求 ${graphStore.tabs.length}`)
    await graphEngine.batchBuild(result, undefined, isChinese)
    timingEnd(`  │ 图谱构建`)

    timingLap(`  节点数=${result.nodes.length} 边数=${result.edges.length} 组数=${result.groups.length}`, timingKey)

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

    const shouldTranslate = aiStore.translationConfig.enabled
      && aiStore.translationConfig.autoTranslate
      && claim.sentences.length > 0

    if (shouldTranslate) {
      const [extractResult] = await Promise.allSettled([
        extract(claim.rawText),
        translateAllSentences(claim),
      ])
      if (extractResult.status === 'fulfilled') {
        return extractResult.value
      }
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
