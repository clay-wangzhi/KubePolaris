import React, { useState, useEffect } from 'react';
import { Card, Descriptions, Button, Modal, Form, Input, Space, Tag, Spin, App } from 'antd';
import { UserOutlined, LockOutlined, SafetyOutlined } from '@ant-design/icons';
import { authService, tokenManager } from '../../services/authService';
import type { User } from '../../types';

const UserProfile: React.FC = () => {
  const { message } = App.useApp();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(false);
  const [changePasswordModalVisible, setChangePasswordModalVisible] = useState(false);
  const [changePasswordLoading, setChangePasswordLoading] = useState(false);
  const [form] = Form.useForm();

  // 加载用户信息
  useEffect(() => {
    loadUserProfile();
  }, []);

  const loadUserProfile = async () => {
    setLoading(true);
    try {
      const response = await authService.getProfile();
      if (response.code === 200) {
        setUser(response.data);
        // 更新本地存储的用户信息
        tokenManager.setUser(response.data);
      } else {
        message.error(response.message || '获取用户信息失败');
      }
    } catch (error) {
      message.error('获取用户信息失败');
      console.error('加载用户信息失败:', error);
    } finally {
      setLoading(false);
    }
  };

  // 打开修改密码对话框
  const handleOpenChangePassword = () => {
    if (user?.auth_type === 'ldap') {
      message.warning('LDAP用户不能在此修改密码，请联系管理员');
      return;
    }
    setChangePasswordModalVisible(true);
    form.resetFields();
  };

  // 处理修改密码
  const handleChangePassword = async () => {
    try {
      const values = await form.validateFields();
      
      // 验证新密码和确认密码是否一致
      if (values.new_password !== values.confirm_password) {
        message.error('两次输入的新密码不一致');
        return;
      }

      setChangePasswordLoading(true);

      const response = await authService.changePassword({
        old_password: values.old_password,
        new_password: values.new_password,
      });

      if (response.code === 200) {
        message.success('密码修改成功');
        setChangePasswordModalVisible(false);
        form.resetFields();
      } else {
        message.error(response.message || '密码修改失败');
      }
    } catch (error: any) {
      if (error.errorFields) {
        // 表单验证错误
        return;
      }
      // 处理HTTP错误响应
      const errorMessage = error?.response?.data?.message || error?.message || '密码修改失败，请稍后重试';
      message.error(errorMessage);
      console.error('修改密码失败:', error);
    } finally {
      setChangePasswordLoading(false);
    }
  };

  // 取消修改密码
  const handleCancelChangePassword = () => {
    setChangePasswordModalVisible(false);
    form.resetFields();
  };

  // 格式化日期时间
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
            <span>个人资料</span>
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
              修改密码
            </Button>
          </Space>
        }
      >
        <Descriptions bordered column={2}>
          <Descriptions.Item label="用户ID">
            {user?.id}
          </Descriptions.Item>
          <Descriptions.Item label="用户名">
            {user?.username}
          </Descriptions.Item>
          <Descriptions.Item label="显示名称">
            {user?.display_name || '-'}
          </Descriptions.Item>
          <Descriptions.Item label="邮箱">
            {user?.email || '-'}
          </Descriptions.Item>
          <Descriptions.Item label="认证类型">
            <Tag color={user?.auth_type === 'local' ? 'blue' : 'green'}>
              {user?.auth_type === 'local' ? '本地认证' : 'LDAP认证'}
            </Tag>
          </Descriptions.Item>
          <Descriptions.Item label="账号状态">
            <Tag color={user?.status === 'active' ? 'success' : 'error'}>
              {user?.status === 'active' ? '正常' : '禁用'}
            </Tag>
          </Descriptions.Item>
          <Descriptions.Item label="创建时间">
            {formatDateTime(user?.created_at)}
          </Descriptions.Item>
          <Descriptions.Item label="最后登录时间">
            {formatDateTime(user?.last_login_at)}
          </Descriptions.Item>
          <Descriptions.Item label="最后登录IP" span={2}>
            {user?.last_login_ip || '-'}
          </Descriptions.Item>
        </Descriptions>

        {user?.auth_type === 'ldap' && (
          <div style={{ marginTop: '16px', padding: '12px', background: '#e6f7ff', border: '1px solid #91d5ff', borderRadius: '4px' }}>
            <SafetyOutlined style={{ color: '#1890ff', marginRight: '8px' }} />
            <span style={{ color: '#1890ff' }}>
              您使用的是LDAP认证，密码修改请联系系统管理员
            </span>
          </div>
        )}
      </Card>

      {/* 修改密码对话框 */}
      <Modal
        title={
          <Space>
            <LockOutlined />
            <span>修改密码</span>
          </Space>
        }
        open={changePasswordModalVisible}
        onOk={handleChangePassword}
        onCancel={handleCancelChangePassword}
        confirmLoading={changePasswordLoading}
        width={500}
        okText="确定修改"
        cancelText="取消"
      >
        <Form
          form={form}
          layout="vertical"
          autoComplete="off"
        >
          <Form.Item
            label="原密码"
            name="old_password"
            rules={[
              { required: true, message: '请输入原密码' },
            ]}
          >
            <Input.Password
              prefix={<LockOutlined />}
              placeholder="请输入原密码"
              autoComplete="current-password"
            />
          </Form.Item>

          <Form.Item
            label="新密码"
            name="new_password"
            rules={[
              { required: true, message: '请输入新密码' },
              { min: 6, message: '密码长度不能少于6位' },
              { max: 32, message: '密码长度不能超过32位' },
            ]}
          >
            <Input.Password
              prefix={<LockOutlined />}
              placeholder="请输入新密码（6-32位）"
              autoComplete="new-password"
            />
          </Form.Item>

          <Form.Item
            label="确认新密码"
            name="confirm_password"
            dependencies={['new_password']}
            rules={[
              { required: true, message: '请再次输入新密码' },
              ({ getFieldValue }) => ({
                validator(_, value) {
                  if (!value || getFieldValue('new_password') === value) {
                    return Promise.resolve();
                  }
                  return Promise.reject(new Error('两次输入的密码不一致'));
                },
              }),
            ]}
          >
            <Input.Password
              prefix={<LockOutlined />}
              placeholder="请再次输入新密码"
              autoComplete="new-password"
            />
          </Form.Item>

          <div style={{ padding: '12px', background: '#fff7e6', border: '1px solid #ffd591', borderRadius: '4px', marginTop: '8px' }}>
            <p style={{ margin: 0, color: '#d46b08' }}>
              <strong>提示：</strong>
            </p>
            <ul style={{ margin: '4px 0 0 0', paddingLeft: '20px', color: '#d46b08' }}>
              <li>密码长度为6-32位</li>
              <li>请妥善保管您的密码</li>
              <li>建议定期修改密码以提高安全性</li>
            </ul>
          </div>
        </Form>
      </Modal>
    </div>
  );
};

export default UserProfile;
