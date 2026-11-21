// Settings from .env and one fetch helper. Every VITE_ variable is bundled into the page that
// visitors download, so none of them may hold a key, token or password.
const env = import.meta.env
const ENVIRONMENTS = ['DEV', 'STAGING', 'PREPROD', 'PROD']

export const API_URL: string = env.VITE_FLAGMAN_API_URL || 'http://localhost:8081'
const id = Number(env.VITE_FLAGMAN_PROJECT_ID)
export const PROJECT_ID: number | null = Number.isInteger(id) && id > 0 ? id : null
export const ENVIRONMENT: string = ENVIRONMENTS.includes(env.VITE_FLAGMAN_ENVIRONMENT) ? env.VITE_FLAGMAN_ENVIRONMENT : 'DEV'

export class ApiError extends Error {}

// Errors become short messages: the API's RFC 9457 `detail`, or a fixed line. Never the raw response.
export async function request<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
  let res: Response
  try {
    res = await fetch(API_URL + path, {
      method,
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  } catch {
    throw new ApiError("Can't reach FlagMan.")
  }
  if (!res.ok) {
    const problem = await res.json().catch(() => null)
    throw new ApiError(typeof problem?.detail === 'string' ? problem.detail : `Request failed (${res.status}).`)
  }
  return (res.status === 204 ? undefined : await res.json()) as T
}
