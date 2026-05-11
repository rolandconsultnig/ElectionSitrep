/**
 * HTTP "ping" to the Election SitRep API — measures round-trip to GET /api/health.
 * (True ICMP ping is not available from JS; this is the standard app-level check.)
 */

export type PingApiResult = {
  ok: boolean
  /** Round-trip time in ms when a response was received */
  latencyMs: number | null
  httpStatus?: number
  /** Short human message */
  message: string
  bodyPreview?: string
}

function trimBase(url: string) {
  return url.replace(/\/+$/, '')
}

const DEFAULT_TIMEOUT_MS = 15_000

/**
 * Ping `GET {baseUrl}/api/health` with optional abort timeout.
 */
export async function pingApiHealth(baseUrl: string, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<PingApiResult> {
  const base = trimBase(baseUrl.trim())
  if (!base) {
    return { ok: false, latencyMs: null, message: 'Server URL is empty.' }
  }

  const url = `${base}/api/health`
  const controller = new AbortController()
  const started = Date.now()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const res = await fetch(url, {
      method: 'GET',
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    })
    const latencyMs = Date.now() - started
    clearTimeout(timer)
    const text = await res.text()
    const bodyPreview = text.slice(0, 160)

    if (!res.ok) {
      return {
        ok: false,
        latencyMs,
        httpStatus: res.status,
        message: `HTTP ${res.status} — server responded but health check failed.`,
        bodyPreview,
      }
    }

    const looksJson = text.trim().startsWith('{')
    const hasOk =
      looksJson && (text.includes('"ok":true') || text.includes('"ok": true'))
    if (!hasOk) {
      return {
        ok: false,
        latencyMs,
        httpStatus: res.status,
        message: 'Unexpected response (not API health JSON).',
        bodyPreview,
      }
    }

    return {
      ok: true,
      latencyMs,
      httpStatus: res.status,
      message: `Reachable in ${latencyMs} ms`,
      bodyPreview,
    }
  } catch (e) {
    clearTimeout(timer)
    const name = e instanceof Error ? e.name : ''
    const msg = e instanceof Error ? e.message : String(e)
    if (name === 'AbortError' || msg.includes('aborted')) {
      return {
        ok: false,
        latencyMs: null,
        message: `Timed out after ${timeoutMs / 1000}s — check IP, port ${base.includes('https') ? '(HTTPS)' : '(HTTP)'}, firewall, and that the API is running.`,
      }
    }
    return {
      ok: false,
      latencyMs: null,
      message: `Cannot reach server: ${msg}`,
    }
  }
}
