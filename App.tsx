import React from 'react'
import type { AppState, Card, Deck } from './types'
import { id } from './utils'
import { pairCards, blobToURL } from './utils'
import { saveState, loadState, purge } from './storage'
import { exportZip, importZip } from './zipio'

function useAppState() {
  const [state, setState] = React.useState<AppState>({
    cards: {},
    decks: {},
    deckOrder: [],
    selectedCardIds: [],
    activeDeckId: null,
    hand: [],
    handTransforms: {},
    blobPersistence: True as any, // toggled by user; we keep in IDB regardless, but this flag allows skipping blob save in future
  } as unknown as AppState)

  React.useEffect(() => {
    (async () => {
      const loaded = await loadState()
      if (loaded) {
        setState(loaded)
      } else {
        // Bootstrap with a default deck
        const dId = id()
        const deck: Deck = { id: dId, name: 'Main Deck', cardIds: [], tags: [] }
        setState(s => ({ ...s, decks: { [dId]: deck }, deckOrder: [dId], activeDeckId: dId }))
      }
    })()
  }, [])

  React.useEffect(() => {
    // Persist
    saveState(state)
  }, [state])

  return [state, setState] as const
}

function Toolbar({ onUploadFiles, onUploadFolder, onExportZip, onImportZip, onPurge } : any) {
  const fileRef = React.useRef<HTMLInputElement>(null)
  const dirRef = React.useRef<HTMLInputElement>(null)
  const zipRef = React.useRef<HTMLInputElement>(null)

  return (
    <div className="toolbar">
      <button className="btn primary" onClick={() => fileRef.current?.click()}>Upload PNGs</button>
      <input ref={fileRef} type="file" multiple accept="image/png" className="hidden"
        onChange={e => onUploadFiles(Array.from(e.target.files || []))} />

      <button className="btn" onClick={() => dirRef.current?.click()}>Upload Folder</button>
      <input ref={dirRef} type="file" className="hidden" multiple accept="image/png" webkitdirectory="true" directory="true"
        onChange={e => onUploadFolder(Array.from(e.target.files || []))} />

      <span className="pill">PNG only • requires _front/_back • pairs only</span>

      <button className="btn" onClick={onExportZip}>Export ZIP</button>
      <button className="btn" onClick={() => zipRef.current?.click()}>Import ZIP</button>
      <input ref={zipRef} type="file" accept=".zip" className="hidden"
        onChange={e => { const f = e.target.files?.[0]; if (f) onImportZip(f) }} />

      <div style={{flex:1}} />
      <button className="btn" onClick={onPurge}>Purge Storage</button>
    </div>
  )
}

function DecksPane({ state, setState } : { state: AppState, setState: React.Dispatch<React.SetStateAction<AppState>>}) {
  const addDeck = () => {
    const dId = id()
    const deck: Deck = { id: dId, name: 'New Deck', cardIds: [], tags: [] }
    setState(s => ({ ...s, decks: { ...s.decks, [dId]: deck }, deckOrder: [...s.deckOrder, dId], activeDeckId: dId }))
  }
  const deleteDeck = (dId: string) => {
    setState(s => {
      const { [dId]: _, ...rest } = s.decks
      const deckOrder = s.deckOrder.filter(id => id !== dId)
      const activeDeckId = deckOrder[0] || null
      return { ...s, decks: rest, deckOrder, activeDeckId }
    })
  }
  const renameDeck = (dId: string, name: string) => {
    setState(s => ({ ...s, decks: { ...s.decks, [dId]: { ...s.decks[dId], name } } }))
  }
  const moveSelectedTo = (targetId: string) => {
    setState(s => {
      const selected = s.selectedCardIds
      if (!selected.length) return s
      const decks = { ...s.decks }
      // remove from all decks
      for (const d of Object.values(decks)) {
        d.cardIds = d.cardIds.filter(id => !selected.includes(id))
      }
      // add to target
      const t = decks[targetId]
      t.cardIds = [...new Set([...t.cardIds, ...selected])]
      return { ...s, decks, selectedCardIds: [] }
    })
  }
  return (
    <div className="panel">
      <h3>Decks</h3>
      {state.deckOrder.map((dId) => {
        const d = state.decks[dId]
        return (
          <div key={dId} className="deck-row" onClick={() => setState(s => ({...s, activeDeckId: dId}))}>
            <input value={d.name} onChange={e => renameDeck(dId, e.target.value)} />
            <span className="muted">{d.cardIds.length}</span>
            <button className="btn" onClick={(e) => { e.stopPropagation(); moveSelectedTo(dId) }}>Move here</button>
            <button className="btn" onClick={(e) => { e.stopPropagation(); deleteDeck(dId) }}>✕</button>
          </div>
        )
      })}
      <button className="btn" onClick={addDeck}>+ Add Deck</button>
    </div>
  )
}

