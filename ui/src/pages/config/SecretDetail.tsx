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
import { useTranslation } from 'react-i18next';
import { parseApiError } from '../../utils/api';

const { Title, Text } = Typography;
const { TabPane } = Tabs;

const SecretDetail: React.FC = () => {
  const navigate = useNavigate();
  const { clusterId, namespace, name } = useParams<{
    clusterId: string;
    namespace: string;
    name: string;
  }>();
const { t } = useTranslation(['config', 'common']);
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
    } catch (error: unknown) {
      message.error(parseApiError(error) || t('config:detail.loadSecretError'));
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
      title: t('common:messages.confirmDelete'),
      content: t('config:detail.confirmDeleteSecret', { name }),
      onOk: async () => {
        if (!clusterId || !namespace || !name) return;
        try {
            await secretService.deleteSecret(Number(clusterId), namespace, name);
          message.success(t('config:detail.deleteSecretSuccess'));
          navigate(`/clusters/${clusterId}/configs`);
        } catch (error: unknown) {
          message.error(parseApiError(error) || t('config:detail.deleteSecretError'));
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
          <Text>{t('config:detail.secretNotExist')}</Text>
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
                {t('common:actions.back')}
              </Button>
              <Title level={4} style={{ margin: 0 }}>
                Secret: {secret.name}
              </Title>
            </Space>
            <Space>
              <Button icon={<ReloadOutlined />} onClick={loadSecret}>
                {t('common:actions.refresh')}
              </Button>
              <Button
                icon={<EditOutlined />}
                onClick={() =>
                  navigate(`/clusters/${clusterId}/configs/secret/${namespace}/${name}/edit`)
                }
              >
                {t('common:actions.edit')}
              </Button>
              <Button icon={<DeleteOutlined />} danger onClick={handleDelete}>
                {t('common:actions.delete')}
              </Button>
            </Space>
          </Space>
        </Card>

        {/* 基本信息 */}
        <Card title={t('config:detail.basicInfo')}>
          <Descriptions bordered column={2}>
            <Descriptions.Item label={t('config:detail.name')}>{secret.name}</Descriptions.Item>
            <Descriptions.Item label={t('config:detail.namespace')}>
              <Tag color="blue">{secret.namespace}</Tag>
            </Descriptions.Item>
            <Descriptions.Item label={t('config:detail.type')}>
              <Tag color="orange">{secret.type}</Tag>
            </Descriptions.Item>
            <Descriptions.Item label={t('config:detail.createdAt')}>
              {new Date(secret.creationTimestamp).toLocaleString('zh-CN')}
            </Descriptions.Item>
            <Descriptions.Item label={t('config:detail.age')}>
              {secret.age}
            </Descriptions.Item>
            <Descriptions.Item label={t('config:detail.resourceVersion')}>
              {secret.resourceVersion}
            </Descriptions.Item>
          </Descriptions>
        </Card>

        {/* 标签和注解 */}
        <Card title={t('config:detail.labelsAndAnnotations')}>
          <Tabs defaultActiveKey="labels">
            <TabPane tab={t('config:detail.labels')} key="labels">
              <Space size={[0, 8]} wrap>
                {Object.entries(secret.labels || {}).length > 0 ? (
                  Object.entries(secret.labels).map(([key, value]) => (
                    <Tag key={key} color="blue">
                      {key}: {value}
                    </Tag>
                  ))
                ) : (
                  <Text type="secondary">{t('config:detail.noLabels')}</Text>
                )}
              </Space>
            </TabPane>
            <TabPane tab={t('config:detail.annotations')} key="annotations">
              <Space size={[0, 8]} wrap direction="vertical" style={{ width: '100%' }}>
                {Object.entries(secret.annotations || {}).length > 0 ? (
                  Object.entries(secret.annotations).map(([key, value]) => (
                    <div key={key}>
                      <Text strong>{key}:</Text> <Text>{value}</Text>
                    </div>
                  ))
                ) : (
                  <Text type="secondary">{t('config:detail.noAnnotations')}</Text>
                )}
              </Space>
            </TabPane>
          </Tabs>
        </Card>

        {/* 数据内容 */}
        <Card
          title={t('config:detail.dataContent')}
          extra={
            <Space>
              <Text>{t('config:detail.showValues')}</Text>
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
            <Text type="secondary">{t('config:detail.noData')}</Text>
          )}
        </Card>
      </Space>
    </div>
  );
};

export default SecretDetail;

