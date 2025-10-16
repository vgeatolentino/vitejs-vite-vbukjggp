export type Side = 'front' | 'back'

export interface CardFace {
  side: Side
  blob: Blob
  url: string
  fileName: string
  tags: string[]
}

export interface Card {
  id: string
  name: string
  faces: Record<Side, CardFace>
  tags: string[]
}

export interface Deck {
  id: string
  name: string
  cardIds: string[]
  tags: string[]
}

export interface AppState {
  cards: Record<string, Card>
  decks: Record<string, Deck>
  deckOrder: string[]
  selectedCardIds: string[]
  activeDeckId: string | null
  hand: string[]
  handTransforms: Record<string, { x: number; y: number; rot: number; flipped: boolean; z: number }>
  blobPersistence: boolean
}
