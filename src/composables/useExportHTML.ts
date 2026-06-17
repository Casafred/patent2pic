/**
 * 可交互 HTML 导出器
 * 使用 graphEngine.toSVG() 获取已渲染的 SVG（与 SVG 导出相同，保证图形可见），
 * 然后通过 data-cell-id 属性添加交互功能。
 */

import { graphEngine } from '@/services/graph/engine'
import { useGraphStore } from '@/stores/graph'
import { useClaimStore } from '@/stores/claim'
import { useTranslationStore } from '@/stores/translation'
import type { ExtractNode } from '@/types/ai'

interface CellInfo {
  id: string
  type: 'node' | 'edge' | 'group' | 'attr-tag' | 'attr-stem' | 'fork'
  originalText?: string
  chineseText?: string
  sourceNodeId?: string
  realSourceId?: string
  realTargetId?: string
  isTrunk?: boolean
  isBranch?: boolean
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** 从 toJSON 数据构建 cell 分类映射 */
function buildCellInfoMap(): Map<string, CellInfo> {
  const cellsRaw = graphEngine.toJSON() as { cells?: Array<Record<string, unknown>> }
  const cells = cellsRaw?.cells ?? []
  const map = new Map<string, CellInfo>()

  for (const cell of cells) {
    const id = cell.id as string
    if (!id) continue
    const d = (cell.data || {}) as Record<string, unknown>
    const shape = cell.shape as string

    let type: CellInfo['type'] = 'node'
    if (d.isGroup) type = 'group'
    else if (d.isAttributeTag) type = 'attr-tag'
    else if (d.isAttributeStem) type = 'attr-stem'
    else if (d.isForkNode) type = 'fork'
    else if (shape === 'edge' || shape === 'edge-with-gap') type = 'edge'

    map.set(id, {
      id,
      type,
      originalText: d.originalText as string,
      chineseText: d.chineseText as string,
      sourceNodeId: d.sourceNodeId as string,
      realSourceId: d.realSourceId as string,
      realTargetId: d.realTargetId as string,
      isTrunk: d.isTrunk as boolean,
      isBranch: d.isBranch as boolean,
    })
  }

  return map
}

/**
 * 后处理 X6 toSVG() 输出的 SVG：
 * 1. 根据 data-cell-id 添加交互属性
 * 2. 移除 fork 节点
 * 3. 清理可能导致 file:// 安全问题的外部引用
 */
function processSVG(svgStr: string, cellInfoMap: Map<string, CellInfo>): string {
  // 使用 DOMParser 解析 SVG
  const parser = new DOMParser()
  const doc = parser.parseFromString(svgStr, 'image/svg+xml')

  // 检查解析错误
  const parseError = doc.querySelector('parsererror')
  if (parseError) {
    console.error('SVG 解析失败，返回原始 SVG')
    return svgStr
  }

  // 找到所有有 data-cell-id 的元素（X6 的 cell 容器）
  const cellElements = doc.querySelectorAll('[data-cell-id]')

  cellElements.forEach(el => {
    const cellId = el.getAttribute('data-cell-id') || ''
    const info = cellInfoMap.get(cellId)

    // 移除 fork 节点（1x1 透明，不需要显示）
    if (info?.type === 'fork' || !info) {
      // 如果没有 info，可能是 fork 节点或其他不需要的 cell
      if (info?.type === 'fork') {
        el.remove()
        return
      }
    }

    if (!info) return

    // 添加交互属性
    el.setAttribute('data-id', cellId)

    switch (info.type) {
      case 'node':
        el.classList.add('p2p-node')
        if (info.originalText) el.setAttribute('data-original', info.originalText)
        if (info.chineseText) el.setAttribute('data-chinese', info.chineseText)
        break
      case 'edge':
        el.classList.add('p2p-edge')
        if (info.isTrunk) el.classList.add('p2p-trunk')
        if (info.isBranch) el.classList.add('p2p-branch')
        if (info.realSourceId) el.setAttribute('data-source', info.realSourceId)
        if (info.realTargetId) el.setAttribute('data-target', info.realTargetId)
        break
      case 'group':
        el.classList.add('p2p-group')
        break
      case 'attr-tag':
        el.classList.add('p2p-attr-tag')
        if (info.sourceNodeId) el.setAttribute('data-source', info.sourceNodeId)
        break
      case 'attr-stem':
        el.classList.add('p2p-attr-stem')
        break
    }
  })

  // 清理可能导致 file:// 安全问题的元素
  // 1. 移除 <image> 标签中的外部引用（保留 data: URI）
  const images = doc.querySelectorAll('image')
  images.forEach(img => {
    const href = img.getAttribute('href') || img.getAttribute('xlink:href') || ''
    if (href && !href.startsWith('data:')) {
      img.remove()
    }
  })

  // 2. 移除 style 中的 url() 外部引用
  const styledElements = doc.querySelectorAll('[style]')
  styledElements.forEach(el => {
    const style = el.getAttribute('style') || ''
    if (style.includes('url(') && !style.includes('url(data:')) {
      el.setAttribute('style', style.replace(/url\([^)]*\)/g, 'none'))
    }
  })

