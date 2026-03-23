import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
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
import { useTranslation } from 'react-i18next';
import { clusterService } from '../../services/clusterService';
import InstancesTab from './tabs/InstancesTab';
import AccessTab from './tabs/AccessTab';
import ContainerTab from './tabs/ContainerTab';
import ScalingTab from './tabs/ScalingTab';
import SchedulingTab from './tabs/SchedulingTab';
import HistoryTab from './tabs/HistoryTab';
import EventsTab from './tabs/EventsTab';
import MonitoringTab from './tabs/MonitoringTab';

const { Title, Text } = Typography;

interface RolloutDetailData {
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

const RolloutDetail: React.FC = () => {
  const { clusterId, namespace, name } = useParams<{
    clusterId: string;
    namespace: string;
    name: string;
  }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  
const { t } = useTranslation(["workload", "common"]);
const [loading, setLoading] = useState(false);
  const [rollout, setRollout] = useState<RolloutDetailData | null>(null);
  // 从 URL 参数获取默认 Tab，支持通过 ?tab=monitoring 直接跳转到监控页
  const [activeTab, setActiveTab] = useState(searchParams.get('tab') || 'instances');
  const [clusterName, setClusterName] = useState<string>('');

  const loadRolloutDetail = useCallback(async () => {
    if (!clusterId || !namespace || !name) return;

    setLoading(true);
    try {
      const response = await WorkloadService.getWorkloadDetail(
        clusterId,
        'Rollout',
        namespace,
        name
      );

      setRollout(response.workload);
    } catch (error) {
      console.error('获取Rollout详情失败:', error);
      message.error(t('messages.fetchDetailError', { type: 'Rollout' }));
    } finally {
      setLoading(false);
    }
  }, [clusterId, namespace, name, t]);

  useEffect(() => {
    loadRolloutDetail();
  }, [loadRolloutDetail]);

  // 加载集群信息获取集群名称（用于 Grafana 数据源）
  useEffect(() => {
    const loadClusterInfo = async () => {
      if (!clusterId) return;
      try {
        const response = await clusterService.getCluster(clusterId);
        if (response) {
          setClusterName(response.name);
        }
      } catch (error) {
        console.error('获取集群信息失败:', error);
      }
    };
    loadClusterInfo();
  }, [clusterId]);

  // 返回列表
  const handleBack = () => {
    navigate(`/clusters/${clusterId}/workloads?tab=rollout`);
  };

  // 刷新
  const handleRefresh = () => {
    loadRolloutDetail();
  };

  // 渲染状态标签
  const renderStatusTag = (status: string) => {
    const statusMap: Record<string, { color: string; text: string }> = {
      'Running': { color: 'success', text: t('detailPage.statusMap.running') },
      'Stopped': { color: 'default', text: t('detailPage.statusMap.stopped') },
      'Degraded': { color: 'warning', text: t('detailPage.statusMap.degraded') },
      'Failed': { color: 'error', text: t('detailPage.statusMap.failed') },
      'Healthy': { color: 'success', text: t('detailPage.statusMap.healthy') },
      'Progressing': { color: 'processing', text: t('detailPage.statusMap.progressing') },
      'Paused': { color: 'warning', text: t('detailPage.statusMap.paused') },
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

  if (loading && !rollout) {
    return (
      <div style={{ textAlign: 'center', padding: '100px 0' }}>
        <Spin size="large" tip={t("common:messages.loading")} />
      </div>
    );
  }

  if (!rollout) {
    return (
      <div style={{ textAlign: 'center', padding: '100px 0' }}>
        <Text type="secondary">{t("messages.notFound", { type: "Rollout" })}</Text>
      </div>
    );
  }

  const tabItems = [
    {
      key: 'instances',
      label: t('detailTabs.instances'),
      children: (
        <InstancesTab 
          clusterId={clusterId!}
          namespace={rollout.namespace}
          rolloutName={rollout.name}
        />
      ),
    },
    {
      key: 'access',
      label: t('detailTabs.access'),
      children: (
        <AccessTab 
          clusterId={clusterId!}
          namespace={rollout.namespace}
          rolloutName={rollout.name}
        />
      ),
    },
    {
      key: 'container',
      label: t('detailTabs.container'),
      children: (
        <ContainerTab 
          clusterId={clusterId!}
          namespace={rollout.namespace}
          rolloutName={rollout.name}
        />
      ),
    },
    {
      key: 'scaling',
      label: t('detailTabs.scaling'),
      children: (
        <ScalingTab 
          clusterId={clusterId!}
          namespace={rollout.namespace}
          rolloutName={rollout.name}
        />
      ),
    },
    {
      key: 'scheduling',
      label: t('detailTabs.scheduling'),
      children: (
        <SchedulingTab 
          clusterId={clusterId!}
          namespace={rollout.namespace}
          rolloutName={rollout.name}
        />
      ),
    },
    {
      key: 'history',
      label: t('detailTabs.history'),
      children: (
        <HistoryTab 
          clusterId={clusterId!}
          namespace={rollout.namespace}
          rolloutName={rollout.name}
        />
      ),
    },
    {
      key: 'events',
      label: t('detailTabs.events'),
      children: (
        <EventsTab 
          clusterId={clusterId!}
          namespace={rollout.namespace}
          rolloutName={rollout.name}
        />
      ),
    },
    {
      key: 'monitoring',
      label: (
        <span>
          <LineChartOutlined style={{ marginRight: 4 }} />
          {t('detailTabs.monitoring')}
        </span>
      ),
      children: (
        <MonitoringTab
          clusterId={clusterId!}
          clusterName={clusterName}
          namespace={rollout.namespace}
          workloadName={rollout.name}
          workloadType="Rollout"
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
            {t('detailPage.backToList')}
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
              {rollout.name}
            </Title>
            {renderStatusTag(rollout.status)}
          </Space>
        </div>
        <Space>
          <Button 
            icon={<LineChartOutlined />} 
            onClick={() => setActiveTab('monitoring')}
            type={activeTab === 'monitoring' ? 'primary' : 'default'}
          >
            {t('detailPage.monitoring')}
          </Button>
          <Button icon={<FileTextOutlined />}>{t('detailPage.logs')}</Button>
          <Button icon={<SyncOutlined />} onClick={handleRefresh}>
            {t('detailPage.refresh')}
          </Button>
        </Space>
      </div>

      {/* 基础信息卡片 */}
      <Card 
        title={t('detailPage.basicInfo')} 
        style={{ marginBottom: 16 }}
        bordered={false}
      >
        <Row gutter={[48, 16]}>
          <Col span={12}>
            <Descriptions column={1} size="small">
              <Descriptions.Item label={t('detailPage.loadName')}>
                {rollout.name}
              </Descriptions.Item>
              <Descriptions.Item label={t('detailPage.status')}>
                {renderStatusTag(rollout.status)}
              </Descriptions.Item>
              <Descriptions.Item label={t('detailPage.instanceCount')}>
                <Text strong>
                  {rollout.readyReplicas || 0}/{rollout.replicas || 0}
                </Text>
              </Descriptions.Item>
              <Descriptions.Item label={t('detailPage.containerRuntime')}>
                {t('detailPage.normalRuntime')}
              </Descriptions.Item>
              <Descriptions.Item label={t('detailPage.description')}>
                {rollout.annotations?.['description'] || '-'}
              </Descriptions.Item>
            </Descriptions>
          </Col>
          <Col span={12}>
            <Descriptions column={1} size="small">
              <Descriptions.Item label={t('detailPage.namespace')}>
                {rollout.namespace}
              </Descriptions.Item>
              <Descriptions.Item label={t('detailPage.createdAt')}>
                {formatTime(rollout.createdAt)}
              </Descriptions.Item>
              <Descriptions.Item label={t('detailPage.releaseStrategy')}>
                {rollout.strategy || 'Canary'}
              </Descriptions.Item>
              <Descriptions.Item label={t('detailPage.availableInstances')}>
                {rollout.availableReplicas || 0}
              </Descriptions.Item>
              <Descriptions.Item label={t('detailPage.updatedInstances')}>
                {rollout.updatedReplicas || 0}
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

export default RolloutDetail;

