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
  cpuLimit?: string;
  cpuRequest?: string;
  memoryLimit?: string;
  memoryRequest?: string;
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
    yaml?: string;  // 原始 YAML 字符串（保持原始格式）
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
  // 检查集群是否安装了 Argo Rollouts CRD
  static async checkRolloutCRD(
    clusterId: string
  ): Promise<{ code: number; message: string; data: { enabled: boolean } }> {
    return request.get(`/clusters/${clusterId}/rollouts/crd-check`);
  }

  // 获取工作负载列表
  static async getWorkloads(
    clusterId: string,
    namespace?: string,
    workloadType?: string,
    page = 1,
    pageSize = 20,
    search?: string
  ): Promise<WorkloadListResponse> {
    const params = new URLSearchParams({
      page: page.toString(),
      pageSize: pageSize.toString(),
    });
    
    if (namespace) {
      params.append('namespace', namespace);
    }
    
    if (search) {
      params.append('search', search);
    }
    
    // 根据workloadType路由到不同的后端API端点
    let endpoint = `/clusters/${clusterId}/`;
    switch (workloadType) {
      case 'Deployment':
        endpoint += 'deployments';
        break;
      case 'Rollout':
        endpoint += 'rollouts';
        break;
      case 'StatefulSet':
        endpoint += 'statefulsets';
        break;
      case 'DaemonSet':
        endpoint += 'daemonsets';
        params.append('type', 'DaemonSet'); // 临时保留
        break;
      case 'Job':
        endpoint += 'jobs';
        params.append('type', 'Job'); // 临时保留
        break;
      case 'CronJob':
        endpoint += 'cronjobs';
        params.append('type', 'CronJob'); // 临时保留
        break;
      default:
        endpoint += 'workloads';
        if (workloadType) {
          params.append('type', workloadType);
        }
    }
    
    return request.get(`${endpoint}?${params}`);
  }

  // 获取工作负载命名空间列表
  static async getWorkloadNamespaces(
    clusterId: string,
    workloadType?: string
  ): Promise<{ code: number; message: string; data: Array<{ name: string; count: number }> }> {
    // 根据workloadType路由到不同的后端API端点
    let endpoint = `/clusters/${clusterId}/`;
    const params = new URLSearchParams();
    
    switch (workloadType) {
      case 'Deployment':
        endpoint += 'deployments/namespaces';
        break;
      case 'Rollout':
        endpoint += 'rollouts/namespaces';
        break;
      case 'StatefulSet':
        endpoint += 'statefulsets/namespaces';
        break;
      case 'DaemonSet':
        endpoint += 'daemonsets/namespaces';
        params.append('type', 'DaemonSet');
        break;
      case 'Job':
        endpoint += 'jobs/namespaces';
        params.append('type', 'Job');
        break;
      case 'CronJob':
        endpoint += 'cronjobs/namespaces';
        params.append('type', 'CronJob');
        break;
      default:
        endpoint += 'workloads/namespaces';
        if (workloadType) {
          params.append('type', workloadType);
        }
    }
    
    return request.get(`${endpoint}?${params}`);
  }

  // 获取工作负载详情
  static async getWorkloadDetail(
    clusterId: string,
    workloadType: string,
    namespace: string,
    name: string
  ): Promise<WorkloadDetailResponse> {
    let endpoint = `/clusters/${clusterId}/`;
    switch (workloadType) {
      case 'Deployment':
        endpoint += `deployments/${namespace}/${name}`;
        break;
      case 'Rollout':
        endpoint += `rollouts/${namespace}/${name}`;
        break;
      case 'StatefulSet':
        endpoint += `statefulsets/${namespace}/${name}`;
        break;
      case 'DaemonSet':
        endpoint += `daemonsets/${namespace}/${name}?type=${workloadType}`;
        break;
      case 'Job':
        endpoint += `jobs/${namespace}/${name}?type=${workloadType}`;
        break;
      case 'CronJob':
        endpoint += `cronjobs/${namespace}/${name}?type=${workloadType}`;
        break;
      default:
        endpoint += `workloads/${namespace}/${name}?type=${workloadType}`;
    }
    return request.get(endpoint);
  }

  // 扩缩容工作负载
  static async scaleWorkload(
    clusterId: string,
    namespace: string,
    name: string,
    type: string,
    replicas: number
  ): Promise<any> {
    let endpoint = `/clusters/${clusterId}/`;
    switch (type) {
      case 'Deployment':
        endpoint += `deployments/${namespace}/${name}/scale`;
        break;
      case 'Rollout':
        endpoint += `rollouts/${namespace}/${name}/scale`;
        break;
      case 'StatefulSet':
        endpoint += `statefulsets/${namespace}/${name}/scale`;
        break;
      default:
        endpoint += `workloads/${namespace}/${name}/scale?type=${type}`;
    }
    return request.post(endpoint, { replicas });
  }

  // 删除工作负载
  static async deleteWorkload(
    clusterId: string,
    namespace: string,
    name: string,
    type: string
  ): Promise<any> {
    let endpoint = `/clusters/${clusterId}/`;
    switch (type) {
      case 'Deployment':
        endpoint += `deployments/${namespace}/${name}`;
        break;
      case 'Rollout':
        endpoint += `rollouts/${namespace}/${name}`;
        break;
      case 'StatefulSet':
        endpoint += `statefulsets/${namespace}/${name}`;
        break;
      case 'DaemonSet':
        endpoint += `daemonsets/${namespace}/${name}`;
        break;
      case 'Job':
        endpoint += `jobs/${namespace}/${name}`;
        break;
      case 'CronJob':
        endpoint += `cronjobs/${namespace}/${name}`;
        break;
      default:
        endpoint += `workloads/${namespace}/${name}?type=${type}`;
    }
    return request.delete(endpoint);
  }

  // 重新部署工作负载（重启）
  static async restartWorkload(
    clusterId: string,
    namespace: string,
    name: string,
    type: string
  ): Promise<any> {
    let endpoint = `/clusters/${clusterId}/`;
    switch (type) {
      case 'Deployment':
        endpoint += `deployments/${namespace}/${name}/restart`;
        break;
      case 'Rollout':
        endpoint += `rollouts/${namespace}/${name}/restart`;
        break;
      case 'StatefulSet':
        endpoint += `statefulsets/${namespace}/${name}/restart`;
        break;
      case 'DaemonSet':
        endpoint += `daemonsets/${namespace}/${name}/restart`;
        break;
      default:
        endpoint += `workloads/${namespace}/${name}/restart?type=${type}`;
    }
    return request.post(endpoint);
  }

  // 应用YAML
  static async applyYAML(
    clusterId: string,
    yaml: string,
    dryRun = false
  ): Promise<any> {
    // 解析YAML中的kind来确定使用哪个endpoint
    try {
      const kindMatch = yaml.match(/kind:\s*(\w+)/);
      if (kindMatch) {
        const kind = kindMatch[1];
        let endpoint = `/clusters/${clusterId}/`;
        switch (kind) {
          case 'Deployment':
            endpoint += 'deployments/yaml/apply';
            break;
          case 'Rollout':
            endpoint += 'rollouts/yaml/apply';
            break;
          case 'StatefulSet':
            endpoint += 'statefulsets/yaml/apply';
            break;
          case 'DaemonSet':
            endpoint += 'daemonsets/yaml/apply';
            break;
          case 'Job':
            endpoint += 'jobs/yaml/apply';
            break;
          case 'CronJob':
            endpoint += 'cronjobs/yaml/apply';
            break;
          default:
            endpoint += 'workloads/yaml/apply';
        }
        return request.post(endpoint, { yaml, dryRun });
      }
    } catch (e) {
      // fallback to default
    }
    return request.post(`/clusters/${clusterId}/workloads/yaml/apply`, {
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

  // 表单数据转YAML
  static formDataToYAML(
    workloadType: 'Deployment' | 'StatefulSet' | 'DaemonSet' | 'Rollout' | 'Job' | 'CronJob',
    formData: any
  ): string {
    // 解析labels和annotations
    const parseKeyValue = (str: string): Record<string, string> => {
      if (!str) return {};
      const result: Record<string, string> = {};
      str.split(',').forEach((item) => {
        const [key, value] = item.split('=');
        if (key && value) {
          result[key.trim()] = value.trim();
        }
      });
      return result;
    };

    // 处理 labels（支持数组和对象格式）
    let labels: Record<string, string> = {};
    if (Array.isArray(formData.labels)) {
      formData.labels.forEach((item: { key: string; value: string }) => {
        if (item.key && item.value) {
          labels[item.key] = item.value;
        }
      });
    } else if (typeof formData.labels === 'string') {
      labels = parseKeyValue(formData.labels);
    } else if (formData.labels) {
      labels = formData.labels;
    }

    // 处理 annotations（支持数组和对象格式）
    let annotations: Record<string, string> = {};
    if (Array.isArray(formData.annotations)) {
      formData.annotations.forEach((item: { key: string; value: string }) => {
        if (item.key && item.value) {
          annotations[item.key] = item.value;
        }
      });
    } else if (typeof formData.annotations === 'string') {
      annotations = parseKeyValue(formData.annotations);
    } else if (formData.annotations) {
      annotations = formData.annotations;
    }

    // 基础metadata - 确保 name 不为 undefined
    const workloadName = formData.name || `example-${workloadType.toLowerCase()}`;
    const metadata = {
      name: workloadName,
      namespace: formData.namespace || 'default',
      labels: Object.keys(labels).length > 0 ? labels : { app: workloadName },
      ...(Object.keys(annotations).length > 0 && { annotations }),
    };

    // 构建容器 YAML 字符串的辅助函数
    const buildContainerYAML = (): string => {
      // 确保 image 不为 undefined
      const containerImage = formData.image || 'nginx:latest';
      const containerName = formData.containerName || 'main';
      
      let containerYAML = `      - name: ${containerName}
        image: ${containerImage}`;
      
      if (formData.imagePullPolicy) {
        containerYAML += `\n        imagePullPolicy: ${formData.imagePullPolicy}`;
      }
      
      if (formData.containerPort) {
        containerYAML += `\n        ports:\n        - containerPort: ${formData.containerPort}`;
      }
      
      if (formData.env && formData.env.length > 0) {
        containerYAML += `\n        env:`;
        formData.env.forEach((e: { name: string; value: string }) => {
          containerYAML += `\n        - name: ${e.name}\n          value: "${e.value}"`;
        });
      }
      
      if (formData.resources) {
        containerYAML += `\n        resources:`;
        if (formData.resources.requests) {
          containerYAML += `\n          requests:`;
          if (formData.resources.requests.cpu) {
            containerYAML += `\n            cpu: ${formData.resources.requests.cpu}`;
          }
          if (formData.resources.requests.memory) {
            containerYAML += `\n            memory: ${formData.resources.requests.memory}`;
          }
        }
        if (formData.resources.limits) {
          containerYAML += `\n          limits:`;
          if (formData.resources.limits.cpu) {
            containerYAML += `\n            cpu: ${formData.resources.limits.cpu}`;
          }
          if (formData.resources.limits.memory) {
            containerYAML += `\n            memory: ${formData.resources.limits.memory}`;
          }
        }
      }
      
      // 生命周期
      if (formData.lifecycle) {
        containerYAML += `\n        lifecycle:`;
        if (formData.lifecycle.postStart?.exec?.command) {
          const cmd = Array.isArray(formData.lifecycle.postStart.exec.command)
            ? formData.lifecycle.postStart.exec.command
            : formData.lifecycle.postStart.exec.command.split(',');
          containerYAML += `\n          postStart:\n            exec:\n              command: [${cmd.map((c: string) => `"${c.trim()}"`).join(', ')}]`;
        }
        if (formData.lifecycle.preStop?.exec?.command) {
          const cmd = Array.isArray(formData.lifecycle.preStop.exec.command)
            ? formData.lifecycle.preStop.exec.command
            : formData.lifecycle.preStop.exec.command.split(',');
          containerYAML += `\n          preStop:\n            exec:\n              command: [${cmd.map((c: string) => `"${c.trim()}"`).join(', ')}]`;
        }
      }
      
      // 健康检查
      if (formData.livenessProbe) {
        containerYAML += `\n        livenessProbe:`;
        if (formData.livenessProbe.httpGet) {
          containerYAML += `\n          httpGet:\n            path: ${formData.livenessProbe.httpGet.path}\n            port: ${formData.livenessProbe.httpGet.port}`;
        }
        if (formData.livenessProbe.initialDelaySeconds !== undefined) {
          containerYAML += `\n          initialDelaySeconds: ${formData.livenessProbe.initialDelaySeconds}`;
        }
        if (formData.livenessProbe.periodSeconds !== undefined) {
          containerYAML += `\n          periodSeconds: ${formData.livenessProbe.periodSeconds}`;
        }
        if (formData.livenessProbe.failureThreshold !== undefined) {
          containerYAML += `\n          failureThreshold: ${formData.livenessProbe.failureThreshold}`;
        }
      }
      
      if (formData.readinessProbe) {
        containerYAML += `\n        readinessProbe:`;
        if (formData.readinessProbe.httpGet) {
          containerYAML += `\n          httpGet:\n            path: ${formData.readinessProbe.httpGet.path}\n            port: ${formData.readinessProbe.httpGet.port}`;
        }
        if (formData.readinessProbe.initialDelaySeconds !== undefined) {
          containerYAML += `\n          initialDelaySeconds: ${formData.readinessProbe.initialDelaySeconds}`;
        }
        if (formData.readinessProbe.periodSeconds !== undefined) {
          containerYAML += `\n          periodSeconds: ${formData.readinessProbe.periodSeconds}`;
        }
        if (formData.readinessProbe.failureThreshold !== undefined) {
          containerYAML += `\n          failureThreshold: ${formData.readinessProbe.failureThreshold}`;
        }
      }
      
      // 安全上下文
      if (formData.securityContext) {
        containerYAML += `\n        securityContext:`;
        if (formData.securityContext.privileged !== undefined) {
          containerYAML += `\n          privileged: ${formData.securityContext.privileged}`;
        }
        if (formData.securityContext.runAsUser !== undefined) {
          containerYAML += `\n          runAsUser: ${formData.securityContext.runAsUser}`;
        }
        if (formData.securityContext.runAsGroup !== undefined) {
          containerYAML += `\n          runAsGroup: ${formData.securityContext.runAsGroup}`;
        }
        if (formData.securityContext.runAsNonRoot !== undefined) {
          containerYAML += `\n          runAsNonRoot: ${formData.securityContext.runAsNonRoot}`;
        }
        if (formData.securityContext.readOnlyRootFilesystem !== undefined) {
          containerYAML += `\n          readOnlyRootFilesystem: ${formData.securityContext.readOnlyRootFilesystem}`;
        }
        if (formData.securityContext.allowPrivilegeEscalation !== undefined) {
          containerYAML += `\n          allowPrivilegeEscalation: ${formData.securityContext.allowPrivilegeEscalation}`;
        }
      }
      
      return containerYAML;
    };
    
    // 构建 PodSpec YAML 字符串的辅助函数
    const buildPodSpecYAML = (): string => {
      let podSpecYAML = buildContainerYAML();
      
      // 数据卷挂载（添加到容器）
      if (formData.volumes && formData.volumes.length > 0) {
        const volumeMounts = formData.volumes.map((vol: any) => 
          `\n        - name: ${vol.name}\n          mountPath: ${vol.mountPath}${vol.readOnly ? '\n          readOnly: true' : ''}`
        ).join('');
        podSpecYAML += `\n        volumeMounts:${volumeMounts}`;
      }
      
      // 镜像拉取密钥
      if (formData.imagePullSecrets && formData.imagePullSecrets.length > 0) {
        podSpecYAML += `\n      imagePullSecrets:`;
        formData.imagePullSecrets.forEach((secret: string) => {
          podSpecYAML += `\n      - name: ${secret}`;
        });
      }
      
      // 节点选择器
      if (formData.nodeSelectorList && formData.nodeSelectorList.length > 0) {
        podSpecYAML += `\n      nodeSelector:`;
        formData.nodeSelectorList.forEach((item: { key: string; value: string }) => {
          podSpecYAML += `\n        ${item.key}: ${item.value}`;
        });
      }
      
      // 容忍策略
      if (formData.tolerations && formData.tolerations.length > 0) {
        podSpecYAML += `\n      tolerations:`;
        formData.tolerations.forEach((tol: any) => {
          podSpecYAML += `\n      - key: ${tol.key}\n        operator: ${tol.operator}\n        effect: ${tol.effect}`;
          if (tol.value) {
            podSpecYAML += `\n        value: ${tol.value}`;
          }
          if (tol.tolerationSeconds !== undefined) {
            podSpecYAML += `\n        tolerationSeconds: ${tol.tolerationSeconds}`;
          }
        });
      }
      
      // DNS配置
      if (formData.dnsPolicy) {
        podSpecYAML += `\n      dnsPolicy: ${formData.dnsPolicy}`;
      }
      if (formData.dnsConfig) {
        podSpecYAML += `\n      dnsConfig:`;
        if (formData.dnsConfig.nameservers && formData.dnsConfig.nameservers.length > 0) {
          podSpecYAML += `\n        nameservers: [${formData.dnsConfig.nameservers.map((ns: string) => `"${ns}"`).join(', ')}]`;
        }
        if (formData.dnsConfig.searches && formData.dnsConfig.searches.length > 0) {
          podSpecYAML += `\n        searches: [${formData.dnsConfig.searches.map((s: string) => `"${s}"`).join(', ')}]`;
        }
      }
      
      // 终止宽限期
      if (formData.terminationGracePeriodSeconds !== undefined) {
        podSpecYAML += `\n      terminationGracePeriodSeconds: ${formData.terminationGracePeriodSeconds}`;
      }
      
      return podSpecYAML;
    };

    let yaml = '';

    switch (workloadType) {
      case 'Deployment':
        let deploymentStrategy = '';
        if (formData.strategy) {
          if (formData.strategy.type === 'Recreate') {
            deploymentStrategy = `\n  strategy:\n    type: Recreate`;
          } else if (formData.strategy.type === 'RollingUpdate' && formData.strategy.rollingUpdate) {
            deploymentStrategy = `\n  strategy:\n    type: RollingUpdate\n    rollingUpdate:`;
            if (formData.strategy.rollingUpdate.maxUnavailable) {
              deploymentStrategy += `\n      maxUnavailable: ${formData.strategy.rollingUpdate.maxUnavailable}`;
            }
            if (formData.strategy.rollingUpdate.maxSurge) {
              deploymentStrategy += `\n      maxSurge: ${formData.strategy.rollingUpdate.maxSurge}`;
            }
            if (formData.strategy.rollingUpdate.minReadySeconds !== undefined) {
              deploymentStrategy += `\n      minReadySeconds: ${formData.strategy.rollingUpdate.minReadySeconds}`;
            }
            if (formData.strategy.rollingUpdate.revisionHistoryLimit !== undefined) {
              deploymentStrategy += `\n      revisionHistoryLimit: ${formData.strategy.rollingUpdate.revisionHistoryLimit}`;
            }
            if (formData.strategy.rollingUpdate.progressDeadlineSeconds !== undefined) {
              deploymentStrategy += `\n      progressDeadlineSeconds: ${formData.strategy.rollingUpdate.progressDeadlineSeconds}`;
            }
          }
        }
        
        yaml = `apiVersion: apps/v1
kind: Deployment
metadata:
  name: ${metadata.name}
  namespace: ${metadata.namespace}
  labels:
${Object.entries(metadata.labels)
  .map(([k, v]) => `    ${k}: ${v}`)
  .join('\n')}
${Object.keys(annotations).length > 0 ? `  annotations:\n${Object.entries(annotations).map(([k, v]) => `    ${k}: ${v}`).join('\n')}` : ''}
spec:
  replicas: ${formData.replicas || 1}${deploymentStrategy}
  selector:
    matchLabels:
${Object.entries(metadata.labels)
  .map(([k, v]) => `      ${k}: ${v}`)
  .join('\n')}
  template:
    metadata:
      labels:
${Object.entries(metadata.labels)
  .map(([k, v]) => `        ${k}: ${v}`)
  .join('\n')}
    spec:
      containers:
${buildPodSpecYAML()}${formData.volumes && formData.volumes.length > 0 ? `\n      volumes:` + formData.volumes.map((vol: any) => {
          let volYAML = `\n      - name: ${vol.name}`;
          if (vol.type === 'emptyDir') {
            volYAML += `\n        emptyDir: {}`;
          } else if (vol.type === 'hostPath' && vol.hostPath) {
            volYAML += `\n        hostPath:\n          path: ${vol.hostPath}`;
          } else if (vol.type === 'configMap' && vol.configMapName) {
            volYAML += `\n        configMap:\n          name: ${vol.configMapName}`;
          } else if (vol.type === 'secret' && vol.secretName) {
            volYAML += `\n        secret:\n          secretName: ${vol.secretName}`;
          } else if (vol.type === 'persistentVolumeClaim' && vol.pvcName) {
            volYAML += `\n        persistentVolumeClaim:\n          claimName: ${vol.pvcName}`;
          }
          return volYAML;
        }).join('') : ''}`;
        break;

      case 'StatefulSet':
        yaml = `apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: ${metadata.name}
  namespace: ${metadata.namespace}
  labels:
${Object.entries(metadata.labels)
  .map(([k, v]) => `    ${k}: ${v}`)
  .join('\n')}
spec:
  serviceName: ${formData.serviceName || metadata.name}
  replicas: ${formData.replicas || 1}
  selector:
    matchLabels:
${Object.entries(metadata.labels)
  .map(([k, v]) => `      ${k}: ${v}`)
  .join('\n')}
  template:
    metadata:
      labels:
${Object.entries(metadata.labels)
  .map(([k, v]) => `        ${k}: ${v}`)
  .join('\n')}
    spec:
      containers:
${buildPodSpecYAML()}${formData.volumes && formData.volumes.length > 0 ? `\n      volumes:` + formData.volumes.map((vol: any) => {
          let volYAML = `\n      - name: ${vol.name}`;
          if (vol.type === 'emptyDir') {
            volYAML += `\n        emptyDir: {}`;
          } else if (vol.type === 'hostPath' && vol.hostPath) {
            volYAML += `\n        hostPath:\n          path: ${vol.hostPath}`;
          } else if (vol.type === 'configMap' && vol.configMapName) {
            volYAML += `\n        configMap:\n          name: ${vol.configMapName}`;
          } else if (vol.type === 'secret' && vol.secretName) {
            volYAML += `\n        secret:\n          secretName: ${vol.secretName}`;
          } else if (vol.type === 'persistentVolumeClaim' && vol.pvcName) {
            volYAML += `\n        persistentVolumeClaim:\n          claimName: ${vol.pvcName}`;
          }
          return volYAML;
        }).join('') : ''}`;
        break;

      case 'DaemonSet':
        yaml = `apiVersion: apps/v1
kind: DaemonSet
metadata:
  name: ${metadata.name}
  namespace: ${metadata.namespace}
  labels:
${Object.entries(metadata.labels)
  .map(([k, v]) => `    ${k}: ${v}`)
  .join('\n')}
spec:
  selector:
    matchLabels:
${Object.entries(metadata.labels)
  .map(([k, v]) => `      ${k}: ${v}`)
  .join('\n')}
  template:
    metadata:
      labels:
${Object.entries(metadata.labels)
  .map(([k, v]) => `        ${k}: ${v}`)
  .join('\n')}
    spec:
      containers:
${buildPodSpecYAML()}${formData.volumes && formData.volumes.length > 0 ? `\n      volumes:` + formData.volumes.map((vol: any) => {
          let volYAML = `\n      - name: ${vol.name}`;
          if (vol.type === 'emptyDir') {
            volYAML += `\n        emptyDir: {}`;
          } else if (vol.type === 'hostPath' && vol.hostPath) {
            volYAML += `\n        hostPath:\n          path: ${vol.hostPath}`;
          } else if (vol.type === 'configMap' && vol.configMapName) {
            volYAML += `\n        configMap:\n          name: ${vol.configMapName}`;
          } else if (vol.type === 'secret' && vol.secretName) {
            volYAML += `\n        secret:\n          secretName: ${vol.secretName}`;
          } else if (vol.type === 'persistentVolumeClaim' && vol.pvcName) {
            volYAML += `\n        persistentVolumeClaim:\n          claimName: ${vol.pvcName}`;
          }
          return volYAML;
        }).join('') : ''}`;
        break;

      case 'Rollout':
        yaml = `apiVersion: argoproj.io/v1alpha1
kind: Rollout
metadata:
  name: ${metadata.name}
  namespace: ${metadata.namespace}
  labels:
${Object.entries(metadata.labels)
  .map(([k, v]) => `    ${k}: ${v}`)
  .join('\n')}
spec:
  replicas: ${formData.replicas || 1}
  selector:
    matchLabels:
${Object.entries(metadata.labels)
  .map(([k, v]) => `      ${k}: ${v}`)
  .join('\n')}
  template:
    metadata:
      labels:
${Object.entries(metadata.labels)
  .map(([k, v]) => `        ${k}: ${v}`)
  .join('\n')}
    spec:
      containers:
${buildPodSpecYAML()}${formData.volumes && formData.volumes.length > 0 ? `\n      volumes:` + formData.volumes.map((vol: any) => {
          let volYAML = `\n      - name: ${vol.name}`;
          if (vol.type === 'emptyDir') {
            volYAML += `\n        emptyDir: {}`;
          } else if (vol.type === 'hostPath' && vol.hostPath) {
            volYAML += `\n        hostPath:\n          path: ${vol.hostPath}`;
          } else if (vol.type === 'configMap' && vol.configMapName) {
            volYAML += `\n        configMap:\n          name: ${vol.configMapName}`;
          } else if (vol.type === 'secret' && vol.secretName) {
            volYAML += `\n        secret:\n          secretName: ${vol.secretName}`;
          } else if (vol.type === 'persistentVolumeClaim' && vol.pvcName) {
            volYAML += `\n        persistentVolumeClaim:\n          claimName: ${vol.pvcName}`;
          }
          return volYAML;
        }).join('') : ''}
  strategy:
    canary:
      steps:
      - setWeight: 20
      - pause: {duration: 10s}
      - setWeight: 50
      - pause: {duration: 10s}`;
        break;

      case 'Job':
        yaml = `apiVersion: batch/v1
kind: Job
metadata:
  name: ${metadata.name}
  namespace: ${metadata.namespace}
  labels:
${Object.entries(metadata.labels)
  .map(([k, v]) => `    ${k}: ${v}`)
  .join('\n')}
spec:
${formData.completions ? `  completions: ${formData.completions}` : ''}
${formData.parallelism ? `  parallelism: ${formData.parallelism}` : ''}
${formData.backoffLimit !== undefined ? `  backoffLimit: ${formData.backoffLimit}` : ''}
  template:
    metadata:
      labels:
${Object.entries(metadata.labels)
  .map(([k, v]) => `        ${k}: ${v}`)
  .join('\n')}
    spec:
      containers:
${buildPodSpecYAML()}${formData.volumes && formData.volumes.length > 0 ? `\n      volumes:` + formData.volumes.map((vol: any) => {
          let volYAML = `\n      - name: ${vol.name}`;
          if (vol.type === 'emptyDir') {
            volYAML += `\n        emptyDir: {}`;
          } else if (vol.type === 'hostPath' && vol.hostPath) {
            volYAML += `\n        hostPath:\n          path: ${vol.hostPath}`;
          } else if (vol.type === 'configMap' && vol.configMapName) {
            volYAML += `\n        configMap:\n          name: ${vol.configMapName}`;
          } else if (vol.type === 'secret' && vol.secretName) {
            volYAML += `\n        secret:\n          secretName: ${vol.secretName}`;
          } else if (vol.type === 'persistentVolumeClaim' && vol.pvcName) {
            volYAML += `\n        persistentVolumeClaim:\n          claimName: ${vol.pvcName}`;
          }
          return volYAML;
        }).join('') : ''}
      restartPolicy: Never`;
        break;

      case 'CronJob':
        yaml = `apiVersion: batch/v1
kind: CronJob
metadata:
  name: ${metadata.name}
  namespace: ${metadata.namespace}
  labels:
${Object.entries(metadata.labels)
  .map(([k, v]) => `    ${k}: ${v}`)
  .join('\n')}
spec:
  schedule: "${formData.schedule || '0 0 * * *'}"
${formData.suspend !== undefined ? `  suspend: ${formData.suspend}` : ''}
  jobTemplate:
    spec:
      template:
        metadata:
          labels:
${Object.entries(metadata.labels)
  .map(([k, v]) => `            ${k}: ${v}`)
  .join('\n')}
        spec:
          containers:
${buildPodSpecYAML().replace(/^      /gm, '          ')}${formData.volumes && formData.volumes.length > 0 ? `\n          volumes:` + formData.volumes.map((vol: any) => {
          let volYAML = `\n          - name: ${vol.name}`;
          if (vol.type === 'emptyDir') {
            volYAML += `\n            emptyDir: {}`;
          } else if (vol.type === 'hostPath' && vol.hostPath) {
            volYAML += `\n            hostPath:\n              path: ${vol.hostPath}`;
          } else if (vol.type === 'configMap' && vol.configMapName) {
            volYAML += `\n            configMap:\n              name: ${vol.configMapName}`;
          } else if (vol.type === 'secret' && vol.secretName) {
            volYAML += `\n            secret:\n              secretName: ${vol.secretName}`;
          } else if (vol.type === 'persistentVolumeClaim' && vol.pvcName) {
            volYAML += `\n            persistentVolumeClaim:\n              claimName: ${vol.pvcName}`;
          }
          return volYAML;
        }).join('') : ''}
          restartPolicy: OnFailure`;
        break;

      default:
        throw new Error(`不支持的工作负载类型: ${workloadType}`);
    }

    return yaml;
  }
  
  // 获取Deployment关联的Pods
  static async getWorkloadPods(
    clusterId: string,
    namespace: string,
    workloadType: string,
    workloadName: string
  ): Promise<any> {
    let endpoint = `/clusters/${clusterId}/`;
    switch (workloadType) {
      case 'Deployment':
        endpoint += `deployments/${namespace}/${workloadName}/pods`;
        break;
      case 'Rollout':
        endpoint += `rollouts/${namespace}/${workloadName}/pods`;
        break;
      default:
        endpoint += `workloads/${workloadType}/${namespace}/${workloadName}/pods`;
    }
    return request.get(endpoint);
  }

  // 获取Deployment关联的Services
  static async getWorkloadServices(
    clusterId: string,
    namespace: string,
    workloadType: string,
    workloadName: string
  ): Promise<any> {
    let endpoint = `/clusters/${clusterId}/`;
    switch (workloadType) {
      case 'Deployment':
        endpoint += `deployments/${namespace}/${workloadName}/services`;
        break;
      case 'Rollout':
        endpoint += `rollouts/${namespace}/${workloadName}/services`;
        break;
      default:
        endpoint += `workloads/${workloadType}/${namespace}/${workloadName}/services`;
    }
    return request.get(endpoint);
  }

  // 获取Deployment关联的Ingresses
  static async getWorkloadIngresses(
    clusterId: string,
    namespace: string,
    workloadType: string,
    workloadName: string
  ): Promise<any> {
    let endpoint = `/clusters/${clusterId}/`;
    switch (workloadType) {
      case 'Deployment':
        endpoint += `deployments/${namespace}/${workloadName}/ingresses`;
        break;
      case 'Rollout':
        endpoint += `rollouts/${namespace}/${workloadName}/ingresses`;
        break;
      default:
        endpoint += `workloads/${workloadType}/${namespace}/${workloadName}/ingresses`;
    }
    return request.get(endpoint);
  }

  // 获取Deployment的HPA
  static async getWorkloadHPA(
    clusterId: string,
    namespace: string,
    workloadType: string,
    workloadName: string
  ): Promise<any> {
    let endpoint = `/clusters/${clusterId}/`;
    switch (workloadType) {
      case 'Deployment':
        endpoint += `deployments/${namespace}/${workloadName}/hpa`;
        break;
      case 'Rollout':
        endpoint += `rollouts/${namespace}/${workloadName}/hpa`;
        break;
      default:
        endpoint += `workloads/${workloadType}/${namespace}/${workloadName}/hpa`;
    }
    return request.get(endpoint);
  }

  // 获取Deployment的ReplicaSets
  static async getWorkloadReplicaSets(
    clusterId: string,
    namespace: string,
    workloadType: string,
    workloadName: string
  ): Promise<any> {
    let endpoint = `/clusters/${clusterId}/`;
    switch (workloadType) {
      case 'Deployment':
        endpoint += `deployments/${namespace}/${workloadName}/replicasets`;
        break;
      case 'Rollout':
        endpoint += `rollouts/${namespace}/${workloadName}/replicasets`;
        break;
      default:
        endpoint += `workloads/${workloadType}/${namespace}/${workloadName}/replicasets`;
    }
    return request.get(endpoint);
  }

  // 获取Deployment的Events
  static async getWorkloadEvents(
    clusterId: string,
    namespace: string,
    workloadType: string,
    workloadName: string
  ): Promise<any> {
    let endpoint = `/clusters/${clusterId}/`;
    switch (workloadType) {
      case 'Deployment':
        endpoint += `deployments/${namespace}/${workloadName}/events`;
        break;
      case 'Rollout':
        endpoint += `rollouts/${namespace}/${workloadName}/events`;
        break;
      default:
        endpoint += `workloads/${workloadType}/${namespace}/${workloadName}/events`;
    }
    return request.get(endpoint);
  }
}