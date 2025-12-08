import React, { useState } from 'react';
import {
  Card,
  Form,
  Input,
  Button,
  Space,
  message,
  Tooltip,
  Row,
  Col,
  Segmented,
  Select,
} from 'antd';
import {
  ArrowLeftOutlined,
  SaveOutlined,
  PlusOutlined,
  DeleteOutlined,
  QuestionCircleOutlined,
  FormOutlined,
  CodeOutlined,
} from '@ant-design/icons';
import { useNavigate, useParams } from 'react-router-dom';
import { configMapService, getNamespaces } from '../../services/configService';
import MonacoEditor from '@monaco-editor/react';
import * as YAML from 'yaml';

const ConfigMapCreate: React.FC = () => {
  const navigate = useNavigate();
  const { clusterId } = useParams<{ clusterId: string }>();
  const [form] = Form.useForm();
  const [submitting, setSubmitting] = useState(false);
  const [editMode, setEditMode] = useState<'form' | 'yaml'>('form');
  
  // 表单模式状态
  const [name, setName] = useState('');
  const [namespace, setNamespace] = useState('default');
  const [labels, setLabels] = useState<Array<{ key: string; value: string }>>([]);
  const [annotations, setAnnotations] = useState<Array<{ key: string; value: string }>>([]);
  const [dataItems, setDataItems] = useState<Array<{ key: string; value: string }>>([]);
  
  // 命名空间列表
  const [namespaces, setNamespaces] = useState<string[]>(['default']);
  const [loadingNamespaces, setLoadingNamespaces] = useState(false);
  
  // YAML 模式状态
  const [yamlContent, setYamlContent] = useState(`apiVersion: v1
kind: ConfigMap
metadata:
  name: example-configmap
  namespace: default
  labels: {}
  annotations: {}
data: {}`);

  // 加载命名空间列表
  React.useEffect(() => {
    const loadNamespaces = async () => {
      if (!clusterId) return;
      setLoadingNamespaces(true);
      try {
        const nsList = await getNamespaces(Number(clusterId));
        setNamespaces(nsList);
        // 如果当前命名空间不在列表中，设置为第一个
        if (nsList.length > 0 && !nsList.includes(namespace)) {
          setNamespace(nsList[0]);
        }
      } catch (error) {
        console.error('加载命名空间失败:', error);
      } finally {
        setLoadingNamespaces(false);
      }
    };

    loadNamespaces();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clusterId]);

  // 添加标签
  const handleAddLabel = () => {
    setLabels([...labels, { key: '', value: '' }]);
  };

  // 删除标签
  const handleRemoveLabel = (index: number) => {
    const newLabels = labels.filter((_, i) => i !== index);
    setLabels(newLabels);
  };

  // 更新标签
  const handleLabelChange = (index: number, field: 'key' | 'value', value: string) => {
    const newLabels = [...labels];
    newLabels[index][field] = value;
    setLabels(newLabels);
  };

  // 添加注解
  const handleAddAnnotation = () => {
    setAnnotations([...annotations, { key: '', value: '' }]);
  };

  // 删除注解
  const handleRemoveAnnotation = (index: number) => {
    const newAnnotations = annotations.filter((_, i) => i !== index);
    setAnnotations(newAnnotations);
  };

  // 更新注解
  const handleAnnotationChange = (index: number, field: 'key' | 'value', value: string) => {
    const newAnnotations = [...annotations];
    newAnnotations[index][field] = value;
    setAnnotations(newAnnotations);
  };

  // 添加数据项
  const handleAddDataItem = () => {
    setDataItems([...dataItems, { key: '', value: '' }]);
  };

  // 删除数据项
  const handleRemoveDataItem = (index: number) => {
    const newDataItems = dataItems.filter((_, i) => i !== index);
    setDataItems(newDataItems);
  };

  // 更新数据项键
  const handleDataKeyChange = (index: number, value: string) => {
    const newDataItems = [...dataItems];
    newDataItems[index].key = value;
    setDataItems(newDataItems);
  };

  // 更新数据项值
  const handleDataValueChange = (index: number, value: string | undefined) => {
    const newDataItems = [...dataItems];
    newDataItems[index].value = value || '';
    setDataItems(newDataItems);
  };

  // 表单模式转YAML模式
  const formToYaml = () => {
    const labelsObj: Record<string, string> = {};
    labels.forEach((label) => {
      if (label.key) labelsObj[label.key] = label.value;
    });

    const annotationsObj: Record<string, string> = {};
    annotations.forEach((annotation) => {
      if (annotation.key) annotationsObj[annotation.key] = annotation.value;
    });

    const dataObj: Record<string, string> = {};
    dataItems.forEach((item) => {
      if (item.key) dataObj[item.key] = item.value;
    });

    const yamlObj = {
      apiVersion: 'v1',
      kind: 'ConfigMap',
      metadata: {
        name: name || 'example-configmap',
        namespace: namespace || 'default',
        labels: labelsObj,
        annotations: annotationsObj,
      },
      data: dataObj,
    };

    return YAML.stringify(yamlObj);
  };

  // YAML模式转表单模式
  const yamlToForm = (yamlStr: string) => {
    try {
      const yamlObj = YAML.parse(yamlStr);
      
      // 解析基本信息
      setName(yamlObj.metadata?.name || '');
      setNamespace(yamlObj.metadata?.namespace || 'default');
      
      // 解析labels
      const labelsArray = Object.entries(yamlObj.metadata?.labels || {}).map(([key, value]) => ({
        key,
        value: String(value),
      }));
      setLabels(labelsArray);

      // 解析annotations
      const annotationsArray = Object.entries(yamlObj.metadata?.annotations || {}).map(([key, value]) => ({
        key,
        value: String(value),
      }));
      setAnnotations(annotationsArray);

      // 解析data
      const dataArray = Object.entries(yamlObj.data || {}).map(([key, value]) => ({
        key,
        value: String(value),
      }));
      setDataItems(dataArray);

      return true;
    } catch (error) {
      message.error('YAML 格式错误: ' + (error instanceof Error ? error.message : '未知错误'));
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

  // 提交表单
  const handleSubmit = async () => {
    if (!clusterId) return;

    let configMapName = '';
    let configMapNamespace = '';
    let labelsObj: Record<string, string> = {};
    let annotationsObj: Record<string, string> = {};
    let dataObj: Record<string, string> = {};

    if (editMode === 'yaml') {
      // YAML 模式：解析 YAML
      try {
        const yamlObj = YAML.parse(yamlContent);
        configMapName = yamlObj.metadata?.name;
        configMapNamespace = yamlObj.metadata?.namespace || 'default';
        labelsObj = yamlObj.metadata?.labels || {};
        annotationsObj = yamlObj.metadata?.annotations || {};
        dataObj = yamlObj.data || {};
        
        if (!configMapName) {
          message.error('ConfigMap 名称不能为空');
          return;
        }
      } catch (error) {
        message.error('YAML 格式错误: ' + (error instanceof Error ? error.message : '未知错误'));
        return;
      }
    } else {
      // 表单模式：验证和构建数据
      if (!name) {
        message.error('ConfigMap 名称不能为空');
        return;
      }
      
      configMapName = name;
      configMapNamespace = namespace;

      // 验证标签和注解
      for (const label of labels) {
        if (label.key) {
          if (labelsObj[label.key]) {
            message.error(`标签键 "${label.key}" 重复`);
            return;
          }
          labelsObj[label.key] = label.value;
        }
      }

      for (const annotation of annotations) {
        if (annotation.key) {
          if (annotationsObj[annotation.key]) {
            message.error(`注解键 "${annotation.key}" 重复`);
            return;
          }
          annotationsObj[annotation.key] = annotation.value;
        }
      }

      // 验证数据项
      for (const item of dataItems) {
        if (!item.key) {
          message.error('数据项键不能为空');
          return;
        }
        if (dataObj[item.key]) {
          message.error(`数据项键 "${item.key}" 重复`);
          return;
        }
        dataObj[item.key] = item.value;
      }
    }

    setSubmitting(true);
    try {
      await configMapService.createConfigMap(Number(clusterId), {
        name: configMapName,
        namespace: configMapNamespace,
        labels: labelsObj,
        annotations: annotationsObj,
        data: dataObj,
      });
      message.success('ConfigMap创建成功');
      navigate(`/clusters/${clusterId}/configs`);
    } catch (error) {
      const err = error as { response?: { data?: { error?: string } } };
      message.error(err.response?.data?.error || '创建ConfigMap失败');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{ padding: '24px' }}>
      <Space direction="vertical" style={{ width: '100%' }} size="large">
        {/* 头部 */}
        <Card>
          <Space style={{ width: '100%', justifyContent: 'space-between' }}>
            <Space>
              <Button
                icon={<ArrowLeftOutlined />}
                onClick={() => navigate(`/clusters/${clusterId}/configs`)}
              >
                返回
              </Button>
              <h2 style={{ margin: 0 }}>创建 ConfigMap</h2>
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
              <Button onClick={() => navigate(`/clusters/${clusterId}/configs`)}>
                取消
              </Button>
              <Button
                type="primary"
                icon={<SaveOutlined />}
                loading={submitting}
                onClick={handleSubmit}
              >
                创建
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
          <>
            {/* 基本信息 */}
            <Card title="基本信息">
              <Form form={form} layout="vertical">
                <Row gutter={16}>
                  <Col span={12}>
                    <Form.Item 
                      label="名称" 
                      required
                      help="ConfigMap 的唯一标识名称"
                    >
                      <Input 
                        placeholder="例如: app-config" 
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                      />
                    </Form.Item>
                  </Col>
                  <Col span={12}>
                    <Form.Item 
                      label="命名空间"
                      help="ConfigMap 所属的命名空间"
                    >
                      <Select
                        value={namespace}
                        onChange={setNamespace}
                        placeholder="选择命名空间"
                        loading={loadingNamespaces}
                        showSearch
                        filterOption={(input, option) => {
                          if (!option?.children) return false;
                          const text = String(option.children);
                          return text.toLowerCase().includes(input.toLowerCase());
                        }}
                      >
                        {namespaces.map((ns) => (
                          <Select.Option key={ns} value={ns}>
                            {ns}
                          </Select.Option>
                        ))}
                      </Select>
                    </Form.Item>
                  </Col>
                </Row>
              </Form>
            </Card>

            {/* 标签 */}
            <Card
              title={
                <Space>
                  <span>标签 (Labels)</span>
                  <Tooltip title="标签用于组织和选择资源">
                    <QuestionCircleOutlined style={{ color: '#999' }} />
                  </Tooltip>
                </Space>
              }
              extra={
                <Button type="dashed" size="small" icon={<PlusOutlined />} onClick={handleAddLabel}>
                  添加标签
                </Button>
              }
            >
              <Space direction="vertical" style={{ width: '100%' }} size="small">
                {labels.map((label, index) => (
                  <Row key={index} gutter={8} align="middle">
                    <Col span={10}>
                      <Input
                        placeholder="键 (key)"
                        value={label.key}
                        onChange={(e) => handleLabelChange(index, 'key', e.target.value)}
                      />
                    </Col>
                    <Col span={10}>
                      <Input
                        placeholder="值 (value)"
                        value={label.value}
                        onChange={(e) => handleLabelChange(index, 'value', e.target.value)}
                      />
                    </Col>
                    <Col span={4}>
                      <Button
                        type="text"
                        danger
                        icon={<DeleteOutlined />}
                        onClick={() => handleRemoveLabel(index)}
                      >
                        删除
                      </Button>
                    </Col>
                  </Row>
                ))}
                {labels.length === 0 && (
                  <div style={{ textAlign: 'center', color: '#999', padding: '20px' }}>
                    暂无标签，点击上方按钮添加
                  </div>
                )}
              </Space>
            </Card>

            {/* 注解 */}
            <Card
              title={
                <Space>
                  <span>注解 (Annotations)</span>
                  <Tooltip title="注解用于存储额外的元数据信息">
                    <QuestionCircleOutlined style={{ color: '#999' }} />
                  </Tooltip>
                </Space>
              }
              extra={
                <Button type="dashed" size="small" icon={<PlusOutlined />} onClick={handleAddAnnotation}>
                  添加注解
                </Button>
              }
            >
              <Space direction="vertical" style={{ width: '100%' }} size="small">
                {annotations.map((annotation, index) => (
                  <Row key={index} gutter={8} align="middle">
                    <Col span={10}>
                      <Input
                        placeholder="键 (key)"
                        value={annotation.key}
                        onChange={(e) => handleAnnotationChange(index, 'key', e.target.value)}
                      />
                    </Col>
                    <Col span={10}>
                      <Input
                        placeholder="值 (value)"
                        value={annotation.value}
                        onChange={(e) => handleAnnotationChange(index, 'value', e.target.value)}
                      />
                    </Col>
                    <Col span={4}>
                      <Button
                        type="text"
                        danger
                        icon={<DeleteOutlined />}
                        onClick={() => handleRemoveAnnotation(index)}
                      >
                        删除
                      </Button>
                    </Col>
                  </Row>
                ))}
                {annotations.length === 0 && (
                  <div style={{ textAlign: 'center', color: '#999', padding: '20px' }}>
                    暂无注解，点击上方按钮添加
                  </div>
                )}
              </Space>
            </Card>

            {/* 数据内容 */}
            <Card
              title={
                <Space>
                  <span>数据内容 (Data)</span>
                  <Tooltip title="存储配置数据的键值对">
                    <QuestionCircleOutlined style={{ color: '#999' }} />
                  </Tooltip>
                </Space>
              }
              extra={
                <Button type="dashed" size="small" icon={<PlusOutlined />} onClick={handleAddDataItem}>
                  添加数据项
                </Button>
              }
            >
              <Space direction="vertical" style={{ width: '100%' }} size="middle">
                {dataItems.map((item, index) => (
                  <Card
                    key={index}
                    size="small"
                    title={
                      <Input
                        placeholder="数据项键 (例如: config.yaml)"
                        value={item.key}
                        onChange={(e) => handleDataKeyChange(index, e.target.value)}
                        style={{ width: '400px' }}
                      />
                    }
                    extra={
                      <Button
                        type="text"
                        danger
                        size="small"
                        icon={<DeleteOutlined />}
                        onClick={() => handleRemoveDataItem(index)}
                      >
                        删除
                      </Button>
                    }
                  >
                    <div style={{ border: '1px solid #d9d9d9', borderRadius: '4px' }}>
                      <MonacoEditor
                        height="300px"
                        language="plaintext"
                        value={item.value}
                        onChange={(value) => handleDataValueChange(index, value)}
                        options={{
                          minimap: { enabled: false },
                          lineNumbers: 'on',
                          scrollBeyondLastLine: false,
                          automaticLayout: true,
                          tabSize: 2,
                        }}
                        theme="vs-light"
                      />
                    </div>
                  </Card>
                ))}
                {dataItems.length === 0 && (
                  <div style={{ textAlign: 'center', color: '#999', padding: '20px' }}>
                    暂无数据项，点击上方按钮添加
                  </div>
                )}
              </Space>
            </Card>
          </>
        )}
      </Space>
    </div>
  );
};

export default ConfigMapCreate;

