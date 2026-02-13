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
import { useTranslation } from 'react-i18next';
import ContainerConfigForm from './ContainerConfigForm';
import SchedulingConfigForm from './SchedulingConfigForm';
import type { WorkloadFormData } from '../../types/workload';

const { Option } = Select;
const { TextArea } = Input;
const { Panel } = Collapse;
const { Text } = Typography;

interface WorkloadFormProps {
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

const WorkloadForm: React.FC<WorkloadFormProps> = ({
  workloadType,
  initialData,
  namespaces,
  imagePullSecretsList = [],
  onValuesChange,
  form: externalForm,
  isEdit = false,
}) => {
  const { t } = useTranslation('components');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [form] = Form.useForm<WorkloadFormData>(externalForm as any);

  // 是否已初始化（用于区分首次渲染和编辑模式数据加载）
  const [initialized, setInitialized] = React.useState(false);
  
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

  return (
    <Form
      form={form}
      layout="vertical"
      onValuesChange={onValuesChange}
    >
      {/* 基本信息 */}
      <Card title={t('workloadForm.basicInfo')} style={{ marginBottom: 16 }}>
        <Row gutter={16}>
          <Col span={12}>
            <Form.Item
              name="name"
              label={t('workloadForm.name')}
              rules={[
                { required: true, message: t('workloadForm.nameRequired') },
                {
                  pattern: /^[a-z0-9]([-a-z0-9]*[a-z0-9])?$/,
                  message: t('workloadForm.namePattern'),
                },
              ]}
              tooltip={isEdit ? t('workloadForm.nameEditTooltip') : undefined}
            >
              <Input placeholder={t('workloadForm.namePlaceholder')} disabled={isEdit} />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item
              name="namespace"
              label={t('workloadForm.namespace')}
              rules={[{ required: true, message: t('workloadForm.namespaceRequired') }]}
              tooltip={isEdit ? t('workloadForm.namespaceEditTooltip') : undefined}
            >
              <Select placeholder={t('workloadForm.namespacePlaceholder')} showSearch disabled={isEdit}>
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
            <Form.Item name="description" label={t('workloadForm.description')}>
              <TextArea 
                rows={2} 
                placeholder={t('workloadForm.descriptionPlaceholder')} 
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
                label={t('workloadForm.replicas')}
                rules={[{ required: true, message: t('workloadForm.replicasRequired') }]}
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
                label={t('workloadForm.headlessService')}
                rules={[{ required: true, message: t('workloadForm.headlessServiceRequired') }]}
              >
                <Input placeholder={t('workloadForm.headlessServicePlaceholder')} />
              </Form.Item>
            </Col>
          </Row>
        )}

        {workloadType === 'CronJob' && (
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="schedule"
                label={t('workloadForm.cronExpression')}
                rules={[{ required: true, message: t('workloadForm.cronRequired') }]}
              >
                <Input placeholder="0 0 * * *" />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item name="suspend" label={t('workloadForm.suspend')} valuePropName="checked">
                <Switch />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item name="concurrencyPolicy" label={t('workloadForm.concurrencyPolicy')}>
                <Select defaultValue="Allow">
                  <Option value="Allow">{t('workloadForm.allowConcurrent')}</Option>
                  <Option value="Forbid">{t('workloadForm.forbidConcurrent')}</Option>
                  <Option value="Replace">{t('workloadForm.replaceConcurrent')}</Option>
                </Select>
              </Form.Item>
            </Col>
          </Row>
        )}

        {workloadType === 'Job' && (
          <Row gutter={16}>
            <Col span={6}>
              <Form.Item name="completions" label={t('workloadForm.completions')}>
                <InputNumber min={1} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item name="parallelism" label={t('workloadForm.parallelism')}>
                <InputNumber min={1} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item name="backoffLimit" label={t('workloadForm.backoffLimit')}>
                <InputNumber min={0} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item name="activeDeadlineSeconds" label={t('workloadForm.activeDeadlineSeconds')}>
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
            <span>{t('workloadForm.containerConfigMulti')}</span>
            <Text type="secondary" style={{ fontSize: 12 }}>
              {t('workloadForm.multiContainerHint')}
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
                {t('workloadForm.addContainer')}
              </Button>
            </>
          )}
        </Form.List>

