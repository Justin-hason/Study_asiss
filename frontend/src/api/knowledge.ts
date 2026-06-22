import request from './request';

export interface Folder {
  id: string;
  tenant_id: string;
  parent_id?: string;
  name: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
  children?: Folder[];
}

export interface Tag {
  id: string;
  tenant_id: string;
  name: string;
  color: string;
  created_at: string;
}

export interface CreateFolderReq {
  name: string;
  parent_id?: string;
}

export interface CreateTagReq {
  name: string;
  color: string;
}

export function getFolderTree(): Promise<Folder[]> {
  return request.get('/knowledge/folders/tree');
}

export function createFolder(data: CreateFolderReq): Promise<Folder> {
  return request.post('/knowledge/folders', data);
}

export function moveFolder(id: string, data: { parent_id?: string; sort_order?: number }): Promise<{ status: string }> {
  return request.put(`/knowledge/folders/${id}/move`, data);
}

export function deleteFolder(id: string): Promise<{ status: string }> {
  return request.delete(`/knowledge/folders/${id}`);
}

export function listTags(): Promise<Tag[]> {
  return request.get('/knowledge/tags');
}

export function createTag(data: CreateTagReq): Promise<Tag> {
  return request.post('/knowledge/tags', data);
}

export function addDocumentTag(docId: string, tagId: string): Promise<{ status: string }> {
  return request.post(`/knowledge/documents/${docId}/tags/${tagId}`);
}

export function removeDocumentTag(docId: string, tagId: string): Promise<{ status: string }> {
  return request.delete(`/knowledge/documents/${docId}/tags/${tagId}`);
}

export interface DocumentVersion {
  id: string;
  doc_id: string;
  version_number: number;
  file_path?: string;
  file_size?: number;
  uploader_id?: string;
  change_note?: string;
  created_at: string;
}

export interface ShareLinkResult {
  token: string;
  url?: string;
  expires_at?: string;
  permission: string;
}

export function listVersions(docId: string): Promise<DocumentVersion[]> {
  return request.get(`/knowledge/documents/${docId}/versions`);
}

export function restoreVersion(docId: string, versionId: string): Promise<{ status: string }> {
  return request.post(`/knowledge/documents/${docId}/versions/${versionId}/restore`);
}

export function setPermissions(docId: string, data: { level: string; user_ids: string[] }): Promise<{ status: string }> {
  return request.put(`/knowledge/documents/${docId}/permissions`, data);
}

export function createShareLink(docId: string, data: { expires_in_hours: number; password: string; permission: string }): Promise<ShareLinkResult> {
  return request.post(`/knowledge/documents/${docId}/share`, data);
}
