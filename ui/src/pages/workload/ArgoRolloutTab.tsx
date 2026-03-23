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
import { useTranslation } from 'react-i18next';
const { Option } = Select;

interface RolloutTabProps {
  clusterId: string;
  onCountChange?: (count: number) => void;
}

const RolloutTab: React.FC<RolloutTabProps> = ({ clusterId, onCountChange }) => {
  const navigate = useNavigate();
  const { message } = App.useApp();
const { t } = useTranslation(['workload', 'common']);
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

  // 处理回车键
  const handleSearchKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      addSearchCondition();
    }
  };

  // 获取字段的中文标签
  const getFieldLabel = (field: string): string => {
    const labels: Record<string, string> = {
      name: t('search.workloadName'),
      namespace: t('search.namespace'),
      image: t('search.image'),
      status: t('search.status'),
      cpuLimit: t('search.cpuLimit'),
      cpuRequest: t('search.cpuRequest'),
      memoryLimit: t('search.memoryLimit'),
      memoryRequest: t('search.memoryRequest'),
    };
    return labels[field] || field;
  };

  // 客户端过滤
  const filterWorkloads = useCallback((items: WorkloadInfo[]): WorkloadInfo[] => {
    if (searchConditions.length === 0) return items;

    return items.filter(workload => {
      const conditionsByField = searchConditions.reduce((acc, condition) => {
        if (!acc[condition.field]) {
          acc[condition.field] = [];
        }
        acc[condition.field].push(condition.value.toLowerCase());
        return acc;
      }, {} as Record<string, string[]>);

      return Object.entries(conditionsByField).every(([field, values]) => {
        const workloadValue = workload[field as keyof WorkloadInfo];
        
        // CPU和内存字段使用精确匹配
        const resourceFields = ['cpuLimit', 'cpuRequest', 'memoryLimit', 'memoryRequest'];
        if (resourceFields.includes(field)) {
          const itemStr = String(workloadValue || '-').toLowerCase();
          return values.some(searchValue => itemStr === searchValue);
        }
        
        if (Array.isArray(workloadValue)) {
          return values.some(searchValue =>
            workloadValue.some(item =>
              String(item).toLowerCase().includes(searchValue)
            )
          );
        }
        
        const itemStr = String(workloadValue || '').toLowerCase();
        return values.some(searchValue => itemStr.includes(searchValue));
      });
    });
  }, [searchConditions]);

  // 客户端排序
  const sortWorkloads = useCallback((items: WorkloadInfo[]): WorkloadInfo[] => {
    if (!sortField || !sortOrder) return items;

    return [...items].sort((a, b) => {
      let aValue: unknown = a[sortField as keyof WorkloadInfo];
      let bValue: unknown = b[sortField as keyof WorkloadInfo];

      if (sortField === 'replicas') {
        // 按总副本数排序
        aValue = a.replicas || 0;
        bValue = b.replicas || 0;
      } else if (sortField === 'createdAt') {
        aValue = aValue ? new Date(aValue as string).getTime() : 0;
        bValue = bValue ? new Date(bValue as string).getTime() : 0;
      }

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
  }, [sortField, sortOrder]);

  // 加载Rollout列表
  const loadWorkloads = useCallback(async () => {
    if (!clusterId) return;
    
    setLoading(true);
    try {
      // 获取所有数据（使用大的pageSize）
      const response = await WorkloadService.getWorkloads(
        clusterId,
        undefined,
        'Rollout',
        1,
        10000
      );
      
      const items = response.items || [];
      setAllWorkloads(items);
      
      if (onCountChange) {
        onCountChange(items.length);
      }
    } catch (error) {
      console.error('加载Rollout列表失败:', error);
      message.error(t('messages.fetchError', { type: 'Rollout' }));
    } finally {
      setLoading(false);
    }
  }, [clusterId, onCountChange, message]);

  // 应用过滤、排序和分页
  useEffect(() => {
    let result = [...allWorkloads];
    
    // 1. 过滤
    result = filterWorkloads(result);
    
    // 2. 排序
    result = sortWorkloads(result);
    
    // 3. 更新总数
    setTotal(result.length);
    
    // 4. 分页
    const start = (currentPage - 1) * pageSize;
    const end = start + pageSize;
    const pagedData = result.slice(start, end);
    
    setWorkloads(pagedData);
  }, [allWorkloads, currentPage, pageSize, filterWorkloads, sortWorkloads]);

  // 初始加载
  useEffect(() => {
    loadWorkloads();
  }, [loadWorkloads]);

  // 表格列定义
  const columns: ColumnsType<WorkloadInfo> = [
    {
      title: t('columns.name'),
      dataIndex: 'name',
      key: 'name',
      width: 200,
      fixed: 'left' as const,
      sorter: true,
      sortOrder: sortField === 'name' ? sortOrder : null,
      render: (text: string, record: WorkloadInfo) => (
        <Button
          type="link"
          onClick={() => navigate(`/clusters/${clusterId}/workloads/rollout/${record.namespace}/${record.name}`)}
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
      title: t('columns.namespace'),
      dataIndex: 'namespace',
      key: 'namespace',
      width: 130,
      sorter: true,
      sortOrder: sortField === 'namespace' ? sortOrder : null,
      render: (text: string) => <Tag color="blue">{text}</Tag>,
    },
    {
      title: t('columns.status'),
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
      title: t('columns.replicas'),
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
      title: t('columns.cpuLimit'),
      dataIndex: 'cpuLimit',
      key: 'cpuLimit',
      width: 120,
      render: (value: string) => <span>{value || '-'}</span>,
    },
    {
      title: t('columns.cpuRequest'),
      dataIndex: 'cpuRequest',
      key: 'cpuRequest',
      width: 120,
      render: (value: string) => <span>{value || '-'}</span>,
    },
    {
      title: t('columns.memoryLimit'),
      dataIndex: 'memoryLimit',
      key: 'memoryLimit',
      width: 120,
      render: (value: string) => <span>{value || '-'}</span>,
    },
    {
      title: t('columns.memoryRequest'),
      dataIndex: 'memoryRequest',
      key: 'memoryRequest',
      width: 120,
      render: (value: string) => <span>{value || '-'}</span>,
    },
    {
      title: t('columns.images'),
      dataIndex: 'images',
      key: 'images',
      width: 250,
      render: (images: string[]) => {
        if (!images || images.length === 0) return '-';
        
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
      title: t('columns.createdAt'),
      dataIndex: 'createdAt',
      key: 'createdAt',
      width: 180,
      sorter: true,
      sortOrder: sortField === 'createdAt' ? sortOrder : null,
      render: (text: string) => {
        if (!text) return '-';
        const date = new Date(text);
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
      title: t('columns.actions'),
      key: 'actions',
      width: 220,
      fixed: 'right' as const,
      render: (_: unknown, record: WorkloadInfo) => (
        <Space size="small">
          <Button
            type="link"
            size="small"
            onClick={() => navigate(`/clusters/${clusterId}/workloads/rollout/${record.namespace}/${record.name}?tab=monitoring`)}
          >{t('actions.monitoring')}</Button>
          <Button
            type="link"
            size="small"
            onClick={() => navigate(`/clusters/${clusterId}/workloads/create?type=Rollout&namespace=${record.namespace}&name=${record.name}`)}
          >{t('actions.edit')}</Button>
          <Button
            type="link"
            size="small"
            onClick={() => {
              setScaleWorkload(record);
              setScaleReplicas(record.replicas || 1);
              setScaleModalVisible(true);
            }}
          >{t('actions.scale')}</Button>
          <Popconfirm
            title={t('actions.confirmDelete', { type: 'Rollout' })}
            onConfirm={() => handleDelete(record)}
            okText={t('common:actions.confirm')}
            cancelText={t('common:actions.cancel')}
          >
            <Button type="link" size="small" danger>{t('actions.delete')}</Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  // 根据可见列过滤columns
  const filteredColumns = columns.filter(col => {
    if (!col.key) return true;
    if (col.key === 'actions') return true;
    return visibleColumns.includes(col.key as string);
  });

  // 处理表格变化（分页、排序）
  const handleTableChange = (
    pagination: TablePaginationConfig,
    filters: Record<string, FilterValue | null>,
    sorter: SorterResult<WorkloadInfo> | SorterResult<WorkloadInfo>[]
  ) => {
    const singleSorter = Array.isArray(sorter) ? sorter[0] : sorter;
    
    if (singleSorter.order) {
      setSortField(singleSorter.field as string);
      setSortOrder(singleSorter.order as 'ascend' | 'descend');
    } else {
      setSortField('');
      setSortOrder(null);
    }

    setCurrentPage(pagination.current || 1);
    setPageSize(pagination.pageSize || 20);
  };

  // 扩缩容
  const handleScale = async () => {
    if (!scaleWorkload) return;
    
    try {
      await WorkloadService.scaleWorkload(
        clusterId,
        scaleWorkload.namespace,
        scaleWorkload.name,
        'Rollout',
        scaleReplicas
      );
      message.success(t('messages.scaleSuccess'));
      setScaleModalVisible(false);
      loadWorkloads();
    } catch (error) {
      console.error('扩缩容失败:', error);
      message.error(t('messages.scaleError'));
    }
  };

  // 删除
  const handleDelete = async (record: WorkloadInfo) => {
    try {
      await WorkloadService.deleteWorkload(
        clusterId,
        record.namespace,
        record.name,
        'Rollout'
      );
      message.success(t('messages.deleteSuccess'));
      loadWorkloads();
    } catch (error) {
      console.error('删除失败:', error);
      message.error(t('messages.deleteError'));
    }
  };

  // 批量重新部署
  const handleBatchRedeploy = async () => {
    if (selectedRowKeys.length === 0) {
      message.warning(t('actions.selectRedeploy', { type: 'Rollout' }));
      return;
    }
    
    try {
      for (const key of selectedRowKeys) {
        const workload = workloads.find(w => `${w.namespace}/${w.name}` === key);
        if (workload) {
          await WorkloadService.restartWorkload(
            clusterId,
            workload.namespace,
            workload.name,
            'Rollout'
          );
        }
      }
      message.success(t('messages.redeploySuccess'));
      setSelectedRowKeys([]);
      loadWorkloads();
    } catch (error) {
      console.error('重新部署失败:', error);
      message.error(t('messages.redeployError'));
    }
  };

  // 导出
  const handleExport = () => {
    const filteredData = filterWorkloads(sortWorkloads(allWorkloads));
    
    const headers = [
      t('columns.name'),
      t('columns.namespace'),
      t('columns.status'),
      t('columns.replicas'),
      t('columns.cpuLimit'),
      t('columns.cpuRequest'),
      t('columns.memoryLimit'),
      t('columns.memoryRequest'),
      t('columns.images'),
      t('columns.createdAt')
    ];
    
    const dataToExport = filteredData.map(workload => [
      workload.name,
      workload.namespace,
      workload.status,
      `="${(workload.readyReplicas || 0)}/${(workload.replicas || 0)}"`,
      workload.cpuLimit || '-',
      workload.cpuRequest || '-',
      workload.memoryLimit || '-',
      workload.memoryRequest || '-',
      (workload.images || []).map(img => img.split('/').pop()).join(', '),
      new Date(workload.createdAt).toLocaleString('zh-CN')
    ]);
    
    const csvContent = [
      headers.join(','),
      ...dataToExport.map(row => 
        row.map(cell => {
          const cellStr = String(cell);
          if (cellStr.startsWith('="') && cellStr.endsWith('"')) {
            return cellStr;
          }
          if (cellStr.includes(',') || cellStr.includes('"') || cellStr.includes('\n')) {
            return `"${cellStr.replace(/"/g, '""')}"`;
          }
          return cellStr;
        }).join(',')
      )
    ].join('\n');
    
    const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `rollout_${new Date().getTime()}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  };

  // 列设置
  const allColumns = [
    { key: 'name', title: t('columns.name'), fixed: true },
    { key: 'namespace', title: t('columns.namespace') },
    { key: 'status', title: t('columns.status') },
    { key: 'replicas', title: t('columns.replicas') },
    { key: 'cpuLimit', title: t('columns.cpuLimit') },
    { key: 'cpuRequest', title: t('columns.cpuRequest') },
    { key: 'memoryLimit', title: t('columns.memoryLimit') },
    { key: 'memoryRequest', title: t('columns.memoryRequest') },
    { key: 'images', title: t('columns.images') },
    { key: 'createdAt', title: t('columns.createdAt') },
  ];

  const handleColumnVisibilityChange = (columnKey: string, checked: boolean) => {
    if (checked) {
      setVisibleColumns([...visibleColumns, columnKey]);
    } else {
      setVisibleColumns(visibleColumns.filter(k => k !== columnKey));
    }
  };

  const handleSaveColumnSettings = () => {
    setColumnSettingsVisible(false);
    message.success(t('messages.columnSettingsSaved'));
  };

  return (
    <div>
      {/* 操作按钮栏 */}
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <Space>
          <Button
            disabled={selectedRowKeys.length === 0}
            onClick={handleBatchRedeploy}
          >{t('actions.batchRedeploy')}</Button>
          <Button onClick={handleExport}>{t('actions.export')}</Button>
        </Space>
        <Button
          type="primary"
          icon={<PlusOutlined />}
          onClick={() => navigate(`/clusters/${clusterId}/workloads/create?type=Rollout`)}
        >
          {t('actions.create', { type: 'Rollout' })}
        </Button>
      </div>

      {/* 多条件搜索栏 */}
      <div style={{ marginBottom: 16 }}>
        {/* 搜索输入框 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: 8 }}>
          <Input
            prefix={<SearchOutlined />}
            placeholder={t('search.placeholder')}
            style={{ flex: 1 }}
            value={currentSearchValue}
            onChange={(e) => setCurrentSearchValue(e.target.value)}
            onKeyPress={handleSearchKeyPress}
            allowClear
            addonBefore={
              <Select 
                value={currentSearchField} 
                onChange={setCurrentSearchField} 
                style={{ width: 140 }}
              >
                <Option value="name">{t('search.workloadName')}</Option>
                <Option value="namespace">{t('search.namespace')}</Option>
                <Option value="image">{t('search.image')}</Option>
                <Option value="status">{t('search.status')}</Option>
                <Option value="cpuLimit">{t('search.cpuLimit')}</Option>
                <Option value="cpuRequest">{t('search.cpuRequest')}</Option>
                <Option value="memoryLimit">{t('search.memoryLimit')}</Option>
                <Option value="memoryRequest">{t('search.memoryRequest')}</Option>
              </Select>
            }
          />
          <Button
            icon={<ReloadOutlined />}
            onClick={loadWorkloads}
          >
          </Button>
          <Button
            icon={<SettingOutlined />}
            onClick={() => setColumnSettingsVisible(true)}
          >
          </Button>
        </div>

        {/* 搜索条件标签 */}
        {searchConditions.length > 0 && (
          <div style={{ marginBottom: 8 }}>
            <Space wrap>
              {searchConditions.map((condition, index) => (
                <Tag
                  key={index}
                  closable
                  onClose={() => removeSearchCondition(index)}
                >
                  {getFieldLabel(condition.field)}: {condition.value}
                </Tag>
              ))}
              <Button type="link" size="small" onClick={clearAllConditions}>
                {t('common:actions.clearAllConditions')}
              </Button>
            </Space>
          </div>
        )}
      </div>

      {/* 表格 */}
      <Table
        rowSelection={{
          selectedRowKeys,
          onChange: (keys) => setSelectedRowKeys(keys as string[]),
        }}
        columns={filteredColumns}
        dataSource={workloads}
        rowKey={(record) => `${record.namespace}/${record.name}`}
        loading={loading}
        pagination={{
          current: currentPage,
          pageSize: pageSize,
          total: total,
          showSizeChanger: true,
          showTotal: (total) => t('messages.totalItems', { count: total, type: 'Rollout' }),
          pageSizeOptions: ['10', '20', '50', '100'],
        }}
        onChange={handleTableChange}
        scroll={{ x: 1500 }}
      />

      {/* 扩缩容Modal */}
      <Modal
        title={t('scale.title', { type: 'Rollout' })}
        open={scaleModalVisible}
        onOk={handleScale}
        onCancel={() => setScaleModalVisible(false)}
        okText={t('common:actions.confirm')}
        cancelText={t('common:actions.cancel')}
      >
        <Space direction="vertical" style={{ width: '100%' }}>
          <div>
            <strong>{t('scale.workloadName', { type: 'Rollout' })}：</strong>{scaleWorkload?.name}
          </div>
          <div>
            <strong>{t('scale.namespace')}：</strong>{scaleWorkload?.namespace}
          </div>
          <div>
            <strong>{t('scale.currentReplicas')}：</strong>{scaleWorkload?.replicas}
          </div>
          <Space>
            <span>{t('scale.targetReplicas')}：</span>
            <InputNumber
              min={0}
              value={scaleReplicas}
              onChange={(value) => setScaleReplicas(value || 1)}
            />
          </Space>
        </Space>
      </Modal>

      {/* 列设置Drawer */}
      <Drawer
        title={t('columnSettings.title')}
        placement="right"
        onClose={() => setColumnSettingsVisible(false)}
        open={columnSettingsVisible}
        width={400}
        footer={
          <Space style={{ float: 'right' }}>
            <Button onClick={() => setColumnSettingsVisible(false)}>{t('common:actions.cancel')}</Button>
            <Button type="primary" onClick={handleSaveColumnSettings}>{t('common:actions.save')}</Button>
          </Space>
        }
      >
        <Space direction="vertical" style={{ width: '100%' }}>
          {allColumns.map(col => (
            <Checkbox
              key={col.key}
              checked={visibleColumns.includes(col.key)}
              onChange={(e) => handleColumnVisibilityChange(col.key, e.target.checked)}
              disabled={col.fixed}
            >
              {col.title}
            </Checkbox>
          ))}
        </Space>
      </Drawer>
    </div>
  );
};

export default RolloutTab;
