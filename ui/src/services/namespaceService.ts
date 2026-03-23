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

export interface NamespaceListResponse {
  items: NamespaceData[];
  meta: {
    hasAllAccess: boolean;
    allowedNamespaces: string[];
  };
}

/**
 * 获取命名空间列表
 */
export const getNamespaces = async (clusterId: number): Promise<NamespaceData[]> => {
  const res = await request.get<NamespaceListResponse>(`/clusters/${clusterId}/namespaces`);
  return res.items || [];
};

/**
 * 获取命名空间详情
 */
export const getNamespaceDetail = async (
  clusterId: number,
  namespace: string
): Promise<NamespaceDetailData> => {
  return request.get<NamespaceDetailData>(`/clusters/${clusterId}/namespaces/${namespace}`);
};

/**
 * 创建命名空间
 */
export const createNamespace = async (
  clusterId: number,
  data: CreateNamespaceRequest
): Promise<NamespaceData> => {
  return request.post<NamespaceData>(`/clusters/${clusterId}/namespaces`, data);
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

/**
 * 命名空间服务对象 - 兼容旧的调用方式
 */
export const namespaceService = {
  getNamespaces: async (clusterId: string) => {
    const res = await request.get<NamespaceListResponse>(`/clusters/${clusterId}/namespaces`);
    return res.items || [];
  },
  getNamespaceDetail,
  createNamespace,
  deleteNamespace,
};

