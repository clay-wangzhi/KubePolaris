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
  CheckCircleOutlined,
} from '@ant-design/icons';
import { StorageService } from '../../services/storageService';
import type { StorageClass } from '../../types';
import type { ColumnsType, TablePaginationConfig } from 'antd/es/table';
import type { FilterValue, SorterResult } from 'antd/es/table/interface';
import { useTranslation } from 'react-i18next';

const { Link } = Typography;

interface StorageClassTabProps {
  clusterId: string;
  onCountChange?: (count: number) => void;
}

const StorageClassTab: React.FC<StorageClassTabProps> = ({ clusterId, onCountChange }) => {
  const { message } = App.useApp();
  
  // 数据状态
const { t } = useTranslation(['storage', 'common']);
const [allStorageClasses, setAllStorageClasses] = useState<StorageClass[]>([]);
  const [storageClasses, setStorageClasses] = useState<StorageClass[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  
  // 分页状态
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  
  // 选择行状态
  const [selectedRowKeys, setSelectedRowKeys] = useState<string[]>([]);
  
  // 多条件搜索状态
  interface SearchCondition {
    field: 'name' | 'provisioner' | 'reclaimPolicy' | 'volumeBindingMode';
    value: string;
  }
  const [searchConditions, setSearchConditions] = useState<SearchCondition[]>([]);
  const [currentSearchField, setCurrentSearchField] = useState<'name' | 'provisioner' | 'reclaimPolicy' | 'volumeBindingMode'>('name');
  const [currentSearchValue, setCurrentSearchValue] = useState('');

  // 列设置状态
  const [columnSettingsVisible, setColumnSettingsVisible] = useState(false);
  const [visibleColumns, setVisibleColumns] = useState<string[]>([
    'name', 'provisioner', 'reclaimPolicy', 'volumeBindingMode', 'allowVolumeExpansion', 'isDefault', 'createdAt'
  ]);
  
  // 排序状态
  const [sortField, setSortField] = useState<string>('');
  const [sortOrder, setSortOrder] = useState<'ascend' | 'descend' | null>(null);
  
  // YAML查看Modal
  const [yamlModalVisible, setYamlModalVisible] = useState(false);
  const [currentYaml, setCurrentYaml] = useState('');
  const [yamlLoading, setYamlLoading] = useState(false);

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
      name: t('storage:search.fieldName'),
      provisioner: t('storage:search.fieldProvisioner'),
      reclaimPolicy: t('storage:search.fieldReclaimPolicy'),
      volumeBindingMode: t('storage:search.fieldVolumeBindingMode'),
    };
    return labels[field] || field;
  };

  // 客户端过滤StorageClass列表
  const filterStorageClasses = useCallback((items: StorageClass[]): StorageClass[] => {
    if (searchConditions.length === 0) return items;

    return items.filter(sc => {
      const conditionsByField = searchConditions.reduce((acc, condition) => {
        if (!acc[condition.field]) {
          acc[condition.field] = [];
        }
        acc[condition.field].push(condition.value.toLowerCase());
        return acc;
      }, {} as Record<string, string[]>);

      return Object.entries(conditionsByField).every(([field, values]) => {
        const scValue = sc[field as keyof StorageClass];
        const itemStr = String(scValue || '').toLowerCase();
        return values.some(searchValue => itemStr.includes(searchValue));
      });
    });
  }, [searchConditions]);

  // 获取StorageClass列表
  const loadStorageClasses = useCallback(async () => {
    if (!clusterId) return;
    
    setLoading(true);
    try {
      const response = await StorageService.getStorageClasses(
        clusterId,
        undefined,
        1,
        10000
      );
      
      const items = response.items || [];
      setAllStorageClasses(items);
    } catch (error) {
      console.error('Failed to fetch StorageClass list:', error);
      message.error(t('storage:messages.fetchStorageClassError'));
    } finally {
      setLoading(false);
    }
  }, [clusterId, message]);

  // 当搜索条件改变时重置到第一页
  useEffect(() => {
    setCurrentPage(1);
  }, [searchConditions]);

  // 当allStorageClasses、搜索条件、分页参数、排序参数改变时，重新计算显示数据
  useEffect(() => {
    if (allStorageClasses.length === 0) {
      setStorageClasses([]);
      setTotal(0);
      onCountChange?.(0);
      return;
    }
    
    let filteredItems = filterStorageClasses(allStorageClasses);
    
    if (sortField && sortOrder) {
      filteredItems = [...filteredItems].sort((a, b) => {
        const aValue = a[sortField as keyof StorageClass];
        const bValue = b[sortField as keyof StorageClass];
        
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
    
    setStorageClasses(paginatedItems);
    setTotal(filteredItems.length);
    onCountChange?.(filteredItems.length);
  }, [allStorageClasses, filterStorageClasses, currentPage, pageSize, sortField, sortOrder, onCountChange]);

  // 初始加载数据
  useEffect(() => {
    loadStorageClasses();
  }, [loadStorageClasses]);

  // 查看YAML
  const handleViewYAML = async (sc: StorageClass) => {
    setYamlModalVisible(true);
    setYamlLoading(true);
    try {
      const response = await StorageService.getStorageClassYAML(
        clusterId,
        sc.name
      );
      
      setCurrentYaml(response.yaml);
    } catch (error) {
      console.error('Failed to fetch YAML:', error);
      message.error(t('storage:messages.fetchYAMLError'));
    } finally {
      setYamlLoading(false);
    }
  };

  // 删除StorageClass
  const handleDelete = async (sc: StorageClass) => {
    try {
      await StorageService.deleteStorageClass(
        clusterId,
        sc.name
      );
      
      message.success(t('common:messages.deleteSuccess'));
      loadStorageClasses();
    } catch (error) {
      console.error('Failed to delete:', error);
      message.error(t('common:messages.deleteError'));
    }
  };

  // 批量删除
  const handleBatchDelete = async () => {
    if (selectedRowKeys.length === 0) {
      message.warning(t('storage:messages.selectDeleteStorageClass'));
      return;
    }

    Modal.confirm({
      title: t('common:messages.confirmDelete'),
      content: t('storage:messages.confirmDeleteStorageClass', { count: selectedRowKeys.length }),
      okText: t('common:actions.confirm'),
      cancelText: t('common:actions.cancel'),
      onOk: async () => {
        try {
          const selectedSCs = storageClasses.filter(s => 
            selectedRowKeys.includes(s.name)
          );
          
          const deletePromises = selectedSCs.map(sc =>
            StorageService.deleteStorageClass(clusterId, sc.name)
          );
          
          const results = await Promise.allSettled(deletePromises);
          const successCount = results.filter(r => r.status === 'fulfilled').length;
          const failCount = results.length - successCount;
          
          if (failCount === 0) {
            message.success(t('storage:messages.batchDeleteSuccess', { count: successCount, type: 'StorageClass' }));
          } else {
            message.warning(t('storage:messages.batchDeletePartial', { success: successCount, fail: failCount }));
          }
          
          setSelectedRowKeys([]);
          loadStorageClasses();
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
      const filteredData = filterStorageClasses(allStorageClasses);
      
      if (filteredData.length === 0) {
        message.warning(t('common:messages.noExportData'));
        return;
      }

      const dataToExport = filteredData.map(s => ({
        [t('storage:export.nameLabel')]: s.name,
        [t('storage:export.provisionerLabel')]: s.provisioner,
        [t('storage:export.reclaimPolicyLabel')]: s.reclaimPolicy || '-',
        [t('storage:export.bindingModeLabel')]: s.volumeBindingMode || '-',
        [t('storage:export.allowExpansionLabel')]: s.allowVolumeExpansion ? t('storage:yes') : t('storage:no'),
        [t('storage:export.defaultLabel')]: s.isDefault ? t('storage:yes') : t('storage:no'),
        [t('storage:export.createdAtLabel')]: s.createdAt ? new Date(s.createdAt).toLocaleString() : '-',
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
      link.download = `storageclass-list-${Date.now()}.csv`;
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
  const allColumns: ColumnsType<StorageClass> = [
    {
      title: t('common:table.name'),
      dataIndex: 'name',
      key: 'name',
      fixed: 'left' as const,
      width: 220,
      sorter: true,
      sortOrder: sortField === 'name' ? sortOrder : null,
      render: (name: string, record: StorageClass) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Link strong onClick={() => handleViewYAML(record)}>
            {name}
          </Link>
          {record.isDefault && (
            <Tag color="green" icon={<CheckCircleOutlined />}>
              {t('storage:columns.default')}
            </Tag>
          )}
        </div>
      ),
    },
    {
      title: t('storage:columns.provisioner'),
      dataIndex: 'provisioner',
      key: 'provisioner',
      width: 250,
      ellipsis: true,
      render: (provisioner: string) => (
        <Tooltip title={provisioner}>
          <span>{provisioner}</span>
        </Tooltip>
      ),
    },
    {
      title: t('storage:columns.reclaimPolicy'),
      dataIndex: 'reclaimPolicy',
      key: 'reclaimPolicy',
      width: 100,
      render: (policy: string) => (
        <Tag color={StorageService.getReclaimPolicyColor(policy)}>
          {policy || '-'}
        </Tag>
      ),
    },
    {
      title: t('storage:columns.volumeBindingMode'),
      dataIndex: 'volumeBindingMode',
      key: 'volumeBindingMode',
      width: 150,
      render: (mode: string) => {
        const colorMap: Record<string, string> = {
          'Immediate': 'blue',
          'WaitForFirstConsumer': 'orange',
        };
        return mode ? (
          <Tag color={colorMap[mode] || 'default'}>
            {mode}
          </Tag>
        ) : '-';
      },
    },
    {
      title: t('storage:columns.allowVolumeExpansion'),
      dataIndex: 'allowVolumeExpansion',
      key: 'allowVolumeExpansion',
      width: 100,
      render: (allow: boolean) => (
        <Tag color={allow ? 'green' : 'default'}>
          {allow ? t('storage:yes') : t('storage:no')}
        </Tag>
      ),
    },
    {
      title: t('storage:columns.isDefault'),
      dataIndex: 'isDefault',
      key: 'isDefault',
      width: 100,
      render: (isDefault: boolean) => (
        isDefault ? (
          <Tag color="green" icon={<CheckCircleOutlined />}>{t('storage:yes')}</Tag>
        ) : (
          <Tag color="default">{t('storage:no')}</Tag>
        )
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
        return date.toLocaleString();
      },
    },
    {
      title: t('common:table.actions'),
      key: 'action',
      fixed: 'right' as const,
      width: 120,
      render: (_: unknown, record: StorageClass) => (
        <Space size="small">
          <Button
            type="link"
            size="small"
            onClick={() => handleViewYAML(record)}
          >
            YAML
          </Button>
          <Popconfirm
            title={t('storage:messages.confirmDeleteSC')}
            description={t('storage:messages.confirmDeleteSCDesc', { name: record.name })}
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
    sorter: SorterResult<StorageClass> | SorterResult<StorageClass>[]
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
                <Select.Option value="name">{t('storage:search.fieldName')}</Select.Option>
                <Select.Option value="provisioner">{t('storage:search.fieldProvisioner')}</Select.Option>
                <Select.Option value="reclaimPolicy">{t('storage:search.fieldReclaimPolicy')}</Select.Option>
                <Select.Option value="volumeBindingMode">{t('storage:search.fieldVolumeBindingMode')}</Select.Option>
              </Select>
            }
          />
          <Button
            icon={<ReloadOutlined />}
            onClick={() => loadStorageClasses()}
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
        dataSource={storageClasses}
        rowKey={(record) => record.name}
        rowSelection={rowSelection}
        loading={loading}
        scroll={{ x: 1300 }}
        size="middle"
        onChange={handleTableChange}
        pagination={{
          current: currentPage,
          pageSize: pageSize,
          total: total,
          showSizeChanger: true,
          showQuickJumper: true,
          showTotal: (total) => t('storage:pagination.totalStorageClass', { total }),
          onChange: (page, size) => {
            setCurrentPage(page);
            setPageSize(size || 20);
          },
          pageSizeOptions: ['10', '20', '50', '100'],
        }}
      />

      {/* YAML查看Modal */}
      <Modal
        title="StorageClass YAML"
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
              { key: 'provisioner', label: t('storage:columns.provisioner') },
              { key: 'reclaimPolicy', label: t('storage:columns.reclaimPolicy') },
              { key: 'volumeBindingMode', label: t('storage:columns.volumeBindingMode') },
              { key: 'allowVolumeExpansion', label: t('storage:columns.allowVolumeExpansion') },
              { key: 'isDefault', label: t('storage:columns.isDefault') },
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

export default StorageClassTab;
