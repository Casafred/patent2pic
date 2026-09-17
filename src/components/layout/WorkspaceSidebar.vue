<template>
  <div class="workspace-sidebar">
    <!-- 项目区 -->
    <div class="project-section">
      <el-dropdown trigger="click" class="project-dropdown" @command="handleProjectCommand">
        <div class="project-current">
          <el-icon class="project-icon"><Folder /></el-icon>
          <span class="project-name" :title="activeProject?.name">{{ activeProject?.name ?? '未命名项目' }}</span>
          <el-icon class="project-caret"><ArrowDown /></el-icon>
        </div>
        <template #dropdown>
          <el-dropdown-menu>
            <el-dropdown-item
              v-for="p in workspaceStore.projects"
              :key="p.id"
              :command="`switch:${p.id}`"
              :disabled="p.id === workspaceStore.activeProjectId"
            >
              {{ p.name }}
            </el-dropdown-item>
            <el-dropdown-item command="new" divided :icon="Plus">新建项目</el-dropdown-item>
            <el-dropdown-item command="rename" :icon="EditPen">重命名项目</el-dropdown-item>
            <el-dropdown-item command="delete" :icon="Delete">删除项目</el-dropdown-item>
          </el-dropdown-menu>
        </template>
      </el-dropdown>
    </div>

    <!-- 项目级搜索：跨项目 / 画布文件 / 版本检索 -->
    <div class="search-section">
      <el-input
        v-model="query"
        size="small"
        placeholder="搜索项目 / 画布 / 版本内容"
        clearable
      >
        <template #prefix>
          <el-icon><Search /></el-icon>
        </template>
      </el-input>
    </div>

    <!-- 搜索结果 -->
    <div v-if="isSearching" class="files-section">
      <div class="section-header">
        <span class="section-title">搜索结果（{{ searchResults.length }}）</span>
      </div>
      <div class="file-list">
        <div
          v-for="result in searchResults"
          :key="result.key"
          class="search-item"
          @click="handleOpenResult(result)"
        >
          <div class="search-title" :title="`${result.projectName} / ${result.fileName}`">
            <span class="search-project">{{ result.projectName }}</span>
            <span class="search-sep">/</span>
            <span class="search-file">{{ result.fileName }}</span>
          </div>
          <div v-if="result.versionLabel" class="search-version">{{ result.versionLabel }}</div>
          <div class="search-snippet">{{ result.snippet }}</div>
        </div>
        <div v-if="query.trim() && searchResults.length === 0" class="search-empty">
          没有匹配的内容
        </div>
      </div>
    </div>

    <!-- 画布文件区 -->
    <div v-else class="files-section">
      <div class="section-header">
        <span class="section-title">画布文件</span>
        <button class="header-btn" title="新建画布文件" @click="handleNewFile">
          <el-icon><Plus /></el-icon>
        </button>
      </div>
      <div class="file-list">
        <template v-for="file in graphStore.files" :key="file.id">
          <div
            :class="['file-item', { active: file.id === graphStore.activeFileId }]"
            @click="graphStore.activateFile(file.id)"
          >
            <span class="file-name" :title="file.name">{{ file.name }}</span>
            <span v-if="file.versions.length > 1" class="file-versions">V{{ file.versions.length }}</span>
            <span class="file-actions" @click.stop>
              <el-icon class="action-icon" title="重命名" @click="handleRenameFile(file)"><EditPen /></el-icon>
              <el-icon class="action-icon" title="删除" @click="handleDeleteFile(file)"><Delete /></el-icon>
            </span>
          </div>

          <!-- 版本历史：仅展开活动文件的版本链 -->
          <div
            v-if="file.id === graphStore.activeFileId && file.versions.length > 0"
            class="version-list"
          >
            <div
              v-for="version in reversedVersions(file)"
              :key="version.id"
              :class="['version-item', { active: version.id === file.activeVersionId }]"
              :title="versionTooltip(version)"
              @click="handleActivateVersion(file.id, version.id)"
            >
              <span class="version-dot" />
              <span class="version-label">{{ version.label }}</span>
              <span class="version-time">{{ formatTime(version.createdAt) }}</span>
              <el-popover
                v-if="version.snapshots && version.snapshots.length > 0"
                trigger="click"
                placement="right"
                :width="240"
              >
                <template #reference>
                  <span class="snapshot-chip" title="自动快照" @click.stop>
                    {{ version.snapshots.length }}
                  </span>
                </template>
                <div class="snapshot-list">
                  <div class="snapshot-title">自动快照（点击回退）</div>
                  <div
                    v-for="snapshot in reversedSnapshots(version)"
                    :key="snapshot.id"
                    class="snapshot-item"
                    @click="handleRestoreSnapshot(file.id, version.id, snapshot.id)"
                  >
                    <span>{{ formatTime(snapshot.at) }}</span>
                    <span class="snapshot-restore">回退</span>
                  </div>
                </div>
              </el-popover>
              <el-icon
                class="action-icon version-delete"
                title="删除该版本"
                @click.stop="handleDeleteVersion(file, version)"
              ><Delete /></el-icon>
            </div>
          </div>
        </template>
      </div>
    </div>

    <!-- 回收站入口 -->
    <div class="sidebar-footer">
      <button class="footer-btn" title="打开回收站" @click="trashVisible = true">
        <el-icon><DeleteFilled /></el-icon>
        <span>回收站</span>
        <span v-if="trash.count > 0" class="footer-badge">{{ trash.count }}</span>
      </button>
    </div>

    <TrashDialog v-model:visible="trashVisible" />
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Folder, ArrowDown, Plus, EditPen, Delete, DeleteFilled, Search } from '@element-plus/icons-vue'
import { useGraphStore, type CanvasFile, type CanvasSnapshot, type CanvasVersion } from '@/stores/graph'
import { useWorkspaceStore } from '@/stores/workspace'
import { useTrashStore } from '@/stores/trash'
import TrashDialog from './TrashDialog.vue'

