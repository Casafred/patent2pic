import { graphEngine } from '@/services/graph/engine'
import type { ExportFormat } from '@/types/app'

function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}

export function useExport() {

  async function exportPNG(): Promise<Blob | null> {
    return graphEngine.toPNG({ padding: 40, scale: 3 })
  }

  function exportSVG(): string {
    return graphEngine.toSVG()
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
        p2p: ['p2p'],
      }

      const defaultNames: Record<ExportFormat, string> = {
        png: 'patent2pic-graph.png',
        svg: 'patent2pic-graph.svg',
        p2p: 'patent2pic-graph.p2p',
      }

      const path = await save({
        defaultPath: defaultNames[format],
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
    downloadFile,
  }
}