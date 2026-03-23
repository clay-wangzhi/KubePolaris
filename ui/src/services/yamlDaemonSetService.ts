import type { CommonBuildParts } from './yamlCommonService';

// ==================== DaemonSet 构建 ====================

export const buildDaemonSetSpec = (
  { metadata, labels, podTemplateSpec }: CommonBuildParts,
): Record<string, unknown> => ({
  apiVersion: 'apps/v1',
  kind: 'DaemonSet',
  metadata,
  spec: {
    selector: { matchLabels: { ...labels } },
    template: podTemplateSpec,
  },
});

// ==================== DaemonSet 解析 ====================

export const parseDaemonSetFields = () => ({});
