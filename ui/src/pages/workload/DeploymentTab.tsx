import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Table,
  Button,
  Space,
  Tag,
  Select,
  Input,
  Modal,
  Tooltip,
  Badge,
  InputNumber,
  App,
  Popconfirm,
  Checkbox,
  Drawer,
} from 'antd';
import {
  PlusOutlined,
  ReloadOutlined,
  SettingOutlined,
  SearchOutlined,
} from '@ant-design/icons';
import { WorkloadService } from '../../services/workloadService';
import type { WorkloadInfo } from '../../services/workloadService';
import type { ColumnsType, TablePaginationConfig } from 'antd/es/table';
import type { FilterValue, SorterResult } from 'antd/es/table/interface';

const { Option } = Select;

interface DeploymentTabProps {
  clusterId: string;
  onCountChange?: (count: number) => void;
}

const DeploymentTab: React.FC<DeploymentTabProps> = ({ clusterId, onCountChange }) => {
  const navigate = useNavigate();
  const { message } = App.useApp();
  
  // 数据状态
  const [allWorkloads, setAllWorkloads] = useState<WorkloadInfo[]>([]); // 所有原始数据
  const [workloads, setWorkloads] = useState<WorkloadInfo[]>([]); // 当前页显示的数据
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  
  // 分页状态
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  
  
  // 操作状态
  const [scaleModalVisible, setScaleModalVisible] = useState(false);
  const [scaleWorkload, setScaleWorkload] = useState<WorkloadInfo | null>(null);
  const [scaleReplicas, setScaleReplicas] = useState(1);
  const [selectedRowKeys, setSelectedRowKeys] = useState<string[]>([]);
  
  // 多条件搜索状态
  interface SearchCondition {
    field: 'name' | 'namespace' | 'image' | 'status' | 'cpuLimit' | 'cpuRequest' | 'memoryLimit' | 'memoryRequest';
    value: string;
  }
  const [searchConditions, setSearchConditions] = useState<SearchCondition[]>([]);
  const [currentSearchField, setCurrentSearchField] = useState<'name' | 'namespace' | 'image' | 'status' | 'cpuLimit' | 'cpuRequest' | 'memoryLimit' | 'memoryRequest'>('name');
  const [currentSearchValue, setCurrentSearchValue] = useState('');

  // 列设置状态
  const [columnSettingsVisible, setColumnSettingsVisible] = useState(false);
  const [visibleColumns, setVisibleColumns] = useState<string[]>([
    'name', 'namespace', 'status', 'replicas', 'images', 'createdAt'
  ]);
  
  // 排序状态
  const [sortField, setSortField] = useState<string>('');
  const [sortOrder, setSortOrder] = useState<'ascend' | 'descend' | null>(null);


  // 添加搜索条件
  const addSearchCondition = () => {
    if (!currentSearchValue.trim()) return;
    
    const newCondition: SearchCondition = {
      field: currentSearchField,
      value: currentSearchValue.trim(),
    };
    
    setSearchConditions([...searchConditions, newCondition]);
    setCurrentSearchValue('');
  };

  // 删除搜索条件
  const removeSearchCondition = (index: number) => {
    setSearchConditions(searchConditions.filter((_, i) => i !== index));
  };

  // 清空所有搜索条件
  const clearAllConditions = () => {
    setSearchConditions([]);
    setCurrentSearchValue('');
  };

  // 获取搜索字段的显示名称
  const getFieldLabel = (field: string): string => {
    const labels: Record<string, string> = {
      name: '工作负载名称',
      namespace: '命名空间',
      image: '镜像',
      status: '状态',
      cpuLimit: 'CPU限制值',
      cpuRequest: 'CPU申请值',
      memoryLimit: '内存限制值',
      memoryRequest: '内存申请值',
    };
    return labels[field] || field;
  };

  // 客户端过滤工作负载列表
  const filterWorkloads = useCallback((items: WorkloadInfo[]): WorkloadInfo[] => {
    if (searchConditions.length === 0) return items;

    return items.filter(workload => {
      // 按字段分组条件
      const conditionsByField = searchConditions.reduce((acc, condition) => {
        if (!acc[condition.field]) {
          acc[condition.field] = [];
        }
        acc[condition.field].push(condition.value.toLowerCase());
        return acc;
      }, {} as Record<string, string[]>);

      // 不同字段之间是 AND 关系
      // 相同字段之间是 OR 关系
      return Object.entries(conditionsByField).every(([field, values]) => {
        const workloadValue = workload[field as keyof WorkloadInfo];
        
        // CPU和内存字段使用精确匹配
        const resourceFields = ['cpuLimit', 'cpuRequest', 'memoryLimit', 'memoryRequest'];
        if (resourceFields.includes(field)) {
          const itemStr = String(workloadValue || '-').toLowerCase();
          return values.some(searchValue => itemStr === searchValue);
        }
        
        if (Array.isArray(workloadValue)) {
          // 对于数组类型（如 images），检查是否有任何值匹配
          return values.some(searchValue =>
            workloadValue.some(item =>
              String(item).toLowerCase().includes(searchValue)
            )
          );
        }
        
        // 对于其他字符串类型，使用模糊匹配
        const itemStr = String(workloadValue || '').toLowerCase();
        return values.some(searchValue => itemStr.includes(searchValue));
      });
    });
  }, [searchConditions]);

  // 加载Deployment列表（获取所有数据，不分页）
  const loadWorkloads = useCallback(async () => {
    if (!clusterId) return;
    
    setLoading(true);
    try {
      // 获取所有数据（设置一个很大的pageSize）
      const response = await WorkloadService.getWorkloads(
        clusterId,
        undefined,
        'Deployment',
        1,
        10000, // 获取所有数据
        undefined
      );
      
      if (response.code === 200) {
        const items = response.data.items || [];
        // 保存原始数据，筛选和分页会在useEffect中自动处理
        setAllWorkloads(items);
      } else {
        message.error(response.message || '获取Deployment列表失败');
      }
    } catch (error) {
      console.error('获取Deployment列表失败:', error);
      message.error('获取Deployment列表失败');
    } finally {
      setLoading(false);
    }
  }, [clusterId, message]);

  // 扩缩容
  const handleScale = async () => {
    if (!scaleWorkload || !clusterId) return;
    
    try {
      const response = await WorkloadService.scaleWorkload(
        clusterId,
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

  // 删除
  const handleDelete = async (workload: WorkloadInfo) => {
    if (!clusterId) return;
    
    try {
      const response = await WorkloadService.deleteWorkload(
        clusterId,
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

  // 批量重新部署
  const handleBatchRedeploy = async () => {
    if (selectedRowKeys.length === 0) {
      message.warning('请先选择要重新部署的Deployment');
      return;
    }

    Modal.confirm({
      title: '确认重新部署',
      content: `确定要重新部署选中的 ${selectedRowKeys.length} 个Deployment吗？`,
      okText: '确定',
      cancelText: '取消',
      onOk: async () => {
        try {
    const selectedWorkloads = workloads.filter(w => 
            selectedRowKeys.includes(`${w.namespace}/${w.name}`)
    );
    
          // 重新部署：重启所有Pod（通过更新annotation的方式）
          const redeployPromises = selectedWorkloads.map(workload =>
            WorkloadService.restartWorkload(clusterId, workload.namespace, workload.name, workload.type)
      );
      
          const results = await Promise.allSettled(redeployPromises);
      const successCount = results.filter(r => r.status === 'fulfilled').length;
      const failCount = results.length - successCount;
      
      if (failCount === 0) {
            message.success(`成功重新部署 ${successCount} 个Deployment`);
      } else {
            message.warning(`重新部署完成：成功 ${successCount} 个，失败 ${failCount} 个`);
      }
      
      setSelectedRowKeys([]);
      loadWorkloads();
    } catch (error) {
          console.error('批量重新部署失败:', error);
          message.error('批量重新部署失败');
    }
      }
    });
  };

  // 导出功能（导出所有筛选后的数据，包含所有列）
  const handleExport = () => {
    try {
      // 获取所有筛选后的数据（不限于当前页）
      const filteredData = filterWorkloads(allWorkloads);
      
      if (filteredData.length === 0) {
        message.warning('没有数据可导出');
        return;
      }

      // 导出筛选后的所有数据（包含所有列）
      const dataToExport = filteredData.map(w => ({
        '名称': w.name,
        '命名空间': w.namespace,
        '状态': w.status,
        '实例个数': `="${w.readyReplicas || 0}/${w.replicas || 0}"`, // 使用公式格式防止Excel转换为日期
        'CPU限制值': w.cpuLimit || '-',
        'CPU申请值': w.cpuRequest || '-',
        '内存限制值': w.memoryLimit || '-',
        '内存申请值': w.memoryRequest || '-',
        '镜像': w.images?.join(', ') || '-',
        '创建时间': w.createdAt ? new Date(w.createdAt).toLocaleString('zh-CN', {
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: false
        }).replace(/\//g, '-') : '-',
      }));

      // 导出为CSV
      const headers = Object.keys(dataToExport[0]);
      const csvContent = [
        headers.join(','),
        ...dataToExport.map(row => 
          headers.map(header => {
            const value = row[header as keyof typeof row];
            // 对于已经包含公式的单元格（以=开头），不再加引号
            if (String(value).startsWith('="')) {
              return value;
            }
            return `"${value}"`;
          }).join(',')
        )
      ].join('\n');
      
      const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `deployment-list-${Date.now()}.csv`;
      link.click();
      message.success(`成功导出 ${filteredData.length} 条数据`);
    } catch (error) {
      console.error('导出失败:', error);
      message.error('导出失败');
    }
  };

  // 列设置保存
  const handleColumnSettingsSave = () => {
    setColumnSettingsVisible(false);
    message.success('列设置已保存');
  };

  // 当搜索条件改变时重置到第一页
  useEffect(() => {
      setCurrentPage(1);
  }, [searchConditions]);

  // 当allWorkloads、搜索条件、分页参数、排序参数改变时，重新计算显示数据
  useEffect(() => {
    if (allWorkloads.length === 0) return;
    
    // 1. 应用客户端过滤
    let filteredItems = filterWorkloads(allWorkloads);
    
    // 2. 应用排序
    if (sortField && sortOrder) {
      filteredItems = [...filteredItems].sort((a, b) => {
        const aValue = a[sortField as keyof WorkloadInfo];
        const bValue = b[sortField as keyof WorkloadInfo];
        
        // 处理 undefined 值
        if (aValue === undefined && bValue === undefined) return 0;
        if (aValue === undefined) return sortOrder === 'ascend' ? 1 : -1;
        if (bValue === undefined) return sortOrder === 'ascend' ? -1 : 1;
        
        // 数字类型比较
        if (typeof aValue === 'number' && typeof bValue === 'number') {
          return sortOrder === 'ascend' ? aValue - bValue : bValue - aValue;
        }
        
        // 字符串类型比较
        const aStr = String(aValue);
        const bStr = String(bValue);
        
        if (sortOrder === 'ascend') {
          return aStr > bStr ? 1 : aStr < bStr ? -1 : 0;
        } else {
          return bStr > aStr ? 1 : bStr < aStr ? -1 : 0;
        }
      });
    }
    
    // 3. 计算分页
    const startIndex = (currentPage - 1) * pageSize;
    const endIndex = startIndex + pageSize;
    const paginatedItems = filteredItems.slice(startIndex, endIndex);
    
    setWorkloads(paginatedItems);
    setTotal(filteredItems.length);
    onCountChange?.(filteredItems.length);
  }, [allWorkloads, filterWorkloads, currentPage, pageSize, sortField, sortOrder, onCountChange]);

  // 初始加载数据
  useEffect(() => {
    loadWorkloads();
  }, [loadWorkloads]);

  // 行选择配置
  const rowSelection = {
    selectedRowKeys,
    onChange: (keys: React.Key[]) => {
      setSelectedRowKeys(keys as string[]);
    },
  };

  // 定义所有可用列
  const allColumns: ColumnsType<WorkloadInfo> = [
    {
      title: '名称',
      dataIndex: 'name',
      key: 'name',
      width: 200,
      fixed: 'left' as const,
      sorter: true,
      sortOrder: sortField === 'name' ? sortOrder : null,
      render: (text: string, record: WorkloadInfo) => (
        <Button
          type="link"
          onClick={() => navigate(`/clusters/${clusterId}/workloads/deployment/${record.namespace}/${record.name}`)}
          style={{ 
            padding: 0, 
            height: 'auto',
            whiteSpace: 'normal',
            wordBreak: 'break-all',
            textAlign: 'left'
          }}
        >
            {text}
        </Button>
      ),
    },
    {
      title: '命名空间',
      dataIndex: 'namespace',
      key: 'namespace',
      width: 130,
      sorter: true,
      sortOrder: sortField === 'namespace' ? sortOrder : null,
      render: (text: string) => <Tag color="blue">{text}</Tag>,
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (status: string) => {
        let color: 'success' | 'error' | 'default' | 'warning' = 'success';
        if (status === 'Stopped') {
          color = 'default';
        } else if (status === 'Degraded') {
          color = 'warning';
        } else if (status === 'Running') {
          color = 'success';
        }
        return <Badge status={color} text={status} />;
      },
    },
    {
      title: '实例个数(正常/全部)',
      dataIndex: 'replicas',
      key: 'replicas',
      width: 150,
      sorter: true,
      sortOrder: sortField === 'replicas' ? sortOrder : null,
      render: (_: unknown, record: WorkloadInfo) => (
        <span>
          {record.readyReplicas || 0} / {record.replicas || 0}
        </span>
      ),
    },
    {
      title: 'CPU限制值',
      dataIndex: 'cpuLimit',
      key: 'cpuLimit',
      width: 120,
      render: (value: string) => <span>{value || '-'}</span>,
    },
    {
      title: 'CPU申请值',
      dataIndex: 'cpuRequest',
      key: 'cpuRequest',
      width: 120,
      render: (value: string) => <span>{value || '-'}</span>,
    },
    {
      title: '内存限制值',
      dataIndex: 'memoryLimit',
      key: 'memoryLimit',
      width: 120,
      render: (value: string) => <span>{value || '-'}</span>,
    },
    {
      title: '内存申请值',
      dataIndex: 'memoryRequest',
      key: 'memoryRequest',
      width: 120,
      render: (value: string) => <span>{value || '-'}</span>,
    },
    {
      title: '镜像',
      dataIndex: 'images',
      key: 'images',
      width: 250,
      render: (images: string[]) => {
        if (!images || images.length === 0) return '-';
        
        // 提取 name:version 部分（去掉 registry）
        const firstImage = images[0];
        const imageNameVersion = firstImage.split('/').pop() || firstImage;
        
        return (
          <div>
            <Tooltip title={firstImage}>
              <Tag style={{ marginBottom: 2, maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {imageNameVersion}
              </Tag>
            </Tooltip>
            {images.length > 1 && (
              <Tooltip title={images.slice(1).map(img => img.split('/').pop()).join('\n')}>
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
      width: 180,
      sorter: true,
      sortOrder: sortField === 'createdAt' ? sortOrder : null,
      render: (text: string) => {
        if (!text) return '-';
        const date = new Date(text);
        // 格式化为：YYYY-MM-DD HH:mm:ss
        const formatted = date.toLocaleString('zh-CN', {
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: false
        }).replace(/\//g, '-');
        return <span>{formatted}</span>;
      },
    },
    {
      title: '操作',
      key: 'actions',
      width: 180,
      fixed: 'right' as const,
      render: (record: WorkloadInfo) => (
        <Space size="small">
          <Button
            type="link"
            size="small"
            onClick={() => navigate(`/clusters/${clusterId}/workloads/create?type=Deployment&namespace=${record.namespace}&name=${record.name}`)}
          >
            编辑
          </Button>
          <Button
            type="link"
            size="small"
            onClick={() => {
              setScaleWorkload(record);
              setScaleReplicas(record.replicas || 1);
              setScaleModalVisible(true);
            }}
          >
            扩缩容
          </Button>
          <Popconfirm
            title="确定要删除这个Deployment吗？"
            description={`确定要删除 ${record.name} 吗？`}
            onConfirm={() => handleDelete(record)}
            okText="确定"
            cancelText="取消"
          >
            <Button
              type="link"
              size="small"
              danger
            >
              删除
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  // 根据可见性过滤列
  const columns = allColumns.filter(col => {
    if (col.key === 'actions') return true; // 操作列始终显示
    return visibleColumns.includes(col.key as string);
  });

  // 表格排序处理（只更新排序状态，实际排序在useEffect中处理）
  const handleTableChange = (
    _pagination: TablePaginationConfig,
    _filters: Record<string, FilterValue | null>,
    sorter: SorterResult<WorkloadInfo> | SorterResult<WorkloadInfo>[]
  ) => {
    // 处理单个排序器
    const singleSorter = Array.isArray(sorter) ? sorter[0] : sorter;
    
    if (singleSorter && singleSorter.field) {
      const fieldName = String(singleSorter.field);
      setSortField(fieldName);
      setSortOrder(singleSorter.order || null);
    } else {
      // 清除排序
      setSortField('');
      setSortOrder(null);
    }
  };


  return (
    <div>
      {/* 操作按钮栏 */}
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <Space>
          <Button
            disabled={selectedRowKeys.length === 0}
            onClick={handleBatchRedeploy}
          >
            批量重新部署
          </Button>
          <Button onClick={handleExport}>
            导出
            </Button>
        </Space>
          <Button
            type="primary"
            icon={<PlusOutlined />}
          onClick={() => navigate(`/clusters/${clusterId}/workloads/create?type=Deployment`)}
          >
            创建Deployment
          </Button>
      </div>

      {/* 多条件搜索栏 */}
      <div style={{ marginBottom: 16 }}>
        {/* 搜索输入框 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: 8 }}>
          <Input
            prefix={<SearchOutlined />}
            placeholder="选择属性筛选，或输入关键字搜索"
            style={{ flex: 1 }}
            value={currentSearchValue}
            onChange={(e) => setCurrentSearchValue(e.target.value)}
            onPressEnter={addSearchCondition}
            allowClear
            addonBefore={
              <Select 
                value={currentSearchField} 
                onChange={setCurrentSearchField} 
                style={{ width: 140 }}
              >
                <Option value="name">工作负载名称</Option>
                <Option value="namespace">命名空间</Option>
                <Option value="image">镜像</Option>
                <Option value="status">状态</Option>
                <Option value="cpuLimit">CPU限制值</Option>
                <Option value="cpuRequest">CPU申请值</Option>
                <Option value="memoryLimit">内存限制值</Option>
                <Option value="memoryRequest">内存申请值</Option>
              </Select>
            }
          />
          <Button
            icon={<ReloadOutlined />}
            onClick={() => {
              loadWorkloads();
            }}
          >
          </Button>
          <Button icon={<SettingOutlined />} onClick={() => setColumnSettingsVisible(true)} />
        </div>

        {/* 搜索条件标签 */}
        {searchConditions.length > 0 && (
          <div>
            <Space size="small" wrap>
              {searchConditions.map((condition, index) => (
                <Tag
                  key={index}
                  closable
                  onClose={() => removeSearchCondition(index)}
                  color="blue"
                >
                  {getFieldLabel(condition.field)}: {condition.value}
                </Tag>
              ))}
              <Button
                size="small"
                type="link"
                onClick={clearAllConditions}
                style={{ padding: 0 }}
              >
                清空全部
          </Button>
        </Space>
          </div>
        )}
      </div>

      <Table
        columns={columns}
        dataSource={workloads}
        rowKey={(record) => `${record.namespace}-${record.name}-${record.type}`}
        rowSelection={rowSelection}
        loading={loading}
        scroll={{ x: 1400 }}
        size="middle"
        onChange={handleTableChange}
        pagination={{
          current: currentPage,
          pageSize: pageSize,
          total: total,
          showSizeChanger: true,
          showQuickJumper: true,
          showTotal: (total) => `共 ${total} 个Deployment`,
          onChange: (page, size) => {
            setCurrentPage(page);
            setPageSize(size || 20);
          },
          pageSizeOptions: ['10', '20', '50', '100'],
        }}
      />

      {/* 扩缩容模态框 */}
      <Modal
        title="扩缩容Deployment"
        open={scaleModalVisible}
        onOk={handleScale}
        onCancel={() => setScaleModalVisible(false)}
        okText="确定"
        cancelText="取消"
      >
        {scaleWorkload && (
          <div>
            <p>Deployment: <strong>{scaleWorkload.name}</strong></p>
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

      {/* 列设置抽屉 */}
      <Drawer
        title="列设置"
        placement="right"
        width={400}
        open={columnSettingsVisible}
        onClose={() => setColumnSettingsVisible(false)}
        footer={
          <div style={{ textAlign: 'right' }}>
            <Space>
              <Button onClick={() => setColumnSettingsVisible(false)}>取消</Button>
              <Button type="primary" onClick={handleColumnSettingsSave}>确定</Button>
            </Space>
          </div>
        }
      >
        <div style={{ marginBottom: 16 }}>
          <p style={{ marginBottom: 8, color: '#666' }}>选择要显示的列：</p>
          <Space direction="vertical" style={{ width: '100%' }}>
            <Checkbox
              checked={visibleColumns.includes('name')}
              onChange={(e) => {
                if (e.target.checked) {
                  setVisibleColumns([...visibleColumns, 'name']);
                } else {
                  setVisibleColumns(visibleColumns.filter(c => c !== 'name'));
                }
              }}
            >
              名称
            </Checkbox>
            <Checkbox
              checked={visibleColumns.includes('namespace')}
              onChange={(e) => {
                if (e.target.checked) {
                  setVisibleColumns([...visibleColumns, 'namespace']);
                } else {
                  setVisibleColumns(visibleColumns.filter(c => c !== 'namespace'));
                }
              }}
            >
              命名空间
            </Checkbox>
            <Checkbox
              checked={visibleColumns.includes('status')}
              onChange={(e) => {
                if (e.target.checked) {
                  setVisibleColumns([...visibleColumns, 'status']);
                } else {
                  setVisibleColumns(visibleColumns.filter(c => c !== 'status'));
                }
              }}
            >
              状态
            </Checkbox>
            <Checkbox
              checked={visibleColumns.includes('replicas')}
              onChange={(e) => {
                if (e.target.checked) {
                  setVisibleColumns([...visibleColumns, 'replicas']);
                } else {
                  setVisibleColumns(visibleColumns.filter(c => c !== 'replicas'));
                }
              }}
            >
              实例个数(正常/全部)
            </Checkbox>
            <Checkbox
              checked={visibleColumns.includes('cpuLimit')}
              onChange={(e) => {
                if (e.target.checked) {
                  setVisibleColumns([...visibleColumns, 'cpuLimit']);
                } else {
                  setVisibleColumns(visibleColumns.filter(c => c !== 'cpuLimit'));
                }
              }}
            >
              CPU限制值
            </Checkbox>
            <Checkbox
              checked={visibleColumns.includes('cpuRequest')}
              onChange={(e) => {
                if (e.target.checked) {
                  setVisibleColumns([...visibleColumns, 'cpuRequest']);
                } else {
                  setVisibleColumns(visibleColumns.filter(c => c !== 'cpuRequest'));
                }
              }}
            >
              CPU申请值
            </Checkbox>
            <Checkbox
              checked={visibleColumns.includes('memoryLimit')}
              onChange={(e) => {
                if (e.target.checked) {
                  setVisibleColumns([...visibleColumns, 'memoryLimit']);
                } else {
                  setVisibleColumns(visibleColumns.filter(c => c !== 'memoryLimit'));
                }
              }}
            >
              内存限制值
            </Checkbox>
            <Checkbox
              checked={visibleColumns.includes('memoryRequest')}
              onChange={(e) => {
                if (e.target.checked) {
                  setVisibleColumns([...visibleColumns, 'memoryRequest']);
                } else {
                  setVisibleColumns(visibleColumns.filter(c => c !== 'memoryRequest'));
                }
              }}
            >
              内存申请值
            </Checkbox>
            <Checkbox
              checked={visibleColumns.includes('images')}
              onChange={(e) => {
                if (e.target.checked) {
                  setVisibleColumns([...visibleColumns, 'images']);
                } else {
                  setVisibleColumns(visibleColumns.filter(c => c !== 'images'));
                }
              }}
            >
              镜像
            </Checkbox>
            <Checkbox
              checked={visibleColumns.includes('createdAt')}
              onChange={(e) => {
                if (e.target.checked) {
                  setVisibleColumns([...visibleColumns, 'createdAt']);
                } else {
                  setVisibleColumns(visibleColumns.filter(c => c !== 'createdAt'));
                }
              }}
            >
              创建时间
            </Checkbox>
          </Space>
        </div>
      </Drawer>
    </div>
  );
};

export default DeploymentTab;

