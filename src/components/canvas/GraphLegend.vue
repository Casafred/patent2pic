<template>
  <div class="graph-legend" @mouseenter="isExpanded = true" @mouseleave="isExpanded = false">
    <div class="legend-trigger">
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <rect x="1" y="1" width="6" height="6" rx="1.5" stroke="currentColor" stroke-width="1.2"/>
        <rect x="9" y="1" width="6" height="6" rx="1.5" stroke="currentColor" stroke-width="1.2"/>
        <rect x="1" y="9" width="6" height="6" rx="1.5" stroke="currentColor" stroke-width="1.2"/>
        <rect x="9" y="9" width="6" height="6" rx="1.5" stroke="currentColor" stroke-width="1.2"/>
      </svg>
      <span class="trigger-text">图例</span>
    </div>

    <transition name="legend-expand">
      <div v-if="isExpanded" class="legend-panel">
        <div class="legend-section">
          <div class="section-title">节点类型</div>
          <div class="legend-items">
            <div v-for="item in nodeTypes" :key="item.label" class="legend-item">
              <span class="node-sample" :style="{ background: item.fill, borderColor: item.stroke }"></span>
              <span class="legend-label">{{ item.label }}</span>
            </div>
          </div>
        </div>

        <div class="legend-section">
          <div class="section-title">关系类型</div>
          <div class="legend-items">
            <div v-for="item in relationTypes" :key="item.label" class="legend-item">
              <svg class="edge-sample" width="40" height="16" viewBox="0 0 40 16">
                <line
                  x1="2" y1="8" x2="38" y2="8"
                  :stroke="item.stroke"
                  stroke-width="1.5"
                  :stroke-dasharray="item.dasharray"
                />
                <polygon
                  v-if="item.arrowType === 'solid-triangle'"
                  points="34,4 40,8 34,12"
                  :fill="item.stroke"
                />
                <polygon
                  v-if="item.arrowType === 'hollow-triangle'"
                  points="34,4 40,8 34,12"
                  :fill="'#fff'"
                  :stroke="item.stroke"
                  stroke-width="1"
                />
                <polygon
                  v-if="item.arrowType === 'diamond'"
                  points="30,8 35,4 40,8 35,12"
                  :fill="item.stroke"
                />
              </svg>
              <span class="legend-label">{{ item.label }}</span>
            </div>
          </div>
        </div>

        <div class="legend-section">
          <div class="section-title">线型</div>
          <div class="legend-items">
            <div v-for="item in lineStyles" :key="item.label" class="legend-item">
              <svg class="edge-sample" width="40" height="12" viewBox="0 0 40 12">
                <line
                  x1="2" y1="6" x2="38" y2="6"
                  stroke="#86909c"
                  stroke-width="1.5"
                  :stroke-dasharray="item.dasharray"
                />
              </svg>
              <span class="legend-label">{{ item.label }}</span>
            </div>
          </div>
        </div>

        <div class="legend-section">
          <div class="section-title">限定框</div>
          <div class="legend-items">
            <div class="legend-item">
              <span class="group-sample"></span>
              <span class="legend-label">组合/限定框（虚线边框）</span>
            </div>
          </div>
        </div>
      </div>
    </transition>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'

const isExpanded = ref(false)

const nodeTypes = [
  { label: '部件', fill: '#e8f4fd', stroke: '#1890FF' },
  { label: '子系统', fill: '#fff7e6', stroke: '#fa8c16' },
  { label: '特征', fill: '#f6ffed', stroke: '#52c41a' },
]

const relationTypes = [
  { label: '位置关系', stroke: '#1890FF', dasharray: '', arrowType: 'solid-triangle' },
  { label: '动作关系', stroke: '#52c41a', dasharray: '', arrowType: 'solid-triangle' },
  { label: '包含关系', stroke: '#fa8c16', dasharray: '5 5', arrowType: 'hollow-triangle' },
  { label: '逻辑关系', stroke: '#722ed1', dasharray: '2 4 2 4 5 4', arrowType: 'diamond' },
]

const lineStyles = [
  { label: '实线', dasharray: '' },
  { label: '虚线', dasharray: '6 3' },
  { label: '点线', dasharray: '2 3' },
  { label: '点划线', dasharray: '6 3 2 3' },
]
</script>

<style scoped>
.graph-legend {
  position: absolute;
  bottom: 12px;
  left: 12px;
  z-index: 100;
}

.legend-trigger {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  box-shadow: var(--shadow-sm);
  cursor: pointer;
  color: var(--text-tertiary);
  font-size: var(--font-size-xs);
  transition: all 0.15s;
  user-select: none;
}

.legend-trigger:hover {
  color: var(--text-primary);
  box-shadow: var(--shadow-md);
}

.trigger-text {
  line-height: 1;
}

.legend-panel {
  position: absolute;
  bottom: 100%;
  left: 0;
  margin-bottom: 8px;
  min-width: 200px;
  padding: 12px;
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-lg);
}

.legend-section {
  margin-bottom: 10px;
}

.legend-section:last-child {
  margin-bottom: 0;
}

.section-title {
  font-size: var(--font-size-sm);
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 6px;
  padding-bottom: 4px;
  border-bottom: 1px solid var(--border-color-light);
}

.legend-items {
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.legend-item {
  display: flex;
  align-items: center;
  gap: 8px;
}

.node-sample {
  display: inline-block;
  width: 28px;
  height: 16px;
  border-radius: 3px;
  border-width: 1.5px;
  border-style: solid;
  flex-shrink: 0;
}

.edge-sample {
  flex-shrink: 0;
}

.legend-label {
  font-size: var(--font-size-xs);
  color: var(--text-secondary);
  white-space: nowrap;
}

.group-sample {
  display: inline-block;
  width: 28px;
  height: 16px;
  border-radius: 3px;
  border: 1.5px dashed #fa8c16;
  background: #fafafa;
  flex-shrink: 0;
}

.legend-expand-enter-active,
.legend-expand-leave-active {
  transition: opacity 0.15s ease, transform 0.15s ease;
}

.legend-expand-enter-from,
.legend-expand-leave-to {
  opacity: 0;
  transform: translateY(4px);
}
</style>
