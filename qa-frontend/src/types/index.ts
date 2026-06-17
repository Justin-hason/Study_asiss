export interface SourceRef {
  source: string
  page: number
  score?: number
}

export interface AnswerBody {
  answer: string
  reasoning?: string
  keywords?: string[]
  sources: SourceRef[]
}

export interface AskResponse {
  session_id: string
  answer: AnswerBody
}

export interface SSEEvent {
  type: 'token' | 'done' | 'error'
  content?: string
  result?: AskResponse
  error?: string
}

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  timestamp: number
  sources?: SourceRef[]
}

export interface SessionMeta {
  id: string
  title: string
  updatedAt: number
}

export interface AskRequest {
  session_id: string
  query: string
  model?: string
  stream?: boolean
}

export interface HistoryMessage {
  role: string
  content: string
  timestamp: string
}

export interface SessionHistory {
  session_id: string
  messages: HistoryMessage[]
}

export interface ApiError {
  error: {
    code: string
    message: string
  }
}
