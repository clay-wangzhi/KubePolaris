/** genAI_main_start */
import React from 'react';
import {
  Form,
  Input,
  InputNumber,
  Select,
  Switch,
  Button,
  Space,
  Row,
  Col,
  Card,
  Tabs,
  Collapse,
  Radio,
  Divider,
} from 'antd';
import { PlusOutlined, MinusCircleOutlined } from '@ant-design/icons';

const { Option } = Select;
const { TextArea } = Input;
const { Panel } = Collapse;

export interface WorkloadFormData {
  name: string;
  namespace: string;
  replicas?: number;
  description?: string;
  image: string;
  containerName: string;
  containerPort?: number;
  imagePullPolicy?: 'Always' | 'IfNotPresent' | 'Never';
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
  // 生命周期
  lifecycle?: {
    postStart?: {
      exec?: { command: string[] };
      httpGet?: {
        path: string;
        port: number;
        host?: string;
        scheme?: string;
      };
    };
    preStop?: {
      exec?: { command: string[] };
      httpGet?: {
        path: string;
        port: number;
        host?: string;
        scheme?: string;
      };
    };
  };
  // 健康检查
  livenessProbe?: {
    httpGet?: { path: string; port: number; scheme?: string };
    exec?: { command: string[] };
    tcpSocket?: { port: number };
    initialDelaySeconds?: number;
    periodSeconds?: number;
    timeoutSeconds?: number;
    successThreshold?: number;
    failureThreshold?: number;
  };
  readinessProbe?: {
    httpGet?: { path: string; port: number; scheme?: string };
    exec?: { command: string[] };
    tcpSocket?: { port: number };
    initialDelaySeconds?: number;
    periodSeconds?: number;
    timeoutSeconds?: number;
    successThreshold?: number;
    failureThreshold?: number;
  };
  startupProbe?: {
    httpGet?: { path: string; port: number; scheme?: string };
    exec?: { command: string[] };
    tcpSocket?: { port: number };
    initialDelaySeconds?: number;
    periodSeconds?: number;
    timeoutSeconds?: number;
    successThreshold?: number;
    failureThreshold?: number;
  };
  // 数据存储
  volumes?: Array<{
    name: string;
    type: 'emptyDir' | 'hostPath' | 'configMap' | 'secret' | 'persistentVolumeClaim';
    mountPath: string;
    subPath?: string;
    readOnly?: boolean;
    configMapName?: string;
    secretName?: string;
    pvcName?: string;
    hostPath?: string;
  }>;
  // 安全设置
  securityContext?: {
    privileged?: boolean;
    runAsUser?: number;
    runAsGroup?: number;
    runAsNonRoot?: boolean;
    readOnlyRootFilesystem?: boolean;
    allowPrivilegeEscalation?: boolean;
    capabilities?: {
      add?: string[];
      drop?: string[];
    };
  };
  // 镜像访问凭证
  imagePullSecrets?: string[];
  // 升级策略
  strategy?: {
    type: 'RollingUpdate' | 'Recreate';
    rollingUpdate?: {
      maxUnavailable?: string;
      maxSurge?: string;
      minReadySeconds?: number;
      revisionHistoryLimit?: number;
      progressDeadlineSeconds?: number;
    };
  };
  terminationGracePeriodSeconds?: number;
  // 调度策略
  nodeSelector?: Record<string, string>;
  nodeSelectorList?: Array<{ key: string; value: string }>;
  affinity?: {
    nodeAffinity?: Record<string, unknown>;
    podAffinity?: Record<string, unknown>;
    podAntiAffinity?: Record<string, unknown>;
  };
  // 容忍策略
  tolerations?: Array<{
    key: string;
    operator: 'Equal' | 'Exists';
    value?: string;
    effect: 'NoSchedule' | 'PreferNoSchedule' | 'NoExecute';
    tolerationSeconds?: number;
  }>;
  // DNS配置
  dnsPolicy?: 'ClusterFirst' | 'ClusterFirstWithHostNet' | 'Default' | 'None';
  dnsConfig?: {
    nameservers?: string[];
    searches?: string[];
    options?: Array<{ name: string; value?: string }>;
  };
  labels?: Array<{ key: string; value: string }>;
  annotations?: Array<{ key: string; value: string }>;
  // StatefulSet specific
  serviceName?: string;
  // CronJob specific
  schedule?: string;
  suspend?: boolean;
  // Job specific
  completions?: number;
  parallelism?: number;
  backoffLimit?: number;
}

