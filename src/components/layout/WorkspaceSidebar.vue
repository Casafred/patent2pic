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

    <!-- 画布文件区 -->
    <div class="files-section">
      <div class="section-header">
        <span class="section-title">画布文件</span>
        <button class="header-btn" title="新建画布文件" @click="handleNewFile">
          <el-icon><Plus /></el-icon>
        </button>
      </div>
      <div class="file-list">
        <div
          v-for="file in graphStore.files"
          :key="file.id"
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
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Folder, ArrowDown, Plus, EditPen, Delete } from '@element-plus/icons-vue'
import { useGraphStore, type CanvasFile } from '@/stores/graph'
import { useWorkspaceStore } from '@/stores/workspace'

const graphStore = useGraphStore()
const workspaceStore = useWorkspaceStore()

const activeProject = computed(() => workspaceStore.activeProject)

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
        `删除项目「${project.name}」将同时删除其全部画布文件与历史版本，且不可恢复。`,
        '删除项目',
        {
          confirmButtonText: '删除',
          cancelButtonText: '取消',
          type: 'warning',
        },
      )
      workspaceStore.removeProject(project.id)
      ElMessage.success('项目已删除')
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
      `删除画布文件「${file.name}」将同时删除其全部版本，是否继续？`,
      '删除画布文件',
      {
        confirmButtonText: '删除',
        cancelButtonText: '取消',
        type: 'warning',
      },
    )
    graphStore.removeFile(file.id)
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
