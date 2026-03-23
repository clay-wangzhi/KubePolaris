import type { WorkloadFormData, CanaryStrategyConfig, BlueGreenStrategyConfig, CanaryStep, RolloutStrategyConfig } from '../types/workload';
import { buildRolloutStrategy, type CommonBuildParts } from './yamlCommonService';

// ==================== Deployment 构建 ====================

export const buildDeploymentSpec = (
  formData: WorkloadFormData,
  { metadata, labels, podTemplateSpec }: CommonBuildParts,
): Record<string, unknown> => ({
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
});

// ==================== Rollout 构建 ====================

export const buildRolloutSpec = (
  formData: WorkloadFormData,
  { metadata, labels, podTemplateSpec }: CommonBuildParts,
): Record<string, unknown> => ({
  apiVersion: 'argoproj.io/v1alpha1',
  kind: 'Rollout',
  metadata,
  spec: {
    replicas: formData.replicas ?? 1,
    selector: { matchLabels: { ...labels } },
    template: podTemplateSpec,
    strategy: buildRolloutStrategy(formData.rolloutStrategy),
    ...(formData.minReadySeconds !== undefined && { minReadySeconds: formData.minReadySeconds }),
    ...(formData.revisionHistoryLimit !== undefined && { revisionHistoryLimit: formData.revisionHistoryLimit }),
    ...(formData.progressDeadlineSeconds !== undefined && { progressDeadlineSeconds: formData.progressDeadlineSeconds }),
  },
});

// ==================== Deployment 解析 ====================

export const parseDeploymentFields = (spec: Record<string, unknown>) => ({
  replicas: spec.replicas as number | undefined,
  strategy: spec.strategy as WorkloadFormData['strategy'],
  minReadySeconds: spec.minReadySeconds as number | undefined,
  revisionHistoryLimit: spec.revisionHistoryLimit as number | undefined,
  progressDeadlineSeconds: spec.progressDeadlineSeconds as number | undefined,
});

// ==================== Rollout 解析 ====================

const normalizePauseDuration = (pause: Record<string, unknown> | undefined): { duration?: string } | undefined => {
  if (!pause) return undefined;
  const pauseObj = pause as { duration?: string | number };
  if (pauseObj.duration !== undefined) {
    return { duration: String(pauseObj.duration) };
  }
  return {};
};

export const parseRolloutFields = (
  spec: Record<string, unknown>,
  obj: Record<string, unknown>,
): { rolloutStrategy?: RolloutStrategyConfig; replicas?: number; minReadySeconds?: number; revisionHistoryLimit?: number; progressDeadlineSeconds?: number } => {
  const strategy = spec.strategy as Record<string, unknown> | undefined;
  const isRollout = obj.kind === 'Rollout' ||
    (obj.apiVersion && String(obj.apiVersion).includes('argoproj.io')) ||
    (strategy && (strategy.canary || strategy.blueGreen));

  let rolloutStrategy: RolloutStrategyConfig | undefined;

  if (isRollout && strategy) {
    if (strategy.canary) {
      const canary = strategy.canary as Record<string, unknown>;
      const rawSteps = (canary.steps as Array<Record<string, unknown>>) || [];
      const formSteps: CanaryStep[] = [];

      for (let i = 0; i < rawSteps.length; i++) {
        const step = rawSteps[i];

        if (step.setWeight !== undefined) {
          const formStep: CanaryStep = {
            setWeight: step.setWeight as number,
          };

          if (i + 1 < rawSteps.length) {
            const nextStep = rawSteps[i + 1];
            if (nextStep.pause !== undefined) {
              const pauseData = nextStep.pause as Record<string, unknown>;
              if (pauseData && Object.keys(pauseData).length > 0) {
                formStep.pause = normalizePauseDuration(pauseData);
                i++;
              }
            }
          }

          formSteps.push(formStep);
        } else if (step.pause !== undefined) {
          formSteps.push({
            pause: normalizePauseDuration(step.pause as Record<string, unknown>),
          });
        } else if (step.setCanaryScale !== undefined) {
          formSteps.push({
            setCanaryScale: step.setCanaryScale as CanaryStep['setCanaryScale'],
          });
        } else if (step.analysis !== undefined) {
          formSteps.push({
            analysis: step.analysis as CanaryStep['analysis'],
          });
        }
      }

      rolloutStrategy = {
        type: 'Canary',
        canary: {
          steps: formSteps,
          maxSurge: canary.maxSurge as string | number | undefined,
          maxUnavailable: canary.maxUnavailable as string | number | undefined,
          stableService: canary.stableService as string | undefined,
          canaryService: canary.canaryService as string | undefined,
          trafficRouting: canary.trafficRouting as CanaryStrategyConfig['trafficRouting'],
          analysis: canary.analysis as CanaryStrategyConfig['analysis'],
          canaryMetadata: canary.canaryMetadata as CanaryStrategyConfig['canaryMetadata'],
          stableMetadata: canary.stableMetadata as CanaryStrategyConfig['stableMetadata'],
        },
      };
    } else if (strategy.blueGreen) {
      const blueGreen = strategy.blueGreen as Record<string, unknown>;
      rolloutStrategy = {
        type: 'BlueGreen',
        blueGreen: {
          activeService: blueGreen.activeService as string,
          previewService: blueGreen.previewService as string | undefined,
          autoPromotionEnabled: blueGreen.autoPromotionEnabled as boolean | undefined,
          autoPromotionSeconds: blueGreen.autoPromotionSeconds as number | undefined,
          scaleDownDelaySeconds: blueGreen.scaleDownDelaySeconds as number | undefined,
          scaleDownDelayRevisionLimit: blueGreen.scaleDownDelayRevisionLimit as number | undefined,
          previewReplicaCount: blueGreen.previewReplicaCount as number | undefined,
          previewMetadata: blueGreen.previewMetadata as BlueGreenStrategyConfig['previewMetadata'],
          activeMetadata: blueGreen.activeMetadata as BlueGreenStrategyConfig['activeMetadata'],
          prePromotionAnalysis: blueGreen.prePromotionAnalysis as BlueGreenStrategyConfig['prePromotionAnalysis'],
          postPromotionAnalysis: blueGreen.postPromotionAnalysis as BlueGreenStrategyConfig['postPromotionAnalysis'],
        },
      };
    }
  }

  return {
    rolloutStrategy,
    replicas: spec.replicas as number | undefined,
    minReadySeconds: spec.minReadySeconds as number | undefined,
    revisionHistoryLimit: spec.revisionHistoryLimit as number | undefined,
    progressDeadlineSeconds: spec.progressDeadlineSeconds as number | undefined,
  };
};
