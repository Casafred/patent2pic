export interface Claim {
  id: string
  index: number
  rawText: string
  sentences: Sentence[]
}

export interface Sentence {
  id: string
  text: string
  nodeIds: string[]
  edgeIds: string[]
}
