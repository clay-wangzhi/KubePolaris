import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import {
  Card,
  Table,
  Button,
  Space,
  Tag,
  Input,
  message,
  Popconfirm,
  Badge,
  Typography,
  Row,
  Col,
  Tooltip,
} from 'antd';
import {
  ReloadOutlined,
  SearchOutlined,
  DeleteOutlined,
  EyeOutlined,
  FileTextOutlined,
  ConsoleSqlOutlined,
} from '@ant-design/icons';
import { PodService } from '../../services/podService';
import type { PodInfo } from '../../services/podService';

const { Title } = Typography;
const { Search } = Input;

const PodList: React.FC = () => {
  const { clusterId: routeClusterId } = useParams<{ clusterId: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  
  const [pods, setPods] = useState<PodInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [selectedClusterId, setSelectedClusterId] = useState<string>(routeClusterId || '1');
  
  // 筛选条件
  const [namespace, setNamespace] = useState(searchParams.get('namespace') || '');
  const [nodeName, setNodeName] = useState(searchParams.get('nodeName') || '');
  const [searchText, setSearchText] = useState('');

  // 获取Pod列表
  const fetchPods = useCallback(async () => {
    const clusterId = selectedClusterId;
    if (!clusterId) return;
    
    setLoading(true);
    try {
      const response = await PodService.getPods(
        clusterId,
        namespace || undefined,
        nodeName || undefined,
        undefined, // labelSelector
        undefined, // fieldSelector
        page,
        pageSize
      );
      
      if (response.code === 200) {
        setPods(response.data.items);
        setTotal(response.data.total);
      } else {
        message.error(response.message || '获取Pod列表失败');
      }
    } catch (error) {
      console.error('获取Pod列表失败:', error);
      message.error('获取Pod列表失败');
    } finally {
      setLoading(false);
    }
  }, [selectedClusterId, namespace, nodeName, page, pageSize]);

  // 删除Pod
  const handleDelete = async (pod: PodInfo) => {
    const clusterId = selectedClusterId;
    if (!clusterId) return;
    
    try {
      const response = await PodService.deletePod(clusterId, pod.namespace, pod.name);
      
      if (response.code === 200) {
        message.success('删除成功');
        fetchPods();
      } else {
        message.error(response.message || '删除失败');
      }
    } catch (error) {
      console.error('删除失败:', error);
      message.error('删除失败');
    }
  };

  // 查看Pod详情
  const handleViewDetail = (pod: PodInfo) => {
    navigate(`/clusters/${selectedClusterId}/pods/${pod.namespace}/${pod.name}`);
  };

  // 查看Pod日志
  const handleViewLogs = (pod: PodInfo) => {
    navigate(`/clusters/${selectedClusterId}/pods/${pod.namespace}/${pod.name}/logs`);
  };

  // 进入Pod终端
  const handleTerminal = (pod: PodInfo) => {
    navigate(`/clusters/${selectedClusterId}/pods/${pod.namespace}/${pod.name}/terminal`);
  };

  // 筛选条件变化
  const handleFilterChange = () => {
    const params = new URLSearchParams();
    if (namespace) params.set('namespace', namespace);
    if (nodeName) params.set('nodeName', nodeName);
    setSearchParams(params);
    setPage(1);
    fetchPods();
  };

  // 搜索
  const handleSearch = (value: string) => {
    setSearchText(value);
    // TODO: 实现本地搜索或服务端搜索
  };

  // 集群切换 - 监听路由参数变化
  useEffect(() => {
    if (routeClusterId && routeClusterId !== selectedClusterId) {
      setSelectedClusterId(routeClusterId);
      setPage(1);
      // 重置搜索和筛选条件
      setSearchText('');
      setNamespace('');
      setNodeName('');
    }
  }, [routeClusterId, selectedClusterId]);

  useEffect(() => {
    fetchPods();
  }, [fetchPods]);

  // 过滤Pod列表（本地搜索）
  const filteredPods = pods.filter(pod => {
    if (!searchText) return true;
    return pod.name.toLowerCase().includes(searchText.toLowerCase()) ||
           pod.namespace.toLowerCase().includes(searchText.toLowerCase()) ||
           pod.nodeName.toLowerCase().includes(searchText.toLowerCase());
  });

  const columns = [
    {
      title: '名称',
      dataIndex: 'name',
      key: 'name',
      width: 220,
      fixed: 'left' as const,
      render: (text: string, record: PodInfo) => (
        <Button
          type="link"
          onClick={() => handleViewDetail(record)}
          style={{ 
            padding: 0, 
            height: 'auto',
            whiteSpace: 'normal',
            wordBreak: 'break-all',
            textAlign: 'left'
          }}
        >
          <div style={{
            whiteSpace: 'normal',
            wordBreak: 'break-all',
            lineHeight: '1.4'
          }}>
            {text}
          </div>
        </Button>
      ),
    },
    {
      title: '命名空间',
      dataIndex: 'namespace',
      key: 'namespace',
      width: 120,
      render: (text: string) => <Tag color="blue">{text}</Tag>,
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 120,
      render: (text: string, record: PodInfo) => {
        const { status, color } = PodService.formatStatus(record);
        return <Badge status={color as 'success' | 'error' | 'default' | 'processing' | 'warning'} text={status} />;
      },
    },
    {
      title: '节点',
      dataIndex: 'nodeName',
      key: 'nodeName',
      width: 150,
      responsive: ['md'] as ('xs' | 'sm' | 'md' | 'lg' | 'xl' | 'xxl')[],
      render: (text: string) => text || '-',
    },
    {
      title: 'Pod IP',
      dataIndex: 'podIP',
      key: 'podIP',
      width: 120,
      responsive: ['lg'] as ('xs' | 'sm' | 'md' | 'lg' | 'xl' | 'xxl')[],
      render: (text: string) => text || '-',
    },
    {
      title: '重启次数',
      dataIndex: 'restartCount',
      key: 'restartCount',
      width: 100,
      responsive: ['md'] as ('xs' | 'sm' | 'md' | 'lg' | 'xl' | 'xxl')[],
      render: (count: number) => (
        <Tag color={count > 0 ? 'orange' : 'green'}>{count}</Tag>
      ),
    },
    {
      title: '容器',
      key: 'containers',
      width: 200,
      responsive: ['lg'] as ('xs' | 'sm' | 'md' | 'lg' | 'xl' | 'xxl')[],
      render: (record: PodInfo) => (
        <Space wrap>
          {record.containers.map((container, index) => (
            <Tooltip
              key={index}
              title={`${container.name}: ${PodService.formatContainerStatus(container)}`}
            >
              <Tag color={PodService.getContainerStatusColor(container)}>
                {container.name}
              </Tag>
            </Tooltip>
          ))}
        </Space>
      ),
    },
    {
      title: '年龄',
      dataIndex: 'createdAt',
      key: 'age',
      width: 100,
      responsive: ['xl'] as ('xs' | 'sm' | 'md' | 'lg' | 'xl' | 'xxl')[],
      render: (createdAt: string) => PodService.getAge(createdAt),
    },
    {
      title: '操作',
      key: 'actions',
      width: 200,
      fixed: 'right' as const,
      render: (record: PodInfo) => (
        <Space>
          <Tooltip title="查看详情">
            <Button
              type="text"
              icon={<EyeOutlined />}
              onClick={() => handleViewDetail(record)}
            />
          </Tooltip>
          
          <Tooltip title="查看日志">
            <Button
              type="text"
              icon={<FileTextOutlined />}
              onClick={() => handleViewLogs(record)}
            />
          </Tooltip>
          
          <Tooltip title="进入终端">
            <Button
              type="text"
              icon={<ConsoleSqlOutlined />}
              onClick={() => handleTerminal(record)}
              disabled={record.status !== 'Running'}
            />
          </Tooltip>
          
          <Popconfirm
            title="确认删除"
            description={`确定要删除Pod ${record.name} 吗？`}
            onConfirm={() => handleDelete(record)}
            okText="确定"
            cancelText="取消"
          >
            <Tooltip title="删除">
              <Button
                type="text"
                danger
                icon={<DeleteOutlined />}
              />
            </Tooltip>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div style={{ padding: '24px' }}>
      {/* 页面头部 */}
      <div style={{ marginBottom: 24 }}>
        <Title level={3}>Pod 管理</Title>
        
        <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
          <Col span={6}>
            <Input
              placeholder="命名空间"
              value={namespace}
              onChange={(e) => setNamespace(e.target.value)}
              onPressEnter={handleFilterChange}
            />
          </Col>
          <Col span={6}>
            <Input
              placeholder="节点名称"
              value={nodeName}
              onChange={(e) => setNodeName(e.target.value)}
              onPressEnter={handleFilterChange}
            />
          </Col>
          <Col span={6}>
            <Search
              placeholder="搜索Pod名称、命名空间、节点"
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              onSearch={handleSearch}
              enterButton={<SearchOutlined />}
            />
          </Col>
          <Col span={6}>
            <Space>
              <Button
                type="primary"
                icon={<ReloadOutlined />}
                onClick={fetchPods}
                loading={loading}
              >
                刷新
              </Button>
              <Button onClick={handleFilterChange}>
                应用筛选
              </Button>
            </Space>
          </Col>
        </Row>
      </div>

      {/* Pod列表 */}
      <Card>
        <Table
          columns={columns}
          dataSource={filteredPods}
          rowKey={(record) => `${record.namespace}/${record.name}`}
          loading={loading}
          pagination={{
            current: page,
            pageSize: pageSize,
            total: total,
            showSizeChanger: true,
            showQuickJumper: true,
            showTotal: (total, range) => `第 ${range[0]}-${range[1]} 条，共 ${total} 条`,
            onChange: (page, size) => {
              setPage(page);
              setPageSize(size || 20);
            },
          }}
          scroll={{ x: 1400 }}
          size="small"
        />
      </Card>
    </div>
  );
};

export default PodList;
