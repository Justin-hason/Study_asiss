import request from './request';

export interface ChunkResult {
  chunk_id: string;
  doc_id?: string;
  doc_name: string;
  page: number;
  text: string;
  score: number;
  vector_score?: number;
  bm25_score?: number;
}

export interface SearchResponse {
  results: ChunkResult[];
  empty_result: boolean;
  latency_ms: number;
}

export interface SearchParams {
  query: string;
  top_k?: number;
  top_n?: number;
  alpha?: number;
  threshold?: number;
}

export function search(params: SearchParams): Promise<SearchResponse> {
  return request.post('/search', params);
}
