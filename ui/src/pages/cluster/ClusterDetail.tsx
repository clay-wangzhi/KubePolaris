import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import {
  Card,
  Row,
  Col,
  Tag,
  Button,
  Space,
  Tabs,
  Table,
  Alert,
  Typography,
  Descriptions,
  Badge,
  message,
  Input,
} from 'antd';
import {
  BarChartOutlined,
  DesktopOutlined,
  AppstoreOutlined,
  CheckCircleOutlined,
  ExclamationCircleOutlined,
  CalendarOutlined,
  ApiOutlined,
  FolderFilled,
  CloudServerOutlined,
} from '@ant-design/icons';
import ClusterMonitoringPanels from '../../components/ClusterMonitoringPanels';
import type { ColumnsType } from 'antd/es/table';
import type { Cluster, K8sEvent, ClusterOverview } from '../../types';
import { clusterService } from '../../services/clusterService';
import { useTranslation } from 'react-i18next';
const { Text } = Typography;

const ClusterDetail: React.FC = () => {
const { t } = useTranslation(['cluster', 'common']);
const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [loading, setLoading] = useState(false);
  // loadingOverview 用于控制概览数据加载状态，当前未在 UI 中使用
  const [, setLoadingOverview] = useState(false);
  const [cluster, setCluster] = useState<Cluster | null>(null);
  const [clusterOverview, setClusterOverview] = useState<ClusterOverview | null>(null);
  // 从 URL 参数读取默认 Tab，默认为 events
  const [activeTab, setActiveTab] = useState(searchParams.get('tab') || 'events');

  const fetchClusterDetail = useCallback(async () => {
    if (!id) return;
    
    setLoading(true);
    try {
      const response = await clusterService.getCluster(id);
      setCluster(response);
    } catch (error) {
      message.error(t('detail.fetchError'));
      console.error('Failed to fetch cluster detail:', error);
    } finally {
      setLoading(false);
    }
  }, [id, t]);

  const fetchClusterOverview = useCallback(async () => {
    if (!id) return;
    
    setLoadingOverview(true);
    try {
      const response = await clusterService.getClusterOverview(id);
      setClusterOverview(response as ClusterOverview);
    } catch (error) {
      message.error(t('detail.fetchOverviewError'));
      console.error('Failed to fetch cluster overview:', error);
    } finally {
      setLoadingOverview(false);
    }
  }, [id, t]);

  const refreshAllData = useCallback(() => {
    fetchClusterDetail();
    fetchClusterOverview();
  }, [fetchClusterDetail, fetchClusterOverview]);

  // 获取状态标签
  const getStatusTag = (status: string) => {
const statusConfig = {
      healthy: { color: 'success', icon: <CheckCircleOutlined />, text: t('status.healthy') },
      Ready: { color: 'success', icon: <CheckCircleOutlined />, text: t('status.ready') },
      Running: { color: 'success', icon: <CheckCircleOutlined />, text: t('common:status.running') },
      unhealthy: { color: 'error', icon: <ExclamationCircleOutlined />, text: t('status.unhealthy') },
      NotReady: { color: 'error', icon: <ExclamationCircleOutlined />, text: t('status.notReady') },
      unknown: { color: 'default', icon: <ExclamationCircleOutlined />, text: t('status.unknown') },
    };
const config = statusConfig[status as keyof typeof statusConfig] || statusConfig.unknown;
    return (
      <Tag color={config.color} icon={config.icon}>
        {config.text}
      </Tag>
    );
  };


  // 事件相关
  const [events, setEvents] = useState<K8sEvent[]>([]);
  const [loadingEvents, setLoadingEvents] = useState(false);
  const [eventSearch, setEventSearch] = useState('');

  const fetchClusterEvents = useCallback(async (keyword?: string) => {
    if (!id) return;
    setLoadingEvents(true);
    try {
      const response = await clusterService.getClusterEvents(id, keyword ? { search: keyword } : undefined);
      setEvents(response || []);
    } catch (error) {
      message.error(t('detail.fetchEventsError'));
      console.error('Failed to fetch K8s events:', error);
    } finally {
      setLoadingEvents(false);
    }
  }, [id, t]);

  const handleSearchEvents = (value: string) => {
    setEventSearch(value);
    fetchClusterEvents(value);
  };

  const exportEventsCSV = () => {
    if (!events.length) return;
const header = [t('events.object'), t('events.type'), t('events.eventName'), t('events.k8sEvent'), t('events.time')];
const rows = events.map((e) => {
      const obj = `${e.involvedObject.kind} ${e.involvedObject.namespace ? e.involvedObject.namespace + '/' : ''}${e.involvedObject.name}`;
const typeText = e.type === 'Normal' ? t('events.normal') : e.type === 'Warning' ? t('events.warning') : (e.type || '');
const reason = e.reason || '';
      const messageText = (e.message || '');
      const ts = e.lastTimestamp || e.eventTime || e.metadata?.creationTimestamp || e.firstTimestamp || '';
      const time = ts ? new Date(ts).toLocaleString() : '';
      return [obj, typeText, reason, messageText, time].map(v => `"${String(v).replace(/"/g, '""')}"`).join(',');
    });
    const csv = [header.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `cluster-${id}-events-${Date.now()}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

const eventColumns: ColumnsType<K8sEvent> = [
    {
      title: t('events.object'),
      dataIndex: 'involvedObject',
      key: 'object',
      render: (obj: K8sEvent['involvedObject']) => (
        <div>
          <div>{obj.kind}</div>
          <div style={{ color: '#999' }}>{obj.namespace ? `${obj.namespace}/` : ''}{obj.name}</div>
        </div>
      ),
    },
    {
      title: t('events.type'),
      dataIndex: 'type',
      key: 'type',
      render: (type: string) => (
        <Badge status={type === 'Normal' ? 'success' : 'warning'} text={type === 'Normal' ? t('events.normal') : t('events.warning')} />
      ),
      filters: [
        { text: t('events.normal'), value: 'Normal' },
        { text: t('events.warning'), value: 'Warning' },
      ],
      onFilter: (value, record) => record.type === value,
    },
    {
      title: t('events.eventName'),
      dataIndex: 'reason',
      key: 'reason',
    },
    {
      title: t('events.k8sEvent'),
      dataIndex: 'message',
      key: 'message',
    },
    {
      title: t('events.time'),
dataIndex: 'lastTimestamp',
      key: 'time',
      render: (_: unknown, ev: K8sEvent) => {
        const t = ev.lastTimestamp || ev.eventTime || ev.metadata?.creationTimestamp || ev.firstTimestamp;
        return t ? new Date(t).toLocaleString() : '-';
      },
      sorter: (a, b) => {
        const ta = Date.parse(a.lastTimestamp || a.eventTime || a.metadata?.creationTimestamp || a.firstTimestamp || '0');
        const tb = Date.parse(b.lastTimestamp || b.eventTime || b.metadata?.creationTimestamp || b.firstTimestamp || '0');
        return ta - tb;
      },
      defaultSortOrder: 'descend' as const,
    },
  ];

  // 使用 Grafana Panel 嵌入的集群监控组件
  const ClusterMonitoring = () => (
    <ClusterMonitoringPanels
      clusterId={id || ''}
      clusterName={cluster?.name || ''}
    />
  );

  // Tabs配置（使用懒加载，只有激活时才渲染）
  const tabItems = [
    {
      key: 'monitoring',
      label: (
        <span>
          <BarChartOutlined />
          {t('detail.monitoringOverview')}
        </span>
      ),
      children: activeTab === 'monitoring' ? <ClusterMonitoring /> : null,
    },
    {
      key: 'events',
label: t('detail.k8sEvents'),
children: (
        <div>
          <Alert
message={t('detail.eventsAlert')}
type="info"
            showIcon
            style={{ marginBottom: 12 }}
          />
          <Space style={{ marginBottom: 12 }} wrap>
            <Input.Search
              allowClear
placeholder={t('common:search.placeholder')}
              onSearch={handleSearchEvents}
              enterButton={t('common:actions.search')}
loading={loadingEvents}
              style={{ width: 420 }}
            />
            <Button onClick={exportEventsCSV} disabled={!events.length}>{t('common:actions.export')}</Button>
          </Space>
          <Table
            rowKey={(e) => (e as K8sEvent).metadata?.uid || `${(e as K8sEvent).involvedObject.kind}/${(e as K8sEvent).involvedObject.namespace || 'default'}/${(e as K8sEvent).involvedObject.name}/${(e as K8sEvent).reason}/${(e as K8sEvent).lastTimestamp || (e as K8sEvent).eventTime || (e as K8sEvent).metadata?.creationTimestamp || ''}`}
            columns={eventColumns}
            dataSource={events}
            loading={loadingEvents}
pagination={{ pageSize: 20, showTotal: (total) => t('events.totalEvents', { count: total }) }}
/>
        </div>
      ),
    },
  ];

  useEffect(() => {
    refreshAllData();
  }, [refreshAllData]);

  useEffect(() => {
    if (activeTab === 'events') {
      fetchClusterEvents(eventSearch);
    }
  }, [activeTab, id, fetchClusterEvents, eventSearch]);

  if (!cluster && !loading) {
    return (
      <Alert
message={t('detail.notFound')}
        description={t('detail.notFoundDesc')}
type="error"
        showIcon
      />
    );
  }

  return (
    <div>
      {cluster && (
        <>
          {/* 集群基本信息 */}
          <Card style={{ marginBottom: 24 }}>
<Descriptions title={t('detail.info')} column={3}>
              <Descriptions.Item label={t('detail.clusterName')}>{cluster.name}</Descriptions.Item>
              <Descriptions.Item label={t('detail.version')}>{cluster.version}</Descriptions.Item>
              <Descriptions.Item label={t('detail.status')}>
{getStatusTag(cluster.status)}
              </Descriptions.Item>
              <Descriptions.Item label="API Server">
                <Space>
                  <ApiOutlined />
                  <Text code>{cluster.apiServer}</Text>
                </Space>
              </Descriptions.Item>
              <Descriptions.Item label={t('detail.createdAt')}>
                <Space>
                  <CalendarOutlined />
                  {new Date(cluster.createdAt).toLocaleString()}
                </Space>
              </Descriptions.Item>
<Descriptions.Item label={t('detail.containerSubnet')}>
                {clusterOverview?.containerSubnetIPs ? (
                  <span>
                    {t('detail.cidrAvailable', { available: clusterOverview.containerSubnetIPs.available_ips, total: clusterOverview.containerSubnetIPs.total_ips })}
                  </span>
                ) : (
                  <span>{t('detail.cidrUnavailable')}</span>
                )}
</Descriptions.Item>
            </Descriptions>
          </Card>

          {/* 统计卡片 */}
            <Row gutter={[20, 20]} className="stats-grid">
              {/* 节点概览 */}
                     <Col xs={24} sm={12} lg={6}>
                      <div
                        role="button"
                        tabIndex={0}
                        onClick={() => navigate(`/clusters/${id}/nodes`)}
                        onKeyDown={(e) => { if (e.key === 'Enter') navigate(`/clusters/${id}/nodes`); }}
                        style={{ background: 'linear-gradient(135deg,#20d6b5,#18b47b)', color: '#fff', borderRadius: 12, padding: '16px 20px', textAlign: 'center', cursor: 'pointer' }}>
                        <div style={{ opacity: 0.9, marginBottom: 4 }}>{t('detail.totalNodes')}</div>
                        <div style={{ fontSize: 22, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                          <DesktopOutlined />
                          {clusterOverview?.nodes || 0}
                        </div>
                      </div>
                    </Col>
                    <Col xs={24} sm={12} lg={6}>
                      <div
                        role="button"
                        tabIndex={0}
                        onClick={() => navigate(`/clusters/${id}/namespaces`)}
                        onKeyDown={(e) => { if (e.key === 'Enter') navigate(`/clusters/${id}/namespaces`); }}
                        style={{ background: 'linear-gradient(135deg,#ff8a00,#e52e71)', color: '#fff', borderRadius: 12, padding: '16px 20px', textAlign: 'center', cursor: 'pointer' }}>
                        <div style={{ opacity: 0.9, marginBottom: 4 }}>{t('detail.totalNamespaces')}</div>
                        <div style={{ fontSize: 22, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                          <FolderFilled />
                          {clusterOverview?.namespace || 0}
                        </div>
                      </div>
                    </Col>



              {/* 工作负载概览（仅总数，渐变数字卡） */}
               <Col xs={24} sm={12} lg={6}>
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => navigate(`/clusters/${id}/workloads`)}
                  onKeyDown={(e) => { if (e.key === 'Enter') navigate(`/clusters/${id}/workloads`); }}
                  style={{ background: 'linear-gradient(135deg,#6a11cb,#2575fc)', color: '#fff', borderRadius: 12, padding: '16px 20px', textAlign: 'center', cursor: 'pointer' }}>
                  <div style={{ opacity: 0.9, marginBottom: 4 }}>{t('detail.totalWorkloads')}</div>
                  <div style={{ fontSize: 22, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                    <AppstoreOutlined />
                    {
                      (clusterOverview?.deployments || 0) +
                      (clusterOverview?.statefulsets || 0) +
                      (clusterOverview?.daemonsets || 0) +
                      (clusterOverview?.jobs || 0) +
                      (clusterOverview?.rollouts || 0)
                    }
                  </div>
                </div>
              </Col>
              <Col xs={24} sm={12} lg={6}>
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => navigate(`/clusters/${id}/pods`)}
                  onKeyDown={(e) => { if (e.key === 'Enter') navigate(`/clusters/${id}/pods`); }}
                  style={{ background: 'linear-gradient(135deg,#36d1dc,#5b86e5)', color: '#fff', borderRadius: 12, padding: '16px 20px', textAlign: 'center', cursor: 'pointer' }}>
                  <div style={{ opacity: 0.9, marginBottom: 4 }}>{t('detail.totalPods')}</div>
                  <div style={{ fontSize: 22, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                    <CloudServerOutlined />
                    {clusterOverview?.pods || 0}
                  </div>
                </div>
              </Col>
            </Row>

          {/* 详细信息标签页 */}
          <Card>
            <Tabs 
              activeKey={activeTab} 
              onChange={(key) => {
                setActiveTab(key);
                // 同步更新 URL 参数
                setSearchParams({ tab: key });
              }}
              items={tabItems}
            />
          </Card>
        </>
      )}
    </div>
  );
};

export default ClusterDetail;