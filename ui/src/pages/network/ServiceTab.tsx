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
  Descriptions,
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
  LinkOutlined,
  EditOutlined,
  PlusOutlined,
  MinusCircleOutlined,
} from '@ant-design/icons';
import MonacoEditor from '@monaco-editor/react';
import * as YAML from 'yaml';
import { ServiceService } from '../../services/serviceService';
import type { Service } from '../../types';
import type { ColumnsType } from 'antd/es/table';
import ServiceCreateModal from './ServiceCreateModal';

const { Search } = Input;
const { Text, Link } = Typography;

interface ServiceTabProps {
  clusterId: string;
  onCountChange?: (count: number) => void;
}

const ServiceTab: React.FC<ServiceTabProps> = ({ clusterId, onCountChange }) => {
  const { message } = App.useApp();
  
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  
  // 筛选条件
  const [namespace, setNamespace] = useState<string>('_all_');
  const [serviceType, setServiceType] = useState<string>('');
  const [searchText, setSearchText] = useState('');
  
  // YAML查看Modal
  const [yamlModalVisible, setYamlModalVisible] = useState(false);
  const [currentYaml, setCurrentYaml] = useState('');
  const [yamlLoading, setYamlLoading] = useState(false);

  // Endpoints查看Modal
  const [endpointsModalVisible, setEndpointsModalVisible] = useState(false);
  const [currentEndpoints, setCurrentEndpoints] = useState<any>(null);
  const [endpointsLoading, setEndpointsLoading] = useState(false);

  // YAML编辑Modal
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editYaml, setEditYaml] = useState('');
  const [editingService, setEditingService] = useState<Service | null>(null);
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
        const nsList = await ServiceService.getServiceNamespaces(clusterId);
        setNamespaces(nsList);
      } catch (error) {
        console.error('加载命名空间失败:', error);
      } finally {
        setLoadingNamespaces(false);
      }
    };

    loadNamespaces();
  }, [clusterId]);

  // 获取Service列表
  const fetchServices = useCallback(async () => {
    if (!clusterId) return;
    
    setLoading(true);
    try {
      const response = await ServiceService.getServices(
        clusterId,
        namespace,
        serviceType,
        searchText || undefined,
        page,
        pageSize
      );
      
      if (response.code === 200) {
        setServices(response.data.items);
        setTotal(response.data.total);
        onCountChange?.(response.data.total);
      } else {
        message.error(response.message || '获取Service列表失败');
      }
    } catch (error) {
      console.error('获取Service列表失败:', error);
      message.error('获取Service列表失败');
    } finally {
      setLoading(false);
    }
  }, [clusterId, namespace, serviceType, searchText, page, pageSize, onCountChange, message]);

  // 初始加载和筛选条件变化时重新加载
  useEffect(() => {
    fetchServices();
  }, [fetchServices]);

  // 查看YAML
  const handleViewYAML = async (service: Service) => {
    setYamlModalVisible(true);
    setYamlLoading(true);
    try {
      const response = await ServiceService.getServiceYAML(
        clusterId,
        service.namespace,
        service.name
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

  // 查看Endpoints
  const handleViewEndpoints = async (service: Service) => {
    setEndpointsModalVisible(true);
    setEndpointsLoading(true);
    try {
      const response = await ServiceService.getServiceEndpoints(
        clusterId,
        service.namespace,
        service.name
      );
      
      if (response.code === 200) {
        setCurrentEndpoints(response.data);
      } else {
        message.error(response.message || '获取Endpoints失败');
      }
    } catch (error) {
      console.error('获取Endpoints失败:', error);
      message.error('获取Endpoints失败');
    } finally {
      setEndpointsLoading(false);
    }
  };

  // 删除Service
  const handleDelete = async (service: Service) => {
    try {
      const response = await ServiceService.deleteService(
        clusterId,
        service.namespace,
        service.name
      );
      
      if (response.code === 200) {
        message.success('删除成功');
        fetchServices();
      } else {
        message.error(response.message || '删除失败');
      }
    } catch (error) {
      console.error('删除失败:', error);
      message.error('删除失败');
    }
  };

  // 编辑Service
  const handleEdit = async (service: Service) => {
    setEditingService(service);
    setYamlLoading(true);
    try {
      const response = await ServiceService.getServiceYAML(
        clusterId,
        service.namespace,
        service.name
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
            type: yamlData.spec?.type || 'ClusterIP',
            sessionAffinity: yamlData.spec?.sessionAffinity || 'None',
            labels: [],
            annotations: [],
            selectors: [],
            ports: [],
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

          // 解析selectors
          if (yamlData.spec?.selector) {
            formData.selectors = Object.entries(yamlData.spec.selector).map(([key, value]) => ({
              key,
              value: String(value),
            }));
          }

          // 解析ports
          if (yamlData.spec?.ports) {
            formData.ports = yamlData.spec.ports.map((port: any) => ({
              name: port.name || '',
              protocol: port.protocol || 'TCP',
              port: port.port,
              targetPort: port.targetPort,
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
    if (!editingService) return;

    setSaveLoading(true);
    try {
      if (editMode === 'yaml') {
        // YAML方式更新
        const response = await ServiceService.updateService(
          clusterId,
          editingService.namespace,
          editingService.name,
          {
            namespace: editingService.namespace,
            yaml: editYaml,
          }
        );
        
        if (response.code === 200) {
          message.success('更新成功');
          setEditModalVisible(false);
          setEditYaml('');
          setEditingService(null);
          setEditMode('yaml');
          fetchServices();
        } else {
          message.error(response.message || '更新失败');
        }
      } else {
        // 表单方式更新
        const values = await editForm.validateFields();
        
        // 构建Service YAML
        const serviceYaml: any = {
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

        // 添加labels
        if (values.labels && values.labels.length > 0) {
          values.labels.forEach((label: any) => {
            if (label && label.key) {
              serviceYaml.metadata.labels[label.key] = label.value || '';
            }
          });
        }

        // 添加annotations
        if (values.annotations && values.annotations.length > 0) {
          values.annotations.forEach((annotation: any) => {
            if (annotation && annotation.key) {
              serviceYaml.metadata.annotations[annotation.key] = annotation.value || '';
            }
          });
        }

        // 添加selectors
        if (values.selectors && values.selectors.length > 0) {
          values.selectors.forEach((selector: any) => {
            if (selector && selector.key) {
              serviceYaml.spec.selector[selector.key] = selector.value || '';
            }
          });
        }

        const yamlString = YAML.stringify(serviceYaml);
        
        const response = await ServiceService.updateService(
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
          setEditingService(null);
          setEditMode('yaml');
          editForm.resetFields();
          fetchServices();
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
  const columns: ColumnsType<Service> = [
    {
      title: '服务名称',
      dataIndex: 'name',
      key: 'name',
      fixed: 'left',
      width: 200,
      render: (name: string, record: Service) => (
        <div>
          <Link strong onClick={() => handleViewYAML(record)}>
            {name}
          </Link>
          <div style={{ fontSize: 12, color: '#999' }}>
            {record.namespace}
          </div>
        </div>
      ),
    },
    {
      title: '类型',
      dataIndex: 'type',
      key: 'type',
      width: 150,
      render: (type: string) => (
        <Tag color={ServiceService.getTypeColor(type)}>
          {ServiceService.getTypeTag(type)}
        </Tag>
      ),
    },
    {
      title: '访问地址',
      key: 'access',
      width: 200,
      render: (_: any, record: Service) => {
        const addresses = ServiceService.formatAccessAddress(record);
        return (
          <div>
            {addresses.slice(0, 2).map((addr, idx) => (
              <div key={idx} style={{ fontSize: 12 }}>
                {addr}
              </div>
            ))}
            {addresses.length > 2 && (
              <Tooltip title={addresses.slice(2).join(', ')}>
                <Text type="secondary" style={{ fontSize: 12, cursor: 'pointer' }}>
                  +{addresses.length - 2} 更多
                </Text>
              </Tooltip>
            )}
          </div>
        );
      },
    },
    {
      title: '端口',
      key: 'ports',
      width: 180,
      render: (_: any, record: Service) => (
        <Tooltip title={ServiceService.formatPorts(record)}>
          <Text ellipsis style={{ width: 160, display: 'block' }}>
            {ServiceService.formatPorts(record)}
          </Text>
        </Tooltip>
      ),
    },
    {
      title: '选择器',
      key: 'selector',
      width: 200,
      render: (_: any, record: Service) => (
        <Tooltip title={ServiceService.formatSelector(record.selector)}>
          <Text ellipsis style={{ width: 180, display: 'block' }}>
            {ServiceService.formatSelector(record.selector)}
          </Text>
        </Tooltip>
      ),
    },
    {
      title: '创建时间',
      dataIndex: 'createdAt',
      key: 'createdAt',
      width: 180,
      render: (createdAt: string) => (
        <Tooltip title={new Date(createdAt).toLocaleString()}>
          <span>{ServiceService.getAge(createdAt)}</span>
        </Tooltip>
      ),
    },
    {
      title: '操作',
      key: 'action',
      fixed: 'right',
      width: 200,
      render: (_: any, record: Service) => (
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
          <Tooltip title="查看Endpoints">
            <Button
              type="link"
              size="small"
              icon={<LinkOutlined />}
              onClick={() => handleViewEndpoints(record)}
            />
          </Tooltip>
          <Popconfirm
            title="确定要删除这个Service吗？"
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
            placeholder="选择类型"
            style={{ width: 150 }}
            value={serviceType}
            onChange={setServiceType}
            allowClear
          >
            <Select.Option value="ClusterIP">ClusterIP</Select.Option>
            <Select.Option value="NodePort">NodePort</Select.Option>
            <Select.Option value="LoadBalancer">LoadBalancer</Select.Option>
            <Select.Option value="ExternalName">ExternalName</Select.Option>
          </Select>
          
          <Search
            placeholder="搜索服务名称..."
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
            创建Service
          </Button>
          <Button
            icon={<ReloadOutlined />}
            onClick={() => fetchServices()}
          >
            刷新
          </Button>
        </Space>
      </Space>

      {/* Service列表表格 */}
      <Table
        columns={columns}
        dataSource={services}
        rowKey={(record) => `${record.namespace}/${record.name}`}
        loading={loading}
        scroll={{ x: 1200 }}
        pagination={{
          current: page,
          pageSize: pageSize,
          total: total,
          showSizeChanger: true,
          showQuickJumper: true,
          showTotal: (total) => `共 ${total} 个服务`,
          onChange: (page, pageSize) => {
            setPage(page);
            setPageSize(pageSize);
          },
        }}
      />

      {/* YAML查看Modal */}
      <Modal
        title="Service YAML"
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

      {/* Endpoints查看Modal */}
      <Modal
        title="Service Endpoints"
        open={endpointsModalVisible}
        onCancel={() => setEndpointsModalVisible(false)}
        footer={null}
        width={800}
      >
        {endpointsLoading ? (
          <div style={{ textAlign: 'center', padding: 40 }}>
            <span>加载中...</span>
          </div>
        ) : currentEndpoints ? (
          <Descriptions column={1} bordered>
            <Descriptions.Item label="名称">{currentEndpoints.name}</Descriptions.Item>
            <Descriptions.Item label="命名空间">{currentEndpoints.namespace}</Descriptions.Item>
            <Descriptions.Item label="子网">
              {currentEndpoints.subsets && currentEndpoints.subsets.length > 0 ? (
                currentEndpoints.subsets.map((subset: any, idx: number) => (
                  <div key={idx} style={{ marginBottom: 16 }}>
                    <Text strong>地址:</Text>
                    {subset.addresses?.map((addr: any, addrIdx: number) => (
                      <div key={addrIdx} style={{ marginLeft: 16 }}>
                        {addr.ip} {addr.nodeName && `(节点: ${addr.nodeName})`}
                      </div>
                    ))}
                    <Text strong style={{ marginTop: 8, display: 'block' }}>端口:</Text>
                    {subset.ports?.map((port: any, portIdx: number) => (
                      <div key={portIdx} style={{ marginLeft: 16 }}>
                        {port.name && `${port.name}: `}{port.port}/{port.protocol}
                      </div>
                    ))}
                  </div>
                ))
              ) : (
                <Text type="secondary">无</Text>
              )}
            </Descriptions.Item>
          </Descriptions>
        ) : (
          <div style={{ textAlign: 'center', padding: 40 }}>
            <Text type="secondary">无Endpoints信息</Text>
          </div>
        )}
      </Modal>

      {/* 创建Service Modal */}
      <ServiceCreateModal
        visible={createModalVisible}
        clusterId={clusterId}
        onClose={() => setCreateModalVisible(false)}
        onSuccess={() => fetchServices()}
      />

      {/* 编辑Modal */}
      <Modal
        title={`编辑 Service: ${editingService?.name}`}
        open={editModalVisible}
        onCancel={() => {
          setEditModalVisible(false);
          setEditYaml('');
          setEditingService(null);
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
                <Input disabled placeholder="服务名称" />
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
              
              <Form.Item label="类型" name="type" rules={[{ required: true }]}>
                <Select>
                  <Select.Option value="ClusterIP">ClusterIP</Select.Option>
                  <Select.Option value="NodePort">NodePort</Select.Option>
                  <Select.Option value="LoadBalancer">LoadBalancer</Select.Option>
                  <Select.Option value="ExternalName">ExternalName</Select.Option>
                </Select>
              </Form.Item>
              
              <Form.Item label="选择器">
                <Form.List name="selectors">
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
                        添加选择器
                      </Button>
                    </>
                  )}
                </Form.List>
              </Form.Item>
              
              <Form.Item label="端口">
                <Form.List name="ports">
                  {(fields, { add, remove }) => (
                    <>
                      {fields.map((field) => (
                        <Space key={field.key} style={{ display: 'flex', marginBottom: 8 }} align="baseline">
                          <Form.Item {...field} name={[field.name, 'name']} noStyle>
                            <Input placeholder="名称" style={{ width: 100 }} />
                          </Form.Item>
                          <Form.Item {...field} name={[field.name, 'protocol']} noStyle initialValue="TCP">
                            <Select style={{ width: 80 }}>
                              <Select.Option value="TCP">TCP</Select.Option>
                              <Select.Option value="UDP">UDP</Select.Option>
                            </Select>
                          </Form.Item>
                          <Form.Item {...field} name={[field.name, 'port']} noStyle>
                            <InputNumber placeholder="端口" min={1} max={65535} style={{ width: 100 }} />
                          </Form.Item>
                          <Form.Item {...field} name={[field.name, 'targetPort']} noStyle>
                            <InputNumber placeholder="目标端口" min={1} max={65535} style={{ width: 100 }} />
                          </Form.Item>
                          <MinusCircleOutlined onClick={() => remove(field.name)} />
                        </Space>
                      ))}
                      <Button type="dashed" onClick={() => add()} block icon={<PlusOutlined />}>
                        添加端口
                      </Button>
                    </>
                  )}
                </Form.List>
              </Form.Item>
              
              <Form.Item label="会话亲和性" name="sessionAffinity" initialValue="None">
                <Select>
                  <Select.Option value="None">None</Select.Option>
                  <Select.Option value="ClientIP">ClientIP</Select.Option>
                </Select>
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

export default ServiceTab;

