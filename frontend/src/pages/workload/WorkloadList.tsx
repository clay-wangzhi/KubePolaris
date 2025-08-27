import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Card,
  Table,
  Button,
  Space,
  Tag,
  Select,
  Input,
  Modal,
  message,
  Tooltip,
  Badge,
  Dropdown,
  InputNumber,
  Popconfirm,
  Checkbox,
  Alert,
} from 'antd';
import {
  ReloadOutlined,
  SearchOutlined,
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  ExpandAltOutlined,
  EyeOutlined,
  MoreOutlined,
  ExclamationCircleOutlined,
} from '@ant-design/icons';
import { WorkloadService } from '../../services/workloadService';
import type { WorkloadInfo } from '../../services/workloadService';
import { clusterService } from '../../services/clusterService';
import type { Cluster } from '../../types';

const { Option } = Select;
const { Search } = Input;

interface WorkloadListProps {}

const WorkloadList: React.FC<WorkloadListProps> = () => {
  const { clusterId: routeClusterId } = useParams<{ clusterId: string }>();
  const navigate = useNavigate();
  
  const [workloads, setWorkloads] = useState<WorkloadInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [selectedNamespace, setSelectedNamespace] = useState<string>('');
  const [selectedType, setSelectedType] = useState<string>('');
  const [searchText, setSearchText] = useState('');
  const [scaleModalVisible, setScaleModalVisible] = useState(false);
  const [scaleWorkload, setScaleWorkload] = useState<WorkloadInfo | null>(null);
  const [scaleReplicas, setScaleReplicas] = useState(1);
  const [clusters, setClusters] = useState<Cluster[]>([]);
  const [selectedClusterId, setSelectedClusterId] = useState<string>(routeClusterId || '1');

  // 获取集群列表
  const fetchClusters = useCallback(async () => {
    try {
      const response = await clusterService.getClusters();
      setClusters(response.data.items || []);
    } catch (error) {
      message.error('获取集群列表失败');
      console.error('获取集群列表失败:', error);
    }
  }, []);

  // 获取工作负载列表
  const fetchWorkloads = useCallback(async () => {
    if (!selectedClusterId) return;
    
    setLoading(true);
    try {
      const response = await WorkloadService.getWorkloads(
        selectedClusterId,
        selectedNamespace || undefined,
        selectedType || undefined,
        currentPage,
        pageSize
      );
      
      if (response.code === 200) {
        // 后端返回的数据结构是 { items: [], total: number }
        setWorkloads(response.data.items || []);
        setTotal(response.data.total || response.data.items?.length || 0);
      } else {
        message.error(response.message || '获取工作负载列表失败');
      }
    } catch (error) {
      console.error('获取工作负载列表失败:', error);
      message.error('获取工作负载列表失败');
    } finally {
      setLoading(false);
    }
  }, [selectedClusterId, selectedNamespace, selectedType, currentPage, pageSize]);

  // 集群切换
  const handleClusterChange = (clusterId: string) => {
    setSelectedClusterId(clusterId);
    setCurrentPage(1);
    // 重置搜索和筛选条件
    setSearchText('');
    setSelectedNamespace('');
    setSelectedType('');
  };

  // 扩缩容工作负载
  const handleScale = async () => {
    if (!scaleWorkload || !selectedClusterId) return;
    
    try {
      const response = await WorkloadService.scaleWorkload(
        selectedClusterId,
        scaleWorkload.namespace,
        scaleWorkload.name,
        scaleWorkload.type,
        scaleReplicas
      );
      
      if (response.code === 200) {
        message.success('扩缩容成功');
        setScaleModalVisible(false);
        fetchWorkloads();
      } else {
        message.error(response.message || '扩缩容失败');
      }
    } catch (error) {
      console.error('扩缩容失败:', error);
      message.error('扩缩容失败');
    }
  };

  // 删除工作负载
  // 删除工作负载
  const handleDelete = async (workload: WorkloadInfo) => {
    if (!selectedClusterId) return;
    
    try {
      const response = await WorkloadService.deleteWorkload(
        selectedClusterId,
        workload.namespace,
        workload.name,
        workload.type
      );
      
      if (response.code === 200) {
        message.success('删除成功');
        fetchWorkloads();
      } else {
        message.error(response.message || '删除失败');
      }
    } catch (error) {
      console.error('删除失败:', error);
      message.error('删除失败');
    }
  };

  // 添加缺失的状态变量
  const [selectedRowKeys, setSelectedRowKeys] = useState<string[]>([]);
  const [batchDeleteModalVisible, setBatchDeleteModalVisible] = useState(false);

  // 批量删除工作负载
  const handleBatchDelete = async () => {
    if (!selectedClusterId || selectedRowKeys.length === 0) return;
    
    const selectedWorkloads = workloads.filter(w => 
      selectedRowKeys.includes(`${w.namespace}-${w.name}-${w.type}`)
    );
    
    try {
      const deletePromises = selectedWorkloads.map(workload =>
        WorkloadService.deleteWorkload(
          selectedClusterId,
          workload.namespace,
          workload.name,
          workload.type
        )
      );
      
      const results = await Promise.allSettled(deletePromises);
      const successCount = results.filter(r => r.status === 'fulfilled').length;
      const failCount = results.length - successCount;
      
      if (failCount === 0) {
        message.success(`成功删除 ${successCount} 个工作负载`);
      } else {
        message.warning(`删除完成：成功 ${successCount} 个，失败 ${failCount} 个`);
      }
      
      setBatchDeleteModalVisible(false);
      setSelectedRowKeys([]);
      fetchWorkloads();
    } catch (error) {
      console.error('批量删除失败:', error);
      message.error('批量删除失败');
    }
  };

  // 行选择配置
  const rowSelection = {
    selectedRowKeys,
    onChange: (keys: React.Key[]) => {
      setSelectedRowKeys(keys as string[]);
    },
    onSelectAll: (selected: boolean, selectedRows: WorkloadInfo[], changeRows: WorkloadInfo[]) => {
      if (selected) {
        const allKeys = filteredWorkloads.map(w => `${w.namespace}-${w.name}-${w.type}`);
        setSelectedRowKeys(allKeys);
      } else {
        setSelectedRowKeys([]);
      }
    },
  };

  // 获取唯一的命名空间列表
  const getNamespaces = () => {
    const namespaces = Array.from(new Set(workloads.map(w => w.namespace)));
    return namespaces.sort();
  };

  // 过滤工作负载
  const filteredWorkloads = workloads.filter(workload => {
    if (searchText && !workload.name.toLowerCase().includes(searchText.toLowerCase())) {
      return false;
    }
    return true;
  });

  // 初始化加载
  useEffect(() => {
    fetchClusters();
  }, [fetchClusters]);

  // 当选中的集群ID变化时，重新获取数据
  useEffect(() => {
    if (selectedClusterId) {
      fetchWorkloads();
    }
  }, [selectedClusterId, fetchWorkloads]);

  const columns = [
    {
      title: '名称',
      dataIndex: 'name',
      key: 'name',
      width: 200,
      fixed: 'left' as const,
      render: (text: string, record: WorkloadInfo) => (
        <Button
          type="link"
          onClick={() => navigate(`/clusters/${selectedClusterId}/workloads/${record.namespace}/${record.name}?type=${record.type}`)}
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
      width: 130,
      render: (text: string) => <Tag color="blue">{text}</Tag>,
    },
    {
      title: '类型',
      dataIndex: 'type',
      key: 'type',
      width: 120,
      render: (text: string) => {
        const typeConfig = WorkloadService.getWorkloadTypes().find(t => t.value === text);
        return (
          <Tag color="green">
            {typeConfig?.icon} {typeConfig?.label || text}
          </Tag>
        );
      },
    },
    {
      title: '状态',
      dataIndex: 'ready',
      key: 'ready',
      width: 120,
      render: (text: string, record: WorkloadInfo) => {
        const { status, color } = WorkloadService.formatStatus(record);
        return <Badge status={color as any} text={status} />;
      },
    },
    {
      title: '副本数',
      key: 'replicas',
      width: 80,
      render: (record: WorkloadInfo) => {
        if (record.type.toLowerCase() === 'daemonset') {
          return <span>-</span>;
        }
        return (
          <span>
            {record.readyReplicas || 0} / {record.replicas || 0}
          </span>
        );
      },
    },
    {
      title: '镜像',
      dataIndex: 'images',
      key: 'images',
      width: 200,
      render: (images: string[]) => {
        if (!images || images.length === 0) return '-';
        
        const firstImage = images[0];
        const imageName = firstImage.split('/').pop()?.split(':')[0] || firstImage;
        
        return (
          <div>
            <Tooltip title={firstImage}>
              <Tag style={{ marginBottom: 2, maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {imageName}
              </Tag>
            </Tooltip>
            {images.length > 1 && (
              <Tooltip title={images.slice(1).join('\n')}>
                <Tag style={{ marginBottom: 2 }}>
                  +{images.length - 1}
                </Tag>
              </Tooltip>
            )}
          </div>
        );
      },
    },
    {
      title: '创建时间',
      dataIndex: 'createdAt',
      key: 'createdAt',
      width: 150,
      responsive: ['lg'],
      render: (text: string) => {
        if (!text) return '-';
        const date = new Date(text);
        return (
          <Tooltip title={date.toLocaleString('zh-CN')}>
            <span>{date.toLocaleDateString('zh-CN')}</span>
          </Tooltip>
        );
      },
    },
    {
      title: '操作',
      key: 'actions',
      width: 180,
      fixed: 'right' as const,
      render: (record: WorkloadInfo) => {
        const canScale = ['deployment', 'statefulset', 'Deployment', 'StatefulSet'].includes(record.type);
        
        const menuItems = [
          {
            key: 'view',
            icon: <EyeOutlined />,
            label: '查看详情',
            onClick: () => navigate(`/clusters/${selectedClusterId}/workloads/${record.namespace}/${record.name}?type=${record.type}`),
          },
          ...(canScale ? [{
            key: 'scale',
            icon: <ExpandAltOutlined />,
            label: '扩缩容',
            onClick: () => {
              setScaleWorkload(record);
              setScaleReplicas(record.replicas || 1);
              setScaleModalVisible(true);
            },
          }] : []),
          {
            key: 'delete',
            icon: <DeleteOutlined />,
            label: '删除',
            danger: true,
            onClick: () => handleDelete(record),
          },
        ];

        return (
          <Space size="small">
            <Button
              type="link"
              size="small"
              icon={<EyeOutlined />}
              onClick={() => navigate(`/clusters/${selectedClusterId}/workloads/${record.namespace}/${record.name}?type=${record.type}`)}
              style={{ padding: '0 4px' }}
            >
              详情
            </Button>
            {canScale && (
              <Button
                type="link"
                size="small"
                icon={<ExpandAltOutlined />}
                onClick={() => {
                  setScaleWorkload(record);
                  setScaleReplicas(record.replicas || 1);
                  setScaleModalVisible(true);
                }}
                style={{ padding: '0 4px' }}
              >
                扩缩容
              </Button>
            )}
            <Dropdown
              menu={{
                items: [
                  {
                    key: 'delete',
                    icon: <DeleteOutlined />,
                    label: '删除',
                    danger: true,
                    onClick: () => {
                      Modal.confirm({
                        title: '确认删除',
                        content: `确定要删除工作负载 ${record.name} 吗？`,
                        okText: '确定',
                        cancelText: '取消',
                        okType: 'danger',
                        onOk: () => handleDelete(record),
                      });
                    },
                  },
                ],
              }}
              trigger={['click']}
            >
              <Button
                type="link"
                size="small"
                icon={<MoreOutlined />}
                style={{ padding: '0 4px' }}
              />
            </Dropdown>
          </Space>
        );
      },
    },
  ];

  return (
    <div style={{ padding: '16px 24px' }}>
      {/* 页面头部 */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'flex-start',
          flexWrap: 'wrap',
          gap: '16px'
        }}>
          <div style={{ flex: 1, minWidth: '300px' }}>
            <h1 style={{ margin: '0 0 8px 0', fontSize: '24px' }}>工作负载管理</h1>
            <p style={{ margin: 0, color: '#666', fontSize: '14px' }}>
              管理集群中的工作负载，包括 Deployment、StatefulSet、DaemonSet 等
            </p>
          </div>
          <Space wrap>
            <Select
              value={selectedClusterId}
              style={{ width: 200, minWidth: 150 }}
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
            <Button icon={<ReloadOutlined />} onClick={fetchWorkloads} loading={loading}>
              刷新
            </Button>
          </Space>
        </div>
      </div>

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
                value={selectedNamespace}
                onChange={setSelectedNamespace}
                allowClear
              >
                {getNamespaces().map(ns => (
                  <Option key={ns} value={ns}>{ns}</Option>
                ))}
              </Select>
              
              <Select
                placeholder="选择工作负载类型"
                style={{ width: 180, minWidth: 120 }}
                value={selectedType}
                onChange={setSelectedType}
                allowClear
              >
                {WorkloadService.getWorkloadTypes().map(type => (
                  <Option key={type.value} value={type.value}>
                    {type.icon} {type.label}
                  </Option>
                ))}
              </Select>
              
              <Search
                placeholder="搜索工作负载名称"
                style={{ width: 250, minWidth: 200, maxWidth: 300 }}
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                allowClear
              />
            </div>
            
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
              <Button
                type="primary"
                icon={<PlusOutlined />}
                onClick={() => navigate(`/clusters/${selectedClusterId}/yaml/apply`)}
              >
                创建工作负载
              </Button>
              
              {selectedRowKeys.length > 0 && (
                <Button
                  danger
                  icon={<DeleteOutlined />}
                  onClick={() => setBatchDeleteModalVisible(true)}
                >
                  批量删除 ({selectedRowKeys.length})
                </Button>
              )}
            </div>
          </div>
        </div>

        <Table
          columns={columns}
          dataSource={filteredWorkloads}
          rowKey={(record) => `${record.namespace}-${record.name}-${record.type}`}
          rowSelection={rowSelection}
          loading={loading}
          scroll={{ x: 1400 }}
          size="middle"
          pagination={{
            current: currentPage,
            pageSize: pageSize,
            total: total,
            showSizeChanger: true,
            showQuickJumper: true,
            showTotal: (total, range) => `第 ${range[0]}-${range[1]} 条，共 ${total} 条`,
            onChange: (page, size) => {
              setCurrentPage(page);
              setPageSize(size || 20);
            },
            pageSizeOptions: ['10', '20', '50', '100'],
          }}
        />
      </Card>

      {/* 扩缩容模态框 */}
      {/* 扩缩容模态框 */}
      <Modal
        title="扩缩容工作负载"
        open={scaleModalVisible}
        onOk={handleScale}
        onCancel={() => setScaleModalVisible(false)}
        okText="确定"
        cancelText="取消"
      >
        {scaleWorkload && (
          <div>
            <p>工作负载: <strong>{scaleWorkload.name}</strong></p>
            <p>命名空间: <strong>{scaleWorkload.namespace}</strong></p>
            <p>当前副本数: <strong>{scaleWorkload.replicas || 0}</strong></p>
            <div style={{ marginTop: 16 }}>
              <label>目标副本数: </label>
              <InputNumber
                min={0}
                max={100}
                value={scaleReplicas}
                onChange={(value) => setScaleReplicas(value || 1)}
                style={{ marginLeft: 8 }}
              />
            </div>
          </div>
        )}
      </Modal>

      {/* 批量删除模态框 */}
      <Modal
        title="批量删除工作负载"
        open={batchDeleteModalVisible}
        onOk={handleBatchDelete}
        onCancel={() => setBatchDeleteModalVisible(false)}
        okText="确定删除"
        cancelText="取消"
        okButtonProps={{ danger: true }}
        width={600}
      >
        <div>
          <Alert
            message="警告"
            description={`您即将删除 ${selectedRowKeys.length} 个工作负载，此操作不可撤销！`}
            type="warning"
            showIcon
            style={{ marginBottom: 16 }}
          />
          
          <div style={{ maxHeight: 300, overflowY: 'auto' }}>
            <h4>将要删除的工作负载：</h4>
            {workloads
              .filter(w => selectedRowKeys.includes(`${w.namespace}-${w.name}-${w.type}`))
              .map(workload => (
                <div key={`${workload.namespace}-${workload.name}-${workload.type}`} 
                     style={{ padding: '8px', border: '1px solid #f0f0f0', marginBottom: '4px', borderRadius: '4px' }}>
                  <Space>
                    <Tag color="blue">{workload.namespace}</Tag>
                    <span><strong>{workload.name}</strong></span>
                    <Tag color="green">{workload.type}</Tag>
                  </Space>
                </div>
              ))}
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default WorkloadList;