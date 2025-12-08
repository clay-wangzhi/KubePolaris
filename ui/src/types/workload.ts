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

// 容器资源配置（支持 cpu、memory、ephemeral-storage、nvidia.com/gpu）
export interface ResourceConfig {
  limits?: {
    cpu?: string;
    memory?: string;
    'ephemeral-storage'?: string;  // 临时存储限制
    'nvidia.com/gpu'?: string;
  };
  requests?: {
    cpu?: string;
    memory?: string;
    'ephemeral-storage'?: string;  // 临时存储请求
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

// Argo Rollout 金丝雀发布步骤
export interface CanaryStep {
  // 设置流量权重
  setWeight?: number;
  // 暂停 - 可以是无限期暂停或指定时长
  pause?: {
    duration?: string;  // 例如: "10m", "1h"
  };
  // 设置金丝雀副本数比例
  setCanaryScale?: {
    replicas?: number;
    weight?: number;
    matchTrafficWeight?: boolean;
  };
  // 分析运行
  analysis?: {
    templates?: Array<{
      templateName: string;
    }>;
    args?: Array<{
      name: string;
      value: string;
    }>;
  };
}

// Argo Rollout 金丝雀策略配置
export interface CanaryStrategyConfig {
  // 发布步骤
  steps?: CanaryStep[];
  // 最大超量
  maxSurge?: string | number;
  // 最大不可用
  maxUnavailable?: string | number;
  // 金丝雀服务名称 (用于流量路由)
  canaryService?: string;
  // 稳定版本服务名称
  stableService?: string;
  // 流量路由配置
  trafficRouting?: {
    // Nginx Ingress
    nginx?: {
      stableIngress: string;
      annotationPrefix?: string;
      additionalIngressAnnotations?: Record<string, string>;
    };
    // Istio
    istio?: {
      virtualService?: {
        name: string;
        routes?: string[];
      };
      destinationRule?: {
        name: string;
        canarySubsetName?: string;
        stableSubsetName?: string;
      };
    };
    // ALB Ingress
    alb?: {
      ingress: string;
      servicePort: number;
      annotationPrefix?: string;
    };
  };
  // 分析配置
  analysis?: {
    templates?: Array<{
      templateName: string;
    }>;
    startingStep?: number;
    args?: Array<{
      name: string;
      value?: string;
      valueFrom?: {
        podTemplateHashValue?: 'Latest' | 'Stable';
        fieldRef?: {
          fieldPath: string;
        };
      };
    }>;
  };
  // 反亲和配置
  antiAffinity?: {
    requiredDuringSchedulingIgnoredDuringExecution?: Record<string, unknown>;
    preferredDuringSchedulingIgnoredDuringExecution?: {
      weight: number;
    };
  };
  // 金丝雀元数据
  canaryMetadata?: {
    labels?: Record<string, string>;
    annotations?: Record<string, string>;
  };
  // 稳定版本元数据
  stableMetadata?: {
    labels?: Record<string, string>;
    annotations?: Record<string, string>;
  };
}

// Argo Rollout 蓝绿发布策略配置
export interface BlueGreenStrategyConfig {
  // 活跃服务名称 (生产流量)
  activeService: string;
  // 预览服务名称 (测试流量)
  previewService?: string;
  // 自动晋升启用
  autoPromotionEnabled?: boolean;
  // 自动晋升延迟时间(秒)
  autoPromotionSeconds?: number;
  // 缩容延迟时间(秒)
  scaleDownDelaySeconds?: number;
  // 缩容延迟修订版本限制
  scaleDownDelayRevisionLimit?: number;
  // 预览副本数
  previewReplicaCount?: number;
  // 预览元数据
  previewMetadata?: {
    labels?: Record<string, string>;
    annotations?: Record<string, string>;
  };
  // 活跃元数据
  activeMetadata?: {
    labels?: Record<string, string>;
    annotations?: Record<string, string>;
  };
  // 反亲和配置
  antiAffinity?: {
    requiredDuringSchedulingIgnoredDuringExecution?: Record<string, unknown>;
    preferredDuringSchedulingIgnoredDuringExecution?: {
      weight: number;
    };
  };
  // 预晋升分析
  prePromotionAnalysis?: {
    templates?: Array<{
      templateName: string;
    }>;
    args?: Array<{
      name: string;
      value: string;
    }>;
  };
  // 后晋升分析
  postPromotionAnalysis?: {
    templates?: Array<{
      templateName: string;
    }>;
    args?: Array<{
      name: string;
      value: string;
    }>;
  };
}

// Argo Rollout 策略配置
export interface RolloutStrategyConfig {
  // 策略类型
  type: 'Canary' | 'BlueGreen';
  // 金丝雀策略
  canary?: CanaryStrategyConfig;
  // 蓝绿策略
  blueGreen?: BlueGreenStrategyConfig;
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
  
  // Argo Rollout 特有
  rolloutStrategy?: RolloutStrategyConfig;
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

