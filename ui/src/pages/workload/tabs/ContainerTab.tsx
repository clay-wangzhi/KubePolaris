import React, { useState, useEffect } from 'react';
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

  // 加载Deployment Spec
  const loadSpec = async () => {
    if (!clusterId || !namespace || !workloadName || !workloadType) return;
    
    setLoading(true);
    try {
      const response = await WorkloadService.getWorkloadDetail(
        clusterId,
        workloadType,
        namespace,
        workloadName
      );
      
      if (response.code === 200 && response.data) {
        // 使用 raw 字段获取完整的 Deployment 对象
        const deployment = response.data.raw || response.data.workload;
        setSpec(deployment.spec || null);
        
        // 默认选择第一个容器
        if (deployment.spec?.template?.spec?.containers && deployment.spec.template.spec.containers.length > 0) {
          setSelectedContainer(deployment.spec.template.spec.containers[0].name);
        }
      } else {
        message.error(response.message || '获取容器信息失败');
      }
    } catch (error) {
      console.error('获取容器信息失败:', error);
      message.error('获取容器信息失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSpec();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clusterId, namespace, workloadName, workloadType]);

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '50px 0' }}>
        <Spin tip="加载中..." />
      </div>
    );
  }

  if (!spec || !spec.template?.spec?.containers || spec.template.spec.containers.length === 0) {
    return <Empty description="暂无容器信息" />;
  }

  const containers = spec.template.spec.containers;
  const currentContainer = containers.find(c => c.name === selectedContainer);

  // 左侧菜单项
  const menuItems = [
    { key: 'basic', label: '基本信息' },
    { key: 'lifecycle', label: '生命周期' },
    { key: 'health', label: '健康检查' },
    { key: 'env', label: '环境变量' },
    { key: 'volume', label: '数据存储' },
  ];

  // 渲染基本信息
  const renderBasicInfo = () => {
    if (!currentContainer) return null;

    return (
      <div>
        <Card title="基本信息" size="small" style={{ marginBottom: 16 }}>
          <Descriptions column={1} bordered size="small">
            <Descriptions.Item label="容器名称">{currentContainer.name}</Descriptions.Item>
            <Descriptions.Item label="镜像名称">
              <code style={{ wordBreak: 'break-all' }}>{currentContainer.image}</code>
            </Descriptions.Item>
            <Descriptions.Item label="镜像拉取策略">
              <Tag color={
                currentContainer.imagePullPolicy === 'Always' ? 'blue' :
                currentContainer.imagePullPolicy === 'Never' ? 'red' : 'green'
              }>
                {currentContainer.imagePullPolicy || 'IfNotPresent'}
              </Tag>
            </Descriptions.Item>
            {currentContainer.workingDir && (
              <Descriptions.Item label="工作目录">{currentContainer.workingDir}</Descriptions.Item>
            )}
            {currentContainer.command && currentContainer.command.length > 0 && (
              <Descriptions.Item label="启动命令 (Command)">
                <code style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                  {currentContainer.command.join(' ')}
                </code>
              </Descriptions.Item>
            )}
            {currentContainer.args && currentContainer.args.length > 0 && (
              <Descriptions.Item label="启动参数 (Args)">
                <code style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                  {currentContainer.args.join(' ')}
                </code>
              </Descriptions.Item>
            )}
            {currentContainer.stdin !== undefined && (
              <Descriptions.Item label="标准输入 (stdin)">{currentContainer.stdin ? '开启' : '关闭'}</Descriptions.Item>
            )}
            {currentContainer.tty !== undefined && (
              <Descriptions.Item label="TTY">{currentContainer.tty ? '开启' : '关闭'}</Descriptions.Item>
            )}
          </Descriptions>
        </Card>

        <Card title="资源配额" size="small" style={{ marginBottom: 16 }}>
          <Row gutter={16}>
            <Col span={12}>
              <Card size="small" title="请求资源 (Requests)" type="inner">
                <Descriptions column={1} size="small">
                  <Descriptions.Item label="CPU">{currentContainer.resources?.requests?.cpu || '-'}</Descriptions.Item>
                  <Descriptions.Item label="内存">{currentContainer.resources?.requests?.memory || '-'}</Descriptions.Item>
                  {currentContainer.resources?.requests?.['ephemeral-storage'] && (
                    <Descriptions.Item label="临时存储">{currentContainer.resources.requests['ephemeral-storage']}</Descriptions.Item>
                  )}
                </Descriptions>
              </Card>
            </Col>
            <Col span={12}>
              <Card size="small" title="限制资源 (Limits)" type="inner">
                <Descriptions column={1} size="small">
                  <Descriptions.Item label="CPU">{currentContainer.resources?.limits?.cpu || '-'}</Descriptions.Item>
                  <Descriptions.Item label="内存">{currentContainer.resources?.limits?.memory || '-'}</Descriptions.Item>
                  {currentContainer.resources?.limits?.['ephemeral-storage'] && (
                    <Descriptions.Item label="临时存储">{currentContainer.resources.limits['ephemeral-storage']}</Descriptions.Item>
                  )}
                </Descriptions>
              </Card>
            </Col>
          </Row>
        </Card>

        {currentContainer.ports && currentContainer.ports.length > 0 && (
          <Card title="端口配置" size="small" style={{ marginBottom: 16 }}>
            <Descriptions column={1} bordered size="small">
              {currentContainer.ports.map((port, index) => (
                <Descriptions.Item key={index} label={port.name || `端口${index + 1}`}>
                  <Tag color="blue">{port.containerPort}</Tag>
                  <Tag>{port.protocol || 'TCP'}</Tag>
                </Descriptions.Item>
              ))}
            </Descriptions>
          </Card>
        )}

        {currentContainer.securityContext && (
          <Card title="安全上下文" size="small">
            <Descriptions column={1} bordered size="small">
              {currentContainer.securityContext.privileged !== undefined && (
                <Descriptions.Item label="特权模式">
                  <Tag color={currentContainer.securityContext.privileged ? 'red' : 'green'}>
                    {currentContainer.securityContext.privileged ? '开启' : '关闭'}
                  </Tag>
                </Descriptions.Item>
              )}
              {currentContainer.securityContext.runAsUser !== undefined && (
                <Descriptions.Item label="运行用户 UID">{currentContainer.securityContext.runAsUser}</Descriptions.Item>
              )}
              {currentContainer.securityContext.runAsGroup !== undefined && (
                <Descriptions.Item label="运行组 GID">{currentContainer.securityContext.runAsGroup}</Descriptions.Item>
              )}
              {currentContainer.securityContext.runAsNonRoot !== undefined && (
                <Descriptions.Item label="以非Root运行">
                  <Tag color={currentContainer.securityContext.runAsNonRoot ? 'green' : 'orange'}>
                    {currentContainer.securityContext.runAsNonRoot ? '是' : '否'}
                  </Tag>
                </Descriptions.Item>
              )}
              {currentContainer.securityContext.readOnlyRootFilesystem !== undefined && (
                <Descriptions.Item label="只读根文件系统">
                  <Tag color={currentContainer.securityContext.readOnlyRootFilesystem ? 'green' : 'orange'}>
                    {currentContainer.securityContext.readOnlyRootFilesystem ? '是' : '否'}
                  </Tag>
                </Descriptions.Item>
              )}
              {currentContainer.securityContext.allowPrivilegeEscalation !== undefined && (
                <Descriptions.Item label="允许提权">
                  <Tag color={currentContainer.securityContext.allowPrivilegeEscalation ? 'red' : 'green'}>
                    {currentContainer.securityContext.allowPrivilegeEscalation ? '是' : '否'}
                  </Tag>
                </Descriptions.Item>
              )}
              {currentContainer.securityContext.capabilities?.add && currentContainer.securityContext.capabilities.add.length > 0 && (
                <Descriptions.Item label="添加的能力">
                  {currentContainer.securityContext.capabilities.add.map((cap, idx) => (
                    <Tag key={idx} color="orange">{cap}</Tag>
                  ))}
                </Descriptions.Item>
              )}
              {currentContainer.securityContext.capabilities?.drop && currentContainer.securityContext.capabilities.drop.length > 0 && (
                <Descriptions.Item label="移除的能力">
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
        <Card title="生命周期" size="small">
          <Empty description="暂无生命周期配置" />
        </Card>
      );
    }

    return (
      <div>
        <Card title="启动命令" size="small" style={{ marginBottom: 16 }}>
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
            <Descriptions.Item label="工作目录">
              {workingDir || '-'}
            </Descriptions.Item>
          </Descriptions>
        </Card>

        <Card title="启动后操作 (postStart)" size="small" style={{ marginBottom: 16 }}>
          {lifecycle?.postStart ? (
            <Descriptions column={1} size="small">
              {lifecycle.postStart.exec && (
                <Descriptions.Item label="执行命令">
                  <code style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                    {lifecycle.postStart.exec.command?.join(' ') || '-'}
                  </code>
                </Descriptions.Item>
              )}
              {lifecycle.postStart.httpGet && (
                <>
                  <Descriptions.Item label="HTTP请求">
                    {lifecycle.postStart.httpGet.scheme || 'HTTP'}://{lifecycle.postStart.httpGet.host || 'localhost'}:{lifecycle.postStart.httpGet.port}{lifecycle.postStart.httpGet.path}
                  </Descriptions.Item>
                </>
              )}
              {lifecycle.postStart.tcpSocket && (
                <Descriptions.Item label="TCP端口">
                  {lifecycle.postStart.tcpSocket.host || 'localhost'}:{lifecycle.postStart.tcpSocket.port}
                </Descriptions.Item>
              )}
            </Descriptions>
          ) : (
            <Empty description="未配置启动后操作" image={Empty.PRESENTED_IMAGE_SIMPLE} />
          )}
        </Card>

        <Card title="停止前操作 (preStop)" size="small">
          {lifecycle?.preStop ? (
            <Descriptions column={1} size="small">
              {lifecycle.preStop.exec && (
                <Descriptions.Item label="执行命令">
                  <code style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                    {lifecycle.preStop.exec.command?.join(' ') || '-'}
                  </code>
                </Descriptions.Item>
              )}
              {lifecycle.preStop.httpGet && (
                <>
                  <Descriptions.Item label="HTTP请求">
                    {lifecycle.preStop.httpGet.scheme || 'HTTP'}://{lifecycle.preStop.httpGet.host || 'localhost'}:{lifecycle.preStop.httpGet.port}{lifecycle.preStop.httpGet.path}
                  </Descriptions.Item>
                </>
              )}
              {lifecycle.preStop.tcpSocket && (
                <Descriptions.Item label="TCP端口">
                  {lifecycle.preStop.tcpSocket.host || 'localhost'}:{lifecycle.preStop.tcpSocket.port}
                </Descriptions.Item>
              )}
            </Descriptions>
          ) : (
            <Empty description="未配置停止前操作" image={Empty.PRESENTED_IMAGE_SIMPLE} />
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
          <Empty description={`未配置${title}`} image={Empty.PRESENTED_IMAGE_SIMPLE} />
        </Card>
      );
    }

    // 确定探针类型
    let probeType = '未知';
    if (probe.httpGet) probeType = 'HTTP GET';
    else if (probe.tcpSocket) probeType = 'TCP Socket';
    else if (probe.exec) probeType = '执行命令';
    else if (probe.grpc) probeType = 'gRPC';

    return (
      <Card title={title} size="small" style={{ marginBottom: 16 }}>
        <Descriptions column={1} size="small" bordered>
          <Descriptions.Item label="检查类型">
            <Tag color="blue">{probeType}</Tag>
          </Descriptions.Item>
          
          {/* HTTP GET 配置 */}
          {probe.httpGet && (
            <>
              <Descriptions.Item label="HTTP路径">{probe.httpGet.path || '/'}</Descriptions.Item>
              <Descriptions.Item label="端口">{probe.httpGet.port}</Descriptions.Item>
              <Descriptions.Item label="协议">{probe.httpGet.scheme || 'HTTP'}</Descriptions.Item>
              {probe.httpGet.host && (
                <Descriptions.Item label="主机">{probe.httpGet.host}</Descriptions.Item>
              )}
              {probe.httpGet.httpHeaders && probe.httpGet.httpHeaders.length > 0 && (
                <Descriptions.Item label="HTTP头">
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
              <Descriptions.Item label="TCP端口">{probe.tcpSocket.port}</Descriptions.Item>
              {probe.tcpSocket.host && (
                <Descriptions.Item label="主机">{probe.tcpSocket.host}</Descriptions.Item>
              )}
            </>
          )}
          
          {/* Exec 配置 */}
          {probe.exec && (
            <Descriptions.Item label="执行命令">
              <code style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                {probe.exec.command?.join(' ') || '-'}
              </code>
            </Descriptions.Item>
          )}
          
          {/* gRPC 配置 */}
          {probe.grpc && (
            <>
              <Descriptions.Item label="gRPC端口">{probe.grpc.port}</Descriptions.Item>
              {probe.grpc.service && (
                <Descriptions.Item label="服务名">{probe.grpc.service}</Descriptions.Item>
              )}
            </>
          )}
          
          {/* 通用配置 */}
          <Descriptions.Item label="初始延迟">{probe.initialDelaySeconds || 0} 秒</Descriptions.Item>
          <Descriptions.Item label="检查间隔">{probe.periodSeconds || 10} 秒</Descriptions.Item>
          <Descriptions.Item label="超时时间">{probe.timeoutSeconds || 1} 秒</Descriptions.Item>
          <Descriptions.Item label="成功阈值">{probe.successThreshold || 1} 次</Descriptions.Item>
          <Descriptions.Item label="失败阈值">{probe.failureThreshold || 3} 次</Descriptions.Item>
          {probe.terminationGracePeriodSeconds !== undefined && (
            <Descriptions.Item label="终止宽限期">{probe.terminationGracePeriodSeconds} 秒</Descriptions.Item>
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
        {renderProbeDetail(currentContainer.startupProbe, '启动探针 (Startup Probe)')}
        {renderProbeDetail(currentContainer.livenessProbe, '存活探针 (Liveness Probe)')}
        {renderProbeDetail(currentContainer.readinessProbe, '就绪探针 (Readiness Probe)')}
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
          {valueFrom.configMapKeyRef.optional && <Tag>可选</Tag>}
        </span>
      );
    }
    if (valueFrom.secretKeyRef) {
      return (
        <span>
          <Tag color="orange">Secret</Tag>
          {valueFrom.secretKeyRef.name} / {valueFrom.secretKeyRef.key}
          {valueFrom.secretKeyRef.optional && <Tag>可选</Tag>}
        </span>
      );
    }
    if (valueFrom.fieldRef) {
      return (
        <span>
          <Tag color="green">Pod字段</Tag>
          {valueFrom.fieldRef.fieldPath}
        </span>
      );
    }
    if (valueFrom.resourceFieldRef) {
      return (
        <span>
          <Tag color="purple">资源字段</Tag>
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
      return <Empty description="暂无环境变量" />;
    }

    return (
      <div>
        {/* EnvFrom 配置 */}
        {hasEnvFrom && (
          <Card title="环境变量来源 (envFrom)" size="small" style={{ marginBottom: 16 }}>
            <Descriptions column={1} size="small" bordered>
              {currentContainer.envFrom!.map((envFrom, index) => {
                if (envFrom.configMapRef) {
                  return (
                    <Descriptions.Item key={index} label={<Tag color="blue">ConfigMap</Tag>}>
                      {envFrom.configMapRef.name}
                      {envFrom.prefix && <span> (前缀: {envFrom.prefix})</span>}
                      {envFrom.configMapRef.optional && <Tag>可选</Tag>}
                    </Descriptions.Item>
                  );
                }
                if (envFrom.secretRef) {
                  return (
                    <Descriptions.Item key={index} label={<Tag color="orange">Secret</Tag>}>
                      {envFrom.secretRef.name}
                      {envFrom.prefix && <span> (前缀: {envFrom.prefix})</span>}
                      {envFrom.secretRef.optional && <Tag>可选</Tag>}
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
          <Card title="环境变量" size="small">
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
      return <Empty description="暂无数据卷挂载" />;
    }

    // 查找卷的类型信息
    const getVolumeInfo = (volumeName: string) => {
      if (!spec?.template?.spec?.volumes) return null;
      return spec.template.spec.volumes.find(v => v.name === volumeName);
    };

    // 渲染卷类型
    const renderVolumeType = (volume: VolumeConfig | null | undefined) => {
      if (!volume) return <Tag>未知</Tag>;
      if (volume.configMap) return <Tag color="blue">ConfigMap: {volume.configMap.name}</Tag>;
      if (volume.secret) return <Tag color="orange">Secret: {volume.secret.secretName}</Tag>;
      if (volume.emptyDir) return <Tag color="green">EmptyDir</Tag>;
      if (volume.hostPath) return <Tag color="red">HostPath: {volume.hostPath.path}</Tag>;
      if (volume.persistentVolumeClaim) return <Tag color="purple">PVC: {volume.persistentVolumeClaim.claimName}</Tag>;
      if (volume.downwardAPI) return <Tag color="cyan">DownwardAPI</Tag>;
      if (volume.projected) return <Tag color="geekblue">Projected</Tag>;
      if (volume.nfs) return <Tag color="volcano">NFS: {volume.nfs.server}:{volume.nfs.path}</Tag>;
      return <Tag>其他</Tag>;
    };

    return (
      <div>
        <Card title="数据卷挂载" size="small" style={{ marginBottom: 16 }}>
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
                  <Descriptions.Item label="挂载路径">
                    <code>{mount.mountPath}</code>
                  </Descriptions.Item>
                  <Descriptions.Item label="只读">
                    <Tag color={mount.readOnly ? 'orange' : 'green'}>
                      {mount.readOnly ? '是' : '否'}
                    </Tag>
                  </Descriptions.Item>
                  {mount.subPath && (
                    <Descriptions.Item label="子路径">{mount.subPath}</Descriptions.Item>
                  )}
                  {mount.subPathExpr && (
                    <Descriptions.Item label="子路径表达式">{mount.subPathExpr}</Descriptions.Item>
                  )}
                </Descriptions>
              </Card>
            );
          })}
        </Card>

        {/* 显示所有 volumes 定义 */}
        {spec?.template?.spec?.volumes && spec.template.spec.volumes.length > 0 && (
          <Card title="数据卷定义 (Volumes)" size="small">
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
                      <Descriptions.Item label="ConfigMap名称">{volume.configMap.name}</Descriptions.Item>
                      {volume.configMap.defaultMode !== undefined && (
                        <Descriptions.Item label="默认权限">{volume.configMap.defaultMode.toString(8)}</Descriptions.Item>
                      )}
                      {volume.configMap.items && (
                        <Descriptions.Item label="指定Key">
                          {volume.configMap.items.map((item: { key: string; path: string; mode?: number }, idx: number) => (
                            <Tag key={idx}>{item.key} → {item.path}</Tag>
                          ))}
                        </Descriptions.Item>
                      )}
                    </>
                  )}
                  {volume.secret && (
                    <>
                      <Descriptions.Item label="Secret名称">{volume.secret.secretName}</Descriptions.Item>
                      {volume.secret.defaultMode !== undefined && (
                        <Descriptions.Item label="默认权限">{volume.secret.defaultMode.toString(8)}</Descriptions.Item>
                      )}
                    </>
                  )}
                  {volume.emptyDir && (
                    <>
                      {volume.emptyDir.medium && (
                        <Descriptions.Item label="存储介质">{volume.emptyDir.medium}</Descriptions.Item>
                      )}
                      {volume.emptyDir.sizeLimit && (
                        <Descriptions.Item label="大小限制">{volume.emptyDir.sizeLimit}</Descriptions.Item>
                      )}
                    </>
                  )}
                  {volume.hostPath && (
                    <>
                      <Descriptions.Item label="主机路径">{volume.hostPath.path}</Descriptions.Item>
                      {volume.hostPath.type && (
                        <Descriptions.Item label="类型">{volume.hostPath.type}</Descriptions.Item>
                      )}
                    </>
                  )}
                  {volume.persistentVolumeClaim && (
                    <>
                      <Descriptions.Item label="PVC名称">{volume.persistentVolumeClaim.claimName}</Descriptions.Item>
                      {volume.persistentVolumeClaim.readOnly !== undefined && (
                        <Descriptions.Item label="只读">{volume.persistentVolumeClaim.readOnly ? '是' : '否'}</Descriptions.Item>
                      )}
                    </>
                  )}
                  {volume.nfs && (
                    <>
                      <Descriptions.Item label="NFS服务器">{volume.nfs.server}</Descriptions.Item>
                      <Descriptions.Item label="NFS路径">{volume.nfs.path}</Descriptions.Item>
                      {volume.nfs.readOnly !== undefined && (
                        <Descriptions.Item label="只读">{volume.nfs.readOnly ? '是' : '否'}</Descriptions.Item>
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
            <span style={{ marginRight: 8 }}>容器列表：</span>
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