  // 序列化回字符串
  const serializer = new XMLSerializer()
  return serializer.serializeToString(doc)
}

/** 收集导出数据（节点信息、句子、翻译） */
function collectExportData() {
  const graphStore = useGraphStore()
  const claimStore = useClaimStore()
  const translationStore = useTranslationStore()

  const tab = graphStore.activeTab
  const nodes: ExtractNode[] = tab?.extractResult?.nodes ?? []

  const claim = claimStore.getActiveClaim() ?? null
  const sentences = claim?.sentences.map(s => ({ id: s.id, text: s.text })) ?? []

  const translations: Array<{ sentenceId: string; translatedText: string }> = []
  if (claim) {
    const claimTrans = translationStore.getClaimTranslation(claim.id)
    if (claimTrans) {
      for (const s of claimTrans.sentences) {
        translations.push({
          sentenceId: s.sentenceId,
          translatedText: s.translatedText,
        })
      }
    }
  }

  return {
    nodes: nodes.map(n => ({
      id: n.id,
      originalText: n.originalText,
      chineseText: n.chineseText,
    })),
    sentences: sentences.map(s => {
      const trans = translations.find(t => t.sentenceId === s.id)
      return { id: s.id, text: s.text, translation: trans?.translatedText || '' }
    }),
    claimTitle: claim ? `权利要求 ${claim.index}` : '权利要求',
  }
}

/**
 * 生成完整的自包含 HTML
 */
