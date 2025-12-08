import React, { useState, useEffect } from 'react';
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
import MonitoringCharts from '../../components/MonitoringCharts';


const { Title, Text } = Typography;
const { TabPane } = Tabs;

interface WorkloadDetailProps {}

const WorkloadDetail: React.FC<WorkloadDetailProps> = () => {
  const { clusterId, namespace, name } = useParams<{
    clusterId: string;
    namespace: string;
    name: string;
  }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  
  const workloadType = searchParams.get('type') || 'deployment';
  
  const [workload, setWorkload] = useState<any>(null);
  const [workloadInfo, setWorkloadInfo] = useState<WorkloadInfo | null>(null);
  const [pods, setPods] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [scaleModalVisible, setScaleModalVisible] = useState(false);
  const [scaleReplicas, setScaleReplicas] = useState(1);

  // 获取工作负载详情
  const fetchWorkloadDetail = async () => {
    if (!clusterId || !namespace || !name) return;
    
    setLoading(true);
    try {
      const response = await WorkloadService.getWorkloadDetail(
        clusterId,
        namespace,
        name,
        workloadType
      );
      
      if (response.code === 200) {
        setWorkload(response.data.raw);
        setWorkloadInfo(response.data.workload);
        setPods(response.data.pods || []);
        setScaleReplicas(response.data.workload.replicas || 1);
      } else {
        message.error(response.message || '获取工作负载详情失败');
      }
    } catch (error) {
      console.error('获取工作负载详情失败:', error);
      message.error('获取工作负载详情失败');
    } finally {
      setLoading(false);
    }
  };

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
      
      if (response.code === 200) {
        message.success('扩缩容成功');
        setScaleModalVisible(false);
        fetchWorkloadDetail();
      } else {
        message.error(response.message || '扩缩容失败');
      }
    } catch (error) {
      console.error('扩缩容失败:', error);
      message.error('扩缩容失败');
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
      
      if (response.code === 200) {
        message.success('删除成功');
        navigate(`/clusters/${clusterId}/workloads`);
      } else {
        message.error(response.message || '删除失败');
      }
    } catch (error) {
      console.error('删除失败:', error);
      message.error('删除失败');
    }
  };

  useEffect(() => {
    fetchWorkloadDetail();
  }, [clusterId, namespace, name, workloadType]);

  if (!workloadInfo) {
    return <div>加载中...</div>;
  }

  const canScale = ['deployment', 'statefulset'].includes(workloadType);
  const { status, color } = WorkloadService.formatStatus(workloadInfo);

  // 条件表格列
  const conditionColumns = [
    {
      title: '类型',
      dataIndex: 'type',
      key: 'type',
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      render: (text: string) => (
        <Tag color={text === 'True' ? 'green' : 'red'}>{text}</Tag>
      ),
    },
    {
      title: '原因',
      dataIndex: 'reason',
      key: 'reason',
    },
    {
      title: '消息',
      dataIndex: 'message',
      key: 'message',
      ellipsis: true,
    },
    {
      title: '最后更新时间',
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
          >
            返回
          </Button>
          <Title level={3} style={{ margin: 0 }}>
            {workloadInfo.name}
          </Title>
          <Tag color="blue">{workloadInfo.namespace}</Tag>
          <Tag color="green">
            {WorkloadService.getWorkloadTypes().find(t => t.value === workloadType)?.label || workloadType}
          </Tag>
          <Badge status={color as any} text={status} />
        </Space>
        
        <div style={{ marginTop: 16 }}>
          <Space>
            <Button
              type="primary"
              icon={<ReloadOutlined />}
              onClick={fetchWorkloadDetail}
              loading={loading}
            >
              刷新
            </Button>
            
            {canScale && (
              <Button
                icon={<ExpandAltOutlined />}
                onClick={() => setScaleModalVisible(true)}
              >
                扩缩容
              </Button>
            )}
            
            <Button
              icon={<EditOutlined />}
              onClick={() => navigate(`/clusters/${clusterId}/yaml/apply?workload=${namespace}/${name}&type=${workloadType}`)}
            >
              编辑YAML
            </Button>
            
            <Popconfirm
              title="确认删除"
              description={`确定要删除工作负载 ${workloadInfo.name} 吗？`}
              onConfirm={handleDelete}
              okText="确定"
              cancelText="取消"
            >
              <Button danger icon={<DeleteOutlined />}>
                删除
              </Button>
            </Popconfirm>
          </Space>
        </div>
      </div>

      {/* 详情内容 */}
      <Tabs defaultActiveKey="overview">
        <TabPane 
          tab={
            <span>
              <BarChartOutlined />
              监控
            </span>
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

        <TabPane tab="概览" key="overview">
          <Row gutter={[16, 16]}>
            <Col span={12}>
              <Card title="基本信息" size="small">
                <Descriptions column={1} size="small">
                  <Descriptions.Item label="名称">{workloadInfo.name}</Descriptions.Item>
                  <Descriptions.Item label="命名空间">{workloadInfo.namespace}</Descriptions.Item>
                  <Descriptions.Item label="类型">{workloadType}</Descriptions.Item>
                  <Descriptions.Item label="创建时间">
                    {new Date(workloadInfo.createdAt).toLocaleString()}
                  </Descriptions.Item>
                  <Descriptions.Item label="状态">
                    <Badge status={color as any} text={status} />
                  </Descriptions.Item>
                </Descriptions>
              </Card>
            </Col>
            
            <Col span={12}>
              <Card title="副本信息" size="small">
                <Descriptions column={1} size="small">
                  {workloadType !== 'daemonset' && (
                    <>
                      <Descriptions.Item label="期望副本数">{workloadInfo.replicas || 0}</Descriptions.Item>
                      <Descriptions.Item label="就绪副本数">{workloadInfo.readyReplicas || 0}</Descriptions.Item>
                      <Descriptions.Item label="可用副本数">{workloadInfo.availableReplicas || 0}</Descriptions.Item>
                      <Descriptions.Item label="更新副本数">{workloadInfo.updatedReplicas || 0}</Descriptions.Item>
                    </>
                  )}
                  {workloadType === 'daemonset' && (
                    <Descriptions.Item label="状态">DaemonSet 在所有节点上运行</Descriptions.Item>
                  )}
                </Descriptions>
              </Card>
            </Col>
          </Row>

          <Divider />

          <Card title="镜像信息" size="small" style={{ marginBottom: 16 }}>
            <Space wrap>
              {(workloadInfo.images || []).map((image, index) => (
                <Tag key={index} color="blue">{image}</Tag>
              ))}
            </Space>
          </Card>

          <Card title="选择器" size="small" style={{ marginBottom: 16 }}>
            <Space wrap>
              {Object.entries(workloadInfo.selector || {}).map(([key, value]) => (
                <Tag key={key} color="purple">{key}={value}</Tag>
              ))}
            </Space>
          </Card>

          <Card title="标签" size="small" style={{ marginBottom: 16 }}>
            <Space wrap>
              {Object.entries(workloadInfo.labels || {}).map(([key, value]) => (
                <Tag key={key} color="green">{key}={value}</Tag>
              ))}
            </Space>
          </Card>
        </TabPane>

        <TabPane tab="Pods" key="pods">
          <Table
            columns={[
              {
                title: '名称',
                dataIndex: 'name',
                key: 'name',
              },
              {
                title: '状态',
                dataIndex: 'status',
                key: 'status',
                render: (text: string) => (
                  <Tag color={text === 'Running' ? 'green' : text === 'Pending' ? 'orange' : 'red'}>
                    {text}
                  </Tag>
                ),
              },
              {
                title: '节点',
                dataIndex: 'nodeName',
                key: 'nodeName',
              },
              {
                title: '创建时间',
                dataIndex: 'createdAt',
                key: 'createdAt',
                render: (text: string) => new Date(text).toLocaleString(),
              },
              {
                title: '容器',
                dataIndex: 'containers',
                key: 'containers',
                render: (containers: any[]) => (
                  <Space wrap>
                    {containers.map((container, index) => (
                      <Tag key={index} color={container.ready ? 'green' : 'red'}>
                        {container.name} ({container.restartCount} 重启)
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

        <TabPane tab="条件" key="conditions">
          <Table
            columns={conditionColumns}
            dataSource={workloadInfo.conditions || []}
            rowKey="type"
            pagination={false}
            size="small"
          />
        </TabPane>

        <TabPane tab="YAML" key="yaml">
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
        title="扩缩容工作负载"
        open={scaleModalVisible}
        onOk={handleScale}
        onCancel={() => setScaleModalVisible(false)}
        okText="确定"
        cancelText="取消"
      >
        <div>
          <p>工作负载: <strong>{workloadInfo.name}</strong></p>
          <p>命名空间: <strong>{workloadInfo.namespace}</strong></p>
          <p>当前副本数: <strong>{workloadInfo.replicas || 0}</strong></p>
          <div style={{ marginTop: 16 }}>
            <label>目标副本数: </label>
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