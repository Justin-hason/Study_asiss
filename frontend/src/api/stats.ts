import request from './request';

export interface DashboardStats {
  total_documents: number;
  total_learn_events: number;
  total_practice_sessions: number;
  average_mastery: number;
  weekly_active_days: number;
  weekly_events: number;
  weekly_practice: number;
  total_accuracy: number;
}

export interface TrendData {
  date: string;
  events: number;
}

export function getDashboard(): Promise<DashboardStats> {
  return request.get('/stats/dashboard');
}

export function getTrends(days: number = 7): Promise<{ trends: TrendData[] }> {
  return request.get(`/stats/trends?days=${days}`);
}

export interface KnowledgeNode {
  kp_id: string;
  name: string;
  score: number;
  color: string;
}

export interface BehaviorEvent {
  id: string;
  kp_id: string;
  event_type: string;
  metadata?: any;
  created_at: string;
}

export interface BehaviorLogResponse {
  events: BehaviorEvent[];
  total: number;
  page: number;
  page_size: number;
}

export function getKnowledgeMap(): Promise<{ nodes: KnowledgeNode[] }> {
  return request.get('/stats/knowledge-map');
}

export function getBehaviorLog(
  page: number = 1,
  pageSize: number = 20,
  eventType?: string
): Promise<BehaviorLogResponse> {
  const params: any = { page, page_size: pageSize };
  if (eventType) params.event_type = eventType;
  return request.get('/stats/behavior-log', { params });
}