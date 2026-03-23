import React, { useState, useEffect, useCallback } from 'react';
import { Card, Descriptions, Spin, Empty, Tag } from 'antd';
import { WorkloadService } from '../../../services/workloadService';
import { useTranslation } from 'react-i18next';

interface HPAInfo {
  name: string;
  namespace: string;
  minReplicas: number;
  maxReplicas: number;
  currentReplicas: number;
  desiredReplicas: number;
  metrics?: Array<{
    type: string;
    resource?: {
      name: string;
      target: {
        type: string;
        averageUtilization?: number;
        averageValue?: string;
      };
    };
  }>;
  conditions?: Array<{
    type: string;
    status: string;
    reason?: string;
    message?: string;
  }>;
}

interface ScalingTabProps {
  clusterId: string;
  namespace: string;
  deploymentName?: string;
  rolloutName?: string;
  statefulSetName?: string;
  daemonSetName?: string;
  jobName?: string;
  cronJobName?: string;
}

const ScalingTab: React.FC<ScalingTabProps> = ({ 
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
  const [hpa, setHpa] = useState<HPAInfo | null>(null);

  // 获取工作负载名称和类型
  const workloadName = deploymentName || rolloutName || statefulSetName || daemonSetName || jobName || cronJobName;
  const workloadType = deploymentName ? 'Deployment' 
    : rolloutName ? 'Rollout'
    : statefulSetName ? 'StatefulSet'
    : daemonSetName ? 'DaemonSet'
    : jobName ? 'Job'
    : cronJobName ? 'CronJob'
    : '';

  // 加载HPA信息
  const loadHPA = useCallback(async () => {
    if (!clusterId || !namespace || !workloadName || !workloadType) return;
    
    setLoading(true);
    try {
      const response = await WorkloadService.getWorkloadHPA(
        clusterId,
        namespace,
        workloadType,
        workloadName
      );
      
      if (response) {
        setHpa(response as HPAInfo);
      } else {
        setHpa(null);
      }
    } catch (error) {
      console.error('获取HPA信息失败:', error);
      setHpa(null);
    } finally {
      setLoading(false);
    }
  }, [clusterId, namespace, workloadName, workloadType]);

  useEffect(() => {
    loadHPA();
  }, [loadHPA]);

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '50px 0' }}>
        <Spin tip={t('scaling.loading')} />
      </div>
    );
  }

  if (!hpa) {
    return (
      <Empty 
        description={t("scaling.noHpa")}
        style={{ padding: '50px 0' }}
      />
    );
  }

  return (
    <div>
      <Card title={t('scaling.hpaConfig')} size="small" style={{ marginBottom: 16 }}>
        <Descriptions column={2} bordered size="small">
          <Descriptions.Item label={t('scaling.hpaName')}>{hpa.name}</Descriptions.Item>
          <Descriptions.Item label={t('scaling.namespace')}>{hpa.namespace}</Descriptions.Item>
          <Descriptions.Item label={t('scaling.minReplicas')}>{hpa.minReplicas}</Descriptions.Item>
          <Descriptions.Item label={t('scaling.maxReplicas')}>{hpa.maxReplicas}</Descriptions.Item>
          <Descriptions.Item label={t('scaling.currentReplicas')}>{hpa.currentReplicas}</Descriptions.Item>
          <Descriptions.Item label={t('scaling.desiredReplicas')}>{hpa.desiredReplicas}</Descriptions.Item>
        </Descriptions>
      </Card>

      {hpa.metrics && hpa.metrics.length > 0 && (
        <Card title={t('scaling.metrics')} size="small" style={{ marginBottom: 16 }}>
          <Descriptions column={1} bordered size="small">
            {hpa.metrics.map((metric, index) => (
              <Descriptions.Item key={index} label={`指标 ${index + 1}`}>
                <div>
                  <div>{t('scaling.metricType')}: <Tag>{metric.type}</Tag></div>
                  {metric.resource && (
                    <>
                      <div>{t('scaling.resource')}: {metric.resource.name}</div>
                      <div>{t('scaling.targetType')}: {metric.resource.target.type}</div>
                      {metric.resource.target.averageUtilization !== undefined && (
                        <div>{t('scaling.avgUtilization')}: {metric.resource.target.averageUtilization}%</div>
                      )}
                      {metric.resource.target.averageValue && (
                        <div>{t('scaling.avgValue')}: {metric.resource.target.averageValue}</div>
                      )}
                    </>
                  )}
                </div>
              </Descriptions.Item>
            ))}
          </Descriptions>
        </Card>
      )}

      {hpa.conditions && hpa.conditions.length > 0 && (
        <Card title={t('scaling.scalingStatus')} size="small">
          <Descriptions column={1} bordered size="small">
            {hpa.conditions.map((condition, index) => (
              <Descriptions.Item key={index} label={condition.type}>
                <div>
                  <div>
                    {t('scaling.conditionStatus')}: <Tag color={condition.status === 'True' ? 'success' : 'default'}>
                      {condition.status}
                    </Tag>
                  </div>
                  {condition.reason && <div>{t('scaling.conditionReason')}: {condition.reason}</div>}
                  {condition.message && <div>{t('scaling.conditionMessage')}: {condition.message}</div>}
                </div>
              </Descriptions.Item>
            ))}
          </Descriptions>
        </Card>
      )}
    </div>
  );
};

export default ScalingTab;

