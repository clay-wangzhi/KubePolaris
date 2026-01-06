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
      console.error('加载配置失败:', error);
      message.error('加载配置失败');
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
        message.success('配置保存成功');
        onConfigChange?.();
      } else {
        message.error(response.message || '保存失败');
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : '保存失败';
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
        message.success('ArgoCD 连接成功！');
        setConnectionStatus('connected');
      } else {
        message.error(response.message || '连接失败');
        setConnectionStatus('disconnected');
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : '连接测试失败';
      message.error(errorMessage);
      setConnectionStatus('disconnected');
    } finally {
      setTesting(false);
    }
  };

  const renderConnectionStatus = () => {
    switch (connectionStatus) {
      case 'connected':
        return <Tag icon={<CheckCircleOutlined />} color="success">已连接</Tag>;
      case 'disconnected':
        return <Tag icon={<CloseCircleOutlined />} color="error">未连接</Tag>;
      default:
        return <Tag color="default">未测试</Tag>;
    }
  };

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: 60 }}>
        <Spin size="large" tip="加载配置中..." />
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
                启用 ArgoCD 集成
                <Tooltip title="启用后，可以通过 ArgoCD 管理此集群的应用部署">
                  <QuestionCircleOutlined style={{ marginLeft: 8, color: '#999' }} />
                </Tooltip>
              </span>
            }
            valuePropName="checked"
          >
            <Switch 
              onChange={(checked) => setEnabled(checked)}
              checkedChildren="已启用" 
              unCheckedChildren="未启用"
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
                  测试连接
                </Button>
              }
            >
              <Form.Item
                name="server_url"
                label="ArgoCD 服务器地址"
                rules={[{ required: true, message: '请输入 ArgoCD 地址' }]}
                extra="ArgoCD 的访问地址，例如: https://argocd.example.com"
              >
                <Input placeholder="https://argocd.example.com" />
              </Form.Item>

              <Form.Item
                name="auth_type"
                label="认证方式"
                initialValue="token"
              >
                <Select>
                  <Select.Option value="token">API Token（推荐）</Select.Option>
                  <Select.Option value="username">用户名密码</Select.Option>
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
                      label="API Token"
                      rules={[{ required: true, message: '请输入 Token' }]}
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
                        label="用户名"
                        rules={[{ required: true, message: '请输入用户名' }]}
                      >
                        <Input placeholder="admin" />
                      </Form.Item>
                      <Form.Item
                        name="password"
                        label="密码"
                        rules={[{ required: true, message: '请输入密码' }]}
                      >
                        <Input.Password placeholder="密码" />
                      </Form.Item>
                    </>
                  )
                }
              </Form.Item>

              <Form.Item
                name="insecure"
                label="跳过 TLS 验证"
                valuePropName="checked"
                extra="如果 ArgoCD 使用自签名证书，请开启此选项"
              >
                <Switch />
              </Form.Item>
            </Card>

            {/* Git 仓库配置 */}
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
                message="Git 仓库说明"
                description="配置用于存放 Kubernetes 资源清单的 Git 仓库。创建应用时将使用此仓库作为配置源，ArgoCD 会自动监听仓库变更并同步到集群。"
                type="info"
                showIcon
                style={{ marginBottom: 16 }}
              />

              <Form.Item
                name="git_repo_url"
                label="Git 仓库地址"
                rules={[{ required: true, message: '请输入 Git 仓库地址' }]}
              >
                <Input placeholder="https://github.com/your-org/k8s-configs.git" />
              </Form.Item>

              <Form.Item
                name="git_branch"
                label="默认分支"
                initialValue="main"
              >
                <Input placeholder="main" />
              </Form.Item>

              <Form.Item
                name="git_path"
                label="应用配置路径"
                extra="Git 仓库中存放应用配置的目录路径，创建应用时将在此路径下查找"
              >
                <Input placeholder="/apps 或 /environments/prod" />
              </Form.Item>

              <Divider>Git 认证（可选）</Divider>

              <Form.Item
                name="git_auth_type"
                label="认证方式"
                initialValue="https"
              >
                <Select>
                  <Select.Option value="https">HTTPS (用户名/密码或Token)</Select.Option>
                  <Select.Option value="ssh">SSH Key</Select.Option>
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
                      label="SSH 私钥"
                    >
                      <Input.TextArea 
                        rows={4} 
                        placeholder="-----BEGIN RSA PRIVATE KEY-----&#10;...&#10;-----END RSA PRIVATE KEY-----" 
                      />
                    </Form.Item>
                  ) : (
                    <>
                      <Form.Item name="git_username" label="用户名">
                        <Input placeholder="git 用户名" />
                      </Form.Item>
                      <Form.Item name="git_password" label="密码/Token">
                        <Input.Password placeholder="密码或 Personal Access Token" />
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
                  目标集群配置
                </Space>
              }
              style={{ marginBottom: 24 }}
            >
              <Alert
                message="集群名称说明"
                description={
                  <div>
                    填写在 ArgoCD 中注册的目标集群名称。常见值：
                    <ul style={{ marginBottom: 0, marginTop: 8 }}>
                      <li><Text code>in-cluster</Text> - ArgoCD 所在的集群</li>
                      <li><Text code>https://kubernetes.default.svc</Text> - 默认集群地址</li>
                      <li>或者在 ArgoCD 中自定义的集群名称</li>
                    </ul>
                  </div>
                }
                type="info"
                showIcon
                style={{ marginBottom: 16 }}
              />

              <Form.Item
                name="argocd_cluster_name"
                label="ArgoCD 集群名称"
                rules={[{ required: true, message: '请输入集群名称' }]}
                extra="在 ArgoCD 中注册的集群名称或 API Server 地址"
              >
                <Input placeholder="in-cluster 或 https://kubernetes.default.svc" />
              </Form.Item>

              <Form.Item
                name="argocd_project"
                label="ArgoCD 项目"
                initialValue="default"
                extra="ArgoCD 项目用于组织和管理应用权限，默认为 default"
              >
                <Input placeholder="default" />
              </Form.Item>
            </Card>
          </>
        )}

        {/* 保存按钮 */}
        <div style={{ textAlign: 'right', marginTop: 24 }}>
          <Space>
            <Button onClick={loadConfig}>重置</Button>
            <Button 
              type="primary" 
              loading={saving} 
              onClick={handleSave}
              icon={<SaveOutlined />}
              size="large"
            >
              保存配置
            </Button>
          </Space>
        </div>
      </Form>
    </div>
  );
};

export default ArgoCDConfigForm;

