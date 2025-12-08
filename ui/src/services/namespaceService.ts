import { request } from '../utils/api';

export interface NamespaceData {
  name: string;
  status: string;
  labels: Record<string, string>;
  annotations: Record<string, string>;
  creationTimestamp: string;
  resourceQuota?: {
    hard: Record<string, string>;
    used: Record<string, string>;
  };
}

export interface NamespaceDetailData extends NamespaceData {
  resourceCount: {
    pods: number;
    services: number;
    configMaps: number;
    secrets: number;
  };
}

export interface CreateNamespaceRequest {
  name: string;
  labels?: Record<string, string>;
  annotations?: Record<string, string>;
}

/**
 * 获取命名空间列表
 */
export const getNamespaces = async (clusterId: number): Promise<NamespaceData[]> => {
  const response = await request.get<NamespaceData[]>(`/clusters/${clusterId}/namespaces`);
  return response.data;
};

/**
 * 获取命名空间详情
 */
export const getNamespaceDetail = async (
  clusterId: number,
  namespace: string
): Promise<NamespaceDetailData> => {
  const response = await request.get<NamespaceDetailData>(`/clusters/${clusterId}/namespaces/${namespace}`);
  return response.data;
};

/**
 * 创建命名空间
 */
export const createNamespace = async (
  clusterId: number,
  data: CreateNamespaceRequest
): Promise<NamespaceData> => {
  const response = await request.post<NamespaceData>(`/clusters/${clusterId}/namespaces`, data);
  return response.data;
};

/**
 * 删除命名空间
 */
export const deleteNamespace = async (
  clusterId: number,
  namespace: string
): Promise<void> => {
  await request.delete<void>(`/clusters/${clusterId}/namespaces/${namespace}`);
};

