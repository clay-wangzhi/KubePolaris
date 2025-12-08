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
} from '@ant-design/icons';
import { Editor, loader } from '@monaco-editor/react';
import * as monaco from 'monaco-editor';
import { WorkloadService } from '../../services/workloadService';
import * as YAML from 'yaml';

// 配置Monaco Editor使用本地资源
loader.config({ monaco });

const { Title, Text } = Typography;

const YAMLEditor: React.FC = () => {
  const { modal } = App.useApp();
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
        namespace,
        name,
        workloadType
      );
      
      if (response.code === 200) {
        // 使用yaml库将JSON转换为YAML格式
        const yamlContent = YAML.stringify(response.data.raw);
        setYaml(yamlContent);
        setOriginalYaml(yamlContent);
      } else {
        const errorMsg = response.message || '加载YAML失败';
        setError(errorMsg);
        message.error(errorMsg);
      }
    } catch (error) {
      console.error('加载YAML失败:', error);
      const errorMsg = '加载YAML失败: ' + (error instanceof Error ? error.message : '未知错误');
      setError(errorMsg);
      message.error(errorMsg);
    } finally {
      setLoading(false);
    }
  }, [clusterId, workloadRef, workloadType]);

  // 应用YAML
  const handleApply = async (isDryRun = false) => {
    if (!clusterId || !yaml.trim()) {
      message.error('YAML内容不能为空');
      return;
    }
    
    setApplying(true);
    try {
      const response = await WorkloadService.applyYAML(clusterId, yaml, isDryRun);
      
      if (response.code === 200) {
        if (isDryRun) {
          setPreviewResult(response.data);
          setPreviewVisible(true);
          message.success('YAML验证成功');
        } else {
          message.success('YAML应用成功');
          // 更新原始YAML
          setOriginalYaml(yaml);
        }
      } else {
        message.error(response.message || `YAML${isDryRun ? '验证' : '应用'}失败`);
      }
    } catch (error) {
      console.error(`YAML${isDryRun ? '验证' : '应用'}失败:`, error);
      message.error(`YAML${isDryRun ? '验证' : '应用'}失败`);
    } finally {
      setApplying(false);
    }
  };

  // 预览YAML
  const handlePreview = () => {
    handleApply(true);
  };

  // 保存并应用YAML
  const handleSave = () => {
    modal.confirm({
      title: '确认应用YAML',
      content: '确定要应用这些YAML配置吗？这将更新集群中的资源。',
      okText: '确定',
      cancelText: '取消',
      onOk: () => handleApply(false),
    });
  };

  // 重置YAML
  const handleReset = () => {
    modal.confirm({
      title: '确认重置',
      content: '确定要重置YAML内容吗？未保存的更改将丢失。',
      okText: '确定',
      cancelText: '取消',
      centered: true,
      onOk: () => {
        setYaml(originalYaml);
        message.success('已重置YAML内容');
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
      setError('缺少必要参数：集群ID或工作负载类型');
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
                  title: '确认离开',
                  content: '您有未保存的更改，确定要离开吗？',
                  okText: '确定',
                  cancelText: '取消',
                  onOk: () => navigate(-1),
                });
              } else {
                navigate(-1);
              }
            }}
          >
            返回
          </Button>
          <Title level={3} style={{ margin: 0 }}>
            YAML 编辑器
          </Title>
          {workloadRef && (
            <Text type="secondary">
              {workloadType}: {workloadRef}
            </Text>
          )}
          {hasUnsavedChanges && (
            <Text type="warning">• 有未保存的更改</Text>
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
              应用
            </Button>
            
            <Button
              icon={<EyeOutlined />}
              onClick={handlePreview}
              loading={applying}
            >
              预览
            </Button>
            
            <Button
              icon={<ReloadOutlined />}
              onClick={handleReset}
              disabled={!hasUnsavedChanges}
            >
              重置
            </Button>
            
            <div style={{ marginLeft: 16 }}>
              <Space>
                <Text>DryRun模式:</Text>
                <Switch
                  checked={dryRun}
                  onChange={setDryRun}
                  checkedChildren="开"
                  unCheckedChildren="关"
                />
              </Space>
            </div>
          </Space>
        </div>
      </div>

      {/* 提示信息 */}
      {error && (
        <Alert
          message="加载失败"
          description={error}
          type="error"
          showIcon
          style={{ marginBottom: 16 }}
          action={
            <Button size="small" onClick={loadWorkloadYAML}>
              重试
            </Button>
          }
        />
      )}
      
      {hasUnsavedChanges && !error && (
        <Alert
          message="您有未保存的更改"
          description="请记得保存您的更改，或点击重置按钮恢复原始内容。"
          type="warning"
          showIcon
          style={{ marginBottom: 16 }}
        />
      )}

      {/* YAML编辑器 */}
      <Card style={{ height: 'calc(100vh - 200px)', minHeight: '500px' }}>
        <Spin spinning={loading || editorLoading} tip={loading ? "加载YAML中..." : "初始化编辑器..."}>
          <div style={{ height: '500px', width: '100%' }}>
            {yaml ? (
              <Editor
                height="500px"
                width="100%"
                defaultLanguage="yaml"
                value={yaml}
                onChange={(value) => setYaml(value || '')}
                theme="vs-dark"
                loading={<div style={{ padding: '20px', textAlign: 'center' }}>编辑器加载中...</div>}
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
                {loading ? '加载中...' : '暂无YAML内容'}
              </div>
            )}
          </div>
        </Spin>
      </Card>

      {/* 预览模态框 */}
      <Modal
        title="YAML 预览结果"
        open={previewVisible}
        onCancel={() => setPreviewVisible(false)}
        footer={[
          <Button key="cancel" onClick={() => setPreviewVisible(false)}>
            关闭
          </Button>,
          <Button
            key="apply"
            type="primary"
            onClick={() => {
              setPreviewVisible(false);
              handleSave();
            }}
          >
            确认应用
          </Button>,
        ]}
        width={800}
      >
        {previewResult && (
          <div>
            <Alert
              message="验证成功"
              description="YAML格式正确，可以安全应用到集群。"
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
    </div>
  );
};

export default YAMLEditor;