import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Card,
  Row,
  Col,
  Statistic,
  Progress,
  Tag,
  Button,
  Space,
  Tabs,
  Table,
  Alert,
  Typography,
  Descriptions,
  Badge,
  Tooltip,
  message,
  Input,
} from 'antd';
import {
  ArrowLeftOutlined,
  ReloadOutlined,
  BarChartOutlined,
  DesktopOutlined,
  AppstoreOutlined,
  CheckCircleOutlined,
  ExclamationCircleOutlined,
  ClusterOutlined,
  CalendarOutlined,
  ApiOutlined,
  FolderFilled,
  CloudServerOutlined,
} from '@ant-design/icons';
import KubectlTerminal from '../../components/KubectlTerminal';
import MonitoringCharts from '../../components/MonitoringCharts';
import type { ColumnsType } from 'antd/es/table';
import type { Cluster, Node, Pod, K8sEvent, ClusterOverview } from '../../types';
import { clusterService } from '../../services/clusterService';

const { Title, Text } = Typography;

const ClusterDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [cluster, setCluster] = useState<Cluster | null>(null);
  const [nodes, setNodes] = useState<Node[]>([]);
  const [pods, setPods] = useState<Pod[]>([]);
  const [clusterOverview, setClusterOverview] = useState<ClusterOverview | null>(null);
  const [activeTab, setActiveTab] = useState('events');
  const [loadingNodes, setLoadingNodes] = useState(false);
  const [loadingPods, setLoadingPods] = useState(false);
  const [loadingOverview, setLoadingOverview] = useState(false);

  // 获取集群详情
  const fetchClusterDetail = async () => {
    if (!id) return;
    
    setLoading(true);
    try {
      const response = await clusterService.getCluster(id);
      setCluster(response.data);
    } catch (error) {
      message.error('获取集群详情失败');
      console.error('获取集群详情失败:', error);
    } finally {
      setLoading(false);
    }
  };

  // 获取集群概览信息
  const fetchClusterOverview = async () => {
    if (!id) return;
    
    setLoadingOverview(true);
    try {
      const response = await clusterService.getClusterOverview(id);
      setClusterOverview(response.data as ClusterOverview);
    } catch (error) {
      message.error('获取集群概览信息失败');
      console.error('获取集群概览信息失败:', error);
    } finally {
      setLoadingOverview(false);
    }
  };

  // 刷新所有数据
  const refreshAllData = () => {
    fetchClusterDetail();
    fetchClusterOverview();
  };

  // 获取状态标签
  const getStatusTag = (status: string) => {
    const statusConfig = {
      healthy: { color: 'success', icon: <CheckCircleOutlined />, text: '健康' },
      Ready: { color: 'success', icon: <CheckCircleOutlined />, text: '就绪' },
      Running: { color: 'success', icon: <CheckCircleOutlined />, text: '运行中' },
      unhealthy: { color: 'error', icon: <ExclamationCircleOutlined />, text: '异常' },
      NotReady: { color: 'error', icon: <ExclamationCircleOutlined />, text: '未就绪' },
      unknown: { color: 'default', icon: <ExclamationCircleOutlined />, text: '未知' },
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

  const fetchClusterEvents = async (keyword?: string) => {
    if (!id) return;
    setLoadingEvents(true);
    try {
      const response = await clusterService.getClusterEvents(id, keyword ? { search: keyword } : undefined);
      setEvents(response.data || []);
    } catch (error) {
      message.error('获取K8s事件失败');
      console.error('获取K8s事件失败:', error);
    } finally {
      setLoadingEvents(false);
    }
  };

  const handleSearchEvents = (value: string) => {
    setEventSearch(value);
    fetchClusterEvents(value);
  };

  const exportEventsCSV = () => {
    if (!events.length) return;
    const header = ['对象','类型','事件名称','K8s事件','发生时间'];
    const rows = events.map((e) => {
      const obj = `${e.involvedObject.kind} ${e.involvedObject.namespace ? e.involvedObject.namespace + '/' : ''}${e.involvedObject.name}`;
      const typeText = e.type === 'Normal' ? '正常' : e.type === 'Warning' ? '告警' : (e.type || '');
      const reason = e.reason || '';
      const messageText = (e.message || '');
      const t = e.lastTimestamp || e.eventTime || e.metadata?.creationTimestamp || e.firstTimestamp || '';
      const time = t ? new Date(t).toLocaleString() : '';
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
      title: '对象',
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
      title: '类型',
      dataIndex: 'type',
      key: 'type',
      render: (type: string) => (
        <Badge status={type === 'Normal' ? 'success' : 'warning'} text={type === 'Normal' ? '正常' : '告警'} />
      ),
      filters: [
        { text: '正常', value: 'Normal' },
        { text: '告警', value: 'Warning' },
      ],
      onFilter: (value, record) => record.type === value,
    },
    {
      title: '事件名称',
      dataIndex: 'reason',
      key: 'reason',
    },
    {
      title: 'K8s事件',
      dataIndex: 'message',
      key: 'message',
    },
    {
      title: '发生时间',
      dataIndex: 'lastTimestamp',
      key: 'time',
      render: (_: any, ev: K8sEvent) => {
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

  // 使用监控图表组件（启用懒加载）
  const ClusterMonitoring = () => (
    <MonitoringCharts 
      clusterId={id || ''} 
      clusterName={cluster?.name || ''}
      type="cluster"
      lazyLoad={true}
    />
  );

  // Tabs配置（使用懒加载，只有激活时才渲染）
  const tabItems = [
    {
      key: 'monitoring',
      label: (
        <span>
          <BarChartOutlined />
          监控概览
        </span>
      ),
      children: activeTab === 'monitoring' ? <ClusterMonitoring /> : null,
    },
    {
      key: 'events',
      label: 'K8S 事件',
      children: (
        <div>
          <Alert
            message="K8S 事件是集群内资源事件，包含负载、服务、存储等。事件保存时间较短，请及时导出留存。"
            type="info"
            showIcon
            style={{ marginBottom: 12 }}
          />
          <Space style={{ marginBottom: 12 }} wrap>
            <Input.Search
              allowClear
              placeholder="选择属性筛选，或输入关键字搜索"
              onSearch={handleSearchEvents}
              enterButton="搜索"
              loading={loadingEvents}
              style={{ width: 420 }}
            />
            <Button onClick={exportEventsCSV} disabled={!events.length}>导出</Button>
          </Space>
          <Table
            rowKey={(e) => (e as K8sEvent).metadata?.uid || `${(e as K8sEvent).involvedObject.kind}/${(e as K8sEvent).involvedObject.namespace || 'default'}/${(e as K8sEvent).involvedObject.name}/${(e as K8sEvent).reason}/${(e as K8sEvent).lastTimestamp || (e as K8sEvent).eventTime || (e as K8sEvent).metadata?.creationTimestamp || ''}`}
            columns={eventColumns as any}
            dataSource={events}
            loading={loadingEvents}
            pagination={{ pageSize: 20, showTotal: (t) => `共 ${t} 条` }}
          />
        </div>
      ),
    },
  ];

  useEffect(() => {
    refreshAllData();
  }, [id]);

  useEffect(() => {
    if (activeTab === 'events') {
      fetchClusterEvents(eventSearch);
    }
    // 当切换到监控概览标签页时，自动触发加载（如果使用懒加载）
    // 注意：MonitoringCharts 组件内部会处理懒加载逻辑
  }, [activeTab, id]);

  if (!cluster && !loading) {
    return (
      <Alert
        message="集群不存在"
        description="请检查集群ID是否正确"
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
            <Descriptions title="基本信息" column={3}>
              <Descriptions.Item label="集群名称">{cluster.name}</Descriptions.Item>
              <Descriptions.Item label="版本">{cluster.version}</Descriptions.Item>
              <Descriptions.Item label="状态">
                {getStatusTag(cluster.status)}
              </Descriptions.Item>
              <Descriptions.Item label="API Server">
                <Space>
                  <ApiOutlined />
                  <Text code>{cluster.apiServer}</Text>
                </Space>
              </Descriptions.Item>
              <Descriptions.Item label="创建时间">
                <Space>
                  <CalendarOutlined />
                  {new Date(cluster.createdAt).toLocaleString()}
                </Space>
              </Descriptions.Item>
              <Descriptions.Item label="容器子网">
                {/* genAI_main_start */}
                {clusterOverview?.containerSubnetIPs ? (
                  <span>
                    CIDR（可用/总IP数：{clusterOverview.containerSubnetIPs.available_ips}/{clusterOverview.containerSubnetIPs.total_ips}）
                  </span>
                ) : (
                  <span>CIDR（IP信息不可用）</span>
                )}
                {/* genAI_main_end */}
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
                        <div style={{ opacity: 0.9, marginBottom: 4 }}>总节点</div>
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
                        <div style={{ opacity: 0.9, marginBottom: 4 }}>命名空间总数</div>
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
                  <div style={{ opacity: 0.9, marginBottom: 4 }}>工作负载总数</div>
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
                  <div style={{ opacity: 0.9, marginBottom: 4 }}>Pod总数</div>
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
              onChange={setActiveTab}
              items={tabItems}
            />
          </Card>
        </>
      )}
    </div>
  );
};

export default ClusterDetail;