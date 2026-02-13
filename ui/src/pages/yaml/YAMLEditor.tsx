import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import {
  Card,
  Button,
  Space,
  message,
  Typography,
  Alert,
  Spin,
  Switch,
  Modal,
  App,
} from 'antd';
import {
  ArrowLeftOutlined,
  SaveOutlined,
  EyeOutlined,
  ReloadOutlined,
  CheckCircleOutlined,
  ExclamationCircleOutlined,
  DiffOutlined,
} from '@ant-design/icons';
import { Editor, DiffEditor, loader } from '@monaco-editor/react';
import * as monaco from 'monaco-editor';
import { WorkloadService } from '../../services/workloadService';
import { useTranslation } from 'react-i18next';
import * as YAML from 'yaml';

// 配置Monaco Editor使用本地资源
loader.config({ monaco });

const { Title, Text } = Typography;

const YAMLEditor: React.FC = () => {
  const { modal } = App.useApp();
const { t } = useTranslation(["yaml", "common"]);
const { clusterId } = useParams<{ clusterId: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  
  // 从URL参数获取工作负载信息
  const workloadRef = searchParams.get('workload'); // namespace/name
  const workloadType = searchParams.get('type');
  
  const [yaml, setYaml] = useState('');
  const [originalYaml, setOriginalYaml] = useState('');
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [dryRun, setDryRun] = useState(true);
  const [previewVisible, setPreviewVisible] = useState(false);
  const [previewResult, setPreviewResult] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editorLoading, setEditorLoading] = useState(true);
  
  // Diff 对比相关状态
  const [diffModalVisible, setDiffModalVisible] = useState(false);
  const [pendingYaml, setPendingYaml] = useState<string>('');
  const [dryRunResult, setDryRunResult] = useState<{
    success: boolean;
    message: string;
  } | null>(null);

  // 检查是否有未保存的更改
  const hasUnsavedChanges = yaml !== originalYaml;

  // Monaco Editor加载处理
  const handleEditorWillMount = () => {
    setEditorLoading(true);
  };

  const handleEditorDidMount = () => {
    setEditorLoading(false);
  };

  const handleEditorValidation = (markers: unknown[]) => {
    // 处理编辑器验证错误
    if (markers && markers.length > 0) {
      console.warn('Editor validation markers:', markers);
    }
  };

  // 加载现有工作负载的YAML
  const loadWorkloadYAML = useCallback(async () => {
    if (!clusterId || !workloadRef || !workloadType) return;
    
    const [namespace, name] = workloadRef.split('/');
    if (!namespace || !name) return;
    
    setLoading(true);
    setError(null);
    try {
      const response = await WorkloadService.getWorkloadDetail(
        clusterId,
        workloadType,
        namespace,
        name
      );
      
      if (response.code === 200) {
        // 优先使用后端返回的yaml字段（包含apiVersion和kind），否则使用raw转换
        const yamlContent = response.data.yaml || YAML.stringify(response.data.raw);
        setYaml(yamlContent);
        setOriginalYaml(yamlContent);
      } else {
        const errorMsg = response.message || t('messages.loadFailed');
        setError(errorMsg);
        message.error(errorMsg);
      }
    } catch (error) {
      console.error('加载YAML失败:', error);
      const errorMsg = t('messages.loadError') + ': ' + (error instanceof Error ? error.message : t('messages.unknownError'));
      setError(errorMsg);
      message.error(errorMsg);
    } finally {
      setLoading(false);
    }
  }, [clusterId, workloadRef, workloadType]);

  // 应用YAML
  const handleApply = async (isDryRun = false) => {
    if (!clusterId || !yaml.trim()) {
      message.error(t('messages.emptyContent'));
      return;
    }
    
    setApplying(true);
    setDryRunResult(null);
    try {
      const response = await WorkloadService.applyYAML(clusterId, yaml, isDryRun);
      
      if (response.code === 200) {
        if (isDryRun) {
          setPreviewResult(response.data as Record<string, unknown>);
          setDryRunResult({
            success: true,
            message: t('messages.dryRunPassed'),
          });
          message.success(t('messages.validateSuccess'));
        } else {
          message.success(t('messages.applySuccess'));
          // 更新原始YAML
          setOriginalYaml(yaml);
          setDiffModalVisible(false);
        }
      } else {
        const errorMsg = response.message || t('messages.yamlFailed', { action: isDryRun ? t('messages.validateFailed') : t('messages.applyFailed') });
        if (isDryRun) {
          setDryRunResult({
            success: false,
            message: errorMsg,
          });
        }
        message.error(errorMsg);
      }
    } catch (error) {
      console.error(`YAML ${isDryRun ? 'validate' : 'apply'} failed:`, error);
      const errorMsg = t('messages.yamlFailed', { action: isDryRun ? t('messages.validateFailed') : t('messages.applyFailed') });
      if (isDryRun) {
        setDryRunResult({
          success: false,
          message: errorMsg,
        });
      }
      message.error(errorMsg);
    } finally {
      setApplying(false);
    }
  };

  // 预览YAML (Dry Run)
  const handlePreview = () => {
    handleApply(true);
  };

  // 保存并应用YAML - 先预检，再展示 diff 对比
  const handleSave = async () => {
    if (!clusterId || !yaml.trim()) {
      message.error(t('messages.emptyContent'));
      return;
    }

    // 如果是编辑模式（有原始 YAML），先预检再展示 diff
    if (workloadRef && originalYaml) {
      setApplying(true);
      try {
        const response = await WorkloadService.applyYAML(clusterId, yaml, true);
        if (response.code === 200) {
          // 预检通过，展示 diff 对比
          setPendingYaml(yaml);
          setDiffModalVisible(true);
        } else {
          message.error(t('messages.preCheckFailed') + ': ' + (response.message || t('messages.unknownError')));
        }
      } catch (error) {
        console.error('预检失败:', error);
        message.error(t('messages.preCheckFailed'));
      } finally {
        setApplying(false);
      }
    } else {
      // 创建模式，直接确认应用
      modal.confirm({
        title: t('confirm.applyYaml'),
        content: t('confirm.applyYamlDesc'),
        okText: t('common:actions.confirm'),
        cancelText: t('common:actions.cancel'),
        onOk: () => handleApply(false),
      });
    }
  };

  // 确认 Diff 后提交
  const handleConfirmDiff = () => {
    handleApply(false);
  };

  // 重置YAML
  const handleReset = () => {
    modal.confirm({
      title: t('confirm.resetTitle'),
      content: t('confirm.resetDesc'),
      okText: t('common:actions.confirm'),
      cancelText: t('common:actions.cancel'),
      centered: true,
      onOk: () => {
        setYaml(originalYaml);
        message.success(t('messages.resetSuccess'));
      },
    });
  };

  // 生成默认YAML模板
  const generateDefaultYAML = useCallback((type: string) => {
    const templates: Record<string, string> = {
      'Deployment': `apiVersion: apps/v1
kind: Deployment
metadata:
  name: my-deployment
  namespace: default
spec:
  replicas: 3
  selector:
    matchLabels:
      app: my-app
  template:
    metadata:
      labels:
        app: my-app
    spec:
      containers:
      - name: my-container
        image: nginx:latest
        ports:
        - containerPort: 80
`,
      'Rollout': `apiVersion: argoproj.io/v1alpha1
kind: Rollout
metadata:
  name: my-rollout
  namespace: default
spec:
  replicas: 3
  selector:
    matchLabels:
      app: my-app
  template:
    metadata:
      labels:
        app: my-app
    spec:
      containers:
      - name: my-container
        image: nginx:latest
        ports:
        - containerPort: 80
  strategy:
    canary:
      steps:
      - setWeight: 20
      - pause: {}
      - setWeight: 50
      - pause: {duration: 10}
      - setWeight: 80
      - pause: {duration: 10}
`,
      'StatefulSet': `apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: my-statefulset
  namespace: default
spec:
  serviceName: my-service
  replicas: 3
  selector:
    matchLabels:
      app: my-app
  template:
    metadata:
      labels:
        app: my-app
    spec:
      containers:
      - name: my-container
        image: nginx:latest
        ports:
        - containerPort: 80
`,
      'DaemonSet': `apiVersion: apps/v1
kind: DaemonSet
metadata:
  name: my-daemonset
  namespace: default
spec:
  selector:
    matchLabels:
      app: my-app
  template:
    metadata:
      labels:
        app: my-app
    spec:
      containers:
      - name: my-container
        image: nginx:latest
        ports:
        - containerPort: 80
`,
      'Job': `apiVersion: batch/v1
kind: Job
metadata:
  name: my-job
  namespace: default
spec:
  template:
    spec:
      containers:
      - name: my-container
        image: busybox
        command: ['sh', '-c', 'echo Hello Kubernetes! && sleep 30']
      restartPolicy: Never
  backoffLimit: 4
`,
      'CronJob': `apiVersion: batch/v1
kind: CronJob
metadata:
  name: my-cronjob
  namespace: default
spec:
  schedule: "*/5 * * * *"
  jobTemplate:
    spec:
      template:
        spec:
          containers:
          - name: my-container
            image: busybox
            command: ['sh', '-c', 'echo Hello Kubernetes! && date']
          restartPolicy: Never
`
    };
    
    return templates[type] || `apiVersion: v1
kind: ${type}
metadata:
  name: my-resource
  namespace: default
spec: {}
`;
  }, []);
  
  useEffect(() => {
    // 检查必要参数
    if (!clusterId || !workloadType) {
      setError(t('messages.missingParams'));
      return;
    }
    
    // 如果有workloadRef，则是编辑模式，加载现有YAML
    if (workloadRef) {
      loadWorkloadYAML();
    } else {
      // 否则是创建模式，生成默认YAML模板
      const defaultYAML = generateDefaultYAML(workloadType);
      setYaml(defaultYAML);
      setOriginalYaml(defaultYAML);
      setError(null);
    }
  }, [clusterId, workloadRef, workloadType, loadWorkloadYAML, generateDefaultYAML]);

  // 页面离开前提醒
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasUnsavedChanges) {
        e.preventDefault();
        e.returnValue = '';
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [hasUnsavedChanges]);

  return (
    <div style={{ padding: '24px', height: 'calc(100vh - 64px)' }}>
      {/* 页面头部 */}
      <div style={{ marginBottom: 16 }}>
        <Space>
          <Button
            icon={<ArrowLeftOutlined />}
            onClick={() => {
              if (hasUnsavedChanges) {
                modal.confirm({
                  title: t('confirm.leave'),
                  content: t('confirm.leaveDesc'),
                  okText: t('common:actions.confirm'),
                  cancelText: t('common:actions.cancel'),
                  onOk: () => navigate(-1),
                });
              } else {
                navigate(-1);
              }
            }}
          >
            {t('editor.back')}
          </Button>
          <Title level={3} style={{ margin: 0 }}>
            {t('editor.title')}
          </Title>
          {workloadRef && (
            <Text type="secondary">
              {workloadType}: {workloadRef}
            </Text>
          )}
          {hasUnsavedChanges && (
            <Text type="warning">{t('alert.hasUnsavedChanges')}</Text>
          )}
        </Space>
        
        <div style={{ marginTop: 16 }}>
          <Space>
            <Button
              type="primary"
              icon={<SaveOutlined />}
              onClick={handleSave}
              loading={applying}
              disabled={!hasUnsavedChanges}
            >
              {t('editor.apply')}
            </Button>
            
            <Button
              icon={<EyeOutlined />}
              onClick={handlePreview}
              loading={applying}
            >
              {t('editor.preview')}
            </Button>
            
            <Button
              icon={<ReloadOutlined />}
              onClick={handleReset}
              disabled={!hasUnsavedChanges}
            >
              {t('editor.reset')}
            </Button>
            
            <div style={{ marginLeft: 16 }}>
              <Space>
                <Text>{t('editor.dryRunMode')}:</Text>
                <Switch
                  checked={dryRun}
                  onChange={setDryRun}
                  checkedChildren={t("editor.on")}
                  unCheckedChildren={t("editor.off")}
                />
              </Space>
            </div>
          </Space>
        </div>
      </div>

      {/* 提示信息 */}
      {error && (
        <Alert
          message={t('alert.loadFailed')}
          description={error}
          type="error"
          showIcon
          style={{ marginBottom: 16 }}
          action={
            <Button size="small" onClick={loadWorkloadYAML}>
              {t('alert.retry')}
            </Button>
          }
        />
      )}
      
      {/* 预检结果提示 */}
      {dryRunResult && (
        <Alert
          message={dryRunResult.success ? t('messages.dryRunCheckPassed') : t('messages.dryRunCheckFailed')}
          description={dryRunResult.message}
          type={dryRunResult.success ? 'success' : 'error'}
          showIcon
          icon={dryRunResult.success ? <CheckCircleOutlined /> : <ExclamationCircleOutlined />}
          closable
          onClose={() => setDryRunResult(null)}
          style={{ marginBottom: 16 }}
        />
      )}
      
      {hasUnsavedChanges && !error && !dryRunResult && (
        <Alert
          message={t('alert.unsavedChanges')}
          description={t('alert.unsavedChangesDesc')}
          type="warning"
          showIcon
          style={{ marginBottom: 16 }}
        />
      )}

      {/* YAML编辑器 */}
      <Card style={{ height: 'calc(100vh - 200px)', minHeight: '500px' }}>
        <Spin spinning={loading || editorLoading} tip={loading ? t('messages.loadingYaml') : t('messages.initEditor')}>
          <div style={{ height: '500px', width: '100%' }}>
            {yaml ? (
              <Editor
                height="500px"
                width="100%"
                defaultLanguage="yaml"
                value={yaml}
                onChange={(value) => setYaml(value || '')}
                loading={<div style={{ padding: '20px', textAlign: 'center' }}>{t('messages.editorLoading')}</div>}
                beforeMount={handleEditorWillMount}
                onMount={handleEditorDidMount}
                onValidate={handleEditorValidation}
                options={{
                  minimap: { enabled: true },
                  fontSize: 14,
                  lineNumbers: 'on',
                  roundedSelection: false,
                  scrollBeyondLastLine: false,
                  automaticLayout: true,
                  tabSize: 2,
                  insertSpaces: true,
                  wordWrap: 'on',
                  folding: true,
                  foldingStrategy: 'indentation',
                  showFoldingControls: 'always',
                  bracketPairColorization: { enabled: true },
                }}
              />
            ) : (
              <div style={{ 
                height: '500px', 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'center',
                color: '#666',
                fontSize: '16px'
              }}>
                {loading ? t('messages.loading') : t('messages.noContent')}
              </div>
            )}
          </div>
        </Spin>
      </Card>

      {/* 预览模态框 */}
      <Modal
        title={t('preview.title')}
        open={previewVisible}
        onCancel={() => setPreviewVisible(false)}
        footer={[
          <Button key="cancel" onClick={() => setPreviewVisible(false)}>
            {t('editor.close')}
          </Button>,
          <Button
            key="apply"
            type="primary"
            onClick={() => {
              setPreviewVisible(false);
              handleSave();
            }}
          >
            {t('editor.confirmApply')}
          </Button>,
        ]}
        width={800}
      >
        {previewResult && (
          <div>
            <Alert
              message={t('preview.validationSuccess')}
              description={t('preview.validationSuccessDesc')}
              type="success"
              showIcon
              style={{ marginBottom: 16 }}
            />
            <pre style={{
              background: '#f5f5f5',
              padding: '16px',
              borderRadius: '4px',
              overflow: 'auto',
              maxHeight: '400px'
            }}>
              {JSON.stringify(previewResult, null, 2)}
            </pre>
          </div>
        )}
      </Modal>

      {/* YAML Diff 对比 Modal */}
      <Modal
        title={
          <Space>
            <DiffOutlined />
            <span>{t('diff.title')}</span>
          </Space>
        }
        open={diffModalVisible}
        onCancel={() => setDiffModalVisible(false)}
        width={1200}
        footer={[
          <Button key="cancel" onClick={() => setDiffModalVisible(false)}>
            {t('editor.cancel')}
          </Button>,
          <Button
            key="submit"
            type="primary"
            loading={applying}
            onClick={handleConfirmDiff}
          >
            {t('editor.confirmUpdate')}
          </Button>,
        ]}
      >
        <Alert
          message={t('diff.reviewChanges')}
          description={t('diff.reviewChangesDesc')}
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
        />
        <div style={{ display: 'flex', gap: 16, marginBottom: 8 }}>
          <div style={{ flex: 1 }}>
            <Text strong style={{ color: '#cf1322' }}>{t('diff.originalConfig')}</Text>
          </div>
          <div style={{ flex: 1 }}>
            <Text strong style={{ color: '#389e0d' }}>{t('diff.modifiedConfig')}</Text>
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

export default YAMLEditor;