/** genAI_main_start */
import * as YAML from 'yaml';
import type { 
  WorkloadFormData, 
  ContainerConfig, 
  ProbeConfig, 
  VolumeConfig,
  SchedulingConfig,
  TolerationConfig,
} from '../types/workload';

// 辅助函数：将逗号分隔的字符串转为数组
const parseCommaString = (str: string | undefined): string[] => {
  if (!str) return [];
  return str.split(',').map(s => s.trim()).filter(s => s);
};

// 辅助函数：将文本转为命令数组（保持换行格式）
const parseCommandString = (str: string | string[] | undefined): string[] => {
  if (!str) return [];
  if (Array.isArray(str)) return str;
  // 按换行分割
  return str.split('\n').map(s => s.trim()).filter(s => s);
};

// 辅助函数：将命令数组转为文本（用于表单显示）
const commandArrayToString = (arr: string[] | undefined): string => {
  if (!arr || arr.length === 0) return '';
  return arr.join('\n');
};

// 构建探针配置
const buildProbeConfig = (probe: ProbeConfig & { enabled?: boolean; type?: string }): Record<string, unknown> | undefined => {
  if (!probe || !probe.enabled) return undefined;
  
  const config: Record<string, unknown> = {};
  
  if (probe.type === 'httpGet' && probe.httpGet) {
    config.httpGet = {
      path: probe.httpGet.path || '/',
      port: probe.httpGet.port || 80,
      ...(probe.httpGet.scheme && { scheme: probe.httpGet.scheme }),
    };
  } else if (probe.type === 'exec' && probe.exec?.command) {
    config.exec = {
      command: parseCommandString(probe.exec.command as unknown as string),
    };
  } else if (probe.type === 'tcpSocket' && probe.tcpSocket) {
    config.tcpSocket = {
      port: probe.tcpSocket.port,
    };
  }
  
  if (probe.initialDelaySeconds !== undefined) config.initialDelaySeconds = probe.initialDelaySeconds;
  if (probe.periodSeconds !== undefined) config.periodSeconds = probe.periodSeconds;
  if (probe.timeoutSeconds !== undefined) config.timeoutSeconds = probe.timeoutSeconds;
  if (probe.successThreshold !== undefined) config.successThreshold = probe.successThreshold;
  if (probe.failureThreshold !== undefined) config.failureThreshold = probe.failureThreshold;
  
  return Object.keys(config).length > 0 ? config : undefined;
};

