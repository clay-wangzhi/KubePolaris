import React, { useState, useEffect, useCallback } from 'react';
import {
  Card,
  Form,
  Input,
  Button,
  Space,
  Typography,
  Divider,
  App,
  Alert,
  Spin,
  Tag,
  List,
} from 'antd';
import {
  DashboardOutlined,
  DatabaseOutlined,
  SaveOutlined,
  ApiOutlined,
  LinkOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  SyncOutlined,
} from '@ant-design/icons';
import { systemSettingService } from '../../services/authService';
import type { GrafanaConfig, GrafanaDashboardSyncStatus, GrafanaDataSourceSyncStatus } from '../../types';
import { useTranslation } from 'react-i18next';
import { invalidateGrafanaUrlCache } from '../../hooks/useGrafanaUrl';

const { Title, Text } = Typography;

const GrafanaSettings: React.FC = () => {
  const { t } = useTranslation(['settings', 'common']);
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncingDS, setSyncingDS] = useState(false);
  const [hasApiKey, setHasApiKey] = useState(false);
  const [dashboardStatus, setDashboardStatus] = useState<GrafanaDashboardSyncStatus | null>(null);
  const [dataSourceStatus, setDataSourceStatus] = useState<GrafanaDataSourceSyncStatus | null>(null);
  const { message } = App.useApp();

  const fetchDashboardStatus = useCallback(async () => {
    try {
      const response = await systemSettingService.getGrafanaDashboardStatus();
      setDashboardStatus(response);
    } catch {
      // Dashboard 状态查询失败不影响主流程
    }
  }, []);

  const fetchDataSourceStatus = useCallback(async () => {
    try {
      const response = await systemSettingService.getGrafanaDataSourceStatus();
      setDataSourceStatus(response);
    } catch {
      // 数据源状态查询失败不影响主流程
    }
  }, []);

  useEffect(() => {
    const fetchConfig = async () => {
      try {
        const response = await systemSettingService.getGrafanaConfig();
        {
          const config = response;

          if (config.api_key === '******') {
            setHasApiKey(true);
            config.api_key = '';
          }

          form.setFieldsValue(config);

          if (config.url) {
            fetchDashboardStatus();
            fetchDataSourceStatus();
          }
        }
      } catch (error) {
        message.error(t('settings:grafana.loadConfigFailed'));
        console.error(error);
      } finally {
        setLoading(false);
      }
    };

    fetchConfig();
  }, [form, message, t, fetchDashboardStatus, fetchDataSourceStatus]);

  const getSubmitData = (): GrafanaConfig => {
    const values = form.getFieldsValue();
    const submitData = { ...values };
    if (!submitData.api_key && hasApiKey) {
      submitData.api_key = '******';
    }
    return submitData;
  };

  const handleSave = async () => {
    try {
      await form.validateFields();
      setSaving(true);

      const submitData = getSubmitData();

      await systemSettingService.updateGrafanaConfig(submitData);
      message.success(t('settings:grafana.saveConfigSuccess'));
      invalidateGrafanaUrlCache();
      if (form.getFieldValue('api_key')) {
        setHasApiKey(true);
        form.setFieldValue('api_key', '');
      }
      fetchDashboardStatus();
      fetchDataSourceStatus();
    } catch (error) {
      message.error(t('settings:grafana.saveConfigFailed'));
      console.error(error);
    } finally {
      setSaving(false);
    }
  };

  const handleTestConnection = async () => {
    try {
      const url = form.getFieldValue('url');
      if (!url) {
        message.warning(t('settings:grafana.urlRequired'));
        return;
      }

      setTesting(true);

      const submitData = getSubmitData();

      const response = await systemSettingService.testGrafanaConnection(submitData);
      if (response?.success) {
        message.success(t('settings:grafana.testConnectionSuccess'));
        fetchDashboardStatus();
        fetchDataSourceStatus();
      } else {
        message.error(t('settings:grafana.testConnectionFailed'));
      }
    } catch (error) {
      message.error(t('settings:grafana.testConnectionFailed'));
      console.error(error);
    } finally {
      setTesting(false);
    }
  };

  const handleSyncDataSources = async () => {
    try {
      setSyncingDS(true);
      const response = await systemSettingService.syncGrafanaDataSources();
      setDataSourceStatus(response);
      if (response?.all_synced) {
        message.success(t('settings:grafana.syncDataSourcesSuccess'));
      } else {
        message.warning(t('settings:grafana.syncDataSourcesPartial'));
      }
    } catch (error) {
      message.error(t('settings:grafana.syncDataSourcesFailed'));
      console.error(error);
    } finally {
      setSyncingDS(false);
    }
  };

  const handleSyncDashboards = async () => {
    try {
      setSyncing(true);
      const response = await systemSettingService.syncGrafanaDashboards();
      setDashboardStatus(response);
      if (response?.all_synced) {
        message.success(t('settings:grafana.syncDashboardsSuccess'));
      } else {
        message.warning(t('settings:grafana.syncDashboardsPartial'));
      }
    } catch (error) {
      message.error(t('settings:grafana.syncDashboardsFailed'));
      console.error(error);
    } finally {
      setSyncing(false);
    }
  };

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: 48 }}>
        <Spin size="large" />
      </div>
    );
  }

  return (
    <div>
      <Card>
        <div style={{ marginBottom: 24 }}>
          <Title level={4} style={{ margin: 0 }}>
            <DashboardOutlined style={{ marginRight: 8 }} />
            {t('settings:grafana.title')}
          </Title>
          <Text type="secondary">
            {t('settings:grafana.description')}
          </Text>
        </div>

        <Alert
          message={t('settings:grafana.tip')}
          description={
            <div>
              <p>{t('settings:grafana.tipDesc')}</p>
              <p style={{ marginBottom: 0 }}>{t('settings:grafana.allowEmbeddingTip')}</p>
            </div>
          }
          type="info"
          showIcon
          style={{ marginBottom: 24 }}
        />

        <Form
          form={form}
          layout="vertical"
          initialValues={{
            url: '',
            api_key: '',
          }}
        >
          <Divider>{t('settings:grafana.connectionConfig')}</Divider>

          <Form.Item
            name="url"
            label={t('settings:grafana.url')}
            rules={[{ required: true, message: t('settings:grafana.urlRequired') }]}
            tooltip={t('settings:grafana.urlTooltip')}
          >
            <Input
              prefix={<LinkOutlined />}
              placeholder={t('settings:grafana.urlPlaceholder')}
            />
          </Form.Item>

          <Form.Item
            name="api_key"
            label={
              <Space>
                <span>{t('settings:grafana.apiKey')}</span>
                {hasApiKey && (
                  <Tag color="green" icon={<CheckCircleOutlined />}>
                    {t('settings:grafana.configured')}
                  </Tag>
                )}
              </Space>
            }
            tooltip={t('settings:grafana.apiKeyTooltip')}
          >
            <Input.Password
              prefix={<ApiOutlined />}
              placeholder={hasApiKey
                ? t('settings:grafana.apiKeyConfiguredPlaceholder')
                : t('settings:grafana.apiKeyPlaceholder')}
            />
          </Form.Item>

          <Divider />

          <Form.Item>
            <Space>
              <Button
                type="primary"
                icon={<SaveOutlined />}
                loading={saving}
                onClick={handleSave}
              >
                {t('settings:grafana.saveConfig')}
              </Button>
              <Button
                icon={<ApiOutlined />}
                loading={testing}
                onClick={handleTestConnection}
              >
                {t('settings:grafana.testConnection')}
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Card>

      <Card style={{ marginTop: 16 }}>
        <div style={{ marginBottom: 16 }}>
          <Title level={4} style={{ margin: 0 }}>
            <SyncOutlined style={{ marginRight: 8 }} />
            {t('settings:grafana.dashboardSync')}
          </Title>
          <Text type="secondary">
            {t('settings:grafana.dashboardSyncDesc')}
          </Text>
        </div>

        {dashboardStatus && (
          <div style={{ marginBottom: 16 }}>
            <List
              size="small"
              bordered
              header={
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span>
                    {t('settings:grafana.folder')}:
                    {dashboardStatus.folder_exists ? (
                      <Tag color="green" icon={<CheckCircleOutlined />} style={{ marginLeft: 8 }}>
                        KubePolaris
                      </Tag>
                    ) : (
                      <Tag color="red" icon={<CloseCircleOutlined />} style={{ marginLeft: 8 }}>
                        {t('settings:grafana.notCreated')}
                      </Tag>
                    )}
                  </span>
                  {dashboardStatus.all_synced && (
                    <Tag color="green">{t('settings:grafana.allSynced')}</Tag>
                  )}
                </div>
              }
              dataSource={dashboardStatus.dashboards ?? []}
              renderItem={(item) => (
                <List.Item>
                  <Space>
                    {item.exists ? (
                      <CheckCircleOutlined style={{ color: '#52c41a' }} />
                    ) : (
                      <CloseCircleOutlined style={{ color: '#ff4d4f' }} />
                    )}
                    <Text>{item.title}</Text>
                    <Text type="secondary" style={{ fontSize: 12 }}>({item.uid})</Text>
                  </Space>
                  <Tag color={item.exists ? 'green' : 'red'}>
                    {item.exists ? t('settings:grafana.synced') : t('settings:grafana.notSynced')}
                  </Tag>
                </List.Item>
              )}
            />
          </div>
        )}

        {!dashboardStatus && (
          <Alert
            message={t('settings:grafana.dashboardStatusUnavailable')}
            type="warning"
            showIcon
            style={{ marginBottom: 16 }}
          />
        )}

        <Button
          type="primary"
          icon={<SyncOutlined />}
          loading={syncing}
          onClick={handleSyncDashboards}
          disabled={!hasApiKey && !form.getFieldValue('api_key')}
        >
          {t('settings:grafana.syncDashboards')}
        </Button>
      </Card>

      <Card style={{ marginTop: 16 }}>
        <div style={{ marginBottom: 16 }}>
          <Title level={4} style={{ margin: 0 }}>
            <DatabaseOutlined style={{ marginRight: 8 }} />
            {t('settings:grafana.dataSourceSync')}
          </Title>
          <Text type="secondary">
            {t('settings:grafana.dataSourceSyncDesc')}
          </Text>
        </div>

        {dataSourceStatus && dataSourceStatus.datasources?.length > 0 ? (
          <div style={{ marginBottom: 16 }}>
            <List
              size="small"
              bordered
              header={
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span>{t('settings:grafana.dataSourceList')}</span>
                  {dataSourceStatus.all_synced && (
                    <Tag color="green">{t('settings:grafana.allSynced')}</Tag>
                  )}
                </div>
              }
              dataSource={dataSourceStatus.datasources ?? []}
              renderItem={(item) => (
                <List.Item>
                  <Space>
                    {item.exists ? (
                      <CheckCircleOutlined style={{ color: '#52c41a' }} />
                    ) : (
                      <CloseCircleOutlined style={{ color: '#ff4d4f' }} />
                    )}
                    <Text strong>{item.cluster_name}</Text>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      {item.prometheus_url}
                    </Text>
                  </Space>
                  <Tag color={item.exists ? 'green' : 'red'}>
                    {item.exists ? t('settings:grafana.synced') : t('settings:grafana.notSynced')}
                  </Tag>
                </List.Item>
              )}
            />
          </div>
        ) : (
          <Alert
            message={t('settings:grafana.noMonitoringClusters')}
            type="info"
            showIcon
            style={{ marginBottom: 16 }}
          />
        )}

        <Button
          type="primary"
          icon={<SyncOutlined />}
          loading={syncingDS}
          onClick={handleSyncDataSources}
          disabled={!hasApiKey && !form.getFieldValue('api_key')}
        >
          {t('settings:grafana.syncDataSources')}
        </Button>
      </Card>
    </div>
  );
};

export default GrafanaSettings;
