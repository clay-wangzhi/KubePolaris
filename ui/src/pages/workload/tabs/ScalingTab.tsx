import React, { useState, useEffect } from 'react';
import { Card, Descriptions, Spin, message, Empty, Tag } from 'antd';
import { WorkloadService } from '../../../services/workloadService';

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
  const loadHPA = async () => {
    if (!clusterId || !namespace || !workloadName || !workloadType) return;
    
    setLoading(true);
    try {
      const response = await WorkloadService.getWorkloadHPA(
        clusterId,
        namespace,
        workloadType,
        workloadName
      );
      
      if (response.code === 200 && response.data) {
        setHpa(response.data);
      } else {
        setHpa(null);
      }
    } catch (error) {
      console.error('获取HPA信息失败:', error);
      setHpa(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadHPA();
  }, [clusterId, namespace, workloadName, workloadType]);

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '50px 0' }}>
        <Spin tip="加载中..." />
      </div>
    );
  }

  if (!hpa) {
    return (
      <Empty 
        description="未配置弹性伸缩策略"
        style={{ padding: '50px 0' }}
      />
    );
  }

  return (
    <div>
      <Card title="弹性伸缩配置 (HPA)" size="small" style={{ marginBottom: 16 }}>
        <Descriptions column={2} bordered size="small">
          <Descriptions.Item label="HPA名称">{hpa.name}</Descriptions.Item>
          <Descriptions.Item label="命名空间">{hpa.namespace}</Descriptions.Item>
          <Descriptions.Item label="最小实例数">{hpa.minReplicas}</Descriptions.Item>
          <Descriptions.Item label="最大实例数">{hpa.maxReplicas}</Descriptions.Item>
          <Descriptions.Item label="当前实例数">{hpa.currentReplicas}</Descriptions.Item>
          <Descriptions.Item label="期望实例数">{hpa.desiredReplicas}</Descriptions.Item>
        </Descriptions>
      </Card>

      {hpa.metrics && hpa.metrics.length > 0 && (
        <Card title="伸缩指标" size="small" style={{ marginBottom: 16 }}>
          <Descriptions column={1} bordered size="small">
            {hpa.metrics.map((metric, index) => (
              <Descriptions.Item key={index} label={`指标 ${index + 1}`}>
                <div>
                  <div>类型: <Tag>{metric.type}</Tag></div>
                  {metric.resource && (
                    <>
                      <div>资源: {metric.resource.name}</div>
                      <div>目标类型: {metric.resource.target.type}</div>
                      {metric.resource.target.averageUtilization !== undefined && (
                        <div>平均利用率: {metric.resource.target.averageUtilization}%</div>
                      )}
                      {metric.resource.target.averageValue && (
                        <div>平均值: {metric.resource.target.averageValue}</div>
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
        <Card title="伸缩状态" size="small">
          <Descriptions column={1} bordered size="small">
            {hpa.conditions.map((condition, index) => (
              <Descriptions.Item key={index} label={condition.type}>
                <div>
                  <div>
                    状态: <Tag color={condition.status === 'True' ? 'success' : 'default'}>
                      {condition.status}
                    </Tag>
                  </div>
                  {condition.reason && <div>原因: {condition.reason}</div>}
                  {condition.message && <div>消息: {condition.message}</div>}
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

