import React, { useState, useEffect, useCallback } from 'react';
import {
  Card,
  Button,
  Space,
  Alert,
  Spin,
  Modal,
  Typography,
  Tooltip,
  App,
} from 'antd';
import {
  ArrowLeftOutlined,
  SaveOutlined,
  CheckCircleOutlined,
  ExclamationCircleOutlined,
  DiffOutlined,
  ReloadOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import MonacoEditor, { DiffEditor } from '@monaco-editor/react';
import * as YAML from 'yaml';
import { ResourceService } from '../../services/resourceService';
import type { ResourceKind } from '../../services/resourceService';

const { Text } = Typography;

export interface ResourceYAMLEditorProps {
  clusterId: string;
  kind: ResourceKind;
  namespace?: string;
  name?: string;
  isEdit?: boolean;
  onSuccess?: () => void;
  onCancel?: () => void;
  title?: string;
}

/**
 * 通用资源 YAML 编辑器组件
 */
const ResourceYAMLEditor: React.FC<ResourceYAMLEditorProps> = ({
  clusterId,
  kind,
  namespace,
  name,
  isEdit = false,
  onSuccess,
  onCancel,
  title,
}) => {
  const { t } = useTranslation('components');
  const { message: messageApi, modal } = App.useApp();
  
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [dryRunning, setDryRunning] = useState(false);
  const [dryRunResult, setDryRunResult] = useState<{ success: boolean; message: string } | null>(null);
  
  const [yamlContent, setYamlContent] = useState('');
  const [originalYaml, setOriginalYaml] = useState('');
  
  const [diffModalVisible, setDiffModalVisible] = useState(false);
  const [pendingYaml, setPendingYaml] = useState('');

  const loadResourceYAML = useCallback(async () => {
    if (!isEdit || !name) {
      const defaultYAML = ResourceService.getDefaultYAML(kind, namespace || 'default');
      setYamlContent(defaultYAML);
      setOriginalYaml('');
      return;
    }

    setLoading(true);
    try {
      const response = await ResourceService.getYAML(clusterId, kind, namespace || null, name);
      if (response.yaml) {
        setYamlContent(response.yaml);
        setOriginalYaml(response.yaml);
      }
    } catch (error) {
      console.error('Failed to load YAML:', error);
      messageApi.error(t('resourceYAMLEditor.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [clusterId, kind, namespace, name, isEdit, messageApi, t]);

  useEffect(() => {
    loadResourceYAML();
  }, [loadResourceYAML]);

  const handleDryRun = async () => {
    try {
      YAML.parse(yamlContent);
    } catch (err) {
      setDryRunResult({
        success: false,
        message: t('resourceYAMLEditor.yamlError', { error: err instanceof Error ? err.message : t('resourceYAMLEditor.unknownError') }),
      });
      return;
    }

    setDryRunning(true);
    setDryRunResult(null);

    try {
      const response = await ResourceService.applyYAML(clusterId, kind, yamlContent, true);
      setDryRunResult({
        success: true,
        message: t('resourceYAMLEditor.dryRunPass', {
          action: response.isCreated ? t('resourceYAMLEditor.willCreate') : t('resourceYAMLEditor.willUpdate'),
          kind: ResourceService.getKindDisplayName(kind),
          name: response.name,
        }),
      });
    } catch (error: unknown) {
      setDryRunResult({
        success: false,
        message: error instanceof Error ? error.message : t('resourceYAMLEditor.dryRunRequestFailed'),
      });
    } finally {
      setDryRunning(false);
    }
  };

  const submitYaml = async (yaml: string) => {
    setSubmitting(true);
    try {
      const response = await ResourceService.applyYAML(clusterId, kind, yaml, false);
      messageApi.success(response.isCreated ? t('resourceYAMLEditor.createSuccess') : t('resourceYAMLEditor.updateSuccess'));
      onSuccess?.();
    } catch (error: unknown) {
      console.error('Submit failed:', error);
      messageApi.error(error instanceof Error ? error.message : t('resourceYAMLEditor.operationFailed'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmit = async () => {
    try {
      YAML.parse(yamlContent);
    } catch (err) {
      messageApi.error(t('resourceYAMLEditor.yamlError', { error: err instanceof Error ? err.message : t('resourceYAMLEditor.unknownError') }));
      return;
    }

    if (isEdit && originalYaml) {
      setPendingYaml(yamlContent);
      setDiffModalVisible(true);
    } else {
      modal.confirm({
        title: t('resourceYAMLEditor.confirmCreate', { kind: ResourceService.getKindDisplayName(kind) }),
        content: (
          <div>
            <p>{t('resourceYAMLEditor.confirmCreateContent')}</p>
            <p style={{ color: '#666', fontSize: 12 }}>{t('resourceYAMLEditor.dryRunSuggestion')}</p>
          </div>
        ),
        okText: t('resourceYAMLEditor.confirm'),
        cancelText: t('resourceYAMLEditor.cancel'),
        onOk: () => submitYaml(yamlContent),
      });
    }
  };

  const handleConfirmDiff = () => {
    setDiffModalVisible(false);
    submitYaml(pendingYaml);
  };

  const handleReset = () => {
    if (isEdit && originalYaml) {
      setYamlContent(originalYaml);
    } else {
      setYamlContent(ResourceService.getDefaultYAML(kind, namespace || 'default'));
    }
    setDryRunResult(null);
    messageApi.success(t('resourceYAMLEditor.resetDone'));
  };

  const displayTitle = title || `${isEdit ? t('resourceYAMLEditor.edit') : t('resourceYAMLEditor.create')} ${ResourceService.getKindDisplayName(kind)}`;

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 400 }}>
        <Spin size="large" tip={t('resourceYAMLEditor.loading')} />
      </div>
    );
  }

  return (
    <div style={{ padding: 24 }}>
      {/* 头部 */}
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Space>
          {onCancel && (
            <Button icon={<ArrowLeftOutlined />} onClick={onCancel}>
              {t('resourceYAMLEditor.back')}
            </Button>
          )}
          <h2 style={{ margin: 0 }}>{displayTitle}</h2>
          {isEdit && namespace && name && (
            <Text type="secondary">
              {namespace}/{name}
            </Text>
          )}
        </Space>

        <Space>
          <Tooltip title={t('resourceYAMLEditor.dryRunTooltip')}>
            <Button
              onClick={handleDryRun}
              loading={dryRunning}
              icon={dryRunResult?.success ? <CheckCircleOutlined /> : <ExclamationCircleOutlined />}
            >
              {t('resourceYAMLEditor.dryRun')}
            </Button>
          </Tooltip>
          <Button icon={<ReloadOutlined />} onClick={handleReset}>
            {t('resourceYAMLEditor.reset')}
          </Button>
          {onCancel && <Button onClick={onCancel}>{t('resourceYAMLEditor.cancelBtn')}</Button>}
          <Button
            type="primary"
            icon={<SaveOutlined />}
            onClick={handleSubmit}
            loading={submitting}
          >
            {isEdit ? t('resourceYAMLEditor.update') : t('resourceYAMLEditor.create')}
          </Button>
        </Space>
      </div>

      {/* 预检结果 */}
      {dryRunResult && (
        <Alert
          message={dryRunResult.success ? t('resourceYAMLEditor.dryRunPassTitle') : t('resourceYAMLEditor.dryRunFailTitle')}
          description={dryRunResult.message}
          type={dryRunResult.success ? 'success' : 'error'}
          showIcon
          closable
          onClose={() => setDryRunResult(null)}
          style={{ marginBottom: 16 }}
        />
      )}

      {/* YAML 编辑器 */}
      <Card title={t('resourceYAMLEditor.yamlEdit')}>
        <MonacoEditor
          height="600px"
          language="yaml"
          value={yamlContent}
          onChange={(value) => {
            setYamlContent(value || '');
            setDryRunResult(null);
          }}
          options={{
            minimap: { enabled: false },
            fontSize: 14,
            lineNumbers: 'on',
            wordWrap: 'on',
            automaticLayout: true,
            scrollBeyondLastLine: false,
            tabSize: 2,
          }}
        />
      </Card>

      {/* Diff 对比弹窗 */}
      <Modal
        title={
          <Space>
            <DiffOutlined />
            <span>{t('resourceYAMLEditor.diffTitle')}</span>
          </Space>
        }
        open={diffModalVisible}
        onCancel={() => setDiffModalVisible(false)}
        onOk={handleConfirmDiff}
        width="90%"
        style={{ top: 20 }}
        okText={t('resourceYAMLEditor.confirmUpdate')}
        cancelText={t('resourceYAMLEditor.cancel')}
        destroyOnClose
      >
        <div style={{ marginBottom: 16 }}>
          <Space>
            <Text type="secondary">
              {t('resourceYAMLEditor.diffHint')}
            </Text>
          </Space>
        </div>
        <div style={{ border: '1px solid #d9d9d9', borderRadius: 4 }}>
          <DiffEditor
            height="60vh"
            language="yaml"
            original={originalYaml}
            modified={pendingYaml}
            options={{
              readOnly: true,
              minimap: { enabled: false },
              fontSize: 13,
              lineNumbers: 'on',
              wordWrap: 'on',
              automaticLayout: true,
              scrollBeyondLastLine: false,
              renderSideBySide: true,
              diffWordWrap: 'on',
            }}
          />
        </div>
      </Modal>
    </div>
  );
};

export default ResourceYAMLEditor;
