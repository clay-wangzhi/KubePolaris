import type { WorkloadFormData } from '../types/workload';
import {
  buildCommonParts,
  parseCommonFields,
  toYAMLString,
  parseYAMLString,
  getPodSpec,
} from './yamlCommonService';
import { buildDeploymentSpec, buildRolloutSpec, parseDeploymentFields, parseRolloutFields } from './yamlDeploymentService';
import { buildStatefulSetSpec, parseStatefulSetFields } from './yamlStatefulSetService';
import { buildDaemonSetSpec } from './yamlDaemonSetService';
import { buildJobSpec, buildCronJobSpec, parseJobFields, parseCronJobFields } from './yamlJobService';

// 主转换函数：表单数据 -> YAML
export const formDataToYAML = (
  workloadType: 'Deployment' | 'StatefulSet' | 'DaemonSet' | 'Rollout' | 'Job' | 'CronJob',
  formData: WorkloadFormData,
): string => {
  const commonParts = buildCommonParts(formData);

  let workloadSpec: Record<string, unknown>;

  switch (workloadType) {
    case 'Deployment':
      workloadSpec = buildDeploymentSpec(formData, commonParts);
      break;
    case 'StatefulSet':
      workloadSpec = buildStatefulSetSpec(formData, commonParts);
      break;
    case 'DaemonSet':
      workloadSpec = buildDaemonSetSpec(commonParts);
      break;
    case 'Job':
      workloadSpec = buildJobSpec(formData, commonParts);
      break;
    case 'CronJob':
      workloadSpec = buildCronJobSpec(formData, commonParts);
      break;
    case 'Rollout':
      workloadSpec = buildRolloutSpec(formData, commonParts);
      break;
    default:
      workloadSpec = {
        apiVersion: 'apps/v1',
        kind: workloadType,
        metadata: commonParts.metadata,
        spec: {
          replicas: formData.replicas ?? 1,
          selector: { matchLabels: { ...commonParts.labels } },
          template: commonParts.podTemplateSpec,
        },
      };
  }

  return toYAMLString(workloadSpec);
};

// YAML -> 表单数据
export const yamlToFormData = (yamlContent: string): WorkloadFormData | null => {
  try {
    const obj = parseYAMLString(yamlContent);
    if (!obj) return null;

    const spec = (obj.spec || {}) as Record<string, unknown>;
    const podSpec = getPodSpec(obj);
    const common = parseCommonFields(obj, podSpec);

    const strategy = spec.strategy as Record<string, unknown> | undefined;
    const isRollout = obj.kind === 'Rollout' ||
      (obj.apiVersion && String(obj.apiVersion).includes('argoproj.io')) ||
      (strategy && (strategy.canary || strategy.blueGreen));

    let resourceFields: Partial<WorkloadFormData> = {};

    if (isRollout) {
      const rolloutData = parseRolloutFields(spec, obj);
      resourceFields = {
        replicas: rolloutData.replicas,
        rolloutStrategy: rolloutData.rolloutStrategy,
        minReadySeconds: rolloutData.minReadySeconds,
        revisionHistoryLimit: rolloutData.revisionHistoryLimit,
        progressDeadlineSeconds: rolloutData.progressDeadlineSeconds,
      };
    } else if (obj.kind === 'StatefulSet') {
      const ssFields = parseStatefulSetFields(spec);
      resourceFields = {
        replicas: ssFields.replicas,
        serviceName: ssFields.serviceName,
        podManagementPolicy: ssFields.podManagementPolicy,
      };
    } else if (obj.kind === 'Job') {
      resourceFields = parseJobFields(spec);
    } else if (obj.kind === 'CronJob') {
      resourceFields = parseCronJobFields(spec);
    } else {
      const deployFields = parseDeploymentFields(spec);
      resourceFields = {
        replicas: deployFields.replicas,
        strategy: deployFields.strategy,
        minReadySeconds: deployFields.minReadySeconds,
        revisionHistoryLimit: deployFields.revisionHistoryLimit,
        progressDeadlineSeconds: deployFields.progressDeadlineSeconds,
      };
    }

    const formData: WorkloadFormData = {
      ...common,
      containers: common.containers,
      ...resourceFields,
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

// 重导出子模块，保持向后兼容
export * from './yamlCommonService';
export * from './yamlDeploymentService';
export * from './yamlStatefulSetService';
export * from './yamlDaemonSetService';
export * from './yamlJobService';
