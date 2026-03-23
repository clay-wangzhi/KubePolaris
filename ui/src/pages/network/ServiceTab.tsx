import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Table,
  Button,
  Space,
  Tag,
  Input,
  Select,
  Modal,
  App,
} from 'antd';
import {
  ReloadOutlined,
  SearchOutlined,
  PlusOutlined,
  SettingOutlined,
} from '@ant-design/icons';
import { ServiceService } from '../../services/serviceService';
import type { Service } from '../../types';
import type { TablePaginationConfig } from 'antd/es/table';
import type { FilterValue, SorterResult } from 'antd/es/table/interface';
import ServiceCreateModal from './ServiceCreateModal';
import ServiceForm from './ServiceForm';
import { YAMLViewModal, EndpointsViewModal, ColumnSettingsDrawer } from './ServiceDrawer';
import { getServiceColumns } from './serviceColumns';
import type { ServiceTabProps, SearchCondition, EndpointsData } from './serviceTypes';
import { useTranslation } from 'react-i18next';

const ServiceTab: React.FC<ServiceTabProps> = ({ clusterId, onCountChange }) => {
  const navigate = useNavigate();
  const { message } = App.useApp();
  const { t } = useTranslation(['network', 'common']);

  // 数据状态
  const [allServices, setAllServices] = useState<Service[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);

  // 分页状态
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  // 选择行状态
  const [selectedRowKeys, setSelectedRowKeys] = useState<string[]>([]);

  // 多条件搜索状态
  const [searchConditions, setSearchConditions] = useState<SearchCondition[]>([]);
  const [currentSearchField, setCurrentSearchField] = useState<SearchCondition['field']>('name');
  const [currentSearchValue, setCurrentSearchValue] = useState('');

  // 列设置状态
  const [columnSettingsVisible, setColumnSettingsVisible] = useState(false);
  const [visibleColumns, setVisibleColumns] = useState<string[]>([
    'name', 'type', 'access', 'ports', 'selector', 'createdAt'
  ]);

  // 排序状态
  const [sortField, setSortField] = useState<string>('');
  const [sortOrder, setSortOrder] = useState<'ascend' | 'descend' | null>(null);

  // YAML查看Modal
  const [yamlModalVisible, setYamlModalVisible] = useState(false);
  const [currentYaml, setCurrentYaml] = useState('');
  const [yamlLoading, setYamlLoading] = useState(false);

  // Endpoints查看Modal
  const [endpointsModalVisible, setEndpointsModalVisible] = useState(false);
  const [currentEndpoints, setCurrentEndpoints] = useState<EndpointsData | null>(null);
  const [endpointsLoading, setEndpointsLoading] = useState(false);

  // 编辑Modal
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editYaml, setEditYaml] = useState('');
  const [editingService, setEditingService] = useState<Service | null>(null);

  // 创建Modal
  const [createModalVisible, setCreateModalVisible] = useState(false);

  // 命名空间列表
  const [namespaces, setNamespaces] = useState<{ name: string; count: number }[]>([]);

  // 添加搜索条件
  const addSearchCondition = () => {
    if (!currentSearchValue.trim()) return;
    setSearchConditions([...searchConditions, {
      field: currentSearchField,
      value: currentSearchValue.trim(),
    }]);
    setCurrentSearchValue('');
  };

  const removeSearchCondition = (index: number) => {
    setSearchConditions(searchConditions.filter((_, i) => i !== index));
  };

  const clearAllConditions = () => {
    setSearchConditions([]);
    setCurrentSearchValue('');
  };

  const getFieldLabel = (field: string): string => {
    const labels: Record<string, string> = {
      name: t('network:service.search.name'),
      namespace: t('network:service.search.namespace'),
      type: t('network:service.search.type'),
      clusterIP: t('network:service.search.clusterIP'),
      selector: t('network:service.search.selector'),
    };
    return labels[field] || field;
  };

  // 客户端过滤
  const filterServices = useCallback((items: Service[]): Service[] => {
    if (searchConditions.length === 0) return items;

    return items.filter(service => {
      const conditionsByField = searchConditions.reduce((acc, condition) => {
        if (!acc[condition.field]) acc[condition.field] = [];
        acc[condition.field].push(condition.value.toLowerCase());
        return acc;
      }, {} as Record<string, string[]>);

      return Object.entries(conditionsByField).every(([field, values]) => {
        let serviceValue: string | number | boolean | undefined;

        if (field === 'selector') {
          serviceValue = ServiceService.formatSelector(service.selector);
        } else {
          const value = service[field as keyof Service];
          serviceValue = typeof value === 'object' && value !== null
            ? JSON.stringify(value)
            : value as string | number | boolean | undefined;
        }

        const itemStr = String(serviceValue || '').toLowerCase();
        return values.some(searchValue => itemStr.includes(searchValue));
      });
    });
  }, [searchConditions]);

  // 加载命名空间列表
  useEffect(() => {
    const loadNamespaces = async () => {
      if (!clusterId) return;
      try {
        const nsList = await ServiceService.getServiceNamespaces(clusterId);
        setNamespaces(nsList);
      } catch (error) {
        console.error('加载命名空间失败:', error);
      }
    };
    loadNamespaces();
  }, [clusterId]);

  // 获取Service列表
  const loadServices = useCallback(async () => {
    if (!clusterId) return;
    setLoading(true);
    try {
      const response = await ServiceService.getServices(clusterId, '_all_', '', undefined, 1, 10000);
      setAllServices(response.items || []);
    } catch (error) {
      console.error('Failed to fetch Service list:', error);
      message.error(t('network:service.messages.fetchError'));
    } finally {
      setLoading(false);
    }
  }, [clusterId, message]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchConditions]);

  // 过滤、排序、分页
  useEffect(() => {
    if (allServices.length === 0) {
      setServices([]);
      setTotal(0);
      onCountChange?.(0);
      return;
    }

    let filteredItems = filterServices(allServices);

    if (sortField && sortOrder) {
      filteredItems = [...filteredItems].sort((a, b) => {
        const aValue = a[sortField as keyof Service];
        const bValue = b[sortField as keyof Service];
        if (aValue === undefined && bValue === undefined) return 0;
        if (aValue === undefined) return sortOrder === 'ascend' ? 1 : -1;
        if (bValue === undefined) return sortOrder === 'ascend' ? -1 : 1;
        const aStr = String(aValue);
        const bStr = String(bValue);
        return sortOrder === 'ascend'
          ? (aStr > bStr ? 1 : aStr < bStr ? -1 : 0)
          : (bStr > aStr ? 1 : bStr < aStr ? -1 : 0);
      });
    }

    const startIndex = (currentPage - 1) * pageSize;
    const paginatedItems = filteredItems.slice(startIndex, startIndex + pageSize);

    setServices(paginatedItems);
    setTotal(filteredItems.length);
    onCountChange?.(filteredItems.length);
  }, [allServices, filterServices, currentPage, pageSize, sortField, sortOrder, onCountChange]);

  useEffect(() => {
    loadServices();
  }, [loadServices]);

  // --- 操作回调 ---

  const handleViewYAML = async (service: Service) => {
    setYamlModalVisible(true);
    setYamlLoading(true);
    try {
      const response = await ServiceService.getServiceYAML(clusterId, service.namespace, service.name);
      setCurrentYaml(response.yaml);
    } catch (error) {
      console.error('Failed to fetch YAML:', error);
      message.error(t('network:service.messages.fetchYAMLError'));
    } finally {
      setYamlLoading(false);
    }
  };

  const handleViewEndpoints = async (service: Service) => {
    setEndpointsModalVisible(true);
    setEndpointsLoading(true);
    try {
      const response = await ServiceService.getServiceEndpoints(clusterId, service.namespace, service.name);
      setCurrentEndpoints(response);
    } catch (error) {
      console.error('Failed to fetch Endpoints:', error);
      message.error(t('network:service.messages.fetchEndpointsError'));
    } finally {
      setEndpointsLoading(false);
    }
  };

  const handleDelete = async (service: Service) => {
    try {
      await ServiceService.deleteService(clusterId, service.namespace, service.name);
      message.success(t('common:messages.deleteSuccess'));
      loadServices();
    } catch (error) {
      console.error('Failed to delete:', error);
      message.error(t('common:messages.deleteError'));
    }
  };

  const handleBatchDelete = async () => {
    if (selectedRowKeys.length === 0) {
      message.warning(t('network:service.messages.selectDelete'));
      return;
    }

    Modal.confirm({
      title: t('common:messages.confirmDelete'),
      content: t('network:service.messages.confirmDeleteBatch', { count: selectedRowKeys.length }),
      okText: t('common:actions.confirm'),
      cancelText: t('common:actions.cancel'),
      onOk: async () => {
        try {
          const selectedServices = services.filter(s =>
            selectedRowKeys.includes(`${s.namespace}/${s.name}`)
          );
          const results = await Promise.allSettled(
            selectedServices.map(s => ServiceService.deleteService(clusterId, s.namespace, s.name))
          );
          const successCount = results.filter(r => r.status === 'fulfilled').length;
          const failCount = results.length - successCount;

          if (failCount === 0) {
            message.success(t('network:service.messages.batchDeleteSuccess', { count: successCount }));
          } else {
            message.warning(t('network:service.messages.batchDeletePartial', { success: successCount, fail: failCount }));
          }
          setSelectedRowKeys([]);
          loadServices();
        } catch (error) {
          console.error('Batch delete failed:', error);
          message.error(t('network:service.messages.batchDeleteError'));
        }
      }
    });
  };

  const handleExport = () => {
    try {
      const filteredData = filterServices(allServices);
      if (filteredData.length === 0) {
        message.warning(t('common:messages.noExportData'));
        return;
      }

      const dataToExport = filteredData.map(s => ({
        [t('network:service.export.name')]: s.name,
        [t('network:service.export.namespace')]: s.namespace,
        [t('network:service.export.type')]: s.type,
        'ClusterIP': s.clusterIP || '-',
        [t('network:service.export.ports')]: ServiceService.formatPorts(s),
        [t('network:service.export.selector')]: ServiceService.formatSelector(s.selector),
        [t('network:service.export.createdAt')]: s.createdAt ? new Date(s.createdAt).toLocaleString(undefined, {
          year: 'numeric', month: '2-digit', day: '2-digit',
          hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
        }).replace(/\//g, '-') : '-',
      }));

      const headers = Object.keys(dataToExport[0]);
      const csvContent = [
        headers.join(','),
        ...dataToExport.map(row =>
          headers.map(header => `"${row[header as keyof typeof row]}"`).join(',')
        )
      ].join('\n');

      const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `service-list-${Date.now()}.csv`;
      link.click();
      message.success(t('common:messages.exportCount', { count: filteredData.length }));
    } catch (error) {
      console.error('Export failed:', error);
      message.error(t('common:messages.exportError'));
    }
  };

  const handleEdit = (service: Service) => {
    navigate(`/clusters/${clusterId}/network/service/${service.namespace}/${service.name}/edit`);
  };

  const handleColumnSettingsSave = () => {
    setColumnSettingsVisible(false);
    message.success(t('common:messages.columnSettingsSaved'));
  };

  // 构建列定义
  const allColumns = useMemo(() => getServiceColumns({
    sortField,
    sortOrder,
    onViewYAML: handleViewYAML,
    onEdit: handleEdit,
    onViewEndpoints: handleViewEndpoints,
    onDelete: handleDelete,
    t,
  }), [sortField, sortOrder, clusterId, t]);

  const columns = allColumns.filter(col => {
    if (col.key === 'action' || col.key === 'name') return true;
    return visibleColumns.includes(col.key as string);
  });

  const handleTableChange = (
    _pagination: TablePaginationConfig,
    _filters: Record<string, FilterValue | null>,
    sorter: SorterResult<Service> | SorterResult<Service>[]
  ) => {
    const singleSorter = Array.isArray(sorter) ? sorter[0] : sorter;
    if (singleSorter?.field) {
      setSortField(String(singleSorter.field));
      setSortOrder(singleSorter.order || null);
    } else {
      setSortField('');
      setSortOrder(null);
    }
  };

  const rowSelection = {
    selectedRowKeys,
    onChange: (keys: React.Key[]) => setSelectedRowKeys(keys as string[]),
  };

  return (
    <div>
      {/* 操作按钮栏 */}
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <Space>
          <Button disabled={selectedRowKeys.length === 0} onClick={handleBatchDelete} danger>
            {t('common:actions.batchDelete')}
          </Button>
          <Button onClick={handleExport}>
            {t('common:actions.export')}
          </Button>
        </Space>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateModalVisible(true)}>
          {t('network:service.createService')}
        </Button>
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
              <Select value={currentSearchField} onChange={setCurrentSearchField} style={{ width: 120 }}>
                <Select.Option value="name">{t('network:service.search.name')}</Select.Option>
                <Select.Option value="namespace">{t('network:service.search.namespace')}</Select.Option>
                <Select.Option value="type">{t('network:service.search.type')}</Select.Option>
                <Select.Option value="clusterIP">{t('network:service.search.clusterIP')}</Select.Option>
                <Select.Option value="selector">{t('network:service.search.selector')}</Select.Option>
              </Select>
            }
          />
          <Button icon={<ReloadOutlined />} onClick={() => loadServices()} />
          <Button icon={<SettingOutlined />} onClick={() => setColumnSettingsVisible(true)} />
        </div>

        {searchConditions.length > 0 && (
          <div>
            <Space size="small" wrap>
              {searchConditions.map((condition, index) => (
                <Tag key={index} closable onClose={() => removeSearchCondition(index)} color="blue">
                  {getFieldLabel(condition.field)}: {condition.value}
                </Tag>
              ))}
              <Button size="small" type="link" onClick={clearAllConditions} style={{ padding: 0 }}>
                {t('common:actions.clearAll')}
              </Button>
            </Space>
          </div>
        )}
      </div>

      <Table
        columns={columns}
        dataSource={services}
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
          showTotal: (total) => t('network:service.pagination.total', { total }),
          onChange: (page, size) => {
            setCurrentPage(page);
            setPageSize(size || 20);
          },
          pageSizeOptions: ['10', '20', '50', '100'],
        }}
      />

      <YAMLViewModal
        visible={yamlModalVisible}
        yaml={currentYaml}
        loading={yamlLoading}
        onClose={() => setYamlModalVisible(false)}
      />

      <EndpointsViewModal
        visible={endpointsModalVisible}
        endpoints={currentEndpoints}
        loading={endpointsLoading}
        onClose={() => setEndpointsModalVisible(false)}
      />

      <ServiceCreateModal
        visible={createModalVisible}
        clusterId={clusterId}
        onClose={() => setCreateModalVisible(false)}
        onSuccess={() => loadServices()}
      />

      <ServiceForm
        visible={editModalVisible}
        clusterId={clusterId}
        editingService={editingService}
        initialYaml={editYaml}
        namespaces={namespaces}
        onCancel={() => {
          setEditModalVisible(false);
          setEditYaml('');
          setEditingService(null);
        }}
        onSuccess={() => {
          message.success(t('common:messages.saveSuccess'));
          loadServices();
        }}
      />

      <ColumnSettingsDrawer
        visible={columnSettingsVisible}
        visibleColumns={visibleColumns}
        onVisibleColumnsChange={setVisibleColumns}
        onClose={() => setColumnSettingsVisible(false)}
        onSave={handleColumnSettingsSave}
      />
    </div>
  );
};

export default ServiceTab;
