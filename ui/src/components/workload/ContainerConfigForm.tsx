import React from 'react';
import {
  Form,
  Input,
  InputNumber,
  Select,
  Button,
  Space,
  Row,
  Col,
  Card,
  Tabs,
  Switch,
  Divider,
  Typography,
} from 'antd';
import { PlusOutlined, MinusCircleOutlined, DeleteOutlined } from '@ant-design/icons';

const { Option } = Select;
const { TextArea } = Input;
const { Text } = Typography;

interface ContainerConfigFormProps {
  field: { key: number; name: number; fieldKey?: number };
  remove: (index: number) => void;
  isInitContainer?: boolean;
}

// 探针配置组件
const ProbeConfigForm: React.FC<{
  namePrefix: (string | number)[];
  containerType: 'containers' | 'initContainers';
  label: string;
}> = ({ namePrefix, containerType, label }) => {
  const form = Form.useFormInstance();
  // 构建完整的路径来监听表单值
  const fullPath = [containerType, ...namePrefix];
  
  return (
    <Card size="small" title={label} style={{ marginBottom: 16 }}>
      <Space>
        <Form.Item name={[...namePrefix, 'enabled']} valuePropName="checked" noStyle>
          <Switch checkedChildren="启用" unCheckedChildren="禁用" />
        </Form.Item>
      </Space>
      
      <Form.Item noStyle shouldUpdate={(prevValues, currentValues) => {
        const prevEnabled = prevValues?.[containerType]?.[namePrefix[0]]?.[namePrefix[1]]?.enabled;
        const currEnabled = currentValues?.[containerType]?.[namePrefix[0]]?.[namePrefix[1]]?.enabled;
        const prevType = prevValues?.[containerType]?.[namePrefix[0]]?.[namePrefix[1]]?.type;
        const currType = currentValues?.[containerType]?.[namePrefix[0]]?.[namePrefix[1]]?.type;
        return prevEnabled !== currEnabled || prevType !== currType;
      }}>
        {() => {
          const enabled = form.getFieldValue([...fullPath, 'enabled']);
          const probeType = form.getFieldValue([...fullPath, 'type']) || 'httpGet';
          
          if (!enabled) {
            return <Text type="secondary" style={{ marginLeft: 8 }}>未启用</Text>;
          }
          
          return (
            <div style={{ marginTop: 16 }}>
              <Form.Item
                name={[...namePrefix, 'type']}
                label="检查方式"
                initialValue="httpGet"
              >
                <Select placeholder="选择检查方式">
                  <Option value="httpGet">HTTP请求</Option>
                  <Option value="exec">执行命令</Option>
                  <Option value="tcpSocket">TCP端口</Option>
                </Select>
              </Form.Item>
              
              {(probeType === 'httpGet' || !probeType) && (
                <Row gutter={16}>
                  <Col span={12}>
                    <Form.Item name={[...namePrefix, 'httpGet', 'path']} label="HTTP路径">
                      <Input placeholder="/healthz" />
                    </Form.Item>
                  </Col>
                  <Col span={8}>
                    <Form.Item name={[...namePrefix, 'httpGet', 'port']} label="端口">
                      <InputNumber min={1} max={65535} style={{ width: '100%' }} />
                    </Form.Item>
                  </Col>
                  <Col span={4}>
                    <Form.Item name={[...namePrefix, 'httpGet', 'scheme']} label="协议" initialValue="HTTP">
                      <Select>
                        <Option value="HTTP">HTTP</Option>
                        <Option value="HTTPS">HTTPS</Option>
                      </Select>
                    </Form.Item>
                  </Col>
                </Row>
              )}
              
              {probeType === 'exec' && (
                <Form.Item name={[...namePrefix, 'exec', 'command']} label="执行命令">
                  <TextArea
                    placeholder="每行一个命令参数，例如：&#10;/bin/sh&#10;-c&#10;cat /tmp/healthy"
                    rows={3}
                  />
                </Form.Item>
              )}
              
              {probeType === 'tcpSocket' && (
                <Form.Item name={[...namePrefix, 'tcpSocket', 'port']} label="TCP端口">
                  <InputNumber min={1} max={65535} style={{ width: '100%' }} />
                </Form.Item>
              )}
              
              <Row gutter={16}>
                <Col span={8}>
                  <Form.Item name={[...namePrefix, 'initialDelaySeconds']} label="初始延迟(秒)">
                    <InputNumber min={0} style={{ width: '100%' }} placeholder="0" />
                  </Form.Item>
                </Col>
                <Col span={8}>
                  <Form.Item name={[...namePrefix, 'periodSeconds']} label="检查周期(秒)">
                    <InputNumber min={1} style={{ width: '100%' }} placeholder="10" />
                  </Form.Item>
                </Col>
                <Col span={8}>
                  <Form.Item name={[...namePrefix, 'timeoutSeconds']} label="超时时间(秒)">
                    <InputNumber min={1} style={{ width: '100%' }} placeholder="1" />
                  </Form.Item>
                </Col>
              </Row>
              
              <Row gutter={16}>
                <Col span={12}>
                  <Form.Item name={[...namePrefix, 'successThreshold']} label="成功阈值">
                    <InputNumber min={1} style={{ width: '100%' }} placeholder="1" />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item name={[...namePrefix, 'failureThreshold']} label="失败阈值">
                    <InputNumber min={1} style={{ width: '100%' }} placeholder="3" />
                  </Form.Item>
                </Col>
              </Row>
            </div>
          );
        }}
      </Form.Item>
    </Card>
  );
};

