<template>
  <div class="claim-reader" v-if="claimStore.isInputCollapsed">
    <div class="reader-header">
      <h4>权利要求对照阅读</h4>
      <span class="reader-hint" v-if="editorStore.selectedNodeIds.length > 0">
        已选中 {{ editorStore.selectedNodeIds.length }} 个节点
      </span>
      <span class="reader-hint" v-else>点击画布节点查看对应文本</span>
    </div>

    <div class="reader-body" ref="readerBodyRef">
      <div
        v-for="(segment, sIdx) in renderedSegments"
        :key="sIdx"
        :class="['segment', { 'segment-highlighted': segment.highlightColor }]"
        :style="segment.highlightColor ? { backgroundColor: segment.highlightColor.bg, borderLeftColor: segment.highlightColor.border } : {}"
      >
        <span
          v-if="segment.highlightColor"
          class="segment-badge"
          :style="{ backgroundColor: segment.highlightColor.border, color: '#fff' }"
        >{{ segment.nodeLabel }}</span>
        <span
          :class="['segment-text', { 'text-bold': !!segment.highlightColor }]"
          :style="segment.highlightColor ? { color: segment.highlightColor.border } : {}"
        >{{ segment.text }}</span>
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
import type { ExtractNode } from '@/types/ai'

interface HighlightColor {
  bg: string
  border: string
}

interface RenderedSegment {
  text: string
  highlightColor: HighlightColor | null
  nodeLabel: string
  nodeId: string
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
const readerBodyRef = ref<HTMLElement | null>(null)

const extractNodes = computed<ExtractNode[]>(() => {
  const tab = graphStore.activeTab
  if (!tab?.extractResult) return []
  return tab.extractResult.nodes
})

const nodeColorMap = computed<Map<string, { color: HighlightColor; label: string }>>(() => {
  const map = new Map<string, { color: HighlightColor; label: string }>()
  const selectedIds = editorStore.selectedNodeIds

  selectedIds.forEach((nodeId: string, idx: number) => {
    const node = extractNodes.value.find((n: ExtractNode) => n.id === nodeId)
    const colorIdx = idx % HIGHLIGHT_PALETTE.length
    map.set(nodeId, {
      color: HIGHLIGHT_PALETTE[colorIdx],
      label: node?.chineseText || node?.originalText || nodeId,
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

function findMatchingNodeId(sentenceText: string): string | null {
  for (const [nodeId] of nodeColorMap.value) {
    const node = extractNodes.value.find((n: ExtractNode) => n.id === nodeId)
    if (!node) continue

    const src = node.sourceSentence.trim()
    const sent = sentenceText.trim()

    if (src === sent) return nodeId
    if (sent.includes(src) && src.length >= 4) return nodeId
    if (src.includes(sent) && sent.length >= 4) return nodeId
  }
  return null
}

const renderedSegments = computed<RenderedSegment[]>(() => {
  const claim = claimStore.getActiveClaim()
  if (!claim || claim.sentences.length === 0) return []

  const segments: RenderedSegment[] = []

  for (const sentence of claim.sentences) {
    const matchingNodeId = findMatchingNodeId(sentence.text)
    const info = matchingNodeId ? nodeColorMap.value.get(matchingNodeId) : null

    const label = info?.label || ''
    const displayLabel = label.length > 12 ? label.slice(0, 12) + '…' : label

    segments.push({
      text: sentence.text,
      highlightColor: info ? info.color : null,
      nodeLabel: displayLabel,
      nodeId: matchingNodeId || '',
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
