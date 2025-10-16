import type { Card, CardFace } from './types'

export function id(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36)
}

export function parseSide(fileName: string): 'front' | 'back' | null {
  const lower = fileName.toLowerCase()
  if (lower.includes('_front')) return 'front'
  if (lower.includes('_back')) return 'back'
  return null
}

export function getBaseName(fileName: string): string {
  // Remove _front/_back and extension
  const lower = fileName.toLowerCase()
  const base = lower.replace('_front', '').replace('_back', '')
  return base.replace(/\.png$/, '')
}

export function pairCards(files: File[]): { cards: Card[]; rejected: File[] } {
  // Only PNGs
  const pngs = files.filter(f => f.name.toLowerCase().endsWith('.png'))
  const map: Record<string, Partial<Record<'front' | 'back', File>>> = {}
  for (const f of pngs) {
    const side = parseSide(f.name)
    if (!side) continue
    const base = getBaseName(f.name)
    map[base] = map[base] || {}
    map[base][side] = f
  }
  const cards: Card[] = []
  const rejected: File[] = []
  for (const [base, fb] of Object.entries(map)) {
    if (fb.front && fb.back) {
      const front = fb.front!; const back = fb.back!
      const cid = id()
      const c: Card = {
        id: cid,
        name: base,
        tags: [],
        faces: {
          front: { side: 'front', blob: front, url: '', fileName: front.name, tags: [] } as CardFace,
          back: { side: 'back', blob: back, url: '', fileName: back.name, tags: [] } as CardFace,
        }
      }
      cards.push(c)
    } else {
      if (fb.front) rejected.push(fb.front!)
      if (fb.back) rejected.push(fb.back!)
    }
  }
  return { cards, rejected }
}

export async function blobToURL(card: Card): Promise<Card> {
  const frontUrl = URL.createObjectURL(card.faces.front.blob)
  const backUrl = URL.createObjectURL(card.faces.back.blob)
  return {
    ...card,
    faces: {
      front: { ...card.faces.front, url: frontUrl },
      back: { ...card.faces.back, url: backUrl },
    }
  }
}
