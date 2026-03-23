import React, { useState, useEffect, useCallback } from 'react';
import { Table, Tag, Button, Space, message, Spin, Input } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { SearchOutlined } from '@ant-design/icons';
import { WorkloadService } from '../../../services/workloadService';
import { useTranslation } from 'react-i18next';

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
const { t } = useTranslation(['workload', 'common']);
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

  const loadEvents = useCallback(async () => {
    if (!clusterId || !namespace || !workloadName || !workloadType) return;

    setLoading(true);
    try {
      const response = await WorkloadService.getWorkloadEvents(
        clusterId,
        namespace,
        workloadType,
        workloadName
      );

      const eventList = ((response as unknown as { items?: unknown[] }).items || []) as EventInfo[];
      setEvents(eventList);
      setFilteredEvents(eventList);
    } catch (error) {
      console.error('获取事件列表失败:', error);
      message.error(t('messages.fetchEventsError'));
    } finally {
      setLoading(false);
    }
  }, [clusterId, namespace, workloadName, workloadType, t]);

  useEffect(() => {
    loadEvents();
  }, [loadEvents]);

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
      title: t('events.type'),
      dataIndex: 'type',
      key: 'type',
      width: 100,
      render: (type: string) => renderTypeTag(type),
    },
    {
      title: t('events.reason'),
      dataIndex: 'reason',
      key: 'reason',
      width: 150,
      render: (reason: string) => <Tag>{reason}</Tag>,
    },
    {
      title: t('events.object'),
      key: 'object',
      width: 200,
      render: (_, record: EventInfo) => (
        <div>
          <div>{record.involvedObject.kind}: {record.involvedObject.name}</div>
        </div>
      ),
    },
    {
      title: t('events.message'),
      dataIndex: 'message',
      key: 'message',
      width: 400,
      ellipsis: true,
    },
    {
      title: t('events.source'),
      key: 'source',
      width: 200,
      render: (_, record: EventInfo) => (
        <div>
          <div>{t('events.component')}: {record.source.component}</div>
          {record.source.host && <div>{t('events.host')}: {record.source.host}</div>}
        </div>
      ),
    },
    {
      title: t('events.count'),
      dataIndex: 'count',
      key: 'count',
      width: 80,
      render: (count: number) => count || 1,
    },
    {
      title: t('events.firstSeen'),
      dataIndex: 'firstTimestamp',
      key: 'firstTimestamp',
      width: 180,
      render: (time: string) => formatTime(time),
    },
    {
      title: t('events.lastSeen'),
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
          <Button onClick={loadEvents}>{t('events.refresh')}</Button>
        </Space>
        <Input
          placeholder={t("events.searchPlaceholder")}
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
          showTotal: (total) => t('events.total', { count: total }),
        }}
        scroll={{ x: 1600 }}
      />
    </Spin>
  );
};

export default EventsTab;

