import { useEffect, useSyncExternalStore } from 'react'
import { API_URL, ApiError, request } from './api'
import { FLAGS, type User } from './allowlist'

// Flag client. Each browser gets its own sandbox: a private copy of the demo flags in FlagMan, which only
// this browser's token can change. All demo pages open in the browser (the stage, its device iframes,
// other tabs) share it and one stream: one page holds a Web Lock, gets the sandbox, opens the stream and
// passes the state to the others over a BroadcastChannel. Browsers allow only 6 connections per host over
// HTTP/1.1, so a stream per page would hang every request once six demo pages were open. When the page
// holding the lock closes, another page takes over.
//
// The stream says only that something changed (revision N), never the rules. Each device then asks FlagMan
// for its own user's flags (POST /evaluate/flags), as a browser or mobile app would in production, and
// shares the answer with the stage over a second channel, so the labels under the devices need no calls.

export type Sandbox = { projectId: number; environment: string; token: string }
type State = { sandbox: Sandbox | null; revision: number | null; error: string | null }
export type Reason = 'FLAG_DISABLED' | 'RULES_NOT_MATCHED' | 'IN_ROLLOUT' | 'OUT_OF_ROLLOUT'
type Result = { enabled: boolean; reason: Reason }
type Results = { projectId: number; userId: string; revision: number; flags: Record<string, Result> }

const UNREACHABLE = "Can't reach FlagMan."
const SANDBOX_KEY = 'flagman-sandbox'
export const startedAt = Date.now()

let state: State = { sandbox: null, revision: null, error: null }
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
      && (d.revision === null || Number.isInteger(d.revision)) && (d.error === null || typeof d.error === 'string')
    if (ok && !leader) setState({ sandbox: d.sandbox, revision: d.revision, error: d.error })
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
        const exists = await fetch(`${API_URL}/projects/${sandbox.projectId}`)
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
  const stream = new EventSource(`${base}/stream?revisionOnly=true`)
  let fresh = true // the first event after a (re)connect is current, even if its revision is lower
  stream.onopen = () => { fresh = true }
  stream.addEventListener('change', (e) => {
    let data: { projectId?: unknown; revision?: unknown }
    try { data = JSON.parse(e.data) } catch { return }
    if (data?.projectId !== sandbox.projectId || !Number.isInteger(data.revision)) return
    const revision = data.revision as number
    // Two quick changes can be broadcast out of order; keep the newest.
    if (fresh || state.revision === null || revision >= state.revision) setState({ ...state, revision, error: null })
    fresh = false
  })
  // EventSource reconnects by itself. Until then, the devices keep their last answers and say FlagMan is unreachable.
  // If the sandbox itself is gone (deleted after a day unused), start over with a new one.
  // The browser stops retrying for good after an error answer (e.g. a 502 while Render restarts or wakes
  // up); then reopen the stream ourselves.
  stream.onerror = () => {
    if (state.error === null) setState({ ...state, error: UNREACHABLE })
    const gaveUp = stream.readyState === EventSource.CLOSED
    const reopen = () => { if (gaveUp) setTimeout(() => openStream(sandbox), 3_000) }
    fetch(`${API_URL}/projects/${sandbox.projectId}`).then((res) => {
      if (res.status !== 404) return reopen()
      stream.close()
      storeSandbox(null)
      setState({ sandbox: null, revision: null, error: null })
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

// The sandbox, latest revision and connection error; re-renders on every change.
export const useFlagState = () => useSyncExternalStore(subscribe, getFlagState)

export const isUnreachable = (error: string | null) => error === UNREACHABLE

// --- Answers from FlagMan, per user. Shared between pages, so the stage shows what each device got.

let results: Record<string, Results> = {}
const resultListeners = new Set<() => void>()
const resultChannel = new BroadcastChannel('flagman-results-v1')
const REASONS: readonly string[] = ['FLAG_DISABLED', 'RULES_NOT_MATCHED', 'IN_ROLLOUT', 'OUT_OF_ROLLOUT']

const isResults = (x: unknown): x is Results => {
  const r = x as Results
  return typeof r === 'object' && r !== null && Number.isInteger(r.projectId) && typeof r.userId === 'string'
    && Number.isInteger(r.revision) && isFlags(r.flags)
}
function isFlags(x: unknown): x is Record<string, Result> {
  const f = x as Record<string, Result>
  return typeof f === 'object' && f !== null && FLAGS.every((k) =>
    typeof f[k]?.enabled === 'boolean' && REASONS.includes(f[k].reason))
}

// Keeps the newest answer per user. A new sandbox starts its revisions again, so compare within one sandbox only.
function storeResults(r: Results) {
  const old = results[r.userId]
  if (old && old.projectId === r.projectId && old.revision > r.revision) return
  results = { ...results, [r.userId]: r }
  resultListeners.forEach((l) => l())
}
resultChannel.onmessage = (e) => { if (isResults(e.data)) storeResults(e.data) }

let latestAsk = 0 // answers to older asks are dropped, so a slow answer can't overwrite a newer one

// Asks FlagMan for every demo flag for this user. Hidden tabs wait until they are shown (see useEvaluate).
async function ask(user: User) {
  const { sandbox, revision } = state
  if (!sandbox || revision === null || document.hidden) return
  const mine = ++latestAsk
  try {
    const flags = await request<unknown>('/evaluate/flags', 'POST', {
      projectId: sandbox.projectId, environment: sandbox.environment,
      userId: user.id, attributes: user.attributes, flagKeys: FLAGS,
    })
    if (mine !== latestAsk) return
    if (!isFlags(flags)) throw new ApiError('Unexpected answer from FlagMan.')
    const r: Results = { projectId: sandbox.projectId, userId: user.id, revision, flags }
    storeResults(r)
    resultChannel.postMessage(r)
  } catch {
    // Keep the last answer on screen (the stream's note says if FlagMan is unreachable) and try again.
    setTimeout(() => { if (mine === latestAsk) void ask(user) }, 3_000)
  }
}

// For a device page: asks on load and after every change, and when a hidden tab is shown again.
export function useEvaluate(user: User) {
  const { sandbox, revision } = useFlagState()
  useEffect(() => { void ask(user) }, [user, sandbox?.projectId, revision])
  useEffect(() => {
    const onShow = () => {
      const r = results[user.id]
      if (!document.hidden && (r?.projectId !== state.sandbox?.projectId || (r?.revision ?? -1) < (state.revision ?? -1))) void ask(user)
    }
    document.addEventListener('visibilitychange', onShow)
    return () => document.removeEventListener('visibilitychange', onShow)
  }, [user])
}

function subscribeResults(listener: () => void) {
  resultListeners.add(listener)
  return () => { resultListeners.delete(listener) }
}

// FlagMan's latest answer for this user and flag; makes no request itself (useEvaluate does).
export function useFlag(flagKey: string, user: User): { enabled: boolean; reason: Reason | null; error: string | null } {
  const { error } = useFlagState()
  const r = useSyncExternalStore(subscribeResults, () => results[user.id])
  const flag = r?.flags[flagKey]
  return { enabled: flag?.enabled ?? false, reason: flag?.reason ?? null, error }
}
