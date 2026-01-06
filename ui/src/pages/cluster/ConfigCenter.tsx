import React from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { Card, Tabs } from 'antd';
import { BarChartOutlined, AlertOutlined, BranchesOutlined } from '@ant-design/icons';
import MonitoringConfigForm from '../../components/MonitoringConfigForm';
import AlertManagerConfigForm from '../../components/AlertManagerConfigForm';
import ArgoCDConfigForm from '../../components/ArgoCDConfigForm';
import type { TabsProps } from 'antd';

const ConfigCenter: React.FC = () => {
  const { clusterId } = useParams<{ clusterId: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get('tab') || 'monitoring';

  const handleTabChange = (key: string) => {
    setSearchParams({ tab: key });
  };

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
    {
      key: 'alertmanager',
      label: (
        <span>
          <AlertOutlined />
          告警配置
        </span>
      ),
      children: (
        <AlertManagerConfigForm 
          clusterId={clusterId || ''} 
          onConfigChange={() => {
            // 配置更新后的回调
          }}
        />
      ),
    },
    {
      key: 'argocd',
      label: (
        <span>
          <BranchesOutlined />
          ArgoCD 配置
        </span>
      ),
      children: (
        <ArgoCDConfigForm 
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
          activeKey={activeTab}
          onChange={handleTabChange}
          items={tabItems}
        />
      </Card>
    </div>
  );
};

export default ConfigCenter;

