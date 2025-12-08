import { request } from '../utils/api';

export interface ContainerInfo {
  name: string;
  image: string;
  ready: boolean;
  restartCount: number;
  state: {
    state: string;
    reason?: string;
    message?: string;
    startedAt?: string;
  };
  resources: {
    requests: Record<string, string>;
    limits: Record<string, string>;
  };
  ports: Array<{
    name?: string;
    containerPort: number;
    protocol: string;
  }>;
}

export interface PodCondition {
  type: string;
  status: string;
  lastProbeTime?: string;
  lastTransitionTime: string;
  reason?: string;
  message?: string;
}

export interface PodInfo {
  name: string;
  namespace: string;
  status: string;
  phase: string;
  nodeName: string;
  podIP: string;
  hostIP: string;
  restartCount: number;
  createdAt: string;
  labels: Record<string, string>;
  annotations: Record<string, string>;
  ownerReferences: Array<{
    kind: string;
    name: string;
    uid: string;
    controller?: boolean;
  }>;
  containers: ContainerInfo[];
  initContainers: ContainerInfo[];
  conditions: PodCondition[];
  qosClass: string;
  serviceAccount: string;
  priority?: number;
  priorityClassName?: string;
}

export interface PodListResponse {
  code: number;
  message: string;
  data: {
    items: PodInfo[];
    total: number;
    page: number;
    pageSize: number;
  };
}

export interface PodDetailResponse {
  code: number;
  message: string;
  data: {
    pod: PodInfo;
    raw: any;
  };
}

export interface PodLogsResponse {
  code: number;
  message: string;
  data: {
    logs: string;
  };
}

export class PodService {
  // 获取Pod列表
  static async getPods(
    clusterId: string,
    namespace?: string,
    nodeName?: string,
    labelSelector?: string,
    fieldSelector?: string,
    search?: string,
    page = 1,
    pageSize = 20
  ): Promise<PodListResponse> {
    const params = new URLSearchParams({
      page: page.toString(),
      pageSize: pageSize.toString(),
    });
    
    if (namespace) {
      params.append('namespace', namespace);
    }
    
    if (nodeName) {
      params.append('nodeName', nodeName);
    }
    
    if (labelSelector) {
      params.append('labelSelector', labelSelector);
    }
    
    if (fieldSelector) {
      params.append('fieldSelector', fieldSelector);
    }
    
    if (search) {
      params.append('search', search);
    }
    
    return request.get(`/clusters/${clusterId}/pods?${params}`);
  }

  // 获取Pod详情
  static async getPodDetail(
    clusterId: string,
    namespace: string,
    name: string
  ): Promise<PodDetailResponse> {
    return request.get(`/clusters/${clusterId}/pods/${namespace}/${name}`);
  }

  // 删除Pod
  static async deletePod(
    clusterId: string,
    namespace: string,
    name: string
  ): Promise<any> {
    return request.delete(`/clusters/${clusterId}/pods/${namespace}/${name}`);
  }

  // 获取Pod日志
  static async getPodLogs(
    clusterId: string,
    namespace: string,
    name: string,
    container?: string,
    follow = false,
    previous = false,
    tailLines?: number,
    sinceSeconds?: number
  ): Promise<PodLogsResponse> {
    const params = new URLSearchParams();
    
    if (container) {
      params.append('container', container);
    }
    
    if (follow) {
      params.append('follow', 'true');
    }
    
    if (previous) {
      params.append('previous', 'true');
    }
    
    if (tailLines) {
      params.append('tailLines', tailLines.toString());
    }
    
    if (sinceSeconds) {
      params.append('sinceSeconds', sinceSeconds.toString());
    }
    
    return request.get(`/clusters/${clusterId}/pods/${namespace}/${name}/logs?${params}`);
  }

  // 获取Pod状态颜色
  static getStatusColor(pod: PodInfo): string {
    const { status, phase } = pod;
    
    if (status.includes('Terminating')) return 'orange';
    if (status === 'Running') return 'green';
    if (status === 'Completed') return 'blue';
    if (status === 'Failed') return 'red';
    if (status === 'Pending') return 'orange';
    if (status.includes('Error') || status.includes('BackOff')) return 'red';
    if (status.includes('NotReady')) return 'orange';
    
    // 根据phase判断
    switch (phase) {
      case 'Running':
        return 'green';
      case 'Succeeded':
        return 'blue';
      case 'Failed':
        return 'red';
      case 'Pending':
        return 'orange';
      default:
        return 'default';
    }
  }

  // 格式化Pod状态
  static formatStatus(pod: PodInfo): { status: string; color: string } {
    const color = this.getStatusColor(pod);
    let statusText = pod.status;
    
    // 简化状态显示
    if (statusText.includes('NotReady')) {
      const match = statusText.match(/\((\d+\/\d+)\)/);
      if (match) {
        statusText = `未就绪 ${match[1]}`;
      } else {
        statusText = '未就绪';
      }
    }
    
    return { status: statusText, color };
  }

  // 获取Pod年龄
  static getAge(createdAt: string): string {
    const now = new Date();
    const created = new Date(createdAt);
    const diffMs = now.getTime() - created.getTime();
    
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    const diffHours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const diffMinutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
    
    if (diffDays > 0) {
      return `${diffDays}天`;
    } else if (diffHours > 0) {
      return `${diffHours}小时`;
    } else if (diffMinutes > 0) {
      return `${diffMinutes}分钟`;
    } else {
      return '刚刚';
    }
  }

  // 获取容器状态颜色
  static getContainerStatusColor(container: ContainerInfo): string {
    if (!container.ready) return 'red';
    if (container.state.state === 'Running') return 'green';
    if (container.state.state === 'Waiting') return 'orange';
    if (container.state.state === 'Terminated') return 'red';
    return 'default';
  }

  // 格式化容器状态
  static formatContainerStatus(container: ContainerInfo): string {
    if (container.state.state === 'Running') return '运行中';
    if (container.state.state === 'Waiting') {
      return container.state.reason || '等待中';
    }
    if (container.state.state === 'Terminated') {
      return container.state.reason || '已终止';
    }
    return container.state.state;
  }

  // 获取Pod命名空间列表
  static async getPodNamespaces(clusterId: string): Promise<{ code: number; message: string; data: string[] }> {
    return request.get(`/clusters/${clusterId}/pods/namespaces`);
  }

  // 获取Pod节点列表
  static async getPodNodes(clusterId: string): Promise<{ code: number; message: string; data: string[] }> {
    return request.get(`/clusters/${clusterId}/pods/nodes`);
  }

  // 创建WebSocket连接获取实时日志流
  static createLogStream(
    clusterId: string,
    namespace: string,
    name: string,
    options: {
      container?: string;
      previous?: boolean;
      tailLines?: number;
      sinceSeconds?: number;
    } = {}
  ): WebSocket {
    // 构建WebSocket URL
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host.replace(':5173', ':8080'); // 开发环境端口映射
    
    const params = new URLSearchParams();
    if (options.container) {
      params.append('container', options.container);
    }
    if (options.previous) {
      params.append('previous', 'true');
    }
    if (options.tailLines) {
      params.append('tailLines', options.tailLines.toString());
    }
    if (options.sinceSeconds) {
      params.append('sinceSeconds', options.sinceSeconds.toString());
    }

    const url = `${protocol}//${host}/ws/clusters/${clusterId}/pods/${namespace}/${name}/logs?${params}`;
    
    return new WebSocket(url);
  }
}