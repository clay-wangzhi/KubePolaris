import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
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
  Dropdown,
  Menu,
  message,
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
  CloseCircleOutlined,
  DesktopOutlined,
  CodeOutlined,
  PauseCircleOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import type { Node, NodeTaint, Cluster } from '../../types';
import { nodeService, type NodeListParams, type NodeOverview } from '../../services/nodeService';
import { clusterService } from '../../services/clusterService';

const { Search } = Input;
const { Option } = Select;

const NodeList: React.FC = () => {
  const { clusterId: routeClusterId } = useParams<{ clusterId: string }>();
  const navigate = useNavigate();
  
  const [loading, setLoading] = useState(false);
  const [nodes, setNodes] = useState<Node[]>([]);
  const [overview, setOverview] = useState<NodeOverview | null>(null);
  const [clusters, setClusters] = useState<Cluster[]>([]);
  const [selectedClusterId, setSelectedClusterId] = useState<string>(routeClusterId || '1');
  const [pagination, setPagination] = useState({
    current: 1,
    pageSize: 10,
    total: 0,
  });
  const [searchText, setSearchText] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedNodes, setSelectedNodes] = useState<React.Key[]>([]);

  // 获取集群列表 - 使用useCallback优化
  const fetchClusters = useCallback(async () => {
    try {
      const response = await clusterService.getClusters();
      setClusters(response.data.items || []);
    } catch (error) {
      message.error('获取集群列表失败');
      console.error('获取集群列表失败:', error);
    }
  }, []);

  // 获取节点列表 - 使用useCallback优化
  const fetchNodes = useCallback(async (params: NodeListParams = { clusterId: selectedClusterId }) => {
    if (!params.clusterId) {
      return;
    }
    
    setLoading(true);
    try {
      const response = await nodeService.getNodes({
        ...params,
        page: params.page || pagination.current,
        pageSize: params.pageSize || pagination.pageSize,
      });
      
      setNodes(response.data.items || []);
      setPagination(prev => ({
        ...prev,
        total: response.data.total,
      }));
    } catch (error) {
      console.error('获取节点列表失败:', error);
      message.error('获取节点列表失败');
    } finally {
      setLoading(false);
    }
  }, [selectedClusterId, pagination.current, pagination.pageSize]);

  // 获取节点概览 - 使用useCallback优化
  const fetchNodeOverview = useCallback(async () => {
    if (!selectedClusterId) {
      return;
    }
    
    try {
      const response = await nodeService.getNodeOverview(selectedClusterId);
      setOverview(response.data);
    } catch (error) {
      console.error('获取节点概览失败:', error);
    }
  }, [selectedClusterId]);

  // 集群切换
  const handleClusterChange = (clusterId: string) => {
    setSelectedClusterId(clusterId);
    setPagination({ ...pagination, current: 1 });
    // 重置搜索和筛选条件
    setSearchText('');
    setStatusFilter('all');
  };

  // 搜索节点
  const handleSearch = (value: string) => {
    setSearchText(value);
    setPagination({ ...pagination, current: 1 });
    fetchNodes({
      clusterId: selectedClusterId,
      search: value,
      status: statusFilter !== 'all' ? statusFilter : undefined,
    });
  };

  // 状态筛选
  const handleStatusChange = (value: string) => {
    setStatusFilter(value);
    setPagination({ ...pagination, current: 1 });
    fetchNodes({
      clusterId: selectedClusterId,
      search: searchText,
      status: value !== 'all' ? value : undefined,
    });
  };

  // 表格分页变化
  const handleTableChange = (pagination: any) => {
    setPagination({
      current: pagination.current,
      pageSize: pagination.pageSize,
      total: pagination.total,
    });
    
    fetchNodes({
      clusterId: selectedClusterId,
      page: pagination.current,
      pageSize: pagination.pageSize,
      search: searchText,
      status: statusFilter !== 'all' ? statusFilter : undefined,
    });
  };

  // 节点选择变化
  const handleSelectionChange = (selectedRowKeys: React.Key[]) => {
    setSelectedNodes(selectedRowKeys);
  };

  // 批量操作
  const handleBatchCordon = () => {
    message.info(`批量封锁 ${selectedNodes.length} 个节点`);
    // TODO: 实现批量封锁逻辑
  };

  const handleBatchUncordon = () => {
    message.info(`批量解封 ${selectedNodes.length} 个节点`);
    // TODO: 实现批量解封逻辑
  };

  const handleBatchLabel = () => {
    message.info(`批量添加标签到 ${selectedNodes.length} 个节点`);
    // TODO: 实现批量添加标签逻辑
  };

  // 单个节点操作
  const handleViewDetail = (name: string) => {
    navigate(`/clusters/${selectedClusterId}/nodes/${name}`);
  };

  const handleNodeTerminal = (name: string) => {
    message.info(`打开节点终端: ${name}`);
    // TODO: 实现节点终端逻辑
  };

  const handleCordon = async (name: string) => {
    try {
      await nodeService.cordonNode(selectedClusterId, name);
      message.success(`节点 ${name} 封锁成功`);
      handleRefresh();
    } catch (error) {
      console.error('节点封锁失败:', error);
      message.error(`节点 ${name} 封锁失败`);
    }
  };

  const handleUncordon = async (name: string) => {
    try {
      await nodeService.uncordonNode(selectedClusterId, name);
      message.success(`节点 ${name} 解封成功`);
      handleRefresh();
    } catch (error) {
      console.error('节点解封失败:', error);
      message.error(`节点 ${name} 解封失败`);
    }
  };

  const handleDrain = async (name: string) => {
    Modal.confirm({
      title: '确认驱逐节点',
      content: `确定要驱逐节点 ${name} 上的所有 Pod 吗？此操作可能导致服务中断。`,
      okText: '确认驱逐',
      cancelText: '取消',
      okType: 'danger',
      onOk: async () => {
        try {
          await nodeService.drainNode(selectedClusterId, name, {
            ignoreDaemonSets: true,
            deleteLocalData: true,
            gracePeriodSeconds: 30,
          });
          message.success(`节点 ${name} 驱逐成功`);
          handleRefresh();
        } catch (error) {
          console.error('节点驱逐失败:', error);
          message.error(`节点 ${name} 驱逐失败`);
        }
      },
    });
  };

  const handleEditLabels = (name: string) => {
    message.info(`编辑节点 ${name} 的标签`);
    // TODO: 实现编辑标签逻辑
  };

  const handleEditTaints = (name: string) => {
    message.info(`编辑节点 ${name} 的污点`);
    // TODO: 实现编辑污点逻辑
  };

  const handleViewEvents = (name: string) => {
    message.info(`查看节点 ${name} 的事件`);
    // TODO: 实现查看事件逻辑
  };

  const handleViewPods = (name: string) => {
    navigate(`/clusters/${selectedClusterId}/pods?node=${name}`);
  };

  const handleNodeMetrics = (name: string) => {
    message.info(`查看节点 ${name} 的监控指标`);
    // TODO: 实现查看监控指标逻辑
  };

  // 获取节点状态标签
  const getStatusTag = (status: string) => {
    switch (status) {
      case 'Ready':
        return <Tag icon={<CheckCircleOutlined />} color="success">就绪</Tag>;
      case 'NotReady':
        return <Tag icon={<CloseCircleOutlined />} color="error">未就绪</Tag>;
      default:
        return <Tag icon={<ExclamationCircleOutlined />} color="default">未知</Tag>;
    }
  };

  // 获取节点状态图标
  const getStatusIcon = (node: Node) => {
    if (node.status === 'Ready') {
      // 检查是否有污点
      const hasNoScheduleTaint = node.taints?.some(
        taint => taint.effect === 'NoSchedule' || taint.effect === 'NoExecute'
      );
      
      if (hasNoScheduleTaint) {
        return <Badge status="warning" />;
      }
      
      // 检查资源使用率
      if (node.cpuUsage > 80 || node.memoryUsage > 80) {
        return <Badge status="warning" />;
      }
      
      return <Badge status="success" />;
    } else if (node.status === 'NotReady') {
      return <Badge status="error" />;
    } else {
      return <Badge status="default" />;
    }
  };

  // 获取角色标签
  const getRoleTags = (roles: string[]) => {
    return (
      <Space>
        {roles.map(role => {
          const isMaster = role.toLowerCase().includes('master') || role.toLowerCase().includes('control-plane');
          return (
            <Tag key={role} color={isMaster ? 'gold' : 'blue'}>
              {isMaster ? 'M' : 'W'}
            </Tag>
          );
        })}
      </Space>
    );
  };

  // 获取污点提示
  const getTaintTooltip = (taints: NodeTaint[]) => {
    if (!taints || taints.length === 0) {
      return '无污点';
    }
    
    return (
      <div>
        <div>污点信息:</div>
        {taints.map((taint, index) => (
          <div key={index}>
            {taint.key}{taint.value ? `=${taint.value}` : ''}:{taint.effect}
          </div>
        ))}
      </div>
    );
  };

  // 表格列定义
  const columns: ColumnsType<Node> = [
    {
      title: '状态',
      key: 'status',
      width: 60,
      render: (_, record) => getStatusIcon(record),
    },
    {
      title: '节点名称',
      dataIndex: 'name',
      key: 'name',
      width: 180,
      fixed: 'left' as const,
      render: (text) => (
        <Space style={{ width: '100%' }}>
          <DesktopOutlined style={{ color: '#1890ff', flexShrink: 0 }} />
          <a 
            onClick={() => handleViewDetail(text)}
            style={{
              whiteSpace: 'normal',
              wordBreak: 'break-all',
              lineHeight: '1.4'
            }}
          >
            {text}
          </a>
        </Space>
      ),
    },
    {
      title: '角色',
      key: 'roles',
      width: 80,
      responsive: ['md'],
      render: (_, record) => getRoleTags(record.roles),
    },
    {
      title: '版本',
      dataIndex: 'version',
      key: 'version',
      width: 100,
      responsive: ['lg'],
    },
    {
      title: '就绪状态',
      key: 'readyStatus',
      width: 80,
      render: (_, record) => getStatusTag(record.status),
    },
    {
      title: 'CPU使用率',
      key: 'cpuUsage',
      width: 100,
      responsive: ['md'],
      render: (_, record) => (
        <Progress
          percent={record.cpuUsage}
          size="small"
          status={
            record.cpuUsage > 80 
              ? 'exception' 
              : record.cpuUsage > 60 
                ? 'active' 
                : 'success'
          }
        />
      ),
    },
    {
      title: '内存使用率',
      key: 'memoryUsage',
      width: 100,
      responsive: ['md'] as const,
      render: (_, record) => (
        <Progress
          percent={record.memoryUsage}
          size="small"
          status={
            record.memoryUsage > 80 
              ? 'exception' 
              : record.memoryUsage > 60 
                ? 'active' 
                : 'success'
          }
        />
      ),
    },
    {
      title: 'Pod数量',
      key: 'podCount',
      width: 80,
      responsive: ['lg'] as const,
      render: (_, record) => `${record.podCount}/${record.maxPods}`,
    },
    {
      title: '污点',
      key: 'taints',
      width: 100,
      responsive: ['xl'],
      render: (_, record) => (
        <Tooltip title={getTaintTooltip(record.taints)}>
          <Tag color={record.taints?.length ? 'orange' : 'default'}>
            {record.taints?.length || 0}个
          </Tag>
        </Tooltip>
      ),
    },
    {
      title: '创建时间',
      dataIndex: 'createdAt',
      key: 'createdAt',
      width: 120,
      responsive: ['xl'] as const,
      render: (text) => new Date(text).toLocaleString(),
    },
    {
      title: '操作',
      key: 'action',
      width: 150,
      fixed: 'right' as const,
      render: (_, record) => (
        <Space>
          <Button
            type="text"
            icon={<EyeOutlined />}
            onClick={() => handleViewDetail(record.name)}
            title="查看详情"
          />
          <Button
            type="text"
            icon={<CodeOutlined />}
            onClick={() => handleNodeTerminal(record.name)}
            title="节点终端"
          />
          <Dropdown
            menu={{
              items: [
                ...(record.taints?.some(t => t.effect === 'NoSchedule') ? [{
                  key: 'uncordon',
                  label: '解除封锁 (Uncordon)',
                  onClick: () => handleUncordon(record.name)
                }] : [{
                  key: 'cordon',
                  label: '封锁节点 (Cordon)',
                  onClick: () => handleCordon(record.name)
                }]),
                {
                  key: 'drain',
                  label: '驱逐节点 (Drain)',
                  onClick: () => handleDrain(record.name)
                }
              ]
            }}
          >
            <Button type="text" icon={<MoreOutlined />} />
          </Dropdown>
        </Space>
      ),
    },
  ];

  // 刷新节点列表
  const handleRefresh = () => {
    setLoading(true);
    fetchNodes({ clusterId: selectedClusterId });
    if (selectedClusterId) {
      fetchNodeOverview();
    }
  };

  // 初始化加载
  useEffect(() => {
    fetchClusters();
  }, [fetchClusters]);

  // 当选中的集群ID变化时，重新获取数据
  useEffect(() => {
    if (selectedClusterId) {
      console.log('Calling fetchNodes and fetchNodeOverview with clusterId:', selectedClusterId);
      fetchNodes({ clusterId: selectedClusterId });
      fetchNodeOverview();
    }
  }, [selectedClusterId, fetchNodes, fetchNodeOverview]);

  const filteredNodes = nodes.filter((node) => {
    const matchesSearch = node.name.toLowerCase().includes(searchText.toLowerCase());
    // 检查节点是否被封锁（有 NoSchedule 污点）
    const isCordonedOrMaintenance = node.taints?.some(
      taint => taint.effect === 'NoSchedule' || taint.effect === 'NoExecute'
    ) || false;
    
    const matchesStatus = statusFilter === 'all' || 
                         (statusFilter === 'ready' && node.status === 'Ready') ||
                         (statusFilter === 'notready' && node.status === 'NotReady') ||
                         (statusFilter === 'cordoned' && isCordonedOrMaintenance) ||
                         (statusFilter === 'maintenance' && isCordonedOrMaintenance);
    return matchesSearch && matchesStatus;
  });

  // 统计数据
  const totalNodes = overview?.totalNodes || 0;
  const readyNodes = overview?.readyNodes || 0;
  const notReadyNodes = overview?.notReadyNodes || 0;
  const maintenanceNodes = overview?.maintenanceNodes || 0;

  return (
    <div>
      {/* 页面头部 */}
      <div className="page-header">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h1>节点管理</h1>
            <p>管理集群中的节点，查看节点状态和资源使用情况</p>
          </div>
          <Space>
            <Select
              value={selectedClusterId}
              style={{ width: 200 }}
              onChange={handleClusterChange}
              placeholder="选择集群"
              loading={clusters.length === 0}
            >
              {clusters.map(cluster => (
                <Option key={cluster.id} value={cluster.id.toString()}>
                  {cluster.name}
                </Option>
              ))}
            </Select>
            <Button icon={<ReloadOutlined />} onClick={handleRefresh} loading={loading}>
              刷新
            </Button>
          </Space>
        </div>
      </div>

      {/* 统计卡片 */}
      <Row gutter={[20, 20]} className="stats-grid">
        <Col xs={24} sm={12} lg={6}>
          <Card className="stats-card" style={{ background: 'linear-gradient(135deg, #00d4aa 0%, #00b894 100%)' }}>
            <Statistic
              title="总节点"
              value={totalNodes}
              prefix={<DesktopOutlined />}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card className="stats-card" style={{ background: 'linear-gradient(135deg, #006eff 0%, #1a7aff 100%)' }}>
            <Statistic
              title="就绪节点"
              value={readyNodes}
              prefix={<CheckCircleOutlined />}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card className="stats-card" style={{ background: 'linear-gradient(135deg, #ff9f43 0%, #ff7675 100%)' }}>
            <Statistic
              title="异常节点"
              value={notReadyNodes}
              prefix={<ExclamationCircleOutlined />}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card className="stats-card" style={{ background: 'linear-gradient(135deg, #a55eea 0%, #8e44ad 100%)' }}>
            <Statistic
              title="维护节点"
              value={maintenanceNodes}
              prefix={<Badge status="processing" />}
            />
          </Card>
        </Col>
      </Row>

      {/* 节点列表 */}
      <div className="table-container">
        <div className="toolbar">
          <div className="toolbar-left">
            <h3>节点列表</h3>
          </div>
          <div className="toolbar-right">
            <Select
              placeholder="筛选状态"
              style={{ width: 120 }}
              allowClear
              value={statusFilter}
              onChange={setStatusFilter}
            >
              <Option value="ready">就绪</Option>
              <Option value="notready">未就绪</Option>
              <Option value="cordoned">已封锁</Option>
              <Option value="maintenance">维护中</Option>
            </Select>
            <Search
              placeholder="搜索节点..."
              style={{ width: 240 }}
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              allowClear
            />
          </div>
        </div>
        
        <Table
          rowSelection={{
            type: 'checkbox',
            selectedRowKeys: selectedNodes,
            onChange: handleSelectionChange,
          }}
          columns={columns}
          dataSource={filteredNodes}
          rowKey="id"
          loading={loading}
          scroll={{ x: 1300 }}
          size="middle"
          pagination={{
            total: filteredNodes.length,
            pageSize: 10,
            showSizeChanger: true,
            showQuickJumper: true,
            showTotal: (total) => `共 ${total} 个节点`,
            className: 'tencent-pagination'
          }}
          locale={{
            emptyText: (
              <div style={{ padding: '48px 0', textAlign: 'center' }}>
                <DatabaseOutlined style={{ fontSize: 48, color: '#ccc', marginBottom: 16 }} />
                <div style={{ fontSize: 16, color: '#666', marginBottom: 8 }}>暂无节点数据</div>
                <div style={{ fontSize: 14, color: '#999', marginBottom: 16 }}>
                  {searchText || statusFilter ? '没有找到符合条件的节点' : '请先选择集群'}
                </div>
              </div>
            )
          }}
        />
      </div>

      {/* 批量操作栏 */}
      {selectedNodes.length > 0 && (
        <Card
          style={{
            position: 'fixed',
            bottom: 20,
            left: 20,
            right: 20,
            zIndex: 1000,
            boxShadow: '0 -2px 8px rgba(0, 0, 0, 0.15)',
          }}
        >
          <Row justify="space-between" align="middle">
            <Col>
              已选中 {selectedNodes.length} 个节点
            </Col>
            <Col>
              <Space>
                <Button onClick={handleBatchCordon}>批量封锁</Button>
                <Button onClick={handleBatchUncordon}>批量解封</Button>
                <Button onClick={handleBatchLabel}>批量添加标签</Button>
              </Space>
            </Col>
          </Row>
        </Card>
      )}
    </div>
  );
};

export default NodeList;