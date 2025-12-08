import React, { useState, useEffect } from 'react';
import { Table, Tag, Button, Space, message, Spin, Tabs, Empty } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { WorkloadService } from '../../../services/workloadService';

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
  const loadServices = async () => {
    if (!clusterId || !namespace || !workloadName || !workloadType) return;
    
    setLoading(true);
    try {
      const response = await WorkloadService.getWorkloadServices(
        clusterId,
        namespace,
        workloadType,
        workloadName
      );
      
      if (response.code === 200 && response.data) {
        setServices(response.data.items || []);
      } else {
        message.error(response.message || '获取Service列表失败');
      }
    } catch (error) {
      console.error('获取Service列表失败:', error);
      message.error('获取Service列表失败');
    } finally {
      setLoading(false);
    }
  };

  // 加载Ingress列表
  const loadIngresses = async () => {
    if (!clusterId || !namespace || !workloadName || !workloadType) return;
    
    setLoading(true);
    try {
      const response = await WorkloadService.getWorkloadIngresses(
        clusterId,
        namespace,
        workloadType,
        workloadName
      );
      
      if (response.code === 200 && response.data) {
        setIngresses(response.data.items || []);
      } else {
        message.error(response.message || '获取Ingress列表失败');
      }
    } catch (error) {
      console.error('获取Ingress列表失败:', error);
      message.error('获取Ingress列表失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadServices();
    loadIngresses();
  }, [clusterId, namespace, deploymentName]);

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
      title: '服务名称',
      dataIndex: 'name',
      key: 'name',
      width: 200,
    },
    {
      title: '访问类型',
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
      title: '命名空间',
      dataIndex: 'namespace',
      key: 'namespace',
      width: 150,
    },
    {
      title: '访问地址',
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
      title: '端口映射',
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
      title: '创建时间',
      dataIndex: 'createdAt',
      key: 'createdAt',
      width: 180,
      render: (time: string) => formatTime(time),
    },
  ];

  // Ingress表格列
  const ingressColumns: ColumnsType<IngressInfo> = [
    {
      title: '路由名称',
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
      title: '命名空间',
      dataIndex: 'namespace',
      key: 'namespace',
      width: 150,
    },
    {
      title: '规则',
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
      title: '创建时间',
      dataIndex: 'createdAt',
      key: 'createdAt',
      width: 180,
      render: (time: string) => formatTime(time),
    },
  ];

  const tabItems = [
    {
      key: 'service',
      label: `服务 (${services.length})`,
      children: (
        <div>
          <div style={{ marginBottom: 16 }}>
            <Space>
              <Button onClick={loadServices}>刷新</Button>
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
                showTotal: (total) => `总共 ${total} 条`,
              }}
            />
          ) : (
            <Empty description="暂无服务" />
          )}
        </div>
      ),
    },
    {
      key: 'ingress',
      label: `路由 (${ingresses.length})`,
      children: (
        <div>
          <div style={{ marginBottom: 16 }}>
            <Space>
              <Button onClick={loadIngresses}>刷新</Button>
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
                showTotal: (total) => `总共 ${total} 条`,
              }}
            />
          ) : (
            <Empty description="暂无路由" />
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

