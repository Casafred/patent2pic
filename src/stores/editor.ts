import { defineStore } from 'pinia'
import { ref } from 'vue'

/** 布局预设：用户对当前布局不满意时一键切换 */
export type LayoutPreset = 'default' | 'focus' | 'compare' | 'review'

interface LayoutState {
  preset: LayoutPreset
  /** 工作区侧栏是否收起 */
  sidebarCollapsed: boolean
  /** 输入/阅读面板是否显示 */
  inputPanelVisible: boolean
  /** 强制显示右侧样式面板（不看选中状态） */
  forceStylePanel: boolean
}

const LAYOUT_KEY = 'patent2pic-layout'

/** 各预设的面板组合 */
export const LAYOUT_PRESETS: Record<LayoutPreset, Omit<LayoutState, 'preset'>> = {
  default: { sidebarCollapsed: false, inputPanelVisible: true, forceStylePanel: false },
  focus: { sidebarCollapsed: true, inputPanelVisible: false, forceStylePanel: false },
  compare: { sidebarCollapsed: true, inputPanelVisible: true, forceStylePanel: false },
  review: { sidebarCollapsed: false, inputPanelVisible: true, forceStylePanel: true },
}

function loadLayout(): LayoutState {
  try {
    const raw = localStorage.getItem(LAYOUT_KEY)
    if (raw) {
      const data = JSON.parse(raw)
      const preset: LayoutPreset = data.preset && data.preset in LAYOUT_PRESETS
        ? data.preset
        : 'default'
      return {
        preset,
        sidebarCollapsed: !!data.sidebarCollapsed,
        inputPanelVisible: data.inputPanelVisible !== false,
        forceStylePanel: !!data.forceStylePanel,
      }
    }
  } catch {
    // 读取失败则用默认布局
  }
  return { preset: 'default', ...LAYOUT_PRESETS.default }
}

export const useEditorStore = defineStore('editor', () => {
  const selectedNodeIds = ref<string[]>([])
  const selectedEdgeIds = ref<string[]>([])
  const highlightedNodeIds = ref<string[]>([])
  const highlightedComboIds = ref<string[]>([])
  const activePanel = ref<'style' | 'ai' | null>(null)
  const zoom = ref(1)
  const isDirty = ref(false)
  const layout = ref<LayoutState>(loadLayout())

  function persistLayout(): void {
    try {
      localStorage.setItem(LAYOUT_KEY, JSON.stringify(layout.value))
    } catch {
      // 持久化失败不影响使用
    }
  }

  function applyLayoutPreset(preset: LayoutPreset): void {
    layout.value = { preset, ...LAYOUT_PRESETS[preset] }
    persistLayout()
  }

  function toggleSidebar(): void {
    layout.value = { ...layout.value, sidebarCollapsed: !layout.value.sidebarCollapsed }
    persistLayout()
  }

  function toggleInputPanel(): void {
    layout.value = { ...layout.value, inputPanelVisible: !layout.value.inputPanelVisible }
    persistLayout()
  }

  function toggleForceStylePanel(): void {
    layout.value = { ...layout.value, forceStylePanel: !layout.value.forceStylePanel }
    persistLayout()
  }

  function selectNodes(ids: string[]): void {
    selectedNodeIds.value = ids
    selectedEdgeIds.value = []
  }

  function highlightNodes(ids: string[]): void {
    highlightedNodeIds.value = ids
  }

  function highlightCombos(ids: string[]): void {
    highlightedComboIds.value = ids
  }

  function toggleNodeInSelection(id: string): void {
    const idx = selectedNodeIds.value.indexOf(id)
    if (idx >= 0) {
      selectedNodeIds.value.splice(idx, 1)
    } else {
      selectedNodeIds.value.push(id)
    }
    selectedEdgeIds.value = []
  }

  function selectEdges(ids: string[]): void {
    selectedEdgeIds.value = ids
    selectedNodeIds.value = []
  }

  function clearSelection(): void {
    selectedNodeIds.value = []
    selectedEdgeIds.value = []
    highlightedNodeIds.value = []
    highlightedComboIds.value = []
  }

  function togglePanel(panel: 'style' | 'ai' | null): void {
    activePanel.value = activePanel.value === panel ? null : panel
  }

  function setZoom(value: number): void {
    zoom.value = Math.max(0.1, Math.min(3, value))
  }

  function markDirty(): void {
    isDirty.value = true
  }

  function markClean(): void {
    isDirty.value = false
  }

  return {
    selectedNodeIds,
    selectedEdgeIds,
    highlightedNodeIds,
    highlightedComboIds,
    activePanel,
    zoom,
    isDirty,
    layout,
    selectNodes,
    highlightNodes,
    highlightCombos,
    toggleNodeInSelection,
    selectEdges,
    clearSelection,
    togglePanel,
    setZoom,
    markDirty,
    markClean,
    applyLayoutPreset,
    toggleSidebar,
    toggleInputPanel,
    toggleForceStylePanel,
  }
})
