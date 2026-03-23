import React, { useState, useEffect } from 'react';
import {
  Card,
  Form,
  Input,
  InputNumber,
  Switch,
  Button,
  Space,
  Typography,
  Divider,
  App,
  Modal,
  Alert,
  Spin,
  Row,
  Col,
} from 'antd';
import {
  CloudServerOutlined,
  SaveOutlined,
  ApiOutlined,
  UserOutlined,
  LockOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
} from '@ant-design/icons';
import { systemSettingService } from '../../services/authService';
import type { LDAPConfig } from '../../types';
import { useTranslation } from 'react-i18next';
import { parseApiError } from '../../utils/api';

const { Title, Text } = Typography;

const LDAPSettings: React.FC = () => {
const { t } = useTranslation(['settings', 'common']);
const [form] = Form.useForm();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testAuthModalOpen, setTestAuthModalOpen] = useState(false);
  const [testingAuth, setTestingAuth] = useState(false);
  const [testAuthResult, setTestAuthResult] = useState<{
    success: boolean;
    error?: string;
    username?: string;
    email?: string;
    display_name?: string;
    groups?: string[];
  } | null>(null);
  const [testAuthForm] = Form.useForm();
  const { message } = App.useApp();

  useEffect(() => {
    const fetchConfig = async () => {
      try {
        const response = await systemSettingService.getLDAPConfig();
        form.setFieldsValue(response);
      } catch (error) {
        message.error(t('settings:ldap.loadConfigFailed'));
        console.error(error);
      } finally {
        setLoading(false);
      }
    };

    fetchConfig();
  }, [form, message, t]);

  const handleSave = async () => {
    try {
      const values = await form.validateFields();
      setSaving(true);
      
      await systemSettingService.updateLDAPConfig(values as LDAPConfig);
      message.success(t('settings:ldap.saveConfigSuccess'));
    } catch (error) {
      message.error(t('settings:ldap.saveConfigFailed'));
      console.error(error);
    } finally {
      setSaving(false);
    }
  };

  const handleTestConnection = async () => {
    try {
      const values = await form.validateFields();
      setTesting(true);
      
      const response = await systemSettingService.testLDAPConnection(values as LDAPConfig);
      
      if (response?.success) {
        message.success(t('settings:ldap.testConnectionSuccess'));
      } else {
        const errorMsg = response?.error || t('settings:ldap.testConnectionFailed');
        message.error(errorMsg);
      }
    } catch (error: unknown) {
      console.error(error);
      message.error(parseApiError(error) || t('settings:ldap.testConnectionFailed'));
    } finally {
      setTesting(false);
    }
  };

  const handleTestAuth = async () => {
    try {
      const values = await testAuthForm.validateFields();
      const ldapConfig = form.getFieldsValue();
      setTestingAuth(true);
      setTestAuthResult(null);
      
      const response = await systemSettingService.testLDAPAuth({
        username: values.username,
        password: values.password,
        server: ldapConfig.server,
        port: ldapConfig.port,
        use_tls: ldapConfig.use_tls,
        skip_tls_verify: ldapConfig.skip_tls_verify,
        bind_dn: ldapConfig.bind_dn,
        bind_password: ldapConfig.bind_password,
        base_dn: ldapConfig.base_dn,
        user_filter: ldapConfig.user_filter,
        username_attr: ldapConfig.username_attr,
        email_attr: ldapConfig.email_attr,
        display_name_attr: ldapConfig.display_name_attr,
        group_filter: ldapConfig.group_filter,
        group_attr: ldapConfig.group_attr,
      });
      
      if (response) {
        setTestAuthResult(response);
      } else {
        setTestAuthResult({
          success: false,
          error: t('settings:ldap.testAuthFailed'),
        });
      }
    } catch (error: unknown) {
      console.error(error);
      setTestAuthResult({
        success: false,
        error: parseApiError(error) || t('settings:ldap.testAuthFailed'),
      });
    } finally {
      setTestingAuth(false);
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
            <CloudServerOutlined style={{ marginRight: 8 }} />
            {t('settings:ldap.title')}
          </Title>
          <Text type="secondary">
            {t('settings:ldap.description')}
          </Text>
        </div>

        <Form
          form={form}
          layout="vertical"
          initialValues={{
            enabled: false,
            port: 389,
            use_tls: false,
            skip_tls_verify: false,
            user_filter: '(uid=%s)',
            username_attr: 'uid',
            email_attr: 'mail',
            display_name_attr: 'cn',
            group_filter: '(memberUid=%s)',
            group_attr: 'cn',
          }}
        >
          <Form.Item
            name="enabled"
            label={t('settings:ldap.enableLdap')}
            valuePropName="checked"
          >
            <Switch checkedChildren={t('settings:ldap.enabled')} unCheckedChildren={t('settings:ldap.disabled')} />
          </Form.Item>

          <Divider>{t('settings:ldap.serverConfig')}</Divider>

          <Row gutter={16}>
            <Col span={16}>
              <Form.Item
                name="server"
                label={t('settings:ldap.serverAddress')}
                rules={[{ required: true, message: t('settings:ldap.serverAddressRequired') }]}
              >
                <Input placeholder={t('settings:ldap.serverAddressPlaceholder')} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item
                name="port"
                label={t('settings:ldap.port')}
                rules={[{ required: true, message: t('settings:ldap.portRequired') }]}
              >
                <InputNumber min={1} max={65535} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="use_tls"
                label={t('settings:ldap.useTls')}
                valuePropName="checked"
              >
                <Switch />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="skip_tls_verify"
                label={t('settings:ldap.skipTlsVerify')}
                valuePropName="checked"
                tooltip={t('settings:ldap.skipTlsVerifyTooltip')}
              >
                <Switch />
              </Form.Item>
            </Col>
          </Row>

          <Divider>{t('settings:ldap.bindConfig')}</Divider>

          <Form.Item
            name="bind_dn"
            label={t('settings:ldap.bindDn')}
            rules={[{ required: true, message: t('settings:ldap.bindDnRequired') }]}
            tooltip={t('settings:ldap.bindDnTooltip')}
          >
            <Input placeholder={t('settings:ldap.bindDnPlaceholder')} />
          </Form.Item>

          <Form.Item
            name="bind_password"
            label={t('settings:ldap.bindPassword')}
            rules={[{ required: true, message: t('settings:ldap.bindPasswordRequired') }]}
          >
            <Input.Password placeholder={t('settings:ldap.bindPasswordPlaceholder')} />
          </Form.Item>

          <Form.Item
            name="base_dn"
            label={t('settings:ldap.baseDn')}
            rules={[{ required: true, message: t('settings:ldap.baseDnRequired') }]}
            tooltip={t('settings:ldap.baseDnTooltip')}
          >
            <Input placeholder={t('settings:ldap.baseDnPlaceholder')} />
          </Form.Item>

          <Divider>{t('settings:ldap.userAttrMapping')}</Divider>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="user_filter"
                label={t('settings:ldap.userFilter')}
                rules={[{ required: true, message: t('settings:ldap.userFilterRequired') }]}
                tooltip={t('settings:ldap.userFilterTooltip')}
              >
                <Input placeholder={t('settings:ldap.userFilterPlaceholder')} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="username_attr"
                label={t('settings:ldap.usernameAttr')}
                rules={[{ required: true, message: t('settings:ldap.usernameAttrRequired') }]}
              >
                <Input placeholder={t('settings:ldap.usernameAttrPlaceholder')} />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="email_attr"
                label={t('settings:ldap.emailAttr')}
                rules={[{ required: true, message: t('settings:ldap.emailAttrRequired') }]}
              >
                <Input placeholder={t('settings:ldap.emailAttrPlaceholder')} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="display_name_attr"
                label={t('settings:ldap.displayNameAttr')}
                rules={[{ required: true, message: t('settings:ldap.displayNameAttrRequired') }]}
              >
                <Input placeholder={t('settings:ldap.displayNameAttrPlaceholder')} />
              </Form.Item>
            </Col>
          </Row>

          <Divider>{t('settings:ldap.groupConfig')}</Divider>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="group_filter"
                label={t('settings:ldap.groupFilter')}
                tooltip={t('settings:ldap.groupFilterTooltip')}
              >
                <Input placeholder={t('settings:ldap.groupFilterPlaceholder')} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="group_attr"
                label={t('settings:ldap.groupAttr')}
              >
                <Input placeholder={t('settings:ldap.groupAttrPlaceholder')} />
              </Form.Item>
            </Col>
          </Row>

          <Divider />

          <Form.Item>
            <Space>
              <Button
                type="primary"
                icon={<SaveOutlined />}
                loading={saving}
                onClick={handleSave}
              >
                {t('settings:ldap.saveConfig')}
              </Button>
              <Button
                icon={<ApiOutlined />}
                loading={testing}
                onClick={handleTestConnection}
              >
                {t('settings:ldap.testConnection')}
              </Button>
              <Button
                icon={<UserOutlined />}
                onClick={() => {
                  setTestAuthModalOpen(true);
                  setTestAuthResult(null);
                  testAuthForm.resetFields();
                }}
              >
                {t('settings:ldap.testUserAuth')}
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Card>

      <Modal
        title={t('settings:ldap.testLdapAuth')}
        open={testAuthModalOpen}
        onCancel={() => setTestAuthModalOpen(false)}
        footer={null}
        width={500}
      >
        <Form
          form={testAuthForm}
          layout="vertical"
          onFinish={handleTestAuth}
        >
          <Form.Item
            name="username"
            label={t('settings:ldap.username')}
            rules={[{ required: true, message: t('settings:ldap.usernameRequired') }]}
          >
            <Input prefix={<UserOutlined />} placeholder={t('settings:ldap.ldapUsername')} />
          </Form.Item>

          <Form.Item
            name="password"
            label={t('settings:ldap.password')}
            rules={[{ required: true, message: t('settings:ldap.passwordRequired') }]}
          >
            <Input.Password prefix={<LockOutlined />} placeholder={t('settings:ldap.ldapPassword')} />
          </Form.Item>

          <Form.Item>
            <Button
              type="primary"
              htmlType="submit"
              loading={testingAuth}
              block
            >
              {t('settings:ldap.testAuth')}
            </Button>
          </Form.Item>
        </Form>

        {testAuthResult && (
          <div style={{ marginTop: 16 }}>
            {testAuthResult.success ? (
              <Alert
                type="success"
                icon={<CheckCircleOutlined />}
                message={t('settings:ldap.authSuccess')}
                description={
                  <div>
                    <p><strong>{t('settings:ldap.username')}:</strong> {testAuthResult.username}</p>
                    <p><strong>{t('settings:ldap.email')}:</strong> {testAuthResult.email}</p>
                    <p><strong>{t('settings:ldap.displayName')}:</strong> {testAuthResult.display_name}</p>
                    {testAuthResult.groups && testAuthResult.groups.length > 0 && (
                      <p><strong>{t('settings:ldap.userGroups')}:</strong> {testAuthResult.groups.join(', ')}</p>
                    )}
                  </div>
                }
              />
            ) : (
              <Alert
                type="error"
                icon={<CloseCircleOutlined />}
                message={t('settings:ldap.authFailed')}
                description={testAuthResult.error}
              />
            )}
          </div>
        )}
      </Modal>
    </div>
  );
};

export default LDAPSettings;
