import React, { useEffect, useState } from 'react';
import {
  Card,
  Descriptions,
  Space,
  Button,
  Tag,
  message,
  Spin,
  Tabs,
  Typography,
  Modal,
} from 'antd';
import {
  ArrowLeftOutlined,
  EditOutlined,
  DeleteOutlined,
  ReloadOutlined,
} from '@ant-design/icons';
import { useNavigate, useParams } from 'react-router-dom';
import { configMapService, type ConfigMapDetail as ConfigMapDetailType } from '../../services/configService';
import MonacoEditor from '@monaco-editor/react';

const { Title, Text } = Typography;
const { TabPane } = Tabs;

const ConfigMapDetail: React.FC = () => {
  const navigate = useNavigate();
  const { clusterId, namespace, name } = useParams<{
    clusterId: string;
    namespace: string;
    name: string;
  }>();
  const [loading, setLoading] = useState(false);
  const [configMap, setConfigMap] = useState<ConfigMapDetailType | null>(null);

  // 加载ConfigMap详情
  const loadConfigMap = React.useCallback(async () => {
    if (!clusterId || !namespace || !name) return;
    setLoading(true);
    try {
      const data = await configMapService.getConfigMap(
        Number(clusterId),
        namespace,
        name
      );
      setConfigMap(data);
    } catch (error) {
      const err = error as { response?: { data?: { error?: string } } };
      message.error(err.response?.data?.error || '加载ConfigMap详情失败');
    } finally {
      setLoading(false);
    }
  }, [clusterId, namespace, name]);

  useEffect(() => {
    loadConfigMap();
  }, [loadConfigMap]);

  // 删除ConfigMap
  const handleDelete = () => {
    Modal.confirm({
      title: '确认删除',
      content: `确定要删除ConfigMap "${name}" 吗？`,
      onOk: async () => {
        if (!clusterId || !namespace || !name) return;
        try {
            await configMapService.deleteConfigMap(Number(clusterId), namespace, name);
          message.success('ConfigMap删除成功');
          navigate(`/clusters/${clusterId}/configs`);
        } catch (error) {
          const err = error as { response?: { data?: { error?: string } } };
          message.error(err.response?.data?.error || '删除ConfigMap失败');
        }
      },
    });
  };

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '100px' }}>
        <Spin size="large" />
      </div>
    );
  }

  if (!configMap) {
    return (
      <Card>
        <div style={{ textAlign: 'center', padding: '50px' }}>
          <Text>ConfigMap不存在</Text>
        </div>
      </Card>
    );
  }

  return (
    <div style={{ padding: '24px' }}>
      <Space direction="vertical" style={{ width: '100%' }} size="large">
        {/* 头部操作栏 */}
        <Card>
          <Space style={{ width: '100%', justifyContent: 'space-between' }}>
            <Space>
              <Button
                icon={<ArrowLeftOutlined />}
                onClick={() => navigate(`/clusters/${clusterId}/configs`)}
              >
                返回
              </Button>
              <Title level={4} style={{ margin: 0 }}>
                ConfigMap: {configMap.name}
              </Title>
            </Space>
            <Space>
              <Button icon={<ReloadOutlined />} onClick={loadConfigMap}>
                刷新
              </Button>
              <Button
                icon={<EditOutlined />}
                onClick={() =>
                  navigate(`/clusters/${clusterId}/configs/configmap/${namespace}/${name}/edit`)
                }
              >
                编辑
              </Button>
              <Button icon={<DeleteOutlined />} danger onClick={handleDelete}>
                删除
              </Button>
            </Space>
          </Space>
        </Card>

        {/* 基本信息 */}
        <Card title="基本信息">
          <Descriptions bordered column={2}>
            <Descriptions.Item label="名称">{configMap.name}</Descriptions.Item>
            <Descriptions.Item label="命名空间">
              <Tag color="blue">{configMap.namespace}</Tag>
            </Descriptions.Item>
            <Descriptions.Item label="创建时间">
              {new Date(configMap.creationTimestamp).toLocaleString('zh-CN')}
            </Descriptions.Item>
            <Descriptions.Item label="存在时间">
              {configMap.age}
            </Descriptions.Item>
            <Descriptions.Item label="资源版本">
              {configMap.resourceVersion}
            </Descriptions.Item>
          </Descriptions>
        </Card>

        {/* 标签和注解 */}
        <Card title="标签和注解">
          <Tabs defaultActiveKey="labels">
            <TabPane tab="标签" key="labels">
              <Space size={[0, 8]} wrap>
                {Object.entries(configMap.labels || {}).length > 0 ? (
                  Object.entries(configMap.labels).map(([key, value]) => (
                    <Tag key={key} color="blue">
                      {key}: {value}
                    </Tag>
                  ))
                ) : (
                  <Text type="secondary">无标签</Text>
                )}
              </Space>
            </TabPane>
            <TabPane tab="注解" key="annotations">
              <Space size={[0, 8]} wrap direction="vertical" style={{ width: '100%' }}>
                {Object.entries(configMap.annotations || {}).length > 0 ? (
                  Object.entries(configMap.annotations).map(([key, value]) => (
                    <div key={key}>
                      <Text strong>{key}:</Text> <Text>{value}</Text>
                    </div>
                  ))
                ) : (
                  <Text type="secondary">无注解</Text>
                )}
              </Space>
            </TabPane>
          </Tabs>
        </Card>

        {/* 数据内容 */}
        <Card title="数据内容">
          {Object.entries(configMap.data || {}).length > 0 ? (
            <Tabs type="card">
              {Object.entries(configMap.data).map(([key, value]) => (
                <TabPane tab={key} key={key}>
                  <div style={{ border: '1px solid #d9d9d9', borderRadius: '4px' }}>
                    <MonacoEditor
                      height="400px"
                      language="plaintext"
                      value={value}
                      options={{
                        readOnly: true,
                        minimap: { enabled: false },
                        lineNumbers: 'on',
                        scrollBeyondLastLine: false,
                        automaticLayout: true,
                      }}
                      theme="vs-light"
                    />
                  </div>
                </TabPane>
              ))}
            </Tabs>
          ) : (
            <Text type="secondary">无数据</Text>
          )}
        </Card>
      </Space>
    </div>
  );
};

export default ConfigMapDetail;

