import { useSyncExternalStore } from 'react'
import { API_URL, ApiError, request } from './api'
import type { User } from './allowlist'
import { evaluate, isSnapshot, type Reason, type Snapshot } from './evaluate'

// Flag client. Each browser gets its own sandbox: a private copy of the demo flags in FlagMan, which only
// this browser's token can change. All demo pages open in the browser (the stage, its device iframes,
// other tabs) share it and one stream: one page holds a Web Lock, gets the sandbox, opens the stream and
// passes the state to the others over a BroadcastChannel. Browsers allow only 6 connections per host over
// HTTP/1.1, so a stream per page would hang every request once six demo pages were open. When the page
// holding the lock closes, another page takes over. Flags are evaluated locally (evaluate.ts).

export type Sandbox = { projectId: number; environment: string; token: string }
type State = { sandbox: Sandbox | null; snapshot: Snapshot | null; error: string | null }

const UNREACHABLE = "Can't reach FlagMan."
const SANDBOX_KEY = 'flagman-sandbox'
export const startedAt = Date.now()

let state: State = { sandbox: null, snapshot: null, error: null }
let leader = false
const listeners = new Set<() => void>()
const channel = new BroadcastChannel('flagman-flags-v2') // bump the version when the message shape changes, so old tabs and new ones don't wait on each other

const isSandbox = (x: unknown): x is Sandbox => {
  const s = x as Sandbox
  return typeof s === 'object' && s !== null && Number.isInteger(s.projectId)
    && typeof s.environment === 'string' && /^[A-Z]+$/.test(s.environment)
    && typeof s.token === 'string' && /^[A-Za-z0-9_-]{20,100}$/.test(s.token)
}

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
    const ok = typeof d === 'object' && d !== null && (d.sandbox === null || isSandbox(d.sandbox))
      && (d.snapshot === null || isSnapshot(d.snapshot)) && (d.error === null || typeof d.error === 'string')
    if (ok && !leader) setState({ sandbox: d.sandbox, snapshot: d.snapshot, error: d.error })
  }
  channel.postMessage('ready')

  const lead = () => {
    leader = true
    void connect()
  }
  // Web Locks need a secure context (HTTPS or localhost); without them every page connects on its own.
  if (navigator.locks) navigator.locks.request('flagman-stream-v2', () => new Promise(() => lead())) // held until the page closes
  else lead()
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

function readStoredSandbox(): Sandbox | null {
  try {
    const s: unknown = JSON.parse(localStorage.getItem(SANDBOX_KEY) ?? 'null')
    return isSandbox(s) ? s : null
  } catch {
    return null
  }
}

function storeSandbox(s: Sandbox | null) {
  try {
    if (s) localStorage.setItem(SANDBOX_KEY, JSON.stringify(s))
    else localStorage.removeItem(SANDBOX_KEY)
  } catch { /* storage blocked: the sandbox lasts until the page closes */ }
}

// Finds this browser's sandbox (or makes one) and opens its stream. While the server is asleep or
// starting, requests fail; keep retrying, and the page shows a "starting" message meanwhile.
async function connect() {
  for (;;) {
    try {
      let sandbox = readStoredSandbox()
      if (sandbox) {
        // Sandboxes unused for a day are deleted; then make a new one.
        const exists = await fetch(`${API_URL}/projects/${sandbox.projectId}/environments/${sandbox.environment}/snapshot`)
        if (exists.status === 404) sandbox = null
        else if (!exists.ok) throw new ApiError(`Request failed (${exists.status}).`, exists.status)
      }
      if (!sandbox) {
        const created = await request<unknown>('/sandboxes', 'POST')
        if (!isSandbox(created)) throw new ApiError('Unexpected answer from FlagMan.')
        sandbox = created
        storeSandbox(sandbox)
      }
      setState({ ...state, sandbox })
      openStream(sandbox)
      return
    } catch (e) {
      // A refusal with a reason (e.g. "The demo is busy") is shown and retried slowly; no answer is retried soon.
      const reason = e instanceof ApiError && e.status !== null && e.status < 500 ? e.message : null
      if (reason) setState({ ...state, error: reason })
      await sleep(reason ? 30_000 : 3_000)
    }
  }
}

function openStream(sandbox: Sandbox) {
  const base = `${API_URL}/projects/${sandbox.projectId}/environments/${sandbox.environment}`
  const stream = new EventSource(`${base}/stream`)
  let fresh = true // the first snapshot after a (re)connect is current, even if its revision is lower
  stream.onopen = () => { fresh = true }
  stream.addEventListener('snapshot', (e) => {
    let data: unknown
    try { data = JSON.parse(e.data) } catch { return }
    if (!isSnapshot(data) || data.projectId !== sandbox.projectId) return
    // Two quick changes can be broadcast out of order; keep the newest.
    if (fresh || !state.snapshot || data.revision >= state.snapshot.revision) setState({ ...state, snapshot: data, error: null })
    fresh = false
  })
  // EventSource reconnects by itself. Until then, keep the last snapshot and say FlagMan is unreachable.
  // If the sandbox itself is gone (deleted after a day unused), start over with a new one.
  // The browser stops retrying for good after an error answer (e.g. a 502 while Render restarts or wakes
  // up); then reopen the stream ourselves.
  stream.onerror = () => {
    if (state.error === null) setState({ ...state, error: UNREACHABLE })
    const gaveUp = stream.readyState === EventSource.CLOSED
    const reopen = () => { if (gaveUp) setTimeout(() => openStream(sandbox), 3_000) }
    fetch(`${base}/snapshot`).then((res) => {
      if (res.status !== 404) return reopen()
      stream.close()
      storeSandbox(null)
      setState({ sandbox: null, snapshot: null, error: null })
      void connect()
    }, reopen)
  }
}

function subscribe(listener: () => void) {
  start()
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

export const getFlagState = () => state

// The sandbox, latest snapshot and connection error; re-renders on every change.
export const useFlagState = () => useSyncExternalStore(subscribe, getFlagState)

export const isUnreachable = (error: string | null) => error === UNREACHABLE

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
