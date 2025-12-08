import React, { useEffect, useState } from 'react';
import {
  Card,
  Form,
  Input,
  Button,
  Space,
  message,
  Spin,
  Tag,
  Tooltip,
  Row,
  Col,
  Switch,
  Segmented,
} from 'antd';
import {
  ArrowLeftOutlined,
  SaveOutlined,
  PlusOutlined,
  DeleteOutlined,
  QuestionCircleOutlined,
  EyeOutlined,
  EyeInvisibleOutlined,
  FormOutlined,
  CodeOutlined,
} from '@ant-design/icons';
import { useNavigate, useParams } from 'react-router-dom';
import { secretService, type SecretDetail } from '../../services/configService';
import MonacoEditor from '@monaco-editor/react';
import * as YAML from 'yaml';

const SecretEdit: React.FC = () => {
  const navigate = useNavigate();
  const { clusterId, namespace, name } = useParams<{
    clusterId: string;
    namespace: string;
    name: string;
  }>();
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [secret, setSecret] = useState<SecretDetail | null>(null);
  const [labels, setLabels] = useState<Array<{ key: string; value: string }>>([]);
  const [annotations, setAnnotations] = useState<Array<{ key: string; value: string }>>([]);
  const [dataItems, setDataItems] = useState<Array<{ key: string; value: string; visible: boolean }>>([]);
  const [editMode, setEditMode] = useState<'form' | 'yaml'>('form');
  const [yamlContent, setYamlContent] = useState('');
  // const [originalYamlContent, setOriginalYamlContent] = useState('');  // 保留用于未来的重置功能

  // 加载Secret详情
  const loadSecret = React.useCallback(async () => {
    if (!clusterId || !namespace || !name) return;
    setLoading(true);
    try {
      const data = await secretService.getSecret(
        Number(clusterId),
        namespace,
        name
      );
      setSecret(data);

      // 转换labels为数组格式
      const labelsArray = Object.entries(data.labels || {}).map(([key, value]) => ({
        key,
        value,
      }));
      setLabels(labelsArray);

      // 转换annotations为数组格式
      const annotationsArray = Object.entries(data.annotations || {}).map(([key, value]) => ({
        key,
        value,
      }));
      setAnnotations(annotationsArray);

      // 转换data为数组格式
      const dataArray = Object.entries(data.data || {}).map(([key, value]) => ({
        key,
        value,
        visible: false, // 默认隐藏敏感数据
      }));
      setDataItems(dataArray);

      // 生成 YAML 内容
      const yamlObj = {
        apiVersion: 'v1',
        kind: 'Secret',
        type: data.type,
        metadata: {
          name: data.name,
          namespace: data.namespace,
          labels: data.labels || {},
          annotations: data.annotations || {},
        },
        data: data.data || {},
      };
      const yamlStr = YAML.stringify(yamlObj);
      setYamlContent(yamlStr);
      // setOriginalYamlContent(yamlStr);  // 保留用于未来的重置功能
    } catch (error) {
      const err = error as { response?: { data?: { error?: string } } };
      message.error(err.response?.data?.error || '加载Secret详情失败');
      navigate(`/clusters/${clusterId}/configs`);
    } finally {
      setLoading(false);
    }
  }, [clusterId, namespace, name, navigate]);

  useEffect(() => {
    loadSecret();
  }, [loadSecret]);

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
    setDataItems([...dataItems, { key: '', value: '', visible: false }]);
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

  // 切换数据项可见性
  const toggleDataVisibility = (index: number) => {
    const newDataItems = [...dataItems];
    newDataItems[index].visible = !newDataItems[index].visible;
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
      kind: 'Secret',
      type: secret?.type,
      metadata: {
        name: secret?.name,
        namespace: secret?.namespace,
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
        visible: false,
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
    if (!clusterId || !namespace || !name) return;

    let labelsObj: Record<string, string> = {};
    let annotationsObj: Record<string, string> = {};
    let dataObj: Record<string, string> = {};

    if (editMode === 'yaml') {
      // YAML 模式：解析 YAML
      try {
        const yamlObj = YAML.parse(yamlContent);
        labelsObj = yamlObj.metadata?.labels || {};
        annotationsObj = yamlObj.metadata?.annotations || {};
        dataObj = yamlObj.data || {};
      } catch (error) {
        message.error('YAML 格式错误: ' + (error instanceof Error ? error.message : '未知错误'));
        return;
      }
    } else {
      // 表单模式：验证和构建数据
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
      await secretService.updateSecret(
        Number(clusterId),
        namespace,
        name,
        {
          labels: labelsObj,
          annotations: annotationsObj,
          data: dataObj,
        }
      );
      message.success('Secret更新成功');
      navigate(`/clusters/${clusterId}/configs/secret/${namespace}/${name}`);
    } catch (error) {
      const err = error as { response?: { data?: { error?: string } } };
      message.error(err.response?.data?.error || '更新Secret失败');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '100px' }}>
        <Spin size="large" />
      </div>
    );
  }

  if (!secret) {
    return null;
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
                onClick={() => navigate(`/clusters/${clusterId}/configs/secret/${namespace}/${name}`)}
              >
                返回
              </Button>
              <h2 style={{ margin: 0 }}>编辑 Secret: {secret.name}</h2>
              <Tag color="orange">敏感数据</Tag>
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
              <Button onClick={() => navigate(`/clusters/${clusterId}/configs/secret/${namespace}/${name}`)}>
                取消
              </Button>
              <Button
                type="primary"
                icon={<SaveOutlined />}
                loading={submitting}
                onClick={handleSubmit}
              >
                保存
              </Button>
            </Space>
          </Space>
        </Card>

        {/* YAML 编辑模式 */}
        {editMode === 'yaml' ? (
          <Card title="YAML 编辑" extra={<Tag color="orange">包含敏感数据</Tag>}>
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
              <Col span={8}>
                <Form.Item label="名称">
                  <Input value={secret.name} disabled />
                </Form.Item>
              </Col>
              <Col span={8}>
                <Form.Item label="命名空间">
                  <Input value={secret.namespace} disabled addonBefore={<Tag color="blue">Namespace</Tag>} />
                </Form.Item>
              </Col>
              <Col span={8}>
                <Form.Item label="类型">
                  <Input value={secret.type} disabled />
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
              <Tag color="orange">敏感数据</Tag>
              <Tooltip title="存储敏感数据的键值对">
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
                  <Space>
                    <Input
                      placeholder="数据项键 (例如: username, password)"
                      value={item.key}
                      onChange={(e) => handleDataKeyChange(index, e.target.value)}
                      style={{ width: '400px' }}
                    />
                    <Tooltip title={item.visible ? '隐藏内容' : '显示内容'}>
                      <Switch
                        checkedChildren={<EyeOutlined />}
                        unCheckedChildren={<EyeInvisibleOutlined />}
                        checked={item.visible}
                        onChange={() => toggleDataVisibility(index)}
                      />
                    </Tooltip>
                  </Space>
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
                {item.visible ? (
                  <div style={{ border: '1px solid #d9d9d9', borderRadius: '4px' }}>
                    <MonacoEditor
                      height="200px"
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
                ) : (
                  <div style={{ 
                    padding: '20px', 
                    textAlign: 'center', 
                    background: '#fafafa',
                    border: '1px dashed #d9d9d9',
                    borderRadius: '4px',
                  }}>
                    <EyeInvisibleOutlined style={{ fontSize: '24px', color: '#999', marginBottom: '8px' }} />
                    <div style={{ color: '#999' }}>
                      敏感数据已隐藏，点击上方开关查看或编辑
                    </div>
                  </div>
                )}
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

export default SecretEdit;

