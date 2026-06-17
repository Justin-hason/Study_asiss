import { useState, useCallback, useEffect, useRef } from 'react'
import { v4 as uuidv4 } from 'uuid'
import Sidebar from './components/Sidebar'
import ChatMessage from './components/ChatMessage'
import ChatInput from './components/ChatInput'
import { askQuestion, getHistory, deleteHistory as apiDeleteHistory } from './api/qa'
import type { ChatMessage as ChatMessageType, SessionMeta } from './types'

const STORAGE_KEY = 'qa-sessions'

function loadSessions(): SessionMeta[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

function saveSessions(sessions: SessionMeta[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions))
}

export default function App() {
  const [sessions, setSessions] = useState<SessionMeta[]>(loadSessions)
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null)
  const [messages, setMessages] = useState<ChatMessageType[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [])

  useEffect(() => {
    scrollToBottom()
  }, [messages, scrollToBottom])

  useEffect(() => {
    if (!activeSessionId) return
    getHistory(activeSessionId)
      .then((data) => {
        const mapped: ChatMessageType[] = (data.messages || []).map((m) => ({
          role: m.role as 'user' | 'assistant',
          content: m.content,
          timestamp: new Date(m.timestamp).getTime(),
        }))
        setMessages(mapped)
      })
      .catch(() => {
        setMessages([])
      })
  }, [activeSessionId])

  const ensureSession = useCallback((): string => {
    if (activeSessionId) return activeSessionId
    const id = uuidv4()
    const newSession: SessionMeta = { id, title: '新会话', updatedAt: Date.now() }
    setSessions((prev) => {
      const updated = [newSession, ...prev]
      saveSessions(updated)
      return updated
    })
    setActiveSessionId(id)
    setMessages([])
    return id
  }, [activeSessionId])

  const handleNewSession = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort()
      abortRef.current = null
    }
    setLoading(false)
    setError(null)
    const id = uuidv4()
    const newSession: SessionMeta = { id, title: '新会话', updatedAt: Date.now() }
    setSessions((prev) => {
      const updated = [newSession, ...prev]
      saveSessions(updated)
      return updated
    })
    setActiveSessionId(id)
    setMessages([])
  }, [])

  const handleSelectSession = useCallback(
    (id: string) => {
      if (abortRef.current) {
        abortRef.current.abort()
        abortRef.current = null
      }
      setLoading(false)
      setError(null)
      setActiveSessionId(id)
    },
    [],
  )

  const handleDeleteSession = useCallback(
    (id: string) => {
      apiDeleteHistory(id).catch(() => {})
      setSessions((prev) => {
        const updated = prev.filter((s) => s.id !== id)
        saveSessions(updated)
        return updated
      })
      if (activeSessionId === id) {
        setActiveSessionId(null)
        setMessages([])
      }
    },
    [activeSessionId],
  )

  const updateSessionTitle = useCallback((sessionId: string, firstQuery: string) => {
    const title = firstQuery.length > 30
      ? firstQuery.slice(0, 30) + '...'
      : firstQuery
    setSessions((prev) => {
      const updated = prev.map((s) =>
        s.id === sessionId ? { ...s, title, updatedAt: Date.now() } : s,
      )
      saveSessions(updated)
      return updated
    })
  }, [])

  const handleSend = useCallback(
    async (text: string) => {
      const sessionId = ensureSession()
      setError(null)

      const userMessage: ChatMessageType = {
        role: 'user',
        content: text,
        timestamp: Date.now(),
      }

      const assistantMessage: ChatMessageType = {
        role: 'assistant',
        content: '',
        timestamp: Date.now(),
        sources: [],
      }

      setMessages((prev) => {
        const isFirstMessage = prev.length === 0
        if (isFirstMessage) {
          updateSessionTitle(sessionId, text)
        }
        return [...prev, userMessage, assistantMessage]
      })
      setLoading(true)

      const controller = await askQuestion(
        { session_id: sessionId, query: text, stream: true },
        (token) => {
          setMessages((prev) => {
            const updated = [...prev]
            const last = updated[updated.length - 1]
            if (last?.role === 'assistant') {
              updated[updated.length - 1] = {
                ...last,
                content: last.content + token,
              }
            }
            return updated
          })
        },
        (_sessionId, answer, sources) => {
          setMessages((prev) => {
            const updated = [...prev]
            const lastIdx = updated.length - 1
            if (updated[lastIdx]?.role === 'assistant') {
              updated[lastIdx] = {
                ...updated[lastIdx],
                content: answer,
                sources,
              }
            }
            setSessions((prevSessions) => {
              const updatedSessions = prevSessions.map((s) =>
                s.id === sessionId ? { ...s, updatedAt: Date.now() } : s,
              )
              saveSessions(updatedSessions)
              return updatedSessions
            })
            return updated
          })
          setLoading(false)
        },
        (errMsg) => {
          setMessages((prev) => {
            const updated = [...prev]
            const lastIdx = updated.length - 1
            if (updated[lastIdx]?.role === 'assistant') {
              updated[lastIdx] = {
                ...updated[lastIdx],
                content: `**错误**: ${errMsg}`,
              }
            }
            return updated
          })
          setError(errMsg)
          setLoading(false)
        },
      )

      abortRef.current = controller
    },
    [ensureSession, updateSessionTitle],
  )

  const handleRetry = useCallback(() => {
    if (messages.length >= 2) {
      const lastUserMsg = [...messages].reverse().find((m) => m.role === 'user')
      if (lastUserMsg) {
        setMessages((prev) => prev.slice(0, -1))
        handleSend(lastUserMsg.content)
      }
    }
  }, [messages, handleSend])

  return (
    <div
      style={{
        display: 'flex',
        height: '100vh',
        fontFamily:
          '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
      }}
    >
      <Sidebar
        sessions={sessions}
        activeSessionId={activeSessionId}
        onSelect={handleSelectSession}
        onNew={handleNewSession}
        onDelete={handleDeleteSession}
      />

      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          height: '100%',
          overflow: 'hidden',
        }}
      >
        {!activeSessionId ? (
          <div
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#9ca3af',
              fontSize: '16px',
              gap: '12px',
            }}
          >
            <div style={{ fontSize: '48px', opacity: 0.3 }}>💬</div>
            <div>选择一个会话或新建会话开始提问</div>
          </div>
        ) : (
          <>
            <div
              style={{
                flex: 1,
                overflowY: 'auto',
                padding: '20px',
                background: '#ffffff',
              }}
            >
              <div style={{ maxWidth: '800px', margin: '0 auto' }}>
                {messages.length === 0 && (
                  <div
                    style={{
                      textAlign: 'center',
                      color: '#9ca3af',
                      marginTop: '64px',
                      fontSize: '15px',
                    }}
                  >
                    开始你的第一个问题吧
                  </div>
                )}

                {messages.map((msg, i) => (
                  <ChatMessage
                    key={i}
                    message={msg}
                    streaming={
                      loading &&
                      i === messages.length - 1 &&
                      msg.role === 'assistant'
                    }
                  />
                ))}

                {error && (
                  <div
                    style={{
                      textAlign: 'center',
                      marginTop: '12px',
                    }}
                  >
                    <button
                      onClick={handleRetry}
                      style={{
                        padding: '6px 16px',
                        borderRadius: '8px',
                        border: '1px solid #d1d5db',
                        background: '#fff',
                        color: '#374151',
                        fontSize: '13px',
                        cursor: 'pointer',
                      }}
                    >
                      重试
                    </button>
                  </div>
                )}

                <div ref={messagesEndRef} />
              </div>
            </div>

            <ChatInput onSend={handleSend} loading={loading} />
          </>
        )}
      </div>
    </div>
  )
}
