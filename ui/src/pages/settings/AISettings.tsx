import React, { useState, useEffect } from 'react';
import {
  Card,
  Form,
  Input,
  Button,
  Space,
  Typography,
  Divider,
  App,
  Switch,
  Select,
  Spin,
  Tag,
  Alert,
} from 'antd';
import {
  RobotOutlined,
  SaveOutlined,
  ApiOutlined,
  LinkOutlined,
  CheckCircleOutlined,
} from '@ant-design/icons';
import { aiService } from '../../services/aiService';
import type { AIConfig } from '../../types/ai';
import { useTranslation } from 'react-i18next';

const { Title, Text } = Typography;

const AISettings: React.FC = () => {
  const { t } = useTranslation(['settings', 'common']);
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [hasApiKey, setHasApiKey] = useState(false);
  const { message } = App.useApp();

  useEffect(() => {
    const fetchConfig = async () => {
      try {
        const response = await aiService.getConfig();
        {
          const config = response;
          if (config.api_key === '******') {
            setHasApiKey(true);
            config.api_key = '';
          }
          form.setFieldsValue(config);
        }
      } catch (error) {
        message.error(t('settings:ai.loadConfigFailed'));
        console.error(error);
      } finally {
        setLoading(false);
      }
    };
    fetchConfig();
  }, [form, message, t]);

  const getSubmitData = (): AIConfig => {
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
      await aiService.updateConfig(submitData);
      message.success(t('settings:ai.saveConfigSuccess'));
      if (form.getFieldValue('api_key')) {
        setHasApiKey(true);
        form.setFieldValue('api_key', '');
      }
    } catch (error) {
      message.error(t('settings:ai.saveConfigFailed'));
      console.error(error);
    } finally {
      setSaving(false);
    }
  };

  const handleTestConnection = async () => {
    try {
      const endpoint = form.getFieldValue('endpoint');
      if (!endpoint) {
        message.warning(t('settings:ai.endpointRequired'));
        return;
      }
      setTesting(true);
      const submitData = getSubmitData();
      const response = await aiService.testConnection(submitData);
      if (response?.success) {
        message.success(t('settings:ai.testConnectionSuccess'));
      } else {
        message.error(t('settings:ai.testConnectionFailed'));
      }
    } catch (error) {
      message.error(t('settings:ai.testConnectionFailed'));
      console.error(error);
    } finally {
      setTesting(false);
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
            <RobotOutlined style={{ marginRight: 8 }} />
            {t('settings:ai.title')}
          </Title>
          <Text type="secondary">
            {t('settings:ai.description')}
          </Text>
        </div>

        <Alert
          message={t('settings:ai.tip')}
          description={t('settings:ai.tipDesc')}
          type="info"
          showIcon
          style={{ marginBottom: 24 }}
        />

        <Form
          form={form}
          layout="vertical"
          initialValues={{
            provider: 'openai',
            endpoint: 'https://api.openai.com/v1',
            api_key: '',
            model: 'gpt-4o',
            enabled: false,
          }}
        >
          <Form.Item
            name="enabled"
            label={t('settings:ai.enableAI')}
            valuePropName="checked"
          >
            <Switch
              checkedChildren={t('settings:ai.enabled')}
              unCheckedChildren={t('settings:ai.disabled')}
            />
          </Form.Item>

          <Divider>{t('settings:ai.providerConfig')}</Divider>

          <Form.Item
            name="provider"
            label={t('settings:ai.provider')}
          >
            <Select>
              <Select.Option value="openai">OpenAI / Compatible</Select.Option>
            </Select>
          </Form.Item>

          <Form.Item
            name="endpoint"
            label={t('settings:ai.endpoint')}
            rules={[{ required: true, message: t('settings:ai.endpointRequired') }]}
            tooltip={t('settings:ai.endpointTooltip')}
          >
            <Input
              prefix={<LinkOutlined />}
              placeholder={t('settings:ai.endpointPlaceholder')}
            />
          </Form.Item>

          <Form.Item
            name="api_key"
            label={
              <Space>
                <span>{t('settings:ai.apiKey')}</span>
                {hasApiKey && (
                  <Tag color="green" icon={<CheckCircleOutlined />}>
                    {t('settings:ai.configured')}
                  </Tag>
                )}
              </Space>
            }
            tooltip={t('settings:ai.apiKeyTooltip')}
          >
            <Input.Password
              prefix={<ApiOutlined />}
              placeholder={hasApiKey
                ? t('settings:ai.apiKeyConfiguredPlaceholder')
                : t('settings:ai.apiKeyPlaceholder')}
            />
          </Form.Item>

          <Form.Item
            name="model"
            label={t('settings:ai.model')}
            rules={[{ required: true, message: t('settings:ai.modelRequired') }]}
            tooltip={t('settings:ai.modelTooltip')}
          >
            <Input placeholder={t('settings:ai.modelPlaceholder')} />
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
                {t('settings:ai.saveConfig')}
              </Button>
              <Button
                icon={<ApiOutlined />}
                loading={testing}
                onClick={handleTestConnection}
              >
                {t('settings:ai.testConnection')}
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Card>
    </div>
  );
};

export default AISettings;
