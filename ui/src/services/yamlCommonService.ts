import * as YAML from 'yaml';
import type {
  WorkloadFormData,
  ContainerConfig,
  ProbeConfig,
  VolumeConfig,
  SchedulingConfig,
  TolerationConfig,
  RolloutStrategyConfig,
  CanaryStrategyConfig,
  BlueGreenStrategyConfig,
  CanaryStep,
} from '../types/workload';

// ==================== 公共类型 ====================

export interface CommonBuildParts {
  metadata: Record<string, unknown>;
  labels: Record<string, string>;
  podSpec: Record<string, unknown>;
  podTemplateSpec: {
    metadata: { labels: Record<string, string> };
    spec: Record<string, unknown>;
  };
}

export interface CommonParsedFields {
  name: string;
  namespace: string;
  description?: string;
  labels: Array<{ key: string; value: string }>;
  annotations: Array<{ key: string; value: string }>;
  containers: ContainerConfig[];
  initContainers?: ContainerConfig[];
  volumes?: VolumeConfig[];
  imagePullSecrets?: string[];
  scheduling?: WorkloadFormData['scheduling'];
  tolerations?: TolerationConfig[];
  terminationGracePeriodSeconds?: number;
  dnsPolicy?: WorkloadFormData['dnsPolicy'];
  dnsConfig?: WorkloadFormData['dnsConfig'];
  hostNetwork?: boolean;
}

// ==================== 辅助函数 ====================

export const parseCommaString = (str: string | undefined): string[] => {
  if (!str) return [];
  return str.split(',').map(s => s.trim()).filter(s => s);
};

export const parseCommandString = (str: string | string[] | undefined): string[] => {
  if (!str) return [];
  if (Array.isArray(str)) return str;
  return str.split('\n').map(s => s.trim()).filter(s => s);
};

export const commandArrayToString = (arr: string[] | undefined): string => {
  if (!arr || arr.length === 0) return '';
  return arr.join('\n');
};

// ==================== 构建函数 ====================

