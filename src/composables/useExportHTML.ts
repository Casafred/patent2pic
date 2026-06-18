/**
 * 可交互 HTML 导出器
 * 使用 graphEngine.toSVG() 获取已渲染的 SVG（与 SVG 导出相同，保证图形可见），
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
  realSourceId?: string
  realTargetId?: string
  isTrunk?: boolean
  isBranch?: boolean
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

    cellInfoMap.set(id, {
      id,
      type,
      originalText: d.originalText as string,
      chineseText: d.chineseText as string,
      sourceNodeId: d.sourceNodeId as string,
      realSourceId: d.realSourceId as string,
      realTargetId: d.realTargetId as string,
      isTrunk: d.isTrunk as boolean,
      isBranch: d.isBranch as boolean,
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
        // 判断是否包含关系边
        if (id.startsWith('containment-edge-')) conn.isContainment = true
        edgeConns.push(conn)
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
    const info = cellInfoMap.get(cellId)

    // 移除 fork 节点（1x1 透明，不需要显示）
    if (info?.type === 'fork') {
      el.remove()
      return
    }

    if (!info) return

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
.canvas-area svg { width: 100%; height: 100%; cursor: grab; }
.canvas-area svg:active { cursor: grabbing; }
.toolbar { position: absolute; top: 12px; right: 12px; display: flex; gap: 6px; z-index: 10; }
.toolbar button { padding: 6px 12px; border: 1px solid #d9d9d9; background: #fff; border-radius: 4px; cursor: pointer; font-size: 13px; color: #4e5969; transition: all 0.2s; }
.toolbar button:hover { border-color: #1890ff; color: #1890ff; }
.toolbar button.active { background: #1890ff; color: #fff; border-color: #1890ff; }
/* 交互样式 */
.p2p-node { cursor: move; transition: opacity 0.15s; }
.p2p-node:hover { opacity: 0.85; }
.p2p-group { cursor: move; }
.p2p-attr-tag { cursor: move; }
.p2p-edge { cursor: pointer; }
.p2p-edge:hover { opacity: 0.7; }
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
      <button id="dragToggleBtn" onclick="toggleDragMode()">拖拽模式: 开</button>
    </div>
    <div id="svgContainer" style="width:100%;height:100%">${processedSvg}</div>
    <div class="info-bar">点击节点/边高亮 · 滚轮缩放 · 拖拽平移 · 节点可拖拽移动</div>
  </div>
</div>
<script>
// === 图模型数据 ===
var NODES = ${nodesJson};
var SENTENCES = ${sentencesJson};
var NODE_GEOMS = ${nodeGeomsJson};  // [{id,x,y,width,height}]
var EDGE_CONNS = ${edgeConnsJson};   // [{id,sourceId,targetId,sourcePort,targetPort,...}]
var GROUPS = ${groupsJson};          // [{id,memberNodeIds,sourceNodeId,detached}]
var FORKS = ${forksJson};            // [{id,sourceId,targetIds}]
var ATTR_TAGS = ${attrTagsJson};     // [{id,sourceNodeId,attributeEdgeId,width,height}]

// 构建 id -> geom 映射（运行时可变）
var nodeGeomMap = {};
NODE_GEOMS.forEach(function(g) { nodeGeomMap[g.id] = JSON.parse(JSON.stringify(g)); });

// 构建 id -> edgeConn 映射
var edgeConnMap = {};
EDGE_CONNS.forEach(function(e) { edgeConnMap[e.id] = e; });

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
var dragModeEnabled = true;

if (!svgEl) {
  svgContainer.innerHTML = '<div style="padding:40px;text-align:center;color:#86909c">SVG 图形加载失败</div>';
}

// ============================================================
// 路由算法（移植自 src/services/graph/custom-edge.ts）
// 这些都是纯函数，不依赖任何外部库
// ============================================================