// 构建容器配置
const buildContainerSpec = (container: ContainerConfig): Record<string, unknown> => {
  const spec: Record<string, unknown> = {
    name: container.name || 'main',
    image: container.image || 'nginx:latest',
  };
  
  if (container.imagePullPolicy) {
    spec.imagePullPolicy = container.imagePullPolicy;
  }
  
  // 启动命令
  if (container.command) {
    const cmd = parseCommandString(container.command as unknown as string);
    if (cmd.length > 0) spec.command = cmd;
  }
  if (container.args) {
    const args = parseCommandString(container.args as unknown as string);
    if (args.length > 0) spec.args = args;
  }
  if (container.workingDir) {
    spec.workingDir = container.workingDir;
  }
  
  // 端口
  if (container.ports && container.ports.length > 0) {
    spec.ports = container.ports.map(p => ({
      ...(p.name && { name: p.name }),
      containerPort: p.containerPort,
      ...(p.protocol && p.protocol !== 'TCP' && { protocol: p.protocol }),
    }));
  }
  
  // 环境变量
  if (container.env && container.env.length > 0) {
    spec.env = container.env.map(e => {
      if (e.valueFrom) {
        return { name: e.name, valueFrom: e.valueFrom };
      }
      return { name: e.name, value: e.value || '' };
    });
  }
  
  // 资源
  if (container.resources) {
    const resources: Record<string, Record<string, string>> = {};
    if (container.resources.requests) {
      resources.requests = {};
      if (container.resources.requests.cpu) resources.requests.cpu = container.resources.requests.cpu;
      if (container.resources.requests.memory) resources.requests.memory = container.resources.requests.memory;
    }
    if (container.resources.limits) {
      resources.limits = {};
      if (container.resources.limits.cpu) resources.limits.cpu = container.resources.limits.cpu;
      if (container.resources.limits.memory) resources.limits.memory = container.resources.limits.memory;
      if (container.resources.limits['nvidia.com/gpu']) resources.limits['nvidia.com/gpu'] = container.resources.limits['nvidia.com/gpu'];
    }
    if (Object.keys(resources).length > 0) spec.resources = resources;
  }
  
  // 数据卷挂载
  if (container.volumeMounts && container.volumeMounts.length > 0) {
    spec.volumeMounts = container.volumeMounts.map(vm => ({
      name: vm.name,
      mountPath: vm.mountPath,
      ...(vm.subPath && { subPath: vm.subPath }),
      ...(vm.readOnly && { readOnly: vm.readOnly }),
    }));
  }
  
  // 生命周期
  if (container.lifecycle) {
    const lifecycle: Record<string, unknown> = {};
    if (container.lifecycle.postStart?.exec?.command) {
      const cmd = parseCommandString(container.lifecycle.postStart.exec.command as unknown as string);
      if (cmd.length > 0) {
        lifecycle.postStart = { exec: { command: cmd } };
      }
    }
    if (container.lifecycle.preStop?.exec?.command) {
      const cmd = parseCommandString(container.lifecycle.preStop.exec.command as unknown as string);
      if (cmd.length > 0) {
        lifecycle.preStop = { exec: { command: cmd } };
      }
    }
    if (Object.keys(lifecycle).length > 0) spec.lifecycle = lifecycle;
  }
  
  // 健康检查
  const startupProbe = buildProbeConfig(container.startupProbe as ProbeConfig & { enabled?: boolean; type?: string });
  if (startupProbe) spec.startupProbe = startupProbe;
  
  const livenessProbe = buildProbeConfig(container.livenessProbe as ProbeConfig & { enabled?: boolean; type?: string });
  if (livenessProbe) spec.livenessProbe = livenessProbe;
  
  const readinessProbe = buildProbeConfig(container.readinessProbe as ProbeConfig & { enabled?: boolean; type?: string });
  if (readinessProbe) spec.readinessProbe = readinessProbe;
  
  return spec;
};

// 构建数据卷配置
const buildVolumeSpec = (volume: VolumeConfig): Record<string, unknown> => {
  const spec: Record<string, unknown> = {
    name: volume.name,
  };
  
  switch (volume.type) {
    case 'emptyDir':
      spec.emptyDir = volume.emptyDir || {};
      break;
    case 'hostPath':
      spec.hostPath = {
        path: volume.hostPath?.path || '',
        ...(volume.hostPath?.type && { type: volume.hostPath.type }),
      };
      break;
    case 'configMap':
      spec.configMap = {
        name: volume.configMap?.name || '',
        ...(volume.configMap?.items && { items: volume.configMap.items }),
        ...(volume.configMap?.defaultMode && { defaultMode: volume.configMap.defaultMode }),
      };
      break;
    case 'secret':
      spec.secret = {
        secretName: volume.secret?.secretName || '',
        ...(volume.secret?.items && { items: volume.secret.items }),
        ...(volume.secret?.defaultMode && { defaultMode: volume.secret.defaultMode }),
      };
      break;
    case 'persistentVolumeClaim':
      spec.persistentVolumeClaim = {
        claimName: volume.persistentVolumeClaim?.claimName || '',
        ...(volume.persistentVolumeClaim?.readOnly && { readOnly: volume.persistentVolumeClaim.readOnly }),
      };
      break;
  }
  
  return spec;
};

