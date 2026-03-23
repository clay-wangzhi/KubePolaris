import type { WorkloadFormData } from '../types/workload';
import type { CommonBuildParts } from './yamlCommonService';

// ==================== Job 构建 ====================

export const buildJobSpec = (
  formData: WorkloadFormData,
  { metadata, podTemplateSpec, podSpec }: CommonBuildParts,
): Record<string, unknown> => ({
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
});

// ==================== CronJob 构建 ====================

export const buildCronJobSpec = (
  formData: WorkloadFormData,
  { metadata, podTemplateSpec, podSpec }: CommonBuildParts,
): Record<string, unknown> => ({
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
});

// ==================== Job 解析 ====================

export const parseJobFields = (spec: Record<string, unknown>) => ({
  completions: spec.completions as number | undefined,
  parallelism: spec.parallelism as number | undefined,
  backoffLimit: spec.backoffLimit as number | undefined,
  activeDeadlineSeconds: spec.activeDeadlineSeconds as number | undefined,
  ttlSecondsAfterFinished: spec.ttlSecondsAfterFinished as number | undefined,
});

// ==================== CronJob 解析 ====================

export const parseCronJobFields = (spec: Record<string, unknown>) => ({
  schedule: spec.schedule as string | undefined,
  suspend: spec.suspend as boolean | undefined,
  concurrencyPolicy: spec.concurrencyPolicy as WorkloadFormData['concurrencyPolicy'],
  successfulJobsHistoryLimit: spec.successfulJobsHistoryLimit as number | undefined,
  failedJobsHistoryLimit: spec.failedJobsHistoryLimit as number | undefined,
});