function getConnectionSide(nodeCenterX, nodeCenterY, otherCenterX, otherCenterY, nodeWidth, nodeHeight) {
  var dx = otherCenterX - nodeCenterX;
  var dy = otherCenterY - nodeCenterY;
  if (dx === 0 && dy === 0) return 'right';
  var halfWidth = nodeWidth / 2;
  var halfHeight = nodeHeight / 2;
  var tx = dx !== 0 ? halfWidth / Math.abs(dx) : Infinity;
  var ty = dy !== 0 ? halfHeight / Math.abs(dy) : Infinity;
  if (tx <= ty) {
    return dx > 0 ? 'right' : 'left';
  } else {
    return dy > 0 ? 'bottom' : 'top';
  }
}

function sideFromPortId(portId) {
  if (!portId) return null;
  if (portId.endsWith('-top')) return 'top';
  if (portId.endsWith('-bottom')) return 'bottom';
  if (portId.endsWith('-left')) return 'left';
  if (portId.endsWith('-right')) return 'right';
  return null;
}

function isHorizontal(side) {
  return side === 'left' || side === 'right';
}

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
    var minX = Math.min(x1, x2);
    var maxX = Math.max(x1, x2);
    return minX < bbox.x + bbox.width && maxX > bbox.x &&
           y1 > bbox.y && y1 < bbox.y + bbox.height;
  }
  if (x1 === x2) {
    var minY = Math.min(y1, y2);
    var maxY = Math.max(y1, y2);
    return x1 > bbox.x && x1 < bbox.x + bbox.width &&
           minY < bbox.y + bbox.height && maxY > bbox.y;
  }
  return false;
}

