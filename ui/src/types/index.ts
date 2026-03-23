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

// API 响应类型（后端直接返回数据体，无包装）
export type ApiResponse<T> = T;

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
  results: SearchResult[];
  total: number;
  stats: {
    cluster: number;
    node: number;
    pod: number;
    workload: number;
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

// 存储相关类型定义 - PVC
export interface PVC {
  name: string;
  namespace: string;
  status: string;
  volumeName: string;
  storageClassName: string;
  accessModes: string[];
  capacity: string;
  volumeMode: string;
  createdAt: string;
  labels: Record<string, string>;
  annotations: Record<string, string>;
}

// 存储相关类型定义 - PV
export interface PVClaimRef {
  namespace: string;
  name: string;
}

export interface PV {
  name: string;
  status: string;
  capacity: string;
  accessModes: string[];
  reclaimPolicy: string;
  storageClassName: string;
  volumeMode: string;
  claimRef?: PVClaimRef;
  persistentVolumeSource: string;
  mountOptions?: string[];
  nodeAffinity?: string;
  createdAt: string;
  labels: Record<string, string>;
  annotations: Record<string, string>;
}

// 存储相关类型定义 - StorageClass
export interface StorageClass {
  name: string;
  provisioner: string;
  reclaimPolicy: string;
  volumeBindingMode: string;
  allowVolumeExpansion: boolean;
  parameters?: Record<string, string>;
  mountOptions?: string[];
  isDefault: boolean;
  createdAt: string;
  labels: Record<string, string>;
  annotations: Record<string, string>;
}

// 用户相关类型定义
export interface User {
  id: number;
  username: string;
  email: string;
  display_name: string;
  phone?: string;
  auth_type: 'local' | 'ldap';
  status: 'active' | 'inactive' | 'locked';
  last_login_at?: string;
  last_login_ip?: string;
  created_at: string;
  updated_at: string;
}

// 用户管理请求类型
export interface CreateUserRequest {
  username: string;
  password: string;
  email?: string;
  display_name?: string;
  phone?: string;
}

export interface UpdateUserRequest {
  email?: string;
  display_name?: string;
  phone?: string;
}

// LDAP配置类型
export interface LDAPConfig {
  enabled: boolean;
  server: string;
  port: number;
  use_tls: boolean;
  skip_tls_verify: boolean;
  bind_dn: string;
  bind_password: string;
  base_dn: string;
  user_filter: string;
  username_attr: string;
  email_attr: string;
  display_name_attr: string;
  group_filter: string;
  group_attr: string;
}

// SSH配置类型
export interface SSHConfig {
  enabled: boolean;
  username: string;
  port: number;
  auth_type: 'password' | 'key';
  password?: string;
  private_key?: string;
}

// Grafana 配置类型
export interface GrafanaConfig {
  url: string;
  api_key: string;
}

// Grafana Dashboard 同步状态
export interface GrafanaDashboardSyncStatus {
  folder_exists: boolean;
  dashboards: GrafanaDashboardStatusItem[];
  all_synced: boolean;
}

export interface GrafanaDashboardStatusItem {
  uid: string;
  title: string;
  exists: boolean;
}

// Grafana 数据源同步状态
export interface GrafanaDataSourceSyncStatus {
  datasources: GrafanaDataSourceStatusItem[];
  all_synced: boolean;
}

export interface GrafanaDataSourceStatusItem {
  cluster_name: string;
  datasource_uid: string;
  prometheus_url: string;
  exists: boolean;
}

// ========== 权限管理类型 ==========

// 权限类型常量
export type PermissionType = 'admin' | 'ops' | 'dev' | 'readonly' | 'custom';

// 权限类型信息
export interface PermissionTypeInfo {
  type: PermissionType;
  name: string;
  description: string;
  resources: string[];
  actions: string[];
  allowPartialNamespaces: boolean;  // 是否允许选择部分命名空间
  requireAllNamespaces: boolean;    // 是否必须选择全部命名空间
}

// 用户组
export interface UserGroup {
  id: number;
  name: string;
  description: string;
  created_at: string;
  updated_at: string;
  users?: User[];
}

// 集群权限配置
export interface ClusterPermission {
  id: number;
  cluster_id: number;
  cluster_name?: string;
  user_id?: number;
  username?: string;
  user_group_id?: number;
  user_group_name?: string;
  permission_type: PermissionType;
  permission_name: string;
  namespaces: string[];
  custom_role_ref?: string;
  created_at: string;
  updated_at: string;
}

// 创建集群权限请求
export interface CreateClusterPermissionRequest {
  cluster_id: number;
  user_id?: number;
  user_group_id?: number;
  user_ids?: number[];
  user_group_ids?: number[];
  permission_type: PermissionType;
  namespaces?: string[];
  custom_role_ref?: string;
}

// 更新集群权限请求
export interface UpdateClusterPermissionRequest {
  permission_type?: PermissionType;
  namespaces?: string[];
  custom_role_ref?: string;
}

// 我的权限响应
export interface MyPermissionsResponse {
  cluster_id: number;
  cluster_name: string;
  permission_type: PermissionType;
  permission_name: string;
  namespaces: string[];
  allowed_actions: string[];
  custom_role_ref?: string;
}

// 创建用户组请求
export interface CreateUserGroupRequest {
  name: string;
  description?: string;
}

// 更新用户组请求
export interface UpdateUserGroupRequest {
  name: string;
  description?: string;
}
