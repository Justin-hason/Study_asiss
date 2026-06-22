import request from './request';

export interface PendingDocument {
  id: string;
  tenant_id: string;
  name: string;
  file_type: string;
  file_size: number;
  uploader_id: string;
  uploader_name?: string;
  status: string;
  source?: string;
  requested_at?: string;
  preview_available?: boolean;
  content_snippet?: string;
  created_at: string;
  updated_at: string;
}

export interface SystemConfig {
  id: string;
  key: string;
  value: string;
  description?: string;
  updated_by: string;
  updated_at: string;
}

export interface SystemStats {
  services: Record<string, string>;
  total_documents: number;
  pending_reviews: number;
  active_users: number;
  total_queries: number;
  index_size: string;
  storage_used: string;
  uptime_seconds: number;
}

export interface SensitiveWordCheck {
  content: string;
  found: boolean;
  words?: string[];
}

export interface HealthResponse {
  status: string;
  services: Record<string, string>;
}

export interface User {
  id: string;
  username: string;
  email?: string;
  role: 'user' | 'admin' | 'auditor';
  tenant_id: string;
  created_at: string;
}

// 用户管理
export function listUsers(page = 1, pageSize = 20): Promise<{ items: User[]; total: number; page: number; page_size: number }> {
  return request.get(`/admin/users?page=${page}&page_size=${pageSize}`);
}

export function createUser(data: { username: string; email: string; password: string; role?: string }): Promise<{ status: string; user: User }> {
  return request.post('/admin/users', data);
}

export function updateUserRole(userId: string, role: string): Promise<{ status: string }> {
  return request.put(`/admin/users/${userId}/role`, { role });
}

export function deleteUser(userId: string): Promise<{ status: string; message: string }> {
  return request.delete(`/admin/users/${userId}`);
}

export function listPendingDocuments(page = 1, pageSize = 20): Promise<{ items: PendingDocument[]; total: number; page: number; page_size: number }> {
  return request.get(`/admin/documents/pending?page=${page}&page_size=${pageSize}`);
}

export function reviewDocument(docId: string, data: { action: 'approve' | 'reject'; reason?: string }): Promise<{ status: string }> {
  return request.post(`/admin/documents/${docId}/review`, data);
}

export function previewPendingDocument(docId: string): Promise<Blob> {
  return request.get(`/admin/documents/${docId}/preview`, { responseType: 'blob' });
}

export function checkSensitive(docId: string): Promise<SensitiveWordCheck> {
  return request.get(`/admin/documents/${docId}/sensitive-check`);
}

export function listConfigs(): Promise<SystemConfig[]> {
  return request.get('/admin/config');
}

export function getConfig(key: string): Promise<SystemConfig> {
  return request.get(`/admin/config/${key}`);
}

export function updateConfig(data: { key: string; value: string; description?: string }): Promise<SystemConfig> {
  return request.put('/admin/config', data);
}

export function rebuildIndex(): Promise<{ status: string; message: string }> {
  return request.post('/admin/search/rebuild-index');
}

export function getSystemStats(): Promise<SystemStats> {
  return request.get('/admin/stats/system');
}

export function getHealth(): Promise<HealthResponse> {
  return request.get('/admin/health');
}

export function listSensitiveWords(): Promise<{ words: string[] }> {
  return request.get('/admin/sensitive-words');
}

export function addSensitiveWord(word: string): Promise<{ status: string }> {
  return request.post('/admin/sensitive-words', { word });
}

export function deleteSensitiveWord(word: string): Promise<{ status: string }> {
  return request.delete(`/admin/sensitive-words/${word}`);
}

export function listIndexJobs(): Promise<{ status: string }> {
  return request.get('/admin/index-jobs');
}
