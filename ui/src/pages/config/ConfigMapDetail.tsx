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
import { useTranslation } from 'react-i18next';
import { parseApiError } from '../../utils/api';

const { Title, Text } = Typography;
const { TabPane } = Tabs;

const ConfigMapDetail: React.FC = () => {
  const navigate = useNavigate();
  const { clusterId, namespace, name } = useParams<{
    clusterId: string;
    namespace: string;
    name: string;
  }>();
const { t } = useTranslation(['config', 'common']);
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
    } catch (error: unknown) {
      message.error(parseApiError(error) || t('config:detail.loadConfigMapError'));
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
      title: t('common:messages.confirmDelete'),
      content: t('config:detail.confirmDeleteConfigMap', { name }),
      onOk: async () => {
        if (!clusterId || !namespace || !name) return;
        try {
            await configMapService.deleteConfigMap(Number(clusterId), namespace, name);
          message.success(t('config:detail.deleteConfigMapSuccess'));
          navigate(`/clusters/${clusterId}/configs`);
        } catch (error: unknown) {
          message.error(parseApiError(error) || t('config:detail.deleteConfigMapError'));
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
          <Text>{t('config:detail.configMapNotExist')}</Text>
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
                ConfigMap: {configMap.name}
              </Title>
            </Space>
            <Space>
              <Button icon={<ReloadOutlined />} onClick={loadConfigMap}>
                {t('common:actions.refresh')}
              </Button>
              <Button
                icon={<EditOutlined />}
                onClick={() =>
                  navigate(`/clusters/${clusterId}/configs/configmap/${namespace}/${name}/edit`)
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
            <Descriptions.Item label={t('config:detail.name')}>{configMap.name}</Descriptions.Item>
            <Descriptions.Item label={t('config:detail.namespace')}>
              <Tag color="blue">{configMap.namespace}</Tag>
            </Descriptions.Item>
            <Descriptions.Item label={t('config:detail.createdAt')}>
              {new Date(configMap.creationTimestamp).toLocaleString('zh-CN')}
            </Descriptions.Item>
            <Descriptions.Item label={t('config:detail.age')}>
              {configMap.age}
            </Descriptions.Item>
            <Descriptions.Item label={t('config:detail.resourceVersion')}>
              {configMap.resourceVersion}
            </Descriptions.Item>
          </Descriptions>
        </Card>

        {/* 标签和注解 */}
        <Card title={t('config:detail.labelsAndAnnotations')}>
          <Tabs defaultActiveKey="labels">
            <TabPane tab={t('config:detail.labels')} key="labels">
              <Space size={[0, 8]} wrap>
                {Object.entries(configMap.labels || {}).length > 0 ? (
                  Object.entries(configMap.labels).map(([key, value]) => (
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
                {Object.entries(configMap.annotations || {}).length > 0 ? (
                  Object.entries(configMap.annotations).map(([key, value]) => (
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
        <Card title={t('config:detail.dataContent')}>
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
            <Text type="secondary">{t('config:detail.noData')}</Text>
          )}
        </Card>
      </Space>
    </div>
  );
};

export default ConfigMapDetail;

