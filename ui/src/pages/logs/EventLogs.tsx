import React, { useState, useEffect, useCallback } from 'react';
import {
  Card,
  Table,
  Space,
  Tag,
  Select,
  Button,
  Input,
  Typography,
  Tooltip,
  Row,
  Col,
  Statistic,
  Badge,
  Drawer,
  Descriptions,
  message,
} from 'antd';
import {
  SearchOutlined,
  ReloadOutlined,
  WarningOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  InfoCircleOutlined,
  ExclamationCircleOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import { useParams } from 'react-router-dom';
import { logService } from '../../services/logService';
import type { EventLogEntry } from '../../services/logService';
import { useTranslation } from 'react-i18next';

const { Text, Paragraph } = Typography;

// 事件类型颜色
const eventTypeColors: Record<string, string> = {
  Normal: 'green',
  Warning: 'orange',
};

// 常见原因分类
const reasonCategories: Record<string, { color: string; icon: React.ReactNode }> = {
  Scheduled: { color: 'green', icon: <CheckCircleOutlined /> },
  Pulled: { color: 'blue', icon: <CheckCircleOutlined /> },
  Created: { color: 'cyan', icon: <CheckCircleOutlined /> },
  Started: { color: 'green', icon: <CheckCircleOutlined /> },
  Killing: { color: 'orange', icon: <ExclamationCircleOutlined /> },
  BackOff: { color: 'red', icon: <WarningOutlined /> },
  Failed: { color: 'red', icon: <WarningOutlined /> },
  FailedScheduling: { color: 'red', icon: <WarningOutlined /> },
  Unhealthy: { color: 'red', icon: <WarningOutlined /> },
  SuccessfulCreate: { color: 'green', icon: <CheckCircleOutlined /> },
  ScalingReplicaSet: { color: 'blue', icon: <InfoCircleOutlined /> },
};

const EventLogs: React.FC = () => {
  const { clusterId } = useParams<{ clusterId: string }>();
  
const { t } = useTranslation(['logs', 'common']);
const [events, setEvents] = useState<EventLogEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [namespaces, setNamespaces] = useState<string[]>([]);
  
  // 筛选状态
  const [namespace, setNamespace] = useState<string>('');
  const [eventType, setEventType] = useState<'Normal' | 'Warning' | undefined>();
  const [resourceKind, setResourceKind] = useState<string>('');
  const [keyword, setKeyword] = useState<string>('');
  
  // 详情抽屉
  const [drawerVisible, setDrawerVisible] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<EventLogEntry | null>(null);

  // 统计
  const [stats, setStats] = useState({
    total: 0,
    normal: 0,
    warning: 0,
  });

  // 获取命名空间列表
  const fetchNamespaces = useCallback(async () => {
    if (!clusterId) return;
    try {
      const res = await logService.getNamespaces(clusterId);
      setNamespaces(res || []);
    } catch (error) {
      console.error('获取命名空间失败', error);
    }
  }, [clusterId]);

  // 获取事件日志
  const fetchEvents = useCallback(async () => {
    if (!clusterId) return;
    setLoading(true);
    try {
      const res = await logService.getEventLogs(clusterId, {
        namespace: namespace || undefined,
        type: eventType,
        limit: 500,
      });
      {
        let items = res?.items || [];
        
        // 客户端过滤
        if (resourceKind) {
          items = items.filter(e => e.involved_kind === resourceKind);
        }
        if (keyword) {
          const kw = keyword.toLowerCase();
          items = items.filter(e => 
            e.message.toLowerCase().includes(kw) ||
            e.involved_name.toLowerCase().includes(kw) ||
            e.reason.toLowerCase().includes(kw)
          );
        }
        
        setEvents(items);
        
        // 统计
        const normal = items.filter(e => e.type === 'Normal').length;
        const warning = items.filter(e => e.type === 'Warning').length;
        setStats({
          total: items.length,
          normal,
          warning,
        });
      }
    } catch (error) {
      console.error('获取事件日志失败', error);
      message.error(t('logs:events.fetchFailed'));
    } finally {
      setLoading(false);
    }
  }, [clusterId, namespace, eventType, resourceKind, keyword]);

  useEffect(() => {
    fetchNamespaces();
  }, [fetchNamespaces]);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  // 查看详情
  const viewDetail = (record: EventLogEntry) => {
    setSelectedEvent(record);
    setDrawerVisible(true);
  };

  // 获取资源类型列表
  const resourceKinds = [...new Set(events.map(e => e.involved_kind))].sort();

  // 表格列定义
  const columns: ColumnsType<EventLogEntry> = [
    {
      title: t('logs:events.time'),
      dataIndex: 'last_timestamp',
      width: 170,
      sorter: (a, b) => new Date(a.last_timestamp).getTime() - new Date(b.last_timestamp).getTime(),
      defaultSortOrder: 'descend',
      render: (time: string) => (
        <Space>
          <ClockCircleOutlined style={{ color: '#8c8c8c' }} />
          <span>{dayjs(time).format('MM-DD HH:mm:ss')}</span>
        </Space>
      ),
    },
    {
      title: t('common:table.type'),
      dataIndex: 'type',
      width: 90,
      filters: [
        { text: 'Normal', value: 'Normal' },
        { text: 'Warning', value: 'Warning' },
      ],
      onFilter: (value, record) => record.type === value,
      render: (type: string) => (
        <Tag color={eventTypeColors[type] || 'default'}>
          {type === 'Warning' ? <WarningOutlined /> : <CheckCircleOutlined />}
          {' '}{type}
        </Tag>
      ),
    },
    {
      title: t('logs:events.reason'),
      dataIndex: 'reason',
      width: 140,
      render: (reason: string) => {
        const category = reasonCategories[reason];
        return (
          <Tag color={category?.color || 'default'}>
            {category?.icon}
            {' '}{reason}
          </Tag>
        );
      },
    },
    {
      title: t('logs:events.resource'),
      key: 'resource',
      width: 220,
      render: (_, record) => (
        <Space>
          <Tag color="cyan">{record.involved_kind}</Tag>
          <Tooltip title={`${record.namespace}/${record.involved_name}`}>
            <Text ellipsis style={{ maxWidth: 120 }}>
              {record.involved_name}
            </Text>
          </Tooltip>
        </Space>
      ),
    },
    {
      title: t('common:table.namespace'),
      dataIndex: 'namespace',
      width: 120,
      render: (ns: string) => <Tag>{ns}</Tag>,
    },
    {
      title: t('logs:events.message'),
      dataIndex: 'message',
      ellipsis: true,
      render: (message: string, record) => (
        <Tooltip title={message}>
          <Text 
            ellipsis 
            style={{ 
              maxWidth: 400,
              color: record.type === 'Warning' ? '#fa8c16' : undefined,
            }}
          >
            {message}
          </Text>
        </Tooltip>
      ),
    },
    {
      title: t('logs:events.count'),
      dataIndex: 'count',
      width: 70,
      align: 'center',
      sorter: (a, b) => a.count - b.count,
      render: (count: number) => (
        <Badge 
          count={count} 
          style={{ 
            backgroundColor: count > 10 ? '#ff4d4f' : count > 5 ? '#faad14' : '#52c41a' 
          }} 
        />
      ),
    },
    {
      title: t('common:table.actions'),
      key: 'action',
      width: 80,
      fixed: 'right',
      render: (_, record) => (
        <Button
          type="link"
          size="small"
          icon={<InfoCircleOutlined />}
          onClick={() => viewDetail(record)}
        >
          {t('logs:events.detail')}
        </Button>
      ),
    },
  ];

  return (
    <div style={{ padding: 24, background: '#f0f2f5', minHeight: '100vh' }}>
      {/* 统计卡片 */}
      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={6}>
          <Card size="small" bordered={false}>
            <Statistic
              title={t('logs:events.totalEvents')}
              value={stats.total}
              prefix={<InfoCircleOutlined style={{ color: '#1890ff' }} />}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card size="small" bordered={false}>
            <Statistic
              title={t('logs:events.normalEvents')}
              value={stats.normal}
              valueStyle={{ color: '#52c41a' }}
              prefix={<CheckCircleOutlined />}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card size="small" bordered={false}>
            <Statistic
              title={t('logs:events.warningEvents')}
              value={stats.warning}
              valueStyle={{ color: '#faad14' }}
              prefix={<WarningOutlined />}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card size="small" bordered={false}>
            <Statistic
              title={t('logs:events.warningRatio')}
              value={stats.total > 0 ? ((stats.warning / stats.total) * 100).toFixed(1) : 0}
              suffix="%"
              valueStyle={{ color: stats.warning / stats.total > 0.3 ? '#ff4d4f' : '#52c41a' }}
            />
          </Card>
        </Col>
      </Row>

      {/* 主卡片 */}
      <Card
        title={
          <Space>
            <WarningOutlined />
            <span>{t('logs:events.title')}</span>
          </Space>
        }
        extra={
          <Button icon={<ReloadOutlined />} onClick={fetchEvents} loading={loading}>
            {t('common:actions.refresh')}
          </Button>
        }
        bordered={false}
      >
        {/* 筛选区域 */}
        <Space wrap style={{ marginBottom: 16 }}>
          <Select
            placeholder={t('logs:events.namespace')}
            allowClear
            style={{ width: 180 }}
            value={namespace || undefined}
            onChange={(v) => setNamespace(v || '')}
            showSearch
            options={namespaces.map((ns) => ({ label: ns, value: ns }))}
          />
          <Select
            placeholder={t('logs:events.eventType')}
            allowClear
            style={{ width: 120 }}
            value={eventType}
            onChange={setEventType}
            options={[
              { label: 'Normal', value: 'Normal' },
              { label: 'Warning', value: 'Warning' },
            ]}
          />
          <Select
            placeholder={t('logs:events.resourceKind')}
            allowClear
            style={{ width: 140 }}
            value={resourceKind || undefined}
            onChange={(v) => setResourceKind(v || '')}
            showSearch
            options={resourceKinds.map((kind) => ({ label: kind, value: kind }))}
          />
          <Input.Search
            placeholder={t('logs:events.searchPlaceholder')}
            style={{ width: 250 }}
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            onSearch={fetchEvents}
            enterButton={<SearchOutlined />}
          />
        </Space>

        {/* 表格 */}
        <Table
          columns={columns}
          dataSource={events}
          rowKey="id"
          loading={loading}
          scroll={{ x: 1300 }}
          pagination={{
            pageSize: 20,
            showSizeChanger: true,
            showQuickJumper: true,
            showTotal: (total) => t('logs:events.totalCountEvents', { total }),
          }}
          rowClassName={(record) => 
            record.type === 'Warning' ? 'warning-row' : ''
          }
        />
      </Card>

      {/* 详情抽屉 */}
      <Drawer
        title={
          <Space>
            <InfoCircleOutlined />
            <span>{t('logs:events.eventDetail')}</span>
          </Space>
        }
        placement="right"
        width={600}
        open={drawerVisible}
        onClose={() => setDrawerVisible(false)}
      >
        {selectedEvent && (
          <>
            {/* 基本信息 */}
            <Descriptions
              title={t('logs:events.basicInfo')}
              bordered
              size="small"
              column={2}
              style={{ marginBottom: 24 }}
            >
              <Descriptions.Item label={t('logs:events.type')}>
                <Tag color={eventTypeColors[selectedEvent.type]}>
                  {selectedEvent.type}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label={t('logs:events.reason')}>
                <Tag color={reasonCategories[selectedEvent.reason]?.color || 'default'}>
                  {selectedEvent.reason}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label={t('logs:events.occurrences')} span={2}>
                <Badge 
                  count={selectedEvent.count} 
                  style={{ backgroundColor: '#1890ff' }}
                  showZero
                />
              </Descriptions.Item>
              <Descriptions.Item label={t('logs:events.firstOccurrence')}>
                {dayjs(selectedEvent.first_timestamp).format('YYYY-MM-DD HH:mm:ss')}
              </Descriptions.Item>
              <Descriptions.Item label={t('logs:events.lastOccurrence')}>
                {dayjs(selectedEvent.last_timestamp).format('YYYY-MM-DD HH:mm:ss')}
              </Descriptions.Item>
            </Descriptions>

            {/* 关联资源 */}
            <Descriptions
              title={t('logs:events.relatedResource')}
              bordered
              size="small"
              column={1}
              style={{ marginBottom: 24 }}
            >
              <Descriptions.Item label={t('logs:events.namespace')}>
                <Tag>{selectedEvent.namespace}</Tag>
              </Descriptions.Item>
              <Descriptions.Item label={t('logs:events.resourceType')}>
                <Tag color="cyan">{selectedEvent.involved_kind}</Tag>
              </Descriptions.Item>
              <Descriptions.Item label={t('logs:events.resourceName')}>
                <Text copyable>{selectedEvent.involved_name}</Text>
              </Descriptions.Item>
            </Descriptions>

            {/* 事件来源 */}
            <Descriptions
              title={t('logs:events.eventSource')}
              bordered
              size="small"
              column={1}
              style={{ marginBottom: 24 }}
            >
              <Descriptions.Item label={t('logs:events.component')}>
                {selectedEvent.source_component || '-'}
              </Descriptions.Item>
              <Descriptions.Item label={t('logs:events.host')}>
                {selectedEvent.source_host || '-'}
              </Descriptions.Item>
            </Descriptions>

            {/* 事件消息 */}
            <Card title={t('logs:events.eventMessage')} size="small">
              <Paragraph
                style={{
                  background: '#fafafa',
                  padding: 12,
                  borderRadius: 4,
                  fontFamily: 'monospace',
                  margin: 0,
                }}
              >
                {selectedEvent.message}
              </Paragraph>
            </Card>
          </>
        )}
      </Drawer>

      <style>{`
        .warning-row {
          background-color: #fffbe6;
        }
        .warning-row:hover > td {
          background-color: #fff7cc !important;
        }
      `}</style>
    </div>
  );
};

export default EventLogs;

