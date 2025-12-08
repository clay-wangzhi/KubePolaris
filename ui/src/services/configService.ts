import { request } from '../utils/api';

export interface ConfigMapListItem {
  name: string;
  namespace: string;
  labels: Record<string, string>;
  dataCount: number;
  creationTimestamp: string;
  age: string;
}

export interface ConfigMapDetail {
  name: string;
  namespace: string;
  labels: Record<string, string>;
  annotations: Record<string, string>;
  data: Record<string, string>;
  binaryData?: Record<string, Uint8Array>;
  creationTimestamp: string;
  age: string;
  resourceVersion: string;
}

export interface SecretListItem {
  name: string;
  namespace: string;
  type: string;
  labels: Record<string, string>;
  dataCount: number;
  creationTimestamp: string;
  age: string;
}

export interface SecretDetail {
  name: string;
  namespace: string;
  type: string;
  labels: Record<string, string>;
  annotations: Record<string, string>;
  data: Record<string, string>;
  creationTimestamp: string;
  age: string;
  resourceVersion: string;
}

export interface NamespaceItem {
  name: string;
  count: number;
}

export interface ListResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

// 命名空间对象接口
interface NamespaceObject {
  name: string;
  status: string;
  labels: Record<string, string>;
  annotations: Record<string, string>;
  creationTimestamp: string;
}

// 获取命名空间列表（通用）
export const getNamespaces = async (clusterId: number): Promise<string[]> => {
  try {
    // 直接使用集群的命名空间接口
    const response = await request.get<NamespaceObject[]>(
      `/clusters/${clusterId}/namespaces`
    );
    // 提取命名空间名称数组
    return response.data.map((ns) => ns.name);
  } catch (error) {
    console.error('获取命名空间列表失败:', error);
    // 返回默认命名空间
    return ['default', 'kube-system', 'kube-public', 'kube-node-lease'];
  }
};

// ConfigMap API
export const configMapService = {
  // 获取ConfigMap列表
  async getConfigMaps(
    clusterId: number,
    params: {
      namespace?: string;
      name?: string;
      page?: number;
      pageSize?: number;
    }
  ): Promise<ListResponse<ConfigMapListItem>> {
    const queryParams = new URLSearchParams();
    if (params.namespace) queryParams.append('namespace', params.namespace);
    if (params.name) queryParams.append('name', params.name);
    if (params.page) queryParams.append('page', params.page.toString());
    if (params.pageSize) queryParams.append('pageSize', params.pageSize.toString());

    const response = await request.get<ListResponse<ConfigMapListItem>>(
      `/clusters/${clusterId}/configmaps?${queryParams}`
    );
    return response.data;
  },

  // 获取ConfigMap详情
  async getConfigMap(
    clusterId: number,
    namespace: string,
    name: string
  ): Promise<ConfigMapDetail> {
    const response = await request.get<ConfigMapDetail>(
      `/clusters/${clusterId}/configmaps/${namespace}/${name}`
    );
    return response.data;
  },

  // 获取ConfigMap命名空间列表
  async getConfigMapNamespaces(clusterId: number): Promise<NamespaceItem[]> {
    const response = await request.get<NamespaceItem[]>(
      `/clusters/${clusterId}/configmaps/namespaces`
    );
    return response.data;
  },

  // 创建ConfigMap
  async createConfigMap(
    clusterId: number,
    data: {
      name: string;
      namespace: string;
      labels?: Record<string, string>;
      annotations?: Record<string, string>;
      data?: Record<string, string>;
    }
  ): Promise<{ name: string; namespace: string }> {
    const response = await request.post<{ name: string; namespace: string }>(
      `/clusters/${clusterId}/configmaps`,
      data
    );
    return response.data;
  },

  // 更新ConfigMap
  async updateConfigMap(
    clusterId: number,
    namespace: string,
    name: string,
    data: {
      labels?: Record<string, string>;
      annotations?: Record<string, string>;
      data?: Record<string, string>;
    }
  ): Promise<{ name: string; namespace: string; resourceVersion: string }> {
    const response = await request.put<{ name: string; namespace: string; resourceVersion: string }>(
      `/clusters/${clusterId}/configmaps/${namespace}/${name}`,
      data
    );
    return response.data;
  },

  // 删除ConfigMap
  async deleteConfigMap(
    clusterId: number,
    namespace: string,
    name: string
  ): Promise<void> {
    await request.delete(
      `/clusters/${clusterId}/configmaps/${namespace}/${name}`
    );
  },
};

// Secret API
export const secretService = {
  // 获取Secret列表
  async getSecrets(
    clusterId: number,
    params: {
      namespace?: string;
      name?: string;
      page?: number;
      pageSize?: number;
    }
  ): Promise<ListResponse<SecretListItem>> {
    const queryParams = new URLSearchParams();
    if (params.namespace) queryParams.append('namespace', params.namespace);
    if (params.name) queryParams.append('name', params.name);
    if (params.page) queryParams.append('page', params.page.toString());
    if (params.pageSize) queryParams.append('pageSize', params.pageSize.toString());

    const response = await request.get<ListResponse<SecretListItem>>(
      `/clusters/${clusterId}/secrets?${queryParams}`
    );
    return response.data;
  },

  // 获取Secret详情
  async getSecret(
    clusterId: number,
    namespace: string,
    name: string
  ): Promise<SecretDetail> {
    const response = await request.get<SecretDetail>(
      `/clusters/${clusterId}/secrets/${namespace}/${name}`
    );
    return response.data;
  },

  // 获取Secret命名空间列表
  async getSecretNamespaces(clusterId: number): Promise<NamespaceItem[]> {
    const response = await request.get<NamespaceItem[]>(
      `/clusters/${clusterId}/secrets/namespaces`
    );
    return response.data;
  },

  // 创建Secret
  async createSecret(
    clusterId: number,
    data: {
      name: string;
      namespace: string;
      type?: string;
      labels?: Record<string, string>;
      annotations?: Record<string, string>;
      data?: Record<string, string>;
    }
  ): Promise<{ name: string; namespace: string }> {
    const response = await request.post<{ name: string; namespace: string }>(
      `/clusters/${clusterId}/secrets`,
      data
    );
    return response.data;
  },

  // 更新Secret
  async updateSecret(
    clusterId: number,
    namespace: string,
    name: string,
    data: {
      labels?: Record<string, string>;
      annotations?: Record<string, string>;
      data?: Record<string, string>;
    }
  ): Promise<{ name: string; namespace: string; resourceVersion: string }> {
    const response = await request.put<{ name: string; namespace: string; resourceVersion: string }>(
      `/clusters/${clusterId}/secrets/${namespace}/${name}`,
      data
    );
    return response.data;
  },

  // 删除Secret
  async deleteSecret(
    clusterId: number,
    namespace: string,
    name: string
  ): Promise<void> {
    await request.delete(
      `/clusters/${clusterId}/secrets/${namespace}/${name}`
    );
  },
};

