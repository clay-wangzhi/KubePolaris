import React, { useState, useEffect, useCallback } from 'react';
import { Table, Tag, Button, Space, message, Spin, Tabs, Empty } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { WorkloadService } from '../../../services/workloadService';
import { useTranslation } from 'react-i18next';

interface ServiceInfo {
  name: string;
  namespace: string;
  type: string;
  clusterIP: string;
  externalIPs?: string[];
  ports?: Array<{
    name?: string;
    protocol: string;
    port: number;
    targetPort: string | number;
    nodePort?: number;
  }>;
  selector?: Record<string, string>;
  createdAt: string;
}

interface IngressInfo {
  name: string;
  namespace: string;
  ingressClassName?: string;
  rules?: Array<{
    host?: string;
    paths: Array<{
      path: string;
      pathType: string;
      backend: {
        serviceName: string;
        servicePort: number | string;
      };
    }>;
  }>;
  createdAt: string;
}

interface AccessTabProps {
  clusterId: string;
  namespace: string;
  deploymentName?: string;
  rolloutName?: string;
  statefulSetName?: string;
  daemonSetName?: string;
  jobName?: string;
  cronJobName?: string;
}

const AccessTab: React.FC<AccessTabProps> = ({ 
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
  const [services, setServices] = useState<ServiceInfo[]>([]);
  const [ingresses, setIngresses] = useState<IngressInfo[]>([]);

  // 获取工作负载名称和类型
  const workloadName = deploymentName || rolloutName || statefulSetName || daemonSetName || jobName || cronJobName;
  const workloadType = deploymentName ? 'Deployment' 
    : rolloutName ? 'Rollout'
    : statefulSetName ? 'StatefulSet'
    : daemonSetName ? 'DaemonSet'
    : jobName ? 'Job'
    : cronJobName ? 'CronJob'
    : '';

  // 加载Service列表
  const loadServices = useCallback(async () => {
    if (!clusterId || !namespace || !workloadName || !workloadType) return;
    
    setLoading(true);
    try {
      const response = await WorkloadService.getWorkloadServices(
        clusterId,
        namespace,
        workloadType,
        workloadName
      );
      
      setServices(((response as unknown as { items?: unknown[] }).items || []) as ServiceInfo[]);
    } catch (error) {
      console.error('获取Service列表失败:', error);
      message.error(t('messages.fetchServiceError'));
    } finally {
      setLoading(false);
    }
  }, [clusterId, namespace, workloadName, workloadType]);

  // 加载Ingress列表
  const loadIngresses = useCallback(async () => {
    if (!clusterId || !namespace || !workloadName || !workloadType) return;
    
    setLoading(true);
    try {
      const response = await WorkloadService.getWorkloadIngresses(
        clusterId,
        namespace,
        workloadType,
        workloadName
      );
      
      setIngresses(((response as unknown as { items?: unknown[] }).items || []) as IngressInfo[]);
    } catch (error) {
      console.error('获取Ingress列表失败:', error);
      message.error(t('messages.fetchIngressError'));
    } finally {
      setLoading(false);
    }
  }, [clusterId, namespace, workloadName, workloadType]);

  useEffect(() => {
    loadServices();
    loadIngresses();
  }, [loadServices, loadIngresses]);

  // 格式化时间
  const formatTime = (timeStr: string) => {
    if (!timeStr) return '-';
    const date = new Date(timeStr);
    return date.toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    }).replace(/\//g, '-');
  };

  // Service表格列
  const serviceColumns: ColumnsType<ServiceInfo> = [
    {
      title: t('access.serviceName'),
      dataIndex: 'name',
      key: 'name',
      width: 200,
    },
    {
      title: t('access.accessType'),
      dataIndex: 'type',
      key: 'type',
      width: 150,
      render: (type: string) => {
        const colorMap: Record<string, string> = {
          'ClusterIP': 'blue',
          'NodePort': 'green',
          'LoadBalancer': 'purple',
          'ExternalName': 'orange',
        };
        return <Tag color={colorMap[type] || 'default'}>{type}</Tag>;
      },
    },
    {
      title: t('access.namespace'),
      dataIndex: 'namespace',
      key: 'namespace',
      width: 150,
    },
    {
      title: t('access.accessAddress'),
      key: 'access',
      width: 200,
      render: (_, record: ServiceInfo) => {
        if (record.type === 'LoadBalancer' && record.externalIPs && record.externalIPs.length > 0) {
          return record.externalIPs.join(', ');
        }
        return record.clusterIP || '-';
      },
    },
    {
      title: t('access.portMapping'),
      key: 'ports',
      width: 200,
      render: (_, record: ServiceInfo) => {
        if (!record.ports || record.ports.length === 0) return '-';
        return (
          <div>
            {record.ports.map((port, index) => (
              <div key={index}>
                {port.port}/{port.protocol}
                {port.nodePort && ` → ${port.nodePort}`}
              </div>
            ))}
          </div>
        );
      },
    },
    {
      title: t('access.createdAt'),
      dataIndex: 'createdAt',
      key: 'createdAt',
      width: 180,
      render: (time: string) => formatTime(time),
    },
  ];

  // Ingress表格列
  const ingressColumns: ColumnsType<IngressInfo> = [
    {
      title: t('access.routeName'),
      dataIndex: 'name',
      key: 'name',
      width: 200,
    },
    {
      title: 'IngressClass',
      dataIndex: 'ingressClassName',
      key: 'ingressClassName',
      width: 150,
      render: (className?: string) => className || '-',
    },
    {
      title: t('access.namespace'),
      dataIndex: 'namespace',
      key: 'namespace',
      width: 150,
    },
    {
      title: t('access.rules'),
      key: 'rules',
      width: 400,
      render: (_, record: IngressInfo) => {
        if (!record.rules || record.rules.length === 0) return '-';
        return (
          <div>
            {record.rules.map((rule, index) => (
              <div key={index} style={{ marginBottom: 8 }}>
                <div><strong>Host:</strong> {rule.host || '*'}</div>
                {rule.paths?.map((path, pidx) => (
                  <div key={pidx} style={{ marginLeft: 16 }}>
                    {path.path} → {path.backend.serviceName}:{path.backend.servicePort}
                  </div>
                ))}
              </div>
            ))}
          </div>
        );
      },
    },
    {
      title: t('access.createdAt'),
      dataIndex: 'createdAt',
      key: 'createdAt',
      width: 180,
      render: (time: string) => formatTime(time),
    },
  ];

  const tabItems = [
    {
      key: 'service',
      label: t('access.service') + ` (${services.length})`,
      children: (
        <div>
          <div style={{ marginBottom: 16 }}>
            <Space>
              <Button onClick={loadServices}>{t('access.refresh')}</Button>
            </Space>
          </div>
          {services.length > 0 ? (
            <Table
              columns={serviceColumns}
              dataSource={services}
              rowKey="name"
              pagination={{
                total: services.length,
                pageSize: 10,
                showSizeChanger: true,
                showTotal: (total) => t('access.total', { count: total }),
              }}
            />
          ) : (
            <Empty description={t("access.noService")} />
          )}
        </div>
      ),
    },
    {
      key: 'ingress',
      label: t('access.ingress') + ` (${ingresses.length})`,
      children: (
        <div>
          <div style={{ marginBottom: 16 }}>
            <Space>
              <Button onClick={loadIngresses}>{t('access.refresh')}</Button>
            </Space>
          </div>
          {ingresses.length > 0 ? (
            <Table
              columns={ingressColumns}
              dataSource={ingresses}
              rowKey="name"
              pagination={{
                total: ingresses.length,
                pageSize: 10,
                showSizeChanger: true,
                showTotal: (total) => t('access.total', { count: total }),
              }}
            />
          ) : (
            <Empty description={t("access.noIngress")} />
          )}
        </div>
      ),
    },
  ];

  return (
    <Spin spinning={loading}>
      <Tabs items={tabItems} />
    </Spin>
  );
};

export default AccessTab;

