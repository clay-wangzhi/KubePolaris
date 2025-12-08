import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Card,
  Descriptions,
  Tag,
  Button,
  Space,
  Spin,
  message,
  Row,
  Col,
  Statistic,
  Typography,
  Divider,
  Empty,
} from 'antd';
import {
  ArrowLeftOutlined,
  ReloadOutlined,
  DatabaseOutlined,
  ContainerOutlined,
  CloudServerOutlined,
  KeyOutlined,
  TagsOutlined,
} from '@ant-design/icons';
import { getNamespaceDetail, type NamespaceDetailData } from '../../services/namespaceService';

const { Title, Text } = Typography;

const NamespaceDetail: React.FC = () => {
  const { clusterId, namespace } = useParams<{ clusterId: string; namespace: string }>();
  const navigate = useNavigate();
  const [namespaceDetail, setNamespaceDetail] = useState<NamespaceDetailData | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchNamespaceDetail();
  }, [clusterId, namespace]);

  const fetchNamespaceDetail = async () => {
    if (!clusterId || !namespace) return;
    setLoading(true);
    try {
      const data = await getNamespaceDetail(Number(clusterId), namespace);
      setNamespaceDetail(data);
    } catch (error) {
      message.error('获取命名空间详情失败');
      console.error('Error fetching namespace detail:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleBack = () => {
    navigate(`/clusters/${clusterId}/namespaces`);
  };

  if (loading) {
    return (
      <div style={{ padding: 24, textAlign: 'center' }}>
        <Spin size="large" tip="加载中..." />
      </div>
    );
  }

  if (!namespaceDetail) {
    return (
      <div style={{ padding: 24 }}>
        <Empty description="命名空间不存在" />
      </div>
    );
  }

  return (
    <div style={{ padding: 24 }}>
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        {/* 头部操作栏 */}
        <Card>
          <Space>
            <Button icon={<ArrowLeftOutlined />} onClick={handleBack}>
              返回
            </Button>
            <Divider type="vertical" />
            <Title level={4} style={{ margin: 0 }}>
              命名空间详情: {namespace}
            </Title>
            <Tag color={namespaceDetail.status === 'Active' ? 'green' : 'orange'}>
              {namespaceDetail.status === 'Active' ? '运行中' : namespaceDetail.status}
            </Tag>
            <Button icon={<ReloadOutlined />} onClick={fetchNamespaceDetail}>
              刷新
            </Button>
          </Space>
        </Card>

        {/* 资源统计卡片 */}
        <Card title="资源统计" bordered={false}>
          <Row gutter={[16, 16]}>
            <Col xs={24} sm={12} md={6}>
              <Card>
                <Statistic
                  title="Pod"
                  value={namespaceDetail.resourceCount.pods}
                  prefix={<ContainerOutlined />}
                  valueStyle={{ color: '#1890ff' }}
                />
              </Card>
            </Col>
            <Col xs={24} sm={12} md={6}>
              <Card>
                <Statistic
                  title="服务"
                  value={namespaceDetail.resourceCount.services}
                  prefix={<CloudServerOutlined />}
                  valueStyle={{ color: '#52c41a' }}
                />
              </Card>
            </Col>
            <Col xs={24} sm={12} md={6}>
              <Card>
                <Statistic
                  title="ConfigMap"
                  value={namespaceDetail.resourceCount.configMaps}
                  prefix={<DatabaseOutlined />}
                  valueStyle={{ color: '#faad14' }}
                />
              </Card>
            </Col>
            <Col xs={24} sm={12} md={6}>
              <Card>
                <Statistic
                  title="Secret"
                  value={namespaceDetail.resourceCount.secrets}
                  prefix={<KeyOutlined />}
                  valueStyle={{ color: '#f5222d' }}
                />
              </Card>
            </Col>
          </Row>
        </Card>

        {/* 基本信息 */}
        <Card title="基本信息">
          <Descriptions bordered column={2}>
            <Descriptions.Item label="名称" span={2}>
              {namespaceDetail.name}
            </Descriptions.Item>
            <Descriptions.Item label="状态">
              <Tag color={namespaceDetail.status === 'Active' ? 'green' : 'orange'}>
                {namespaceDetail.status === 'Active' ? '运行中' : namespaceDetail.status}
              </Tag>
            </Descriptions.Item>
            <Descriptions.Item label="创建时间">
              {namespaceDetail.creationTimestamp}
            </Descriptions.Item>
          </Descriptions>
        </Card>

        {/* 资源配额 */}
        {namespaceDetail.resourceQuota && (
          <Card title="资源配额">
            <Row gutter={[16, 16]}>
              <Col span={12}>
                <Card type="inner" title="CPU">
                  <Space direction="vertical" style={{ width: '100%' }}>
                    <div>
                      <Text type="secondary">已使用: </Text>
                      <Text strong>{namespaceDetail.resourceQuota.used.cpu || '0'}</Text>
                    </div>
                    <div>
                      <Text type="secondary">总配额: </Text>
                      <Text strong>{namespaceDetail.resourceQuota.hard.cpu || '0'}</Text>
                    </div>
                  </Space>
                </Card>
              </Col>
              <Col span={12}>
                <Card type="inner" title="内存">
                  <Space direction="vertical" style={{ width: '100%' }}>
                    <div>
                      <Text type="secondary">已使用: </Text>
                      <Text strong>{namespaceDetail.resourceQuota.used.memory || '0'}</Text>
                    </div>
                    <div>
                      <Text type="secondary">总配额: </Text>
                      <Text strong>{namespaceDetail.resourceQuota.hard.memory || '0'}</Text>
                    </div>
                  </Space>
                </Card>
              </Col>
            </Row>
          </Card>
        )}

        {/* 标签 */}
        <Card title="标签">
          {namespaceDetail.labels && Object.keys(namespaceDetail.labels).length > 0 ? (
            <Space size={[8, 8]} wrap>
              {Object.entries(namespaceDetail.labels).map(([key, value]) => (
                <Tag key={key} icon={<TagsOutlined />} color="blue">
                  {key}: {value}
                </Tag>
              ))}
            </Space>
          ) : (
            <Text type="secondary">暂无标签</Text>
          )}
        </Card>

        {/* 注解 */}
        <Card title="注解">
          {namespaceDetail.annotations && Object.keys(namespaceDetail.annotations).length > 0 ? (
            <Descriptions bordered column={1}>
              {Object.entries(namespaceDetail.annotations).map(([key, value]) => (
                <Descriptions.Item key={key} label={key}>
                  <Text code>{value}</Text>
                </Descriptions.Item>
              ))}
            </Descriptions>
          ) : (
            <Text type="secondary">暂无注解</Text>
          )}
        </Card>
      </Space>
    </div>
  );
};

export default NamespaceDetail;

