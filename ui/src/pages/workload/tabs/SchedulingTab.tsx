import React, { useState, useEffect, useCallback } from 'react';
import { Card, Descriptions, Spin, message, Empty, Tag } from 'antd';
import { WorkloadService } from '../../../services/workloadService';
import { useTranslation } from 'react-i18next';

interface SchedulingInfo {
  nodeSelector?: Record<string, string>;
  affinity?: {
    nodeAffinity?: Record<string, unknown>;
    podAffinity?: Record<string, unknown>;
    podAntiAffinity?: Record<string, unknown>;
  };
  tolerations?: Array<{
    key?: string;
    operator?: string;
    value?: string;
    effect?: string;
    tolerationSeconds?: number;
  }>;
}

interface SchedulingTabProps {
  clusterId: string;
  namespace: string;
  deploymentName?: string;
  rolloutName?: string;
  statefulSetName?: string;
  daemonSetName?: string;
  jobName?: string;
  cronJobName?: string;
}

interface PodSpec {
  nodeSelector?: Record<string, string>;
  affinity?: unknown;
  tolerations?: unknown[];
}

interface PodTemplate {
  spec?: PodSpec;
}

interface WorkloadSpec {
  spec?: {
    template?: PodTemplate;
  };
}

interface WorkloadResponse {
  raw?: WorkloadSpec;
  workload?: WorkloadSpec;
}

const SchedulingTab: React.FC<SchedulingTabProps> = ({ 
  clusterId, 
  namespace, 
  deploymentName,
  rolloutName,
  statefulSetName,
  daemonSetName,
  jobName,
  cronJobName
}) => {
const { t } = useTranslation(['workload', 'common']);
const [loading, setLoading] = useState(false);
  const [scheduling, setScheduling] = useState<SchedulingInfo | null>(null);

  // 获取工作负载名称和类型
  const workloadName = deploymentName || rolloutName || statefulSetName || daemonSetName || jobName || cronJobName;
  const workloadType = deploymentName ? 'Deployment' 
    : rolloutName ? 'Rollout'
    : statefulSetName ? 'StatefulSet'
    : daemonSetName ? 'DaemonSet'
    : jobName ? 'Job'
    : cronJobName ? 'CronJob'
    : '';

  // 加载调度策略
  const loadScheduling = useCallback(async () => {
    if (!clusterId || !namespace || !workloadName || !workloadType) return;
    
    setLoading(true);
    try {
      const response = await WorkloadService.getWorkloadDetail(
        clusterId,
        workloadType,
        namespace,
        workloadName
      );
      
      {
        const data = response as unknown as WorkloadResponse;
        const deployment = data.raw || data.workload;
        const spec = deployment?.spec;
        if (spec?.template?.spec) {
          setScheduling({
            nodeSelector: spec.template.spec.nodeSelector,
            affinity: spec.template.spec.affinity as SchedulingInfo['affinity'],
            tolerations: spec.template.spec.tolerations as SchedulingInfo['tolerations'],
          });
        }
      }
    } catch (error) {
      console.error('获取调度策略失败:', error);
      message.error(t('messages.fetchSchedulingError'));
    } finally {
      setLoading(false);
    }
  }, [clusterId, namespace, workloadName, workloadType]);

  useEffect(() => {
    loadScheduling();
  }, [loadScheduling]);

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '50px 0' }}>
        <Spin tip={t('scheduling.loading')} />
      </div>
    );
  }

  const hasNodeSelector = scheduling?.nodeSelector && Object.keys(scheduling.nodeSelector).length > 0;
  const hasAffinity = scheduling?.affinity && (
    scheduling.affinity.nodeAffinity || 
    scheduling.affinity.podAffinity || 
    scheduling.affinity.podAntiAffinity
  );
  const hasTolerations = scheduling?.tolerations && scheduling.tolerations.length > 0;

  if (!hasNodeSelector && !hasAffinity && !hasTolerations) {
    return (
      <Empty 
        description={t("scheduling.noScheduling")}
        style={{ padding: '50px 0' }}
      />
    );
  }

  return (
    <div>
      {/* 节点选择器 */}
      {hasNodeSelector && (
        <Card title={t('scheduling.nodeSelector')} size="small" style={{ marginBottom: 16 }}>
          <Descriptions column={1} bordered size="small">
            {Object.entries(scheduling!.nodeSelector!).map(([key, value]) => (
              <Descriptions.Item key={key} label={key}>
                <Tag>{value}</Tag>
              </Descriptions.Item>
            ))}
          </Descriptions>
        </Card>
      )}

      {/* 节点亲和性 */}
      {hasAffinity && scheduling!.affinity!.nodeAffinity && (
        <Card title={t('scheduling.nodeAffinity')} size="small" style={{ marginBottom: 16 }}>
          <Descriptions column={1} bordered size="small">
            <Descriptions.Item label={t('scheduling.config')}>
              <pre style={{ margin: 0, maxHeight: 300, overflow: 'auto' }}>
                {JSON.stringify(scheduling!.affinity!.nodeAffinity, null, 2)}
              </pre>
            </Descriptions.Item>
          </Descriptions>
        </Card>
      )}

      {/* Pod亲和性 */}
      {hasAffinity && scheduling!.affinity!.podAffinity && (
        <Card title={t('scheduling.podAffinity')} size="small" style={{ marginBottom: 16 }}>
          <Descriptions column={1} bordered size="small">
            <Descriptions.Item label={t('scheduling.config')}>
              <pre style={{ margin: 0, maxHeight: 300, overflow: 'auto' }}>
                {JSON.stringify(scheduling!.affinity!.podAffinity, null, 2)}
              </pre>
            </Descriptions.Item>
          </Descriptions>
        </Card>
      )}

      {/* Pod反亲和性 */}
      {hasAffinity && scheduling!.affinity!.podAntiAffinity && (
        <Card title={t('scheduling.podAntiAffinity')} size="small" style={{ marginBottom: 16 }}>
          <Descriptions column={1} bordered size="small">
            <Descriptions.Item label={t('scheduling.config')}>
              <pre style={{ margin: 0, maxHeight: 300, overflow: 'auto' }}>
                {JSON.stringify(scheduling!.affinity!.podAntiAffinity, null, 2)}
              </pre>
            </Descriptions.Item>
          </Descriptions>
        </Card>
      )}

      {/* 容忍度 */}
      {hasTolerations && (
        <Card title={t('scheduling.tolerations')} size="small">
          <Descriptions column={1} bordered size="small">
            {scheduling!.tolerations!.map((toleration, index) => (
              <Descriptions.Item key={index} label={t('scheduling.tolerationIndex', { index: index + 1 })}>
                <div>
                  {toleration.key && <div>Key: {toleration.key}</div>}
                  {toleration.operator && <div>Operator: <Tag>{toleration.operator}</Tag></div>}
                  {toleration.value && <div>Value: {toleration.value}</div>}
                  {toleration.effect && <div>Effect: <Tag color="orange">{toleration.effect}</Tag></div>}
                  {toleration.tolerationSeconds !== undefined && (
                    <div>Toleration Seconds: {toleration.tolerationSeconds}</div>
                  )}
                </div>
              </Descriptions.Item>
            ))}
          </Descriptions>
        </Card>
      )}
    </div>
  );
};

export default SchedulingTab;

