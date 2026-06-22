import request from './request';

export interface AskRequest {
  query: string;
  session_id?: string;
  model?: string;
  contexts?: ContextItem[];
  stream?: boolean;
}

export interface ContextItem {
  source: string;
  page: number;
  content: string;
  score?: number;
}

export interface SourceRef {
  source: string;
  page: number;
  score?: number;
}

export interface AnswerBody {
  answer: string;
  sources: SourceRef[];
}

export interface AskResponse {
  session_id: string;
  answer: AnswerBody;
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

export interface SessionHistory {
  session_id: string;
  messages: ChatMessage[];
}

export function askQuestion(data: AskRequest): Promise<AskResponse> {
  return request.post('/generate/qa/ask', data);
}

export function getHistory(sessionId: string): Promise<SessionHistory> {
  return request.get(`/generate/qa/history?session_id=${sessionId}`);
}

export function deleteHistory(sessionId: string): Promise<void> {
  return request.delete(`/generate/qa/history/${sessionId}`);
}
