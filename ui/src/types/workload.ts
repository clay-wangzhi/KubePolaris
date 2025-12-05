/** genAI_main_start */
// 容器探针配置
export interface ProbeConfig {
  // HTTP检查
  httpGet?: {
    path: string;
    port: number;
    scheme?: 'HTTP' | 'HTTPS';
    httpHeaders?: Array<{ name: string; value: string }>;
  };
  // 命令检查
  exec?: {
    command: string[];
  };
  // TCP检查
  tcpSocket?: {
    port: number;
  };
  // 通用参数
  initialDelaySeconds?: number;
  periodSeconds?: number;
  timeoutSeconds?: number;
  successThreshold?: number;
  failureThreshold?: number;
}

// 容器生命周期配置
export interface LifecycleConfig {
  postStart?: {
    exec?: { command: string[] };
    httpGet?: {
      path: string;
      port: number;
      host?: string;
      scheme?: string;
    };
  };
  preStop?: {
    exec?: { command: string[] };
    httpGet?: {
      path: string;
      port: number;
      host?: string;
      scheme?: string;
    };
  };
}

// 容器资源配置
export interface ResourceConfig {
  limits?: {
    cpu?: string;
    memory?: string;
    'nvidia.com/gpu'?: string;
  };
  requests?: {
    cpu?: string;
    memory?: string;
  };
}

// 数据卷挂载配置
export interface VolumeMount {
  name: string;
  mountPath: string;
  subPath?: string;
  readOnly?: boolean;
}

// 数据卷配置
export interface VolumeConfig {
  name: string;
  type: 'emptyDir' | 'hostPath' | 'configMap' | 'secret' | 'persistentVolumeClaim';
  // EmptyDir
  emptyDir?: {
    medium?: '' | 'Memory';
    sizeLimit?: string;
  };
  // HostPath
  hostPath?: {
    path: string;
    type?: 'DirectoryOrCreate' | 'Directory' | 'FileOrCreate' | 'File' | 'Socket' | 'CharDevice' | 'BlockDevice';
  };
  // ConfigMap
  configMap?: {
    name: string;
    items?: Array<{ key: string; path: string }>;
    defaultMode?: number;
  };
  // Secret
  secret?: {
    secretName: string;
    items?: Array<{ key: string; path: string }>;
    defaultMode?: number;
  };
  // PVC
  persistentVolumeClaim?: {
    claimName: string;
    readOnly?: boolean;
  };
}

// 容器配置
export interface ContainerConfig {
  name: string;
  image: string;
  imagePullPolicy?: 'Always' | 'IfNotPresent' | 'Never';
  // 启动命令
  command?: string[];
  args?: string[];
  // 工作目录
  workingDir?: string;
  // 端口配置
  ports?: Array<{
    name?: string;
    containerPort: number;
    protocol?: 'TCP' | 'UDP' | 'SCTP';
  }>;
  // 环境变量
  env?: Array<{
    name: string;
    value?: string;
    valueFrom?: {
      configMapKeyRef?: { name: string; key: string };
      secretKeyRef?: { name: string; key: string };
      fieldRef?: { fieldPath: string };
      resourceFieldRef?: { containerName?: string; resource: string };
    };
  }>;
  // 资源配置
  resources?: ResourceConfig;
  // 数据卷挂载
  volumeMounts?: VolumeMount[];
  // 生命周期
  lifecycle?: LifecycleConfig;
  // 健康检查
  livenessProbe?: ProbeConfig;
  readinessProbe?: ProbeConfig;
  startupProbe?: ProbeConfig;
  // 标准输入
  stdin?: boolean;
  stdinOnce?: boolean;
  tty?: boolean;
}

// 节点亲和性 - 必须满足
export interface NodeSelectorTerm {
  matchExpressions?: Array<{
    key: string;
    operator: 'In' | 'NotIn' | 'Exists' | 'DoesNotExist' | 'Gt' | 'Lt';
    values?: string[];
  }>;
  matchFields?: Array<{
    key: string;
    operator: 'In' | 'NotIn' | 'Exists' | 'DoesNotExist' | 'Gt' | 'Lt';
    values?: string[];
  }>;
}

// 节点亲和性 - 尽量满足
export interface PreferredSchedulingTerm {
  weight: number;
  preference: NodeSelectorTerm;
}

// 节点亲和性配置
export interface NodeAffinityConfig {
  // 必须满足 (requiredDuringSchedulingIgnoredDuringExecution)
  required?: {
    nodeSelectorTerms: NodeSelectorTerm[];
  };
  // 尽量满足 (preferredDuringSchedulingIgnoredDuringExecution)
  preferred?: PreferredSchedulingTerm[];
}