export const buildProbeConfig = (probe: ProbeConfig & { enabled?: boolean; type?: string }): Record<string, unknown> | undefined => {
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

export const buildContainerSpec = (container: ContainerConfig): Record<string, unknown> => {
  const spec: Record<string, unknown> = {
    name: container.name || 'main',
    image: container.image || 'nginx:latest',
  };

  if (container.imagePullPolicy) {
    spec.imagePullPolicy = container.imagePullPolicy;
  }

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

  if (container.ports && container.ports.length > 0) {
    spec.ports = container.ports.map(p => ({
      ...(p.name && { name: p.name }),
      containerPort: p.containerPort,
      ...(p.protocol && p.protocol !== 'TCP' && { protocol: p.protocol }),
    }));
  }

  if (container.env && container.env.length > 0) {
    spec.env = container.env.map(e => {
      if (e.valueFrom) {
        return { name: e.name, valueFrom: e.valueFrom };
      }
      return { name: e.name, value: e.value || '' };
    });
  }

  if (container.resources) {
    const resources: Record<string, Record<string, string>> = {};
    if (container.resources.requests) {
      resources.requests = {};
      if (container.resources.requests.cpu) resources.requests.cpu = container.resources.requests.cpu;
      if (container.resources.requests.memory) resources.requests.memory = container.resources.requests.memory;
      if (container.resources.requests['ephemeral-storage']) {
        resources.requests['ephemeral-storage'] = container.resources.requests['ephemeral-storage'];
      }
    }
    if (container.resources.limits) {
      resources.limits = {};
      if (container.resources.limits.cpu) resources.limits.cpu = container.resources.limits.cpu;
      if (container.resources.limits.memory) resources.limits.memory = container.resources.limits.memory;
      if (container.resources.limits['ephemeral-storage']) {
        resources.limits['ephemeral-storage'] = container.resources.limits['ephemeral-storage'];
      }
      if (container.resources.limits['nvidia.com/gpu']) resources.limits['nvidia.com/gpu'] = container.resources.limits['nvidia.com/gpu'];
    }
    if (Object.keys(resources).length > 0) spec.resources = resources;
  }

  if (container.volumeMounts && container.volumeMounts.length > 0) {
    spec.volumeMounts = container.volumeMounts.map(vm => ({
      name: vm.name,
      mountPath: vm.mountPath,
      ...(vm.subPath && { subPath: vm.subPath }),
      ...(vm.readOnly && { readOnly: vm.readOnly }),
    }));
  }

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

  const startupProbe = buildProbeConfig(container.startupProbe as ProbeConfig & { enabled?: boolean; type?: string });
  if (startupProbe) spec.startupProbe = startupProbe;

  const livenessProbe = buildProbeConfig(container.livenessProbe as ProbeConfig & { enabled?: boolean; type?: string });
  if (livenessProbe) spec.livenessProbe = livenessProbe;

  const readinessProbe = buildProbeConfig(container.readinessProbe as ProbeConfig & { enabled?: boolean; type?: string });
  if (readinessProbe) spec.readinessProbe = readinessProbe;

  return spec;
};

export const buildVolumeSpec = (volume: VolumeConfig): Record<string, unknown> => {
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

export const buildSchedulingSpec = (scheduling: SchedulingConfig | undefined): Record<string, unknown> | undefined => {
  if (!scheduling) return undefined;

  const affinity: Record<string, unknown> = {};

  if (scheduling.nodeAffinity) {
    const nodeAffinity: Record<string, unknown> = {};

    if (scheduling.nodeAffinity.required && scheduling.nodeAffinity.required.nodeSelectorTerms?.length > 0) {
      nodeAffinity.requiredDuringSchedulingIgnoredDuringExecution = {
        nodeSelectorTerms: scheduling.nodeAffinity.required.nodeSelectorTerms,
      };
    }

    if (scheduling.nodeAffinity.preferred && scheduling.nodeAffinity.preferred.length > 0) {
      nodeAffinity.preferredDuringSchedulingIgnoredDuringExecution = scheduling.nodeAffinity.preferred;
    }

    if (Object.keys(nodeAffinity).length > 0) affinity.nodeAffinity = nodeAffinity;
  }

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

// ==================== Argo Rollout 策略构建 ====================

export const buildCanaryStrategy = (canary: CanaryStrategyConfig | undefined): Record<string, unknown> => {
  if (!canary) {
    return {
      canary: {
        steps: [
          { setWeight: 20 },
          { pause: { duration: '10m' } },
          { setWeight: 50 },
          { pause: { duration: '10m' } },
          { setWeight: 80 },
          { pause: { duration: '10m' } },
        ],
      },
    };
  }

  const canarySpec: Record<string, unknown> = {};

  if (canary.steps && canary.steps.length > 0) {
    const rawSteps: Array<Record<string, unknown>> = [];

    canary.steps.forEach((step: CanaryStep) => {
      if (step.setWeight !== undefined) {
        rawSteps.push({ setWeight: step.setWeight });
      }

      if (step.pause !== undefined) {
        if (step.pause.duration) {
          rawSteps.push({ pause: { duration: step.pause.duration } });
        } else {
          rawSteps.push({ pause: {} });
        }
      }

      if (step.setCanaryScale) {
        rawSteps.push({ setCanaryScale: step.setCanaryScale });
      }

      if (step.analysis) {
        rawSteps.push({ analysis: step.analysis });
      }
    });

    if (rawSteps.length > 0) {
      canarySpec.steps = rawSteps;
    }
  }

  if (canary.maxSurge) canarySpec.maxSurge = canary.maxSurge;
  if (canary.maxUnavailable) canarySpec.maxUnavailable = canary.maxUnavailable;

  if (canary.stableService) canarySpec.stableService = canary.stableService;
  if (canary.canaryService) canarySpec.canaryService = canary.canaryService;

  if (canary.trafficRouting) {
    const trafficRouting: Record<string, unknown> = {};
    if (canary.trafficRouting.nginx?.stableIngress) {
      trafficRouting.nginx = {
        stableIngress: canary.trafficRouting.nginx.stableIngress,
        ...(canary.trafficRouting.nginx.annotationPrefix && {
          annotationPrefix: canary.trafficRouting.nginx.annotationPrefix,
        }),
      };
    }
    if (canary.trafficRouting.istio) {
      trafficRouting.istio = canary.trafficRouting.istio;
    }
    if (canary.trafficRouting.alb) {
      trafficRouting.alb = canary.trafficRouting.alb;
    }
    if (Object.keys(trafficRouting).length > 0) {
      canarySpec.trafficRouting = trafficRouting;
    }
  }

  if (canary.analysis) canarySpec.analysis = canary.analysis;
  if (canary.canaryMetadata) canarySpec.canaryMetadata = canary.canaryMetadata;
  if (canary.stableMetadata) canarySpec.stableMetadata = canary.stableMetadata;
  if (canary.antiAffinity) canarySpec.antiAffinity = canary.antiAffinity;

  return { canary: canarySpec };
};

export const buildBlueGreenStrategy = (blueGreen: BlueGreenStrategyConfig | undefined): Record<string, unknown> => {
  if (!blueGreen || !blueGreen.activeService) {
    return {
      blueGreen: {
        activeService: 'my-app-active',
        previewService: 'my-app-preview',
        autoPromotionEnabled: false,
      },
    };
  }

  const blueGreenSpec: Record<string, unknown> = {
    activeService: blueGreen.activeService,
  };

  if (blueGreen.previewService) blueGreenSpec.previewService = blueGreen.previewService;
  if (blueGreen.autoPromotionEnabled !== undefined) {
    blueGreenSpec.autoPromotionEnabled = blueGreen.autoPromotionEnabled;
  }
  if (blueGreen.autoPromotionSeconds !== undefined) {
    blueGreenSpec.autoPromotionSeconds = blueGreen.autoPromotionSeconds;
  }
  if (blueGreen.scaleDownDelaySeconds !== undefined) {
    blueGreenSpec.scaleDownDelaySeconds = blueGreen.scaleDownDelaySeconds;
  }
  if (blueGreen.scaleDownDelayRevisionLimit !== undefined) {
    blueGreenSpec.scaleDownDelayRevisionLimit = blueGreen.scaleDownDelayRevisionLimit;
  }
  if (blueGreen.previewReplicaCount !== undefined) {
    blueGreenSpec.previewReplicaCount = blueGreen.previewReplicaCount;
  }

  if (blueGreen.previewMetadata) blueGreenSpec.previewMetadata = blueGreen.previewMetadata;
  if (blueGreen.activeMetadata) blueGreenSpec.activeMetadata = blueGreen.activeMetadata;
  if (blueGreen.antiAffinity) blueGreenSpec.antiAffinity = blueGreen.antiAffinity;
  if (blueGreen.prePromotionAnalysis) blueGreenSpec.prePromotionAnalysis = blueGreen.prePromotionAnalysis;
  if (blueGreen.postPromotionAnalysis) blueGreenSpec.postPromotionAnalysis = blueGreen.postPromotionAnalysis;

  return { blueGreen: blueGreenSpec };
};

export const buildRolloutStrategy = (rolloutStrategy: RolloutStrategyConfig | undefined): Record<string, unknown> => {
  if (!rolloutStrategy) {
    return buildCanaryStrategy(undefined);
  }

  if (rolloutStrategy.type === 'BlueGreen') {
    return buildBlueGreenStrategy(rolloutStrategy.blueGreen);
  }

  return buildCanaryStrategy(rolloutStrategy.canary);
};

// ==================== 亲和性解析 ====================

export const parseAffinityToScheduling = (affinity: Record<string, unknown> | undefined): Record<string, unknown> | undefined => {
  if (!affinity) return undefined;

  const scheduling: Record<string, unknown> = {};

  const nodeAffinity = affinity.nodeAffinity as Record<string, unknown> | undefined;
  if (nodeAffinity) {
    const required = nodeAffinity.requiredDuringSchedulingIgnoredDuringExecution as Record<string, unknown> | undefined;
    if (required?.nodeSelectorTerms) {
      const terms = required.nodeSelectorTerms as Array<Record<string, unknown>>;
      const nodeAffinityRequired: Array<{ key: string; operator: string; values: string }> = [];

      terms.forEach(term => {
        const matchExpressions = term.matchExpressions as Array<{ key: string; operator: string; values?: string[] }> | undefined;
        if (matchExpressions) {
          matchExpressions.forEach(expr => {
            nodeAffinityRequired.push({
              key: expr.key,
              operator: expr.operator,
              values: (expr.values || []).join(', '),
            });
          });
        }
      });

      if (nodeAffinityRequired.length > 0) {
        scheduling.nodeAffinityRequired = nodeAffinityRequired;
      }
    }

    const preferred = nodeAffinity.preferredDuringSchedulingIgnoredDuringExecution as Array<Record<string, unknown>> | undefined;
    if (preferred && preferred.length > 0) {
      const nodeAffinityPreferred: Array<{ weight: number; key: string; operator: string; values: string }> = [];

      preferred.forEach(pref => {
        const weight = pref.weight as number;
        const preference = pref.preference as Record<string, unknown>;
        const matchExpressions = preference?.matchExpressions as Array<{ key: string; operator: string; values?: string[] }> | undefined;

        if (matchExpressions) {
          matchExpressions.forEach(expr => {
            nodeAffinityPreferred.push({
              weight,
              key: expr.key,
              operator: expr.operator,
              values: (expr.values || []).join(', '),
            });
          });
        }
      });

      if (nodeAffinityPreferred.length > 0) {
        scheduling.nodeAffinityPreferred = nodeAffinityPreferred;
      }
    }
  }

  const podAffinity = affinity.podAffinity as Record<string, unknown> | undefined;
  if (podAffinity) {
    const required = podAffinity.requiredDuringSchedulingIgnoredDuringExecution as Array<Record<string, unknown>> | undefined;
    if (required && required.length > 0) {
      const podAffinityRequired: Array<{ topologyKey: string; labelKey: string; operator: string; labelValues: string }> = [];

      required.forEach(term => {
        const topologyKey = term.topologyKey as string;
        const labelSelector = term.labelSelector as Record<string, unknown> | undefined;
        const matchExpressions = labelSelector?.matchExpressions as Array<{ key: string; operator: string; values?: string[] }> | undefined;

        if (matchExpressions) {
          matchExpressions.forEach(expr => {
            podAffinityRequired.push({
              topologyKey,
              labelKey: expr.key,
              operator: expr.operator,
              labelValues: (expr.values || []).join(', '),
            });
          });
        }

        const matchLabels = labelSelector?.matchLabels as Record<string, string> | undefined;
        if (matchLabels) {
          Object.entries(matchLabels).forEach(([key, value]) => {
            podAffinityRequired.push({
              topologyKey,
              labelKey: key,
              operator: 'In',
              labelValues: value,
            });
          });
        }
      });

      if (podAffinityRequired.length > 0) {
        scheduling.podAffinityRequired = podAffinityRequired;
      }
    }

    const preferred = podAffinity.preferredDuringSchedulingIgnoredDuringExecution as Array<Record<string, unknown>> | undefined;
    if (preferred && preferred.length > 0) {
      const podAffinityPreferred: Array<{ weight: number; topologyKey: string; labelKey: string; operator: string; labelValues: string }> = [];

      preferred.forEach(pref => {
        const weight = pref.weight as number;
        const podAffinityTerm = pref.podAffinityTerm as Record<string, unknown>;
        const topologyKey = podAffinityTerm?.topologyKey as string;
        const labelSelector = podAffinityTerm?.labelSelector as Record<string, unknown> | undefined;
        const matchExpressions = labelSelector?.matchExpressions as Array<{ key: string; operator: string; values?: string[] }> | undefined;

        if (matchExpressions) {
          matchExpressions.forEach(expr => {
            podAffinityPreferred.push({
              weight,
              topologyKey,
              labelKey: expr.key,
              operator: expr.operator,
              labelValues: (expr.values || []).join(', '),
            });
          });
        }

        const matchLabels = labelSelector?.matchLabels as Record<string, string> | undefined;
        if (matchLabels) {
          Object.entries(matchLabels).forEach(([key, value]) => {
            podAffinityPreferred.push({
              weight,
              topologyKey,
              labelKey: key,
              operator: 'In',
              labelValues: value,
            });
          });
        }
      });

      if (podAffinityPreferred.length > 0) {
        scheduling.podAffinityPreferred = podAffinityPreferred;
      }
    }
  }

  const podAntiAffinity = affinity.podAntiAffinity as Record<string, unknown> | undefined;
  if (podAntiAffinity) {
    const required = podAntiAffinity.requiredDuringSchedulingIgnoredDuringExecution as Array<Record<string, unknown>> | undefined;
    if (required && required.length > 0) {
      const podAntiAffinityRequired: Array<{ topologyKey: string; labelKey: string; operator: string; labelValues: string }> = [];

      required.forEach(term => {
        const topologyKey = term.topologyKey as string;
        const labelSelector = term.labelSelector as Record<string, unknown> | undefined;
        const matchExpressions = labelSelector?.matchExpressions as Array<{ key: string; operator: string; values?: string[] }> | undefined;

        if (matchExpressions) {
          matchExpressions.forEach(expr => {
            podAntiAffinityRequired.push({
              topologyKey,
              labelKey: expr.key,
              operator: expr.operator,
              labelValues: (expr.values || []).join(', '),
            });
          });
        }

        const matchLabels = labelSelector?.matchLabels as Record<string, string> | undefined;
        if (matchLabels) {
          Object.entries(matchLabels).forEach(([key, value]) => {
            podAntiAffinityRequired.push({
              topologyKey,
              labelKey: key,
              operator: 'In',
              labelValues: value,
            });
          });
        }
      });

      if (podAntiAffinityRequired.length > 0) {
        scheduling.podAntiAffinityRequired = podAntiAffinityRequired;
      }
    }

    const preferred = podAntiAffinity.preferredDuringSchedulingIgnoredDuringExecution as Array<Record<string, unknown>> | undefined;
    if (preferred && preferred.length > 0) {
      const podAntiAffinityPreferred: Array<{ weight: number; topologyKey: string; labelKey: string; operator: string; labelValues: string }> = [];

      preferred.forEach(pref => {
        const weight = pref.weight as number;
        const podAffinityTerm = pref.podAffinityTerm as Record<string, unknown>;
        const topologyKey = podAffinityTerm?.topologyKey as string;
        const labelSelector = podAffinityTerm?.labelSelector as Record<string, unknown> | undefined;
        const matchExpressions = labelSelector?.matchExpressions as Array<{ key: string; operator: string; values?: string[] }> | undefined;

        if (matchExpressions) {
          matchExpressions.forEach(expr => {
            podAntiAffinityPreferred.push({
              weight,
              topologyKey,
              labelKey: expr.key,
              operator: expr.operator,
              labelValues: (expr.values || []).join(', '),
            });
          });
        }

        const matchLabels = labelSelector?.matchLabels as Record<string, string> | undefined;
        if (matchLabels) {
          Object.entries(matchLabels).forEach(([key, value]) => {
            podAntiAffinityPreferred.push({
              weight,
              topologyKey,
              labelKey: key,
              operator: 'In',
              labelValues: value,
            });
          });
        }
      });

      if (podAntiAffinityPreferred.length > 0) {
        scheduling.podAntiAffinityPreferred = podAntiAffinityPreferred;
      }
    }
  }

  return Object.keys(scheduling).length > 0 ? scheduling : undefined;
};

// ==================== 表单调度配置构建 ====================

export const buildSchedulingFromForm = (formData: Record<string, unknown>): SchedulingConfig | undefined => {
  const scheduling = formData.scheduling as Record<string, unknown> | undefined;
  if (!scheduling) return undefined;

  const result: SchedulingConfig = {};

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

// ==================== 公共构建函数 ====================

export const buildCommonParts = (formData: WorkloadFormData): CommonBuildParts => {
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

  const metadata: Record<string, unknown> = {
    name: formData.name || 'example',
    namespace: formData.namespace || 'default',
    labels: { ...labels },
    ...(Object.keys(annotations).length > 0 && { annotations }),
  };

  const containers = (formData.containers || []).map(c => buildContainerSpec(c));
  const initContainers = (formData.initContainers || []).map(c => buildContainerSpec(c));
  const volumes = (formData.volumes || []).map(v => buildVolumeSpec(v));

  const scheduling = buildSchedulingFromForm(formData as unknown as Record<string, unknown>);
  const affinity = buildSchedulingSpec(scheduling);

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

  const podTemplateSpec = {
    metadata: { labels: { ...labels } },
    spec: podSpec,
  };

  return { metadata, labels, podSpec, podTemplateSpec };
};

// ==================== 公共解析函数 ====================

const parseProbe = (probe: Record<string, unknown> | undefined) => {
  if (!probe) return undefined;
  let type = 'httpGet';
  if (probe.exec) type = 'exec';
  else if (probe.tcpSocket) type = 'tcpSocket';

  const result: Record<string, unknown> = {
    enabled: true,
    type,
  };

  Object.keys(probe).forEach(key => {
    if (key !== 'exec') {
      result[key] = probe[key];
    }
  });

  if (probe.exec) {
    result.exec = {
      command: commandArrayToString((probe.exec as Record<string, unknown>).command as string[]),
    };
  }

  return result;
};

export const parseCommonFields = (
  obj: Record<string, unknown>,
  podSpec: Record<string, unknown>,
): CommonParsedFields => {
  const metadata = (obj.metadata || {}) as Record<string, unknown>;

  const containers: ContainerConfig[] = ((podSpec.containers as Record<string, unknown>[]) || []).map((c) => ({
    name: c.name as string || 'main',
    image: c.image as string || '',
    imagePullPolicy: c.imagePullPolicy as 'Always' | 'IfNotPresent' | 'Never' | undefined,
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

  const labels = (metadata.labels as Record<string, string>)
    ? Object.entries(metadata.labels as Record<string, string>).map(([key, value]) => ({ key, value: String(value) }))
    : [];
  const annotations = (metadata.annotations as Record<string, string>)
    ? Object.entries(metadata.annotations as Record<string, string>).map(([key, value]) => ({ key, value: String(value) }))
    : [];

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

  const tolerations: TolerationConfig[] = ((podSpec.tolerations as Record<string, unknown>[]) || []).map((t) => ({
    key: t.key as string | undefined,
    operator: t.operator as 'Equal' | 'Exists' || 'Equal',
    value: t.value as string | undefined,
    effect: t.effect as TolerationConfig['effect'],
    tolerationSeconds: t.tolerationSeconds as number | undefined,
  }));

  const imagePullSecrets = ((podSpec.imagePullSecrets as Record<string, unknown>[]) || []).map((s) => s.name as string);

  const affinityData = podSpec.affinity as Record<string, unknown> | undefined;
  const schedulingData = parseAffinityToScheduling(affinityData);

  return {
    name: (metadata.name as string) || '',
    namespace: (metadata.namespace as string) || 'default',
    description: (metadata.annotations as Record<string, unknown>)?.description as string | undefined,
    labels,
    annotations,
    containers,
    initContainers: initContainers.length > 0 ? initContainers : undefined,
    volumes: volumes.length > 0 ? volumes : undefined,
    imagePullSecrets: imagePullSecrets.length > 0 ? imagePullSecrets : undefined,
    scheduling: schedulingData as WorkloadFormData['scheduling'],
    tolerations: tolerations.length > 0 ? tolerations : undefined,
    terminationGracePeriodSeconds: podSpec.terminationGracePeriodSeconds as number | undefined,
    dnsPolicy: podSpec.dnsPolicy as WorkloadFormData['dnsPolicy'],
    dnsConfig: podSpec.dnsConfig as WorkloadFormData['dnsConfig'],
    hostNetwork: podSpec.hostNetwork as boolean | undefined,
  };
};

// ==================== YAML 序列化 ====================

export const toYAMLString = (obj: Record<string, unknown>): string => {
  return YAML.stringify(obj, { lineWidth: 0 });
};

export const parseYAMLString = (yamlContent: string): Record<string, unknown> | null => {
  try {
    return YAML.parse(yamlContent) || null;
  } catch {
    return null;
  }
};

export const getPodSpec = (obj: Record<string, unknown>): Record<string, unknown> => {
  const spec = (obj.spec || {}) as Record<string, unknown>;
  if (obj.kind === 'CronJob') {
    return (((spec.jobTemplate as Record<string, unknown>)?.spec as Record<string, unknown>)?.template as Record<string, unknown>)?.spec as Record<string, unknown> || {};
  }
  return (spec.template as Record<string, unknown>)?.spec as Record<string, unknown> || {};
};
