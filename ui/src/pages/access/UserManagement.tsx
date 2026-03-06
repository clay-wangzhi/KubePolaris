import React, { useState, useEffect, useCallback } from 'react';
import {
  Card,
  Table,
  Button,
  Space,
  Modal,
  Form,
  Input,
  Select,
  Tag,
  App,
} from 'antd';
import {
  PlusOutlined,
  SearchOutlined,
  ReloadOutlined,
  EditOutlined,
  DeleteOutlined,
  LockOutlined,
  StopOutlined,
  CheckCircleOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import userService from '../../services/userService';
import type { User, CreateUserRequest, UpdateUserRequest } from '../../types';

const UserManagement: React.FC = () => {
  const { message, modal } = App.useApp();
  const [form] = Form.useForm();
  const [resetForm] = Form.useForm();

  const [loading, setLoading] = useState(false);
  const [users, setUsers] = useState<User[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('');
  const [filterAuthType, setFilterAuthType] = useState<string>('');

  const [modalVisible, setModalVisible] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [resetModalVisible, setResetModalVisible] = useState(false);
  const [resetUserId, setResetUserId] = useState<number | null>(null);
  const [submitLoading, setSubmitLoading] = useState(false);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await userService.getUsers({
        page,
        pageSize,
        search: search || undefined,
        status: filterStatus || undefined,
        auth_type: filterAuthType || undefined,
      });
      if (res.code === 200 && res.data) {
        setUsers(res.data.items || []);
        setTotal(res.data.total ?? 0);
      }
    } catch (err) {
      message.error('获取用户列表失败');
      console.error('Failed to load users:', err);
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, search, filterStatus, filterAuthType, message]);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  const handleCreate = () => {
    setEditingUser(null);
    form.resetFields();
    setModalVisible(true);
  };

  const handleEdit = (record: User) => {
    setEditingUser(record);
    form.setFieldsValue({
      username: record.username,
      display_name: record.display_name,
      email: record.email,
      phone: record.phone,
    });
    setModalVisible(true);
  };

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      setSubmitLoading(true);

      if (editingUser) {
        const data: UpdateUserRequest = {
          display_name: values.display_name,
          email: values.email,
          phone: values.phone,
        };
        const res = await userService.updateUser(editingUser.id, data);
        if (res.code === 200) {
          message.success('更新成功');
          setModalVisible(false);
          loadUsers();
        } else {
          message.error(res.message || '更新失败');
        }
      } else {
        const data: CreateUserRequest = {
          username: values.username,
          password: values.password,
          display_name: values.display_name,
          email: values.email,
          phone: values.phone,
        };
        const res = await userService.createUser(data);
        if (res.code === 200) {
          message.success('创建成功');
          setModalVisible(false);
          loadUsers();
        } else {
          message.error(res.message || '创建失败');
        }
      }
    } catch (err) {
      console.error('Submit error:', err);
    } finally {
      setSubmitLoading(false);
    }
  };

  const handleToggleStatus = async (record: User) => {
    if (record.username === 'admin') {
      message.warning('admin 用户不能禁用');
      return;
    }
    const newStatus = record.status === 'active' ? 'inactive' : 'active';
    const action = newStatus === 'active' ? '启用' : '禁用';
    modal.confirm({
      title: `确认${action}用户`,
      content: `确定要${action}用户「${record.display_name || record.username}」吗？`,
      okText: '确定',
      cancelText: '取消',
      onOk: async () => {
        try {
          const res = await userService.updateUserStatus(record.id, newStatus);
          if (res.code === 200) {
            message.success(`${action}成功`);
            loadUsers();
          } else {
            message.error(res.message || `${action}失败`);
          }
        } catch (err) {
          message.error(`${action}失败`);
          console.error(err);
        }
      },
    });
  };

  const handleResetPassword = (record: User) => {
    setResetUserId(record.id);
    resetForm.resetFields();
    setResetModalVisible(true);
  };

  const handleResetSubmit = async () => {
    if (resetUserId === null) return;
    try {
      const values = await resetForm.validateFields();
      setSubmitLoading(true);
      const res = await userService.resetPassword(resetUserId, values.new_password);
      if (res.code === 200) {
        message.success('密码重置成功');
        setResetModalVisible(false);
        setResetUserId(null);
      } else {
        message.error(res.message || '密码重置失败');
      }
    } catch (err) {
      console.error('Reset password error:', err);
    } finally {
      setSubmitLoading(false);
    }
  };

  const handleDelete = (record: User) => {
    if (record.username === 'admin') {
      message.warning('admin 用户不能删除');
      return;
    }
    modal.confirm({
      title: '确认删除',
      content: `确定要删除用户「${record.display_name || record.username}」吗？此操作不可恢复。`,
      okText: '确定',
      okType: 'danger',
      cancelText: '取消',
      onOk: async () => {
        try {
          const res = await userService.deleteUser(record.id);
          if (res.code === 200) {
            message.success('删除成功');
            loadUsers();
          } else {
            message.error(res.message || '删除失败');
          }
        } catch (err) {
          message.error('删除失败');
          console.error(err);
        }
      },
    });
  };

  const isAdmin = (record: User) => record.username === 'admin';

  const columns: ColumnsType<User> = [
    {
      title: '用户名',
      dataIndex: 'username',
      key: 'username',
      width: 120,
    },
    {
      title: '显示名称',
      dataIndex: 'display_name',
      key: 'display_name',
      width: 120,
      render: (text) => text || '-',
    },
    {
      title: '邮箱',
      dataIndex: 'email',
      key: 'email',
      width: 180,
      render: (text) => text || '-',
    },
    {
      title: '电话',
      dataIndex: 'phone',
      key: 'phone',
      width: 130,
      render: (text) => text || '-',
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 90,
      render: (status: string) =>
        status === 'active' ? (
          <Tag color="success">启用</Tag>
        ) : (
          <Tag color="error">禁用</Tag>
        ),
    },
    {
      title: '认证方式',
      dataIndex: 'auth_type',
      key: 'auth_type',
      width: 100,
      render: (authType: string) => (authType === 'ldap' ? 'LDAP' : '本地'),
    },
    {
      title: '最后登录',
      dataIndex: 'last_login_at',
      key: 'last_login_at',
      width: 170,
      render: (val: string) => (val ? dayjs(val).format('YYYY-MM-DD HH:mm:ss') : '-'),
    },
    {
      title: '操作',
      key: 'action',
      width: 240,
      fixed: 'right',
      render: (_, record) => (
        <Space wrap>
          <Button type="link" size="small" icon={<EditOutlined />} onClick={() => handleEdit(record)}>
            编辑
          </Button>
          {!isAdmin(record) && (
            <Button
              type="link"
              size="small"
              icon={record.status === 'active' ? <StopOutlined /> : <CheckCircleOutlined />}
              onClick={() => handleToggleStatus(record)}
            >
              {record.status === 'active' ? '禁用' : '启用'}
            </Button>
          )}
          {record.auth_type === 'local' && (
            <Button
              type="link"
              size="small"
              icon={<LockOutlined />}
              onClick={() => handleResetPassword(record)}
            >
              重置密码
            </Button>
          )}
          {!isAdmin(record) && (
            <Button
              type="link"
              size="small"
              danger
              icon={<DeleteOutlined />}
              onClick={() => handleDelete(record)}
            >
              删除
            </Button>
          )}
        </Space>
      ),
    },
  ];

  return (
    <div style={{ padding: 0 }}>
      <div
        style={{
          marginBottom: 24,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 600 }}>用户管理</h2>
        <Button type="primary" icon={<PlusOutlined />} onClick={handleCreate}>
          创建用户
        </Button>
      </div>

      <Card style={{ marginBottom: 16 }} bodyStyle={{ padding: '12px 16px' }}>
        <Space size="middle" wrap>
          <Input.Search
            placeholder="搜索用户名、显示名称、邮箱"
            allowClear
            style={{ width: 260 }}
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onSearch={(v) => {
              setSearch(v);
              setPage(1);
            }}
            enterButton={<SearchOutlined />}
          />
          <Select
            placeholder="状态"
            allowClear
            style={{ width: 120 }}
            value={filterStatus || undefined}
            onChange={(v) => {
              setFilterStatus(v ?? '');
              setPage(1);
            }}
          >
            <Select.Option value="">全部</Select.Option>
            <Select.Option value="active">启用</Select.Option>
            <Select.Option value="inactive">禁用</Select.Option>
          </Select>
          <Select
            placeholder="认证方式"
            allowClear
            style={{ width: 120 }}
            value={filterAuthType || undefined}
            onChange={(v) => {
              setFilterAuthType(v ?? '');
              setPage(1);
            }}
          >
            <Select.Option value="">全部</Select.Option>
            <Select.Option value="local">本地</Select.Option>
            <Select.Option value="ldap">LDAP</Select.Option>
          </Select>
          <Button icon={<ReloadOutlined />} onClick={loadUsers}>
            刷新
          </Button>
        </Space>
      </Card>

      <Card bodyStyle={{ padding: 0 }}>
        <Table
          rowKey="id"
          columns={columns}
          dataSource={users}
          loading={loading}
          pagination={{
            current: page,
            pageSize,
            total,
            showSizeChanger: true,
            showQuickJumper: true,
            showTotal: (total) => `共 ${total} 条`,
            onChange: (p, ps) => {
              setPage(p);
              setPageSize(ps || 20);
            },
          }}
        />
      </Card>

      <Modal
        title={editingUser ? '编辑用户' : '创建用户'}
        open={modalVisible}
        onOk={handleSubmit}
        onCancel={() => setModalVisible(false)}
        confirmLoading={submitLoading}
        destroyOnClose
        width={520}
      >
        <Form form={form} layout="vertical">
          {!editingUser && (
            <>
              <Form.Item
                name="username"
                label="用户名"
                rules={[{ required: true, message: '请输入用户名' }]}
              >
                <Input placeholder="请输入用户名" />
              </Form.Item>
              <Form.Item
                name="password"
                label="密码"
                rules={[{ required: true, message: '请输入密码' }, { min: 6, message: '密码至少6位' }]}
              >
                <Input.Password placeholder="请输入密码" />
              </Form.Item>
            </>
          )}
          <Form.Item name="display_name" label="显示名称">
            <Input placeholder="请输入显示名称" />
          </Form.Item>
          <Form.Item name="email" label="邮箱">
            <Input placeholder="请输入邮箱" />
          </Form.Item>
          <Form.Item name="phone" label="电话">
            <Input placeholder="请输入电话" />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="重置密码"
        open={resetModalVisible}
        onOk={handleResetSubmit}
        onCancel={() => {
          setResetModalVisible(false);
          setResetUserId(null);
        }}
        confirmLoading={submitLoading}
        destroyOnClose
        width={400}
      >
        <Form form={resetForm} layout="vertical">
          <Form.Item
            name="new_password"
            label="新密码"
            rules={[{ required: true, message: '请输入新密码' }, { min: 6, message: '密码至少6位' }]}
          >
            <Input.Password placeholder="请输入新密码" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default UserManagement;
