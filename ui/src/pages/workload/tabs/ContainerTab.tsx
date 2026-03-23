import React, { useState, useEffect, useCallback } from 'react';
import { 
  Descriptions, 
  Spin, 
  message, 
  Menu, 
  Row, 
  Col, 
  Card,
  Tag,
  Divider,
  Empty
} from 'antd';
import { WorkloadService } from '../../../services/workloadService';
import { useTranslation } from 'react-i18next';

// 探针类型定义
interface ProbeConfig {
  httpGet?: {
    path?: string;
    port: number | string;
    scheme?: string;
    host?: string;
    httpHeaders?: Array<{ name: string; value: string }>;
  };
  tcpSocket?: {
    port: number | string;
    host?: string;
  };
  exec?: {
    command?: string[];
  };
  grpc?: {
    port: number;
    service?: string;
  };
  initialDelaySeconds?: number;
  periodSeconds?: number;
  timeoutSeconds?: number;
  successThreshold?: number;
  failureThreshold?: number;
  terminationGracePeriodSeconds?: number;
}

// 生命周期钩子类型
interface LifecycleHandler {
  exec?: {
    command?: string[];
  };
  httpGet?: {
    path?: string;
    port: number | string;
    scheme?: string;
    host?: string;
    httpHeaders?: Array<{ name: string; value: string }>;
  };
  tcpSocket?: {
    port: number | string;
    host?: string;
  };
}

interface ContainerInfo {
  name: string;
  image: string;
  imagePullPolicy: string;
  command?: string[];
  args?: string[];
  workingDir?: string;
  ports?: Array<{
    name?: string;
    containerPort: number;
    protocol: string;
  }>;
  env?: Array<{
    name: string;
    value?: string;
    valueFrom?: {
      configMapKeyRef?: { name: string; key: string; optional?: boolean };
      secretKeyRef?: { name: string; key: string; optional?: boolean };
      fieldRef?: { fieldPath: string; apiVersion?: string };
      resourceFieldRef?: { containerName?: string; resource: string; divisor?: string };
    };
  }>;
  envFrom?: Array<{
    configMapRef?: { name: string; optional?: boolean };
    secretRef?: { name: string; optional?: boolean };
    prefix?: string;
  }>;
  resources?: {
    limits?: {
      cpu?: string;
      memory?: string;
      [key: string]: string | undefined;
    };
    requests?: {
      cpu?: string;
      memory?: string;
      [key: string]: string | undefined;
    };
  };
  volumeMounts?: Array<{
    name: string;
    mountPath: string;
    readOnly?: boolean;
    subPath?: string;
    subPathExpr?: string;
  }>;
  lifecycle?: {
    postStart?: LifecycleHandler;
    preStop?: LifecycleHandler;
  };
  livenessProbe?: ProbeConfig;
  readinessProbe?: ProbeConfig;
  startupProbe?: ProbeConfig;
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
  stdin?: boolean;
  stdinOnce?: boolean;
  tty?: boolean;
  terminationMessagePath?: string;
  terminationMessagePolicy?: string;
}

// 卷类型定义
interface VolumeConfig {
  name: string;
  configMap?: {
    name: string;
    defaultMode?: number;
    optional?: boolean;
    items?: Array<{ key: string; path: string; mode?: number }>;
  };
  secret?: {
    secretName: string;
    defaultMode?: number;
    optional?: boolean;
    items?: Array<{ key: string; path: string; mode?: number }>;
  };
  emptyDir?: {
    medium?: string;
    sizeLimit?: string;
  };
  hostPath?: {
    path: string;
    type?: string;
  };
  persistentVolumeClaim?: {
    claimName: string;
    readOnly?: boolean;
  };
  nfs?: {
    server: string;
    path: string;
    readOnly?: boolean;
  };
  downwardAPI?: {
    items?: Array<{
      path: string;
      fieldRef?: { fieldPath: string };
      resourceFieldRef?: { containerName?: string; resource: string };
    }>;
    defaultMode?: number;
  };
  projected?: {
    sources?: Array<{
      configMap?: { name: string; items?: Array<{ key: string; path: string }> };
      secret?: { name: string; items?: Array<{ key: string; path: string }> };
      downwardAPI?: { items?: Array<{ path: string; fieldRef?: { fieldPath: string } }> };
      serviceAccountToken?: { path: string; expirationSeconds?: number; audience?: string };
    }>;
    defaultMode?: number;
  };
  csi?: {
    driver: string;
    readOnly?: boolean;
    volumeAttributes?: Record<string, string>;
  };
}

