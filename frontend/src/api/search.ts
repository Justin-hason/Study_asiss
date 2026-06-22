import request from './request';
import type { ContextItem } from './generate';

export interface SearchQAResponse {
  query: string;
  contexts: ContextItem[];
  total: number;
}

export function searchQA(query: string, topK = 10, topN = 5): Promise<SearchQAResponse> {
  return request.post('/search/qa', null, {
    params: {
      query,
      top_k: topK,
      top_n: topN,
    },
  });
}
