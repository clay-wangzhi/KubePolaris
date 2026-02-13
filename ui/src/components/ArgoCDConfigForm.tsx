import React, { useState, useEffect, useCallback } from 'react';
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
import { useTranslation } from 'react-i18next';
import { argoCDService } from '../services/argoCDService';

const { Text } = Typography;

interface ArgoCDConfigFormProps {
  clusterId: string;
  onConfigChange?: () => void;
}

const ArgoCDConfigForm: React.FC<ArgoCDConfigFormProps> = ({
  clusterId,
  onConfigChange,
}) => {
  const { t } = useTranslation('components');
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'connected' | 'disconnected' | 'unknown'>('unknown');
  const [enabled, setEnabled] = useState(false);

  const loadConfig = useCallback(async () => {
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
      console.error('Failed to load config:', error);
      message.error(t('argoCDConfig.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [clusterId, form]);

  useEffect(() => {
    loadConfig();
  }, [loadConfig]);

  const handleSave = async () => {
    try {
      const values = await form.validateFields();
      setSaving(true);
      
      const response = await argoCDService.saveConfig(clusterId, values);
      if (response.code === 200) {
        message.success(t('argoCDConfig.saveSuccess'));
        onConfigChange?.();
      } else {
        message.error(response.message || t('argoCDConfig.saveFailed'));
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : t('argoCDConfig.saveFailed');
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
      
      const response = await argoCDService.testConnection(clusterId, values);
      if (response.code === 200 && response.data.connected) {
        message.success(t('argoCDConfig.testSuccess'));
        setConnectionStatus('connected');
      } else {
        message.error(response.message || t('argoCDConfig.testFailed'));
        setConnectionStatus('disconnected');
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : t('argoCDConfig.testError');
      message.error(errorMessage);
      setConnectionStatus('disconnected');
    } finally {
      setTesting(false);
    }
  };

  const renderConnectionStatus = () => {
    switch (connectionStatus) {
      case 'connected':
        return <Tag icon={<CheckCircleOutlined />} color="success">{t('argoCDConfig.connected')}</Tag>;
      case 'disconnected':
        return <Tag icon={<CloseCircleOutlined />} color="error">{t('argoCDConfig.disconnected')}</Tag>;
      default:
        return <Tag color="default">{t('argoCDConfig.notTested')}</Tag>;
    }
  };

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: 60 }}>
        <Spin size="large" tip={t('argoCDConfig.loading')} />
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 900 }}>
      <Form form={form} layout="vertical">
        {/* 启用开关 */}
        <Card style={{ marginBottom: 24 }}>
          <Form.Item
            name="enabled"
            label={
              <span>
                {t('argoCDConfig.enableLabel')}
                <Tooltip title={t('argoCDConfig.enableTooltip')}>
                  <QuestionCircleOutlined style={{ marginLeft: 8, color: '#999' }} />
                </Tooltip>
              </span>
            }
            valuePropName="checked"
          >
            <Switch 
              onChange={(checked) => setEnabled(checked)}
              checkedChildren={t('argoCDConfig.enabled')} 
              unCheckedChildren={t('argoCDConfig.disabled')}
            />
          </Form.Item>
        </Card>

        {enabled && (
          <>
            {/* ArgoCD 服务器配置 */}
            <Card 
              title={
                <Space>
                  <LinkOutlined />
                  {t('argoCDConfig.serverConfig')}
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
                  {t('argoCDConfig.testConnection')}
                </Button>
              }
            >
              <Form.Item
                name="server_url"
                label={t('argoCDConfig.serverUrl')}
                rules={[{ required: true, message: t('argoCDConfig.serverUrlRequired') }]}
                extra={t('argoCDConfig.serverUrlExtra')}
              >
                <Input placeholder="https://argocd.example.com" />
              </Form.Item>

              <Form.Item
                name="auth_type"
                label={t('argoCDConfig.authType')}
                initialValue="token"
              >
                <Select>
                  <Select.Option value="token">{t('argoCDConfig.tokenAuth')}</Select.Option>
                  <Select.Option value="username">{t('argoCDConfig.passwordAuth')}</Select.Option>
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
                      label={t('argoCDConfig.apiToken')}
                      rules={[{ required: true, message: t('argoCDConfig.tokenRequired') }]}
                      extra={
                        <span>
                          {t('argoCDConfig.tokenExtra')}
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
                        label={t('argoCDConfig.username')}
                        rules={[{ required: true, message: t('argoCDConfig.usernameRequired') }]}
                      >
                        <Input placeholder="admin" />
                      </Form.Item>
                      <Form.Item
                        name="password"
                        label={t('argoCDConfig.passwordLabel')}
                        rules={[{ required: true, message: t('argoCDConfig.passwordRequired') }]}
                      >
                        <Input.Password placeholder={t('argoCDConfig.passwordPlaceholder')} />
                      </Form.Item>
                    </>
                  )
                }
              </Form.Item>

              <Form.Item
                name="insecure"
                label={t('argoCDConfig.skipTLS')}
                valuePropName="checked"
                extra={t('argoCDConfig.skipTLSExtra')}
              >
                <Switch />
              </Form.Item>
            </Card>

            {/* Git 仓库配置 */}
            <Card
              title={
                <Space>
                  <GithubOutlined />
                  {t('argoCDConfig.gitRepoConfig')}
                </Space>
              }
              style={{ marginBottom: 24 }}
            >
              <Alert
                message={t('argoCDConfig.gitRepoDesc')}
                description={t('argoCDConfig.gitRepoDescContent')}
                type="info"
                showIcon
                style={{ marginBottom: 16 }}
              />

              <Form.Item
                name="git_repo_url"
                label={t('argoCDConfig.gitRepoUrl')}
                rules={[{ required: true, message: t('argoCDConfig.gitRepoUrlRequired') }]}
              >
                <Input placeholder="https://github.com/your-org/k8s-configs.git" />
              </Form.Item>

              <Form.Item
                name="git_branch"
                label={t('argoCDConfig.gitBranch')}
                initialValue="main"
              >
                <Input placeholder="main" />
              </Form.Item>

              <Form.Item
                name="git_path"
                label={t('argoCDConfig.gitPath')}
                extra={t('argoCDConfig.gitPathExtra')}
              >
                <Input placeholder="/apps 或 /environments/prod" />
              </Form.Item>

              <Divider>{t('argoCDConfig.gitAuth')}</Divider>

              <Form.Item
                name="git_auth_type"
                label={t('argoCDConfig.gitAuthType')}
                initialValue="https"
              >
                <Select>
                  <Select.Option value="https">{t('argoCDConfig.httpsAuth')}</Select.Option>
                  <Select.Option value="ssh">{t('argoCDConfig.sshAuth')}</Select.Option>
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
                      label={t('argoCDConfig.sshKey')}
                    >
                      <Input.TextArea 
                        rows={4} 
                        placeholder="-----BEGIN RSA PRIVATE KEY-----&#10;...&#10;-----END RSA PRIVATE KEY-----" 
                      />
                    </Form.Item>
                  ) : (
                    <>
                      <Form.Item name="git_username" label={t('argoCDConfig.gitUsername')}>
                        <Input placeholder={t('argoCDConfig.gitUsernamePlaceholder')} />
                      </Form.Item>
                      <Form.Item name="git_password" label={t('argoCDConfig.gitPassword')}>
                        <Input.Password placeholder={t('argoCDConfig.gitPasswordPlaceholder')} />
                      </Form.Item>
                    </>
                  )
                }
              </Form.Item>
            </Card>

            {/* 目标集群配置 */}
            <Card
              title={
                <Space>
                  <ClusterOutlined />
                  {t('argoCDConfig.targetClusterConfig')}
                </Space>
              }
              style={{ marginBottom: 24 }}
            >
              <Alert
                message={t('argoCDConfig.clusterNameDesc')}
                description={
                  <div>
                    {t('argoCDConfig.clusterNameDescContent')}
                    <ul style={{ marginBottom: 0, marginTop: 8 }}>
                      <li><Text code>in-cluster</Text> - {t('argoCDConfig.inCluster')}</li>
                      <li><Text code>https://kubernetes.default.svc</Text> - {t('argoCDConfig.defaultClusterUrl')}</li>
                      <li>{t('argoCDConfig.customClusterName')}</li>
                    </ul>
                  </div>
                }
                type="info"
                showIcon
                style={{ marginBottom: 16 }}
              />

              <Form.Item
                name="argocd_cluster_name"
                label={t('argoCDConfig.argoClusterName')}
                rules={[{ required: true, message: t('argoCDConfig.argoClusterNameRequired') }]}
                extra={t('argoCDConfig.argoClusterNameExtra')}
              >
                <Input placeholder="in-cluster / https://kubernetes.default.svc" />
              </Form.Item>

              <Form.Item
                name="argocd_project"
                label={t('argoCDConfig.argoProject')}
                initialValue="default"
                extra={t('argoCDConfig.argoProjectExtra')}
              >
                <Input placeholder="default" />
              </Form.Item>
            </Card>
          </>
        )}

        {/* 保存按钮 */}
        <div style={{ textAlign: 'right', marginTop: 24 }}>
          <Space>
            <Button onClick={loadConfig}>{t('argoCDConfig.reset')}</Button>
            <Button 
              type="primary" 
              loading={saving} 
              onClick={handleSave}
              icon={<SaveOutlined />}
              size="large"
            >
              {t('argoCDConfig.saveConfig')}
            </Button>
          </Space>
        </div>
      </Form>
    </div>
  );
};

export default ArgoCDConfigForm;

