import React, { useState, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Card,
  Row,
  Col,
  Progress,
  Tag,
  Table,
  Select,
  Button,
  Spin,
  Alert,
  Space,
  Tooltip,
  Badge,
  Statistic,
  Typography,
  List,
  Collapse,
  Empty,
  message,
} from 'antd';
import {
  CheckCircleOutlined,
  WarningOutlined,
  CloseCircleOutlined,
  SyncOutlined,
  InfoCircleOutlined,
  DashboardOutlined,
  ThunderboltOutlined,
  BarChartOutlined,
  ApiOutlined,
  DatabaseOutlined,
  ClusterOutlined,
  NodeIndexOutlined,
  AppstoreOutlined,
  HddOutlined,
  CloudServerOutlined,
} from '@ant-design/icons';
import {
  omService,
  type HealthDiagnosisResponse,
  type RiskItem,
  type ResourceTopResponse,
  type ResourceTopItem,
  type ControlPlaneStatusResponse,
} from '../../services/omService';

const { Title, Text, Paragraph } = Typography;
const { Panel } = Collapse;

// 格式化字节数
const formatBytes = (bytes: number): string => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

// 格式化 CPU
const formatCPU = (cores: number): string => {
  if (cores < 1) {
    return (cores * 1000).toFixed(0) + 'm';
  }
  return cores.toFixed(2) + ' cores';
};

// 格式化时间戳
const formatTime = (timestamp: number): string => {
  return new Date(timestamp * 1000).toLocaleString('zh-CN');
};

