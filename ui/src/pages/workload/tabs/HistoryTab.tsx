import React, { useState, useEffect } from 'react';
import { Table, Tag, Button, Space, message, Spin } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { WorkloadService } from '../../../services/workloadService';

interface ReplicaSetInfo {
  name: string;
  namespace: string;
  replicas: number;
  readyReplicas: number;
  availableReplicas: number;
  revision: string;
  images: string[];
  createdAt: string;
}

interface HistoryTabProps {
  clusterId: string;
  namespace: string;
  deploymentName?: string;
  rolloutName?: string;
  statefulSetName?: string;
  daemonSetName?: string;
  jobName?: string;
  cronJobName?: string;
}

const HistoryTab: React.FC<HistoryTabProps> = ({ 
  clusterId, 
  namespace, 
  deploymentName,
  rolloutName,
  statefulSetName,
  daemonSetName,
  jobName,
  cronJobName
}) => {
  const [loading, setLoading] = useState(false);
  const [replicaSets, setReplicaSets] = useState<ReplicaSetInfo[]>([]);

  // 获取工作负载名称和类型
  const workloadName = deploymentName || rolloutName || statefulSetName || daemonSetName || jobName || cronJobName;
  const workloadType = deploymentName ? 'Deployment' 
    : rolloutName ? 'Rollout'
    : statefulSetName ? 'StatefulSet'
    : daemonSetName ? 'DaemonSet'
    : jobName ? 'Job'
    : cronJobName ? 'CronJob'
    : '';

  // 加载ReplicaSet列表
  const loadReplicaSets = async () => {
    if (!clusterId || !namespace || !workloadName || !workloadType) return;
    
    setLoading(true);
    try {
      const response = await WorkloadService.getWorkloadReplicaSets(
        clusterId,
        namespace,
        workloadType,
        workloadName
      );
      
      if (response.code === 200 && response.data) {
        setReplicaSets(response.data.items || []);
      } else {
        message.error(response.message || '获取版本记录失败');
      }
    } catch (error) {
      console.error('获取版本记录失败:', error);
      message.error('获取版本记录失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadReplicaSets();
  }, [clusterId, namespace, workloadName, workloadType]);

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

  const columns: ColumnsType<ReplicaSetInfo> = [
    {
      title: 'ReplicaSet名称',
      dataIndex: 'name',
      key: 'name',
      width: 300,
    },
    {
      title: '版本号',
      dataIndex: 'revision',
      key: 'revision',
      width: 100,
      render: (revision: string) => <Tag color="blue">Revision {revision}</Tag>,
    },
    {
      title: '实例数',
      key: 'replicas',
      width: 120,
      render: (_, record: ReplicaSetInfo) => (
        <span>
          {record.readyReplicas}/{record.replicas}
        </span>
      ),
    },
    {
      title: '状态',
      key: 'status',
      width: 100,
      render: (_, record: ReplicaSetInfo) => {
        if (record.replicas === 0) {
          return <Tag color="default">历史版本</Tag>;
        }
        if (record.readyReplicas === record.replicas) {
          return <Tag color="success">当前版本</Tag>;
        }
        return <Tag color="processing">更新中</Tag>;
      },
    },
    {
      title: '镜像',
      dataIndex: 'images',
      key: 'images',
      width: 300,
      render: (images: string[]) => {
        if (!images || images.length === 0) return '-';
        return images.map((img, index) => {
          // 只显示 name:version 部分
          const parts = img.split('/');
          const nameVersion = parts[parts.length - 1];
          return <div key={index}>{nameVersion}</div>;
        });
      },
    },
    {
      title: '创建时间',
      dataIndex: 'createdAt',
      key: 'createdAt',
      width: 180,
      render: (time: string) => formatTime(time),
    },
  ];

  return (
    <Spin spinning={loading}>
      <div style={{ marginBottom: 16 }}>
        <Space>
          <Button onClick={loadReplicaSets}>刷新</Button>
        </Space>
      </div>
      <Table
        columns={columns}
        dataSource={replicaSets}
        rowKey="name"
        pagination={{
          total: replicaSets.length,
          pageSize: 10,
          showSizeChanger: true,
          showTotal: (total) => `总共 ${total} 条`,
        }}
      />
    </Spin>
  );
};

export default HistoryTab;

