import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import {
  Card,
  Table,
  Button,
  Space,
  Tag,
  Input,
  Select,
  message,
  Popconfirm,
  Badge,
  Typography,
  Tooltip,
} from 'antd';
import {
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
  const [searchParams] = useSearchParams();
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
  
  // 下拉框选项
  const [namespaceOptions, setNamespaceOptions] = useState<string[]>([]);
  const [nodeOptions, setNodeOptions] = useState<string[]>([]);
  const [loadingNamespaces, setLoadingNamespaces] = useState(false);
  const [loadingNodes, setLoadingNodes] = useState(false);
  
  // 用于存储最新的searchText，避免useEffect依赖问题
  const searchTextRef = useRef(searchText);

  // 获取Pod列表
  const fetchPods = useCallback(async (search?: string) => {
    console.log('🔍 fetchPods called with search:', search, 'length:', search?.length);
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
        search || undefined, // search
        page,
        pageSize
      );
      
      console.log('📡 API response received for search:', search);
      
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

  // 获取命名空间列表
  const fetchNamespaces = useCallback(async () => {
    const clusterId = selectedClusterId;
    if (!clusterId) return;
    
    setLoadingNamespaces(true);
    try {
      const response = await PodService.getPodNamespaces(clusterId);
      if (response.code === 200) {
        setNamespaceOptions(response.data);
      } else {
        message.error(response.message || '获取命名空间列表失败');
      }
    } catch (error) {
      console.error('获取命名空间列表失败:', error);
      message.error('获取命名空间列表失败');
    } finally {
      setLoadingNamespaces(false);
    }
  }, [selectedClusterId]);

  // 获取节点列表
  const fetchNodes = useCallback(async () => {
    const clusterId = selectedClusterId;
    if (!clusterId) return;
    
    setLoadingNodes(true);
    try {
      const response = await PodService.getPodNodes(clusterId);
      if (response.code === 200) {
        setNodeOptions(response.data);
      } else {
        message.error(response.message || '获取节点列表失败');
      }
    } catch (error) {
      console.error('获取节点列表失败:', error);
      message.error('获取节点列表失败');
    } finally {
      setLoadingNodes(false);
    }
  }, [selectedClusterId]);

  // 删除Pod
  const handleDelete = async (pod: PodInfo) => {
    const clusterId = selectedClusterId;
    if (!clusterId) return;
    
    try {
      const response = await PodService.deletePod(clusterId, pod.namespace, pod.name);
      
      if (response.code === 200) {
        message.success('删除成功');
        fetchPods(searchText);
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

  // 搜索
  const handleSearch = (value: string) => {
    setSearchText(value);
  };

  // 搜索文本变化
  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setSearchText(value);
    searchTextRef.current = value; // 更新ref
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

  // 初始加载命名空间和节点列表
  useEffect(() => {
    console.log('📋 Loading namespaces and nodes');
    fetchNamespaces();
    fetchNodes();
  }, [fetchNamespaces, fetchNodes]);

  // 筛选条件变化时重新加载（不包括搜索）
  useEffect(() => {
    console.log('🔄 Filter conditions changed (excluding search), calling fetchPods with current searchText:', searchTextRef.current);
    fetchPods(searchTextRef.current);
  }, [selectedClusterId, namespace, nodeName, page, pageSize, fetchPods]);

  // 搜索文本变化处理
  useEffect(() => {
    console.log('🔍 Search text changed, searchText:', searchText, 'length:', searchText?.length);
    
    // 如果搜索文本为空，立即重新加载所有数据
    if (!searchText || searchText.trim().length === 0) {
      console.log('📝 Search text is empty, reloading all data');
      setPage(1);
      fetchPods('');
      return;
    }
    
    console.log('searchText', searchText, searchText.trim().length);
    // 如果搜索文本长度小于等于2，不触发搜索
    if (searchText.trim().length <= 2) {
      console.log('⏸️ Search text too short, not triggering search');
      return;
    }
    
    console.log('⏰ Setting search timer for:', searchText);
    const timer = setTimeout(() => {
      console.log('🚀 Search timer fired, calling fetchPods with:', searchText);
      setPage(1); // 搜索时重置到第一页
      fetchPods(searchText);
    }, 500); // 500ms 防抖

    return () => {
      console.log('🧹 Cleaning up search timer');
      clearTimeout(timer);
    };
  }, [searchText, fetchPods]);

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
    <div style={{ padding: '16px 24px' }}>
      {/* 页面头部 */}
      <div style={{ marginBottom: 16 }}>
        <Title level={3}>Pod 管理</Title>
      </div>

      {/* Pod列表 */}
      <Card>
        <div style={{ marginBottom: 16 }}>
          <div style={{ 
            display: 'flex', 
            flexWrap: 'wrap', 
            gap: '12px',
            alignItems: 'center',
            justifyContent: 'space-between'
          }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', flex: 1 }}>
              <Select
                placeholder="选择命名空间"
                style={{ width: 180, minWidth: 120 }}
                value={namespace || undefined}
                onChange={(value) => setNamespace(value || '')}
                allowClear
                loading={loadingNamespaces}
                showSearch
                filterOption={(input, option) =>
                  (option?.label ?? '').toLowerCase().includes(input.toLowerCase())
                }
                options={namespaceOptions.map(ns => ({ label: ns, value: ns }))}
              />

              <Select
                placeholder="选择节点"
                style={{ width: 180, minWidth: 120 }}
                value={nodeName || undefined}
                onChange={(value) => setNodeName(value || '')}
                allowClear
                loading={loadingNodes}
                showSearch
                filterOption={(input, option) =>
                  (option?.label ?? '').toLowerCase().includes(input.toLowerCase())
                }
                options={nodeOptions.map(node => ({ label: node, value: node }))}
              />

            <Search
              placeholder="搜索Pod名称、命名空间、节点"
                style={{ width: 300, minWidth: 250, maxWidth: 400 }}
              value={searchText}
                onChange={handleSearchChange}
              onSearch={handleSearch}
                allowClear
              />
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
              {/* <Button
                type="primary"
                icon={<ReloadOutlined />}
                onClick={() => fetchPods(searchText)}
                loading={loading}
              >
                刷新
              </Button> */}
            </div>
          </div>
      </div>

        <Table
          columns={columns}
          dataSource={pods}
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