const ContainerConfigForm: React.FC<ContainerConfigFormProps> = ({
  field,
  remove,
  isInitContainer = false,
}) => {
  
  return (
    <Card
      size="small"
      title={
        <Space>
          <Text strong>{isInitContainer ? 'Init容器' : '容器'}</Text>
          <Form.Item name={[field.name, 'name']} noStyle>
            <Input 
              placeholder="容器名称" 
              style={{ width: 200 }}
              bordered={false}
            />
          </Form.Item>
        </Space>
      }
      extra={
        <Button
          type="text"
          danger
          icon={<DeleteOutlined />}
          onClick={() => remove(field.name)}
        >
          删除
        </Button>
      }
      style={{ marginBottom: 16 }}
    >
      <Tabs
        defaultActiveKey="basic"
        size="small"
        items={[
          {
            key: 'basic',
            label: '基本信息',
            children: (
              <>
                <Row gutter={16}>
                  <Col span={12}>
                    <Form.Item
                      name={[field.name, 'name']}
                      label="容器名称"
                      rules={[
                        { required: true, message: '请输入容器名称' },
                        {
                          pattern: /^[a-z0-9]([-a-z0-9]*[a-z0-9])?$/,
                          message: '名称只能包含小写字母、数字和连字符',
                        },
                      ]}
                    >
                      <Input placeholder="请输入容器名称" />
                    </Form.Item>
                  </Col>
                  <Col span={12}>
                    <Form.Item
                      name={[field.name, 'image']}
                      label="镜像"
                      rules={[{ required: true, message: '请输入镜像地址' }]}
                    >
                      <Input placeholder="例如: nginx:latest" />
                    </Form.Item>
                  </Col>
                </Row>
                
                <Row gutter={16}>
                  <Col span={8}>
                    <Form.Item name={[field.name, 'imagePullPolicy']} label="镜像拉取策略">
                      <Select placeholder="选择拉取策略">
                        <Option value="IfNotPresent">IfNotPresent (按需拉取)</Option>
                        <Option value="Always">Always (总是拉取)</Option>
                        <Option value="Never">Never (从不拉取)</Option>
                      </Select>
                    </Form.Item>
                  </Col>
                </Row>
                
                <Divider orientation="left" plain>
                  <Text type="secondary">资源配置</Text>
                </Divider>
                
                <Row gutter={16}>
                  <Col span={12}>
                    <Card size="small" title="请求资源 (Requests)">
                      <Row gutter={8}>
                        <Col span={8}>
                          <Form.Item name={[field.name, 'resources', 'requests', 'cpu']} label="CPU">
                            <Input placeholder="例如: 100m" />
                          </Form.Item>
                        </Col>
                        <Col span={8}>
                          <Form.Item name={[field.name, 'resources', 'requests', 'memory']} label="内存">
                            <Input placeholder="例如: 128Mi" />
                          </Form.Item>
                        </Col>
                        <Col span={8}>
                          <Form.Item name={[field.name, 'resources', 'requests', 'ephemeral-storage']} label="临时存储">
                            <Input placeholder="例如: 1Gi" />
                          </Form.Item>
                        </Col>
                      </Row>
                    </Card>
                  </Col>
                  <Col span={12}>
                    <Card size="small" title="限制资源 (Limits)">
                      <Row gutter={8}>
                        <Col span={8}>
                          <Form.Item name={[field.name, 'resources', 'limits', 'cpu']} label="CPU">
                            <Input placeholder="例如: 500m" />
                          </Form.Item>
                        </Col>
                        <Col span={8}>
                          <Form.Item name={[field.name, 'resources', 'limits', 'memory']} label="内存">
                            <Input placeholder="例如: 512Mi" />
                          </Form.Item>
                        </Col>
                        <Col span={8}>
                          <Form.Item name={[field.name, 'resources', 'limits', 'ephemeral-storage']} label="临时存储">
                            <Input placeholder="例如: 2Gi" />
                          </Form.Item>
                        </Col>
                      </Row>
                    </Card>
                  </Col>
                </Row>
                
                <Divider orientation="left" plain>
                  <Text type="secondary">端口配置</Text>
                </Divider>
                
                <Form.List name={[field.name, 'ports']}>
                  {(portFields, { add: addPort, remove: removePort }) => (
                    <>
                      {portFields.map((portField) => (
                        <Row key={portField.key} gutter={16} style={{ marginBottom: 8 }}>
                          <Col span={8}>
                            <Form.Item name={[portField.name, 'name']} noStyle>
                              <Input placeholder="端口名称(可选)" />
                            </Form.Item>
                          </Col>
                          <Col span={8}>
                            <Form.Item
                              name={[portField.name, 'containerPort']}
                              noStyle
                              rules={[{ required: true, message: '请输入端口' }]}
                            >
                              <InputNumber
                                min={1}
                                max={65535}
                                placeholder="容器端口"
                                style={{ width: '100%' }}
                              />
                            </Form.Item>
                          </Col>
                          <Col span={6}>
                            <Form.Item name={[portField.name, 'protocol']} noStyle>
                              <Select placeholder="协议" defaultValue="TCP">
                                <Option value="TCP">TCP</Option>
                                <Option value="UDP">UDP</Option>
                              </Select>
                            </Form.Item>
                          </Col>
                          <Col span={2}>
                            <MinusCircleOutlined onClick={() => removePort(portField.name)} />
                          </Col>
                        </Row>
                      ))}
                      <Button type="dashed" onClick={() => addPort()} icon={<PlusOutlined />}>
                        添加端口
                      </Button>
                    </>
                  )}
                </Form.List>
              </>
            ),
          },
          {
            key: 'lifecycle',
            label: '生命周期',
            children: (
              <>
                <Card size="small" title="启动命令" style={{ marginBottom: 16 }}>
                  <Form.Item name={[field.name, 'command']} label="Command (覆盖ENTRYPOINT)">
                    <TextArea
                      placeholder="每行一个参数，例如：&#10;/bin/sh&#10;-c"
                      rows={2}
                    />
                  </Form.Item>
                  <Form.Item name={[field.name, 'args']} label="Args (覆盖CMD)">
                    <TextArea
                      placeholder="每行一个参数"
                      rows={2}
                    />
                  </Form.Item>
                  <Form.Item name={[field.name, 'workingDir']} label="工作目录">
                    <Input placeholder="/app" />
                  </Form.Item>
                </Card>
                
                <Card size="small" title="启动后操作 (postStart)" style={{ marginBottom: 16 }}>
                  <Form.Item name={[field.name, 'lifecycle', 'postStart', 'exec', 'command']} label="执行命令">
                    <TextArea
                      placeholder="每行一个参数，例如：&#10;/bin/sh&#10;-c&#10;echo Hello"
                      rows={2}
                    />
                  </Form.Item>
                </Card>
                
                <Card size="small" title="停止前操作 (preStop)">
                  <Form.Item name={[field.name, 'lifecycle', 'preStop', 'exec', 'command']} label="执行命令">
                    <TextArea
                      placeholder="每行一个参数，例如：&#10;/bin/sh&#10;-c&#10;sleep 10"
                      rows={2}
                    />
                  </Form.Item>
                </Card>
              </>
            ),
          },
          {
            key: 'healthCheck',
            label: '健康检查',
            children: (
              <>
                <ProbeConfigForm
                  namePrefix={[field.name, 'startupProbe']}
                  containerType={isInitContainer ? 'initContainers' : 'containers'}
                  label="启动探针 (Startup Probe)"
                />
                <ProbeConfigForm
                  namePrefix={[field.name, 'livenessProbe']}
                  containerType={isInitContainer ? 'initContainers' : 'containers'}
                  label="存活探针 (Liveness Probe)"
                />
                <ProbeConfigForm
                  namePrefix={[field.name, 'readinessProbe']}
                  containerType={isInitContainer ? 'initContainers' : 'containers'}
                  label="就绪探针 (Readiness Probe)"
                />
              </>
            ),
          },
          {
            key: 'env',
            label: '环境变量',
            children: (
              <Form.List name={[field.name, 'env']}>
                {(envFields, { add: addEnv, remove: removeEnv }) => (
                  <>
                    {envFields.map((envField) => (
                      <Card key={envField.key} size="small" style={{ marginBottom: 8 }}>
                        <Row gutter={16}>
                          <Col span={6}>
                            <Form.Item
                              name={[envField.name, 'name']}
                              label="变量名"
                              rules={[{ required: true, message: '请输入变量名' }]}
                            >
                              <Input placeholder="MY_ENV_VAR" />
                            </Form.Item>
                          </Col>
                          <Col span={6}>
                            <Form.Item name={[envField.name, 'valueType']} label="类型" initialValue="value">
                              <Select style={{ width: '100%' }}>
                                <Select.Option value="value">直接输入</Select.Option>
                                <Select.Option value="configMapKeyRef">ConfigMap引用</Select.Option>
                                <Select.Option value="secretKeyRef">Secret引用</Select.Option>
                                <Select.Option value="fieldRef">Pod字段引用</Select.Option>
                              </Select>
                            </Form.Item>
                          </Col>
                          <Col span={10}>
                            <Form.Item noStyle shouldUpdate>
                              {({ getFieldValue }) => {
                                const valueType = getFieldValue([field.name, 'env', envField.name, 'valueType']) || 'value';
                                
                                if (valueType === 'value') {
                                  return (
                                    <Form.Item name={[envField.name, 'value']} label="值">
                                      <Input placeholder="变量值" />
                                    </Form.Item>
                                  );
                                }
                                if (valueType === 'configMapKeyRef') {
                                  return (
                                    <Row gutter={8}>
                                      <Col span={12}>
                                        <Form.Item name={[envField.name, 'valueFrom', 'configMapKeyRef', 'name']} label="ConfigMap">
                                          <Input placeholder="名称" />
                                        </Form.Item>
                                      </Col>
                                      <Col span={12}>
                                        <Form.Item name={[envField.name, 'valueFrom', 'configMapKeyRef', 'key']} label="Key">
                                          <Input placeholder="Key" />
                                        </Form.Item>
                                      </Col>
                                    </Row>
                                  );
                                }
                                if (valueType === 'secretKeyRef') {
                                  return (
                                    <Row gutter={8}>
                                      <Col span={12}>
                                        <Form.Item name={[envField.name, 'valueFrom', 'secretKeyRef', 'name']} label="Secret">
                                          <Input placeholder="名称" />
                                        </Form.Item>
                                      </Col>
                                      <Col span={12}>
                                        <Form.Item name={[envField.name, 'valueFrom', 'secretKeyRef', 'key']} label="Key">
                                          <Input placeholder="Key" />
                                        </Form.Item>
                                      </Col>
                                    </Row>
                                  );
                                }
                                if (valueType === 'fieldRef') {
                                  return (
                                    <Form.Item name={[envField.name, 'valueFrom', 'fieldRef', 'fieldPath']} label="字段">
                                      <Select placeholder="选择字段">
                                        <Select.Option value="metadata.name">Pod名称</Select.Option>
                                        <Select.Option value="metadata.namespace">命名空间</Select.Option>
                                        <Select.Option value="spec.nodeName">节点名称</Select.Option>
                                        <Select.Option value="status.podIP">Pod IP</Select.Option>
                                      </Select>
                                    </Form.Item>
                                  );
                                }
                                return null;
                              }}
                            </Form.Item>
                          </Col>
                          <Col span={2}>
                            <Form.Item label=" ">
                              <MinusCircleOutlined onClick={() => removeEnv(envField.name)} />
                            </Form.Item>
                          </Col>
                        </Row>
                      </Card>
                    ))}
                    <Button type="dashed" onClick={() => addEnv({ valueType: 'value' })} icon={<PlusOutlined />}>
                      添加环境变量
                    </Button>
                  </>
                )}
              </Form.List>
            ),
          },
          {
            key: 'volumeMounts',
            label: '数据存储',
            children: (
              <Form.List name={[field.name, 'volumeMounts']}>
                {(mountFields, { add: addMount, remove: removeMount }) => (
                  <>
                    {mountFields.map((mountField) => (
                      <Card key={mountField.key} size="small" style={{ marginBottom: 8 }}>
                        <Row gutter={16}>
                          <Col span={8}>
                            <Form.Item
                              name={[mountField.name, 'name']}
                              label="数据卷名称"
                              rules={[{ required: true, message: '请选择数据卷' }]}
                            >
                              <Input placeholder="选择或输入数据卷名称" />
                            </Form.Item>
                          </Col>
                          <Col span={8}>
                            <Form.Item
                              name={[mountField.name, 'mountPath']}
                              label="挂载路径"
                              rules={[{ required: true, message: '请输入挂载路径' }]}
                            >
                              <Input placeholder="例如: /data" />
                            </Form.Item>
                          </Col>
                          <Col span={6}>
                            <Form.Item
                              name={[mountField.name, 'subPath']}
                              label="子路径 (可选)"
                            >
                              <Input placeholder="卷内子目录" />
                            </Form.Item>
                          </Col>
                          <Col span={2}>
                            <Form.Item label=" ">
                              <MinusCircleOutlined onClick={() => removeMount(mountField.name)} />
                            </Form.Item>
                          </Col>
                        </Row>
                        <Row gutter={16}>
                          <Col span={8}>
                            <Form.Item name={[mountField.name, 'readOnly']} valuePropName="checked">
                              <Switch checkedChildren="只读" unCheckedChildren="读写" />
                            </Form.Item>
                          </Col>
                        </Row>
                      </Card>
                    ))}
                    <Button type="dashed" onClick={() => addMount()} icon={<PlusOutlined />}>
                      添加挂载
                    </Button>
                  </>
                )}
              </Form.List>
            ),
          },
        ]}
      />
    </Card>
  );
};

export default ContainerConfigForm;