const graphStore = useGraphStore()
const workspaceStore = useWorkspaceStore()
const trash = useTrashStore()

const activeProject = computed(() => workspaceStore.activeProject)

const trashVisible = ref(false)

// ===== 项目级搜索 =====
interface SearchResult {
  key: string
  projectId: string
  projectName: string
  fileId: string
  fileName: string
  versionId: string | null
  versionLabel: string
  snippet: string
  score: number
}

const query = ref('')
const searchResults = ref<SearchResult[]>([])
const isSearching = computed(() => query.value.trim().length > 0)

const MAX_RESULTS = 40
const SNIPPET_RADIUS = 30

/** 截取命中位置附近的片段，便于在结果列表中定位 */
function buildSnippet(text: string, lower: string, keyword: string): string {
  const index = lower.indexOf(keyword)
  if (index === -1) return text.slice(0, 60)
  const start = Math.max(0, index - SNIPPET_RADIUS)
  const end = Math.min(text.length, index + keyword.length + SNIPPET_RADIUS)
  return `${start > 0 ? '…' : ''}${text.slice(start, end)}${end < text.length ? '…' : ''}`.replace(/\s+/g, ' ')
}

function collectFromFiles(
  results: SearchResult[],
  projectId: string,
  projectName: string,
  files: CanvasFile[],
  keyword: string,
): void {
  for (const file of files) {
    if (results.length >= MAX_RESULTS) return

    const nameHit = file.name.toLowerCase().includes(keyword)
    const textHit = file.rawText.toLowerCase().includes(keyword)
    const claimHit = file.claims.some(c => c.rawText.toLowerCase().includes(keyword))

    if (nameHit || textHit || claimHit) {
      results.push({
        key: `file:${file.id}`,
        projectId,
        projectName,
        fileId: file.id,
        fileName: file.name,
        versionId: file.activeVersionId,
        versionLabel: '',
        snippet: nameHit
          ? `文件名匹配：${file.name}`
          : buildSnippet(file.rawText, file.rawText.toLowerCase(), keyword),
        score: nameHit ? 0 : 1,
      })
    }

    for (const version of file.versions) {
      if (results.length >= MAX_RESULTS) return

      const labelText = `${version.label} ${version.redrawInstructions ?? ''}`
      const labelHit = labelText.toLowerCase().includes(keyword)
      const nodes = version.extractResult?.nodes ?? []
      const nodeHit = nodes.find(
        n => n.originalText?.toLowerCase().includes(keyword)
          || n.chineseText?.toLowerCase().includes(keyword),
      )

      if (labelHit || nodeHit) {
        const nodeText = nodeHit?.chineseText || nodeHit?.originalText || ''
        results.push({
          key: `version:${file.id}:${version.id}`,
          projectId,
          projectName,
          fileId: file.id,
          fileName: file.name,
          versionId: version.id,
          versionLabel: version.label,
          snippet: nodeHit
            ? `节点匹配：${buildSnippet(nodeText, nodeText.toLowerCase(), keyword)}`
            : `版本：${version.label}${version.redrawInstructions ? ` · ${version.redrawInstructions}` : ''}`,
          score: labelHit ? 2 : 3,
        })
      }
    }
  }
}

let searchTimer: ReturnType<typeof setTimeout> | null = null