function orthRouter(sourceBBox, targetBBox, startSide, endSide, jetty) {
  var s = getOutsidePoint(sourceBBox, startSide, jetty);
  var e = getOutsidePoint(targetBBox, endSide, jetty);
  var startHoriz = isHorizontal(startSide);
  var endHoriz = isHorizontal(endSide);
  var points = [{ x: s.x, y: s.y }];

  var sameNode = sourceBBox.x === targetBBox.x && sourceBBox.y === targetBBox.y
    && sourceBBox.width === targetBBox.width && sourceBBox.height === targetBBox.height;

  if (sameNode) {
    if (startSide === endSide) {
      if (startHoriz) {
        var topY = sourceBBox.y - jetty;
        var bottomY = sourceBBox.y + sourceBBox.height + jetty;
        var topDist = Math.abs(s.y - topY) + Math.abs(e.y - topY);
        var bottomDist = Math.abs(s.y - bottomY) + Math.abs(e.y - bottomY);
        var outerY = topDist <= bottomDist ? topY : bottomY;
        points.push({ x: s.x, y: outerY });
        points.push({ x: e.x, y: outerY });
      } else {
        var leftX = sourceBBox.x - jetty;
        var rightX = sourceBBox.x + sourceBBox.width + jetty;
        var leftDist = Math.abs(s.x - leftX) + Math.abs(e.x - leftX);
        var rightDist = Math.abs(s.x - rightX) + Math.abs(e.x - rightX);
        var outerX = leftDist <= rightDist ? leftX : rightX;
        points.push({ x: outerX, y: s.y });
        points.push({ x: outerX, y: e.y });
      }
    } else if (startHoriz && !endHoriz) {
      if (startSide === 'right') {
        if (endSide === 'top') {
          var oxr = sourceBBox.x + sourceBBox.width + jetty;
          var oyr = sourceBBox.y - jetty;
          points.push({ x: oxr, y: s.y });
          points.push({ x: oxr, y: oyr });
          points.push({ x: e.x, y: oyr });
        } else {
          var oxr2 = sourceBBox.x + sourceBBox.width + jetty;
          var oyr2 = sourceBBox.y + sourceBBox.height + jetty;
          points.push({ x: oxr2, y: s.y });
          points.push({ x: oxr2, y: oyr2 });
          points.push({ x: e.x, y: oyr2 });
        }
      } else {
        if (endSide === 'top') {
          var oxl = sourceBBox.x - jetty;
          var oyl = sourceBBox.y - jetty;
          points.push({ x: oxl, y: s.y });
          points.push({ x: oxl, y: oyl });
          points.push({ x: e.x, y: oyl });
        } else {
          var oxl2 = sourceBBox.x - jetty;
          var oyl2 = sourceBBox.y + sourceBBox.height + jetty;
          points.push({ x: oxl2, y: s.y });
          points.push({ x: oxl2, y: oyl2 });
          points.push({ x: e.x, y: oyl2 });
        }
      }
    } else if (!startHoriz && endHoriz) {
      if (startSide === 'top') {
        if (endSide === 'right') {
          var oyt = sourceBBox.y - jetty;
          var oxt = sourceBBox.x + sourceBBox.width + jetty;
          points.push({ x: s.x, y: oyt });
          points.push({ x: oxt, y: oyt });
          points.push({ x: oxt, y: e.y });
        } else {
          var oyt2 = sourceBBox.y - jetty;
          var oxt2 = sourceBBox.x - jetty;
          points.push({ x: s.x, y: oyt2 });
          points.push({ x: oxt2, y: oyt2 });
          points.push({ x: oxt2, y: e.y });
        }
      } else {
        if (endSide === 'right') {
          var oyb = sourceBBox.y + sourceBBox.height + jetty;
          var oxb = sourceBBox.x + sourceBBox.width + jetty;
          points.push({ x: s.x, y: oyb });
          points.push({ x: oxb, y: oyb });
          points.push({ x: oxb, y: e.y });
        } else {
          var oyb2 = sourceBBox.y + sourceBBox.height + jetty;
          var oxb2 = sourceBBox.x - jetty;
          points.push({ x: s.x, y: oyb2 });
          points.push({ x: oxb2, y: oyb2 });
          points.push({ x: oxb2, y: e.y });
        }
      }
    } else {
      if ((startSide === 'top' && endSide === 'bottom') || (startSide === 'bottom' && endSide === 'top')) {
        var leftX2 = sourceBBox.x - jetty;
        var rightX2 = sourceBBox.x + sourceBBox.width + jetty;
        var leftDist2 = Math.abs(s.x - leftX2) + Math.abs(e.x - leftX2);
        var rightDist2 = Math.abs(s.x - rightX2) + Math.abs(e.x - rightX2);
        var outerX2 = leftDist2 <= rightDist2 ? leftX2 : rightX2;
        points.push({ x: outerX2, y: s.y });
        points.push({ x: outerX2, y: e.y });
      } else {
        var topY2 = sourceBBox.y - jetty;
        var bottomY2 = sourceBBox.y + sourceBBox.height + jetty;
        var topDist2 = Math.abs(s.y - topY2) + Math.abs(e.y - topY2);
        var bottomDist2 = Math.abs(s.y - bottomY2) + Math.abs(e.y - bottomY2);
        var outerY2 = topDist2 <= bottomDist2 ? topY2 : bottomY2;
        points.push({ x: s.x, y: outerY2 });
        points.push({ x: e.x, y: outerY2 });
      }
    }
    points.push({ x: e.x, y: e.y });
    return points;
  }

  // 不同节点：标准路由
  if (startHoriz && endHoriz) {
    if (startSide === endSide) {
      var midX = startSide === 'right' ? Math.max(s.x, e.x) : Math.min(s.x, e.x);
      points.push({ x: midX, y: s.y });
      points.push({ x: midX, y: e.y });
    } else {
      var midX2 = (s.x + e.x) / 2;
      var midXCrossesBBox = segmentCrossesBBox(midX2, s.y, midX2, e.y, sourceBBox) ||
        segmentCrossesBBox(midX2, s.y, midX2, e.y, targetBBox);
      if (midXCrossesBBox) {
        var topY3 = Math.min(sourceBBox.y, targetBBox.y) - jetty;
        var bottomY3 = Math.max(sourceBBox.y + sourceBBox.height, targetBBox.y + targetBBox.height) + jetty;
        var topDist3 = Math.abs(s.y - topY3) + Math.abs(e.y - topY3);
        var bottomDist3 = Math.abs(s.y - bottomY3) + Math.abs(e.y - bottomY3);
        var outerY3 = topDist3 <= bottomDist3 ? topY3 : bottomY3;
        points.push({ x: s.x, y: outerY3 });
        points.push({ x: e.x, y: outerY3 });
      } else {
        points.push({ x: midX2, y: s.y });
        points.push({ x: midX2, y: e.y });
      }
    }
  } else if (!startHoriz && !endHoriz) {
    if (startSide === endSide) {
      var midY = startSide === 'bottom' ? Math.max(s.y, e.y) : Math.min(s.y, e.y);
      points.push({ x: s.x, y: midY });
      points.push({ x: e.x, y: midY });
    } else {
      var midY2 = (s.y + e.y) / 2;
      var midYCrossesBBox = segmentCrossesBBox(s.x, midY2, e.x, midY2, sourceBBox) ||
        segmentCrossesBBox(s.x, midY2, e.x, midY2, targetBBox);
      if (midYCrossesBBox) {
        var leftX3 = Math.min(sourceBBox.x, targetBBox.x) - jetty;
        var rightX3 = Math.max(sourceBBox.x + sourceBBox.width, targetBBox.x + targetBBox.width) + jetty;
        var leftDist3 = Math.abs(s.x - leftX3) + Math.abs(e.x - leftX3);
        var rightDist3 = Math.abs(s.x - rightX3) + Math.abs(e.x - rightX3);
        var outerX3 = leftDist3 <= rightDist3 ? leftX3 : rightX3;
        points.push({ x: outerX3, y: s.y });
        points.push({ x: outerX3, y: e.y });
      } else {
        points.push({ x: s.x, y: midY2 });
        points.push({ x: e.x, y: midY2 });
      }
    }
  } else if (startHoriz && !endHoriz) {
    var lShapeCrossesTarget = segmentCrossesBBox(s.x, s.y, e.x, s.y, targetBBox);
    if (lShapeCrossesTarget) {
      var reverseCrossesSource = segmentCrossesBBox(s.x, s.y, s.x, e.y, sourceBBox);
      if (reverseCrossesSource) {
        var outerX4 = startSide === 'right'
          ? Math.max(sourceBBox.x + sourceBBox.width, targetBBox.x + targetBBox.width) + jetty
          : Math.min(sourceBBox.x, targetBBox.x) - jetty;
        points.push({ x: outerX4, y: s.y });
        points.push({ x: outerX4, y: e.y });
      } else {
        points.push({ x: s.x, y: e.y });
      }
    } else {
      points.push({ x: e.x, y: s.y });
    }
  } else {
    var lShapeCrossesTarget2 = segmentCrossesBBox(s.x, s.y, s.x, e.y, targetBBox);
    if (lShapeCrossesTarget2) {
      var reverseCrossesSource2 = segmentCrossesBBox(s.x, s.y, e.x, s.y, sourceBBox);
      if (reverseCrossesSource2) {
        var outerY4 = startSide === 'bottom'
          ? Math.max(sourceBBox.y + sourceBBox.height, targetBBox.y + targetBBox.height) + jetty
          : Math.min(sourceBBox.y, targetBBox.y) - jetty;
        points.push({ x: s.x, y: outerY4 });
        points.push({ x: e.x, y: outerY4 });
      } else {
        points.push({ x: e.x, y: s.y });
      }
    } else {
      points.push({ x: s.x, y: e.y });
    }
  }

  points.push({ x: e.x, y: e.y });
  return points;
}

