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
import { IngressService } from '../../services/ingressService';
import { ResourceService } from '../../services/resourceService';
import MonacoEditor, { DiffEditor } from '@monaco-editor/react';
import * as YAML from 'yaml';

const { Text, Title } = Typography;

const IngressEdit: React.FC = () => {
  const navigate = useNavigate();
  const { modal } = App.useApp();
  const { clusterId, namespace, name } = useParams<{
    clusterId: string;
    namespace: string;
    name: string;
  }>();

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [ingressName, setIngressName] = useState('');
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

  // 加载 Ingress 详情
  const loadIngress = useCallback(async () => {
    if (!clusterId || !namespace || !name) return;
    setLoading(true);
    try {
      const response = await IngressService.getIngressYAML(clusterId, namespace, name);
      if (response.code === 200 && response.data) {
        setIngressName(name);
        // response.data 是 { yaml: "..." } 格式
        const yamlStr = response.data.yaml || '';
        setYamlContent(yamlStr);
        setOriginalYaml(yamlStr);
      } else {
        message.error(response.message || '加载Ingress详情失败');
        navigate(`/clusters/${clusterId}/network`);
      }
    } catch (error) {
      const err = error as { response?: { data?: { error?: string } } };
      message.error(err.response?.data?.error || '加载Ingress详情失败');
      navigate(`/clusters/${clusterId}/network`);
    } finally {
      setLoading(false);
    }
  }, [clusterId, namespace, name, navigate]);

  useEffect(() => {
    loadIngress();
  }, [loadIngress]);

  // 预检（Dry Run）
  const handleDryRun = async () => {
    if (!clusterId) return;

    // 验证 YAML 格式
    try {
      YAML.parse(yamlContent);
    } catch (error) {
      message.error('YAML 格式错误: ' + (error instanceof Error ? error.message : '未知错误'));
      return;
    }

    setDryRunning(true);
    setDryRunResult(null);

    try {
      await ResourceService.applyYAML(clusterId, 'Ingress', yamlContent, true);
      setDryRunResult({
        success: true,
        message: '预检通过！YAML 配置有效，可以安全应用。',
      });
    } catch (error) {
      const err = error as { response?: { data?: { error?: string } } };
      setDryRunResult({
        success: false,
        message: err.response?.data?.error || '预检失败',
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
      await ResourceService.applyYAML(clusterId, 'Ingress', pendingYaml, false);
      message.success('Ingress 更新成功');
      setDiffModalVisible(false);
      navigate(`/clusters/${clusterId}/network`);
    } catch (error) {
      const err = error as { response?: { data?: { error?: string } } };
      message.error(err.response?.data?.error || '更新失败');
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
      message.error('YAML 格式错误: ' + (error instanceof Error ? error.message : '未知错误'));
      return;
    }

    // 执行预检
    setSubmitting(true);
    try {
      await ResourceService.applyYAML(clusterId, 'Ingress', yamlContent, true);
      // 预检通过，展示 diff 对比
      setPendingYaml(yamlContent);
      setDiffModalVisible(true);
    } catch (error) {
      const err = error as { response?: { data?: { error?: string } } };
      message.error('预检失败: ' + (err.response?.data?.error || '未知错误'));
    } finally {
      setSubmitting(false);
    }
  };

  // 返回上一页
  const handleBack = () => {
    if (yamlContent !== originalYaml) {
      modal.confirm({
        title: '确认离开',
        content: '您有未保存的更改，确定要离开吗？',
        okText: '确定',
        cancelText: '取消',
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
                返回
              </Button>
              <Title level={4} style={{ margin: 0 }}>
                编辑 Ingress: {ingressName}
              </Title>
              {hasChanges && (
                <Text type="warning">• 有未保存的更改</Text>
              )}
            </Space>
            <Space>
              <Button
                icon={<CheckCircleOutlined />}
                loading={dryRunning}
                onClick={handleDryRun}
              >
                预检 (Dry Run)
              </Button>
              <Button onClick={handleBack}>
                取消
              </Button>
              <Button
                type="primary"
                icon={<SaveOutlined />}
                loading={submitting}
                onClick={handleSubmit}
                disabled={!hasChanges}
              >
                保存
              </Button>
            </Space>
          </Space>
        </Card>

        {/* 预检结果提示 */}
        {dryRunResult && (
          <Alert
            message={dryRunResult.success ? '预检通过' : '预检失败'}
            description={dryRunResult.message}
            type={dryRunResult.success ? 'success' : 'error'}
            showIcon
            icon={dryRunResult.success ? <CheckCircleOutlined /> : <ExclamationCircleOutlined />}
            closable
            onClose={() => setDryRunResult(null)}
          />
        )}

        {/* YAML 编辑器 */}
        <Card title="YAML 编辑">
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
            <span>确认更改 - YAML Diff 对比</span>
          </Space>
        }
        open={diffModalVisible}
        onCancel={() => setDiffModalVisible(false)}
        width={1200}
        footer={[
          <Button key="cancel" onClick={() => setDiffModalVisible(false)}>
            取消
          </Button>,
          <Button
            key="submit"
            type="primary"
            loading={submitting}
            onClick={handleConfirmDiff}
          >
            确认更新
          </Button>,
        ]}
      >
        <Alert
          message="请仔细检查以下更改"
          description="左侧为原始配置，右侧为修改后的配置。确认无误后点击「确认更新」按钮应用更改。"
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
        />
        <div style={{ display: 'flex', gap: 16, marginBottom: 8 }}>
          <div style={{ flex: 1 }}>
            <Text strong style={{ color: '#cf1322' }}>原始配置</Text>
          </div>
          <div style={{ flex: 1 }}>
            <Text strong style={{ color: '#389e0d' }}>修改后配置</Text>
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

export default IngressEdit;

