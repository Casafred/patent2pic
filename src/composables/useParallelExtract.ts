import { ref, computed } from 'vue'
import { useAIStore } from '@/stores/ai'
import { useClaimStore } from '@/stores/claim'
import { useGraphStore } from '@/stores/graph'
import { useTranslationStore } from '@/stores/translation'
import { streamChat, getModelConcurrency } from '@/services/ai/client'
import { buildMessages } from '@/services/ai/prompt'
import { parseExtractResult } from '@/services/ai/extractor'
import { graphEngine } from '@/services/graph/engine'
import { alignTranslationToSentences } from '@/services/claim/translation-aligner'
import type { ExtractResult, SentencePair } from '@/types/ai'
import type { Claim } from '@/types/claim'

export interface ParallelTask {
  claimId: string
  claimIndex: number
  claimPreview: string
  status: 'pending' | 'running' | 'success' | 'error' | 'aborted'
  progress: number
  tabId: string
  errorMessage: string | null
  durationMs: number | null
}

function isChineseText(text: string): boolean {
  const chineseChars = text.match(/[\u4e00-\u9fff\u3400-\u4dbf]/g)
  const totalChars = text.replace(/[\s\d\p{P}]/gu, '').length
  if (totalChars === 0) return false
  return (chineseChars?.length ?? 0) / totalChars > 0.3
}

