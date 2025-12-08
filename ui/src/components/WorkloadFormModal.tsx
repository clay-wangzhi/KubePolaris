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
  message,
  App,
} from 'antd';
import { PlusOutlined, MinusCircleOutlined } from '@ant-design/icons';

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
  const [form] = Form.useForm();
  const [submitting, setSubmitting] = useState(false);
  const { message: messageApi } = App.useApp();

  useEffect(() => {
    if (visible) {
      if (initialData) {
        form.setFieldsValue(initialData);
      } else {
        form.resetFields();
        // Set default values
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

      // Process form data
      const formData: WorkloadFormData = {
        ...values,
        env: values.env?.filter((item: any) => item.name && item.value),
      };

      await onSubmit(formData);
      messageApi.success(mode === 'create' ? '创建成功' : '更新成功');
      form.resetFields();
    } catch (error: any) {
      if (error.errorFields) {
        messageApi.error('请检查表单填写是否完整');
      } else {
        messageApi.error(error.message || '操作失败');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const renderBasicFields = () => (
    <Card title="基本信息" style={{ marginBottom: 16 }}>
      <Row gutter={16}>
        <Col span={12}>
          <Form.Item
            name="name"
            label="名称"
            rules={[
              { required: true, message: '请输入名称' },
              {
                pattern: /^[a-z0-9]([-a-z0-9]*[a-z0-9])?$/,
                message: '名称只能包含小写字母、数字和连字符',
              },
            ]}
          >
            <Input placeholder="请输入名称" disabled={mode === 'update'} />
          </Form.Item>
        </Col>
        <Col span={12}>
          <Form.Item
            name="namespace"
            label="命名空间"
            rules={[{ required: true, message: '请选择命名空间' }]}
          >
            <Select
              placeholder="请选择命名空间"
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
              label="副本数"
              rules={[{ required: true, message: '请输入副本数' }]}
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
              label="Headless Service"
              rules={[{ required: true, message: '请输入Service名称' }]}
            >
              <Input placeholder="请输入Headless Service名称" />
            </Form.Item>
          </Col>
        </Row>
      )}

      {workloadType === 'CronJob' && (
        <Row gutter={16}>
          <Col span={12}>
            <Form.Item
              name="schedule"
              label="Cron表达式"
              rules={[{ required: true, message: '请输入Cron表达式' }]}
            >
              <Input placeholder="例如: 0 0 * * *" />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item name="suspend" label="暂停" valuePropName="checked">
              <Switch />
            </Form.Item>
          </Col>
        </Row>
      )}

      {workloadType === 'Job' && (
        <Row gutter={16}>
          <Col span={8}>
            <Form.Item name="completions" label="完成次数">
              <InputNumber min={1} style={{ width: '100%' }} />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item name="parallelism" label="并行度">
              <InputNumber min={1} style={{ width: '100%' }} />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item name="backoffLimit" label="重试次数">
              <InputNumber min={0} style={{ width: '100%' }} />
            </Form.Item>
          </Col>
        </Row>
      )}
    </Card>
  );

  const renderContainerFields = () => (
    <Card title="容器配置" style={{ marginBottom: 16 }}>
      <Row gutter={16}>
        <Col span={12}>
          <Form.Item
            name="containerName"
            label="容器名称"
            rules={[{ required: true, message: '请输入容器名称' }]}
          >
            <Input placeholder="请输入容器名称" />
          </Form.Item>
        </Col>
        <Col span={12}>
          <Form.Item
            name="image"
            label="镜像"
            rules={[{ required: true, message: '请输入镜像地址' }]}
          >
            <Input placeholder="例如: nginx:latest" />
          </Form.Item>
        </Col>
      </Row>

      <Row gutter={16}>
        <Col span={12}>
          <Form.Item name="containerPort" label="容器端口">
            <InputNumber
              min={1}
              max={65535}
              style={{ width: '100%' }}
              placeholder="例如: 8080"
            />
          </Form.Item>
        </Col>
      </Row>

      <Form.Item label="环境变量">
        <Form.List name="env">
          {(fields, { add, remove }) => (
            <>
              {fields.map((field) => (
                <Space key={field.key} style={{ display: 'flex', marginBottom: 8 }}>
                  <Form.Item
                    {...field}
                    name={[field.name, 'name']}
                    rules={[{ required: true, message: '请输入环境变量名' }]}
                    style={{ marginBottom: 0 }}
                  >
                    <Input placeholder="变量名" style={{ width: 200 }} />
                  </Form.Item>
                  <Form.Item
                    {...field}
                    name={[field.name, 'value']}
                    rules={[{ required: true, message: '请输入环境变量值' }]}
                    style={{ marginBottom: 0 }}
                  >
                    <Input placeholder="变量值" style={{ width: 300 }} />
                  </Form.Item>
                  <MinusCircleOutlined onClick={() => remove(field.name)} />
                </Space>
              ))}
              <Button type="dashed" onClick={() => add()} icon={<PlusOutlined />}>
                添加环境变量
              </Button>
            </>
          )}
        </Form.List>
      </Form.Item>
    </Card>
  );

  const renderResourceFields = () => (
    <Card title="资源配置" style={{ marginBottom: 16 }}>
      <Row gutter={16}>
        <Col span={12}>
          <h4 style={{ marginBottom: 16 }}>请求资源 (Requests)</h4>
          <Form.Item name={['resources', 'requests', 'cpu']} label="CPU">
            <Input placeholder="例如: 100m" />
          </Form.Item>
          <Form.Item name={['resources', 'requests', 'memory']} label="内存">
            <Input placeholder="例如: 128Mi" />
          </Form.Item>
        </Col>
        <Col span={12}>
          <h4 style={{ marginBottom: 16 }}>限制资源 (Limits)</h4>
          <Form.Item name={['resources', 'limits', 'cpu']} label="CPU">
            <Input placeholder="例如: 500m" />
          </Form.Item>
          <Form.Item name={['resources', 'limits', 'memory']} label="内存">
            <Input placeholder="例如: 512Mi" />
          </Form.Item>
        </Col>
      </Row>
    </Card>
  );

  const renderLabelsFields = () => (
    <Card title="标签和注解" style={{ marginBottom: 16 }}>
      <Form.Item name="labels" label="标签 (Labels)">
        <TextArea
          rows={3}
          placeholder="格式: key1=value1,key2=value2"
        />
      </Form.Item>
      <Form.Item name="annotations" label="注解 (Annotations)">
        <TextArea
          rows={3}
          placeholder="格式: key1=value1,key2=value2"
        />
      </Form.Item>
    </Card>
  );

  const tabItems = [
    {
      key: 'basic',
      label: '基本信息',
      children: renderBasicFields(),
    },
    {
      key: 'container',
      label: '容器配置',
      children: renderContainerFields(),
    },
    {
      key: 'resources',
      label: '资源配置',
      children: renderResourceFields(),
    },
    {
      key: 'labels',
      label: '标签注解',
      children: renderLabelsFields(),
    },
  ];

  return (
    <Modal
      title={`${mode === 'create' ? '创建' : '更新'} ${workloadType}`}
      open={visible}
      onCancel={onCancel}
      onOk={handleSubmit}
      confirmLoading={submitting}
      width={900}
      okText="确定"
      cancelText="取消"
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

