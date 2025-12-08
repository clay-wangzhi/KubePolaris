import React, { useState, useEffect, useCallback } from 'react';
import {
  Table,
  Button,
  Space,
  Tag,
  Input,
  Select,
  Popconfirm,
  Typography,
  Tooltip,
  Modal,
  App,
  Tabs,
  Form,
  InputNumber,
} from 'antd';
import {
  DeleteOutlined,
  FileTextOutlined,
  ReloadOutlined,
  SearchOutlined,
  SafetyCertificateOutlined,
  EditOutlined,
  PlusOutlined,
  MinusCircleOutlined,
} from '@ant-design/icons';
import MonacoEditor from '@monaco-editor/react';
import * as YAML from 'yaml';
import { IngressService } from '../../services/ingressService';
import type { Ingress } from '../../types';
import type { ColumnsType } from 'antd/es/table';
import IngressCreateModal from './IngressCreateModal';

const { Search } = Input;
const { Text, Link } = Typography;

interface IngressTabProps {
  clusterId: string;
  onCountChange?: (count: number) => void;
}

const IngressTab: React.FC<IngressTabProps> = ({ clusterId, onCountChange }) => {
  const { message } = App.useApp();
  
  const [ingresses, setIngresses] = useState<Ingress[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  
  // 筛选条件
  const [namespace, setNamespace] = useState<string>('_all_');
  const [ingressClass, setIngressClass] = useState<string>('');
  const [searchText, setSearchText] = useState('');
  
  // YAML查看Modal
  const [yamlModalVisible, setYamlModalVisible] = useState(false);
  const [currentYaml, setCurrentYaml] = useState('');
  const [yamlLoading, setYamlLoading] = useState(false);

  // YAML编辑Modal
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editYaml, setEditYaml] = useState('');
  const [editingIngress, setEditingIngress] = useState<Ingress | null>(null);
  const [saveLoading, setSaveLoading] = useState(false);
  const [editMode, setEditMode] = useState<'form' | 'yaml'>('yaml');
  const [editForm] = Form.useForm();
  
  // 创建Modal
  const [createModalVisible, setCreateModalVisible] = useState(false);
  
  // 命名空间列表
  const [namespaces, setNamespaces] = useState<{ name: string; count: number }[]>([]);
  const [loadingNamespaces, setLoadingNamespaces] = useState(false);

  // 加载命名空间列表
  useEffect(() => {
    const loadNamespaces = async () => {
      if (!clusterId) return;
      setLoadingNamespaces(true);
      try {
        const nsList = await IngressService.getIngressNamespaces(clusterId);
        setNamespaces(nsList);
      } catch (error) {
        console.error('加载命名空间失败:', error);
      } finally {
        setLoadingNamespaces(false);
      }
    };

    loadNamespaces();
  }, [clusterId]);

  // 获取Ingress列表
  const fetchIngresses = useCallback(async () => {
    if (!clusterId) return;
    
    setLoading(true);
    try {
      const response = await IngressService.getIngresses(
        clusterId,
        namespace,
        ingressClass,
        searchText || undefined,
        page,
        pageSize
      );
      
      if (response.code === 200) {
        setIngresses(response.data.items);
        setTotal(response.data.total);
        onCountChange?.(response.data.total);
      } else {
        message.error(response.message || '获取Ingress列表失败');
      }
    } catch (error) {
      console.error('获取Ingress列表失败:', error);
      message.error('获取Ingress列表失败');
    } finally {
      setLoading(false);
    }
  }, [clusterId, namespace, ingressClass, searchText, page, pageSize, onCountChange, message]);

  // 初始加载和筛选条件变化时重新加载
  useEffect(() => {
    fetchIngresses();
  }, [fetchIngresses]);

  // 查看YAML
  const handleViewYAML = async (ingress: Ingress) => {
    setYamlModalVisible(true);
    setYamlLoading(true);
    try {
      const response = await IngressService.getIngressYAML(
        clusterId,
        ingress.namespace,
        ingress.name
      );
      
      if (response.code === 200) {
        setCurrentYaml(response.data.yaml);
      } else {
        message.error(response.message || '获取YAML失败');
      }
    } catch (error) {
      console.error('获取YAML失败:', error);
      message.error('获取YAML失败');
    } finally {
      setYamlLoading(false);
    }
  };

  // 删除Ingress
  const handleDelete = async (ingress: Ingress) => {
    try {
      const response = await IngressService.deleteIngress(
        clusterId,
        ingress.namespace,
        ingress.name
      );
      
      if (response.code === 200) {
        message.success('删除成功');
        fetchIngresses();
      } else {
        message.error(response.message || '删除失败');
      }
    } catch (error) {
      console.error('删除失败:', error);
      message.error('删除失败');
    }
  };

  // 编辑Ingress
  const handleEdit = async (ingress: Ingress) => {
    setEditingIngress(ingress);
    setYamlLoading(true);
    try {
      const response = await IngressService.getIngressYAML(
        clusterId,
        ingress.namespace,
        ingress.name
      );
      
      if (response.code === 200) {
        const yamlStr = response.data.yaml;
        setEditYaml(yamlStr);
        
        // 解析YAML到表单数据
        try {
          const yamlData = YAML.parse(yamlStr);
          const formData: any = {
            name: yamlData.metadata?.name || '',
            namespace: yamlData.metadata?.namespace || 'default',
            ingressClass: yamlData.spec?.ingressClassName || '',
            labels: [],
            annotations: [],
            rules: [],
            tls: [],
          };

          // 解析labels
          if (yamlData.metadata?.labels) {
            formData.labels = Object.entries(yamlData.metadata.labels).map(([key, value]) => ({
              key,
              value: String(value),
            }));
          }

          // 解析annotations
          if (yamlData.metadata?.annotations) {
            formData.annotations = Object.entries(yamlData.metadata.annotations).map(([key, value]) => ({
              key,
              value: String(value),
            }));
          }

          // 解析rules
          if (yamlData.spec?.rules) {
            formData.rules = yamlData.spec.rules.map((rule: any) => ({
              host: rule.host || '',
              paths: rule.http?.paths?.map((path: any) => ({
                path: path.path || '/',
                pathType: path.pathType || 'Prefix',
                serviceName: path.backend?.service?.name || '',
                servicePort: path.backend?.service?.port?.number || path.backend?.service?.port?.name || 80,
              })) || [],
            }));
          }

          // 解析TLS
          if (yamlData.spec?.tls) {
            formData.tls = yamlData.spec.tls.map((tls: any) => ({
              secretName: tls.secretName || '',
              hosts: tls.hosts || [],
            }));
          }

          editForm.setFieldsValue(formData);
        } catch (parseError) {
          console.error('解析YAML失败:', parseError);
        }
        
        setEditModalVisible(true);
      } else {
        message.error(response.message || '获取YAML失败');
      }
    } catch (error) {
      console.error('获取YAML失败:', error);
      message.error('获取YAML失败');
    } finally {
      setYamlLoading(false);
    }
  };

  // 保存编辑
  const handleSaveEdit = async () => {
    if (!editingIngress) return;

    setSaveLoading(true);
    try {
      if (editMode === 'yaml') {
        // YAML方式更新
        const response = await IngressService.updateIngress(
          clusterId,
          editingIngress.namespace,
          editingIngress.name,
          {
            namespace: editingIngress.namespace,
            yaml: editYaml,
          }
        );
        
        if (response.code === 200) {
          message.success('更新成功');
          setEditModalVisible(false);
          setEditYaml('');
          setEditingIngress(null);
          setEditMode('yaml');
          fetchIngresses();
        } else {
          message.error(response.message || '更新失败');
        }
      } else {
        // 表单方式更新
        const values = await editForm.validateFields();
        
        // 构建Ingress YAML
        const ingressYaml: any = {
          apiVersion: 'networking.k8s.io/v1',
          kind: 'Ingress',
          metadata: {
            name: values.name,
            namespace: values.namespace,
            labels: {},
            annotations: {},
          },
          spec: {
            ingressClassName: values.ingressClass,
            rules: [],
            tls: [],
          },
        };

        // 添加labels
        if (values.labels && values.labels.length > 0) {
          values.labels.forEach((label: any) => {
            if (label && label.key) {
              ingressYaml.metadata.labels[label.key] = label.value || '';
            }
          });
        }

        // 添加annotations
        if (values.annotations && values.annotations.length > 0) {
          values.annotations.forEach((annotation: any) => {
            if (annotation && annotation.key) {
              ingressYaml.metadata.annotations[annotation.key] = annotation.value || '';
            }
          });
        }

        // 添加rules
        if (values.rules && values.rules.length > 0) {
          ingressYaml.spec.rules = values.rules.map((rule: any) => ({
            host: rule.host,
            http: {
              paths: rule.paths?.map((path: any) => ({
                path: path.path,
                pathType: path.pathType,
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
          }));
        }

        // 添加TLS
        if (values.tls && values.tls.length > 0) {
          ingressYaml.spec.tls = values.tls.map((tls: any) => ({
            secretName: tls.secretName,
            hosts: tls.hosts,
          }));
        }

        const yamlString = YAML.stringify(ingressYaml);
        
        const response = await IngressService.updateIngress(
          clusterId,
          values.namespace,
          values.name,
          {
            namespace: values.namespace,
            yaml: yamlString,
          }
        );
        
        if (response.code === 200) {
          message.success('更新成功');
          setEditModalVisible(false);
          setEditYaml('');
          setEditingIngress(null);
          setEditMode('yaml');
          editForm.resetFields();
          fetchIngresses();
        } else {
          message.error(response.message || '更新失败');
        }
      }
    } catch (error) {
      console.error('更新失败:', error);
      message.error('更新失败');
    } finally {
      setSaveLoading(false);
    }
  };

  // 表格列定义
  const columns: ColumnsType<Ingress> = [
    {
      title: '路由名称',
      dataIndex: 'name',
      key: 'name',
      fixed: 'left',
      width: 200,
      render: (name: string, record: Ingress) => (
        <div>
          <Space>
            <Link strong onClick={() => handleViewYAML(record)}>
              {name}
            </Link>
            {IngressService.hasTLS(record) && (
              <Tooltip title="已启用TLS">
                <SafetyCertificateOutlined style={{ color: '#52c41a' }} />
              </Tooltip>
            )}
          </Space>
          <div style={{ fontSize: 12, color: '#999' }}>
            {record.namespace}
          </div>
        </div>
      ),
    },
    {
      title: 'IngressClass',
      dataIndex: 'ingressClassName',
      key: 'ingressClassName',
      width: 150,
      render: (ingressClassName?: string) => (
        <Tag color={IngressService.getIngressClassColor(ingressClassName)}>
          {IngressService.formatIngressClass(ingressClassName)}
        </Tag>
      ),
    },
    {
      title: '访问入口',
      key: 'loadBalancer',
      width: 200,
      render: (_: any, record: Ingress) => {
        const lbs = IngressService.formatLoadBalancers(record);
        return (
          <div>
            {lbs.slice(0, 2).map((lb, idx) => (
              <div key={idx} style={{ fontSize: 12 }}>
                {lb}
              </div>
            ))}
            {lbs.length > 2 && (
              <Tooltip title={lbs.slice(2).join(', ')}>
                <Text type="secondary" style={{ fontSize: 12, cursor: 'pointer' }}>
                  +{lbs.length - 2} 更多
                </Text>
              </Tooltip>
            )}
          </div>
        );
      },
    },
    {
      title: 'Hosts',
      key: 'hosts',
      width: 200,
      render: (_: any, record: Ingress) => {
        const hosts = IngressService.getHosts(record);
        return (
          <div>
            {hosts.slice(0, 2).map((host, idx) => (
              <div key={idx} style={{ fontSize: 12 }}>
                {host}
              </div>
            ))}
            {hosts.length > 2 && (
              <Tooltip title={hosts.slice(2).join(', ')}>
                <Text type="secondary" style={{ fontSize: 12, cursor: 'pointer' }}>
                  +{hosts.length - 2} 更多
                </Text>
              </Tooltip>
            )}
          </div>
        );
      },
    },
    {
      title: '转发策略',
      key: 'backends',
      width: 300,
      render: (_: any, record: Ingress) => {
        const backends = IngressService.formatBackends(record);
        return (
          <div style={{ wordBreak: 'break-word', whiteSpace: 'normal' }}>
            {backends.map((backend, idx) => (
              <div key={idx} style={{ fontSize: 12, marginBottom: idx < backends.length - 1 ? 4 : 0 }}>
                {backend}
              </div>
            ))}
          </div>
        );
      },
    },
    {
      title: '创建时间',
      dataIndex: 'createdAt',
      key: 'createdAt',
      width: 180,
      render: (createdAt: string) => (
        <Tooltip title={new Date(createdAt).toLocaleString()}>
          <span>{IngressService.getAge(createdAt)}</span>
        </Tooltip>
      ),
    },
    {
      title: '操作',
      key: 'action',
      fixed: 'right',
      width: 150,
      render: (_: any, record: Ingress) => (
        <Space size="small">
          <Tooltip title="查看YAML">
            <Button
              type="link"
              size="small"
              icon={<FileTextOutlined />}
              onClick={() => handleViewYAML(record)}
            />
          </Tooltip>
          <Tooltip title="编辑">
            <Button
              type="link"
              size="small"
              icon={<EditOutlined />}
              onClick={() => handleEdit(record)}
            />
          </Tooltip>
          <Popconfirm
            title="确定要删除这个Ingress吗？"
            onConfirm={() => handleDelete(record)}
            okText="确定"
            cancelText="取消"
          >
            <Tooltip title="删除">
              <Button
                type="link"
                size="small"
                danger
                icon={<DeleteOutlined />}
              />
            </Tooltip>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div>
      {/* 筛选和搜索栏 */}
      <Space style={{ marginBottom: 16, width: '100%', justifyContent: 'space-between' }}>
        <Space>
          <Select
            placeholder="选择命名空间"
            style={{ width: 180 }}
            value={namespace}
            onChange={setNamespace}
            loading={loadingNamespaces}
            showSearch
            filterOption={(input, option) => {
              if (!option?.children) return false;
              const text = String(option.children);
              return text.toLowerCase().includes(input.toLowerCase());
            }}
            allowClear
            onClear={() => setNamespace('_all_')}
            popupClassName="namespace-select-dropdown"
          >
            <Select.Option value="_all_">所有命名空间</Select.Option>
            {namespaces.map((ns) => (
              <Select.Option key={ns.name} value={ns.name}>
                {ns.name} ({ns.count})
              </Select.Option>
            ))}
          </Select>
          <style>{`
            .namespace-select-dropdown .ant-select-item-option-content {
              white-space: normal;
              word-break: break-word;
            }
          `}</style>
          
          <Select
            placeholder="选择IngressClass"
            style={{ width: 150 }}
            value={ingressClass}
            onChange={setIngressClass}
            allowClear
          >
            <Select.Option value="nginx">nginx</Select.Option>
            <Select.Option value="traefik">traefik</Select.Option>
            <Select.Option value="alb">alb</Select.Option>
          </Select>
          
          <Search
            placeholder="搜索路由名称、Host..."
            style={{ width: 250 }}
            onSearch={(value) => {
              setSearchText(value);
              setPage(1);
            }}
            onChange={(e) => setSearchText(e.target.value)}
            value={searchText}
            enterButton={<SearchOutlined />}
            allowClear
          />
        </Space>
        
        <Space>
          <Button
            type="primary"
            onClick={() => setCreateModalVisible(true)}
          >
            创建Ingress
          </Button>
          <Button
            icon={<ReloadOutlined />}
            onClick={() => fetchIngresses()}
          >
            刷新
          </Button>
        </Space>
      </Space>

      {/* Ingress列表表格 */}
      <Table
        columns={columns}
        dataSource={ingresses}
        rowKey={(record) => `${record.namespace}/${record.name}`}
        loading={loading}
        scroll={{ x: 1400 }}
        pagination={{
          current: page,
          pageSize: pageSize,
          total: total,
          showSizeChanger: true,
          showQuickJumper: true,
          showTotal: (total) => `共 ${total} 个路由`,
          onChange: (page, pageSize) => {
            setPage(page);
            setPageSize(pageSize);
          },
        }}
      />

      {/* YAML查看Modal */}
      <Modal
        title="Ingress YAML"
        open={yamlModalVisible}
        onCancel={() => setYamlModalVisible(false)}
        footer={null}
        width={800}
      >
        {yamlLoading ? (
          <div style={{ textAlign: 'center', padding: 40 }}>
            <span>加载中...</span>
          </div>
        ) : (
          <pre style={{ maxHeight: 600, overflow: 'auto', background: '#f5f5f5', padding: 16 }}>
            {currentYaml}
          </pre>
        )}
      </Modal>

      {/* 创建Ingress Modal */}
      <IngressCreateModal
        visible={createModalVisible}
        clusterId={clusterId}
        onClose={() => setCreateModalVisible(false)}
        onSuccess={() => fetchIngresses()}
      />

      {/* 编辑Modal */}
      <Modal
        title={`编辑 Ingress: ${editingIngress?.name}`}
        open={editModalVisible}
        onCancel={() => {
          setEditModalVisible(false);
          setEditYaml('');
          setEditingIngress(null);
          setEditMode('yaml');
          editForm.resetFields();
        }}
        onOk={handleSaveEdit}
        confirmLoading={saveLoading}
        width={1000}
        okText="保存"
        cancelText="取消"
      >
        <Tabs activeKey={editMode} onChange={(key) => setEditMode(key as 'form' | 'yaml')}>
          <Tabs.TabPane tab="表单编辑" key="form">
            <Form form={editForm} layout="vertical">
              <Form.Item label="名称" name="name" rules={[{ required: true, message: '请输入名称' }]}>
                <Input disabled placeholder="Ingress名称" />
              </Form.Item>
              
              <Form.Item label="命名空间" name="namespace" rules={[{ required: true, message: '请选择命名空间' }]}>
                <Select disabled placeholder="选择命名空间">
                  {namespaces.map((ns) => (
                    <Select.Option key={ns.name} value={ns.name}>
                      {ns.name}
                    </Select.Option>
                  ))}
                </Select>
              </Form.Item>
              
              <Form.Item label="Ingress Class" name="ingressClass">
                <Input placeholder="例如: nginx" />
              </Form.Item>
              
              <Form.Item label="规则">
                <Form.List name="rules">
                  {(fields, { add, remove }) => (
                    <>
                      {fields.map((field) => (
                        <div key={field.key} style={{ marginBottom: 16, padding: 16, border: '1px solid #d9d9d9', borderRadius: 4 }}>
                          <Form.Item {...field} name={[field.name, 'host']} label="主机">
                            <Input placeholder="example.com" />
                          </Form.Item>
                          
                          <Form.Item label="路径">
                            <Form.List name={[field.name, 'paths']}>
                              {(pathFields, { add: addPath, remove: removePath }) => (
                                <>
                                  {pathFields.map((pathField) => (
                                    <Space key={pathField.key} style={{ display: 'flex', marginBottom: 8 }} align="baseline">
                                      <Form.Item {...pathField} name={[pathField.name, 'path']} noStyle>
                                        <Input placeholder="/" style={{ width: 100 }} />
                                      </Form.Item>
                                      <Form.Item {...pathField} name={[pathField.name, 'pathType']} noStyle initialValue="Prefix">
                                        <Select style={{ width: 120 }}>
                                          <Select.Option value="Prefix">Prefix</Select.Option>
                                          <Select.Option value="Exact">Exact</Select.Option>
                                        </Select>
                                      </Form.Item>
                                      <Form.Item {...pathField} name={[pathField.name, 'serviceName']} noStyle>
                                        <Input placeholder="服务名" style={{ width: 120 }} />
                                      </Form.Item>
                                      <Form.Item {...pathField} name={[pathField.name, 'servicePort']} noStyle>
                                        <InputNumber placeholder="端口" min={1} max={65535} style={{ width: 100 }} />
                                      </Form.Item>
                                      <MinusCircleOutlined onClick={() => removePath(pathField.name)} />
                                    </Space>
                                  ))}
                                  <Button type="dashed" onClick={() => addPath()} block icon={<PlusOutlined />}>
                                    添加路径
                                  </Button>
                                </>
                              )}
                            </Form.List>
                          </Form.Item>
                          
                          <Button type="link" danger onClick={() => remove(field.name)}>
                            删除此规则
                          </Button>
                        </div>
                      ))}
                      <Button type="dashed" onClick={() => add()} block icon={<PlusOutlined />}>
                        添加规则
                      </Button>
                    </>
                  )}
                </Form.List>
              </Form.Item>
              
              <Form.Item label="标签">
                <Form.List name="labels">
                  {(fields, { add, remove }) => (
                    <>
                      {fields.map((field) => (
                        <Space key={field.key} style={{ display: 'flex', marginBottom: 8 }}>
                          <Form.Item {...field} name={[field.name, 'key']} noStyle>
                            <Input placeholder="键" style={{ width: 150 }} />
                          </Form.Item>
                          <Form.Item {...field} name={[field.name, 'value']} noStyle>
                            <Input placeholder="值" style={{ width: 150 }} />
                          </Form.Item>
                          <MinusCircleOutlined onClick={() => remove(field.name)} />
                        </Space>
                      ))}
                      <Button type="dashed" onClick={() => add()} block icon={<PlusOutlined />}>
                        添加标签
                      </Button>
                    </>
                  )}
                </Form.List>
              </Form.Item>
              
              <Form.Item label="注解">
                <Form.List name="annotations">
                  {(fields, { add, remove }) => (
                    <>
                      {fields.map((field) => (
                        <Space key={field.key} style={{ display: 'flex', marginBottom: 8 }}>
                          <Form.Item {...field} name={[field.name, 'key']} noStyle>
                            <Input placeholder="键" style={{ width: 150 }} />
                          </Form.Item>
                          <Form.Item {...field} name={[field.name, 'value']} noStyle>
                            <Input placeholder="值" style={{ width: 150 }} />
                          </Form.Item>
                          <MinusCircleOutlined onClick={() => remove(field.name)} />
                        </Space>
                      ))}
                      <Button type="dashed" onClick={() => add()} block icon={<PlusOutlined />}>
                        添加注解
                      </Button>
                    </>
                  )}
                </Form.List>
              </Form.Item>
            </Form>
          </Tabs.TabPane>
          
          <Tabs.TabPane tab="YAML编辑" key="yaml">
            <MonacoEditor
              height="600px"
              language="yaml"
              value={editYaml}
              onChange={(value) => setEditYaml(value || '')}
              theme="vs-dark"
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
    </div>
  );
};

export default IngressTab;

