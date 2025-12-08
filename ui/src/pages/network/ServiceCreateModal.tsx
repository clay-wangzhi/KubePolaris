import React, { useState, useEffect } from 'react';
import { Modal, Tabs, Form, Input, Select, Button, Space, App, InputNumber } from 'antd';
import { PlusOutlined, MinusCircleOutlined } from '@ant-design/icons';
import MonacoEditor from '@monaco-editor/react';
import * as YAML from 'yaml';
import { ServiceService } from '../../services/serviceService';
import { getNamespaces } from '../../services/configService';

interface ServiceCreateModalProps {
  visible: boolean;
  clusterId: string;
  onClose: () => void;
  onSuccess: () => void;
}

const ServiceCreateModal: React.FC<ServiceCreateModalProps> = ({
  visible,
  clusterId,
  onClose,
  onSuccess,
}) => {
  const { message } = App.useApp();
  const [form] = Form.useForm();
  const [activeTab, setActiveTab] = useState('form');
  const [yamlContent, setYamlContent] = useState(`apiVersion: v1
kind: Service
metadata:
  name: my-service
  namespace: default
spec:
  type: ClusterIP
  selector:
    app: my-app
  ports:
    - name: http
      protocol: TCP
      port: 80
      targetPort: 8080`);
  const [loading, setLoading] = useState(false);
  
  // 命名空间列表
  const [namespaces, setNamespaces] = useState<string[]>(['default']);
  const [loadingNamespaces, setLoadingNamespaces] = useState(false);
  
  // 加载命名空间列表
  useEffect(() => {
    const loadNamespaces = async () => {
      if (!clusterId || !visible) return;
      setLoadingNamespaces(true);
      try {
        const nsList = await getNamespaces(Number(clusterId));
        setNamespaces(nsList);
      } catch (error) {
        console.error('加载命名空间失败:', error);
      } finally {
        setLoadingNamespaces(false);
      }
    };

    loadNamespaces();
  }, [clusterId, visible]);

  const handleSubmit = async () => {
    setLoading(true);
    try {
      if (activeTab === 'yaml') {
        // YAML方式创建
        const response = await ServiceService.createService(clusterId, {
          namespace: 'default', // 从YAML中解析
          yaml: yamlContent,
        });
        
        if (response.code === 200) {
          message.success('Service创建成功');
          onSuccess();
          onClose();
        } else {
          message.error(response.message || 'Service创建失败');
        }
      } else {
        // 表单方式创建
        const values = await form.validateFields();
        
        const response = await ServiceService.createService(clusterId, {
          namespace: values.namespace,
          formData: {
            name: values.name,
            type: values.type,
            selector: values.selector?.reduce((acc: any, item: any) => {
              acc[item.key] = item.value;
              return acc;
            }, {}) || {},
            ports: values.ports?.map((port: any) => ({
              name: port.name,
              protocol: port.protocol || 'TCP',
              port: port.port,
              targetPort: port.targetPort?.toString() || port.port?.toString(),
              nodePort: port.nodePort,
            })) || [],
            sessionAffinity: values.sessionAffinity || 'None',
            labels: values.labels?.reduce((acc: any, item: any) => {
              acc[item.key] = item.value;
              return acc;
            }, {}) || {},
            annotations: values.annotations?.reduce((acc: any, item: any) => {
              acc[item.key] = item.value;
              return acc;
            }, {}) || {},
          },
        });
        
        if (response.code === 200) {
          message.success('Service创建成功');
          form.resetFields();
          onSuccess();
          onClose();
        } else {
          message.error(response.message || 'Service创建失败');
        }
      }
    } catch (error: any) {
      console.error('创建Service失败:', error);
      message.error(error.message || '创建Service失败');
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = () => {
    form.resetFields();
    setYamlContent(`apiVersion: v1
kind: Service
metadata:
  name: my-service
  namespace: default
spec:
  type: ClusterIP
  selector:
    app: my-app
  ports:
    - name: http
      protocol: TCP
      port: 80
      targetPort: 8080`);
    onClose();
  };

  // 表单转YAML
  const formToYaml = () => {
    try {
      const values = form.getFieldsValue();
      
      const serviceObj: any = {
        apiVersion: 'v1',
        kind: 'Service',
        metadata: {
          name: values.name || 'my-service',
          namespace: values.namespace || 'default',
        },
        spec: {
          type: values.type || 'ClusterIP',
          selector: values.selector?.reduce((acc: any, item: any) => {
            if (item.key) acc[item.key] = item.value;
            return acc;
          }, {}) || { app: 'my-app' },
          ports: values.ports?.map((port: any) => ({
            name: port.name || undefined,
            protocol: port.protocol || 'TCP',
            port: port.port || 80,
            targetPort: port.targetPort ? (isNaN(Number(port.targetPort)) ? port.targetPort : Number(port.targetPort)) : port.port || 8080,
          })).filter((p: any) => p.port) || [
            { protocol: 'TCP', port: 80, targetPort: 8080 }
          ],
          sessionAffinity: values.sessionAffinity || 'None',
        },
      };

      // 添加labels和annotations（如果存在）
      if (values.labels && values.labels.length > 0) {
        serviceObj.metadata.labels = values.labels.reduce((acc: any, item: any) => {
          if (item.key) acc[item.key] = item.value;
          return acc;
        }, {});
      }

      if (values.annotations && values.annotations.length > 0) {
        serviceObj.metadata.annotations = values.annotations.reduce((acc: any, item: any) => {
          if (item.key) acc[item.key] = item.value;
          return acc;
        }, {});
      }

      const yaml = YAML.stringify(serviceObj);
      setYamlContent(yaml);
    } catch (error) {
      console.error('表单转YAML失败:', error);
    }
  };

  // YAML转表单
  const yamlToForm = () => {
    try {
      const serviceObj = YAML.parse(yamlContent);
      
      // 提取selector
      const selector = serviceObj.spec?.selector 
        ? Object.entries(serviceObj.spec.selector).map(([key, value]) => ({ key, value }))
        : [];

      // 提取ports
      const ports = serviceObj.spec?.ports?.map((port: any) => ({
        name: port.name || '',
        protocol: port.protocol || 'TCP',
        port: port.port,
        targetPort: port.targetPort?.toString() || '',
      })) || [];

      // 提取labels
      const labels = serviceObj.metadata?.labels
        ? Object.entries(serviceObj.metadata.labels).map(([key, value]) => ({ key, value }))
        : [];

      // 提取annotations
      const annotations = serviceObj.metadata?.annotations
        ? Object.entries(serviceObj.metadata.annotations).map(([key, value]) => ({ key, value }))
        : [];

      form.setFieldsValue({
        namespace: serviceObj.metadata?.namespace || 'default',
        name: serviceObj.metadata?.name || '',
        type: serviceObj.spec?.type || 'ClusterIP',
        selector: selector.length > 0 ? selector : undefined,
        ports: ports.length > 0 ? ports : [{ protocol: 'TCP' }],
        sessionAffinity: serviceObj.spec?.sessionAffinity || 'None',
        labels: labels.length > 0 ? labels : undefined,
        annotations: annotations.length > 0 ? annotations : undefined,
      });
    } catch (error) {
      console.error('YAML转表单失败:', error);
      message.error('YAML格式错误，无法解析');
    }
  };

  // 处理Tab切换
  const handleTabChange = (key: string) => {
    if (key === 'yaml' && activeTab === 'form') {
      // 表单 -> YAML
      formToYaml();
    } else if (key === 'form' && activeTab === 'yaml') {
      // YAML -> 表单
      yamlToForm();
    }
    setActiveTab(key);
  };

  const formItems = (
    <Form
      form={form}
      layout="vertical"
      initialValues={{
        namespace: 'default',
        type: 'ClusterIP',
        sessionAffinity: 'None',
        ports: [{ protocol: 'TCP' }],
      }}
    >
      <Form.Item
        label="命名空间"
        name="namespace"
        rules={[{ required: true, message: '请选择命名空间' }]}
      >
        <Select
          placeholder="选择命名空间"
          loading={loadingNamespaces}
          showSearch
          filterOption={(input, option) => {
            if (!option?.children) return false;
            const text = String(option.children);
            return text.toLowerCase().includes(input.toLowerCase());
          }}
        >
          {namespaces.map((ns) => (
            <Select.Option key={ns} value={ns}>
              {ns}
            </Select.Option>
          ))}
        </Select>
      </Form.Item>

      <Form.Item
        label="服务名称"
        name="name"
        rules={[{ required: true, message: '请输入服务名称' }]}
      >
        <Input placeholder="my-service" />
      </Form.Item>

      <Form.Item
        label="服务类型"
        name="type"
        rules={[{ required: true, message: '请选择服务类型' }]}
      >
        <Select>
          <Select.Option value="ClusterIP">ClusterIP</Select.Option>
          <Select.Option value="NodePort">NodePort</Select.Option>
          <Select.Option value="LoadBalancer">LoadBalancer</Select.Option>
          <Select.Option value="ExternalName">ExternalName</Select.Option>
        </Select>
      </Form.Item>

      <Form.Item label="Selector">
        <Form.List name="selector">
          {(fields, { add, remove }) => (
            <>
              {fields.map((field) => (
                <Space key={field.key} style={{ display: 'flex', marginBottom: 8 }}>
                  <Form.Item
                    {...field}
                    name={[field.name, 'key']}
                    rules={[{ required: true, message: '请输入Key' }]}
                    noStyle
                  >
                    <Input placeholder="key" style={{ width: 200 }} />
                  </Form.Item>
                  <Form.Item
                    {...field}
                    name={[field.name, 'value']}
                    rules={[{ required: true, message: '请输入Value' }]}
                    noStyle
                  >
                    <Input placeholder="value" style={{ width: 200 }} />
                  </Form.Item>
                  <MinusCircleOutlined onClick={() => remove(field.name)} />
                </Space>
              ))}
              <Button type="dashed" onClick={() => add()} icon={<PlusOutlined />}>
                添加Selector
              </Button>
            </>
          )}
        </Form.List>
      </Form.Item>

      <Form.Item label="端口配置" required>
        <Form.List name="ports">
          {(fields, { add, remove }) => (
            <>
              {fields.map((field) => (
                <Space key={field.key} style={{ display: 'flex', marginBottom: 8 }} align="baseline">
                  <Form.Item
                    {...field}
                    name={[field.name, 'name']}
                    noStyle
                  >
                    <Input placeholder="端口名称" style={{ width: 120 }} />
                  </Form.Item>
                  <Form.Item
                    {...field}
                    name={[field.name, 'protocol']}
                    noStyle
                  >
                    <Select placeholder="协议" style={{ width: 100 }}>
                      <Select.Option value="TCP">TCP</Select.Option>
                      <Select.Option value="UDP">UDP</Select.Option>
                      <Select.Option value="SCTP">SCTP</Select.Option>
                    </Select>
                  </Form.Item>
                  <Form.Item
                    {...field}
                    name={[field.name, 'port']}
                    rules={[{ required: true, message: '必填' }]}
                    noStyle
                  >
                    <InputNumber placeholder="Port" style={{ width: 100 }} min={1} max={65535} />
                  </Form.Item>
                  <Form.Item
                    {...field}
                    name={[field.name, 'targetPort']}
                    noStyle
                  >
                    <Input placeholder="TargetPort" style={{ width: 120 }} />
                  </Form.Item>
                  <MinusCircleOutlined onClick={() => remove(field.name)} />
                </Space>
              ))}
              <Button type="dashed" onClick={() => add()} icon={<PlusOutlined />}>
                添加端口
              </Button>
            </>
          )}
        </Form.List>
      </Form.Item>

      <Form.Item label="Session Affinity" name="sessionAffinity">
        <Select>
          <Select.Option value="None">None</Select.Option>
          <Select.Option value="ClientIP">ClientIP</Select.Option>
        </Select>
      </Form.Item>
    </Form>
  );

  const yamlEditor = (
    <MonacoEditor
      height="500px"
      language="yaml"
      value={yamlContent}
      onChange={(value) => setYamlContent(value || '')}
      theme="vs-dark"
      options={{
        minimap: { enabled: false },
        fontSize: 14,
        wordWrap: 'on',
        scrollBeyondLastLine: false,
      }}
    />
  );

  return (
    <Modal
      title="创建Service"
      open={visible}
      onCancel={handleCancel}
      onOk={handleSubmit}
      confirmLoading={loading}
      width={800}
      okText="创建"
      cancelText="取消"
    >
      <Tabs
        activeKey={activeTab}
        onChange={handleTabChange}
        items={[
          {
            key: 'form',
            label: '表单模式',
            children: formItems,
          },
          {
            key: 'yaml',
            label: 'YAML模式',
            children: yamlEditor,
          },
        ]}
      />
    </Modal>
  );
};

export default ServiceCreateModal;

