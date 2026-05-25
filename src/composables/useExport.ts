import { graphEngine } from '@/services/graph/engine'
import { serializeGraph } from '@/services/graph/serializer'
import { useGraphStore } from '@/stores/graph'
import type { ExportFormat } from '@/types/app'

function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}

export function useExport() {
  const graphStore = useGraphStore()

  async function exportPNG(): Promise<Blob | null> {
    return graphEngine.toPNG()
  }

  function exportSVG(): string {
    return graphEngine.toSVG()
  }

  function exportJSON(): string {
    const json = serializeGraph(
      graphStore.nodes,
      graphStore.edges,
      graphStore.groups,
      graphStore.extractResult?.claimId || '',
    )
    return JSON.stringify(json, null, 2)
  }

  async function downloadFile(format: ExportFormat): Promise<void> {
    if (isTauri()) {
      await downloadViaTauri(format)
    } else {
      await downloadViaBrowser(format)
    }
  }

  async function downloadViaTauri(format: ExportFormat): Promise<void> {
    try {
      const { save } = await import('@tauri-apps/plugin-dialog')
      const { writeFile } = await import('@tauri-apps/plugin-fs')

      const extensions: Record<ExportFormat, string[]> = {
        png: ['png'],
        svg: ['svg'],
        json: ['json'],
        p2p: ['p2p'],
      }

      const path = await save({
        defaultPath: `patent2pic-graph.${format}`,
        filters: [{
          name: format.toUpperCase(),
          extensions: extensions[format],
        }],
      })

      if (!path) return

      switch (format) {
        case 'png': {
          const blob = await exportPNG()
          if (blob) {
            const buffer = await blob.arrayBuffer()
            const uint8 = new Uint8Array(buffer)
            await writeFile(path, uint8)
          }
          break
        }
        case 'svg': {
          const svg = exportSVG()
          const encoder = new TextEncoder()
          await writeFile(path, encoder.encode(svg))
          break
        }
        case 'json': {
          const json = exportJSON()
          const encoder = new TextEncoder()
          await writeFile(path, encoder.encode(json))
          break
        }
      }
    } catch (err) {
      console.error('Tauri 导出失败，回退到浏览器下载:', err)
      await downloadViaBrowser(format)
    }
  }

  async function downloadViaBrowser(format: ExportFormat): Promise<void> {
    switch (format) {
      case 'png': {
        const blob = await exportPNG()
        if (blob) downloadBlob(blob, 'patent2pic-graph.png')
        break
      }
      case 'svg': {
        const svg = exportSVG()
        const blob = new Blob([svg], { type: 'image/svg+xml' })
        downloadBlob(blob, 'patent2pic-graph.svg')
        break
      }
      case 'json': {
        const json = exportJSON()
        const blob = new Blob([json], { type: 'application/json' })
        downloadBlob(blob, 'patent2pic-graph.json')
        break
      }
    }
  }

  function downloadBlob(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  return {
    exportPNG,
    exportSVG,
    exportJSON,
    downloadFile,
  }
}
