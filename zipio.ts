import JSZip from 'jszip'
import type { AppState, Card } from './types'

export async function exportZip(state: AppState): Promise<Blob> {
  const zip = new JSZip()
  zip.file('meta.json', JSON.stringify({
    version: 1,
    exportedAt: new Date().toISOString(),
    deckOrder: state.deckOrder,
    decks: state.decks,
    cardsMeta: Object.fromEntries(Object.entries(state.cards).map(([id, c]) => [id, { id: c.id, name: c.name, tags: c.tags }])),
  }, null, 2))

  const imgs = zip.folder('images')!
  for (const card of Object.values(state.cards)) {
    const base = card.name
    imgs.file(`${base}_front.png`, card.faces.front.blob)
    imgs.file(`${base}_back.png`, card.faces.back.blob)
  }

  return zip.generateAsync({ type: 'blob' })
}

export async function importZip(file: File): Promise<Card[]> {
  const zip = await JSZip.loadAsync(file)
  const images: Record<string, File> = {}
  await Promise.all(Object.keys(zip.files).map(async (k) => {
    const entry = zip.files[k]
    if (!entry.dir && k.toLowerCase().endsWith('.png')) {
      const blob = await entry.async('blob')
      images[k] = new File([blob], k, { type: 'image/png' })
    }
  }))
  // Reuse pairing by converting to File[]
  const all = Object.values(images)
  // dynamic import utils to avoid circular deps:
  const utils = await import('./utils')
  const { cards } = utils.pairCards(all as any)
  const withURLs = await Promise.all(cards.map(utils.blobToURL))
  return withURLs
}
