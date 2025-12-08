import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Card,
  Descriptions,
  Button,
  Space,
  Tag,
  Table,
  Tabs,
  message,
  Badge,
  Typography,
  Row,
  Col,
  Divider,
  Tooltip,
  Popconfirm,
} from 'antd';
import {
  ArrowLeftOutlined,
  ReloadOutlined,
  DeleteOutlined,
  FileTextOutlined,
  ConsoleSqlOutlined,
  BarChartOutlined,
} from '@ant-design/icons';
import { PodService } from '../../services/podService';
import MonitoringCharts from '../../components/MonitoringCharts';
import type { PodInfo, ContainerInfo } from '../../services/podService';

const { Title, Text } = Typography;
const { TabPane } = Tabs;

interface PodDetailProps {}

const PodDetail: React.FC<PodDetailProps> = () => {
  const { clusterId, namespace, name } = useParams<{
    clusterId: string;
    namespace: string;
    name: string;
  }>();
  const navigate = useNavigate();
  
  const [pod, setPod] = useState<PodInfo | null>(null);
  const [rawPod, setRawPod] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  // 获取Pod详情
  const fetchPodDetail = async () => {
    if (!clusterId || !namespace || !name) return;
    
    setLoading(true);
    try {
      const response = await PodService.getPodDetail(clusterId, namespace, name);
      
      if (response.code === 200) {
        setPod(response.data.pod);
        setRawPod(response.data.raw);
      } else {
        message.error(response.message || '获取Pod详情失败');
      }
    } catch (error) {
      console.error('获取Pod详情失败:', error);
      message.error('获取Pod详情失败');
    } finally {
      setLoading(false);
    }
  };

  // 删除Pod
  const handleDelete = async () => {
    if (!clusterId || !namespace || !name) return;
    
    try {
      const response = await PodService.deletePod(clusterId, namespace, name);
      
      if (response.code === 200) {
        message.success('删除成功');
        navigate(`/clusters/${clusterId}/pods`);
      } else {
        message.error(response.message || '删除失败');
      }
    } catch (error) {
      console.error('删除失败:', error);
      message.error('删除失败');
    }
  };

  // 查看日志
  const handleViewLogs = () => {
    navigate(`/clusters/${clusterId}/pods/${namespace}/${name}/logs`);
  };

  // 进入终端
  const handleTerminal = () => {
    navigate(`/clusters/${clusterId}/pods/${namespace}/${name}/terminal`);
  };

  useEffect(() => {
    fetchPodDetail();
  }, [clusterId, namespace, name]);

  if (!pod) {
    return <div>加载中...</div>;
  }

  const { status, color } = PodService.formatStatus(pod);

  // 容器表格列
  const containerColumns = [
    {
      title: '名称',
      dataIndex: 'name',
      key: 'name',
    },
    {
      title: '镜像',
      dataIndex: 'image',
      key: 'image',
      ellipsis: true,
    },
    {
      title: '状态',
      key: 'status',
      render: (container: ContainerInfo) => (
        <Badge
          status={PodService.getContainerStatusColor(container) as any}
          text={PodService.formatContainerStatus(container)}
        />
      ),
    },
    {
      title: '就绪',
      dataIndex: 'ready',
      key: 'ready',
      render: (ready: boolean) => (
        <Tag color={ready ? 'green' : 'red'}>{ready ? '是' : '否'}</Tag>
      ),
    },
    {
      title: '重启次数',
      dataIndex: 'restartCount',
      key: 'restartCount',
      render: (count: number) => (
        <Tag color={count > 0 ? 'orange' : 'green'}>{count}</Tag>
      ),
    },
    {
      title: '端口',
      dataIndex: 'ports',
      key: 'ports',
      render: (ports: any[]) => {
        if (!ports || ports.length === 0) {
          return <Text type="secondary">-</Text>;
        }
        return (
          <Space wrap>
            {ports.map((port, index) => (
              <Tag key={index} color="blue">
                {port.containerPort}/{port.protocol}
              </Tag>
            ))}
          </Space>
        );
      },
    },
  ];

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
      dataIndex: 'lastTransitionTime',
      key: 'lastTransitionTime',
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
            onClick={() => navigate(`/clusters/${clusterId}/pods`)}
          >
            返回
          </Button>
          <Title level={3} style={{ margin: 0 }}>
            {pod.name}
          </Title>
          <Tag color="blue">{pod.namespace}</Tag>
          <Badge status={color as any} text={status} />
        </Space>
        
        <div style={{ marginTop: 16 }}>
          <Space>
            <Button
              type="primary"
              icon={<ReloadOutlined />}
              onClick={fetchPodDetail}
              loading={loading}
            >
              刷新
            </Button>
            
            <Button
              icon={<FileTextOutlined />}
              onClick={handleViewLogs}
            >
              查看日志
            </Button>
            
            <Button
              icon={<ConsoleSqlOutlined />}
              onClick={handleTerminal}
              disabled={pod.status !== 'Running'}
            >
              进入终端
            </Button>
            
            <Popconfirm
              title="确认删除"
              description={`确定要删除Pod ${pod.name} 吗？`}
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
              podName={name}
              type="pod"
            />
          )}
        </TabPane>

        <TabPane tab="概览" key="overview">
          <Row gutter={[16, 16]}>
            <Col span={12}>
              <Card title="基本信息" size="small">
                <Descriptions column={1} size="small">
                  <Descriptions.Item label="名称">{pod.name}</Descriptions.Item>
                  <Descriptions.Item label="命名空间">{pod.namespace}</Descriptions.Item>
                  <Descriptions.Item label="状态">
                    <Badge status={color as any} text={status} />
                  </Descriptions.Item>
                  <Descriptions.Item label="阶段">{pod.phase}</Descriptions.Item>
                  <Descriptions.Item label="节点">{pod.nodeName || '-'}</Descriptions.Item>
                  <Descriptions.Item label="Pod IP">{pod.podIP || '-'}</Descriptions.Item>
                  <Descriptions.Item label="Host IP">{pod.hostIP || '-'}</Descriptions.Item>
                  <Descriptions.Item label="创建时间">
                    {new Date(pod.createdAt).toLocaleString()}
                  </Descriptions.Item>
                  <Descriptions.Item label="年龄">
                    {PodService.getAge(pod.createdAt)}
                  </Descriptions.Item>
                </Descriptions>
              </Card>
            </Col>
            
            <Col span={12}>
              <Card title="资源信息" size="small">
                <Descriptions column={1} size="small">
                  <Descriptions.Item label="QoS类别">{pod.qosClass || '-'}</Descriptions.Item>
                  <Descriptions.Item label="服务账户">{pod.serviceAccount || '-'}</Descriptions.Item>
                  <Descriptions.Item label="优先级">{pod.priority || '-'}</Descriptions.Item>
                  <Descriptions.Item label="优先级类别">{pod.priorityClassName || '-'}</Descriptions.Item>
                  <Descriptions.Item label="重启次数">
                    <Tag color={pod.restartCount > 0 ? 'orange' : 'green'}>
                      {pod.restartCount}
                    </Tag>
                  </Descriptions.Item>
                </Descriptions>
              </Card>
            </Col>
          </Row>

          <Divider />

          <Card title="标签" size="small" style={{ marginBottom: 16 }}>
            <Space wrap>
              {Object.entries(pod.labels || {}).map(([key, value]) => (
                <Tag key={key} color="green">{key}={value}</Tag>
              ))}
            </Space>
          </Card>

          <Card title="注解" size="small" style={{ marginBottom: 16 }}>
            <Space wrap>
              {Object.entries(pod.annotations || {}).slice(0, 10).map(([key, value]) => (
                <Tooltip key={key} title={`${key}=${value}`}>
                  <Tag color="blue">{key}</Tag>
                </Tooltip>
              ))}
              {Object.keys(pod.annotations || {}).length > 10 && (
                <Tag>+{Object.keys(pod.annotations || {}).length - 10} 更多</Tag>
              )}
            </Space>
          </Card>

          {pod.ownerReferences && pod.ownerReferences.length > 0 && (
            <Card title="所有者引用" size="small">
              <Space wrap>
                {pod.ownerReferences.map((owner, index) => (
                  <Tag key={index} color="purple">
                    {owner.kind}: {owner.name}
                  </Tag>
                ))}
              </Space>
            </Card>
          )}
        </TabPane>

        <TabPane tab="容器" key="containers">
          <Card title="容器" style={{ marginBottom: 16 }}>
            <Table
              columns={containerColumns}
              dataSource={pod.containers}
              rowKey="name"
              pagination={false}
              size="small"
            />
          </Card>

          {pod.initContainers && pod.initContainers.length > 0 && (
            <Card title="初始化容器">
              <Table
                columns={containerColumns}
                dataSource={pod.initContainers}
                rowKey="name"
                pagination={false}
                size="small"
              />
            </Card>
          )}
        </TabPane>

        <TabPane tab="条件" key="conditions">
          <Table
            columns={conditionColumns}
            dataSource={pod.conditions || []}
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
              {JSON.stringify(rawPod, null, 2)}
            </pre>
          </Card>
        </TabPane>
      </Tabs>
    </div>
  );
};

export default PodDetail;
