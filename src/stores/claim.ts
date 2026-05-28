import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { Claim, Sentence } from '@/types/claim'

export const useClaimStore = defineStore('claim', () => {
  const rawText = ref('')
  const claims = ref<Claim[]>([])
  const activeClaimId = ref<string | null>(null)
  const history = ref<string[]>([])
  const isInputCollapsed = ref(false)

  function setText(text: string): void {
    rawText.value = text
    if (text && !history.value.includes(text)) {
      history.value = [text, ...history.value].slice(0, 20)
    }
  }

  function setClaims(parsed: Claim[]): void {
    claims.value = parsed
    if (parsed.length > 0 && !activeClaimId.value) {
      activeClaimId.value = parsed[0].id
    }
  }

  function setActiveClaim(id: string): void {
    activeClaimId.value = id
  }

  function getActiveClaim(): Claim | undefined {
    return claims.value.find(c => c.id === activeClaimId.value)
  }

  function collapseInput(): void {
    isInputCollapsed.value = true
  }

  function expandInput(): void {
    isInputCollapsed.value = false
  }

  function updateClaimSentences(claimId: string, sentences: Sentence[]): void {
    const claim = claims.value.find(c => c.id === claimId)
    if (claim) {
      claim.sentences = sentences
    }
  }

  return {
    rawText,
    claims,
    activeClaimId,
    history,
    isInputCollapsed,
    setText,
    setClaims,
    setActiveClaim,
    getActiveClaim,
    collapseInput,
    expandInput,
    updateClaimSentences,
  }
})
