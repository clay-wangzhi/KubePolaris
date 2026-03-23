import React, { useState } from 'react';
import {
  Card,
  Form,
  Input,
  Button,
  Space,
  message,
  Tag,
  Tooltip,
  Row,
  Col,
  Segmented,
  Select,
  Switch,
} from 'antd';
import {
  ArrowLeftOutlined,
  SaveOutlined,
  PlusOutlined,
  DeleteOutlined,
  QuestionCircleOutlined,
  FormOutlined,
  CodeOutlined,
  EyeOutlined,
  EyeInvisibleOutlined,
} from '@ant-design/icons';
import { useNavigate, useParams } from 'react-router-dom';
import { secretService, getNamespaces } from '../../services/configService';
import MonacoEditor from '@monaco-editor/react';
import * as YAML from 'yaml';
import { useTranslation } from 'react-i18next';
import { parseApiError } from '../../utils/api';

const SecretCreate: React.FC = () => {
  const navigate = useNavigate();
  const { clusterId } = useParams<{ clusterId: string }>();
const { t } = useTranslation(['config', 'common']);
const [form] = Form.useForm();
  const [submitting, setSubmitting] = useState(false);
  const [editMode, setEditMode] = useState<'form' | 'yaml'>('form');
  
  // 表单模式状态
  const [name, setName] = useState('');
  const [namespace, setNamespace] = useState('default');
  const [secretType, setSecretType] = useState('Opaque');
  const [labels, setLabels] = useState<Array<{ key: string; value: string }>>([]);
  const [annotations, setAnnotations] = useState<Array<{ key: string; value: string }>>([]);
  const [dataItems, setDataItems] = useState<Array<{ key: string; value: string; visible: boolean }>>([]);
  
  // 命名空间列表
  const [namespaces, setNamespaces] = useState<string[]>(['default']);
  const [loadingNamespaces, setLoadingNamespaces] = useState(false);
  
  // YAML 模式状态
  const [yamlContent, setYamlContent] = useState(`apiVersion: v1
kind: Secret
type: Opaque
metadata:
  name: example-secret
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
      type: secretType || 'Opaque',
      metadata: {
        name: name || 'example-secret',
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
      setSecretType(yamlObj.type || 'Opaque');
      
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
      message.error(t('config:create.messages.yamlFormatError', { error: error instanceof Error ? error.message : t('config:create.messages.unknownError') }));
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

    let secretName = '';
    let secretNamespace = '';
    let secretTypeValue = '';
    let labelsObj: Record<string, string> = {};
    let annotationsObj: Record<string, string> = {};
    let dataObj: Record<string, string> = {};

    if (editMode === 'yaml') {
      // YAML 模式：解析 YAML
      try {
        const yamlObj = YAML.parse(yamlContent);
        secretName = yamlObj.metadata?.name;
        secretNamespace = yamlObj.metadata?.namespace || 'default';
        secretTypeValue = yamlObj.type || 'Opaque';
        labelsObj = yamlObj.metadata?.labels || {};
        annotationsObj = yamlObj.metadata?.annotations || {};
        dataObj = yamlObj.data || {};
        
        if (!secretName) {
          message.error(t('config:create.messages.secretNameRequired'));
          return;
        }
      } catch (error) {
        message.error(t('config:create.messages.yamlFormatError', { error: error instanceof Error ? error.message : t('config:create.messages.unknownError') }));
        return;
      }
    } else {
      // 表单模式：验证和构建数据
      if (!name) {
        message.error(t('config:create.messages.secretNameRequired'));
        return;
      }
      
      secretName = name;
      secretNamespace = namespace;
      secretTypeValue = secretType;

      // 验证标签和注解
      for (const label of labels) {
        if (label.key) {
          if (labelsObj[label.key]) {
            message.error(t('config:create.messages.labelKeyDuplicate', { key: label.key }));
            return;
          }
          labelsObj[label.key] = label.value;
        }
      }

      for (const annotation of annotations) {
        if (annotation.key) {
          if (annotationsObj[annotation.key]) {
            message.error(t('config:create.messages.annotationKeyDuplicate', { key: annotation.key }));
            return;
          }
          annotationsObj[annotation.key] = annotation.value;
        }
      }

      // 验证数据项
      for (const item of dataItems) {
        if (!item.key) {
          message.error(t('config:create.messages.dataKeyRequired'));
          return;
        }
        if (dataObj[item.key]) {
          message.error(t('config:create.messages.dataKeyDuplicate', { key: item.key }));
          return;
        }
        dataObj[item.key] = item.value;
      }
    }

    setSubmitting(true);
    try {
      await secretService.createSecret(Number(clusterId), {
        name: secretName,
        namespace: secretNamespace,
        type: secretTypeValue,
        labels: labelsObj,
        annotations: annotationsObj,
        data: dataObj,
      });
      message.success(t('config:create.messages.secretCreateSuccess'));
      navigate(`/clusters/${clusterId}/configs`);
    } catch (error: unknown) {
      message.error(parseApiError(error) || t('config:create.messages.secretCreateError'));
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
                {t('common:actions.back')}
              </Button>
              <h2 style={{ margin: 0 }}>{t('config:create.createSecret')}</h2>
              <Tag color="orange">{t('config:create.sensitiveData')}</Tag>
              <Segmented
                value={editMode}
                onChange={(value) => handleModeChange(value as 'form' | 'yaml')}
                options={[
                  {
                    label: t('config:create.formMode'),
                    value: 'form',
                    icon: <FormOutlined />,
                  },
                  {
                    label: t('config:create.yamlMode'),
                    value: 'yaml',
                    icon: <CodeOutlined />,
                  },
                ]}
              />
            </Space>
            <Space>
              <Button onClick={() => navigate(`/clusters/${clusterId}/configs`)}>
                {t('common:actions.cancel')}
              </Button>
              <Button
                type="primary"
                icon={<SaveOutlined />}
                loading={submitting}
                onClick={handleSubmit}
              >
                {t('common:actions.create')}
              </Button>
            </Space>
          </Space>
        </Card>

        {/* YAML 编辑模式 */}
        {editMode === 'yaml' ? (
          <Card title={t('config:create.yamlEditor')} extra={<Tag color="orange">{t('config:create.yamlEditorSensitive')}</Tag>}>
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
            <Card title={t('config:create.basicInfo')}>
              <Form form={form} layout="vertical">
                <Row gutter={16}>
                  <Col span={8}>
                    <Form.Item 
                      label={t('config:create.name')} 
                      required
                      help={t('config:create.secretNameHelp')}
                    >
                      <Input 
                        placeholder={t('config:create.secretNamePlaceholder')} 
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                      />
                    </Form.Item>
                  </Col>
                  <Col span={8}>
                    <Form.Item 
                      label={t('config:create.namespace')}
                      help={t('config:create.secretNamespaceHelp')}
                    >
                      <Select
                        value={namespace}
                        onChange={setNamespace}
                        placeholder={t('config:create.namespacePlaceholder')}
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
                  <Col span={8}>
                    <Form.Item 
                      label={t('config:create.type')}
                      help={t('config:create.secretTypeHelp')}
                    >
                      <Select
                        value={secretType}
                        onChange={setSecretType}
                        placeholder={t('config:create.typePlaceholder')}
                      >
                        <Select.Option value="Opaque">Opaque</Select.Option>
                        <Select.Option value="kubernetes.io/service-account-token">
                          kubernetes.io/service-account-token
                        </Select.Option>
                        <Select.Option value="kubernetes.io/dockerconfigjson">
                          kubernetes.io/dockerconfigjson
                        </Select.Option>
                        <Select.Option value="kubernetes.io/tls">
                          kubernetes.io/tls
                        </Select.Option>
                        <Select.Option value="kubernetes.io/basic-auth">
                          kubernetes.io/basic-auth
                        </Select.Option>
                        <Select.Option value="kubernetes.io/ssh-auth">
                          kubernetes.io/ssh-auth
                        </Select.Option>
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
                  <span>{t('config:create.labels')}</span>
                  <Tooltip title={t('config:create.labelsTooltip')}>
                    <QuestionCircleOutlined style={{ color: '#999' }} />
                  </Tooltip>
                </Space>
              }
              extra={
                <Button type="dashed" size="small" icon={<PlusOutlined />} onClick={handleAddLabel}>
                  {t('config:create.addLabel')}
                </Button>
              }
            >
              <Space direction="vertical" style={{ width: '100%' }} size="small">
                {labels.map((label, index) => (
                  <Row key={index} gutter={8} align="middle">
                    <Col span={10}>
                      <Input
                        placeholder={t('config:create.keyPlaceholder')}
                        value={label.key}
                        onChange={(e) => handleLabelChange(index, 'key', e.target.value)}
                      />
                    </Col>
                    <Col span={10}>
                      <Input
                        placeholder={t('config:create.valuePlaceholder')}
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
                        {t('common:actions.delete')}
                      </Button>
                    </Col>
                  </Row>
                ))}
                {labels.length === 0 && (
                  <div style={{ textAlign: 'center', color: '#999', padding: '20px' }}>
                    {t('config:create.noLabels')}
                  </div>
                )}
              </Space>
            </Card>

            {/* 注解 */}
            <Card
              title={
                <Space>
                  <span>{t('config:create.annotations')}</span>
                  <Tooltip title={t('config:create.annotationsTooltip')}>
                    <QuestionCircleOutlined style={{ color: '#999' }} />
                  </Tooltip>
                </Space>
              }
              extra={
                <Button type="dashed" size="small" icon={<PlusOutlined />} onClick={handleAddAnnotation}>
                  {t('config:create.addAnnotation')}
                </Button>
              }
            >
              <Space direction="vertical" style={{ width: '100%' }} size="small">
                {annotations.map((annotation, index) => (
                  <Row key={index} gutter={8} align="middle">
                    <Col span={10}>
                      <Input
                        placeholder={t('config:create.keyPlaceholder')}
                        value={annotation.key}
                        onChange={(e) => handleAnnotationChange(index, 'key', e.target.value)}
                      />
                    </Col>
                    <Col span={10}>
                      <Input
                        placeholder={t('config:create.valuePlaceholder')}
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
                        {t('common:actions.delete')}
                      </Button>
                    </Col>
                  </Row>
                ))}
                {annotations.length === 0 && (
                  <div style={{ textAlign: 'center', color: '#999', padding: '20px' }}>
                    {t('config:create.noAnnotations')}
                  </div>
                )}
              </Space>
            </Card>

            {/* 数据内容 */}
            <Card
              title={
                <Space>
                  <span>{t('config:create.dataContent')}</span>
                  <Tag color="orange">{t('config:create.sensitiveData')}</Tag>
                  <Tooltip title={t('config:create.sensitiveDataTooltip')}>
                    <QuestionCircleOutlined style={{ color: '#999' }} />
                  </Tooltip>
                </Space>
              }
              extra={
                <Button type="dashed" size="small" icon={<PlusOutlined />} onClick={handleAddDataItem}>
                  {t('config:create.addDataItem')}
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
                          placeholder={t('config:create.secretDataKeyPlaceholder')}
                          value={item.key}
                          onChange={(e) => handleDataKeyChange(index, e.target.value)}
                          style={{ width: '400px' }}
                        />
                        <Tooltip title={item.visible ? t('config:create.hideContent') : t('config:create.showContent')}>
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
                        {t('common:actions.delete')}
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
                          {t('config:create.sensitiveDataHidden')}
                        </div>
                      </div>
                    )}
                  </Card>
                ))}
                {dataItems.length === 0 && (
                  <div style={{ textAlign: 'center', color: '#999', padding: '20px' }}>
                    {t('config:create.noDataItems')}
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

export default SecretCreate;

