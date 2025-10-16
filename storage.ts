import { set, get, del } from 'idb-keyval'
import type { AppState } from './types'

const KEY = 'card-gallery-pro:v1'

export async function saveState(state: AppState) {
  await set(KEY, state)
}

export async function loadState(): Promise<AppState | null> {
  return (await get(KEY)) as AppState | null
}

export async function purge() {
  await del(KEY)
}