// Pod亲和性条件
export interface PodAffinityTerm {
  labelSelector?: {
    matchLabels?: Record<string, string>;
    matchExpressions?: Array<{
      key: string;
      operator: 'In' | 'NotIn' | 'Exists' | 'DoesNotExist';
      values?: string[];
    }>;
  };
  namespaces?: string[];
  topologyKey: string;
  namespaceSelector?: {
    matchLabels?: Record<string, string>;
    matchExpressions?: Array<{
      key: string;
      operator: 'In' | 'NotIn' | 'Exists' | 'DoesNotExist';
      values?: string[];
    }>;
  };
}

// Pod亲和性 - 尽量满足
export interface WeightedPodAffinityTerm {
  weight: number;
  podAffinityTerm: PodAffinityTerm;
}

// Pod亲和性配置
export interface PodAffinityConfig {
  // 必须满足
  required?: PodAffinityTerm[];
  // 尽量满足
  preferred?: WeightedPodAffinityTerm[];
}

// 调度策略配置
export interface SchedulingConfig {
  // 节点亲和
  nodeAffinity?: NodeAffinityConfig;
  // Pod亲和
  podAffinity?: PodAffinityConfig;
  // Pod反亲和
  podAntiAffinity?: PodAffinityConfig;
}

// 容忍配置
export interface TolerationConfig {
  key?: string;
  operator: 'Equal' | 'Exists';
  value?: string;
  effect?: 'NoSchedule' | 'PreferNoSchedule' | 'NoExecute' | '';
  tolerationSeconds?: number;
}

// DNS配置
export interface DNSConfig {
  nameservers?: string[];
  searches?: string[];
  options?: Array<{ name: string; value?: string }>;
}

// 升级策略配置
export interface UpdateStrategyConfig {
  type: 'RollingUpdate' | 'Recreate';
  rollingUpdate?: {
    maxUnavailable?: string | number;
    maxSurge?: string | number;
  };
}

// 完整的工作负载表单数据
export interface WorkloadFormData {
  // 基本信息
  name: string;
  namespace: string;
  description?: string;
  replicas?: number;
  labels?: Array<{ key: string; value: string }>;
  annotations?: Array<{ key: string; value: string }>;
  
  // 容器配置 - 支持多容器
  containers: ContainerConfig[];
  // Init容器
  initContainers?: ContainerConfig[];
  
  // 数据卷
  volumes?: VolumeConfig[];
  
  // 镜像拉取凭证
  imagePullSecrets?: string[];
  
  // 调度策略
  scheduling?: SchedulingConfig;
  // 节点选择器 (简化版)
  nodeSelector?: Record<string, string>;
  // 容忍策略
  tolerations?: TolerationConfig[];
  
  // 升级策略
  strategy?: UpdateStrategyConfig;
  minReadySeconds?: number;
  revisionHistoryLimit?: number;
  progressDeadlineSeconds?: number;
  
  // 终止配置
  terminationGracePeriodSeconds?: number;
  
  // DNS配置
  dnsPolicy?: 'ClusterFirst' | 'ClusterFirstWithHostNet' | 'Default' | 'None';
  dnsConfig?: DNSConfig;
  
  // 主机网络
  hostNetwork?: boolean;
  hostPID?: boolean;
  hostIPC?: boolean;
  
  // StatefulSet 特有
  serviceName?: string;
  podManagementPolicy?: 'OrderedReady' | 'Parallel';
  
  // CronJob 特有
  schedule?: string;
  suspend?: boolean;
  concurrencyPolicy?: 'Allow' | 'Forbid' | 'Replace';
  successfulJobsHistoryLimit?: number;
  failedJobsHistoryLimit?: number;
  
  // Job 特有
  completions?: number;
  parallelism?: number;
  backoffLimit?: number;
  activeDeadlineSeconds?: number;
  ttlSecondsAfterFinished?: number;
}

// 表单中调度策略的简化格式
export interface SchedulingFormData {
  // 节点亲和 - 必须满足
  nodeAffinityRequired?: Array<{
    key: string;
    operator: string;
    values: string;
  }>;
  // 节点亲和 - 尽量满足
  nodeAffinityPreferred?: Array<{
    weight: number;
    key: string;
    operator: string;
    values: string;
  }>;
  // Pod亲和 - 必须满足
  podAffinityRequired?: Array<{
    topologyKey: string;
    labelKey: string;
    operator: string;
    labelValues: string;
  }>;
  // Pod亲和 - 尽量满足
  podAffinityPreferred?: Array<{
    weight: number;
    topologyKey: string;
    labelKey: string;
    operator: string;
    labelValues: string;
  }>;
  // Pod反亲和 - 必须满足
  podAntiAffinityRequired?: Array<{
    topologyKey: string;
    labelKey: string;
    operator: string;
    labelValues: string;
  }>;
  // Pod反亲和 - 尽量满足
  podAntiAffinityPreferred?: Array<{
    weight: number;
    topologyKey: string;
    labelKey: string;
    operator: string;
    labelValues: string;
  }>;
}
/** genAI_main_end */

