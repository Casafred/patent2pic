import { useClaimStore } from '@/stores/claim'
import { useTranslationStore } from '@/stores/translation'

function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}

export function useExportExcel() {
  const claimStore = useClaimStore()
  const translationStore = useTranslationStore()

  async function exportToExcel(): Promise<void> {
    const claim = claimStore.getActiveClaim()
    if (!claim || claim.sentences.length === 0) return

    const XLSX = await import('xlsx')
    const rows: (string | number)[][] = [['序号', '原文', '译文']]

    for (let i = 0; i < claim.sentences.length; i++) {
      const sentence = claim.sentences[i]
      const trans = translationStore.getSentenceTranslation(claim.id, sentence.id)
      const translatedText = trans?.translatedText || ''
      rows.push([i + 1, sentence.text, translatedText])
    }

    const ws = XLSX.utils.aoa_to_sheet(rows)

    ws['!cols'] = [
      { wch: 6 },
      { wch: 60 },
      { wch: 60 },
    ]

    for (let i = 2; i <= rows.length; i++) {
      if (!ws[`A${i}`]) continue
      ws[`A${i}`].vAlign = 'top'
      ws[`B${i}`].vAlign = 'top'
      ws[`C${i}`].vAlign = 'top'
      ws[`B${i}`] && (ws[`B${i}`].wrapText = true)
      ws[`C${i}`] && (ws[`C${i}`].wrapText = true)
    }

    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, '权利要求翻译')

    const filename = `权利要求翻译_${claim.index}.xlsx`
    const buffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' })

    if (isTauri()) {
      try {
        const { save } = await import('@tauri-apps/plugin-dialog')
        const { writeFile } = await import('@tauri-apps/plugin-fs')

        const path = await save({
          defaultPath: filename,
          filters: [{ name: 'Excel 文件', extensions: ['xlsx'] }],
        })
        if (path) {
          await writeFile(path as string, new Uint8Array(buffer as ArrayBuffer))
        }
      } catch (err) {
        console.error('Tauri 导出失败，回退到浏览器:', err)
        downloadViaBrowser(buffer, filename)
      }
    } else {
      downloadViaBrowser(buffer, filename)
    }
  }

  function downloadViaBrowser(buffer: ArrayBuffer | Uint8Array | number[], filename: string): void {
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  return { exportToExcel }
}
