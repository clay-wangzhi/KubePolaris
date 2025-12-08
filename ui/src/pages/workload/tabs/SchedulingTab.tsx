import React, { useState, useEffect } from 'react';
import { Card, Descriptions, Spin, message, Empty, Tag } from 'antd';
import { WorkloadService } from '../../../services/workloadService';

interface SchedulingInfo {
  nodeSelector?: Record<string, string>;
  affinity?: {
    nodeAffinity?: any;
    podAffinity?: any;
    podAntiAffinity?: any;
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
  const loadScheduling = async () => {
    if (!clusterId || !namespace || !workloadName || !workloadType) return;
    
    setLoading(true);
    try {
      const response = await WorkloadService.getWorkloadDetail(
        clusterId,
        workloadType,
        namespace,
        workloadName
      );
      
      if (response.code === 200 && response.data) {
        // 使用 raw 字段获取完整的 Deployment 对象
        const deployment = response.data.raw || response.data.workload;
        const spec = deployment.spec;
        if (spec?.template?.spec) {
          setScheduling({
            nodeSelector: spec.template.spec.nodeSelector,
            affinity: spec.template.spec.affinity,
            tolerations: spec.template.spec.tolerations,
          });
        }
      } else {
        message.error(response.message || '获取调度策略失败');
      }
    } catch (error) {
      console.error('获取调度策略失败:', error);
      message.error('获取调度策略失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadScheduling();
  }, [clusterId, namespace, workloadName, workloadType]);

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '50px 0' }}>
        <Spin tip="加载中..." />
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
        description="未配置调度策略"
        style={{ padding: '50px 0' }}
      />
    );
  }

  return (
    <div>
      {/* 节点选择器 */}
      {hasNodeSelector && (
        <Card title="节点选择器 (Node Selector)" size="small" style={{ marginBottom: 16 }}>
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
        <Card title="节点亲和性 (Node Affinity)" size="small" style={{ marginBottom: 16 }}>
          <Descriptions column={1} bordered size="small">
            <Descriptions.Item label="配置">
              <pre style={{ margin: 0, maxHeight: 300, overflow: 'auto' }}>
                {JSON.stringify(scheduling!.affinity!.nodeAffinity, null, 2)}
              </pre>
            </Descriptions.Item>
          </Descriptions>
        </Card>
      )}

      {/* Pod亲和性 */}
      {hasAffinity && scheduling!.affinity!.podAffinity && (
        <Card title="Pod亲和性 (Pod Affinity)" size="small" style={{ marginBottom: 16 }}>
          <Descriptions column={1} bordered size="small">
            <Descriptions.Item label="配置">
              <pre style={{ margin: 0, maxHeight: 300, overflow: 'auto' }}>
                {JSON.stringify(scheduling!.affinity!.podAffinity, null, 2)}
              </pre>
            </Descriptions.Item>
          </Descriptions>
        </Card>
      )}

      {/* Pod反亲和性 */}
      {hasAffinity && scheduling!.affinity!.podAntiAffinity && (
        <Card title="Pod反亲和性 (Pod Anti-Affinity)" size="small" style={{ marginBottom: 16 }}>
          <Descriptions column={1} bordered size="small">
            <Descriptions.Item label="配置">
              <pre style={{ margin: 0, maxHeight: 300, overflow: 'auto' }}>
                {JSON.stringify(scheduling!.affinity!.podAntiAffinity, null, 2)}
              </pre>
            </Descriptions.Item>
          </Descriptions>
        </Card>
      )}

      {/* 容忍度 */}
      {hasTolerations && (
        <Card title="容忍度 (Tolerations)" size="small">
          <Descriptions column={1} bordered size="small">
            {scheduling!.tolerations!.map((toleration, index) => (
              <Descriptions.Item key={index} label={`容忍 ${index + 1}`}>
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

