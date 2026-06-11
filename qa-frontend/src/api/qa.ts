import { SignJWT } from 'jose'
import type { AskRequest, SessionHistory, SourceRef } from '../types'

const API_BASE = 'http://localhost:8002'
const JWT_SECRET = 'dev-secret-change-in-production'
const JWT_SECRET_KEY = new TextEncoder().encode(JWT_SECRET)

async function generateToken(): Promise<string> {
  return new SignJWT({
    user_id: 'dev-user',
    tenant_id: 'dev-tenant',
    role: 'admin',
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(JWT_SECRET_KEY)
}

async function request<T>(
  path: string,
  options?: RequestInit,
): Promise<T> {
  const token = await generateToken()
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...options?.headers,
    },
  })

  if (!res.ok) {
    let msg = `HTTP ${res.status}`
    try {
      const body = await res.json()
      msg = body?.error?.message ?? msg
    } catch {
      msg = res.statusText || msg
    }
    throw new Error(msg)
  }

  const text = await res.text()
  if (!text) return undefined as T
  return JSON.parse(text) as T
}

export async function askQuestion(
  req: AskRequest,
  onToken: (token: string) => void,
  onDone: (sessionId: string, answer: string, sources: SourceRef[]) => void,
  onError: (error: string) => void,
): Promise<AbortController> {
  const controller = new AbortController()
  const token = await generateToken()

  const body = JSON.stringify({
    session_id: req.session_id,
    query: req.query,
    stream: true,
  })

  try {
    const res = await fetch(`${API_BASE}/api/v1/qa/ask`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        Accept: 'text/event-stream',
      },
      body,
      signal: controller.signal,
    })

    if (!res.ok) {
      let msg = `HTTP ${res.status}`
      try {
        const errBody = await res.json()
        msg = errBody?.error?.message ?? msg
      } catch { /* ignore */ }
      onError(msg)
      return controller
    }

    const reader = res.body?.getReader()
    if (!reader) {
      onError('Response body is not readable')
      return controller
    }

    const decoder = new TextDecoder()
    let buffer = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''

      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed.startsWith('data: ')) continue
        const data = trimmed.slice(6)
        try {
          const event = JSON.parse(data)
          switch (event.type) {
            case 'token':
              onToken(event.content || '')
              break
            case 'done':
              if (event.result) {
                onDone(
                  event.result.session_id,
                  event.result.answer?.answer || '',
                  event.result.answer?.sources || [],
                )
              }
              break
            case 'error':
              onError(event.error || 'Unknown error')
              break
          }
        } catch { /* skip malformed JSON */ }
      }
    }
  } catch (err: unknown) {
    if (err instanceof Error && err.name === 'AbortError') return controller
    onError(err instanceof Error ? err.message : 'Network error')
  }

  return controller
}

export async function getHistory(sessionId: string): Promise<SessionHistory> {
  return request<SessionHistory>(
    `/api/v1/qa/history?session_id=${encodeURIComponent(sessionId)}`,
  )
}

export async function deleteHistory(sessionId: string): Promise<void> {
  return request<void>(
    `/api/v1/qa/history?session_id=${encodeURIComponent(sessionId)}`,
    { method: 'DELETE' },
  )
}
