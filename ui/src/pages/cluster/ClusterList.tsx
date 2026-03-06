import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Table,
  Button,
  Space,
  Tag,
  Tooltip,
  Input,
  Dropdown,
  App,
  Progress,
} from 'antd';
import {
  PlusOutlined,
  ReloadOutlined,
  BarChartOutlined,
  MoreOutlined,
  DatabaseOutlined,
  CheckCircleOutlined,
  ExclamationCircleOutlined,
  ClusterOutlined,
  CodeOutlined,
  DeleteOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import type { Cluster } from '../../types';
import { clusterService } from '../../services/clusterService';
import { message } from 'antd';

const { Search } = Input;

const ClusterList: React.FC = () => {
  const navigate = useNavigate();
  const { modal } = App.useApp();
  const { t } = useTranslation('cluster');
  const { t: tc } = useTranslation('common');
  const [loading, setLoading] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [clusters, setClusters] = useState<Cluster[]>([]);

  // 获取集群列表 - 使用useCallback优化
  const fetchClusters = useCallback(async () => {
    setLoading(true);
    try {
      const response = await clusterService.getClusters();
      setClusters(response.data.items || []);
    } catch (error) {
      message.error(t('list.fetchError'));
      console.error('Failed to fetch clusters:', error);
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    fetchClusters();
  }, [fetchClusters]);

  const getStatusTag = (status: string) => {
    const statusConfig = {
      healthy: { color: 'success', icon: <CheckCircleOutlined />, text: t('status.healthy') },
      unhealthy: { color: 'error', icon: <ExclamationCircleOutlined />, text: t('status.unhealthy') },
      unknown: { color: 'default', icon: <ExclamationCircleOutlined />, text: t('status.unknown') },
    };
    const config = statusConfig[status as keyof typeof statusConfig] || statusConfig.unknown;
    return (
      <Tag color={config.color} icon={config.icon}>
        {config.text}
      </Tag>
    );
  };

  const columns = useMemo<ColumnsType<Cluster>>(() => [
    {
      title: t('columns.name'),
      dataIndex: 'name',
      key: 'name',
      width: 200,
      fixed: 'left' as const,
      // 在集群名称列的 render 函数中
      render: (text, record) => (
        <div style={{ display: 'flex', alignItems: 'flex-start' }}>
          <ClusterOutlined style={{ marginRight: 8, color: '#1890ff', flexShrink: 0, marginTop: 2 }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ 
              fontWeight: 'bold',
              whiteSpace: 'normal',
              wordBreak: 'break-all',
              lineHeight: '1.4',
              color: '#1890ff',        // 添加链接颜色
              cursor: 'pointer',       // 添加手型光标
              textDecoration: 'none'   // 可选：去掉下划线
            }}
            onClick={() => navigate(`/clusters/${record.id}/overview`)}  // 添加点击事件
            // onMouseEnter={(e) => e.target.style.textDecoration = 'underline'}  // 悬停效果
            // onMouseLeave={(e) => e.target.style.textDecoration = 'none'}
            >
              {text}
            </div>
            <div style={{ 
              color: '#666', 
              fontSize: '12px',
              whiteSpace: 'normal',
              wordBreak: 'break-all',
              lineHeight: '1.2'
            }}>
              {record.apiServer}
            </div>
          </div>
        </div>
      ),
    },
    {
      title: t('columns.status'),
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (status) => getStatusTag(status),
      filters: [
        { text: t('status.healthy'), value: 'healthy' },
        { text: t('status.unhealthy'), value: 'unhealthy' },
        { text: t('status.unknown'), value: 'unknown' },
      ],
    },
    {
      title: t('columns.version'),
      dataIndex: 'version',
      key: 'version',
      width: 120,
      responsive: ['md'],
    },
    {
      title: t('columns.nodes'),
      key: 'nodeCount',
      width: 100,
      responsive: ['lg'],
      render: (_, record) => `${record.readyNodes}/${record.nodeCount}`,
      sorter: (a, b) => a.nodeCount - b.nodeCount,
    },
    {
      title: t('resources.cpu'),
      dataIndex: 'cpuUsage',
      key: 'cpuUsage',
      width: 150,
      responsive: ['lg'] as const,
      render: (usage) => (
        <Progress
          percent={Math.round(usage || 0)}
          size="small"
          status={usage > 80 ? 'exception' : usage > 60 ? 'active' : 'success'}
          format={() => `${(usage || 0).toFixed(1)}%`}
        />
      ),
      sorter: (a, b) => (a.cpuUsage || 0) - (b.cpuUsage || 0),
    },
    {
      title: t('resources.memory'),
      dataIndex: 'memoryUsage',
      key: 'memoryUsage',
      width: 150,
      responsive: ['xl'],
      render: (usage) => (
        <Progress
          percent={Math.round(usage || 0)}
          size="small"
          status={usage > 80 ? 'exception' : usage > 60 ? 'active' : 'success'}
          format={() => `${(usage || 0).toFixed(1)}%`}
        />
      ),
      sorter: (a, b) => (a.memoryUsage || 0) - (b.memoryUsage || 0),
    },
    {
      title: tc('table.updatedAt'),
      dataIndex: 'lastHeartbeat',
      key: 'lastHeartbeat',
      width: 150,
      responsive: ['xl'] as const,
      render: (time) => new Date(time).toLocaleString(),
    },
    {
      title: tc('table.actions'),
      key: 'action',
      width: 150,
      fixed: 'right' as const,
      render: (_, record) => (
        <Space size="middle">
          <Tooltip title={tc('menu.monitoring')}>
            <Button 
              type="text" 
              icon={<BarChartOutlined />} 
              onClick={() => navigate(`/clusters/${record.id}/overview?tab=monitoring`)}
            />
          </Tooltip>
          <Tooltip title={t('actions.terminal')}>
            <Button 
              type="text" 
              icon={<CodeOutlined />}
              onClick={() => openTerminal(record)}
            />
          </Tooltip>
          <Dropdown
            menu={{
              items: [
                {
                  key: 'delete',
                  label: t('actions.delete'),
                  icon: <DeleteOutlined />,
                  danger: true,
                  onClick: () => {
                    handleDelete(record);
                  },
                },
              ],
            }}
            trigger={['click']}
          >
            <Button type="text" icon={<MoreOutlined />} title={tc('actions.more')} />
          </Dropdown>
        </Space>
      ),
    },
  ], [t, tc, navigate, modal]);

  // 打开终端
  const openTerminal = (cluster: Cluster) => {
    if (cluster.id) {
      window.open(`/clusters/${cluster.id}/terminal`);
    } else {
      message.error(tc('messages.error'));
    }
  };


  // 刷新集群列表
  const handleRefresh = () => {
    setLoading(true);
    fetchClusters();
  };

  // 删除集群
  const handleDelete = (cluster: Cluster) => {
    if (!cluster.id) {
      message.error(tc('messages.error'));
      return;
    }

    modal.confirm({
      title: tc('messages.confirmDelete'),
      content: t('actions.confirmDelete', { name: cluster.name }),
      okText: tc('actions.confirm'),
      cancelText: tc('actions.cancel'),
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          await clusterService.deleteCluster(cluster.id!.toString());
          message.success(tc('messages.deleteSuccess'));
          // 刷新列表
          fetchClusters();
        } catch (error: unknown) {
          const errorMessage = (error as { response?: { data?: { message?: string } } })?.response?.data?.message || tc('messages.deleteError');
          message.error(errorMessage);
          console.error('Failed to delete cluster:', error);
        }
      },
    });
  };

  const filteredClusters = clusters.filter((cluster) => {
    const matchesSearch = cluster.name.toLowerCase().includes(searchText.toLowerCase()) ||
                         cluster.apiServer.toLowerCase().includes(searchText.toLowerCase());
    return matchesSearch;
  });

  // 统计数据
  const unhealthyClusters = clusters.filter(c => c.status === 'unhealthy').length;

  return (
    <div>
      {/* 页面头部 */}
      <div className="page-header">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h1>{t('title')}</h1>
            {/* // Todo 改为异常节点 */}
            <div style={{ display: 'flex', gap: '36px' }}>
              <span>{t('status.unhealthy')}/{tc('table.status')}: <b>{unhealthyClusters}</b>/<b>{clusters.length}</b></span>
            </div>
          </div>
          <Space>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => navigate('/clusters/import')}>
              {t('list.import')}
            </Button>
          </Space>
        </div>
      </div>

      {/* 集群列表 */}
      <div className="table-container">
        <div className="toolbar">
          <div className="toolbar-left">
            <h3>{t('list.title')}</h3>
          </div>
          <div className="toolbar-right">
            <Search
              placeholder={t('list.search')}
              style={{ width: 240 }}
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              allowClear
            />
            <Button icon={<ReloadOutlined />} onClick={handleRefresh} loading={loading}>
              {tc('actions.refresh')}
            </Button>
          </div>
        </div>
        
        <Table
          columns={columns}
          dataSource={filteredClusters}
          rowKey="id"
          loading={loading}
          scroll={{ x: 1200 }}
          size="middle"
          pagination={{
            total: filteredClusters.length,
            pageSize: 10,
            showSizeChanger: true,
            showQuickJumper: true,
            showTotal: (total) => t('list.totalClusters', { total }),
            className: 'tencent-pagination'
          }}
          locale={{
            emptyText: (
              <div style={{ padding: '48px 0', textAlign: 'center' }}>
                <DatabaseOutlined style={{ fontSize: 48, color: '#ccc', marginBottom: 16 }} />
                <div style={{ fontSize: 16, color: '#666', marginBottom: 8 }}>{t('list.noCluster')}</div>
                <div style={{ fontSize: 14, color: '#999', marginBottom: 16 }}>
                  {searchText ? tc('messages.noData') : t('list.import')}
                </div>
                {!searchText && (
                  <Button type="primary" icon={<PlusOutlined />} onClick={() => navigate('/clusters/import')}>
                    {t('list.import')}
                  </Button>
                )}
              </div>
            )
          }}
        />
      </div>
    </div>
  );
};

export default ClusterList;