// 构建调度配置
const buildSchedulingSpec = (scheduling: SchedulingConfig | undefined, formData: WorkloadFormData): Record<string, unknown> | undefined => {
  if (!scheduling) return undefined;
  
  const affinity: Record<string, unknown> = {};
  
  // 节点亲和
  if (scheduling.nodeAffinity) {
    const nodeAffinity: Record<string, unknown> = {};
    
    // 必须满足
    if (scheduling.nodeAffinity.required && scheduling.nodeAffinity.required.nodeSelectorTerms?.length > 0) {
      nodeAffinity.requiredDuringSchedulingIgnoredDuringExecution = {
        nodeSelectorTerms: scheduling.nodeAffinity.required.nodeSelectorTerms,
      };
    }
    
    // 尽量满足
    if (scheduling.nodeAffinity.preferred && scheduling.nodeAffinity.preferred.length > 0) {
      nodeAffinity.preferredDuringSchedulingIgnoredDuringExecution = scheduling.nodeAffinity.preferred;
    }
    
    if (Object.keys(nodeAffinity).length > 0) affinity.nodeAffinity = nodeAffinity;
  }
  
  // Pod亲和
  if (scheduling.podAffinity) {
    const podAffinity: Record<string, unknown> = {};
    
    if (scheduling.podAffinity.required && scheduling.podAffinity.required.length > 0) {
      podAffinity.requiredDuringSchedulingIgnoredDuringExecution = scheduling.podAffinity.required;
    }
    if (scheduling.podAffinity.preferred && scheduling.podAffinity.preferred.length > 0) {
      podAffinity.preferredDuringSchedulingIgnoredDuringExecution = scheduling.podAffinity.preferred;
    }
    
    if (Object.keys(podAffinity).length > 0) affinity.podAffinity = podAffinity;
  }
  
  // Pod反亲和
  if (scheduling.podAntiAffinity) {
    const podAntiAffinity: Record<string, unknown> = {};
    
    if (scheduling.podAntiAffinity.required && scheduling.podAntiAffinity.required.length > 0) {
      podAntiAffinity.requiredDuringSchedulingIgnoredDuringExecution = scheduling.podAntiAffinity.required;
    }
    if (scheduling.podAntiAffinity.preferred && scheduling.podAntiAffinity.preferred.length > 0) {
      podAntiAffinity.preferredDuringSchedulingIgnoredDuringExecution = scheduling.podAntiAffinity.preferred;
    }
    
    if (Object.keys(podAntiAffinity).length > 0) affinity.podAntiAffinity = podAntiAffinity;
  }
  
  return Object.keys(affinity).length > 0 ? affinity : undefined;
};

