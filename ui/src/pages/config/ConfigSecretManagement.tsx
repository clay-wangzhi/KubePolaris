/** genAI_main_start */
import React, { useState } from 'react';
import { Card, Tabs } from 'antd';
import { FileTextOutlined, LockOutlined } from '@ant-design/icons';
import ConfigMapList from './ConfigMapList';
import SecretList from './SecretList';
import type { TabsProps } from 'antd';

const ConfigSecretManagement: React.FC = () => {
  const [activeKey, setActiveKey] = useState<string>('configmap');

  const items: TabsProps['items'] = [
    {
      key: 'configmap',
      label: (
        <span>
          <FileTextOutlined />
          配置项
        </span>
      ),
      children: <ConfigMapList />,
    },
    {
      key: 'secret',
      label: (
        <span>
          <LockOutlined />
          密钥
        </span>
      ),
      children: <SecretList />,
    },
  ];

  return (
    <div style={{ padding: '24px' }}>
      <Card
        title="配置与密钥管理"
        bordered={false}
        style={{ minHeight: 'calc(100vh - 150px)' }}
      >
        <Tabs
          activeKey={activeKey}
          onChange={setActiveKey}
          items={items}
          size="large"
          type="card"
        />
      </Card>
    </div>
  );
};

export default ConfigSecretManagement;
/** genAI_main_end */

