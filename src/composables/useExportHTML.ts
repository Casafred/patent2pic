/**
 * 可交互 HTML 导出器
 * 生成自包含的 HTML 文件，包含：
 * - SVG 图形（节点、边、分组框、属性标签）
 * - 左侧权利要求文本+翻译对照
 * - 交互：拖拽节点、点击高亮、缩放平移、双向文本高亮
 */

import { graphEngine } from '@/services/graph/engine'
import { useGraphStore } from '@/stores/graph'
import { useClaimStore } from '@/stores/claim'
import { useTranslationStore } from '@/stores/translation'
import type { ExtractNode, ExtractEdge } from '@/types/ai'

interface CellData {
  id: string
  shape: string
  position?: { x: number; y: number }
  size?: { width: number; height: number }
  attrs?: Record<string, unknown>
  data?: Record<string, unknown>
  source?: { cell: string; port?: string }
  target?: { cell: string; port?: string }
  labels?: Array<{ position: number; attrs?: Record<string, unknown> }>
  zIndex?: number
  parent?: string
}

interface ExportData {
  cells: CellData[]
  nodes: ExtractNode[]
  edges: ExtractEdge[]
  claim: {
    id: string
    index: number
    rawText: string
    sentences: Array<{ id: string; text: string }>
  } | null
  translations: Array<{
    sentenceId: string
    originalText: string
    translatedText: string
  }>
  isChinese: boolean
}