// 从表单数据构建调度配置
const buildSchedulingFromForm = (formData: Record<string, unknown>): SchedulingConfig | undefined => {
  const scheduling = formData.scheduling as Record<string, unknown> | undefined;
  if (!scheduling) return undefined;
  
  const result: SchedulingConfig = {};
  
  // 节点亲和 - 必须满足
  const nodeAffinityRequired = scheduling.nodeAffinityRequired as Array<{
    key: string;
    operator: string;
    values: string;
  }> | undefined;
  
  if (nodeAffinityRequired && nodeAffinityRequired.length > 0) {
    result.nodeAffinity = result.nodeAffinity || {};
    result.nodeAffinity.required = {
      nodeSelectorTerms: [{
        matchExpressions: nodeAffinityRequired.map(item => ({
          key: item.key,
          operator: item.operator as 'In' | 'NotIn' | 'Exists' | 'DoesNotExist' | 'Gt' | 'Lt',
          values: parseCommaString(item.values),
        })),
      }],
    };
  }
  
  // 节点亲和 - 尽量满足
  const nodeAffinityPreferred = scheduling.nodeAffinityPreferred as Array<{
    weight: number;
    key: string;
    operator: string;
    values: string;
  }> | undefined;
  
  if (nodeAffinityPreferred && nodeAffinityPreferred.length > 0) {
    result.nodeAffinity = result.nodeAffinity || {};
    result.nodeAffinity.preferred = nodeAffinityPreferred.map(item => ({
      weight: item.weight,
      preference: {
        matchExpressions: [{
          key: item.key,
          operator: item.operator as 'In' | 'NotIn' | 'Exists' | 'DoesNotExist' | 'Gt' | 'Lt',
          values: parseCommaString(item.values),
        }],
      },
    }));
  }
  
  // Pod亲和 - 必须满足
  const podAffinityRequired = scheduling.podAffinityRequired as Array<{
    topologyKey: string;
    labelKey: string;
    operator: string;
    labelValues: string;
  }> | undefined;
  
  if (podAffinityRequired && podAffinityRequired.length > 0) {
    result.podAffinity = result.podAffinity || {};
    result.podAffinity.required = podAffinityRequired.map(item => ({
      topologyKey: item.topologyKey,
      labelSelector: {
        matchExpressions: [{
          key: item.labelKey,
          operator: item.operator as 'In' | 'NotIn' | 'Exists' | 'DoesNotExist',
          values: parseCommaString(item.labelValues),
        }],
      },
    }));
  }
  
  // Pod亲和 - 尽量满足
  const podAffinityPreferred = scheduling.podAffinityPreferred as Array<{
    weight: number;
    topologyKey: string;
    labelKey: string;
    operator: string;
    labelValues: string;
  }> | undefined;
  
  if (podAffinityPreferred && podAffinityPreferred.length > 0) {
    result.podAffinity = result.podAffinity || {};
    result.podAffinity.preferred = podAffinityPreferred.map(item => ({
      weight: item.weight,
      podAffinityTerm: {
        topologyKey: item.topologyKey,
        labelSelector: {
          matchExpressions: [{
            key: item.labelKey,
            operator: item.operator as 'In' | 'NotIn' | 'Exists' | 'DoesNotExist',
            values: parseCommaString(item.labelValues),
          }],
        },
      },
    }));
  }
  
  // Pod反亲和 - 必须满足
  const podAntiAffinityRequired = scheduling.podAntiAffinityRequired as Array<{
    topologyKey: string;
    labelKey: string;
    operator: string;
    labelValues: string;
  }> | undefined;
  
  if (podAntiAffinityRequired && podAntiAffinityRequired.length > 0) {
    result.podAntiAffinity = result.podAntiAffinity || {};
    result.podAntiAffinity.required = podAntiAffinityRequired.map(item => ({
      topologyKey: item.topologyKey,
      labelSelector: {
        matchExpressions: [{
          key: item.labelKey,
          operator: item.operator as 'In' | 'NotIn' | 'Exists' | 'DoesNotExist',
          values: parseCommaString(item.labelValues),
        }],
      },
    }));
  }
  
  // Pod反亲和 - 尽量满足
  const podAntiAffinityPreferred = scheduling.podAntiAffinityPreferred as Array<{
    weight: number;
    topologyKey: string;
    labelKey: string;
    operator: string;
    labelValues: string;
  }> | undefined;
  
  if (podAntiAffinityPreferred && podAntiAffinityPreferred.length > 0) {
    result.podAntiAffinity = result.podAntiAffinity || {};
    result.podAntiAffinity.preferred = podAntiAffinityPreferred.map(item => ({
      weight: item.weight,
      podAffinityTerm: {
        topologyKey: item.topologyKey,
        labelSelector: {
          matchExpressions: [{
            key: item.labelKey,
            operator: item.operator as 'In' | 'NotIn' | 'Exists' | 'DoesNotExist',
            values: parseCommaString(item.labelValues),
          }],
        },
      },
    }));
  }
  
  return Object.keys(result).length > 0 ? result : undefined;
};