export function useParallelExtract() {
  const aiStore = useAIStore()
  const claimStore = useClaimStore()
  const graphStore = useGraphStore()
  const translationStore = useTranslationStore()

  const tasks = ref<ParallelTask[]>([])
  const isRunning = ref(false)
  let abortControllers: AbortController[] = []
  let aborted = false

  const maxConcurrency = computed(() => {
    return getModelConcurrency(aiStore.activeProviderType, aiStore.activeModel)
  })

  const effectiveConcurrency = computed(() => {
    return Math.min(maxConcurrency.value, 10, tasks.value.length)
  })

  const completedCount = computed(() =>
    tasks.value.filter(t => t.status === 'success' || t.status === 'error' || t.status === 'aborted').length
  )

  const totalCount = computed(() => tasks.value.length)

  const allDone = computed(() =>
    tasks.value.length > 0 && tasks.value.every(t => t.status === 'success' || t.status === 'error' || t.status === 'aborted')
  )

  function initTasks(claims: Claim[]): void {
    tasks.value = claims.map(claim => ({
      claimId: claim.id,
      claimIndex: claim.index,
      claimPreview: claim.rawText.slice(0, 60).replace(/\n/g, ' '),
      status: 'pending',
      progress: 0,
      tabId: '',
      errorMessage: null,
      durationMs: null,
    }))
  }

  async function processSingleClaim(claim: Claim, task: ParallelTask): Promise<void> {
    if (aborted) {
      task.status = 'aborted'
      task.errorMessage = '用户终止'
      return
    }

    const startTime = Date.now()
    task.status = 'running'
    task.progress = 10

    const isChinese = isChineseText(claim.rawText)
    const tab = graphStore.addTab(undefined, isChinese, false)
    task.tabId = tab.id
    graphStore.updateTabName(tab.id, `权利要求 ${claim.index}`)

    const abortController = new AbortController()
    abortControllers.push(abortController)
    const providerType = aiStore.activeProviderType
    const model = aiStore.activeModel
    const claimPreview = claim.rawText.slice(0, 80).replace(/\n/g, ' ')

    let fullContent = ''
    let streamError: string | null = null

    try {
      const messages = buildMessages(claim.rawText, providerType)
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
          thinking: isDeepSeek ? { type: 'enabled' } : undefined,
          reasoningEffort: isDeepSeek ? 'high' : undefined,
          userId: isDeepSeek ? 'patent2pic-user' : undefined,
          streamOptions: isDeepSeek ? { includeUsage: true } : undefined,
        },
        abortController.signal,
      )) {
        if (aborted) break
        if (chunk.done) break
        fullContent += chunk.content
        task.progress = Math.min(80, 10 + (fullContent.length / 2000) * 70)
      }
    } catch (err) {
      const isAbort = (err as Error).name === 'AbortError'
      streamError = isAbort ? '用户终止分析' : ((err as Error).message || '流式请求失败')
    }

    if (aborted) {
      task.status = 'aborted'
      task.errorMessage = '用户终止'
      task.durationMs = Date.now() - startTime
      graphStore.removeTab(tab.id)
      return
    }

    if (streamError) {
      task.status = 'error'
      task.errorMessage = streamError
      task.durationMs = Date.now() - startTime
      graphStore.removeTab(tab.id)
      aiStore.addExtractLog({
        provider: providerType,
        model,
        status: 'error',
        rawResponse: fullContent || '(未收到任何响应内容)',
        errorMessage: streamError,
        claimPreview,
        durationMs: task.durationMs,
      })
      return
    }

    task.progress = 85
    let result: ExtractResult | null = null

    try {
      result = parseExtractResult(fullContent)
      result.claimId = claim.id
    } catch (err) {
      task.status = 'error'
      task.errorMessage = (err as Error).message || '解析失败'
      task.durationMs = Date.now() - startTime
      graphStore.removeTab(tab.id)
      aiStore.addExtractLog({
        provider: providerType,
        model,
        status: 'error',
        rawResponse: fullContent,
        errorMessage: task.errorMessage || '解析结果为空',
        claimPreview,
        durationMs: task.durationMs,
      })
      return
    }

    task.progress = 90
    graphStore.updateTabExtractResult(tab.id, result)

    // Build graph if this tab is currently active (e.g., user switched to it manually)
    // Otherwise, extractResult is saved; AppLayout.vue watch will build on switch,
    // or runParallel will build the first successful tab after all tasks complete.
    if (graphStore.activeTabId === tab.id) {
      await graphEngine.batchBuild(result, undefined, isChinese)
    }

    // Apply translations
    if (result.sentencePairs && result.sentencePairs.length > 0) {
      applySentencePairs(claim.id, claim.index, result.sentencePairs)
    } else if (result.translatedClaim && claim.sentences.length > 0) {
      const sentenceTranslations = alignTranslationToSentences(
        claim.rawText,
        result.translatedClaim,
        claim.sentences,
      )
      const sentenceIds = sentenceTranslations.map(st => st.sentenceId)
      const originalTexts: Record<string, string> = {}
      sentenceTranslations.forEach(st => {
        originalTexts[st.sentenceId] = st.originalText
      })
      translationStore.initClaimTranslation(claim.id, sentenceIds, originalTexts)
      sentenceTranslations.forEach(st => {
        if (st.translatedText) {
          translationStore.setSentenceTranslation(claim.id, {
            sentenceId: st.sentenceId,
            originalText: st.originalText,
            translatedText: st.translatedText,
            status: 'done',
            error: null,
          })
        }
      })
      const claimTrans = translationStore.getClaimTranslation(claim.id)
      if (claimTrans) {
        claimTrans.overallStatus = 'done'
      }
    }

    task.status = 'success'
    task.progress = 100
    task.durationMs = Date.now() - startTime

    aiStore.addExtractLog({
      provider: providerType,
      model,
      status: 'success',
      rawResponse: fullContent,
      claimPreview,
      durationMs: task.durationMs,
    })
  }

  function applySentencePairs(claimId: string, claimIndex: number, pairs: SentencePair[]): void {
    const newSentences = pairs.map((pair, idx) => ({
      id: `claim-${claimIndex}-sent-${idx + 1}`,
      text: pair.original,
      nodeIds: [] as string[],
      edgeIds: [] as string[],
    }))

    claimStore.updateClaimSentences(claimId, newSentences)

    const sentenceIds = newSentences.map(s => s.id)
    const originalTexts: Record<string, string> = {}
    newSentences.forEach(s => {
      originalTexts[s.id] = s.text
    })
    translationStore.initClaimTranslation(claimId, sentenceIds, originalTexts)

    pairs.forEach((pair, idx) => {
      const sentenceId = newSentences[idx].id
      translationStore.setSentenceTranslation(claimId, {
        sentenceId,
        originalText: pair.original,
        translatedText: pair.translation,
        status: 'done',
        error: null,
      })
    })

    const claimTrans = translationStore.getClaimTranslation(claimId)
    if (claimTrans) {
      claimTrans.overallStatus = 'done'
    }
  }

  async function runParallel(claims: Claim[]): Promise<void> {
    if (isRunning.value) return
    if (!aiStore.activeApiKey) return

    isRunning.value = true
    aborted = false
    abortControllers = []
    aiStore.isExtracting = true
    aiStore.extractError = null

    initTasks(claims)

    const concurrency = effectiveConcurrency.value
    const queue = [...tasks.value]
    const claimMap = new Map(claims.map(c => [c.id, c]))

    // Process tasks with controlled concurrency
    const executing = new Set<Promise<void>>()

    for (const task of queue) {
      if (aborted) {
        task.status = 'aborted'
        task.errorMessage = '用户终止'
        continue
      }

      const claim = claimMap.get(task.claimId)
      if (!claim) continue

      const promise = processSingleClaim(claim, task).then(() => {
        executing.delete(promise)
      })

      executing.add(promise)

      if (executing.size >= concurrency) {
        await Promise.race(executing)
      }
    }

    // Wait for remaining tasks
    await Promise.all(executing)

    // After all tasks complete, activate the first successful tab and build its graph
    const firstSuccess = tasks.value.find(t => t.status === 'success' && t.tabId)
    if (firstSuccess && firstSuccess.tabId) {
      graphStore.setActiveTabId(firstSuccess.tabId)
      const tab = graphStore.tabs.find(t => t.id === firstSuccess.tabId)
      if (tab?.extractResult) {
        await graphEngine.batchBuild(tab.extractResult, undefined, tab.isChinese)
      }
    }

    isRunning.value = false
    aiStore.isExtracting = false
    abortControllers = []
  }

  function abortAll(): void {
    aborted = true
    // Abort all active HTTP requests
    for (const controller of abortControllers) {
      try {
        controller.abort()
      } catch {
        // ignore
      }
    }
    abortControllers = []

    // Mark all pending/running tasks as aborted
    for (const task of tasks.value) {
      if (task.status === 'pending' || task.status === 'running') {
        task.status = 'aborted'
        task.errorMessage = '用户终止'
        // Remove tabs that were created for aborted tasks
        if (task.tabId) {
          graphStore.removeTab(task.tabId)
        }
      }
    }

    isRunning.value = false
    aiStore.isExtracting = false
  }

  function reset(): void {
    tasks.value = []
    isRunning.value = false
  }

  return {
    tasks,
    isRunning,
    maxConcurrency,
    effectiveConcurrency,
    completedCount,
    totalCount,
    allDone,
    runParallel,
    abortAll,
    reset,
  }
}
