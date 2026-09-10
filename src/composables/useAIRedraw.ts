import { ref } from 'vue'
import { useAIStore } from '@/stores/ai'
import { useGraphStore, type TabData } from '@/stores/graph'
import { usePlaybackStore } from '@/stores/playback'
import { streamChat } from '@/services/ai/client'
import { buildRedrawMessages } from '@/services/ai/redraw-prompt'
import { parseExtractResult } from '@/services/ai/extractor'
import { x6ToExtractResult } from '@/services/graph/x6-to-extract'
import { graphEngine } from '@/services/graph/engine'
import { timingStart, timingEnd, timingLap } from '@/utils/timing'
import type { ChatUsage, ExtractResult } from '@/types/ai'
import type { RedrawOptions } from '@/types/redraw'

export function useAIRedraw() {
  const aiStore = useAIStore()
  const graphStore = useGraphStore()
  const playback = usePlaybackStore()

  const streamContent = ref('')
  const reasoningContent = ref('')
  const isRunning = ref(false)
  const lastChanges = ref<string[]>([])
  const lastUsage = ref<ChatUsage | null>(null)
  const error = ref<string | null>(null)
  let abortController: AbortController | null = null

  /** 沿 sourceTabId 回溯版本链根节点 */
  function findRootTabId(tab: TabData): string {
    let current = tab
    const seen = new Set<string>()
    while (current.sourceTabId && !seen.has(current.sourceTabId)) {
      seen.add(current.id)
      const parent = graphStore.tabs.find(t => t.id === current.sourceTabId)
      if (!parent) break
      current = parent
    }
    return current.id
  }

  /** 同一版本链上最大的重构版本号（根 Tab 视为 1） */
  function nextChainVersion(sourceTab: TabData): number {
    const rootId = findRootTabId(sourceTab)
    let max = 1
    for (const tab of graphStore.tabs) {
      const isChain = tab.id === rootId || findRootTabId(tab) === rootId
      if (isChain && (tab.redrawVersion ?? 1) > max) {
        max = tab.redrawVersion ?? 1
      }
    }
    return max + 1
  }

  /** 取重构基准：当前画布（含手动编辑）或原始抽取结果 */
  function resolveBase(sourceTab: TabData, base: RedrawOptions['base']): ExtractResult | null {
    const original = sourceTab.extractResult

    if (base === 'current') {
      // 源 Tab 处于激活态 → 序列化当前画布（含手动编辑）
      if (graphStore.activeTabId === sourceTab.id) {
        const json = graphEngine.toJSON()
        graphStore.updateTabSerializedGraph(sourceTab.id, json)
        const converted = x6ToExtractResult(json, {
          frames: original?.frames,
          translatedClaim: original?.translatedClaim,
          sentencePairs: original?.sentencePairs,
        })
        if (converted.nodes.length > 0) return converted
        // 当前画布为空但 extractResult 存在 → 自动降级（边界情况 1）
        return original
      }
      // 源 Tab 非激活态 → 用其序列化快照
      if (sourceTab.serializedGraph && Object.keys(sourceTab.serializedGraph).length > 0) {
        const converted = x6ToExtractResult(sourceTab.serializedGraph, {
          frames: original?.frames,
          translatedClaim: original?.translatedClaim,
          sentencePairs: original?.sentencePairs,
        })
        if (converted.nodes.length > 0) return converted
      }
      return original
    }

    return original
  }

  async function redraw(
    sourceTabId: string,
    instructions: string,
    options: RedrawOptions,
  ): Promise<ExtractResult | null> {
    const sourceTab = graphStore.tabs.find(t => t.id === sourceTabId)
    if (!sourceTab) {
      error.value = '源标签页不存在'
      return null
    }
    if (!instructions.trim()) {
      error.value = '请填写重构要求'
      return null
    }
    if (!aiStore.activeApiKey) {
      error.value = '请先配置 API Key'
      return null
    }

    const base = resolveBase(sourceTab, options.base)
    if (!base || base.nodes.length === 0) {
      error.value = '当前标签页无可用基准（无图且无抽取结果）'
      return null
    }

    const timingKey = `AI 重构 [${instructions.slice(0, 30).replace(/\n/g, ' ')}...]`
    timingStart(timingKey)

    error.value = null
    streamContent.value = ''
    reasoningContent.value = ''
    lastUsage.value = null
    isRunning.value = true
    aiStore.isExtracting = true
    aiStore.extractError = null

    abortController = new AbortController()

    // 新 Tab：复制源 Tab 的 claim/翻译数据，记录版本链元信息
    const version = nextChainVersion(sourceTab)
    const baseName = sourceTab.name.replace(/\s*·\s*重构V\d+$/, '')
    const newTab = graphStore.addTab(
      `${baseName} · 重构V${version}`,
      sourceTab.isChinese,
      true,
      sourceTab.claimId,
      sourceTab.rawText,
      sourceTab.claims,
      sourceTab.activeClaimId,
      { sourceTabId, instructions, version },
    )
    if (sourceTab.translations) {
      graphStore.updateTabTranslations(newTab.id, sourceTab.translations)
    }

    // 参考上下文：该 Tab 分析的权利要求原文
    const claimText = options.includeClaimContext
      ? sourceTab.claims.find(c => c.id === sourceTab.claimId)?.rawText
      : undefined

    let fullContent = ''
    let fullReasoning = ''
    let streamError: string | null = null
    const providerType = aiStore.activeProviderType
    const model = aiStore.activeModel
    const claimPreview = `[重构] ${instructions.slice(0, 60).replace(/\n/g, ' ')}`

    try {
      const messages = buildRedrawMessages(base, instructions, providerType, { claimText })
      const isDeepSeek = providerType === 'deepseek'

      for await (const chunk of streamChat(
        providerType,
        aiStore.activeApiKey,
        aiStore.activeBaseUrl,
        {
          model,
          messages,
          temperature: isDeepSeek ? undefined : 0.1,
          stream: true,
          responseFormat: isDeepSeek || providerType === 'openai'
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
      }
    } catch (err) {
      const isAbort = (err as Error).name === 'AbortError'
      streamError = isAbort ? '用户终止重构' : ((err as Error).message || '流式请求失败')
    }

    const fail = (message: string): null => {
      aiStore.addExtractLog({
        provider: providerType,
        model,
        status: 'error',
        rawResponse: fullContent || '(未收到任何响应内容)',
        errorMessage: message,
        claimPreview,
        durationMs: timingEnd(timingKey),
      })
      graphStore.removeTab(newTab.id)
      graphStore.setActiveTabId(sourceTabId)
      aiStore.extractError = message
      error.value = message
      isRunning.value = false
      aiStore.isExtracting = false
      abortController = null
      return null
    }

    if (streamError) {
      return fail(streamError)
    }

    let result: ExtractResult
    try {
      result = parseExtractResult(fullContent)
    } catch (err) {
      return fail((err as Error).message || '解析失败')
    }

    result.claimId = sourceTab.claimId ?? ''

    // 保留原图动画帧（节点 ID 未变的帧高亮依然有效）
    if (options.keepFrames && base.frames && base.frames.length > 0) {
      result.frames = base.frames
    }

    aiStore.addExtractLog({
      provider: providerType,
      model,
      status: 'success',
      rawResponse: fullContent,
      claimPreview,
      durationMs: timingEnd(timingKey),
    })

    timingStart(`  │ 重构图谱构建`)
    graphStore.updateTabExtractResult(newTab.id, result)
    await graphEngine.batchBuild(result, undefined, sourceTab.isChinese)
    if (playback.animationMode && result.frames && result.frames.length > 0) {
      playback.setFrames(result.frames)
    } else {
      graphEngine.showFullGraph()
      playback.clearFrames()
    }
    timingEnd(`  │ 重构图谱构建`)

    timingLap(`  节点数=${result.nodes.length} 边数=${result.edges.length} 组数=${result.groups.length}`, timingKey)

    lastChanges.value = result.changes ?? []
    isRunning.value = false
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

  return {
    streamContent,
    reasoningContent,
    isRunning,
    lastChanges,
    lastUsage,
    error,
    redraw,
    abort,
  }
}
