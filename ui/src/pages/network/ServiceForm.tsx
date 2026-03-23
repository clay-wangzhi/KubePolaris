import React, { useState } from 'react';
import {
  Modal,
  Tabs,
  Form,
  Input,
  Select,
  InputNumber,
  Space,
  Button,
} from 'antd';
import { PlusOutlined, MinusCircleOutlined } from '@ant-design/icons';
import MonacoEditor from '@monaco-editor/react';
import * as YAML from 'yaml';
import { ServiceService } from '../../services/serviceService';
import type { Service } from '../../types';
import type { KubernetesServiceYAML, LabelItem } from './serviceTypes';
import { useTranslation } from 'react-i18next';

interface ServiceFormProps {
  visible: boolean;
  clusterId: string;
  editingService: Service | null;
  initialYaml: string;
  namespaces: { name: string; count: number }[];
  onCancel: () => void;
  onSuccess: () => void;
}

const ServiceForm: React.FC<ServiceFormProps> = ({
  visible,
  clusterId,
  editingService,
  initialYaml,
  namespaces,
  onCancel,
  onSuccess,
}) => {
  const { t } = useTranslation(['network', 'common']);
  const [editForm] = Form.useForm();
  const [editMode, setEditMode] = useState<'form' | 'yaml'>('yaml');
  const [editYaml, setEditYaml] = useState(initialYaml);
  const [saveLoading, setSaveLoading] = useState(false);

  React.useEffect(() => {
    setEditYaml(initialYaml);
  }, [initialYaml]);

  React.useEffect(() => {
    if (visible && editingService) {
      editForm.setFieldsValue({
        name: editingService.name,
        namespace: editingService.namespace,
        type: editingService.type,
      });
    }
  }, [visible, editingService, editForm]);

  const handleClose = () => {
    setEditYaml('');
    setEditMode('yaml');
    editForm.resetFields();
    onCancel();
  };

  const handleSave = async () => {
    if (!editingService) return;

    setSaveLoading(true);
    try {
      if (editMode === 'yaml') {
        await ServiceService.updateService(
          clusterId,
          editingService.namespace,
          editingService.name,
          { namespace: editingService.namespace, yaml: editYaml }
        );
      } else {
        const values = await editForm.validateFields();

        const serviceYaml: KubernetesServiceYAML = {
          apiVersion: 'v1',
          kind: 'Service',
          metadata: {
            name: values.name,
            namespace: values.namespace,
            labels: {},
            annotations: {},
          },
          spec: {
            type: values.type,
            selector: {},
            ports: values.ports || [],
            sessionAffinity: values.sessionAffinity || 'None',
          },
        };

        if (values.labels && Array.isArray(values.labels)) {
          (values.labels as LabelItem[]).forEach((label) => {
            if (label?.key) {
              serviceYaml.metadata.labels[label.key] = label.value || '';
            }
          });
        }

        if (values.annotations && Array.isArray(values.annotations)) {
          (values.annotations as LabelItem[]).forEach((annotation) => {
            if (annotation?.key) {
              serviceYaml.metadata.annotations[annotation.key] = annotation.value || '';
            }
          });
        }

        if (values.selectors && Array.isArray(values.selectors)) {
          (values.selectors as LabelItem[]).forEach((selector) => {
            if (selector?.key) {
              serviceYaml.spec.selector![selector.key] = selector.value || '';
            }
          });
        }

        const yamlString = YAML.stringify(serviceYaml);
        await ServiceService.updateService(
          clusterId,
          values.namespace,
          values.name,
          { namespace: values.namespace, yaml: yamlString }
        );
      }

      handleClose();
      onSuccess();
    } catch (error) {
      console.error('Failed to update:', error);
    } finally {
      setSaveLoading(false);
    }
  };

  return (
    <Modal
      title={t('network:service.edit.title', { name: editingService?.name })}
      open={visible}
      onCancel={handleClose}
      onOk={handleSave}
      confirmLoading={saveLoading}
      width={1000}
      okText={t('common:actions.save')}
      cancelText={t('common:actions.cancel')}
    >
      <Tabs activeKey={editMode} onChange={(key) => setEditMode(key as 'form' | 'yaml')}>
        <Tabs.TabPane tab={t('network:service.edit.formTab')} key="form">
          <Form form={editForm} layout="vertical">
            <Form.Item
              label={t('network:service.edit.name')}
              name="name"
              rules={[{ required: true, message: t('network:service.edit.nameRequired') }]}
            >
              <Input disabled placeholder={t('network:service.edit.namePlaceholder')} />
            </Form.Item>

            <Form.Item
              label={t('network:service.edit.namespace')}
              name="namespace"
              rules={[{ required: true, message: t('network:service.edit.namespaceRequired') }]}
            >
              <Select disabled placeholder={t('network:service.edit.namespacePlaceholder')}>
                {namespaces.map((ns) => (
                  <Select.Option key={ns.name} value={ns.name}>
                    {ns.name}
                  </Select.Option>
                ))}
              </Select>
            </Form.Item>

            <Form.Item label={t('network:service.edit.type')} name="type" rules={[{ required: true }]}>
              <Select>
                <Select.Option value="ClusterIP">ClusterIP</Select.Option>
                <Select.Option value="NodePort">NodePort</Select.Option>
                <Select.Option value="LoadBalancer">LoadBalancer</Select.Option>
                <Select.Option value="ExternalName">ExternalName</Select.Option>
              </Select>
            </Form.Item>

            <Form.Item label={t('network:service.edit.selector')}>
              <Form.List name="selectors">
                {(fields, { add, remove }) => (
                  <>
                    {fields.map((field) => (
                      <Space key={field.key} style={{ display: 'flex', marginBottom: 8 }}>
                        <Form.Item {...field} name={[field.name, 'key']} noStyle>
                          <Input placeholder={t('network:service.edit.key')} style={{ width: 150 }} />
                        </Form.Item>
                        <Form.Item {...field} name={[field.name, 'value']} noStyle>
                          <Input placeholder={t('network:service.edit.value')} style={{ width: 150 }} />
                        </Form.Item>
                        <MinusCircleOutlined onClick={() => remove(field.name)} />
                      </Space>
                    ))}
                    <Button type="dashed" onClick={() => add()} block icon={<PlusOutlined />}>
                      {t('network:service.edit.addSelector')}
                    </Button>
                  </>
                )}
              </Form.List>
            </Form.Item>

            <Form.Item label={t('network:service.edit.port')}>
              <Form.List name="ports">
                {(fields, { add, remove }) => (
                  <>
                    {fields.map((field) => (
                      <Space key={field.key} style={{ display: 'flex', marginBottom: 8 }} align="baseline">
                        <Form.Item {...field} name={[field.name, 'name']} noStyle>
                          <Input placeholder={t('network:service.edit.portName')} style={{ width: 100 }} />
                        </Form.Item>
                        <Form.Item {...field} name={[field.name, 'protocol']} noStyle initialValue="TCP">
                          <Select style={{ width: 80 }}>
                            <Select.Option value="TCP">TCP</Select.Option>
                            <Select.Option value="UDP">UDP</Select.Option>
                          </Select>
                        </Form.Item>
                        <Form.Item {...field} name={[field.name, 'port']} noStyle>
                          <InputNumber placeholder={t('network:service.edit.portNumber')} min={1} max={65535} style={{ width: 100 }} />
                        </Form.Item>
                        <Form.Item {...field} name={[field.name, 'targetPort']} noStyle>
                          <InputNumber placeholder={t('network:service.edit.targetPort')} min={1} max={65535} style={{ width: 100 }} />
                        </Form.Item>
                        <MinusCircleOutlined onClick={() => remove(field.name)} />
                      </Space>
                    ))}
                    <Button type="dashed" onClick={() => add()} block icon={<PlusOutlined />}>
                      {t('network:service.edit.addPort')}
                    </Button>
                  </>
                )}
              </Form.List>
            </Form.Item>

            <Form.Item label={t('network:service.edit.sessionAffinity')} name="sessionAffinity" initialValue="None">
              <Select>
                <Select.Option value="None">None</Select.Option>
                <Select.Option value="ClientIP">ClientIP</Select.Option>
              </Select>
            </Form.Item>

            <Form.Item label={t('network:service.edit.labels')}>
              <Form.List name="labels">
                {(fields, { add, remove }) => (
                  <>
                    {fields.map((field) => (
                      <Space key={field.key} style={{ display: 'flex', marginBottom: 8 }}>
                        <Form.Item {...field} name={[field.name, 'key']} noStyle>
                          <Input placeholder={t('network:service.edit.key')} style={{ width: 150 }} />
                        </Form.Item>
                        <Form.Item {...field} name={[field.name, 'value']} noStyle>
                          <Input placeholder={t('network:service.edit.value')} style={{ width: 150 }} />
                        </Form.Item>
                        <MinusCircleOutlined onClick={() => remove(field.name)} />
                      </Space>
                    ))}
                    <Button type="dashed" onClick={() => add()} block icon={<PlusOutlined />}>
                      {t('network:service.edit.addLabel')}
                    </Button>
                  </>
                )}
              </Form.List>
            </Form.Item>

            <Form.Item label={t('network:service.edit.annotations')}>
              <Form.List name="annotations">
                {(fields, { add, remove }) => (
                  <>
                    {fields.map((field) => (
                      <Space key={field.key} style={{ display: 'flex', marginBottom: 8 }}>
                        <Form.Item {...field} name={[field.name, 'key']} noStyle>
                          <Input placeholder={t('network:service.edit.key')} style={{ width: 150 }} />
                        </Form.Item>
                        <Form.Item {...field} name={[field.name, 'value']} noStyle>
                          <Input placeholder={t('network:service.edit.value')} style={{ width: 150 }} />
                        </Form.Item>
                        <MinusCircleOutlined onClick={() => remove(field.name)} />
                      </Space>
                    ))}
                    <Button type="dashed" onClick={() => add()} block icon={<PlusOutlined />}>
                      {t('network:service.edit.addAnnotation')}
                    </Button>
                  </>
                )}
              </Form.List>
            </Form.Item>
          </Form>
        </Tabs.TabPane>

        <Tabs.TabPane tab={t('network:service.edit.yamlTab')} key="yaml">
          <MonacoEditor
            height="600px"
            language="yaml"
            value={editYaml}
            onChange={(value) => setEditYaml(value || '')}
            options={{
              minimap: { enabled: false },
              fontSize: 14,
              wordWrap: 'on',
              scrollBeyondLastLine: false,
            }}
          />
        </Tabs.TabPane>
      </Tabs>
    </Modal>
  );
};

export default ServiceForm;
