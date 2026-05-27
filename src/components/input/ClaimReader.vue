<template>
  <div class="claim-reader" v-if="claimStore.isInputCollapsed">
    <div class="reader-header">
      <h4>权利要求对照阅读</h4>
      <div class="reader-actions">
        <span
          v-if="translationStore.isTranslating"
          class="translation-progress"
        >
          翻译中 {{ translationStore.progress.completed }}/{{ translationStore.progress.total }}
        </span>
        <button
          v-if="!translationStore.isTranslating && translationEnabled && !hasAnyTranslation"
          class="translate-btn"
          @click="handleStartTranslation"
          title="翻译权利要求"
        >
          🌐 翻译
        </button>
        <span class="reader-hint" v-if="editorStore.selectedNodeIds.length > 0">
          已选中 {{ editorStore.selectedNodeIds.length }} 个节点
        </span>
        <span class="reader-hint" v-else-if="!translationStore.isTranslating">点击画布节点查看对应文本</span>
      </div>
    </div>

    <div class="reader-body" ref="readerBodyRef">
      <div
        v-for="(segment, sIdx) in renderedSegments"
        :key="sIdx"
        :class="['segment', { 'segment-highlighted': segment.hasHighlight }]"
        :style="segment.hasHighlight ? { backgroundColor: segment.highlightColors?.[0]?.bg, borderLeftColor: segment.highlightColors?.[0]?.border } : {}"
      >
        <div class="segment-original">
          <template v-if="segment.highlightColors && segment.highlightColors.length > 0">
            <span
              class="segment-badge"
              :style="{ backgroundColor: segment.highlightColors[0].border, color: '#fff' }"
            >{{ segment.highlightColors[0].nodeLabel }}</span>
          </template>
          <span
            v-html="segment.highlightedHtml"
            :class="['segment-text', { 'text-bold': segment.hasHighlight }]"
          ></span>
        </div>
        <div class="segment-translation" v-if="translationEnabled">
          <template v-if="segment.translation">
            <template v-if="segment.translation.status === 'done'">
              <span v-html="segment.translationHighlightedHtml" class="translation-text"></span>
            </template>
            <template v-else-if="segment.translation.status === 'loading'">
              <span class="translation-loading">⏳ 翻译中...</span>
            </template>
            <template v-else-if="segment.translation.status === 'error'">
              <span class="translation-error">
                ❌ {{ segment.translation.error || '翻译失败' }}
                <button class="retry-btn" @click="handleRetry(segment.translation.sentenceId)">重试</button>
              </span>
            </template>
          </template>
        </div>
      </div>

      <div v-if="renderedSegments.length === 0" class="reader-empty">
        <p>暂无权利要求文本</p>
      </div>
    </div>

    <div class="reader-legend" v-if="legendItems.length > 0">
      <div
        v-for="item in legendItems"
        :key="item.nodeId"
        class="legend-item"
      >
        <span class="legend-dot" :style="{ backgroundColor: item.color.border }"></span>
        <span class="legend-label">{{ item.label }}</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch, nextTick } from 'vue'
import { useClaimStore } from '@/stores/claim'
import { useEditorStore } from '@/stores/editor'
import { useGraphStore } from '@/stores/graph'
import { useAIStore } from '@/stores/ai'
import { useTranslationStore } from '@/stores/translation'
import { useAITranslation } from '@/composables/useAITranslation'
import type { ExtractNode } from '@/types/ai'
import type { SentenceTranslation } from '@/types/translation'

interface HighlightColor {
  bg: string
  border: string
}

interface NodeHighlightInfo {
  color: HighlightColor
  label: string
  nodeId: string
  nodeText: string
  nodeOriginalText: string
  nodeChineseText: string
}

interface RenderedSegment {
  text: string
  highlightedHtml: string
  hasHighlight: boolean
  highlightColors: (HighlightColor & { nodeLabel: string })[] | null
  translation: SentenceTranslation | null
  translationHighlightedHtml: string
}

const HIGHLIGHT_PALETTE: HighlightColor[] = [
  { bg: '#e6f7ff', border: '#1890ff' },
  { bg: '#fff7e6', border: '#fa8c16' },
  { bg: '#f6ffed', border: '#52c41a' },
  { bg: '#fff1f0', border: '#f5222d' },
  { bg: '#f9f0ff', border: '#722ed1' },
  { bg: '#e6fffb', border: '#13c2c2' },
  { bg: '#fff0f6', border: '#eb2f96' },
  { bg: '#fcffe6', border: '#a0d911' },
]

const claimStore = useClaimStore()
const editorStore = useEditorStore()
const graphStore = useGraphStore()
const aiStore = useAIStore()
const translationStore = useTranslationStore()
const { translateAllSentences, retrySentence } = useAITranslation()
const readerBodyRef = ref<HTMLElement | null>(null)

