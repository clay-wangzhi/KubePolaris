import React, { useState, useEffect, useCallback } from 'react';
import {
  Card,
  Form,
  Input,
  Select,
  Button,
  message,
  Space,
  Divider,
  Row,
  Col,
  Modal,
  Alert,
  Typography,
  Collapse,
} from 'antd';
import { SaveOutlined, ExperimentOutlined, CheckCircleOutlined, CloseCircleOutlined } from '@ant-design/icons';
import api from '../utils/api';

const { Option } = Select;
const { TextArea } = Input;
const { Text } = Typography;
const { Panel } = Collapse;

interface MonitoringConfig {
  type: 'disabled' | 'prometheus' | 'victoriametrics';
  endpoint: string;
  auth?: {
    type: 'none' | 'basic' | 'bearer' | 'mtls';
    username?: string;
    password?: string;
    token?: string;
    certFile?: string;
    keyFile?: string;
    caFile?: string;
  };
  labels?: Record<string, string>;
  options?: Record<string, unknown>;
}

interface MonitoringTemplates {
  disabled: MonitoringConfig;
  prometheus: MonitoringConfig;
  victoriametrics: MonitoringConfig;
}

interface MonitoringConfigFormProps {
  clusterId: string;
  onConfigChange?: () => void;
}

const MonitoringConfigForm: React.FC<MonitoringConfigFormProps> = ({
  clusterId,
  onConfigChange,
}) => {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [testing, setTesting] = useState(false);
  const [templates, setTemplates] = useState<MonitoringTemplates | null>(null);
  const [configType, setConfigType] = useState<string>('disabled');
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [saveResult, setSaveResult] = useState<{ success: boolean; message: string } | null>(null);

  const loadTemplates = async () => {
    try {
      const response = await api.get('/monitoring/templates');
      setTemplates(response.data.data);
    } catch (error: unknown) {
      console.error('加载监控模板失败:', error);
      message.error('加载监控模板失败');
    }
  };

  const loadCurrentConfig = useCallback(async () => {
    try {
      const response = await api.get(`/clusters/${clusterId}/monitoring/config`);
      const config = response.data.data;
      setConfigType(config.type);
      form.setFieldsValue(config);
    } catch (error: unknown) {
      console.error('加载当前配置失败:', error);
      message.error('加载当前配置失败');
    }
  }, [clusterId, form]);

  useEffect(() => {
    loadTemplates();
    loadCurrentConfig();
  }, [clusterId, loadCurrentConfig]);

  const handleTypeChange = (type: string) => {
    setConfigType(type);
    if (templates && templates[type as keyof MonitoringTemplates]) {
      const template = templates[type as keyof MonitoringTemplates];
      form.setFieldsValue(template);
    }
  };

  const handleSave = async () => {
    try {
      setLoading(true);
      setSaveResult(null);
      
      // 表单验证
      const values = await form.validateFields();
      
      // 发送保存请求
      const response = await api.put(`/clusters/${clusterId}/monitoring/config`, values);
      
      // 显示成功消息
      const successMsg = response.data?.message || '监控配置保存成功';
      message.success(successMsg);
      setSaveResult({ success: true, message: successMsg });
      onConfigChange?.();
    } catch (error: unknown) {
      console.error('保存监控配置失败:', error);
      
      // 处理表单验证错误
      if (error && typeof error === 'object' && 'errorFields' in error) {
        const errorMsg = '请检查表单填写是否正确';
        message.error(errorMsg);
        setSaveResult({ success: false, message: errorMsg });
        return;
      }
      
      // 处理API错误
      let errorMsg = '保存监控配置失败';
      if (error && typeof error === 'object' && 'response' in error) {
        const axiosError = error as { response?: { data?: { message?: string } } };
        errorMsg = axiosError.response?.data?.message || errorMsg;
      } else if (error instanceof Error) {
        errorMsg = error.message;
      }
      
      message.error(errorMsg);
      setSaveResult({ success: false, message: errorMsg });
    } finally {
      setLoading(false);
    }
  };

  const handleTest = async () => {
    try {
      setTesting(true);
      setTestResult(null);
      
      // 表单验证
      const values = await form.validateFields();
      
      // 如果监控类型是禁用，不允许测试
      if (values.type === 'disabled') {
        message.warning('请先选择监控类型');
        setTestResult({ success: false, message: '监控功能已禁用，无法测试连接' });
        return;
      }
      
      // 发送测试请求
      const response = await api.post(`/clusters/${clusterId}/monitoring/test-connection`, values);
      
      // 显示成功消息
      const successMsg = response.data?.message || '连接测试成功';
      message.success(successMsg);
      setTestResult({ success: true, message: successMsg });
    } catch (error: unknown) {
      console.error('连接测试失败:', error);
      
      // 处理表单验证错误
      if (error && typeof error === 'object' && 'errorFields' in error) {
        const errorMsg = '请检查表单填写是否正确';
        message.error(errorMsg);
        setTestResult({ success: false, message: errorMsg });
        return;
      }
      
      // 处理API错误
      let errorMsg = '连接测试失败';
      if (error && typeof error === 'object' && 'response' in error) {
        const axiosError = error as { response?: { data?: { message?: string } } };
        errorMsg = axiosError.response?.data?.message || errorMsg;
      } else if (error instanceof Error) {
        errorMsg = error.message;
      }
      
      message.error(errorMsg);
      setTestResult({ success: false, message: errorMsg });
    } finally {
      setTesting(false);
    }
  };

  const renderAuthConfig = () => {
    return (
      <Card title="认证配置" size="small">
        <Form.Item
          name={['auth', 'type']}
          label="认证类型"
          rules={[{ required: configType !== 'disabled', message: '请选择认证类型' }]}
          initialValue="none"
        >
          <Select placeholder="选择认证类型">
            <Option value="none">无需认证</Option>
            <Option value="basic">Basic Auth</Option>
            <Option value="bearer">Bearer Token</Option>
            <Option value="mtls">mTLS</Option>
          </Select>
        </Form.Item>

        <Form.Item
          noStyle
          shouldUpdate={(prevValues, currentValues) =>
            prevValues?.auth?.type !== currentValues?.auth?.type
          }
        >
          {({ getFieldValue }) => {
            const authType = getFieldValue(['auth', 'type']);

            if (authType === 'none') {
              return (
                <Alert
                  message="无需认证"
                  description="将直接访问监控端点，不进行任何身份验证。"
                  type="info"
                  showIcon
                  style={{ marginTop: 16 }}
                />
              );
            }

            if (authType === 'basic') {
              return (
                <>
                  <Form.Item
                    name={['auth', 'username']}
                    label="用户名"
                    rules={[{ required: true, message: '请输入用户名' }]}
                  >
                    <Input placeholder="请输入用户名" />
                  </Form.Item>
                  <Form.Item
                    name={['auth', 'password']}
                    label="密码"
                    rules={[{ required: true, message: '请输入密码' }]}
                  >
                    <Input.Password placeholder="请输入密码" />
                  </Form.Item>
                </>
              );
            }

            if (authType === 'bearer') {
              return (
                <Form.Item
                  name={['auth', 'token']}
                  label="Token"
                  rules={[{ required: true, message: '请输入Token' }]}
                >
                  <Input.Password placeholder="请输入Bearer Token" />
                </Form.Item>
              );
            }

            if (authType === 'mtls') {
              return (
                <>
                  <Form.Item
                    name={['auth', 'certFile']}
                    label="证书文件路径"
                    rules={[{ required: true, message: '请输入证书文件路径' }]}
                  >
                    <Input placeholder="请输入证书文件路径" />
                  </Form.Item>
                  <Form.Item
                    name={['auth', 'keyFile']}
                    label="密钥文件路径"
                    rules={[{ required: true, message: '请输入密钥文件路径' }]}
                  >
                    <Input placeholder="请输入密钥文件路径" />
                  </Form.Item>
                  <Form.Item
                    name={['auth', 'caFile']}
                    label="CA文件路径"
                  >
                    <Input placeholder="请输入CA文件路径（可选）" />
                  </Form.Item>
                </>
              );
            }

            return null;
          }}
        </Form.Item>
      </Card>
    );
  };

  const renderLabelsConfig = () => {
    return (
      <Card title="标签配置" size="small">
        <Alert
          message="标签配置说明"
          description="用于统一数据源（如VictoriaMetrics）时区分不同集群的监控数据。"
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
        />
        <Form.Item
          name={['labels', 'cluster']}
          label="集群标签"
          tooltip="用于标识集群的标签键值对"
        >
          <Input placeholder="例如: cluster-name" />
        </Form.Item>
        <Text type="secondary">
          其他标签可以通过高级配置添加
        </Text>
      </Card>
    );
  };

  return (
    <div>
      <Card title="监控配置" extra={
        <Space>
          <Button
            icon={<ExperimentOutlined />}
            onClick={handleTest}
            loading={testing}
            disabled={configType === 'disabled'}
          >
            测试连接
          </Button>
          <Button
            type="primary"
            icon={<SaveOutlined />}
            onClick={handleSave}
            loading={loading}
          >
            保存配置
          </Button>
        </Space>
      }>
        {/* 测试结果弹窗 */}
        <Modal
          open={testResult !== null}
          title={
            <Space>
              {testResult?.success ? (
                <CheckCircleOutlined style={{ color: '#52c41a', fontSize: 20 }} />
              ) : (
                <CloseCircleOutlined style={{ color: '#ff4d4f', fontSize: 20 }} />
              )}
              <span>{testResult?.success ? '连接测试成功' : '连接测试失败'}</span>
            </Space>
          }
          onCancel={() => setTestResult(null)}
          footer={[
            <Button key="ok" type="primary" onClick={() => setTestResult(null)}>
              确定
            </Button>
          ]}
        >
          <p>{testResult?.message}</p>
        </Modal>
        
        {/* 保存结果弹窗 */}
        <Modal
          open={saveResult !== null}
          title={
            <Space>
              {saveResult?.success ? (
                <CheckCircleOutlined style={{ color: '#52c41a', fontSize: 20 }} />
              ) : (
                <CloseCircleOutlined style={{ color: '#ff4d4f', fontSize: 20 }} />
              )}
              <span>{saveResult?.success ? '配置保存成功' : '配置保存失败'}</span>
            </Space>
          }
          onCancel={() => setSaveResult(null)}
          footer={[
            <Button key="ok" type="primary" onClick={() => setSaveResult(null)}>
              确定
            </Button>
          ]}
        >
          <p>{saveResult?.message}</p>
        </Modal>
        
        <Form
          form={form}
          layout="vertical"
          initialValues={{ type: 'disabled' }}
        >
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="type"
                label="监控类型"
                rules={[{ required: true, message: '请选择监控类型' }]}
              >
                <Select onChange={handleTypeChange}>
                  <Option value="disabled">禁用监控</Option>
                  <Option value="prometheus">Prometheus</Option>
                  <Option value="victoriametrics">VictoriaMetrics</Option>
                </Select>
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="endpoint"
                label="监控端点"
                rules={[
                  { required: configType !== 'disabled', message: '请输入监控端点' },
                  { type: 'url', message: '请输入有效的URL' }
                ]}
              >
                <Input placeholder="http://prometheus:9090" />
              </Form.Item>
            </Col>
          </Row>

          {configType !== 'disabled' && (
            <>
              <Divider />
              {renderAuthConfig()}
              <Divider />
              {renderLabelsConfig()}
            </>
          )}

          <Collapse>
            <Panel header="高级配置" key="advanced">
              <Form.Item
                name="options"
                label="额外选项"
                tooltip="JSON格式的额外配置选项"
              >
                <TextArea
                  rows={4}
                  placeholder='{"timeout": "30s", "maxPoints": 1000}'
                />
              </Form.Item>
            </Panel>
          </Collapse>
        </Form>
      </Card>

      <Card title="配置说明" style={{ marginTop: 16 }}>
        <Collapse>
          <Panel header="Prometheus 配置" key="prometheus">
            <div>
              <Text strong>直接连接 Prometheus：</Text>
              <ul>
                <li>端点：<Text code>http://prometheus-server:9090</Text></li>
                <li>认证：支持无需认证、Basic Auth、Bearer Token</li>
                <li>标签：通常不需要额外标签</li>
              </ul>
            </div>
          </Panel>
          <Panel header="VictoriaMetrics 配置" key="victoriametrics">
            <div>
              <Text strong>统一数据源 VictoriaMetrics：</Text>
              <ul>
                <li>端点：<Text code>http://victoriametrics:8428</Text></li>
                <li>认证：支持无需认证、Basic Auth、Bearer Token</li>
                <li>标签：<Text code>cluster="cluster-name"</Text> 用于区分集群</li>
                <li>优势：支持多集群数据统一存储和查询</li>
              </ul>
            </div>
          </Panel>
          <Panel header="标签说明" key="labels">
            <div>
              <Text strong>标签配置说明：</Text>
              <ul>
                <li><Text code>cluster</Text>：集群标识，用于区分不同集群的监控数据</li>
                <li><Text code>environment</Text>：环境标识，如 prod、test、dev</li>
                <li><Text code>region</Text>：地域标识，如 us-east-1、ap-southeast-1</li>
                <li>其他自定义标签可根据需要添加</li>
              </ul>
            </div>
          </Panel>
        </Collapse>
      </Card>
    </div>
  );
};

export default MonitoringConfigForm;
