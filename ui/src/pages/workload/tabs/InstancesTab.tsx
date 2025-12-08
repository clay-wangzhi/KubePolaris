import React, { useState, useEffect } from 'react';
import { Table, Tag, Button, Space, message, Spin } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useNavigate } from 'react-router-dom';
import { WorkloadService } from '../../../services/workloadService';

interface PodInfo {
  name: string;
  namespace: string;
  status: string;
  phase: string;
  nodeName: string;
  nodeIP: string;
  podIP: string;
  restartCount: number;
  cpuRequest?: string;
  cpuLimit?: string;
  memoryRequest?: string;
  memoryLimit?: string;
  createdAt: string;
  age?: string;
}

interface InstancesTabProps {
  clusterId: string;
  namespace: string;
  deploymentName?: string;
  rolloutName?: string;
  statefulSetName?: string;
  daemonSetName?: string;
  jobName?: string;
  cronJobName?: string;
}

const InstancesTab: React.FC<InstancesTabProps> = ({ 
  clusterId, 
  namespace, 
  deploymentName,
  rolloutName,
  statefulSetName,
  daemonSetName,
  jobName,
  cronJobName
}) => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [pods, setPods] = useState<PodInfo[]>([]);

  // 获取工作负载名称和类型
  const workloadName = deploymentName || rolloutName || statefulSetName || daemonSetName || jobName || cronJobName;
  const workloadType = deploymentName ? 'Deployment' 
    : rolloutName ? 'Rollout'
    : statefulSetName ? 'StatefulSet'
    : daemonSetName ? 'DaemonSet'
    : jobName ? 'Job'
    : cronJobName ? 'CronJob'
    : '';

  // 加载Pod列表
  const loadPods = async () => {
    if (!clusterId || !namespace || !workloadName || !workloadType) return;
    
    setLoading(true);
    try {
      // 使用label selector查询工作负载对应的Pods
      const response = await WorkloadService.getWorkloadPods(
        clusterId,
        namespace,
        workloadType,
        workloadName
      );
      
      if (response.code === 200 && response.data) {
        setPods(response.data.items || []);
      } else {
        message.error(response.message || '获取Pod列表失败');
      }
    } catch (error) {
      console.error('获取Pod列表失败:', error);
      message.error('获取Pod列表失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPods();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clusterId, namespace, workloadName, workloadType]);

  // 渲染状态标签
  const renderStatusTag = (phase: string) => {
    const colorMap: Record<string, string> = {
      'Running': 'success',
      'Pending': 'processing',
      'Succeeded': 'success',
      'Failed': 'error',
      'Unknown': 'default',
    };
    return <Tag color={colorMap[phase] || 'default'}>{phase}</Tag>;
  };

  // 计算创建时长
  const calculateAge = (createdAt: string) => {
    if (!createdAt) return '-';
    const now = new Date().getTime();
    const created = new Date(createdAt).getTime();
    const diff = Math.floor((now - created) / 1000); // 秒
    
    if (diff < 60) return `${diff}秒`;
    if (diff < 3600) return `${Math.floor(diff / 60)}分钟`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}小时`;
    return `${Math.floor(diff / 86400)}天`;
  };

  // 格式化时间
  const formatTime = (timeStr: string) => {
    if (!timeStr) return '-';
    const date = new Date(timeStr);
    return date.toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    }).replace(/\//g, '-');
  };

  const columns: ColumnsType<PodInfo> = [
    {
      title: '实例名称',
      dataIndex: 'name',
      key: 'name',
      width: 280,
      fixed: 'left',
      render: (text: string, record: PodInfo) => (
        <Button
          type="link"
          onClick={() => navigate(`/clusters/${clusterId}/pods/${record.namespace}/${record.name}`)}
          style={{ 
            padding: 0, 
            height: 'auto',
            whiteSpace: 'normal',
            wordBreak: 'break-all',
            textAlign: 'left',
            lineHeight: '1.4'
          }}
        >
          {text}
        </Button>
      ),
    },
    {
      title: '状态',
      dataIndex: 'phase',
      key: 'phase',
      width: 100,
      render: (phase: string) => renderStatusTag(phase),
    },
    {
      title: '命名空间',
      dataIndex: 'namespace',
      key: 'namespace',
      width: 150,
    },
    {
      title: '节点IP',
      dataIndex: 'nodeIP',
      key: 'nodeIP',
      width: 150,
    },
    {
      title: '所在节点',
      dataIndex: 'nodeName',
      key: 'nodeName',
      width: 200,
    },
    {
      title: '重启次数',
      dataIndex: 'restartCount',
      key: 'restartCount',
      width: 100,
      render: (count: number) => count || 0,
    },
    {
      title: 'CPU申请/限制',
      key: 'cpu',
      width: 150,
      render: (_, record: PodInfo) => (
        <div style={{ lineHeight: '20px' }}>
          <div>{record.cpuRequest || '-'}</div>
          <div style={{ color: '#999' }}>{record.cpuLimit || '-'}</div>
        </div>
      ),
    },
    {
      title: '内存申请/限制',
      key: 'memory',
      width: 150,
      render: (_, record: PodInfo) => (
        <div style={{ lineHeight: '20px' }}>
          <div>{record.memoryRequest || '-'}</div>
          <div style={{ color: '#999' }}>{record.memoryLimit || '-'}</div>
        </div>
      ),
    },
    {
      title: '创建时间',
      dataIndex: 'createdAt',
      key: 'createdAt',
      width: 180,
      render: (time: string) => formatTime(time),
    },
    {
      title: '创建时长',
      dataIndex: 'createdAt',
      key: 'age',
      width: 100,
      render: (time: string) => calculateAge(time),
    },
    {
      title: '操作',
      key: 'action',
      width: 180,
      fixed: 'right',
      render: (_, record: PodInfo) => (
        <Space size="small">
          <Button
            type="link"
            size="small"
            style={{ padding: 0 }}
            onClick={() => navigate(`/clusters/${clusterId}/pods/${record.namespace}/${record.name}`)}
          >
            监控
          </Button>
          <Button
            type="link"
            size="small"
            style={{ padding: 0 }}
            onClick={() => navigate(`/clusters/${clusterId}/pods/${record.namespace}/${record.name}/logs`)}
          >
            日志
          </Button>
          <Button
            type="link"
            size="small"
            style={{ padding: 0 }}
            onClick={() => navigate(`/clusters/${clusterId}/pods/${record.namespace}/${record.name}/terminal`)}
          >
            终端
          </Button>
        </Space>
      ),
    },
  ];

  return (
    <Spin spinning={loading}>
      <div style={{ marginBottom: 16 }}>
        <Space>
          <Button onClick={loadPods}>刷新</Button>
        </Space>
      </div>
      <Table
        columns={columns}
        dataSource={pods}
        rowKey="name"
        pagination={{
          total: pods.length,
          pageSize: 10,
          showSizeChanger: true,
          showQuickJumper: true,
          showTotal: (total) => `总共 ${total} 条`,
        }}
        scroll={{ x: 1800 }}
      />
    </Spin>
  );
};

export default InstancesTab;

