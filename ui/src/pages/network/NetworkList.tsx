import React, { useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import {
  Card,
  Tabs,
  Space,
  Typography,
  Spin,
} from 'antd';
import ServiceTab from './ServiceTab';
import IngressTab from './IngressTab';

const { Title } = Typography;

const NetworkList: React.FC = () => {
  const { clusterId } = useParams<{ clusterId: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const loading = false;
  
  // 从URL读取当前Tab
  const activeTab = searchParams.get('tab') || 'service';

  // 统计信息状态（保留用于回调，但不显示）
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [_serviceCount, setServiceCount] = useState(0);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [_ingressCount, setIngressCount] = useState(0);

  // Tab切换处理
  const handleTabChange = (key: string) => {
    setSearchParams({ tab: key });
  };

  // Tab项配置
  const tabItems = [
    {
      key: 'service',
      label: '服务（Service）',
      children: (
        <ServiceTab
          clusterId={clusterId || ''}
          onCountChange={setServiceCount}
        />
      ),
    },
    {
      key: 'ingress',
      label: '路由（Ingress）',
      children: (
        <IngressTab
          clusterId={clusterId || ''}
          onCountChange={setIngressCount}
        />
      ),
    },
  ];

  return (
    <div style={{ padding: '24px' }}>
      <Card bordered={false}>

        <Spin spinning={loading}>
          <Tabs
            activeKey={activeTab}
            onChange={handleTabChange}
            items={tabItems}
          />
        </Spin>
      </Card>
    </div>
  );
};

export default NetworkList;

