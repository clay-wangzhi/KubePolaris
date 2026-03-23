import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Card,
  Typography,
  Button,
  Space,
  Tabs,
  Tag,
  Descriptions,
  Table,
  Divider,
  Badge,
  Input,
  Modal,
  message,
  Menu,
  Result,
  Empty,
  Select,
  Alert,
  Checkbox,
  InputNumber,
  Statistic,
} from 'antd';
import {
  ReloadOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  ExclamationCircleOutlined,
  DesktopOutlined,
  CodeOutlined,
  EditOutlined,
  SettingOutlined,
  PauseCircleOutlined,
  WarningOutlined,
  InfoCircleOutlined,
  DeleteOutlined,
  PlusOutlined,
  BarChartOutlined,
  AppstoreOutlined,
  DownloadOutlined,
  ArrowLeftOutlined,
} from '@ant-design/icons';
import { nodeService } from '../../services/nodeService';
import { PodService } from '../../services/podService';
import type { Node, NodeTaint, Pod, NodeCondition } from '../../types';
import type { ColumnsType } from 'antd/es/table';
import SSHTerminal from '../../components/SSHTerminal';
import MonitoringCharts from '../../components/MonitoringCharts';

const { Title, Text } = Typography;

const NodeDetail: React.FC = () => {
  const { clusterId, nodeName } = useParams<{ clusterId: string; nodeName: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { t } = useTranslation('node');
  const { t: tc } = useTranslation('common');
  
  // 从 URL 参数读取默认标签页
  const defaultTab = searchParams.get('tab') || 'overview';
  
  const [loading, setLoading] = useState(false);
  const [node, setNode] = useState<Node | null>(null);
  const [pods, setPods] = useState<Pod[]>([]);
  const [activeTab, setActiveTab] = useState(defaultTab);
  const [loadingPods, setLoadingPods] = useState(false);
  const [labelModalVisible, setLabelModalVisible] = useState(false);
  const [taintModalVisible, setTaintModalVisible] = useState(false);
  const [newLabelKey, setNewLabelKey] = useState('');
  const [newLabelValue, setNewLabelValue] = useState('');
  const [newTaintKey, setNewTaintKey] = useState('');
  const [newTaintValue, setNewTaintValue] = useState('');
  const [newTaintEffect, setNewTaintEffect] = useState<'NoSchedule' | 'PreferNoSchedule' | 'NoExecute'>('NoSchedule');
  const [drainModalVisible, setDrainModalVisible] = useState(false);
  const [drainOptions, setDrainOptions] = useState({
    ignoreDaemonSets: true,
    deleteLocalData: false,
    force: false,
    gracePeriodSeconds: 30,
  });

  // 获取节点详情
  const fetchNodeDetail = useCallback(async () => {
    if (!clusterId || !nodeName) return;
    
    setLoading(true);
    try {
      const response = await nodeService.getNode(clusterId, nodeName);
      setNode(response);
    } catch (error) {
      console.error('Failed to fetch node details:', error);
      message.error(t('messages.fetchError'));
    } finally {
      setLoading(false);
    }
  }, [clusterId, nodeName, t]);

  // 获取节点上的Pod列表
  const fetchNodePods = useCallback(async () => {
    if (!clusterId || !nodeName) return;
    
    setLoadingPods(true);
    try {
      // 调用真实API，传入 nodeName 参数过滤该节点上的 Pod
      const response = await PodService.getPods(
        clusterId,
        undefined, // namespace: 获取所有命名空间
        nodeName,  // nodeName: 过滤该节点上的 Pod
        undefined, // labelSelector
        undefined, // fieldSelector
        undefined, // search
        1,         // page
        1000       // pageSize: 获取所有 Pod
      );
      
      if (response?.items) {
        const convertedPods: Pod[] = response.items.map((podInfo) => {
          // 聚合所有容器的 CPU 和内存 limits
          let totalCpuLimit = 0; // 单位: m (millicore)
          let totalMemoryLimit = 0; // 单位: Mi
          
          podInfo.containers.forEach((c) => {
            if (c.resources?.limits) {
              // 解析 CPU limit (例如: "100m", "1", "0.5")
              const cpuStr = c.resources.limits.cpu || c.resources.limits.CPU || '';
              if (cpuStr) {
                if (cpuStr.endsWith('m')) {
                  totalCpuLimit += parseInt(cpuStr.replace('m', ''), 10) || 0;
                } else {
                  totalCpuLimit += (parseFloat(cpuStr) || 0) * 1000;
                }
              }
              
              // 解析 Memory limit (例如: "128Mi", "1Gi", "256M")
              const memStr = c.resources.limits.memory || c.resources.limits.Memory || '';
              if (memStr) {
                if (memStr.endsWith('Gi')) {
                  totalMemoryLimit += (parseFloat(memStr.replace('Gi', '')) || 0) * 1024;
                } else if (memStr.endsWith('Mi')) {
                  totalMemoryLimit += parseFloat(memStr.replace('Mi', '')) || 0;
                } else if (memStr.endsWith('Ki')) {
                  totalMemoryLimit += (parseFloat(memStr.replace('Ki', '')) || 0) / 1024;
                } else if (memStr.endsWith('G')) {
                  totalMemoryLimit += (parseFloat(memStr.replace('G', '')) || 0) * 1024;
                } else if (memStr.endsWith('M')) {
                  totalMemoryLimit += parseFloat(memStr.replace('M', '')) || 0;
                } else if (memStr.endsWith('K')) {
                  totalMemoryLimit += (parseFloat(memStr.replace('K', '')) || 0) / 1024;
                } else {
                  // 纯数字，假设是字节
                  totalMemoryLimit += (parseFloat(memStr) || 0) / (1024 * 1024);
                }
              }
            }
          });
          
          return {
            id: podInfo.name,
            name: podInfo.name,
            namespace: podInfo.namespace,
            clusterId: clusterId || '',
            nodeName: podInfo.nodeName,
            status: podInfo.status as Pod['status'],
            phase: podInfo.phase,
            restartCount: podInfo.restartCount,
            cpuUsage: totalCpuLimit, // 存储 CPU limit (单位: m)
            memoryUsage: totalMemoryLimit, // 存储 Memory limit (单位: Mi)
            containers: podInfo.containers.map((c) => ({
              name: c.name,
              image: c.image,
              ready: c.ready,
              restartCount: c.restartCount,
              state: {
                running: c.state.state === 'Running' ? { startedAt: c.state.startedAt || '' } : undefined,
                waiting: c.state.state === 'Waiting' ? { reason: c.state.reason || '', message: c.state.message } : undefined,
                terminated: c.state.state === 'Terminated' ? { 
                  exitCode: 0, 
                  reason: c.state.reason || '', 
                  message: c.state.message,
                  startedAt: c.state.startedAt || '',
                  finishedAt: ''
                } : undefined,
              },
            })),
            labels: podInfo.labels || {},
            createdAt: podInfo.createdAt,
          };
        });
        setPods(convertedPods);
      } else {
        setPods([]);
      }
    } catch (error) {
      console.error('Failed to fetch node pods:', error);
      setPods([]);
    } finally {
      setLoadingPods(false);
    }
  }, [clusterId, nodeName]);

  // 刷新所有数据
  const refreshAllData = () => {
    fetchNodeDetail();
    fetchNodePods();
  };

  // 导出 Pod 列表为 CSV
  const handleExportPods = () => {
    if (pods.length === 0) {
      message.warning(tc('messages.noData'));
      return;
    }

    // CSV 表头 - 使用翻译键
    const headers = [tc('table.name'), tc('table.namespace'), tc('table.status'), t('columns.restarts'), t('resources.cpu'), t('resources.memory'), tc('table.createdAt')];
    
    // 构建 CSV 数据
    const csvData = pods.map((pod) => [
      pod.name,
      pod.namespace,
      pod.status,
      pod.restartCount.toString(),
      pod.cpuUsage > 0 ? `${Math.round(pod.cpuUsage)}m` : '-',
      pod.memoryUsage > 0 ? `${Math.round(pod.memoryUsage)}Mi` : '-',
      new Date(pod.createdAt).toLocaleString(),
    ]);

    // 添加表头
    csvData.unshift(headers);

    // 转换为 CSV 字符串
    const csvContent = csvData.map((row) => row.map((cell) => `"${cell}"`).join(',')).join('\n');

    // 添加 BOM 以支持中文
    const BOM = '\uFEFF';
    const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' });
    
    // 创建下载链接
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `${nodeName}_pods_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    message.success(tc('messages.exportSuccess'));
  };

  // 处理节点操作
  const handleCordon = async () => {
    try {
      await nodeService.cordonNode(clusterId || '', nodeName || '');
      message.success(t('messages.cordonSuccess'));
      fetchNodeDetail();
    } catch (error) {
      console.error('Failed to cordon node:', error);
      message.error(t('messages.cordonError'));
    }
  };

  const handleUncordon = async () => {
    try {
      await nodeService.uncordonNode(clusterId || '', nodeName || '');
      message.success(t('messages.uncordonSuccess'));
      fetchNodeDetail();
    } catch (error) {
      console.error('Failed to uncordon node:', error);
      message.error(t('messages.uncordonError'));
    }
  };

  const handleDrain = async () => {
    try {
      await nodeService.drainNode(clusterId || '', nodeName || '', drainOptions);
      message.success(t('messages.drainSuccess'));
      setDrainModalVisible(false);
      fetchNodeDetail();
    } catch (error) {
      console.error('Failed to drain node:', error);
      message.error(t('messages.drainError'));
    }
  };

  // 处理标签操作
  const handleAddLabel = () => {
    if (!newLabelKey || !newLabelValue) {
      message.warning(t('messages.labelKeyValueRequired'));
      return;
    }
    
    message.success(tc('messages.success'));
    // TODO: 实现添加标签的API调用
    setNewLabelKey('');
    setNewLabelValue('');
    setLabelModalVisible(false);
  };

  const handleRemoveLabel = (key: string) => {
    message.success(tc('messages.success'));
    console.log('Remove label:', key);
    // TODO: 实现移除标签的API调用
  };

  // 处理污点操作
  const handleAddTaint = () => {
    if (!newTaintKey) {
      message.warning(t('messages.taintKeyRequired'));
      return;
    }
    
    message.success(tc('messages.success'));
    // TODO: 实现添加污点的API调用
    setNewTaintKey('');
    setNewTaintValue('');
    setNewTaintEffect('NoSchedule');
    setTaintModalVisible(false);
  };

  const handleRemoveTaint = (taint: NodeTaint) => {
    message.success(tc('messages.success'));
    console.log('Remove taint:', taint.key);
    // TODO: 实现移除污点的API调用
  };

  // 获取状态标签
  const getStatusTag = (status: string) => {
    switch (status) {
      case 'Ready':
        return <Tag icon={<CheckCircleOutlined />} color="success">{t('status.ready')}</Tag>;
      case 'NotReady':
        return <Tag icon={<CloseCircleOutlined />} color="error">{t('status.notReady')}</Tag>;
      default:
        return <Tag icon={<ExclamationCircleOutlined />} color="default">{t('status.unknown')}</Tag>;
    }
  };

  // 获取节点条件状态
  const getConditionStatus = (condition: NodeCondition) => {
    if (condition.status === 'True') {
      return <Badge status="success" text={tc('status.healthy')} />;
    } else if (condition.status === 'False') {
      // 对于某些条件，False是正常的（如DiskPressure, MemoryPressure等）
      if (['DiskPressure', 'MemoryPressure', 'PIDPressure', 'NetworkUnavailable'].includes(condition.type)) {
        return <Badge status="success" text={tc('status.healthy')} />;
      }
      return <Badge status="error" text={tc('status.unhealthy')} />;
    } else {
      return <Badge status="default" text={t('status.unknown')} />;
    }
  };

  // Pod表格列定义
  const podColumns: ColumnsType<Pod> = [
    {
      title: tc('table.status'),
      key: 'status',
      width: 60,
      render: (_, record) => {
        if (record.status === 'Running') {
          return <Badge status="success" />;
        } else if (record.status === 'Pending') {
          return <Badge status="processing" />;
        } else if (record.status === 'Succeeded') {
          return <Badge status="default" />;
        } else {
          return <Badge status="error" />;
        }
      },
    },
    {
      title: tc('table.name'),
      dataIndex: 'name',
      key: 'name',
      render: (text, record) => (
        <a onClick={() => navigate(`/clusters/${clusterId}/namespaces/${record.namespace}/pods/${text}`)}>
          {text}
        </a>
      ),
    },
    {
      title: tc('table.namespace'),
      dataIndex: 'namespace',
      key: 'namespace',
      render: (namespace) => <Tag color="blue">{namespace}</Tag>,
    },
    {
      title: tc('table.status'),
      dataIndex: 'status',
      key: 'podStatus',
      render: (status) => {
        if (status === 'Running') {
          return <Tag color="success">{tc('status.running')}</Tag>;
        } else if (status === 'Pending') {
          return <Tag color="processing">{tc('status.pending')}</Tag>;
        } else if (status === 'Succeeded') {
          return <Tag color="default">{tc('status.succeeded')}</Tag>;
        } else {
          return <Tag color="error">{tc('status.failed')}</Tag>;
        }
      },
    },
    {
      title: t('columns.restarts'),
      dataIndex: 'restartCount',
      key: 'restartCount',
    },
    {
      title: t('resources.cpu'),
      key: 'cpuLimit',
      render: (_, record) => record.cpuUsage > 0 ? `${Math.round(record.cpuUsage)}m` : '-',
    },
    {
      title: t('resources.memory'),
      key: 'memoryLimit',
      render: (_, record) => record.memoryUsage > 0 ? `${Math.round(record.memoryUsage)}Mi` : '-',
    },
    {
      title: tc('table.createdAt'),
      dataIndex: 'createdAt',
      key: 'createdAt',
      render: (time) => new Date(time).toLocaleString(),
    },
  ];

  // 更多操作菜单（未使用，保留以备将来使用）
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const moreActionsMenu = (
    <Menu>
      {node?.taints?.some(taint => taint.effect === 'NoSchedule') ? (
        <Menu.Item key="uncordon" onClick={handleUncordon} icon={<CheckCircleOutlined />}>
          {t('actions.uncordon')}
        </Menu.Item>
      ) : (
        <Menu.Item key="cordon" onClick={handleCordon} icon={<PauseCircleOutlined />}>
          {t('actions.cordon')}
        </Menu.Item>
      )}
      <Menu.Item 
        key="drain" 
        onClick={() => setDrainModalVisible(true)} 
        icon={<WarningOutlined />}
        danger
      >
        {t('actions.drain')}
      </Menu.Item>
      <Menu.Divider />
      <Menu.Item key="labels" onClick={() => setLabelModalVisible(true)} icon={<EditOutlined />}>
        {t('detail.editLabels')}
      </Menu.Item>
      <Menu.Item key="taints" onClick={() => setTaintModalVisible(true)} icon={<SettingOutlined />}>
        {t('detail.manageTaints')}
      </Menu.Item>
      <Menu.Item key="events" icon={<InfoCircleOutlined />}>
        {t('detail.viewEvents')}
      </Menu.Item>
    </Menu>
  );

  // 初始化加载
  useEffect(() => {
    if (clusterId && nodeName) {
      fetchNodeDetail();
      fetchNodePods();
    }
  }, [clusterId, nodeName, fetchNodeDetail, fetchNodePods]);

  if (!node && !loading) {
    return (
      <Card>
        <Result
          status="404"
          title={t('messages.nodeNotFound')}
          subTitle={t('messages.checkNodeName')}
          extra={
            <Button type="primary" onClick={() => navigate(`/clusters/${clusterId}/nodes`)}>
              {t('actions.backToList')}
            </Button>
          }
        />
      </Card>
    );
  }

  return (
    <div>
      {/* 页面头部 */}
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 24 }}>
          <Button
            type="text"
            icon={<ArrowLeftOutlined />}
            onClick={() => navigate(`/clusters/${clusterId}/nodes`)}
            style={{ marginRight: 16 }}
          >
            {t('actions.backToList')}
          </Button>
          <div style={{ flex: 1 }}>
            <Title level={2} style={{ margin: 0 }}>
              <DesktopOutlined style={{ marginRight: 8, color: '#1890ff' }} />
              {nodeName}
            </Title>
            <Text type="secondary">{t('detail.subtitle')}</Text>
          </div>
          <Space>
            <Button
              icon={<ReloadOutlined />}
              onClick={refreshAllData}
              loading={loading}
            >
              {tc('actions.refresh')}
            </Button>
            <Button 
              icon={<BarChartOutlined />} 
              type="primary"
              onClick={() => setActiveTab('monitoring')}
            >
              {tc('menu.monitoring')}
            </Button>
          </Space>
        </div>
      </div>

      {node && (
        <>
          {/* 节点基本信息 */}
          <Card style={{ marginBottom: 24 }}>
            <Descriptions title={t('detail.info')} column={3}>
              <Descriptions.Item label={t('columns.name')}>{node.name}</Descriptions.Item>
              <Descriptions.Item label={t('detail.kubeletVersion')}>{node.kubeletVersion}</Descriptions.Item>
              <Descriptions.Item label={t('columns.status')}>
                {getStatusTag(node.status)}
              </Descriptions.Item>
              <Descriptions.Item label={t('columns.roles')}>
                <Space>
                  {node.roles.map(role => {
                    const isMaster = role.toLowerCase().includes('master') || role.toLowerCase().includes('control-plane');
                    return (
                      <Tag key={role} color={isMaster ? 'gold' : 'blue'}>
                        {role}
                      </Tag>
                    );
                  })}
                </Space>
              </Descriptions.Item>
              <Descriptions.Item label={t('detail.osImage')}>{node.osImage}</Descriptions.Item>
              <Descriptions.Item label={t('detail.kernelVersion')}>{node.kernelVersion}</Descriptions.Item>
              <Descriptions.Item label={t('detail.containerRuntime')}>{node.containerRuntime}</Descriptions.Item>
              <Descriptions.Item label={t('resources.cpuCapacity')}>{node.resources?.cpu}m</Descriptions.Item>
              <Descriptions.Item label={t('resources.memoryCapacity')}>{node.resources?.memory}Mi</Descriptions.Item>
              <Descriptions.Item label={t('resources.maxPods')}>{node.resources?.pods}</Descriptions.Item>
              <Descriptions.Item label={tc('table.createdAt')}>
                {new Date(node.creationTimestamp).toLocaleString()}
              </Descriptions.Item>
            </Descriptions>
          </Card>

        </>
      )}

      {/* 详细信息标签页 */}
      <Card>
        <Tabs 
          activeKey={activeTab} 
          onChange={setActiveTab}
          items={[
            {
              key: 'monitoring',
              label: (
                <span>
                  <BarChartOutlined />
                  {tc('menu.monitoring')}
                </span>
              ),
              children: (
                <MonitoringCharts 
                  clusterId={clusterId || ''} 
                  nodeName={nodeName}
                  type="node"
                />
              ),
            },
            {
              key: 'overview',
              label: (
                <span>
                  <DesktopOutlined />
                  {t('detail.nodeStatus')}
                </span>
              ),
              children: (
                <Card title={t('detail.nodeStatus')}>
                  <Statistic
                    title={t('columns.status')}
                    value={node?.status || 'Unknown'}
                    valueStyle={{ color: node?.status === 'Ready' ? '#3f8600' : '#cf1322' }}
                    prefix={node?.status === 'Ready' ? <CheckCircleOutlined /> : <CloseCircleOutlined />}
                  />
                  <Divider />
                  <div>
                    <Text strong>{t('detail.schedulingStatus')}: </Text>
                    {node?.unschedulable || node?.taints?.some(taint => taint.effect === 'NoSchedule') ? (
                      <Tag icon={<PauseCircleOutlined />} color="warning">{t('status.unschedulable')}</Tag>
                    ) : (
                      <Tag icon={<CheckCircleOutlined />} color="success">{t('status.schedulable')}</Tag>
                    )}
                  </div>
                  <div style={{ marginTop: 8 }}>
                    <Text strong>{t('detail.conditions')}: </Text>
                    <div style={{ marginTop: 8 }}>
                      {node?.conditions?.map((condition, index) => (
                        <div key={index} style={{ marginBottom: 4 }}>
                          <Space>
                            {getConditionStatus(condition)}
                            <Text>{condition.type}</Text>
                          </Space>
                        </div>
                      ))}
                    </div>
                  </div>
                </Card>
              ),
            },
            {
              key: 'pods',
              label: (
                <span>
                  <AppstoreOutlined />
                  Pod ({pods.length})
                </span>
              ),
              children: (
                <div>
                  <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
                    <Button
                      icon={<DownloadOutlined />}
                      onClick={handleExportPods}
                      disabled={pods.length === 0}
                    >
                      {tc('actions.export')}
                    </Button>
                  </div>
                  <Table
                    columns={podColumns}
                    dataSource={pods}
                    rowKey="id"
                    pagination={{
                      pageSize: 10,
                      showSizeChanger: true,
                      showQuickJumper: true,
                      showTotal: (total) => `${tc('table.total')} ${total} Pod`,
                    }}
                    loading={loadingPods}
                    locale={{ emptyText: tc('messages.noData') }}
                  />
                </div>
              ),
            },
            {
              key: 'labels',
              label: (
                <span>
                  <EditOutlined />
                  {t('detail.labels')}
                </span>
              ),
              children: (
                <div>
                  <Card title={t('detail.systemLabels')} style={{ marginBottom: 16 }}>
                    <Space wrap>
                      {node?.labels && Array.isArray(node.labels) && node.labels
                        .filter(label => label.key.startsWith('kubernetes.io/') || label.key.startsWith('node.kubernetes.io/') || label.key.startsWith('topology.kubernetes.io/'))
                        .map((label: { key: string; value: string }, index: number) => (
                          <Tag key={index} color="blue">
                            {label.key}={label.value}
                          </Tag>
                        ))}
                    </Space>
                  </Card>

                  <Card title={t('detail.customLabels')}>
                    <Space wrap style={{ marginBottom: 16 }}>
                      {node?.labels && Array.isArray(node.labels) && node.labels
                        .filter(label => !label.key.startsWith('kubernetes.io/') && !label.key.startsWith('node.kubernetes.io/') && !label.key.startsWith('topology.kubernetes.io/'))
                        .map((label: { key: string; value: string }, index: number) => (
                          <Tag
                            key={index}
                            closable
                            onClose={() => handleRemoveLabel(label.key)}
                          >
                            {label.key}={label.value}
                          </Tag>
                        ))}
                    </Space>

                    <Button
                      type="dashed"
                      icon={<PlusOutlined />}
                      onClick={() => setLabelModalVisible(true)}
                    >
                      {t('detail.addLabel')}
                    </Button>
                  </Card>
                </div>
              ),
            },
            {
              key: 'taints',
              label: (
                <span>
                  <SettingOutlined />
                  {t('detail.taints')}
                </span>
              ),
              children: (
                <Card title={t('detail.currentTaints')}>
                  {node?.taints && node.taints.length > 0 ? (
                    node.taints.map((taint, index) => (
                      <Card
                        key={index}
                        type="inner"
                        style={{ marginBottom: 16 }}
                        title={`${taint.key}${taint.value ? `=${taint.value}` : ''}:${taint.effect}`}
                        extra={
                          <Button
                            type="text"
                            danger
                            icon={<DeleteOutlined />}
                            onClick={() => handleRemoveTaint(taint)}
                          >
                            {tc('actions.delete')}
                          </Button>
                        }
                      >
                        <Descriptions column={1}>
                          <Descriptions.Item label={t('detail.taintKey')}>{taint.key}</Descriptions.Item>
                          {taint.value && <Descriptions.Item label={t('detail.taintValue')}>{taint.value}</Descriptions.Item>}
                          <Descriptions.Item label={t('detail.taintEffect')}>
                            <Tag color={
                              taint.effect === 'NoSchedule' ? 'orange' :
                              taint.effect === 'PreferNoSchedule' ? 'blue' : 'red'
                            }>
                              {taint.effect}
                            </Tag>
                          </Descriptions.Item>
                          <Descriptions.Item label={t('detail.description')}>
                            {taint.effect === 'NoSchedule' && t('detail.noScheduleDesc')}
                            {taint.effect === 'PreferNoSchedule' && t('detail.preferNoScheduleDesc')}
                            {taint.effect === 'NoExecute' && t('detail.noExecuteDesc')}
                          </Descriptions.Item>
                        </Descriptions>
                      </Card>
                    ))
                  ) : (
                    <Empty description={t('detail.noTaints')} />
                  )}

                  <Button
                    type="dashed"
                    icon={<PlusOutlined />}
                    onClick={() => setTaintModalVisible(true)}
                    style={{ marginTop: 16 }}
                  >
                    {t('detail.addTaint')}
                  </Button>
                </Card>
              ),
            },
            {
              key: 'terminal',
              label: (
                <span>
                  <CodeOutlined />
                  {t('actions.ssh')}
                </span>
              ),
              children: (
                <SSHTerminal
                  nodeIP={node?.addresses?.find(addr => addr.type === 'InternalIP')?.address || ''}
                  nodeName={nodeName || ''}
                  clusterId={clusterId || ''}
                />
              ),
            },
          ]}
        />
      </Card>

      {/* 标签编辑模态框 */}
      <Modal
        title={t('detail.editLabels')}
        open={labelModalVisible}
        onCancel={() => setLabelModalVisible(false)}
        footer={[
          <Button key="cancel" onClick={() => setLabelModalVisible(false)}>
            {tc('actions.cancel')}
          </Button>,
          <Button key="submit" type="primary" onClick={handleAddLabel}>
            {t('detail.addLabel')}
          </Button>,
        ]}
      >
        <div style={{ marginBottom: 16 }}>
          <Text>{t('detail.systemLabelsReadOnly')}:</Text>
          <div style={{ marginTop: 8 }}>
            <Space wrap>
              {node?.labels && Array.isArray(node.labels) && node.labels
                .filter(label => label.key.startsWith('kubernetes.io/') || label.key.startsWith('node.kubernetes.io/') || label.key.startsWith('topology.kubernetes.io/'))
                .map((label: { key: string; value: string }, index: number) => (
                  <Tag key={index} color="blue">
                    {label.key}={label.value}
                  </Tag>
                ))}
            </Space>
          </div>
        </div>

        <div style={{ marginBottom: 16 }}>
          <Text>{t('detail.customLabels')}:</Text>
          <div style={{ marginTop: 8 }}>
            <Space wrap>
              {node?.labels && Array.isArray(node.labels) && node.labels
                .filter(label => !label.key.startsWith('kubernetes.io/') && !label.key.startsWith('node.kubernetes.io/') && !label.key.startsWith('topology.kubernetes.io/'))
                .map((label: { key: string; value: string }, index: number) => (
                  <Tag
                    key={index}
                    closable
                    onClose={() => handleRemoveLabel(label.key)}
                  >
                    {label.key}={label.value}
                  </Tag>
                ))}
            </Space>
          </div>
        </div>

        <Divider />

        <div>
          <Text>{t('detail.addNewLabel')}:</Text>
          <div style={{ marginTop: 8 }}>
            <Input
              placeholder={t('detail.taintKey')}
              value={newLabelKey}
              onChange={(e) => setNewLabelKey(e.target.value)}
              style={{ width: '45%', marginRight: '5%' }}
            />
            <Input
              placeholder={t('detail.taintValue')}
              value={newLabelValue}
              onChange={(e) => setNewLabelValue(e.target.value)}
              style={{ width: '45%' }}
            />
          </div>
        </div>
      </Modal>

      {/* 污点编辑模态框 */}
      <Modal
        title={t('detail.manageTaints')}
        open={taintModalVisible}
        onCancel={() => setTaintModalVisible(false)}
        footer={[
          <Button key="cancel" onClick={() => setTaintModalVisible(false)}>
            {tc('actions.cancel')}
          </Button>,
          <Button key="submit" type="primary" onClick={handleAddTaint}>
            {t('detail.addTaint')}
          </Button>,
        ]}
      >
        <div style={{ marginBottom: 16 }}>
          <Text>{t('detail.addNewTaint')}:</Text>
          <div style={{ marginTop: 8 }}>
            <Input
              placeholder={t('detail.taintKey')}
              value={newTaintKey}
              onChange={(e) => setNewTaintKey(e.target.value)}
              style={{ width: '100%', marginBottom: 8 }}
            />
            <Input
              placeholder={t('detail.taintValueOptional')}
              value={newTaintValue}
              onChange={(e) => setNewTaintValue(e.target.value)}
              style={{ width: '100%', marginBottom: 8 }}
            />
            <Select
              placeholder={t('detail.taintEffect')}
              value={newTaintEffect}
              onChange={(value) => setNewTaintEffect(value as 'NoSchedule' | 'PreferNoSchedule' | 'NoExecute')}
              style={{ width: '100%' }}
            >
              <Select.Option value="NoSchedule">{t('detail.noScheduleOption')}</Select.Option>
              <Select.Option value="PreferNoSchedule">{t('detail.preferNoScheduleOption')}</Select.Option>
              <Select.Option value="NoExecute">{t('detail.noExecuteOption')}</Select.Option>
            </Select>
          </div>
        </div>

        <Divider />

        <div>
          <Text>{t('detail.taintEffectInfo')}:</Text>
          <ul>
            <li><Text strong>NoSchedule:</Text> {t('detail.noScheduleDesc')}</li>
            <li><Text strong>PreferNoSchedule:</Text> {t('detail.preferNoScheduleDesc')}</li>
            <li><Text strong>NoExecute:</Text> {t('detail.noExecuteDesc')}</li>
          </ul>
        </div>
      </Modal>

      {/* 驱逐节点模态框 */}
      <Modal
        title={t('actions.drain')}
        open={drainModalVisible}
        onCancel={() => setDrainModalVisible(false)}
        footer={[
          <Button key="cancel" onClick={() => setDrainModalVisible(false)}>
            {tc('actions.cancel')}
          </Button>,
          <Button key="submit" type="primary" danger onClick={handleDrain}>
            {tc('actions.confirm')}
          </Button>,
        ]}
      >
        <Alert
          message={t('detail.drainWarningTitle')}
          description={t('detail.drainWarningDesc', { name: nodeName })}
          type="warning"
          showIcon
          style={{ marginBottom: 16 }}
        />

        <div style={{ marginBottom: 16 }}>
          <Text strong>{t('detail.advancedOptions')}:</Text>
          <div style={{ marginTop: 8 }}>
            <Checkbox
              checked={drainOptions.ignoreDaemonSets}
              onChange={(e) => setDrainOptions({ ...drainOptions, ignoreDaemonSets: e.target.checked })}
            >
              {t('detail.ignoreDaemonSets')}
            </Checkbox>
          </div>
          <div style={{ marginTop: 8 }}>
            <Checkbox
              checked={drainOptions.deleteLocalData}
              onChange={(e) => setDrainOptions({ ...drainOptions, deleteLocalData: e.target.checked })}
            >
              {t('detail.deleteLocalData')}
            </Checkbox>
          </div>
          <div style={{ marginTop: 8 }}>
            <Checkbox
              checked={drainOptions.force}
              onChange={(e) => setDrainOptions({ ...drainOptions, force: e.target.checked })}
            >
              {t('detail.forceDelete')}
            </Checkbox>
          </div>
          <div style={{ marginTop: 8 }}>
            <Text>{t('detail.gracePeriod')}:</Text>
            <InputNumber
              min={0}
              max={3600}
              value={drainOptions.gracePeriodSeconds}
              onChange={(value) => setDrainOptions({ ...drainOptions, gracePeriodSeconds: value as number })}
              style={{ marginLeft: 8 }}
            />
            <Text style={{ marginLeft: 8 }}>{tc('time.seconds')}</Text>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default NodeDetail;
