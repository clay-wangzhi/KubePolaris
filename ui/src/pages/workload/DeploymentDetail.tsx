import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { 
  Card, 
  Tabs, 
  Spin, 
  message, 
  Button, 
  Space,
  Tag,
  Descriptions,
  Typography,
  Row,
  Col
} from 'antd';
import {
  ArrowLeftOutlined,
  SyncOutlined,
  LineChartOutlined,
  FileTextOutlined
} from '@ant-design/icons';
import { WorkloadService } from '../../services/workloadService';
import InstancesTab from './tabs/InstancesTab';
import AccessTab from './tabs/AccessTab';
import ContainerTab from './tabs/ContainerTab';
import ScalingTab from './tabs/ScalingTab';
import SchedulingTab from './tabs/SchedulingTab';
import HistoryTab from './tabs/HistoryTab';
import EventsTab from './tabs/EventsTab';

const { Title, Text } = Typography;

interface DeploymentDetailData {
  name: string;
  namespace: string;
  status: string;
  replicas?: number;
  readyReplicas?: number;
  availableReplicas?: number;
  updatedReplicas?: number;
  strategy?: string;
  createdAt: string;
  labels: Record<string, string>;
  annotations: Record<string, string>;
  selector: Record<string, string>;
  images: string[];
  conditions?: Array<{
    type: string;
    status: string;
    lastUpdateTime: string;
    lastTransitionTime: string;
    reason: string;
    message: string;
  }>;
}