/**
 * 计算边的路由路径点（移植自 perpendicularManhattanRouter）
 * 输入：边连接信息 + 当前节点几何
 * 输出：路径点数组
 */
function routeEdge(conn) {
  var sourceGeom = nodeGeomMap[conn.sourceId];
  var targetGeom = nodeGeomMap[conn.targetId];
  if (!sourceGeom || !targetGeom) return null;

  var sourceBBox = { x: sourceGeom.x, y: sourceGeom.y, width: sourceGeom.width, height: sourceGeom.height };
  var targetBBox = { x: targetGeom.x, y: targetGeom.y, width: targetGeom.width, height: targetGeom.height };
  var sourceCenterX = sourceBBox.x + sourceBBox.width / 2;
  var sourceCenterY = sourceBBox.y + sourceBBox.height / 2;
  var targetCenterX = targetBBox.x + targetBBox.width / 2;
  var targetCenterY = targetBBox.y + targetBBox.height / 2;

  var startSideFromPort = sideFromPortId(conn.sourcePort);
  var endSideFromPort = sideFromPortId(conn.targetPort);

  var startSide = startSideFromPort || getConnectionSide(
    sourceCenterX, sourceCenterY, targetCenterX, targetCenterY,
    sourceBBox.width, sourceBBox.height
  );
  var endSide = endSideFromPort || getConnectionSide(
    targetCenterX, targetCenterY, sourceCenterX, sourceCenterY,
    targetBBox.width, targetBBox.height
  );

  var jetty = 20;
  return orthRouter(sourceBBox, targetBBox, startSide, endSide, jetty);
}

