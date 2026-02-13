import React from 'react';
import {
  Form,
  Input,
  InputNumber,
  Select,
  Button,
  Row,
  Col,
  Card,
  Collapse,
  Typography,
} from 'antd';
import { PlusOutlined, MinusCircleOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';

const { Option } = Select;
const { Text } = Typography;
const { Panel } = Collapse;

// Node Affinity form section
const NodeAffinityForm: React.FC<{ namePrefix: string }> = ({ namePrefix }) => {
  const { t } = useTranslation('components');
  return (
    <Card title={t('schedulingConfig.nodeAffinity')} size="small" style={{ marginBottom: 16 }}>
      <Collapse ghost defaultActiveKey={[]}>
        <Panel header={t('schedulingConfig.required')} key="required">
          <Form.List name={[namePrefix, 'nodeAffinityRequired']}>
            {(fields, { add, remove }) => (
              <>
                {fields.map((field) => (
                  <Card key={field.key} size="small" style={{ marginBottom: 8 }}>
                    <Row gutter={16}>
                      <Col span={6}>
                        <Form.Item
                          name={[field.name, 'key']}
                          label={t('schedulingConfig.labelKey')}
                          rules={[{ required: true, message: t('schedulingConfig.labelKeyRequired') }]}
                        >
                          <Input placeholder="kubernetes.io/hostname" />
                        </Form.Item>
                      </Col>
                      <Col span={6}>
                        <Form.Item
                          name={[field.name, 'operator']}
                          label={t('schedulingConfig.operator')}
                          rules={[{ required: true, message: t('schedulingConfig.operatorRequired') }]}
                        >
                          <Select placeholder={t('schedulingConfig.operatorPlaceholder')}>
                            <Option value="In">{t('schedulingConfig.opIn')}</Option>
                            <Option value="NotIn">{t('schedulingConfig.opNotIn')}</Option>
                            <Option value="Exists">{t('schedulingConfig.opExists')}</Option>
                            <Option value="DoesNotExist">{t('schedulingConfig.opDoesNotExist')}</Option>
                            <Option value="Gt">{t('schedulingConfig.opGt')}</Option>
                            <Option value="Lt">{t('schedulingConfig.opLt')}</Option>
                          </Select>
                        </Form.Item>
                      </Col>
                      <Col span={10}>
                        <Form.Item name={[field.name, 'values']} label={t('schedulingConfig.values')}>
                          <Input placeholder="node1, node2" />
                        </Form.Item>
                      </Col>
                      <Col span={2}>
                        <Form.Item label=" ">
                          <MinusCircleOutlined onClick={() => remove(field.name)} />
                        </Form.Item>
                      </Col>
                    </Row>
                  </Card>
                ))}
                <Button type="dashed" onClick={() => add()} icon={<PlusOutlined />} block>
                  {t('schedulingConfig.addCondition')}
                </Button>
              </>
            )}
          </Form.List>
        </Panel>
        
        <Panel header={t('schedulingConfig.preferred')} key="preferred">
          <Form.List name={[namePrefix, 'nodeAffinityPreferred']}>
            {(fields, { add, remove }) => (
              <>
                {fields.map((field) => (
                  <Card key={field.key} size="small" style={{ marginBottom: 8 }}>
                    <Row gutter={16}>
                      <Col span={4}>
                        <Form.Item
                          name={[field.name, 'weight']}
                          label={t('schedulingConfig.weight')}
                          rules={[{ required: true, message: t('schedulingConfig.weightRequired') }]}
                        >
                          <InputNumber min={1} max={100} style={{ width: '100%' }} />
                        </Form.Item>
                      </Col>
                      <Col span={6}>
                        <Form.Item
                          name={[field.name, 'key']}
                          label={t('schedulingConfig.labelKey')}
                          rules={[{ required: true, message: t('schedulingConfig.labelKeyRequired') }]}
                        >
                          <Input placeholder="kubernetes.io/hostname" />
                        </Form.Item>
                      </Col>
                      <Col span={5}>
                        <Form.Item
                          name={[field.name, 'operator']}
                          label={t('schedulingConfig.operator')}
                          rules={[{ required: true, message: t('schedulingConfig.operatorRequired') }]}
                        >
                          <Select placeholder={t('schedulingConfig.operatorPlaceholder')}>
                            <Option value="In">In</Option>
                            <Option value="NotIn">NotIn</Option>
                            <Option value="Exists">Exists</Option>
                            <Option value="DoesNotExist">DoesNotExist</Option>
                            <Option value="Gt">Gt</Option>
                            <Option value="Lt">Lt</Option>
                          </Select>
                        </Form.Item>
                      </Col>
                      <Col span={7}>
                        <Form.Item name={[field.name, 'values']} label={t('schedulingConfig.values')}>
                          <Input placeholder="node1, node2" />
                        </Form.Item>
                      </Col>
                      <Col span={2}>
                        <Form.Item label=" ">
                          <MinusCircleOutlined onClick={() => remove(field.name)} />
                        </Form.Item>
                      </Col>
                    </Row>
                  </Card>
                ))}
                <Button type="dashed" onClick={() => add()} icon={<PlusOutlined />} block>
                  {t('schedulingConfig.addCondition')}
                </Button>
              </>
            )}
          </Form.List>
        </Panel>
      </Collapse>
    </Card>
  );
};

// Pod Affinity form section
const PodAffinityForm: React.FC<{ 
  namePrefix: string;
  title: string;
  fieldPrefix: 'podAffinity' | 'podAntiAffinity';
}> = ({ namePrefix, title, fieldPrefix }) => {
  const { t } = useTranslation('components');
  const requiredField = `${fieldPrefix}Required`;
  const preferredField = `${fieldPrefix}Preferred`;
  
  return (
    <Card title={title} size="small" style={{ marginBottom: 16 }}>
      <Collapse ghost defaultActiveKey={[]}>
        <Panel header={t('schedulingConfig.required')} key="required">
          <Form.List name={[namePrefix, requiredField]}>
            {(fields, { add, remove }) => (
              <>
                {fields.map((field) => (
                  <Card key={field.key} size="small" style={{ marginBottom: 8 }}>
                    <Row gutter={16}>
                      <Col span={6}>
                        <Form.Item
                          name={[field.name, 'topologyKey']}
                          label={t('schedulingConfig.topologyKey')}
                          rules={[{ required: true, message: t('schedulingConfig.topologyRequired') }]}
                        >
                          <Select placeholder={t('schedulingConfig.topologyPlaceholder')}>
                            <Option value="kubernetes.io/hostname">{t('schedulingConfig.topologyHostname')}</Option>
                            <Option value="topology.kubernetes.io/zone">{t('schedulingConfig.topologyZone')}</Option>
                            <Option value="topology.kubernetes.io/region">{t('schedulingConfig.topologyRegion')}</Option>
                          </Select>
                        </Form.Item>
                      </Col>
                      <Col span={5}>
                        <Form.Item
                          name={[field.name, 'labelKey']}
                          label={t('schedulingConfig.labelKey')}
                          rules={[{ required: true, message: t('schedulingConfig.labelKeyRequired') }]}
                        >
                          <Input placeholder="app" />
                        </Form.Item>
                      </Col>
                      <Col span={5}>
                        <Form.Item
                          name={[field.name, 'operator']}
                          label={t('schedulingConfig.operator')}
                          rules={[{ required: true, message: t('schedulingConfig.operatorRequired') }]}
                        >
                          <Select placeholder={t('schedulingConfig.operatorPlaceholder')}>
                            <Option value="In">In</Option>
                            <Option value="NotIn">NotIn</Option>
                            <Option value="Exists">Exists</Option>
                            <Option value="DoesNotExist">DoesNotExist</Option>
                          </Select>
                        </Form.Item>
                      </Col>
                      <Col span={6}>
                        <Form.Item name={[field.name, 'labelValues']} label={t('schedulingConfig.labelValues')}>
                          <Input placeholder="web, api" />
                        </Form.Item>
                      </Col>
                      <Col span={2}>
                        <Form.Item label=" ">
                          <MinusCircleOutlined onClick={() => remove(field.name)} />
                        </Form.Item>
                      </Col>
                    </Row>
                  </Card>
                ))}
                <Button type="dashed" onClick={() => add()} icon={<PlusOutlined />} block>
                  {t('schedulingConfig.addCondition')}
                </Button>
              </>
            )}
          </Form.List>
        </Panel>
        
        <Panel header={t('schedulingConfig.preferred')} key="preferred">
          <Form.List name={[namePrefix, preferredField]}>
            {(fields, { add, remove }) => (
              <>
                {fields.map((field) => (
                  <Card key={field.key} size="small" style={{ marginBottom: 8 }}>
                    <Row gutter={16}>
                      <Col span={3}>
                        <Form.Item
                          name={[field.name, 'weight']}
                          label={t('schedulingConfig.weight')}
                          rules={[{ required: true, message: t('schedulingConfig.weightRequired') }]}
                        >
                          <InputNumber min={1} max={100} style={{ width: '100%' }} />
                        </Form.Item>
                      </Col>
                      <Col span={5}>
                        <Form.Item
                          name={[field.name, 'topologyKey']}
                          label={t('schedulingConfig.topologyKey')}
                          rules={[{ required: true, message: t('schedulingConfig.topologyRequired') }]}
                        >
                          <Select placeholder={t('schedulingConfig.topologyPlaceholder')}>
                            <Option value="kubernetes.io/hostname">{t('schedulingConfig.topologyHostname')}</Option>
                            <Option value="topology.kubernetes.io/zone">{t('schedulingConfig.topologyZone')}</Option>
                            <Option value="topology.kubernetes.io/region">{t('schedulingConfig.topologyRegion')}</Option>
                          </Select>
                        </Form.Item>
                      </Col>
                      <Col span={5}>
                        <Form.Item
                          name={[field.name, 'labelKey']}
                          label={t('schedulingConfig.labelKey')}
                          rules={[{ required: true, message: t('schedulingConfig.labelKeyRequired') }]}
                        >
                          <Input placeholder="app" />
                        </Form.Item>
                      </Col>
                      <Col span={4}>
                        <Form.Item
                          name={[field.name, 'operator']}
                          label={t('schedulingConfig.operator')}
                          rules={[{ required: true, message: t('schedulingConfig.operatorRequired') }]}
                        >
                          <Select placeholder={t('schedulingConfig.operatorPlaceholder')}>
                            <Option value="In">In</Option>
                            <Option value="NotIn">NotIn</Option>
                            <Option value="Exists">Exists</Option>
                            <Option value="DoesNotExist">DoesNotExist</Option>
                          </Select>
                        </Form.Item>
                      </Col>
                      <Col span={5}>
                        <Form.Item name={[field.name, 'labelValues']} label={t('schedulingConfig.labelValues')}>
                          <Input placeholder="web, api" />
                        </Form.Item>
                      </Col>
                      <Col span={2}>
                        <Form.Item label=" ">
                          <MinusCircleOutlined onClick={() => remove(field.name)} />
                        </Form.Item>
                      </Col>
                    </Row>
                  </Card>
                ))}
                <Button type="dashed" onClick={() => add()} icon={<PlusOutlined />} block>
                  {t('schedulingConfig.addCondition')}
                </Button>
              </>
            )}
          </Form.List>
        </Panel>
      </Collapse>
    </Card>
  );
};

// Main scheduling config form component
const SchedulingConfigForm: React.FC = () => {
  const { t } = useTranslation('components');
  return (
    <>
      <Collapse defaultActiveKey={[]} ghost>
        <Panel header={t('schedulingConfig.nodeAffinity')} key="nodeAffinity">
          <Text type="secondary" style={{ display: 'block', marginBottom: 16 }}>
            {t('schedulingConfig.nodeAffinityDesc')}
          </Text>
          <NodeAffinityForm namePrefix="scheduling" />
        </Panel>
        
        <Panel header={t('schedulingConfig.podAffinity')} key="podAffinity">
          <Text type="secondary" style={{ display: 'block', marginBottom: 16 }}>
            {t('schedulingConfig.podAffinityDesc')}
          </Text>
          <PodAffinityForm 
            namePrefix="scheduling" 
            title={t('schedulingConfig.podAffinityTitle')}
            fieldPrefix="podAffinity"
          />
          <PodAffinityForm 
            namePrefix="scheduling" 
            title={t('schedulingConfig.podAntiAffinityTitle')}
            fieldPrefix="podAntiAffinity"
          />
        </Panel>
      </Collapse>
    </>
  );
};

export default SchedulingConfigForm;