interface DeploymentSpec {
  replicas?: number;
  selector?: {
    matchLabels?: Record<string, string>;
    matchExpressions?: Array<{ key: string; operator: string; values?: string[] }>;
  };
  template?: {
    metadata?: {
      labels?: Record<string, string>;
      annotations?: Record<string, string>;
    };
    spec?: {
      containers?: ContainerInfo[];
      initContainers?: ContainerInfo[];
      volumes?: VolumeConfig[];
      serviceAccountName?: string;
      nodeSelector?: Record<string, string>;
      tolerations?: Array<{
        key?: string;
        operator?: string;
        value?: string;
        effect?: string;
        tolerationSeconds?: number;
      }>;
      affinity?: {
        nodeAffinity?: Record<string, unknown>;
        podAffinity?: Record<string, unknown>;
        podAntiAffinity?: Record<string, unknown>;
      };
      dnsPolicy?: string;
      restartPolicy?: string;
      terminationGracePeriodSeconds?: number;
      hostNetwork?: boolean;
      hostPID?: boolean;
      hostIPC?: boolean;
    };
  };
}

interface ContainerTabProps {
  clusterId: string;
  namespace: string;
  deploymentName?: string;
  rolloutName?: string;
  statefulSetName?: string;
  daemonSetName?: string;
  jobName?: string;
  cronJobName?: string;
}

