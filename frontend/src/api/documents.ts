import request from './request';

export interface Document {
  id: string;
  name: string;
  mime_type?: string;
  size: number;
  status: string;
  folder_id?: string;
  created_at: string;
  updated_at: string;
  can_generate_report?: boolean;
  report_block_reason?: string | null;
  preview_available?: boolean;
  summary?: string;
  extraction_status?: string;
}

export interface UploadInitResult {
  upload_id: string;
  doc_id: string;
  chunk_size: number;
}

export interface UploadCompleteResult {
  doc_id: string;
  status: string;
  can_generate_report: boolean;
  preview_available?: boolean;
}

export interface UploadDocumentOptions {
  folderId?: string;
  onProgress?: (percent: number) => void;
  onFinalize?: () => void;
}

const UPLOAD_REQUEST_TIMEOUT = 120000;

// 获取文档列表
export function listDocuments(folderId?: string, page = 1, pageSize = 20): Promise<{ items: Document[]; total: number; page: number; page_size: number }> {
  const params = new URLSearchParams({ page: String(page), page_size: String(pageSize) });
  if (folderId) params.append('folder_id', folderId);
  return request.get(`/documents/?${params}`);
}

// 初始化上传
export function initUpload(filename: string, folderId?: string, totalSize = 0): Promise<UploadInitResult> {
  return request.post('/documents/upload/init', null, {
    params: { filename, folder_id: folderId, total_size: totalSize },
    timeout: UPLOAD_REQUEST_TIMEOUT,
  });
}

// 上传分块
export function uploadChunk(uploadId: string, chunkIndex: number, chunk: Blob): Promise<{ upload_id: string; chunk_index: number; size: number; status: string }> {
  const formData = new FormData();
  formData.append('chunk', chunk);
  return request.post(`/documents/upload/${uploadId}/chunks`, formData, {
    params: { chunk_index: chunkIndex },
    timeout: UPLOAD_REQUEST_TIMEOUT,
  });
}

// 完成上传
export function completeUpload(uploadId: string, docId: string): Promise<UploadCompleteResult> {
  return request.post(`/documents/upload/${uploadId}/complete`, null, {
    params: { doc_id: docId },
    timeout: UPLOAD_REQUEST_TIMEOUT,
  });
}

export async function uploadDocument(file: File, options: UploadDocumentOptions = {}): Promise<UploadCompleteResult> {
  const initResult = await initUpload(file.name, options.folderId, file.size);
  const totalChunks = Math.max(1, Math.ceil(file.size / initResult.chunk_size));

  for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex += 1) {
    const start = chunkIndex * initResult.chunk_size;
    const end = Math.min(start + initResult.chunk_size, file.size);
    const chunk = file.slice(start, end);
    await uploadChunk(initResult.upload_id, chunkIndex, chunk);

    const percent = Math.round(((chunkIndex + 1) / totalChunks) * 100);
    options.onProgress?.(percent);
  }

  options.onFinalize?.();
  return completeUpload(initResult.upload_id, initResult.doc_id);
}

// 获取文档详情
export function getDocument(docId: string): Promise<Document> {
  return request.get(`/documents/${docId}`);
}

// 在线预览私有文档
export function previewDocument(docId: string): Promise<Blob> {
  return request.get(`/documents/${docId}/preview`, { responseType: 'blob' });
}

export interface DeleteDocumentResult {
  status: string;
  cleanup: {
    share_requests: number;
    public_documents: number;
    knowledge_extractions: number;
    document_versions: number;
    notes: number;
    outlines: number;
    chunks: number;
    share_links: number;
    permissions: number;
    tags: number;
  };
  file_removed: boolean;
}

// 删除文档
export function deleteDocument(docId: string): Promise<DeleteDocumentResult> {
  return request.delete(`/documents/${docId}`);
}

// 更新文档元数据
export function updateDocument(docId: string, data: { name?: string; folder_id?: string }): Promise<Document> {
  return request.put(`/documents/${docId}/metadata`, data);
}

// 下载文档
export function downloadDocument(docId: string): string {
  return `/api/v1/documents/${docId}/download`;
}
