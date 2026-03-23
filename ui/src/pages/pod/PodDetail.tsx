import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Card,
  Descriptions,
  Button,
  Space,
  Tag,
  Table,
  Tabs,
  message,
  Badge,
  Typography,
  Row,
  Col,
  Divider,
  Tooltip,
  Popconfirm,
} from 'antd';
import {
  ArrowLeftOutlined,
  ReloadOutlined,
  DeleteOutlined,
  FileTextOutlined,
  ConsoleSqlOutlined,
  LineChartOutlined,
} from '@ant-design/icons';
import { PodService } from '../../services/podService';
import { clusterService } from '../../services/clusterService';
import PodMonitoringTab from './tabs/PodMonitoringTab';
import type { PodInfo, ContainerInfo } from '../../services/podService';

const { Title, Text } = Typography;
const { TabPane } = Tabs;

type PodDetailProps = Record<string, never>;

const PodDetail: React.FC<PodDetailProps> = () => {
  const { clusterId, namespace, name } = useParams<{
    clusterId: string;
    namespace: string;
    name: string;
  }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { t } = useTranslation('pod');
  const { t: tc } = useTranslation('common');
  const initialTab = searchParams.get('tab') || 'overview';
  
  const [pod, setPod] = useState<PodInfo | null>(null);
  const [rawPod, setRawPod] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(false);
  const [clusterName, setClusterName] = useState<string>('');

  // 获取Pod详情
  const fetchPodDetail = useCallback(async () => {
    if (!clusterId || !namespace || !name) return;
    
    setLoading(true);
    try {
      const response = await PodService.getPodDetail(clusterId, namespace, name);
      
      setPod(response.pod);
      setRawPod(response.raw);
    } catch (error) {
      console.error('Failed to fetch pod details:', error);
      message.error(t('detail.fetchError'));
    } finally {
      setLoading(false);
    }
  }, [clusterId, namespace, name]);

  // 删除Pod
  const handleDelete = async () => {
    if (!clusterId || !namespace || !name) return;
    
    try {
      await PodService.deletePod(clusterId, namespace, name);
      message.success(tc('messages.deleteSuccess'));
      navigate(`/clusters/${clusterId}/pods`);
    } catch (error) {
      console.error('Failed to delete pod:', error);
      message.error(tc('messages.deleteError'));
    }
  };

  // 查看日志
  const handleViewLogs = () => {
    navigate(`/clusters/${clusterId}/pods/${namespace}/${name}/logs`);
  };

  // 进入终端 - 新窗口打开
  const handleTerminal = () => {
    window.open(`/clusters/${clusterId}/pods/${namespace}/${name}/terminal`, '_blank');
  };

  useEffect(() => {
    fetchPodDetail();
  }, [fetchPodDetail]);

  // 获取集群名用于 Grafana 数据源
  useEffect(() => {
    const fetchClusterName = async () => {
      if (!clusterId) return;
      try {
        const response = await clusterService.getCluster(clusterId);
        if (response) {
          setClusterName(response.name);
        }
      } catch (error) {
        console.error('Failed to fetch cluster info:', error);
      }
    };
    fetchClusterName();
  }, [clusterId]);

  if (!pod) {
    return <div>{tc('messages.loading')}</div>;
  }

  const { status, color } = PodService.formatStatus(pod);

  // 容器表格列
  const containerColumns = [
    {
      title: t('container.name'),
      dataIndex: 'name',
      key: 'name',
    },
    {
      title: t('container.image'),
      dataIndex: 'image',
      key: 'image',
      ellipsis: true,
    },
    {
      title: tc('table.status'),
      key: 'status',
      render: (container: ContainerInfo) => (
        <Badge
          status={PodService.getContainerStatusColor(container) as 'success' | 'error' | 'default' | 'processing' | 'warning'}
          text={PodService.formatContainerStatus(container)}
        />
      ),
    },
    {
      title: t('container.ready'),
      dataIndex: 'ready',
      key: 'ready',
      render: (ready: boolean) => (
        <Tag color={ready ? 'green' : 'red'}>{ready ? 'Yes' : 'No'}</Tag>
      ),
    },
    {
      title: t('container.restarts'),
      dataIndex: 'restartCount',
      key: 'restartCount',
      render: (count: number) => (
        <Tag color={count > 0 ? 'orange' : 'green'}>{count}</Tag>
      ),
    },
    {
      title: t('container.ports'),
      dataIndex: 'ports',
      key: 'ports',
      render: (ports: Array<{ containerPort: number; protocol: string; name?: string }>) => {
        if (!ports || ports.length === 0) {
          return <Text type="secondary">-</Text>;
        }
        return (
          <Space wrap>
            {ports.map((port, index) => (
              <Tag key={index} color="blue">
                {port.containerPort}/{port.protocol}
              </Tag>
            ))}
          </Space>
        );
      },
    },
  ];

  // 条件表格列
  const conditionColumns = [
    {
      title: tc('table.type'),
      dataIndex: 'type',
      key: 'type',
    },
    {
      title: tc('table.status'),
      dataIndex: 'status',
      key: 'status',
      render: (text: string) => (
        <Tag color={text === 'True' ? 'green' : 'red'}>{text}</Tag>
      ),
    },
    {
      title: t('detail.reason'),
      dataIndex: 'reason',
      key: 'reason',
    },
    {
      title: t('detail.message'),
      dataIndex: 'message',
      key: 'message',
      ellipsis: true,
    },
    {
      title: tc('table.updatedAt'),
      dataIndex: 'lastTransitionTime',
      key: 'lastTransitionTime',
      render: (text: string) => new Date(text).toLocaleString(),
    },
  ];

  return (
    <div style={{ padding: '24px' }}>
      {/* 页面头部 */}
      <div style={{ marginBottom: 24 }}>
        <Space>
          <Button
            icon={<ArrowLeftOutlined />}
            onClick={() => navigate(`/clusters/${clusterId}/pods`)}
          >
            {tc('actions.back')}
          </Button>
          <Title level={3} style={{ margin: 0 }}>
            {pod.name}
          </Title>
          <Tag color="blue">{pod.namespace}</Tag>
          <Badge status={color as 'success' | 'error' | 'default' | 'processing' | 'warning'} text={status} />
        </Space>
        
        <div style={{ marginTop: 16 }}>
          <Space>
            <Button
              type="primary"
              icon={<ReloadOutlined />}
              onClick={fetchPodDetail}
              loading={loading}
            >
              {tc('actions.refresh')}
            </Button>
            
            <Button
              icon={<FileTextOutlined />}
              onClick={handleViewLogs}
            >
              {t('actions.viewLogs')}
            </Button>
            
            <Button
              icon={<ConsoleSqlOutlined />}
              onClick={handleTerminal}
              disabled={pod.status !== 'Running'}
            >
              {t('actions.terminal')}
            </Button>
            
            <Popconfirm
              title={tc('messages.confirmDelete')}
              description={t('actions.confirmDeleteContent', { name: pod.name })}
              onConfirm={handleDelete}
              okText={tc('actions.confirm')}
              cancelText={tc('actions.cancel')}
            >
              <Button danger icon={<DeleteOutlined />}>
                {tc('actions.delete')}
              </Button>
            </Popconfirm>
          </Space>
        </div>
      </div>

      {/* 详情内容 */}
      <Tabs defaultActiveKey={initialTab}>
        <TabPane tab={t('detail.overview')} key="overview">
          <Row gutter={[16, 16]}>
            <Col span={12}>
              <Card title={t('detail.info')} size="small">
                <Descriptions column={1} size="small">
                  <Descriptions.Item label={tc('table.name')}>{pod.name}</Descriptions.Item>
                  <Descriptions.Item label={tc('table.namespace')}>{pod.namespace}</Descriptions.Item>
                  <Descriptions.Item label={tc('table.status')}>
                    <Badge status={color as 'success' | 'error' | 'default' | 'processing' | 'warning'} text={status} />
                  </Descriptions.Item>
                  <Descriptions.Item label={t('detail.phase')}>{pod.phase}</Descriptions.Item>
                  <Descriptions.Item label={t('detail.nodeName')}>{pod.nodeName || '-'}</Descriptions.Item>
                  <Descriptions.Item label="Pod IP">{pod.podIP || '-'}</Descriptions.Item>
                  <Descriptions.Item label="Host IP">{pod.hostIP || '-'}</Descriptions.Item>
                  <Descriptions.Item label={tc('table.createdAt')}>
                    {new Date(pod.createdAt).toLocaleString()}
                  </Descriptions.Item>
                  <Descriptions.Item label={t('detail.age')}>
                    {PodService.getAge(pod.createdAt)}
                  </Descriptions.Item>
                </Descriptions>
              </Card>
            </Col>
            
            <Col span={12}>
              <Card title={t('detail.resourceInfo')} size="small">
                <Descriptions column={1} size="small">
                  <Descriptions.Item label={t('detail.qosClass')}>{pod.qosClass || '-'}</Descriptions.Item>
                  <Descriptions.Item label={t('detail.serviceAccount')}>{pod.serviceAccount || '-'}</Descriptions.Item>
                  <Descriptions.Item label={t('detail.priority')}>{pod.priority || '-'}</Descriptions.Item>
                  <Descriptions.Item label={t('detail.priorityClass')}>{pod.priorityClassName || '-'}</Descriptions.Item>
                  <Descriptions.Item label={t('columns.restarts')}>
                    <Tag color={pod.restartCount > 0 ? 'orange' : 'green'}>
                      {pod.restartCount}
                    </Tag>
                  </Descriptions.Item>
                </Descriptions>
              </Card>
            </Col>
          </Row>

          <Divider />

          <Card title={t('detail.labels')} size="small" style={{ marginBottom: 16 }}>
            <Space wrap>
              {Object.entries(pod.labels || {}).map(([key, value]) => (
                <Tag key={key} color="green">{key}={value}</Tag>
              ))}
            </Space>
          </Card>

          <Card title={t('detail.annotations')} size="small" style={{ marginBottom: 16 }}>
            <Space wrap>
              {Object.entries(pod.annotations || {}).slice(0, 10).map(([key, value]) => (
                <Tooltip key={key} title={`${key}=${value}`}>
                  <Tag color="blue">{key}</Tag>
                </Tooltip>
              ))}
              {Object.keys(pod.annotations || {}).length > 10 && (
                <Tag>+{Object.keys(pod.annotations || {}).length - 10} {tc('actions.more')}</Tag>
              )}
            </Space>
          </Card>

          {pod.ownerReferences && pod.ownerReferences.length > 0 && (
            <Card title={t('detail.ownerReferences')} size="small">
              <Space wrap>
                {pod.ownerReferences.map((owner, index) => (
                  <Tag key={index} color="purple">
                    {owner.kind}: {owner.name}
                  </Tag>
                ))}
              </Space>
            </Card>
          )}
        </TabPane>

        <TabPane tab={t('detail.containers')} key="containers">
          <Card title={t('detail.containers')} style={{ marginBottom: 16 }}>
            <Table
              columns={containerColumns}
              dataSource={pod.containers}
              rowKey="name"
              pagination={false}
              size="small"
            />
          </Card>

          {pod.initContainers && pod.initContainers.length > 0 && (
            <Card title={t('detail.initContainers')}>
              <Table
                columns={containerColumns}
                dataSource={pod.initContainers}
                rowKey="name"
                pagination={false}
                size="small"
              />
            </Card>
          )}
        </TabPane>

        <TabPane tab={t('detail.conditions')} key="conditions">
          <Table
            columns={conditionColumns}
            dataSource={pod.conditions || []}
            rowKey="type"
            pagination={false}
            size="small"
          />
        </TabPane>

        <TabPane tab="YAML" key="yaml">
          <Card>
            <pre style={{ 
              background: '#f5f5f5', 
              padding: '16px', 
              borderRadius: '4px',
              overflow: 'auto',
              maxHeight: '600px'
            }}>
              {JSON.stringify(rawPod, null, 2)}
            </pre>
          </Card>
        </TabPane>

        <TabPane 
          tab={
            <span>
              <LineChartOutlined style={{ marginRight: 4 }} />
              {tc('menu.monitoring')}
            </span>
          } 
          key="monitoring"
        >
          {clusterId && namespace && name && (
            <PodMonitoringTab 
              clusterId={clusterId} 
              clusterName={clusterName}
              namespace={namespace}
              podName={name}
            />
          )}
        </TabPane>
      </Tabs>
    </div>
  );
};

export default PodDetail;