/**
 * 将路径点数组转为 SVG path 的 d 属性（带圆角拐角，模拟 X6 rounded connector）
 */
function pointsToPathD(points, radius) {
  if (!points || points.length === 0) return '';
  if (points.length === 1) return 'M ' + points[0].x + ' ' + points[0].y;
  radius = radius || 8;

  var d = 'M ' + points[0].x + ' ' + points[0].y;
  for (var i = 1; i < points.length; i++) {
    if (i < points.length - 1 && radius > 0) {
      // 当前点 points[i] 是拐角，用圆角连接到下一段
      var prev = points[i - 1];
      var curr = points[i];
      var next = points[i + 1];

      // 计算拐角两侧的截断点
      var dx1 = curr.x - prev.x;
      var dy1 = curr.y - prev.y;
      var dx2 = next.x - curr.x;
      var dy2 = next.y - curr.y;
      var len1 = Math.sqrt(dx1 * dx1 + dy1 * dy1);
      var len2 = Math.sqrt(dx2 * dx2 + dy2 * dy2);
      var r = Math.min(radius, len1 / 2, len2 / 2);

      if (r < 1) {
        d += ' L ' + curr.x + ' ' + curr.y;
      } else {
        var p1x = curr.x - (dx1 / len1) * r;
        var p1y = curr.y - (dy1 / len1) * r;
        var p2x = curr.x + (dx2 / len2) * r;
        var p2y = curr.y + (dy2 / len2) * r;
        // 判断圆弧方向（顺时针/逆时针）
        var cross = dx1 * dy2 - dy1 * dx2;
        var sweep = cross > 0 ? 1 : 0;
        d += ' L ' + p1x + ' ' + p1y;
        d += ' A ' + r + ' ' + r + ' 0 0 ' + sweep + ' ' + p2x + ' ' + p2y;
      }
    } else {
      d += ' L ' + points[i].x + ' ' + points[i].y;
    }
  }
  return d;
}

// ============================================================
// 联动更新算法（移植自 engine.ts）
// ============================================================