const DeploymentDetail: React.FC = () => {
  const { clusterId, namespace, name } = useParams<{
    clusterId: string;
    namespace: string;
    name: string;
  }>();
  const navigate = useNavigate();
  
  const [loading, setLoading] = useState(false);
  const [deployment, setDeployment] = useState<DeploymentDetailData | null>(null);
  const [activeTab, setActiveTab] = useState('instances');

  // 加载Deployment详情
  const loadDeploymentDetail = async () => {
    if (!clusterId || !namespace || !name) return;
    
    setLoading(true);
    try {
      const response = await WorkloadService.getWorkloadDetail(
        clusterId,
        'Deployment',
        namespace,
        name
      );
      
      if (response.code === 200 && response.data) {
        setDeployment(response.data.workload);
      } else {
        message.error(response.message || '获取Deployment详情失败');
      }
    } catch (error) {
      console.error('获取Deployment详情失败:', error);
      message.error('获取Deployment详情失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDeploymentDetail();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clusterId, namespace, name]);

  // 返回列表
  const handleBack = () => {
    navigate(`/clusters/${clusterId}/workloads?tab=deployment`);
  };

  // 刷新
  const handleRefresh = () => {
    loadDeploymentDetail();
  };

  // 渲染状态标签
  const renderStatusTag = (status: string) => {
    const statusMap: Record<string, { color: string; text: string }> = {
      'Running': { color: 'success', text: '运行中' },
      'Stopped': { color: 'default', text: '已停止' },
      'Degraded': { color: 'warning', text: '降级' },
      'Failed': { color: 'error', text: '失败' },
    };
    
    const statusInfo = statusMap[status] || { color: 'default', text: status };
    return <Tag color={statusInfo.color}>{statusInfo.text}</Tag>;
  };

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

  if (loading && !deployment) {
    return (
      <div style={{ textAlign: 'center', padding: '100px 0' }}>
        <Spin size="large" tip="加载中..." />
      </div>
    );
  }

  if (!deployment) {
    return (
      <div style={{ textAlign: 'center', padding: '100px 0' }}>
        <Text type="secondary">未找到Deployment信息</Text>
      </div>
    );
  }

  const tabItems = [
    {
      key: 'instances',
      label: '实例列表',
      children: (
        <InstancesTab 
          clusterId={clusterId!}
          namespace={deployment.namespace}
          deploymentName={deployment.name}
        />
      ),
    },
    {
      key: 'access',
      label: '访问方式',
      children: (
        <AccessTab 
          clusterId={clusterId!}
          namespace={deployment.namespace}
          deploymentName={deployment.name}
        />
      ),
    },
    {
      key: 'container',
      label: '容器管理',
      children: (
        <ContainerTab 
          clusterId={clusterId!}
          namespace={deployment.namespace}
          deploymentName={deployment.name}
        />
      ),
    },
    {
      key: 'scaling',
      label: '弹性伸缩',
      children: (
        <ScalingTab 
          clusterId={clusterId!}
          namespace={deployment.namespace}
          deploymentName={deployment.name}
        />
      ),
    },
    {
      key: 'scheduling',
      label: '调度策略',
      children: (
        <SchedulingTab 
          clusterId={clusterId!}
          namespace={deployment.namespace}
          deploymentName={deployment.name}
        />
      ),
    },
    {
      key: 'history',
      label: '版本记录',
      children: (
        <HistoryTab 
          clusterId={clusterId!}
          namespace={deployment.namespace}
          deploymentName={deployment.name}
        />
      ),
    },
    {
      key: 'events',
      label: '事件列表',
      children: (
        <EventsTab 
          clusterId={clusterId!}
          namespace={deployment.namespace}
          deploymentName={deployment.name}
        />
      ),
    },
  ];

  return (
    <div style={{ padding: '16px 24px', background: '#f0f2f5', minHeight: '100vh' }}>
      {/* 顶部导航区域 */}
      <div style={{ marginBottom: 16 }}>
        <Space>
          <Button 
            icon={<ArrowLeftOutlined />} 
            onClick={handleBack}
            type="text"
          >
            返回工作负载列表
          </Button>
        </Space>
      </div>

      {/* 标题和操作按钮 */}
      <div style={{ 
        background: '#fff', 
        padding: '16px 24px', 
        marginBottom: 16,
        borderRadius: '8px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center'
      }}>
        <div>
          <Space size="large">
            <Title level={4} style={{ margin: 0 }}>
              {deployment.name}
            </Title>
            {renderStatusTag(deployment.status)}
          </Space>
        </div>
        <Space>
          <Button icon={<LineChartOutlined />}>监控</Button>
          <Button icon={<FileTextOutlined />}>日志</Button>
          <Button icon={<SyncOutlined />} onClick={handleRefresh}>
            刷新
          </Button>
        </Space>
      </div>

      {/* 基础信息卡片 */}
      <Card 
        title="基础信息" 
        style={{ marginBottom: 16 }}
        bordered={false}
      >
        <Row gutter={[48, 16]}>
          <Col span={12}>
            <Descriptions column={1} size="small">
              <Descriptions.Item label="负载名称">
                {deployment.name}
              </Descriptions.Item>
              <Descriptions.Item label="状态">
                {renderStatusTag(deployment.status)}
              </Descriptions.Item>
              <Descriptions.Item label="实例个数(正常/全部)">
                <Text strong>
                  {deployment.readyReplicas || 0}/{deployment.replicas || 0}
                </Text>
              </Descriptions.Item>
              <Descriptions.Item label="容器运行时">
                普通运行时
              </Descriptions.Item>
              <Descriptions.Item label="描述">
                {deployment.annotations?.['description'] || '-'}
              </Descriptions.Item>
            </Descriptions>
          </Col>
          <Col span={12}>
            <Descriptions column={1} size="small">
              <Descriptions.Item label="命名空间">
                {deployment.namespace}
              </Descriptions.Item>
              <Descriptions.Item label="创建时间">
                {formatTime(deployment.createdAt)}
              </Descriptions.Item>
              <Descriptions.Item label="升级策略">
                {deployment.strategy || '滚动升级'}
              </Descriptions.Item>
              <Descriptions.Item label="可用实例">
                {deployment.availableReplicas || 0}
              </Descriptions.Item>
              <Descriptions.Item label="更新实例">
                {deployment.updatedReplicas || 0}
              </Descriptions.Item>
            </Descriptions>
          </Col>
        </Row>
      </Card>

      {/* Tab页内容 */}
      <Card bordered={false}>
        <Tabs
          activeKey={activeTab}
          onChange={setActiveTab}
          items={tabItems}
        />
      </Card>
    </div>
  );
};

export default DeploymentDetail;

