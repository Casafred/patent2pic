import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { SentenceTranslation, ClaimTranslation, TranslationStatus } from '@/types/translation'
import type { Sentence } from '@/types/claim'

export const useTranslationStore = defineStore('translation', () => {
  const claimTranslations = ref<Map<string, ClaimTranslation>>(new Map())
  const isTranslating = ref(false)
  const progress = ref({ completed: 0, total: 0 })

  const sentenceMap = computed(() => {
    const map = new Map<string, SentenceTranslation>()
    for (const [, claimTrans] of claimTranslations.value) {
      for (const st of claimTrans.sentences) {
        map.set(st.sentenceId, st)
      }
    }
    return map
  })

  function getSentenceTranslation(sentenceId: string): SentenceTranslation | undefined {
    return sentenceMap.value.get(sentenceId)
  }

  function setSentenceTranslation(sentenceId: string, translation: SentenceTranslation): void {
    for (const [, claimTrans] of claimTranslations.value) {
      const idx = claimTrans.sentences.findIndex(s => s.sentenceId === sentenceId)
      if (idx >= 0) {
        claimTrans.sentences[idx] = translation
        updateClaimOverallStatus(claimTrans)
        return
      }
    }
  }

  function initClaimTranslation(claimId: string, sentences: Sentence[]): void {
    const existing = claimTranslations.value.get(claimId)
    if (existing) {
      const doneMap = new Map<string, SentenceTranslation>()
      for (const st of existing.sentences) {
        if (st.status === 'done') {
          doneMap.set(st.sentenceId, st)
        }
      }
      const newSentences = sentences.map(s => {
        const cached = doneMap.get(s.id)
        if (cached && cached.originalText === s.text) {
          return cached
        }
        return {
          sentenceId: s.id,
          originalText: s.text,
          translatedText: '',
          status: 'idle' as TranslationStatus,
          error: null,
        }
      })
      claimTranslations.value.set(claimId, {
        claimId,
        sentences: newSentences,
        overallStatus: 'idle',
      })
      return
    }

    const claimTranslation: ClaimTranslation = {
      claimId,
      sentences: sentences.map(s => ({
        sentenceId: s.id,
        originalText: s.text,
        translatedText: '',
        status: 'idle' as TranslationStatus,
        error: null,
      })),
      overallStatus: 'idle',
    }
    claimTranslations.value.set(claimId, claimTranslation)
  }

  function updateClaimOverallStatus(claimTrans: ClaimTranslation): void {
    const statuses = claimTrans.sentences.map(s => s.status)
    if (statuses.every(s => s === 'done')) {
      claimTrans.overallStatus = 'done'
    } else if (statuses.some(s => s === 'error') && statuses.some(s => s === 'done')) {
      claimTrans.overallStatus = 'done'
    } else if (statuses.some(s => s === 'loading')) {
      claimTrans.overallStatus = 'loading'
    } else if (statuses.some(s => s === 'error')) {
      claimTrans.overallStatus = 'error'
    }
  }

  function getTranslationProgress(claimId: string): { completed: number; total: number } {
    const claimTrans = claimTranslations.value.get(claimId)
    if (!claimTrans) return { completed: 0, total: 0 }
    return {
      completed: claimTrans.sentences.filter(s => s.status === 'done').length,
      total: claimTrans.sentences.length,
    }
  }

  function clearTranslations(): void {
    claimTranslations.value.clear()
    progress.value = { completed: 0, total: 0 }
  }

  function clearClaimTranslation(claimId: string): void {
    claimTranslations.value.delete(claimId)
  }

  return {
    claimTranslations,
    isTranslating,
    progress,
    sentenceMap,
    getSentenceTranslation,
    setSentenceTranslation,
    initClaimTranslation,
    getTranslationProgress,
    clearTranslations,
    clearClaimTranslation,
  }
})
