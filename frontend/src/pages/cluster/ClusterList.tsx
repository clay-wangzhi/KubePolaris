import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Card,
  Table,
  Button,
  Space,
  Tag,
  Progress,
  Tooltip,
  Input,
  Select,
  Row,
  Col,
  Statistic,
  Badge,
  Modal,
} from 'antd';
import {
  PlusOutlined,
  ReloadOutlined,
  EyeOutlined,
  BarChartOutlined,
  MoreOutlined,
  DatabaseOutlined,
  CheckCircleOutlined,
  ExclamationCircleOutlined,
  ClusterOutlined,
  CodeOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import type { Cluster } from '../../types';
import { clusterService } from '../../services/clusterService';
import { message } from 'antd';

const { Search } = Input;
const { Option } = Select;

const ClusterList: React.FC = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [clusters, setClusters] = useState<Cluster[]>([]);
  const [terminalVisible, setTerminalVisible] = useState(false);
  const [selectedCluster, setSelectedCluster] = useState<Cluster | null>(null);

  // 获取集群列表 - 使用useCallback优化
  const fetchClusters = useCallback(async () => {
    setLoading(true);
    try {
      const response = await clusterService.getClusters();
      setClusters(response.data.items || []);
    } catch (error) {
      message.error('获取集群列表失败');
      console.error('获取集群列表失败:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchClusters();
  }, [fetchClusters]);

  const getStatusTag = (status: string) => {
    const statusConfig = {
      healthy: { color: 'success', icon: <CheckCircleOutlined />, text: '健康' },
      unhealthy: { color: 'error', icon: <ExclamationCircleOutlined />, text: '异常' },
      unknown: { color: 'default', icon: <ExclamationCircleOutlined />, text: '未知' },
    };
    const config = statusConfig[status as keyof typeof statusConfig] || statusConfig.unknown;
    return (
      <Tag color={config.color} icon={config.icon}>
        {config.text}
      </Tag>
    );
  };

  const columns: ColumnsType<Cluster> = [
    {
      title: '集群名称',
      dataIndex: 'name',
      key: 'name',
      width: 200,
      fixed: 'left' as const,
      render: (text, record) => (
        <div style={{ display: 'flex', alignItems: 'flex-start' }}>
          <ClusterOutlined style={{ marginRight: 8, color: '#1890ff', flexShrink: 0, marginTop: 2 }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ 
              fontWeight: 'bold',
              whiteSpace: 'normal',
              wordBreak: 'break-all',
              lineHeight: '1.4'
            }}>
              {text}
            </div>
            <div style={{ 
              color: '#666', 
              fontSize: '12px',
              whiteSpace: 'normal',
              wordBreak: 'break-all',
              lineHeight: '1.2'
            }}>
              {record.apiServer}
            </div>
          </div>
        </div>
      ),
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (status) => getStatusTag(status),
      filters: [
        { text: '健康', value: 'healthy' },
        { text: '异常', value: 'unhealthy' },
        { text: '未知', value: 'unknown' },
      ],
    },
    {
      title: '版本',
      dataIndex: 'version',
      key: 'version',
      width: 120,
      responsive: ['md'],
    },
    {
      title: '节点数',
      key: 'nodeCount',
      width: 100,
      responsive: ['lg'],
      render: (_, record) => `${record.readyNodes}/${record.nodeCount}`,
      sorter: (a, b) => a.nodeCount - b.nodeCount,
    },
    {
      title: 'CPU使用率',
      dataIndex: 'cpuUsage',
      key: 'cpuUsage',
      width: 120,
      responsive: ['lg'] as const,
      render: (usage) => (
        <Progress
          percent={Math.round(usage)}
          size="small"
          status={usage > 80 ? 'exception' : usage > 60 ? 'active' : 'success'}
        />
      ),
      sorter: (a, b) => a.cpuUsage - b.cpuUsage,
    },
    {
      title: '内存使用率',
      dataIndex: 'memoryUsage',
      key: 'memoryUsage',
      width: 120,
      responsive: ['xl'],
      render: (usage) => (
        <Progress
          percent={Math.round(usage)}
          size="small"
          status={usage > 80 ? 'exception' : usage > 60 ? 'active' : 'success'}
        />
      ),
      sorter: (a, b) => a.memoryUsage - b.memoryUsage,
    },
    {
      title: '最后心跳',
      dataIndex: 'lastHeartbeat',
      key: 'lastHeartbeat',
      width: 150,
      responsive: ['xl'] as const,
      render: (time) => new Date(time).toLocaleString(),
    },
    {
      title: '操作',
      key: 'action',
      width: 150,
      fixed: 'right' as const,
      render: (_, record) => (
        <Space size="middle">
          <Tooltip title="查看详情">
            <Button
              type="text"
              icon={<EyeOutlined />}
              onClick={() => navigate(`/clusters/${record.id}`)}
            />
          </Tooltip>
          <Tooltip title="监控">
            <Button type="text" icon={<BarChartOutlined />} />
          </Tooltip>
          <Tooltip title="更多">
            <Button type="text" icon={<MoreOutlined />} />
          </Tooltip>
        </Space>
      ),
    },
  ];

  // 打开终端
  const openTerminal = (cluster: Cluster) => {
    setSelectedCluster(cluster);
    setTerminalVisible(true);
  };

  // 关闭终端
  const closeTerminal = () => {
    setTerminalVisible(false);
    setSelectedCluster(null);
  };

  // 刷新集群列表
  const handleRefresh = () => {
    setLoading(true);
    fetchClusters();
  };

  const filteredClusters = clusters.filter((cluster) => {
    const matchesSearch = cluster.name.toLowerCase().includes(searchText.toLowerCase()) ||
                         cluster.apiServer.toLowerCase().includes(searchText.toLowerCase());
    const matchesStatus = !statusFilter || cluster.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  // 统计数据
  const healthyClusters = clusters.filter(c => c.status === 'healthy').length;
  const unhealthyClusters = clusters.filter(c => c.status === 'unhealthy').length;
  const totalNodes = clusters.reduce((sum, c) => sum + c.nodeCount, 0);
  const readyNodes = clusters.reduce((sum, c) => sum + c.readyNodes, 0);

  return (
    <div>
      {/* 页面头部 */}
      <div className="page-header">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h1>集群列表</h1>
            <p>管理和监控所有K8s集群</p>
          </div>
          <Space>
            <Button icon={<ReloadOutlined />} onClick={handleRefresh} loading={loading}>
              刷新
            </Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => navigate('/clusters/import')}>
              导入集群
            </Button>
          </Space>
        </div>
      </div>

      {/* 统计卡片 */}
      <Row gutter={[20, 20]} className="stats-grid">
        <Col xs={24} sm={12} lg={6}>
          <Card className="stats-card" style={{ background: 'linear-gradient(135deg, #00d4aa 0%, #00b894 100%)' }}>
            <Statistic
              title="健康集群"
              value={healthyClusters}
              prefix={<CheckCircleOutlined />}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card className="stats-card" style={{ background: 'linear-gradient(135deg, #ff9f43 0%, #ff7675 100%)' }}>
            <Statistic
              title="异常集群"
              value={unhealthyClusters}
              prefix={<ExclamationCircleOutlined />}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card className="stats-card" style={{ background: 'linear-gradient(135deg, #006eff 0%, #1a7aff 100%)' }}>
            <Statistic
              title="总节点数"
              value={totalNodes}
              prefix={<ClusterOutlined />}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card className="stats-card" style={{ background: 'linear-gradient(135deg, #a55eea 0%, #8e44ad 100%)' }}>
            <Statistic
              title="就绪节点"
              value={readyNodes}
              prefix={<Badge status="processing" />}
            />
          </Card>
        </Col>
      </Row>

      {/* 集群列表 */}
      <div className="table-container">
        <div className="toolbar">
          <div className="toolbar-left">
            <h3>集群列表</h3>
          </div>
          <div className="toolbar-right">
            <Select
              placeholder="筛选状态"
              style={{ width: 120 }}
              allowClear
              value={statusFilter}
              onChange={setStatusFilter}
            >
              <Option value="healthy">健康</Option>
              <Option value="unhealthy">异常</Option>
              <Option value="unknown">未知</Option>
            </Select>
            <Search
              placeholder="搜索集群..."
              style={{ width: 240 }}
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              allowClear
            />
          </div>
        </div>
        
        <Table
          columns={columns}
          dataSource={filteredClusters}
          rowKey="id"
          loading={loading}
          scroll={{ x: 1200 }}
          size="middle"
          pagination={{
            total: filteredClusters.length,
            pageSize: 10,
            showSizeChanger: true,
            showQuickJumper: true,
            showTotal: (total) => `共 ${total} 个集群`,
            className: 'tencent-pagination'
          }}
          locale={{
            emptyText: (
              <div style={{ padding: '48px 0', textAlign: 'center' }}>
                <DatabaseOutlined style={{ fontSize: 48, color: '#ccc', marginBottom: 16 }} />
                <div style={{ fontSize: 16, color: '#666', marginBottom: 8 }}>暂无集群数据</div>
                <div style={{ fontSize: 14, color: '#999', marginBottom: 16 }}>
                  {searchText || statusFilter ? '没有找到符合条件的集群' : '请先导入集群'}
                </div>
                {!searchText && !statusFilter && (
                  <Button type="primary" icon={<PlusOutlined />} onClick={() => navigate('/clusters/import')}>
                    导入集群
                  </Button>
                )}
              </div>
            )
          }}
        />
      </div>
    </div>
  );
};

export default ClusterList;