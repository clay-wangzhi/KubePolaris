import api from '../utils/api';

export interface SearchResult {
  id: string;
  name: string;
  type: 'cluster' | 'node' | 'pod' | 'workload';
  namespace?: string;
  clusterId: string;
  clusterName: string;
  status: string;
  description?: string;
  ip?: string;
  kind?: string;
  labels?: Record<string, string>;
  annotations?: Record<string, string>;
}

export interface SearchResponse {
  results: SearchResult[];
  total: number;
  stats: {
    cluster: number;
    node: number;
    pod: number;
    workload: number;
  };
}

export const searchService = {
  // 全局搜索
  async globalSearch(query: string): Promise<SearchResponse> {
    const response = await api.get(`/search?q=${encodeURIComponent(query)}`);
    return response.data;
  },

  // 快速搜索（用于顶部搜索栏）
  async quickSearch(query: string): Promise<SearchResult[]> {
    const response = await api.get(`/search/quick?q=${encodeURIComponent(query)}&limit=10`);
    return response.data.results || [];
  },
};