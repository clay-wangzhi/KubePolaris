import React, { useState, useEffect, useCallback } from 'react';
import {
  Card,
  Table,
  Space,
  Tag,
  Input,
  Select,
  DatePicker,
  Button,
  Drawer,
  Timeline,
  Statistic,
  Row,
  Col,
  App,
  Typography,
  Tooltip,
  Empty,
  Spin,
  Descriptions,
  Badge,
} from 'antd';
import {
  ReloadOutlined,
  SearchOutlined,
  HistoryOutlined,
  UserOutlined,
  ClusterOutlined,
  CodeOutlined,
  DesktopOutlined,
  CloudServerOutlined,
  ClockCircleOutlined,
  ExportOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import { auditService } from '../../services/auditService';
import { useTranslation } from 'react-i18next';
import type {
  TerminalSessionItem,
  SessionDetailResponse,
  TerminalCommand,
  SessionStats,
  SessionListParams,
} from '../../services/auditService';

const { RangePicker } = DatePicker;
const { Text, Paragraph } = Typography;

// 终端类型配置
const terminalTypeConfig: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  kubectl: { label: 'Kubectl', color: 'blue', icon: <CodeOutlined /> },
  pod: { label: 'Pod', color: 'green', icon: <CloudServerOutlined /> },
  node: { label: 'Node SSH', color: 'orange', icon: <DesktopOutlined /> },
};

// 状态配置
const statusConfig: Record<string, { label: string; status: 'processing' | 'success' | 'error' | 'default' }> = {
  active: { label: 'active', status: 'processing' },
  closed: { label: 'closed', status: 'success' },
  error: { label: 'error', status: 'error' },
};

