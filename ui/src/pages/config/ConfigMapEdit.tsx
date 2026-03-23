import React, { useEffect, useState, useCallback } from 'react';
import {
  Card,
  Button,
  Space,
  message,
  Spin,
  Alert,
  Modal,
  Typography,
  App,
} from 'antd';
import {
  ArrowLeftOutlined,
  SaveOutlined,
  CheckCircleOutlined,
  ExclamationCircleOutlined,
  DiffOutlined,
} from '@ant-design/icons';
import { useNavigate, useParams } from 'react-router-dom';
import { configMapService, type ConfigMapDetail } from '../../services/configService';
import { ResourceService } from '../../services/resourceService';
import MonacoEditor, { DiffEditor } from '@monaco-editor/react';
import * as YAML from 'yaml';
import { useTranslation } from 'react-i18next';
import { parseApiError } from '../../utils/api';

const { Text, Title } = Typography;

const ConfigMapEdit: React.FC = () => {
  const navigate = useNavigate();
  const { modal } = App.useApp();
  const { clusterId, namespace, name } = useParams<{
    clusterId: string;
    namespace: string;
    name: string;
  }>();

const { t } = useTranslation(['config', 'common']);
const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [configMap, setConfigMap] = useState<ConfigMapDetail | null>(null);
  const [yamlContent, setYamlContent] = useState('');
  const [originalYaml, setOriginalYaml] = useState('');

  // 预检相关状态
  const [dryRunning, setDryRunning] = useState(false);
  const [dryRunResult, setDryRunResult] = useState<{
    success: boolean;
    message: string;
  } | null>(null);

  // Diff 对比相关状态
  const [diffModalVisible, setDiffModalVisible] = useState(false);
  const [pendingYaml, setPendingYaml] = useState<string>('');

  // 加载 ConfigMap 详情
  const loadConfigMap = useCallback(async () => {
    if (!clusterId || !namespace || !name) return;
    setLoading(true);
    try {
      const data = await configMapService.getConfigMap(
        Number(clusterId),
        namespace,
        name
      );
      setConfigMap(data);

      // 生成 YAML 内容
      const yamlObj = {
        apiVersion: 'v1',
        kind: 'ConfigMap',
        metadata: {
          name: data.name,
          namespace: data.namespace,
          labels: data.labels || {},
          annotations: data.annotations || {},
        },
        data: data.data || {},
      };
      const yamlStr = YAML.stringify(yamlObj);
      setYamlContent(yamlStr);
      setOriginalYaml(yamlStr);
    } catch (error: unknown) {
      message.error(parseApiError(error) || t('config:edit.messages.loadConfigMapError'));
      navigate(`/clusters/${clusterId}/configs`);
    } finally {
      setLoading(false);
    }
  }, [clusterId, namespace, name, navigate]);

  useEffect(() => {
    loadConfigMap();
  }, [loadConfigMap]);

  // 预检（Dry Run）
  const handleDryRun = async () => {
    if (!clusterId) return;

    // 验证 YAML 格式
    try {
      YAML.parse(yamlContent);
    } catch (error) {
      message.error(t('config:edit.messages.yamlFormatError', { error: error instanceof Error ? error.message : t('config:edit.messages.unknownError') }));
      return;
    }

    setDryRunning(true);
    setDryRunResult(null);

    try {
      await ResourceService.applyYAML(clusterId, 'ConfigMap', yamlContent, true);
      setDryRunResult({
        success: true,
        message: t('config:edit.messages.dryRunPassed'),
      });
    } catch (error: unknown) {
      setDryRunResult({
        success: false,
        message: parseApiError(error) || t('config:edit.messages.dryRunFailed'),
      });
    } finally {
      setDryRunning(false);
    }
  };

  // 确认 Diff 后提交
  const handleConfirmDiff = async () => {
    if (!clusterId || !pendingYaml) return;

    setSubmitting(true);
    try {
      await ResourceService.applyYAML(clusterId, 'ConfigMap', pendingYaml, false);
      message.success(t('config:edit.messages.configMapUpdateSuccess'));
      setDiffModalVisible(false);
      navigate(`/clusters/${clusterId}/configs/configmap/${namespace}/${name}`);
    } catch (error: unknown) {
      message.error(parseApiError(error) || t('config:edit.messages.updateError'));
    } finally {
      setSubmitting(false);
    }
  };

  // 提交 - 先预检，再展示 diff
  const handleSubmit = async () => {
    if (!clusterId || !namespace || !name) return;

    // 验证 YAML 格式
    try {
      YAML.parse(yamlContent);
    } catch (error) {
      message.error(t('config:edit.messages.yamlFormatError', { error: error instanceof Error ? error.message : t('config:edit.messages.unknownError') }));
      return;
    }

    // 执行预检
    setSubmitting(true);
    try {
      await ResourceService.applyYAML(clusterId, 'ConfigMap', yamlContent, true);
      // 预检通过，展示 diff 对比
      setPendingYaml(yamlContent);
      setDiffModalVisible(true);
    } catch (error: unknown) {
      message.error(t('config:edit.messages.dryRunFailedWithError', { error: parseApiError(error) || t('config:edit.messages.unknownError') }));
    } finally {
      setSubmitting(false);
    }
  };

  // 返回上一页
  const handleBack = () => {
    if (yamlContent !== originalYaml) {
      modal.confirm({
        title: t('config:edit.confirmLeaveTitle'),
        content: t('config:edit.confirmLeaveContent'),
        okText: t('common:actions.confirm'),
        cancelText: t('common:actions.cancel'),
        onOk: () => navigate(`/clusters/${clusterId}/configs/configmap/${namespace}/${name}`),
      });
    } else {
      navigate(`/clusters/${clusterId}/configs/configmap/${namespace}/${name}`);
    }
  };

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '100px' }}>
        <Spin size="large" />
      </div>
    );
  }

  if (!configMap) {
    return null;
  }

  const hasChanges = yamlContent !== originalYaml;

  return (
    <div style={{ padding: '24px' }}>
      <Space direction="vertical" style={{ width: '100%' }} size="large">
        {/* 头部 */}
        <Card>
          <Space style={{ width: '100%', justifyContent: 'space-between' }}>
            <Space>
              <Button icon={<ArrowLeftOutlined />} onClick={handleBack}>
                {t('common:actions.back')}
              </Button>
              <Title level={4} style={{ margin: 0 }}>
                {t('config:edit.editConfigMap', { name: configMap.name })}
              </Title>
              {hasChanges && (
                <Text type="warning">{t('config:edit.unsavedChanges')}</Text>
              )}
            </Space>
            <Space>
              <Button
                icon={<CheckCircleOutlined />}
                loading={dryRunning}
                onClick={handleDryRun}
              >
                {t('config:edit.dryRun')}
              </Button>
              <Button onClick={handleBack}>
                {t('common:actions.cancel')}
              </Button>
              <Button
                type="primary"
                icon={<SaveOutlined />}
                loading={submitting}
                onClick={handleSubmit}
                disabled={!hasChanges}
              >
                {t('common:actions.save')}
              </Button>
            </Space>
          </Space>
        </Card>

        {/* 预检结果提示 */}
        {dryRunResult && (
          <Alert
            message={dryRunResult.success ? t('config:edit.dryRunPassedTitle') : t('config:edit.dryRunFailedTitle')}
            description={dryRunResult.message}
            type={dryRunResult.success ? 'success' : 'error'}
            showIcon
            icon={dryRunResult.success ? <CheckCircleOutlined /> : <ExclamationCircleOutlined />}
            closable
            onClose={() => setDryRunResult(null)}
          />
        )}

        {/* YAML 编辑器 */}
        <Card title={t('config:edit.yamlEditor')}>
          <div style={{ border: '1px solid #d9d9d9', borderRadius: '4px' }}>
            <MonacoEditor
              height="600px"
              language="yaml"
              value={yamlContent}
              onChange={(value) => {
                setYamlContent(value || '');
                setDryRunResult(null);
              }}
              options={{
                minimap: { enabled: true },
                fontSize: 14,
                lineNumbers: 'on',
                scrollBeyondLastLine: false,
                automaticLayout: true,
                tabSize: 2,
                insertSpaces: true,
                wordWrap: 'on',
                folding: true,
                bracketPairColorization: { enabled: true },
              }}
              theme="vs-light"
            />
          </div>
        </Card>
      </Space>

      {/* YAML Diff 对比 Modal */}
      <Modal
        title={
          <Space>
            <DiffOutlined />
            <span>{t('config:edit.confirmDiffTitle')}</span>
          </Space>
        }
        open={diffModalVisible}
        onCancel={() => setDiffModalVisible(false)}
        width={1200}
        footer={[
          <Button key="cancel" onClick={() => setDiffModalVisible(false)}>
            {t('common:actions.cancel')}
          </Button>,
          <Button
            key="submit"
            type="primary"
            loading={submitting}
            onClick={handleConfirmDiff}
          >
            {t('config:edit.confirmUpdate')}
          </Button>,
        ]}
      >
        <Alert
          message={t('config:edit.reviewChanges')}
          description={t('config:edit.reviewChangesConfigMapDesc')}
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
        />
        <div style={{ display: 'flex', gap: 16, marginBottom: 8 }}>
          <div style={{ flex: 1 }}>
            <Text strong style={{ color: '#cf1322' }}>{t('config:edit.originalConfig')}</Text>
          </div>
          <div style={{ flex: 1 }}>
            <Text strong style={{ color: '#389e0d' }}>{t('config:edit.modifiedConfig')}</Text>
          </div>
        </div>
        <div style={{ border: '1px solid #d9d9d9', borderRadius: '4px' }}>
          <DiffEditor
            height="500px"
            language="yaml"
            original={originalYaml}
            modified={pendingYaml}
            options={{
              readOnly: true,
              minimap: { enabled: false },
              fontSize: 13,
              lineNumbers: 'on',
              scrollBeyondLastLine: false,
              automaticLayout: true,
              renderSideBySide: true,
              enableSplitViewResizing: true,
            }}
            theme="vs-light"
          />
        </div>
      </Modal>
    </div>
  );
};

export default ConfigMapEdit;
