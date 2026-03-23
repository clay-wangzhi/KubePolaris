import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import kubernetesLogo from '../../assets/kubernetes.png';
import {
  Form,
  Input,
  Button,
  Typography,
  Tabs,
  Space,
  App,
} from 'antd';

import {
  UserOutlined,
  LockOutlined,
  LoginOutlined,
  CloudServerOutlined,
  ClusterOutlined,
  MonitorOutlined,
  SafetyCertificateOutlined,
  CodeOutlined,
} from '@ant-design/icons';
import { authService, tokenManager } from '../../services/authService';
import { parseApiError } from '@/utils/api';
import './Login.css';

const { Text } = Typography;

interface LoginFormValues {
  username: string;
  password: string;
}

const isDev = import.meta.env.DEV;

const Login: React.FC = () => {
  const { message } = App.useApp();
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useTranslation('common');
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [ldapEnabled, setLdapEnabled] = useState(false);
  const [activeTab, setActiveTab] = useState<'local' | 'ldap'>('local');

  const from = (location.state as { from?: { pathname: string } })?.from?.pathname || '/';

  useEffect(() => {
    if (tokenManager.isLoggedIn()) {
      navigate(from, { replace: true });
    }
  }, [navigate, from]);

  useEffect(() => {
    const fetchAuthStatus = async () => {
      try {
        const response = await authService.getAuthStatus();
        setLdapEnabled(response.ldap_enabled);
      } catch (error) {
        console.error('Failed to fetch auth status:', error);
      }
    };

    fetchAuthStatus();
  }, []);

  const handleLogin = async (values: LoginFormValues) => {
    setLoading(true);
    try {
      const response = await authService.login({
        username: values.username,
        password: values.password,
        auth_type: activeTab,
      });

      tokenManager.setToken(response.token);
      tokenManager.setUser(response.user);
      tokenManager.setExpiresAt(response.expires_at);

      if (response.permissions) {
        tokenManager.setPermissions(response.permissions);
      }

      message.success(t('auth.loginSuccess'));
      navigate(from, { replace: true });
    } catch (error: unknown) {
      message.error(parseApiError(error) || t('messages.networkError'));
    } finally {
      setLoading(false);
    }
  };

  const tabItems = [
    {
      key: 'local',
      label: (
        <Space>
          <UserOutlined />
          {t('auth.passwordLogin')}
        </Space>
      ),
    },
    ...(ldapEnabled ? [{
      key: 'ldap',
      label: (
        <Space>
          <CloudServerOutlined />
          {t('auth.ldapLogin')}
        </Space>
      ),
    }] : []),
  ];

  const features = [
    {
      icon: <ClusterOutlined />,
      title: t('auth.featureMultiClusterTitle'),
      desc: t('auth.featureMultiClusterDesc'),
    },
    {
      icon: <MonitorOutlined />,
      title: t('auth.featureObservabilityTitle'),
      desc: t('auth.featureObservabilityDesc'),
    },
    {
      icon: <SafetyCertificateOutlined />,
      title: t('auth.featureRBACTitle'),
      desc: t('auth.featureRBACDesc'),
    },
    {
      icon: <CodeOutlined />,
      title: t('auth.featureGitOpsTitle'),
      desc: t('auth.featureGitOpsDesc'),
    },
  ];

  return (
    <main className="login-page">
      {/* Left: Brand Panel */}
      <section className="login-brand-panel" aria-hidden="true">
        <div className="login-bg-grid" />
        <div className="login-bg-glow login-bg-glow-1" />
        <div className="login-bg-glow login-bg-glow-2" />
        <div className="login-bg-float login-bg-float-1" />
        <div className="login-bg-float login-bg-float-2" />
        <div className="login-bg-float login-bg-float-3" />

        <div className="login-brand-content">
          <div className="login-brand-logo">
            <img src={kubernetesLogo} alt="" width={48} height={48} />
            <span className="login-brand-logo-text">KubePolaris</span>
          </div>

          <h2 className="login-brand-headline">
            {t('auth.brandHeadline')}
          </h2>
          <p className="login-brand-desc">
            {t('auth.brandDesc')}
          </p>

          <div className="login-features">
            {features.map((f, i) => (
              <div className="login-feature-item" key={i}>
                <div className="login-feature-icon">{f.icon}</div>
                <div className="login-feature-text">
                  <h4>{f.title}</h4>
                  <p>{f.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Right: Form Panel */}
      <section className="login-form-panel">
        <div className="login-form-wrapper">
          <div className="login-form-header">
            <h1 className="login-form-title">{t('auth.welcomeBack')}</h1>
            <p className="login-form-subtitle">{t('auth.loginSubtitle')}</p>
          </div>

          {ldapEnabled && (
            <Tabs
              activeKey={activeTab}
              onChange={(key) => setActiveTab(key as 'local' | 'ldap')}
              items={tabItems}
              centered
              style={{ marginBottom: 28 }}
            />
          )}

          <Form
            form={form}
            onFinish={handleLogin}
            layout="vertical"
            requiredMark={false}
            className="login-form"
          >
            <Form.Item
              name="username"
              label={t('auth.username')}
              rules={[{ required: true, message: t('auth.usernameRequired') }]}
            >
              <Input
                prefix={<UserOutlined style={{ color: '#9ca3af' }} aria-hidden="true" />}
                placeholder={`${t('auth.username')}…`}
                size="large"
                autoComplete="username"
                spellCheck={false}
                autoFocus
              />
            </Form.Item>

            <Form.Item
              name="password"
              label={t('auth.password')}
              rules={[{ required: true, message: t('auth.passwordRequired') }]}
              style={{ marginBottom: 28 }}
            >
              <Input.Password
                prefix={<LockOutlined style={{ color: '#9ca3af' }} aria-hidden="true" />}
                placeholder={`${t('auth.password')}…`}
                size="large"
                autoComplete="current-password"
                spellCheck={false}
              />
            </Form.Item>

            <Form.Item style={{ marginBottom: 0 }}>
              <Button
                type="primary"
                htmlType="submit"
                size="large"
                block
                loading={loading}
                icon={<LoginOutlined />}
                className="login-button"
              >
                {t('auth.login')}
              </Button>
            </Form.Item>
          </Form>

          {isDev && (
            <div className="login-hint-box">
              <Text>
                {activeTab === 'ldap'
                  ? t('auth.ldapHint')
                  : t('auth.defaultAdminHint')}
              </Text>
            </div>
          )}
        </div>

        <div className="login-footer">
          <Text>{t('auth.copyright')}</Text>
        </div>
      </section>
    </main>
  );
};

export default Login;