function runSearch(): void {
  const keyword = query.value.trim().toLowerCase()
  if (!keyword) {
    searchResults.value = []
    return
  }

  // 先落盘当前项目，保证搜索覆盖最新改动
  workspaceStore.saveActiveProject()

  const results: SearchResult[] = []
  for (const project of workspaceStore.projects) {
    if (results.length >= MAX_RESULTS) break
    const projectNameHit = project.name.toLowerCase().includes(keyword)
    const files = workspaceStore.getProjectFiles(project.id)
    if (!files) continue

    if (projectNameHit) {
      results.push({
        key: `project:${project.id}`,
        projectId: project.id,
        projectName: project.name,
        fileId: files[0]?.id ?? '',
        fileName: '（项目）',
        versionId: null,
        versionLabel: '',
        snippet: `项目名称匹配：${project.name}`,
        score: 0,
      })
    }
    collectFromFiles(results, project.id, project.name, files, keyword)
  }

  results.sort((a, b) => a.score - b.score)
  searchResults.value = results.slice(0, MAX_RESULTS)
}

watch(query, () => {
  if (searchTimer) clearTimeout(searchTimer)
  searchTimer = setTimeout(runSearch, 250)
})

function handleOpenResult(result: SearchResult): void {
  if (result.projectId !== workspaceStore.activeProjectId) {
    workspaceStore.switchProject(result.projectId)
  }
  if (result.fileId) {
    graphStore.activateFile(result.fileId)
  }
  if (result.versionId) {
    graphStore.setActiveVersion(result.fileId, result.versionId)
  }
  query.value = ''
  searchResults.value = []
}

async function handleProjectCommand(cmd: string): Promise<void> {
  const [action, id] = cmd.split(':')
  try {
    if (action === 'switch') {
      workspaceStore.switchProject(id)
    } else if (action === 'new') {
      const { value } = await ElMessageBox.prompt('输入新项目名称', '新建项目', {
        inputValue: `项目 ${workspaceStore.projects.length + 1}`,
        confirmButtonText: '创建',
        cancelButtonText: '取消',
        inputValidator: v => !!v?.trim() || '项目名称不能为空',
      })
      workspaceStore.createProject(value.trim())
      ElMessage.success('项目已创建')
    } else if (action === 'rename') {
      const project = workspaceStore.activeProject
      if (!project) return
      const { value } = await ElMessageBox.prompt('输入新的项目名称', '重命名项目', {
        inputValue: project.name,
        confirmButtonText: '确定',
        cancelButtonText: '取消',
        inputValidator: v => !!v?.trim() || '项目名称不能为空',
      })
      workspaceStore.renameProject(project.id, value.trim())
    } else if (action === 'delete') {
      const project = workspaceStore.activeProject
      if (!project) return
      await ElMessageBox.confirm(
        `删除项目「${project.name}」将移入回收站（含全部画布文件与历史版本），可在回收站恢复。`,
        '删除项目',
        {
          confirmButtonText: '删除',
          cancelButtonText: '取消',
          type: 'warning',
        },
      )
      // 删除前留存完整快照到回收站
      const snapshot = workspaceStore.readProjectSnapshot(project.id)
      if (snapshot) {
        trash.push('project', project.name, {
          name: project.name,
          files: snapshot.files,
          activeFileId: snapshot.activeFileId,
          isInputCollapsed: snapshot.isInputCollapsed,
        })
      }
      workspaceStore.removeProject(project.id)
      ElMessage.success('项目已移入回收站')
    }
  } catch {
    // 用户取消对话框
  }
}

function handleNewFile(): void {
  // 活动文件为空且无版本 → 直接复用，避免产生连续空白文件
  const active = graphStore.activeFile
  if (active && !active.rawText.trim() && active.versions.length === 0) {
    ElMessage.info('当前画布文件为空，可直接输入')
    return
  }
  graphStore.addFile()
}

async function handleRenameFile(file: CanvasFile): Promise<void> {
  try {
    const { value } = await ElMessageBox.prompt('输入新的画布文件名称', '重命名', {
      inputValue: file.name,
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      inputValidator: v => !!v?.trim() || '名称不能为空',
    })
    graphStore.updateFileName(file.id, value.trim())
  } catch {
    // 用户取消
  }
}

async function handleDeleteFile(file: CanvasFile): Promise<void> {
  if (graphStore.files.length <= 1) {
    ElMessage.warning('至少保留一个画布文件')
    return
  }
  try {
    await ElMessageBox.confirm(
      `删除画布文件「${file.name}」将移入回收站（含其全部版本），可在回收站恢复。`,
      '删除画布文件',
      {
        confirmButtonText: '删除',
        cancelButtonText: '取消',
        type: 'warning',
      },
    )
    const projectId = workspaceStore.activeProjectId
    const removed = graphStore.removeFile(file.id)
    if (removed) {
      trash.push('file', `${removed.name}`, { projectId, file: removed })
    }
  } catch {
    // 用户取消
  }
}

