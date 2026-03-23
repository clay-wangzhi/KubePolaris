import React, { useState, useEffect, useCallback } from 'react';
import {
  Card,
  Table,
  Button,
  Space,
  Modal,
  Form,
  Input,
  Drawer,
  Select,
  App,
} from 'antd';
import { PlusOutlined, UserAddOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import type { UserGroup, User, CreateUserGroupRequest, UpdateUserGroupRequest } from '../../types';
import permissionService from '../../services/permissionService';
import dayjs from 'dayjs';

const UserGroupManagement: React.FC = () => {
  const { message, modal } = App.useApp();
  const [form] = Form.useForm();

  const [loading, setLoading] = useState(false);
  const [groups, setGroups] = useState<UserGroup[]>([]);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingGroup, setEditingGroup] = useState<UserGroup | null>(null);

  const [drawerVisible, setDrawerVisible] = useState(false);
  const [drawerGroup, setDrawerGroup] = useState<UserGroup | null>(null);
  const [drawerLoading, setDrawerLoading] = useState(false);
  const [users, setUsers] = useState<User[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
  const [addMemberLoading, setAddMemberLoading] = useState(false);

  const loadGroups = useCallback(async () => {
    setLoading(true);
    try {
      const res = await permissionService.getUserGroups();
      setGroups(res || []);
    } catch {
      message.error('加载用户组列表失败');
    } finally {
      setLoading(false);
    }
  }, [message]);

  useEffect(() => {
    loadGroups();
  }, [loadGroups]);

  const handleCreate = () => {
    setEditingGroup(null);
    form.resetFields();
    setModalVisible(true);
  };

  const handleEdit = (record: UserGroup) => {
    setEditingGroup(record);
    form.setFieldsValue({
      name: record.name,
      description: record.description || '',
    });
    setModalVisible(true);
  };

  const handleDelete = (record: UserGroup) => {
    modal.confirm({
      title: '确认删除',
      content: `确定要删除用户组「${record.name}」吗？`,
      okText: '确认',
      cancelText: '取消',
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          await permissionService.deleteUserGroup(record.id);
          message.success('删除成功');
          loadGroups();
        } catch {
          message.error('删除失败');
        }
      },
    });
  };

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      if (editingGroup) {
        const data: UpdateUserGroupRequest = {
          name: values.name,
          description: values.description || undefined,
        };
        await permissionService.updateUserGroup(editingGroup.id, data);
        message.success('更新成功');
      } else {
        const data: CreateUserGroupRequest = {
          name: values.name,
          description: values.description || undefined,
        };
        await permissionService.createUserGroup(data);
        message.success('创建成功');
      }
      setModalVisible(false);
      loadGroups();
    } catch (err) {
      if ((err as { errorFields?: unknown[] }).errorFields) {
        return;
      }
      message.error(editingGroup ? '更新失败' : '创建失败');
    }
  };

  const openMemberDrawer = useCallback(
    async (group: UserGroup) => {
      setDrawerGroup(group);
      setDrawerVisible(true);
      setDrawerLoading(true);
      try {
        const [groupRes, usersRes] = await Promise.all([
          permissionService.getUserGroup(group.id),
          permissionService.getUsers(),
        ]);
        setDrawerGroup(groupRes || group);
        setUsers(usersRes || []);
      } catch {
        message.error('加载数据失败');
      } finally {
        setDrawerLoading(false);
      }
    },
    [message]
  );

  const closeMemberDrawer = () => {
    setDrawerVisible(false);
    setDrawerGroup(null);
    setSelectedUserId(null);
    loadGroups();
  };

  const handleAddMember = async () => {
    if (!drawerGroup || !selectedUserId) {
      message.warning('请选择要添加的用户');
      return;
    }
    const memberIds = (drawerGroup.users || []).map((u) => u.id);
    if (memberIds.includes(selectedUserId)) {
      message.warning('该用户已在用户组中');
      return;
    }
    setAddMemberLoading(true);
    try {
      await permissionService.addUserToGroup(drawerGroup.id, selectedUserId);
      message.success('添加成功');
      setSelectedUserId(null);
      const groupRes = await permissionService.getUserGroup(drawerGroup.id);
      setDrawerGroup(groupRes || drawerGroup);
    } catch {
      message.error('添加失败');
    } finally {
      setAddMemberLoading(false);
    }
  };

  const handleRemoveMember = (user: User) => {
    if (!drawerGroup) return;
    modal.confirm({
      title: '确认移除',
      content: `确定要将用户「${user.display_name || user.username}」从用户组中移除吗？`,
      okText: '确认',
      cancelText: '取消',
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          await permissionService.removeUserFromGroup(drawerGroup.id, user.id);
          message.success('移除成功');
          const groupRes = await permissionService.getUserGroup(drawerGroup.id);
          setDrawerGroup(groupRes || drawerGroup);
        } catch {
          message.error('移除失败');
        }
      },
    });
  };

  const memberUserIds = (drawerGroup?.users || []).map((u) => u.id);
  const availableUsers = users.filter((u) => !memberUserIds.includes(u.id));

  const columns: ColumnsType<UserGroup> = [
    {
      title: '名称',
      dataIndex: 'name',
      key: 'name',
      width: 180,
    },
    {
      title: '描述',
      dataIndex: 'description',
      key: 'description',
      ellipsis: true,
    },
    {
      title: '成员数',
      key: 'memberCount',
      width: 100,
      render: (_, record) => record.users?.length ?? 0,
    },
    {
      title: '创建时间',
      dataIndex: 'created_at',
      key: 'created_at',
      width: 180,
      render: (val: string) => (val ? dayjs(val).format('YYYY-MM-DD HH:mm:ss') : '-'),
    },
    {
      title: '操作',
      key: 'action',
      width: 220,
      render: (_, record) => (
        <Space>
          <Button
            type="link"
            size="small"
            icon={<UserAddOutlined />}
            onClick={() => openMemberDrawer(record)}
          >
            管理成员
          </Button>
          <Button type="link" size="small" icon={<EditOutlined />} onClick={() => handleEdit(record)}>
            编辑
          </Button>
          <Button
            type="link"
            size="small"
            danger
            icon={<DeleteOutlined />}
            onClick={() => handleDelete(record)}
          >
            删除
          </Button>
        </Space>
      ),
    },
  ];

  return (
    <div style={{ padding: 0 }}>
      <div style={{ marginBottom: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 style={{ margin: 0, fontSize: 20 }}>用户组管理</h2>
        <Button type="primary" icon={<PlusOutlined />} onClick={handleCreate}>
          创建用户组
        </Button>
      </div>

      <Card bodyStyle={{ padding: 0 }}>
        <Table
          rowKey="id"
          columns={columns}
          dataSource={groups}
          loading={loading}
          pagination={{
            showSizeChanger: true,
            showQuickJumper: true,
            showTotal: (total) => `共 ${total} 条`,
          }}
        />
      </Card>

      <Modal
        title={editingGroup ? '编辑用户组' : '创建用户组'}
        open={modalVisible}
        onOk={handleSubmit}
        onCancel={() => setModalVisible(false)}
        destroyOnClose
      >
        <Form form={form} layout="vertical">
          <Form.Item
            name="name"
            label="名称"
            rules={[{ required: true, message: '请输入名称' }]}
          >
            <Input placeholder="请输入用户组名称" />
          </Form.Item>
          <Form.Item name="description" label="描述">
            <Input.TextArea rows={3} placeholder="请输入描述（可选）" />
          </Form.Item>
        </Form>
      </Modal>

      <Drawer
        title={`管理成员 - ${drawerGroup?.name ?? ''}`}
        placement="right"
        width={520}
        open={drawerVisible}
        onClose={closeMemberDrawer}
        destroyOnClose
      >
        <div style={{ marginBottom: 16 }}>
          <Space.Compact style={{ width: '100%' }}>
            <Select
              placeholder="选择用户"
              allowClear
              showSearch
              optionFilterProp="label"
              style={{ flex: 1 }}
              value={selectedUserId}
              onChange={setSelectedUserId}
              options={availableUsers.map((u) => ({
                value: u.id,
                label: `${u.display_name || u.username} (${u.username})`,
              }))}
            />
            <Button
              type="primary"
              loading={addMemberLoading}
              onClick={handleAddMember}
              icon={<UserAddOutlined />}
            >
              添加
            </Button>
          </Space.Compact>
        </div>

        <Table
          rowKey="id"
          loading={drawerLoading}
          dataSource={drawerGroup?.users || []}
          columns={[
            {
              title: '用户名',
              dataIndex: 'username',
              key: 'username',
            },
            {
              title: '显示名称',
              dataIndex: 'display_name',
              key: 'display_name',
              render: (val: string) => val || '-',
            },
            {
              title: '操作',
              key: 'action',
              width: 80,
              render: (_, record) => (
                <Button
                  type="link"
                  size="small"
                  danger
                  onClick={() => handleRemoveMember(record)}
                >
                  移除
                </Button>
              ),
            },
          ]}
        />
      </Drawer>
    </div>
  );
};

export default UserGroupManagement;
