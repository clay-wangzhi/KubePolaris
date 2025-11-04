/** genAI_main_start */
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
  Card,
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
  LockOutlined,
} from '@ant-design/icons';
import { useNavigate, useParams } from 'react-router-dom';
import { secretService, type SecretListItem, type NamespaceItem } from '../../services/configService';
import type { ColumnsType } from 'antd/es/table';

const { Search } = Input;
const { Option } = Select;

const SecretList: React.FC = () => {
  const navigate = useNavigate();
  const { clusterId } = useParams<{ clusterId: string }>();
  const [loading, setLoading] = useState(false);
  const [secrets, setSecrets] = useState<SecretListItem[]>([]);
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
      const data = await secretService.getSecretNamespaces(Number(clusterId));
      setNamespaces(data);
    } catch (error) {
      console.error('加载命名空间失败:', error);
    }
  }, [clusterId]);

  // 加载Secret列表
  const loadSecrets = React.useCallback(async () => {
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

      const data = await secretService.getSecrets(Number(clusterId), params);
      setSecrets(data.items || []);
      setTotal(data.total || 0);
    } catch (error) {
      const err = error as { response?: { data?: { error?: string } } };
      message.error(err.response?.data?.error || '加载Secret列表失败');
    } finally {
      setLoading(false);
    }
  }, [clusterId, page, pageSize, selectedNamespace, searchName]);

  useEffect(() => {
    loadNamespaces();
  }, [loadNamespaces]);

  useEffect(() => {
    loadSecrets();
  }, [loadSecrets]);

  // 删除Secret
  const handleDelete = async (namespace: string, name: string) => {
    if (!clusterId) return;
    try {
      await secretService.deleteSecret(Number(clusterId), namespace, name);
      message.success('Secret删除成功');
      loadSecrets();
    } catch (error) {
      const err = error as { response?: { data?: { error?: string } } };
      message.error(err.response?.data?.error || '删除Secret失败');
    }
  };

  // 批量删除
  const handleBatchDelete = async () => {
    if (selectedRowKeys.length === 0) {
      message.warning('请先选择要删除的Secret');
      return;
    }

    Modal.confirm({
      title: '确认删除',
      content: `确定要删除选中的 ${selectedRowKeys.length} 个Secret吗？`,
      onOk: async () => {
        try {
          for (const key of selectedRowKeys) {
            const [namespace, name] = (key as string).split('/');
            await secretService.deleteSecret(Number(clusterId), namespace, name);
          }
          message.success('批量删除成功');
          setSelectedRowKeys([]);
          loadSecrets();
        } catch (error) {
          const err = error as { response?: { data?: { error?: string } } };
          message.error(err.response?.data?.error || '批量删除失败');
        }
      },
    });
  };

  // 查看详情
  const handleViewDetail = (namespace: string, name: string) => {
    navigate(`/clusters/${clusterId}/configs/secret/${namespace}/${name}`);
  };

  // 搜索
  const handleSearch = () => {
    setPage(1);
    loadSecrets();
  };

  // Secret类型颜色映射
  const getTypeColor = (type: string) => {
    const colorMap: Record<string, string> = {
      'Opaque': 'default',
      'kubernetes.io/service-account-token': 'blue',
      'kubernetes.io/dockercfg': 'green',
      'kubernetes.io/dockerconfigjson': 'green',
      'kubernetes.io/basic-auth': 'orange',
      'kubernetes.io/ssh-auth': 'purple',
      'kubernetes.io/tls': 'red',
    };
    return colorMap[type] || 'default';
  };

  // 表格列定义
  const columns: ColumnsType<SecretListItem> = [
    {
      title: '名称',
      dataIndex: 'name',
      key: 'name',
      width: 250,
      render: (text: string, record: SecretListItem) => (
        <Space>
          <LockOutlined style={{ color: '#faad14' }} />
          <a onClick={() => handleViewDetail(record.namespace, text)}>
            {text}
          </a>
        </Space>
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
      title: '类型',
      dataIndex: 'type',
      key: 'type',
      width: 200,
      render: (type: string) => (
        <Tag color={getTypeColor(type)}>{type}</Tag>
      ),
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
      render: (_: unknown, record: SecretListItem) => (
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
                navigate(`/clusters/${clusterId}/configs/secret/${record.namespace}/${record.name}/edit`)
              }
            />
          </Tooltip>
          <Popconfirm
            title="确定要删除这个Secret吗？"
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
    <Card
      title="密钥 (Secret)"
      extra={
        <Space>
          <Button icon={<ReloadOutlined />} onClick={loadSecrets}>
            刷新
          </Button>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => navigate(`/clusters/${clusterId}/configs/secret/create`)}
          >
            创建密钥
          </Button>
        </Space>
      }
    >
      <Space direction="vertical" style={{ width: '100%' }} size="middle">
        {/* 搜索和过滤栏 */}
        <Space style={{ width: '100%' }} size="middle">
          <Select
            style={{ width: 200 }}
            placeholder="选择命名空间"
            value={selectedNamespace}
            onChange={setSelectedNamespace}
          >
            <Option value="_all_">所有命名空间</Option>
            {namespaces.map((ns) => (
              <Option key={ns.name} value={ns.name}>
                {ns.name} ({ns.count})
              </Option>
            ))}
          </Select>

          <Search
            placeholder="搜索Secret名称"
            allowClear
            style={{ width: 300 }}
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

        {/* 统计信息 */}
        <div>
          <Space>
            <span>总数: {total}</span>
            {selectedRowKeys.length > 0 && <span>已选: {selectedRowKeys.length}</span>}
          </Space>
        </div>

        {/* 表格 */}
        <Table
          rowSelection={rowSelection}
          columns={columns}
          dataSource={secrets}
          loading={loading}
          rowKey={(record) => `${record.namespace}/${record.name}`}
          pagination={{
            current: page,
            pageSize: pageSize,
            total: total,
            showSizeChanger: true,
            showQuickJumper: true,
            showTotal: (total) => `共 ${total} 项`,
            onChange: (page, pageSize) => {
              setPage(page);
              setPageSize(pageSize);
            },
          }}
          scroll={{ x: 1200 }}
        />
      </Space>
    </Card>
  );
};

export default SecretList;
/** genAI_main_end */