        <Divider orientation="left">
          <Text type="secondary">{t('workloadForm.initContainerOptional')}</Text>
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
                {t('workloadForm.addInitContainer')}
              </Button>
            </>
          )}
        </Form.List>
      </Card>

      {/* 数据卷配置 */}
      <Card title={t('workloadForm.volumeConfig')} style={{ marginBottom: 16 }}>
        <Form.List name="volumes">
          {(fields, { add, remove }) => (
            <>
              {fields.map((field) => (
                <Card key={field.key} size="small" style={{ marginBottom: 16 }}>
                  <Row gutter={16}>
                    <Col span={6}>
                      <Form.Item
                        name={[field.name, 'name']}
                        label={t('workloadForm.volumeName')}
                        rules={[{ required: true, message: t('workloadForm.nameRequired') }]}
                      >
                        <Input placeholder="volume-name" />
                      </Form.Item>
                    </Col>
                    <Col span={6}>
                      <Form.Item
                        name={[field.name, 'type']}
                        label={t('workloadForm.volumeType')}
                        rules={[{ required: true, message: t('workloadForm.selectType') }]}
                      >
                        <Select placeholder={t('workloadForm.selectType')}>
                          <Option value="emptyDir">{t('workloadForm.emptyDir')}</Option>
                          <Option value="hostPath">{t('workloadForm.hostPath')}</Option>
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
                                  label={t('workloadForm.hostPathLabel')}
                                  rules={[{ required: true, message: t('workloadForm.pathRequired') }]}
                                >
                                  <Input placeholder="/data/host-path" />
                                </Form.Item>
                              </Col>
                            )}
                            {volumeType === 'configMap' && (
                              <Col span={10}>
                                <Form.Item
                                  name={[field.name, 'configMap', 'name']}
                                  label={t('workloadForm.configMapName')}
                                  rules={[{ required: true, message: t('workloadForm.nameRequired') }]}
                                >
                                  <Input placeholder="configmap-name" />
                                </Form.Item>
                              </Col>
                            )}
                            {volumeType === 'secret' && (
                              <Col span={10}>
                                <Form.Item
                                  name={[field.name, 'secret', 'secretName']}
                                  label={t('workloadForm.secretName')}
                                  rules={[{ required: true, message: t('workloadForm.nameRequired') }]}
                                >
                                  <Input placeholder="secret-name" />
                                </Form.Item>
                              </Col>
                            )}
                            {volumeType === 'persistentVolumeClaim' && (
                              <Col span={10}>
                                <Form.Item
                                  name={[field.name, 'persistentVolumeClaim', 'claimName']}
                                  label={t('workloadForm.pvcName')}
                                  rules={[{ required: true, message: t('workloadForm.nameRequired') }]}
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
                {t('workloadForm.addVolume')}
              </Button>
            </>
          )}
        </Form.List>
      </Card>

      {/* 镜像拉取凭证 - 常用功能，放在外面 */}
      <Card title={t('workloadForm.imagePullSecrets')} style={{ marginBottom: 16 }}>
        <Text type="secondary" style={{ display: 'block', marginBottom: 16 }}>
          {t('workloadForm.imagePullSecretsDesc')}
        </Text>
        <Form.Item name="imagePullSecrets">
          <Select
            mode="multiple"
            placeholder={t('workloadForm.imagePullSecretsPlaceholder')}
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
            {t('workloadForm.noDockerSecretWarning')}
          </Text>
        )}
      </Card>

      {/* 高级配置 */}
      <Card title={t('workloadForm.advancedConfig')} style={{ marginBottom: 16 }}>
        <Collapse defaultActiveKey={workloadType === 'Rollout' ? ['rolloutStrategy'] : []} ghost>
          {/* Deployment 升级策略 */}
          {workloadType === 'Deployment' && (
            <Panel header={t('workloadForm.upgradeStrategy')} key="strategy">
              <Row gutter={16}>
                <Col span={8}>
                  <Form.Item name={['strategy', 'type']} label={t('workloadForm.strategyType')}>
                    <Select defaultValue="RollingUpdate">
                      <Option value="RollingUpdate">{t('workloadForm.rollingUpdate')}</Option>
                      <Option value="Recreate">{t('workloadForm.recreate')}</Option>
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
                          <Form.Item name={['strategy', 'rollingUpdate', 'maxUnavailable']} label={t('workloadForm.maxUnavailable')}>
                            <Input placeholder={t('workloadForm.maxUnavailablePlaceholder')} />
                          </Form.Item>
                        </Col>
                        <Col span={8}>
                          <Form.Item name={['strategy', 'rollingUpdate', 'maxSurge']} label={t('workloadForm.maxSurge')}>
                            <Input placeholder={t('workloadForm.maxSurgePlaceholder')} />
                          </Form.Item>
                        </Col>
                      </>
                    );
                  }}
                </Form.Item>
              </Row>
              <Row gutter={16}>
                <Col span={8}>
                  <Form.Item name="minReadySeconds" label={t('workloadForm.minReadySeconds')}>
                    <InputNumber min={0} style={{ width: '100%' }} />
                  </Form.Item>
                </Col>
                <Col span={8}>
                  <Form.Item name="revisionHistoryLimit" label={t('workloadForm.revisionHistoryLimit')}>
                    <InputNumber min={0} style={{ width: '100%' }} />
                  </Form.Item>
                </Col>
                <Col span={8}>
                  <Form.Item name="progressDeadlineSeconds" label={t('workloadForm.progressDeadlineSeconds')}>
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
                  <span>{t('workloadForm.rolloutStrategy')}</span>
                  <Tooltip title={t('workloadForm.rolloutStrategyTooltip')}>
                    <QuestionCircleOutlined />
                  </Tooltip>
                </Space>
              } 
              key="rolloutStrategy"
            >
              <Alert
                message={t('workloadForm.rolloutStrategyDesc')}
                description={
                  <ul style={{ margin: 0, paddingLeft: 20 }}>
                    <li><strong>{t('workloadForm.canaryLabel')}</strong>: {t('workloadForm.canaryDesc')}</li>
                    <li><strong>{t('workloadForm.blueGreenLabel')}</strong>: {t('workloadForm.blueGreenDesc')}</li>
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
                    label={t('workloadForm.rolloutStrategyType')}
                    rules={[{ required: true, message: t('workloadForm.rolloutStrategyTypeRequired') }]}
                    initialValue="Canary"
                  >
                    <Select>
                      <Option value="Canary">
                        <Space>
                          {t('workloadForm.canaryOption')}
                        </Space>
                      </Option>
                      <Option value="BlueGreen">
                        <Space>
                          {t('workloadForm.blueGreenOption')}
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
                      <Divider orientation="left">{t('workloadForm.canaryConfig')}</Divider>
                      
                      {/* 服务配置 */}
                      <Row gutter={16}>
                        <Col span={8}>
                          <Form.Item 
                            name={['rolloutStrategy', 'canary', 'stableService']} 
                            label={
                              <Space>
                                {t('workloadForm.stableService')}
                                <Tooltip title={t('workloadForm.stableServiceTooltip')}>
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
                                {t('workloadForm.canaryService')}
                                <Tooltip title={t('workloadForm.canaryServiceTooltip')}>
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
                            label={t('workloadForm.maxSurge')}
                          >
                            <Input placeholder={t('workloadForm.maxSurgePlaceholder')} />
                          </Form.Item>
                        </Col>
                        <Col span={8}>
                          <Form.Item 
                            name={['rolloutStrategy', 'canary', 'maxUnavailable']} 
                            label={t('workloadForm.maxUnavailable')}
                          >
                            <Input placeholder={t('workloadForm.maxUnavailablePlaceholder')} />
                          </Form.Item>
                        </Col>
                      </Row>

                      {/* 发布步骤 */}
                      <Divider orientation="left">
                        <Space>
                          {t('workloadForm.releaseSteps')}
                          <Tooltip title={t('workloadForm.releaseStepsTooltip')}>
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
                                title={t('workloadForm.stepIndex', { index: index + 1 })}
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
                                      label={t('workloadForm.trafficWeight')}
                                    >
                                      <InputNumber 
                                        min={0} 
                                        max={100} 
                                        style={{ width: '100%' }} 
                                        placeholder={t('workloadForm.trafficWeightPlaceholder')} 
                                      />
                                    </Form.Item>
                                  </Col>
                                  <Col span={8}>
                                    <Form.Item 
                                      name={[field.name, 'pause', 'duration']} 
                                      label={
                                        <Space>
                                          {t('workloadForm.pauseDuration')}
                                          <Tooltip title={t('workloadForm.pauseDurationTooltip')}>
                                            <QuestionCircleOutlined />
                                          </Tooltip>
                                        </Space>
                                      }
                                    >
                                      <Input placeholder={t('workloadForm.pauseDurationPlaceholder')} />
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
                              {t('workloadForm.addReleaseStep')}
                            </Button>
                            {fields.length === 0 && (
                              <Alert
                                message={t('workloadForm.addReleaseStepSuggestion')}
                                description={t('workloadForm.addReleaseStepExample')}
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
                        <Panel header={t('workloadForm.trafficRouting')} key="trafficRouting">
                          <Text type="secondary" style={{ display: 'block', marginBottom: 16 }}>
                            {t('workloadForm.trafficRoutingDesc')}
                          </Text>
                          <Row gutter={16}>
                            <Col span={12}>
                              <Form.Item 
                                name={['rolloutStrategy', 'canary', 'trafficRouting', 'nginx', 'stableIngress']} 
                                label={t('workloadForm.nginxIngressName')}
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
                      <Divider orientation="left">{t('workloadForm.blueGreenConfig')}</Divider>
                      
                      {/* 服务配置 */}
                      <Row gutter={16}>
                        <Col span={8}>
                          <Form.Item 
                            name={['rolloutStrategy', 'blueGreen', 'activeService']} 
                            label={
                              <Space>
                                {t('workloadForm.activeService')}
                                <Tooltip title={t('workloadForm.activeServiceTooltip')}>
                                  <QuestionCircleOutlined />
                                </Tooltip>
                              </Space>
                            }
                            rules={[{ required: true, message: t('workloadForm.activeServiceRequired') }]}
                          >
                            <Input placeholder="my-app-active" />
                          </Form.Item>
                        </Col>
                        <Col span={8}>
                          <Form.Item 
                            name={['rolloutStrategy', 'blueGreen', 'previewService']} 
                            label={
                              <Space>
                                {t('workloadForm.previewService')}
                                <Tooltip title={t('workloadForm.previewServiceTooltip')}>
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
                                {t('workloadForm.autoPromotion')}
                                <Tooltip title={t('workloadForm.autoPromotionTooltip')}>
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
                                  label={t('workloadForm.autoPromotionDelay')}
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
                                {t('workloadForm.scaleDownDelay')}
                                <Tooltip title={t('workloadForm.scaleDownDelayTooltip')}>
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
                            label={t('workloadForm.keepOldVersions')}
                          >
                            <InputNumber min={0} style={{ width: '100%' }} placeholder="2" />
                          </Form.Item>
                        </Col>
                        <Col span={8}>
                          <Form.Item 
                            name={['rolloutStrategy', 'blueGreen', 'previewReplicaCount']} 
                            label={t('workloadForm.previewReplicaCount')}
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
              <Divider orientation="left">{t('workloadForm.generalConfig')}</Divider>
              <Row gutter={16}>
                <Col span={8}>
                  <Form.Item name="minReadySeconds" label={t('workloadForm.minReadySeconds')}>
                    <InputNumber min={0} style={{ width: '100%' }} />
                  </Form.Item>
                </Col>
                <Col span={8}>
                  <Form.Item name="revisionHistoryLimit" label={t('workloadForm.revisionHistoryLimit')}>
                    <InputNumber min={0} style={{ width: '100%' }} />
                  </Form.Item>
                </Col>
                <Col span={8}>
                  <Form.Item name="progressDeadlineSeconds" label={t('workloadForm.progressDeadlineSeconds')}>
                    <InputNumber min={0} style={{ width: '100%' }} />
                  </Form.Item>
                </Col>
              </Row>
            </Panel>
          )}

          {/* 调度策略 */}
          <Panel header={t('workloadForm.scheduling')} key="scheduling">
            <SchedulingConfigForm />
          </Panel>

          {/* 容忍策略 */}
          <Panel header={t('workloadForm.tolerations')} key="tolerations">
            <Form.List name="tolerations">
              {(fields, { add, remove }) => (
                <>
                  {fields.map((field) => (
                    <Card key={field.key} size="small" style={{ marginBottom: 8 }}>
                      <Row gutter={16}>
                        <Col span={5}>
                          <Form.Item name={[field.name, 'key']} label={t('workloadForm.key')}>
                            <Input placeholder="node.kubernetes.io/not-ready" />
                          </Form.Item>
                        </Col>
                        <Col span={4}>
                          <Form.Item name={[field.name, 'operator']} label={t('workloadForm.operator')}>
                            <Select defaultValue="Equal">
                              <Option value="Equal">Equal</Option>
                              <Option value="Exists">Exists</Option>
                            </Select>
                          </Form.Item>
                        </Col>
                        <Col span={5}>
                          <Form.Item name={[field.name, 'value']} label={t('workloadForm.value')}>
                            <Input placeholder={t('workloadForm.value')} />
                          </Form.Item>
                        </Col>
                        <Col span={4}>
                          <Form.Item name={[field.name, 'effect']} label={t('workloadForm.effect')}>
                            <Select>
                              <Option value="">{t('workloadForm.all')}</Option>
                              <Option value="NoSchedule">NoSchedule</Option>
                              <Option value="PreferNoSchedule">PreferNoSchedule</Option>
                              <Option value="NoExecute">NoExecute</Option>
                            </Select>
                          </Form.Item>
                        </Col>
                        <Col span={4}>
                          <Form.Item name={[field.name, 'tolerationSeconds']} label={t('workloadForm.tolerationSeconds')}>
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
                    {t('workloadForm.addToleration')}
                  </Button>
                </>
              )}
            </Form.List>
          </Panel>

          {/* 标签与注解 */}
          <Panel header={t('workloadForm.labelsAnnotations')} key="labels">
            <Divider orientation="left">{t('workloadForm.labels')}</Divider>
            <Form.List name="labels">
              {(fields, { add, remove }) => (
                <>
                  {fields.map((field) => (
                    <Row key={field.key} gutter={16} style={{ marginBottom: 8 }}>
                      <Col span={10}>
                        <Form.Item name={[field.name, 'key']} noStyle>
                          <Input placeholder={t('workloadForm.key')} />
                        </Form.Item>
                      </Col>
                      <Col span={10}>
                        <Form.Item name={[field.name, 'value']} noStyle>
                          <Input placeholder={t('workloadForm.value')} />
                        </Form.Item>
                      </Col>
                      <Col span={4}>
                        <MinusCircleOutlined onClick={() => remove(field.name)} />
                      </Col>
                    </Row>
                  ))}
                  <Button type="dashed" onClick={() => add()} icon={<PlusOutlined />}>
                    {t('workloadForm.addLabel')}
                  </Button>
                </>
              )}
            </Form.List>

            <Divider orientation="left">{t('workloadForm.annotations')}</Divider>
            <Form.List name="annotations">
              {(fields, { add, remove }) => (
                <>
                  {fields.map((field) => (
                    <Row key={field.key} gutter={16} style={{ marginBottom: 8 }}>
                      <Col span={10}>
                        <Form.Item name={[field.name, 'key']} noStyle>
                          <Input placeholder={t('workloadForm.key')} />
                        </Form.Item>
                      </Col>
                      <Col span={10}>
                        <Form.Item name={[field.name, 'value']} noStyle>
                          <Input placeholder={t('workloadForm.value')} />
                        </Form.Item>
                      </Col>
                      <Col span={4}>
                        <MinusCircleOutlined onClick={() => remove(field.name)} />
                      </Col>
                    </Row>
                  ))}
                  <Button type="dashed" onClick={() => add()} icon={<PlusOutlined />}>
                    {t('workloadForm.addAnnotation')}
                  </Button>
                </>
              )}
            </Form.List>
          </Panel>

          {/* DNS配置 */}
          <Panel header={t('workloadForm.dnsConfig')} key="dns">
            <Row gutter={16}>
              <Col span={8}>
                <Form.Item name="dnsPolicy" label={t('workloadForm.dnsPolicy')}>
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
                <Form.Item name={['dnsConfig', 'nameservers']} label={t('workloadForm.dnsServers')}>
                  <Input placeholder="8.8.8.8, 8.8.4.4" />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item name={['dnsConfig', 'searches']} label={t('workloadForm.dnsSearchDomains')}>
                  <Input placeholder="ns1.svc.cluster.local, svc.cluster.local" />
                </Form.Item>
              </Col>
            </Row>
          </Panel>


          {/* 其他配置 */}
          <Panel header={t('workloadForm.otherConfig')} key="other">
            <Row gutter={16}>
              <Col span={8}>
                <Form.Item name="terminationGracePeriodSeconds" label={t('workloadForm.terminationGracePeriod')}>
                  <InputNumber min={0} style={{ width: '100%' }} placeholder="30" />
                </Form.Item>
              </Col>
              <Col span={8}>
                <Form.Item name="hostNetwork" label={t('workloadForm.hostNetwork')} valuePropName="checked">
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

export default WorkloadForm;
export type { WorkloadFormProps };