/** 版本列表倒序展示：最新版本在最上 */
function reversedVersions(file: CanvasFile): CanvasVersion[] {
  return [...file.versions].reverse()
}

/** 快照倒序展示：最新快照在最上 */
function reversedSnapshots(version: CanvasVersion): CanvasSnapshot[] {
  return [...(version.snapshots ?? [])].reverse()
}

function handleRestoreSnapshot(fileId: string, versionId: string, snapshotId: string): void {
  if (graphStore.restoreSnapshot(fileId, versionId, snapshotId)) {
    ElMessage.success('已回退到该快照，原状态已保留为快照')
  } else {
    ElMessage.error('快照已不存在')
  }
}

function formatTime(timestamp: number): string {
  const d = new Date(timestamp)
  const pad = (n: number): string => String(n).padStart(2, '0')
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function versionTooltip(version: CanvasVersion): string {
  const parts = [version.label, formatTime(version.createdAt)]
  if (version.redrawInstructions) {
    parts.push(`重构要求：${version.redrawInstructions}`)
  }
  if (version.sourceVersionId) {
    parts.push('来源：AI 重构版本链')
  }
  return parts.join('\n')
}

/**
 * 切换/回滚到指定版本。
 * 当前画布的手动编辑由 AppLayout 的渲染 watcher 在切换前写回旧版本，不会丢失。
 */
function handleActivateVersion(fileId: string, versionId: string): void {
  if (graphStore.activeFile?.activeVersionId === versionId) return
  graphStore.setActiveVersion(fileId, versionId)
}

async function handleDeleteVersion(file: CanvasFile, version: CanvasVersion): Promise<void> {
  if (file.versions.length <= 1) {
    ElMessage.warning('至少保留一个版本')
    return
  }
  try {
    await ElMessageBox.confirm(
      `删除版本「${version.label}」将移入回收站，可在回收站恢复。`,
      '删除版本',
      {
        confirmButtonText: '删除',
        cancelButtonText: '取消',
        type: 'warning',
      },
    )
    const projectId = workspaceStore.activeProjectId
    const removed = graphStore.removeVersion(file.id, version.id)
    if (removed) {
      trash.push('version', `${file.name} · ${removed.label}`, {
        projectId,
        fileId: file.id,
        fileName: file.name,
        version: removed,
      })
    }
  } catch {
    // 用户取消
  }
}
</script>

<style scoped>
.workspace-sidebar {
  width: 220px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  background: var(--bg-secondary, #f5f6f7);
  border-right: 1px solid var(--border-color);
  overflow: hidden;
  user-select: none;
}

.project-section {
  padding: 8px;
  border-bottom: 1px solid var(--border-color);
}

.project-dropdown {
  width: 100%;
}

.project-current {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  height: 32px;
  padding: 0 8px;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  background: var(--bg-primary, #fff);
  cursor: pointer;
  transition: border-color 0.15s;
}

.project-current:hover {
  border-color: var(--color-primary, #1890ff);
}

.project-icon {
  color: var(--color-primary, #1890ff);
  flex-shrink: 0;
}

.project-name {
  flex: 1;
  font-size: 13px;
  font-weight: 500;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.project-caret {
  color: var(--text-tertiary);
  flex-shrink: 0;
}

.files-section {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  padding-top: 4px;
}

.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 4px 12px;
}

.section-title {
  font-size: 11px;
  color: var(--text-tertiary);
  letter-spacing: 0.5px;
}

.header-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  padding: 0;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: var(--text-tertiary);
  cursor: pointer;
  transition: all 0.15s;
}

.header-btn:hover {
  background: var(--color-primary, #1890ff);
  color: #fff;
}

.file-list {
  flex: 1;
  overflow-y: auto;
  padding: 2px 6px 8px;
}

.file-item {
  display: flex;
  align-items: center;
  gap: 4px;
  height: 28px;
  padding: 0 6px;
  margin-bottom: 1px;
  border-radius: 6px;
  cursor: pointer;
  transition: background 0.15s;
}

.file-item:hover {
  background: var(--bg-tertiary, #e8eaed);
}

.file-item.active {
  background: var(--color-primary, #1890ff);
}

.file-item.active .file-name {
  color: #fff;
  font-weight: 500;
}

.file-item.active .file-versions {
  background: rgba(255, 255, 255, 0.25);
  color: #fff;
}

.search-section {
  padding: 0 8px 8px;
}

/* 搜索结果 */
.search-item {
  padding: 6px 8px;
  margin-bottom: 4px;
  border-radius: 6px;
  cursor: pointer;
  transition: background 0.15s;
}

.search-item:hover {
  background: var(--bg-tertiary, #e8eaed);
}

.search-title {
  display: flex;
  align-items: center;
  gap: 3px;
  font-size: 12px;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.search-project {
  color: var(--color-primary, #1890ff);
  flex-shrink: 0;
}

.search-sep {
  color: var(--text-tertiary);
  flex-shrink: 0;
}

.search-file {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.search-version {
  font-size: 11px;
  color: var(--text-secondary);
  margin-top: 2px;
}

.search-snippet {
  font-size: 11px;
  color: var(--text-tertiary);
  margin-top: 2px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.search-empty {
  padding: 24px 0;
  text-align: center;
  font-size: 12px;
  color: var(--text-tertiary);
}

/* 自动快照 */
.snapshot-chip {
  flex-shrink: 0;
  font-size: 10px;
  line-height: 1;
  padding: 2px 4px;
  border-radius: 6px;
  background: rgba(24, 144, 255, 0.14);
  color: var(--color-primary, #1890ff);
  cursor: pointer;
}

.snapshot-list {
  max-height: 220px;
  overflow-y: auto;
}

.snapshot-title {
  font-size: 11px;
  color: var(--text-tertiary);
  margin-bottom: 6px;
}

.snapshot-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 4px 6px;
  border-radius: 4px;
  font-size: 12px;
  color: var(--text-primary);
  cursor: pointer;
}

.snapshot-item:hover {
  background: var(--bg-tertiary, #e8eaed);
}

.snapshot-restore {
  font-size: 11px;
  color: var(--color-primary, #1890ff);
}

/* 回收站入口 */
.sidebar-footer {
  flex-shrink: 0;
  padding: 6px 8px;
  border-top: 1px solid var(--border-color);
}

.footer-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  height: 28px;
  padding: 0 8px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--text-secondary);
  font-size: 12px;
  cursor: pointer;
  transition: background 0.15s;
}

.footer-btn:hover {
  background: var(--bg-tertiary, #e8eaed);
}

.footer-badge {
  margin-left: auto;
  font-size: 10px;
  padding: 1px 6px;
  border-radius: 8px;
  background: var(--color-primary, #1890ff);
  color: #fff;
}

.version-list {
  position: relative;
  margin: 0 0 6px 14px;
  padding-left: 10px;
  border-left: 1px dashed var(--border-color);
}

.version-item {
  position: relative;
  display: flex;
  align-items: center;
  gap: 6px;
  height: 24px;
  padding: 0 6px;
  border-radius: 5px;
  cursor: pointer;
  transition: background 0.15s;
}

.version-item:hover {
  background: var(--bg-tertiary, #e8eaed);
}

.version-item.active {
  background: rgba(24, 144, 255, 0.12);
}

.version-dot {
  position: absolute;
  left: -14px;
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--border-color);
  flex-shrink: 0;
}

.version-item.active .version-dot {
  background: var(--color-primary, #1890ff);
}

.version-label {
  flex: 1;
  font-size: 11px;
  color: var(--text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.version-item.active .version-label {
  color: var(--color-primary, #1890ff);
  font-weight: 500;
}

.version-time {
  font-size: 10px;
  color: var(--text-tertiary);
  flex-shrink: 0;
}

.version-delete {
  display: none;
  width: 16px;
  height: 16px;
  font-size: 11px;
}

.version-item:hover .version-delete {
  display: inline-flex;
}

.file-item.active .action-icon {
  color: rgba(255, 255, 255, 0.8);
}

.file-item.active .action-icon:hover {
  background: rgba(255, 255, 255, 0.2);
  color: #fff;
}

.file-name {
  flex: 1;
  font-size: 12px;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.file-versions {
  font-size: 10px;
  line-height: 1;
  padding: 2px 4px;
  border-radius: 6px;
  background: var(--bg-tertiary, #e8eaed);
  color: var(--text-secondary);
  flex-shrink: 0;
}

.file-actions {
  display: none;
  align-items: center;
  gap: 2px;
  flex-shrink: 0;
}

.file-item:hover .file-actions {
  display: inline-flex;
}

.action-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  border-radius: 4px;
  font-size: 12px;
  color: var(--text-tertiary);
  cursor: pointer;
  transition: all 0.15s;
}

.action-icon:hover {
  background: var(--border-color);
  color: var(--text-primary);
}
</style>