// 主转换函数：表单数据 -> YAML
export const formDataToYAML = (
  workloadType: 'Deployment' | 'StatefulSet' | 'DaemonSet' | 'Rollout' | 'Job' | 'CronJob',
  formData: WorkloadFormData
): string => {
  // 解析 labels 和 annotations
  const labels: Record<string, string> = {};
  if (formData.labels && formData.labels.length > 0) {
    formData.labels.forEach(item => {
      if (item.key && item.value) {
        labels[item.key] = item.value;
      }
    });
  }
  if (Object.keys(labels).length === 0) {
    labels.app = formData.name || 'app';
  }
  
  const annotations: Record<string, string> = {};
  // 将描述添加到 annotations
  if (formData.description) {
    annotations['description'] = formData.description;
  }
  if (formData.annotations && formData.annotations.length > 0) {
    formData.annotations.forEach(item => {
      if (item.key && item.value) {
        annotations[item.key] = item.value;
      }
    });
  }
  
  // 构建 metadata (使用 labels 副本避免 YAML 锚点)
  const metadata: Record<string, unknown> = {
    name: formData.name || 'example',
    namespace: formData.namespace || 'default',
    labels: { ...labels },
    ...(Object.keys(annotations).length > 0 && { annotations }),
  };
  
  // 构建容器列表
  const containers = (formData.containers || []).map(c => buildContainerSpec(c));
  const initContainers = (formData.initContainers || []).map(c => buildContainerSpec(c));
  
  // 构建数据卷
  const volumes = (formData.volumes || []).map(v => buildVolumeSpec(v));
  
  // 构建调度配置
  const scheduling = buildSchedulingFromForm(formData as unknown as Record<string, unknown>);
  const affinity = buildSchedulingSpec(scheduling, formData);
  
  // 构建 PodSpec
  const podSpec: Record<string, unknown> = {
    containers,
    ...(initContainers.length > 0 && { initContainers }),
    ...(volumes.length > 0 && { volumes }),
    ...(affinity && { affinity }),
    ...(formData.nodeSelector && Object.keys(formData.nodeSelector).length > 0 && { nodeSelector: formData.nodeSelector }),
    ...(formData.tolerations && formData.tolerations.length > 0 && {
      tolerations: formData.tolerations.map(t => ({
        ...(t.key && { key: t.key }),
        operator: t.operator,
        ...(t.value && { value: t.value }),
        ...(t.effect && { effect: t.effect }),
        ...(t.tolerationSeconds !== undefined && { tolerationSeconds: t.tolerationSeconds }),
      })),
    }),
    ...(formData.dnsPolicy && { dnsPolicy: formData.dnsPolicy }),
    ...(formData.dnsConfig && {
      dnsConfig: {
        ...(formData.dnsConfig.nameservers && { nameservers: parseCommaString(formData.dnsConfig.nameservers as unknown as string) }),
        ...(formData.dnsConfig.searches && { searches: parseCommaString(formData.dnsConfig.searches as unknown as string) }),
      },
    }),
    ...(formData.terminationGracePeriodSeconds !== undefined && { terminationGracePeriodSeconds: formData.terminationGracePeriodSeconds }),
    ...(formData.hostNetwork && { hostNetwork: formData.hostNetwork }),
    ...(formData.imagePullSecrets && formData.imagePullSecrets.length > 0 && {
      imagePullSecrets: formData.imagePullSecrets.map(s => ({ name: s })),
    }),
  };
  
  // 构建 PodTemplateSpec (使用 labels 副本避免 YAML 锚点)
  const podTemplateSpec = {
    metadata: { labels: { ...labels } },
    spec: podSpec,
  };
  
  // 根据工作负载类型构建不同的 spec
  let workloadSpec: Record<string, unknown>;
  
  switch (workloadType) {
    case 'Deployment':
      workloadSpec = {
        apiVersion: 'apps/v1',
        kind: 'Deployment',
        metadata,
        spec: {
          replicas: formData.replicas ?? 1,
          selector: { matchLabels: { ...labels } },
          template: podTemplateSpec,
          ...(formData.strategy && {
            strategy: {
              type: formData.strategy.type,
              ...(formData.strategy.type === 'RollingUpdate' && formData.strategy.rollingUpdate && {
                rollingUpdate: formData.strategy.rollingUpdate,
              }),
            },
          }),
          ...(formData.minReadySeconds !== undefined && { minReadySeconds: formData.minReadySeconds }),
          ...(formData.revisionHistoryLimit !== undefined && { revisionHistoryLimit: formData.revisionHistoryLimit }),
          ...(formData.progressDeadlineSeconds !== undefined && { progressDeadlineSeconds: formData.progressDeadlineSeconds }),
        },
      };
      break;
      
    case 'StatefulSet':
      workloadSpec = {
        apiVersion: 'apps/v1',
        kind: 'StatefulSet',
        metadata,
        spec: {
          replicas: formData.replicas ?? 1,
          serviceName: formData.serviceName || formData.name,
          selector: { matchLabels: { ...labels } },
          template: podTemplateSpec,
          ...(formData.podManagementPolicy && { podManagementPolicy: formData.podManagementPolicy }),
        },
      };
      break;
      
    case 'DaemonSet':
      workloadSpec = {
        apiVersion: 'apps/v1',
        kind: 'DaemonSet',
        metadata,
        spec: {
          selector: { matchLabels: { ...labels } },
          template: podTemplateSpec,
        },
      };
      break;
      
    case 'Job':
      workloadSpec = {
        apiVersion: 'batch/v1',
        kind: 'Job',
        metadata,
        spec: {
          template: {
            ...podTemplateSpec,
            spec: {
              ...podSpec,
              restartPolicy: 'Never',
            },
          },
          ...(formData.completions !== undefined && { completions: formData.completions }),
          ...(formData.parallelism !== undefined && { parallelism: formData.parallelism }),
          ...(formData.backoffLimit !== undefined && { backoffLimit: formData.backoffLimit }),
          ...(formData.activeDeadlineSeconds !== undefined && { activeDeadlineSeconds: formData.activeDeadlineSeconds }),
          ...(formData.ttlSecondsAfterFinished !== undefined && { ttlSecondsAfterFinished: formData.ttlSecondsAfterFinished }),
        },
      };
      break;
      
    case 'CronJob':
      workloadSpec = {
        apiVersion: 'batch/v1',
        kind: 'CronJob',
        metadata,
        spec: {
          schedule: formData.schedule || '0 0 * * *',
          ...(formData.suspend !== undefined && { suspend: formData.suspend }),
          ...(formData.concurrencyPolicy && { concurrencyPolicy: formData.concurrencyPolicy }),
          ...(formData.successfulJobsHistoryLimit !== undefined && { successfulJobsHistoryLimit: formData.successfulJobsHistoryLimit }),
          ...(formData.failedJobsHistoryLimit !== undefined && { failedJobsHistoryLimit: formData.failedJobsHistoryLimit }),
          jobTemplate: {
            spec: {
              template: {
                ...podTemplateSpec,
                spec: {
                  ...podSpec,
                  restartPolicy: 'Never',
                },
              },
            },
          },
        },
      };
      break;
      
    case 'Rollout':
      workloadSpec = {
        apiVersion: 'argoproj.io/v1alpha1',
        kind: 'Rollout',
        metadata,
        spec: {
          replicas: formData.replicas ?? 1,
          selector: { matchLabels: { ...labels } },
          template: podTemplateSpec,
          ...(formData.strategy && {
            strategy: {
              canary: {
                ...(formData.strategy.rollingUpdate?.maxUnavailable && { maxUnavailable: formData.strategy.rollingUpdate.maxUnavailable }),
                ...(formData.strategy.rollingUpdate?.maxSurge && { maxSurge: formData.strategy.rollingUpdate.maxSurge }),
              },
            },
          }),
        },
      };
      break;
      
    default:
      workloadSpec = {
        apiVersion: 'apps/v1',
        kind: workloadType,
        metadata,
        spec: {
          replicas: formData.replicas ?? 1,
          selector: { matchLabels: { ...labels } },
          template: podTemplateSpec,
        },
      };
  }
  
  return YAML.stringify(workloadSpec, { lineWidth: 0 });
};