function GalleryPane({ state, setState } : { state: AppState, setState: React.Dispatch<React.SetStateAction<AppState>>}) {
  const dId = state.activeDeckId
  if (!dId) return <div className="panel"><h3>Gallery</h3><div className="muted">No deck selected.</div></div>
  const deck = state.decks[dId]
  const cards = deck.cardIds.map(id => state.cards[id]).filter(Boolean)

  const toggleSelect = (id: string, e: React.MouseEvent) => {
    setState(s => {
      const selected = new Set(s.selectedCardIds)
      if (e.shiftKey || e.metaKey || e.ctrlKey) {
        if (selected.has(id)) selected.delete(id); else selected.add(id)
      } else {
        if (selected.size === 1 && selected.has(id)) { selected.clear() }
        else { selected.clear(); selected.add(id) }
      }
      return { ...s, selectedCardIds: Array.from(selected) }
    })
  }

  return (
    <div className="panel">
      <h3>Gallery</h3>
      <div className="grid">
        {cards.map(card => (
          <div key={card.id} className={"card " + (state.selectedCardIds.includes(card.id) ? "selected" : "")}
            onClick={(e) => toggleSelect(card.id, e)}>
            <span className="badge">front</span>
            <img src={card.faces.front.url} alt={card.name} draggable={false} />
          </div>
        ))}
      </div>
    </div>
  )
}

