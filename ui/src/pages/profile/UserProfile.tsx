import React, { useState, useEffect, useCallback } from 'react';
import { Card, Descriptions, Button, Modal, Form, Input, Space, Tag, Spin, App } from 'antd';
import { UserOutlined, LockOutlined, SafetyOutlined } from '@ant-design/icons';
import { authService, tokenManager } from '../../services/authService';
import type { User } from '../../types';
import { useTranslation } from 'react-i18next';

const UserProfile: React.FC = () => {
  const { message } = App.useApp();
const { t } = useTranslation(['profile', 'common']);
const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(false);
  const [changePasswordModalVisible, setChangePasswordModalVisible] = useState(false);
  const [changePasswordLoading, setChangePasswordLoading] = useState(false);
  const [form] = Form.useForm();

  const loadUserProfile = useCallback(async () => {
    setLoading(true);
    try {
      const response = await authService.getProfile();
      setUser(response);
      tokenManager.setUser(response);
    } catch (error) {
      message.error(t('profile:fetchProfileFailed'));
      console.error(error);
    } finally {
      setLoading(false);
    }
  }, [message, t]);

  useEffect(() => {
    loadUserProfile();
  }, [loadUserProfile]);

  const handleOpenChangePassword = () => {
    if (user?.auth_type === 'ldap') {
      message.warning(t('profile:ldapCannotChange'));
      return;
    }
    setChangePasswordModalVisible(true);
    form.resetFields();
  };

  const handleChangePassword = async () => {
    try {
      const values = await form.validateFields();
      
      if (values.new_password !== values.confirm_password) {
        message.error(t('profile:passwordNewMismatch'));
        return;
      }

      setChangePasswordLoading(true);

      const response = await authService.changePassword({
        old_password: values.old_password,
        new_password: values.new_password,
      });

      message.success(t('profile:changePasswordSuccess'));
      setChangePasswordModalVisible(false);
      form.resetFields();
    } catch (error: unknown) {
      const err = error as { errorFields?: unknown[]; response?: { data?: { message?: string } }; message?: string };
      if (err.errorFields) {
        return;
      }
      const errorMessage = err?.response?.data?.message || err?.message || t('profile:changePasswordRetry');
      message.error(errorMessage);
      console.error(error);
    } finally {
      setChangePasswordLoading(false);
    }
  };

  const handleCancelChangePassword = () => {
    setChangePasswordModalVisible(false);
    form.resetFields();
  };

  const formatDateTime = (dateString?: string | null) => {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '400px' }}>
        <Spin size="large" />
      </div>
    );
  }

  return (
    <div style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto' }}>
      <Card
        title={
          <Space>
            <UserOutlined />
            <span>{t('profile:title')}</span>
          </Space>
        }
        extra={
          <Space>
            <Button 
              type="primary" 
              icon={<LockOutlined />}
              onClick={handleOpenChangePassword}
              disabled={user?.auth_type === 'ldap'}
            >
              {t('profile:changePassword')}
            </Button>
          </Space>
        }
      >
        <Descriptions bordered column={2}>
          <Descriptions.Item label={t('profile:userId')}>
            {user?.id}
          </Descriptions.Item>
          <Descriptions.Item label={t('profile:username')}>
            {user?.username}
          </Descriptions.Item>
          <Descriptions.Item label={t('profile:displayName')}>
            {user?.display_name || '-'}
          </Descriptions.Item>
          <Descriptions.Item label={t('profile:email')}>
            {user?.email || '-'}
          </Descriptions.Item>
          <Descriptions.Item label={t('profile:authType')}>
            <Tag color={user?.auth_type === 'local' ? 'blue' : 'green'}>
              {user?.auth_type === 'local' ? t('profile:localAuth') : t('profile:ldapAuth')}
            </Tag>
          </Descriptions.Item>
          <Descriptions.Item label={t('profile:accountStatus')}>
            <Tag color={user?.status === 'active' ? 'success' : 'error'}>
              {user?.status === 'active' ? t('profile:statusActive') : t('profile:statusDisabled')}
            </Tag>
          </Descriptions.Item>
          <Descriptions.Item label={t('profile:createdAt')}>
            {formatDateTime(user?.created_at)}
          </Descriptions.Item>
          <Descriptions.Item label={t('profile:lastLoginAt')}>
            {formatDateTime(user?.last_login_at)}
          </Descriptions.Item>
          <Descriptions.Item label={t('profile:lastLoginIp')} span={2}>
            {user?.last_login_ip || '-'}
          </Descriptions.Item>
        </Descriptions>

        {user?.auth_type === 'ldap' && (
          <div style={{ marginTop: '16px', padding: '12px', background: '#e6f7ff', border: '1px solid #91d5ff', borderRadius: '4px' }}>
            <SafetyOutlined style={{ color: '#1890ff', marginRight: '8px' }} />
            <span style={{ color: '#1890ff' }}>
              {t('profile:ldapPasswordHint')}
            </span>
          </div>
        )}
      </Card>

      <Modal
        title={
          <Space>
            <LockOutlined />
            <span>{t('profile:changePasswordTitle')}</span>
          </Space>
        }
        open={changePasswordModalVisible}
        onOk={handleChangePassword}
        onCancel={handleCancelChangePassword}
        confirmLoading={changePasswordLoading}
        width={500}
        okText={t('profile:confirmChange')}
        cancelText={t('common:actions.cancel')}
      >
        <Form
          form={form}
          layout="vertical"
          autoComplete="off"
        >
          <Form.Item
            label={t('profile:oldPassword')}
            name="old_password"
            rules={[
              { required: true, message: t('profile:oldPasswordRequired') },
            ]}
          >
            <Input.Password
              prefix={<LockOutlined />}
              placeholder={t('profile:oldPasswordPlaceholder')}
              autoComplete="current-password"
            />
          </Form.Item>

          <Form.Item
            label={t('profile:newPassword')}
            name="new_password"
            rules={[
              { required: true, message: t('profile:newPasswordRequired') },
              { min: 6, message: t('profile:newPasswordMinLength') },
              { max: 32, message: t('profile:newPasswordMaxLength') },
            ]}
          >
            <Input.Password
              prefix={<LockOutlined />}
              placeholder={t('profile:newPasswordPlaceholder')}
              autoComplete="new-password"
            />
          </Form.Item>

          <Form.Item
            label={t('profile:confirmPassword')}
            name="confirm_password"
            dependencies={['new_password']}
            rules={[
              { required: true, message: t('profile:confirmPasswordRequired') },
              ({ getFieldValue }) => ({
                validator(_, value) {
                  if (!value || getFieldValue('new_password') === value) {
                    return Promise.resolve();
                  }
                  return Promise.reject(new Error(t('profile:passwordMismatch')));
                },
              }),
            ]}
          >
            <Input.Password
              prefix={<LockOutlined />}
              placeholder={t('profile:confirmPasswordPlaceholder')}
              autoComplete="new-password"
            />
          </Form.Item>

          <div style={{ padding: '12px', background: '#fff7e6', border: '1px solid #ffd591', borderRadius: '4px', marginTop: '8px' }}>
            <p style={{ margin: 0, color: '#d46b08' }}>
              <strong>{t('profile:passwordTip')}</strong>
            </p>
            <ul style={{ margin: '4px 0 0 0', paddingLeft: '20px', color: '#d46b08' }}>
              <li>{t('profile:passwordTip1')}</li>
              <li>{t('profile:passwordTip2')}</li>
              <li>{t('profile:passwordTip3')}</li>
            </ul>
          </div>
        </Form>
      </Modal>
    </div>
  );
};

export default UserProfile;
