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
  Alert,
  Spin,
  Radio,
  Tag,
} from 'antd';
import {
  KeyOutlined,
  SaveOutlined,
  LockOutlined,
  UserOutlined,
  CheckCircleOutlined,
} from '@ant-design/icons';
import { systemSettingService } from '../../services/authService';
import type { SSHConfig } from '../../types';
import { useTranslation } from 'react-i18next';

const { Title, Text } = Typography;

const SSHSettings: React.FC = () => {
const { t } = useTranslation(['settings', 'common']);
const [form] = Form.useForm();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [hasPassword, setHasPassword] = useState(false);
  const [hasPrivateKey, setHasPrivateKey] = useState(false);
  const { message } = App.useApp();

  useEffect(() => {
    const fetchConfig = async () => {
      try {
        const response = await systemSettingService.getSSHConfig();
        {
          const config = response;
          
          if (config.password === '******') {
            setHasPassword(true);
            config.password = '';
          }
          if (config.private_key === '******') {
            setHasPrivateKey(true);
            config.private_key = '';
          }
          
          form.setFieldsValue(config);
        }
      } catch (error) {
        message.error(t('settings:ssh.loadConfigFailed'));
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
      
      const submitData = { ...values };
      if (!submitData.password && hasPassword) {
        submitData.password = '******';
      }
      if (!submitData.private_key && hasPrivateKey) {
        submitData.private_key = '******';
      }
      
      const response = await systemSettingService.updateSSHConfig(submitData as SSHConfig);
      message.success(t('settings:ssh.saveConfigSuccess'));
      if (values.password) {
        setHasPassword(true);
        form.setFieldValue('password', '');
      }
      if (values.private_key) {
        setHasPrivateKey(true);
        form.setFieldValue('private_key', '');
      }
    } catch (error) {
      message.error(t('settings:ssh.saveConfigFailed'));
      console.error(error);
    } finally {
      setSaving(false);
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
            <KeyOutlined style={{ marginRight: 8 }} />
            {t('settings:ssh.title')}
          </Title>
          <Text type="secondary">
            {t('settings:ssh.description')}
          </Text>
        </div>

        <Alert
          message={t('settings:ssh.securityTip')}
          description={t('settings:ssh.securityTipDesc')}
          type="info"
          showIcon
          style={{ marginBottom: 24 }}
        />

        <Form
          form={form}
          layout="vertical"
          initialValues={{
            enabled: false,
            username: 'root',
            port: 22,
            auth_type: 'password',
          }}
        >
          <Form.Item
            name="enabled"
            label={t('settings:ssh.enableGlobalSsh')}
            valuePropName="checked"
            tooltip={t('settings:ssh.enableGlobalSshTooltip')}
          >
            <Switch checkedChildren={t('settings:ssh.enabled')} unCheckedChildren={t('settings:ssh.disabled')} />
          </Form.Item>

          <Divider>{t('settings:ssh.connectionConfig')}</Divider>

          <Form.Item
            name="username"
            label={t('settings:ssh.username')}
            rules={[{ required: true, message: t('settings:ssh.usernameRequired') }]}
          >
            <Input 
              prefix={<UserOutlined />} 
              placeholder={t('settings:ssh.usernamePlaceholder')} 
            />
          </Form.Item>

          <Form.Item
            name="port"
            label={t('settings:ssh.sshPort')}
            rules={[{ required: true, message: t('settings:ssh.sshPortRequired') }]}
          >
            <InputNumber 
              min={1} 
              max={65535} 
              style={{ width: '100%' }} 
              placeholder={t('settings:ssh.sshPortPlaceholder')}
            />
          </Form.Item>

          <Divider>{t('settings:ssh.authMethod')}</Divider>

          <Form.Item
            name="auth_type"
            label={t('settings:ssh.authMethod')}
            rules={[{ required: true, message: t('settings:ssh.authMethodRequired') }]}
          >
            <Radio.Group>
              <Radio.Button value="password">
                <LockOutlined /> {t('settings:ssh.passwordAuth')}
              </Radio.Button>
              <Radio.Button value="key">
                <KeyOutlined /> {t('settings:ssh.keyAuth')}
              </Radio.Button>
            </Radio.Group>
          </Form.Item>

          <Form.Item
            noStyle
            shouldUpdate={(prevValues, currentValues) =>
              prevValues.auth_type !== currentValues.auth_type
            }
          >
            {({ getFieldValue }) => {
              const authType = getFieldValue('auth_type');
              
              if (authType === 'password') {
                return (
                  <Form.Item
                    name="password"
                    label={
                      <Space>
                        <span>{t('settings:ssh.passwordLabel')}</span>
                        {hasPassword && (
                          <Tag color="green" icon={<CheckCircleOutlined />}>
                            {t('settings:ssh.configured')}
                          </Tag>
                        )}
                      </Space>
                    }
                    tooltip={t('settings:ssh.keepOriginalPassword')}
                  >
                    <Input.Password 
                      placeholder={hasPassword ? t('settings:ssh.passwordConfiguredPlaceholder') : t('settings:ssh.passwordPlaceholder')}
                    />
                  </Form.Item>
                );
              }
              
              if (authType === 'key') {
                return (
                  <Form.Item
                    name="private_key"
                    label={
                      <Space>
                        <span>{t('settings:ssh.privateKeyLabel')}</span>
                        {hasPrivateKey && (
                          <Tag color="green" icon={<CheckCircleOutlined />}>
                            {t('settings:ssh.configured')}
                          </Tag>
                        )}
                      </Space>
                    }
                    tooltip={t('settings:ssh.keepOriginalKey')}
                  >
                    <Input.TextArea
                      rows={8}
                      placeholder={hasPrivateKey 
                        ? t('settings:ssh.privateKeyConfiguredPlaceholder') 
                        : t('settings:ssh.privateKeyPlaceholder')}
                      style={{ fontFamily: 'monospace' }}
                    />
                  </Form.Item>
                );
              }
              
              return null;
            }}
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
                {t('settings:ssh.saveConfig')}
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Card>
    </div>
  );
};

export default SSHSettings;