const MonitoringCenter: React.FC = () => {
  const { clusterId } = useParams<{ clusterId: string }>();
  // const navigate = useNavigate(); // 未使用

  // 健康诊断状态
const { t } = useTranslation(['om', 'common']);
const [healthDiagnosis, setHealthDiagnosis] = useState<HealthDiagnosisResponse | null>(null);
  const [healthLoading, setHealthLoading] = useState(true);

  // 资源 Top N 状态
  const [resourceTop, setResourceTop] = useState<ResourceTopResponse | null>(null);
  const [resourceLoading, setResourceLoading] = useState(false);
  const [resourceType, setResourceType] = useState<'cpu' | 'memory' | 'disk' | 'network'>('cpu');
  const [resourceLevel, setResourceLevel] = useState<'namespace' | 'workload' | 'pod'>('namespace');

  // 控制面状态
  const [controlPlaneStatus, setControlPlaneStatus] = useState<ControlPlaneStatusResponse | null>(null);
  const [controlPlaneLoading, setControlPlaneLoading] = useState(true);

  // 加载健康诊断
  const loadHealthDiagnosis = useCallback(async () => {
    if (!clusterId) return;
    setHealthLoading(true);
    try {
      const response = await omService.getHealthDiagnosis(clusterId);
      setHealthDiagnosis(response);
    } catch (error) {
      console.error('加载健康诊断失败:', error);
      message.error(t('common:messages.fetchError'));
    } finally {
      setHealthLoading(false);
    }
  }, [clusterId]);

  // 加载资源 Top N
  const loadResourceTop = useCallback(async () => {
    if (!clusterId) return;
    setResourceLoading(true);
    try {
      const response = await omService.getResourceTop(clusterId, {
        type: resourceType,
        level: resourceLevel,
        limit: 10,
      });
      setResourceTop(response);
    } catch (error) {
      console.error('加载资源 Top N 失败:', error);
      message.error(t('common:messages.fetchError'));
    } finally {
      setResourceLoading(false);
    }
  }, [clusterId, resourceType, resourceLevel]);

  // 加载控制面状态
  const loadControlPlaneStatus = useCallback(async () => {
    if (!clusterId) return;
    setControlPlaneLoading(true);
    try {
      const response = await omService.getControlPlaneStatus(clusterId);
      setControlPlaneStatus(response);
    } catch (error) {
      console.error('加载控制面状态失败:', error);
      message.error(t('common:messages.fetchError'));
    } finally {
      setControlPlaneLoading(false);
    }
  }, [clusterId]);

  // 初始化加载
  useEffect(() => {
    loadHealthDiagnosis();
    loadControlPlaneStatus();
  }, [loadHealthDiagnosis, loadControlPlaneStatus]);

  // 资源类型或级别变化时重新加载
  useEffect(() => {
    loadResourceTop();
  }, [loadResourceTop]);

  // 刷新所有数据
  const handleRefreshAll = () => {
    loadHealthDiagnosis();
    loadResourceTop();
    loadControlPlaneStatus();
  };

  // 获取健康状态颜色
  const getHealthColor = (status: string): string => {
    switch (status) {
      case 'healthy':
        return '#52c41a';
      case 'warning':
        return '#faad14';
      case 'critical':
        return '#ff4d4f';
      default:
        return '#d9d9d9';
    }
  };

  // 获取严重程度标签
  const getSeverityTag = (severity: string) => {
    switch (severity) {
      case 'critical':
        return <Tag icon={<CloseCircleOutlined />} color="error">{t('om:health.severityCritical')}</Tag>;
      case 'warning':
        return <Tag icon={<WarningOutlined />} color="warning">{t('om:health.severityWarning')}</Tag>;
      case 'info':
        return <Tag icon={<InfoCircleOutlined />} color="processing">{t('om:health.severityInfo')}</Tag>;
      default:
        return <Tag>{severity}</Tag>;
    }
  };

  // 获取分类图标
  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'node':
        return <NodeIndexOutlined />;
      case 'workload':
        return <AppstoreOutlined />;
      case 'resource':
        return <DashboardOutlined />;
      case 'storage':
        return <HddOutlined />;
      case 'control_plane':
        return <CloudServerOutlined />;
      default:
        return <InfoCircleOutlined />;
    }
  };

  // 获取分类名称
  const getCategoryName = (category: string): string => {
    const names: Record<string, string> = {
      node: t('om:health.categoryNode'),
      workload: t('om:health.categoryWorkload'),
      resource: t('om:health.categoryResource'),
      storage: t('om:health.categoryStorage'),
      control_plane: t('om:health.categoryControlPlane'),
      network: t('om:health.categoryNetwork'),
    };
    return names[category] || category;
  };

  // 健康评分组件
  const HealthScoreCard: React.FC = () => {
    if (healthLoading) {
      return (
        <Card title={t('om:health.title')} extra={<Button icon={<SyncOutlined spin />} disabled>{t('om:refreshing')}</Button>}>
          <div style={{ textAlign: 'center', padding: 40 }}>
            <Spin size="large" />
          </div>
        </Card>
      );
    }

    if (!healthDiagnosis) {
      return (
        <Card title={t('om:health.title')}>
          <Empty description={t('om:health.noDiagnosisData')} />
        </Card>
      );
    }

    const { health_score, status, risk_items, suggestions, category_scores, diagnosis_time } = healthDiagnosis;

    // 按分类分组风险项
    const groupedRisks = risk_items.reduce((acc, item) => {
      if (!acc[item.category]) {
        acc[item.category] = [];
      }
      acc[item.category].push(item);
      return acc;
    }, {} as Record<string, RiskItem[]>);

    return (
      <Card
        title={
          <Space>
            <ThunderboltOutlined style={{ color: getHealthColor(status) }} />
            <span>{t('om:health.title')}</span>
          </Space>
        }
        extra={
          <Space>
            <Text type="secondary">{t('om:health.diagnosisTime')}: {formatTime(diagnosis_time)}</Text>
            <Button icon={<SyncOutlined />} onClick={loadHealthDiagnosis}>{t('common:actions.refresh')}</Button>
          </Space>
        }
      >
        <Row gutter={[24, 24]}>
          {/* 健康评分 */}
          <Col xs={24} md={8}>
            <div style={{ textAlign: 'center' }}>
              <Progress
                type="dashboard"
                percent={health_score}
                strokeColor={getHealthColor(status)}
                format={(percent) => (
                  <div>
                    <div style={{ fontSize: 32, fontWeight: 'bold', color: getHealthColor(status) }}>
                      {percent}
                    </div>
                    <div style={{ fontSize: 14, color: '#666' }}>{t('om:health.healthScore')}</div>
                  </div>
                )}
                size={180}
              />
              <div style={{ marginTop: 16 }}>
                <Tag
                  color={getHealthColor(status)}
                  style={{ fontSize: 14, padding: '4px 16px' }}
                >
                  {status === 'healthy' ? t('om:health.statusHealthy') : status === 'warning' ? t('om:health.statusWarning') : t('om:health.statusCritical')}
                </Tag>
              </div>
            </div>
          </Col>

          {/* 分类评分 */}
          <Col xs={24} md={8}>
            <Title level={5}>{t('om:health.categoryScores')}</Title>
            {Object.entries(category_scores).map(([category, score]) => (
              <div key={category} style={{ marginBottom: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <Space>
                    {getCategoryIcon(category)}
                    <span>{getCategoryName(category)}</span>
                  </Space>
                  <span style={{ color: score >= 80 ? '#52c41a' : score >= 60 ? '#faad14' : '#ff4d4f' }}>
                    {score}{t('om:health.score')}
                  </span>
                </div>
                <Progress
                  percent={score}
                  showInfo={false}
                  strokeColor={score >= 80 ? '#52c41a' : score >= 60 ? '#faad14' : '#ff4d4f'}
                  size="small"
                />
              </div>
            ))}
          </Col>

          {/* 诊断建议 */}
          <Col xs={24} md={8}>
            <Title level={5}>{t('om:health.suggestions')}</Title>
            {suggestions.length > 0 ? (
              <List
                size="small"
                dataSource={suggestions}
                renderItem={(item, index) => (
                  <List.Item style={{ padding: '8px 0' }}>
                    <Space align="start">
                      <Badge count={index + 1} style={{ backgroundColor: '#1890ff' }} />
                      <Text>{item}</Text>
                    </Space>
                  </List.Item>
                )}
              />
            ) : (
              <Alert message={t('om:health.noSuggestions')} type="success" showIcon />
            )}
          </Col>
        </Row>

        {/* 风险项列表 */}
        {risk_items.length > 0 && (
          <div style={{ marginTop: 24 }}>
            <Title level={5}>
              <WarningOutlined style={{ marginRight: 8, color: '#faad14' }} />
              {t('om:health.riskItems')} ({risk_items.length})
            </Title>
            <Collapse accordion>
              {Object.entries(groupedRisks).map(([category, items]) => (
                <Panel
                  header={
                    <Space>
                      {getCategoryIcon(category)}
                      <span>{getCategoryName(category)}</span>
                      <Badge count={items.length} style={{ backgroundColor: '#ff4d4f' }} />
                    </Space>
                  }
                  key={category}
                >
                  <List
                    size="small"
                    dataSource={items}
                    renderItem={(item) => (
                      <List.Item>
                        <List.Item.Meta
                          avatar={getSeverityTag(item.severity)}
                          title={item.title}
                          description={
                            <div>
                              <Paragraph style={{ marginBottom: 8 }}>{item.description}</Paragraph>
                              {item.namespace && (
                                <Text type="secondary" style={{ marginRight: 16 }}>
                                  {t('om:health.namespace')}: {item.namespace}
                                </Text>
                              )}
                              {item.resource && (
                                <Text type="secondary">{t('om:health.resource')}: {item.resource}</Text>
                              )}
                              <div style={{ marginTop: 8 }}>
                                <Text strong>{t('om:health.solution')}: </Text>
                                <Text>{item.solution}</Text>
                              </div>
                            </div>
                          }
                        />
                      </List.Item>
                    )}
                  />
                </Panel>
              ))}
            </Collapse>
          </div>
        )}
      </Card>
    );
  };

  // 资源 Top N 组件
  const ResourceTopCard: React.FC = () => {
    const columns = [
      {
        title: t('om:resourceTop.rank'),
        dataIndex: 'rank',
        key: 'rank',
        width: 70,
        render: (rank: number) => (
          <Badge
            count={rank}
            style={{
              backgroundColor: rank <= 3 ? (rank === 1 ? '#ff4d4f' : rank === 2 ? '#faad14' : '#52c41a') : '#d9d9d9',
            }}
          />
        ),
      },
      {
        title: t('common:table.name'),
        dataIndex: 'name',
        key: 'name',
        ellipsis: true,
        render: (name: string, record: ResourceTopItem) => (
          <Tooltip title={record.namespace ? `${record.namespace}/${name}` : name}>
            <span>
              {record.namespace && <Text type="secondary">{record.namespace}/</Text>}
              {name}
            </span>
          </Tooltip>
        ),
      },
      {
        title: t('om:resourceTop.usage'),
        dataIndex: 'usage',
        key: 'usage',
        render: (usage: number, record: ResourceTopItem) => {
          if (record.unit === 'bytes' || record.unit === 'bytes/s') {
            return formatBytes(usage);
          } else if (record.unit === 'cores') {
            return formatCPU(usage);
          }
          return `${usage.toFixed(2)} ${record.unit}`;
        },
      },
      {
        title: t('om:resourceTop.usageRate'),
        dataIndex: 'usage_rate',
        key: 'usage_rate',
        width: 150,
        render: (rate: number) => (
          <Progress
            percent={Math.min(rate, 100)}
            size="small"
            strokeColor={rate > 80 ? '#ff4d4f' : rate > 60 ? '#faad14' : '#52c41a'}
            format={(percent) => `${(percent || 0).toFixed(1)}%`}
          />
        ),
      },
    ];

    return (
      <Card
        title={
          <Space>
            <BarChartOutlined />
            <span>{t('om:resourceTop.title')}</span>
          </Space>
        }
        extra={
          <Space>
            <Select
              value={resourceType}
              onChange={setResourceType}
              style={{ width: 100 }}
              options={[
                { label: 'CPU', value: 'cpu' },
                { label: t('om:resourceTop.memory'), value: 'memory' },
                { label: t('om:resourceTop.disk'), value: 'disk' },
                { label: t('om:resourceTop.network'), value: 'network' },
              ]}
            />
            <Select
              value={resourceLevel}
              onChange={setResourceLevel}
              style={{ width: 110 }}
              options={[
                { label: t('om:resourceTop.namespaceLevel'), value: 'namespace' },
                { label: t('om:resourceTop.workloadLevel'), value: 'workload' },
                { label: 'Pod', value: 'pod' },
              ]}
            />
            <Button icon={<SyncOutlined spin={resourceLoading} />} onClick={loadResourceTop}>
              {t('common:actions.refresh')}
            </Button>
          </Space>
        }
      >
        <Table
          columns={columns}
          dataSource={resourceTop?.items || []}
          loading={resourceLoading}
          rowKey="rank"
          pagination={false}
          size="small"
          locale={{ emptyText: <Empty description={t('common:messages.noData')} /> }}
        />
        {resourceTop && (
          <div style={{ marginTop: 12, textAlign: 'right' }}>
            <Text type="secondary">{t('om:resourceTop.queryTime')}: {formatTime(resourceTop.query_time)}</Text>
          </div>
        )}
      </Card>
    );
  };

  // 控制面状态组件
  const ControlPlaneCard: React.FC = () => {
    const getStatusBadge = (status: string) => {
      switch (status) {
        case 'healthy':
          return <Badge status="success" text={t('om:controlPlane.statusHealthy')} />;
        case 'unhealthy':
          return <Badge status="error" text={t('om:controlPlane.statusUnhealthy')} />;
        case 'unknown':
          return <Badge status="default" text={t('om:controlPlane.statusUnknown')} />;
        default:
          return <Badge status="processing" text={status} />;
      }
    };

    const getComponentIcon = (type: string) => {
      switch (type) {
        case 'apiserver':
          return <ApiOutlined style={{ fontSize: 24, color: '#1890ff' }} />;
        case 'scheduler':
          return <ClusterOutlined style={{ fontSize: 24, color: '#722ed1' }} />;
        case 'controller-manager':
          return <AppstoreOutlined style={{ fontSize: 24, color: '#13c2c2' }} />;
        case 'etcd':
          return <DatabaseOutlined style={{ fontSize: 24, color: '#fa8c16' }} />;
        default:
          return <CloudServerOutlined style={{ fontSize: 24 }} />;
      }
    };

    if (controlPlaneLoading) {
      return (
        <Card title={t('om:controlPlane.title')} extra={<Button icon={<SyncOutlined spin />} disabled>{t('om:refreshing')}</Button>}>
          <div style={{ textAlign: 'center', padding: 40 }}>
            <Spin size="large" />
          </div>
        </Card>
      );
    }

    if (!controlPlaneStatus) {
      return (
        <Card title={t('om:controlPlane.title')}>
          <Empty description={t('common:messages.noData')} />
        </Card>
      );
    }

    return (
      <Card
        title={
          <Space>
            <CloudServerOutlined />
            <span>{t('om:controlPlane.title')}</span>
          </Space>
        }
        extra={
          <Space>
            {getStatusBadge(controlPlaneStatus.overall)}
            <Button icon={<SyncOutlined />} onClick={loadControlPlaneStatus}>{t('common:actions.refresh')}</Button>
          </Space>
        }
      >
        <Row gutter={[16, 16]}>
          {controlPlaneStatus.components.map((component) => (
            <Col xs={24} sm={12} md={6} key={component.name}>
              <Card
                size="small"
                hoverable
                style={{
                  borderLeft: `4px solid ${component.status === 'healthy' ? '#52c41a' : component.status === 'unhealthy' ? '#ff4d4f' : '#d9d9d9'}`,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12 }}>
                  {getComponentIcon(component.type)}
                  <div style={{ marginLeft: 12 }}>
                    <Text strong>{component.name}</Text>
                    <br />
                    {getStatusBadge(component.status)}
                  </div>
                </div>

                <Text type="secondary" style={{ fontSize: 12 }}>{component.message}</Text>

                {component.metrics && (
                  <div style={{ marginTop: 12, borderTop: '1px solid #f0f0f0', paddingTop: 12 }}>
                    {component.metrics.request_rate !== undefined && (
                      <Statistic
                        title={t('om:controlPlane.requestRate')}
                        value={component.metrics.request_rate}
                        suffix="/s"
                        valueStyle={{ fontSize: 14 }}
                      />
                    )}
                    {component.metrics.error_rate !== undefined && (
                      <Statistic
                        title={t('om:controlPlane.errorRate')}
                        value={component.metrics.error_rate}
                        suffix="%"
                        valueStyle={{ fontSize: 14, color: component.metrics.error_rate > 1 ? '#ff4d4f' : '#52c41a' }}
                      />
                    )}
                    {component.metrics.leader_status !== undefined && (
                      <div>
                        <Text type="secondary">Leader: </Text>
                        {component.metrics.leader_status ? (
                          <CheckCircleOutlined style={{ color: '#52c41a' }} />
                        ) : (
                          <CloseCircleOutlined style={{ color: '#ff4d4f' }} />
                        )}
                      </div>
                    )}
                    {component.metrics.db_size !== undefined && (
                      <div>
                        <Text type="secondary">{t('om:controlPlane.dbSize')}: </Text>
                        <Text>{formatBytes(component.metrics.db_size)}</Text>
                      </div>
                    )}
                    {component.metrics.queue_length !== undefined && (
                      <div>
                        <Text type="secondary">{t('om:controlPlane.queueLength')}: </Text>
                        <Text>{component.metrics.queue_length}</Text>
                      </div>
                    )}
                  </div>
                )}

                {component.instances && component.instances.length > 0 && (
                  <div style={{ marginTop: 12, borderTop: '1px solid #f0f0f0', paddingTop: 12 }}>
                    <Text type="secondary">{t('om:controlPlane.instanceCount')}: {component.instances.length}</Text>
                  </div>
                )}
              </Card>
            </Col>
          ))}
        </Row>

        <div style={{ marginTop: 12, textAlign: 'right' }}>
          <Text type="secondary">{t('om:controlPlane.checkTime')}: {formatTime(controlPlaneStatus.check_time)}</Text>
        </div>
      </Card>
    );
  };

  return (
    <div style={{ padding: 24, background: '#f0f2f5', minHeight: '100vh' }}>
      {/* 页面头部 */}
      <div style={{ marginBottom: 24 }}>
        <Row justify="space-between" align="middle">
          <Col>
            <Title level={3} style={{ margin: 0 }}>
              <DashboardOutlined style={{ marginRight: 12 }} />
              {t('om:title')}
            </Title>
            <Text type="secondary">{t('om:subtitle')}</Text>
          </Col>
          <Col>
            <Button type="primary" icon={<SyncOutlined />} onClick={handleRefreshAll}>
              {t('om:refreshAll')}
            </Button>
          </Col>
        </Row>
      </div>

      {/* 主内容区 */}
      <Row gutter={[24, 24]}>
        {/* 健康诊断 - 全宽 */}
        <Col span={24}>
          <HealthScoreCard />
        </Col>

        {/* 资源 Top N */}
        <Col xs={24} lg={12}>
          <ResourceTopCard />
        </Col>

        {/* 控制面状态 */}
        <Col xs={24} lg={12}>
          <ControlPlaneCard />
        </Col>
      </Row>
    </div>
  );
};

export default MonitoringCenter;

