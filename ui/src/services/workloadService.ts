import { request } from '../utils/api';

export interface WorkloadInfo {
  id: string;
  name: string;
  namespace: string;
  type: string;
  status: string;
  ready?: string;
  upToDate?: number;
  available?: number;
  age?: string;
  images: string[];
  selector: Record<string, string>;
  labels: Record<string, string>;
  annotations: Record<string, string>;
  createdAt: string;
  creationTimestamp?: string;
  replicas?: number;
  readyReplicas?: number;
  updatedReplicas?: number;
  availableReplicas?: number;
  strategy?: string;
  conditions?: Array<{
    type: string;
    status: string;
    lastUpdateTime: string;
    lastTransitionTime: string;
    reason: string;
    message: string;
  }>;
}

export interface WorkloadListResponse {
  code: number;
  message: string;
  data: {
    items: WorkloadInfo[];
    total: number;
  };
}

export interface WorkloadDetailResponse {
  code: number;
  message: string;
  data: {
    workload: WorkloadInfo;
    raw: any;
    pods: any[];
  };
}

export interface ScaleWorkloadRequest {
  replicas: number;
}

export interface YAMLApplyRequest {
  yaml: string;
  dryRun?: boolean;
}

export class WorkloadService {
  // 获取工作负载列表
  static async getWorkloads(
    clusterId: string,
    namespace?: string,
    workloadType?: string,
    page = 1,
    pageSize = 20,
    search?: string // 新增搜索参数
  ): Promise<WorkloadListResponse> {
    const params = new URLSearchParams({
      page: page.toString(),
      pageSize: pageSize.toString(),
    });
    
    if (namespace) {
      params.append('namespace', namespace);
    }
    
    if (workloadType) {
      params.append('type', workloadType);
    }
    
    if (search) {
      params.append('search', search);
    }
    
    return request.get(`/clusters/${clusterId}/workloads?${params}`);
  }

  // 获取工作负载命名空间列表
  static async getWorkloadNamespaces(
    clusterId: string,
    workloadType?: string
  ): Promise<{ code: number; message: string; data: string[] }> {
    const params = new URLSearchParams();
    
    if (workloadType) {
      params.append('type', workloadType);
    }
    
    return request.get(`/clusters/${clusterId}/workloads/namespaces?${params}`);
  }

  // 获取工作负载详情
  static async getWorkloadDetail(
    clusterId: string,
    namespace: string,
    name: string,
    type: string
  ): Promise<WorkloadDetailResponse> {
    return request.get(`/clusters/${clusterId}/workloads/${namespace}/${name}?type=${type}`);
  }

  // 扩缩容工作负载
  static async scaleWorkload(
    clusterId: string,
    namespace: string,
    name: string,
    type: string,
    replicas: number
  ): Promise<any> {
    return request.post(
      `/clusters/${clusterId}/workloads/${namespace}/${name}/scale?type=${type}`,
      { replicas }
    );
  }

  // 删除工作负载
  static async deleteWorkload(
    clusterId: string,
    namespace: string,
    name: string,
    type: string
  ): Promise<any> {
    return request.delete(
      `/clusters/${clusterId}/workloads/${namespace}/${name}?type=${type}`
    );
  }

  // 应用YAML
  static async applyYAML(
    clusterId: string,
    yaml: string,
    dryRun = false
  ): Promise<any> {
    return request.post(`/clusters/${clusterId}/yaml/apply`, {
      yaml,
      dryRun,
    });
  }

  // 获取工作负载类型列表
  static getWorkloadTypes(): Array<{ value: string; label: string; icon: string }> {
    return [
      { value: 'deployment', label: 'Deployment', icon: '🚀' },
      { value: 'argo-rollout', label: 'Argo Rollout', icon: '🌀' },
      { value: 'statefulset', label: 'StatefulSet', icon: '💾' },
      { value: 'daemonset', label: 'DaemonSet', icon: '👥' },
      { value: 'job', label: 'Job', icon: '⚡' },
      { value: 'cronjob', label: 'CronJob', icon: '⏰' },
    ];
  }

  // 获取工作负载状态颜色
  static getStatusColor(workload: WorkloadInfo): string {
    const { type, status, replicas, readyReplicas } = workload;
    
    if (type === 'job' || type === 'cronjob') {
      return status === 'Completed' ? 'success' : 'processing';
    }
    
    // 如果有副本数信息，使用副本数判断
    if (typeof replicas === 'number' && typeof readyReplicas === 'number') {
      if (readyReplicas === 0) return 'error';
      if (readyReplicas < replicas) return 'warning';
      return 'success';
    }
    
    // 根据状态字段判断
    if (status === 'Ready') return 'success';
    if (status === 'NotReady') return 'error';
    return 'processing';
  }

  // 格式化工作负载状态
  static formatStatus(workload: WorkloadInfo): { status: string; color: string } {
    const { type, status, replicas, readyReplicas } = workload;
    const color = this.getStatusColor(workload);
    
    let statusText = status || '未知';
    
    if (type === 'job') {
      statusText = status === 'Completed' ? '已完成' : '运行中';
    } else if (type === 'cronjob') {
      statusText = '已调度';
    } else if (typeof replicas === 'number' && typeof readyReplicas === 'number') {
      statusText = `${readyReplicas}/${replicas}`;
    }
    
    return { status: statusText, color };
  }
}