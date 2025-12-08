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
  Collapse,
  Divider,
  Typography,
  Alert,
  Tooltip,
} from 'antd';
import { PlusOutlined, MinusCircleOutlined, QuestionCircleOutlined } from '@ant-design/icons';
import ContainerConfigForm from './ContainerConfigForm';
import SchedulingConfigForm from './SchedulingConfigForm';
import type { WorkloadFormData } from '../../types/workload';

const { Option } = Select;
const { TextArea } = Input;
const { Panel } = Collapse;
const { Text } = Typography;

interface WorkloadFormV2Props {
  workloadType: 'Deployment' | 'StatefulSet' | 'DaemonSet' | 'Rollout' | 'Job' | 'CronJob';
  initialData?: Partial<WorkloadFormData>;
  namespaces: string[];
  // 镜像拉取凭证 secrets 列表
  imagePullSecretsList?: string[];
  onValuesChange?: (changedValues: Partial<WorkloadFormData>, allValues: WorkloadFormData) => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  form?: ReturnType<typeof Form.useForm<any>>[0];
  // 是否为编辑模式（编辑模式下某些字段不可修改）
  isEdit?: boolean;
}

const WorkloadFormV2: React.FC<WorkloadFormV2Props> = ({
  workloadType,
  initialData,
  namespaces,
  imagePullSecretsList = [],
  onValuesChange,
  form: externalForm,
  isEdit = false,
}) => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [form] = Form.useForm<WorkloadFormData>(externalForm as any);

  // 是否已初始化（用于区分首次渲染和编辑模式数据加载）
  const [initialized, setInitialized] = React.useState(false);
  
  /** genAI_main_start */
  // 设置初始值
  React.useEffect(() => {
    if (initialData) {
      // 编辑模式：使用传入的数据
      console.log('设置编辑模式数据:', initialData);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      form.setFieldsValue(initialData as any);
      setInitialized(true);
    } else if (!initialized) {
      // 创建模式：仅在首次渲染时设置默认值
      const defaultValues: Record<string, unknown> = {
        namespace: 'default',
        replicas: workloadType === 'DaemonSet' ? undefined : 1,
        containers: [
          {
            name: 'main',
            image: '',
            imagePullPolicy: 'IfNotPresent',
            resources: {
              requests: { cpu: '100m', memory: '128Mi' },
              limits: { cpu: '500m', memory: '512Mi' },
            },
          },
        ],
      };
      
      // 为 Rollout 类型设置默认发布策略
      if (workloadType === 'Rollout') {
        defaultValues.rolloutStrategy = {
          type: 'Canary',
          canary: {
            steps: [
              { setWeight: 20, pause: { duration: '10m' } },
              { setWeight: 50, pause: { duration: '10m' } },
              { setWeight: 80, pause: { duration: '10m' } },
            ],
          },
        };
      }
      
      form.setFieldsValue(defaultValues);
      setInitialized(true);
    }
  }, [initialData, form, workloadType, initialized]);
  /** genAI_main_end */

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
              tooltip={isEdit ? '资源名称创建后不可修改' : undefined}
            >
              <Input placeholder="请输入名称" disabled={isEdit} />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item
              name="namespace"
              label="命名空间"
              rules={[{ required: true, message: '请选择命名空间' }]}
              tooltip={isEdit ? '命名空间创建后不可修改' : undefined}
            >
              <Select placeholder="请选择命名空间" showSearch disabled={isEdit}>
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

        {workloadType !== 'DaemonSet' && workloadType !== 'Job' && workloadType !== 'CronJob' && (
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
                <Input placeholder="例如: 0 0 * * * (每天0点执行)" />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item name="suspend" label="暂停" valuePropName="checked">
                <Switch />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item name="concurrencyPolicy" label="并发策略">
                <Select defaultValue="Allow">
                  <Option value="Allow">Allow (允许并发)</Option>
                  <Option value="Forbid">Forbid (禁止并发)</Option>
                  <Option value="Replace">Replace (替换)</Option>
                </Select>
              </Form.Item>
            </Col>
          </Row>
        )}

        {workloadType === 'Job' && (
          <Row gutter={16}>
            <Col span={6}>
              <Form.Item name="completions" label="完成次数">
                <InputNumber min={1} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item name="parallelism" label="并行度">
                <InputNumber min={1} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item name="backoffLimit" label="重试次数">
                <InputNumber min={0} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item name="activeDeadlineSeconds" label="超时时间(秒)">
                <InputNumber min={1} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>
        )}
      </Card>

      {/* 容器配置 */}
      <Card 
        title={
          <Space>
            <span>容器配置</span>
            <Text type="secondary" style={{ fontSize: 12 }}>
              (支持多容器)
            </Text>
          </Space>
        }
        style={{ marginBottom: 16 }}
      >
        {/* 业务容器 */}
        <Form.List name="containers">
          {(fields, { add, remove }) => (
            <>
              {fields.map((field) => (
                <ContainerConfigForm
                  key={field.key}
                  field={field}
                  remove={remove}
                  isInitContainer={false}
                />
              ))}
              <Button
                type="dashed"
                onClick={() => add({
                  name: `container-${fields.length + 1}`,
                  image: '',
                  imagePullPolicy: 'IfNotPresent',
                })}
                icon={<PlusOutlined />}
                style={{ marginBottom: 16 }}
              >
                添加容器
              </Button>
            </>
          )}
        </Form.List>

        <Divider orientation="left">
          <Text type="secondary">Init 容器 (可选)</Text>
        </Divider>

        {/* Init容器 */}
        <Form.List name="initContainers">
          {(fields, { add, remove }) => (
            <>
              {fields.map((field) => (
                <ContainerConfigForm
                  key={field.key}
                  field={field}
                  remove={remove}
                  isInitContainer={true}
                />
              ))}
              <Button
                type="dashed"
                onClick={() => add({
                  name: `init-${fields.length + 1}`,
                  image: '',
                })}
                icon={<PlusOutlined />}
              >
                添加Init容器
              </Button>
            </>
          )}
        </Form.List>
      </Card>

      {/* 数据卷配置 */}
      <Card title="数据卷配置" style={{ marginBottom: 16 }}>
        <Form.List name="volumes">
          {(fields, { add, remove }) => (
            <>
              {fields.map((field) => (
                <Card key={field.key} size="small" style={{ marginBottom: 16 }}>
                  <Row gutter={16}>
                    <Col span={6}>
                      <Form.Item
                        name={[field.name, 'name']}
                        label="数据卷名称"
                        rules={[{ required: true, message: '请输入名称' }]}
                      >
                        <Input placeholder="volume-name" />
                      </Form.Item>
                    </Col>
                    <Col span={6}>
                      <Form.Item
                        name={[field.name, 'type']}
                        label="类型"
                        rules={[{ required: true, message: '请选择类型' }]}
                      >
                        <Select placeholder="选择类型">
                          <Option value="emptyDir">EmptyDir (临时目录)</Option>
                          <Option value="hostPath">HostPath (主机路径)</Option>
                          <Option value="configMap">ConfigMap</Option>
                          <Option value="secret">Secret</Option>
                          <Option value="persistentVolumeClaim">PVC</Option>
                        </Select>
                      </Form.Item>
                    </Col>
                    
                    <Form.Item noStyle shouldUpdate>
                      {() => {
                        const volumeType = form.getFieldValue(['volumes', field.name, 'type']);
                        return (
                          <>
                            {volumeType === 'hostPath' && (
                              <Col span={10}>
                                <Form.Item
                                  name={[field.name, 'hostPath', 'path']}
                                  label="主机路径"
                                  rules={[{ required: true, message: '请输入路径' }]}
                                >
                                  <Input placeholder="/data/host-path" />
                                </Form.Item>
                              </Col>
                            )}
                            {volumeType === 'configMap' && (
                              <Col span={10}>
                                <Form.Item
                                  name={[field.name, 'configMap', 'name']}
                                  label="ConfigMap名称"
                                  rules={[{ required: true, message: '请输入名称' }]}
                                >
                                  <Input placeholder="configmap-name" />
                                </Form.Item>
                              </Col>
                            )}
                            {volumeType === 'secret' && (
                              <Col span={10}>
                                <Form.Item
                                  name={[field.name, 'secret', 'secretName']}
                                  label="Secret名称"
                                  rules={[{ required: true, message: '请输入名称' }]}
                                >
                                  <Input placeholder="secret-name" />
                                </Form.Item>
                              </Col>
                            )}
                            {volumeType === 'persistentVolumeClaim' && (
                              <Col span={10}>
                                <Form.Item
                                  name={[field.name, 'persistentVolumeClaim', 'claimName']}
                                  label="PVC名称"
                                  rules={[{ required: true, message: '请输入名称' }]}
                                >
                                  <Input placeholder="pvc-name" />
                                </Form.Item>
                              </Col>
                            )}
                          </>
                        );
                      }}
                    </Form.Item>
                    
                    <Col span={2}>
                      <Form.Item label=" ">
                        <Button
                          type="text"
                          danger
                          icon={<MinusCircleOutlined />}
                          onClick={() => remove(field.name)}
                        />
                      </Form.Item>
                    </Col>
                  </Row>
                </Card>
              ))}
              <Button type="dashed" onClick={() => add()} icon={<PlusOutlined />}>
                添加数据卷
              </Button>
            </>
          )}
        </Form.List>
      </Card>

      {/* 镜像拉取凭证 - 常用功能，放在外面 */}
      <Card title="镜像拉取凭证" style={{ marginBottom: 16 }}>
        <Text type="secondary" style={{ display: 'block', marginBottom: 16 }}>
          选择用于拉取私有镜像的 Secret 凭证
        </Text>
        <Form.Item name="imagePullSecrets">
          <Select
            mode="multiple"
            placeholder="选择镜像拉取凭证 (可多选)"
            style={{ width: '100%' }}
            allowClear
          >
            {imagePullSecretsList.map((secret) => (
              <Option key={secret} value={secret}>
                {secret}
              </Option>
            ))}
          </Select>
        </Form.Item>
        {imagePullSecretsList.length === 0 && (
          <Text type="warning">
            当前命名空间下没有找到 kubernetes.io/dockerconfigjson 类型的 Secret
          </Text>
        )}
      </Card>

      {/* 高级配置 */}
      <Card title="高级配置" style={{ marginBottom: 16 }}>
        <Collapse defaultActiveKey={workloadType === 'Rollout' ? ['rolloutStrategy'] : []} ghost>
          {/* Deployment 升级策略 */}
          {workloadType === 'Deployment' && (
            <Panel header="升级策略" key="strategy">
              <Row gutter={16}>
                <Col span={8}>
                  <Form.Item name={['strategy', 'type']} label="策略类型">
                    <Select defaultValue="RollingUpdate">
                      <Option value="RollingUpdate">滚动更新</Option>
                      <Option value="Recreate">重建</Option>
                    </Select>
                  </Form.Item>
                </Col>
                <Form.Item noStyle shouldUpdate>
                  {() => {
                    const strategyType = form.getFieldValue(['strategy', 'type']);
                    if (strategyType !== 'RollingUpdate') return null;
                    return (
                      <>
                        <Col span={8}>
                          <Form.Item name={['strategy', 'rollingUpdate', 'maxUnavailable']} label="最大不可用">
                            <Input placeholder="25% 或 1" />
                          </Form.Item>
                        </Col>
                        <Col span={8}>
                          <Form.Item name={['strategy', 'rollingUpdate', 'maxSurge']} label="最大超量">
                            <Input placeholder="25% 或 1" />
                          </Form.Item>
                        </Col>
                      </>
                    );
                  }}
                </Form.Item>
              </Row>
              <Row gutter={16}>
                <Col span={8}>
                  <Form.Item name="minReadySeconds" label="最小就绪时间(秒)">
                    <InputNumber min={0} style={{ width: '100%' }} />
                  </Form.Item>
                </Col>
                <Col span={8}>
                  <Form.Item name="revisionHistoryLimit" label="历史版本保留数">
                    <InputNumber min={0} style={{ width: '100%' }} />
                  </Form.Item>
                </Col>
                <Col span={8}>
                  <Form.Item name="progressDeadlineSeconds" label="进度超时(秒)">
                    <InputNumber min={0} style={{ width: '100%' }} />
                  </Form.Item>
                </Col>
              </Row>
            </Panel>
          )}

          {/* Argo Rollout 发布策略 */}
          {workloadType === 'Rollout' && (
            <Panel 
              header={
                <Space>
                  <span>发布策略</span>
                  <Tooltip title="Argo Rollout 支持金丝雀发布和蓝绿发布两种高级发布策略">
                    <QuestionCircleOutlined />
                  </Tooltip>
                </Space>
              } 
              key="rolloutStrategy"
            >
              <Alert
                message="Argo Rollout 发布策略说明"
                description={
                  <ul style={{ margin: 0, paddingLeft: 20 }}>
                    <li><strong>金丝雀发布 (Canary)</strong>: 逐步将流量从旧版本切换到新版本，可设置多个步骤控制发布节奏</li>
                    <li><strong>蓝绿发布 (Blue-Green)</strong>: 同时运行两个版本，通过切换服务实现零停机发布</li>
                  </ul>
                }
                type="info"
                showIcon
                style={{ marginBottom: 16 }}
              />
              
              <Row gutter={16}>
                <Col span={8}>
                  <Form.Item 
                    name={['rolloutStrategy', 'type']} 
                    label="发布策略类型"
                    rules={[{ required: true, message: '请选择发布策略类型' }]}
                    initialValue="Canary"
                  >
                    <Select>
                      <Option value="Canary">
                        <Space>
                          🐤 金丝雀发布 (Canary)
                        </Space>
                      </Option>
                      <Option value="BlueGreen">
                        <Space>
                          🔵🟢 蓝绿发布 (Blue-Green)
                        </Space>
                      </Option>
                    </Select>
                  </Form.Item>
                </Col>
              </Row>

              {/* 金丝雀发布配置 */}
              <Form.Item noStyle shouldUpdate={(prev, curr) => 
                prev?.rolloutStrategy?.type !== curr?.rolloutStrategy?.type
              }>
                {() => {
                  const strategyType = form.getFieldValue(['rolloutStrategy', 'type']);
                  if (strategyType !== 'Canary') return null;
                  
                  return (
                    <>
                      <Divider orientation="left">金丝雀发布配置</Divider>
                      
                      {/* 服务配置 */}
                      <Row gutter={16}>
                        <Col span={8}>
                          <Form.Item 
                            name={['rolloutStrategy', 'canary', 'stableService']} 
                            label={
                              <Space>
                                稳定版本 Service
                                <Tooltip title="接收生产流量的 Service 名称">
                                  <QuestionCircleOutlined />
                                </Tooltip>
                              </Space>
                            }
                          >
                            <Input placeholder="my-app-stable" />
                          </Form.Item>
                        </Col>
                        <Col span={8}>
                          <Form.Item 
                            name={['rolloutStrategy', 'canary', 'canaryService']} 
                            label={
                              <Space>
                                金丝雀 Service
                                <Tooltip title="接收金丝雀流量的 Service 名称">
                                  <QuestionCircleOutlined />
                                </Tooltip>
                              </Space>
                            }
                          >
                            <Input placeholder="my-app-canary" />
                          </Form.Item>
                        </Col>
                      </Row>

                      {/* 基本配置 */}
                      <Row gutter={16}>
                        <Col span={8}>
                          <Form.Item 
                            name={['rolloutStrategy', 'canary', 'maxSurge']} 
                            label="最大超量"
                          >
                            <Input placeholder="25% 或 1" />
                          </Form.Item>
                        </Col>
                        <Col span={8}>
                          <Form.Item 
                            name={['rolloutStrategy', 'canary', 'maxUnavailable']} 
                            label="最大不可用"
                          >
                            <Input placeholder="25% 或 1" />
                          </Form.Item>
                        </Col>
                      </Row>

                      {/* 发布步骤 */}
                      <Divider orientation="left">
                        <Space>
                          发布步骤
                          <Tooltip title="定义金丝雀发布的每个阶段，可以设置流量权重和暂停时间">
                            <QuestionCircleOutlined />
                          </Tooltip>
                        </Space>
                      </Divider>

                      <Form.List name={['rolloutStrategy', 'canary', 'steps']}>
                        {(fields, { add, remove }) => (
                          <>
                            {fields.map((field, index) => (
                              <Card 
                                key={field.key} 
                                size="small" 
                                style={{ marginBottom: 8 }}
                                title={`步骤 ${index + 1}`}
                                extra={
                                  <Button
                                    type="text"
                                    danger
                                    icon={<MinusCircleOutlined />}
                                    onClick={() => remove(field.name)}
                                  />
                                }
                              >
                                <Row gutter={16}>
                                  <Col span={8}>
                                    <Form.Item 
                                      name={[field.name, 'setWeight']} 
                                      label="流量权重 (%)"
                                    >
                                      <InputNumber 
                                        min={0} 
                                        max={100} 
                                        style={{ width: '100%' }} 
                                        placeholder="例如: 20" 
                                      />
                                    </Form.Item>
                                  </Col>
                                  <Col span={8}>
                                    <Form.Item 
                                      name={[field.name, 'pause', 'duration']} 
                                      label={
                                        <Space>
                                          暂停时长
                                          <Tooltip title="留空表示无限期暂停，需要手动确认后继续">
                                            <QuestionCircleOutlined />
                                          </Tooltip>
                                        </Space>
                                      }
                                    >
                                      <Input placeholder="例如: 10m, 1h (留空则需手动确认)" />
                                    </Form.Item>
                                  </Col>
                                </Row>
                              </Card>
                            ))}
                            <Button
                              type="dashed"
                              onClick={() => add({ setWeight: 20 })}
                              icon={<PlusOutlined />}
                              style={{ marginBottom: 16 }}
                            >
                              添加发布步骤
                            </Button>
                            {fields.length === 0 && (
                              <Alert
                                message="建议添加发布步骤"
                                description="例如: 20% → 暂停 → 50% → 暂停 → 100%"
                                type="warning"
                                showIcon
                                style={{ marginBottom: 16 }}
                              />
                            )}
                          </>
                        )}
                      </Form.List>

                      {/* 流量路由 */}
                      <Collapse ghost>
                        <Panel header="流量路由配置 (可选)" key="trafficRouting">
                          <Text type="secondary" style={{ display: 'block', marginBottom: 16 }}>
                            配置流量路由可以实现更精细的流量控制，支持 Nginx Ingress、Istio 等
                          </Text>
                          <Row gutter={16}>
                            <Col span={12}>
                              <Form.Item 
                                name={['rolloutStrategy', 'canary', 'trafficRouting', 'nginx', 'stableIngress']} 
                                label="Nginx Ingress 名称"
                              >
                                <Input placeholder="my-app-ingress" />
                              </Form.Item>
                            </Col>
                          </Row>
                        </Panel>
                      </Collapse>
                    </>
                  );
                }}
              </Form.Item>

              {/* 蓝绿发布配置 */}
              <Form.Item noStyle shouldUpdate={(prev, curr) => 
                prev?.rolloutStrategy?.type !== curr?.rolloutStrategy?.type
              }>
                {() => {
                  const strategyType = form.getFieldValue(['rolloutStrategy', 'type']);
                  if (strategyType !== 'BlueGreen') return null;
                  
                  return (
                    <>
                      <Divider orientation="left">蓝绿发布配置</Divider>
                      
                      {/* 服务配置 */}
                      <Row gutter={16}>
                        <Col span={8}>
                          <Form.Item 
                            name={['rolloutStrategy', 'blueGreen', 'activeService']} 
                            label={
                              <Space>
                                活跃 Service
                                <Tooltip title="接收生产流量的 Service 名称（必填）">
                                  <QuestionCircleOutlined />
                                </Tooltip>
                              </Space>
                            }
                            rules={[{ required: true, message: '请输入活跃 Service 名称' }]}
                          >
                            <Input placeholder="my-app-active" />
                          </Form.Item>
                        </Col>
                        <Col span={8}>
                          <Form.Item 
                            name={['rolloutStrategy', 'blueGreen', 'previewService']} 
                            label={
                              <Space>
                                预览 Service
                                <Tooltip title="用于预览新版本的 Service 名称">
                                  <QuestionCircleOutlined />
                                </Tooltip>
                              </Space>
                            }
                          >
                            <Input placeholder="my-app-preview" />
                          </Form.Item>
                        </Col>
                      </Row>

                      {/* 晋升配置 */}
                      <Row gutter={16}>
                        <Col span={8}>
                          <Form.Item 
                            name={['rolloutStrategy', 'blueGreen', 'autoPromotionEnabled']} 
                            label={
                              <Space>
                                自动晋升
                                <Tooltip title="启用后新版本就绪后会自动晋升为活跃版本">
                                  <QuestionCircleOutlined />
                                </Tooltip>
                              </Space>
                            }
                            valuePropName="checked"
                          >
                            <Switch />
                          </Form.Item>
                        </Col>
                        <Form.Item noStyle shouldUpdate>
                          {() => {
                            const autoPromotion = form.getFieldValue(['rolloutStrategy', 'blueGreen', 'autoPromotionEnabled']);
                            if (!autoPromotion) return null;
                            return (
                              <Col span={8}>
                                <Form.Item 
                                  name={['rolloutStrategy', 'blueGreen', 'autoPromotionSeconds']} 
                                  label="自动晋升延迟(秒)"
                                >
                                  <InputNumber min={0} style={{ width: '100%' }} placeholder="30" />
                                </Form.Item>
                              </Col>
                            );
                          }}
                        </Form.Item>
                      </Row>

                      {/* 缩容配置 */}
                      <Row gutter={16}>
                        <Col span={8}>
                          <Form.Item 
                            name={['rolloutStrategy', 'blueGreen', 'scaleDownDelaySeconds']} 
                            label={
                              <Space>
                                缩容延迟(秒)
                                <Tooltip title="晋升后旧版本的缩容延迟时间">
                                  <QuestionCircleOutlined />
                                </Tooltip>
                              </Space>
                            }
                          >
                            <InputNumber min={0} style={{ width: '100%' }} placeholder="30" />
                          </Form.Item>
                        </Col>
                        <Col span={8}>
                          <Form.Item 
                            name={['rolloutStrategy', 'blueGreen', 'scaleDownDelayRevisionLimit']} 
                            label="保留旧版本数量"
                          >
                            <InputNumber min={0} style={{ width: '100%' }} placeholder="2" />
                          </Form.Item>
                        </Col>
                        <Col span={8}>
                          <Form.Item 
                            name={['rolloutStrategy', 'blueGreen', 'previewReplicaCount']} 
                            label="预览副本数"
                          >
                            <InputNumber min={1} style={{ width: '100%' }} placeholder="1" />
                          </Form.Item>
                        </Col>
                      </Row>
                    </>
                  );
                }}
              </Form.Item>

              {/* 通用配置 */}
              <Divider orientation="left">通用配置</Divider>
              <Row gutter={16}>
                <Col span={8}>
                  <Form.Item name="minReadySeconds" label="最小就绪时间(秒)">
                    <InputNumber min={0} style={{ width: '100%' }} />
                  </Form.Item>
                </Col>
                <Col span={8}>
                  <Form.Item name="revisionHistoryLimit" label="历史版本保留数">
                    <InputNumber min={0} style={{ width: '100%' }} />
                  </Form.Item>
                </Col>
                <Col span={8}>
                  <Form.Item name="progressDeadlineSeconds" label="进度超时(秒)">
                    <InputNumber min={0} style={{ width: '100%' }} />
                  </Form.Item>
                </Col>
              </Row>
            </Panel>
          )}

          {/* 调度策略 */}
          <Panel header="调度策略" key="scheduling">
            <SchedulingConfigForm />
          </Panel>

          {/* 容忍策略 */}
          <Panel header="容忍策略 (Tolerations)" key="tolerations">
            <Form.List name="tolerations">
              {(fields, { add, remove }) => (
                <>
                  {fields.map((field) => (
                    <Card key={field.key} size="small" style={{ marginBottom: 8 }}>
                      <Row gutter={16}>
                        <Col span={5}>
                          <Form.Item name={[field.name, 'key']} label="键">
                            <Input placeholder="node.kubernetes.io/not-ready" />
                          </Form.Item>
                        </Col>
                        <Col span={4}>
                          <Form.Item name={[field.name, 'operator']} label="操作符">
                            <Select defaultValue="Equal">
                              <Option value="Equal">Equal</Option>
                              <Option value="Exists">Exists</Option>
                            </Select>
                          </Form.Item>
                        </Col>
                        <Col span={5}>
                          <Form.Item name={[field.name, 'value']} label="值">
                            <Input placeholder="值" />
                          </Form.Item>
                        </Col>
                        <Col span={4}>
                          <Form.Item name={[field.name, 'effect']} label="效果">
                            <Select>
                              <Option value="">所有</Option>
                              <Option value="NoSchedule">NoSchedule</Option>
                              <Option value="PreferNoSchedule">PreferNoSchedule</Option>
                              <Option value="NoExecute">NoExecute</Option>
                            </Select>
                          </Form.Item>
                        </Col>
                        <Col span={4}>
                          <Form.Item name={[field.name, 'tolerationSeconds']} label="容忍时间(秒)">
                            <InputNumber min={0} style={{ width: '100%' }} />
                          </Form.Item>
                        </Col>
                        <Col span={2}>
                          <Form.Item label=" ">
                            <MinusCircleOutlined onClick={() => remove(field.name)} />
                          </Form.Item>
                        </Col>
                      </Row>
                    </Card>
                  ))}
                  <Button type="dashed" onClick={() => add()} icon={<PlusOutlined />}>
                    添加容忍
                  </Button>
                </>
              )}
            </Form.List>
          </Panel>

          {/* 标签与注解 */}
          <Panel header="标签与注解" key="labels">
            <Divider orientation="left">标签 (Labels)</Divider>
            <Form.List name="labels">
              {(fields, { add, remove }) => (
                <>
                  {fields.map((field) => (
                    <Row key={field.key} gutter={16} style={{ marginBottom: 8 }}>
                      <Col span={10}>
                        <Form.Item name={[field.name, 'key']} noStyle>
                          <Input placeholder="键" />
                        </Form.Item>
                      </Col>
                      <Col span={10}>
                        <Form.Item name={[field.name, 'value']} noStyle>
                          <Input placeholder="值" />
                        </Form.Item>
                      </Col>
                      <Col span={4}>
                        <MinusCircleOutlined onClick={() => remove(field.name)} />
                      </Col>
                    </Row>
                  ))}
                  <Button type="dashed" onClick={() => add()} icon={<PlusOutlined />}>
                    添加标签
                  </Button>
                </>
              )}
            </Form.List>

            <Divider orientation="left">注解 (Annotations)</Divider>
            <Form.List name="annotations">
              {(fields, { add, remove }) => (
                <>
                  {fields.map((field) => (
                    <Row key={field.key} gutter={16} style={{ marginBottom: 8 }}>
                      <Col span={10}>
                        <Form.Item name={[field.name, 'key']} noStyle>
                          <Input placeholder="键" />
                        </Form.Item>
                      </Col>
                      <Col span={10}>
                        <Form.Item name={[field.name, 'value']} noStyle>
                          <Input placeholder="值" />
                        </Form.Item>
                      </Col>
                      <Col span={4}>
                        <MinusCircleOutlined onClick={() => remove(field.name)} />
                      </Col>
                    </Row>
                  ))}
                  <Button type="dashed" onClick={() => add()} icon={<PlusOutlined />}>
                    添加注解
                  </Button>
                </>
              )}
            </Form.List>
          </Panel>

          {/* DNS配置 */}
          <Panel header="DNS配置" key="dns">
            <Row gutter={16}>
              <Col span={8}>
                <Form.Item name="dnsPolicy" label="DNS策略">
                  <Select defaultValue="ClusterFirst">
                    <Option value="ClusterFirst">ClusterFirst</Option>
                    <Option value="ClusterFirstWithHostNet">ClusterFirstWithHostNet</Option>
                    <Option value="Default">Default</Option>
                    <Option value="None">None</Option>
                  </Select>
                </Form.Item>
              </Col>
            </Row>
            <Row gutter={16}>
              <Col span={12}>
                <Form.Item name={['dnsConfig', 'nameservers']} label="DNS服务器 (逗号分隔)">
                  <Input placeholder="8.8.8.8, 8.8.4.4" />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item name={['dnsConfig', 'searches']} label="搜索域 (逗号分隔)">
                  <Input placeholder="ns1.svc.cluster.local, svc.cluster.local" />
                </Form.Item>
              </Col>
            </Row>
          </Panel>


          {/* 其他配置 */}
          <Panel header="其他配置" key="other">
            <Row gutter={16}>
              <Col span={8}>
                <Form.Item name="terminationGracePeriodSeconds" label="优雅终止时间(秒)">
                  <InputNumber min={0} style={{ width: '100%' }} placeholder="30" />
                </Form.Item>
              </Col>
              <Col span={8}>
                <Form.Item name="hostNetwork" label="使用主机网络" valuePropName="checked">
                  <Switch />
                </Form.Item>
              </Col>
            </Row>
          </Panel>
        </Collapse>
      </Card>
    </Form>
  );
};

export default WorkloadFormV2;
export type { WorkloadFormV2Props };
/** genAI_main_end */

