import React, { useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import {
  Card,
  Tabs,
  Spin,
} from 'antd';
import DeploymentTab from './DeploymentTab';
import ArgoRolloutTab from './ArgoRolloutTab';
import StatefulSetTab from './StatefulSetTab';
import DaemonSetTab from './DaemonSetTab';
import JobTab from './JobTab';
import CronJobTab from './CronJobTab';

const WorkloadList: React.FC = () => {
  const { clusterId } = useParams<{ clusterId: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const loading = false;
  
  // 从URL读取当前Tab
  const activeTab = searchParams.get('tab') || 'deployment';

  // 统计信息状态（保留用于回调，但不显示）
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [_deploymentCount, setDeploymentCount] = useState(0);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [_rolloutCount, setRolloutCount] = useState(0);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [_statefulSetCount, setStatefulSetCount] = useState(0);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [_daemonSetCount, setDaemonSetCount] = useState(0);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [_jobCount, setJobCount] = useState(0);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [_cronJobCount, setCronJobCount] = useState(0);

  // Tab切换处理
  const handleTabChange = (key: string) => {
    setSearchParams({ tab: key });
  };

  // Tab项配置
  const tabItems = [
    {
      key: 'deployment',
      label: '无状态负载（Deployment）',
      children: (
        <DeploymentTab
          clusterId={clusterId || ''}
          onCountChange={setDeploymentCount}
        />
      ),
    },
    {
      key: 'rollout',
      label: '无状态负载（Argo Rollout）',
      children: (
        <ArgoRolloutTab
          clusterId={clusterId || ''}
          onCountChange={setRolloutCount}
        />
      ),
    },
    {
      key: 'statefulset',
      label: '有状态负载（StatefulSet）',
      children: (
        <StatefulSetTab
          clusterId={clusterId || ''}
          onCountChange={setStatefulSetCount}
        />
      ),
    },
    {
      key: 'daemonset',
      label: '守护进程集（DaemonSet）',
      children: (
        <DaemonSetTab
          clusterId={clusterId || ''}
          onCountChange={setDaemonSetCount}
        />
      ),
    },
    {
      key: 'job',
      label: '普通任务（Job）',
      children: (
        <JobTab
          clusterId={clusterId || ''}
          onCountChange={setJobCount}
        />
      ),
    },
    {
      key: 'cronjob',
      label: '定时任务（CronJob）',
      children: (
        <CronJobTab
          clusterId={clusterId || ''}
          onCountChange={setCronJobCount}
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

export default WorkloadList;
