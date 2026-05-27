import type { Claim, Sentence } from '@/types/claim'

const CLAIM_NUMBER_REGEX = /(?:^|\n)\s*(\d+)\s*[.、．]\s*/g

const SENTENCE_SPLIT_REGEX = /[。；;，,！!？?：:、]|\.(?=\s|$)/

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

function splitSentences(claimText: string, claimIndex: number): Sentence[] {
  const parts: string[] = []
  let remaining = claimText

  while (remaining.length > 0) {
    const match = remaining.match(SENTENCE_SPLIT_REGEX)
    if (!match || match.index === undefined) {
      if (remaining.trim().length > 0) {
        parts.push(remaining.trim())
      }
      break
    }

    const splitIndex = match.index + match[0].length
    const part = remaining.slice(0, splitIndex).trim()
    if (part.length > 0) {
      parts.push(part)
    }
    remaining = remaining.slice(splitIndex)
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
