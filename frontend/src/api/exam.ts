import request from './request';

export interface WrongQuestion {
  id: string;
  question_text: string;
  original_answer?: string;
  correct_answer?: string;
  analysis?: string;
  source_doc_id?: string;
  source_page?: number;
  knowledge_points?: string[];
  difficulty: number;
  review_count: number;
  last_review_time?: string;
  status: 'NEW' | 'REVIEWING' | 'MASTERED';
  created_at: string;
}

export interface WrongQuestionListResponse {
  items: WrongQuestion[];
  total: number;
  page: number;
  page_size: number;
}

export interface AddWrongQuestionParams {
  question_text: string;
  original_answer?: string;
  correct_answer?: string;
  analysis?: string;
  source_doc_id?: string;
  source_page?: number;
  knowledge_points?: string[];
  difficulty?: number;
}

export interface UpdateWrongQuestionParams {
  original_answer?: string;
  correct_answer?: string;
  analysis?: string;
  status?: 'NEW' | 'REVIEWING' | 'MASTERED';
}

export function getWrongQuestions(
  page: number = 1,
  pageSize: number = 20,
  status?: string
): Promise<WrongQuestionListResponse> {
  const params: any = { page, page_size: pageSize };
  if (status) params.status = status;
  return request.get('/exam/wrong-book', { params });
}

export function addWrongQuestion(params: AddWrongQuestionParams): Promise<WrongQuestion> {
  return request.post('/exam/wrong-book', params);
}

export function updateWrongQuestion(id: string, params: UpdateWrongQuestionParams): Promise<WrongQuestion> {
  return request.put(`/exam/wrong-book/${id}`, params);
}

export function deleteWrongQuestion(id: string): Promise<void> {
  return request.delete(`/exam/wrong-book/${id}`);
}

export function searchQuestions(query: string, topK: number = 10): Promise<any> {
  return request.post('/exam/search', null, { params: { query, top_k: topK } });
}

export function getSimilarQuestions(questionId: string, topK: number = 5): Promise<any> {
  return request.post('/exam/similar', null, { params: { question_id: questionId, top_k: topK } });
}

export function generateStudyPlan(subject: string, durationDays: number = 30): Promise<any> {
  return request.post('/exam/plan', null, { params: { subject, duration_days: durationDays } });
}

// ========== 练习功能 ==========

export interface PracticeQuestion {
  id: string;
  question_text: string;
  question_type: string;
  options?: { label: string; text: string }[];
  knowledge_point?: string;
  difficulty: number;
}

export interface StartPracticeParams {
  source_type?: string;
  source_id?: string;
  question_count?: number;
  title?: string;
}

export interface StartPracticeResponse {
  session_id: string;
  title: string;
  question_count: number;
  questions: PracticeQuestion[];
}

export interface SubmitAnswerParams {
  session_id: string;
  question_id: string;
  user_answer: string;
  time_spent?: number;
}

export interface SubmitAnswerResponse {
  record_id: string;
  is_correct: boolean;
  correct_answer: string;
  user_answer: string;
  analysis: string;
  score: number;
  knowledge_point?: string;
  session_progress: {
    question_count: number;
    answered_count: number;
    correct_count: number;
  };
}

export interface PracticeSession {
  id: string;
  title: string;
  question_count: number;
  correct_count: number;
  accuracy: number;
  source_type: string;
  completed_at?: string;
  created_at: string;
}

export interface PracticeHistoryResponse {
  items: PracticeSession[];
  total: number;
  page: number;
  page_size: number;
}

export interface PracticeDetail {
  session_id: string;
  title: string;
  status: string;
  question_count: number;
  correct_count: number;
  accuracy: number;
  questions: (PracticeQuestion & {
    correct_answer: string;
    analysis: string;
    user_answer?: string;
    is_correct?: boolean;
  })[];
  created_at: string;
  completed_at?: string;
}

export function startPractice(params: StartPracticeParams): Promise<StartPracticeResponse> {
  return request.post('/exam/practice/start', params);
}

export function submitAnswer(params: SubmitAnswerParams): Promise<SubmitAnswerResponse> {
  return request.post('/exam/practice/submit', params);
}

export function completePractice(sessionId: string): Promise<any> {
  return request.post(`/exam/practice/${sessionId}/complete`);
}

export function getPracticeHistory(page: number = 1, pageSize: number = 20): Promise<PracticeHistoryResponse> {
  return request.get('/exam/practice/history', { params: { page, page_size: pageSize } });
}

export function getPracticeDetail(sessionId: string): Promise<PracticeDetail> {
  return request.get(`/exam/practice/${sessionId}`);
}
