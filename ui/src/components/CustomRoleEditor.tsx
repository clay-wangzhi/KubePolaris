import React, { useState } from 'react';
import {
  Modal,
  Form,
  Input,
  Button,
  Select,
  Card,
  Row,
  Col,
  Typography,
  Divider,
  Tabs,
  message,
} from 'antd';
import { PlusOutlined, DeleteOutlined, CodeOutlined, FormOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import type { PolicyRule } from '../services/rbacService';
import rbacService from '../services/rbacService';

const { Text, Paragraph } = Typography;
const { TextArea } = Input;
const { Option } = Select;

// 常用 API Groups - labels will be translated dynamically
const commonApiGroupValues = [
  { value: '', labelKey: 'coreApiGroup' },
  { value: 'apps', label: 'apps' },
  { value: 'batch', label: 'batch' },
  { value: 'networking.k8s.io', label: 'networking.k8s.io' },
  { value: 'autoscaling', label: 'autoscaling' },
  { value: 'policy', label: 'policy' },
  { value: 'rbac.authorization.k8s.io', label: 'rbac.authorization.k8s.io' },
  { value: 'argoproj.io', label: 'argoproj.io' },
  { value: '*', labelKey: 'allApiGroup' },
];

// 常用资源
const commonResources = [
  'pods', 'pods/log', 'pods/exec', 'pods/portforward',
  'deployments', 'deployments/scale',
  'statefulsets', 'statefulsets/scale',
  'daemonsets',
  'replicasets',
  'services',
  'ingresses',
  'configmaps',
  'secrets',
  'jobs',
  'cronjobs',
  'namespaces',
  'nodes',
  'persistentvolumeclaims',
  'persistentvolumes',
  'events',
  '*',
];

// 常用动作 - labels will be translated dynamically
const allVerbValues = [
  { value: 'get', labelKey: 'verbGet' },
  { value: 'list', labelKey: 'verbList' },
  { value: 'watch', labelKey: 'verbWatch' },
  { value: 'create', labelKey: 'verbCreate' },
  { value: 'update', labelKey: 'verbUpdate' },
  { value: 'patch', labelKey: 'verbPatch' },
  { value: 'delete', labelKey: 'verbDelete' },
  { value: 'deletecollection', labelKey: 'verbDeleteCollection' },
  { value: '*', labelKey: 'verbAll' },
];

interface CustomRoleEditorProps {
  visible: boolean;
  clusterId: number | string;
  clusterName: string;
  onCancel: () => void;
  onSuccess: (roleName: string) => void;
}

const CustomRoleEditor: React.FC<CustomRoleEditorProps> = ({
  visible,
  clusterId,
  clusterName,
  onCancel,
  onSuccess,
}) => {
  const { t } = useTranslation('components');
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [rules, setRules] = useState<PolicyRule[]>([
    { apiGroups: [''], resources: [], verbs: [] },
  ]);
  const [activeTab, setActiveTab] = useState<'form' | 'yaml'>('form');
  const [yamlContent, setYamlContent] = useState('');

  // 添加规则
  const addRule = () => {
    setRules([...rules, { apiGroups: [''], resources: [], verbs: [] }]);
  };

  // 删除规则
  const removeRule = (index: number) => {
    if (rules.length <= 1) {
      message.warning(t('customRoleEditor.atLeastOneRule'));
      return;
    }
    setRules(rules.filter((_, i) => i !== index));
  };

  // 更新规则
  const updateRule = (index: number, field: keyof PolicyRule, value: string[]) => {
    const newRules = [...rules];
    newRules[index] = { ...newRules[index], [field]: value };
    setRules(newRules);
  };

  // 生成 YAML
  const generateYaml = () => {
    const name = form.getFieldValue('name') || 'custom-role';
    const yaml = `apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRole
metadata:
  name: ${name}
  labels:
    app.kubernetes.io/managed-by: kubepolaris
rules:
${rules.map(rule => `  - apiGroups: [${rule.apiGroups.map(g => `"${g}"`).join(', ')}]
    resources: [${rule.resources.map(r => `"${r}"`).join(', ')}]
    verbs: [${rule.verbs.map(v => `"${v}"`).join(', ')}]`).join('\n')}`;
    setYamlContent(yaml);
    setActiveTab('yaml');
  };

  // 提交
  const handleSubmit = async () => {
    try {
      await form.validateFields();
      const name = form.getFieldValue('name');

      // 验证规则
      for (const rule of rules) {
        if (rule.resources.length === 0) {
          message.error(t('customRoleEditor.resourceRequired'));
          return;
        }
        if (rule.verbs.length === 0) {
          message.error(t('customRoleEditor.verbRequired'));
          return;
        }
      }

      setLoading(true);
      const res = await rbacService.createCustomClusterRole(Number(clusterId), name, rules);
      if (res.code === 200) {
        message.success(t('customRoleEditor.createSuccess'));
        onSuccess(name);
        handleClose();
      } else {
        message.error(res.message || t('customRoleEditor.createFailed'));
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  // 关闭
  const handleClose = () => {
    form.resetFields();
    setRules([{ apiGroups: [''], resources: [], verbs: [] }]);
    setYamlContent('');
    setActiveTab('form');
    onCancel();
  };

  return (
    <Modal
      title={t('customRoleEditor.title', { clusterName })}
      open={visible}
      onCancel={handleClose}
      width={900}
      footer={[
        <Button key="cancel" onClick={handleClose}>
          {t('customRoleEditor.cancel')}
        </Button>,
        <Button key="yaml" icon={<CodeOutlined />} onClick={generateYaml}>
          {t('customRoleEditor.previewYaml')}
        </Button>,
        <Button key="submit" type="primary" loading={loading} onClick={handleSubmit}>
          {t('customRoleEditor.create')}
        </Button>,
      ]}
    >
      <Tabs
        activeKey={activeTab}
        onChange={(key) => setActiveTab(key as 'form' | 'yaml')}
        items={[
          {
            key: 'form',
            label: (
              <span>
                <FormOutlined /> {t('customRoleEditor.formEdit')}
              </span>
            ),
            children: (
              <div>
                <Form form={form} layout="vertical">
                  <Form.Item
                    name="name"
                    label={t('customRoleEditor.roleName')}
                    rules={[
                      { required: true, message: t('customRoleEditor.nameRequired') },
                      { pattern: /^[a-z0-9][a-z0-9-]*[a-z0-9]$/, message: t('customRoleEditor.namePattern') },
                    ]}
                  >
                    <Input placeholder="custom-developer-role" />
                  </Form.Item>
                </Form>

                <Divider orientation="left">{t('customRoleEditor.permissionRules')}</Divider>
                <Paragraph type="secondary" style={{ marginBottom: 16 }}>
                  {t('customRoleEditor.permissionRulesDesc')}
                </Paragraph>

                {rules.map((rule, index) => (
                  <Card
                    key={index}
                    size="small"
                    style={{ marginBottom: 16 }}
                    title={t('customRoleEditor.ruleIndex', { index: index + 1 })}
                    extra={
                      <Button
                        type="text"
                        danger
                        icon={<DeleteOutlined />}
                        onClick={() => removeRule(index)}
                        disabled={rules.length <= 1}
                      />
                    }
                  >
                    <Row gutter={16}>
                      <Col span={8}>
                        <Text strong>API Groups</Text>
                        <Select
                          mode="tags"
                          style={{ width: '100%', marginTop: 8 }}
                          placeholder={t('customRoleEditor.selectApiGroup')}
                          value={rule.apiGroups}
                          onChange={(value) => updateRule(index, 'apiGroups', value)}
                        >
                          {commonApiGroupValues.map((g) => (
                            <Option key={g.value} value={g.value}>
                              {g.labelKey ? t(`customRoleEditor.${g.labelKey}`) : g.label}
                            </Option>
                          ))}
                        </Select>
                      </Col>
                      <Col span={8}>
                        <Text strong>Resources</Text>
                        <Select
                          mode="tags"
                          style={{ width: '100%', marginTop: 8 }}
                          placeholder={t('customRoleEditor.selectResource')}
                          value={rule.resources}
                          onChange={(value) => updateRule(index, 'resources', value)}
                        >
                          {commonResources.map((r) => (
                            <Option key={r} value={r}>
                              {r}
                            </Option>
                          ))}
                        </Select>
                      </Col>
                      <Col span={8}>
                        <Text strong>{t('customRoleEditor.verbsLabel')}</Text>
                        <Select
                          mode="multiple"
                          style={{ width: '100%', marginTop: 8 }}
                          placeholder={t('customRoleEditor.selectVerb')}
                          value={rule.verbs}
                          onChange={(value) => updateRule(index, 'verbs', value)}
                        >
                          {allVerbValues.map((v) => (
                            <Option key={v.value} value={v.value}>
                              {t(`customRoleEditor.${v.labelKey}`)}
                            </Option>
                          ))}
                        </Select>
                      </Col>
                    </Row>
                  </Card>
                ))}

                <Button
                  type="dashed"
                  block
                  icon={<PlusOutlined />}
                  onClick={addRule}
                >
                  {t('customRoleEditor.addRule')}
                </Button>
              </div>
            ),
          },
          {
            key: 'yaml',
            label: (
              <span>
                <CodeOutlined /> {t('customRoleEditor.yamlPreview')}
              </span>
            ),
            children: (
              <TextArea
                value={yamlContent}
                onChange={(e) => setYamlContent(e.target.value)}
                rows={20}
                style={{ fontFamily: 'monospace', fontSize: 12 }}
                placeholder={t('customRoleEditor.yamlPlaceholder')}
              />
            ),
          },
        ]}
      />
    </Modal>
  );
};

export default CustomRoleEditor;

