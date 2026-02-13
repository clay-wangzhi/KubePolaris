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
import { useTranslation } from 'react-i18next';

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
  const { t } = useTranslation('components');
  const form = Form.useFormInstance();
  // 构建完整的路径来监听表单值
  const fullPath = [containerType, ...namePrefix];
  
  return (
    <Card size="small" title={label} style={{ marginBottom: 16 }}>
      <Space>
        <Form.Item name={[...namePrefix, 'enabled']} valuePropName="checked" noStyle>
          <Switch checkedChildren={t('containerConfig.enable')} unCheckedChildren={t('containerConfig.disable')} />
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
            return <Text type="secondary" style={{ marginLeft: 8 }}>{t('containerConfig.notEnabled')}</Text>;
          }
          
          return (
            <div style={{ marginTop: 16 }}>
              <Form.Item
                name={[...namePrefix, 'type']}
                label={t('containerConfig.checkMethod')}
                initialValue="httpGet"
              >
                <Select placeholder={t('containerConfig.selectCheckMethod')}>
                  <Option value="httpGet">{t('containerConfig.httpRequest')}</Option>
                  <Option value="exec">{t('containerConfig.execCommand')}</Option>
                  <Option value="tcpSocket">{t('containerConfig.tcpPort')}</Option>
                </Select>
              </Form.Item>
              
              {(probeType === 'httpGet' || !probeType) && (
                <Row gutter={16}>
                  <Col span={12}>
                    <Form.Item name={[...namePrefix, 'httpGet', 'path']} label={t('containerConfig.httpPath')}>
                      <Input placeholder="/healthz" />
                    </Form.Item>
                  </Col>
                  <Col span={8}>
                    <Form.Item name={[...namePrefix, 'httpGet', 'port']} label={t('containerConfig.port')}>
                      <InputNumber min={1} max={65535} style={{ width: '100%' }} />
                    </Form.Item>
                  </Col>
                  <Col span={4}>
                    <Form.Item name={[...namePrefix, 'httpGet', 'scheme']} label={t('containerConfig.protocol')} initialValue="HTTP">
                      <Select>
                        <Option value="HTTP">HTTP</Option>
                        <Option value="HTTPS">HTTPS</Option>
                      </Select>
                    </Form.Item>
                  </Col>
                </Row>
              )}
              
              {probeType === 'exec' && (
                <Form.Item name={[...namePrefix, 'exec', 'command']} label={t('containerConfig.execCommand')}>
                  <TextArea
                    placeholder={t('containerConfig.execCommandPlaceholder')}
                    rows={3}
                  />
                </Form.Item>
              )}
              
              {probeType === 'tcpSocket' && (
                <Form.Item name={[...namePrefix, 'tcpSocket', 'port']} label={t('containerConfig.tcpPort')}>
                  <InputNumber min={1} max={65535} style={{ width: '100%' }} />
                </Form.Item>
              )}
              
              <Row gutter={16}>
                <Col span={8}>
                  <Form.Item name={[...namePrefix, 'initialDelaySeconds']} label={t('containerConfig.initialDelay')}>
                    <InputNumber min={0} style={{ width: '100%' }} placeholder="0" />
                  </Form.Item>
                </Col>
                <Col span={8}>
                  <Form.Item name={[...namePrefix, 'periodSeconds']} label={t('containerConfig.checkPeriod')}>
                    <InputNumber min={1} style={{ width: '100%' }} placeholder="10" />
                  </Form.Item>
                </Col>
                <Col span={8}>
                  <Form.Item name={[...namePrefix, 'timeoutSeconds']} label={t('containerConfig.timeout')}>
                    <InputNumber min={1} style={{ width: '100%' }} placeholder="1" />
                  </Form.Item>
                </Col>
              </Row>
              
              <Row gutter={16}>
                <Col span={12}>
                  <Form.Item name={[...namePrefix, 'successThreshold']} label={t('containerConfig.successThreshold')}>
                    <InputNumber min={1} style={{ width: '100%' }} placeholder="1" />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item name={[...namePrefix, 'failureThreshold']} label={t('containerConfig.failureThreshold')}>
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
  const { t } = useTranslation('components');
  
  return (
    <Card
      size="small"
      title={
        <Space>
          <Text strong>{isInitContainer ? t('containerConfig.initContainer') : t('containerConfig.container')}</Text>
          <Form.Item name={[field.name, 'name']} noStyle>
            <Input 
              placeholder={t('containerConfig.containerName')} 
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
          {t('containerConfig.delete')}
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
            label: t('containerConfig.basicInfo'),
            children: (
              <>
                <Row gutter={16}>
                  <Col span={12}>
                    <Form.Item
                      name={[field.name, 'name']}
                      label={t('containerConfig.containerName')}
                      rules={[
                        { required: true, message: t('containerConfig.containerNameRequired') },
                        {
                          pattern: /^[a-z0-9]([-a-z0-9]*[a-z0-9])?$/,
                          message: t('containerConfig.namePattern'),
                        },
                      ]}
                    >
                      <Input placeholder={t('containerConfig.containerNamePlaceholder')} />
                    </Form.Item>
                  </Col>
                  <Col span={12}>
                    <Form.Item
                      name={[field.name, 'image']}
                      label={t('containerConfig.image')}
                      rules={[{ required: true, message: t('containerConfig.imageRequired') }]}
                    >
                      <Input placeholder={t('containerConfig.imagePlaceholder')} />
                    </Form.Item>
                  </Col>
                </Row>
                
                <Row gutter={16}>
                  <Col span={8}>
                    <Form.Item name={[field.name, 'imagePullPolicy']} label={t('containerConfig.imagePullPolicy')}>
                      <Select placeholder={t('containerConfig.selectPullPolicy')}>
                        <Option value="IfNotPresent">{t('containerConfig.ifNotPresent')}</Option>
                        <Option value="Always">{t('containerConfig.always')}</Option>
                        <Option value="Never">{t('containerConfig.never')}</Option>
                      </Select>
                    </Form.Item>
                  </Col>
                </Row>
                
                <Divider orientation="left" plain>
                  <Text type="secondary">{t('containerConfig.resourceConfig')}</Text>
                </Divider>
                
                <Row gutter={16}>
                  <Col span={12}>
                    <Card size="small" title={t('containerConfig.requests')}>
                      <Row gutter={8}>
                        <Col span={8}>
                          <Form.Item name={[field.name, 'resources', 'requests', 'cpu']} label="CPU">
                            <Input placeholder={t('containerConfig.cpuPlaceholder')} />
                          </Form.Item>
                        </Col>
                        <Col span={8}>
                          <Form.Item name={[field.name, 'resources', 'requests', 'memory']} label={t('containerConfig.memory')}>
                            <Input placeholder={t('containerConfig.memoryPlaceholder')} />
                          </Form.Item>
                        </Col>
                        <Col span={8}>
                          <Form.Item name={[field.name, 'resources', 'requests', 'ephemeral-storage']} label={t('containerConfig.ephemeralStorage')}>
                            <Input placeholder={t('containerConfig.ephemeralStoragePlaceholder')} />
                          </Form.Item>
                        </Col>
                      </Row>
                    </Card>
                  </Col>
                  <Col span={12}>
                    <Card size="small" title={t('containerConfig.limits')}>
                      <Row gutter={8}>
                        <Col span={8}>
                          <Form.Item name={[field.name, 'resources', 'limits', 'cpu']} label="CPU">
                            <Input placeholder={t('containerConfig.cpuLimitPlaceholder')} />
                          </Form.Item>
                        </Col>
                        <Col span={8}>
                          <Form.Item name={[field.name, 'resources', 'limits', 'memory']} label={t('containerConfig.memory')}>
                            <Input placeholder={t('containerConfig.memoryLimitPlaceholder')} />
                          </Form.Item>
                        </Col>
                        <Col span={8}>
                          <Form.Item name={[field.name, 'resources', 'limits', 'ephemeral-storage']} label={t('containerConfig.ephemeralStorage')}>
                            <Input placeholder={t('containerConfig.ephemeralStorageLimitPlaceholder')} />
                          </Form.Item>
                        </Col>
                      </Row>
                    </Card>
                  </Col>
                </Row>
                
                <Divider orientation="left" plain>
                  <Text type="secondary">{t('containerConfig.portConfig')}</Text>
                </Divider>
                
                <Form.List name={[field.name, 'ports']}>
                  {(portFields, { add: addPort, remove: removePort }) => (
                    <>
                      {portFields.map((portField) => (
                        <Row key={portField.key} gutter={16} style={{ marginBottom: 8 }}>
                          <Col span={8}>
                            <Form.Item name={[portField.name, 'name']} noStyle>
                              <Input placeholder={t('containerConfig.portNamePlaceholder')} />
                            </Form.Item>
                          </Col>
                          <Col span={8}>
                            <Form.Item
                              name={[portField.name, 'containerPort']}
                              noStyle
                              rules={[{ required: true, message: t('containerConfig.portRequired') }]}
                            >
                              <InputNumber
                                min={1}
                                max={65535}
                                placeholder={t('containerConfig.containerPort')}
                                style={{ width: '100%' }}
                              />
                            </Form.Item>
                          </Col>
                          <Col span={6}>
                            <Form.Item name={[portField.name, 'protocol']} noStyle>
                              <Select placeholder={t('containerConfig.protocol')} defaultValue="TCP">
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
                        {t('containerConfig.addPort')}
                      </Button>
                    </>
                  )}
                </Form.List>
              </>
            ),
          },
          {
            key: 'lifecycle',
            label: t('containerConfig.lifecycle'),
            children: (
              <>
                <Card size="small" title={t('containerConfig.startupCommand')} style={{ marginBottom: 16 }}>
                  <Form.Item name={[field.name, 'command']} label={t('containerConfig.commandLabel')}>
                    <TextArea
                      placeholder="/bin/sh&#10;-c"
                      rows={2}
                    />
                  </Form.Item>
                  <Form.Item name={[field.name, 'args']} label={t('containerConfig.argsLabel')}>
                    <TextArea
                      placeholder="arg1&#10;arg2"
                      rows={2}
                    />
                  </Form.Item>
                  <Form.Item name={[field.name, 'workingDir']} label={t('containerConfig.workingDir')}>
                    <Input placeholder="/app" />
                  </Form.Item>
                </Card>
                
                <Card size="small" title={t('containerConfig.postStart')} style={{ marginBottom: 16 }}>
                  <Form.Item name={[field.name, 'lifecycle', 'postStart', 'exec', 'command']} label={t('containerConfig.execCommand')}>
                    <TextArea
                      placeholder="/bin/sh&#10;-c&#10;echo Hello"
                      rows={2}
                    />
                  </Form.Item>
                </Card>
                
                <Card size="small" title={t('containerConfig.preStop')}>
                  <Form.Item name={[field.name, 'lifecycle', 'preStop', 'exec', 'command']} label={t('containerConfig.execCommand')}>
                    <TextArea
                      placeholder="/bin/sh&#10;-c&#10;sleep 10"
                      rows={2}
                    />
                  </Form.Item>
                </Card>
              </>
            ),
          },
          {
            key: 'healthCheck',
            label: t('containerConfig.healthCheck'),
            children: (
              <>
                <ProbeConfigForm
                  namePrefix={[field.name, 'startupProbe']}
                  containerType={isInitContainer ? 'initContainers' : 'containers'}
                  label={t('containerConfig.startupProbe')}
                />
                <ProbeConfigForm
                  namePrefix={[field.name, 'livenessProbe']}
                  containerType={isInitContainer ? 'initContainers' : 'containers'}
                  label={t('containerConfig.livenessProbe')}
                />
                <ProbeConfigForm
                  namePrefix={[field.name, 'readinessProbe']}
                  containerType={isInitContainer ? 'initContainers' : 'containers'}
                  label={t('containerConfig.readinessProbe')}
                />
              </>
            ),
          },
          {
            key: 'env',
            label: t('containerConfig.envVars'),
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
                              label={t('containerConfig.varName')}
                              rules={[{ required: true, message: t('containerConfig.varNameRequired') }]}
                            >
                              <Input placeholder="MY_ENV_VAR" />
                            </Form.Item>
                          </Col>
                          <Col span={6}>
                            <Form.Item name={[envField.name, 'valueType']} label={t('containerConfig.varType')} initialValue="value">
                              <Select style={{ width: '100%' }}>
                                <Select.Option value="value">{t('containerConfig.directInput')}</Select.Option>
                                <Select.Option value="configMapKeyRef">{t('containerConfig.configMapRef')}</Select.Option>
                                <Select.Option value="secretKeyRef">{t('containerConfig.secretRef')}</Select.Option>
                                <Select.Option value="fieldRef">{t('containerConfig.podFieldRef')}</Select.Option>
                              </Select>
                            </Form.Item>
                          </Col>
                          <Col span={10}>
                            <Form.Item noStyle shouldUpdate>
                              {({ getFieldValue }) => {
                                const valueType = getFieldValue([field.name, 'env', envField.name, 'valueType']) || 'value';
                                
                                if (valueType === 'value') {
                                  return (
                                    <Form.Item name={[envField.name, 'value']} label={t('containerConfig.valueLabel')}>
                                      <Input />
                                    </Form.Item>
                                  );
                                }
                                if (valueType === 'configMapKeyRef') {
                                  return (
                                    <Row gutter={8}>
                                      <Col span={12}>
                                        <Form.Item name={[envField.name, 'valueFrom', 'configMapKeyRef', 'name']} label={t('containerConfig.configMapLabel')}>
                                          <Input placeholder={t('containerConfig.nameLabel')} />
                                        </Form.Item>
                                      </Col>
                                      <Col span={12}>
                                        <Form.Item name={[envField.name, 'valueFrom', 'configMapKeyRef', 'key']} label={t('containerConfig.keyLabel')}>
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
                                        <Form.Item name={[envField.name, 'valueFrom', 'secretKeyRef', 'name']} label={t('containerConfig.secretLabel')}>
                                          <Input placeholder={t('containerConfig.nameLabel')} />
                                        </Form.Item>
                                      </Col>
                                      <Col span={12}>
                                        <Form.Item name={[envField.name, 'valueFrom', 'secretKeyRef', 'key']} label={t('containerConfig.keyLabel')}>
                                          <Input placeholder="Key" />
                                        </Form.Item>
                                      </Col>
                                    </Row>
                                  );
                                }
                                if (valueType === 'fieldRef') {
                                  return (
                                    <Form.Item name={[envField.name, 'valueFrom', 'fieldRef', 'fieldPath']} label={t('containerConfig.fieldLabel')}>
                                      <Select placeholder={t('containerConfig.selectField')}>
                                        <Select.Option value="metadata.name">{t('containerConfig.podName')}</Select.Option>
                                        <Select.Option value="metadata.namespace">{t('containerConfig.namespaceName')}</Select.Option>
                                        <Select.Option value="spec.nodeName">{t('containerConfig.nodeName')}</Select.Option>
                                        <Select.Option value="status.podIP">{t('containerConfig.podIP')}</Select.Option>
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
                      {t('containerConfig.addEnvVar')}
                    </Button>
                  </>
                )}
              </Form.List>
            ),
          },
          {
            key: 'volumeMounts',
            label: t('containerConfig.storage'),
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
                              label={t('containerConfig.volumeName')}
                              rules={[{ required: true, message: t('containerConfig.volumeRequired') }]}
                            >
                              <Input placeholder={t('containerConfig.volumePlaceholder')} />
                            </Form.Item>
                          </Col>
                          <Col span={8}>
                            <Form.Item
                              name={[mountField.name, 'mountPath']}
                              label={t('containerConfig.mountPath')}
                              rules={[{ required: true, message: t('containerConfig.mountPathRequired') }]}
                            >
                              <Input placeholder="/data" />
                            </Form.Item>
                          </Col>
                          <Col span={6}>
                            <Form.Item
                              name={[mountField.name, 'subPath']}
                              label={t('containerConfig.subPath')}
                            >
                              <Input />
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
                              <Switch checkedChildren={t('containerConfig.readOnly')} unCheckedChildren={t('containerConfig.readWrite')} />
                            </Form.Item>
                          </Col>
                        </Row>
                      </Card>
                    ))}
                    <Button type="dashed" onClick={() => addMount()} icon={<PlusOutlined />}>
                      {t('containerConfig.addMount')}
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

