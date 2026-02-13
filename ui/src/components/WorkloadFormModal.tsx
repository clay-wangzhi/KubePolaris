import React, { useState, useEffect } from 'react';
import {
  Modal,
  Form,
  Input,
  InputNumber,
  Select,
  Switch,
  Button,
  Space,
  Row,
  Col,
  Tabs,
  Card,
  App,
} from 'antd';
import { PlusOutlined, MinusCircleOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';

const { Option } = Select;
const { TextArea } = Input;

export interface WorkloadFormData {
  name: string;
  namespace: string;
  replicas?: number;
  image: string;
  containerName: string;
  containerPort?: number;
  command?: string[];
  args?: string[];
  env?: Array<{ name: string; value: string }>;
  resources?: {
    limits?: {
      cpu?: string;
      memory?: string;
    };
    requests?: {
      cpu?: string;
      memory?: string;
    };
  };
  labels?: Record<string, string>;
  annotations?: Record<string, string>;
  // StatefulSet specific
  serviceName?: string;
  volumeClaimTemplates?: Array<{
    name: string;
    storageClass?: string;
    accessMode: string;
    size: string;
  }>;
  // CronJob specific
  schedule?: string;
  suspend?: boolean;
  // Job specific
  completions?: number;
  parallelism?: number;
  backoffLimit?: number;
  // Rollout specific
  strategy?: 'BlueGreen' | 'Canary';
  steps?: Array<{ weight?: number; pause?: { duration?: number } }>;
}

interface WorkloadFormModalProps {
  visible: boolean;
  mode: 'create' | 'update';
  workloadType: 'Deployment' | 'StatefulSet' | 'DaemonSet' | 'Rollout' | 'Job' | 'CronJob';
  initialData?: WorkloadFormData;
  namespaces: string[];
  onSubmit: (data: WorkloadFormData) => Promise<void>;
  onCancel: () => void;
}

const WorkloadFormModal: React.FC<WorkloadFormModalProps> = ({
  visible,
  mode,
  workloadType,
  initialData,
  namespaces,
  onSubmit,
  onCancel,
}) => {
  const { t } = useTranslation('components');
  const [form] = Form.useForm();
  const [submitting, setSubmitting] = useState(false);
  const { message: messageApi } = App.useApp();

  useEffect(() => {
    if (visible) {
      if (initialData) {
        form.setFieldsValue(initialData);
      } else {
        form.resetFields();
        form.setFieldsValue({
          namespace: 'default',
          replicas: workloadType === 'DaemonSet' ? undefined : 1,
          containerName: 'main',
          resources: {
            requests: {
              cpu: '100m',
              memory: '128Mi',
            },
            limits: {
              cpu: '500m',
              memory: '512Mi',
            },
          },
        });
      }
    }
  }, [visible, initialData, form, workloadType]);

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      setSubmitting(true);

      const formData: WorkloadFormData = {
        ...values,
        env: values.env?.filter((item: { name?: string; value?: string }) => item.name && item.value),
      };

      await onSubmit(formData);
      messageApi.success(mode === 'create' ? t('workloadForm.createSuccess') : t('workloadForm.updateSuccess'));
      form.resetFields();
    } catch (error: unknown) {
      const err = error as { errorFields?: unknown[]; message?: string };
      if (err.errorFields) {
        messageApi.error(t('workloadForm.checkForm'));
      } else {
        messageApi.error(err.message || t('workloadForm.operationFailed'));
      }
    } finally {
      setSubmitting(false);
    }
  };

  const renderBasicFields = () => (
    <Card title={t('workloadForm.basicInfo')} style={{ marginBottom: 16 }}>
      <Row gutter={16}>
        <Col span={12}>
          <Form.Item
            name="name"
            label={t('workloadForm.name')}
            rules={[
              { required: true, message: t('workloadForm.nameRequired') },
              {
                pattern: /^[a-z0-9]([-a-z0-9]*[a-z0-9])?$/,
                message: t('workloadForm.namePattern'),
              },
            ]}
          >
            <Input placeholder={t('workloadForm.namePlaceholder')} disabled={mode === 'update'} />
          </Form.Item>
        </Col>
        <Col span={12}>
          <Form.Item
            name="namespace"
            label={t('workloadForm.namespace')}
            rules={[{ required: true, message: t('workloadForm.namespaceRequired') }]}
          >
            <Select
              placeholder={t('workloadForm.namespacePlaceholder')}
              showSearch
              disabled={mode === 'update'}
            >
              {namespaces.map((ns) => (
                <Option key={ns} value={ns}>
                  {ns}
                </Option>
              ))}
            </Select>
          </Form.Item>
        </Col>
      </Row>

      {workloadType !== 'DaemonSet' && (
        <Row gutter={16}>
          <Col span={12}>
            <Form.Item
              name="replicas"
              label={t('workloadForm.replicas')}
              rules={[{ required: true, message: t('workloadForm.replicasRequired') }]}
            >
              <InputNumber min={0} max={100} style={{ width: '100%' }} />
            </Form.Item>
          </Col>
        </Row>
      )}

      {workloadType === 'StatefulSet' && (
        <Row gutter={16}>
          <Col span={12}>
            <Form.Item
              name="serviceName"
              label={t('workloadForm.headlessService')}
              rules={[{ required: true, message: t('workloadForm.headlessServiceRequired') }]}
            >
              <Input placeholder={t('workloadForm.headlessServicePlaceholder')} />
            </Form.Item>
          </Col>
        </Row>
      )}

      {workloadType === 'CronJob' && (
        <Row gutter={16}>
          <Col span={12}>
            <Form.Item
              name="schedule"
              label={t('workloadForm.cronExpression')}
              rules={[{ required: true, message: t('workloadForm.cronRequired') }]}
            >
              <Input placeholder="0 0 * * *" />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item name="suspend" label={t('workloadForm.suspend')} valuePropName="checked">
              <Switch />
            </Form.Item>
          </Col>
        </Row>
      )}

      {workloadType === 'Job' && (
        <Row gutter={16}>
          <Col span={8}>
            <Form.Item name="completions" label={t('workloadForm.completions')}>
              <InputNumber min={1} style={{ width: '100%' }} />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item name="parallelism" label={t('workloadForm.parallelism')}>
              <InputNumber min={1} style={{ width: '100%' }} />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item name="backoffLimit" label={t('workloadForm.backoffLimit')}>
              <InputNumber min={0} style={{ width: '100%' }} />
            </Form.Item>
          </Col>
        </Row>
      )}
    </Card>
  );

  const renderContainerFields = () => (
    <Card title={t('workloadForm.containerConfig')} style={{ marginBottom: 16 }}>
      <Row gutter={16}>
        <Col span={12}>
          <Form.Item
            name="containerName"
            label={t('containerConfig.containerName')}
            rules={[{ required: true, message: t('containerConfig.containerNameRequired') }]}
          >
            <Input placeholder={t('containerConfig.containerNamePlaceholder')} />
          </Form.Item>
        </Col>
        <Col span={12}>
          <Form.Item
            name="image"
            label={t('containerConfig.image')}
            rules={[{ required: true, message: t('containerConfig.imageRequired') }]}
          >
            <Input placeholder="nginx:latest" />
          </Form.Item>
        </Col>
      </Row>

      <Row gutter={16}>
        <Col span={12}>
          <Form.Item name="containerPort" label={t('workloadForm.containerPort')}>
            <InputNumber
              min={1}
              max={65535}
              style={{ width: '100%' }}
              placeholder="8080"
            />
          </Form.Item>
        </Col>
      </Row>

      <Form.Item label={t('workloadForm.envVars')}>
        <Form.List name="env">
          {(fields, { add, remove }) => (
            <>
              {fields.map((field) => (
                <Space key={field.key} style={{ display: 'flex', marginBottom: 8 }}>
                  <Form.Item
                    {...field}
                    name={[field.name, 'name']}
                    rules={[{ required: true, message: t('workloadForm.envVarNameRequired') }]}
                    style={{ marginBottom: 0 }}
                  >
                    <Input placeholder={t('workloadForm.envVarName')} style={{ width: 200 }} />
                  </Form.Item>
                  <Form.Item
                    {...field}
                    name={[field.name, 'value']}
                    rules={[{ required: true, message: t('workloadForm.envVarValueRequired') }]}
                    style={{ marginBottom: 0 }}
                  >
                    <Input placeholder={t('workloadForm.envVarValue')} style={{ width: 300 }} />
                  </Form.Item>
                  <MinusCircleOutlined onClick={() => remove(field.name)} />
                </Space>
              ))}
              <Button type="dashed" onClick={() => add()} icon={<PlusOutlined />}>
                {t('workloadForm.addEnvVar')}
              </Button>
            </>
          )}
        </Form.List>
      </Form.Item>
    </Card>
  );

  const renderResourceFields = () => (
    <Card title={t('workloadForm.resourceConfig')} style={{ marginBottom: 16 }}>
      <Row gutter={16}>
        <Col span={12}>
          <h4 style={{ marginBottom: 16 }}>{t('workloadForm.requestResources')}</h4>
          <Form.Item name={['resources', 'requests', 'cpu']} label="CPU">
            <Input placeholder="100m" />
          </Form.Item>
          <Form.Item name={['resources', 'requests', 'memory']} label={t('containerConfig.memory')}>
            <Input placeholder="128Mi" />
          </Form.Item>
        </Col>
        <Col span={12}>
          <h4 style={{ marginBottom: 16 }}>{t('workloadForm.limitResources')}</h4>
          <Form.Item name={['resources', 'limits', 'cpu']} label="CPU">
            <Input placeholder="500m" />
          </Form.Item>
          <Form.Item name={['resources', 'limits', 'memory']} label={t('containerConfig.memory')}>
            <Input placeholder="512Mi" />
          </Form.Item>
        </Col>
      </Row>
    </Card>
  );

  const renderLabelsFields = () => (
    <Card title={t('workloadForm.labelsAndAnnotations')} style={{ marginBottom: 16 }}>
      <Form.Item name="labels" label={t('workloadForm.labels')}>
        <TextArea
          rows={3}
          placeholder={t('workloadForm.labelsFormat')}
        />
      </Form.Item>
      <Form.Item name="annotations" label={t('workloadForm.annotations')}>
        <TextArea
          rows={3}
          placeholder={t('workloadForm.labelsFormat')}
        />
      </Form.Item>
    </Card>
  );

  const tabItems = [
    {
      key: 'basic',
      label: t('workloadForm.basicInfoTab'),
      children: renderBasicFields(),
    },
    {
      key: 'container',
      label: t('workloadForm.containerConfigTab'),
      children: renderContainerFields(),
    },
    {
      key: 'resources',
      label: t('workloadForm.resourceConfigTab'),
      children: renderResourceFields(),
    },
    {
      key: 'labels',
      label: t('workloadForm.labelsTab'),
      children: renderLabelsFields(),
    },
  ];

  return (
    <Modal
      title={`${mode === 'create' ? t('workloadForm.create') : t('workloadForm.update')} ${workloadType}`}
      open={visible}
      onCancel={onCancel}
      onOk={handleSubmit}
      confirmLoading={submitting}
      width={900}
      okText={t('workloadForm.ok')}
      cancelText={t('workloadForm.cancel')}
      destroyOnClose
    >
      <Form
        form={form}
        layout="vertical"
        preserve={false}
      >
        <Tabs items={tabItems} />
      </Form>
    </Modal>
  );
};

export default WorkloadFormModal;
