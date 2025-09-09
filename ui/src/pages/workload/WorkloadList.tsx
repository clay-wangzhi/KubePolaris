import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
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
  Alert,
  Segmented,
} from 'antd';
import {
  PlusOutlined,
  DeleteOutlined,
  ExpandAltOutlined,
  EyeOutlined,
  MoreOutlined,
} from '@ant-design/icons';
import { WorkloadService } from '../../services/workloadService';
import type { WorkloadInfo } from '../../services/workloadService';
import type { ColumnsType } from 'antd/es/table';

const { Option } = Select;
const { Search } = Input;

const WorkloadList: React.FC = () => {
  const { clusterId: routeClusterId } = useParams<{ clusterId: string }>();
  const navigate = useNavigate();
  
  // ==================== 状态管理 ====================
  // 数据状态
  const [workloads, setWorkloads] = useState<WorkloadInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  
  // 分页状态
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  
  // 筛选状态
  const [selectedNamespace, setSelectedNamespace] = useState<string>('');
  const [selectedType, setSelectedType] = useState<string>('');
  const [category, setCategory] = useState<'stateless' | 'stateful' | 'daemonset' | 'job' | 'cronjob'>('stateless');
  const [searchText, setSearchText] = useState('');
  
  // 命名空间列表状态
  const [namespaces, setNamespaces] = useState<string[]>([]);
  const [namespacesLoading, setNamespacesLoading] = useState(false);
  
  // 集群状态
  const [selectedClusterId, setSelectedClusterId] = useState<string>(routeClusterId || '1');
  
  // 操作状态
  const [scaleModalVisible, setScaleModalVisible] = useState(false);
  const [scaleWorkload, setScaleWorkload] = useState<WorkloadInfo | null>(null);
  const [scaleReplicas, setScaleReplicas] = useState(1);
  const [selectedRowKeys, setSelectedRowKeys] = useState<string[]>([]);
  const [batchDeleteModalVisible, setBatchDeleteModalVisible] = useState(false);
  
  // 防抖引用
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);


  // ==================== 核心业务逻辑 ====================
  
  // ==================== 操作处理函数 ====================
  
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
        loadWorkloads();
      } else {
        message.error(response.message || '扩缩容失败');
      }
    } catch (error) {
      console.error('扩缩容失败:', error);
      message.error('扩缩容失败');
    }
  };

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
        loadWorkloads();
      } else {
        message.error(response.message || '删除失败');
      }
    } catch (error) {
      console.error('删除失败:', error);
      message.error('删除失败');
    }
  };

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
      loadWorkloads();
    } catch (error) {
      console.error('批量删除失败:', error);
      message.error('批量删除失败');
    }
  };

  // ==================== 工具函数 ====================
  
  // 基于分类动态生成的类型标签列表
  const getCategoryTypes = useCallback((): Array<{ label: string; value: string }> => {
    switch (category) {
      case 'stateless':
        return [
          { label: 'Deployment', value: 'Deployment' },
          { label: 'Argo Rollout', value: 'Rollout' },
        ];
      case 'stateful':
        return [{ label: 'StatefulSet', value: 'StatefulSet' }];
      case 'daemonset':
        return [{ label: 'DaemonSet', value: 'DaemonSet' }];
      case 'job':
        return [{ label: 'Job', value: 'Job' }];
      case 'cronjob':
        return [{ label: 'CronJob', value: 'CronJob' }];
      default:
        return [];
    }
  }, [category]);

  // 获取命名空间列表
  const fetchNamespaces = useCallback(async () => {
    if (!selectedClusterId) return;
    
    setNamespacesLoading(true);
    try {
      const response = await WorkloadService.getWorkloadNamespaces(
        selectedClusterId,
        selectedType || undefined
      );
      
      if (response.code === 200) {
        setNamespaces(response.data || []);
      } else {
        console.error('获取命名空间列表失败:', response.message);
        // 如果获取失败，使用默认命名空间
        setNamespaces(['default', 'kube-system', 'kube-public', 'kube-node-lease']);
      }
    } catch (error) {
      console.error('获取命名空间列表失败:', error);
      // 如果获取失败，使用默认命名空间
      setNamespaces(['default', 'kube-system', 'kube-public', 'kube-node-lease']);
    } finally {
      setNamespacesLoading(false);
    }
  }, [selectedClusterId, selectedType]);

  // 获取唯一的命名空间列表（保留作为备用）
  const getNamespaces = () => {
    // 优先使用从 API 获取的命名空间列表
    if (namespaces.length > 0) {
      return namespaces;
    }
    
    // 备用方案：从当前数据中提取
    const localNamespaces = Array.from(new Set(workloads.map(w => w.namespace)));
    if (localNamespaces.length === 0) {
      return ['default', 'kube-system', 'kube-public', 'kube-node-lease'];
    }
    return localNamespaces.sort();
  };

  // 过滤工作负载（按分类）
  const filteredWorkloads = workloads.filter(workload => {
    const type = (workload.type || '').toLowerCase();
    const categoryType = (selectedType || '').toLowerCase();
    const inCategory =
       categoryType === 'stateless' ? (type === 'deployment' || type === 'rollout')
      : categoryType === 'stateful' ? (type === 'statefulset')
      : categoryType === 'daemonset' ? (type === 'daemonset')
      : categoryType === 'job' ? (type === 'job')
      : categoryType === 'cronjob' ? (type === 'cronjob')
      : true;
    return inCategory;
  });

  // 行选择配置
  const rowSelection = {
    selectedRowKeys,
    onChange: (keys: React.Key[]) => {
      setSelectedRowKeys(keys as string[]);
    },
    onSelectAll: (selected: boolean) => {
      if (selected) {
        const allKeys = filteredWorkloads.map(w => `${w.namespace}-${w.name}-${w.type}`);
        setSelectedRowKeys(allKeys);
      } else {
        setSelectedRowKeys([]);
      }
    },
  };

  // ==================== 副作用处理 ====================
  
  // 集群切换处理
  useEffect(() => {
    if (routeClusterId && routeClusterId !== selectedClusterId) {
      setSelectedClusterId(routeClusterId);
      setCurrentPage(1);
      setSearchText('');
      setSelectedNamespace('');
      setSelectedType('');
    }
  }, [routeClusterId, selectedClusterId]);

  // 统一的加载函数，避免重复代码
  const loadWorkloads = useCallback(async (page: number = currentPage, search: string = searchText) => {
    if (!selectedClusterId) return;
    
    setLoading(true);
    try {
      const response = await WorkloadService.getWorkloads(
        selectedClusterId,
        selectedNamespace || undefined,
        selectedType || undefined,
        page,
        pageSize,
        search || undefined
      );
      
      if (response.code === 200) {
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
  }, [selectedClusterId, selectedNamespace, selectedType, currentPage, pageSize, searchText]);

  // 搜索防抖处理
  useEffect(() => {
    // 如果搜索文本为空，不触发防抖逻辑
    if (!searchText.trim()) {
      return;
    }
    
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }
    
    searchTimeoutRef.current = setTimeout(() => {
      // 搜索时重置到第一页
      setCurrentPage(1);
      // 直接调用 API，避免触发翻页筛选 useEffect
      const performSearch = async () => {
        setLoading(true);
        try {
          const response = await WorkloadService.getWorkloads(
            selectedClusterId,
            selectedNamespace || undefined,
            selectedType || undefined,
            1, // 搜索时强制使用第一页
            pageSize,
            searchText || undefined
          );
          
          if (response.code === 200) {
            setWorkloads(response.data.items || []);
            setTotal(response.data.total || response.data.items?.length || 0);
          } else {
            message.error(response.message || '获取工作负载列表失败');
          }
        } catch (error) {
          console.error('搜索请求失败:', error);
          message.error('搜索请求失败');
        } finally {
          setLoading(false);
        }
      };
      performSearch();
    }, 500);
    
    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, [searchText, selectedClusterId, selectedNamespace, selectedType, pageSize]);

  // 翻页和筛选条件变化时重新加载（排除搜索文本变化）
  useEffect(() => {
    loadWorkloads();
  }, [selectedClusterId, selectedNamespace, selectedType, currentPage, pageSize, loadWorkloads]);

  // 获取命名空间列表
  useEffect(() => {
    fetchNamespaces();
  }, [fetchNamespaces]);

  // ==================== UI 组件 ====================
  
  // 类型标签组件
  const typeTags = useMemo(() => {
    return getCategoryTypes().map(t => {
      const active = selectedType === t.value;
      return (
        <Tag
          key={t.value}
          color={active ? 'processing' : 'default'}
          style={{ cursor: 'pointer', userSelect: 'none' }}
          onClick={() => {
            setCurrentPage(1);
            setSelectedType(active ? '' : t.value);
          }}
        >
          {t.label}
        </Tag>
      );
    });
  }, [selectedType, getCategoryTypes]);



  const columns: ColumnsType<WorkloadInfo> = [
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
        return <Badge status={color as 'success' | 'error' | 'default' | 'processing' | 'warning'} text={status} />;
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
      responsive: ['lg'] as ('xs' | 'sm' | 'md' | 'lg' | 'xl' | 'xxl')[],
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
        const t = (record.type || '').toLowerCase();
        const canScale = ['deployment', 'statefulset', 'argo-rollout'].includes(t);
        
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


        <div style={{ marginBottom: 16 }}>
          <div style={{ 
            display: 'flex', 
            flexWrap: 'wrap', 
            gap: '12px',
            alignItems: 'center',
            justifyContent: 'space-between'
          }}>
            {/* 分类分段控件 */}
            <Segmented
              options={[
                { label: '无状态负载', value: 'stateless' },
                { label: '有状态负载', value: 'stateful' },
                { label: '守护进程集', value: 'daemonset' },
                { label: '普通任务', value: 'job' },
                { label: '定时任务', value: 'cronjob' },
              ]}
              value={category}
              onChange={(v) => {
                const next = v as 'stateless' | 'stateful' | 'daemonset' | 'job' | 'cronjob';
                setCategory(next);
                if (next === 'stateless') {
                  setSelectedType('');
                } else if (next === 'stateful') {
                  setSelectedType('StatefulSet');
                } else if (next === 'daemonset') {
                  setSelectedType('DaemonSet');
                } else if (next === 'job') {
                  setSelectedType('Job');
                } else if (next === 'cronjob') {
                  setSelectedType('CronJob');
                } else {
                  setSelectedType('');
                }
                setCurrentPage(1);
              }}
            />
            
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
                value={selectedNamespace || undefined}
                onChange={setSelectedNamespace}
                allowClear
                loading={namespacesLoading}
              >
                {getNamespaces().map(ns => (
                  <Option key={ns} value={ns}>{ns}</Option>
                ))}
              </Select>

              {/* 类型标签筛选：随分类动态变化 */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {typeTags}
              </div>

              <Search
                placeholder="搜索工作负载名称"
                style={{ width: 250, minWidth: 200, maxWidth: 300 }}
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                allowClear
              />
            </div>
          </div>
        </div>

        <Table
          columns={columns}
          dataSource={
            // 若用户选择了具体类型，则在分类过滤后再按类型过滤
            selectedType
              ? filteredWorkloads.filter(w => (w.type || '').toLowerCase() === selectedType.toLowerCase())
              : filteredWorkloads
          }
          // dataSource={workloads}
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