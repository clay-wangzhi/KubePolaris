import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
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
  Descriptions,
  App,
  Tabs,
  Form,
  InputNumber,
  Checkbox,
  Drawer,
} from 'antd';
import {
  DeleteOutlined,
  FileTextOutlined,
  ReloadOutlined,
  SearchOutlined,
  LinkOutlined,
  EditOutlined,
  PlusOutlined,
  MinusCircleOutlined,
  SettingOutlined,
} from '@ant-design/icons';
import MonacoEditor from '@monaco-editor/react';
import * as YAML from 'yaml';
import { ServiceService } from '../../services/serviceService';
import type { Service } from '../../types';
import type { ColumnsType, TablePaginationConfig } from 'antd/es/table';
import type { FilterValue, SorterResult } from 'antd/es/table/interface';
import ServiceCreateModal from './ServiceCreateModal';

const { Text, Link } = Typography;

interface ServiceTabProps {
  clusterId: string;
  onCountChange?: (count: number) => void;
}

const ServiceTab: React.FC<ServiceTabProps> = ({ clusterId, onCountChange }) => {
  const navigate = useNavigate();
  const { message } = App.useApp();
  
  // 数据状态
  const [allServices, setAllServices] = useState<Service[]>([]); // 所有原始数据
  const [services, setServices] = useState<Service[]>([]); // 当前页显示的数据
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  
  // 分页状态
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  
  // 选择行状态
  const [selectedRowKeys, setSelectedRowKeys] = useState<string[]>([]);
  
  // 多条件搜索状态
  interface SearchCondition {
    field: 'name' | 'namespace' | 'type' | 'clusterIP' | 'selector';
    value: string;
  }
  const [searchConditions, setSearchConditions] = useState<SearchCondition[]>([]);
  const [currentSearchField, setCurrentSearchField] = useState<'name' | 'namespace' | 'type' | 'clusterIP' | 'selector'>('name');
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
  const [currentEndpoints, setCurrentEndpoints] = useState<any>(null);
  const [endpointsLoading, setEndpointsLoading] = useState(false);

  // YAML编辑Modal
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editYaml, setEditYaml] = useState('');
  const [editingService, setEditingService] = useState<Service | null>(null);
  const [saveLoading, setSaveLoading] = useState(false);
  const [editMode, setEditMode] = useState<'form' | 'yaml'>('yaml');
  const [editForm] = Form.useForm();

  // 创建Modal
  const [createModalVisible, setCreateModalVisible] = useState(false);
  
  // 命名空间列表
  const [namespaces, setNamespaces] = useState<{ name: string; count: number }[]>([]);
  const [loadingNamespaces, setLoadingNamespaces] = useState(false);

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
      name: '服务名称',
      namespace: '命名空间',
      type: '类型',
      clusterIP: 'ClusterIP',
      selector: '选择器',
    };
    return labels[field] || field;
  };

  // 客户端过滤服务列表
  const filterServices = useCallback((items: Service[]): Service[] => {
    if (searchConditions.length === 0) return items;

    return items.filter(service => {
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
        let serviceValue: any;
        
        if (field === 'selector') {
          serviceValue = ServiceService.formatSelector(service.selector);
        } else {
          serviceValue = service[field as keyof Service];
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
      setLoadingNamespaces(true);
      try {
        const nsList = await ServiceService.getServiceNamespaces(clusterId);
        setNamespaces(nsList);
      } catch (error) {
        console.error('加载命名空间失败:', error);
      } finally {
        setLoadingNamespaces(false);
      }
    };

    loadNamespaces();
  }, [clusterId]);

  // 获取Service列表（获取所有数据，不分页）
  const loadServices = useCallback(async () => {
    if (!clusterId) return;
    
    setLoading(true);
    try {
      const response = await ServiceService.getServices(
        clusterId,
        '_all_',
        '',
        undefined,
        1,
        10000 // 获取所有数据
      );
      
      if (response.code === 200) {
        const items = response.data.items || [];
        // 保存原始数据，筛选和分页会在useEffect中自动处理
        setAllServices(items);
      } else {
        message.error(response.message || '获取Service列表失败');
      }
    } catch (error) {
      console.error('获取Service列表失败:', error);
      message.error('获取Service列表失败');
    } finally {
      setLoading(false);
    }
  }, [clusterId, message]);

  // 当搜索条件改变时重置到第一页
  useEffect(() => {
    setCurrentPage(1);
  }, [searchConditions]);

  // 当allServices、搜索条件、分页参数、排序参数改变时，重新计算显示数据
  useEffect(() => {
    if (allServices.length === 0) {
      setServices([]);
      setTotal(0);
      onCountChange?.(0);
      return;
    }
    
    // 1. 应用客户端过滤
    let filteredItems = filterServices(allServices);
    
    // 2. 应用排序
    if (sortField && sortOrder) {
      filteredItems = [...filteredItems].sort((a, b) => {
        const aValue = a[sortField as keyof Service];
        const bValue = b[sortField as keyof Service];
        
        // 处理 undefined 值
        if (aValue === undefined && bValue === undefined) return 0;
        if (aValue === undefined) return sortOrder === 'ascend' ? 1 : -1;
        if (bValue === undefined) return sortOrder === 'ascend' ? -1 : 1;
        
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
    
    setServices(paginatedItems);
    setTotal(filteredItems.length);
    onCountChange?.(filteredItems.length);
  }, [allServices, filterServices, currentPage, pageSize, sortField, sortOrder, onCountChange]);

  // 初始加载数据
  useEffect(() => {
    loadServices();
  }, [loadServices]);

  // 查看YAML
  const handleViewYAML = async (service: Service) => {
    setYamlModalVisible(true);
    setYamlLoading(true);
    try {
      const response = await ServiceService.getServiceYAML(
        clusterId,
        service.namespace,
        service.name
      );
      
      if (response.code === 200) {
        setCurrentYaml(response.data.yaml);
      } else {
        message.error(response.message || '获取YAML失败');
      }
    } catch (error) {
      console.error('获取YAML失败:', error);
      message.error('获取YAML失败');
    } finally {
      setYamlLoading(false);
    }
  };

  // 查看Endpoints
  const handleViewEndpoints = async (service: Service) => {
    setEndpointsModalVisible(true);
    setEndpointsLoading(true);
    try {
      const response = await ServiceService.getServiceEndpoints(
        clusterId,
        service.namespace,
        service.name
      );
      
      if (response.code === 200) {
        setCurrentEndpoints(response.data);
      } else {
        message.error(response.message || '获取Endpoints失败');
      }
    } catch (error) {
      console.error('获取Endpoints失败:', error);
      message.error('获取Endpoints失败');
    } finally {
      setEndpointsLoading(false);
    }
  };

  // 删除Service
  const handleDelete = async (service: Service) => {
    try {
      const response = await ServiceService.deleteService(
        clusterId,
        service.namespace,
        service.name
      );
      
      if (response.code === 200) {
        message.success('删除成功');
        loadServices();
      } else {
        message.error(response.message || '删除失败');
      }
    } catch (error) {
      console.error('删除失败:', error);
      message.error('删除失败');
    }
  };

  // 批量删除
  const handleBatchDelete = async () => {
    if (selectedRowKeys.length === 0) {
      message.warning('请先选择要删除的Service');
      return;
    }

    Modal.confirm({
      title: '确认删除',
      content: `确定要删除选中的 ${selectedRowKeys.length} 个Service吗？`,
      okText: '确定',
      cancelText: '取消',
      onOk: async () => {
        try {
          const selectedServices = services.filter(s => 
            selectedRowKeys.includes(`${s.namespace}/${s.name}`)
          );
          
          const deletePromises = selectedServices.map(service =>
            ServiceService.deleteService(clusterId, service.namespace, service.name)
          );
          
          const results = await Promise.allSettled(deletePromises);
          const successCount = results.filter(r => r.status === 'fulfilled').length;
          const failCount = results.length - successCount;
          
          if (failCount === 0) {
            message.success(`成功删除 ${successCount} 个Service`);
          } else {
            message.warning(`删除完成：成功 ${successCount} 个，失败 ${failCount} 个`);
          }
          
          setSelectedRowKeys([]);
          loadServices();
        } catch (error) {
          console.error('批量删除失败:', error);
          message.error('批量删除失败');
        }
      }
    });
  };

  // 导出功能（导出所有筛选后的数据，包含所有列）
  const handleExport = () => {
    try {
      // 获取所有筛选后的数据（不限于当前页）
      const filteredData = filterServices(allServices);
      
      if (filteredData.length === 0) {
        message.warning('没有数据可导出');
        return;
      }

      // 导出筛选后的所有数据（包含所有列）
      const dataToExport = filteredData.map(s => ({
        '服务名称': s.name,
        '命名空间': s.namespace,
        '类型': s.type,
        'ClusterIP': s.clusterIP || '-',
        '端口': ServiceService.formatPorts(s),
        '选择器': ServiceService.formatSelector(s.selector),
        '创建时间': s.createdAt ? new Date(s.createdAt).toLocaleString('zh-CN', {
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
            return `"${value}"`;
          }).join(',')
        )
      ].join('\n');
      
      const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `service-list-${Date.now()}.csv`;
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

  // 编辑Service - 跳转到独立的编辑页面
  const handleEdit = (service: Service) => {
    navigate(`/clusters/${clusterId}/network/service/${service.namespace}/${service.name}/edit`);
  };

  // 保存编辑
  const handleSaveEdit = async () => {
    if (!editingService) return;

    setSaveLoading(true);
    try {
      if (editMode === 'yaml') {
        // YAML方式更新
        const response = await ServiceService.updateService(
          clusterId,
          editingService.namespace,
          editingService.name,
          {
            namespace: editingService.namespace,
            yaml: editYaml,
          }
        );
        
        if (response.code === 200) {
          message.success('更新成功');
          setEditModalVisible(false);
          setEditYaml('');
          setEditingService(null);
          setEditMode('yaml');
          loadServices();
        } else {
          message.error(response.message || '更新失败');
        }
      } else {
        // 表单方式更新
        const values = await editForm.validateFields();
        
        // 构建Service YAML
        const serviceYaml: any = {
          apiVersion: 'v1',
          kind: 'Service',
          metadata: {
            name: values.name,
            namespace: values.namespace,
            labels: {},
            annotations: {},
          },
          spec: {
            type: values.type,
            selector: {},
            ports: values.ports || [],
            sessionAffinity: values.sessionAffinity || 'None',
          },
        };

        // 添加labels
        if (values.labels && values.labels.length > 0) {
          values.labels.forEach((label: any) => {
            if (label && label.key) {
              serviceYaml.metadata.labels[label.key] = label.value || '';
            }
          });
        }

        // 添加annotations
        if (values.annotations && values.annotations.length > 0) {
          values.annotations.forEach((annotation: any) => {
            if (annotation && annotation.key) {
              serviceYaml.metadata.annotations[annotation.key] = annotation.value || '';
            }
          });
        }

        // 添加selectors
        if (values.selectors && values.selectors.length > 0) {
          values.selectors.forEach((selector: any) => {
            if (selector && selector.key) {
              serviceYaml.spec.selector[selector.key] = selector.value || '';
            }
          });
        }

        const yamlString = YAML.stringify(serviceYaml);
        
        const response = await ServiceService.updateService(
          clusterId,
          values.namespace,
          values.name,
          {
            namespace: values.namespace,
            yaml: yamlString,
          }
        );
        
        if (response.code === 200) {
          message.success('更新成功');
          setEditModalVisible(false);
          setEditYaml('');
          setEditingService(null);
          setEditMode('yaml');
          editForm.resetFields();
          loadServices();
        } else {
          message.error(response.message || '更新失败');
        }
      }
    } catch (error) {
      console.error('更新失败:', error);
      message.error('更新失败');
    } finally {
      setSaveLoading(false);
    }
  };

  // 行选择配置
  const rowSelection = {
    selectedRowKeys,
    onChange: (keys: React.Key[]) => {
      setSelectedRowKeys(keys as string[]);
    },
  };

  // 定义所有可用列
  const allColumns: ColumnsType<Service> = [
    {
      title: '服务名称',
      dataIndex: 'name',
      key: 'name',
      fixed: 'left' as const,
      width: 200,
      sorter: true,
      sortOrder: sortField === 'name' ? sortOrder : null,
      render: (name: string, record: Service) => (
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
      title: '命名空间',
      dataIndex: 'namespace',
      key: 'namespace',
      width: 130,
      sorter: true,
      sortOrder: sortField === 'namespace' ? sortOrder : null,
      render: (text: string) => <Tag color="blue">{text}</Tag>,
    },
    {
      title: '类型',
      dataIndex: 'type',
      key: 'type',
      width: 150,
      render: (type: string) => (
        <Tag color={ServiceService.getTypeColor(type)}>
          {ServiceService.getTypeTag(type)}
        </Tag>
      ),
    },
    {
      title: '访问地址',
      key: 'access',
      width: 200,
      render: (_: any, record: Service) => {
        const addresses = ServiceService.formatAccessAddress(record);
        return (
          <div>
            {addresses.slice(0, 2).map((addr, idx) => (
              <div key={idx} style={{ fontSize: 12 }}>
                {addr}
              </div>
            ))}
            {addresses.length > 2 && (
              <Tooltip title={addresses.slice(2).join(', ')}>
                <Text type="secondary" style={{ fontSize: 12, cursor: 'pointer' }}>
                  +{addresses.length - 2} 更多
                </Text>
              </Tooltip>
            )}
          </div>
        );
      },
    },
    {
      title: '端口',
      key: 'ports',
      width: 180,
      render: (_: any, record: Service) => (
        <Tooltip title={ServiceService.formatPorts(record)}>
          <Text ellipsis style={{ width: 160, display: 'block' }}>
            {ServiceService.formatPorts(record)}
          </Text>
        </Tooltip>
      ),
    },
    {
      title: '选择器',
      key: 'selector',
      width: 200,
      render: (_: any, record: Service) => (
        <Tooltip title={ServiceService.formatSelector(record.selector)}>
          <Text ellipsis style={{ width: 180, display: 'block' }}>
            {ServiceService.formatSelector(record.selector)}
          </Text>
        </Tooltip>
      ),
    },
    {
      title: '创建时间',
      dataIndex: 'createdAt',
      key: 'createdAt',
      width: 180,
      sorter: true,
      sortOrder: sortField === 'createdAt' ? sortOrder : null,
      render: (createdAt: string) => {
        if (!createdAt) return '-';
        const date = new Date(createdAt);
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
      key: 'action',
      fixed: 'right' as const,
      width: 180,
      render: (_: any, record: Service) => (
        <Space size="small">
          <Button
            type="link"
            size="small"
            onClick={() => handleViewYAML(record)}
          >
            YAML
          </Button>
          <Button
            type="link"
            size="small"
            onClick={() => handleEdit(record)}
          >
            编辑
          </Button>
          <Button
            type="link"
            size="small"
            onClick={() => handleViewEndpoints(record)}
          >
            Endpoints
          </Button>
          <Popconfirm
            title="确定要删除这个Service吗？"
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
    if (col.key === 'action') return true; // 操作列始终显示
    if (col.key === 'name') return true; // 名称列始终显示
    return visibleColumns.includes(col.key as string);
  });

  // 表格排序处理
  const handleTableChange = (
    _pagination: TablePaginationConfig,
    _filters: Record<string, FilterValue | null>,
    sorter: SorterResult<Service> | SorterResult<Service>[]
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
            批量删除
          </Button>
          <Button onClick={handleExport}>
            导出
          </Button>
        </Space>
        <Button
          type="primary"
          icon={<PlusOutlined />}
          onClick={() => setCreateModalVisible(true)}
        >
          创建Service
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
                style={{ width: 120 }}
              >
                <Select.Option value="name">服务名称</Select.Option>
                <Select.Option value="namespace">命名空间</Select.Option>
                <Select.Option value="type">类型</Select.Option>
                <Select.Option value="clusterIP">ClusterIP</Select.Option>
                <Select.Option value="selector">选择器</Select.Option>
              </Select>
            }
          />
          <Button
            icon={<ReloadOutlined />}
            onClick={() => {
              loadServices();
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
          showTotal: (total) => `共 ${total} 个服务`,
          onChange: (page, size) => {
            setCurrentPage(page);
            setPageSize(size || 20);
          },
          pageSizeOptions: ['10', '20', '50', '100'],
        }}
      />

      {/* YAML查看Modal */}
      <Modal
        title="Service YAML"
        open={yamlModalVisible}
        onCancel={() => setYamlModalVisible(false)}
        footer={null}
        width={800}
      >
        {yamlLoading ? (
          <div style={{ textAlign: 'center', padding: 40 }}>
            <span>加载中...</span>
          </div>
        ) : (
          <pre style={{ maxHeight: 600, overflow: 'auto', background: '#f5f5f5', padding: 16 }}>
            {currentYaml}
          </pre>
        )}
      </Modal>

      {/* Endpoints查看Modal */}
      <Modal
        title="Service Endpoints"
        open={endpointsModalVisible}
        onCancel={() => setEndpointsModalVisible(false)}
        footer={null}
        width={800}
      >
        {endpointsLoading ? (
          <div style={{ textAlign: 'center', padding: 40 }}>
            <span>加载中...</span>
          </div>
        ) : currentEndpoints ? (
          <Descriptions column={1} bordered>
            <Descriptions.Item label="名称">{currentEndpoints.name}</Descriptions.Item>
            <Descriptions.Item label="命名空间">{currentEndpoints.namespace}</Descriptions.Item>
            <Descriptions.Item label="子网">
              {currentEndpoints.subsets && currentEndpoints.subsets.length > 0 ? (
                currentEndpoints.subsets.map((subset: any, idx: number) => (
                  <div key={idx} style={{ marginBottom: 16 }}>
                    <Text strong>地址:</Text>
                    {subset.addresses?.map((addr: any, addrIdx: number) => (
                      <div key={addrIdx} style={{ marginLeft: 16 }}>
                        {addr.ip} {addr.nodeName && `(节点: ${addr.nodeName})`}
                      </div>
                    ))}
                    <Text strong style={{ marginTop: 8, display: 'block' }}>端口:</Text>
                    {subset.ports?.map((port: any, portIdx: number) => (
                      <div key={portIdx} style={{ marginLeft: 16 }}>
                        {port.name && `${port.name}: `}{port.port}/{port.protocol}
                      </div>
                    ))}
                  </div>
                ))
              ) : (
                <Text type="secondary">无</Text>
              )}
            </Descriptions.Item>
          </Descriptions>
        ) : (
          <div style={{ textAlign: 'center', padding: 40 }}>
            <Text type="secondary">无Endpoints信息</Text>
          </div>
        )}
      </Modal>

      {/* 创建Service Modal */}
      <ServiceCreateModal
        visible={createModalVisible}
        clusterId={clusterId}
        onClose={() => setCreateModalVisible(false)}
        onSuccess={() => loadServices()}
      />

      {/* 编辑Modal */}
      <Modal
        title={`编辑 Service: ${editingService?.name}`}
        open={editModalVisible}
        onCancel={() => {
          setEditModalVisible(false);
          setEditYaml('');
          setEditingService(null);
          setEditMode('yaml');
          editForm.resetFields();
        }}
        onOk={handleSaveEdit}
        confirmLoading={saveLoading}
        width={1000}
        okText="保存"
        cancelText="取消"
      >
        <Tabs activeKey={editMode} onChange={(key) => setEditMode(key as 'form' | 'yaml')}>
          <Tabs.TabPane tab="表单编辑" key="form">
            <Form form={editForm} layout="vertical">
              <Form.Item label="名称" name="name" rules={[{ required: true, message: '请输入名称' }]}>
                <Input disabled placeholder="服务名称" />
              </Form.Item>
              
              <Form.Item label="命名空间" name="namespace" rules={[{ required: true, message: '请选择命名空间' }]}>
                <Select disabled placeholder="选择命名空间">
                  {namespaces.map((ns) => (
                    <Select.Option key={ns.name} value={ns.name}>
                      {ns.name}
                    </Select.Option>
                  ))}
                </Select>
              </Form.Item>
              
              <Form.Item label="类型" name="type" rules={[{ required: true }]}>
                <Select>
                  <Select.Option value="ClusterIP">ClusterIP</Select.Option>
                  <Select.Option value="NodePort">NodePort</Select.Option>
                  <Select.Option value="LoadBalancer">LoadBalancer</Select.Option>
                  <Select.Option value="ExternalName">ExternalName</Select.Option>
                </Select>
              </Form.Item>
              
              <Form.Item label="选择器">
                <Form.List name="selectors">
                  {(fields, { add, remove }) => (
                    <>
                      {fields.map((field) => (
                        <Space key={field.key} style={{ display: 'flex', marginBottom: 8 }}>
                          <Form.Item {...field} name={[field.name, 'key']} noStyle>
                            <Input placeholder="键" style={{ width: 150 }} />
                          </Form.Item>
                          <Form.Item {...field} name={[field.name, 'value']} noStyle>
                            <Input placeholder="值" style={{ width: 150 }} />
                          </Form.Item>
                          <MinusCircleOutlined onClick={() => remove(field.name)} />
                        </Space>
                      ))}
                      <Button type="dashed" onClick={() => add()} block icon={<PlusOutlined />}>
                        添加选择器
                      </Button>
                    </>
                  )}
                </Form.List>
              </Form.Item>
              
              <Form.Item label="端口">
                <Form.List name="ports">
                  {(fields, { add, remove }) => (
                    <>
                      {fields.map((field) => (
                        <Space key={field.key} style={{ display: 'flex', marginBottom: 8 }} align="baseline">
                          <Form.Item {...field} name={[field.name, 'name']} noStyle>
                            <Input placeholder="名称" style={{ width: 100 }} />
                          </Form.Item>
                          <Form.Item {...field} name={[field.name, 'protocol']} noStyle initialValue="TCP">
                            <Select style={{ width: 80 }}>
                              <Select.Option value="TCP">TCP</Select.Option>
                              <Select.Option value="UDP">UDP</Select.Option>
                            </Select>
                          </Form.Item>
                          <Form.Item {...field} name={[field.name, 'port']} noStyle>
                            <InputNumber placeholder="端口" min={1} max={65535} style={{ width: 100 }} />
                          </Form.Item>
                          <Form.Item {...field} name={[field.name, 'targetPort']} noStyle>
                            <InputNumber placeholder="目标端口" min={1} max={65535} style={{ width: 100 }} />
                          </Form.Item>
                          <MinusCircleOutlined onClick={() => remove(field.name)} />
                        </Space>
                      ))}
                      <Button type="dashed" onClick={() => add()} block icon={<PlusOutlined />}>
                        添加端口
                      </Button>
                    </>
                  )}
                </Form.List>
              </Form.Item>
              
              <Form.Item label="会话亲和性" name="sessionAffinity" initialValue="None">
                <Select>
                  <Select.Option value="None">None</Select.Option>
                  <Select.Option value="ClientIP">ClientIP</Select.Option>
                </Select>
              </Form.Item>
              
              <Form.Item label="标签">
                <Form.List name="labels">
                  {(fields, { add, remove }) => (
                    <>
                      {fields.map((field) => (
                        <Space key={field.key} style={{ display: 'flex', marginBottom: 8 }}>
                          <Form.Item {...field} name={[field.name, 'key']} noStyle>
                            <Input placeholder="键" style={{ width: 150 }} />
                          </Form.Item>
                          <Form.Item {...field} name={[field.name, 'value']} noStyle>
                            <Input placeholder="值" style={{ width: 150 }} />
                          </Form.Item>
                          <MinusCircleOutlined onClick={() => remove(field.name)} />
                        </Space>
                      ))}
                      <Button type="dashed" onClick={() => add()} block icon={<PlusOutlined />}>
                        添加标签
                      </Button>
                    </>
                  )}
                </Form.List>
              </Form.Item>
              
              <Form.Item label="注解">
                <Form.List name="annotations">
                  {(fields, { add, remove }) => (
                    <>
                      {fields.map((field) => (
                        <Space key={field.key} style={{ display: 'flex', marginBottom: 8 }}>
                          <Form.Item {...field} name={[field.name, 'key']} noStyle>
                            <Input placeholder="键" style={{ width: 150 }} />
                          </Form.Item>
                          <Form.Item {...field} name={[field.name, 'value']} noStyle>
                            <Input placeholder="值" style={{ width: 150 }} />
                          </Form.Item>
                          <MinusCircleOutlined onClick={() => remove(field.name)} />
                        </Space>
                      ))}
                      <Button type="dashed" onClick={() => add()} block icon={<PlusOutlined />}>
                        添加注解
                      </Button>
                    </>
                  )}
                </Form.List>
              </Form.Item>
            </Form>
          </Tabs.TabPane>
          
          <Tabs.TabPane tab="YAML编辑" key="yaml">
            <MonacoEditor
              height="600px"
              language="yaml"
              value={editYaml}
              onChange={(value) => setEditYaml(value || '')}
              options={{
                minimap: { enabled: false },
                fontSize: 14,
                wordWrap: 'on',
                scrollBeyondLastLine: false,
              }}
            />
          </Tabs.TabPane>
        </Tabs>
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
              checked={visibleColumns.includes('type')}
              onChange={(e) => {
                if (e.target.checked) {
                  setVisibleColumns([...visibleColumns, 'type']);
                } else {
                  setVisibleColumns(visibleColumns.filter(c => c !== 'type'));
                }
              }}
            >
              类型
            </Checkbox>
            <Checkbox
              checked={visibleColumns.includes('access')}
              onChange={(e) => {
                if (e.target.checked) {
                  setVisibleColumns([...visibleColumns, 'access']);
                } else {
                  setVisibleColumns(visibleColumns.filter(c => c !== 'access'));
                }
              }}
            >
              访问地址
            </Checkbox>
            <Checkbox
              checked={visibleColumns.includes('ports')}
              onChange={(e) => {
                if (e.target.checked) {
                  setVisibleColumns([...visibleColumns, 'ports']);
                } else {
                  setVisibleColumns(visibleColumns.filter(c => c !== 'ports'));
                }
              }}
            >
              端口
            </Checkbox>
            <Checkbox
              checked={visibleColumns.includes('selector')}
              onChange={(e) => {
                if (e.target.checked) {
                  setVisibleColumns([...visibleColumns, 'selector']);
                } else {
                  setVisibleColumns(visibleColumns.filter(c => c !== 'selector'));
                }
              }}
            >
              选择器
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

export default ServiceTab;
