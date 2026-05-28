<template>
  <div class="claim-reader" v-if="hasGraphData">
    <div class="reader-header">
      <h4>权利要求对照阅读</h4>
      <template v-if="translationEnabled">
        <el-progress
          v-if="translationStore.isTranslating"
          :percentage="translationProgressPercent"
          :stroke-width="8"
          style="width: 120px"
        />
        <span class="reader-hint" v-else-if="claimTrans && claimTrans.overallStatus === 'done'">
          翻译完成
        </span>
      </template>
      <span class="reader-hint" v-if="editorStore.selectedNodeIds.length > 0">
        已选中 {{ editorStore.selectedNodeIds.length }} 个节点
      </span>
      <span class="reader-hint" v-else>点击画布节点查看对应文本</span>
    </div>

    <div class="reader-body" ref="readerBodyRef">
      <div
        v-for="(segment, sIdx) in renderedSegments"
        :key="sIdx"
        :class="['segment', { 'segment-highlighted': segment.hasHighlight, 'segment-with-translation': translationEnabled }]"
        :style="segment.hasHighlight ? { backgroundColor: segment.highlightColors?.[0]?.bg, borderLeftColor: segment.highlightColors?.[0]?.border } : {}"
      >
        <div class="segment-row">
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
            <template v-if="segment.translation && segment.translation.status === 'done'">
              <span v-html="segment.translationHighlightedHtml" class="translation-text"></span>
            </template>
            <template v-else-if="segment.translation && segment.translation.status === 'loading'">
              <span class="translation-loading">⏳ 翻译中...</span>
            </template>
            <template v-else-if="segment.translation && segment.translation.status === 'error'">
              <span class="translation-error">
                ❌ {{ segment.translation.error || '翻译失败' }}
                <el-button link type="primary" size="small" @click="handleRetry(segment.translation.sentenceId)">重试</el-button>
              </span>
            </template>
            <template v-else>
              <span class="translation-idle">—</span>
            </template>
          </div>
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
import type { SentenceTranslation, ClaimTranslation } from '@/types/translation'

interface HighlightColor {
  bg: string
  border: string
}

interface NodeHighlightInfo {
  color: HighlightColor
  label: string
  nodeId: string
  originalText: string
  chineseText: string
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
const { retryTranslation } = useAITranslation()
const readerBodyRef = ref<HTMLElement | null>(null)

const translationEnabled = computed(() => aiStore.translationConfig.enabled)

const hasGraphData = computed(() => {
  const tab = graphStore.activeTab
  return !!(tab?.extractResult || tab?.serializedGraph)
})

const translationProgressPercent = computed(() => {
  if (translationStore.progress.total === 0) return 0
  return Math.round((translationStore.progress.completed / translationStore.progress.total) * 100)
})

const claimTrans = computed<ClaimTranslation | undefined>(() => {
  const claim = claimStore.getActiveClaim()
  if (!claim) return undefined
  return translationStore.getClaimTranslation(claim.id)
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
    map.set(nodeId, {
      color: HIGHLIGHT_PALETTE[colorIdx],
      label: node?.chineseText || node?.originalText || nodeId,
      nodeId,
      originalText: node?.originalText || '',
      chineseText: node?.chineseText || '',
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

function buildBracketFlexiblePattern(text: string): string {
  const escaped = escapeHtml(text)
  let pattern = ''
  for (const ch of escaped) {
    switch (ch) {
      case '（': case '(': pattern += '[（(]'; break
      case '）': case ')': pattern += '[）)]'; break
      case '【': pattern += '[【\\[]'; break
      case '】': pattern += '[】\\]]'; break
      case '[': pattern += '[【\\[]'; break
      case ']': pattern += '[】\\]]'; break
      case '.': pattern += '\\.'; break
      case '*': pattern += '\\*'; break
      case '+': pattern += '\\+'; break
      case '?': pattern += '\\?'; break
      case '^': pattern += '\\^'; break
      case '$': pattern += '\\$'; break
      case '{': pattern += '\\{'; break
      case '}': pattern += '\\}'; break
      case '|': pattern += '\\|'; break
      case '\\': pattern += '\\\\'; break
      default: pattern += ch; break
    }
  }
  return pattern
}

function highlightTextInSentence(sentenceText: string, mode: 'original' | 'translation' = 'original'): { html: string; colors: (HighlightColor & { nodeLabel: string })[] } {
  const highlights: (HighlightColor & { nodeLabel: string })[] = []
  let html = escapeHtml(sentenceText)

  const nodeTexts: { text: string; info: NodeHighlightInfo }[] = []
  for (const [_nodeId, info] of nodeHighlightMap.value) {
    let text: string
    if (mode === 'translation') {
      text = info.chineseText || info.originalText
    } else {
      text = info.originalText || info.chineseText
    }
    if (text && text.length >= 2) {
      nodeTexts.push({ text, info })
    }
  }

  nodeTexts.sort((a, b) => b.text.length - a.text.length)

  for (const { text, info } of nodeTexts) {
    const pattern = buildBracketFlexiblePattern(text)
    const regex = new RegExp(pattern, 'gi')
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

function handleRetry(sentenceId: string): void {
  const claim = claimStore.getActiveClaim()
  if (claim) {
    retryTranslation(claim.id, sentenceId)
  }
}

const renderedSegments = computed<RenderedSegment[]>(() => {
  const claim = claimStore.getActiveClaim()
  if (!claim || claim.sentences.length === 0) return []

  const segments: RenderedSegment[] = []

  for (const sentence of claim.sentences) {
    const { html, colors } = highlightTextInSentence(sentence.text)
    const translation = translationStore.getSentenceTranslation(claim.id, sentence.id) ?? null
    let translationHighlightedHtml = ''
    if (translation && translation.translatedText) {
      const transHighlight = highlightTextInSentence(translation.translatedText, 'translation')
      translationHighlightedHtml = transHighlight.html
    }

    segments.push({
      text: sentence.text,
      highlightedHtml: html,
      hasHighlight: colors.length > 0,
      highlightColors: colors.length > 0 ? colors : null,
      translation,
      translationHighlightedHtml,
    })
  }

  return segments
})

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
  min-height: 200px;
  border-top: 1px solid var(--border-color);
}

.reader-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 16px;
  background: var(--bg-tertiary);
  border-bottom: 1px solid var(--border-color-light);
  flex-shrink: 0;
}

.reader-header h4 {
  font-size: var(--font-size-sm);
  font-weight: 600;
  color: var(--text-primary);
  margin: 0;
}

.reader-hint {
  font-size: var(--font-size-xs);
  color: var(--text-tertiary);
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

.segment-row {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.segment-with-translation .segment-row {
  flex-direction: row;
  gap: 12px;
}

.segment-original {
  flex: 1;
}

.segment-translation {
  flex: 1;
  padding-left: 12px;
  border-left: 1px solid var(--border-color-light);
  color: var(--text-tertiary);
}

.translation-text {
  vertical-align: middle;
}

.translation-loading {
  color: var(--color-primary);
}

.translation-error {
  color: var(--color-danger);
}

.translation-idle {
  color: var(--text-quaternary);
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
