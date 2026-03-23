import React, { useState, useEffect, useCallback } from 'react';
import {
  Table,
  Button,
  Space,
  Tag,
  Input,
  Select,
  Popconfirm,
  Typography,
  Tooltip,
  Modal,
  App,
  Drawer,
  Checkbox,
} from 'antd';
import {
  ReloadOutlined,
  SearchOutlined,
  SettingOutlined,
} from '@ant-design/icons';
import { StorageService } from '../../services/storageService';
import type { PVC } from '../../types';
import type { ColumnsType, TablePaginationConfig } from 'antd/es/table';
import type { FilterValue, SorterResult } from 'antd/es/table/interface';
import { useTranslation } from 'react-i18next';

const { Link } = Typography;

interface PVCTabProps {
  clusterId: string;
  onCountChange?: (count: number) => void;
}

const PVCTab: React.FC<PVCTabProps> = ({ clusterId, onCountChange }) => {
  const { message } = App.useApp();
  
  // 数据状态
const { t } = useTranslation(['storage', 'common']);
const [allPVCs, setAllPVCs] = useState<PVC[]>([]);
  const [pvcs, setPVCs] = useState<PVC[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  
  // 分页状态
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  
  // 选择行状态
  const [selectedRowKeys, setSelectedRowKeys] = useState<string[]>([]);
  
  // 多条件搜索状态
  interface SearchCondition {
    field: 'name' | 'namespace' | 'status' | 'storageClassName' | 'volumeName';
    value: string;
  }
  const [searchConditions, setSearchConditions] = useState<SearchCondition[]>([]);
  const [currentSearchField, setCurrentSearchField] = useState<'name' | 'namespace' | 'status' | 'storageClassName' | 'volumeName'>('name');
  const [currentSearchValue, setCurrentSearchValue] = useState('');

  // 列设置状态
  const [columnSettingsVisible, setColumnSettingsVisible] = useState(false);
  const [visibleColumns, setVisibleColumns] = useState<string[]>([
    'name', 'status', 'volumeName', 'storageClassName', 'capacity', 'accessModes', 'createdAt'
  ]);
  
  // 排序状态
  const [sortField, setSortField] = useState<string>('');
  const [sortOrder, setSortOrder] = useState<'ascend' | 'descend' | null>(null);
  
  // YAML查看Modal
  const [yamlModalVisible, setYamlModalVisible] = useState(false);
  const [currentYaml, setCurrentYaml] = useState('');
  const [yamlLoading, setYamlLoading] = useState(false);
  
  // 命名空间列表
  const [, setNamespaces] = useState<{ name: string; count: number }[]>([]);

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
      name: t('storage:search.fieldPVCName'),
      namespace: t('storage:search.fieldNamespace'),
      status: t('storage:search.fieldStatus'),
      storageClassName: t('storage:search.fieldStorageClassName'),
      volumeName: t('storage:search.fieldVolumeName'),
    };
    return labels[field] || field;
  };

  // 客户端过滤PVC列表
  const filterPVCs = useCallback((items: PVC[]): PVC[] => {
    if (searchConditions.length === 0) return items;

    return items.filter(pvc => {
      const conditionsByField = searchConditions.reduce((acc, condition) => {
        if (!acc[condition.field]) {
          acc[condition.field] = [];
        }
        acc[condition.field].push(condition.value.toLowerCase());
        return acc;
      }, {} as Record<string, string[]>);

      return Object.entries(conditionsByField).every(([field, values]) => {
        const pvcValue = pvc[field as keyof PVC];
        const itemStr = String(pvcValue || '').toLowerCase();
        return values.some(searchValue => itemStr.includes(searchValue));
      });
    });
  }, [searchConditions]);

  // 加载命名空间列表
  useEffect(() => {
    const loadNamespaces = async () => {
      if (!clusterId) return;
      try {
        const response = await StorageService.getPVCNamespaces(clusterId);
        setNamespaces(response);
      } catch (error) {
        console.error('Failed to load namespaces:', error);
      }
    };

    loadNamespaces();
  }, [clusterId]);

  // 获取PVC列表
  const loadPVCs = useCallback(async () => {
    if (!clusterId) return;
    
    setLoading(true);
    try {
      const response = await StorageService.getPVCs(
        clusterId,
        '_all_',
        undefined,
        undefined,
        1,
        10000
      );
      
      const items = response.items || [];
      setAllPVCs(items);
    } catch (error) {
      console.error('Failed to fetch PVC list:', error);
      message.error(t('storage:messages.fetchPVCError'));
    } finally {
      setLoading(false);
    }
  }, [clusterId, message]);

  // 当搜索条件改变时重置到第一页
  useEffect(() => {
    setCurrentPage(1);
  }, [searchConditions]);

  // 当allPVCs、搜索条件、分页参数、排序参数改变时，重新计算显示数据
  useEffect(() => {
    if (allPVCs.length === 0) {
      setPVCs([]);
      setTotal(0);
      onCountChange?.(0);
      return;
    }
    
    let filteredItems = filterPVCs(allPVCs);
    
    if (sortField && sortOrder) {
      filteredItems = [...filteredItems].sort((a, b) => {
        const aValue = a[sortField as keyof PVC];
        const bValue = b[sortField as keyof PVC];
        
        if (aValue === undefined && bValue === undefined) return 0;
        if (aValue === undefined) return sortOrder === 'ascend' ? 1 : -1;
        if (bValue === undefined) return sortOrder === 'ascend' ? -1 : 1;
        
        const aStr = String(aValue);
        const bStr = String(bValue);
        
        if (sortOrder === 'ascend') {
          return aStr > bStr ? 1 : aStr < bStr ? -1 : 0;
        } else {
          return bStr > aStr ? 1 : bStr < aStr ? -1 : 0;
        }
      });
    }
    
    const startIndex = (currentPage - 1) * pageSize;
    const endIndex = startIndex + pageSize;
    const paginatedItems = filteredItems.slice(startIndex, endIndex);
    
    setPVCs(paginatedItems);
    setTotal(filteredItems.length);
    onCountChange?.(filteredItems.length);
  }, [allPVCs, filterPVCs, currentPage, pageSize, sortField, sortOrder, onCountChange]);

  // 初始加载数据
  useEffect(() => {
    loadPVCs();
  }, [loadPVCs]);

  // 查看YAML
  const handleViewYAML = async (pvc: PVC) => {
    setYamlModalVisible(true);
    setYamlLoading(true);
    try {
      const response = await StorageService.getPVCYAML(
        clusterId,
        pvc.namespace,
        pvc.name
      );
      
      setCurrentYaml(response.yaml);
    } catch (error) {
      console.error('Failed to fetch YAML:', error);
      message.error(t('storage:messages.fetchYAMLError'));
    } finally {
      setYamlLoading(false);
    }
  };

  // 删除PVC
  const handleDelete = async (pvc: PVC) => {
    try {
      await StorageService.deletePVC(
        clusterId,
        pvc.namespace,
        pvc.name
      );
      
      message.success(t('common:messages.deleteSuccess'));
      loadPVCs();
    } catch (error) {
      console.error('删除失败:', error);
      message.error(t('common:messages.deleteError'));
    }
  };

  // 批量删除
  const handleBatchDelete = async () => {
    if (selectedRowKeys.length === 0) {
      message.warning(t('storage:messages.selectDeletePVC'));
      return;
    }

    Modal.confirm({
      title: t('common:messages.confirmDelete'),
      content: t('storage:messages.confirmDeletePVC', { count: selectedRowKeys.length }),
      okText: t('common:actions.confirm'),
      cancelText: t('common:actions.cancel'),
      onOk: async () => {
        try {
          const selectedPVCs = pvcs.filter(p => 
            selectedRowKeys.includes(`${p.namespace}/${p.name}`)
          );
          
          const deletePromises = selectedPVCs.map(pvc =>
            StorageService.deletePVC(clusterId, pvc.namespace, pvc.name)
          );
          
          const results = await Promise.allSettled(deletePromises);
          const successCount = results.filter(r => r.status === 'fulfilled').length;
          const failCount = results.length - successCount;
          
          if (failCount === 0) {
            message.success(t('storage:messages.batchDeleteSuccess', { count: successCount, type: 'PVC' }));
          } else {
            message.warning(t('storage:messages.batchDeletePartial', { success: successCount, fail: failCount }));
          }
          
          setSelectedRowKeys([]);
          loadPVCs();
        } catch (error) {
          console.error('Batch delete failed:', error);
          message.error(t('storage:messages.batchDeleteError'));
        }
      }
    });
  };

  // 导出功能
  const handleExport = () => {
    try {
      const filteredData = filterPVCs(allPVCs);
      
      if (filteredData.length === 0) {
        message.warning(t('common:messages.noExportData'));
        return;
      }

      const dataToExport = filteredData.map(p => ({
        [t('storage:export.pvcNameLabel')]: p.name,
        [t('storage:export.namespaceLabel')]: p.namespace,
        [t('storage:export.statusLabel')]: p.status,
        [t('storage:export.volumeNameLabel')]: p.volumeName || '-',
        [t('storage:export.storageClassLabel')]: p.storageClassName || '-',
        [t('storage:export.capacityLabel')]: p.capacity || '-',
        [t('storage:export.accessModesLabel')]: StorageService.formatAccessModes(p.accessModes),
        [t('storage:export.createdAtLabel')]: p.createdAt ? new Date(p.createdAt).toLocaleString() : '-',
      }));

      const headers = Object.keys(dataToExport[0]);
      const csvContent = [
        headers.join(','),
        ...dataToExport.map(row => 
          headers.map(header => {
            const value = row[header as keyof typeof row];
            return `"${value}"`;
          }).join(',')
        )
      ].join('\n');
      
      const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `pvc-list-${Date.now()}.csv`;
      link.click();
      message.success(t('common:messages.exportCount', { count: filteredData.length }));
    } catch (error) {
      console.error('Export failed:', error);
      message.error(t('common:messages.exportError'));
    }
  };

  // 列设置保存
  const handleColumnSettingsSave = () => {
    setColumnSettingsVisible(false);
    message.success(t('common:messages.columnSettingsSaved'));
  };

  // 行选择配置
  const rowSelection = {
    selectedRowKeys,
    onChange: (keys: React.Key[]) => {
      setSelectedRowKeys(keys as string[]);
    },
  };

  // 定义所有可用列
  const allColumns: ColumnsType<PVC> = [
    {
      title: t('storage:columns.pvcName'),
      dataIndex: 'name',
      key: 'name',
      fixed: 'left' as const,
      width: 200,
      sorter: true,
      sortOrder: sortField === 'name' ? sortOrder : null,
      render: (name: string, record: PVC) => (
        <div>
          <Link strong onClick={() => handleViewYAML(record)}>
            {name}
          </Link>
          <div style={{ fontSize: 12, color: '#999' }}>
            {record.namespace}
          </div>
        </div>
      ),
    },
    {
      title: t('common:table.namespace'),
      dataIndex: 'namespace',
      key: 'namespace',
      width: 130,
      sorter: true,
      sortOrder: sortField === 'namespace' ? sortOrder : null,
      render: (text: string) => <Tag color="blue">{text}</Tag>,
    },
    {
      title: t('common:table.status'),
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (status: string) => (
        <Tag color={StorageService.getPVCStatusColor(status)}>
          {status}
        </Tag>
      ),
    },
    {
      title: t('storage:columns.volumeName'),
      dataIndex: 'volumeName',
      key: 'volumeName',
      width: 200,
      render: (volumeName: string) => volumeName || '-',
    },
    {
      title: t('storage:columns.storageClassName'),
      dataIndex: 'storageClassName',
      key: 'storageClassName',
      width: 150,
      render: (name: string) => name ? <Tag>{name}</Tag> : '-',
    },
    {
      title: t('storage:columns.capacity'),
      dataIndex: 'capacity',
      key: 'capacity',
      width: 100,
      render: (capacity: string) => StorageService.formatCapacity(capacity),
    },
    {
      title: t('storage:columns.accessModes'),
      dataIndex: 'accessModes',
      key: 'accessModes',
      width: 120,
      render: (modes: string[]) => (
        <Tooltip title={modes?.join(', ')}>
          <span>{StorageService.formatAccessModes(modes)}</span>
        </Tooltip>
      ),
    },
    {
      title: t('common:table.createdAt'),
      dataIndex: 'createdAt',
      key: 'createdAt',
      width: 180,
      sorter: true,
      sortOrder: sortField === 'createdAt' ? sortOrder : null,
      render: (createdAt: string) => {
        if (!createdAt) return '-';
        const date = new Date(createdAt);
        return date.toLocaleString('zh-CN');
      },
    },
    {
      title: t('common:table.actions'),
      key: 'action',
      fixed: 'right' as const,
      width: 120,
      render: (_: unknown, record: PVC) => (
        <Space size="small">
          <Button
            type="link"
            size="small"
            onClick={() => handleViewYAML(record)}
          >
            YAML
          </Button>
          <Popconfirm
            title={t('storage:messages.confirmDeletePVCItem')}
            description={t('storage:messages.confirmDeletePVCDesc', { name: record.name })}
            onConfirm={() => handleDelete(record)}
            okText={t('common:actions.confirm')}
            cancelText={t('common:actions.cancel')}
          >
            <Button
              type="link"
              size="small"
              danger
            >
              {t('common:actions.delete')}
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  // 根据可见性过滤列
  const columns = allColumns.filter(col => {
    if (col.key === 'action') return true;
    if (col.key === 'name') return true;
    return visibleColumns.includes(col.key as string);
  });

  // 表格排序处理
  const handleTableChange = (
    _pagination: TablePaginationConfig,
    _filters: Record<string, FilterValue | null>,
    sorter: SorterResult<PVC> | SorterResult<PVC>[]
  ) => {
    const singleSorter = Array.isArray(sorter) ? sorter[0] : sorter;
    
    if (singleSorter && singleSorter.field) {
      const fieldName = String(singleSorter.field);
      setSortField(fieldName);
      setSortOrder(singleSorter.order || null);
    } else {
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
            onClick={handleBatchDelete}
            danger
          >
            {t('common:actions.batchDelete')}
          </Button>
          <Button onClick={handleExport}>
            {t('common:actions.export')}
          </Button>
        </Space>
      </div>

      {/* 多条件搜索栏 */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: 8 }}>
          <Input
            prefix={<SearchOutlined />}
            placeholder={t('common:search.placeholder')}
            style={{ flex: 1 }}
            value={currentSearchValue}
            onChange={(e) => setCurrentSearchValue(e.target.value)}
            onPressEnter={addSearchCondition}
            allowClear
            addonBefore={
              <Select 
                value={currentSearchField} 
                onChange={setCurrentSearchField} 
                style={{ width: 120 }}
              >
                <Select.Option value="name">{t('storage:search.fieldPVCName')}</Select.Option>
                <Select.Option value="namespace">{t('storage:search.fieldNamespace')}</Select.Option>
                <Select.Option value="status">{t('storage:search.fieldStatus')}</Select.Option>
                <Select.Option value="storageClassName">{t('storage:search.fieldStorageClassName')}</Select.Option>
                <Select.Option value="volumeName">{t('storage:search.fieldVolumeName')}</Select.Option>
              </Select>
            }
          />
          <Button
            icon={<ReloadOutlined />}
            onClick={() => loadPVCs()}
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
                {t('common:actions.clearAll')}
              </Button>
            </Space>
          </div>
        )}
      </div>

      <Table
        columns={columns}
        dataSource={pvcs}
        rowKey={(record) => `${record.namespace}/${record.name}`}
        rowSelection={rowSelection}
        loading={loading}
        scroll={{ x: 1200 }}
        size="middle"
        onChange={handleTableChange}
        pagination={{
          current: currentPage,
          pageSize: pageSize,
          total: total,
          showSizeChanger: true,
          showQuickJumper: true,
          showTotal: (total) => t('storage:pagination.totalPVC', { total }),
          onChange: (page, size) => {
            setCurrentPage(page);
            setPageSize(size || 20);
          },
          pageSizeOptions: ['10', '20', '50', '100'],
        }}
      />

      {/* YAML查看Modal */}
      <Modal
        title="PVC YAML"
        open={yamlModalVisible}
        onCancel={() => setYamlModalVisible(false)}
        footer={null}
        width={800}
      >
        {yamlLoading ? (
          <div style={{ textAlign: 'center', padding: 40 }}>
            <span>{t('common:messages.loading')}</span>
          </div>
        ) : (
          <pre style={{ maxHeight: 600, overflow: 'auto', background: '#f5f5f5', padding: 16 }}>
            {currentYaml}
          </pre>
        )}
      </Modal>

      {/* 列设置抽屉 */}
      <Drawer
        title={t('storage:columnSettings.title')}
        placement="right"
        width={400}
        open={columnSettingsVisible}
        onClose={() => setColumnSettingsVisible(false)}
        footer={
          <div style={{ textAlign: 'right' }}>
            <Space>
              <Button onClick={() => setColumnSettingsVisible(false)}>{t('common:actions.cancel')}</Button>
              <Button type="primary" onClick={handleColumnSettingsSave}>{t('storage:columnSettings.confirm')}</Button>
            </Space>
          </div>
        }
      >
        <div style={{ marginBottom: 16 }}>
          <p style={{ marginBottom: 8, color: '#666' }}>{t('storage:columnSettings.selectColumns')}</p>
          <Space direction="vertical" style={{ width: '100%' }}>
            {[
              { key: 'namespace', label: t('common:table.namespace') },
              { key: 'status', label: t('common:table.status') },
              { key: 'volumeName', label: t('storage:columns.volumeName') },
              { key: 'storageClassName', label: t('storage:columns.storageClassName') },
              { key: 'capacity', label: t('storage:columns.capacity') },
              { key: 'accessModes', label: t('storage:columns.accessModes') },
              { key: 'createdAt', label: t('common:table.createdAt') },
            ].map(item => (
              <Checkbox
                key={item.key}
                checked={visibleColumns.includes(item.key)}
                onChange={(e) => {
                  if (e.target.checked) {
                    setVisibleColumns([...visibleColumns, item.key]);
                  } else {
                    setVisibleColumns(visibleColumns.filter(c => c !== item.key));
                  }
                }}
              >
                {item.label}
              </Checkbox>
            ))}
          </Space>
        </div>
      </Drawer>
    </div>
  );
};

export default PVCTab;
