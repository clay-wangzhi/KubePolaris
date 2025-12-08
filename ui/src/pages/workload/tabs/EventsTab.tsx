import React, { useState, useEffect } from 'react';
import { Table, Tag, Button, Space, message, Spin, Input } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { SearchOutlined } from '@ant-design/icons';
import { WorkloadService } from '../../../services/workloadService';

interface EventInfo {
  type: string;
  reason: string;
  message: string;
  source: {
    component: string;
    host: string;
  };
  count: number;
  firstTimestamp: string;
  lastTimestamp: string;
  involvedObject: {
    kind: string;
    name: string;
    namespace: string;
  };
}

interface EventsTabProps {
  clusterId: string;
  namespace: string;
  deploymentName?: string;
  rolloutName?: string;
  statefulSetName?: string;
  daemonSetName?: string;
  jobName?: string;
  cronJobName?: string;
}

const EventsTab: React.FC<EventsTabProps> = ({ 
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
  const [events, setEvents] = useState<EventInfo[]>([]);
  const [filteredEvents, setFilteredEvents] = useState<EventInfo[]>([]);
  const [searchText, setSearchText] = useState('');

  // 获取工作负载名称和类型
  const workloadName = deploymentName || rolloutName || statefulSetName || daemonSetName || jobName || cronJobName;
  const workloadType = deploymentName ? 'Deployment' 
    : rolloutName ? 'Rollout'
    : statefulSetName ? 'StatefulSet'
    : daemonSetName ? 'DaemonSet'
    : jobName ? 'Job'
    : cronJobName ? 'CronJob'
    : '';

  // 加载事件列表
  const loadEvents = async () => {
    if (!clusterId || !namespace || !workloadName || !workloadType) return;
    
    setLoading(true);
    try {
      const response = await WorkloadService.getWorkloadEvents(
        clusterId,
        namespace,
        workloadType,
        workloadName
      );
      
      if (response.code === 200 && response.data) {
        const eventList = response.data.items || [];
        setEvents(eventList);
        setFilteredEvents(eventList);
      } else {
        message.error(response.message || '获取事件列表失败');
      }
    } catch (error) {
      console.error('获取事件列表失败:', error);
      message.error('获取事件列表失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadEvents();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clusterId, namespace, workloadName, workloadType]);

  // 搜索事件
  const handleSearch = (value: string) => {
    setSearchText(value);
    if (!value.trim()) {
      setFilteredEvents(events);
      return;
    }

    const filtered = events.filter(event =>
      event.reason?.toLowerCase().includes(value.toLowerCase()) ||
      event.message?.toLowerCase().includes(value.toLowerCase()) ||
      event.type?.toLowerCase().includes(value.toLowerCase())
    );
    setFilteredEvents(filtered);
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

  // 渲染事件类型标签
  const renderTypeTag = (type: string) => {
    const colorMap: Record<string, string> = {
      'Normal': 'success',
      'Warning': 'warning',
      'Error': 'error',
    };
    return <Tag color={colorMap[type] || 'default'}>{type}</Tag>;
  };

  const columns: ColumnsType<EventInfo> = [
    {
      title: '类型',
      dataIndex: 'type',
      key: 'type',
      width: 100,
      render: (type: string) => renderTypeTag(type),
    },
    {
      title: '原因',
      dataIndex: 'reason',
      key: 'reason',
      width: 150,
      render: (reason: string) => <Tag>{reason}</Tag>,
    },
    {
      title: '对象',
      key: 'object',
      width: 200,
      render: (_, record: EventInfo) => (
        <div>
          <div>{record.involvedObject.kind}: {record.involvedObject.name}</div>
        </div>
      ),
    },
    {
      title: '消息',
      dataIndex: 'message',
      key: 'message',
      width: 400,
      ellipsis: true,
    },
    {
      title: '来源',
      key: 'source',
      width: 200,
      render: (_, record: EventInfo) => (
        <div>
          <div>组件: {record.source.component}</div>
          {record.source.host && <div>主机: {record.source.host}</div>}
        </div>
      ),
    },
    {
      title: '次数',
      dataIndex: 'count',
      key: 'count',
      width: 80,
      render: (count: number) => count || 1,
    },
    {
      title: '首次出现',
      dataIndex: 'firstTimestamp',
      key: 'firstTimestamp',
      width: 180,
      render: (time: string) => formatTime(time),
    },
    {
      title: '最后出现',
      dataIndex: 'lastTimestamp',
      key: 'lastTimestamp',
      width: 180,
      render: (time: string) => formatTime(time),
    },
  ];

  return (
    <Spin spinning={loading}>
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between' }}>
        <Space>
          <Button onClick={loadEvents}>刷新</Button>
        </Space>
        <Input
          placeholder="搜索事件（类型、原因、消息）"
          prefix={<SearchOutlined />}
          value={searchText}
          onChange={(e) => handleSearch(e.target.value)}
          style={{ width: 300 }}
          allowClear
        />
      </div>
      <Table
        columns={columns}
        dataSource={filteredEvents}
        rowKey={(record, index) => `${record.reason}-${record.firstTimestamp}-${index}`}
        pagination={{
          total: filteredEvents.length,
          pageSize: 10,
          showSizeChanger: true,
          showTotal: (total) => `总共 ${total} 条`,
        }}
        scroll={{ x: 1600 }}
      />
    </Spin>
  );
};

export default EventsTab;