function HandPane({ state, setState } : { state: AppState, setState: React.Dispatch<React.SetStateAction<AppState>>}) {
  const bringToFront = (id: string) => {
    setState(s => {
      const maxZ = Math.max(0, ...Object.values(s.handTransforms).map(t => t.z || 0)) + 1
      const t = s.handTransforms[id] || { x: 20, y: 20, rot: 0, flipped: false, z: 0 }
      return { ...s, handTransforms: { ...s.handTransforms, [id]: { ...t, z: maxZ } } }
    })
  }
  const drawRandom = () => {
    setState(s => {
      const d = s.activeDeckId ? s.decks[s.activeDeckId] : null
      if (!d || d.cardIds.length === 0) return s
      const id = d.cardIds[Math.floor(Math.random() * d.cardIds.length)]
      if (s.hand.includes(id)) return s
      const t = { x: 20 + s.hand.length * 24, y: 20 + s.hand.length * 16, rot: 0, flipped: false, z: s.hand.length + 1 }
      return { ...s, hand: [...s.hand, id], handTransforms: { ...s.handTransforms, [id]: t } }
    })
  }
  const clearHand = () => setState(s => ({ ...s, hand: [], handTransforms: {} }))
  const rotate = (id: string) => setState(s => ({ ...s, handTransforms: { ...s.handTransforms, [id]: { ...s.handTransforms[id], rot: (s.handTransforms[id].rot + 90) % 360 } } }))
  const flip = (id: string) => setState(s => ({ ...s, handTransforms: { ...s.handTransforms, [id]: { ...s.handTransforms[id], flipped: !s.handTransforms[id].flipped } } }))

  // Simple drag
  const dragInfo = React.useRef<{ id: string, dx: number, dy: number } | null>(null)

  const onMouseDown = (e: React.MouseEvent, id: string) => {
    const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect()
    dragInfo.current = { id, dx: e.clientX - rect.left, dy: e.clientY - rect.top }
    bringToFront(id)
  }
  const onMouseMove = (e: React.MouseEvent) => {
    if (!dragInfo.current) return
    const { id, dx, dy } = dragInfo.current
    setState(s => ({ ...s, handTransforms: { ...s.handTransforms, [id]: { ...s.handTransforms[id], x: e.clientX - dx - (e.currentTarget as HTMLDivElement).getBoundingClientRect().left, y: e.clientY - dy - (e.currentTarget as HTMLDivElement).getBoundingClientRect().top } } }))
  }
  const onMouseUp = () => { dragInfo.current = null }

  return (
    <div className="panel">
      <h3>Hand</h3>
      <div className="toolrow" style={{marginBottom:8}}>
        <button className="btn" onClick={drawRandom}>Draw</button>
        <button className="btn" onClick={clearHand}>Clear</button>
        <span className="muted">Tip: drag cards, click to bring to front, use Rotate/Flip on selected.</span>
      </div>
      <div className="hand" onMouseMove={onMouseMove} onMouseUp={onMouseUp}>
        {state.hand.map(cid => {
          const card = state.cards[cid]
          const t = state.handTransforms[cid] || { x: 20, y: 20, rot: 0, flipped: false, z: 0 }
          const src = t.flipped ? card.faces.back.url : card.faces.front.url
          return (
            <div key={cid} className="hand-card" style={{ left: t.x, top: t.y, transform: `rotate(${t.rot}deg)`, zIndex: t.z }}
                 onMouseDown={(e) => onMouseDown(e, cid)} onClick={() => bringToFront(cid)}>
              <img src={src} draggable={false} style={{ width: '100%', height: 'auto' }} />
              <div className="toolrow" style={{ padding: 4 }}>
                <button className="btn" onClick={() => rotate(cid)}>Rotate 90°</button>
                <button className="btn" onClick={() => flip(cid)}>Flip</button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default function App() {
  const [state, setState] = useAppState()

  const addCardsToActiveDeck = (cards: Card[]) => {
    setState(async s => {
      const withURLs = await Promise.all(cards.map(blobToURL))
      const cardsMap = { ...s.cards }
      const dId = s.activeDeckId
      if (!dId) return s
      const deck = { ...s.decks[dId] }
      for (const c of withURLs) {
        cardsMap[c.id] = c
        if (!deck.cardIds.includes(c.id)) deck.cardIds.push(c.id)
      }
      return { ...s, cards: cardsMap, decks: { ...s.decks, [dId]: deck } }
    })
  }

  const onUploadFiles = async (files: File[]) => {
    const { cards, rejected } = pairCards(files)
    if (rejected.length) alert(`Skipped ${rejected.length} unmatched PNGs (need both _front and _back).`)
    await addCardsToActiveDeck(cards)
  }
  const onUploadFolder = onUploadFiles

  const onExportZip = async () => {
    const blob = await exportZip(state)
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'card-gallery-pro.zip'
    a.click()
    URL.revokeObjectURL(url)
  }
  const onImportZip = async (file: File) => {
    const cards = await importZip(file)
    await addCardsToActiveDeck(cards)
  }
  const onPurge = async () => {
    await purge()
    location.reload()
  }

  const deleteSelected = () => {
    setState(s => {
      const selected = new Set(s.selectedCardIds)
      const cards = { ...s.cards }
      for (const id of selected) delete cards[id]
      const decks = { ...s.decks }
      for (const d of Object.values(decks)) {
        d.cardIds = d.cardIds.filter(id => !selected.has(id))
      }
      return { ...s, cards, decks, selectedCardIds: [] }
    })
  }

  const moveSelectionToNewDeck = () => {
    setState(s => {
      const selected = s.selectedCardIds
      if (!selected.length) return s
      const dId = id()
      const deck: Deck = { id: dId, name: 'Moved Selection', cardIds: [...selected], tags: [] }
      // remove from all decks
      const decks = { ...s.decks, [dId]: deck }
      for (const d of Object.values(decks)) {
        if (d.id === dId) continue
        d.cardIds = d.cardIds.filter(id => !selected.includes(id))
      }
      return { ...s, decks, deckOrder: [...s.deckOrder, dId], activeDeckId: dId, selectedCardIds: [] }
    })
  }

  return (
    <div className="app">
      <Toolbar
        onUploadFiles={onUploadFiles}
        onUploadFolder={onUploadFolder}
        onExportZip={onExportZip}
        onImportZip={onImportZip}
        onPurge={onPurge}
      />
      <DecksPane state={state} setState={setState} />
      <GalleryPane state={state} setState={setState} />
      <div className="panel">
        <h3>Selection</h3>
        <div className="toolrow" style={{marginBottom:8}}>
          <button className="btn" onClick={deleteSelected}>Delete</button>
          <button className="btn" onClick={moveSelectionToNewDeck}>Move → New Deck</button>
        </div>
        <HandPane state={state} setState={setState} />
      </div>
    </div>
  )
}
