import React, { useState, useEffect } from 'react';
import { Modal, Tabs, Form, Input, Select, Button, Space, App, InputNumber } from 'antd';
import { PlusOutlined, MinusCircleOutlined } from '@ant-design/icons';
import MonacoEditor from '@monaco-editor/react';
import * as YAML from 'yaml';
import { IngressService } from '../../services/ingressService';
import { getNamespaces } from '../../services/configService';

interface IngressCreateModalProps {
  visible: boolean;
  clusterId: string;
  onClose: () => void;
  onSuccess: () => void;
}

const IngressCreateModal: React.FC<IngressCreateModalProps> = ({
  visible,
  clusterId,
  onClose,
  onSuccess,
}) => {
  const { message } = App.useApp();
  const [form] = Form.useForm();
  const [activeTab, setActiveTab] = useState('form');
  const [yamlContent, setYamlContent] = useState(`apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: my-ingress
  namespace: default
spec:
  ingressClassName: nginx
  rules:
    - host: example.com
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: my-service
                port:
                  number: 80`);
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
        const response = await IngressService.createIngress(clusterId, {
          namespace: 'default', // 从YAML中解析
          yaml: yamlContent,
        });
        
        if (response.code === 200) {
          message.success('Ingress创建成功');
          onSuccess();
          onClose();
        } else {
          message.error(response.message || 'Ingress创建失败');
        }
      } else {
        // 表单方式创建
        const values = await form.validateFields();
        
        const response = await IngressService.createIngress(clusterId, {
          namespace: values.namespace,
          formData: {
            name: values.name,
            ingressClassName: values.ingressClassName || null,
            rules: values.rules?.map((rule: any) => ({
              host: rule.host,
              paths: rule.paths?.map((path: any) => ({
                path: path.path,
                pathType: path.pathType,
                serviceName: path.serviceName,
                servicePort: path.servicePort,
              })) || [],
            })) || [],
            tls: values.tls?.map((t: any) => ({
              hosts: t.hosts?.split(',').map((h: string) => h.trim()) || [],
              secretName: t.secretName,
            })) || [],
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
          message.success('Ingress创建成功');
          form.resetFields();
          onSuccess();
          onClose();
        } else {
          message.error(response.message || 'Ingress创建失败');
        }
      }
    } catch (error: any) {
      console.error('创建Ingress失败:', error);
      message.error(error.message || '创建Ingress失败');
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = () => {
    form.resetFields();
    setYamlContent(`apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: my-ingress
  namespace: default
spec:
  ingressClassName: nginx
  rules:
    - host: example.com
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: my-service
                port:
                  number: 80`);
    onClose();
  };

  // 表单转YAML
  const formToYaml = () => {
    try {
      const values = form.getFieldsValue();
      
      const ingressObj: any = {
        apiVersion: 'networking.k8s.io/v1',
        kind: 'Ingress',
        metadata: {
          name: values.name || 'my-ingress',
          namespace: values.namespace || 'default',
        },
        spec: {
          ingressClassName: values.ingressClassName || 'nginx',
          rules: values.rules?.map((rule: any) => ({
            host: rule.host,
            http: {
              paths: rule.paths?.map((path: any) => ({
                path: path.path || '/',
                pathType: path.pathType || 'Prefix',
                backend: {
                  service: {
                    name: path.serviceName,
                    port: {
                      number: path.servicePort,
                    },
                  },
                },
              })) || [],
            },
          })).filter((r: any) => r.host) || [
            {
              host: 'example.com',
              http: {
                paths: [
                  {
                    path: '/',
                    pathType: 'Prefix',
                    backend: {
                      service: {
                        name: 'my-service',
                        port: { number: 80 },
                      },
                    },
                  },
                ],
              },
            },
          ],
        },
      };

      // 添加TLS配置（如果存在）
      if (values.tls && values.tls.length > 0) {
        ingressObj.spec.tls = values.tls.map((t: any) => ({
          hosts: t.hosts?.split(',').map((h: string) => h.trim()).filter((h: string) => h) || [],
          secretName: t.secretName,
        })).filter((t: any) => t.hosts.length > 0 && t.secretName);
      }

      // 添加labels和annotations（如果存在）
      if (values.labels && values.labels.length > 0) {
        ingressObj.metadata.labels = values.labels.reduce((acc: any, item: any) => {
          if (item.key) acc[item.key] = item.value;
          return acc;
        }, {});
      }

      if (values.annotations && values.annotations.length > 0) {
        ingressObj.metadata.annotations = values.annotations.reduce((acc: any, item: any) => {
          if (item.key) acc[item.key] = item.value;
          return acc;
        }, {});
      }

      const yaml = YAML.stringify(ingressObj);
      setYamlContent(yaml);
    } catch (error) {
      console.error('表单转YAML失败:', error);
    }
  };

  // YAML转表单
  const yamlToForm = () => {
    try {
      const ingressObj = YAML.parse(yamlContent);
      
      // 提取rules
      const rules = ingressObj.spec?.rules?.map((rule: any) => ({
        host: rule.host || '',
        paths: rule.http?.paths?.map((path: any) => ({
          path: path.path || '/',
          pathType: path.pathType || 'Prefix',
          serviceName: path.backend?.service?.name || '',
          servicePort: path.backend?.service?.port?.number || 80,
        })) || [],
      })) || [];

      // 提取TLS
      const tls = ingressObj.spec?.tls?.map((t: any) => ({
        hosts: t.hosts?.join(', ') || '',
        secretName: t.secretName || '',
      })) || [];

      // 提取labels
      const labels = ingressObj.metadata?.labels
        ? Object.entries(ingressObj.metadata.labels).map(([key, value]) => ({ key, value }))
        : [];

      // 提取annotations
      const annotations = ingressObj.metadata?.annotations
        ? Object.entries(ingressObj.metadata.annotations).map(([key, value]) => ({ key, value }))
        : [];

      form.setFieldsValue({
        namespace: ingressObj.metadata?.namespace || 'default',
        name: ingressObj.metadata?.name || '',
        ingressClassName: ingressObj.spec?.ingressClassName || 'nginx',
        rules: rules.length > 0 ? rules : [{ paths: [{ pathType: 'Prefix' }] }],
        tls: tls.length > 0 ? tls : undefined,
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
        ingressClassName: 'nginx',
        rules: [{ paths: [{ pathType: 'Prefix' }] }],
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
        label="Ingress名称"
        name="name"
        rules={[{ required: true, message: '请输入Ingress名称' }]}
      >
        <Input placeholder="my-ingress" />
      </Form.Item>

      <Form.Item label="Ingress Class" name="ingressClassName">
        <Input placeholder="nginx" />
      </Form.Item>

      <Form.Item label="规则配置" required>
        <Form.List name="rules">
          {(fields, { add, remove }) => (
            <>
              {fields.map((field, index) => (
                <div key={field.key} style={{ border: '1px solid #d9d9d9', padding: 16, marginBottom: 16, borderRadius: 4 }}>
                  <Space style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                    <strong>规则 {index + 1}</strong>
                    {fields.length > 1 && (
                      <Button type="link" danger onClick={() => remove(field.name)}>
                        删除规则
                      </Button>
                    )}
                  </Space>
                  
                  <Form.Item
                    {...field}
                    label="Host"
                    name={[field.name, 'host']}
                    rules={[{ required: true, message: '请输入Host' }]}
                  >
                    <Input placeholder="example.com" />
                  </Form.Item>

                  <Form.Item label="路径配置">
                    <Form.List name={[field.name, 'paths']}>
                      {(pathFields, { add: addPath, remove: removePath }) => (
                        <>
                          {pathFields.map((pathField) => (
                            <Space key={pathField.key} style={{ display: 'flex', marginBottom: 8 }} align="baseline">
                              <Form.Item
                                {...pathField}
                                name={[pathField.name, 'path']}
                                rules={[{ required: true, message: '必填' }]}
                                noStyle
                              >
                                <Input placeholder="Path (/)" style={{ width: 120 }} />
                              </Form.Item>
                              <Form.Item
                                {...pathField}
                                name={[pathField.name, 'pathType']}
                                rules={[{ required: true, message: '必填' }]}
                                noStyle
                              >
                                <Select placeholder="PathType" style={{ width: 120 }}>
                                  <Select.Option value="Prefix">Prefix</Select.Option>
                                  <Select.Option value="Exact">Exact</Select.Option>
                                  <Select.Option value="ImplementationSpecific">ImplementationSpecific</Select.Option>
                                </Select>
                              </Form.Item>
                              <Form.Item
                                {...pathField}
                                name={[pathField.name, 'serviceName']}
                                rules={[{ required: true, message: '必填' }]}
                                noStyle
                              >
                                <Input placeholder="Service名称" style={{ width: 150 }} />
                              </Form.Item>
                              <Form.Item
                                {...pathField}
                                name={[pathField.name, 'servicePort']}
                                rules={[{ required: true, message: '必填' }]}
                                noStyle
                              >
                                <InputNumber placeholder="端口" style={{ width: 100 }} min={1} max={65535} />
                              </Form.Item>
                              <MinusCircleOutlined onClick={() => removePath(pathField.name)} />
                            </Space>
                          ))}
                          <Button type="dashed" onClick={() => addPath()} size="small" icon={<PlusOutlined />}>
                            添加路径
                          </Button>
                        </>
                      )}
                    </Form.List>
                  </Form.Item>
                </div>
              ))}
              <Button type="dashed" onClick={() => add()} icon={<PlusOutlined />}>
                添加规则
              </Button>
            </>
          )}
        </Form.List>
      </Form.Item>

      <Form.Item label="TLS配置">
        <Form.List name="tls">
          {(fields, { add, remove }) => (
            <>
              {fields.map((field) => (
                <Space key={field.key} style={{ display: 'flex', marginBottom: 8 }} align="baseline">
                  <Form.Item
                    {...field}
                    name={[field.name, 'hosts']}
                    rules={[{ required: true, message: '请输入Hosts' }]}
                    noStyle
                  >
                    <Input placeholder="Hosts(逗号分隔)" style={{ width: 300 }} />
                  </Form.Item>
                  <Form.Item
                    {...field}
                    name={[field.name, 'secretName']}
                    rules={[{ required: true, message: '请输入Secret名称' }]}
                    noStyle
                  >
                    <Input placeholder="Secret名称" style={{ width: 200 }} />
                  </Form.Item>
                  <MinusCircleOutlined onClick={() => remove(field.name)} />
                </Space>
              ))}
              <Button type="dashed" onClick={() => add()} icon={<PlusOutlined />}>
                添加TLS
              </Button>
            </>
          )}
        </Form.List>
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
      title="创建Ingress"
      open={visible}
      onCancel={handleCancel}
      onOk={handleSubmit}
      confirmLoading={loading}
      width={900}
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
            children: <div style={{ maxHeight: 600, overflowY: 'auto' }}>{formItems}</div>,
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

export default IngressCreateModal;

