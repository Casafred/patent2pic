/**
 * 可交互 HTML 导出器
 * 使用 graphEngine.toSVG() 获取已渲染的 SVG，
 * 然后通过 data-cell-id 属性添加交互功能。
 *
 * 支持节点拖拽 + 边线避障重路由（移植自 custom-edge.ts 的 perpendicularManhattan 路由算法）。
 * 拖拽节点时联动更新：组合框边界、fork 节点位置、属性标签位置、所有关联边线路径。
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
  /** 边的源节点 ID（所有边类型） */
  edgeSourceId?: string
  /** 边的目标节点 ID（所有边类型） */
  edgeTargetId?: string
  realSourceId?: string
  realTargetId?: string
  isTrunk?: boolean
  isBranch?: boolean
  isContainment?: boolean
  forkNodeId?: string
}

/** 节点几何信息（用于拖拽重路由） */
interface NodeGeom {
  id: string
  x: number
  y: number
  width: number
  height: number
}

/** 边连接信息（用于拖拽重路由） */
interface EdgeConn {
  id: string
  sourceId: string
  targetId: string
  sourcePort?: string
  targetPort?: string
  isTrunk?: boolean
  isBranch?: boolean
  isContainment?: boolean
  isAttributeStem?: boolean
  forkNodeId?: string
  realSourceId?: string
  realTargetId?: string
  /** stem 边的坐标点（source/target 不是 cell 引用而是坐标） */
  stemSourceX?: number
  stemSourceY?: number
  stemTargetX?: number
  stemTargetY?: number
}

/** 组合框信息 */
interface GroupInfo {
  id: string
  memberNodeIds: string[]
  sourceNodeId?: string
  detached?: boolean
}

/** Fork 节点信息 */
interface ForkInfo {
  id: string
  sourceId: string
  targetIds: string[]
}

