import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import {
  Card,
  Descriptions,
  Button,
  Space,
  Tag,
  Table,
  Tabs,
  message,
  Modal,
  InputNumber,
  Popconfirm,
  Badge,
  Typography,
  Row,
  Col,
  Divider,
} from 'antd';
import {
  ArrowLeftOutlined,
  ReloadOutlined,
  EditOutlined,
  DeleteOutlined,
  ExpandAltOutlined,
  BarChartOutlined,
} from '@ant-design/icons';
import { WorkloadService } from '../../services/workloadService';
import type { WorkloadInfo } from '../../services/workloadService';
import { useTranslation } from 'react-i18next';
import MonitoringCharts from '../../components/MonitoringCharts';


const { Title } = Typography;
const { TabPane } = Tabs;

type WorkloadDetailProps = Record<string, never>;

const WorkloadDetail: React.FC<WorkloadDetailProps> = () => {
  const { clusterId, type, namespace, name } = useParams<{
    clusterId: string;
    type: string;
    namespace: string;
    name: string;
  }>();
  const [searchParams] = useSearchParams();
const { t } = useTranslation(["workload", "common"]);
const navigate = useNavigate();
  
  // URL 路径中的 type 是小写（如 statefulset），需要映射为 API 期望的 PascalCase
  const typeMap: Record<string, string> = {
    deployment: 'Deployment',
    statefulset: 'StatefulSet',
    daemonset: 'DaemonSet',
    job: 'Job',
    cronjob: 'CronJob',
    rollout: 'Rollout',
  };
  const rawType = type || searchParams.get('type') || 'deployment';
  const workloadType = typeMap[rawType.toLowerCase()] || rawType;
  
  const [workload, setWorkload] = useState<Record<string, unknown> | null>(null);
  const [workloadInfo, setWorkloadInfo] = useState<WorkloadInfo | null>(null);
  const [pods, setPods] = useState<Array<Record<string, unknown>>>([]);
  const [loading, setLoading] = useState(false);
  const [scaleModalVisible, setScaleModalVisible] = useState(false);
  const [scaleReplicas, setScaleReplicas] = useState(1);

  // 获取工作负载详情
  const fetchWorkloadDetail = useCallback(async () => {
    if (!clusterId || !namespace || !name) return;
    
    setLoading(true);
    try {
      const response = await WorkloadService.getWorkloadDetail(
        clusterId,
        workloadType,
        namespace,
        name
      );
      
      {
        setWorkload(response.raw);
        setWorkloadInfo(response.workload);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const podsData = response.pods as any;
        const rawPods: Array<Record<string, unknown>> = Array.isArray(podsData) ? podsData : (podsData?.items || []);
        const flatPods = rawPods.map((pod: Record<string, unknown>) => {
          const metadata = (pod.metadata || {}) as Record<string, unknown>;
          const spec = (pod.spec || {}) as Record<string, unknown>;
          const status = (pod.status || {}) as Record<string, unknown>;
          const containerStatuses = (status.containerStatuses || []) as Array<Record<string, unknown>>;
          const specContainers = (spec.containers || []) as Array<Record<string, unknown>>;
          return {
            name: metadata.name,
            namespace: metadata.namespace,
            status: status.phase,
            nodeName: spec.nodeName,
            podIP: status.podIP,
            createdAt: metadata.creationTimestamp,
            containers: specContainers.map((c: Record<string, unknown>, i: number) => {
              const cs = containerStatuses[i] as Record<string, unknown> | undefined;
              return {
                name: c.name,
                image: c.image,
                ready: cs?.ready ?? false,
                restartCount: cs?.restartCount ?? 0,
              };
            }),
          };
        });
        setPods(flatPods);
        setScaleReplicas(response.workload.replicas || 1);
      }
    } catch (error) {
      console.error('获取工作负载详情失败:', error);
      message.error(t('detail.fetchError'));
    } finally {
      setLoading(false);
    }
  }, [clusterId, namespace, name, workloadType]);

  // 扩缩容工作负载
  const handleScale = async () => {
    if (!clusterId || !namespace || !name) return;
    
    try {
      const response = await WorkloadService.scaleWorkload(
        clusterId,
        namespace,
        name,
        workloadType,
        scaleReplicas
      );
      
      message.success(t('messages.scaleSuccess'));
      setScaleModalVisible(false);
      fetchWorkloadDetail();
    } catch (error) {
      console.error('扩缩容失败:', error);
      message.error(t('messages.scaleError'));
    }
  };

  // 删除工作负载
  const handleDelete = async () => {
    if (!clusterId || !namespace || !name) return;
    
    try {
      const response = await WorkloadService.deleteWorkload(
        clusterId,
        namespace,
        name,
        workloadType
      );
      
      message.success(t('messages.deleteSuccess'));
      navigate(`/clusters/${clusterId}/workloads`);
    } catch (error) {
      console.error('删除失败:', error);
      message.error(t('messages.deleteError'));
    }
  };

  useEffect(() => {
    fetchWorkloadDetail();
  }, [fetchWorkloadDetail]);

  if (!workloadInfo) {
    return <div>{t('common:messages.loading')}</div>;
  }

  const canScale = ['deployment', 'statefulset'].includes(workloadType);
  const { status, color } = WorkloadService.formatStatus(workloadInfo);

  // 条件表格列
  const conditionColumns = [
    {
      title: t('condition.type'),
      dataIndex: 'type',
      key: 'type',
    },
    {
      title: t('condition.status'),
      dataIndex: 'status',
      key: 'status',
      render: (text: string) => (
        <Tag color={text === 'True' ? 'green' : 'red'}>{text}</Tag>
      ),
    },
    {
      title: t('condition.reason'),
      dataIndex: 'reason',
      key: 'reason',
    },
    {
      title: t('condition.message'),
      dataIndex: 'message',
      key: 'message',
      ellipsis: true,
    },
    {
      title: t('condition.lastUpdateTime'),
      dataIndex: 'lastUpdateTime',
      key: 'lastUpdateTime',
      render: (text: string) => new Date(text).toLocaleString(),
    },
  ];

  return (
    <div style={{ padding: '24px' }}>
      {/* 页面头部 */}
      <div style={{ marginBottom: 24 }}>
        <Space>
          <Button
            icon={<ArrowLeftOutlined />}
            onClick={() => navigate(`/clusters/${clusterId}/workloads`)}
          >{t('common:actions.back')}</Button>
          <Title level={3} style={{ margin: 0 }}>
            {workloadInfo.name}
          </Title>
          <Tag color="blue">{workloadInfo.namespace}</Tag>
          <Tag color="green">
            {WorkloadService.getWorkloadTypes().find(t => t.value === workloadType)?.label || workloadType}
          </Tag>
          <Badge status={color as 'success' | 'error' | 'default' | 'processing' | 'warning'} text={status} />
        </Space>
        
        <div style={{ marginTop: 16 }}>
          <Space>
            <Button
              type="primary"
              icon={<ReloadOutlined />}
              onClick={fetchWorkloadDetail}
              loading={loading}
            >{t('common:actions.refresh')}</Button>
            
            {canScale && (
              <Button
                icon={<ExpandAltOutlined />}
                onClick={() => setScaleModalVisible(true)}
              >{t('actions.scale')}</Button>
            )}
            
            <Button
              icon={<EditOutlined />}
              onClick={() => navigate(`/clusters/${clusterId}/yaml/apply?workload=${namespace}/${name}&type=${workloadType}`)}
            >{t('actions.editYAML')}</Button>
            
            <Popconfirm
              title={t("common:actions.delete")}
description={t('actions.confirmDeleteWorkload', { name: workloadInfo.name })}
onConfirm={handleDelete}
              okText={t("common:actions.confirm")}
              cancelText={t("common:actions.cancel")}
            >
              <Button danger icon={<DeleteOutlined />}>{t('actions.delete')}</Button>
            </Popconfirm>
          </Space>
        </div>
      </div>

      {/* 详情内容 */}
      <Tabs defaultActiveKey="overview">
        <TabPane 
          tab={
            <span>
              <BarChartOutlined />{t("detail.monitoring")}</span>
          } 
          key="monitoring"
        >
          {clusterId && namespace && name && (
            <MonitoringCharts 
              clusterId={clusterId} 
              namespace={namespace}
              workloadName={name}
              type="workload"
            />
          )}
        </TabPane>

        <TabPane tab={t("detail.overview")} key="overview">
          <Row gutter={[16, 16]}>
            <Col span={12}>
              <Card title={t("detail.basicInfo")} size="small">
                <Descriptions column={1} size="small">
                  <Descriptions.Item label={t("detail.name")}>{workloadInfo.name}</Descriptions.Item>
                  <Descriptions.Item label={t("detail.namespace")}>{workloadInfo.namespace}</Descriptions.Item>
                  <Descriptions.Item label={t("detail.type")}>{workloadType}</Descriptions.Item>
                  <Descriptions.Item label={t("detail.createdAt")}>
                    {new Date(workloadInfo.createdAt).toLocaleString()}
                  </Descriptions.Item>
                  <Descriptions.Item label={t("detail.status")}>
                    <Badge status={color as 'success' | 'error' | 'default' | 'processing' | 'warning'} text={status} />
                  </Descriptions.Item>
                </Descriptions>
              </Card>
            </Col>
            
            <Col span={12}>
              <Card title={t("detail.replicaInfo")} size="small">
                <Descriptions column={1} size="small">
                  {workloadType !== 'daemonset' && (
                    <>
                      <Descriptions.Item label={t("detail.desiredReplicas")}>{workloadInfo.replicas || 0}</Descriptions.Item>
                      <Descriptions.Item label={t("detail.readyReplicas")}>{workloadInfo.readyReplicas || 0}</Descriptions.Item>
                      <Descriptions.Item label={t("detail.availableReplicas")}>{workloadInfo.availableReplicas || 0}</Descriptions.Item>
                      <Descriptions.Item label={t("detail.updatedReplicas")}>{workloadInfo.updatedReplicas || 0}</Descriptions.Item>
                    </>
                  )}
                  {workloadType === 'daemonset' && (
                    <Descriptions.Item label={t("detail.status")}>{t("detail.daemonsetRunning")}</Descriptions.Item>
                  )}
                </Descriptions>
              </Card>
            </Col>
          </Row>

          <Divider />

          <Card title={t("detail.imageInfo")} size="small" style={{ marginBottom: 16 }}>
            <Space wrap>
              {(workloadInfo.images || []).map((image, index) => (
                <Tag key={index} color="blue">{image}</Tag>
              ))}
            </Space>
          </Card>

          <Card title={t("detail.selector")} size="small" style={{ marginBottom: 16 }}>
            <Space wrap>
              {Object.entries(workloadInfo.selector || {}).map(([key, value]) => (
                <Tag key={key} color="purple">{key}={value}</Tag>
              ))}
            </Space>
          </Card>

          <Card title={t("detail.labels")} size="small" style={{ marginBottom: 16 }}>
            <Space wrap>
              {Object.entries(workloadInfo.labels || {}).map(([key, value]) => (
                <Tag key={key} color="green">{key}={value}</Tag>
              ))}
            </Space>
          </Card>
        </TabPane>

        <TabPane tab={t("detail.pods")} key="pods">
          <Table
            columns={[
              {
                title: t('pod.name'),
                dataIndex: 'name',
                key: 'name',
              },
              {
                title: t('condition.status'),
                dataIndex: 'status',
                key: 'status',
                render: (text: string) => (
                  <Tag color={text === 'Running' ? 'green' : text === 'Pending' ? 'orange' : 'red'}>
                    {text}
                  </Tag>
                ),
              },
              {
                title: t('pod.node'),
                dataIndex: 'nodeName',
                key: 'nodeName',
              },
              {
                title: t('pod.createdAt'),
                dataIndex: 'createdAt',
                key: 'createdAt',
                render: (text: string) => new Date(text).toLocaleString(),
              },
              {
                title: t('pod.containers'),
                dataIndex: 'containers',
                key: 'containers',
                render: (containers: Array<{ name: string; image: string; ready?: boolean; restartCount?: number }>) => (
                  <Space wrap>
                    {containers.map((container, index) => (
                      <Tag key={index} color={container.ready ? 'green' : 'red'}>
                        {container.name} ({container.restartCount || 0} {t("pod.restarts")})
                      </Tag>
                    ))}
                  </Space>
                ),
              },
            ]}
            dataSource={pods}
            rowKey="name"
            pagination={false}
            size="small"
          />
        </TabPane>

        <TabPane tab={t("detail.conditions")} key="conditions">
          <Table
            columns={conditionColumns}
            dataSource={workloadInfo.conditions || []}
            rowKey="type"
            pagination={false}
            size="small"
          />
        </TabPane>

        <TabPane tab={t("detail.yaml")} key="yaml">
          <Card>
            <pre style={{ 
              background: '#f5f5f5', 
              padding: '16px', 
              borderRadius: '4px',
              overflow: 'auto',
              maxHeight: '600px'
            }}>
              {JSON.stringify(workload, null, 2)}
            </pre>
          </Card>
        </TabPane>
      </Tabs>

      {/* 扩缩容模态框 */}
      <Modal
        title={t("scale.title", { type: workloadType })}
        open={scaleModalVisible}
        onOk={handleScale}
        onCancel={() => setScaleModalVisible(false)}
        okText={t("common:actions.confirm")}
        cancelText={t("common:actions.cancel")}
      >
        <div>
          <p>{t("detail.name")}: <strong>{workloadInfo.name}</strong></p>
          <p>{t("detail.namespace")}: <strong>{workloadInfo.namespace}</strong></p>
          <p>{t("scale.currentReplicas")}: <strong>{workloadInfo.replicas || 0}</strong></p>
          <div style={{ marginTop: 16 }}>
            <label>{t("scale.targetReplicas")}: </label>
            <InputNumber
              min={0}
              max={100}
              value={scaleReplicas}
              onChange={(value) => setScaleReplicas(value || 1)}
              style={{ marginLeft: 8 }}
            />
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default WorkloadDetail;