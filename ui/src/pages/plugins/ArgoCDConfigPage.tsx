import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import {
  Card,
  Form,
  Input,
  Switch,
  Button,
  Space,
  Divider,
  Alert,
  Tag,
  Select,
  message,
  Spin,
  Typography,
  Tooltip,
} from 'antd';
import {
  CheckCircleOutlined,
  CloseCircleOutlined,
  LinkOutlined,
  GithubOutlined,
  ClusterOutlined,
  QuestionCircleOutlined,
  SaveOutlined,
  ApiOutlined,
} from '@ant-design/icons';
import { argoCDService } from '../../services/argoCDService';
import { useTranslation } from 'react-i18next';

const { Text } = Typography;

const ArgoCDConfigPage: React.FC = () => {
  const { clusterId } = useParams<{ clusterId: string }>();
const { t } = useTranslation(['plugins', 'common']);
const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'connected' | 'disconnected' | 'unknown'>('unknown');
  const [enabled, setEnabled] = useState(false);

  const loadConfig = async () => {
    if (!clusterId) return;
    setLoading(true);
    try {
      const response = await argoCDService.getConfig(clusterId);
      if (response.code === 200 && response.data) {
        form.setFieldsValue(response.data);
        setEnabled(response.data.enabled);
        setConnectionStatus(
          response.data.connection_status === 'connected' ? 'connected' : 
          response.data.connection_status === 'disconnected' ? 'disconnected' : 'unknown'
        );
      }
    } catch (error) {
      console.error('加载配置失败:', error);
      message.error(t('plugins:config.loadConfigFailed'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadConfig();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clusterId]);

  const handleSave = async () => {
    try {
      const values = await form.validateFields();
      setSaving(true);
      
      const response = await argoCDService.saveConfig(clusterId!, values);
      if (response.code === 200) {
        message.success(t('plugins:config.saveSuccess'));
      } else {
        message.error(response.message || t('plugins:config.saveFailed'));
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : t('plugins:config.saveFailed');
      message.error(errorMessage);
    } finally {
      setSaving(false);
    }
  };

  const handleTestConnection = async () => {
    try {
      const values = await form.validateFields([
        'server_url', 
        'auth_type', 
        'token', 
        'username', 
        'password', 
        'insecure'
      ]);
      setTesting(true);
      
      const response = await argoCDService.testConnection(clusterId!, values);
      if (response.code === 200 && response.data.connected) {
        message.success(t('plugins:config.connectionSuccess'));
        setConnectionStatus('connected');
      } else {
        message.error(response.message || t('plugins:config.connectionFailed'));
        setConnectionStatus('disconnected');
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : t('plugins:config.testFailed');
      message.error(errorMessage);
      setConnectionStatus('disconnected');
    } finally {
      setTesting(false);
    }
  };

  const renderConnectionStatus = () => {
    switch (connectionStatus) {
      case 'connected':
        return <Tag icon={<CheckCircleOutlined />} color="success">{t('plugins:config.connected')}</Tag>;
      case 'disconnected':
        return <Tag icon={<CloseCircleOutlined />} color="error">{t('plugins:config.disconnected')}</Tag>;
      default:
        return <Tag color="default">{t('plugins:config.notTested')}</Tag>;
    }
  };

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: 100 }}>
        <Spin size="large" tip={t('plugins:config.loadingConfig')} />
      </div>
    );
  }

  return (
    <div style={{ padding: 24, maxWidth: 900, margin: '0 auto' }}>
      {/* 页面标题 */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
          <ApiOutlined style={{ fontSize: 28, color: '#fa8c16' }} />
          <h2 style={{ margin: 0 }}>{t('plugins:config.title')}</h2>
        </div>
        <Text type="secondary">
          {t('plugins:config.description')}
        </Text>
      </div>

      <Form form={form} layout="vertical">
        {/* 启用开关 */}
        <Card style={{ marginBottom: 24 }}>
          <Form.Item
            name="enabled"
            label={
              <span>
                {t('plugins:config.enableIntegration')}
                <Tooltip title={t('plugins:config.enableIntegrationTooltip')}>
                  <QuestionCircleOutlined style={{ marginLeft: 8, color: '#999' }} />
                </Tooltip>
              </span>
            }
            valuePropName="checked"
          >
            <Switch 
              onChange={(checked) => setEnabled(checked)}
              checkedChildren={t('plugins:config.isEnabled')} 
              unCheckedChildren={t('plugins:config.isDisabled')}
            />
          </Form.Item>
        </Card>

        {enabled && (
          <>
            {/* {t('plugins:config.serverConfig')} */}
            <Card 
              title={
                <Space>
                  <LinkOutlined />
                  ArgoCD 服务器配置
                  {renderConnectionStatus()}
                </Space>
              }
              style={{ marginBottom: 24 }}
              extra={
                <Button 
                  type="primary" 
                  loading={testing} 
                  onClick={handleTestConnection}
                  icon={<ApiOutlined />}
                >
                  {t('plugins:config.testConnection')}
                </Button>
              }
            >
              <Form.Item
                name="server_url"
                label={t('plugins:config.serverAddress')}
                rules={[{ required: true, message: t('plugins:config.serverAddressRequired') }]}
                extra={t('plugins:config.serverAddressExtra')}
              >
                <Input placeholder="https://argocd.example.com" />
              </Form.Item>

              <Form.Item
                name="auth_type"
                label={t('plugins:config.authType')}
                initialValue="token"
              >
                <Select>
                  <Select.Option value="token">{t('plugins:config.apiTokenRecommend')}</Select.Option>
                  <Select.Option value="username">{t('plugins:config.usernamePassword')}</Select.Option>
                </Select>
              </Form.Item>

              <Form.Item
                noStyle
                shouldUpdate={(prevValues, currentValues) => prevValues.auth_type !== currentValues.auth_type}
              >
                {({ getFieldValue }) =>
                  getFieldValue('auth_type') === 'token' ? (
                    <Form.Item
                      name="token"
                      label={t('plugins:config.apiToken')}
                      rules={[{ required: true, message: t('plugins:config.apiTokenRequired') }]}
                      extra={
                        <span>
                          在 ArgoCD 设置中创建 API Token: Settings → Accounts → 
                          <Text code>argocd account generate-token</Text>
                        </span>
                      }
                    >
                      <Input.Password placeholder="ArgoCD API Token" />
                    </Form.Item>
                  ) : (
                    <>
                      <Form.Item
                        name="username"
                        label={t('plugins:config.username')}
                        rules={[{ required: true, message: t('plugins:config.usernameRequired') }]}
                      >
                        <Input placeholder="admin" />
                      </Form.Item>
                      <Form.Item
                        name="password"
                        label={t('plugins:config.passwordLabel')}
                        rules={[{ required: true, message: t('plugins:config.passwordRequired') }]}
                      >
                        <Input.Password placeholder={t('plugins:config.passwordPlaceholder')} />
                      </Form.Item>
                    </>
                  )
                }
              </Form.Item>

              <Form.Item
                name="insecure"
                label={t('plugins:config.skipTlsVerify')}
                valuePropName="checked"
                extra={t('plugins:config.skipTlsVerifyExtra')}
              >
                <Switch />
              </Form.Item>
            </Card>

            {/* {t('plugins:config.gitConfig')} */}
            <Card
              title={
                <Space>
                  <GithubOutlined />
                  Git 仓库配置
                </Space>
              }
              style={{ marginBottom: 24 }}
            >
              <Alert
                message={t('plugins:config.gitConfig')}
                description={t('plugins:config.gitConfigDesc')}
                type="info"
                showIcon
                style={{ marginBottom: 16 }}
              />

              <Form.Item
                name="git_repo_url"
                label={t('plugins:config.gitRepoUrl')}
                rules={[{ required: true, message: t('plugins:config.gitRepoUrlRequired') }]}
              >
                <Input placeholder="https://github.com/your-org/k8s-configs.git" />
              </Form.Item>

              <Form.Item
                name="git_branch"
                label={t('plugins:config.gitBranch')}
                initialValue="main"
              >
                <Input placeholder="main" />
              </Form.Item>

              <Form.Item
                name="git_path"
                label={t('plugins:config.gitPath')}
                extra={t('plugins:config.gitPathExtra')}
              >
                <Input placeholder="/apps 或 /environments/prod" />
              </Form.Item>

              <Divider>{t('plugins:config.gitAuth')}</Divider>

              <Form.Item
                name="git_auth_type"
                label={t('plugins:config.gitAuthType')}
                initialValue="https"
              >
                <Select>
                  <Select.Option value="https">{t('plugins:config.httpsAuth')}</Select.Option>
                  <Select.Option value="ssh">{t('plugins:config.sshAuth')}</Select.Option>
                </Select>
              </Form.Item>

              <Form.Item
                noStyle
                shouldUpdate={(prevValues, currentValues) => prevValues.git_auth_type !== currentValues.git_auth_type}
              >
                {({ getFieldValue }) =>
                  getFieldValue('git_auth_type') === 'ssh' ? (
                    <Form.Item
                      name="git_ssh_key"
                      label={t('plugins:config.sshPrivateKey')}
                    >
                      <Input.TextArea 
                        rows={4} 
                        placeholder="-----BEGIN RSA PRIVATE KEY-----&#10;...&#10;-----END RSA PRIVATE KEY-----" 
                      />
                    </Form.Item>
                  ) : (
                    <>
                      <Form.Item name="git_username" label={t('plugins:config.gitUsername')}>
                        <Input placeholder={t('plugins:config.gitUsernamePlaceholder')} />
                      </Form.Item>
                      <Form.Item name="git_password" label={t('plugins:config.gitPasswordToken')}>
                        <Input.Password placeholder={t('plugins:config.gitPasswordTokenPlaceholder')} />
                      </Form.Item>
                    </>
                  )
                }
              </Form.Item>
            </Card>

            {/* {t('plugins:config.clusterConfig')} */}
            <Card
              title={
                <Space>
                  <ClusterOutlined />
                  目标集群配置
                </Space>
              }
              style={{ marginBottom: 24 }}
            >
              <Alert
                message={t('plugins:config.clusterConfig')}
                description={
                  <div>
                    {t('plugins:config.clusterConfigDesc')}
                    <ul style={{ marginBottom: 0, marginTop: 8 }}>
                      <li><Text code>in-cluster</Text> - {t('plugins:config.clusterInCluster')}</li>
                      <li><Text code>https://kubernetes.default.svc</Text> - {t('plugins:config.clusterDefaultSvc')}</li>
                      <li>{t('plugins:config.clusterCustom')}</li>
                    </ul>
                  </div>
                }
                type="info"
                showIcon
                style={{ marginBottom: 16 }}
              />

              <Form.Item
                name="argocd_cluster_name"
                label={t('plugins:config.argocdClusterName')}
                rules={[{ required: true, message: t('plugins:config.argocdClusterNameRequired') }]}
                extra={t('plugins:config.argocdClusterNameExtra')}
              >
                <Input placeholder="in-cluster / https://kubernetes.default.svc" />
              </Form.Item>

              <Form.Item
                name="argocd_project"
                label={t('plugins:config.argocdProject')}
                initialValue="default"
                extra={t('plugins:config.argocdProjectExtra')}
              >
                <Input placeholder="default" />
              </Form.Item>
            </Card>
          </>
        )}

        {/* 保存按钮 */}
        <div style={{ textAlign: 'right', marginTop: 24 }}>
          <Space>
            <Button onClick={loadConfig}>{t('common:actions.reset')}</Button>
            <Button 
              type="primary" 
              loading={saving} 
              onClick={handleSave}
              icon={<SaveOutlined />}
              size="large"
            >
              {t('plugins:config.saveConfig')}
            </Button>
          </Space>
        </div>
      </Form>
    </div>
  );
};

export default ArgoCDConfigPage;

