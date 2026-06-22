import { message } from 'antd';
import request from './request';

export interface KnowledgeReport {
  id: string;
  title: string;
  description?: string;
  report_type: string;
  doc_ids: string[];
  doc_names: string[];
  summary?: string;
  markdown_content?: string;
  model_used?: string;
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
  error_message?: string;
  is_saved_to_kb: boolean;
  saved_at?: string | null;
  completed_at?: string | null;
  created_at: string;
  updated_at: string;
  content?: {
    overview?: string;
    knowledge_system?: Array<{ topic: string; description?: string; subtopics?: string[] }>;
    document_roles?: Array<{ doc_name: string; role: string }>;
    common_concepts?: string[];
    differences?: string[];
    learning_path?: string[];
    key_points?: string[];
    source_map?: Array<{ section: string; sources: string[] }>;
  };
}

export interface KnowledgeReportShareRequest {
  id: string;
  report_id: string;
  report_title?: string;
  title: string;
  description?: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  review_comment?: string;
  created_at: string;
  reviewed_at?: string | null;
}

export interface PublicKnowledgeReport {
  id: string;
  report_id: string;
  title: string;
  description?: string;
  summary?: string;
  markdown_content?: string;
  doc_names: string[];
  content?: KnowledgeReport['content'];
  uploader?: {
    id: string;
    username: string;
  };
  view_count: number;
  download_count: number;
  created_at: string;
}

export interface PendingKnowledgeReportShareRequest {
  id: string;
  report_id: string;
  report_title: string;
  doc_names: string[];
  summary?: string;
  description?: string;
  source?: string;
  requested_at?: string;
  requester?: {
    id: string;
    username: string;
    email?: string;
  };
  created_at: string;
}

export function generateKnowledgeReport(data: {
  doc_ids: string[];
  title?: string;
  description?: string;
  model?: string;
}): Promise<KnowledgeReport> {
  return request.post('/knowledge-reports/generate', data, { timeout: 120000 });
}

export function getKnowledgeReports(savedOnly = false, keyword?: string, page = 1, pageSize = 20): Promise<{ items: KnowledgeReport[]; total: number; page: number; page_size: number }> {
  const params = new URLSearchParams({ page: String(page), page_size: String(pageSize), saved_only: String(savedOnly) });
  if (keyword) params.append('keyword', keyword);
  return request.get(`/knowledge-reports/?${params}`);
}

export function getKnowledgeReport(reportId: string): Promise<KnowledgeReport> {
  return request.get(`/knowledge-reports/${reportId}`);
}

export function saveKnowledgeReport(reportId: string): Promise<KnowledgeReport> {
  return request.post(`/knowledge-reports/${reportId}/save`);
}

export function requestKnowledgeReportShare(reportId: string, title: string, description?: string): Promise<KnowledgeReportShareRequest> {
  return request.post(`/knowledge-reports/${reportId}/share-request`, { title, description });
}

export function getMyKnowledgeReportShareRequests(page = 1, pageSize = 20): Promise<{ items: KnowledgeReportShareRequest[]; total: number; page: number; page_size: number }> {
  return request.get(`/knowledge-reports/share-requests?page=${page}&page_size=${pageSize}`);
}

export function getPendingKnowledgeReportShareRequests(page = 1, pageSize = 20): Promise<{ items: PendingKnowledgeReportShareRequest[]; total: number; page: number; page_size: number }> {
  return request.get(`/knowledge-reports/admin/pending?page=${page}&page_size=${pageSize}`);
}

export function previewPendingKnowledgeReportShareRequest(requestId: string): Promise<KnowledgeReport> {
  return request.get(`/knowledge-reports/admin/requests/${requestId}/preview`);
}

export function approveKnowledgeReportShareRequest(requestId: string, comment?: string): Promise<{ status: string; message: string }> {
  return request.post(`/knowledge-reports/admin/requests/${requestId}/approve`, { comment });
}

export function rejectKnowledgeReportShareRequest(requestId: string, comment?: string): Promise<{ status: string; message: string }> {
  return request.post(`/knowledge-reports/admin/requests/${requestId}/reject`, { comment });
}

export function getPublicKnowledgeReports(keyword?: string, page = 1, pageSize = 20): Promise<{ items: PublicKnowledgeReport[]; total: number; page: number; page_size: number }> {
  const params = new URLSearchParams({ page: String(page), page_size: String(pageSize) });
  if (keyword) params.append('keyword', keyword);
  return request.get(`/knowledge-reports/public?${params}`);
}

export function getPublicKnowledgeReport(publicReportId: string): Promise<PublicKnowledgeReport> {
  return request.get(`/knowledge-reports/public/${publicReportId}`);
}

export function recordPublicKnowledgeReportDownload(publicReportId: string): Promise<{ status: string; download_count: number }> {
  return request.post(`/knowledge-reports/public/${publicReportId}/download`);
}

export function deleteKnowledgeReport(reportId: string): Promise<{ status: string; message: string }> {
  return request.delete(`/knowledge-reports/${reportId}`);
}

export function downloadKnowledgeReport(reportId: string, format: 'markdown' | 'json' = 'markdown'): void {
  const token = localStorage.getItem('token');
  const url = `${import.meta.env.VITE_API_BASE_URL}/knowledge-reports/${reportId}/download?format=${format}`;

  fetch(url, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token || ''}`,
    },
  })
    .then((response) => {
      if (!response.ok) throw new Error('下载失败');
      const contentDisposition = response.headers.get('Content-Disposition');
      let filename = `report.${format === 'json' ? 'json' : 'md'}`;
      if (contentDisposition) {
        const match = contentDisposition.match(/filename="?([^"]+)"?/);
        if (match) filename = match[1];
      }
      return response.blob().then((blob) => ({ blob, filename }));
    })
    .then(({ blob, filename }) => {
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    })
    .catch(() => {
      message.error('下载失败，请重试');
    });
}

export function downloadPublicReport(publicReportId: string, format: 'markdown' | 'json' = 'markdown'): void {
  const token = localStorage.getItem('token');
  const url = `${import.meta.env.VITE_API_BASE_URL}/knowledge-reports/public/${publicReportId}/file?format=${format}`;

  fetch(url, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token || ''}`,
    },
  })
    .then((response) => {
      if (!response.ok) throw new Error('下载失败');
      const contentDisposition = response.headers.get('Content-Disposition');
      let filename = `report.${format === 'json' ? 'json' : 'md'}`;
      if (contentDisposition) {
        const match = contentDisposition.match(/filename="?([^"]+)"?/);
        if (match) filename = match[1];
      }
      return response.blob().then((blob) => ({ blob, filename }));
    })
    .then(({ blob, filename }) => {
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    })
    .catch(() => {
      message.error('下载失败，请重试');
    });
}
