// The API address and one fetch helper. Every VITE_ variable is bundled into the page that visitors
// download, so none of them may hold a key, token or password.
export const API_URL: string = import.meta.env.VITE_FLAGMAN_API_URL || 'http://localhost:8081'

export class ApiError extends Error {
  readonly status: number | null
  constructor(message: string, status: number | null = null) {
    super(message)
    this.status = status
  }
}

// Errors become short messages: the API's RFC 9457 `detail`, or a fixed line. Never the raw response.
export async function request<T>(path: string, method = 'GET', body?: unknown, headers: Record<string, string> = {}): Promise<T> {
  let res: Response
  try {
    res = await fetch(API_URL + path, {
      method,
      headers: { ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  } catch {
    throw new ApiError("Can't reach FlagMan.")
  }
  if (!res.ok) {
    const problem = await res.json().catch(() => null)
    throw new ApiError(typeof problem?.detail === 'string' ? problem.detail : `Request failed (${res.status}).`, res.status)
  }
  return (res.status === 204 ? undefined : await res.json()) as T
}
