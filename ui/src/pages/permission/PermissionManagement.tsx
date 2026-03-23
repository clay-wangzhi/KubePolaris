import React, { useState, useEffect, useCallback } from 'react';
import {
  App,
  Card,
  Table,
  Button,
  Space,
  Modal,
  Form,
  Input,
  Select,
  Tag,
  Tooltip,
  Popconfirm,
  Typography,
  Row,
  Col,
  Checkbox,
  Divider,
  Badge,
  Spin,
} from 'antd';
import {
  PlusOutlined,
  SearchOutlined,
  QuestionCircleOutlined,
  UserOutlined,
  TeamOutlined,
  ReloadOutlined,
  SyncOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import type {
  ClusterPermission,
  PermissionTypeInfo,
  User,
  UserGroup,
  Cluster,
  PermissionType,
} from '../../types';
import permissionService, {
  getPermissionTypeName,
  getPermissionTypeColor,
  formatNamespaces,
  requiresAllNamespaces,
  allowsPartialNamespaces,
} from '../../services/permissionService';
import { clusterService } from '../../services/clusterService';
import { getNamespaces as fetchClusterNamespaces } from '../../services/namespaceService';
import rbacService from '../../services/rbacService';
import type { SyncStatusResult } from '../../services/rbacService';
import CustomRoleEditor from '../../components/CustomRoleEditor';
import { useTranslation } from 'react-i18next';
import { parseApiError } from '../../utils/api';

const { Title, Text, Paragraph } = Typography;
const { Option } = Select;

// 默认权限类型key（API未返回时使用）
const defaultPermissionTypeKeys = ['admin', 'ops', 'dev', 'readonly', 'custom'] as const;

// 权限类型卡片组件
const PermissionTypeCard: React.FC<{
  type: PermissionTypeInfo;
  selected: boolean;
  onClick: () => void;
}> = ({ type, selected, onClick }) => {
  return (
    <Card
      hoverable
      onClick={onClick}
      style={{
        cursor: 'pointer',
        borderColor: selected ? '#1890ff' : undefined,
        backgroundColor: selected ? '#e6f7ff' : undefined,
        height: '100%',
      }}
      bodyStyle={{ padding: '16px' }}
    >
      <Title level={5} style={{ marginBottom: 8 }}>
        {type.name}
      </Title>
      <Paragraph
        type="secondary"
        style={{ marginBottom: 0, fontSize: 12, minHeight: 40 }}
        ellipsis={{ rows: 2, tooltip: type.description }}
      >
        {type.description}
      </Paragraph>
    </Card>
  );
};

const PermissionManagement: React.FC = () => {
  // 状态
const { t } = useTranslation(['permission', 'common']);
const { message } = App.useApp();

const defaultPermissionTypes: PermissionTypeInfo[] = defaultPermissionTypeKeys.map(type => ({
    type,
    name: t(`permission:types.${type}.name`),
    description: t(`permission:types.${type}.description`),
    resources: type === 'admin' ? ['*'] : type === 'readonly' ? ['*'] : type === 'custom' ? [] : ['pods', 'deployments', 'services'],
    actions: type === 'admin' ? ['*'] : type === 'readonly' ? ['get', 'list', 'watch'] : type === 'custom' ? [] : ['get', 'list', 'watch', 'create', 'update', 'delete'],
    allowPartialNamespaces: type !== 'admin' && type !== 'ops',
    requireAllNamespaces: type === 'admin' || type === 'ops',
  }));

const [loading, setLoading] = useState(false);
  const [permissions, setPermissions] = useState<ClusterPermission[]>([]);
  const [permissionTypes, setPermissionTypes] = useState<PermissionTypeInfo[]>([]);
  const [clusters, setClusters] = useState<Cluster[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [userGroups, setUserGroups] = useState<UserGroup[]>([]);
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);

  // 筛选状态
  const [filterCluster, setFilterCluster] = useState<string>('');
  const [filterNamespace, setFilterNamespace] = useState<string>('');
  const [searchKeyword, setSearchKeyword] = useState('');

  // 弹窗状态
  const [modalVisible, setModalVisible] = useState(false);
  const [editingPermission, setEditingPermission] = useState<ClusterPermission | null>(null);
  const [form] = Form.useForm();

  // 表单状态
  const [selectedPermissionType, setSelectedPermissionType] = useState<PermissionType>('admin');
  const [assignType, setAssignType] = useState<'user' | 'group'>('user');
  const [allNamespaces, setAllNamespaces] = useState(true);
  const [namespaceOptions, setNamespaceOptions] = useState<string[]>([]);
  const [namespacesLoading, setNamespacesLoading] = useState(false);

  // 同步权限状态
  const [syncModalVisible, setSyncModalVisible] = useState(false);
  const [syncLoading, setSyncLoading] = useState(false);
  const [syncStatus, setSyncStatus] = useState<Record<string, SyncStatusResult>>({});
  const [selectedClusterForSync, setSelectedClusterForSync] = useState<string | null>(null);

  // 自定义角色编辑器状态
  const [customRoleEditorVisible, setCustomRoleEditorVisible] = useState(false);
  const [customRoleClusterId, setCustomRoleClusterId] = useState<string>('0');
  const [customRoleClusterName, setCustomRoleClusterName] = useState<string>('');

  // 加载数据
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [permissionsRes, typesRes, clustersRes, usersRes, groupsRes] = await Promise.all([
        permissionService.getAllClusterPermissions(),
        permissionService.getPermissionTypes(),
        clusterService.getClusters(),
        permissionService.getUsers(),
        permissionService.getUserGroups(),
      ]);

      setPermissions(permissionsRes || []);
      setPermissionTypes(typesRes || []);
      setClusters(clustersRes?.items || []);
      setUsers(usersRes || []);
      setUserGroups(groupsRes || []);
    } catch (error) {
      console.error('Failed to load data:', error);
      message.error(t('permission:loadError'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // 过滤后的数据
  const filteredPermissions = permissions.filter((p) => {
    if (filterCluster && p.cluster_id.toString() !== filterCluster) return false;
    if (searchKeyword) {
      const keyword = searchKeyword.toLowerCase();
      const username = p.username?.toLowerCase() || '';
      const groupName = p.user_group_name?.toLowerCase() || '';
      if (!username.includes(keyword) && !groupName.includes(keyword)) return false;
    }
    return true;
  });

  // 打开添加权限弹窗
  const handleAdd = () => {
    setEditingPermission(null);
    setSelectedPermissionType('admin');
    setAssignType('user');
    setAllNamespaces(true);
    form.resetFields();
    setModalVisible(true);
  };

  // 打开同步权限弹窗
  const handleOpenSyncModal = () => {
    setSyncModalVisible(true);
    // 加载所有集群的同步状态
    loadAllSyncStatus();
  };

  // 加载所有集群的同步状态
  const loadAllSyncStatus = async () => {
    const statusMap: Record<string, SyncStatusResult> = {};
    for (const cluster of clusters) {
      try {
        const res = await rbacService.getSyncStatus(Number(cluster.id));
        if (res) {
          statusMap[cluster.id] = res;
        }
      } catch (err) {
        console.error(`获取集群 ${cluster.name} 同步状态失败:`, err);
      }
    }
    setSyncStatus(statusMap);
  };

  // 同步权限到集群
  const handleSyncPermissions = async (clusterId: string) => {
    setSelectedClusterForSync(clusterId);
    setSyncLoading(true);
    try {
      const res = await rbacService.syncPermissions(Number(clusterId));
      message.success(res?.message || t('permission:sync.syncSuccess'));
      const statusRes = await rbacService.getSyncStatus(Number(clusterId));
      if (statusRes) {
        setSyncStatus(prev => ({ ...prev, [clusterId]: statusRes }));
      }
    } catch {
      message.error(t('permission:sync.syncFailed'));
    } finally {
      setSyncLoading(false);
      setSelectedClusterForSync(null);
    }
  };

  // 打开编辑权限弹窗
  const handleEdit = (record: ClusterPermission) => {
    setEditingPermission(record);
    setSelectedPermissionType(record.permission_type);
    setAllNamespaces(record.namespaces.includes('*'));
    form.setFieldsValue({
      cluster_id: record.cluster_id,
      permission_type: record.permission_type,
      namespaces: record.namespaces.filter((n) => n !== '*'),
      custom_role_ref: record.custom_role_ref,
    });
    setModalVisible(true);
    if (record.cluster_id) {
      setNamespacesLoading(true);
      fetchClusterNamespaces(record.cluster_id)
        .then((nsList) => setNamespaceOptions(nsList.map((ns) => ns.name)))
        .catch(() => setNamespaceOptions([]))
        .finally(() => setNamespacesLoading(false));
    }
  };

  // 删除权限
  const handleDelete = async (id: number) => {
    try {
      await permissionService.deleteClusterPermission(id);
      message.success(t('common:messages.deleteSuccess'));
      loadData();
    } catch {
      message.error(t('common:messages.deleteError'));
    }
  };

  // 批量删除
  const handleBatchDelete = async () => {
    if (selectedRowKeys.length === 0) {
      message.warning(t('permission:actions.selectDeleteFirst'));
      return;
    }
    try {
      await permissionService.batchDeleteClusterPermissions(selectedRowKeys as number[]);
      message.success(t('permission:actions.batchDeleteSuccess'));
      setSelectedRowKeys([]);
      loadData();
    } catch {
      message.error(t('permission:actions.batchDeleteError'));
    }
  };

  // 提交表单
  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      
      if (editingPermission) {
        await permissionService.updateClusterPermission(editingPermission.id, {
          permission_type: selectedPermissionType,
          namespaces: allNamespaces ? ['*'] : (values.namespaces || []),
          custom_role_ref: selectedPermissionType === 'custom' ? values.custom_role_ref : undefined,
        });
        message.success(t('common:messages.saveSuccess'));
      } else {
        await permissionService.createClusterPermission({
          cluster_id: values.cluster_id,
          permission_type: selectedPermissionType,
          namespaces: allNamespaces ? ['*'] : (values.namespaces || []),
          custom_role_ref: selectedPermissionType === 'custom' ? values.custom_role_ref : undefined,
          user_ids: assignType === 'user' ? values.user_ids : undefined,
          user_group_ids: assignType === 'group' ? values.user_group_ids : undefined,
        });
        message.success(t('permission:actions.addSuccess'));
      }

      setModalVisible(false);
      loadData();
    } catch (error: unknown) {
      message.error(parseApiError(error));
    }
  };

  // 表格列定义
  const columns: ColumnsType<ClusterPermission> = [
    {
      title: t('permission:columns.subject'),
      key: 'subject',
      width: 200,
      render: (_, record) => (
        <Space>
          {record.user_id ? (
            <>
              <Tag color="blue" icon={<UserOutlined />}>{t('permission:columns.user')}</Tag>
              <Text>{record.username}</Text>
            </>
          ) : (
            <>
              <Tag color="green" icon={<TeamOutlined />}>{t('permission:columns.userGroup')}</Tag>
              <Text>{record.user_group_name}</Text>
            </>
          )}
        </Space>
      ),
    },
    {
      title: t('permission:columns.clusterName'),
      dataIndex: 'cluster_name',
      key: 'cluster_name',
      width: 150,
      render: (clusterName: string, record) => {
        // 如果没有cluster_name，尝试从clusters列表中查找
        const name = clusterName || clusters.find(c => parseInt(c.id) === record.cluster_id)?.name || '-';
        return <Text>{name}</Text>;
      },
    },
    {
      title: t('permission:columns.permissionType'),
      dataIndex: 'permission_type',
      key: 'permission_type',
      width: 150,
      render: (type: string) => (
        <Tag color={getPermissionTypeColor(type)}>
          {getPermissionTypeName(type)}
        </Tag>
      ),
    },
    {
      title: t('common:table.namespace'),
      dataIndex: 'namespaces',
      key: 'namespaces',
      width: 200,
      render: (namespaces: string[]) => (
        <Text type={namespaces.includes('*') ? 'success' : undefined}>
          {formatNamespaces(namespaces)}
        </Text>
      ),
    },
    {
      title: t('common:table.actions'),
      key: 'action',
      width: 150,
      render: (_, record) => (
        <Space>
          <Tooltip title={t('permission:actions.editTooltip')}>
            <Button
              type="link"
              size="small"
              onClick={() => handleEdit(record)}
            >
              {t('permission:actions.editTooltip')}
            </Button>
          </Tooltip>
          <Popconfirm
            title={t('permission:actions.confirmDeletePermission')}
            onConfirm={() => handleDelete(record.id)}
            okText={t('common:actions.confirm')}
            cancelText={t('common:actions.cancel')}
          >
            <Button type="link" size="small" danger>
              {t('common:actions.delete')}
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div style={{ padding: '0' }}>
      {/* 页面标题 */}
      <div style={{ marginBottom: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Space>
          <Title level={4} style={{ margin: 0 }}>{t('permission:title')}</Title>
          <Tooltip title={t('permission:tooltip')}>
            <QuestionCircleOutlined style={{ color: '#999' }} />
          </Tooltip>
        </Space>
        <Space>
          <Button icon={<SyncOutlined />} onClick={handleOpenSyncModal}>
            {t('permission:syncPermissions')}
          </Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>
            {t('permission:addPermission')}
          </Button>
        </Space>
      </div>

      {/* 权限类型说明卡片 - CCE风格 */}
      <Card style={{ marginBottom: 24 }} bodyStyle={{ padding: '20px 24px' }}>
        <Row gutter={24}>
          {(permissionTypes.length > 0 ? permissionTypes : defaultPermissionTypes).map((type, index, arr) => (
            <Col 
              flex="1"
              key={type.type}
              style={{
                borderRight: index < arr.length - 1 ? '1px solid #f0f0f0' : 'none',
                paddingRight: index < arr.length - 1 ? 16 : 0,
                paddingLeft: index > 0 ? 16 : 0,
              }}
            >
              <Title level={5} style={{ marginBottom: 8, fontSize: 14, fontWeight: 600, color: '#1f2937' }}>
                {type.name}
              </Title>
              <Paragraph
                type="secondary"
                style={{ marginBottom: 0, fontSize: 12, lineHeight: 1.8, color: '#6b7280' }}
              >
                {type.description}
              </Paragraph>
            </Col>
          ))}
        </Row>
      </Card>

      {/* 筛选栏 */}
      <Card style={{ marginBottom: 16 }} bodyStyle={{ padding: '12px 16px' }}>
        <Space size="large" wrap>
          <Space>
            <Popconfirm
              title={t('permission:actions.confirmBatchDelete')}
              onConfirm={handleBatchDelete}
              disabled={selectedRowKeys.length === 0}
            >
              <Button
                disabled={selectedRowKeys.length === 0}
              >
                {t('common:actions.batchDelete')}
              </Button>
            </Popconfirm>
          </Space>
          <Divider type="vertical" style={{ height: 24 }} />
          <Space>
            <Select
              placeholder={t('permission:filter.selectCluster')}
              allowClear
              style={{ width: 200 }}
              value={filterCluster || undefined}
              onChange={(v) => setFilterCluster(v || '')}
            >
              {clusters.map((c) => (
                <Option key={c.id} value={c.id.toString()}>
                  {c.name}
                </Option>
              ))}
            </Select>
            <Select
              placeholder={t('permission:filter.namespace')}
              allowClear
              style={{ width: 120 }}
              value={filterNamespace || undefined}
              onChange={(v) => setFilterNamespace(v || '')}
            >
              <Option value="*">{t('permission:filter.all')}</Option>
            </Select>
            <Input.Search
              placeholder={t('permission:filter.keyword')}
              allowClear
              style={{ width: 200 }}
              value={searchKeyword}
              onChange={(e) => setSearchKeyword(e.target.value)}
              enterButton={<SearchOutlined />}
            />
            <Button icon={<ReloadOutlined />} onClick={loadData}>
              {t('common:actions.refresh')}
            </Button>
          </Space>
        </Space>
      </Card>

      {/* 权限列表表格 */}
      <Card bodyStyle={{ padding: 0 }}>
        <Table
          rowKey="id"
          columns={columns}
          dataSource={filteredPermissions}
          loading={loading}
          rowSelection={{
            selectedRowKeys,
            onChange: setSelectedRowKeys,
          }}
          pagination={{
            showSizeChanger: true,
            showQuickJumper: true,
            showTotal: (total) => t('permission:pagination.total', { total }),
          }}
        />
      </Card>

      {/* 添加/编辑权限弹窗 */}
      <Modal
        title={editingPermission ? t('permission:editPermission') : t('permission:addPermission')}
        open={modalVisible}
        onOk={handleSubmit}
        onCancel={() => setModalVisible(false)}
        width={720}
        destroyOnClose
      >
        <Spin spinning={loading}>
          <Form
            form={form}
            layout="vertical"
            initialValues={{
              permission_type: 'admin',
            }}
          >
            {/* 选择集群 */}
            <Form.Item
              name="cluster_id"
              label={t('permission:form.selectCluster')}
              rules={[{ required: true, message: t('permission:form.selectClusterRequired') }]}
            >
              <Select
                placeholder={t('permission:form.selectClusterPlaceholder')}
                disabled={!!editingPermission}
                showSearch
                optionFilterProp="children"
                onChange={(value: number) => {
                  setNamespaceOptions([]);
                  form.setFieldsValue({ namespaces: [] });
                  if (value) {
                    setNamespacesLoading(true);
                    fetchClusterNamespaces(value)
                      .then((nsList) => setNamespaceOptions(nsList.map((ns) => ns.name)))
                      .catch(() => setNamespaceOptions([]))
                      .finally(() => setNamespacesLoading(false));
                  }
                }}
              >
                {clusters.map((c) => (
                  <Option key={c.id} value={parseInt(c.id)}>
                    <Space>
                      {c.name}
                      {c.status === 'healthy' ? (
                        <Badge status="success" />
                      ) : (
                        <Badge status="error" />
                      )}
                    </Space>
                  </Option>
                ))}
              </Select>
            </Form.Item>

            {/* 权限类型选择 */}
            <Form.Item label={t('permission:form.permissionType')} required>
              <Row gutter={12}>
                {permissionTypes.map((type) => (
                  <Col span={Math.floor(24 / Math.max(permissionTypes.length, 1))} key={type.type}>
                    <PermissionTypeCard
                      type={type}
                      selected={selectedPermissionType === type.type}
                      onClick={() => {
                        setSelectedPermissionType(type.type as PermissionType);
                        // 如果权限类型要求全部命名空间，自动设置
                        if (requiresAllNamespaces(type.type)) {
                          setAllNamespaces(true);
                        }
                      }}
                    />
                  </Col>
                ))}
              </Row>
            </Form.Item>

            {/* 自定义权限时显示角色选择 */}
            {selectedPermissionType === 'custom' && (
              <Form.Item
                name="custom_role_ref"
                label={t('permission:form.customRoleName')}
                rules={[{ required: true, message: t('permission:form.customRoleRequired') }]}
                extra={
                  <Space style={{ marginTop: 8 }}>
                    <Text type="secondary">{t('permission:form.noSuitableRole')}</Text>
                    <Button
                      type="link"
                      size="small"
                      style={{ padding: 0 }}
                      onClick={() => {
                        const clusterId = form.getFieldValue('cluster_id');
                        if (!clusterId) {
                          message.warning(t('permission:form.selectClusterFirst'));
                          return;
                        }
                        const cluster = clusters.find(c => c.id === clusterId);
                        setCustomRoleClusterId(clusterId);
                        setCustomRoleClusterName(cluster?.name || '');
                        setCustomRoleEditorVisible(true);
                      }}
                    >
                      {t('permission:form.createClusterRole')}
                    </Button>
                  </Space>
                }
              >
                <Input placeholder={t('permission:form.customRolePlaceholder')} />
              </Form.Item>
            )}

            {/* 分配对象 */}
            {!editingPermission && (
              <>
                <Form.Item label={t('permission:form.assignTo')}>
                  <Space>
                    <Button
                      type={assignType === 'user' ? 'primary' : 'default'}
                      icon={<UserOutlined />}
                      onClick={() => {
                        setAssignType('user');
                        form.setFieldsValue({ user_ids: undefined, user_group_ids: undefined });
                      }}
                    >
                      {t('permission:columns.user')}
                    </Button>
                    <Button
                      type={assignType === 'group' ? 'primary' : 'default'}
                      icon={<TeamOutlined />}
                      onClick={() => {
                        setAssignType('group');
                        form.setFieldsValue({ user_ids: undefined, user_group_ids: undefined });
                      }}
                    >
                      {t('permission:columns.userGroup')}
                    </Button>
                  </Space>
                </Form.Item>

                {assignType === 'user' ? (
                  <Form.Item
                    name="user_ids"
                    label={t('permission:form.selectUser')}
                    rules={[{ required: true, message: t('permission:form.selectUserRequired') }]}
                  >
                    <Select
                      mode="multiple"
                      placeholder={t('permission:form.selectUserPlaceholder')}
                      showSearch
                      optionFilterProp="label"
                      options={users.map((u) => ({
                        label: `${u.display_name || u.username} (${u.username})`,
                        value: u.id,
                      }))}
                    />
                  </Form.Item>
                ) : (
                  <Form.Item
                    name="user_group_ids"
                    label={t('permission:form.selectUserGroup')}
                    rules={[{ required: true, message: t('permission:form.selectUserGroupRequired') }]}
                  >
                    <Select
                      mode="multiple"
                      placeholder={t('permission:form.selectUserGroupPlaceholder')}
                      showSearch
                      optionFilterProp="label"
                      options={userGroups.map((g) => ({
                        label: `${g.name} (${g.users?.length || 0} 成员)`,
                        value: g.id,
                      }))}
                    />
                  </Form.Item>
                )}
              </>
            )}

            {/* 命名空间范围 */}
            <Form.Item 
              label={t('permission:form.namespaceScope')}
              extra={requiresAllNamespaces(selectedPermissionType) 
                ? <Text type="warning">{t('permission:form.allNamespacesRequired')}</Text> 
                : null}
            >
              <Checkbox
                checked={allNamespaces}
                onChange={(e) => setAllNamespaces(e.target.checked)}
                disabled={requiresAllNamespaces(selectedPermissionType)}
              >
                {t('permission:form.allNamespaces')}
              </Checkbox>
            </Form.Item>

            {!allNamespaces && allowsPartialNamespaces(selectedPermissionType) && (
              <Form.Item
                name="namespaces"
                label={t('permission:form.selectNamespace')}
                rules={[{ required: true, message: t('permission:form.selectNamespaceRequired') }]}
              >
                <Select
                  mode="tags"
                  placeholder={t('permission:form.namespacePlaceholder')}
                  tokenSeparators={[',']}
                  loading={namespacesLoading}
                  showSearch
                  optionFilterProp="children"
                >
                  {namespaceOptions.map((ns) => (
                    <Option key={ns} value={ns}>{ns}</Option>
                  ))}
                </Select>
              </Form.Item>
            )}
          </Form>
        </Spin>
      </Modal>

      {/* 同步权限弹窗 */}
      <Modal
        title={t('permission:sync.title')}
        open={syncModalVisible}
        onCancel={() => setSyncModalVisible(false)}
        footer={null}
        width={800}
      >
        <div style={{ marginBottom: 16 }}>
          <Paragraph type="secondary">
            {t('permission:sync.description')}
          </Paragraph>
        </div>
        <Table
          rowKey="id"
          dataSource={clusters}
          pagination={false}
          columns={[
            {
              title: t('permission:sync.clusterName'),
              dataIndex: 'name',
              key: 'name',
            },
            {
              title: 'API Server',
              dataIndex: 'api_server',
              key: 'api_server',
              ellipsis: true,
            },
            {
              title: t('permission:sync.syncStatus'),
              key: 'status',
              width: 120,
              render: (_, record) => {
                const status = syncStatus[record.id];
                if (!status) {
                  return <Tag>{t('permission:sync.notChecked')}</Tag>;
                }
                return status.synced ? (
                  <Tag icon={<CheckCircleOutlined />} color="success">{t('permission:sync.synced')}</Tag>
                ) : (
                  <Tag icon={<CloseCircleOutlined />} color="warning">{t('permission:sync.notSynced')}</Tag>
                );
              },
            },
            {
              title: t('common:table.actions'),
              key: 'action',
              width: 120,
              render: (_, record) => (
                <Button
                  type="primary"
                  size="small"
                  icon={<SyncOutlined spin={syncLoading && selectedClusterForSync === record.id} />}
                  loading={syncLoading && selectedClusterForSync === record.id}
                  onClick={() => handleSyncPermissions(record.id)}
                >
                  {syncStatus[record.id]?.synced ? t('permission:sync.resyncBtn') : t('permission:sync.syncBtn')}
                </Button>
              ),
            },
          ]}
        />
        <div style={{ marginTop: 16 }}>
          <Title level={5}>{t('permission:sync.resourcesTitle')}</Title>
          <Row gutter={16}>
            <Col span={8}>
              <Card size="small" title="ClusterRole" bodyStyle={{ padding: 12 }}>
                <ul style={{ margin: 0, paddingLeft: 20, fontSize: 12 }}>
                  <li>kubepolaris-cluster-admin</li>
                  <li>kubepolaris-ops</li>
                  <li>kubepolaris-dev</li>
                  <li>kubepolaris-readonly</li>
                </ul>
              </Card>
            </Col>
            <Col span={8}>
              <Card size="small" title="ServiceAccount" bodyStyle={{ padding: 12 }}>
                <ul style={{ margin: 0, paddingLeft: 20, fontSize: 12 }}>
                  <li>kubepolaris-admin-sa</li>
                  <li>kubepolaris-ops-sa</li>
                  <li>kubepolaris-dev-sa</li>
                  <li>kubepolaris-readonly-sa</li>
                </ul>
              </Card>
            </Col>
            <Col span={8}>
              <Card size="small" title="ClusterRoleBinding" bodyStyle={{ padding: 12 }}>
                <ul style={{ margin: 0, paddingLeft: 20, fontSize: 12 }}>
                  <li>kubepolaris-admin-binding</li>
                  <li>kubepolaris-ops-binding</li>
                </ul>
              </Card>
            </Col>
          </Row>
        </div>
      </Modal>

      {/* 自定义角色编辑器 */}
      <CustomRoleEditor
        visible={customRoleEditorVisible}
        clusterId={customRoleClusterId}
        clusterName={customRoleClusterName}
        onCancel={() => setCustomRoleEditorVisible(false)}
        onSuccess={(roleName) => {
          form.setFieldValue('custom_role_ref', roleName);
          setCustomRoleEditorVisible(false);
        }}
      />
    </div>
  );
};

export default PermissionManagement;

