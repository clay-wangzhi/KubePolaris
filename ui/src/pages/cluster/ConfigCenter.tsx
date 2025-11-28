/** genAI_main_start */
import React from 'react';
import { useParams } from 'react-router-dom';
import { Card, Tabs } from 'antd';
import { SettingOutlined, BarChartOutlined } from '@ant-design/icons';
import MonitoringConfigForm from '../../components/MonitoringConfigForm';
import type { TabsProps } from 'antd';

const ConfigCenter: React.FC = () => {
  const { clusterId } = useParams<{ clusterId: string }>();

  const tabItems: TabsProps['items'] = [
    {
      key: 'monitoring',
      label: (
        <span>
          <BarChartOutlined />
          监控配置
        </span>
      ),
      children: (
        <MonitoringConfigForm 
          clusterId={clusterId || ''} 
          onConfigChange={() => {
            // 配置更新后的回调
          }}
        />
      ),
    },
  ];

  return (
    <div style={{ padding: '24px' }}>
      <Card bordered={false}>
        <Tabs
          defaultActiveKey="monitoring"
          items={tabItems}
        />
      </Card>
    </div>
  );
};

export default ConfigCenter;
/** genAI_main_end */

