import React, { useState, useEffect, useCallback } from 'react';
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
  Form,
} from 'antd';
import {
  ReloadOutlined,
  SearchOutlined,
  PlusOutlined,
  SettingOutlined,
} from '@ant-design/icons';
import { IngressService } from '../../services/ingressService';
import type { Ingress } from '../../types';
import type { TablePaginationConfig } from 'antd/es/table';
import type { FilterValue, SorterResult } from 'antd/es/table/interface';
import IngressCreateModal from './IngressCreateModal';
import IngressForm, { buildIngressYaml } from './IngressForm';
import IngressDrawer from './IngressDrawer';
import { getIngressColumns } from './ingressColumns';
import type { IngressTabProps, SearchCondition } from './ingressTypes';
import { useTranslation } from 'react-i18next';

const IngressTab: React.FC<IngressTabProps> = ({ clusterId, onCountChange }) => {
  const navigate = useNavigate();
  const { message } = App.useApp();
  const { t } = useTranslation(['network', 'common']);

  const [allIngresses, setAllIngresses] = useState<Ingress[]>([]);
  const [ingresses, setIngresses] = useState<Ingress[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);

  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  const [selectedRowKeys, setSelectedRowKeys] = useState<string[]>([]);

  const [searchConditions, setSearchConditions] = useState<SearchCondition[]>([]);
  const [currentSearchField, setCurrentSearchField] = useState<SearchCondition['field']>('name');
  const [currentSearchValue, setCurrentSearchValue] = useState('');

  const [columnSettingsVisible, setColumnSettingsVisible] = useState(false);
  const [visibleColumns, setVisibleColumns] = useState<string[]>([
    'name', 'ingressClassName', 'loadBalancer', 'hosts', 'backends', 'createdAt'
  ]);

  const [sortField, setSortField] = useState<string>('');
  const [sortOrder, setSortOrder] = useState<'ascend' | 'descend' | null>(null);

  const [yamlModalVisible, setYamlModalVisible] = useState(false);
  const [currentYaml, setCurrentYaml] = useState('');
  const [yamlLoading, setYamlLoading] = useState(false);

  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editYaml, setEditYaml] = useState('');
  const [editingIngress, setEditingIngress] = useState<Ingress | null>(null);
  const [saveLoading, setSaveLoading] = useState(false);
  const [editMode, setEditMode] = useState<'form' | 'yaml'>('yaml');
  const [editForm] = Form.useForm();

  const [createModalVisible, setCreateModalVisible] = useState(false);

  const [namespaces, setNamespaces] = useState<{ name: string; count: number }[]>([]);
  const [, setLoadingNamespaces] = useState(false);

  // --- Search helpers ---

  const addSearchCondition = () => {
    if (!currentSearchValue.trim()) return;
    setSearchConditions([...searchConditions, { field: currentSearchField, value: currentSearchValue.trim() }]);
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
      name: t('network:ingress.search.name'),
      namespace: t('network:ingress.search.namespace'),
      ingressClassName: t('network:ingress.search.ingressClassName'),
      host: t('network:ingress.search.host'),
    };
    return labels[field] || field;
  };

  // --- Filtering ---

  const filterIngresses = useCallback((items: Ingress[]): Ingress[] => {
    if (searchConditions.length === 0) return items;

    return items.filter(ingress => {
      const conditionsByField = searchConditions.reduce((acc, condition) => {
        if (!acc[condition.field]) acc[condition.field] = [];
        acc[condition.field].push(condition.value.toLowerCase());
        return acc;
      }, {} as Record<string, string[]>);

      return Object.entries(conditionsByField).every(([field, values]) => {
        if (field === 'host') {
          const hostsStr = IngressService.getHosts(ingress).join(' ').toLowerCase();
          return values.some(v => hostsStr.includes(v));
        }

        const raw = ingress[field as keyof Ingress];
        const itemStr = String(
          typeof raw === 'object' && raw !== null ? JSON.stringify(raw) : (raw ?? '')
        ).toLowerCase();
        return values.some(v => itemStr.includes(v));
      });
    });
  }, [searchConditions]);

  // --- Data loading ---

  useEffect(() => {
    if (!clusterId) return;
    setLoadingNamespaces(true);
    IngressService.getIngressNamespaces(clusterId)
      .then(setNamespaces)
      .catch((err) => console.error('加载命名空间失败:', err))
      .finally(() => setLoadingNamespaces(false));
  }, [clusterId]);

  const loadIngresses = useCallback(async () => {
    if (!clusterId) return;
    setLoading(true);
    try {
      const response = await IngressService.getIngresses(clusterId, '_all_', '', undefined, 1, 10000);
      setAllIngresses(response.items || []);
    } catch (error) {
      console.error('Failed to fetch Ingress list:', error);
      message.error(t('network:ingress.messages.fetchError'));
    } finally {
      setLoading(false);
    }
  }, [clusterId, message, t]);

  useEffect(() => { setCurrentPage(1); }, [searchConditions]);

  useEffect(() => {
    if (allIngresses.length === 0) {
      setIngresses([]);
      setTotal(0);
      onCountChange?.(0);
      return;
    }

    let filtered = filterIngresses(allIngresses);

    if (sortField && sortOrder) {
      filtered = [...filtered].sort((a, b) => {
        const aVal = a[sortField as keyof Ingress];
        const bVal = b[sortField as keyof Ingress];
        if (aVal === undefined && bVal === undefined) return 0;
        if (aVal === undefined) return sortOrder === 'ascend' ? 1 : -1;
        if (bVal === undefined) return sortOrder === 'ascend' ? -1 : 1;
        const cmp = String(aVal) > String(bVal) ? 1 : String(aVal) < String(bVal) ? -1 : 0;
        return sortOrder === 'ascend' ? cmp : -cmp;
      });
    }

    const start = (currentPage - 1) * pageSize;
    setIngresses(filtered.slice(start, start + pageSize));
    setTotal(filtered.length);
    onCountChange?.(filtered.length);
  }, [allIngresses, filterIngresses, currentPage, pageSize, sortField, sortOrder, onCountChange]);

  useEffect(() => { loadIngresses(); }, [loadIngresses]);

  // --- CRUD handlers ---

  const handleViewYAML = async (ingress: Ingress) => {
    setYamlModalVisible(true);
    setYamlLoading(true);
    try {
      const response = await IngressService.getIngressYAML(clusterId, ingress.namespace, ingress.name);
      setCurrentYaml(response.yaml);
    } catch (error) {
      console.error('Failed to fetch YAML:', error);
      message.error(t('network:ingress.messages.fetchYAMLError'));
    } finally {
      setYamlLoading(false);
    }
  };

  const handleDelete = async (ingress: Ingress) => {
    try {
      await IngressService.deleteIngress(clusterId, ingress.namespace, ingress.name);
      message.success(t('common:messages.deleteSuccess'));
      loadIngresses();
    } catch (error) {
      console.error('Failed to delete:', error);
      message.error(t('common:messages.deleteError'));
    }
  };

  const handleBatchDelete = () => {
    if (selectedRowKeys.length === 0) {
      message.warning(t('network:ingress.messages.selectDelete'));
      return;
    }

    Modal.confirm({
      title: t('common:messages.confirmDelete'),
      content: t('network:ingress.messages.confirmDeleteBatch', { count: selectedRowKeys.length }),
      okText: t('common:actions.confirm'),
      cancelText: t('common:actions.cancel'),
      onOk: async () => {
        try {
          const selected = ingresses.filter(i => selectedRowKeys.includes(`${i.namespace}/${i.name}`));
          const results = await Promise.allSettled(
            selected.map(i => IngressService.deleteIngress(clusterId, i.namespace, i.name))
          );
          const successCount = results.filter(r => r.status === 'fulfilled').length;
          const failCount = results.length - successCount;

          if (failCount === 0) {
            message.success(t('network:ingress.messages.batchDeleteSuccess', { count: successCount }));
          } else {
            message.warning(t('network:ingress.messages.batchDeletePartial', { success: successCount, fail: failCount }));
          }
          setSelectedRowKeys([]);
          loadIngresses();
        } catch (error) {
          console.error('Batch delete failed:', error);
          message.error(t('network:ingress.messages.batchDeleteError'));
        }
      },
    });
  };

  const handleExport = () => {
    try {
      const filteredData = filterIngresses(allIngresses);
      if (filteredData.length === 0) {
        message.warning(t('common:messages.noExportData'));
        return;
      }

      const dataToExport = filteredData.map(i => ({
        [t('network:ingress.export.name')]: i.name,
        [t('network:ingress.export.namespace')]: i.namespace,
        [t('network:ingress.export.ingressClass')]: IngressService.formatIngressClass(i.ingressClassName),
        [t('network:ingress.export.loadBalancer')]: IngressService.formatLoadBalancers(i).join('; '),
        [t('network:ingress.export.hosts')]: IngressService.getHosts(i).join('; '),
        [t('network:ingress.export.backends')]: IngressService.formatBackends(i).join('; '),
        [t('network:ingress.export.tls')]: IngressService.hasTLS(i) ? t('storage:yes') : t('storage:no'),
        [t('network:ingress.export.createdAt')]: i.createdAt
          ? new Date(i.createdAt).toLocaleString(undefined, {
              year: 'numeric', month: '2-digit', day: '2-digit',
              hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
            }).replace(/\//g, '-')
          : '-',
      }));

      const headers = Object.keys(dataToExport[0]);
      const csvContent = [
        headers.join(','),
        ...dataToExport.map(row =>
          headers.map(h => `"${row[h as keyof typeof row]}"`).join(',')
        ),
      ].join('\n');

      const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `ingress-list-${Date.now()}.csv`;
      link.click();
      message.success(t('common:messages.exportCount', { count: filteredData.length }));
    } catch (error) {
      console.error('Export failed:', error);
      message.error(t('common:messages.exportError'));
    }
  };

  const handleEdit = (ingress: Ingress) => {
    navigate(`/clusters/${clusterId}/network/ingress/${ingress.namespace}/${ingress.name}/edit`);
  };

  const handleSaveEdit = async () => {
    if (!editingIngress) return;
    setSaveLoading(true);
    try {
      if (editMode === 'yaml') {
        await IngressService.updateIngress(clusterId, editingIngress.namespace, editingIngress.name, {
          namespace: editingIngress.namespace,
          yaml: editYaml,
        });
      } else {
        const values = await editForm.validateFields();
        const yamlString = buildIngressYaml(values);
        await IngressService.updateIngress(clusterId, values.namespace, values.name, {
          namespace: values.namespace,
          yaml: yamlString,
        });
        editForm.resetFields();
      }
      message.success(t('common:messages.saveSuccess'));
      setEditModalVisible(false);
      setEditYaml('');
      setEditingIngress(null);
      setEditMode('yaml');
      loadIngresses();
    } catch (error) {
      console.error('Failed to update:', error);
      message.error(t('common:messages.saveError'));
    } finally {
      setSaveLoading(false);
    }
  };

  const handleColumnSettingsSave = () => {
    setColumnSettingsVisible(false);
    message.success(t('common:messages.columnSettingsSaved'));
  };

  // --- Table config ---

  const columns = getIngressColumns(
    t,
    { onViewYAML: handleViewYAML, onEdit: handleEdit, onDelete: handleDelete },
    { sortField, sortOrder },
  ).filter(col => {
    if (col.key === 'action' || col.key === 'name') return true;
    return visibleColumns.includes(col.key as string);
  });

  const handleTableChange = (
    _pagination: TablePaginationConfig,
    _filters: Record<string, FilterValue | null>,
    sorter: SorterResult<Ingress> | SorterResult<Ingress>[],
  ) => {
    const s = Array.isArray(sorter) ? sorter[0] : sorter;
    if (s?.field) {
      setSortField(String(s.field));
      setSortOrder(s.order || null);
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
          <Button disabled={selectedRowKeys.length === 0} onClick={handleBatchDelete} danger>
            {t('common:actions.batchDelete')}
          </Button>
          <Button onClick={handleExport}>
            {t('common:actions.export')}
          </Button>
        </Space>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateModalVisible(true)}>
          {t('network:ingress.createIngress')}
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
              <Select value={currentSearchField} onChange={setCurrentSearchField} style={{ width: 130 }}>
                <Select.Option value="name">{t('network:ingress.search.name')}</Select.Option>
                <Select.Option value="namespace">{t('network:ingress.search.namespace')}</Select.Option>
                <Select.Option value="ingressClassName">{t('network:ingress.search.ingressClassName')}</Select.Option>
                <Select.Option value="host">{t('network:ingress.search.host')}</Select.Option>
              </Select>
            }
          />
          <Button icon={<ReloadOutlined />} onClick={() => loadIngresses()} />
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
        dataSource={ingresses}
        rowKey={(record) => `${record.namespace}/${record.name}`}
        rowSelection={{ selectedRowKeys, onChange: (keys) => setSelectedRowKeys(keys as string[]) }}
        loading={loading}
        scroll={{ x: 1400 }}
        size="middle"
        onChange={handleTableChange}
        pagination={{
          current: currentPage,
          pageSize,
          total,
          showSizeChanger: true,
          showQuickJumper: true,
          showTotal: (t_total) => t('network:ingress.pagination.total', { total: t_total }),
          onChange: (page, size) => { setCurrentPage(page); setPageSize(size || 20); },
          pageSizeOptions: ['10', '20', '50', '100'],
        }}
      />

      {/* YAML查看Modal */}
      <Modal
        title="Ingress YAML"
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

      <IngressCreateModal
        visible={createModalVisible}
        clusterId={clusterId}
        onClose={() => setCreateModalVisible(false)}
        onSuccess={() => loadIngresses()}
      />

      <IngressForm
        visible={editModalVisible}
        editingIngress={editingIngress}
        editMode={editMode}
        editYaml={editYaml}
        saveLoading={saveLoading}
        form={editForm}
        namespaces={namespaces}
        clusterId={clusterId}
        onEditModeChange={setEditMode}
        onEditYamlChange={setEditYaml}
        onCancel={() => {
          setEditModalVisible(false);
          setEditYaml('');
          setEditingIngress(null);
          setEditMode('yaml');
          editForm.resetFields();
        }}
        onSave={handleSaveEdit}
      />

      <IngressDrawer
        visible={columnSettingsVisible}
        visibleColumns={visibleColumns}
        onVisibleColumnsChange={setVisibleColumns}
        onClose={() => setColumnSettingsVisible(false)}
        onSave={handleColumnSettingsSave}
      />
    </div>
  );
};

export default IngressTab;
