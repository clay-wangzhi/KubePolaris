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
import { useTranslation } from 'react-i18next';
import type { 
  ArgoCDApplication, 
  CreateApplicationRequest,
  ArgoCDResource,
} from '../../services/argoCDService';

const ArgoCDApplicationsPage: React.FC = () => {
  const { clusterId } = useParams<{ clusterId: string }>();
  const navigate = useNavigate();
  
const { t } = useTranslation(['plugins', 'common']);
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
        message.success(t('plugins:argocd.createSuccess'));
        setCreateModalVisible(false);
        form.resetFields();
        loadApplications();
      } else {
        message.error(response.message || t('plugins:argocd.createFailed'));
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : t('plugins:argocd.createFailed');
      message.error(errorMessage);
    } finally {
      setCreating(false);
    }
  };

  // 同步应用
  const handleSync = async (appName: string) => {
    try {
      message.loading({ content: t('plugins:argocd.syncing'), key: 'sync' });
      const response = await argoCDService.syncApplication(clusterId!, appName);
      if (response.code === 200) {
        message.success({ content: t('plugins:argocd.syncTriggered'), key: 'sync' });
        loadApplications();
      } else {
        message.error({ content: response.message || t('plugins:argocd.syncFailed'), key: 'sync' });
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : t('plugins:argocd.syncFailed');
      message.error({ content: errorMessage, key: 'sync' });
    }
  };

  // 删除应用
  const handleDelete = async (appName: string) => {
    try {
      message.loading({ content: t('plugins:argocd.deleting'), key: 'delete' });
      const response = await argoCDService.deleteApplication(clusterId!, appName, true);
      if (response.code === 200) {
        message.success({ content: t('plugins:argocd.deleteSuccess'), key: 'delete' });
        loadApplications();
      } else {
        message.error({ content: response.message || t('plugins:argocd.deleteFailed'), key: 'delete' });
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : t('plugins:argocd.deleteFailed');
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
      message.loading({ content: t('plugins:argocd.rolling'), key: 'rollback' });
      const response = await argoCDService.rollbackApplication(clusterId!, appName, { revision_id: revisionId });
      if (response.code === 200) {
        message.success({ content: t('plugins:argocd.rollbackSuccess'), key: 'rollback' });
        loadApplications();
        setDetailDrawerVisible(false);
      } else {
        message.error({ content: response.message || t('plugins:argocd.rollbackFailed'), key: 'rollback' });
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : t('plugins:argocd.rollbackFailed');
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
      title: t('plugins:argocd.appName'),
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
      title: t('plugins:argocd.project'),
      dataIndex: 'project',
      key: 'project',
      width: 120,
      render: (text: string) => <Tag>{text || 'default'}</Tag>,
    },
    {
      title: t('plugins:argocd.syncStatus'),
      dataIndex: 'sync_status',
      key: 'sync_status',
      width: 120,
      render: getSyncStatusTag,
    },
    {
      title: t('plugins:argocd.healthStatus'),
      dataIndex: 'health_status',
      key: 'health_status',
      width: 120,
      render: getHealthStatusBadge,
    },
    {
      title: t('plugins:argocd.gitPath'),
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
      title: t('common:table.version'),
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
      title: t('plugins:argocd.destNamespace'),
      dataIndex: ['destination', 'namespace'],
      key: 'dest_namespace',
      width: 130,
      render: (text: string) => <Tag color="blue">{text || '-'}</Tag>,
    },
    {
      title: t('common:table.actions'),
      key: 'actions',
      fixed: 'right',
      width: 200,
      render: (_: unknown, record: ArgoCDApplication) => (
        <Space size="small">
          <Tooltip title={t('plugins:argocd.sync')}>
            <Button
              type="primary"
              size="small"
              icon={<SyncOutlined />}
              onClick={() => handleSync(record.name)}
            />
          </Tooltip>
          <Tooltip title={t('plugins:argocd.appDetail')}>
            <Button 
              size="small" 
              icon={<EyeOutlined />}
              onClick={() => handleViewDetail(record)}
            />
          </Tooltip>
          <Popconfirm
            title={t('plugins:argocd.deleteConfirm')}
            description={t('plugins:argocd.deleteConfirmDesc')}
            onConfirm={() => handleDelete(record.name)}
            okText={t('common:actions.confirm')}
            cancelText={t('common:actions.cancel')}
          >
            <Tooltip title={t('common:actions.delete')}>
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
                <span>{t('plugins:argocd.notConfigured')}</span>
                <span style={{ color: '#999' }}>{t('plugins:argocd.notConfiguredDesc')}</span>
              </Space>
            }
          >
            <Space>
              <Button 
                type="primary" 
                icon={<SettingOutlined />}
                onClick={() => navigate(`/clusters/${clusterId}/config-center?tab=argocd`)}
              >
                {t('plugins:argocd.goToConfig')}
              </Button>
              <Button onClick={() => navigate(-1)}>
                {t('plugins:argocd.back')}
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
            <Statistic title={t('plugins:argocd.totalApps')} value={stats.total} />
          </Card>
        </Col>
        <Col span={4}>
          <Card size="small">
            <Statistic title={t('plugins:argocd.synced')} value={stats.synced} valueStyle={{ color: '#52c41a' }} />
          </Card>
        </Col>
        <Col span={4}>
          <Card size="small">
            <Statistic title={t('plugins:argocd.outOfSync')} value={stats.outOfSync} valueStyle={{ color: '#faad14' }} />
          </Card>
        </Col>
        <Col span={4}>
          <Card size="small">
            <Statistic title={t('plugins:argocd.healthy')} value={stats.healthy} valueStyle={{ color: '#52c41a' }} />
          </Card>
        </Col>
        <Col span={4}>
          <Card size="small">
            <Statistic title={t('plugins:argocd.degraded')} value={stats.degraded} valueStyle={{ color: '#ff4d4f' }} />
          </Card>
        </Col>
        <Col span={4}>
          <Card size="small" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
            <Button 
              type="link" 
              icon={<SettingOutlined />}
              onClick={() => navigate(`/clusters/${clusterId}/config-center?tab=argocd`)}
            >
              {t('plugins:argocd.configManagement')}
            </Button>
          </Card>
        </Col>
      </Row>

      {/* 应用列表 */}
      <Card
        title={t('plugins:argocd.title')}
        extra={
          <Space>
            <Button icon={<ReloadOutlined />} onClick={loadApplications}>
              {t('common:actions.refresh')}
            </Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateModalVisible(true)}>
              {t('plugins:argocd.createApp')}
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
            pagination={{ pageSize: 20, showSizeChanger: true, showTotal: (total) => t('plugins:argocd.totalCount', { total }) }}
            scroll={{ x: 1200 }}
          />
        ) : (
          <Empty 
            description={
              <span>
                {t('plugins:argocd.noApps')}
                <Button type="link" onClick={() => setCreateModalVisible(true)}>
                  {t('plugins:argocd.clickToCreate')}
                </Button>
              </span>
            }
          />
        )}
      </Card>

      {/* 创建应用弹窗 */}
      <Modal
        title={t('plugins:argocd.createAppTitle')}
        open={createModalVisible}
        onOk={handleCreate}
        onCancel={() => {
          setCreateModalVisible(false);
          form.resetFields();
        }}
        confirmLoading={creating}
        width={600}
        okText={t('plugins:argocd.createBtn')}
        cancelText={t('common:actions.cancel')}
      >
        <Form form={form} layout="vertical">
          <Form.Item
            name="name"
            label={t('plugins:argocd.appName')}
            rules={[
              { required: true, message: t('plugins:argocd.appNameRequired') },
              { pattern: /^[a-z0-9-]+$/, message: t('plugins:argocd.appNamePattern') }
            ]}
          >
            <Input placeholder="my-app" />
          </Form.Item>

          <Form.Item
            name="path"
            label={t('plugins:argocd.gitPath')}
            rules={[{ required: true, message: t('plugins:argocd.gitPathRequired') }]}
            extra={t('plugins:argocd.gitPathExtra')}
          >
            <Input placeholder="apps/my-app 或 environments/prod/my-app" />
          </Form.Item>

          <Form.Item
            name="target_revision"
            label={t('plugins:argocd.targetRevision')}
            initialValue="HEAD"
            extra={t('plugins:argocd.targetRevisionExtra')}
          >
            <Input placeholder="HEAD, main, v1.0.0, commit SHA" />
          </Form.Item>

          <Form.Item
            name="dest_namespace"
            label={t('plugins:argocd.destNamespace')}
            rules={[{ required: true, message: t('plugins:argocd.destNamespaceRequired') }]}
            extra={t('plugins:argocd.destNamespaceExtra')}
          >
            <Input placeholder="production" />
          </Form.Item>

          <Form.Item
            name="helm_values"
            label={t('plugins:argocd.helmValues')}
            extra={t('plugins:argocd.helmValuesExtra')}
          >
            <Input.TextArea rows={4} placeholder="replicaCount: 3&#10;image:&#10;  tag: latest" />
          </Form.Item>

          <Row gutter={16}>
            <Col span={8}>
              <Form.Item name="auto_sync" label={t('plugins:argocd.autoSync')} valuePropName="checked">
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
                        label={t('plugins:argocd.selfHeal')} 
                        valuePropName="checked"
                        tooltip={t('plugins:argocd.selfHealTooltip')}
                      >
                        <Switch />
                      </Form.Item>
                    </Col>
                    <Col span={8}>
                      <Form.Item 
                        name="prune" 
                        label={t('plugins:argocd.autoPrune')} 
                        valuePropName="checked"
                        tooltip={t('plugins:argocd.autoPruneTooltip')}
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
        title={`${t('plugins:argocd.appDetail')}: ${selectedApp?.name || ''}`}
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
              {t('plugins:argocd.sync')}
            </Button>
          </Space>
        }
      >
        {selectedApp && (
          <Tabs
            items={[
              {
                key: 'overview',
                label: t('plugins:argocd.overview'),
                children: (
                  <div>
                    <Descriptions column={2} bordered size="small">
                      <Descriptions.Item label={t('plugins:argocd.appName')}>{selectedApp.name}</Descriptions.Item>
                      <Descriptions.Item label={t('plugins:argocd.project')}>{selectedApp.project}</Descriptions.Item>
                      <Descriptions.Item label={t('plugins:argocd.syncStatus')}>{getSyncStatusTag(selectedApp.sync_status)}</Descriptions.Item>
                      <Descriptions.Item label={t('plugins:argocd.healthStatus')}>{getHealthStatusBadge(selectedApp.health_status)}</Descriptions.Item>
                      <Descriptions.Item label={t('plugins:argocd.gitRepo')} span={2}>
                        <a href={selectedApp.source?.repo_url} target="_blank" rel="noopener noreferrer">
                          {selectedApp.source?.repo_url}
                        </a>
                      </Descriptions.Item>
                      <Descriptions.Item label={t('plugins:argocd.gitPath')}>{selectedApp.source?.path}</Descriptions.Item>
                      <Descriptions.Item label={t('plugins:argocd.targetRevision')}>{selectedApp.target_revision}</Descriptions.Item>
                      <Descriptions.Item label={t('plugins:argocd.currentVersion')}>
                        <code>{selectedApp.synced_revision?.substring(0, 12)}</code>
                      </Descriptions.Item>
                      <Descriptions.Item label={t('plugins:argocd.destNamespace')}>
                        <Tag color="blue">{selectedApp.destination?.namespace}</Tag>
                      </Descriptions.Item>
                      <Descriptions.Item label={t('common:table.createdAt')}>{selectedApp.created_at}</Descriptions.Item>
                      <Descriptions.Item label={t('plugins:argocd.lastSync')}>{selectedApp.reconciled_at}</Descriptions.Item>
                    </Descriptions>
                  </div>
                ),
              },
              {
                key: 'resources',
                label: t('plugins:argocd.resourceList'),
                children: (
                  <Table
                    size="small"
                    dataSource={selectedApp.resources || []}
                    rowKey={(record: ArgoCDResource) => `${record.kind}-${record.namespace}-${record.name}`}
                    columns={[
                      { title: 'Kind', dataIndex: 'kind', key: 'kind', width: 120 },
                      { title: t('common:table.namespace'), dataIndex: 'namespace', key: 'namespace', width: 120 },
                      { title: t('common:table.name'), dataIndex: 'name', key: 'name' },
                      { 
                        title: t('plugins:argocd.healthStatus'), 
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
                label: t('plugins:argocd.syncHistory'),
                children: (
                  <Timeline
                    items={(selectedApp.history || []).slice(0, 10).map((h) => ({
                      color: 'green',
                      children: (
                        <div>
                          <div>
                            <strong>{t('plugins:argocd.version')}:</strong> <code>{h.revision?.substring(0, 12)}</code>
                            <Button 
                              type="link" 
                              size="small"
                              icon={<RollbackOutlined />}
                              onClick={() => handleRollback(selectedApp.name, h.id)}
                            >
                              {t('plugins:argocd.rollbackToVersion')}
                            </Button>
                          </div>
                          <div style={{ color: '#999', fontSize: 12 }}>
                            {t('plugins:argocd.deployTime')}: {h.deployed_at}
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

