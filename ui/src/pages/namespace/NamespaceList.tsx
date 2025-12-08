import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Card,
  Table,
  Button,
  Input,
  Space,
  Tag,
  Modal,
  Form,
  message,
  Popconfirm,
  Tooltip,
  Typography,
} from 'antd';
import {
  PlusOutlined,
  SearchOutlined,
  DeleteOutlined,
  EyeOutlined,
  TagsOutlined,
  ReloadOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import {
  getNamespaces,
  createNamespace,
  deleteNamespace,
  type NamespaceData,
  type CreateNamespaceRequest,
} from '../../services/namespaceService';

const { Search } = Input;
const { Text } = Typography;

const NamespaceList: React.FC = () => {
  const { clusterId } = useParams<{ clusterId: string }>();
  const navigate = useNavigate();
  const [namespaces, setNamespaces] = useState<NamespaceData[]>([]);
  const [filteredNamespaces, setFilteredNamespaces] = useState<NamespaceData[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [createModalVisible, setCreateModalVisible] = useState(false);
  const [form] = Form.useForm();

  useEffect(() => {
    fetchNamespaces();
  }, [clusterId]);

  useEffect(() => {
    // 搜索过滤
    if (searchText) {
      const filtered = namespaces.filter(
        (ns) =>
          ns.name.toLowerCase().includes(searchText.toLowerCase()) ||
          ns.status.toLowerCase().includes(searchText.toLowerCase())
      );
      setFilteredNamespaces(filtered);
    } else {
      setFilteredNamespaces(namespaces);
    }
  }, [searchText, namespaces]);

  const fetchNamespaces = async () => {
    if (!clusterId) return;
    setLoading(true);
    try {
      const data = await getNamespaces(Number(clusterId));
      setNamespaces(data);
      setFilteredNamespaces(data);
    } catch (error) {
      message.error('获取命名空间列表失败');
      console.error('Error fetching namespaces:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async (values: CreateNamespaceRequest) => {
    if (!clusterId) return;
    try {
      await createNamespace(Number(clusterId), values);
      message.success('命名空间创建成功');
      setCreateModalVisible(false);
      form.resetFields();
      fetchNamespaces();
    } catch (error) {
      message.error('创建命名空间失败');
      console.error('Error creating namespace:', error);
    }
  };

  const handleDelete = async (namespace: string) => {
    if (!clusterId) return;
    try {
      await deleteNamespace(Number(clusterId), namespace);
      message.success('命名空间删除成功');
      fetchNamespaces();
    } catch (error) {
      message.error('删除命名空间失败');
      console.error('Error deleting namespace:', error);
    }
  };

  const handleViewDetail = (namespace: string) => {
    navigate(`/clusters/${clusterId}/namespaces/${namespace}`);
  };

  const columns: ColumnsType<NamespaceData> = [
    {
      title: '命名空间',
      dataIndex: 'name',
      key: 'name',
      sorter: (a, b) => a.name.localeCompare(b.name),
      render: (name: string) => (
        <Button
          type="link"
          onClick={() => handleViewDetail(name)}
          style={{ padding: 0 }}
        >
          {name}
        </Button>
      ),
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 120,
      render: (status: string) => (
        <Tag color={status === 'Active' ? 'green' : 'orange'}>
          {status === 'Active' ? '运行中' : status}
        </Tag>
      ),
    },
    {
      title: '标签',
      dataIndex: 'labels',
      key: 'labels',
      render: (labels: Record<string, string>) => {
        if (!labels || Object.keys(labels).length === 0) {
          return <Text type="secondary">--</Text>;
        }
        const labelArray = Object.entries(labels).slice(0, 2);
        const moreCount = Object.keys(labels).length - 2;
        return (
          <Space size={[0, 4]} wrap>
            {labelArray.map(([key, value]) => (
              <Tooltip key={key} title={`${key}: ${value}`}>
                <Tag icon={<TagsOutlined />}>{key}</Tag>
              </Tooltip>
            ))}
            {moreCount > 0 && (
              <Tooltip title={`还有 ${moreCount} 个标签`}>
                <Tag>+{moreCount}</Tag>
              </Tooltip>
            )}
          </Space>
        );
      },
    },
    {
      title: '创建时间',
      dataIndex: 'creationTimestamp',
      key: 'creationTimestamp',
      width: 180,
      sorter: (a, b) =>
        new Date(a.creationTimestamp).getTime() - new Date(b.creationTimestamp).getTime(),
    },
    {
      title: '操作',
      key: 'action',
      width: 180,
      render: (_, record) => (
        <Space size="small">
          <Tooltip title="查看详情">
            <Button
              type="link"
              icon={<EyeOutlined />}
              onClick={() => handleViewDetail(record.name)}
            >
              详情
            </Button>
          </Tooltip>
          {!['default', 'kube-system', 'kube-public', 'kube-node-lease'].includes(
            record.name
          ) && (
            <Popconfirm
              title="确认删除"
              description={`确定要删除命名空间 "${record.name}" 吗？此操作将删除该命名空间下的所有资源。`}
              onConfirm={() => handleDelete(record.name)}
              okText="确定"
              cancelText="取消"
            >
              <Tooltip title="删除命名空间">
                <Button type="link" danger icon={<DeleteOutlined />}>
                  删除
                </Button>
              </Tooltip>
            </Popconfirm>
          )}
        </Space>
      ),
    },
  ];

  return (
    <div style={{ padding: 24 }}>
      <Card
        title="命名空间"
        extra={
          <Space>
            <Button icon={<ReloadOutlined />} onClick={fetchNamespaces}>
              刷新
            </Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateModalVisible(true)}>
              创建命名空间
            </Button>
          </Space>
        }
      >
        <Space direction="vertical" size="large" style={{ width: '100%' }}>
          <Search
            placeholder="搜索命名空间名称或状态"
            allowClear
            enterButton={<SearchOutlined />}
            size="large"
            onChange={(e) => setSearchText(e.target.value)}
            style={{ width: 400 }}
          />

          <Table
            columns={columns}
            dataSource={filteredNamespaces}
            rowKey="name"
            loading={loading}
            pagination={{
              total: filteredNamespaces.length,
              pageSize: 10,
              showSizeChanger: true,
              showTotal: (total) => `共 ${total} 个命名空间`,
            }}
          />
        </Space>
      </Card>

      <Modal
        title="创建命名空间"
        open={createModalVisible}
        onCancel={() => {
          setCreateModalVisible(false);
          form.resetFields();
        }}
        onOk={() => form.submit()}
        width={600}
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={handleCreate}
          autoComplete="off"
        >
          <Form.Item
            name="name"
            label="命名空间名称"
            rules={[
              { required: true, message: '请输入命名空间名称' },
              {
                pattern: /^[a-z0-9]([-a-z0-9]*[a-z0-9])?$/,
                message: '名称只能包含小写字母、数字和连字符，且必须以字母或数字开头和结尾',
              },
            ]}
          >
            <Input placeholder="例如: my-namespace" />
          </Form.Item>

          <Form.Item
            name={['labels', 'description']}
            label="描述（可选）"
          >
            <Input.TextArea
              rows={3}
              placeholder="输入命名空间的描述信息"
            />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default NamespaceList;