/** 计算 fork 节点位置（移植自 calculateForkPosition） */
function calculateForkPosition(sourceId, targetIds) {
  var sourceGeom = nodeGeomMap[sourceId];
  if (!sourceGeom) return { x: 0, y: 0 };
  var sourceCenterX = sourceGeom.x + sourceGeom.width / 2;
  var sourceCenterY = sourceGeom.y + sourceGeom.height / 2;

  var targetCenterSumX = 0;
  var targetCenterSumY = 0;
  var targetCount = 0;
  for (var i = 0; i < targetIds.length; i++) {
    var tg = nodeGeomMap[targetIds[i]];
    if (!tg) continue;
    targetCenterSumX += tg.x + tg.width / 2;
    targetCenterSumY += tg.y + tg.height / 2;
    targetCount++;
  }
  if (targetCount === 0) return { x: sourceCenterX, y: sourceCenterY };
  var targetCenterX = targetCenterSumX / targetCount;
  var targetCenterY = targetCenterSumY / targetCount;
  return {
    x: sourceCenterX + 0.8 * (targetCenterX - sourceCenterX),
    y: sourceCenterY + 0.8 * (targetCenterY - sourceCenterY)
  };
}

/** 更新所有 fork 节点位置（移植自 updateForkNodePositions） */
function updateForkNodePositions() {
  FORKS.forEach(function(fork) {
    var newPos = calculateForkPosition(fork.sourceId, fork.targetIds);
    if (nodeGeomMap[fork.id]) {
      nodeGeomMap[fork.id].x = newPos.x;
      nodeGeomMap[fork.id].y = newPos.y;
    }
  });
}

/** 更新属性标签位置（移植自 updateAttributeTagPositions） */
function updateAttributeTagPositions(nodeId) {
  var sourceGeom = nodeGeomMap[nodeId];
  if (!sourceGeom) return;

  var stemLength = 16;
  var tagGap = 6;
  var currentY = sourceGeom.y + sourceGeom.height + stemLength;

  // 找到属于该节点的所有属性标签，按当前 Y 排序
  var tags = ATTR_TAGS.filter(function(t) { return t.sourceNodeId === nodeId; });
  tags.sort(function(a, b) {
    var ga = nodeGeomMap[a.id];
    var gb = nodeGeomMap[b.id];
    return (ga ? ga.y : 0) - (gb ? gb.y : 0);
  });

  tags.forEach(function(tag) {
    var tagX = sourceGeom.x + sourceGeom.width / 2 - tag.width / 2;
    if (nodeGeomMap[tag.id]) {
      nodeGeomMap[tag.id].x = tagX;
      nodeGeomMap[tag.id].y = currentY;
    }

    // 更新对应的 stem 边（source/target 是坐标点而非 cell）
    var stemEdgeId = 'attr-stem-' + tag.attributeEdgeId;
    var stemConn = edgeConnMap[stemEdgeId];
    if (stemConn) {
      // stem 边的 source/target 是固定坐标，需要特殊处理
      var stemX = sourceGeom.x + sourceGeom.width / 2;
      stemConn._stemSource = { x: stemX, y: sourceGeom.y + sourceGeom.height };
      stemConn._stemTarget = { x: stemX, y: currentY };
    }

    currentY = currentY + tag.height + tagGap;
  });
}

/** 更新组合框边界（移植自 updateGroupBoundsForMember） */
function updateGroupBoundsForMember(nodeId) {
  GROUPS.forEach(function(group) {
    if (group.detached) return;
    if (nodeId && group.memberNodeIds.indexOf(nodeId) === -1) return;

    var memberGeoms = group.memberNodeIds.map(function(id) { return nodeGeomMap[id]; }).filter(Boolean);
    if (memberGeoms.length === 0) return;

    var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    memberGeoms.forEach(function(g) {
      minX = Math.min(minX, g.x);
      minY = Math.min(minY, g.y);
      maxX = Math.max(maxX, g.x + g.width);
      maxY = Math.max(maxY, g.y + g.height);
    });

    var padding = 25;
    var labelSpace = 36;
    if (nodeGeomMap[group.id]) {
      nodeGeomMap[group.id].x = minX - padding;
      nodeGeomMap[group.id].y = minY - padding - labelSpace;
      nodeGeomMap[group.id].width = maxX - minX + padding * 2;
      nodeGeomMap[group.id].height = maxY - minY + padding * 2 + labelSpace;
    }
  });
}

