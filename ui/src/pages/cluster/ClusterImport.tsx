import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Card,
  Form,
  Input,
  Button,
  Space,
  Steps,
  Radio,
  message,
  Alert,
  Typography,
} from 'antd';
import {
  ArrowLeftOutlined,
  CheckCircleOutlined,
  LoadingOutlined,
  CloudServerOutlined,
} from '@ant-design/icons';
import { clusterService } from '../../services/clusterService';
import { useTranslation } from 'react-i18next';
import { parseApiError } from '../../utils/api';
const { Step } = Steps;
const { TextArea } = Input;
const { Title, Text } = Typography;


const ClusterImport: React.FC = () => {
const { t } = useTranslation(['cluster', 'common']);
const navigate = useNavigate();
  const [form] = Form.useForm();
  const [currentStep, setCurrentStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [testLoading, setTestLoading] = useState(false);
  const [connectionType, setConnectionType] = useState<'kubeconfig' | 'token'>('kubeconfig');
  const [testResult, setTestResult] = useState<{ 
    success: boolean; 
    message?: string;
    version?: string;
    readyNodes?: number;
    nodeCount?: number;
    status?: string;
  } | null>(null);

  // 测试连接
  const handleTestConnection = async () => {
    try {
      const values = await form.validateFields();
      setTestLoading(true);
      
      const testData = {
        apiServer: values.apiServer,
        kubeconfig: connectionType === 'kubeconfig' ? values.kubeconfig : undefined,
        token: connectionType === 'token' ? values.token : undefined,
        caCert: connectionType === 'token' ? values.caCert : undefined,
      };

      const response = await clusterService.testConnection(testData);
      setTestResult(response as { 
        success: boolean; 
        message?: string;
        version?: string;
        readyNodes?: number;
        nodeCount?: number;
        status?: string;
      });
      message.success(t('common:messages.connectionTestSuccess'));
      setCurrentStep(2);
    } catch (error: unknown) {
      message.error(`${t('common:messages.connectionTestFailed')}: ${parseApiError(error)}`);
      setTestResult(null);
    } finally {
      setTestLoading(false);
    }
  };

  // 导入集群
  const handleImport = async () => {
    try {
      const values = await form.validateFields();
      setLoading(true);

      const importData = {
        name: values.name,
        description: values.description,
        connectionType: values.connectionType,
        apiServer: values.apiServer || '',
        kubeconfig: connectionType === 'kubeconfig' ? values.kubeconfig : undefined,
        token: connectionType === 'token' ? values.token : undefined,
        caCert: connectionType === 'token' ? values.caCert : undefined,
      };

      await clusterService.importCluster(importData);
      message.success(t('import.importSuccess'));
      navigate('/clusters');
    } catch (error: unknown) {
      message.error(`${t('import.importFailed')}: ${parseApiError(error)}`);
    } finally {
      setLoading(false);
    }
  };

const steps = [
    {
      title: t('import.steps.basicInfo'),
      description: t('import.steps.basicInfoDesc'),
    },
    {
      title: t('import.steps.connectionConfig'),
      description: t('import.steps.connectionConfigDesc'),
    },
    {
      title: t('import.steps.testConnection'),
      description: t('import.steps.testConnectionDesc'),
    },
    {
      title: t('import.steps.complete'),
      description: t('import.steps.completeDesc'),
    },
  ];
return (
    <div>
      {/* 页面头部 */}
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 24 }}>
          <Button
            icon={<ArrowLeftOutlined />}
            onClick={() => navigate('/clusters')}
            style={{ marginRight: 16 }}
          >
            {t('common:actions.back')}
          </Button>
          <div>
            <Title level={2} style={{ margin: 0 }}>
              <CloudServerOutlined style={{ marginRight: 8 }} />
              {t('import.title')}
            </Title>
            <Text type="secondary">{t('import.subtitle')}</Text>
          </div>
        </div>
      </div>

      <Card>
        <Steps current={currentStep} style={{ marginBottom: 32 }}>
          {steps.map((step, index) => (
            <Step
              key={index}
              title={step.title}
              description={step.description}
              icon={
                index < currentStep ? (
                  <CheckCircleOutlined />
                ) : index === currentStep && (testLoading || loading) ? (
                  <LoadingOutlined />
                ) : undefined
              }
            />
          ))}
        </Steps>

        <Form
          form={form}
          layout="vertical"
          initialValues={{
            connectionType: 'kubeconfig',
          }}
        >
          {/* 步骤1: 基本信息 */}
          <div style={{ display: currentStep === 0 ? 'block' : 'none' }}>
<Title level={4}>{t('import.clusterBasicInfo')}</Title>
            <Form.Item
              name="name"
              label={t('import.name')}
              rules={[
                { required: true, message: t('import.nameRequired') },
                { min: 2, max: 50, message: t('import.nameLength') },
              ]}
            >
              <Input placeholder={t('import.nameSample')} />
            </Form.Item>

            <Form.Item name="description" label={t('import.clusterDescription')}>
              <TextArea
                rows={3}
                placeholder={t('import.descriptionPlaceholder')}
maxLength={200}
              />
            </Form.Item>

            <div style={{ textAlign: 'right' }}>
              <Button type="primary" onClick={() => setCurrentStep(1)}>
                {t('common:actions.nextStep')}
              </Button>
            </div>
          </div>

          {/* 步骤2: 连接配置 */}
          <div style={{ display: currentStep === 1 ? 'block' : 'none' }}>
<Title level={4}>{t('import.steps.connectionConfig')}</Title>
            <Form.Item name="connectionType" label={t('import.connectionType')}>
              <Radio.Group
                value={connectionType}
                onChange={(e) => setConnectionType(e.target.value)}
              >
                <Radio.Button value="kubeconfig">{t('import.kubeconfigFile')}</Radio.Button>
                <Radio.Button value="token">{t('import.tokenAuth')}</Radio.Button>
</Radio.Group>
            </Form.Item>

            {connectionType === 'kubeconfig' && (
<Form.Item
                name="kubeconfig"
                label={t('import.kubeconfigContent')}
                rules={[{ required: true, message: t('import.kubeconfigContentRequired') }]}
              >
                <TextArea
                  rows={12}
                  placeholder={t('import.kubeconfigContentPlaceholder')}
style={{ fontFamily: 'monospace' }}
                />
              </Form.Item>
            )}

            {connectionType === 'token' && (
              <>
<Form.Item
                  name="apiServer"
                  label={t('import.apiServerAddress')}
                  rules={[
                    { required: true, message: t('import.apiServerRequired') },
                    { type: 'url', message: t('import.apiServerValid') },
                  ]}
>
                  <Input placeholder="https://your-cluster-api-server:6443" />
                </Form.Item>

<Form.Item
                  name="token"
                  label={t('import.accessToken')}
                  rules={[{ required: true, message: t('import.accessTokenRequired') }]}
                >
                  <TextArea
                    rows={4}
                    placeholder={t('import.accessTokenPlaceholder')}
                    style={{ fontFamily: 'monospace' }}
                  />
                </Form.Item>

                <Form.Item name="caCert" label={t('import.caCert')}>
                  <TextArea
                    rows={6}
                    placeholder={t('import.caCertPlaceholder')}
                    style={{ fontFamily: 'monospace' }}
                  />
                </Form.Item>
</>
            )}

            <div style={{ textAlign: 'right' }}>
              <Space>
<Button onClick={() => setCurrentStep(0)}>{t('common:actions.prevStep')}</Button>
                <Button type="primary" onClick={handleTestConnection} loading={testLoading}>
                  {t('import.testConnection')}
                </Button>
</Space>
            </div>
          </div>

          {/* 步骤3: 测试连接 */}
          <div style={{ display: currentStep === 2 ? 'block' : 'none' }}>
<Title level={4}>{t('import.testResult')}</Title>
            {testResult && (
              <Alert
                message={t('import.testResultSuccess')}
                description={
                  <div>
                    <p><strong>{t('import.clusterVersion')}:</strong> {testResult.version}</p>
                    <p><strong>{t('import.nodeCount')}:</strong> {testResult.readyNodes}/{testResult.nodeCount}</p>
                    <p><strong>{t('import.clusterStatus')}:</strong> {testResult.status}</p>
                  </div>
                }
                type="success"
                showIcon
                style={{ marginBottom: 24 }}
              />
            )}

            <div style={{ textAlign: 'right' }}>
              <Space>
                <Button onClick={() => setCurrentStep(1)}>{t('common:actions.reconfigure')}</Button>
                <Button type="primary" onClick={() => setCurrentStep(3)}>
                  {t('import.confirmImport')}
                </Button>
              </Space>
            </div>
</div>

          {/* 步骤4: 完成导入 */}
          <div style={{ display: currentStep === 3 ? 'block' : 'none' }}>
<Title level={4}>{t('import.confirmImport')}</Title>
            <Alert
              message={t('import.confirmImportAlert')}
              type="info"
              style={{ marginBottom: 24 }}
            />

            <div style={{ background: '#fafafa', padding: 16, borderRadius: 6, marginBottom: 24 }}>
              <p><strong>{t('detail.clusterName')}:</strong> {form.getFieldValue('name')}</p>
              <p><strong>{t('import.connectionMethod')}:</strong> {connectionType === 'kubeconfig' ? t('import.kubeconfigFile') : t('import.tokenAuth')}</p>
              {connectionType === 'token' && (
                <p><strong>API Server:</strong> {form.getFieldValue('apiServer')}</p>
              )}
              {testResult && (
                <>
                  <p><strong>{t('import.clusterVersion')}:</strong> {testResult.version}</p>
                  <p><strong>{t('detail.nodeCount')}:</strong> {testResult.readyNodes}/{testResult.nodeCount} {t('import.nodeStatusReady')}</p>
                </>
              )}
            </div>

            <div style={{ textAlign: 'right' }}>
              <Space>
                <Button onClick={() => setCurrentStep(2)}>{t('common:actions.prevStep')}</Button>
                <Button type="primary" onClick={handleImport} loading={loading}>
                  {t('import.title')}
                </Button>
              </Space>
            </div>
</div>
        </Form>
      </Card>
    </div>
  );
};

export default ClusterImport;
