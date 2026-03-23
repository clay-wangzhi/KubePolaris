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
import { ServiceService } from '../../services/serviceService';
import { ResourceService } from '../../services/resourceService';
import MonacoEditor, { DiffEditor } from '@monaco-editor/react';
import * as YAML from 'yaml';
import { useTranslation } from 'react-i18next';
import { parseApiError } from '../../utils/api';

const { Text, Title } = Typography;

const ServiceEdit: React.FC = () => {
  const navigate = useNavigate();
  const { modal } = App.useApp();
  const { clusterId, namespace, name } = useParams<{
    clusterId: string;
    namespace: string;
    name: string;
  }>();

const { t } = useTranslation(['network', 'common']);
const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [serviceName, setServiceName] = useState('');
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

  // 加载 Service 详情
  const loadService = useCallback(async () => {
    if (!clusterId || !namespace || !name) return;
    setLoading(true);
    try {
      const response = await ServiceService.getServiceYAML(clusterId, namespace, name);
      setServiceName(name);
      const yamlStr = response.yaml || '';
      setYamlContent(yamlStr);
      setOriginalYaml(yamlStr);
    } catch (error: unknown) {
      message.error(parseApiError(error) || t('network:editPage.loadServiceError'));
      navigate(`/clusters/${clusterId}/network`);
    } finally {
      setLoading(false);
    }
  }, [clusterId, namespace, name, navigate]);

  useEffect(() => {
    loadService();
  }, [loadService]);

  // 预检（Dry Run）
  const handleDryRun = async () => {
    if (!clusterId) return;

    // 验证 YAML 格式
    try {
      YAML.parse(yamlContent);
    } catch (error) {
      message.error(t('network:editPage.yamlFormatError', { error: error instanceof Error ? error.message : t('network:editPage.unknownError') }));
      return;
    }

    setDryRunning(true);
    setDryRunResult(null);

    try {
      await ResourceService.applyYAML(clusterId, 'Service', yamlContent, true);
      setDryRunResult({
        success: true,
        message: t('network:editPage.dryRunSuccess'),
      });
    } catch (error: unknown) {
      setDryRunResult({
        success: false,
        message: parseApiError(error) || t('network:editPage.dryRunFailed'),
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
      await ResourceService.applyYAML(clusterId, 'Service', pendingYaml, false);
      message.success(t('network:editPage.serviceUpdateSuccess'));
      setDiffModalVisible(false);
      navigate(`/clusters/${clusterId}/network`);
    } catch (error: unknown) {
      message.error(parseApiError(error) || t('network:editPage.updateFailed'));
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
      message.error(t('network:editPage.yamlFormatError', { error: error instanceof Error ? error.message : t('network:editPage.unknownError') }));
      return;
    }

    // 执行预检
    setSubmitting(true);
    try {
      await ResourceService.applyYAML(clusterId, 'Service', yamlContent, true);
      // 预检通过，展示 diff 对比
      setPendingYaml(yamlContent);
      setDiffModalVisible(true);
    } catch (error: unknown) {
      message.error(t('network:editPage.dryRunFailedPrefix', { error: parseApiError(error) || t('network:editPage.unknownError') }));
    } finally {
      setSubmitting(false);
    }
  };

  // 返回上一页
  const handleBack = () => {
    if (yamlContent !== originalYaml) {
      modal.confirm({
        title: t('network:editPage.confirmLeave'),
        content: t('network:editPage.confirmLeaveDesc'),
        okText: t('common:actions.confirm'),
        cancelText: t('common:actions.cancel'),
        onOk: () => navigate(`/clusters/${clusterId}/network`),
      });
    } else {
      navigate(`/clusters/${clusterId}/network`);
    }
  };

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '100px' }}>
        <Spin size="large" />
      </div>
    );
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
                {t('network:editPage.back')}
              </Button>
              <Title level={4} style={{ margin: 0 }}>
                {t('network:editPage.editService', { name: serviceName })}
              </Title>
              {hasChanges && (
                <Text type="warning">{t('network:editPage.unsavedChanges')}</Text>
              )}
            </Space>
            <Space>
              <Button
                icon={<CheckCircleOutlined />}
                loading={dryRunning}
                onClick={handleDryRun}
              >
                {t('network:editPage.dryRun')}
              </Button>
              <Button onClick={handleBack}>
                {t('network:editPage.cancel')}
              </Button>
              <Button
                type="primary"
                icon={<SaveOutlined />}
                loading={submitting}
                onClick={handleSubmit}
                disabled={!hasChanges}
              >
                {t('network:editPage.save')}
              </Button>
            </Space>
          </Space>
        </Card>

        {/* 预检结果提示 */}
        {dryRunResult && (
          <Alert
            message={dryRunResult.success ? t('network:editPage.dryRunSuccessTitle') : t('network:editPage.dryRunFailedTitle')}
            description={dryRunResult.message}
            type={dryRunResult.success ? 'success' : 'error'}
            showIcon
            icon={dryRunResult.success ? <CheckCircleOutlined /> : <ExclamationCircleOutlined />}
            closable
            onClose={() => setDryRunResult(null)}
          />
        )}

        {/* YAML 编辑器 */}
        <Card title={t('network:editPage.yamlEditor')}>
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
            <span>{t('network:editPage.confirmChanges')}</span>
          </Space>
        }
        open={diffModalVisible}
        onCancel={() => setDiffModalVisible(false)}
        width={1200}
        footer={[
          <Button key="cancel" onClick={() => setDiffModalVisible(false)}>
            {t('network:editPage.cancel')}
          </Button>,
          <Button
            key="submit"
            type="primary"
            loading={submitting}
            onClick={handleConfirmDiff}
          >
            {t('network:editPage.confirmUpdate')}
          </Button>,
        ]}
      >
        <Alert
          message={t('network:editPage.reviewChanges')}
          description={t('network:editPage.reviewChangesDesc')}
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
        />
        <div style={{ display: 'flex', gap: 16, marginBottom: 8 }}>
          <div style={{ flex: 1 }}>
            <Text strong style={{ color: '#cf1322' }}>{t('network:editPage.originalConfig')}</Text>
          </div>
          <div style={{ flex: 1 }}>
            <Text strong style={{ color: '#389e0d' }}>{t('network:editPage.modifiedConfig')}</Text>
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

export default ServiceEdit;

