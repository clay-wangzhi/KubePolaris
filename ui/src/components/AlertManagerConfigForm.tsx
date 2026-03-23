import React, { useState, useEffect, useCallback } from 'react';
import {
  Card,
  Form,
  Input,
  Select,
  Button,
  message,
  Space,
  Divider,
  Row,
  Col,
  Modal,
  Alert,
  Typography,
  Switch,
  Descriptions,
  Tag,
  Spin,
} from 'antd';
import {
  SaveOutlined,
  ExperimentOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  ReloadOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { alertService } from '../services/alertService';
import { parseApiError } from '../utils/api';
import type { AlertManagerConfig, AlertManagerStatus } from '../services/alertService';

const { Option } = Select;
const { Text } = Typography;

interface AlertManagerConfigFormProps {
  clusterId: string;
  onConfigChange?: () => void;
}

const AlertManagerConfigForm: React.FC<AlertManagerConfigFormProps> = ({
  clusterId,
  onConfigChange,
}) => {
  const { t } = useTranslation('components');
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [testing, setTesting] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [saveResult, setSaveResult] = useState<{ success: boolean; message: string } | null>(null);
  const [status, setStatus] = useState<AlertManagerStatus | null>(null);
  const [statusLoading, setStatusLoading] = useState(false);

  const loadCurrentConfig = useCallback(async () => {
    try {
      setLoading(true);
      const response = await alertService.getConfig(clusterId);
      const config = response;
      setEnabled(config.enabled);
      form.setFieldsValue({
        enabled: config.enabled,
        endpoint: config.endpoint,
        auth: config.auth || { type: 'none' },
      });
    } catch (error: unknown) {
      console.error('Failed to load Alertmanager config:', error);
      message.error(t('alertManagerConfig.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [clusterId, form]);

  const loadStatus = useCallback(async () => {
    if (!enabled) return;
    try {
      setStatusLoading(true);
      const response = await alertService.getStatus(clusterId);
      setStatus(response);
    } catch (error: unknown) {
      console.error('Failed to get Alertmanager status:', error);
      setStatus(null);
    } finally {
      setStatusLoading(false);
    }
  }, [clusterId, enabled]);

  useEffect(() => {
    loadCurrentConfig();
  }, [loadCurrentConfig]);

  useEffect(() => {
    if (enabled) {
      loadStatus();
    }
  }, [enabled, loadStatus]);

  const handleEnabledChange = (checked: boolean) => {
    setEnabled(checked);
    form.setFieldValue('enabled', checked);
  };

  const handleSave = async () => {
    try {
      setLoading(true);
      setSaveResult(null);

      const values = await form.validateFields();
      const config: AlertManagerConfig = {
        enabled: values.enabled,
        endpoint: values.endpoint || '',
        auth: values.auth,
      };

      await alertService.updateConfig(clusterId, config);

      const successMsg = t('alertManagerConfig.saveSuccess');
      message.success(successMsg);
      setSaveResult({ success: true, message: successMsg });
      onConfigChange?.();
      
      // 如果启用了，重新加载状态
      if (values.enabled) {
        loadStatus();
      }
    } catch (error: unknown) {
      console.error('Failed to save Alertmanager config:', error);

      if (error && typeof error === 'object' && 'errorFields' in error) {
        const errorMsg = t('alertManagerConfig.checkForm');
        message.error(errorMsg);
        setSaveResult({ success: false, message: errorMsg });
        return;
      }

      const errorMsg = parseApiError(error);

      message.error(errorMsg);
      setSaveResult({ success: false, message: errorMsg });
    } finally {
      setLoading(false);
    }
  };

  const handleTest = async () => {
    try {
      setTesting(true);
      setTestResult(null);

      const values = await form.validateFields();

      if (!values.enabled) {
        message.warning(t('alertManagerConfig.enableFirst'));
        setTestResult({ success: false, message: t('alertManagerConfig.notEnabled') });
        return;
      }

      const config: AlertManagerConfig = {
        enabled: values.enabled,
        endpoint: values.endpoint,
        auth: values.auth,
      };

      await alertService.testConnection(clusterId, config);

      const successMsg = t('alertManagerConfig.testSuccess');
      message.success(successMsg);
      setTestResult({ success: true, message: successMsg });
    } catch (error: unknown) {
      console.error('Connection test failed:', error);

      if (error && typeof error === 'object' && 'errorFields' in error) {
        const errorMsg = t('alertManagerConfig.checkForm');
        message.error(errorMsg);
        setTestResult({ success: false, message: errorMsg });
        return;
      }

      const errorMsg = parseApiError(error);

      message.error(errorMsg);
      setTestResult({ success: false, message: errorMsg });
    } finally {
      setTesting(false);
    }
  };

  const renderAuthConfig = () => {
    const authType = form.getFieldValue(['auth', 'type']);

    return (
      <Card title={t('alertManagerConfig.authConfig')} size="small">
        <Form.Item
          name={['auth', 'type']}
          label={t('alertManagerConfig.authType')}
          rules={[{ required: enabled, message: t('alertManagerConfig.authTypeRequired') }]}
          initialValue="none"
        >
          <Select placeholder={t('alertManagerConfig.selectAuthType')}>
            <Option value="none">{t('alertManagerConfig.noAuth')}</Option>
            <Option value="basic">Basic Auth</Option>
            <Option value="bearer">Bearer Token</Option>
          </Select>
        </Form.Item>

        {authType === 'none' && (
          <Alert
            message={t('alertManagerConfig.noAuth')}
            description={t('alertManagerConfig.noAuthDesc')}
            type="info"
            showIcon
            style={{ marginTop: 16 }}
          />
        )}

        {authType === 'basic' && (
          <>
            <Form.Item
              name={['auth', 'username']}
              label={t('alertManagerConfig.username')}
              rules={[{ required: true, message: t('alertManagerConfig.usernameRequired') }]}
            >
              <Input placeholder={t('alertManagerConfig.usernamePlaceholder')} />
            </Form.Item>
            <Form.Item
              name={['auth', 'password']}
              label={t('alertManagerConfig.password')}
              rules={[{ required: true, message: t('alertManagerConfig.passwordRequired') }]}
            >
              <Input.Password placeholder={t('alertManagerConfig.passwordPlaceholder')} />
            </Form.Item>
          </>
        )}

        {authType === 'bearer' && (
          <Form.Item
            name={['auth', 'token']}
            label={t('alertManagerConfig.token')}
            rules={[{ required: true, message: t('alertManagerConfig.tokenRequired') }]}
          >
            <Input.Password placeholder={t('alertManagerConfig.tokenPlaceholder')} />
          </Form.Item>
        )}
      </Card>
    );
  };

  const renderStatusCard = () => {
    if (!enabled) return null;

    return (
      <Card
        title={t('alertManagerConfig.status')}
        size="small"
        style={{ marginTop: 16 }}
        extra={
          <Button
            icon={<ReloadOutlined />}
            size="small"
            onClick={loadStatus}
            loading={statusLoading}
          >
            {t('alertManagerConfig.refresh')}
          </Button>
        }
      >
        {statusLoading ? (
          <div style={{ textAlign: 'center', padding: 24 }}>
            <Spin />
          </div>
        ) : status ? (
          <Descriptions column={2} size="small">
            <Descriptions.Item label={t('alertManagerConfig.version')}>
              {status.versionInfo?.version || '-'}
            </Descriptions.Item>
            <Descriptions.Item label={t('alertManagerConfig.clusterStatus')}>
              <Tag color={status.cluster?.status === 'ready' ? 'green' : 'orange'}>
                {status.cluster?.status || t('alertManagerConfig.unknown')}
              </Tag>
            </Descriptions.Item>
            <Descriptions.Item label={t('alertManagerConfig.clusterName')}>
              {status.cluster?.name || '-'}
            </Descriptions.Item>
            <Descriptions.Item label={t('alertManagerConfig.nodeCount')}>
              {status.cluster?.peers?.length || 0}
            </Descriptions.Item>
            <Descriptions.Item label={t('alertManagerConfig.goVersion')}>
              {status.versionInfo?.goVersion || '-'}
            </Descriptions.Item>
            <Descriptions.Item label={t('alertManagerConfig.buildDate')}>
              {status.versionInfo?.buildDate || '-'}
            </Descriptions.Item>
          </Descriptions>
        ) : (
          <Alert
            message={t('alertManagerConfig.cannotGetStatus')}
            description={t('alertManagerConfig.ensureConfigCorrect')}
            type="warning"
            showIcon
          />
        )}
      </Card>
    );
  };

  return (
    <div>
      <Spin spinning={loading}>
        <Card
          title={t('alertManagerConfig.title')}
          extra={
            <Space>
              <Button
                icon={<ExperimentOutlined />}
                onClick={handleTest}
                loading={testing}
                disabled={!enabled}
              >
                {t('alertManagerConfig.testConnection')}
              </Button>
              <Button
                type="primary"
                icon={<SaveOutlined />}
                onClick={handleSave}
                loading={loading}
              >
                {t('alertManagerConfig.saveConfig')}
              </Button>
            </Space>
          }
        >
          {/* 测试结果弹窗 */}
          <Modal
            open={testResult !== null}
            title={
              <Space>
                {testResult?.success ? (
                  <CheckCircleOutlined style={{ color: '#52c41a', fontSize: 20 }} />
                ) : (
                  <CloseCircleOutlined style={{ color: '#ff4d4f', fontSize: 20 }} />
                )}
                <span>{testResult?.success ? t('alertManagerConfig.testSuccess') : t('alertManagerConfig.testFailed')}</span>
              </Space>
            }
            onCancel={() => setTestResult(null)}
            footer={[
              <Button key="ok" type="primary" onClick={() => setTestResult(null)}>
                {t('alertManagerConfig.ok')}
              </Button>,
            ]}
          >
            <p>{testResult?.message}</p>
          </Modal>

          {/* 保存结果弹窗 */}
          <Modal
            open={saveResult !== null}
            title={
              <Space>
                {saveResult?.success ? (
                  <CheckCircleOutlined style={{ color: '#52c41a', fontSize: 20 }} />
                ) : (
                  <CloseCircleOutlined style={{ color: '#ff4d4f', fontSize: 20 }} />
                )}
                <span>{saveResult?.success ? t('alertManagerConfig.configSaveSuccess') : t('alertManagerConfig.configSaveFailed')}</span>
              </Space>
            }
            onCancel={() => setSaveResult(null)}
            footer={[
              <Button key="ok" type="primary" onClick={() => setSaveResult(null)}>
                {t('alertManagerConfig.ok')}
              </Button>,
            ]}
          >
            <p>{saveResult?.message}</p>
          </Modal>

          <Form form={form} layout="vertical" initialValues={{ enabled: false }}>
            <Row gutter={16}>
              <Col span={24}>
                <Form.Item name="enabled" label={t('alertManagerConfig.enableLabel')} valuePropName="checked">
                  <Switch
                    checked={enabled}
                    onChange={handleEnabledChange}
                    checkedChildren={t('alertManagerConfig.enabled')}
                    unCheckedChildren={t('alertManagerConfig.disabled')}
                  />
                </Form.Item>
              </Col>
            </Row>

            {enabled && (
              <>
                <Row gutter={16}>
                  <Col span={24}>
                    <Form.Item
                      name="endpoint"
                      label={t('alertManagerConfig.endpoint')}
                      rules={[
                        { required: enabled, message: t('alertManagerConfig.endpointRequired') },
                        { type: 'url', message: t('alertManagerConfig.urlInvalid') },
                      ]}
                    >
                      <Input placeholder="http://alertmanager:9093" />
                    </Form.Item>
                  </Col>
                </Row>

                <Divider />
                {renderAuthConfig()}
              </>
            )}
          </Form>
        </Card>

        {renderStatusCard()}

        <Card title={t('alertManagerConfig.configGuide')} style={{ marginTop: 16 }}>
          <Alert
            message={t('alertManagerConfig.configGuideTitle')}
            description={
              <div>
                <Text strong>{t('alertManagerConfig.endpointLabel')}</Text>
                <ul style={{ marginTop: 8 }}>
                  <li>
                    {t('alertManagerConfig.inClusterAccess')}<Text code>http://alertmanager.monitoring:9093</Text>
                  </li>
                  <li>
                    {t('alertManagerConfig.externalAccess')}<Text code>http://alertmanager.example.com:9093</Text>
                  </li>
                </ul>
                <Text strong>{t('alertManagerConfig.authConfigLabel')}</Text>
                <ul style={{ marginTop: 8 }}>
                  <li>{t('alertManagerConfig.noAuthGuide')}</li>
                  <li>{t('alertManagerConfig.basicAuthGuide')}</li>
                  <li>{t('alertManagerConfig.bearerTokenGuide')}</li>
                </ul>
              </div>
            }
            type="info"
            showIcon
          />
        </Card>
      </Spin>
    </div>
  );
};

export default AlertManagerConfigForm;