const CommandHistory: React.FC = () => {
  const { message } = App.useApp();

  // 数据状态
const { t } = useTranslation(['audit', 'common']);
const [sessions, setSessions] = useState<TerminalSessionItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [stats, setStats] = useState<SessionStats | null>(null);

  // 分页状态
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  // 筛选状态
  const [targetType, setTargetType] = useState<string>('');
  const [status, setStatus] = useState<string>('');
  const [keyword, setKeyword] = useState('');
  const [dateRange, setDateRange] = useState<[dayjs.Dayjs, dayjs.Dayjs] | null>(null);

  // 详情抽屉
  const [drawerVisible, setDrawerVisible] = useState(false);
  const [selectedSession, setSelectedSession] = useState<SessionDetailResponse | null>(null);
  const [commands, setCommands] = useState<TerminalCommand[]>([]);
  const [commandsLoading, setCommandsLoading] = useState(false);
  const [commandsTotal, setCommandsTotal] = useState(0);

  // 获取统计数据
  const fetchStats = useCallback(async () => {
    try {
      const res = await auditService.getTerminalStats();
      setStats(res);
    } catch (error) {
      console.error('获取统计信息失败', error);
    }
  }, []);

  // 获取会话列表
  const fetchSessions = useCallback(async () => {
    setLoading(true);
    try {
      const params: SessionListParams = {
        page: currentPage,
        pageSize,
      };
      if (targetType) params.targetType = targetType as 'kubectl' | 'pod' | 'node';
      if (status) params.status = status as 'active' | 'closed' | 'error';
      if (keyword) params.keyword = keyword;
      if (dateRange) {
        params.startTime = dateRange[0].startOf('day').toISOString();
        params.endTime = dateRange[1].endOf('day').toISOString();
      }

      const res = await auditService.getTerminalSessions(params);
      setSessions(res.items || []);
      setTotal(res.total);
    } catch {
      message.error(t('audit:commands.fetchFailed'));
    } finally {
      setLoading(false);
    }
  }, [currentPage, pageSize, targetType, status, keyword, dateRange, message]);

  // 获取会话详情和命令
  const fetchSessionDetail = useCallback(async (sessionId: number) => {
    setCommandsLoading(true);
    try {
      const [sessionRes, commandsRes] = await Promise.all([
        auditService.getTerminalSession(sessionId),
        auditService.getTerminalCommands(sessionId, { pageSize: 500 }),
      ]);

      setSelectedSession(sessionRes);
      setCommands(commandsRes.items || []);
      setCommandsTotal(commandsRes.total);
    } catch {
      message.error(t('commands.fetchDetailFailed'));
    } finally {
      setCommandsLoading(false);
    }
  }, [message]);

  useEffect(() => {
    fetchStats();
    fetchSessions();
  }, [fetchStats, fetchSessions]);

  // 打开命令详情
  const handleViewCommands = (record: TerminalSessionItem) => {
    setDrawerVisible(true);
    fetchSessionDetail(record.id);
  };

  // 关闭抽屉
  const handleCloseDrawer = () => {
    setDrawerVisible(false);
    setSelectedSession(null);
    setCommands([]);
  };

  // 刷新数据
  const handleRefresh = () => {
    fetchStats();
    fetchSessions();
  };

  // 搜索
  const handleSearch = () => {
    setCurrentPage(1);
    fetchSessions();
  };

  // 获取目标显示
  const getTargetDisplay = (record: TerminalSessionItem) => {
    if (record.target_type === 'pod') {
      return `${record.namespace}/${record.pod}${record.container ? ` (${record.container})` : ''}`;
    }
    if (record.target_type === 'node') {
      return record.node || '-';
    }
    return record.namespace || 'default';
  };

  // 表格列定义
  const columns: ColumnsType<TerminalSessionItem> = [
    {
      title: t('audit:commands.user'),
      key: 'user',
      width: 140,
      render: (_, record) => (
        <Space>
          <UserOutlined style={{ color: '#1890ff' }} />
          <span>{record.display_name || record.username}</span>
        </Space>
      ),
    },
    {
      title: '集群',
      key: 'cluster',
      width: 140,
      render: (_, record) => (
        <Space>
          <ClusterOutlined style={{ color: '#52c41a' }} />
          <span>{record.cluster_name || '-'}</span>
        </Space>
      ),
    },
    {
      title: t('audit:commands.terminalType'),
      dataIndex: 'target_type',
      width: 120,
      render: (type: string) => {
        const config = terminalTypeConfig[type] || { label: type, color: 'default', icon: null };
        return (
          <Tag color={config.color} icon={config.icon}>
            {config.label}
          </Tag>
        );
      },
    },
    {
      title: t('audit:commands.target'),
      key: 'target',
      width: 200,
      ellipsis: true,
      render: (_, record) => (
        <Tooltip title={getTargetDisplay(record)}>
          <Text ellipsis style={{ maxWidth: 180 }}>
            {getTargetDisplay(record)}
          </Text>
        </Tooltip>
      ),
    },
    {
      title: t('audit:commands.startTime'),
      dataIndex: 'start_at',
      width: 170,
      render: (time: string) => (
        <Space>
          <ClockCircleOutlined style={{ color: '#8c8c8c' }} />
          <span>{dayjs(time).format('YYYY-MM-DD HH:mm:ss')}</span>
        </Space>
      ),
    },
    {
      title: t('audit:commands.commandCount'),
      dataIndex: 'command_count',
      width: 100,
      align: 'center',
      render: (count: number) => (
        <Tag color={count > 0 ? 'blue' : 'default'}>{count}</Tag>
      ),
    },
    {
      title: t('common:table.status'),
      dataIndex: 'status',
      width: 100,
      render: (statusKey: string) => {
        const config = statusConfig[statusKey] || { label: statusKey, status: 'default' };
        return <Badge status={config.status} text={config.label} />;
      },
    },
    {
      title: t('common:table.actions'),
      key: 'action',
      width: 100,
      fixed: 'right',
      render: (_, record) => (
        <Button
          type="link"
          size="small"
          icon={<HistoryOutlined />}
          onClick={() => handleViewCommands(record)}
        >
          {t('audit:commands.viewBtn')}
        </Button>
      ),
    },
  ];

  return (
    <div style={{ padding: 24, background: '#f0f2f5', minHeight: '100vh' }}>
      {/* 统计卡片 */}
      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={4}>
          <Card size="small" bordered={false}>
            <Statistic
              title={t('audit:commands.totalSessions')}
              value={stats?.total_sessions || 0}
              prefix={<HistoryOutlined style={{ color: '#1890ff' }} />}
            />
          </Card>
        </Col>
        <Col span={4}>
          <Card size="small" bordered={false}>
            <Statistic
              title={t('audit:commands.activeSessions')}
              value={stats?.active_sessions || 0}
              valueStyle={{ color: '#52c41a' }}
              prefix={<Badge status="processing" />}
            />
          </Card>
        </Col>
        <Col span={4}>
          <Card size="small" bordered={false}>
            <Statistic
              title={t('audit:commands.totalCommands')}
              value={stats?.total_commands || 0}
              prefix={<CodeOutlined style={{ color: '#722ed1' }} />}
            />
          </Card>
        </Col>
        <Col span={4}>
          <Card size="small" bordered={false}>
            <Statistic
              title="Kubectl"
              value={stats?.kubectl_sessions || 0}
              valueStyle={{ color: '#1890ff' }}
            />
          </Card>
        </Col>
        <Col span={4}>
          <Card size="small" bordered={false}>
            <Statistic
              title="Pod"
              value={stats?.pod_sessions || 0}
              valueStyle={{ color: '#52c41a' }}
            />
          </Card>
        </Col>
        <Col span={4}>
          <Card size="small" bordered={false}>
            <Statistic
              title="Node SSH"
              value={stats?.node_sessions || 0}
              valueStyle={{ color: '#fa8c16' }}
            />
          </Card>
        </Col>
      </Row>

      {/* 主卡片 */}
      <Card
        title={
          <Space>
            <HistoryOutlined />
            <span>{t('audit:commands.title')}</span>
          </Space>
        }
        extra={
          <Button icon={<ReloadOutlined />} onClick={handleRefresh}>
            {t('common:actions.refresh')}
          </Button>
        }
        bordered={false}
      >
        {/* 筛选区域 */}
        <Space wrap style={{ marginBottom: 16 }}>
          <Select
            placeholder={t('audit:commands.terminalTypeFilter')}
            allowClear
            style={{ width: 140 }}
            value={targetType || undefined}
            onChange={(v) => setTargetType(v || '')}
          >
            <Select.Option value="kubectl">Kubectl</Select.Option>
            <Select.Option value="pod">Pod</Select.Option>
            <Select.Option value="node">Node SSH</Select.Option>
          </Select>
          <Select
            placeholder={t('audit:commands.status')}
            allowClear
            style={{ width: 120 }}
            value={status || undefined}
            onChange={(v) => setStatus(v || '')}
          >
            <Select.Option value="active">{t('audit:commands.statusActive')}</Select.Option>
            <Select.Option value="closed">{t('audit:commands.statusClosed')}</Select.Option>
            <Select.Option value="error">{t('audit:commands.statusError')}</Select.Option>
          </Select>
          <RangePicker
            value={dateRange}
            onChange={(dates) => setDateRange(dates as [dayjs.Dayjs, dayjs.Dayjs] | null)}
            placeholder={[t('audit:commands.startDatePlaceholder'), t('audit:commands.endDatePlaceholder')]}
          />
          <Input.Search
            placeholder={t('audit:commands.searchPlaceholder')}
            style={{ width: 240 }}
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            onSearch={handleSearch}
            enterButton={<SearchOutlined />}
          />
        </Space>

        {/* 表格 */}
        <Table
          columns={columns}
          dataSource={sessions}
          rowKey="id"
          loading={loading}
          scroll={{ x: 1200 }}
          pagination={{
            current: currentPage,
            pageSize,
            total,
            showSizeChanger: true,
            showQuickJumper: true,
            showTotal: (total) => t('commands.totalCount', { total }),
            onChange: (page, size) => {
              setCurrentPage(page);
              setPageSize(size);
            },
          }}
        />
      </Card>

      {/* 命令详情抽屉 */}
      <Drawer
        title={
          <Space>
            <HistoryOutlined />
            <span>{t('audit:commands.commandDetail')}</span>
          </Space>
        }
        placement="right"
        width={720}
        open={drawerVisible}
        onClose={handleCloseDrawer}
        extra={
          <Button
            icon={<ExportOutlined />}
            onClick={() => {
              // 导出命令列表
              const content = commands.map(cmd => 
                `[${dayjs(cmd.timestamp).format('HH:mm:ss')}] ${cmd.parsed_cmd}`
              ).join('\n');
              const blob = new Blob([content], { type: 'text/plain' });
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = `commands-${selectedSession?.id || 'unknown'}.txt`;
              a.click();
              URL.revokeObjectURL(url);
            }}
          >
            {t('audit:commands.exportBtn')}
          </Button>
        }
      >
        <Spin spinning={commandsLoading}>
          {selectedSession && (
            <>
              {/* 会话信息 */}
              <Descriptions
                title={t('audit:commands.sessionInfo')}
                bordered
                size="small"
                column={2}
                style={{ marginBottom: 24 }}
              >
                <Descriptions.Item label={t('audit:commands.user')}>
                  {selectedSession.display_name || selectedSession.username}
                </Descriptions.Item>
                <Descriptions.Item label={t('audit:commands.cluster')}>
                  {selectedSession.cluster_name}
                </Descriptions.Item>
                <Descriptions.Item label={t('audit:commands.terminalType')}>
                  {terminalTypeConfig[selectedSession.target_type]?.label || selectedSession.target_type}
                </Descriptions.Item>
                <Descriptions.Item label={t('audit:commands.status')}>
                  <Badge
                    status={statusConfig[selectedSession.status]?.status || 'default'}
                    text={statusConfig[selectedSession.status]?.label || selectedSession.status}
                  />
                </Descriptions.Item>
                <Descriptions.Item label={t('audit:commands.target')} span={2}>
                  {selectedSession.target_type === 'pod'
                    ? `${selectedSession.namespace}/${selectedSession.pod}`
                    : selectedSession.node || selectedSession.namespace}
                </Descriptions.Item>
                <Descriptions.Item label={t('audit:commands.startTime')}>
                  {dayjs(selectedSession.start_at).format('YYYY-MM-DD HH:mm:ss')}
                </Descriptions.Item>
                <Descriptions.Item label={t('audit:commands.elapsedTime')}>
                  {selectedSession.duration}
                </Descriptions.Item>
                <Descriptions.Item label={t('audit:commands.commandCount')}>
                  {selectedSession.command_count}
                </Descriptions.Item>
                <Descriptions.Item label={t('audit:commands.inputSize')}>
                  {(selectedSession.input_size / 1024).toFixed(2)} KB
                </Descriptions.Item>
              </Descriptions>

              {/* 命令时间线 */}
              <div style={{ marginBottom: 16 }}>
                <Space>
                  <CodeOutlined />
                  <Text strong>{t('audit:commands.commandRecords')}</Text>
                  <Tag>{commandsTotal} 条</Tag>
                </Space>
              </div>

              {commands.length > 0 ? (
                <div
                  style={{
                    maxHeight: 'calc(100vh - 400px)',
                    overflowY: 'auto',
                    background: '#1e1e1e',
                    borderRadius: 8,
                    padding: 16,
                  }}
                >
                  <Timeline
                    items={commands.map((cmd) => ({
                      color: cmd.exit_code === 0 ? 'green' : cmd.exit_code !== null ? 'red' : 'blue',
                      children: (
                        <div style={{ color: '#d4d4d4' }}>
                          <div style={{ marginBottom: 4 }}>
                            <Text style={{ color: '#6a9955', fontSize: 12 }}>
                              {dayjs(cmd.timestamp).format('HH:mm:ss')}
                            </Text>
                            {cmd.exit_code !== null && (
                              <Tag
                                color={cmd.exit_code === 0 ? 'success' : 'error'}
                                style={{ marginLeft: 8 }}
                              >
                                exit: {cmd.exit_code}
                              </Tag>
                            )}
                          </div>
                          <Paragraph
                            copyable={{ text: cmd.parsed_cmd }}
                            style={{
                              margin: 0,
                              fontFamily: "'Fira Code', 'Monaco', 'Consolas', monospace",
                              fontSize: 13,
                              color: '#ce9178',
                              background: '#2d2d2d',
                              padding: '4px 8px',
                              borderRadius: 4,
                            }}
                          >
                            $ {cmd.parsed_cmd}
                          </Paragraph>
                        </div>
                      ),
                    }))}
                  />
                </div>
              ) : (
                <Empty description={t('audit:commands.noCommands')} />
              )}
            </>
          )}
        </Spin>
      </Drawer>
    </div>
  );
};

export default CommandHistory;