export function exportInteractiveHTML(): string {
  // 1. 获取 X6 渲染的 SVG（与 SVG 导出相同的方法，保证图形可见）
  const rawSvg = graphEngine.toSVG()
  if (!rawSvg) {
    return '<!DOCTYPE html><html><body><h2>画布为空，无法导出</h2></body></html>'
  }

  // 2. 构建 cell 分类映射
  const cellInfoMap = buildCellInfoMap()

  // 3. 后处理 SVG：添加交互属性、移除 fork 节点、清理外部引用
  const processedSvg = processSVG(rawSvg, cellInfoMap)

  // 4. 收集节点和文本数据
  const data = collectExportData()

  const nodesJson = JSON.stringify(data.nodes)
  const sentencesJson = JSON.stringify(data.sentences)
  const claimTitle = data.claimTitle

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
/* 交互样式 */
.p2p-node { cursor: pointer; transition: opacity 0.15s; }
.p2p-node:hover { opacity: 0.8; }
.p2p-edge { cursor: pointer; }
.p2p-edge:hover { opacity: 0.7; }
.p2p-attr-tag { cursor: pointer; }
.p2p-attr-stem { pointer-events: none; }
/* 高亮样式 */
.p2p-node.p2p-highlighted rect { stroke: #e63946 !important; stroke-width: 4 !important; }
.p2p-node.p2p-highlighted polygon { stroke: #e63946 !important; stroke-width: 4 !important; }
.p2p-edge.p2p-highlighted path { stroke: #e63946 !important; stroke-width: 6 !important; }
.p2p-edge.p2p-highlighted line { stroke: #e63946 !important; stroke-width: 6 !important; }
.p2p-edge.p2p-highlighted-branch path { stroke: #e63946 !important; stroke-width: 6 !important; }
.p2p-edge.p2p-highlighted-branch line { stroke: #e63946 !important; stroke-width: 6 !important; }
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
    <div id="svgContainer" style="width:100%;height:100%">${processedSvg}</div>
    <div class="info-bar">点击节点/边高亮 · 滚轮缩放 · 拖拽平移</div>
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
var svgContainer = document.getElementById('svgContainer');
var svgEl = svgContainer.querySelector('svg');
var sidebarBody = document.getElementById('sidebarBody');
var legendBar = document.getElementById('legendBar');

if (!svgEl) {
  svgContainer.innerHTML = '<div style="padding:40px;text-align:center;color:#86909c">SVG 图形加载失败</div>';
}

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
  var html = escapeHtml(text);
  var nodeTexts = [];
  highlightedNodeIds.forEach(function(nodeId, idx) {
    var node = NODES.find(function(n) { return n.id === nodeId; });
    if (!node) return;
    var t = mode === 'translation' ? (node.chineseText || node.originalText) : (node.originalText || node.chineseText);
    if (t && (t.length >= 2 || /[\\u4e00-\\u9fff\\u3400-\\u4dbf]/.test(t))) {
      nodeTexts.push({text: t, nodeId: nodeId, color: HIGHLIGHT_PALETTE[idx % HIGHLIGHT_PALETTE.length]});
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
        return '<mark class="text-highlight" data-node-id="' + item.nodeId + '" style="background-color:' + item.color.bg + ';color:' + item.color.border + '" onclick="textNodeClick(\\'' + item.nodeId + '\\')">' + match + '</mark>';
      }
      return match;
    });
  });
  return html;
}

function updateSentenceHighlight(sentId) {
  var sent = SENTENCES.find(function(s) { return s.id === sentId; });
  if (!sent) return;
  var origEl = document.getElementById('orig-' + sentId);
  var transEl = document.getElementById('trans-' + sentId);
  if (!origEl) return;
  origEl.innerHTML = highlightTextInSentence(sent.text, 'original');
  if (sent.translation) {
    transEl.innerHTML = highlightTextInSentence(sent.translation, 'translation');
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
  document.querySelectorAll('.p2p-node.p2p-highlighted').forEach(function(el) { el.classList.remove('p2p-highlighted'); });
  highlightedNodeIds = ids;
  ids.forEach(function(id) {
    var el = document.querySelector('.p2p-node[data-id="' + id + '"]');
    if (el) el.classList.add('p2p-highlighted');
  });
  updateAllSentences();
  if (ids.length > 0) {
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

function toggleNodeHighlight(nodeId) {
  var idx = highlightedNodeIds.indexOf(nodeId);
  if (idx >= 0) { highlightedNodeIds.splice(idx, 1); }
  else { highlightedNodeIds.push(nodeId); }
  highlightNodes(highlightedNodeIds);
}

function textNodeClick(nodeId) { toggleNodeHighlight(nodeId); }

// === 边高亮 ===
function highlightEdge(edgeId) {
  clearEdgeHighlight();
  var edgeEl = document.querySelector('.p2p-edge[data-id="' + edgeId + '"]');
  if (!edgeEl) return;
  var sourceId = edgeEl.dataset.source;
  var targetId = edgeEl.dataset.target;
  edgeEl.classList.add('p2p-highlighted');
  var isTrunk = edgeEl.classList.contains('p2p-trunk');
  if (isTrunk) {
    document.querySelectorAll('.p2p-branch').forEach(function(be) {
      if (be.dataset.source === sourceId) be.classList.add('p2p-highlighted-branch');
    });
  }
  var nodeIds = [];
  if (isTrunk) {
    nodeIds.push(sourceId);
    document.querySelectorAll('.p2p-branch.p2p-highlighted-branch').forEach(function(be) {
      if (be.dataset.target) nodeIds.push(be.dataset.target);
    });
  } else {
    if (sourceId) nodeIds.push(sourceId);
    if (targetId) nodeIds.push(targetId);
  }
  highlightNodes(nodeIds);
}

function clearEdgeHighlight() {
  document.querySelectorAll('.p2p-highlighted').forEach(function(el) { el.classList.remove('p2p-highlighted'); });
  document.querySelectorAll('.p2p-highlighted-branch').forEach(function(el) { el.classList.remove('p2p-highlighted-branch'); });
}

function clearHighlight() { clearEdgeHighlight(); highlightNodes([]); }

// === 事件绑定 ===
if (svgEl) {
  svgEl.addEventListener('click', function(e) {
    // 找到最近的交互元素
    var nodeEl = e.target.closest('.p2p-node');
    if (nodeEl && nodeEl.dataset.id) {
      if (e.ctrlKey || e.metaKey) toggleNodeHighlight(nodeEl.dataset.id);
      else highlightNodes([nodeEl.dataset.id]);
      e.stopPropagation();
      return;
    }
    var edgeEl = e.target.closest('.p2p-edge');
    if (edgeEl && edgeEl.dataset.id) {
      highlightEdge(edgeEl.dataset.id);
      e.stopPropagation();
      return;
    }
    var attrEl = e.target.closest('.p2p-attr-tag');
    if (attrEl && attrEl.dataset.source) {
      highlightNodes([attrEl.dataset.source]);
      e.stopPropagation();
      return;
    }
    clearHighlight();
  });
}

// === 缩放和平移 ===
var viewState = {x: 0, y: 0, scale: 1};
var viewportEl = null;

// 找到 X6 的 viewport 元素（包含 transform 的 <g>）
if (svgEl) {
  viewportEl = svgEl.querySelector('.x6-graph-svg-viewport') || svgEl.querySelector('g');
}

function applyView() {
  if (viewportEl) {
    viewportEl.setAttribute('transform', 'translate(' + viewState.x + ',' + viewState.y + ') scale(' + viewState.scale + ')');
  }
}

function zoomIn() { viewState.scale = Math.min(3, viewState.scale * 1.2); applyView(); }
function zoomOut() { viewState.scale = Math.max(0.1, viewState.scale / 1.2); applyView(); }
function resetView() { viewState = {x: 0, y: 0, scale: 1}; applyView(); }

if (svgEl) {
  svgEl.addEventListener('wheel', function(e) {
    e.preventDefault();
    var delta = e.deltaY > 0 ? 0.9 : 1.1;
    viewState.scale = Math.max(0.1, Math.min(3, viewState.scale * delta));
    applyView();
  }, {passive: false});

  // 拖拽平移
  var panning = false, panStart = null;
  svgEl.addEventListener('mousedown', function(e) {
    // 只在点击空白区域时平移
    var target = e.target.closest('.p2p-node, .p2p-edge, .p2p-attr-tag');
    if (target) return;
    if (e.button === 0 || e.button === 2) {
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
  svgEl.addEventListener('contextmenu', function(e) { e.preventDefault(); });
}

renderSentences();
</script>
</body>
</html>`
}