const ContainerTab: React.FC<ContainerTabProps> = ({ 
  clusterId, 
  namespace, 
  deploymentName,
  rolloutName,
  statefulSetName,
  daemonSetName,
  jobName,
  cronJobName
}) => {
const { t } = useTranslation(['workload', 'common']);
const [loading, setLoading] = useState(false);
  const [spec, setSpec] = useState<DeploymentSpec | null>(null);
  const [selectedContainer, setSelectedContainer] = useState<string>('');
  const [selectedSection, setSelectedSection] = useState<string>('basic');

  // 获取工作负载名称和类型
  const workloadName = deploymentName || rolloutName || statefulSetName || daemonSetName || jobName || cronJobName;
  const workloadType = deploymentName ? 'Deployment' 
    : rolloutName ? 'Rollout'
    : statefulSetName ? 'StatefulSet'
    : daemonSetName ? 'DaemonSet'
    : jobName ? 'Job'
    : cronJobName ? 'CronJob'
    : '';

  const loadSpec = useCallback(async () => {
    if (!clusterId || !namespace || !workloadName || !workloadType) return;

    setLoading(true);
    try {
      const response = await WorkloadService.getWorkloadDetail(
        clusterId,
        workloadType,
        namespace,
        workloadName
      );

      {
        const data = response as unknown as {
          raw?: Record<string, unknown> & { spec?: DeploymentSpec };
          workload?: Record<string, unknown> & { spec?: DeploymentSpec };
        };
        const deployment = data.raw || data.workload;
        setSpec(deployment?.spec || null);

        const specData = deployment?.spec;
        if (specData?.template?.spec?.containers && Array.isArray(specData.template.spec.containers) && specData.template.spec.containers.length > 0) {
          setSelectedContainer(specData.template.spec.containers[0].name);
        }
      }
    } catch (error) {
      console.error('获取容器信息失败:', error);
      message.error(t('messages.fetchContainerError'));
    } finally {
      setLoading(false);
    }
  }, [clusterId, namespace, workloadName, workloadType, t]);

  useEffect(() => {
    loadSpec();
  }, [loadSpec]);

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '50px 0' }}>
        <Spin tip={t('common:messages.loading')} />
      </div>
    );
  }

  if (!spec || !spec.template?.spec?.containers || spec.template.spec.containers.length === 0) {
    return <Empty description={t("container.noContainers")} />;
  }

  const containers = spec.template.spec.containers;
  const currentContainer = containers.find(c => c.name === selectedContainer);

  // 左侧菜单项
  const menuItems = [
    { key: 'basic', label: t('container.menu.basic') },
    { key: 'lifecycle', label: t('container.menu.lifecycle') },
    { key: 'health', label: t('container.menu.health') },
    { key: 'env', label: t('container.menu.env') },
    { key: 'volume', label: t('container.menu.volume') },
  ];

  // 渲染基本信息
  const renderBasicInfo = () => {
    if (!currentContainer) return null;

    return (
      <div>
        <Card title={t('container.basic.title')} size="small" style={{ marginBottom: 16 }}>
          <Descriptions column={1} bordered size="small">
            <Descriptions.Item label={t('container.basic.containerName')}>{currentContainer.name}</Descriptions.Item>
            <Descriptions.Item label={t('container.basic.imageName')}>
              <code style={{ wordBreak: 'break-all' }}>{currentContainer.image}</code>
            </Descriptions.Item>
            <Descriptions.Item label={t('container.basic.imagePullPolicy')}>
              <Tag color={
                currentContainer.imagePullPolicy === 'Always' ? 'blue' :
                currentContainer.imagePullPolicy === 'Never' ? 'red' : 'green'
              }>
                {currentContainer.imagePullPolicy || 'IfNotPresent'}
              </Tag>
            </Descriptions.Item>
            {currentContainer.workingDir && (
              <Descriptions.Item label={t('container.basic.workingDir')}>{currentContainer.workingDir}</Descriptions.Item>
            )}
            {currentContainer.command && currentContainer.command.length > 0 && (
              <Descriptions.Item label={t('container.basic.command')}>
                <code style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                  {currentContainer.command.join(' ')}
                </code>
              </Descriptions.Item>
            )}
            {currentContainer.args && currentContainer.args.length > 0 && (
              <Descriptions.Item label={t('container.basic.args')}>
                <code style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                  {currentContainer.args.join(' ')}
                </code>
              </Descriptions.Item>
            )}
            {currentContainer.stdin !== undefined && (
              <Descriptions.Item label={t('container.basic.stdin')}>{currentContainer.stdin ? t('container.basic.on') : t('container.basic.off')}</Descriptions.Item>
            )}
            {currentContainer.tty !== undefined && (
              <Descriptions.Item label={t('container.basic.tty')}>{currentContainer.tty ? t('container.basic.on') : t('container.basic.off')}</Descriptions.Item>
            )}
          </Descriptions>
        </Card>

        <Card title={t('container.resources.title')} size="small" style={{ marginBottom: 16 }}>
          <Row gutter={16}>
            <Col span={12}>
              <Card size="small" title={t('container.resources.requests')} type="inner">
                <Descriptions column={1} size="small">
                  <Descriptions.Item label={t('container.resources.cpu')}>{currentContainer.resources?.requests?.cpu || '-'}</Descriptions.Item>
                  <Descriptions.Item label={t('container.resources.memory')}>{currentContainer.resources?.requests?.memory || '-'}</Descriptions.Item>
                  {currentContainer.resources?.requests?.['ephemeral-storage'] && (
                    <Descriptions.Item label={t('container.resources.ephemeralStorage')}>{currentContainer.resources.requests['ephemeral-storage']}</Descriptions.Item>
                  )}
                </Descriptions>
              </Card>
            </Col>
            <Col span={12}>
              <Card size="small" title={t('container.resources.limits')} type="inner">
                <Descriptions column={1} size="small">
                  <Descriptions.Item label={t('container.resources.cpu')}>{currentContainer.resources?.limits?.cpu || '-'}</Descriptions.Item>
                  <Descriptions.Item label={t('container.resources.memory')}>{currentContainer.resources?.limits?.memory || '-'}</Descriptions.Item>
                  {currentContainer.resources?.limits?.['ephemeral-storage'] && (
                    <Descriptions.Item label={t('container.resources.ephemeralStorage')}>{currentContainer.resources.limits['ephemeral-storage']}</Descriptions.Item>
                  )}
                </Descriptions>
              </Card>
            </Col>
          </Row>
        </Card>

        {currentContainer.ports && currentContainer.ports.length > 0 && (
          <Card title={t('container.ports.title')} size="small" style={{ marginBottom: 16 }}>
            <Descriptions column={1} bordered size="small">
              {currentContainer.ports.map((port, index) => (
                <Descriptions.Item key={index} label={port.name || `${t('container.ports.port')}${index + 1}`}>
                  <Tag color="blue">{port.containerPort}</Tag>
                  <Tag>{port.protocol || 'TCP'}</Tag>
                </Descriptions.Item>
              ))}
            </Descriptions>
          </Card>
        )}

        {currentContainer.securityContext && (
          <Card title={t('container.security.title')} size="small">
            <Descriptions column={1} bordered size="small">
              {currentContainer.securityContext.privileged !== undefined && (
                <Descriptions.Item label={t('container.security.privileged')}>
                  <Tag color={currentContainer.securityContext.privileged ? 'red' : 'green'}>
                    {currentContainer.securityContext.privileged ? t('container.basic.on') : t('container.basic.off')}
                  </Tag>
                </Descriptions.Item>
              )}
              {currentContainer.securityContext.runAsUser !== undefined && (
                <Descriptions.Item label={t('container.security.runAsUser')}>{currentContainer.securityContext.runAsUser}</Descriptions.Item>
              )}
              {currentContainer.securityContext.runAsGroup !== undefined && (
                <Descriptions.Item label={t('container.security.runAsGroup')}>{currentContainer.securityContext.runAsGroup}</Descriptions.Item>
              )}
              {currentContainer.securityContext.runAsNonRoot !== undefined && (
                <Descriptions.Item label={t('container.security.runAsNonRoot')}>
                  <Tag color={currentContainer.securityContext.runAsNonRoot ? 'green' : 'orange'}>
                    {currentContainer.securityContext.runAsNonRoot ? t('container.security.yes') : t('container.security.no')}
                  </Tag>
                </Descriptions.Item>
              )}
              {currentContainer.securityContext.readOnlyRootFilesystem !== undefined && (
                <Descriptions.Item label={t('container.security.readOnlyRootFs')}>
                  <Tag color={currentContainer.securityContext.readOnlyRootFilesystem ? 'green' : 'orange'}>
                    {currentContainer.securityContext.readOnlyRootFilesystem ? t('container.security.yes') : t('container.security.no')}
                  </Tag>
                </Descriptions.Item>
              )}
              {currentContainer.securityContext.allowPrivilegeEscalation !== undefined && (
                <Descriptions.Item label={t('container.security.allowPrivilegeEscalation')}>
                  <Tag color={currentContainer.securityContext.allowPrivilegeEscalation ? 'red' : 'green'}>
                    {currentContainer.securityContext.allowPrivilegeEscalation ? t('container.security.yes') : t('container.security.no')}
                  </Tag>
                </Descriptions.Item>
              )}
              {currentContainer.securityContext.capabilities?.add && currentContainer.securityContext.capabilities.add.length > 0 && (
                <Descriptions.Item label={t('container.security.addCapabilities')}>
                  {currentContainer.securityContext.capabilities.add.map((cap, idx) => (
                    <Tag key={idx} color="orange">{cap}</Tag>
                  ))}
                </Descriptions.Item>
              )}
              {currentContainer.securityContext.capabilities?.drop && currentContainer.securityContext.capabilities.drop.length > 0 && (
                <Descriptions.Item label={t('container.security.dropCapabilities')}>
                  {currentContainer.securityContext.capabilities.drop.map((cap, idx) => (
                    <Tag key={idx} color="green">{cap}</Tag>
                  ))}
                </Descriptions.Item>
              )}
            </Descriptions>
          </Card>
        )}
      </div>
    );
  };

  // 渲染生命周期
  const renderLifecycle = () => {
    if (!currentContainer) return null;

    const { command, args, workingDir, lifecycle } = currentContainer;
    const hasLifecycleConfig = command || args || workingDir || lifecycle?.postStart || lifecycle?.preStop;

    if (!hasLifecycleConfig) {
      return (
        <Card title={t("container.lifecycle.title")} size="small">
          <Empty description={t("container.lifecycle.noConfig")} />
        </Card>
      );
    }

    return (
      <div>
        <Card title={t('container.lifecycle.command')} size="small" style={{ marginBottom: 16 }}>
          <Descriptions column={1} size="small" bordered>
            <Descriptions.Item label="Command (ENTRYPOINT)">
              {command && command.length > 0 ? (
                <code style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                  {command.join(' ')}
                </code>
              ) : '-'}
            </Descriptions.Item>
            <Descriptions.Item label="Args (CMD)">
              {args && args.length > 0 ? (
                <code style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                  {args.join(' ')}
                </code>
              ) : '-'}
            </Descriptions.Item>
            <Descriptions.Item label={t('container.lifecycle.workingDir')}>
              {workingDir || '-'}
            </Descriptions.Item>
          </Descriptions>
        </Card>

        <Card title={t('container.lifecycle.postStart')} size="small" style={{ marginBottom: 16 }}>
          {lifecycle?.postStart ? (
            <Descriptions column={1} size="small">
              {lifecycle.postStart.exec && (
                <Descriptions.Item label={t('container.lifecycle.execCommand')}>
                  <code style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                    {lifecycle.postStart.exec.command?.join(' ') || '-'}
                  </code>
                </Descriptions.Item>
              )}
              {lifecycle.postStart.httpGet && (
                <>
                  <Descriptions.Item label={t('container.lifecycle.httpRequest')}>
                    {lifecycle.postStart.httpGet.scheme || 'HTTP'}://{lifecycle.postStart.httpGet.host || 'localhost'}:{lifecycle.postStart.httpGet.port}{lifecycle.postStart.httpGet.path}
                  </Descriptions.Item>
                </>
              )}
              {lifecycle.postStart.tcpSocket && (
                <Descriptions.Item label={t('container.lifecycle.tcpPort')}>
                  {lifecycle.postStart.tcpSocket.host || 'localhost'}:{lifecycle.postStart.tcpSocket.port}
                </Descriptions.Item>
              )}
            </Descriptions>
          ) : (
            <Empty description={t("container.lifecycle.noPostStart")} image={Empty.PRESENTED_IMAGE_SIMPLE} />
          )}
        </Card>

        <Card title={t('container.lifecycle.preStop')} size="small">
          {lifecycle?.preStop ? (
            <Descriptions column={1} size="small">
              {lifecycle.preStop.exec && (
                <Descriptions.Item label={t('container.lifecycle.execCommand')}>
                  <code style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                    {lifecycle.preStop.exec.command?.join(' ') || '-'}
                  </code>
                </Descriptions.Item>
              )}
              {lifecycle.preStop.httpGet && (
                <>
                  <Descriptions.Item label={t('container.lifecycle.httpRequest')}>
                    {lifecycle.preStop.httpGet.scheme || 'HTTP'}://{lifecycle.preStop.httpGet.host || 'localhost'}:{lifecycle.preStop.httpGet.port}{lifecycle.preStop.httpGet.path}
                  </Descriptions.Item>
                </>
              )}
              {lifecycle.preStop.tcpSocket && (
                <Descriptions.Item label={t('container.lifecycle.tcpPort')}>
                  {lifecycle.preStop.tcpSocket.host || 'localhost'}:{lifecycle.preStop.tcpSocket.port}
                </Descriptions.Item>
              )}
            </Descriptions>
          ) : (
            <Empty description={t("container.lifecycle.noPreStop")} image={Empty.PRESENTED_IMAGE_SIMPLE} />
          )}
        </Card>
      </div>
    );
  };

  // 渲染探针详情的通用组件
  const renderProbeDetail = (probe: ProbeConfig | undefined, title: string) => {
    if (!probe) {
      return (
        <Card title={title} size="small" style={{ marginBottom: 16 }}>
          <Empty description={t('container.probe.notConfigured', { name: title })} image={Empty.PRESENTED_IMAGE_SIMPLE} />
        </Card>
      );
    }

    // 确定探针类型
    let probeType = t('container.probe.unknown');
    if (probe.httpGet) probeType = t('container.probe.httpGet');
    else if (probe.tcpSocket) probeType = t('container.probe.tcpSocket');
    else if (probe.exec) probeType = t('container.probe.exec');
    else if (probe.grpc) probeType = t('container.probe.grpc');

    return (
      <Card title={title} size="small" style={{ marginBottom: 16 }}>
        <Descriptions column={1} size="small" bordered>
          <Descriptions.Item label={t('container.probe.checkType')}>
            <Tag color="blue">{probeType}</Tag>
          </Descriptions.Item>
          
          {/* HTTP GET 配置 */}
          {probe.httpGet && (
            <>
              <Descriptions.Item label={t('container.probe.httpPath')}>{probe.httpGet.path || '/'}</Descriptions.Item>
              <Descriptions.Item label={t('container.probe.port')}>{probe.httpGet.port}</Descriptions.Item>
              <Descriptions.Item label={t('container.probe.protocol')}>{probe.httpGet.scheme || 'HTTP'}</Descriptions.Item>
              {probe.httpGet.host && (
                <Descriptions.Item label={t('container.probe.host')}>{probe.httpGet.host}</Descriptions.Item>
              )}
              {probe.httpGet.httpHeaders && probe.httpGet.httpHeaders.length > 0 && (
                <Descriptions.Item label={t('container.probe.httpHeaders')}>
                  {probe.httpGet.httpHeaders.map((header: { name: string; value: string }, idx: number) => (
                    <Tag key={idx}>{header.name}: {header.value}</Tag>
                  ))}
                </Descriptions.Item>
              )}
            </>
          )}
          
          {/* TCP Socket 配置 */}
          {probe.tcpSocket && (
            <>
              <Descriptions.Item label={t('container.probe.tcpPort')}>{probe.tcpSocket.port}</Descriptions.Item>
              {probe.tcpSocket.host && (
                <Descriptions.Item label={t('container.probe.host')}>{probe.tcpSocket.host}</Descriptions.Item>
              )}
            </>
          )}
          
          {/* Exec 配置 */}
          {probe.exec && (
            <Descriptions.Item label={t('container.probe.exec')}>
              <code style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                {probe.exec.command?.join(' ') || '-'}
              </code>
            </Descriptions.Item>
          )}
          
          {/* gRPC 配置 */}
          {probe.grpc && (
            <>
              <Descriptions.Item label={t('container.probe.grpcPort')}>{probe.grpc.port}</Descriptions.Item>
              {probe.grpc.service && (
                <Descriptions.Item label={t('container.probe.serviceName')}>{probe.grpc.service}</Descriptions.Item>
              )}
            </>
          )}
          
          {/* 通用配置 */}
          <Descriptions.Item label={t('container.probe.initialDelay')}>{probe.initialDelaySeconds || 0} {t('container.probe.seconds')}</Descriptions.Item>
          <Descriptions.Item label={t('container.probe.checkInterval')}>{probe.periodSeconds || 10} {t('container.probe.seconds')}</Descriptions.Item>
          <Descriptions.Item label={t('container.probe.timeout')}>{probe.timeoutSeconds || 1} {t('container.probe.seconds')}</Descriptions.Item>
          <Descriptions.Item label={t('container.probe.successThreshold')}>{probe.successThreshold || 1} {t('container.probe.times')}</Descriptions.Item>
          <Descriptions.Item label={t('container.probe.failureThreshold')}>{probe.failureThreshold || 3} {t('container.probe.times')}</Descriptions.Item>
          {probe.terminationGracePeriodSeconds !== undefined && (
            <Descriptions.Item label={t('container.probe.terminationGracePeriod')}>{probe.terminationGracePeriodSeconds} {t('container.probe.seconds')}</Descriptions.Item>
          )}
        </Descriptions>
      </Card>
    );
  };

  // 渲染健康检查
  const renderHealthCheck = () => {
    if (!currentContainer) return null;

    return (
      <div>
        {renderProbeDetail(currentContainer.startupProbe, t('container.probe.startup'))}
        {renderProbeDetail(currentContainer.livenessProbe, t('container.probe.liveness'))}
        {renderProbeDetail(currentContainer.readinessProbe, t('container.probe.readiness'))}
      </div>
    );
  };

  // 环境变量值来源类型
  type EnvValueFrom = {
    configMapKeyRef?: { name: string; key: string; optional?: boolean };
    secretKeyRef?: { name: string; key: string; optional?: boolean };
    fieldRef?: { fieldPath: string; apiVersion?: string };
    resourceFieldRef?: { containerName?: string; resource: string; divisor?: string };
  };
  
  // 渲染环境变量值来源
  const renderEnvValueFrom = (valueFrom: EnvValueFrom | undefined) => {
    if (!valueFrom) return '-';
    
    if (valueFrom.configMapKeyRef) {
      return (
        <span>
          <Tag color="blue">ConfigMap</Tag>
          {valueFrom.configMapKeyRef.name} / {valueFrom.configMapKeyRef.key}
          {valueFrom.configMapKeyRef.optional && <Tag>{t('container.env.optional')}</Tag>}
        </span>
      );
    }
    if (valueFrom.secretKeyRef) {
      return (
        <span>
          <Tag color="orange">Secret</Tag>
          {valueFrom.secretKeyRef.name} / {valueFrom.secretKeyRef.key}
          {valueFrom.secretKeyRef.optional && <Tag>{t('container.env.optional')}</Tag>}
        </span>
      );
    }
    if (valueFrom.fieldRef) {
      return (
        <span>
          <Tag color="green">{t('container.env.podField')}</Tag>
          {valueFrom.fieldRef.fieldPath}
        </span>
      );
    }
    if (valueFrom.resourceFieldRef) {
      return (
        <span>
          <Tag color="purple">{t('container.env.resourceField')}</Tag>
          {valueFrom.resourceFieldRef.containerName && `${valueFrom.resourceFieldRef.containerName}/`}
          {valueFrom.resourceFieldRef.resource}
        </span>
      );
    }
    return JSON.stringify(valueFrom);
  };

  // 渲染环境变量
  const renderEnvVars = () => {
    const hasEnv = currentContainer?.env && currentContainer.env.length > 0;
    const hasEnvFrom = currentContainer?.envFrom && currentContainer.envFrom.length > 0;

    if (!currentContainer || (!hasEnv && !hasEnvFrom)) {
      return <Empty description={t("container.env.noEnv")} />;
    }

    return (
      <div>
        {/* EnvFrom 配置 */}
        {hasEnvFrom && (
          <Card title={t('container.env.envFrom')} size="small" style={{ marginBottom: 16 }}>
            <Descriptions column={1} size="small" bordered>
              {currentContainer.envFrom!.map((envFrom, index) => {
                if (envFrom.configMapRef) {
                  return (
                    <Descriptions.Item key={index} label={<Tag color="blue">ConfigMap</Tag>}>
                      {envFrom.configMapRef.name}
                      {envFrom.prefix && <span> ({t('container.env.prefix')}: {envFrom.prefix})</span>}
                      {envFrom.configMapRef.optional && <Tag>{t('container.env.optional')}</Tag>}
                    </Descriptions.Item>
                  );
                }
                if (envFrom.secretRef) {
                  return (
                    <Descriptions.Item key={index} label={<Tag color="orange">Secret</Tag>}>
                      {envFrom.secretRef.name}
                      {envFrom.prefix && <span> ({t('container.env.prefix')}: {envFrom.prefix})</span>}
                      {envFrom.secretRef.optional && <Tag>{t('container.env.optional')}</Tag>}
                    </Descriptions.Item>
                  );
                }
                return null;
              })}
            </Descriptions>
          </Card>
        )}

        {/* 环境变量列表 */}
        {hasEnv && (
          <Card title={t('container.env.title')} size="small">
            <Descriptions column={1} size="small" bordered>
              {currentContainer.env!.map((env, index) => (
                <Descriptions.Item key={index} label={<code>{env.name}</code>}>
                  {env.value ? (
                    <code style={{ wordBreak: 'break-all' }}>{env.value}</code>
                  ) : (
                    renderEnvValueFrom(env.valueFrom)
                  )}
                </Descriptions.Item>
              ))}
            </Descriptions>
          </Card>
        )}
      </div>
    );
  };

  // 渲染数据存储
  const renderVolumeMounts = () => {
    if (!currentContainer || !currentContainer.volumeMounts || currentContainer.volumeMounts.length === 0) {
      return <Empty description={t("container.volume.noMounts")} />;
    }

    // 查找卷的类型信息
    const getVolumeInfo = (volumeName: string) => {
      if (!spec?.template?.spec?.volumes) return null;
      return spec.template.spec.volumes.find(v => v.name === volumeName);
    };

    // 渲染卷类型
    const renderVolumeType = (volume: VolumeConfig | null | undefined) => {
      if (!volume) return <Tag>{t('container.volume.unknown')}</Tag>;
      if (volume.configMap) return <Tag color="blue">ConfigMap: {volume.configMap.name}</Tag>;
      if (volume.secret) return <Tag color="orange">Secret: {volume.secret.secretName}</Tag>;
      if (volume.emptyDir) return <Tag color="green">EmptyDir</Tag>;
      if (volume.hostPath) return <Tag color="red">HostPath: {volume.hostPath.path}</Tag>;
      if (volume.persistentVolumeClaim) return <Tag color="purple">PVC: {volume.persistentVolumeClaim.claimName}</Tag>;
      if (volume.downwardAPI) return <Tag color="cyan">DownwardAPI</Tag>;
      if (volume.projected) return <Tag color="geekblue">Projected</Tag>;
      if (volume.nfs) return <Tag color="volcano">NFS: {volume.nfs.server}:{volume.nfs.path}</Tag>;
      return <Tag>{t('container.volume.other')}</Tag>;
    };

    return (
      <div>
        <Card title={t('container.volume.mounts')} size="small" style={{ marginBottom: 16 }}>
          {currentContainer.volumeMounts.map((mount, index) => {
            const volumeInfo = getVolumeInfo(mount.name);
            return (
              <Card 
                key={index} 
                size="small" 
                title={mount.name}
                extra={renderVolumeType(volumeInfo)}
                style={{ marginBottom: 8 }}
                type="inner"
              >
                <Descriptions column={2} size="small">
                  <Descriptions.Item label={t('container.volume.mountPath')}>
                    <code>{mount.mountPath}</code>
                  </Descriptions.Item>
                  <Descriptions.Item label={t('container.volume.readOnly')}>
                    <Tag color={mount.readOnly ? 'orange' : 'green'}>
                      {mount.readOnly ? t('container.volume.yes') : t('container.volume.no')}
                    </Tag>
                  </Descriptions.Item>
                  {mount.subPath && (
                    <Descriptions.Item label={t('container.volume.subPath')}>{mount.subPath}</Descriptions.Item>
                  )}
                  {mount.subPathExpr && (
                    <Descriptions.Item label={t('container.volume.subPathExpr')}>{mount.subPathExpr}</Descriptions.Item>
                  )}
                </Descriptions>
              </Card>
            );
          })}
        </Card>

        {/* 显示所有 volumes 定义 */}
        {spec?.template?.spec?.volumes && spec.template.spec.volumes.length > 0 && (
          <Card title={t('container.volume.definitions')} size="small">
            {spec.template.spec.volumes.map((volume, index) => (
              <Card 
                key={index} 
                size="small" 
                title={volume.name}
                extra={renderVolumeType(volume)}
                style={{ marginBottom: 8 }}
                type="inner"
              >
                <Descriptions column={1} size="small">
                  {volume.configMap && (
                    <>
                      <Descriptions.Item label={t('container.volume.configMapName')}>{volume.configMap.name}</Descriptions.Item>
                      {volume.configMap.defaultMode !== undefined && (
                        <Descriptions.Item label={t('container.volume.defaultMode')}>{volume.configMap.defaultMode.toString(8)}</Descriptions.Item>
                      )}
                      {volume.configMap.items && (
                        <Descriptions.Item label={t('container.volume.specifiedKeys')}>
                          {volume.configMap.items.map((item: { key: string; path: string; mode?: number }, idx: number) => (
                            <Tag key={idx}>{item.key} → {item.path}</Tag>
                          ))}
                        </Descriptions.Item>
                      )}
                    </>
                  )}
                  {volume.secret && (
                    <>
                      <Descriptions.Item label={t('container.volume.secretName')}>{volume.secret.secretName}</Descriptions.Item>
                      {volume.secret.defaultMode !== undefined && (
                        <Descriptions.Item label={t('container.volume.defaultMode')}>{volume.secret.defaultMode.toString(8)}</Descriptions.Item>
                      )}
                    </>
                  )}
                  {volume.emptyDir && (
                    <>
                      {volume.emptyDir.medium && (
                        <Descriptions.Item label={t('container.volume.storageMedium')}>{volume.emptyDir.medium}</Descriptions.Item>
                      )}
                      {volume.emptyDir.sizeLimit && (
                        <Descriptions.Item label={t('container.volume.sizeLimit')}>{volume.emptyDir.sizeLimit}</Descriptions.Item>
                      )}
                    </>
                  )}
                  {volume.hostPath && (
                    <>
                      <Descriptions.Item label={t('container.volume.hostPath')}>{volume.hostPath.path}</Descriptions.Item>
                      {volume.hostPath.type && (
                        <Descriptions.Item label={t('container.volume.type')}>{volume.hostPath.type}</Descriptions.Item>
                      )}
                    </>
                  )}
                  {volume.persistentVolumeClaim && (
                    <>
                      <Descriptions.Item label={t('container.volume.pvcName')}>{volume.persistentVolumeClaim.claimName}</Descriptions.Item>
                      {volume.persistentVolumeClaim.readOnly !== undefined && (
                        <Descriptions.Item label={t('container.volume.readOnly')}>{volume.persistentVolumeClaim.readOnly ? t('container.volume.yes') : t('container.volume.no')}</Descriptions.Item>
                      )}
                    </>
                  )}
                  {volume.nfs && (
                    <>
                      <Descriptions.Item label={t('container.volume.nfsServer')}>{volume.nfs.server}</Descriptions.Item>
                      <Descriptions.Item label={t('container.volume.nfsPath')}>{volume.nfs.path}</Descriptions.Item>
                      {volume.nfs.readOnly !== undefined && (
                        <Descriptions.Item label={t('container.volume.readOnly')}>{volume.nfs.readOnly ? '是' : '否'}</Descriptions.Item>
                      )}
                    </>
                  )}
                </Descriptions>
              </Card>
            ))}
          </Card>
        )}
      </div>
    );
  };

  // 渲染内容
  const renderContent = () => {
    switch (selectedSection) {
      case 'basic':
        return renderBasicInfo();
      case 'lifecycle':
        return renderLifecycle();
      case 'health':
        return renderHealthCheck();
      case 'env':
        return renderEnvVars();
      case 'volume':
        return renderVolumeMounts();
      default:
        return null;
    }
  };

  return (
    <div>
      {/* 容器选择 */}
      {containers.length > 1 && (
        <>
          <div style={{ marginBottom: 16 }}>
            <span style={{ marginRight: 8 }}>{t('container.containerList')}</span>
            {containers.map(container => (
              <Tag
                key={container.name}
                color={container.name === selectedContainer ? 'blue' : 'default'}
                style={{ cursor: 'pointer', marginBottom: 8 }}
                onClick={() => setSelectedContainer(container.name)}
              >
                {container.name}
              </Tag>
            ))}
          </div>
          <Divider />
        </>
      )}

      {/* 左侧菜单和右侧内容 */}
      <Row gutter={16}>
        <Col span={4}>
          <Menu
            mode="inline"
            selectedKeys={[selectedSection]}
            items={menuItems}
            onClick={({ key }) => setSelectedSection(key)}
          />
        </Col>
        <Col span={20}>
          {renderContent()}
        </Col>
      </Row>
    </div>
  );
};

export default ContainerTab;

