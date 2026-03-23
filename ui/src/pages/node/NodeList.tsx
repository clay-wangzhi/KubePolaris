import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Card,
  Table,
  Button,
  Space,
  Tag,
  Progress,
  Tooltip,
  Input,
  Select,
  Row,
  Col,
  Statistic,
  Badge,
  Modal,
  Dropdown,
  message,
  Checkbox,
  Drawer,
  App,
} from 'antd';
import {
  ReloadOutlined,
  EyeOutlined,
  MoreOutlined,
  DatabaseOutlined,
  CheckCircleOutlined,
  ExclamationCircleOutlined,
  CloseCircleOutlined,
  DesktopOutlined,
  CodeOutlined,
  SearchOutlined,
  SettingOutlined,
} from '@ant-design/icons';
import type { ColumnsType, TablePaginationConfig } from 'antd/es/table';
import type { FilterValue, SorterResult } from 'antd/es/table/interface';
import type { Node, NodeTaint } from '../../types';
import { nodeService, type NodeListParams, type NodeOverview } from '../../services/nodeService';

const { Option } = Select;

// 搜索条件类型定义
interface SearchCondition {
  field: 'name' | 'status' | 'version' | 'roles';
  value: string;
}

const NodeList: React.FC = () => {
  const { clusterId: routeClusterId } = useParams<{ clusterId: string }>();
  const navigate = useNavigate();
  const { message: appMessage } = App.useApp();
  const { t } = useTranslation('node');
  const { t: tc } = useTranslation('common');
  
  const [loading, setLoading] = useState(false);
  const [nodes, setNodes] = useState<Node[]>([]);
  const [allNodes, setAllNodes] = useState<Node[]>([]); // 所有原始数据
  const [overview, setOverview] = useState<NodeOverview | null>(null);
  const [selectedClusterId, setSelectedClusterId] = useState<string>(routeClusterId || '1');
  // 分页状态
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [total, setTotal] = useState(0);
  const [selectedNodes, setSelectedNodes] = useState<React.Key[]>([]);

  // 多条件搜索状态
  const [searchConditions, setSearchConditions] = useState<SearchCondition[]>([]);
  const [currentSearchField, setCurrentSearchField] = useState<'name' | 'status' | 'version' | 'roles'>('name');
  const [currentSearchValue, setCurrentSearchValue] = useState('');

  // 列设置状态
  const [columnSettingsVisible, setColumnSettingsVisible] = useState(false);
  const [visibleColumns, setVisibleColumns] = useState<string[]>([
    'status', 'name', 'roles', 'version', 'readyStatus', 'cpuUsage', 'memoryUsage', 'podCount', 'taints', 'createdAt'
  ]);
  
  // 排序状态
  const [sortField, setSortField] = useState<string>('');
  const [sortOrder, setSortOrder] = useState<'ascend' | 'descend' | null>(null);


  // 获取节点列表 - 使用useCallback优化
  const fetchNodes = useCallback(async (params: NodeListParams = { clusterId: selectedClusterId }) => {
    if (!params.clusterId) {
      return;
    }
    
    setLoading(true);
    try {
      const response = await nodeService.getNodes({
        ...params,
        page: 1,
        pageSize: 10000, // 获取所有数据
      });
      
      // 保存原始数据
      setAllNodes(response.items || []);
    } catch (error) {
      console.error('Failed to fetch nodes:', error);
      message.error(t('list.fetchError'));
    } finally {
      setLoading(false);
    }
  }, [selectedClusterId]);

  // 获取节点概览 - 使用useCallback优化
  const fetchNodeOverview = useCallback(async () => {
    if (!selectedClusterId) {
      return;
    }
    
    try {
      const response = await nodeService.getNodeOverview(selectedClusterId);
      setOverview(response);
    } catch (error) {
      console.error('Failed to fetch node overview:', error);
    }
  }, [selectedClusterId]);

  // 集群切换 - 监听路由参数变化
  useEffect(() => {
    if (routeClusterId && routeClusterId !== selectedClusterId) {
      setSelectedClusterId(routeClusterId);
      setCurrentPage(1);
      // 重置搜索条件
      setSearchConditions([]);
      setCurrentSearchValue('');
    }
  }, [routeClusterId, selectedClusterId]);


  // 节点选择变化
  const handleSelectionChange = (selectedRowKeys: React.Key[]) => {
    setSelectedNodes(selectedRowKeys);
  };

  // 批量操作
  const handleBatchCordon = () => {
    message.info(`${t('actions.cordon')} ${selectedNodes.length} nodes`);
    // TODO: 实现批量封锁逻辑
  };

  const handleBatchUncordon = () => {
    message.info(`${t('actions.uncordon')} ${selectedNodes.length} nodes`);
    // TODO: 实现批量解封逻辑
  };

  const handleBatchLabel = () => {
    message.info(`Add labels to ${selectedNodes.length} nodes`);
    // TODO: 实现批量添加标签逻辑
  };

  // 单个节点操作
  const handleViewDetail = (name: string) => {
    navigate(`/clusters/${selectedClusterId}/nodes/${name}`);
  };

  const handleNodeTerminal = (name: string) => {
    // 导航到节点详情页并自动打开SSH终端标签页
    navigate(`/clusters/${selectedClusterId}/nodes/${name}?tab=terminal`);
  };

  const handleCordon = async (name: string) => {
    try {
      await nodeService.cordonNode(selectedClusterId, name);
      message.success(t('messages.cordonSuccess'));
      handleRefresh();
    } catch (error) {
      console.error('Failed to cordon node:', error);
      message.error(t('messages.cordonError'));
    }
  };

  const handleUncordon = async (name: string) => {
    try {
      await nodeService.uncordonNode(selectedClusterId, name);
      message.success(t('messages.uncordonSuccess'));
      handleRefresh();
    } catch (error) {
      console.error('Failed to uncordon node:', error);
      message.error(t('messages.uncordonError'));
    }
  };

  const handleDrain = async (name: string) => {
    Modal.confirm({
      title: t('actions.drain'),
      content: t('actions.confirmDrain', { name }),
      okText: tc('actions.confirm'),
      cancelText: tc('actions.cancel'),
      okType: 'danger',
      onOk: async () => {
        try {
          await nodeService.drainNode(selectedClusterId, name, {
            ignoreDaemonSets: true,
            deleteLocalData: true,
            gracePeriodSeconds: 30,
          });
          message.success(t('messages.drainSuccess'));
          handleRefresh();
        } catch (error) {
          console.error('Failed to drain node:', error);
          message.error(t('messages.drainError'));
        }
      },
    });
  };


  // 获取节点状态标签
  const getStatusTag = (status: string) => {
    switch (status) {
      case 'Ready':
        return <Tag icon={<CheckCircleOutlined />} color="success">{t('status.ready')}</Tag>;
      case 'NotReady':
        return <Tag icon={<CloseCircleOutlined />} color="error">{t('status.notReady')}</Tag>;
      default:
        return <Tag icon={<ExclamationCircleOutlined />} color="default">{t('status.unknown')}</Tag>;
    }
  };

  // 获取节点状态图标
  const getStatusIcon = (node: Node) => {
    if (node.status === 'Ready') {
      // 检查是否有污点
      const hasNoScheduleTaint = node.taints?.some(
        taint => taint.effect === 'NoSchedule' || taint.effect === 'NoExecute'
      );
      
      if (hasNoScheduleTaint) {
        return <Badge status="warning" />;
      }
      
      // 检查资源使用率
      if (node.cpuUsage > 80 || node.memoryUsage > 80) {
        return <Badge status="warning" />;
      }
      
      return <Badge status="success" />;
    } else if (node.status === 'NotReady') {
      return <Badge status="error" />;
    } else {
      return <Badge status="default" />;
    }
  };

  // 获取角色标签
  const getRoleTags = (roles: string[]) => {
    return (
      <Space>
        {roles.map(role => {
          const isMaster = role.toLowerCase().includes('master') || role.toLowerCase().includes('control-plane');
          return (
            <Tag key={role} color={isMaster ? 'gold' : 'blue'}>
              {isMaster ? 'M' : 'W'}
            </Tag>
          );
        })}
      </Space>
    );
  };

  // 获取污点提示
  const getTaintTooltip = (taints: NodeTaint[]) => {
    if (!taints || taints.length === 0) {
      return t('detail.taints') + ': 0';
    }
    
    return (
      <div>
        <div>{t('detail.taints')}:</div>
        {taints.map((taint, index) => (
          <div key={index}>
            {taint.key}{taint.value ? `=${taint.value}` : ''}:{taint.effect}
          </div>
        ))}
      </div>
    );
  };

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
      name: t('columns.name'),
      status: t('columns.status'),
      version: t('columns.version'),
      roles: t('columns.roles'),
    };
    return labels[field] || field;
  };

  // 客户端过滤节点列表
  const filterNodes = useCallback((items: Node[]): Node[] => {
    if (searchConditions.length === 0) return items;

    return items.filter(node => {
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
        if (field === 'roles') {
          // 角色字段特殊处理
          return values.some(searchValue =>
            node.roles.some(role =>
              role.toLowerCase().includes(searchValue)
            )
          );
        }
        
        const nodeValue = node[field as keyof Node];
        const itemStr = String(nodeValue || '').toLowerCase();
        return values.some(searchValue => itemStr.includes(searchValue));
      });
    });
  }, [searchConditions]);

  // 导出功能
  const handleExport = () => {
    try {
      // 获取所有筛选后的数据
      const filteredData = filterNodes(allNodes);
      
      if (filteredData.length === 0) {
        appMessage.warning(tc('messages.noData'));
        return;
      }

      // 导出筛选后的所有数据
      const dataToExport = filteredData.map(node => ({
        [t('columns.name')]: node.name,
        [t('columns.status')]: node.status,
        [t('columns.roles')]: node.roles?.join(', ') || '-',
        [t('columns.version')]: node.version || '-',
        [t('columns.cpu')]: `${node.cpuUsage || 0}%`,
        [t('columns.memory')]: `${node.memoryUsage || 0}%`,
        [t('columns.pods')]: `${node.podCount || 0}/${node.maxPods || 0}`,
        [t('detail.taints')]: node.taints?.length || 0,
        [tc('table.createdAt')]: node.creationTimestamp ? new Date(node.creationTimestamp).toLocaleString() : '-',
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
      link.download = `node-list-${Date.now()}.csv`;
      link.click();
      appMessage.success(tc('messages.exportSuccess'));
    } catch (error) {
      console.error('Failed to export:', error);
      appMessage.error(tc('messages.exportError'));
    }
  };

  // 列设置保存
  const handleColumnSettingsSave = () => {
    setColumnSettingsVisible(false);
    appMessage.success(tc('messages.saveSuccess'));
  };

  // 当搜索条件改变时重置到第一页
  useEffect(() => {
    setCurrentPage(1);
  }, [searchConditions]);

  // 当allNodes、搜索条件、分页参数、排序参数改变时，重新计算显示数据
  useEffect(() => {
    if (allNodes.length === 0) {
      setNodes([]);
      setTotal(0);
      return;
    }
    
    // 1. 应用客户端过滤
    let filteredItems = filterNodes(allNodes);
    
    // 2. 应用排序
    if (sortField && sortOrder) {
      filteredItems = [...filteredItems].sort((a, b) => {
        const aValue = a[sortField as keyof Node];
        const bValue = b[sortField as keyof Node];
        
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
    
    setNodes(paginatedItems);
    setTotal(filteredItems.length);
  }, [allNodes, filterNodes, currentPage, pageSize, sortField, sortOrder]);

  const allColumns = useMemo<ColumnsType<Node>>(() => [
    {
      title: t('columns.status'),
      key: 'status',
      width: 60,
      render: (_, record) => getStatusIcon(record),
    },
    {
      title: t('columns.name'),
      dataIndex: 'name',
      key: 'name',
      width: 180,
      fixed: 'left' as const,
      sorter: true,
      sortOrder: sortField === 'name' ? sortOrder : null,
      render: (text) => (
        <Space style={{ width: '100%' }}>
          <DesktopOutlined style={{ color: '#1890ff', flexShrink: 0 }} />
          <Button 
            type="link"
            onClick={() => handleViewDetail(text)}
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
        </Space>
      ),
    },
    {
      title: t('columns.roles'),
      key: 'roles',
      width: 80,
      render: (_, record) => getRoleTags(record.roles),
    },
    {
      title: t('columns.version'),
      dataIndex: 'version',
      key: 'version',
      width: 100,
      sorter: true,
      sortOrder: sortField === 'version' ? sortOrder : null,
    },
    {
      title: t('columns.readyStatus'),
      key: 'readyStatus',
      width: 80,
      render: (_, record) => getStatusTag(record.status),
    },
    {
      title: t('columns.cpu'),
      key: 'cpuUsage',
      dataIndex: 'cpuUsage',
      width: 120,
      sorter: true,
      sortOrder: sortField === 'cpuUsage' ? sortOrder : null,
      render: (_, record) => (
        <Progress
          percent={Math.round(record.cpuUsage || 0)}
          size="small"
          status={
            record.cpuUsage > 80 
              ? 'exception' 
              : record.cpuUsage > 60 
                ? 'active' 
                : 'success'
          }
          format={() => `${(record.cpuUsage || 0).toFixed(1)}%`}
        />
      ),
    },
    {
      title: t('columns.memory'),
      key: 'memoryUsage',
      dataIndex: 'memoryUsage',
      width: 120,
      sorter: true,
      sortOrder: sortField === 'memoryUsage' ? sortOrder : null,
      render: (_, record) => (
        <Progress
          percent={Math.round(record.memoryUsage || 0)}
          size="small"
          status={
            record.memoryUsage > 80 
              ? 'exception' 
              : record.memoryUsage > 60 
                ? 'active' 
                : 'success'
          }
          format={() => `${(record.memoryUsage || 0).toFixed(1)}%`}
        />
      ),
    },
    {
      title: t('columns.pods'),
      key: 'podCount',
      width: 100,
      sorter: true,
      sortOrder: sortField === 'podCount' ? sortOrder : null,
      render: (_, record) => `${record.podCount}/${record.maxPods}`,
    },
    {
      title: t('columns.taints'),
      key: 'taints',
      width: 80,
      render: (_, record) => (
        <Tooltip title={getTaintTooltip(record.taints)}>
          <Tag color={record.taints?.length ? 'orange' : 'default'}>
            {record.taints?.length || 0}
          </Tag>
        </Tooltip>
      ),
    },
    {
      title: tc('table.createdAt'),
      dataIndex: 'createdAt',
      key: 'createdAt',
      width: 180,
      sorter: true,
      sortOrder: sortField === 'createdAt' ? sortOrder : null,
      render: (text) => {
        if (!text) return '-';
        const date = new Date(text);
        return <span>{date.toLocaleString()}</span>;
      },
    },
    {
      title: tc('table.actions'),
      key: 'action',
      width: 150,
      fixed: 'right' as const,
      render: (_, record) => (
        <Space>
          <Button
            type="text"
            icon={<EyeOutlined />}
            onClick={() => handleViewDetail(record.name)}
            title={tc('actions.view')}
          />
          <Button
            type="text"
            icon={<CodeOutlined />}
            onClick={() => handleNodeTerminal(record.name)}
            title={t('actions.terminal')}
          />
          <Dropdown
            menu={{
              items: [
                ...(record.taints?.some(t => t.effect === 'NoSchedule') ? [{
                  key: 'uncordon',
                  label: t('actions.uncordon'),
                  onClick: () => handleUncordon(record.name)
                }] : [{
                  key: 'cordon',
                  label: t('actions.cordon'),
                  onClick: () => handleCordon(record.name)
                }]),
                {
                  key: 'drain',
                  label: t('actions.drain'),
                  onClick: () => handleDrain(record.name)
                }
              ]
            }}
          >
            <Button type="text" icon={<MoreOutlined />} />
          </Dropdown>
        </Space>
      ),
    },
  ], [t, tc, sortField, sortOrder, selectedClusterId, navigate]);

  const columns = useMemo(() => allColumns.filter(col => {
    if (col.key === 'action') return true;
    return visibleColumns.includes(col.key as string);
  }), [allColumns, visibleColumns]);

  const nodeRowSelection = useMemo(() => ({
    type: 'checkbox' as const,
    selectedRowKeys: selectedNodes,
    onChange: handleSelectionChange,
  }), [selectedNodes, handleSelectionChange]);

  // 表格排序处理
  const handleTableChange = (
    _pagination: TablePaginationConfig,
    _filters: Record<string, FilterValue | null>,
    sorter: SorterResult<Node> | SorterResult<Node>[]
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

  // 刷新节点列表
  const handleRefresh = () => {
    setLoading(true);
    fetchNodes({ clusterId: selectedClusterId });
    if (selectedClusterId) {
      fetchNodeOverview();
    }
  };

  // 初始化加载
  useEffect(() => {
    if (selectedClusterId) {
      fetchNodes({ clusterId: selectedClusterId });
      fetchNodeOverview();
    }
  }, [selectedClusterId, fetchNodes, fetchNodeOverview]);

  // 统计数据
  const totalNodes = overview?.totalNodes || 0;
  const readyNodes = overview?.readyNodes || 0;
  const notReadyNodes = overview?.notReadyNodes || 0;
  const maintenanceNodes = overview?.maintenanceNodes || 0;

  return (
    <App>
      <div style={{ padding: '24px' }}>
        {/* 统计卡片 */}
        <Row gutter={[20, 20]} style={{ marginBottom: 24 }}>
          <Col xs={24} sm={12} lg={6}>
            <Card className="stats-card" style={{ background: 'linear-gradient(135deg, #00d4aa 0%, #00b894 100%)' }}>
              <Statistic
                title={t('overview.total')}
                value={totalNodes}
                prefix={<DesktopOutlined />}
              />
            </Card>
          </Col>
          <Col xs={24} sm={12} lg={6}>
            <Card className="stats-card" style={{ background: 'linear-gradient(135deg, #006eff 0%, #1a7aff 100%)' }}>
              <Statistic
                title={t('overview.ready')}
                value={readyNodes}
                prefix={<CheckCircleOutlined />}
              />
            </Card>
          </Col>
          <Col xs={24} sm={12} lg={6}>
            <Card className="stats-card" style={{ background: 'linear-gradient(135deg, #ff9f43 0%, #ff7675 100%)' }}>
              <Statistic
                title={t('overview.notReady')}
                value={notReadyNodes}
                prefix={<ExclamationCircleOutlined />}
              />
            </Card>
          </Col>
          <Col xs={24} sm={12} lg={6}>
            <Card className="stats-card" style={{ background: 'linear-gradient(135deg, #a55eea 0%, #8e44ad 100%)' }}>
              <Statistic
                title={t('overview.maintenance')}
                value={maintenanceNodes}
                prefix={<Badge status="processing" />}
              />
            </Card>
          </Col>
        </Row>

        {/* 节点列表卡片 */}
        <Card bordered={false}>
          {/* 操作按钮栏 */}
          <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <Space>
              <Button
                disabled={selectedNodes.length === 0}
                onClick={handleBatchCordon}
              >
                {t('actions.batchCordon')}
              </Button>
              <Button
                disabled={selectedNodes.length === 0}
                onClick={handleBatchUncordon}
              >
                {t('actions.batchUncordon')}
              </Button>
              <Button
                disabled={selectedNodes.length === 0}
                onClick={handleBatchLabel}
              >
                {t('actions.batchLabel')}
              </Button>
              <Button onClick={handleExport}>
                {tc('actions.export')}
              </Button>
            </Space>
          </div>

          {/* 多条件搜索栏 */}
          <div style={{ marginBottom: 16 }}>
            {/* 搜索输入框 */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: 8 }}>
              <Input
                prefix={<SearchOutlined />}
                placeholder={t('list.searchPlaceholder')}
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
                    <Option value="name">{t('columns.name')}</Option>
                    <Option value="status">{t('columns.status')}</Option>
                    <Option value="version">{t('columns.version')}</Option>
                    <Option value="roles">{t('columns.roles')}</Option>
                  </Select>
                }
              />
              <Button
                icon={<ReloadOutlined />}
                onClick={() => {
                  handleRefresh();
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
                    {tc('actions.clearAll')}
                  </Button>
                </Space>
              </div>
            )}
          </div>

          <Table
            rowSelection={nodeRowSelection}
            columns={columns}
            dataSource={nodes}
            rowKey="id"
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
              showTotal: (total) => `${tc('table.total')} ${total} ${t('list.nodes')}`,
              onChange: (page, size) => {
                setCurrentPage(page);
                setPageSize(size || 20);
              },
              pageSizeOptions: ['10', '20', '50', '100'],
            }}
            locale={{
              emptyText: (
                <div style={{ padding: '48px 0', textAlign: 'center' }}>
                  <DatabaseOutlined style={{ fontSize: 48, color: '#ccc', marginBottom: 16 }} />
                  <div style={{ fontSize: 16, color: '#666', marginBottom: 8 }}>{t('list.noData')}</div>
                  <div style={{ fontSize: 14, color: '#999', marginBottom: 16 }}>
                    {searchConditions.length > 0 ? tc('messages.noData') : t('list.selectCluster')}
                  </div>
                </div>
              )
            }}
          />
        </Card>

        {/* 批量操作栏 */}
        {selectedNodes.length > 0 && (
          <Card
            style={{
              position: 'fixed',
              bottom: 20,
              left: 20,
              right: 20,
              zIndex: 1000,
              boxShadow: '0 -2px 8px rgba(0, 0, 0, 0.15)',
            }}
          >
            <Row justify="space-between" align="middle">
              <Col>
                {tc('table.selected')} {selectedNodes.length} {t('list.nodes')}
              </Col>
              <Col>
                <Space>
                  <Button onClick={handleBatchCordon}>{t('actions.batchCordon')}</Button>
                  <Button onClick={handleBatchUncordon}>{t('actions.batchUncordon')}</Button>
                  <Button onClick={handleBatchLabel}>{t('actions.batchLabel')}</Button>
                </Space>
              </Col>
            </Row>
          </Card>
        )}

        {/* 列设置抽屉 */}
        <Drawer
          title={t('list.columnSettings')}
          placement="right"
          width={400}
          open={columnSettingsVisible}
          onClose={() => setColumnSettingsVisible(false)}
          footer={
            <div style={{ textAlign: 'right' }}>
              <Space>
                <Button onClick={() => setColumnSettingsVisible(false)}>{tc('actions.cancel')}</Button>
                <Button type="primary" onClick={handleColumnSettingsSave}>{tc('actions.confirm')}</Button>
              </Space>
            </div>
          }
        >
          <div style={{ marginBottom: 16 }}>
            <p style={{ marginBottom: 8, color: '#666' }}>{t('list.selectColumns')}:</p>
            <Space direction="vertical" style={{ width: '100%' }}>
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
                {t('columns.status')}
              </Checkbox>
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
                {t('columns.name')}
              </Checkbox>
              <Checkbox
                checked={visibleColumns.includes('roles')}
                onChange={(e) => {
                  if (e.target.checked) {
                    setVisibleColumns([...visibleColumns, 'roles']);
                  } else {
                    setVisibleColumns(visibleColumns.filter(c => c !== 'roles'));
                  }
                }}
              >
                {t('columns.roles')}
              </Checkbox>
              <Checkbox
                checked={visibleColumns.includes('version')}
                onChange={(e) => {
                  if (e.target.checked) {
                    setVisibleColumns([...visibleColumns, 'version']);
                  } else {
                    setVisibleColumns(visibleColumns.filter(c => c !== 'version'));
                  }
                }}
              >
                {t('columns.version')}
              </Checkbox>
              <Checkbox
                checked={visibleColumns.includes('readyStatus')}
                onChange={(e) => {
                  if (e.target.checked) {
                    setVisibleColumns([...visibleColumns, 'readyStatus']);
                  } else {
                    setVisibleColumns(visibleColumns.filter(c => c !== 'readyStatus'));
                  }
                }}
              >
                {t('columns.readyStatus')}
              </Checkbox>
              <Checkbox
                checked={visibleColumns.includes('cpuUsage')}
                onChange={(e) => {
                  if (e.target.checked) {
                    setVisibleColumns([...visibleColumns, 'cpuUsage']);
                  } else {
                    setVisibleColumns(visibleColumns.filter(c => c !== 'cpuUsage'));
                  }
                }}
              >
                {t('columns.cpu')}
              </Checkbox>
              <Checkbox
                checked={visibleColumns.includes('memoryUsage')}
                onChange={(e) => {
                  if (e.target.checked) {
                    setVisibleColumns([...visibleColumns, 'memoryUsage']);
                  } else {
                    setVisibleColumns(visibleColumns.filter(c => c !== 'memoryUsage'));
                  }
                }}
              >
                {t('columns.memory')}
              </Checkbox>
              <Checkbox
                checked={visibleColumns.includes('podCount')}
                onChange={(e) => {
                  if (e.target.checked) {
                    setVisibleColumns([...visibleColumns, 'podCount']);
                  } else {
                    setVisibleColumns(visibleColumns.filter(c => c !== 'podCount'));
                  }
                }}
              >
                {t('columns.pods')}
              </Checkbox>
              <Checkbox
                checked={visibleColumns.includes('taints')}
                onChange={(e) => {
                  if (e.target.checked) {
                    setVisibleColumns([...visibleColumns, 'taints']);
                  } else {
                    setVisibleColumns(visibleColumns.filter(c => c !== 'taints'));
                  }
                }}
              >
                {t('columns.taints')}
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
                {tc('table.createdAt')}
              </Checkbox>
            </Space>
          </div>
        </Drawer>
      </div>
    </App>
  );
};

export default NodeList;