interface WorkloadFormProps {
  workloadType: 'Deployment' | 'StatefulSet' | 'DaemonSet' | 'Rollout' | 'Job' | 'CronJob';
  initialData?: Partial<WorkloadFormData>;
  namespaces: string[];
  onValuesChange?: (values: Partial<WorkloadFormData>) => void;
  form?: ReturnType<typeof Form.useForm>[0];
}

const WorkloadForm: React.FC<WorkloadFormProps> = ({
  workloadType,
  initialData,
  namespaces,
  onValuesChange,
  form: externalForm,
}) => {
  const [form] = Form.useForm(externalForm);

  // 设置初始值
  React.useEffect(() => {
    if (initialData) {
      form.setFieldsValue(initialData);
    } else {
      // 设置默认值
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
  }, [initialData, form, workloadType]);

  return (
    <Form
      form={form}
      layout="vertical"
      onValuesChange={onValuesChange}
    >
      {/* 基本信息 */}
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
              <Input placeholder="请输入名称" />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item
              name="namespace"
              label="命名空间"
              rules={[{ required: true, message: '请选择命名空间' }]}
            >
              <Select placeholder="请选择命名空间" showSearch>
                {namespaces.map((ns) => (
                  <Option key={ns} value={ns}>
                    {ns}
                  </Option>
                ))}
              </Select>
            </Form.Item>
          </Col>
        </Row>

        <Row gutter={16}>
          <Col span={24}>
            <Form.Item name="description" label="描述">
              <TextArea 
                rows={2} 
                placeholder="支持200个字符" 
                maxLength={200}
                showCount
              />
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

      {/* 容器配置 */}
      <Card title="容器配置" style={{ marginBottom: 16 }}>
        <Tabs
          defaultActiveKey="basic"
          items={[
            {
              key: 'basic',
              label: '基本信息',
              children: (
                <>
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
                        label="镜像名称"
              rules={[{ required: true, message: '请输入镜像地址' }]}
            >
              <Input placeholder="例如: nginx:latest" />
            </Form.Item>
          </Col>
        </Row>
        <Row gutter={16}>
                    <Col span={12}>
                      <Form.Item name="imagePullPolicy" label="更新策略">
                        <Select defaultValue="IfNotPresent">
                          <Option value="Always">总是拉取镜像</Option>
                          <Option value="IfNotPresent">按需拉取镜像</Option>
                          <Option value="Never">使用本地镜像</Option>
                        </Select>
                      </Form.Item>
                    </Col>
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
                </>
              ),
            },
            {
              key: 'lifecycle',
              label: '生命周期',
              children: (
                <>
                  <Form.Item label="启动后执行 (PostStart)">
                    <Form.Item name={['lifecycle', 'postStart', 'exec', 'command']} label="执行命令">
                      <Input placeholder="例如: /bin/sh,-c,echo hello" />
                      <div style={{ color: '#999', fontSize: '12px', marginTop: 4 }}>
                        使用逗号分隔命令和参数
                      </div>
                    </Form.Item>
                  </Form.Item>
                  <Form.Item label="停止前执行 (PreStop)">
                    <Form.Item name={['lifecycle', 'preStop', 'exec', 'command']} label="执行命令">
                      <Input placeholder="例如: /bin/sh,-c,sleep 10" />
                      <div style={{ color: '#999', fontSize: '12px', marginTop: 4 }}>
                        使用逗号分隔命令和参数
                      </div>
                    </Form.Item>
                  </Form.Item>
                </>
              ),
            },
            {
              key: 'health',
              label: '健康检查',
              children: (
                <>
                  <Card size="small" title="存活探针 (Liveness Probe)" style={{ marginBottom: 16 }}>
                    <Form.Item name={['livenessProbe', 'httpGet', 'path']} label="HTTP路径">
                      <Input placeholder="/health" />
                    </Form.Item>
                    <Row gutter={16}>
                      <Col span={12}>
                        <Form.Item name={['livenessProbe', 'httpGet', 'port']} label="端口">
                          <InputNumber min={1} max={65535} style={{ width: '100%' }} />
                        </Form.Item>
                      </Col>
                      <Col span={12}>
                        <Form.Item name={['livenessProbe', 'initialDelaySeconds']} label="初始延迟(秒)">
                          <InputNumber min={0} style={{ width: '100%' }} />
                        </Form.Item>
                      </Col>
                    </Row>
                    <Row gutter={16}>
                      <Col span={12}>
                        <Form.Item name={['livenessProbe', 'periodSeconds']} label="检查周期(秒)">
                          <InputNumber min={1} style={{ width: '100%' }} />
                        </Form.Item>
                      </Col>
                      <Col span={12}>
                        <Form.Item name={['livenessProbe', 'failureThreshold']} label="失败阈值">
                          <InputNumber min={1} style={{ width: '100%' }} />
                        </Form.Item>
                      </Col>
                    </Row>
                  </Card>
                  <Card size="small" title="就绪探针 (Readiness Probe)" style={{ marginBottom: 16 }}>
                    <Form.Item name={['readinessProbe', 'httpGet', 'path']} label="HTTP路径">
                      <Input placeholder="/ready" />
                    </Form.Item>
                    <Row gutter={16}>
                      <Col span={12}>
                        <Form.Item name={['readinessProbe', 'httpGet', 'port']} label="端口">
                          <InputNumber min={1} max={65535} style={{ width: '100%' }} />
                        </Form.Item>
                      </Col>
                      <Col span={12}>
                        <Form.Item name={['readinessProbe', 'initialDelaySeconds']} label="初始延迟(秒)">
                          <InputNumber min={0} style={{ width: '100%' }} />
                        </Form.Item>
                      </Col>
                    </Row>
                    <Row gutter={16}>
                      <Col span={12}>
                        <Form.Item name={['readinessProbe', 'periodSeconds']} label="检查周期(秒)">
                          <InputNumber min={1} style={{ width: '100%' }} />
                        </Form.Item>
                      </Col>
                      <Col span={12}>
                        <Form.Item name={['readinessProbe', 'failureThreshold']} label="失败阈值">
                          <InputNumber min={1} style={{ width: '100%' }} />
                        </Form.Item>
                      </Col>
                    </Row>
                  </Card>
                </>
              ),
            },
            {
              key: 'env',
              label: '环境变量',
              children: (
        <Form.Item label="环境变量">
          <Form.List name="env">
            {(fields, { add, remove }) => (
              <>
                {fields.map((field) => (
                  <Space key={field.key} style={{ display: 'flex', marginBottom: 8 }} align="baseline">
                    <Form.Item
                      {...field}
                      name={[field.name, 'name']}
                      rules={[{ required: true, message: '请输入变量名' }]}
                      style={{ marginBottom: 0 }}
                    >
                      <Input placeholder="变量名" style={{ width: 200 }} />
                    </Form.Item>
                    <Form.Item
                      {...field}
                      name={[field.name, 'value']}
                      rules={[{ required: true, message: '请输入变量值' }]}
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
              ),
            },
            {
              key: 'storage',
              label: '数据存储',
              children: (
                <Form.Item label="数据卷">
                  <Form.List name="volumes">
                    {(fields, { add, remove }) => (
                      <>
                        {fields.map((field) => (
                          <Card key={field.key} size="small" style={{ marginBottom: 16 }}>
                            <Row gutter={16}>
                              <Col span={8}>
                                <Form.Item
                                  {...field}
                                  name={[field.name, 'name']}
                                  label="卷名称"
                                  rules={[{ required: true, message: '请输入卷名称' }]}
                                >
                                  <Input placeholder="卷名称" />
                                </Form.Item>
                              </Col>
                              <Col span={8}>
                                <Form.Item
                                  {...field}
                                  name={[field.name, 'type']}
                                  label="类型"
                                  rules={[{ required: true, message: '请选择类型' }]}
                                >
                                  <Select placeholder="选择类型">
                                    <Option value="emptyDir">EmptyDir</Option>
                                    <Option value="hostPath">HostPath</Option>
                                    <Option value="configMap">ConfigMap</Option>
                                    <Option value="secret">Secret</Option>
                                    <Option value="persistentVolumeClaim">PVC</Option>
                                  </Select>
                                </Form.Item>
                              </Col>
                              <Col span={8}>
                                <Form.Item
                                  {...field}
                                  name={[field.name, 'mountPath']}
                                  label="挂载路径"
                                  rules={[{ required: true, message: '请输入挂载路径' }]}
                                >
                                  <Input placeholder="/data" />
                                </Form.Item>
                              </Col>
                            </Row>
                            <Row gutter={16}>
                              <Col span={8}>
                                <Form.Item {...field} name={[field.name, 'readOnly']} valuePropName="checked">
                                  <Switch /> 只读
                                </Form.Item>
                              </Col>
                              <Col span={16} style={{ textAlign: 'right' }}>
                                <Button type="link" danger onClick={() => remove(field.name)}>
                                  删除
                                </Button>
                              </Col>
                            </Row>
                          </Card>
                        ))}
                        <Button type="dashed" onClick={() => add()} icon={<PlusOutlined />} block>
                          添加数据卷
                        </Button>
                      </>
                    )}
                  </Form.List>
                </Form.Item>
              ),
            },
            {
              key: 'security',
              label: '安全设置',
              children: (
                <>
                  <Row gutter={16}>
                    <Col span={12}>
                      <Form.Item name={['securityContext', 'runAsUser']} label="运行用户ID">
                        <InputNumber min={0} style={{ width: '100%' }} placeholder="例如: 1000" />
                      </Form.Item>
                    </Col>
                    <Col span={12}>
                      <Form.Item name={['securityContext', 'runAsGroup']} label="运行组ID">
                        <InputNumber min={0} style={{ width: '100%' }} placeholder="例如: 1000" />
                      </Form.Item>
                    </Col>
                  </Row>
                  <Row gutter={16}>
                    <Col span={12}>
                      <Form.Item name={['securityContext', 'runAsNonRoot']} valuePropName="checked">
                        <Switch /> 非root用户运行
                      </Form.Item>
                    </Col>
                    <Col span={12}>
                      <Form.Item name={['securityContext', 'readOnlyRootFilesystem']} valuePropName="checked">
                        <Switch /> 只读根文件系统
                      </Form.Item>
                    </Col>
                  </Row>
                  <Form.Item name={['securityContext', 'allowPrivilegeEscalation']} valuePropName="checked">
                    <Switch /> 允许权限提升
                  </Form.Item>
                </>
              ),
            },
            {
              key: 'imageSecret',
              label: '镜像访问凭证',
              children: (
                <Form.Item label="镜像拉取密钥">
                  <Form.List name="imagePullSecrets">
                    {(fields, { add, remove }) => (
                      <>
                        {fields.map((field) => (
                          <Space key={field.key} style={{ display: 'flex', marginBottom: 8 }} align="baseline">
                            <Form.Item
                              {...field}
                              rules={[{ required: true, message: '请输入密钥名称' }]}
                              style={{ marginBottom: 0 }}
                            >
                              <Input placeholder="密钥名称" style={{ width: 300 }} />
                            </Form.Item>
                            <MinusCircleOutlined onClick={() => remove(field.name)} />
                          </Space>
                        ))}
                        <Button type="dashed" onClick={() => add()} icon={<PlusOutlined />}>
                          添加密钥
                        </Button>
                      </>
                    )}
                  </Form.List>
                </Form.Item>
              ),
            },
          ]}
        />
      </Card>

      {/* 资源配置 */}
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

      {/* 高级配置 */}
      <Card title="高级配置" style={{ marginBottom: 16 }}>
        <Collapse defaultActiveKey={[]}>
          <Panel header="升级策略" key="strategy">
            <Form.Item name={['strategy', 'type']} label="升级方式" initialValue="RollingUpdate">
              <Radio.Group>
                <Radio value="RollingUpdate">滚动升级</Radio>
                <Radio value="Recreate">替换升级</Radio>
              </Radio.Group>
            </Form.Item>
            <div style={{ color: '#999', fontSize: '12px', marginBottom: 16 }}>
              逐步用新版本实例替换旧版本实例。升级过程中，业务会同时均衡分布到新老实例上，因此业务不会中断。
            </div>
            <Row gutter={16}>
              <Col span={12}>
                <Form.Item name={['strategy', 'rollingUpdate', 'maxUnavailable']} label="最大无效实例数">
                  <InputNumber
                    min={0}
                    max={100}
                    style={{ width: '100%' }}
                    addonAfter="%"
                    placeholder="25"
                  />
                  <div style={{ color: '#999', fontSize: '12px', marginTop: 4 }}>
                    每次滚动升级允许的最大无效实例数
                  </div>
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item name={['strategy', 'rollingUpdate', 'maxSurge']} label="最大浪涌">
                  <InputNumber
                    min={0}
                    max={100}
                    style={{ width: '100%' }}
                    addonAfter="%"
                    placeholder="25"
                  />
                  <div style={{ color: '#999', fontSize: '12px', marginTop: 4 }}>
                    每次滚动升级允许超出所需规模的最大实例数
                  </div>
                </Form.Item>
              </Col>
            </Row>
            <Row gutter={16}>
              <Col span={12}>
                <Form.Item name={['strategy', 'rollingUpdate', 'minReadySeconds']} label="实例可用最短时间(秒)">
                  <InputNumber min={0} style={{ width: '100%' }} placeholder="0" />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item name={['strategy', 'rollingUpdate', 'revisionHistoryLimit']} label="最大保留版本数">
                  <InputNumber min={0} style={{ width: '100%' }} placeholder="10" />
                </Form.Item>
              </Col>
            </Row>
            <Row gutter={16}>
              <Col span={12}>
                <Form.Item name={['strategy', 'rollingUpdate', 'progressDeadlineSeconds']} label="升级最大时长(秒)">
                  <InputNumber min={0} style={{ width: '100%' }} placeholder="600" />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item name="terminationGracePeriodSeconds" label="缩容时间窗(秒)">
                  <InputNumber min={0} max={9999} style={{ width: '100%' }} placeholder="30" />
                  <div style={{ color: '#999', fontSize: '12px', marginTop: 4 }}>
                    工作负载停止前命令的执行时间窗
                  </div>
                </Form.Item>
              </Col>
            </Row>
          </Panel>

          <Panel header="调度策略" key="scheduling">
            <Form.Item label="节点选择器">
              <Form.List name="nodeSelectorList">
                {(fields, { add, remove }) => (
                  <>
                    {fields.map((field) => (
                      <Space key={field.key} style={{ display: 'flex', marginBottom: 8 }} align="baseline">
                        <Form.Item
                          {...field}
                          name={[field.name, 'key']}
                          rules={[{ required: true, message: '请输入键' }]}
                          style={{ marginBottom: 0 }}
                        >
                          <Input placeholder="键" style={{ width: 200 }} />
                        </Form.Item>
                        <Form.Item
                          {...field}
                          name={[field.name, 'value']}
                          rules={[{ required: true, message: '请输入值' }]}
                          style={{ marginBottom: 0 }}
                        >
                          <Input placeholder="值" style={{ width: 200 }} />
                        </Form.Item>
                        <MinusCircleOutlined onClick={() => remove(field.name)} />
                      </Space>
                    ))}
                    <Button type="dashed" onClick={() => add()} icon={<PlusOutlined />}>
                      添加节点选择器
                    </Button>
                  </>
                )}
              </Form.List>
            </Form.Item>
          </Panel>

          <Panel header="容忍策略" key="tolerations">
            <Form.Item label="容忍度">
              <Form.List name="tolerations">
                {(fields, { add, remove }) => (
                  <>
                    {fields.map((field) => (
                      <Card key={field.key} size="small" style={{ marginBottom: 16 }}>
                        <Row gutter={16}>
                          <Col span={8}>
                            <Form.Item
                              {...field}
                              name={[field.name, 'key']}
                              label="键"
                              rules={[{ required: true, message: '请输入键' }]}
                            >
                              <Input placeholder="例如: node-role.kubernetes.io/master" />
                            </Form.Item>
                          </Col>
                          <Col span={8}>
                            <Form.Item
                              {...field}
                              name={[field.name, 'operator']}
                              label="操作符"
                              rules={[{ required: true, message: '请选择操作符' }]}
                            >
                              <Select>
                                <Option value="Equal">Equal</Option>
                                <Option value="Exists">Exists</Option>
                              </Select>
                            </Form.Item>
                          </Col>
                          <Col span={8}>
                            <Form.Item
                              {...field}
                              name={[field.name, 'effect']}
                              label="效果"
                              rules={[{ required: true, message: '请选择效果' }]}
                            >
                              <Select>
                                <Option value="NoSchedule">NoSchedule</Option>
                                <Option value="PreferNoSchedule">PreferNoSchedule</Option>
                                <Option value="NoExecute">NoExecute</Option>
                              </Select>
                            </Form.Item>
                          </Col>
                        </Row>
                        <Row gutter={16}>
                          <Col span={12}>
                            <Form.Item {...field} name={[field.name, 'value']} label="值">
                              <Input placeholder="值（operator为Equal时必填）" />
                            </Form.Item>
                          </Col>
                          <Col span={12} style={{ textAlign: 'right', paddingTop: 30 }}>
                            <Button type="link" danger onClick={() => remove(field.name)}>
                              删除
                            </Button>
                          </Col>
                        </Row>
                      </Card>
                    ))}
                    <Button type="dashed" onClick={() => add()} icon={<PlusOutlined />} block>
                      添加容忍度
                    </Button>
                  </>
                )}
              </Form.List>
            </Form.Item>
          </Panel>

          <Panel header="标签与注解" key="labels">
            <Form.Item label="标签 (Labels)">
              <Form.List name="labels">
                {(fields, { add, remove }) => (
                  <>
                    {fields.map((field) => (
                      <Space key={field.key} style={{ display: 'flex', marginBottom: 8 }} align="baseline">
                        <Form.Item
                          {...field}
                          name={[field.name, 'key']}
                          rules={[{ required: true, message: '请输入标签键' }]}
                          style={{ marginBottom: 0 }}
                        >
                          <Input placeholder="标签键" style={{ width: 200 }} />
                        </Form.Item>
                        <Form.Item
                          {...field}
                          name={[field.name, 'value']}
                          rules={[{ required: true, message: '请输入标签值' }]}
                          style={{ marginBottom: 0 }}
                        >
                          <Input placeholder="标签值" style={{ width: 300 }} />
                        </Form.Item>
                        <MinusCircleOutlined onClick={() => remove(field.name)} />
                      </Space>
                    ))}
                    <Button type="dashed" onClick={() => add()} icon={<PlusOutlined />}>
                      添加标签
                    </Button>
                  </>
                )}
              </Form.List>
            </Form.Item>

            <Divider />

            <Form.Item label="注解 (Annotations)">
              <Form.List name="annotations">
                {(fields, { add, remove }) => (
                  <>
                    {fields.map((field) => (
                      <Space key={field.key} style={{ display: 'flex', marginBottom: 8 }} align="baseline">
                        <Form.Item
                          {...field}
                          name={[field.name, 'key']}
                          rules={[{ required: true, message: '请输入注解键' }]}
                          style={{ marginBottom: 0 }}
                        >
                          <Input placeholder="注解键" style={{ width: 200 }} />
                        </Form.Item>
                        <Form.Item
                          {...field}
                          name={[field.name, 'value']}
                          rules={[{ required: true, message: '请输入注解值' }]}
                          style={{ marginBottom: 0 }}
                        >
                          <Input placeholder="注解值" style={{ width: 300 }} />
                        </Form.Item>
                        <MinusCircleOutlined onClick={() => remove(field.name)} />
                      </Space>
                    ))}
                    <Button type="dashed" onClick={() => add()} icon={<PlusOutlined />}>
                      添加注解
                    </Button>
                  </>
                )}
              </Form.List>
            </Form.Item>
          </Panel>

          <Panel header="DNS配置" key="dns">
            <Form.Item name="dnsPolicy" label="DNS策略" initialValue="ClusterFirst">
              <Select>
                <Option value="ClusterFirst">ClusterFirst</Option>
                <Option value="ClusterFirstWithHostNet">ClusterFirstWithHostNet</Option>
                <Option value="Default">Default</Option>
                <Option value="None">None</Option>
              </Select>
            </Form.Item>
            <Form.Item label="DNS服务器">
              <Form.List name={['dnsConfig', 'nameservers']}>
                {(fields, { add, remove }) => (
                  <>
                    {fields.map((field) => (
                      <Space key={field.key} style={{ display: 'flex', marginBottom: 8 }} align="baseline">
                        <Form.Item
                          {...field}
                          rules={[{ required: true, message: '请输入DNS服务器地址' }]}
                          style={{ marginBottom: 0 }}
                        >
                          <Input placeholder="例如: 8.8.8.8" style={{ width: 300 }} />
                        </Form.Item>
                        <MinusCircleOutlined onClick={() => remove(field.name)} />
                      </Space>
                    ))}
                    <Button type="dashed" onClick={() => add()} icon={<PlusOutlined />}>
                      添加DNS服务器
                    </Button>
                  </>
                )}
              </Form.List>
            </Form.Item>
            <Form.Item label="DNS搜索域">
              <Form.List name={['dnsConfig', 'searches']}>
                {(fields, { add, remove }) => (
                  <>
                    {fields.map((field) => (
                      <Space key={field.key} style={{ display: 'flex', marginBottom: 8 }} align="baseline">
                        <Form.Item
                          {...field}
                          rules={[{ required: true, message: '请输入搜索域' }]}
                          style={{ marginBottom: 0 }}
                        >
                          <Input placeholder="例如: default.svc.cluster.local" style={{ width: 300 }} />
                        </Form.Item>
                        <MinusCircleOutlined onClick={() => remove(field.name)} />
                      </Space>
                    ))}
                    <Button type="dashed" onClick={() => add()} icon={<PlusOutlined />}>
                      添加搜索域
                    </Button>
                  </>
                )}
              </Form.List>
            </Form.Item>
          </Panel>
        </Collapse>
      </Card>
    </Form>
  );
};

export default WorkloadForm;
export type { WorkloadFormProps };
/** genAI_main_end */

