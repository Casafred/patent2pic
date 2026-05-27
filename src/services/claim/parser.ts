import type { Claim, Sentence } from '@/types/claim'

const CLAIM_NUMBER_REGEX = /(?:^|\n)\s*(\d+)\s*[.、．]\s*/g

const SENTENCE_SPLIT_CHARS = new Set('。；;，,！!？?：:、'.split(''))

export function parseClaims(rawText: string): Claim[] {
  const trimmed = rawText.trim()
  if (!trimmed) return []

  const segments = splitByClaimNumbers(trimmed)

  return segments.map((text, index) => ({
    id: `claim-${index + 1}`,
    index: index + 1,
    rawText: text.trim(),
    sentences: splitSentences(text.trim(), index + 1),
  }))
}

function splitByClaimNumbers(text: string): string[] {
  const matches = [...text.matchAll(CLAIM_NUMBER_REGEX)]

  if (matches.length === 0) {
    return [text]
  }

  const segments: string[] = []
  for (let i = 0; i < matches.length; i++) {
    const start = matches[i].index! + matches[i][0].length
    const end = i + 1 < matches.length ? matches[i + 1].index! : text.length
    segments.push(text.slice(start, end).trim())
  }

  return segments.filter(s => s.length > 0)
}

function isSplitAtPosition(text: string, index: number): boolean {
  const ch = text[index]
  if (!SENTENCE_SPLIT_CHARS.has(ch)) {
    if (ch === '.' && (index + 1 === text.length || /\s/.test(text[index + 1]))) {
      return true
    }
    return false
  }
  let depth = 0
  for (let i = 0; i < index; i++) {
    const c = text[i]
    if (c === '(' || c === '（' || c === '[' || c === '【') depth++
    else if (c === ')' || c === '）' || c === ']' || c === '】') depth--
  }
  return depth === 0
}

function findNextSplit(text: string): number {
  for (let i = 0; i < text.length; i++) {
    if (isSplitAtPosition(text, i)) {
      return i
    }
  }
  return -1
}

function splitSentences(claimText: string, claimIndex: number): Sentence[] {
  const parts: string[] = []
  let remaining = claimText

  while (remaining.length > 0) {
    const splitPos = findNextSplit(remaining)
    if (splitPos === -1) {
      if (remaining.trim().length > 0) {
        parts.push(remaining.trim())
      }
      break
    }

    const splitEnd = splitPos + 1
    const part = remaining.slice(0, splitEnd).trim()
    if (part.length > 0) {
      parts.push(part)
    }
    remaining = remaining.slice(splitEnd)
  }

  return parts.map((text, index) => ({
    id: `claim-${claimIndex}-sent-${index + 1}`,
    text,
    nodeIds: [],
    edgeIds: [],
  }))
}

export function getClaimPreview(claim: Claim): string {
  const firstSentence = claim.sentences[0]?.text || ''
  if (firstSentence.length > 60) {
    return firstSentence.slice(0, 60) + '...'
  }
  return firstSentence
}
