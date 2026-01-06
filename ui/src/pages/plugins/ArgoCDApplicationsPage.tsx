import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Card,
  Table,
  Button,
  Space,
  Tag,
  Badge,
  Modal,
  Form,
  Input,
  Switch,
  Popconfirm,
  Statistic,
  Row,
  Col,
  Empty,
  message,
  Tooltip,
  Drawer,
  Descriptions,
  Timeline,
  Tabs,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  PlusOutlined,
  SyncOutlined,
  ReloadOutlined,
  BranchesOutlined,
  DeleteOutlined,
  RollbackOutlined,
  CheckCircleOutlined,
  ExclamationCircleOutlined,
  ClockCircleOutlined,
  SettingOutlined,
  EyeOutlined,
  CloseCircleOutlined,
  LoadingOutlined,
  QuestionCircleOutlined,
} from '@ant-design/icons';
import { argoCDService } from '../../services/argoCDService';
import type { 
  ArgoCDApplication, 
  CreateApplicationRequest,
  ArgoCDResource,
} from '../../services/argoCDService';

const ArgoCDApplicationsPage: React.FC = () => {
  const { clusterId } = useParams<{ clusterId: string }>();
  const navigate = useNavigate();
  
  const [applications, setApplications] = useState<ArgoCDApplication[]>([]);
  const [loading, setLoading] = useState(false);
  const [createModalVisible, setCreateModalVisible] = useState(false);
  const [detailDrawerVisible, setDetailDrawerVisible] = useState(false);
  const [selectedApp, setSelectedApp] = useState<ArgoCDApplication | null>(null);
  const [form] = Form.useForm();
  const [creating, setCreating] = useState(false);
  const [configEnabled, setConfigEnabled] = useState(false);
  const [configLoading, setConfigLoading] = useState(true);

  // 加载配置状态
  const loadConfig = useCallback(async () => {
    if (!clusterId) return;
    try {
      setConfigLoading(true);
      const response = await argoCDService.getConfig(clusterId);
      setConfigEnabled(response.data?.enabled || false);
    } catch (error) {
      console.error('加载配置失败:', error);
      setConfigEnabled(false);
    } finally {
      setConfigLoading(false);
    }
  }, [clusterId]);

  // 加载应用列表
  const loadApplications = useCallback(async () => {
    if (!clusterId || !configEnabled) return;
    setLoading(true);
    try {
      const response = await argoCDService.listApplications(clusterId);
      if (response.code === 200) {
        setApplications(response.data.items || []);
      }
    } catch (error: unknown) {
      console.error('加载应用列表失败:', error);
    } finally {
      setLoading(false);
    }
  }, [clusterId, configEnabled]);

  // 先加载配置状态
  useEffect(() => {
    loadConfig();
  }, [loadConfig]);

  // 配置启用后加载应用列表
  useEffect(() => {
    if (configEnabled) {
    loadApplications();
    }
  }, [configEnabled, loadApplications]);

  // 创建应用
  const handleCreate = async () => {
    try {
      const values = await form.validateFields();
      setCreating(true);
      
      const req: CreateApplicationRequest = {
        name: values.name,
        namespace: 'argocd',
        path: values.path,
        target_revision: values.target_revision || 'HEAD',
        dest_namespace: values.dest_namespace,
        auto_sync: values.auto_sync || false,
        self_heal: values.self_heal || false,
        prune: values.prune || false,
        helm_values: values.helm_values,
      };
      
      const response = await argoCDService.createApplication(clusterId!, req);
      if (response.code === 200) {
        message.success('应用创建成功');
        setCreateModalVisible(false);
        form.resetFields();
        loadApplications();
      } else {
        message.error(response.message || '创建失败');
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : '创建失败';
      message.error(errorMessage);
    } finally {
      setCreating(false);
    }
  };

  // 同步应用
  const handleSync = async (appName: string) => {
    try {
      message.loading({ content: '正在同步...', key: 'sync' });
      const response = await argoCDService.syncApplication(clusterId!, appName);
      if (response.code === 200) {
        message.success({ content: '同步已触发', key: 'sync' });
        loadApplications();
      } else {
        message.error({ content: response.message || '同步失败', key: 'sync' });
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : '同步失败';
      message.error({ content: errorMessage, key: 'sync' });
    }
  };

  // 删除应用
  const handleDelete = async (appName: string) => {
    try {
      message.loading({ content: '正在删除...', key: 'delete' });
      const response = await argoCDService.deleteApplication(clusterId!, appName, true);
      if (response.code === 200) {
        message.success({ content: '删除成功', key: 'delete' });
        loadApplications();
      } else {
        message.error({ content: response.message || '删除失败', key: 'delete' });
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : '删除失败';
      message.error({ content: errorMessage, key: 'delete' });
    }
  };

  // 查看详情
  const handleViewDetail = (app: ArgoCDApplication) => {
    setSelectedApp(app);
    setDetailDrawerVisible(true);
  };

  // 回滚应用
  const handleRollback = async (appName: string, revisionId: number) => {
    try {
      message.loading({ content: '正在回滚...', key: 'rollback' });
      const response = await argoCDService.rollbackApplication(clusterId!, appName, { revision_id: revisionId });
      if (response.code === 200) {
        message.success({ content: '回滚成功', key: 'rollback' });
        loadApplications();
        setDetailDrawerVisible(false);
      } else {
        message.error({ content: response.message || '回滚失败', key: 'rollback' });
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : '回滚失败';
      message.error({ content: errorMessage, key: 'rollback' });
    }
  };

  // 同步状态标签
  const getSyncStatusTag = (status: string) => {
    const config: Record<string, { color: string; icon: React.ReactNode }> = {
      'Synced': { color: 'success', icon: <CheckCircleOutlined /> },
      'OutOfSync': { color: 'warning', icon: <ExclamationCircleOutlined /> },
      'Unknown': { color: 'default', icon: <QuestionCircleOutlined /> },
    };
    const cfg = config[status] || config['Unknown'];
    return <Tag color={cfg.color} icon={cfg.icon}>{status || 'Unknown'}</Tag>;
  };

  // 健康状态标签
  const getHealthStatusBadge = (status: string) => {
    const config: Record<string, { status: 'success' | 'error' | 'processing' | 'warning' | 'default'; icon?: React.ReactNode }> = {
      'Healthy': { status: 'success', icon: <CheckCircleOutlined /> },
      'Degraded': { status: 'error', icon: <CloseCircleOutlined /> },
      'Progressing': { status: 'processing', icon: <LoadingOutlined /> },
      'Suspended': { status: 'warning', icon: <ClockCircleOutlined /> },
      'Missing': { status: 'default' },
      'Unknown': { status: 'default' },
    };
    const cfg = config[status] || config['Unknown'];
    return <Badge status={cfg.status} text={status || 'Unknown'} />;
  };

  // 统计数据
  const stats = {
    total: applications.length,
    synced: applications.filter(a => a.sync_status === 'Synced').length,
    outOfSync: applications.filter(a => a.sync_status === 'OutOfSync').length,
    healthy: applications.filter(a => a.health_status === 'Healthy').length,
    degraded: applications.filter(a => a.health_status === 'Degraded').length,
  };

  // 表格列定义
  const columns: ColumnsType<ArgoCDApplication> = [
    {
      title: '应用名称',
      dataIndex: 'name',
      key: 'name',
      fixed: 'left',
      width: 200,
      render: (text: string, record: ArgoCDApplication) => (
        <Button type="link" onClick={() => handleViewDetail(record)} style={{ padding: 0 }}>
          {text}
        </Button>
      ),
    },
    {
      title: '项目',
      dataIndex: 'project',
      key: 'project',
      width: 120,
      render: (text: string) => <Tag>{text || 'default'}</Tag>,
    },
    {
      title: '同步状态',
      dataIndex: 'sync_status',
      key: 'sync_status',
      width: 120,
      render: getSyncStatusTag,
    },
    {
      title: '健康状态',
      dataIndex: 'health_status',
      key: 'health_status',
      width: 120,
      render: getHealthStatusBadge,
    },
    {
      title: 'Git 路径',
      dataIndex: ['source', 'path'],
      key: 'path',
      width: 200,
      ellipsis: true,
      render: (text: string, record: ArgoCDApplication) => (
        <Tooltip title={record.source?.repo_url}>
          <Space>
            <BranchesOutlined />
            <span>{text || '-'}</span>
          </Space>
        </Tooltip>
      ),
    },
    {
      title: '版本',
      dataIndex: 'synced_revision',
      key: 'revision',
      width: 100,
      render: (text: string) => (
        <Tooltip title={text}>
          <code>{text?.substring(0, 7) || '-'}</code>
        </Tooltip>
      ),
    },
    {
      title: '目标命名空间',
      dataIndex: ['destination', 'namespace'],
      key: 'dest_namespace',
      width: 130,
      render: (text: string) => <Tag color="blue">{text || '-'}</Tag>,
    },
    {
      title: '操作',
      key: 'actions',
      fixed: 'right',
      width: 200,
      render: (_: unknown, record: ArgoCDApplication) => (
        <Space size="small">
          <Tooltip title="同步">
            <Button
              type="primary"
              size="small"
              icon={<SyncOutlined />}
              onClick={() => handleSync(record.name)}
            />
          </Tooltip>
          <Tooltip title="详情">
            <Button 
              size="small" 
              icon={<EyeOutlined />}
              onClick={() => handleViewDetail(record)}
            />
          </Tooltip>
          <Popconfirm
            title="确定删除这个应用吗？"
            description="删除后将同时清理集群中的相关资源"
            onConfirm={() => handleDelete(record.name)}
            okText="确定"
            cancelText="取消"
          >
            <Tooltip title="删除">
              <Button size="small" danger icon={<DeleteOutlined />} />
            </Tooltip>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  // 加载配置状态中
  if (configLoading) {
    return (
      <div style={{ 
        display: 'flex', 
        justifyContent: 'center', 
        alignItems: 'center', 
        height: '60vh' 
      }}>
        <LoadingOutlined style={{ fontSize: 32 }} spin />
      </div>
    );
  }

  // 如果未启用配置，显示提示（类似告警中心的设计）
  if (!configEnabled) {
    return (
      <div style={{ padding: 24 }}>
        <Card>
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
          description={
              <Space direction="vertical">
                <span>ArgoCD 未配置</span>
                <span style={{ color: '#999' }}>请先在配置中心配置 ArgoCD 连接信息</span>
              </Space>
            }
          >
            <Space>
              <Button 
                type="primary" 
                icon={<SettingOutlined />}
                onClick={() => navigate(`/clusters/${clusterId}/config-center?tab=argocd`)}
              >
                前往配置
              </Button>
              <Button onClick={() => navigate(-1)}>
                返回
              </Button>
            </Space>
          </Empty>
        </Card>
      </div>
    );
  }

  return (
    <div style={{ padding: 24 }}>
      {/* 统计卡片 */}
      <Row gutter={16} style={{ marginBottom: 24 }}>
        <Col span={4}>
          <Card size="small">
            <Statistic title="总应用数" value={stats.total} />
          </Card>
        </Col>
        <Col span={4}>
          <Card size="small">
            <Statistic title="已同步" value={stats.synced} valueStyle={{ color: '#52c41a' }} />
          </Card>
        </Col>
        <Col span={4}>
          <Card size="small">
            <Statistic title="未同步" value={stats.outOfSync} valueStyle={{ color: '#faad14' }} />
          </Card>
        </Col>
        <Col span={4}>
          <Card size="small">
            <Statistic title="健康" value={stats.healthy} valueStyle={{ color: '#52c41a' }} />
          </Card>
        </Col>
        <Col span={4}>
          <Card size="small">
            <Statistic title="异常" value={stats.degraded} valueStyle={{ color: '#ff4d4f' }} />
          </Card>
        </Col>
        <Col span={4}>
          <Card size="small" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
            <Button 
              type="link" 
              icon={<SettingOutlined />}
              onClick={() => navigate(`/clusters/${clusterId}/config-center?tab=argocd`)}
            >
              配置管理
            </Button>
          </Card>
        </Col>
      </Row>

      {/* 应用列表 */}
      <Card
        title="ArgoCD 应用"
        extra={
          <Space>
            <Button icon={<ReloadOutlined />} onClick={loadApplications}>
              刷新
            </Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateModalVisible(true)}>
              创建应用
            </Button>
          </Space>
        }
      >
        {applications.length > 0 ? (
          <Table
            columns={columns}
            dataSource={applications}
            rowKey="name"
            loading={loading}
            pagination={{ pageSize: 20, showSizeChanger: true, showTotal: (total) => `共 ${total} 条` }}
            scroll={{ x: 1200 }}
          />
        ) : (
          <Empty 
            description={
              <span>
                暂无应用，
                <Button type="link" onClick={() => setCreateModalVisible(true)}>
                  点击创建
                </Button>
              </span>
            }
          />
        )}
      </Card>

      {/* 创建应用弹窗 */}
      <Modal
        title="创建 ArgoCD 应用"
        open={createModalVisible}
        onOk={handleCreate}
        onCancel={() => {
          setCreateModalVisible(false);
          form.resetFields();
        }}
        confirmLoading={creating}
        width={600}
        okText="创建"
        cancelText="取消"
      >
        <Form form={form} layout="vertical">
          <Form.Item
            name="name"
            label="应用名称"
            rules={[
              { required: true, message: '请输入应用名称' },
              { pattern: /^[a-z0-9-]+$/, message: '只能包含小写字母、数字和连字符' }
            ]}
          >
            <Input placeholder="my-app" />
          </Form.Item>

          <Form.Item
            name="path"
            label="Git 路径"
            rules={[{ required: true, message: '请输入 Git 路径' }]}
            extra="相对于配置的 Git 仓库根目录的路径"
          >
            <Input placeholder="apps/my-app 或 environments/prod/my-app" />
          </Form.Item>

          <Form.Item
            name="target_revision"
            label="目标版本"
            initialValue="HEAD"
            extra="可以是分支名、Tag 或 Commit SHA"
          >
            <Input placeholder="HEAD, main, v1.0.0, 或 commit SHA" />
          </Form.Item>

          <Form.Item
            name="dest_namespace"
            label="目标命名空间"
            rules={[{ required: true, message: '请输入目标命名空间' }]}
            extra="应用将部署到此 Kubernetes 命名空间"
          >
            <Input placeholder="production" />
          </Form.Item>

          <Form.Item
            name="helm_values"
            label="Helm Values (可选)"
            extra="如果是 Helm Chart，可以在此覆盖 values (YAML 格式)"
          >
            <Input.TextArea rows={4} placeholder="replicaCount: 3&#10;image:&#10;  tag: latest" />
          </Form.Item>

          <Row gutter={16}>
            <Col span={8}>
              <Form.Item name="auto_sync" label="自动同步" valuePropName="checked">
                <Switch />
              </Form.Item>
            </Col>
            <Form.Item
              noStyle
              shouldUpdate={(prevValues, currentValues) => prevValues.auto_sync !== currentValues.auto_sync}
            >
              {({ getFieldValue }) =>
                getFieldValue('auto_sync') && (
                  <>
                    <Col span={8}>
                      <Form.Item 
                        name="self_heal" 
                        label="自动修复" 
                        valuePropName="checked"
                        tooltip="当集群状态偏离 Git 时自动修复"
                      >
                        <Switch />
                      </Form.Item>
                    </Col>
                    <Col span={8}>
                      <Form.Item 
                        name="prune" 
                        label="自动清理" 
                        valuePropName="checked"
                        tooltip="自动删除 Git 中不存在的资源"
                      >
                        <Switch />
                      </Form.Item>
                    </Col>
                  </>
                )
              }
            </Form.Item>
          </Row>
        </Form>
      </Modal>

      {/* 应用详情抽屉 */}
      <Drawer
        title={`应用详情: ${selectedApp?.name || ''}`}
        open={detailDrawerVisible}
        onClose={() => setDetailDrawerVisible(false)}
        width={700}
        extra={
          <Space>
            <Button 
              type="primary" 
              icon={<SyncOutlined />}
              onClick={() => selectedApp && handleSync(selectedApp.name)}
            >
              同步
            </Button>
          </Space>
        }
      >
        {selectedApp && (
          <Tabs
            items={[
              {
                key: 'overview',
                label: '概览',
                children: (
                  <div>
                    <Descriptions column={2} bordered size="small">
                      <Descriptions.Item label="应用名称">{selectedApp.name}</Descriptions.Item>
                      <Descriptions.Item label="项目">{selectedApp.project}</Descriptions.Item>
                      <Descriptions.Item label="同步状态">{getSyncStatusTag(selectedApp.sync_status)}</Descriptions.Item>
                      <Descriptions.Item label="健康状态">{getHealthStatusBadge(selectedApp.health_status)}</Descriptions.Item>
                      <Descriptions.Item label="Git 仓库" span={2}>
                        <a href={selectedApp.source?.repo_url} target="_blank" rel="noopener noreferrer">
                          {selectedApp.source?.repo_url}
                        </a>
                      </Descriptions.Item>
                      <Descriptions.Item label="Git 路径">{selectedApp.source?.path}</Descriptions.Item>
                      <Descriptions.Item label="目标版本">{selectedApp.target_revision}</Descriptions.Item>
                      <Descriptions.Item label="当前版本">
                        <code>{selectedApp.synced_revision?.substring(0, 12)}</code>
                      </Descriptions.Item>
                      <Descriptions.Item label="目标命名空间">
                        <Tag color="blue">{selectedApp.destination?.namespace}</Tag>
                      </Descriptions.Item>
                      <Descriptions.Item label="创建时间">{selectedApp.created_at}</Descriptions.Item>
                      <Descriptions.Item label="最后同步">{selectedApp.reconciled_at}</Descriptions.Item>
                    </Descriptions>
                  </div>
                ),
              },
              {
                key: 'resources',
                label: '资源列表',
                children: (
                  <Table
                    size="small"
                    dataSource={selectedApp.resources || []}
                    rowKey={(record: ArgoCDResource) => `${record.kind}-${record.namespace}-${record.name}`}
                    columns={[
                      { title: 'Kind', dataIndex: 'kind', key: 'kind', width: 120 },
                      { title: '命名空间', dataIndex: 'namespace', key: 'namespace', width: 120 },
                      { title: '名称', dataIndex: 'name', key: 'name' },
                      { 
                        title: '健康状态', 
                        dataIndex: 'health', 
                        key: 'health', 
                        width: 100,
                        render: (text: string) => getHealthStatusBadge(text)
                      },
                    ]}
                    pagination={false}
                  />
                ),
              },
              {
                key: 'history',
                label: '同步历史',
                children: (
                  <Timeline
                    items={(selectedApp.history || []).slice(0, 10).map((h) => ({
                      color: 'green',
                      children: (
                        <div>
                          <div>
                            <strong>版本:</strong> <code>{h.revision?.substring(0, 12)}</code>
                            <Button 
                              type="link" 
                              size="small"
                              icon={<RollbackOutlined />}
                              onClick={() => handleRollback(selectedApp.name, h.id)}
                            >
                              回滚到此版本
                            </Button>
                          </div>
                          <div style={{ color: '#999', fontSize: 12 }}>
                            部署时间: {h.deployed_at}
                          </div>
                        </div>
                      ),
                    }))}
                  />
                ),
              },
            ]}
          />
        )}
      </Drawer>
    </div>
  );
};

export default ArgoCDApplicationsPage;

