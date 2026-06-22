import request from './request';

export interface ShareRequest {
  id: string;
  doc_id: string;
  doc_name?: string;
  doc_size?: number;
  doc_type?: string;
  title?: string;
  description?: string;
  source?: string;
  requested_at?: string;
  preview_available?: boolean;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  review_comment?: string;
  requester?: {
    id: string;
    username: string;
    email?: string;
  };
  created_at: string;
  reviewed_at?: string;
}

export interface PublicDocument {
  id: string;
  doc_id: string;
  title: string;
  description?: string;
  extracted_knowledge?: string;
  file_type?: string;
  file_size: number;
  preview_available?: boolean;
  uploader?: {
    id: string;
    username: string;
  };
  view_count: number;
  download_count: number;
  created_at: string;
}

export interface KnowledgeExtraction {
  id: string;
  doc_id: string;
  doc_name?: string;
  summary?: string;
  key_points?: Array<{ point: string; confidence: number }>;
  entities?: string[];
  categories?: string[];
  status: 'PROCESSING' | 'COMPLETED' | 'FAILED';
  created_at: string;
  completed_at?: string;
}

// 用户分享文档请求
export function requestShare(docId: string, title: string, description?: string): Promise<ShareRequest> {
  return request.post(`/share/documents/${docId}/request`, { title, description });
}

// 获取我的分享请求
export function getMyRequests(page = 1, pageSize = 20): Promise<{ items: ShareRequest[]; total: number; page: number; page_size: number }> {
  return request.get(`/share/my-requests?page=${page}&page_size=${pageSize}`);
}

// 取消分享请求
export function cancelRequest(requestId: string): Promise<{ status: string }> {
  return request.delete(`/share/requests/${requestId}`);
}

// 获取待审核列表（管理员/审核员）
export function getPendingRequests(page = 1, pageSize = 20): Promise<{ items: ShareRequest[]; total: number; page: number; page_size: number }> {
  return request.get(`/share/admin/pending?page=${page}&page_size=${pageSize}`);
}

// 审核通过
export function approveRequest(requestId: string, comment?: string): Promise<{ status: string; message: string }> {
  return request.post(`/share/admin/requests/${requestId}/approve`, { comment });
}

// 审核拒绝
export function rejectRequest(requestId: string, comment?: string): Promise<{ status: string; message: string }> {
  return request.post(`/share/admin/requests/${requestId}/reject`, { comment });
}

// 获取公共文档列表
export function getPublicDocuments(keyword?: string, page = 1, pageSize = 20): Promise<{ items: PublicDocument[]; total: number; page: number; page_size: number }> {
  const params = new URLSearchParams({ page: String(page), page_size: String(pageSize) });
  if (keyword) params.append('keyword', keyword);
  return request.get(`/share/public?${params}`);
}

// 获取公共文档详情
export function getPublicDocument(publicDocId: string): Promise<PublicDocument> {
  return request.get(`/share/public/${publicDocId}`);
}

// 在线预览公共文档
export function previewPublicDocument(publicDocId: string): Promise<Blob> {
  return request.get(`/share/public/${publicDocId}/preview`, { responseType: 'blob' });
}

// 记录下载
export function recordDownload(publicDocId: string): Promise<{ status: string; download_count: number }> {
  return request.post(`/share/public/${publicDocId}/download`);
}

// 移除公共文档（管理员）
export function removePublicDocument(publicDocId: string): Promise<{ status: string }> {
  return request.delete(`/share/admin/public/${publicDocId}`);
}

// 上传文档进行知识提炼
export function uploadForExtraction(file: File): Promise<{ doc_id: string; extraction_id: string; filename: string; status: string }> {
  const formData = new FormData();
  formData.append('file', file);
  return request.post('/knowledge/extract/upload', formData, { timeout: 120000 });
}

// 处理知识提炼
export function processExtraction(docId: string, model?: string): Promise<KnowledgeExtraction> {
  return request.post(`/knowledge/extract/${docId}/process`, { model });
}

// 获取提炼结果
export function getExtraction(docId: string): Promise<KnowledgeExtraction> {
  return request.get(`/knowledge/extract/${docId}`);
}

// 获取我的提炼记录
export function getMyExtractions(page = 1, pageSize = 20): Promise<{ items: KnowledgeExtraction[]; total: number; page: number; page_size: number }> {
  return request.get(`/knowledge/extractions?page=${page}&page_size=${pageSize}`);
}

// 获取私有知识库
export function getPrivateKnowledge(keyword?: string, page = 1, pageSize = 20): Promise<{ items: KnowledgeExtraction[]; total: number; page: number; page_size: number }> {
  const params = new URLSearchParams({ page: String(page), page_size: String(pageSize) });
  if (keyword) params.append('keyword', keyword);
  return request.get(`/knowledge/private?${params}`);
}