// YAML -> 表单数据
export const yamlToFormData = (yamlContent: string): WorkloadFormData | null => {
  try {
    const obj = YAML.parse(yamlContent);
    if (!obj) return null;
    
    const metadata = obj.metadata || {};
    const spec = obj.spec || {};
    
    // 确定 podSpec 的位置
    let podSpec: Record<string, unknown>;
    if (obj.kind === 'CronJob') {
      podSpec = spec.jobTemplate?.spec?.template?.spec || {};
    } else if (obj.kind === 'Job') {
      podSpec = spec.template?.spec || {};
    } else {
      podSpec = spec.template?.spec || {};
    }
    
    // 解析探针，添加 enabled 和 type 字段
    const parseProbe = (probe: Record<string, unknown> | undefined) => {
      if (!probe) return undefined;
      let type = 'httpGet';
      if (probe.exec) type = 'exec';
      else if (probe.tcpSocket) type = 'tcpSocket';
      
      const result: Record<string, unknown> = {
        enabled: true,
        type,
      };
      
      // 复制其他属性
      Object.keys(probe).forEach(key => {
        if (key !== 'exec') {
          result[key] = probe[key];
        }
      });
      
      // 将 exec.command 转为字符串形式
      if (probe.exec) {
        result.exec = {
          command: commandArrayToString((probe.exec as Record<string, unknown>).command as string[]),
        };
      }
      
      return result;
    };
    
    // 解析容器
    const containers: ContainerConfig[] = ((podSpec.containers as Record<string, unknown>[]) || []).map((c) => ({
      name: c.name as string || 'main',
      image: c.image as string || '',
      imagePullPolicy: c.imagePullPolicy as 'Always' | 'IfNotPresent' | 'Never' | undefined,
      // 将命令数组转为换行分隔的字符串
      command: commandArrayToString(c.command as string[]) as unknown as string[],
      args: commandArrayToString(c.args as string[]) as unknown as string[],
      workingDir: c.workingDir as string | undefined,
      ports: c.ports as ContainerConfig['ports'],
      env: c.env as ContainerConfig['env'],
      resources: c.resources as ContainerConfig['resources'],
      volumeMounts: c.volumeMounts as ContainerConfig['volumeMounts'],
      lifecycle: c.lifecycle ? {
        postStart: (c.lifecycle as Record<string, unknown>).postStart ? {
          exec: {
            command: commandArrayToString(
              ((c.lifecycle as Record<string, unknown>).postStart as Record<string, unknown>)?.exec 
                ? (((c.lifecycle as Record<string, unknown>).postStart as Record<string, unknown>).exec as Record<string, unknown>).command as string[]
                : undefined
            ) as unknown as string[],
          },
        } : undefined,
        preStop: (c.lifecycle as Record<string, unknown>).preStop ? {
          exec: {
            command: commandArrayToString(
              ((c.lifecycle as Record<string, unknown>).preStop as Record<string, unknown>)?.exec 
                ? (((c.lifecycle as Record<string, unknown>).preStop as Record<string, unknown>).exec as Record<string, unknown>).command as string[]
                : undefined
            ) as unknown as string[],
          },
        } : undefined,
      } : undefined,
      livenessProbe: parseProbe(c.livenessProbe as Record<string, unknown>) as ContainerConfig['livenessProbe'],
      readinessProbe: parseProbe(c.readinessProbe as Record<string, unknown>) as ContainerConfig['readinessProbe'],
      startupProbe: parseProbe(c.startupProbe as Record<string, unknown>) as ContainerConfig['startupProbe'],
    }));
    
    // 解析 init 容器
    const initContainers: ContainerConfig[] = ((podSpec.initContainers as Record<string, unknown>[]) || []).map((c) => ({
      name: c.name as string || 'init',
      image: c.image as string || '',
      imagePullPolicy: c.imagePullPolicy as 'Always' | 'IfNotPresent' | 'Never' | undefined,
      command: commandArrayToString(c.command as string[]) as unknown as string[],
      args: commandArrayToString(c.args as string[]) as unknown as string[],
      workingDir: c.workingDir as string | undefined,
      env: c.env as ContainerConfig['env'],
      resources: c.resources as ContainerConfig['resources'],
      volumeMounts: c.volumeMounts as ContainerConfig['volumeMounts'],
    }));
    
    // 解析 labels 和 annotations
    const labels = metadata.labels 
      ? Object.entries(metadata.labels).map(([key, value]) => ({ key, value: String(value) }))
      : [];
    const annotations = metadata.annotations
      ? Object.entries(metadata.annotations).map(([key, value]) => ({ key, value: String(value) }))
      : [];
    
    // 解析数据卷
    const volumes: VolumeConfig[] = ((podSpec.volumes as Record<string, unknown>[]) || []).map((v) => {
      let type: VolumeConfig['type'] = 'emptyDir';
      if (v.hostPath) type = 'hostPath';
      else if (v.configMap) type = 'configMap';
      else if (v.secret) type = 'secret';
      else if (v.persistentVolumeClaim) type = 'persistentVolumeClaim';
      
      return {
        name: v.name as string,
        type,
        emptyDir: v.emptyDir as VolumeConfig['emptyDir'],
        hostPath: v.hostPath as VolumeConfig['hostPath'],
        configMap: v.configMap as VolumeConfig['configMap'],
        secret: v.secret as VolumeConfig['secret'],
        persistentVolumeClaim: v.persistentVolumeClaim as VolumeConfig['persistentVolumeClaim'],
      };
    });
    
    // 解析容忍
    const tolerations: TolerationConfig[] = ((podSpec.tolerations as Record<string, unknown>[]) || []).map((t) => ({
      key: t.key as string | undefined,
      operator: t.operator as 'Equal' | 'Exists' || 'Equal',
      value: t.value as string | undefined,
      effect: t.effect as TolerationConfig['effect'],
      tolerationSeconds: t.tolerationSeconds as number | undefined,
    }));
    
    // 解析镜像拉取凭证
    const imagePullSecrets = ((podSpec.imagePullSecrets as Record<string, unknown>[]) || []).map((s) => s.name as string);
    
    const formData: WorkloadFormData = {
      name: metadata.name || '',
      namespace: metadata.namespace || 'default',
      description: metadata.annotations?.description as string | undefined,
      replicas: spec.replicas as number | undefined,
      labels,
      annotations,
      containers,
      initContainers: initContainers.length > 0 ? initContainers : undefined,
      volumes: volumes.length > 0 ? volumes : undefined,
      imagePullSecrets: imagePullSecrets.length > 0 ? imagePullSecrets : undefined,
      tolerations: tolerations.length > 0 ? tolerations : undefined,
      strategy: spec.strategy as WorkloadFormData['strategy'],
      minReadySeconds: spec.minReadySeconds as number | undefined,
      revisionHistoryLimit: spec.revisionHistoryLimit as number | undefined,
      progressDeadlineSeconds: spec.progressDeadlineSeconds as number | undefined,
      terminationGracePeriodSeconds: podSpec.terminationGracePeriodSeconds as number | undefined,
      dnsPolicy: podSpec.dnsPolicy as WorkloadFormData['dnsPolicy'],
      dnsConfig: podSpec.dnsConfig as WorkloadFormData['dnsConfig'],
      hostNetwork: podSpec.hostNetwork as boolean | undefined,
      // StatefulSet
      serviceName: spec.serviceName as string | undefined,
      // CronJob
      schedule: spec.schedule as string | undefined,
      suspend: spec.suspend as boolean | undefined,
      concurrencyPolicy: spec.concurrencyPolicy as WorkloadFormData['concurrencyPolicy'],
      // Job
      completions: spec.completions as number | undefined,
      parallelism: spec.parallelism as number | undefined,
      backoffLimit: spec.backoffLimit as number | undefined,
      activeDeadlineSeconds: spec.activeDeadlineSeconds as number | undefined,
    };
    
    return formData;
  } catch (error) {
    console.error('YAML 解析错误:', error);
    return null;
  }
};

// 导出服务对象
export const WorkloadYamlService = {
  formDataToYAML,
  yamlToFormData,
};

export default WorkloadYamlService;
/** genAI_main_end */

