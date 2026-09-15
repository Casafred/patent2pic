import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

/** 项目：画布文件的容器（P1 为单项目模型，P2 引入多项目 UI 与隔离） */
export interface Project {
  id: string
  name: string
  createdAt: number
  updatedAt: number
}

const WORKSPACE_KEY = 'patent2pic-workspace'

function loadProjects(): Project[] {
  try {
    const raw = localStorage.getItem(WORKSPACE_KEY)
    if (!raw) return []
    const data = JSON.parse(raw)
    if (Array.isArray(data.projects)) {
      return data.projects
    }
    return []
  } catch {
    return []
  }
}

function persistProjects(projects: Project[]): void {
  try {
    localStorage.setItem(WORKSPACE_KEY, JSON.stringify({ version: '1.0.0', projects }))
  } catch (err) {
    console.error('工作区持久化失败:', err)
  }
}

export const useWorkspaceStore = defineStore('workspace', () => {
  const projects = ref<Project[]>(loadProjects())
  const activeProjectId = ref<string>('')

  const activeProject = computed<Project | null>(() =>
    projects.value.find(p => p.id === activeProjectId.value) || null,
  )

  function createProject(name?: string): Project {
    const project: Project = {
      id: `project-${Date.now()}-${projects.value.length + 1}`,
      name: name || `项目 ${projects.value.length + 1}`,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }
    projects.value.push(project)
    persistProjects(projects.value)
    return project
  }

  function renameProject(id: string, name: string): void {
    const project = projects.value.find(p => p.id === id)
    if (project) {
      project.name = name
      project.updatedAt = Date.now()
      persistProjects(projects.value)
    }
  }

  function removeProject(id: string): void {
    const index = projects.value.findIndex(p => p.id === id)
    if (index === -1) return
    projects.value.splice(index, 1)
    persistProjects(projects.value)
    if (activeProjectId.value === id) {
      activeProjectId.value = projects.value[0]?.id ?? ''
    }
  }

  function setActiveProject(id: string): void {
    activeProjectId.value = id
    const project = projects.value.find(p => p.id === id)
    if (project) {
      project.updatedAt = Date.now()
      persistProjects(projects.value)
    }
  }

  /** 应用启动时保证存在活动项目 */
  function ensureDefaultProject(): Project {
    let project = projects.value.find(p => p.id === activeProjectId.value)
    if (!project) {
      project = projects.value[0]
    }
    if (!project) {
      project = createProject('默认项目')
    }
    activeProjectId.value = project.id
    return project
  }

  return {
    projects,
    activeProjectId,
    activeProject,
    createProject,
    renameProject,
    removeProject,
    setActiveProject,
    ensureDefaultProject,
  }
})
