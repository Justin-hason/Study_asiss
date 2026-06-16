import request from './request';

export interface FolderNode {
  id: string;
  tenant_id: string;
  parent_id: string | null;
  name: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
  children?: FolderNode[];
}

export function getFolderTree(): Promise<FolderNode[]> {
  return request.get('/knowledge/folders/tree');
}
