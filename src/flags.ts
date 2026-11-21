import { useSyncExternalStore } from 'react'
import { API_URL, ENVIRONMENT, PROJECT_ID } from './api'
import type { User } from './allowlist'
import { evaluate, isSnapshot, type Reason, type Snapshot } from './evaluate'

// Flag client. All demo pages open in this browser (the stage, its device iframes, other tabs) share one
// stream from FlagMan: one page holds a Web Lock, opens the stream and passes each snapshot to the others
// over a BroadcastChannel. Browsers allow only 6 connections per host over HTTP/1.1, so one stream per
// page would hang every request to FlagMan once six demo pages were open. When the page holding the
// lock closes, the lock passes to another page, which opens the stream. Flags are evaluated locally.

type State = { snapshot: Snapshot | null; error: string | null }

let state: State = { snapshot: null, error: null }
let leader = false
const listeners = new Set<() => void>()
const NAME = `flagman:${PROJECT_ID}:${ENVIRONMENT}`
const channel = new BroadcastChannel(NAME)

function setState(next: State) {
  state = next
  listeners.forEach((listener) => listener())
  if (leader) channel.postMessage(state) // the sender doesn't receive its own message
}

let started = false
function start() {
  if (started) return
  started = true

  // Same-origin pages only, but still checked before use like any other input.
  channel.onmessage = (e) => {
    if (e.data === 'ready') {
      if (leader) channel.postMessage(state) // a page that opened later asks for the current state
      return
    }
    const d = e.data as State
    const ok = typeof d === 'object' && d !== null && (d.snapshot === null || isSnapshot(d.snapshot))
      && (d.error === null || typeof d.error === 'string')
    if (ok && !leader) setState({ snapshot: d.snapshot, error: d.error })
  }
  channel.postMessage('ready')

  const lead = () => {
    leader = true
    openStream()
  }
  // Web Locks need a secure context (HTTPS or localhost); without them every page streams on its own.
  if (navigator.locks) navigator.locks.request(NAME, () => new Promise(() => lead())) // held until the page closes
  else lead()
}

function openStream() {
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
