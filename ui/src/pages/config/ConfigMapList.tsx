import React, { useEffect, useState } from 'react';
import {
  Table,
  Button,
  Input,
  Space,
  Tag,
  message,
  Modal,
  Select,
  Tooltip,
  Popconfirm,
} from 'antd';
import {
  PlusOutlined,
  SearchOutlined,
  ReloadOutlined,
  DeleteOutlined,
  EditOutlined,
  EyeOutlined,
} from '@ant-design/icons';
import { useNavigate, useParams } from 'react-router-dom';
import { configMapService, type ConfigMapListItem, type NamespaceItem } from '../../services/configService';
import type { ColumnsType } from 'antd/es/table';

const { Search } = Input;
const { Option } = Select;

const ConfigMapList: React.FC = () => {
  const navigate = useNavigate();
  const { clusterId } = useParams<{ clusterId: string }>();
  const [loading, setLoading] = useState(false);
  const [configMaps, setConfigMaps] = useState<ConfigMapListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [searchName, setSearchName] = useState('');
  const [selectedNamespace, setSelectedNamespace] = useState<string>('_all_');
  const [namespaces, setNamespaces] = useState<NamespaceItem[]>([]);
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);

  // 加载命名空间列表
  const loadNamespaces = React.useCallback(async () => {
    if (!clusterId) return;
    try {
      const data = await configMapService.getConfigMapNamespaces(Number(clusterId));
      setNamespaces(data);
    } catch (error) {
      console.error('加载命名空间失败:', error);
    }
  }, [clusterId]);

  // 加载ConfigMap列表
  const loadConfigMaps = React.useCallback(async () => {
    if (!clusterId) return;
    setLoading(true);
    try {
      const params: {
        page: number;
        pageSize: number;
        namespace?: string;
        name?: string;
      } = {
        page,
        pageSize,
      };
      if (selectedNamespace && selectedNamespace !== '_all_') {
        params.namespace = selectedNamespace;
      }
      if (searchName) {
        params.name = searchName;
      }

      const data = await configMapService.getConfigMaps(Number(clusterId), params);
      setConfigMaps(data.items || []);
      setTotal(data.total || 0);
    } catch (error) {
      const err = error as { response?: { data?: { error?: string } } };
      message.error(err.response?.data?.error || '加载ConfigMap列表失败');
    } finally {
      setLoading(false);
    }
  }, [clusterId, page, pageSize, selectedNamespace, searchName]);

  useEffect(() => {
    loadNamespaces();
  }, [loadNamespaces]);

  useEffect(() => {
    loadConfigMaps();
  }, [loadConfigMaps]);

  // 删除ConfigMap
  const handleDelete = async (namespace: string, name: string) => {
    if (!clusterId) return;
    try {
      await configMapService.deleteConfigMap(Number(clusterId), namespace, name);
      message.success('ConfigMap删除成功');
      loadConfigMaps();
    } catch (error) {
      const err = error as { response?: { data?: { error?: string } } };
      message.error(err.response?.data?.error || '删除ConfigMap失败');
    }
  };

  // 批量删除
  const handleBatchDelete = async () => {
    if (selectedRowKeys.length === 0) {
      message.warning('请先选择要删除的ConfigMap');
      return;
    }

    Modal.confirm({
      title: '确认删除',
      content: `确定要删除选中的 ${selectedRowKeys.length} 个ConfigMap吗？`,
      onOk: async () => {
        try {
          for (const key of selectedRowKeys) {
            const [namespace, name] = (key as string).split('/');
            await configMapService.deleteConfigMap(Number(clusterId), namespace, name);
          }
          message.success('批量删除成功');
          setSelectedRowKeys([]);
          loadConfigMaps();
        } catch (error) {
          const err = error as { response?: { data?: { error?: string } } };
          message.error(err.response?.data?.error || '批量删除失败');
        }
      },
    });
  };

  // 查看详情
  const handleViewDetail = (namespace: string, name: string) => {
    navigate(`/clusters/${clusterId}/configs/configmap/${namespace}/${name}`);
  };

  // 搜索
  const handleSearch = () => {
    setPage(1);
    loadConfigMaps();
  };

  // 表格列定义
  const columns: ColumnsType<ConfigMapListItem> = [
    {
      title: '名称',
      dataIndex: 'name',
      key: 'name',
      width: 250,
      render: (text: string, record: ConfigMapListItem) => (
        <a onClick={() => handleViewDetail(record.namespace, text)}>
          {text}
        </a>
      ),
    },
    {
      title: '命名空间',
      dataIndex: 'namespace',
      key: 'namespace',
      width: 150,
      render: (text: string) => <Tag color="blue">{text}</Tag>,
    },
    {
      title: '标签',
      dataIndex: 'labels',
      key: 'labels',
      width: 200,
      render: (labels: Record<string, string>) => (
        <Space size={[0, 4]} wrap>
          {Object.entries(labels || {}).slice(0, 3).map(([key, value]) => (
            <Tag key={key}>{`${key}=${value}`}</Tag>
          ))}
          {Object.keys(labels || {}).length > 3 && (
            <Tag>+{Object.keys(labels).length - 3}</Tag>
          )}
        </Space>
      ),
    },
    {
      title: '数据项数量',
      dataIndex: 'dataCount',
      key: 'dataCount',
      width: 120,
      align: 'center',
      render: (count: number) => <Tag color="green">{count}</Tag>,
    },
    {
      title: '创建时间',
      dataIndex: 'creationTimestamp',
      key: 'creationTimestamp',
      width: 180,
      render: (time: string) => new Date(time).toLocaleString('zh-CN'),
    },
    {
      title: '存在时间',
      dataIndex: 'age',
      key: 'age',
      width: 100,
    },
    {
      title: '操作',
      key: 'action',
      width: 150,
      fixed: 'right',
      render: (_: unknown, record: ConfigMapListItem) => (
        <Space>
          <Tooltip title="查看详情">
            <Button
              type="link"
              size="small"
              icon={<EyeOutlined />}
              onClick={() => handleViewDetail(record.namespace, record.name)}
            />
          </Tooltip>
          <Tooltip title="编辑">
            <Button
              type="link"
              size="small"
              icon={<EditOutlined />}
              onClick={() =>
                navigate(`/clusters/${clusterId}/configs/configmap/${record.namespace}/${record.name}/edit`)
              }
            />
          </Tooltip>
          <Popconfirm
            title="确定要删除这个ConfigMap吗？"
            onConfirm={() => handleDelete(record.namespace, record.name)}
            okText="确定"
            cancelText="取消"
          >
            <Tooltip title="删除">
              <Button type="link" size="small" danger icon={<DeleteOutlined />} />
            </Tooltip>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  // 行选择
  const rowSelection = {
    selectedRowKeys,
    onChange: (selectedKeys: React.Key[]) => {
      setSelectedRowKeys(selectedKeys);
    },
  };

  return (
    <div>
      {/* 筛选和搜索栏 */}
      <Space style={{ marginBottom: 16, width: '100%', justifyContent: 'space-between' }}>
        <Space>
          <Select
            placeholder="选择命名空间"
            style={{ width: 180 }}
            value={selectedNamespace}
            onChange={setSelectedNamespace}
            showSearch
            filterOption={(input, option) => {
              const text = String(option?.children || '');
              return text.toLowerCase().includes(input.toLowerCase());
            }}
            allowClear
            onClear={() => setSelectedNamespace('_all_')}
            popupClassName="namespace-select-dropdown"
          >
            <Option value="_all_">所有命名空间</Option>
            {namespaces.map((ns) => (
              <Option key={ns.name} value={ns.name}>
                {ns.name} ({ns.count})
              </Option>
            ))}
          </Select>
          <style>{`
            .namespace-select-dropdown .ant-select-item-option-content {
              white-space: normal;
              word-break: break-word;
            }
          `}</style>

          <Search
            placeholder="搜索ConfigMap名称..."
            allowClear
            style={{ width: 250 }}
            value={searchName}
            onChange={(e) => setSearchName(e.target.value)}
            onSearch={handleSearch}
            enterButton={<SearchOutlined />}
          />

          {selectedRowKeys.length > 0 && (
            <Button danger icon={<DeleteOutlined />} onClick={handleBatchDelete}>
              批量删除 ({selectedRowKeys.length})
            </Button>
          )}
        </Space>

        <Space>
          <Button
            type="primary"
            onClick={() => navigate(`/clusters/${clusterId}/configs/configmap/create`)}
          >
            创建ConfigMap
          </Button>
          <Button
            icon={<ReloadOutlined />}
            onClick={loadConfigMaps}
          >
            刷新
          </Button>
        </Space>
      </Space>

      {/* 表格 */}
      <Table
        rowSelection={rowSelection}
        columns={columns}
        dataSource={configMaps}
        loading={loading}
        rowKey={(record) => `${record.namespace}/${record.name}`}
        pagination={{
          current: page,
          pageSize: pageSize,
          total: total,
          showSizeChanger: true,
          showQuickJumper: true,
          showTotal: (total) => `共 ${total} 个配置项`,
          onChange: (page, pageSize) => {
            setPage(page);
            setPageSize(pageSize);
          },
        }}
        scroll={{ x: 1200 }}
      />
    </div>
  );
};

export default ConfigMapList;

