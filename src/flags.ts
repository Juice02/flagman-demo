import { useSyncExternalStore } from 'react'
import { API_URL, ENVIRONMENT, PROJECT_ID } from './api'
import type { User } from './allowlist'
import { evaluate, isSnapshot, type Reason, type Snapshot } from './evaluate'

// Flag client. A top-level page (the stage, or Book Logger opened on its own) holds one stream from
// FlagMan and evaluates flags locally. Inside the stage, each device iframe gets the stage's copy by
// postMessage instead, so a tab uses one connection: browsers allow only 6 per origin over HTTP/1.1.

type State = { snapshot: Snapshot | null; error: string | null }

let state: State = { snapshot: null, error: null }
const listeners = new Set<() => void>()
const embedded = window.parent !== window

function setState(next: State) {
  state = next
  listeners.forEach((listener) => listener())
  // Pass every update on to this page's own iframes (the stage's devices); a device has none.
  for (let i = 0; i < window.frames.length; i++) window.frames[i].postMessage(state, location.origin)
}

let started = false
function start() {
  if (started) return
  started = true

  if (embedded) {
    // Messages are untrusted input: accept only the parent page, from this origin, with the right shape.
    addEventListener('message', (e) => {
      if (e.source !== window.parent || e.origin !== location.origin) return
      const d = e.data as State
      const ok = typeof d === 'object' && d !== null && (d.snapshot === null || isSnapshot(d.snapshot))
        && (d.error === null || typeof d.error === 'string')
      if (ok) setState({ snapshot: d.snapshot, error: d.error })
    })
    window.parent.postMessage('flagman:ready', location.origin) // ask for the current state if we loaded late
    return
  }

  // Answer device iframes that load after the first snapshot arrived.
  addEventListener('message', (e) => {
    if (e.origin === location.origin && e.data === 'flagman:ready' && e.source) {
      (e.source as Window).postMessage(state, location.origin)
    }
  })

  if (PROJECT_ID === null) {
    setState({ snapshot: null, error: 'Set VITE_FLAGMAN_PROJECT_ID in .env.' })
    return
  }

  const stream = new EventSource(`${API_URL}/projects/${PROJECT_ID}/environments/${ENVIRONMENT}/stream`)
  let fresh = true // the first snapshot after a (re)connect is current, even if its revision is lower (e.g. a reset database)
  stream.onopen = () => { fresh = true }
  stream.addEventListener('snapshot', (e) => {
    let data: unknown
    try { data = JSON.parse(e.data) } catch { return }
    if (!isSnapshot(data)) return
    // Two quick changes can be broadcast out of order; keep the newest.
    if (fresh || !state.snapshot || data.revision >= state.snapshot.revision) setState({ snapshot: data, error: null })
    fresh = false
  })
  // EventSource reconnects by itself. Until then, keep the last snapshot and say FlagMan is unreachable.
  stream.onerror = () => {
    if (state.error === null) setState({ ...state, error: "Can't reach FlagMan." })
  }
}

function subscribe(listener: () => void) {
  start()
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

// The latest snapshot and connection error; re-renders on every change.
export const useFlagState = () => useSyncExternalStore(subscribe, () => state)

export function useFlag(flagKey: string, user: User): { enabled: boolean; reason: Reason | null; error: string | null } {
  const { snapshot, error } = useFlagState()
  const flag = snapshot?.flags.find((f) => f.flagKey === flagKey)
  if (!flag) return { enabled: false, reason: null, error: snapshot ? `Flag ${flagKey} not found.` : error }
  return { ...evaluate(flag, user.id, user.attributes), error }
}

export function isEnabled(flagKey: string, user: User): boolean {
  const flag = state.snapshot?.flags.find((f) => f.flagKey === flagKey)
  return flag ? evaluate(flag, user.id, user.attributes).enabled : false
}