function collectExportData(): ExportData {
  const graphStore = useGraphStore()
  const claimStore = useClaimStore()
  const translationStore = useTranslationStore()

  const tab = graphStore.activeTab
  const cellsRaw = graphEngine.toJSON() as { cells?: CellData[] }
  const cells = cellsRaw?.cells ?? []

  const nodes = tab?.extractResult?.nodes ?? []
  const edges = tab?.extractResult?.edges ?? []

  const claim = claimStore.getActiveClaim() ?? null
  const sentences = claim?.sentences.map(s => ({ id: s.id, text: s.text })) ?? []

  const translations: ExportData['translations'] = []
  if (claim) {
    const claimTrans = translationStore.getClaimTranslation(claim.id)
    if (claimTrans) {
      for (const s of claimTrans.sentences) {
        translations.push({
          sentenceId: s.sentenceId,
          originalText: s.originalText,
          translatedText: s.translatedText,
        })
      }
    }
  }

  return {
    cells,
    nodes,
    edges,
    claim: claim ? { id: claim.id, index: claim.index, rawText: claim.rawText, sentences } : null,
    translations,
    isChinese: tab?.isChinese ?? false,
  }
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function escapeJs(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n')
}

/**
 * 从 X6 cell 的 attrs 中提取样式信息
 */
function extractNodeStyle(cell: CellData) {
  const attrs = cell.attrs || {}
  const body = (attrs.body as Record<string, unknown>) || {}
  const label = (attrs.label as Record<string, unknown>) || {}
  const data = cell.data || {}
  const style = (data.style as Record<string, unknown>) || {}

  return {
    fill: (body.fill as string) || (style.fill as string) || '#e8f4fd',
    stroke: (body.stroke as string) || (style.stroke as string) || '#1890FF',
    strokeWidth: (body.strokeWidth as number) || (style.strokeWidth as number) || 1.5,
    strokeDasharray: (body.strokeDasharray as string) || null,
    fontSize: (label.fontSize as number) || (style.fontSize as number) || 15,
    fontColor: (label.fill as string) || (style.fontColor as string) || '#1d2129',
    fontWeight: (label.fontWeight as string) || 'bold',
    borderRadius: (body.rx as number) || (style.borderRadius as number) || 8,
    text: (label.text as string) || (data.chineseText as string) || (data.originalText as string) || '',
  }
}

function extractEdgeStyle(cell: CellData) {
  const attrs = cell.attrs || {}
  const line = (attrs.line as Record<string, unknown>) || {}
  const data = cell.data || {}
  const style = (data.style as Record<string, unknown>) || {}

  return {
    stroke: (line.stroke as string) || (style.stroke as string) || '#333',
    strokeWidth: (line.strokeWidth as number) || (style.strokeWidth as number) || 2,
    strokeDasharray: (line.strokeDasharray as string) || (style.strokeDasharray as string) || null,
    targetMarker: line.targetMarker as Record<string, unknown> | string | null,
    sourceMarker: line.sourceMarker as Record<string, unknown> | string | null,
  }
}

function extractEdgeLabels(cell: CellData): Array<{ x: number; y: number; text: string; fontSize: number; fill: string; bgColor: string }> {
  if (!cell.labels || cell.labels.length === 0) return []
  const data = cell.data || {}
  const style = (data.style as Record<string, unknown>) || {}
  const fontSize = (style.fontSize as number) || 15
  const fontColor = (style.fontColor as string) || '#4e5969'
  const bgColor = (style.labelBgColor as string) || '#ffffff'

  return cell.labels.map(label => {
    const attrs = label.attrs || {}
    const labelAttrs = (attrs.label as Record<string, unknown>) || {}
    const rectAttrs = (attrs.rect as Record<string, unknown>) || {}
    const position = (attrs.position as Record<string, unknown>) || {}
    return {
      x: (position.x as number) || 0.5,
      y: (position.y as number) || -10,
      text: (labelAttrs.text as string) || (data.chineseText as string) || (data.originalText as string) || '',
      fontSize: (labelAttrs.fontSize as number) || fontSize,
      fill: (labelAttrs.fill as string) || fontColor,
      bgColor: (rectAttrs.fill as string) || bgColor,
    }
  })
}

/**
 * 生成 SVG 图形部分
 */
function generateSVG(data: ExportData): string {
  const cells = data.cells
  const padding = 40

  // 计算边界
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  const nodeCells: CellData[] = []
  const edgeCells: CellData[] = []
  const groupCells: CellData[] = []
  const attrTagCells: CellData[] = []

  for (const cell of cells) {
    const d = cell.data || {}
    if (d.isGroup) {
      groupCells.push(cell)
    } else if (d.isAttributeTag) {
      attrTagCells.push(cell)
    } else if (cell.shape === 'rect' || cell.shape === 'path') {
      if (cell.position && cell.size) {
        nodeCells.push(cell)
        const x = cell.position.x
        const y = cell.position.y
        const w = cell.size.width
        const h = cell.size.height
        minX = Math.min(minX, x)
        minY = Math.min(minY, y)
        maxX = Math.max(maxX, x + w)
        maxY = Math.max(maxY, y + h)
      }
    } else if (cell.shape && cell.shape.includes('edge')) {
      edgeCells.push(cell)
    }
  }

  // 包含分组框和属性标签到边界
  for (const cell of [...groupCells, ...attrTagCells]) {
    if (cell.position && cell.size) {
      minX = Math.min(minX, cell.position.x)
      minY = Math.min(minY, cell.position.y)
      maxX = Math.max(maxX, cell.position.x + cell.size.width)
      maxY = Math.max(maxY, cell.position.y + cell.size.height)
    }
  }

  if (minX === Infinity) {
    minX = 0; minY = 0; maxX = 800; maxY = 600
  }

  const width = maxX - minX + padding * 2
  const height = maxY - minY + padding * 2
  const offsetX = -minX + padding
  const offsetY = -minY + padding

  let svg = ''

  // 分组框（最底层）
  for (const cell of groupCells) {
    if (!cell.position || !cell.size) continue
    const attrs = cell.attrs || {}
    const body = (attrs.body as Record<string, unknown>) || {}
    const label = (attrs.label as Record<string, unknown>) || {}
    const x = cell.position.x + offsetX
    const y = cell.position.y + offsetY
    const w = cell.size.width
    const h = cell.size.height

    svg += `<g class="group-box" data-id="${escapeHtml(cell.id)}">`
    svg += `<rect x="${x}" y="${y}" width="${w}" height="${h}" `
    svg += `fill="${body.fill || '#fafafa'}" fill-opacity="${body.fillOpacity || 0.5}" `
    svg += `stroke="${body.stroke || '#fa8c16'}" stroke-width="${body.strokeWidth || 1.5}" `
    svg += `stroke-dasharray="${body.strokeDasharray || '6 3'}" rx="${body.rx || 8}" ry="${body.ry || 8}" />`
    if (label.text) {
      svg += `<text x="${x + 12}" y="${y + 24}" font-size="${label.fontSize || 20}" `
      svg += `fill="${label.fill || '#fa8c16'}" font-weight="${label.fontWeight || 'bold'}" `
      svg += `text-anchor="${label.textAnchor || 'start'}">${escapeHtml(label.text as string)}</text>`
    }
    svg += `</g>`
  }

  // 边
  for (const cell of edgeCells) {
    const d = cell.data || {}
    if (d.isAttributeStem) continue // 跳过属性 stem 边
    if (d.isBranch) {
      // branch 边仍然渲染，但较细
    }
    const source = cell.source
    const target = cell.target
    if (!source || !target) continue

    const sourceNode = nodeCells.find(n => n.id === source.cell)
    const targetNode = nodeCells.find(n => n.id === target.cell)
    if (!sourceNode || !targetNode) continue

    const sx = sourceNode.position!.x + sourceNode.size!.width / 2 + offsetX
    const sy = sourceNode.position!.y + sourceNode.size!.height / 2 + offsetY
    const tx = targetNode.position!.x + targetNode.size!.width / 2 + offsetX
    const ty = targetNode.position!.y + targetNode.size!.height / 2 + offsetY

    const style = extractEdgeStyle(cell)
    const labels = extractEdgeLabels(cell)

    // 获取真实端点（处理 trunk/branch）
    const realSourceId = (d.realSourceId as string) || source.cell
    const realTargetId = (d.realTargetId as string) || target.cell
    const isTrunk = d.isTrunk as boolean
    const isBranch = d.isBranch as boolean

    const edgeClass = isTrunk ? 'edge trunk-edge' : isBranch ? 'edge branch-edge' : 'edge'

    svg += `<g class="${edgeClass}" data-id="${escapeHtml(cell.id)}" `
    svg += `data-source="${escapeHtml(realSourceId)}" data-target="${escapeHtml(realTargetId)}">`

    // 线条
    svg += `<line x1="${sx}" y1="${sy}" x2="${tx}" y2="${ty}" `
    svg += `stroke="${style.stroke}" stroke-width="${style.strokeWidth}" `
    if (style.strokeDasharray) svg += `stroke-dasharray="${style.strokeDasharray}" `
    svg += `class="edge-line" />`

    // 箭头标记
    if (style.targetMarker) {
      const angle = Math.atan2(ty - sy, tx - sx)
      const arrowSize = 10
      const ax = tx - arrowSize * Math.cos(angle - Math.PI / 6)
      const ay = ty - arrowSize * Math.sin(angle - Math.PI / 6)
      const bx = tx - arrowSize * Math.cos(angle + Math.PI / 6)
      const by = ty - arrowSize * Math.sin(angle + Math.PI / 6)
      const markerType = typeof style.targetMarker === 'object' ? (style.targetMarker.name as string) : (style.targetMarker as string)
      if (markerType === 'block') {
        const isHollow = typeof style.targetMarker === 'object' && (style.targetMarker as Record<string, unknown>).fill === 'transparent'
        svg += `<polygon points="${tx},${ty} ${ax},${ay} ${bx},${by}" `
        svg += `fill="${isHollow ? 'white' : style.stroke}" stroke="${style.stroke}" stroke-width="1.5" />`
      } else if (markerType === 'diamond') {
        const dx = tx - 8 * Math.cos(angle)
        const dy = ty - 8 * Math.sin(angle)
        svg += `<polygon points="${tx},${ty} ${ax},${ay} ${dx},${dy} ${bx},${by}" `
        svg += `fill="white" stroke="${style.stroke}" stroke-width="1.5" />`
      }
    }

    // 边标签
    for (const label of labels) {
      if (!label.text) continue
      const lx = sx + (tx - sx) * label.x
      const ly = sy + (ty - sy) * label.x + label.y
      const textW = label.text.length * label.fontSize * 0.6 + 8
      const textH = label.fontSize + 6
      svg += `<g class="edge-label-group">`
      svg += `<rect x="${lx - textW / 2}" y="${ly - textH / 2}" width="${textW}" height="${textH}" `
      svg += `fill="${label.bgColor}" rx="3" ry="3" class="edge-label-bg" />`
      svg += `<text x="${lx}" y="${ly + label.fontSize * 0.35}" font-size="${label.fontSize}" `
      svg += `fill="${label.fill}" text-anchor="middle" class="edge-label-text">${escapeHtml(label.text)}</text>`
      svg += `</g>`
    }

    svg += `</g>`
  }

  // 属性标签
  for (const cell of attrTagCells) {
    if (!cell.position || !cell.size) continue
    const attrs = cell.attrs || {}
    const body = (attrs.body as Record<string, unknown>) || {}
    const label = (attrs.label as Record<string, unknown>) || {}
    const d = cell.data || {}
    const x = cell.position.x + offsetX
    const y = cell.position.y + offsetY
    const w = cell.size.width
    const h = cell.size.height
    const sourceNodeId = d.sourceNodeId as string

    svg += `<g class="attr-tag" data-id="${escapeHtml(cell.id)}" data-source="${escapeHtml(sourceNodeId)}">`
    svg += `<rect x="${x}" y="${y}" width="${w}" height="${h}" `
    svg += `fill="${body.fill || '#e6fffb'}" stroke="${body.stroke || '#13c2c2'}" `
    svg += `stroke-width="${body.strokeWidth || 1}" stroke-dasharray="${body.strokeDasharray || '3 3'}" `
    svg += `rx="${body.rx || 4}" ry="${body.ry || 4}" />`
    if (label.text) {
      svg += `<text x="${x + w / 2}" y="${y + h / 2 + (label.fontSize as number || 12) * 0.35}" `
      svg += `font-size="${label.fontSize || 12}" fill="${label.fill || '#13c2c2'}" `
      svg += `text-anchor="middle">${escapeHtml(label.text as string)}</text>`
    }
    svg += `</g>`
  }

  // 节点（最顶层）
  for (const cell of nodeCells) {
    if (!cell.position || !cell.size) continue
    const d = cell.data || {}
    if (d.isForkNode) continue // 跳过 fork 节点（1x1 透明）

    const ns = extractNodeStyle(cell)
    const x = cell.position.x + offsetX
    const y = cell.position.y + offsetY
    const w = cell.size.width
    const h = cell.size.height

    svg += `<g class="node" data-id="${escapeHtml(cell.id)}" `
    svg += `data-original="${escapeJs(d.originalText as string || '')}" `
    svg += `data-chinese="${escapeJs(d.chineseText as string || '')}" `
    svg += `transform="translate(0,0)">`
    svg += `<rect x="${x}" y="${y}" width="${w}" height="${h}" `
    svg += `fill="${ns.fill}" stroke="${ns.stroke}" stroke-width="${ns.strokeWidth}" `
    if (ns.strokeDasharray) svg += `stroke-dasharray="${ns.strokeDasharray}" `
    svg += `rx="${ns.borderRadius}" ry="${ns.borderRadius}" class="node-body" />`
    if (ns.text) {
      // 文本换行处理
      const lines = wrapText(ns.text, w - 16, ns.fontSize)
      const lineHeight = ns.fontSize * 1.3
      const startY = y + h / 2 - (lines.length - 1) * lineHeight / 2 + ns.fontSize * 0.35
      for (let i = 0; i < lines.length; i++) {
        svg += `<text x="${x + w / 2}" y="${startY + i * lineHeight}" `
        svg += `font-size="${ns.fontSize}" fill="${ns.fontColor}" `
        svg += `font-weight="${ns.fontWeight}" text-anchor="middle" class="node-label">${escapeHtml(lines[i])}</text>`
      }
    }
    svg += `</g>`
  }

  return { svg, width, height, offsetX, offsetY } as unknown as string
}

function wrapText(text: string, maxWidth: number, fontSize: number): string[] {
  const charWidth = fontSize * 0.6
  const maxChars = Math.floor(maxWidth / charWidth)
  if (text.length <= maxChars) return [text]

  const lines: string[] = []
  let current = ''
  for (const char of text) {
    if (current.length >= maxChars) {
      lines.push(current)
      current = char
    } else {
      current += char
    }
  }
  if (current) lines.push(current)
  return lines.slice(0, 3) // 最多3行
}

/**
 * 生成完整的自包含 HTML
 */
export function exportInteractiveHTML(): string {
  const data = collectExportData()

  // 计算 SVG 边界
  const cells = data.cells
  const padding = 40
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity

  for (const cell of cells) {
    const d = cell.data || {}
    if (d.isForkNode) continue
    if (cell.position && cell.size) {
      minX = Math.min(minX, cell.position.x)
      minY = Math.min(minY, cell.position.y)
      maxX = Math.max(maxX, cell.position.x + cell.size.width)
      maxY = Math.max(maxY, cell.position.y + cell.size.height)
    }
  }
  if (minX === Infinity) { minX = 0; minY = 0; maxX = 800; maxY = 600 }
  const svgWidth = maxX - minX + padding * 2
  const svgHeight = maxY - minY + padding * 2

  const svgContent = generateSVG(data)

  // 构建节点信息映射
  const nodesInfo = data.nodes.map(n => ({
    id: n.id,
    originalText: n.originalText,
    chineseText: n.chineseText,
  }))

  // 构建句子和翻译
  const sentences = data.claim?.sentences || []
  const transMap = new Map(data.translations.map(t => [t.sentenceId, t.translatedText]))

  const sentencesJson = JSON.stringify(sentences.map(s => ({
    id: s.id,
    text: s.text,
    translation: transMap.get(s.id) || '',
  })))
  const nodesJson = JSON.stringify(nodesInfo)

  const claimTitle = data.claim ? `权利要求 ${data.claim.index}` : '权利要求'

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Patent2Pic - ${escapeHtml(claimTitle)}</title>
<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif; height: 100vh; overflow: hidden; background: #f0f2f5; }
.app { display: flex; height: 100vh; }
.sidebar { width: 420px; min-width: 320px; max-width: 50vw; background: #fff; border-right: 1px solid #e8e8e8; display: flex; flex-direction: column; overflow: hidden; }
.sidebar-header { padding: 12px 16px; background: #fafafa; border-bottom: 1px solid #e8e8e8; font-size: 14px; font-weight: 600; color: #1d2129; display: flex; align-items: center; justify-content: space-between; }
.sidebar-header .title { font-size: 15px; }
.sidebar-body { flex: 1; overflow-y: auto; padding: 12px 16px; }
.sentence-block { margin-bottom: 16px; padding: 10px 12px; border-radius: 6px; background: #fafafa; transition: background 0.2s; }
.sentence-block:hover { background: #f0f7ff; }
.sentence-original { font-size: 14px; line-height: 1.7; color: #1d2129; margin-bottom: 6px; }
.sentence-translation { font-size: 13px; line-height: 1.6; color: #4e5969; font-style: italic; }
.sentence-translation:empty { display: none; }
mark.text-highlight { padding: 1px 3px; border-radius: 3px; font-weight: 600; cursor: pointer; }
.legend-bar { padding: 8px 16px; background: #fafafa; border-bottom: 1px solid #e8e8e8; display: flex; flex-wrap: wrap; gap: 8px; min-height: 36px; align-items: center; }
.legend-item { display: flex; align-items: center; gap: 4px; font-size: 12px; padding: 2px 8px; border-radius: 10px; cursor: pointer; }
.legend-item .dot { width: 10px; height: 10px; border-radius: 50%; }
.canvas-area { flex: 1; position: relative; overflow: hidden; background: #fff; }
.canvas-area svg { width: 100%; height: 100%; cursor: grab; }
.canvas-area svg:active { cursor: grabbing; }
.toolbar { position: absolute; top: 12px; right: 12px; display: flex; gap: 6px; z-index: 10; }
.toolbar button { padding: 6px 12px; border: 1px solid #d9d9d9; background: #fff; border-radius: 4px; cursor: pointer; font-size: 13px; color: #4e5969; transition: all 0.2s; }
.toolbar button:hover { border-color: #1890ff; color: #1890ff; }
.node { cursor: pointer; }
.node-body { transition: stroke-width 0.15s, stroke 0.15s; }
.node:hover .node-body { stroke-width: 3; }
.edge { cursor: pointer; }
.edge-line { transition: stroke-width 0.15s, stroke 0.15s; }
.edge:hover .edge-line { stroke-width: 6; }
.edge-label-group { pointer-events: none; }
.attr-tag { cursor: pointer; }
.highlighted .node-body { stroke: #e63946 !important; stroke-width: 4 !important; }
.highlighted-edge .edge-line { stroke: #e63946 !important; stroke-width: 6 !important; }
.highlighted-branch .edge-line { stroke: #e63946 !important; stroke-width: 6 !important; }
.info-bar { position: absolute; bottom: 12px; left: 12px; padding: 6px 12px; background: rgba(255,255,255,0.9); border: 1px solid #e8e8e8; border-radius: 4px; font-size: 12px; color: #86909c; }
</style>
</head>
<body>
<div class="app">
  <div class="sidebar">
    <div class="sidebar-header">
      <span class="title">${escapeHtml(claimTitle)}</span>
      <span style="font-size:12px;color:#86909c">点击节点高亮文本</span>
    </div>
    <div class="legend-bar" id="legendBar"></div>
    <div class="sidebar-body" id="sidebarBody"></div>
  </div>
  <div class="canvas-area">
    <div class="toolbar">
      <button onclick="zoomIn()">放大</button>
      <button onclick="zoomOut()">缩小</button>
      <button onclick="resetView()">重置视图</button>
      <button onclick="clearHighlight()">清除高亮</button>
    </div>
    <svg id="graphSvg" viewBox="0 0 ${svgWidth} ${svgHeight}" xmlns="http://www.w3.org/2000/svg">
      <g id="viewportGroup">
        ${svgContent}
      </g>
    </svg>
    <div class="info-bar" id="infoBar">拖拽节点移动 · 点击边/节点高亮 · 滚轮缩放 · 右键平移</div>
  </div>
</div>
<script>
var NODES = ${nodesJson};
var SENTENCES = ${sentencesJson};
var HIGHLIGHT_PALETTE = [
  {bg:'#e6f7ff',border:'#1890ff'},
  {bg:'#fff7e6',border:'#fa8c16'},
  {bg:'#f6ffed',border:'#52c41a'},
  {bg:'#fff1f0',border:'#f5222d'},
  {bg:'#f9f0ff',border:'#722ed1'},
  {bg:'#e6fffb',border:'#13c2c2'},
  {bg:'#fff0f6',border:'#eb2f96'},
  {bg:'#fcffe6',border:'#a0d911'}
];
var highlightedNodeIds = [];
var svg = document.getElementById('graphSvg');
var viewportGroup = document.getElementById('viewportGroup');
var sidebarBody = document.getElementById('sidebarBody');
var legendBar = document.getElementById('legendBar');

// === 渲染句子 ===
function renderSentences() {
  sidebarBody.innerHTML = '';
  SENTENCES.forEach(function(sent) {
    var block = document.createElement('div');
    block.className = 'sentence-block';
    block.dataset.sentenceId = sent.id;
    var origDiv = document.createElement('div');
    origDiv.className = 'sentence-original';
    origDiv.id = 'orig-' + sent.id;
    var transDiv = document.createElement('div');
    transDiv.className = 'sentence-translation';
    transDiv.id = 'trans-' + sent.id;
    block.appendChild(origDiv);
    block.appendChild(transDiv);
    sidebarBody.appendChild(block);
    updateSentenceHighlight(sent.id);
  });
}

function escapeHtml(text) {
  var div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function highlightTextInSentence(text, mode) {
  var highlights = [];
  var html = escapeHtml(text);
  var nodeTexts = [];
  highlightedNodeIds.forEach(function(nodeId, idx) {
    var node = NODES.find(function(n) { return n.id === nodeId; });
    if (!node) return;
    var t = mode === 'translation' ? (node.chineseText || node.originalText) : (node.originalText || node.chineseText);
    if (t && (t.length >= 2 || /[\\u4e00-\\u9fff\\u3400-\\u4dbf]/.test(t))) {
      nodeTexts.push({text: t, info: {color: HIGHLIGHT_PALETTE[idx % HIGHLIGHT_PALETTE.length], label: node.chineseText || node.originalText}});
    }
  });
  nodeTexts.sort(function(a, b) { return b.text.length - a.text.length; });
  nodeTexts.forEach(function(item) {
    var escapedText = escapeHtml(item.text);
    var regex = new RegExp(escapedText.replace(/[.*+?^\${}()|[\\]\\\\]/g, '\\\\$&'), 'gi');
    var found = false;
    html = html.replace(regex, function(match) {
      if (!found) {
        found = true;
        if (!highlights.some(function(h) { return h.border === item.info.color.border; })) {
          highlights.push({bg: item.info.color.bg, border: item.info.color.border, nodeLabel: item.info.label, nodeId: highlightedNodeIds[nodeTexts.indexOf(item)]});
        }
        return '<mark class="text-highlight" data-node-id="' + highlightedNodeIds[nodeTexts.indexOf(item)] + '" style="background-color:' + item.info.color.bg + ';color:' + item.info.color.border + '" onclick="textNodeClick(\\'' + highlightedNodeIds[nodeTexts.indexOf(item)] + '\\')">' + match + '</mark>';
      }
      return match;
    });
  });
  return {html: html, colors: highlights};
}

function updateSentenceHighlight(sentId) {
  var sent = SENTENCES.find(function(s) { return s.id === sentId; });
  if (!sent) return;
  var origEl = document.getElementById('orig-' + sentId);
  var transEl = document.getElementById('trans-' + sentId);
  if (!origEl) return;
  var origResult = highlightTextInSentence(sent.text, 'original');
  origEl.innerHTML = origResult.html;
  if (sent.translation) {
    var transResult = highlightTextInSentence(sent.translation, 'translation');
    transEl.innerHTML = transResult.html;
  } else {
    transEl.innerHTML = '';
  }
}

function updateAllSentences() {
  SENTENCES.forEach(function(sent) { updateSentenceHighlight(sent.id); });
  updateLegend();
}

function updateLegend() {
  legendBar.innerHTML = '';
  highlightedNodeIds.forEach(function(nodeId, idx) {
    var node = NODES.find(function(n) { return n.id === nodeId; });
    if (!node) return;
    var color = HIGHLIGHT_PALETTE[idx % HIGHLIGHT_PALETTE.length];
    var item = document.createElement('div');
    item.className = 'legend-item';
    item.style.background = color.bg;
    item.style.border = '1px solid ' + color.border;
    item.innerHTML = '<span class="dot" style="background:' + color.border + '"></span><span>' + escapeHtml(node.chineseText || node.originalText) + '</span>';
    item.onclick = function() { toggleNodeHighlight(nodeId); };
    legendBar.appendChild(item);
  });
}

// === 节点高亮 ===
function highlightNodes(ids) {
  // 清除旧高亮
  document.querySelectorAll('.node.highlighted').forEach(function(el) { el.classList.remove('highlighted'); });
  highlightedNodeIds = ids;
  // 设置新高亮
  ids.forEach(function(id) {
    var el = document.querySelector('.node[data-id="' + id + '"]');
    if (el) el.classList.add('highlighted');
  });
  updateAllSentences();
  // 滚动到第一个高亮句子
  if (ids.length > 0) {
    var firstNode = NODES.find(function(n) { return n.id === ids[0]; });
    if (firstNode) {
      var blocks = sidebarBody.querySelectorAll('.sentence-block');
      for (var i = 0; i < blocks.length; i++) {
        var origEl = blocks[i].querySelector('.sentence-original');
        if (origEl && origEl.innerHTML.indexOf('<mark') !== -1) {
          blocks[i].scrollIntoView({behavior: 'smooth', block: 'center'});
          break;
        }
      }
    }
  }
}

function toggleNodeHighlight(nodeId) {
  var idx = highlightedNodeIds.indexOf(nodeId);
  if (idx >= 0) {
    highlightedNodeIds.splice(idx, 1);
  } else {
    highlightedNodeIds.push(nodeId);
  }
  highlightNodes(highlightedNodeIds);
}

function textNodeClick(nodeId) {
  toggleNodeHighlight(nodeId);
}

// === 边高亮 ===
function highlightEdge(edgeId) {
  clearEdgeHighlight();
  var edgeEl = document.querySelector('.edge[data-id="' + edgeId + '"]');
  if (!edgeEl) return;
  var sourceId = edgeEl.dataset.source;
  var targetId = edgeEl.dataset.target;
  edgeEl.classList.add('highlighted-edge');
  // 高亮 trunk 的 branch 边
  var isTrunk = edgeEl.classList.contains('trunk-edge');
  if (isTrunk) {
    document.querySelectorAll('.branch-edge').forEach(function(be) {
      var bEl = be;
      var bSource = bEl.dataset.source;
      if (bSource === sourceId) {
        bEl.classList.add('highlighted-branch');
      }
    });
  }
  // 高亮节点
  var nodeIds = [];
  if (isTrunk) {
    nodeIds.push(sourceId);
    document.querySelectorAll('.branch-edge.highlighted-branch').forEach(function(be) {
      if (be.dataset.target) nodeIds.push(be.dataset.target);
    });
  } else {
    if (sourceId) nodeIds.push(sourceId);
    if (targetId) nodeIds.push(targetId);
  }
  highlightNodes(nodeIds);
}

function clearEdgeHighlight() {
  document.querySelectorAll('.highlighted-edge').forEach(function(el) { el.classList.remove('highlighted-edge'); });
  document.querySelectorAll('.highlighted-branch').forEach(function(el) { el.classList.remove('highlighted-branch'); });
}

function clearHighlight() {
  clearEdgeHighlight();
  highlightNodes([]);
}

// === 事件绑定 ===
// 节点点击
svg.addEventListener('click', function(e) {
  var nodeEl = e.target.closest('.node');
  if (nodeEl) {
    if (e.ctrlKey || e.metaKey) {
      toggleNodeHighlight(nodeEl.dataset.id);
    } else {
      highlightNodes([nodeEl.dataset.id]);
    }
    e.stopPropagation();
    return;
  }
  var edgeEl = e.target.closest('.edge');
  if (edgeEl) {
    highlightEdge(edgeEl.dataset.id);
    e.stopPropagation();
    return;
  }
  var attrEl = e.target.closest('.attr-tag');
  if (attrEl) {
    var srcId = attrEl.dataset.source;
    if (srcId) highlightNodes([srcId]);
    e.stopPropagation();
    return;
  }
  // 点击空白
  clearHighlight();
});

// === 节点拖拽 ===
var dragging = null;
var dragStart = null;
var nodeStartPos = null;

svg.addEventListener('mousedown', function(e) {
  var nodeEl = e.target.closest('.node');
  if (!nodeEl) return;
  if (e.button !== 0) return;
  e.preventDefault();
  e.stopPropagation();
  dragging = nodeEl;
  dragStart = {x: e.clientX, y: e.clientY};
  var transform = nodeEl.getAttribute('transform') || '';
  var match = transform.match(/translate\\(([-\\d.]+),\\s*([-\\d.]+)\\)/);
  nodeStartPos = match ? {x: parseFloat(match[1]), y: parseFloat(match[2])} : {x: 0, y: 0};
});

document.addEventListener('mousemove', function(e) {
  if (!dragging) return;
  var pt = svg.createSVGPoint();
  pt.x = e.clientX;
  pt.y = e.clientY;
  var ctm = svg.getScreenCTM();
  if (!ctm) return;
  var svgPt = pt.matrixTransform(ctm.inverse());
  var startPt = svg.createSVGPoint();
  startPt.x = dragStart.x;
  startPt.y = dragStart.y;
  var svgStart = startPt.matrixTransform(ctm.inverse());
  var dx = svgPt.x - svgStart.x;
  var dy = svgPt.y - svgStart.y;
  dragging.setAttribute('transform', 'translate(' + (nodeStartPos.x + dx) + ',' + (nodeStartPos.y + dy) + ')');
});

document.addEventListener('mouseup', function() {
  dragging = null;
});

// === 缩放和平移 ===
var viewState = {x: 0, y: 0, scale: 1};

function applyView() {
  viewportGroup.setAttribute('transform', 'translate(' + viewState.x + ',' + viewState.y + ') scale(' + viewState.scale + ')');
}

function zoomIn() {
  viewState.scale = Math.min(3, viewState.scale * 1.2);
  applyView();
}

function zoomOut() {
  viewState.scale = Math.max(0.1, viewState.scale / 1.2);
  applyView();
}

function resetView() {
  viewState = {x: 0, y: 0, scale: 1};
  applyView();
}

// 滚轮缩放
svg.addEventListener('wheel', function(e) {
  e.preventDefault();
  var delta = e.deltaY > 0 ? 0.9 : 1.1;
  var newScale = Math.max(0.1, Math.min(3, viewState.scale * delta));
  var pt = svg.createSVGPoint();
  pt.x = e.clientX;
  pt.y = e.clientY;
  var ctm = svg.getScreenCTM();
  if (!ctm) return;
  var svgPt = pt.matrixTransform(ctm.inverse());
  viewState.x = svgPt.x - (svgPt.x - viewState.x) * (newScale / viewState.scale);
  viewState.y = svgPt.y - (svgPt.y - viewState.y) * (newScale / viewState.scale);
  viewState.scale = newScale;
  applyView();
}, {passive: false});

// 右键平移
var panning = false;
var panStart = null;
svg.addEventListener('contextmenu', function(e) { e.preventDefault(); });
svg.addEventListener('mousedown', function(e) {
  if (e.button === 2) {
    panning = true;
    panStart = {x: e.clientX - viewState.x, y: e.clientY - viewState.y};
    e.preventDefault();
  }
});
document.addEventListener('mousemove', function(e) {
  if (panning) {
    viewState.x = e.clientX - panStart.x;
    viewState.y = e.clientY - panStart.y;
    applyView();
  }
});
document.addEventListener('mouseup', function() { panning = false; });

// 初始化
renderSentences();
</script>
</body>
</html>`
}