/** 属性标签信息 */
interface AttrTagInfo {
  id: string
  sourceNodeId: string
  attributeEdgeId: string
  width: number
  height: number
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** 从 X6 cell 数据读取节点位置和尺寸（X6 v2 使用顶层 x/y/width/height） */
function getCellGeom(cell: Record<string, unknown>): NodeGeom | null {
  const id = cell.id as string
  if (!id) return null
  const x = cell.x as number
  const y = cell.y as number
  const width = cell.width as number
  const height = cell.height as number
  if (typeof x !== 'number' || typeof y !== 'number' ||
      typeof width !== 'number' || typeof height !== 'number') return null
  return { id, x, y, width, height }
}

/** 从边 cell 读取连接信息 */
function getEdgeConn(cell: Record<string, unknown>): EdgeConn | null {
  const id = cell.id as string
  if (!id) return null
  const source = cell.source as Record<string, unknown> | undefined
  const target = cell.target as Record<string, unknown> | undefined
  if (!source || !target) return null

  const d = (cell.data || {}) as Record<string, unknown>

  return {
    id,
    sourceId: source.cell as string,
    targetId: target.cell as string,
    sourcePort: source.port as string | undefined,
    targetPort: target.port as string | undefined,
    isTrunk: d.isTrunk as boolean | undefined,
    isBranch: d.isBranch as boolean | undefined,
    isContainment: (d.isContainmentGroupEdge as boolean) || (id.startsWith('containment-edge-')),
    forkNodeId: d.forkNodeId as string | undefined,
    realSourceId: d.realSourceId as string | undefined,
    realTargetId: d.realTargetId as string | undefined,
    isAttributeStem: d.isAttributeStem as boolean | undefined,
  }
}

/** 从 toJSON 数据构建完整的图数据模型 */
function buildGraphModel() {
  const cellsRaw = graphEngine.toJSON() as { cells?: Array<Record<string, unknown>> }
  const cells = cellsRaw?.cells ?? []

  const cellInfoMap = new Map<string, CellInfo>()
  const nodeGeoms = new Map<string, NodeGeom>()
  const edgeConns: EdgeConn[] = []
  const groups: GroupInfo[] = []
  const forks: ForkInfo[] = []
  const attrTags: AttrTagInfo[] = []

  for (const cell of cells) {
    const id = cell.id as string
    if (!id) continue
    const d = (cell.data || {}) as Record<string, unknown>
    const shape = cell.shape as string

    // 分类
    let type: CellInfo['type'] = 'node'
    if (d.isGroup) type = 'group'
    else if (d.isAttributeTag) type = 'attr-tag'
    else if (d.isAttributeStem) type = 'attr-stem'
    else if (d.isForkNode) type = 'fork'
    else if (shape === 'edge' || shape === 'edge-with-gap') type = 'edge'

    // 边的源/目标节点 ID
    const source = cell.source as Record<string, unknown> | undefined
    const target = cell.target as Record<string, unknown> | undefined
    const edgeSourceId = (source?.cell as string) || undefined
    const edgeTargetId = (target?.cell as string) || undefined

    cellInfoMap.set(id, {
      id,
      type,
      originalText: d.originalText as string,
      chineseText: d.chineseText as string,
      sourceNodeId: d.sourceNodeId as string,
      edgeSourceId,
      edgeTargetId,
      realSourceId: d.realSourceId as string,
      realTargetId: d.realTargetId as string,
      isTrunk: d.isTrunk as boolean,
      isBranch: d.isBranch as boolean,
      isContainment: (d.isContainmentGroupEdge as boolean) || (id.startsWith('containment-edge-')),
      forkNodeId: d.forkNodeId as string,
    })

    // 收集节点几何
    if (type === 'node' || type === 'group' || type === 'attr-tag' || type === 'fork') {
      const geom = getCellGeom(cell)
      if (geom) nodeGeoms.set(id, geom)
    }

    // 收集边连接
    if (type === 'edge') {
      const conn = getEdgeConn(cell)
      if (conn) {
        edgeConns.push(conn)
      }
    }

    // 收集属性 stem 边（source/target 是坐标点而非 cell 引用）
    if (type === 'attr-stem') {
      const source = cell.source as Record<string, unknown> | undefined
      const target = cell.target as Record<string, unknown> | undefined
      if (source && target && typeof source.x === 'number' && typeof target.x === 'number') {
        edgeConns.push({
          id,
          sourceId: '',
          targetId: '',
          isAttributeStem: true,
          stemSourceX: source.x as number,
          stemSourceY: source.y as number,
          stemTargetX: target.x as number,
          stemTargetY: target.y as number,
        })
      }
    }

    // 收集组合框
    if (type === 'group') {
      groups.push({
        id,
        memberNodeIds: (d.memberNodeIds as string[]) || [],
        sourceNodeId: d.sourceNodeId as string,
        detached: d.detached as boolean,
      })
    }

    // 收集 fork 节点
    if (type === 'fork') {
      forks.push({
        id,
        sourceId: d.sourceId as string,
        targetIds: (d.targetIds as string[]) || [],
      })
    }

    // 收集属性标签
    if (type === 'attr-tag') {
      const geom = getCellGeom(cell)
      attrTags.push({
        id,
        sourceNodeId: d.sourceNodeId as string,
        attributeEdgeId: d.attributeEdgeId as string,
        width: geom?.width ?? 80,
        height: geom?.height ?? 24,
      })
    }
  }

  return { cellInfoMap, nodeGeoms, edgeConns, groups, forks, attrTags }
}

/**
 * 后处理 X6 toSVG() 输出的 SVG：
 * 1. 根据 data-cell-id 添加交互属性
 * 2. 移除 fork 节点
 * 3. 清理可能导致 file:// 安全问题的外部引用
 */
function processSVG(svgStr: string, cellInfoMap: Map<string, CellInfo>): string {
  const parser = new DOMParser()
  const doc = parser.parseFromString(svgStr, 'image/svg+xml')

  const parseError = doc.querySelector('parsererror')
  if (parseError) {
    console.error('SVG 解析失败，返回原始 SVG')
    return svgStr
  }

  const cellElements = doc.querySelectorAll('[data-cell-id]')

  cellElements.forEach(el => {
    const cellId = el.getAttribute('data-cell-id') || ''

    // 始终设置 data-id（即使 info 未找到，也用 data-cell-id 作为标识）
    el.setAttribute('data-id', cellId)

    // 移除 fork 节点（1x1 透明，不需要显示）
    const info = cellInfoMap.get(cellId)
    if (info?.type === 'fork') {
      el.remove()
      return
    }

    if (!info) return

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
        if (info.isContainment) el.classList.add('p2p-containment')
        // data-source/target：优先使用 realSourceId/realTargetId（trunk/branch），回退到 edgeSourceId/edgeTargetId
        el.setAttribute('data-source', info.realSourceId || info.edgeSourceId || '')
        el.setAttribute('data-target', info.realTargetId || info.edgeTargetId || '')
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

  // 添加 pan/zoom wrapper，保留初始 viewport transform
  const viewport = doc.querySelector('.x6-graph-svg-viewport')
  if (viewport && viewport.parentNode) {
    const wrapper = doc.createElementNS('http://www.w3.org/2000/svg', 'g')
    wrapper.setAttribute('class', 'p2p-pan-zoom-wrapper')
    viewport.parentNode.insertBefore(wrapper, viewport)
    wrapper.appendChild(viewport)
  }

  // 清理可能导致 file:// 安全问题的元素
  const images = doc.querySelectorAll('image')
  images.forEach(img => {
    const href = img.getAttribute('href') || img.getAttribute('xlink:href') || ''
    if (href && !href.startsWith('data:')) {
      img.remove()
    }
  })

  const styledElements = doc.querySelectorAll('[style]')
  styledElements.forEach(el => {
    const style = el.getAttribute('style') || ''
    if (style.includes('url(') && !style.includes('url(data:')) {
      el.setAttribute('style', style.replace(/url\([^)]*\)/g, 'none'))
    }
  })

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
 * 包含节点拖拽 + 边线避障重路由（移植自 custom-edge.ts 的 perpendicularManhattan 算法）
 */
export function exportInteractiveHTML(): string {
  const rawSvg = graphEngine.toSVG()
  if (!rawSvg) {
    return '<!DOCTYPE html><html><body><h2>画布为空，无法导出</h2></body></html>'
  }

  const model = buildGraphModel()
  const processedSvg = processSVG(rawSvg, model.cellInfoMap)
  const data = collectExportData()

  const nodesJson = JSON.stringify(data.nodes)
  const sentencesJson = JSON.stringify(data.sentences)
  const claimTitle = data.claimTitle

  // 序列化图模型数据（用于拖拽重路由）
  const nodeGeomsJson = JSON.stringify(Array.from(model.nodeGeoms.values()))
  const edgeConnsJson = JSON.stringify(model.edgeConns)
  const groupsJson = JSON.stringify(model.groups)
  const forksJson = JSON.stringify(model.forks)
  const attrTagsJson = JSON.stringify(model.attrTags)

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
.canvas-area svg { width: 100%; height: 100%; }
.toolbar { position: absolute; top: 12px; right: 12px; display: flex; gap: 6px; z-index: 10; }
.toolbar button { padding: 6px 12px; border: 1px solid #d9d9d9; background: #fff; border-radius: 4px; cursor: pointer; font-size: 13px; color: #4e5969; transition: all 0.2s; }
.toolbar button:hover { border-color: #1890ff; color: #1890ff; }
.toolbar button.active { background: #1890ff; color: #fff; border-color: #1890ff; }
/* 交互样式 */
.p2p-node { cursor: move; pointer-events: all; }
.p2p-node * { pointer-events: all; }
.p2p-node:hover { opacity: 0.85; }
.p2p-group { cursor: move; pointer-events: all; }
.p2p-group * { pointer-events: all; }
.p2p-attr-tag { cursor: move; pointer-events: all; }
.p2p-attr-tag * { pointer-events: all; }
.p2p-edge { cursor: pointer; pointer-events: stroke; }
.p2p-edge * { pointer-events: stroke; }
.p2p-edge:hover { opacity: 0.7; }
.p2p-attr-stem { pointer-events: none; }
.p2p-attr-stem * { pointer-events: none; }
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
      <span style="font-size:12px;color:#86909c">点击高亮 · Ctrl多选 · 拖拽移动</span>
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
    <div class="info-bar">点击节点/边高亮 · Ctrl多选 · 滚轮缩放 · 拖拽节点移动 · 空白区拖拽平移</div>
  </div>
</div>
<script>
// === 图模型数据 ===
var NODES = ${nodesJson};
var SENTENCES = ${sentencesJson};
var NODE_GEOMS = ${nodeGeomsJson};
var EDGE_CONNS = ${edgeConnsJson};
var GROUPS = ${groupsJson};
var FORKS = ${forksJson};
var ATTR_TAGS = ${attrTagsJson};

// 构建 id -> geom 映射（运行时可变）
var nodeGeomMap = {};
NODE_GEOMS.forEach(function(g) { nodeGeomMap[g.id] = JSON.parse(JSON.stringify(g)); });

// 构建 id -> edgeConn 映射
var edgeConnMap = {};
EDGE_CONNS.forEach(function(e) { edgeConnMap[e.id] = e; });

// 构建 groupId -> group 映射
var groupMap = {};
GROUPS.forEach(function(g) { groupMap[g.id] = g; });

var HIGHLIGHT_PALETTE = [
  {bg:'#e6f7ff',border:'#1890ff'},{bg:'#fff7e6',border:'#fa8c16'},
  {bg:'#f6ffed',border:'#52c41a'},{bg:'#fff1f0',border:'#f5222d'},
  {bg:'#f9f0ff',border:'#722ed1'},{bg:'#e6fffb',border:'#13c2c2'},
  {bg:'#fff0f6',border:'#eb2f96'},{bg:'#fcffe6',border:'#a0d911'}
];
var highlightedNodeIds = [];
var svgContainer = document.getElementById('svgContainer');
var svgEl = svgContainer.querySelector('svg');
var sidebarBody = document.getElementById('sidebarBody');
var legendBar = document.getElementById('legendBar');

if (!svgEl) {
  svgContainer.innerHTML = '<div style="padding:40px;text-align:center;color:#86909c">SVG 图形加载失败</div>';
}

// ============================================================
// Cell 类型映射（用于事件处理时快速判断类型，不依赖 CSS class）
// ============================================================
var cellTypeMap = {};
NODE_GEOMS.forEach(function(g) { cellTypeMap[g.id] = 'node'; });
EDGE_CONNS.forEach(function(e) { cellTypeMap[e.id] = e.isAttributeStem ? 'attr-stem' : 'edge'; });
GROUPS.forEach(function(g) { cellTypeMap[g.id] = 'group'; });
FORKS.forEach(function(f) { cellTypeMap[f.id] = 'fork'; });
ATTR_TAGS.forEach(function(t) { cellTypeMap[t.id] = 'attr-tag'; });

/** 从点击目标向上遍历 DOM（使用 parentNode 跨越 foreignObject 的 HTML/SVG 边界），找到 data-cell-id 对应的 cell 信息 */
function findCellInfo(target) {
  var el = target;
  while (el && el !== svgEl) {
    if (el.nodeType === 1 && el.getAttribute) {
      var cellId = el.getAttribute('data-id') || el.getAttribute('data-cell-id');
      if (cellId && cellTypeMap[cellId]) {
        return { el: el, cellId: cellId, type: cellTypeMap[cellId] };
      }
    }
    el = el.parentNode;
  }
  return null;
}

// ============================================================
// 路由算法（移植自 src/services/graph/custom-edge.ts）
// ============================================================

function getConnectionSide(nodeCenterX, nodeCenterY, otherCenterX, otherCenterY, nodeWidth, nodeHeight) {
  var dx = otherCenterX - nodeCenterX;
  var dy = otherCenterY - nodeCenterY;
  if (dx === 0 && dy === 0) return 'right';
  var halfWidth = nodeWidth / 2;
  var halfHeight = nodeHeight / 2;
  var tx = dx !== 0 ? halfWidth / Math.abs(dx) : Infinity;
  var ty = dy !== 0 ? halfHeight / Math.abs(dy) : Infinity;
  if (tx <= ty) { return dx > 0 ? 'right' : 'left'; }
  else { return dy > 0 ? 'bottom' : 'top'; }
}

function sideFromPortId(portId) {
  if (!portId) return null;
  if (portId.endsWith('-top')) return 'top';
  if (portId.endsWith('-bottom')) return 'bottom';
  if (portId.endsWith('-left')) return 'left';
  if (portId.endsWith('-right')) return 'right';
  return null;
}

function isHorizontal(side) { return side === 'left' || side === 'right'; }

function getOutsidePoint(bbox, side, jetty) {
  var cx = bbox.x + bbox.width / 2;
  var cy = bbox.y + bbox.height / 2;
  switch (side) {
    case 'right':  return { x: bbox.x + bbox.width + jetty, y: cy };
    case 'left':   return { x: bbox.x - jetty, y: cy };
    case 'bottom': return { x: cx, y: bbox.y + bbox.height + jetty };
    case 'top':    return { x: cx, y: bbox.y - jetty };
  }
}

function segmentCrossesBBox(x1, y1, x2, y2, bbox) {
  if (y1 === y2) {
    var minX = Math.min(x1, x2); var maxX = Math.max(x1, x2);
    return minX < bbox.x + bbox.width && maxX > bbox.x && y1 > bbox.y && y1 < bbox.y + bbox.height;
  }
  if (x1 === x2) {
    var minY = Math.min(y1, y2); var maxY = Math.max(y1, y2);
    return x1 > bbox.x && x1 < bbox.x + bbox.width && minY < bbox.y + bbox.height && maxY > bbox.y;
  }
  return false;
}

function orthRouter(sourceBBox, targetBBox, startSide, endSide, jetty) {
  var s = getOutsidePoint(sourceBBox, startSide, jetty);
  var e = getOutsidePoint(targetBBox, endSide, jetty);
  var startHoriz = isHorizontal(startSide);
  var endHoriz = isHorizontal(endSide);
  var points = [{ x: s.x, y: s.y }];
  var sameNode = sourceBBox.x === targetBBox.x && sourceBBox.y === targetBBox.y && sourceBBox.width === targetBBox.width && sourceBBox.height === targetBBox.height;
  if (sameNode) {
    if (startSide === endSide) {
      if (startHoriz) { var tY = sourceBBox.y - jetty; var bY = sourceBBox.y + sourceBBox.height + jetty; var oY = Math.abs(s.y-tY)<=Math.abs(s.y-bY)?tY:bY; points.push({x:s.x,y:oY},{x:e.x,y:oY}); }
      else { var lX = sourceBBox.x - jetty; var rX = sourceBBox.x + sourceBBox.width + jetty; var oX = Math.abs(s.x-lX)<=Math.abs(s.x-rX)?lX:rX; points.push({x:oX,y:s.y},{x:oX,y:e.y}); }
    } else if (startHoriz && !endHoriz) {
      var ox = startSide==='right' ? sourceBBox.x+sourceBBox.width+jetty : sourceBBox.x-jetty;
      var oy = endSide==='top' ? sourceBBox.y-jetty : sourceBBox.y+sourceBBox.height+jetty;
      points.push({x:ox,y:s.y},{x:ox,y:oy},{x:e.x,y:oy});
    } else if (!startHoriz && endHoriz) {
      var oy2 = startSide==='top' ? sourceBBox.y-jetty : sourceBBox.y+sourceBBox.height+jetty;
      var ox2 = endSide==='right' ? sourceBBox.x+sourceBBox.width+jetty : sourceBBox.x-jetty;
      points.push({x:s.x,y:oy2},{x:ox2,y:oy2},{x:ox2,y:e.y});
    } else {
      if ((startSide==='top'&&endSide==='bottom')||(startSide==='bottom'&&endSide==='top')) {
        var lX2=sourceBBox.x-jetty; var rX2=sourceBBox.x+sourceBBox.width+jetty;
        var oX2=Math.abs(s.x-lX2)<=Math.abs(s.x-rX2)?lX2:rX2; points.push({x:oX2,y:s.y},{x:oX2,y:e.y});
      } else {
        var tY2=sourceBBox.y-jetty; var bY2=sourceBBox.y+sourceBBox.height+jetty;
        var oY2=Math.abs(s.y-tY2)<=Math.abs(s.y-bY2)?tY2:bY2; points.push({x:s.x,y:oY2},{x:e.x,y:oY2});
      }
    }
    points.push({x:e.x,y:e.y}); return points;
  }
  if (startHoriz && endHoriz) {
    if (startSide === endSide) { var mX=startSide==='right'?Math.max(s.x,e.x):Math.min(s.x,e.x); points.push({x:mX,y:s.y},{x:mX,y:e.y}); }
    else { var mX2=(s.x+e.x)/2; if(segmentCrossesBBox(mX2,s.y,mX2,e.y,sourceBBox)||segmentCrossesBBox(mX2,s.y,mX2,e.y,targetBBox)){var tY3=Math.min(sourceBBox.y,targetBBox.y)-jetty;var bY3=Math.max(sourceBBox.y+sourceBBox.height,targetBBox.y+targetBBox.height)+jetty;var oY3=Math.abs(s.y-tY3)<=Math.abs(s.y-bY3)?tY3:bY3;points.push({x:s.x,y:oY3},{x:e.x,y:oY3});}else{points.push({x:mX2,y:s.y},{x:mX2,y:e.y});} }
  } else if (!startHoriz && !endHoriz) {
    if (startSide === endSide) { var mY=startSide==='bottom'?Math.max(s.y,e.y):Math.min(s.y,e.y); points.push({x:s.x,y:mY},{x:e.x,y:mY}); }
    else { var mY2=(s.y+e.y)/2; if(segmentCrossesBBox(s.x,mY2,e.x,mY2,sourceBBox)||segmentCrossesBBox(s.x,mY2,e.x,mY2,targetBBox)){var lX3=Math.min(sourceBBox.x,targetBBox.x)-jetty;var rX3=Math.max(sourceBBox.x+sourceBBox.width,targetBBox.x+targetBBox.width)+jetty;var oX3=Math.abs(s.x-lX3)<=Math.abs(s.x-rX3)?lX3:rX3;points.push({x:oX3,y:s.y},{x:oX3,y:e.y});}else{points.push({x:s.x,y:mY2},{x:e.x,y:mY2});} }
  } else if (startHoriz && !endHoriz) {
    if(segmentCrossesBBox(s.x,s.y,e.x,s.y,targetBBox)){if(segmentCrossesBBox(s.x,s.y,s.x,e.y,sourceBBox)){var oX4=startSide==='right'?Math.max(sourceBBox.x+sourceBBox.width,targetBBox.x+targetBBox.width)+jetty:Math.min(sourceBBox.x,targetBBox.x)-jetty;points.push({x:oX4,y:s.y},{x:oX4,y:e.y});}else{points.push({x:s.x,y:e.y});}}else{points.push({x:e.x,y:s.y});}
  } else {
    if(segmentCrossesBBox(s.x,s.y,s.x,e.y,targetBBox)){if(segmentCrossesBBox(s.x,s.y,e.x,s.y,sourceBBox)){var oY4=startSide==='bottom'?Math.max(sourceBBox.y+sourceBBox.height,targetBBox.y+targetBBox.height)+jetty:Math.min(sourceBBox.y,targetBBox.y)-jetty;points.push({x:s.x,y:oY4},{x:e.x,y:oY4});}else{points.push({x:e.x,y:s.y});}}else{points.push({x:s.x,y:e.y});}
  }
  points.push({x:e.x,y:e.y}); return points;
}

function routeEdge(conn) {
  var sourceGeom = nodeGeomMap[conn.sourceId];
  var targetGeom = nodeGeomMap[conn.targetId];
  if (!sourceGeom || !targetGeom) return null;
  var sourceBBox = {x:sourceGeom.x,y:sourceGeom.y,width:sourceGeom.width,height:sourceGeom.height};
  var targetBBox = {x:targetGeom.x,y:targetGeom.y,width:targetGeom.width,height:targetGeom.height};
  var scX=sourceBBox.x+sourceBBox.width/2, scY=sourceBBox.y+sourceBBox.height/2;
  var tcX=targetBBox.x+targetBBox.width/2, tcY=targetBBox.y+targetBBox.height/2;
  var startSide = sideFromPortId(conn.sourcePort) || getConnectionSide(scX,scY,tcX,tcY,sourceBBox.width,sourceBBox.height);
  var endSide = sideFromPortId(conn.targetPort) || getConnectionSide(tcX,tcY,scX,scY,targetBBox.width,targetBBox.height);
  return orthRouter(sourceBBox, targetBBox, startSide, endSide, 20);
}

function pointsToPathD(points, radius) {
  if (!points || points.length === 0) return '';
  if (points.length === 1) return 'M ' + points[0].x + ' ' + points[0].y;
  radius = radius || 8;
  var d = 'M ' + points[0].x + ' ' + points[0].y;
  for (var i = 1; i < points.length; i++) {
    if (i < points.length - 1 && radius > 0) {
      var prev=points[i-1], curr=points[i], next=points[i+1];
      var dx1=curr.x-prev.x, dy1=curr.y-prev.y, dx2=next.x-curr.x, dy2=next.y-curr.y;
      var len1=Math.sqrt(dx1*dx1+dy1*dy1), len2=Math.sqrt(dx2*dx2+dy2*dy2);
      var r=Math.min(radius,len1/2,len2/2);
      if(r<1){d+=' L '+curr.x+' '+curr.y;}
      else{var p1x=curr.x-(dx1/len1)*r,p1y=curr.y-(dy1/len1)*r,p2x=curr.x+(dx2/len2)*r,p2y=curr.y+(dy2/len2)*r;var cross=dx1*dy2-dy1*dx2;var sweep=cross>0?1:0;d+=' L '+p1x+' '+p1y;d+=' A '+r+' '+r+' 0 0 '+sweep+' '+p2x+' '+p2y;}
    } else { d += ' L ' + points[i].x + ' ' + points[i].y; }
  }
  return d;
}

// ============================================================
// 联动更新算法（移植自 engine.ts）
// ============================================================

function calculateForkPosition(sourceId, targetIds) {
  var sg = nodeGeomMap[sourceId]; if(!sg) return {x:0,y:0};
  var scX=sg.x+sg.width/2, scY=sg.y+sg.height/2;
  var tcSX=0,tcSY=0,tc=0;
  for(var i=0;i<targetIds.length;i++){var tg=nodeGeomMap[targetIds[i]];if(!tg)continue;tcSX+=tg.x+tg.width/2;tcSY+=tg.y+tg.height/2;tc++;}
  if(tc===0)return{x:scX,y:scY};
  return{x:scX+0.8*(tcSX/tc-scX),y:scY+0.8*(tcSY/tc-scY)};
}

function updateForkNodePositions() {
  FORKS.forEach(function(fork){var np=calculateForkPosition(fork.sourceId,fork.targetIds);if(nodeGeomMap[fork.id]){nodeGeomMap[fork.id].x=np.x;nodeGeomMap[fork.id].y=np.y;}});
}

function updateAttributeTagPositions(nodeId) {
  var sg = nodeGeomMap[nodeId]; if(!sg) return;
  var stemLength=16, tagGap=6, currentY=sg.y+sg.height+stemLength;
  var tags = ATTR_TAGS.filter(function(t){return t.sourceNodeId===nodeId;});
  tags.sort(function(a,b){var ga=nodeGeomMap[a.id],gb=nodeGeomMap[b.id];return(ga?ga.y:0)-(gb?gb.y:0);});
  tags.forEach(function(tag){
    var tagX=sg.x+sg.width/2-tag.width/2;
    if(nodeGeomMap[tag.id]){nodeGeomMap[tag.id].x=tagX;nodeGeomMap[tag.id].y=currentY;}
    var stemEdgeId='attr-stem-'+tag.attributeEdgeId;
    var stemConn=edgeConnMap[stemEdgeId];
    if(stemConn){var sx=sg.x+sg.width/2;stemConn.stemSourceX=sx;stemConn.stemSourceY=sg.y+sg.height;stemConn.stemTargetX=sx;stemConn.stemTargetY=currentY;}
    currentY+=tag.height+tagGap;
  });
}

function updateGroupBoundsForMember(nodeId) {
  GROUPS.forEach(function(group){
    if(group.detached)return;
    if(nodeId&&group.memberNodeIds.indexOf(nodeId)===-1)return;
    var mg=group.memberNodeIds.map(function(id){return nodeGeomMap[id];}).filter(Boolean);
    if(mg.length===0)return;
    var mnx=Infinity,mny=Infinity,mxx=-Infinity,mxy=-Infinity;
    mg.forEach(function(g){mnx=Math.min(mnx,g.x);mny=Math.min(mny,g.y);mxx=Math.max(mxx,g.x+g.width);mxy=Math.max(mxy,g.y+g.height);});
    var pad=25,ls=36;
    if(nodeGeomMap[group.id]){nodeGeomMap[group.id].x=mnx-pad;nodeGeomMap[group.id].y=mny-pad-ls;nodeGeomMap[group.id].width=mxx-mnx+pad*2;nodeGeomMap[group.id].height=mxy-mny+pad*2+ls;}
  });
}

// ============================================================
// SVG 元素操作
// ============================================================

function setNodeTransform(el, x, y) {
  var transform = el.getAttribute('transform') || '';
  var baseTransform = transform.replace(/translate\\([^)]*\\)/g, '').trim();
  el.setAttribute('transform', 'translate(' + x + ',' + y + ')' + (baseTransform ? ' ' + baseTransform : ''));
}

function updateElementTransform(nodeId) {
  var geom = nodeGeomMap[nodeId]; if(!geom) return;
  var el = svgEl.querySelector('[data-cell-id="' + nodeId + '"]') ||
           svgEl.querySelector('[data-id="' + nodeId + '"]');
  if (el) setNodeTransform(el, geom.x, geom.y);
}

function updateGroupRect(groupId) {
  var geom = nodeGeomMap[groupId]; if(!geom) return;
  var el = svgEl.querySelector('[data-cell-id="' + groupId + '"]') ||
           svgEl.querySelector('[data-id="' + groupId + '"]');
  if (!el) return;
  var rect = el.querySelector('rect');
  if (rect) { rect.setAttribute('width', String(geom.width)); rect.setAttribute('height', String(geom.height)); }
}

/** 重路由单条边并更新 SVG */
function rerouteEdge(edgeId) {
  var conn = edgeConnMap[edgeId]; if(!conn) return;
  var edgeEl = svgEl.querySelector('[data-cell-id="' + edgeId + '"]') ||
               svgEl.querySelector('[data-id="' + edgeId + '"]');
  if (!edgeEl) return;
  var pathEl = edgeEl.querySelector('path'); if (!pathEl) return;

  // stem 边使用坐标点
  if (conn.isAttributeStem) {
    var sx = conn.stemSourceX, sy = conn.stemSourceY, tx = conn.stemTargetX, ty = conn.stemTargetY;
    if (typeof sx === 'number') {
      pathEl.setAttribute('d', 'M ' + sx + ' ' + sy + ' L ' + tx + ' ' + ty);
    }
    return;
  }

  var points = routeEdge(conn);
  if (!points || points.length === 0) return;
  pathEl.setAttribute('d', pointsToPathD(points, 8));

  // 更新边标签位置
  var labelEl = edgeEl.querySelector('.x6-edge-label');
  if (labelEl) {
    var midIdx = Math.floor(points.length / 2);
    var midPoint = points[midIdx] || points[0];
    var transform = labelEl.getAttribute('transform') || '';
    var baseTransform = transform.replace(/translate\\([^)]*\\)/g, '').trim();
    labelEl.setAttribute('transform', 'translate(' + midPoint.x + ',' + midPoint.y + ')' + (baseTransform ? ' ' + baseTransform : ''));
  }
}

function rerouteConnectedEdges(nodeId) {
  EDGE_CONNS.forEach(function(conn) {
    if (conn.sourceId === nodeId || conn.targetId === nodeId) rerouteEdge(conn.id);
  });
}

/** 节点移动后的完整联动更新（节点自身的 geom 和 transform 已在 mousemove 中更新） */
function onNodeMoved(nodeId, newX, newY) {
  var geom = nodeGeomMap[nodeId]; if(!geom) return;
  // geom.x/y 已在 mousemove 中更新，此处不再重复设置

  // 1. 更新组合框边界 + SVG
  updateGroupBoundsForMember(nodeId);
  GROUPS.forEach(function(group) {
    if (!group.detached && group.memberNodeIds.indexOf(nodeId) !== -1) {
      updateElementTransform(group.id);
      updateGroupRect(group.id);
    }
  });

  // 2. 更新 fork 节点位置（fork 已从 SVG 移除，只更新数据）
  updateForkNodePositions();

  // 3. 更新属性标签位置 + SVG
  updateAttributeTagPositions(nodeId);
  ATTR_TAGS.forEach(function(tag) {
    if (tag.sourceNodeId === nodeId) updateElementTransform(tag.id);
  });

  // 4. 重路由所有关联边
  rerouteConnectedEdges(nodeId);

  // 5. 重路由连接到组合框的边
  GROUPS.forEach(function(group) {
    if (group.memberNodeIds.indexOf(nodeId) !== -1) rerouteConnectedEdges(group.id);
  });

  // 6. 重路由连接到 fork 节点的边
  FORKS.forEach(function(fork) {
    if (fork.sourceId === nodeId || fork.targetIds.indexOf(nodeId) !== -1) rerouteConnectedEdges(fork.id);
  });

  // 7. 重路由属性标签的 stem 边
  ATTR_TAGS.forEach(function(tag) {
    if (tag.sourceNodeId === nodeId) rerouteEdge('attr-stem-' + tag.attributeEdgeId);
  });
}

/** 组合框拖拽时移动所有成员 */
function onGroupMoved(groupId, dx, dy) {
  var group = groupMap[groupId];
  if (!group || group.detached) return;

  // 移动所有成员节点
  group.memberNodeIds.forEach(function(memberId) {
    var mg = nodeGeomMap[memberId];
    if (mg) { mg.x += dx; mg.y += dy; updateElementTransform(memberId); }
  });

  // 更新组合框自身的边界（基于成员新位置重新计算）
  updateGroupBoundsForMember(groupId);
  updateGroupRect(groupId);

  // 成员移动后需要更新边线等
  group.memberNodeIds.forEach(function(memberId) {
    rerouteConnectedEdges(memberId);
  });

  // 更新属性标签
  ATTR_TAGS.forEach(function(tag) {
    if (group.memberNodeIds.indexOf(tag.sourceNodeId) !== -1) {
      updateAttributeTagPositions(tag.sourceNodeId);
      updateElementTransform(tag.id);
      rerouteEdge('attr-stem-' + tag.attributeEdgeId);
    }
  });

  // 更新 fork
  updateForkNodePositions();

  // 重路由连接到组合框的边
  rerouteConnectedEdges(groupId);
}

// ============================================================
// 坐标转换
// ============================================================

var viewState = {x: 0, y: 0, scale: 1};
var viewportEl = svgEl ? (svgEl.querySelector('.x6-graph-svg-viewport') || svgEl.querySelector('g')) : null;
var wrapperEl = svgEl ? svgEl.querySelector('.p2p-pan-zoom-wrapper') : null;

function applyView() {
  if (wrapperEl) wrapperEl.setAttribute('transform', 'translate(' + viewState.x + ',' + viewState.y + ') scale(' + viewState.scale + ')');
}

/** 将屏幕坐标转换为图坐标（viewport <g> 的局部坐标系） */
function screenToGraph(clientX, clientY) {
  if (viewportEl) {
    var ctm = viewportEl.getScreenCTM();
    if (ctm) {
      var pt = svgEl.createSVGPoint();
      pt.x = clientX; pt.y = clientY;
      pt = pt.matrixTransform(ctm.inverse());
      return { x: pt.x, y: pt.y };
    }
  }
  // 回退：使用 SVG 根 CTM
  var ctm2 = svgEl.getScreenCTM();
  if (ctm2) {
    var pt2 = svgEl.createSVGPoint();
    pt2.x = clientX; pt2.y = clientY;
    pt2 = pt2.matrixTransform(ctm2.inverse());
    return { x: pt2.x, y: pt2.y };
  }
  return { x: clientX, y: clientY };
}

// ============================================================
// 拖拽逻辑（区分点击和拖拽）
// ============================================================

var DRAG_THRESHOLD = 4;  // 像素
var dragState = null;    // {nodeId, el, startClientX, startClientY, startGraphX, startGraphY, startNodeX, startNodeY, isGroup, memberStartPositions, moved}

if (svgEl) {
  svgEl.addEventListener('mousedown', function(e) {
    if (e.button !== 0) return;  // 只处理左键

    var info = findCellInfo(e.target);

    if (info) {
      if (info.type === 'node' || info.type === 'group' || info.type === 'attr-tag') {
        // 节点/组合框/属性标签：准备拖拽
        if (nodeGeomMap[info.cellId]) {
          var graphPt = screenToGraph(e.clientX, e.clientY);
          var isGroup = info.type === 'group';

          // 记录成员初始位置（用于组合框拖拽）
          var memberStartPositions = {};
          if (isGroup) {
            var group = groupMap[info.cellId];
            if (group && !group.detached) {
              group.memberNodeIds.forEach(function(mid) {
                var mg = nodeGeomMap[mid];
                if (mg) memberStartPositions[mid] = { x: mg.x, y: mg.y };
              });
            }
          }

          dragState = {
            nodeId: info.cellId,
            el: info.el,
            startClientX: e.clientX,
            startClientY: e.clientY,
            startGraphX: graphPt.x,
            startGraphY: graphPt.y,
            startNodeX: nodeGeomMap[info.cellId].x,
            startNodeY: nodeGeomMap[info.cellId].y,
            isGroup: isGroup,
            memberStartPositions: memberStartPositions,
            moved: false
          };
          e.preventDefault();
          return;
        }
      } else if (info.type === 'edge') {
        // 边线：不启动平移，让 click 事件处理高亮
        e.preventDefault();
        return;
      }
      // attr-stem / fork：忽略，不启动平移
      return;
    }

    // 空白区域：开始平移
    panning = true;
    panStartClient = { x: e.clientX, y: e.clientY };
    panStart = { x: e.clientX - viewState.x, y: e.clientY - viewState.y };
    e.preventDefault();
  });

  document.addEventListener('mousemove', function(e) {
    if (dragState) {
      var dx = e.clientX - dragState.startClientX;
      var dy = e.clientY - dragState.startClientY;
      if (!dragState.moved && (Math.abs(dx) > DRAG_THRESHOLD || Math.abs(dy) > DRAG_THRESHOLD)) {
        dragState.moved = true;
      }
      if (dragState.moved) {
        var graphPt = screenToGraph(e.clientX, e.clientY);
        var gdx = graphPt.x - dragState.startGraphX;
        var gdy = graphPt.y - dragState.startGraphY;
        var newX = dragState.startNodeX + gdx;
        var newY = dragState.startNodeY + gdy;

        // 更新节点几何数据
        nodeGeomMap[dragState.nodeId].x = newX;
        nodeGeomMap[dragState.nodeId].y = newY;

        if (dragState.isGroup) {
          // 组合框拖拽：更新组合框自身 transform + 移动所有成员
          setNodeTransform(dragState.el, newX, newY);
          onGroupMoved(dragState.nodeId, gdx, gdy);
        } else {
          // 普通节点拖拽：更新 transform + 联动更新关联元素
          setNodeTransform(dragState.el, newX, newY);
          onNodeMoved(dragState.nodeId, newX, newY);
        }
      }
    } else if (panning) {
      viewState.x = e.clientX - panStart.x;
      viewState.y = e.clientY - panStart.y;
      applyView();
    }
  });

  document.addEventListener('mouseup', function(e) {
    if (dragState) {
      if (!dragState.moved) {
        // 没有移动 → 视为点击，处理高亮
        var nodeId = dragState.nodeId;
        var cellType = cellTypeMap[nodeId];
        if (cellType === 'attr-tag') {
          // 点击属性标签 → 高亮其源节点
          var attrTag = ATTR_TAGS.find(function(t) { return t.id === nodeId; });
          if (attrTag) handleNodeClick(attrTag.sourceNodeId, e.ctrlKey || e.metaKey);
        } else {
          // 点击节点/组合框 → 高亮
          handleNodeClick(nodeId, e.ctrlKey || e.metaKey);
        }
      }
      dragState = null;
    } else if (panning) {
      // 判断是否实际平移了（未移动视为点击空白 → 清除高亮）
      var panMoved = panStartClient && (Math.abs(e.clientX - panStartClient.x) > DRAG_THRESHOLD || Math.abs(e.clientY - panStartClient.y) > DRAG_THRESHOLD);
      if (!panMoved) {
        clearAllHighlights();
        updateAllSentences();
      }
      panning = false;
      panStartClient = null;
    }
  });

  svgEl.addEventListener('contextmenu', function(e) { e.preventDefault(); });
}

// ============================================================
// 高亮逻辑（修复：单选清除之前，Ctrl多选累积）
// ============================================================

function clearAllHighlights() {
  svgEl.querySelectorAll('.p2p-highlighted').forEach(function(el) { el.classList.remove('p2p-highlighted'); });
  svgEl.querySelectorAll('.p2p-highlighted-branch').forEach(function(el) { el.classList.remove('p2p-highlighted-branch'); });
  highlightedNodeIds = [];
}

function handleNodeClick(nodeId, ctrlKey) {
  if (ctrlKey) {
    // Ctrl 多选：切换
    var idx = highlightedNodeIds.indexOf(nodeId);
    if (idx >= 0) { highlightedNodeIds.splice(idx, 1); }
    else { highlightedNodeIds.push(nodeId); }
  } else {
    // 单选：清除之前所有高亮
    clearAllHighlights();
    highlightedNodeIds = [nodeId];
  }
  applyNodeHighlights();
  updateAllSentences();
  scrollToFirstHighlight();
}

function handleEdgeClick(edgeId, ctrlKey) {
  if (!ctrlKey) {
    // 单选：先清除所有高亮（节点+边线）
    clearAllHighlights();
  }

  var edgeEl = svgEl.querySelector('[data-cell-id="' + edgeId + '"]') ||
               svgEl.querySelector('[data-id="' + edgeId + '"]');
  if (!edgeEl) return;

  if (ctrlKey) {
    // Ctrl 多选：切换边高亮
    if (edgeEl.classList.contains('p2p-highlighted')) {
      edgeEl.classList.remove('p2p-highlighted');
      // 同时移除关联的 branch 高亮
      var srcId = edgeEl.getAttribute('data-source');
      if (srcId) {
        svgEl.querySelectorAll('.p2p-branch.p2p-highlighted-branch').forEach(function(be) {
          if (be.getAttribute('data-source') === srcId) be.classList.remove('p2p-highlighted-branch');
        });
      }
      applyNodeHighlights();
      updateAllSentences();
      return;
    }
  }

  edgeEl.classList.add('p2p-highlighted');
  var sourceId = edgeEl.getAttribute('data-source');
  var targetId = edgeEl.getAttribute('data-target');
  var isTrunk = edgeEl.classList.contains('p2p-trunk');

  if (isTrunk && sourceId) {
    svgEl.querySelectorAll('.p2p-branch').forEach(function(be) {
      if (be.getAttribute('data-source') === sourceId) be.classList.add('p2p-highlighted-branch');
    });
  }

  var nodeIds = [];
  if (isTrunk && sourceId) {
    nodeIds.push(sourceId);
    svgEl.querySelectorAll('.p2p-branch.p2p-highlighted-branch').forEach(function(be) {
      var tid = be.getAttribute('data-target'); if (tid && nodeIds.indexOf(tid) === -1) nodeIds.push(tid);
    });
  } else {
    if (sourceId) nodeIds.push(sourceId);
    if (targetId) nodeIds.push(targetId);
  }

  if (!ctrlKey) {
    highlightedNodeIds = nodeIds;
  } else {
    nodeIds.forEach(function(nid) { if (highlightedNodeIds.indexOf(nid) === -1) highlightedNodeIds.push(nid); });
  }

  applyNodeHighlights();
  updateAllSentences();
  scrollToFirstHighlight();
}

function applyNodeHighlights() {
  document.querySelectorAll('.p2p-node.p2p-highlighted').forEach(function(el) { el.classList.remove('p2p-highlighted'); });
  highlightedNodeIds.forEach(function(id) {
    var el = svgEl.querySelector('[data-cell-id="' + id + '"]') ||
             svgEl.querySelector('[data-id="' + id + '"]');
    if (el) el.classList.add('p2p-highlighted');
  });
  updateLegend();
}

// 边线点击（独立于拖拽逻辑，通过 click 事件处理）
if (svgEl) {
  svgEl.addEventListener('click', function(e) {
    var info = findCellInfo(e.target);
    if (info && info.type === 'edge') {
      handleEdgeClick(info.cellId, e.ctrlKey || e.metaKey);
      return;
    }
    // 点击空白区域时清除高亮（兜底，主要逻辑在 mouseup 中）
    if (!info) {
      clearAllHighlights();
      updateAllSentences();
    }
  });
}

function clearHighlight() { clearAllHighlights(); updateAllSentences(); }

// ============================================================
// 文本高亮
// ============================================================

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

function escapeHtml(text) { var div = document.createElement('div'); div.textContent = text; return div.innerHTML; }

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
      if (!found) { found = true; return '<mark class="text-highlight" data-node-id="' + item.nodeId + '" style="background-color:' + item.color.bg + ';color:' + item.color.border + '" onclick="textNodeClick(\\'' + item.nodeId + '\\')">' + match + '</mark>'; }
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
  if (sent.translation) { transEl.innerHTML = highlightTextInSentence(sent.translation, 'translation'); }
  else { transEl.innerHTML = ''; }
}

function updateAllSentences() { SENTENCES.forEach(function(sent) { updateSentenceHighlight(sent.id); }); }

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
    item.onclick = function() { handleNodeClick(nodeId, true); };
    legendBar.appendChild(item);
  });
}

function scrollToFirstHighlight() {
  if (highlightedNodeIds.length > 0) {
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

function textNodeClick(nodeId) { handleNodeClick(nodeId, true); }

// ============================================================
// 缩放和平移
// ============================================================

var panning = false, panStart = null, panStartClient = null;

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
}

// 初始化
renderSentences();
</script>
</body>
</html>`
}
