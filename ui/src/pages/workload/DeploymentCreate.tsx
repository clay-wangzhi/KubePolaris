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
  Modal,
  Typography,
} from 'antd';
import {
  ArrowLeftOutlined,
  SaveOutlined,
  FormOutlined,
  CodeOutlined,
  CheckCircleOutlined,
  ExclamationCircleOutlined,
  DiffOutlined,
} from '@ant-design/icons';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { WorkloadService } from '../../services/workloadService';
import { useTranslation } from 'react-i18next';
import { getNamespaces } from '../../services/namespaceService';
import { secretService } from '../../services/configService';
import WorkloadForm from '../../components/workload/WorkloadForm';
import { WorkloadYamlService } from '../../services/workloadYamlService';
import MonacoEditor, { DiffEditor } from '@monaco-editor/react';
import * as YAML from 'yaml';
import { Form } from 'antd';
import type { WorkloadFormData } from '../../types/workload';

const { Text } = Typography;

type WorkloadType = 'Deployment' | 'StatefulSet' | 'DaemonSet' | 'Rollout' | 'Job' | 'CronJob';

const DeploymentCreate: React.FC = () => {
  const navigate = useNavigate();
  const { clusterId } = useParams<{ clusterId: string }>();
  const [searchParams] = useSearchParams();
  const { message: messageApi, modal } = App.useApp();
const { t } = useTranslation(["workload", "common"]);
const workloadType = (searchParams.get('type') || 'Deployment') as WorkloadType;
  const editNamespace = searchParams.get('namespace');
  const editName = searchParams.get('name');
  const isEdit = !!(editNamespace && editName);
  
  // 编辑模式默认使用 YAML 编辑器（避免表单格式化导致字段丢失）
  const [editMode, setEditMode] = useState<'form' | 'yaml'>(isEdit ? 'yaml' : 'form');
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
  
  // 原始 YAML（编辑模式用于 diff 对比）
  const [originalYaml, setOriginalYaml] = useState<string>('');
  
  // Diff 弹窗状态
  const [diffModalVisible, setDiffModalVisible] = useState(false);
  const [pendingYaml, setPendingYaml] = useState<string>('');
  
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
        const data = await secretService.getSecrets(Number(clusterId), {
          namespace: currentNamespace,
          type: 'kubernetes.io/dockerconfigjson',
        });
        if (data && data.items) {
          setImagePullSecretsList(data.items.map((s) => s.name));
        } else {
          setImagePullSecretsList([]);
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
          // 优先使用后端返回的原始 YAML 字符串（保持原始格式）
          // 如果没有 yaml 字段，则回退到 raw 对象序列化
          let yaml: string;
          if (response.data.yaml && typeof response.data.yaml === 'string') {
            yaml = response.data.yaml;
          } else {
            // 回退方案：使用 raw 对象序列化
            const rawResource = response.data.raw || response.data.workload;
            yaml = YAML.stringify(rawResource);
          }
          
          // 保存原始 YAML 用于 diff 对比
          setOriginalYaml(yaml);
          setYamlContent(yaml);
          
          // 解析为表单数据
          const parsedData = WorkloadYamlService.yamlToFormData(yaml);
          if (parsedData) {
            // 先设置 formData state，这会触发 WorkloadForm 的 useEffect
            setFormData(parsedData);
            // 延迟设置表单值，确保组件已挂载
            setTimeout(() => {
              form.setFieldsValue(parsedData);
            }, 100);
          }
        }
      } catch (error) {
        console.error('加载工作负载失败:', error);
        messageApi.error(t('messages.loadWorkloadFailed'));
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
        // Argo Rollout 策略
        rolloutStrategy: values.rolloutStrategy,
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
      messageApi.error(t('messages.yamlFormatError') + ': ' + (err instanceof Error ? err.message : ''));
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
        message: t('workload:create.yamlFormatError') + ': ' + (err instanceof Error ? err.message : t('common:unknown')),
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
          message: t('create.dryRunPassed'),
        });
      } else {
        setDryRunResult({
          success: false,
          message: response.message || t('create.dryRunFailed'),
        });
      }
    } catch (error: unknown) {
      setDryRunResult({
        success: false,
        message: error instanceof Error ? error.message : t('create.dryRunRequestFailed'),
      });
    } finally {
      setDryRunning(false);
    }
  };

  // 提交创建/更新
  const submitYaml = async (yaml: string) => {
    if (!clusterId) {
      messageApi.error(t('messages.clusterNotFound'));
      return;
    }
    
    setSubmitting(true);
    try {
      const response = await WorkloadService.applyYAML(clusterId, yaml, false);
      
      if (response.code === 200) {
        messageApi.success(isEdit ? t('messages.updateSuccess') : t('messages.createSuccess'));
        navigate(`/clusters/${clusterId}/workloads`);
      } else {
        messageApi.error(response.message || t('messages.operationFailed'));
      }
    } catch (error: unknown) {
      console.error('提交失败:', error);
      messageApi.error(error instanceof Error ? error.message : t('messages.operationFailed'));
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
        messageApi.error(t('messages.checkForm'));
        return;
      }
    } else {
      yaml = yamlContent;
    }
    
    // 验证 YAML 格式
    try {
      YAML.parse(yaml);
    } catch (err) {
      messageApi.error(t('messages.yamlFormatError') + ': ' + (err instanceof Error ? err.message : ''));
      return;
    }
    
    // 编辑模式下显示 diff 对比弹窗
    if (isEdit && originalYaml) {
      setPendingYaml(yaml);
      setDiffModalVisible(true);
    } else {
      // 创建模式直接确认
      modal.confirm({
        title: t('create.confirmCreate'),
        content: (
          <div>
            <p>{t('create.confirmCreateDesc')}</p>
            <p style={{ color: '#666', fontSize: 12 }}>{t('create.confirmCreateHint')}</p>
          </div>
        ),
        okText: t('common:actions.confirm'),
        cancelText: t('common:actions.cancel'),
        onOk: () => submitYaml(yaml),
      });
    }
  };

  // 确认 diff 后提交
  const handleConfirmDiff = () => {
    setDiffModalVisible(false);
    submitYaml(pendingYaml);
  };

  // 表单值变化时更新
  const handleFormValuesChange = (changedValues: Partial<WorkloadFormData>, allValues: WorkloadFormData) => {
    setFormData(allValues);
    setDryRunResult(null);
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 400 }}>
        <Spin size="large" tip={t("common:messages.loading")} />
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
            {t('create.back')}
          </Button>
          <h2 style={{ margin: 0 }}>
            {isEdit ? t('create.edit') : t('create.create')} {workloadType}
          </h2>
          {/* 编辑模式只支持 YAML 编辑，避免表单格式化导致复杂字段丢失 */}
          {isEdit ? (
            <Tooltip title={t("create.yamlModeOnly")}>
              <Space>
                <CodeOutlined />
                <span>{t('create.yamlMode')}</span>
              </Space>
            </Tooltip>
          ) : (
            <Segmented
              value={editMode}
              onChange={handleModeChange}
              options={[
                { value: 'form', icon: <FormOutlined />, label: t('create.formMode') },
                { value: 'yaml', icon: <CodeOutlined />, label: t('create.yamlMode') },
              ]}
            />
          )}
        </Space>
        
        <Space>
          <Tooltip title={t("create.preCheckTooltip")}>
            <Button
              onClick={handleDryRun}
              loading={dryRunning}
              icon={dryRunResult?.success ? <CheckCircleOutlined /> : <ExclamationCircleOutlined />}
            >
              {t('create.preCheck')}
            </Button>
          </Tooltip>
          <Button onClick={() => navigate(-1)}>
            {t('create.cancel')}
          </Button>
          <Button
            type="primary"
            icon={<SaveOutlined />}
            onClick={handleSubmit}
            loading={submitting}
          >
            {isEdit ? t('create.update') : t('create.create')}
          </Button>
        </Space>
      </div>
      
      {/* 预检结果 */}
      {dryRunResult && (
        <Alert
          message={dryRunResult.success ? t('create.dryRunCheckPassed') : t('create.dryRunCheckFailed')}
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
        <WorkloadForm
          workloadType={workloadType}
          namespaces={namespaces}
          imagePullSecretsList={imagePullSecretsList}
          initialData={formData || undefined}
          onValuesChange={handleFormValuesChange}
          form={form}
          isEdit={isEdit}
        />
      ) : (
        <Card title={t('create.yamlEdit')}>
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
            }}
          />
        </Card>
      )}

      {/* Diff 对比弹窗 */}
      <Modal
        title={
          <Space>
            <DiffOutlined />
            <span>{t('create.diffTitle')}</span>
          </Space>
        }
        open={diffModalVisible}
        onCancel={() => setDiffModalVisible(false)}
        onOk={handleConfirmDiff}
        width="90%"
        style={{ top: 20 }}
        okText={t("create.confirmUpdate")}
        cancelText={t("create.cancel")}
        destroyOnClose
      >
        <div style={{ marginBottom: 16 }}>
          <Space>
            <Text type="secondary">
              {t('create.diffDesc')}
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

export default DeploymentCreate;
