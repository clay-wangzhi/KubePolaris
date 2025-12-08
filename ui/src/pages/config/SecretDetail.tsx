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
  Switch,
} from 'antd';
import {
  ArrowLeftOutlined,
  EditOutlined,
  DeleteOutlined,
  ReloadOutlined,
  EyeOutlined,
  EyeInvisibleOutlined,
} from '@ant-design/icons';
import { useNavigate, useParams } from 'react-router-dom';
import { secretService, type SecretDetail as SecretDetailType } from '../../services/configService';
import MonacoEditor from '@monaco-editor/react';

const { Title, Text } = Typography;
const { TabPane } = Tabs;

const SecretDetail: React.FC = () => {
  const navigate = useNavigate();
  const { clusterId, namespace, name } = useParams<{
    clusterId: string;
    namespace: string;
    name: string;
  }>();
  const [loading, setLoading] = useState(false);
  const [secret, setSecret] = useState<SecretDetailType | null>(null);
  const [showValues, setShowValues] = useState(false);

  // 加载Secret详情
  const loadSecret = React.useCallback(async () => {
    if (!clusterId || !namespace || !name) return;
    setLoading(true);
    try {
      const data = await secretService.getSecret(Number(clusterId), namespace, name);
      setSecret(data);
    } catch (error) {
      const err = error as { response?: { data?: { error?: string } } };
      message.error(err.response?.data?.error || '加载Secret详情失败');
    } finally {
      setLoading(false);
    }
  }, [clusterId, namespace, name]);

  useEffect(() => {
    loadSecret();
  }, [loadSecret]);

  // 删除Secret
  const handleDelete = () => {
    Modal.confirm({
      title: '确认删除',
      content: `确定要删除Secret "${name}" 吗？`,
      onOk: async () => {
        if (!clusterId || !namespace || !name) return;
        try {
            await secretService.deleteSecret(Number(clusterId), namespace, name);
          message.success('Secret删除成功');
          navigate(`/clusters/${clusterId}/configs`);
        } catch (error) {
          const err = error as { response?: { data?: { error?: string } } };
          message.error(err.response?.data?.error || '删除Secret失败');
        }
      },
    });
  };

  // Base64解码
  const decodeBase64 = (str: string): string => {
    try {
      return atob(str);
    } catch {
      return str;
    }
  };

  // 掩码显示
  const maskValue = (value: string): string => {
    return '*'.repeat(Math.min(value.length, 20));
  };

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '100px' }}>
        <Spin size="large" />
      </div>
    );
  }

  if (!secret) {
    return (
      <Card>
        <div style={{ textAlign: 'center', padding: '50px' }}>
          <Text>Secret不存在</Text>
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
                Secret: {secret.name}
              </Title>
            </Space>
            <Space>
              <Button icon={<ReloadOutlined />} onClick={loadSecret}>
                刷新
              </Button>
              <Button
                icon={<EditOutlined />}
                onClick={() =>
                  navigate(`/clusters/${clusterId}/configs/secret/${namespace}/${name}/edit`)
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
            <Descriptions.Item label="名称">{secret.name}</Descriptions.Item>
            <Descriptions.Item label="命名空间">
              <Tag color="blue">{secret.namespace}</Tag>
            </Descriptions.Item>
            <Descriptions.Item label="类型">
              <Tag color="orange">{secret.type}</Tag>
            </Descriptions.Item>
            <Descriptions.Item label="创建时间">
              {new Date(secret.creationTimestamp).toLocaleString('zh-CN')}
            </Descriptions.Item>
            <Descriptions.Item label="存在时间">
              {secret.age}
            </Descriptions.Item>
            <Descriptions.Item label="资源版本">
              {secret.resourceVersion}
            </Descriptions.Item>
          </Descriptions>
        </Card>

        {/* 标签和注解 */}
        <Card title="标签和注解">
          <Tabs defaultActiveKey="labels">
            <TabPane tab="标签" key="labels">
              <Space size={[0, 8]} wrap>
                {Object.entries(secret.labels || {}).length > 0 ? (
                  Object.entries(secret.labels).map(([key, value]) => (
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
                {Object.entries(secret.annotations || {}).length > 0 ? (
                  Object.entries(secret.annotations).map(([key, value]) => (
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
        <Card
          title="数据内容"
          extra={
            <Space>
              <Text>显示值</Text>
              <Switch
                checked={showValues}
                onChange={setShowValues}
                checkedChildren={<EyeOutlined />}
                unCheckedChildren={<EyeInvisibleOutlined />}
              />
            </Space>
          }
        >
          {Object.entries(secret.data || {}).length > 0 ? (
            <Tabs type="card">
              {Object.entries(secret.data).map(([key, value]) => {
                const decodedValue = decodeBase64(value);
                const displayValue = showValues ? decodedValue : maskValue(decodedValue);
                
                return (
                  <TabPane tab={key} key={key}>
                    <div style={{ border: '1px solid #d9d9d9', borderRadius: '4px' }}>
                      <MonacoEditor
                        height="400px"
                        language="plaintext"
                        value={displayValue}
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
                );
              })}
            </Tabs>
          ) : (
            <Text type="secondary">无数据</Text>
          )}
        </Card>
      </Space>
    </div>
  );
};

export default SecretDetail;

