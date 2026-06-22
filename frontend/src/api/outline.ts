import request from './request';

export interface OutlineSection {
  title: string;
  level: number;
  children?: OutlineSection[];
}

export interface OutlineContent {
  title: string;
  sections: OutlineSection[];
}

export interface Outline {
  id: string;
  title: string;
  content: OutlineContent;
  created_at: string;
  updated_at?: string;
}

export interface Note {
  id: string;
  content: string;
  doc_id?: string;
  outline_id?: string;
  created_at: string;
  updated_at?: string;
}

export function generateOutline(docId?: string, title?: string): Promise<Outline> {
  return request.post('/outline/generate', null, { params: { doc_id: docId, title } });
}

export function getOutline(outlineId: string): Promise<Outline> {
  return request.get(`/outline/${outlineId}`);
}

export function updateOutline(outlineId: string, title?: string, content?: OutlineContent): Promise<Outline> {
  return request.put(`/outline/${outlineId}`, null, { params: { title, content } });
}

export function exportOutline(outlineId: string, format: string = 'markdown'): Promise<{ content: string; filename: string }> {
  return request.post(`/outline/${outlineId}/export`, null, { params: { format } });
}

export function getNotes(docId?: string, outlineId?: string): Promise<Note[]> {
  return request.get('/notes/', { params: { doc_id: docId, outline_id: outlineId } });
}

export function createNote(content: string, docId?: string, outlineId?: string): Promise<Note> {
  return request.post('/notes/', null, { params: { content, doc_id: docId, outline_id: outlineId } });
}

export function updateNote(noteId: string, content: string): Promise<Note> {
  return request.put(`/notes/${noteId}`, null, { params: { content } });
}

export function deleteNote(noteId: string): Promise<void> {
  return request.delete(`/notes/${noteId}`);
}