/** 重路由单条边并更新 SVG */
function rerouteEdge(edgeId) {
  var conn = edgeConnMap[edgeId];
  if (!conn) return;

  var edgeEl = svgEl.querySelector('[data-cell-id="' + edgeId + '"]');
  if (!edgeEl) return;

  var pathEl = edgeEl.querySelector('path');
  if (!pathEl) return;

  // 属性 stem 边使用固定坐标
  if (conn._stemSource && conn._stemTarget) {
    var d = 'M ' + conn._stemSource.x + ' ' + conn._stemSource.y +
            ' L ' + conn._stemTarget.x + ' ' + conn._stemTarget.y;
    pathEl.setAttribute('d', d);
    return;
  }

  var points = routeEdge(conn);
  if (!points || points.length === 0) return;

  var pathD = pointsToPathD(points, 8);
  pathEl.setAttribute('d', pathD);

  // 更新边标签位置（固定在路径中点）
  var labelEl = edgeEl.querySelector('.x6-edge-label');
  if (labelEl) {
    var midIdx = Math.floor(points.length / 2);
    var midPoint = points[midIdx] || points[0];
    var transform = labelEl.getAttribute('transform') || '';
    // 提取现有的 translate 之外的 transform
    var baseTransform = transform.replace(/translate\\([^)]*\\)/g, '').trim();
    labelEl.setAttribute('transform', 'translate(' + midPoint.x + ',' + midPoint.y + ')' + (baseTransform ? ' ' + baseTransform : ''));
  }
}

/** 重路由所有与指定节点关联的边 */
function rerouteConnectedEdges(nodeId) {
  EDGE_CONNS.forEach(function(conn) {
    if (conn.sourceId === nodeId || conn.targetId === nodeId) {
      rerouteEdge(conn.id);
    }
  });
}

/** 节点移动后的完整联动更新 */
function onNodeMoved(nodeId, newX, newY) {
  var geom = nodeGeomMap[nodeId];
  if (!geom) return;
  geom.x = newX;
  geom.y = newY;

  // 1. 更新组合框边界
  updateGroupBoundsForMember(nodeId);

  // 2. 更新 fork 节点位置
  updateForkNodePositions();

  // 3. 更新属性标签位置
  updateAttributeTagPositions(nodeId);

  // 4. 重路由所有关联边
  rerouteConnectedEdges(nodeId);

  // 5. 重路由所有连接到组合框的边（组合框边界可能变化）
  GROUPS.forEach(function(group) {
    if (group.memberNodeIds.indexOf(nodeId) !== -1) {
      rerouteConnectedEdges(group.id);
    }
  });

  // 6. 重路由所有连接到 fork 节点的边
  FORKS.forEach(function(fork) {
    if (fork.sourceId === nodeId || fork.targetIds.indexOf(nodeId) !== -1) {
      rerouteConnectedEdges(fork.id);
    }
  });

  // 7. 重路由所有连接到属性标签的 stem 边
  ATTR_TAGS.forEach(function(tag) {
    if (tag.sourceNodeId === nodeId) {
      rerouteEdge('attr-stem-' + tag.attributeEdgeId);
    }
  });
}

// ============================================================
// SVG 元素操作
// ============================================================

/** 获取节点 SVG 元素的当前 transform（translate） */
function getNodeTransform(el) {
  var transform = el.getAttribute('transform') || '';
  var match = transform.match(/translate\\(([\\d.\\-]+)[\\s,]+([\\d.\\-]+)\\)/);
  if (match) {
    return { x: parseFloat(match[1]), y: parseFloat(match[2]), raw: transform };
  }
  return { x: 0, y: 0, raw: transform };
}

