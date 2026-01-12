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
  isEdit?: boolean; // 是否为编辑模式
  onSuccess?: () => void;
  onCancel?: () => void;
  title?: string;
}

/**
 * 通用资源 YAML 编辑器组件
 * 支持：
 * 1. 编辑前预检 (dry-run)
 * 2. 更新时 YAML diff 比对
 * 3. 创建/更新资源
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
  const { message: messageApi, modal } = App.useApp();
  
  // 状态
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [dryRunning, setDryRunning] = useState(false);
  const [dryRunResult, setDryRunResult] = useState<{ success: boolean; message: string } | null>(null);
  
  // YAML 内容
  const [yamlContent, setYamlContent] = useState('');
  const [originalYaml, setOriginalYaml] = useState('');
  
  // Diff 弹窗状态
  const [diffModalVisible, setDiffModalVisible] = useState(false);
  const [pendingYaml, setPendingYaml] = useState('');

  // 加载现有资源的 YAML
  const loadResourceYAML = useCallback(async () => {
    if (!isEdit || !name) {
      // 创建模式，使用默认模板
      const defaultYAML = ResourceService.getDefaultYAML(kind, namespace || 'default');
      setYamlContent(defaultYAML);
      setOriginalYaml('');
      return;
    }

    setLoading(true);
    try {
      const response = await ResourceService.getYAML(clusterId, kind, namespace || null, name);
      if (response.code === 200 && response.data.yaml) {
        setYamlContent(response.data.yaml);
        setOriginalYaml(response.data.yaml);
      } else {
        messageApi.error(response.message || '加载 YAML 失败');
      }
    } catch (error) {
      console.error('加载 YAML 失败:', error);
      messageApi.error('加载 YAML 失败');
    } finally {
      setLoading(false);
    }
  }, [clusterId, kind, namespace, name, isEdit, messageApi]);

  // 初始化
  useEffect(() => {
    loadResourceYAML();
  }, [loadResourceYAML]);

  // 预检 (dry-run)
  const handleDryRun = async () => {
    // 验证 YAML 格式
    try {
      YAML.parse(yamlContent);
    } catch (err) {
      setDryRunResult({
        success: false,
        message: 'YAML 格式错误: ' + (err instanceof Error ? err.message : '未知错误'),
      });
      return;
    }

    setDryRunning(true);
    setDryRunResult(null);

    try {
      const response = await ResourceService.applyYAML(clusterId, kind, yamlContent, true);
      if (response.code === 200) {
        setDryRunResult({
          success: true,
          message: `预检通过！${response.data.isCreated ? '将创建' : '将更新'} ${ResourceService.getKindDisplayName(kind)}: ${response.data.name}`,
        });
      } else {
        setDryRunResult({
          success: false,
          message: response.message || '预检失败',
        });
      }
    } catch (error: unknown) {
      setDryRunResult({
        success: false,
        message: error instanceof Error ? error.message : '预检请求失败',
      });
    } finally {
      setDryRunning(false);
    }
  };

  // 提交 YAML
  const submitYaml = async (yaml: string) => {
    setSubmitting(true);
    try {
      const response = await ResourceService.applyYAML(clusterId, kind, yaml, false);
      if (response.code === 200) {
        messageApi.success(response.data.isCreated ? '创建成功' : '更新成功');
        onSuccess?.();
      } else {
        messageApi.error(response.message || '操作失败');
      }
    } catch (error: unknown) {
      console.error('提交失败:', error);
      messageApi.error(error instanceof Error ? error.message : '操作失败');
    } finally {
      setSubmitting(false);
    }
  };

  // 处理提交
  const handleSubmit = async () => {
    // 验证 YAML 格式
    try {
      YAML.parse(yamlContent);
    } catch (err) {
      messageApi.error('YAML 格式错误: ' + (err instanceof Error ? err.message : '未知错误'));
      return;
    }

    // 编辑模式下显示 diff 对比弹窗
    if (isEdit && originalYaml) {
      setPendingYaml(yamlContent);
      setDiffModalVisible(true);
    } else {
      // 创建模式直接确认
      modal.confirm({
        title: `确认创建 ${ResourceService.getKindDisplayName(kind)}`,
        content: (
          <div>
            <p>确定要创建该资源吗？</p>
            <p style={{ color: '#666', fontSize: 12 }}>建议先点击"预检"按钮验证配置是否正确。</p>
          </div>
        ),
        okText: '确认',
        cancelText: '取消',
        onOk: () => submitYaml(yamlContent),
      });
    }
  };

  // 确认 diff 后提交
  const handleConfirmDiff = () => {
    setDiffModalVisible(false);
    submitYaml(pendingYaml);
  };

  // 重置
  const handleReset = () => {
    if (isEdit && originalYaml) {
      setYamlContent(originalYaml);
    } else {
      setYamlContent(ResourceService.getDefaultYAML(kind, namespace || 'default'));
    }
    setDryRunResult(null);
    messageApi.success('已重置');
  };

  const displayTitle = title || `${isEdit ? '编辑' : '创建'} ${ResourceService.getKindDisplayName(kind)}`;

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 400 }}>
        <Spin size="large" tip="加载中..." />
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
              返回
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
          <Tooltip title="预检会通过 dry-run 验证 YAML 是否符合 Kubernetes 规范">
            <Button
              onClick={handleDryRun}
              loading={dryRunning}
              icon={dryRunResult?.success ? <CheckCircleOutlined /> : <ExclamationCircleOutlined />}
            >
              预检
            </Button>
          </Tooltip>
          <Button icon={<ReloadOutlined />} onClick={handleReset}>
            重置
          </Button>
          {onCancel && <Button onClick={onCancel}>取消</Button>}
          <Button
            type="primary"
            icon={<SaveOutlined />}
            onClick={handleSubmit}
            loading={submitting}
          >
            {isEdit ? '更新' : '创建'}
          </Button>
        </Space>
      </div>

      {/* 预检结果 */}
      {dryRunResult && (
        <Alert
          message={dryRunResult.success ? '预检通过' : '预检失败'}
          description={dryRunResult.message}
          type={dryRunResult.success ? 'success' : 'error'}
          showIcon
          closable
          onClose={() => setDryRunResult(null)}
          style={{ marginBottom: 16 }}
        />
      )}

      {/* YAML 编辑器 */}
      <Card title="YAML 编辑">
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
            <span>YAML 变更对比</span>
          </Space>
        }
        open={diffModalVisible}
        onCancel={() => setDiffModalVisible(false)}
        onOk={handleConfirmDiff}
        width="90%"
        style={{ top: 20 }}
        okText="确认更新"
        cancelText="取消"
        destroyOnClose
      >
        <div style={{ marginBottom: 16 }}>
          <Space>
            <Text type="secondary">
              左侧为原始配置，右侧为修改后的配置。红色表示删除，绿色表示新增。
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

