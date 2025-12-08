import React, { useState } from 'react';
import { Card, Tabs } from 'antd';
import ConfigMapList from './ConfigMapList';
import SecretList from './SecretList';
import type { TabsProps } from 'antd';

const ConfigSecretManagement: React.FC = () => {
  const [activeKey, setActiveKey] = useState<string>('configmap');

  const items: TabsProps['items'] = [
    {
      key: 'configmap',
      label: '配置项（ConfigMap）',
      children: <ConfigMapList />,
    },
    {
      key: 'secret',
      label: '密钥（Secret）',
      children: <SecretList />,
    },
  ];

  return (
    <div style={{ padding: '24px' }}>
      <Card bordered={false}>
        <Tabs
          activeKey={activeKey}
          onChange={setActiveKey}
          items={items}
        />
      </Card>
    </div>
  );
};

export default ConfigSecretManagement;

