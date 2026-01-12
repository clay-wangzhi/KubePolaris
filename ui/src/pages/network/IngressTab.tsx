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
  App,
  Tabs,
  Form,
  InputNumber,
  Checkbox,
  Drawer,
} from 'antd';
import {
  DeleteOutlined,
  ReloadOutlined,
  SearchOutlined,
  SafetyCertificateOutlined,
  EditOutlined,
  PlusOutlined,
  MinusCircleOutlined,
  SettingOutlined,
} from '@ant-design/icons';
import MonacoEditor from '@monaco-editor/react';
import * as YAML from 'yaml';
import { IngressService } from '../../services/ingressService';
import type { Ingress } from '../../types';
import type { ColumnsType, TablePaginationConfig } from 'antd/es/table';
import type { FilterValue, SorterResult } from 'antd/es/table/interface';
import IngressCreateModal from './IngressCreateModal';

const { Text, Link } = Typography;

interface IngressTabProps {
  clusterId: string;
  onCountChange?: (count: number) => void;
}

const IngressTab: React.FC<IngressTabProps> = ({ clusterId, onCountChange }) => {
  const navigate = useNavigate();
  const { message } = App.useApp();
  
  // 数据状态
  const [allIngresses, setAllIngresses] = useState<Ingress[]>([]); // 所有原始数据
  const [ingresses, setIngresses] = useState<Ingress[]>([]); // 当前页显示的数据
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  
  // 分页状态
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  
  // 选择行状态
  const [selectedRowKeys, setSelectedRowKeys] = useState<string[]>([]);
  
  // 多条件搜索状态
  interface SearchCondition {
    field: 'name' | 'namespace' | 'ingressClassName' | 'host';
    value: string;
  }
  const [searchConditions, setSearchConditions] = useState<SearchCondition[]>([]);
  const [currentSearchField, setCurrentSearchField] = useState<'name' | 'namespace' | 'ingressClassName' | 'host'>('name');
  const [currentSearchValue, setCurrentSearchValue] = useState('');

  // 列设置状态
  const [columnSettingsVisible, setColumnSettingsVisible] = useState(false);
  const [visibleColumns, setVisibleColumns] = useState<string[]>([
    'name', 'ingressClassName', 'loadBalancer', 'hosts', 'backends', 'createdAt'
  ]);
  
  // 排序状态
  const [sortField, setSortField] = useState<string>('');
  const [sortOrder, setSortOrder] = useState<'ascend' | 'descend' | null>(null);
  
  // YAML查看Modal
  const [yamlModalVisible, setYamlModalVisible] = useState(false);
  const [currentYaml, setCurrentYaml] = useState('');
  const [yamlLoading, setYamlLoading] = useState(false);

  // YAML编辑Modal
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editYaml, setEditYaml] = useState('');
  const [editingIngress, setEditingIngress] = useState<Ingress | null>(null);
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
      name: '路由名称',
      namespace: '命名空间',
      ingressClassName: 'IngressClass',
      host: 'Host',
    };
    return labels[field] || field;
  };

  // 客户端过滤Ingress列表
  const filterIngresses = useCallback((items: Ingress[]): Ingress[] => {
    if (searchConditions.length === 0) return items;

    return items.filter(ingress => {
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
        let ingressValue: any;
        
        if (field === 'host') {
          // host 需要特殊处理，搜索所有 hosts
          const hosts = IngressService.getHosts(ingress);
          const hostsStr = hosts.join(' ').toLowerCase();
          return values.some(searchValue => hostsStr.includes(searchValue));
        } else {
          ingressValue = ingress[field as keyof Ingress];
        }
        
        const itemStr = String(ingressValue || '').toLowerCase();
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
        const nsList = await IngressService.getIngressNamespaces(clusterId);
        setNamespaces(nsList);
      } catch (error) {
        console.error('加载命名空间失败:', error);
      } finally {
        setLoadingNamespaces(false);
      }
    };

    loadNamespaces();
  }, [clusterId]);

  // 获取Ingress列表（获取所有数据，不分页）
  const loadIngresses = useCallback(async () => {
    if (!clusterId) return;
    
    setLoading(true);
    try {
      const response = await IngressService.getIngresses(
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
        setAllIngresses(items);
      } else {
        message.error(response.message || '获取Ingress列表失败');
      }
    } catch (error) {
      console.error('获取Ingress列表失败:', error);
      message.error('获取Ingress列表失败');
    } finally {
      setLoading(false);
    }
  }, [clusterId, message]);

  // 当搜索条件改变时重置到第一页
  useEffect(() => {
    setCurrentPage(1);
  }, [searchConditions]);

  // 当allIngresses、搜索条件、分页参数、排序参数改变时，重新计算显示数据
  useEffect(() => {
    if (allIngresses.length === 0) {
      setIngresses([]);
      setTotal(0);
      onCountChange?.(0);
      return;
    }
    
    // 1. 应用客户端过滤
    let filteredItems = filterIngresses(allIngresses);
    
    // 2. 应用排序
    if (sortField && sortOrder) {
      filteredItems = [...filteredItems].sort((a, b) => {
        const aValue = a[sortField as keyof Ingress];
        const bValue = b[sortField as keyof Ingress];
        
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
    
    setIngresses(paginatedItems);
    setTotal(filteredItems.length);
    onCountChange?.(filteredItems.length);
  }, [allIngresses, filterIngresses, currentPage, pageSize, sortField, sortOrder, onCountChange]);

  // 初始加载数据
  useEffect(() => {
    loadIngresses();
  }, [loadIngresses]);

  // 查看YAML
  const handleViewYAML = async (ingress: Ingress) => {
    setYamlModalVisible(true);
    setYamlLoading(true);
    try {
      const response = await IngressService.getIngressYAML(
        clusterId,
        ingress.namespace,
        ingress.name
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

  // 删除Ingress
  const handleDelete = async (ingress: Ingress) => {
    try {
      const response = await IngressService.deleteIngress(
        clusterId,
        ingress.namespace,
        ingress.name
      );
      
      if (response.code === 200) {
        message.success('删除成功');
        loadIngresses();
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
      message.warning('请先选择要删除的Ingress');
      return;
    }

    Modal.confirm({
      title: '确认删除',
      content: `确定要删除选中的 ${selectedRowKeys.length} 个Ingress吗？`,
      okText: '确定',
      cancelText: '取消',
      onOk: async () => {
        try {
          const selectedIngresses = ingresses.filter(i => 
            selectedRowKeys.includes(`${i.namespace}/${i.name}`)
          );
          
          const deletePromises = selectedIngresses.map(ingress =>
            IngressService.deleteIngress(clusterId, ingress.namespace, ingress.name)
          );
          
          const results = await Promise.allSettled(deletePromises);
          const successCount = results.filter(r => r.status === 'fulfilled').length;
          const failCount = results.length - successCount;
          
          if (failCount === 0) {
            message.success(`成功删除 ${successCount} 个Ingress`);
          } else {
            message.warning(`删除完成：成功 ${successCount} 个，失败 ${failCount} 个`);
          }
          
          setSelectedRowKeys([]);
          loadIngresses();
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
      const filteredData = filterIngresses(allIngresses);
      
      if (filteredData.length === 0) {
        message.warning('没有数据可导出');
        return;
      }

      // 导出筛选后的所有数据（包含所有列）
      const dataToExport = filteredData.map(i => ({
        '路由名称': i.name,
        '命名空间': i.namespace,
        'IngressClass': IngressService.formatIngressClass(i.ingressClassName),
        '访问入口': IngressService.formatLoadBalancers(i).join('; '),
        'Hosts': IngressService.getHosts(i).join('; '),
        '转发策略': IngressService.formatBackends(i).join('; '),
        'TLS': IngressService.hasTLS(i) ? '是' : '否',
        '创建时间': i.createdAt ? new Date(i.createdAt).toLocaleString('zh-CN', {
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
      link.download = `ingress-list-${Date.now()}.csv`;
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

  // 编辑Ingress - 跳转到独立的编辑页面
  const handleEdit = (ingress: Ingress) => {
    navigate(`/clusters/${clusterId}/network/ingress/${ingress.namespace}/${ingress.name}/edit`);
  };

  // 保存编辑
  const handleSaveEdit = async () => {
    if (!editingIngress) return;

    setSaveLoading(true);
    try {
      if (editMode === 'yaml') {
        // YAML方式更新
        const response = await IngressService.updateIngress(
          clusterId,
          editingIngress.namespace,
          editingIngress.name,
          {
            namespace: editingIngress.namespace,
            yaml: editYaml,
          }
        );
        
        if (response.code === 200) {
          message.success('更新成功');
          setEditModalVisible(false);
          setEditYaml('');
          setEditingIngress(null);
          setEditMode('yaml');
          loadIngresses();
        } else {
          message.error(response.message || '更新失败');
        }
      } else {
        // 表单方式更新
        const values = await editForm.validateFields();
        
        // 构建Ingress YAML
        const ingressYaml: any = {
          apiVersion: 'networking.k8s.io/v1',
          kind: 'Ingress',
          metadata: {
            name: values.name,
            namespace: values.namespace,
            labels: {},
            annotations: {},
          },
          spec: {
            ingressClassName: values.ingressClass,
            rules: [],
            tls: [],
          },
        };

        // 添加labels
        if (values.labels && values.labels.length > 0) {
          values.labels.forEach((label: any) => {
            if (label && label.key) {
              ingressYaml.metadata.labels[label.key] = label.value || '';
            }
          });
        }

        // 添加annotations
        if (values.annotations && values.annotations.length > 0) {
          values.annotations.forEach((annotation: any) => {
            if (annotation && annotation.key) {
              ingressYaml.metadata.annotations[annotation.key] = annotation.value || '';
            }
          });
        }

        // 添加rules
        if (values.rules && values.rules.length > 0) {
          ingressYaml.spec.rules = values.rules.map((rule: any) => ({
            host: rule.host,
            http: {
              paths: rule.paths?.map((path: any) => ({
                path: path.path,
                pathType: path.pathType,
                backend: {
                  service: {
                    name: path.serviceName,
                    port: {
                      number: path.servicePort,
                    },
                  },
                },
              })) || [],
            },
          }));
        }

        // 添加TLS
        if (values.tls && values.tls.length > 0) {
          ingressYaml.spec.tls = values.tls.map((tls: any) => ({
            secretName: tls.secretName,
            hosts: tls.hosts,
          }));
        }

        const yamlString = YAML.stringify(ingressYaml);
        
        const response = await IngressService.updateIngress(
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
          setEditingIngress(null);
          setEditMode('yaml');
          editForm.resetFields();
          loadIngresses();
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
  const allColumns: ColumnsType<Ingress> = [
    {
      title: '路由名称',
      dataIndex: 'name',
      key: 'name',
      fixed: 'left' as const,
      width: 200,
      sorter: true,
      sortOrder: sortField === 'name' ? sortOrder : null,
      render: (name: string, record: Ingress) => (
        <div>
          <Space>
            <Link strong onClick={() => handleViewYAML(record)}>
              {name}
            </Link>
            {IngressService.hasTLS(record) && (
              <Tooltip title="已启用TLS">
                <SafetyCertificateOutlined style={{ color: '#52c41a' }} />
              </Tooltip>
            )}
          </Space>
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
      title: 'IngressClass',
      dataIndex: 'ingressClassName',
      key: 'ingressClassName',
      width: 150,
      render: (ingressClassName?: string) => (
        <Tag color={IngressService.getIngressClassColor(ingressClassName)}>
          {IngressService.formatIngressClass(ingressClassName)}
        </Tag>
      ),
    },
    {
      title: '访问入口',
      key: 'loadBalancer',
      width: 200,
      render: (_: any, record: Ingress) => {
        const lbs = IngressService.formatLoadBalancers(record);
        return (
          <div>
            {lbs.slice(0, 2).map((lb, idx) => (
              <div key={idx} style={{ fontSize: 12 }}>
                {lb}
              </div>
            ))}
            {lbs.length > 2 && (
              <Tooltip title={lbs.slice(2).join(', ')}>
                <Text type="secondary" style={{ fontSize: 12, cursor: 'pointer' }}>
                  +{lbs.length - 2} 更多
                </Text>
              </Tooltip>
            )}
          </div>
        );
      },
    },
    {
      title: 'Hosts',
      key: 'hosts',
      width: 200,
      render: (_: any, record: Ingress) => {
        const hosts = IngressService.getHosts(record);
        return (
          <div>
            {hosts.slice(0, 2).map((host, idx) => (
              <div key={idx} style={{ fontSize: 12 }}>
                {host}
              </div>
            ))}
            {hosts.length > 2 && (
              <Tooltip title={hosts.slice(2).join(', ')}>
                <Text type="secondary" style={{ fontSize: 12, cursor: 'pointer' }}>
                  +{hosts.length - 2} 更多
                </Text>
              </Tooltip>
            )}
          </div>
        );
      },
    },
    {
      title: '转发策略',
      key: 'backends',
      width: 300,
      render: (_: any, record: Ingress) => {
        const backends = IngressService.formatBackends(record);
        return (
          <div style={{ wordBreak: 'break-word', whiteSpace: 'normal' }}>
            {backends.map((backend, idx) => (
              <div key={idx} style={{ fontSize: 12, marginBottom: idx < backends.length - 1 ? 4 : 0 }}>
                {backend}
              </div>
            ))}
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
      width: 150,
      render: (_: any, record: Ingress) => (
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
          <Popconfirm
            title="确定要删除这个Ingress吗？"
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
    sorter: SorterResult<Ingress> | SorterResult<Ingress>[]
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
          创建Ingress
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
                style={{ width: 130 }}
              >
                <Select.Option value="name">路由名称</Select.Option>
                <Select.Option value="namespace">命名空间</Select.Option>
                <Select.Option value="ingressClassName">IngressClass</Select.Option>
                <Select.Option value="host">Host</Select.Option>
              </Select>
            }
          />
          <Button
            icon={<ReloadOutlined />}
            onClick={() => {
              loadIngresses();
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
        dataSource={ingresses}
        rowKey={(record) => `${record.namespace}/${record.name}`}
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
          showTotal: (total) => `共 ${total} 个路由`,
          onChange: (page, size) => {
            setCurrentPage(page);
            setPageSize(size || 20);
          },
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
            <span>加载中...</span>
          </div>
        ) : (
          <pre style={{ maxHeight: 600, overflow: 'auto', background: '#f5f5f5', padding: 16 }}>
            {currentYaml}
          </pre>
        )}
      </Modal>

      {/* 创建Ingress Modal */}
      <IngressCreateModal
        visible={createModalVisible}
        clusterId={clusterId}
        onClose={() => setCreateModalVisible(false)}
        onSuccess={() => loadIngresses()}
      />

      {/* 编辑Modal */}
      <Modal
        title={`编辑 Ingress: ${editingIngress?.name}`}
        open={editModalVisible}
        onCancel={() => {
          setEditModalVisible(false);
          setEditYaml('');
          setEditingIngress(null);
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
                <Input disabled placeholder="Ingress名称" />
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
              
              <Form.Item label="Ingress Class" name="ingressClass">
                <Input placeholder="例如: nginx" />
              </Form.Item>
              
              <Form.Item label="规则">
                <Form.List name="rules">
                  {(fields, { add, remove }) => (
                    <>
                      {fields.map((field) => (
                        <div key={field.key} style={{ marginBottom: 16, padding: 16, border: '1px solid #d9d9d9', borderRadius: 4 }}>
                          <Form.Item {...field} name={[field.name, 'host']} label="主机">
                            <Input placeholder="example.com" />
                          </Form.Item>
                          
                          <Form.Item label="路径">
                            <Form.List name={[field.name, 'paths']}>
                              {(pathFields, { add: addPath, remove: removePath }) => (
                                <>
                                  {pathFields.map((pathField) => (
                                    <Space key={pathField.key} style={{ display: 'flex', marginBottom: 8 }} align="baseline">
                                      <Form.Item {...pathField} name={[pathField.name, 'path']} noStyle>
                                        <Input placeholder="/" style={{ width: 100 }} />
                                      </Form.Item>
                                      <Form.Item {...pathField} name={[pathField.name, 'pathType']} noStyle initialValue="Prefix">
                                        <Select style={{ width: 120 }}>
                                          <Select.Option value="Prefix">Prefix</Select.Option>
                                          <Select.Option value="Exact">Exact</Select.Option>
                                        </Select>
                                      </Form.Item>
                                      <Form.Item {...pathField} name={[pathField.name, 'serviceName']} noStyle>
                                        <Input placeholder="服务名" style={{ width: 120 }} />
                                      </Form.Item>
                                      <Form.Item {...pathField} name={[pathField.name, 'servicePort']} noStyle>
                                        <InputNumber placeholder="端口" min={1} max={65535} style={{ width: 100 }} />
                                      </Form.Item>
                                      <MinusCircleOutlined onClick={() => removePath(pathField.name)} />
                                    </Space>
                                  ))}
                                  <Button type="dashed" onClick={() => addPath()} block icon={<PlusOutlined />}>
                                    添加路径
                                  </Button>
                                </>
                              )}
                            </Form.List>
                          </Form.Item>
                          
                          <Button type="link" danger onClick={() => remove(field.name)}>
                            删除此规则
                          </Button>
                        </div>
                      ))}
                      <Button type="dashed" onClick={() => add()} block icon={<PlusOutlined />}>
                        添加规则
                      </Button>
                    </>
                  )}
                </Form.List>
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
              checked={visibleColumns.includes('ingressClassName')}
              onChange={(e) => {
                if (e.target.checked) {
                  setVisibleColumns([...visibleColumns, 'ingressClassName']);
                } else {
                  setVisibleColumns(visibleColumns.filter(c => c !== 'ingressClassName'));
                }
              }}
            >
              IngressClass
            </Checkbox>
            <Checkbox
              checked={visibleColumns.includes('loadBalancer')}
              onChange={(e) => {
                if (e.target.checked) {
                  setVisibleColumns([...visibleColumns, 'loadBalancer']);
                } else {
                  setVisibleColumns(visibleColumns.filter(c => c !== 'loadBalancer'));
                }
              }}
            >
              访问入口
            </Checkbox>
            <Checkbox
              checked={visibleColumns.includes('hosts')}
              onChange={(e) => {
                if (e.target.checked) {
                  setVisibleColumns([...visibleColumns, 'hosts']);
                } else {
                  setVisibleColumns(visibleColumns.filter(c => c !== 'hosts'));
                }
              }}
            >
              Hosts
            </Checkbox>
            <Checkbox
              checked={visibleColumns.includes('backends')}
              onChange={(e) => {
                if (e.target.checked) {
                  setVisibleColumns([...visibleColumns, 'backends']);
                } else {
                  setVisibleColumns(visibleColumns.filter(c => c !== 'backends'));
                }
              }}
            >
              转发策略
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

export default IngressTab;
