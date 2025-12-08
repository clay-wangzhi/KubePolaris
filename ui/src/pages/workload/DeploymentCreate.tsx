/** genAI_main_start */
import React, { useState, useEffect } from 'react';
import {
  Card,
  Button,
  Space,
  Segmented,
  Spin,
  App,
} from 'antd';
import {
  ArrowLeftOutlined,
  SaveOutlined,
  FormOutlined,
  CodeOutlined,
} from '@ant-design/icons';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { WorkloadService } from '../../services/workloadService';
import WorkloadForm, { type WorkloadFormData } from '../../components/WorkloadForm';
import MonacoEditor from '@monaco-editor/react';
import * as YAML from 'yaml';
import { Form } from 'antd';

const DeploymentCreate: React.FC = () => {
  const navigate = useNavigate();
  const { clusterId } = useParams<{ clusterId: string }>();
  const [searchParams] = useSearchParams();
  const { message: messageApi } = App.useApp();
  
  const workloadType = (searchParams.get('type') || 'Deployment') as 'Deployment' | 'StatefulSet' | 'DaemonSet' | 'Rollout' | 'Job' | 'CronJob';
  const editNamespace = searchParams.get('namespace');
  const editName = searchParams.get('name');
  const isEdit = !!(editNamespace && editName);
  
  const [editMode, setEditMode] = useState<'form' | 'yaml'>('form');
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(false);
  
  // 表单实例
  const [form] = Form.useForm();
  
  // 表单数据
  const [formData, setFormData] = useState<WorkloadFormData | null>(null);
  
  // YAML 数据
  const [yamlContent, setYamlContent] = useState(getDefaultYaml());
  
  // 命名空间列表
  const [namespaces, setNamespaces] = useState<string[]>(['default']);
  
  // 获取默认YAML
  function getDefaultYaml(): string {
    const defaultData: WorkloadFormData = {
      name: 'example-' + workloadType.toLowerCase(),
      namespace: 'default',
      replicas: workloadType === 'DaemonSet' ? undefined : 1,
      image: 'nginx:latest',
      containerName: 'main',
    };
    return WorkloadService.formDataToYAML(workloadType, defaultData);
  }

  // 加载命名空间列表
  useEffect(() => {
    const loadNamespaces = async () => {
      if (!clusterId) return;
      try {
        const response = await WorkloadService.getWorkloadNamespaces(clusterId, workloadType);
        if (response.code === 200 && response.data) {
          const nsList = response.data.map(ns => ns.name);
          setNamespaces(nsList.length > 0 ? nsList : ['default']);
        }
      } catch (error) {
        console.error('获取命名空间列表失败:', error);
      }
    };
    loadNamespaces();
  }, [clusterId, workloadType]);

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
          const workload = response.data.workload;
          
          // 设置表单数据
          // 转换 labels 和 annotations 为数组格式
          const labelsArray = workload.labels 
            ? Object.entries(workload.labels).map(([key, value]) => ({ key, value: String(value) }))
            : [];
          const annotationsArray = workload.annotations
            ? Object.entries(workload.annotations).map(([key, value]) => ({ key, value: String(value) }))
            : [];
          
          setFormData({
            name: workload.name,
            namespace: workload.namespace,
            replicas: workload.replicas,
            image: workload.images?.[0] || '',
            containerName: 'main',
            labels: labelsArray as Array<{ key: string; value: string }>,
            annotations: annotationsArray as Array<{ key: string; value: string }>,
          });
          
          // 设置YAML数据
          if (response.data.raw) {
            setYamlContent(YAML.stringify(response.data.raw));
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
  }, [isEdit, clusterId, editNamespace, editName, workloadType, messageApi]);

  // 表单转YAML
  const formToYaml = (): string => {
    try {
      const values = form.getFieldsValue();
      
      // 确保必需字段有值，如果为空则使用默认值
      const formData: WorkloadFormData = {
        name: values.name || '',
        namespace: values.namespace || 'default',
        replicas: values.replicas !== undefined ? values.replicas : (workloadType === 'DaemonSet' ? undefined : 1),
        image: values.image || 'nginx:latest',
        containerName: values.containerName || 'main',
        containerPort: values.containerPort,
        description: values.description,
        imagePullPolicy: values.imagePullPolicy,
        env: values.env,
        resources: values.resources,
        lifecycle: values.lifecycle,
        livenessProbe: values.livenessProbe,
        readinessProbe: values.readinessProbe,
        startupProbe: values.startupProbe,
        volumes: values.volumes,
        securityContext: values.securityContext,
        imagePullSecrets: values.imagePullSecrets,
        strategy: values.strategy,
        terminationGracePeriodSeconds: values.terminationGracePeriodSeconds,
        nodeSelectorList: values.nodeSelectorList,
        tolerations: values.tolerations,
        dnsPolicy: values.dnsPolicy,
        dnsConfig: values.dnsConfig,
        // Job/CronJob specific
        schedule: values.schedule,
        suspend: values.suspend,
        completions: values.completions,
        parallelism: values.parallelism,
        backoffLimit: values.backoffLimit,
        // StatefulSet specific
        serviceName: values.serviceName,
      };
      
      // 处理labels和annotations
      const labelsObj: Record<string, string> = {};
      if (values.labels && Array.isArray(values.labels)) {
        values.labels.forEach((item: { key: string; value: string }) => {
          if (item.key && item.value) {
            labelsObj[item.key] = item.value;
          }
        });
      }
      // 如果没有标签，使用默认标签
      if (Object.keys(labelsObj).length === 0) {
        labelsObj.app = formData.name || `example-${workloadType.toLowerCase()}`;
      }
      
      const annotationsObj: Record<string, string> = {};
      if (values.annotations && Array.isArray(values.annotations)) {
        values.annotations.forEach((item: { key: string; value: string }) => {
          if (item.key && item.value) {
            annotationsObj[item.key] = item.value;
          }
        });
      }
      
      // 创建传递给 formDataToYAML 的数据对象，labels 和 annotations 使用对象格式
      const yamlData = {
        ...formData,
        labels: labelsObj,
        annotations: Object.keys(annotationsObj).length > 0 ? annotationsObj : undefined,
      };
      
      // 处理 nodeSelectorList 转换为 nodeSelector 对象
      const nodeSelectorObj: Record<string, string> = {};
      if (values.nodeSelectorList && Array.isArray(values.nodeSelectorList)) {
        values.nodeSelectorList.forEach((item: { key: string; value: string }) => {
          if (item.key && item.value) {
            nodeSelectorObj[item.key] = item.value;
          }
        });
      }
      if (Object.keys(nodeSelectorObj).length > 0) {
        formData.nodeSelector = nodeSelectorObj;
      }
      
      return WorkloadService.formDataToYAML(workloadType, yamlData);
    } catch (error) {
      console.error('表单数据转换失败:', error);
      messageApi.error('表单数据转换失败');
      return yamlContent;
    }
  };

  // YAML转表单
  const yamlToForm = (yaml: string): boolean => {
    try {
      const obj = YAML.parse(yaml);
      
      // 转换labels为数组格式
      const labels = Object.entries(obj.metadata?.labels || {}).map(([key, value]) => ({
        key,
        value: String(value),
      }));
      
      // 转换annotations为数组格式
      const annotations = Object.entries(obj.metadata?.annotations || {}).map(([key, value]) => ({
        key,
        value: String(value),
      }));
      
      // 转换env为数组格式
      const env = obj.spec?.template?.spec?.containers?.[0]?.env?.map((e: { name: string; value: string }) => ({
        name: e.name,
        value: e.value,
      })) || [];
      
      // 转换 nodeSelector 为数组格式
      const nodeSelectorList = obj.spec?.template?.spec?.nodeSelector 
        ? Object.entries(obj.spec.template.spec.nodeSelector).map(([key, value]) => ({
            key,
            value: String(value),
          }))
        : undefined;
      
      // 只设置存在的字段，避免设置 undefined
      const formValues: Record<string, unknown> = {};
      
      if (obj.metadata?.name) formValues.name = obj.metadata.name;
      if (obj.metadata?.namespace) formValues.namespace = obj.metadata.namespace;
      if (obj.spec?.replicas !== undefined) formValues.replicas = obj.spec.replicas;
      
      const container = obj.spec?.template?.spec?.containers?.[0];
      if (container) {
        formValues.image = container.image || 'nginx:latest';
        formValues.containerName = container.name || 'main';
        if (container.ports?.[0]?.containerPort) formValues.containerPort = container.ports[0].containerPort;
        if (container.imagePullPolicy) formValues.imagePullPolicy = container.imagePullPolicy;
        if (env.length > 0) formValues.env = env;
        if (container.resources) formValues.resources = container.resources;
        if (container.lifecycle) formValues.lifecycle = container.lifecycle;
        if (container.livenessProbe) formValues.livenessProbe = container.livenessProbe;
        if (container.readinessProbe) formValues.readinessProbe = container.readinessProbe;
        if (container.startupProbe) formValues.startupProbe = container.startupProbe;
        if (container.securityContext) formValues.securityContext = container.securityContext;
      } else {
        // 如果没有容器，设置默认值
        formValues.image = 'nginx:latest';
        formValues.containerName = 'main';
      }
      
      // 确保 name 有值
      if (!formValues.name) {
        formValues.name = `example-${workloadType.toLowerCase()}`;
      }
      
      formValues.labels = labels.length > 0 ? labels : [];
      formValues.annotations = annotations.length > 0 ? annotations : [];
      if (nodeSelectorList && nodeSelectorList.length > 0) formValues.nodeSelectorList = nodeSelectorList;
      
      // 处理 volumes
      if (obj.spec?.template?.spec?.volumes) {
        const volumes = obj.spec.template.spec.volumes.map((vol: Record<string, unknown>) => {
          const volumeMount = container?.volumeMounts?.find((vm: Record<string, unknown>) => vm.name === vol.name);
          let type = 'emptyDir';
          let configMapName, secretName, pvcName, hostPath;
          
          if (vol.emptyDir) type = 'emptyDir';
          else if (vol.hostPath) {
            type = 'hostPath';
            hostPath = vol.hostPath.path;
          }
          else if (vol.configMap) {
            type = 'configMap';
            configMapName = vol.configMap.name;
          }
          else if (vol.secret) {
            type = 'secret';
            secretName = vol.secret.secretName;
          }
          else if (vol.persistentVolumeClaim) {
            type = 'persistentVolumeClaim';
            pvcName = vol.persistentVolumeClaim.claimName;
          }
          
          return {
            name: vol.name,
            type,
            mountPath: volumeMount?.mountPath || '',
            readOnly: volumeMount?.readOnly || false,
            configMapName,
            secretName,
            pvcName,
            hostPath,
          };
        });
        if (volumes.length > 0) formValues.volumes = volumes;
      }
      
      // 处理 imagePullSecrets
      if (obj.spec?.template?.spec?.imagePullSecrets) {
        formValues.imagePullSecrets = obj.spec.template.spec.imagePullSecrets.map((ips: { name: string }) => ips.name);
      }
      
      // 处理策略
      if (obj.spec?.strategy) {
        formValues.strategy = obj.spec.strategy;
      }
      
      // 处理 tolerations
      if (obj.spec?.template?.spec?.tolerations) {
        formValues.tolerations = obj.spec.template.spec.tolerations as Array<{
          key: string;
          operator: 'Equal' | 'Exists';
          value?: string;
          effect: 'NoSchedule' | 'PreferNoSchedule' | 'NoExecute';
          tolerationSeconds?: number;
        }>;
      }
      
      // 处理 DNS 配置
      if (obj.spec?.template?.spec?.dnsPolicy) {
        formValues.dnsPolicy = obj.spec.template.spec.dnsPolicy;
      }
      if (obj.spec?.template?.spec?.dnsConfig) {
        formValues.dnsConfig = obj.spec.template.spec.dnsConfig;
      }
      
      // 处理终止宽限期
      if (obj.spec?.template?.spec?.terminationGracePeriodSeconds !== undefined) {
        formValues.terminationGracePeriodSeconds = obj.spec.template.spec.terminationGracePeriodSeconds;
      }
      
        // Job/CronJob specific
      if (obj.spec?.schedule) formValues.schedule = obj.spec.schedule;
      if (obj.spec?.suspend !== undefined) formValues.suspend = obj.spec.suspend;
      if (obj.spec?.completions !== undefined) formValues.completions = obj.spec.completions;
      if (obj.spec?.parallelism !== undefined) formValues.parallelism = obj.spec.parallelism;
      if (obj.spec?.backoffLimit !== undefined) formValues.backoffLimit = obj.spec.backoffLimit;
      
        // StatefulSet specific
      if (obj.spec?.serviceName) formValues.serviceName = obj.spec.serviceName;
      
      // 设置默认值
      if (!formValues.namespace) formValues.namespace = 'default';
      if (!formValues.containerName) formValues.containerName = 'main';
      
      form.setFieldsValue(formValues);
      return true;
    } catch (err) {
      messageApi.error('YAML 格式错误: ' + (err instanceof Error ? err.message : '未知错误'));
      return false;
    }
  };

  // 切换编辑模式
  const handleModeChange = (mode: 'form' | 'yaml') => {
    if (mode === editMode) return;

    if (mode === 'yaml') {
      // 表单 -> YAML
      const yaml = formToYaml();
      setYamlContent(yaml);
      setEditMode('yaml');
    } else {
      // YAML -> 表单
      if (yamlToForm(yamlContent)) {
        setEditMode('form');
      }
    }
  };

  // 提交YAML
  const submitYaml = async (yaml: string) => {
    if (!clusterId) return;
    
    setSubmitting(true);
    try {
      const response = await WorkloadService.applyYAML(clusterId, yaml, false);
      
      if (response.code === 200) {
        messageApi.success(isEdit ? '更新成功' : '创建成功');
        navigate(`/clusters/${clusterId}/workloads`);
      } else {
        messageApi.error(response.message || '操作失败');
      }
    } catch (error: any) {
      console.error('提交失败:', error);
      messageApi.error(error.message || '操作失败');
    } finally {
      setSubmitting(false);
    }
  };

  // 提交处理
  const handleSubmit = async () => {
    if (editMode === 'yaml') {
      // YAML模式：直接提交YAML
      await submitYaml(yamlContent);
    } else {
      // 表单模式：验证表单并提交
      try {
        await form.validateFields();
        const yaml = formToYaml();
        await submitYaml(yaml);
      } catch (error) {
        messageApi.error('请检查表单填写是否完整');
      }
    }
  };

  const getTitle = () => {
    const action = isEdit ? '编辑' : '创建';
    const typeMap: Record<string, string> = {
      Deployment: 'Deployment',
      StatefulSet: 'StatefulSet',
      DaemonSet: 'DaemonSet',
      Rollout: 'Argo Rollout',
      Job: 'Job',
      CronJob: 'CronJob',
    };
    return `${action} ${typeMap[workloadType] || workloadType}`;
  };

  if (loading) {
    return (
      <div style={{ padding: '24px', textAlign: 'center' }}>
        <Spin size="large" />
      </div>
    );
  }

  return (
    <div style={{ padding: '24px' }}>
      <Space direction="vertical" style={{ width: '100%' }} size="large">
        {/* 头部 */}
        <Card>
          <Space style={{ width: '100%', justifyContent: 'space-between' }}>
            <Space>
              <Button
                icon={<ArrowLeftOutlined />}
                onClick={() => navigate(`/clusters/${clusterId}/workloads`)}
              >
                返回
              </Button>
              <h2 style={{ margin: 0 }}>{getTitle()}</h2>
              <Segmented
                value={editMode}
                onChange={(value) => handleModeChange(value as 'form' | 'yaml')}
                options={[
                  {
                    label: '表单模式',
                    value: 'form',
                    icon: <FormOutlined />,
                  },
                  {
                    label: 'YAML模式',
                    value: 'yaml',
                    icon: <CodeOutlined />,
                  },
                ]}
              />
            </Space>
            <Space>
              <Button onClick={() => navigate(`/clusters/${clusterId}/workloads`)}>
                取消
              </Button>
              <Button
                type="primary"
                icon={<SaveOutlined />}
                loading={submitting}
                onClick={handleSubmit}
              >
                {isEdit ? '更新' : '创建'}
              </Button>
            </Space>
          </Space>
        </Card>

        {/* YAML 编辑模式 */}
        {editMode === 'yaml' ? (
          <Card title="YAML 编辑">
            <div style={{ border: '1px solid #d9d9d9', borderRadius: '4px' }}>
              <MonacoEditor
                height="600px"
                language="yaml"
                value={yamlContent}
                onChange={(value) => setYamlContent(value || '')}
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
        ) : (
          /* 表单编辑模式 */
          <WorkloadForm
            workloadType={workloadType}
            initialData={formData || undefined}
            namespaces={namespaces}
            form={form}
          />
        )}
      </Space>
    </div>
  );
};

export default DeploymentCreate;
/** genAI_main_end */