const translationEnabled = computed(() => aiStore.translationConfig.enabled)

const hasAnyTranslation = computed(() => {
  const claim = claimStore.getActiveClaim()
  if (!claim) return false
  const claimTrans = translationStore.claimTranslations.get(claim.id)
  return !!claimTrans && claimTrans.sentences.some((s: SentenceTranslation) => s.status === 'done')
})

const extractNodes = computed<ExtractNode[]>(() => {
  const tab = graphStore.activeTab
  if (!tab?.extractResult) return []
  return tab.extractResult.nodes
})

const nodeHighlightMap = computed<Map<string, NodeHighlightInfo>>(() => {
  const map = new Map<string, NodeHighlightInfo>()
  const selectedIds = editorStore.selectedNodeIds

  selectedIds.forEach((nodeId: string, idx: number) => {
    const node = extractNodes.value.find((n: ExtractNode) => n.id === nodeId)
    const colorIdx = idx % HIGHLIGHT_PALETTE.length
    const nodeText = node?.originalText || node?.chineseText || ''
    map.set(nodeId, {
      color: HIGHLIGHT_PALETTE[colorIdx],
      label: node?.chineseText || node?.originalText || nodeId,
      nodeId,
      nodeText,
      nodeOriginalText: node?.originalText || '',
      nodeChineseText: node?.chineseText || '',
    })
  })

  return map
})

