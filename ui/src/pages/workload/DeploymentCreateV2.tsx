/** genAI_main_start */
import React, { useState, useEffect, useCallback } from 'react';
import {
  Card,
  Button,
  Space,
  Segmented,
  Spin,
  App,
  Alert,
  Tooltip,
} from 'antd';
import {
  ArrowLeftOutlined,
  SaveOutlined,
  FormOutlined,
  CodeOutlined,
  CheckCircleOutlined,
  ExclamationCircleOutlined,
} from '@ant-design/icons';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { WorkloadService } from '../../services/workloadService';
import { getNamespaces } from '../../services/namespaceService';
import WorkloadFormV2 from '../../components/workload/WorkloadFormV2';
import { WorkloadYamlService } from '../../services/workloadYamlService';
import MonacoEditor from '@monaco-editor/react';
import * as YAML from 'yaml';
import { Form } from 'antd';
import type { WorkloadFormData } from '../../types/workload';

type WorkloadType = 'Deployment' | 'StatefulSet' | 'DaemonSet' | 'Rollout' | 'Job' | 'CronJob';

const DeploymentCreateV2: React.FC = () => {
  const navigate = useNavigate();
  const { clusterId } = useParams<{ clusterId: string }>();
  const [searchParams] = useSearchParams();
  const { message: messageApi, modal } = App.useApp();
  
  const workloadType = (searchParams.get('type') || 'Deployment') as WorkloadType;
  const editNamespace = searchParams.get('namespace');
  const editName = searchParams.get('name');
  const isEdit = !!(editNamespace && editName);
  
  const [editMode, setEditMode] = useState<'form' | 'yaml'>('form');
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(false);
  const [dryRunning, setDryRunning] = useState(false);
  const [dryRunResult, setDryRunResult] = useState<{ success: boolean; message: string } | null>(null);
  
  // 表单实例
  const [form] = Form.useForm();
  
  // 表单数据
  const [formData, setFormData] = useState<WorkloadFormData | null>(null);
  
  // YAML 数据
  const [yamlContent, setYamlContent] = useState(getDefaultYaml());
  
  // 命名空间列表
  const [namespaces, setNamespaces] = useState<string[]>(['default']);
  
  // 镜像拉取凭证列表
  const [imagePullSecretsList, setImagePullSecretsList] = useState<string[]>([]);
  
  // 当前选择的命名空间
  const currentNamespace = Form.useWatch('namespace', form) || 'default';
  
  // 获取默认YAML
  function getDefaultYaml(): string {
    const defaultData: WorkloadFormData = {
      name: '',
      namespace: 'default',
      replicas: workloadType === 'DaemonSet' ? undefined : 1,
      containers: [
        {
          name: 'main',
          image: '',
          imagePullPolicy: 'IfNotPresent',
          resources: {
            requests: { cpu: '100m', memory: '128Mi' },
            limits: { cpu: '500m', memory: '512Mi' },
          },
        },
      ],
    };
    return WorkloadYamlService.formDataToYAML(workloadType, defaultData);
  }

  // 加载所有命名空间列表
  useEffect(() => {
    const loadAllNamespaces = async () => {
      if (!clusterId) return;
      try {
        const nsList = await getNamespaces(Number(clusterId));
        if (nsList && nsList.length > 0) {
          setNamespaces(nsList.map(ns => ns.name));
        } else {
          setNamespaces(['default']);
        }
      } catch (error) {
        console.error('获取命名空间列表失败:', error);
        setNamespaces(['default']);
      }
    };
    loadAllNamespaces();
  }, [clusterId]);
  
  // 加载镜像拉取凭证列表 (当命名空间变化时)
  useEffect(() => {
    const loadImagePullSecrets = async () => {
      if (!clusterId || !currentNamespace) return;
      try {
        // 调用后端 API 获取 dockerconfigjson 类型的 secrets
        const response = await fetch(`/api/v1/clusters/${clusterId}/secrets?namespace=${currentNamespace}&type=kubernetes.io/dockerconfigjson`);
        if (response.ok) {
          const data = await response.json();
          if (data.code === 200 && data.data && data.data.items) {
            setImagePullSecretsList(data.data.items.map((s: { name: string }) => s.name));
          } else {
            setImagePullSecretsList([]);
          }
        }
      } catch (error) {
        console.error('获取镜像拉取凭证失败:', error);
        setImagePullSecretsList([]);
      }
    };
    loadImagePullSecrets();
  }, [clusterId, currentNamespace]);

  // 如果是编辑模式，加载现有数据
  useEffect(() => {
    const loadWorkload = async () => {
      if (!isEdit || !clusterId || !editNamespace || !editName) return;
      
      setLoading(true);
      try {
        const response = await WorkloadService.getWorkloadDetail(
          clusterId,
          workloadType,
          editNamespace,
          editName
        );
        
        if (response.code === 200 && response.data) {
          // 使用 raw 对象（原始 K8s 资源）而不是 workload（简化对象）
          const rawResource = response.data.raw || response.data.workload;
          // 直接使用 YAML 解析
          const yaml = YAML.stringify(rawResource);
          setYamlContent(yaml);
          
          // 解析为表单数据
          const parsedData = WorkloadYamlService.yamlToFormData(yaml);
          if (parsedData) {
            // 先设置 formData state，这会触发 WorkloadFormV2 的 useEffect
            setFormData(parsedData);
            // 延迟设置表单值，确保组件已挂载
            setTimeout(() => {
              form.setFieldsValue(parsedData);
            }, 100);
          }
        }
      } catch (error) {
        console.error('加载工作负载失败:', error);
        messageApi.error('加载工作负载失败');
      } finally {
        setLoading(false);
      }
    };
    
    loadWorkload();
  }, [isEdit, clusterId, editNamespace, editName, workloadType, messageApi, form]);

  // 表单转YAML
  const formToYaml = useCallback((): string => {
    try {
      const values = form.getFieldsValue(true);
      
      // 构建完整的表单数据
      const formData: WorkloadFormData = {
        name: values.name || '',
        namespace: values.namespace || 'default',
        replicas: values.replicas,
        description: values.description,
        labels: values.labels,
        annotations: values.annotations,
        containers: values.containers || [],
        initContainers: values.initContainers,
        volumes: values.volumes,
        imagePullSecrets: values.imagePullSecrets,
        scheduling: values.scheduling,
        tolerations: values.tolerations,
        strategy: values.strategy,
        minReadySeconds: values.minReadySeconds,
        revisionHistoryLimit: values.revisionHistoryLimit,
        progressDeadlineSeconds: values.progressDeadlineSeconds,
        terminationGracePeriodSeconds: values.terminationGracePeriodSeconds,
        dnsPolicy: values.dnsPolicy,
        dnsConfig: values.dnsConfig,
        hostNetwork: values.hostNetwork,
        // 特定类型字段
        serviceName: values.serviceName,
        schedule: values.schedule,
        suspend: values.suspend,
        concurrencyPolicy: values.concurrencyPolicy,
        completions: values.completions,
        parallelism: values.parallelism,
        backoffLimit: values.backoffLimit,
        activeDeadlineSeconds: values.activeDeadlineSeconds,
        /** genAI_main_start */
        // Argo Rollout 策略
        rolloutStrategy: values.rolloutStrategy,
        /** genAI_main_end */
      };
      
      return WorkloadYamlService.formDataToYAML(workloadType, formData);
    } catch (error) {
      console.error('表单转YAML失败:', error);
      return yamlContent;
    }
  }, [form, workloadType, yamlContent]);

  // YAML转表单
  const yamlToForm = useCallback((): boolean => {
    try {
      const parsedData = WorkloadYamlService.yamlToFormData(yamlContent);
      if (parsedData) {
        form.setFieldsValue(parsedData);
        setFormData(parsedData);
        return true;
      }
      return false;
    } catch (err) {
      messageApi.error('YAML 格式错误: ' + (err instanceof Error ? err.message : '未知错误'));
      return false;
    }
  }, [yamlContent, form, messageApi]);

  // 切换编辑模式
  const handleModeChange = (newMode: string) => {
    if (newMode === editMode) return;
    
    if (editMode === 'form' && newMode === 'yaml') {
      // 从表单切换到YAML
      const yaml = formToYaml();
      setYamlContent(yaml);
    } else if (editMode === 'yaml' && newMode === 'form') {
      // 从YAML切换到表单
      if (!yamlToForm()) {
        return; // 解析失败，不切换
      }
    }
    
    setEditMode(newMode as 'form' | 'yaml');
    setDryRunResult(null);
  };

  // Dry-run 预检
  const handleDryRun = async () => {
    let yaml: string;
    
    if (editMode === 'form') {
      yaml = formToYaml();
    } else {
      yaml = yamlContent;
    }
    
    // 验证 YAML 格式
    try {
      YAML.parse(yaml);
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
      const response = await WorkloadService.applyYAML(clusterId!, yaml, true);
      
      if (response.code === 200) {
        setDryRunResult({
          success: true,
          message: '预检通过！YAML 定义符合规范，可以正常创建。',
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

  // 提交创建/更新
  const submitYaml = async (yaml: string) => {
    if (!clusterId) {
      messageApi.error('集群ID不存在');
      return;
    }
    
    setSubmitting(true);
    try {
      const response = await WorkloadService.applyYAML(clusterId, yaml, false);
      
      if (response.code === 200) {
        messageApi.success(isEdit ? '更新成功' : '创建成功');
        navigate(`/clusters/${clusterId}/workloads`);
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
    // 先进行预检
    let yaml: string;
    
    if (editMode === 'form') {
      try {
        await form.validateFields();
        yaml = formToYaml();
      } catch {
        messageApi.error('请检查表单填写是否完整');
        return;
      }
    } else {
      yaml = yamlContent;
    }
    
    // 验证 YAML 格式
    try {
      YAML.parse(yaml);
    } catch (err) {
      messageApi.error('YAML 格式错误: ' + (err instanceof Error ? err.message : '未知错误'));
      return;
    }
    
    // 确认提交
    modal.confirm({
      title: isEdit ? '确认更新' : '确认创建',
      content: (
        <div>
          <p>{isEdit ? '确定要更新该工作负载吗？' : '确定要创建该工作负载吗？'}</p>
          <p style={{ color: '#666', fontSize: 12 }}>建议先点击"预检"按钮验证配置是否正确。</p>
        </div>
      ),
      okText: '确认',
      cancelText: '取消',
      onOk: () => submitYaml(yaml),
    });
  };

  // 表单值变化时更新
  const handleFormValuesChange = (changedValues: Partial<WorkloadFormData>, allValues: WorkloadFormData) => {
    setFormData(allValues);
    setDryRunResult(null);
  };

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
          <Button 
            icon={<ArrowLeftOutlined />} 
            onClick={() => navigate(-1)}
          >
            返回
          </Button>
          <h2 style={{ margin: 0 }}>
            {isEdit ? '编辑' : '创建'} {workloadType}
          </h2>
          <Segmented
            value={editMode}
            onChange={handleModeChange}
            options={[
              { value: 'form', icon: <FormOutlined />, label: '表单模式' },
              { value: 'yaml', icon: <CodeOutlined />, label: 'YAML模式' },
            ]}
          />
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
          <Button onClick={() => navigate(-1)}>
            取消
          </Button>
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
      
      {/* 内容区域 */}
      {editMode === 'form' ? (
        <WorkloadFormV2
          workloadType={workloadType}
          namespaces={namespaces}
          imagePullSecretsList={imagePullSecretsList}
          initialData={formData || undefined}
          onValuesChange={handleFormValuesChange}
          form={form}
          isEdit={isEdit}
        />
      ) : (
        <Card title="YAML 编辑">
          <MonacoEditor
            height="600px"
            language="yaml"
            value={yamlContent}
            onChange={(value) => {
              setYamlContent(value || '');
              setDryRunResult(null);
            }}
            theme="vs-dark"
            options={{
              minimap: { enabled: false },
              fontSize: 14,
              lineNumbers: 'on',
              wordWrap: 'on',
              automaticLayout: true,
              scrollBeyondLastLine: false,
            }}
          />
        </Card>
      )}
    </div>
  );
};

export default DeploymentCreateV2;
/** genAI_main_end */

