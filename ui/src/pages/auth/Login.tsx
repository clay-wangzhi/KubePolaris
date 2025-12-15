import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  Form,
  Input,
  Button,
  Card,
  Typography,
  message,
  Tabs,
  Space,
  Spin,
} from 'antd';
import {
  UserOutlined,
  LockOutlined,
  LoginOutlined,
  CloudServerOutlined,
} from '@ant-design/icons';
import { authService, tokenManager } from '../../services/authService';

const { Title, Text } = Typography;

interface LoginFormValues {
  username: string;
  password: string;
}

const Login: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [ldapEnabled, setLdapEnabled] = useState(false);
  const [checkingStatus, setCheckingStatus] = useState(true);
  const [activeTab, setActiveTab] = useState<'local' | 'ldap'>('local');

  // 获取重定向地址
  const from = (location.state as { from?: { pathname: string } })?.from?.pathname || '/';

  // 检查是否已登录
  useEffect(() => {
    if (tokenManager.isLoggedIn()) {
      navigate(from, { replace: true });
    }
  }, [navigate, from]);

  // 获取认证状态
  useEffect(() => {
    const fetchAuthStatus = async () => {
      try {
        const response = await authService.getAuthStatus();
        if (response.code === 200) {
          setLdapEnabled(response.data.ldap_enabled);
        }
      } catch (error) {
        console.error('获取认证状态失败:', error);
      } finally {
        setCheckingStatus(false);
      }
    };

    fetchAuthStatus();
  }, []);

  // 登录处理
  const handleLogin = async (values: LoginFormValues) => {
    setLoading(true);
    try {
      const response = await authService.login({
        username: values.username,
        password: values.password,
        auth_type: activeTab,
      });

      if (response.code === 200) {
        // 保存认证信息
        tokenManager.setToken(response.data.token);
        tokenManager.setUser(response.data.user);
        tokenManager.setExpiresAt(response.data.expires_at);

        message.success('登录成功');
        navigate(from, { replace: true });
      } else {
        message.error(response.message || '登录失败');
      }
    } catch (error: unknown) {
      const err = error as { response?: { data?: { message?: string } } };
      message.error(err.response?.data?.message || '登录失败，请检查网络连接');
    } finally {
      setLoading(false);
    }
  };

  if (checkingStatus) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      }}>
        <Spin size="large" />
      </div>
    );
  }

  const tabItems = [
    {
      key: 'local',
      label: (
        <Space>
          <UserOutlined />
          密码登录
        </Space>
      ),
    },
    ...(ldapEnabled ? [{
      key: 'ldap',
      label: (
        <Space>
          <CloudServerOutlined />
          LDAP登录
        </Space>
      ),
    }] : []),
  ];

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        padding: 24,
      }}
    >
      <Card
        style={{
          width: 420,
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.15)',
          borderRadius: 16,
        }}
        bodyStyle={{ padding: '40px 32px' }}
      >
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{ marginBottom: 16 }}>
            <img
              src="/src/assets/kubernetes.png"
              alt="KubePolaris"
              style={{ width: 64, height: 64 }}
            />
          </div>
          <Title level={3} style={{ margin: 0, color: '#1f2937' }}>
            KubePolaris
          </Title>
          <Text type="secondary">Kubernetes 集群管理平台</Text>
        </div>

        {ldapEnabled ? (
          <Tabs
            activeKey={activeTab}
            onChange={(key) => setActiveTab(key as 'local' | 'ldap')}
            items={tabItems}
            centered
            style={{ marginBottom: 24 }}
          />
        ) : null}

        <Form
          form={form}
          onFinish={handleLogin}
          layout="vertical"
          requiredMark={false}
        >
          <Form.Item
            name="username"
            rules={[{ required: true, message: '请输入用户名' }]}
          >
            <Input
              prefix={<UserOutlined style={{ color: '#bfbfbf' }} />}
              placeholder="用户名"
              size="large"
              autoComplete="username"
            />
          </Form.Item>

          <Form.Item
            name="password"
            rules={[{ required: true, message: '请输入密码' }]}
          >
            <Input.Password
              prefix={<LockOutlined style={{ color: '#bfbfbf' }} />}
              placeholder="密码"
              size="large"
              autoComplete="current-password"
            />
          </Form.Item>

          <Form.Item style={{ marginBottom: 0, marginTop: 24 }}>
            <Button
              type="primary"
              htmlType="submit"
              size="large"
              block
              loading={loading}
              icon={<LoginOutlined />}
              style={{
                height: 44,
                borderRadius: 8,
                background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                border: 'none',
              }}
            >
              登录
            </Button>
          </Form.Item>
        </Form>

        <div style={{ textAlign: 'center', marginTop: 24 }}>
          <Text type="secondary" style={{ fontSize: 12 }}>
            {activeTab === 'ldap' 
              ? '使用企业账号登录' 
              : '默认管理员: admin / KubePolaris@2026'}
          </Text>
        </div>
      </Card>
    </div>
  );
};

export default Login;
