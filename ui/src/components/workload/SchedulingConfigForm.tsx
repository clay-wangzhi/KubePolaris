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
  Divider,
} from 'antd';
import { PlusOutlined, MinusCircleOutlined } from '@ant-design/icons';

const { Option } = Select;
const { Text } = Typography;
const { Panel } = Collapse;

// 节点亲和性表单项
const NodeAffinityForm: React.FC<{ namePrefix: string }> = ({ namePrefix }) => {
  return (
    <Card title="节点亲和 (Node Affinity)" size="small" style={{ marginBottom: 16 }}>
      {/* 必须满足 */}
      <Collapse ghost defaultActiveKey={[]}>
        <Panel header="必须满足 (RequiredDuringScheduling)" key="required">
          <Form.List name={[namePrefix, 'nodeAffinityRequired']}>
            {(fields, { add, remove }) => (
              <>
                {fields.map((field) => (
                  <Card key={field.key} size="small" style={{ marginBottom: 8 }}>
                    <Row gutter={16}>
                      <Col span={6}>
                        <Form.Item
                          name={[field.name, 'key']}
                          label="标签键"
                          rules={[{ required: true, message: '请输入标签键' }]}
                        >
                          <Input placeholder="kubernetes.io/hostname" />
                        </Form.Item>
                      </Col>
                      <Col span={6}>
                        <Form.Item
                          name={[field.name, 'operator']}
                          label="操作符"
                          rules={[{ required: true, message: '请选择操作符' }]}
                        >
                          <Select placeholder="选择操作符">
                            <Option value="In">In (包含)</Option>
                            <Option value="NotIn">NotIn (不包含)</Option>
                            <Option value="Exists">Exists (存在)</Option>
                            <Option value="DoesNotExist">DoesNotExist (不存在)</Option>
                            <Option value="Gt">Gt (大于)</Option>
                            <Option value="Lt">Lt (小于)</Option>
                          </Select>
                        </Form.Item>
                      </Col>
                      <Col span={10}>
                        <Form.Item name={[field.name, 'values']} label="值 (逗号分隔)">
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
                  添加条件
                </Button>
              </>
            )}
          </Form.List>
        </Panel>
        
        <Panel header="尽量满足 (PreferredDuringScheduling)" key="preferred">
          <Form.List name={[namePrefix, 'nodeAffinityPreferred']}>
            {(fields, { add, remove }) => (
              <>
                {fields.map((field) => (
                  <Card key={field.key} size="small" style={{ marginBottom: 8 }}>
                    <Row gutter={16}>
                      <Col span={4}>
                        <Form.Item
                          name={[field.name, 'weight']}
                          label="权重"
                          rules={[{ required: true, message: '请输入权重' }]}
                        >
                          <InputNumber min={1} max={100} style={{ width: '100%' }} />
                        </Form.Item>
                      </Col>
                      <Col span={6}>
                        <Form.Item
                          name={[field.name, 'key']}
                          label="标签键"
                          rules={[{ required: true, message: '请输入标签键' }]}
                        >
                          <Input placeholder="kubernetes.io/hostname" />
                        </Form.Item>
                      </Col>
                      <Col span={5}>
                        <Form.Item
                          name={[field.name, 'operator']}
                          label="操作符"
                          rules={[{ required: true, message: '请选择操作符' }]}
                        >
                          <Select placeholder="选择操作符">
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
                        <Form.Item name={[field.name, 'values']} label="值 (逗号分隔)">
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
                  添加条件
                </Button>
              </>
            )}
          </Form.List>
        </Panel>
      </Collapse>
    </Card>
  );
};

// Pod亲和性表单项
const PodAffinityForm: React.FC<{ 
  namePrefix: string;
  title: string;
  fieldPrefix: 'podAffinity' | 'podAntiAffinity';
}> = ({ namePrefix, title, fieldPrefix }) => {
  const requiredField = `${fieldPrefix}Required`;
  const preferredField = `${fieldPrefix}Preferred`;
  
  return (
    <Card title={title} size="small" style={{ marginBottom: 16 }}>
      <Collapse ghost defaultActiveKey={[]}>
        <Panel header="必须满足 (RequiredDuringScheduling)" key="required">
          <Form.List name={[namePrefix, requiredField]}>
            {(fields, { add, remove }) => (
              <>
                {fields.map((field) => (
                  <Card key={field.key} size="small" style={{ marginBottom: 8 }}>
                    <Row gutter={16}>
                      <Col span={6}>
                        <Form.Item
                          name={[field.name, 'topologyKey']}
                          label="拓扑域"
                          rules={[{ required: true, message: '请选择拓扑域' }]}
                        >
                          <Select placeholder="选择拓扑域">
                            <Option value="kubernetes.io/hostname">节点 (hostname)</Option>
                            <Option value="topology.kubernetes.io/zone">可用区 (zone)</Option>
                            <Option value="topology.kubernetes.io/region">区域 (region)</Option>
                          </Select>
                        </Form.Item>
                      </Col>
                      <Col span={5}>
                        <Form.Item
                          name={[field.name, 'labelKey']}
                          label="标签键"
                          rules={[{ required: true, message: '请输入标签键' }]}
                        >
                          <Input placeholder="app" />
                        </Form.Item>
                      </Col>
                      <Col span={5}>
                        <Form.Item
                          name={[field.name, 'operator']}
                          label="操作符"
                          rules={[{ required: true, message: '请选择操作符' }]}
                        >
                          <Select placeholder="操作符">
                            <Option value="In">In</Option>
                            <Option value="NotIn">NotIn</Option>
                            <Option value="Exists">Exists</Option>
                            <Option value="DoesNotExist">DoesNotExist</Option>
                          </Select>
                        </Form.Item>
                      </Col>
                      <Col span={6}>
                        <Form.Item name={[field.name, 'labelValues']} label="标签值 (逗号分隔)">
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
                  添加条件
                </Button>
              </>
            )}
          </Form.List>
        </Panel>
        
        <Panel header="尽量满足 (PreferredDuringScheduling)" key="preferred">
          <Form.List name={[namePrefix, preferredField]}>
            {(fields, { add, remove }) => (
              <>
                {fields.map((field) => (
                  <Card key={field.key} size="small" style={{ marginBottom: 8 }}>
                    <Row gutter={16}>
                      <Col span={3}>
                        <Form.Item
                          name={[field.name, 'weight']}
                          label="权重"
                          rules={[{ required: true, message: '权重' }]}
                        >
                          <InputNumber min={1} max={100} style={{ width: '100%' }} />
                        </Form.Item>
                      </Col>
                      <Col span={5}>
                        <Form.Item
                          name={[field.name, 'topologyKey']}
                          label="拓扑域"
                          rules={[{ required: true, message: '请选择' }]}
                        >
                          <Select placeholder="拓扑域">
                            <Option value="kubernetes.io/hostname">节点</Option>
                            <Option value="topology.kubernetes.io/zone">可用区</Option>
                            <Option value="topology.kubernetes.io/region">区域</Option>
                          </Select>
                        </Form.Item>
                      </Col>
                      <Col span={5}>
                        <Form.Item
                          name={[field.name, 'labelKey']}
                          label="标签键"
                          rules={[{ required: true, message: '标签键' }]}
                        >
                          <Input placeholder="app" />
                        </Form.Item>
                      </Col>
                      <Col span={4}>
                        <Form.Item
                          name={[field.name, 'operator']}
                          label="操作符"
                          rules={[{ required: true, message: '操作符' }]}
                        >
                          <Select placeholder="操作符">
                            <Option value="In">In</Option>
                            <Option value="NotIn">NotIn</Option>
                            <Option value="Exists">Exists</Option>
                            <Option value="DoesNotExist">DoesNotExist</Option>
                          </Select>
                        </Form.Item>
                      </Col>
                      <Col span={5}>
                        <Form.Item name={[field.name, 'labelValues']} label="标签值">
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
                  添加条件
                </Button>
              </>
            )}
          </Form.List>
        </Panel>
      </Collapse>
    </Card>
  );
};

// 主调度策略表单组件
const SchedulingConfigForm: React.FC = () => {
  return (
    <>
      <Collapse defaultActiveKey={[]} ghost>
        <Panel header="节点亲和 (Node Affinity)" key="nodeAffinity">
          <Text type="secondary" style={{ display: 'block', marginBottom: 16 }}>
            根据节点标签选择Pod调度的目标节点
          </Text>
          <NodeAffinityForm namePrefix="scheduling" />
        </Panel>
        
        <Panel header="负载亲和 (Pod Affinity)" key="podAffinity">
          <Text type="secondary" style={{ display: 'block', marginBottom: 16 }}>
            将Pod调度到与指定标签的Pod在同一拓扑域的节点上
          </Text>
          <PodAffinityForm 
            namePrefix="scheduling" 
            title="Pod亲和性" 
            fieldPrefix="podAffinity"
          />
          <PodAffinityForm 
            namePrefix="scheduling" 
            title="Pod反亲和性" 
            fieldPrefix="podAntiAffinity"
          />
        </Panel>
      </Collapse>
    </>
  );
};

export default SchedulingConfigForm;