const legendItems = computed(() => {
  return editorStore.selectedNodeIds.map((nodeId: string, idx: number) => {
    const node = extractNodes.value.find((n: ExtractNode) => n.id === nodeId)
    const colorIdx = idx % HIGHLIGHT_PALETTE.length
    return {
      nodeId,
      color: HIGHLIGHT_PALETTE[colorIdx],
      label: node?.chineseText || node?.originalText || nodeId,
    }
  })
})

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function highlightTextInSentence(sentenceText: string): { html: string; colors: (HighlightColor & { nodeLabel: string })[] } {
  const highlights: (HighlightColor & { nodeLabel: string })[] = []
  let html = escapeHtml(sentenceText)

  const nodeTexts: { text: string; info: NodeHighlightInfo }[] = []
  for (const [_nodeId, info] of nodeHighlightMap.value) {
    if (info.nodeText && info.nodeText.length >= 2) {
      nodeTexts.push({ text: info.nodeText, info })
    }
  }

  nodeTexts.sort((a, b) => b.text.length - a.text.length)

  for (const { text, info } of nodeTexts) {
    const escapedText = escapeHtml(text)
    const regex = new RegExp(escapedText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi')
    let found = false
    html = html.replace(regex, (match) => {
      if (!found) {
        found = true
        if (!highlights.some(h => h.border === info.color.border)) {
          highlights.push({ ...info.color, nodeLabel: info.label })
        }
        return `<mark class="text-highlight" style="background-color: ${info.color.bg}; color: ${info.color.border}; font-weight: 600; padding: 1px 3px; border-radius: 3px;">${match}</mark>`
      }
      return match
    })
  }

  return { html, colors: highlights }
}

function highlightTranslationText(
  translatedText: string,
): { html: string; colors: (HighlightColor & { nodeLabel: string })[] } {
  const highlights: (HighlightColor & { nodeLabel: string })[] = []
  let html = escapeHtml(translatedText)

  const isOriginalChinese = isChineseText(translatedText)

  const nodeTexts: { text: string; info: NodeHighlightInfo }[] = []
  for (const [_nodeId, info] of nodeHighlightMap.value) {
    const textToHighlight = isOriginalChinese
      ? info.nodeOriginalText
      : info.nodeChineseText
    if (textToHighlight && textToHighlight.length >= 2) {
      nodeTexts.push({ text: textToHighlight, info })
    }
  }

  nodeTexts.sort((a, b) => b.text.length - a.text.length)

  for (const { text, info } of nodeTexts) {
    const escapedText = escapeHtml(text)
    const regex = new RegExp(escapedText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi')
    let found = false
    html = html.replace(regex, (match) => {
      if (!found) {
        found = true
        if (!highlights.some(h => h.border === info.color.border)) {
          highlights.push({ ...info.color, nodeLabel: info.label })
        }
        return `<mark class="text-highlight" style="background-color: ${info.color.bg}; color: ${info.color.border}; font-weight: 600; padding: 1px 3px; border-radius: 3px;">${match}</mark>`
      }
      return match
    })
  }

  return { html, colors: highlights }
}

function isChineseText(text: string): boolean {
  const chineseChars = text.match(/[\u4e00-\u9fff\u3400-\u4dbf]/g)
  const totalChars = text.replace(/[\s\d\p{P}]/gu, '').length
  if (totalChars === 0) return false
  return (chineseChars?.length ?? 0) / totalChars > 0.3
}

const renderedSegments = computed<RenderedSegment[]>(() => {
  const claim = claimStore.getActiveClaim()
  if (!claim || claim.sentences.length === 0) return []

  const segments: RenderedSegment[] = []

  for (const sentence of claim.sentences) {
    const { html, colors } = highlightTextInSentence(sentence.text)
    const translation = translationStore.getSentenceTranslation(sentence.id)
    let translationHighlightedHtml = ''
    if (translation && translation.status === 'done' && translation.translatedText) {
      const transResult = highlightTranslationText(translation.translatedText)
      translationHighlightedHtml = transResult.html
    }

    segments.push({
      text: sentence.text,
      highlightedHtml: html,
      hasHighlight: colors.length > 0,
      highlightColors: colors.length > 0 ? colors : null,
      translation: translation ?? null,
      translationHighlightedHtml,
    })
  }

  return segments
})

async function handleStartTranslation(): Promise<void> {
  const claim = claimStore.getActiveClaim()
  if (!claim) return
  await translateAllSentences(claim)
}

async function handleRetry(sentenceId: string): Promise<void> {
  await retrySentence(sentenceId)
}

watch(() => editorStore.selectedNodeIds, () => {
  nextTick(() => {
    if (readerBodyRef.value) {
      const first = readerBodyRef.value.querySelector('.segment-highlighted')
      if (first) {
        first.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
      }
    }
  })
}, { deep: true })
</script>

<style scoped>
.claim-reader {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  border-top: 1px solid var(--border-color);
}

.reader-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 16px;
  background: var(--bg-tertiary);
  border-bottom: 1px solid var(--border-color-light);
  flex-shrink: 0;
}

.reader-header h4 {
  font-size: var(--font-size-sm);
  font-weight: 600;
  color: var(--text-primary);
}

.reader-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.reader-hint {
  font-size: var(--font-size-xs);
  color: var(--text-tertiary);
}

.translation-progress {
  font-size: var(--font-size-xs);
  color: var(--color-primary);
  font-weight: 500;
}

.translate-btn {
  border: none;
  background: transparent;
  color: var(--color-primary);
  font-size: var(--font-size-xs);
  cursor: pointer;
  padding: 2px 8px;
  border-radius: var(--radius-sm);
  transition: background 0.15s;
}

.translate-btn:hover {
  background: var(--color-primary-bg);
}

.reader-body {
  flex: 1;
  overflow-y: auto;
  padding: 12px 16px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.segment {
  padding: 8px 10px;
  border-radius: var(--radius-sm);
  border-left: 3px solid transparent;
  line-height: 1.7;
  font-size: var(--font-size-sm);
  color: var(--text-secondary);
  transition: background 0.2s, border-color 0.2s;
}

.segment-highlighted {
  border-left-width: 3px;
  border-left-style: solid;
}

.segment-original {
  line-height: 1.7;
}

.segment-badge {
  display: inline-block;
  font-size: 10px;
  font-weight: 600;
  padding: 1px 6px;
  border-radius: 3px;
  margin-right: 6px;
  vertical-align: middle;
  line-height: 1.6;
}

.segment-text {
  vertical-align: middle;
}

.text-bold {
  font-weight: 700;
}

.segment-translation {
  margin-top: 4px;
  padding-top: 4px;
  border-top: 1px dashed var(--border-color-light);
  line-height: 1.7;
}

.segment-highlighted .segment-translation {
  color: var(--text-primary);
}

.translation-text {
  font-size: var(--font-size-sm);
  color: var(--text-secondary);
}

.segment-highlighted .translation-text {
  color: var(--text-primary);
}

.translation-loading {
  font-size: var(--font-size-xs);
  color: var(--text-tertiary);
  font-style: italic;
}

.translation-error {
  font-size: var(--font-size-xs);
  color: var(--color-danger);
}

.retry-btn {
  border: none;
  background: transparent;
  color: var(--color-primary);
  font-size: var(--font-size-xs);
  cursor: pointer;
  padding: 0 4px;
  text-decoration: underline;
}

.retry-btn:hover {
  color: var(--color-primary);
}

.reader-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 120px;
  color: var(--text-tertiary);
  font-size: var(--font-size-sm);
}

.reader-legend {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding: 8px 16px;
  border-top: 1px solid var(--border-color-light);
  background: var(--bg-tertiary);
  flex-shrink: 0;
}

.legend-item {
  display: flex;
  align-items: center;
  gap: 4px;
}

.legend-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.legend-label {
  font-size: 11px;
  color: var(--text-secondary);
  max-width: 80px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
