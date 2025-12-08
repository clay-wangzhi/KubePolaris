// 集群相关类型定义
export interface Cluster {
  id: string;
  name: string;
  apiServer: string;
  version: string;
  status: 'healthy' | 'unhealthy' | 'unknown';
  nodeCount: number;
  readyNodes: number;
  cpuUsage: number;
  memoryUsage: number;
  lastHeartbeat: string;
  createdAt: string;
  labels?: Record<string, string>;
}

// 容器子网IP信息
export interface ContainerSubnetIPs {
  total_ips: number;
  used_ips: number;
  available_ips: number;
}

// 集群概览信息
export interface ClusterOverview {
  clusterID: number;
  nodes: number;
  namespace: number;
  pods: number;
  deployments: number;
  statefulsets: number;
  daemonsets: number;
  jobs: number;
  rollouts: number;
  containerSubnetIPs?: ContainerSubnetIPs;
}

export interface ClusterStats {
  totalClusters: number;
  healthyClusters: number;
  unhealthyClusters: number;
  totalNodes: number;
  readyNodes: number;
  totalPods: number;
  runningPods: number;
}

// 节点相关类型定义
export interface NodeAddress {
  address: string;
  type: string;
}

export interface Node {
  id: string;
  name: string;
  clusterId: string;
  addresses: NodeAddress[];
  status: 'Ready' | 'NotReady' | 'Unknown';
  roles: string[];
  version: string;
  osImage: string;
  kernelVersion: string;
  kubeletVersion: string;
  containerRuntime: string;
  resources: NodeResource;
  cpuUsage: number;
  memoryUsage: number;
  podCount: number;
  maxPods: number;
  conditions: NodeCondition[];
  taints: NodeTaint[];
  labels?: { key: string; value: string }[];
  creationTimestamp: string;
  unschedulable: boolean;
}

export interface NodeResource {
  cpu: string;
  memory: string;
  pods: number;
}

export interface NodeCondition {
  type: string;
  status: string;
  reason?: string;
  message?: string;
  lastTransitionTime: string;
}

export interface NodeTaint {
  key: string;
  value?: string;
  effect: 'NoSchedule' | 'PreferNoSchedule' | 'NoExecute';
}

// Pod相关类型定义
export interface Pod {
  id: string;
  name: string;
  namespace: string;
  clusterId: string;
  nodeName: string;
  status: 'Running' | 'Pending' | 'Succeeded' | 'Failed' | 'Unknown';
  phase: string;
  restartCount: number;
  cpuUsage: number;
  memoryUsage: number;
  containers: Container[];
  labels: Record<string, string>;
  createdAt: string;
  startTime?: string;
}

export interface Container {
  name: string;
  image: string;
  ready: boolean;
  restartCount: number;
  state: ContainerState;
}

export interface ContainerState {
  waiting?: {
    reason: string;
    message?: string;
  };
  running?: {
    startedAt: string;
  };
  terminated?: {
    exitCode: number;
    reason: string;
    message?: string;
    startedAt: string;
    finishedAt: string;
  };
}

// 工作负载相关类型定义
export interface Workload {
  id: string;
  name: string;
  namespace: string;
  clusterId: string;
  kind: 'Deployment' | 'StatefulSet' | 'DaemonSet' | 'Job' | 'CronJob';
  replicas: number;
  readyReplicas: number;
  availableReplicas: number;
  images: string[];
  labels: Record<string, string>;
  createdAt: string;
  updatedAt: string;
}

// API响应类型
export interface ApiResponse<T> {
  code: number;
  message: string;
  data: T;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

// 搜索相关类型
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
  code: number;
  message: string;
  data: {
    results: SearchResult[];
    total: number;
    stats: {
      cluster: number;
      node: number;
      pod: number;
      workload: number;
    };
  };
}

// 监控数据类型
export interface MetricData {
  timestamp: number;
  value: number;
}

export interface MetricSeries {
  name: string;
  data: MetricData[];
}

 // K8s 事件类型
export interface K8sEventInvolvedObject {
  kind: string;
  name: string;
  namespace?: string;
  uid?: string;
  apiVersion?: string;
  fieldPath?: string;
}

export interface K8sEvent {
  metadata?: {
    uid?: string;
    name?: string;
    namespace?: string;
    creationTimestamp?: string;
  };
  involvedObject: K8sEventInvolvedObject;
  type: 'Normal' | 'Warning' | string;
  reason: string;
  message: string;
  source?: { component?: string; host?: string };
  firstTimestamp?: string;
  lastTimestamp?: string;
  eventTime?: string;
  count?: number;
}

// Service相关类型定义
export interface ServicePort {
  name: string;
  protocol: string;
  port: number;
  targetPort: string;
  nodePort?: number;
}

export interface LoadBalancerIngress {
  ip?: string;
  hostname?: string;
}

export interface Service {
  name: string;
  namespace: string;
  type: 'ClusterIP' | 'NodePort' | 'LoadBalancer' | 'ExternalName';
  clusterIP: string;
  externalIPs?: string[];
  ports: ServicePort[];
  selector: Record<string, string>;
  sessionAffinity: string;
  loadBalancerIP?: string;
  loadBalancerIngress?: LoadBalancerIngress[];
  externalName?: string;
  createdAt: string;
  labels: Record<string, string>;
  annotations: Record<string, string>;
}

// Ingress相关类型定义
export interface IngressPathInfo {
  path: string;
  pathType: string;
  serviceName: string;
  servicePort: string;
}

export interface IngressRuleInfo {
  host: string;
  paths: IngressPathInfo[];
}

export interface IngressTLSInfo {
  hosts: string[];
  secretName: string;
}

export interface LoadBalancerStatus {
  ip?: string;
  hostname?: string;
}

export interface Ingress {
  name: string;
  namespace: string;
  ingressClassName?: string;
  rules: IngressRuleInfo[];
  tls?: IngressTLSInfo[];
  loadBalancer?: LoadBalancerStatus[];
  createdAt: string;
  labels: Record<string, string>;
  annotations: Record<string, string>;
}

// Endpoints相关类型定义
export interface EndpointAddress {
  ip: string;
  nodeName?: string;
  targetRef?: {
    kind: string;
    name: string;
    namespace: string;
  };
}

export interface EndpointPort {
  name: string;
  port: number;
  protocol: string;
}

export interface EndpointSubset {
  addresses: EndpointAddress[];
  ports: EndpointPort[];
}

export interface Endpoints {
  name: string;
  namespace: string;
  subsets: EndpointSubset[];
}