/** 设置节点 SVG 元素的 transform */
function setNodeTransform(el, x, y) {
  var transform = el.getAttribute('transform') || '';
  // 移除现有 translate，保留其他 transform
  var baseTransform = transform.replace(/translate\\([^)]*\\)/g, '').trim();
  el.setAttribute('transform', 'translate(' + x + ',' + y + ')' + (baseTransform ? ' ' + baseTransform : ''));
}

// ============================================================
// 拖拽逻辑
// ============================================================

var dragging = null;  // {nodeId, el, startMouseX, startMouseY, startNodeX, startNodeY}

function startDrag(e, nodeId, el) {
  if (!dragModeEnabled) return;
  // 不拖拽属性标签的 stem 边
  var geom = nodeGeomMap[nodeId];
  if (!geom) return;

  // 获取鼠标在 SVG 坐标系中的位置
  var pt = getSVGPoint(e);
  dragging = {
    nodeId: nodeId,
    el: el,
    startMouseX: pt.x,
    startMouseY: pt.y,
    startNodeX: geom.x,
    startNodeY: geom.y
  };
  e.preventDefault();
  e.stopPropagation();
}

function getSVGPoint(e) {
  var pt = svgEl.createSVGPoint();
  pt.x = e.clientX;
  pt.y = e.clientY;
  var ctm = svgEl.getScreenCTM();
  if (ctm) {
    pt = pt.matrixTransform(ctm.inverse());
  }
  return pt;
}

if (svgEl) {
  svgEl.addEventListener('mousedown', function(e) {
    // 拖拽节点
    var nodeEl = e.target.closest('.p2p-node, .p2p-group, .p2p-attr-tag');
    if (nodeEl && nodeEl.dataset.id && dragModeEnabled) {
      startDrag(e, nodeEl.dataset.id, nodeEl);
      return;
    }

    // 点击高亮（非拖拽模式或点击的是边/空白）
    if (!dragModeEnabled || !nodeEl) {
      var clickNodeEl = e.target.closest('.p2p-node');
      if (clickNodeEl && clickNodeEl.dataset.id) {
        if (e.ctrlKey || e.metaKey) toggleNodeHighlight(clickNodeEl.dataset.id);
        else highlightNodes([clickNodeEl.dataset.id]);
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
    }

    // 拖拽平移（空白区域）
    if (!nodeEl) {
      var target = e.target.closest('.p2p-node, .p2p-edge, .p2p-attr-tag');
      if (!target) {
        panning = true;
        panStart = { x: e.clientX - viewState.x, y: e.clientY - viewState.y };
        e.preventDefault();
      }
    }
  });

  document.addEventListener('mousemove', function(e) {
    if (dragging) {
      var pt = getSVGPoint(e);
      var dx = pt.x - dragging.startMouseX;
      var dy = pt.y - dragging.startMouseY;
      var newX = dragging.startNodeX + dx;
      var newY = dragging.startNodeY + dy;
      setNodeTransform(dragging.el, newX, newY);
      onNodeMoved(dragging.nodeId, newX, newY);
    } else if (panning) {
      viewState.x = e.clientX - panStart.x;
      viewState.y = e.clientY - panStart.y;
      applyView();
    }
  });

  document.addEventListener('mouseup', function() {
    dragging = null;
    panning = false;
  });
}

function toggleDragMode() {
  dragModeEnabled = !dragModeEnabled;
  var btn = document.getElementById('dragToggleBtn');
  btn.textContent = '拖拽模式: ' + (dragModeEnabled ? '开' : '关');
  btn.classList.toggle('active', dragModeEnabled);
  svgEl.style.cursor = dragModeEnabled ? 'default' : 'grab';
}

// ============================================================
// 高亮和文本交互（保留原有功能）
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

// ============================================================
// 缩放和平移
// ============================================================

var viewState = {x: 0, y: 0, scale: 1};
var viewportEl = null;
var panning = false, panStart = null;

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

  svgEl.addEventListener('contextmenu', function(e) { e.preventDefault(); });
}

// 初始化
renderSentences();
</script>
</body>
</html>`
}
