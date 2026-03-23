import type { WorkloadFormData } from '../types/workload';
import type { CommonBuildParts } from './yamlCommonService';

// ==================== StatefulSet 构建 ====================

export const buildStatefulSetSpec = (
  formData: WorkloadFormData,
  { metadata, labels, podTemplateSpec }: CommonBuildParts,
): Record<string, unknown> => ({
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
});

// ==================== StatefulSet 解析 ====================

export const parseStatefulSetFields = (spec: Record<string, unknown>) => ({
  replicas: spec.replicas as number | undefined,
  serviceName: spec.serviceName as string | undefined,
  podManagementPolicy: spec.podManagementPolicy as WorkloadFormData['podManagementPolicy'],
});
