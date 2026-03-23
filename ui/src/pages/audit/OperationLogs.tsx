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
  Statistic,
  Row,
  Col,
  App,
  Typography,
  Tooltip,
  Descriptions,
  Badge,
  Spin,
} from 'antd';
import {
  ReloadOutlined,
  SearchOutlined,
  AuditOutlined,
  UserOutlined,
  ClusterOutlined,
  ClockCircleOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  InfoCircleOutlined,
  LoginOutlined,
  LogoutOutlined,
  DeleteOutlined,
  EditOutlined,
  PlusCircleOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import { auditService } from '../../services/auditService';
import { useTranslation } from 'react-i18next';
import type {
  OperationLogItem,
  OperationLogDetail,
  OperationLogStats,
  OperationLogListParams,
  ModuleOption,
} from '../../services/auditService';

const { RangePicker } = DatePicker;
const { Text, Paragraph } = Typography;

// 操作图标映射
const actionIconMap: Record<string, React.ReactNode> = {
  login: <LoginOutlined style={{ color: '#52c41a' }} />,
  logout: <LogoutOutlined style={{ color: '#1890ff' }} />,
  login_failed: <CloseCircleOutlined style={{ color: '#ff4d4f' }} />,
  create: <PlusCircleOutlined style={{ color: '#52c41a' }} />,
  update: <EditOutlined style={{ color: '#1890ff' }} />,
  delete: <DeleteOutlined style={{ color: '#ff4d4f' }} />,
  scale: <EditOutlined style={{ color: '#fa8c16' }} />,
};

// 模块颜色映射
const moduleColorMap: Record<string, string> = {
  auth: 'purple',
  cluster: 'blue',
  node: 'cyan',
  pod: 'green',
  workload: 'geekblue',
  config: 'orange',
  network: 'magenta',
  storage: 'volcano',
  namespace: 'lime',
  permission: 'gold',
  system: 'red',
  monitoring: 'purple',
  alert: 'red',
  argocd: 'blue',
};

// HTTP 方法颜色映射
const methodColorMap: Record<string, string> = {
  POST: 'green',
  PUT: 'blue',
  PATCH: 'orange',
  DELETE: 'red',
};

const OperationLogs: React.FC = () => {
  const { message } = App.useApp();

  // 数据状态
const { t } = useTranslation(['audit', 'common']);
const [logs, setLogs] = useState<OperationLogItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [stats, setStats] = useState<OperationLogStats | null>(null);
  const [modules, setModules] = useState<ModuleOption[]>([]);
  const [actions, setActions] = useState<ModuleOption[]>([]);

  // 分页状态
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  // 筛选状态
  const [module, setModule] = useState<string>('');
  const [action, setAction] = useState<string>('');
  const [success, setSuccess] = useState<string>('');
  const [keyword, setKeyword] = useState('');
  const [dateRange, setDateRange] = useState<[dayjs.Dayjs, dayjs.Dayjs] | null>(null);

  // 详情抽屉
  const [drawerVisible, setDrawerVisible] = useState(false);
  const [selectedLog, setSelectedLog] = useState<OperationLogDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // 获取模块和操作列表
  const fetchOptions = useCallback(async () => {
    try {
      const [modulesRes, actionsRes] = await Promise.all([
        auditService.getModules(),
        auditService.getActions(),
      ]);
      setModules(modulesRes || []);
      setActions(actionsRes || []);
    } catch (error) {
      console.error('获取选项失败', error);
    }
  }, []);

  // 获取统计数据
  const fetchStats = useCallback(async () => {
    try {
      const res = await auditService.getOperationLogStats();
      setStats(res);
    } catch (error) {
      console.error('获取统计信息失败', error);
    }
  }, []);

  // 获取日志列表
  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const params: OperationLogListParams = {
        page: currentPage,
        pageSize,
      };
      if (module) params.module = module;
      if (action) params.action = action;
      if (success !== '') params.success = success === 'true';
      if (keyword) params.keyword = keyword;
      if (dateRange) {
        params.startTime = dateRange[0].startOf('day').toISOString();
        params.endTime = dateRange[1].endOf('day').toISOString();
      }

      const res = await auditService.getOperationLogs(params);
      setLogs(res.items || []);
      setTotal(res.total);
    } catch {
      message.error(t('audit:operations.fetchFailed'));
    } finally {
      setLoading(false);
    }
  }, [currentPage, pageSize, module, action, success, keyword, dateRange, message]);

  // 获取日志详情
  const fetchLogDetail = useCallback(async (id: number) => {
    setDetailLoading(true);
    try {
      const res = await auditService.getOperationLog(id);
      setSelectedLog(res);
    } catch {
      message.error(t('audit:operations.fetchDetailFailed'));
    } finally {
      setDetailLoading(false);
    }
  }, [message]);

  useEffect(() => {
    fetchOptions();
    fetchStats();
  }, [fetchOptions, fetchStats]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  // 查看详情
  const handleViewDetail = (record: OperationLogItem) => {
    setDrawerVisible(true);
    fetchLogDetail(record.id);
  };

  // 关闭抽屉
  const handleCloseDrawer = () => {
    setDrawerVisible(false);
    setSelectedLog(null);
  };

  // 刷新数据
  const handleRefresh = () => {
    fetchStats();
    fetchLogs();
  };

  // 搜索
  const handleSearch = () => {
    setCurrentPage(1);
    fetchLogs();
  };

  // 表格列定义
  const columns: ColumnsType<OperationLogItem> = [
    {
      title: t('audit:operations.time'),
      dataIndex: 'created_at',
      width: 170,
      render: (time: string) => (
        <Space>
          <ClockCircleOutlined style={{ color: '#8c8c8c' }} />
          <span>{dayjs(time).format('YYYY-MM-DD HH:mm:ss')}</span>
        </Space>
      ),
    },
    {
      title: t('audit:operations.user'),
      dataIndex: 'username',
      width: 120,
      render: (username: string) => (
        <Space>
          <UserOutlined style={{ color: '#1890ff' }} />
          <span>{username || '-'}</span>
        </Space>
      ),
    },
    {
      title: t('audit:operations.module'),
      dataIndex: 'module_name',
      width: 110,
      render: (name: string, record) => (
        <Tag color={moduleColorMap[record.module] || 'default'}>
          {name || record.module}
        </Tag>
      ),
    },
    {
      title: t('common:table.actions'),
      key: 'action',
      width: 120,
      render: (_, record) => (
        <Space>
          {actionIconMap[record.action] || <InfoCircleOutlined />}
          <span>{record.action_name || record.action}</span>
        </Space>
      ),
    },
    {
      title: t('audit:operations.method'),
      dataIndex: 'method',
      width: 80,
      render: (method: string) => (
        <Tag color={methodColorMap[method] || 'default'}>{method}</Tag>
      ),
    },
    {
      title: t('audit:operations.resourceCol'),
      key: 'resource',
      width: 200,
      ellipsis: true,
      render: (_, record) => {
        const resourceInfo = record.resource_name 
          ? `${record.resource_type}/${record.resource_name}`
          : record.resource_type || record.path;
        return (
          <Tooltip title={resourceInfo}>
            <Text ellipsis style={{ maxWidth: 180 }}>
              {resourceInfo}
            </Text>
          </Tooltip>
        );
      },
    },
    {
      title: t('audit:operations.cluster'),
      key: 'cluster',
      width: 120,
      render: (_, record) => (
        record.cluster_name ? (
          <Space>
            <ClusterOutlined style={{ color: '#52c41a' }} />
            <span>{record.cluster_name}</span>
          </Space>
        ) : <Text type="secondary">-</Text>
      ),
    },
    {
      title: t('common:table.status'),
      dataIndex: 'success',
      width: 80,
      align: 'center',
      render: (success: boolean) => (
        success ? (
          <Badge status="success" text={t('audit:operations.statusSuccess')} />
        ) : (
          <Badge status="error" text={t('audit:operations.statusFailed')} />
        )
      ),
    },
    {
      title: t('audit:operations.duration'),
      dataIndex: 'duration',
      width: 80,
      align: 'right',
      render: (duration: number) => (
        <Text type={duration > 1000 ? 'warning' : 'secondary'}>
          {duration}ms
        </Text>
      ),
    },
    {
      title: t('common:table.actions'),
      key: 'actions',
      width: 80,
      fixed: 'right',
      render: (_, record) => (
        <Button
          type="link"
          size="small"
          icon={<InfoCircleOutlined />}
          onClick={() => handleViewDetail(record)}
        >
          {t('audit:operations.detail')}
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
              title={t('audit:operations.totalOperations')}
              value={stats?.total_count || 0}
              prefix={<AuditOutlined style={{ color: '#1890ff' }} />}
            />
          </Card>
        </Col>
        <Col span={4}>
          <Card size="small" bordered={false}>
            <Statistic
              title={t('audit:operations.todayOperations')}
              value={stats?.today_count || 0}
              valueStyle={{ color: '#722ed1' }}
              prefix={<ClockCircleOutlined />}
            />
          </Card>
        </Col>
        <Col span={4}>
          <Card size="small" bordered={false}>
            <Statistic
              title={t('audit:operations.success')}
              value={stats?.success_count || 0}
              valueStyle={{ color: '#52c41a' }}
              prefix={<CheckCircleOutlined />}
            />
          </Card>
        </Col>
        <Col span={4}>
          <Card size="small" bordered={false}>
            <Statistic
              title={t('audit:operations.failed')}
              value={stats?.failed_count || 0}
              valueStyle={{ color: '#ff4d4f' }}
              prefix={<CloseCircleOutlined />}
            />
          </Card>
        </Col>
        <Col span={8}>
          <Card size="small" bordered={false}>
            <div style={{ marginBottom: 8 }}>
              <Text type="secondary">{t('audit:operations.operationDistribution')}</Text>
            </div>
            <Space wrap size="small">
              {stats?.module_stats?.slice(0, 5).map((m) => (
                <Tag key={m.module} color={moduleColorMap[m.module] || 'default'}>
                  {m.module_name}: {m.count}
                </Tag>
              ))}
            </Space>
          </Card>
        </Col>
      </Row>

      {/* 主卡片 */}
      <Card
        title={
          <Space>
            <AuditOutlined />
            <span>{t('operations.title')}</span>
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
            placeholder={t('operations.moduleFilter')}
            allowClear
            style={{ width: 140 }}
            value={module || undefined}
            onChange={(v) => setModule(v || '')}
            showSearch
            optionFilterProp="children"
          >
            {modules.map((m) => (
              <Select.Option key={m.key} value={m.key}>
                {m.name}
              </Select.Option>
            ))}
          </Select>
          <Select
            placeholder={t('audit:operations.actionFilter')}
            allowClear
            style={{ width: 120 }}
            value={action || undefined}
            onChange={(v) => setAction(v || '')}
            showSearch
            optionFilterProp="children"
          >
            {actions.map((a) => (
              <Select.Option key={a.key} value={a.key}>
                {a.name}
              </Select.Option>
            ))}
          </Select>
          <Select
            placeholder={t('operations.statusFilter')}
            allowClear
            style={{ width: 100 }}
            value={success || undefined}
            onChange={(v) => setSuccess(v || '')}
          >
            <Select.Option value="true">{t('audit:operations.success')}</Select.Option>
            <Select.Option value="false">{t('audit:operations.failed')}</Select.Option>
          </Select>
          <RangePicker
            value={dateRange}
            onChange={(dates) => setDateRange(dates as [dayjs.Dayjs, dayjs.Dayjs] | null)}
            placeholder={[t('audit:operations.startDate'), t('audit:operations.endDate')]}
          />
          <Input.Search
            placeholder={t('audit:operations.searchPlaceholder')}
            style={{ width: 220 }}
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            onSearch={handleSearch}
            enterButton={<SearchOutlined />}
          />
        </Space>

        {/* 表格 */}
        <Table
          columns={columns}
          dataSource={logs}
          rowKey="id"
          loading={loading}
          scroll={{ x: 1400 }}
          pagination={{
            current: currentPage,
            pageSize,
            total,
            showSizeChanger: true,
            showQuickJumper: true,
            showTotal: (total) => t('audit:operations.totalCount', { total }),
            onChange: (page, size) => {
              setCurrentPage(page);
              setPageSize(size);
            },
          }}
          rowClassName={(record) => (record.success ? '' : 'ant-table-row-error')}
        />
      </Card>

      {/* 详情抽屉 */}
      <Drawer
        title={
          <Space>
            <AuditOutlined />
            <span>{t('audit:operations.operationDetail')}</span>
          </Space>
        }
        placement="right"
        width={640}
        open={drawerVisible}
        onClose={handleCloseDrawer}
      >
        <Spin spinning={detailLoading}>
          {selectedLog && (
            <>
              {/* 基本信息 */}
              <Descriptions
                title={t('audit:operations.basicInfo')}
                bordered
                size="small"
                column={2}
                style={{ marginBottom: 24 }}
              >
                <Descriptions.Item label={t('operations.operationId')}>{selectedLog.id}</Descriptions.Item>
                <Descriptions.Item label={t('operations.time')}>
                  {dayjs(selectedLog.created_at).format('YYYY-MM-DD HH:mm:ss')}
                </Descriptions.Item>
                <Descriptions.Item label={t('audit:operations.user')}>
                  {selectedLog.username || '-'}
                </Descriptions.Item>
                <Descriptions.Item label={t('audit:operations.clientIp')}>
                  {selectedLog.client_ip}
                </Descriptions.Item>
                <Descriptions.Item label={t('audit:operations.module')}>
                  <Tag color={moduleColorMap[selectedLog.module] || 'default'}>
                    {selectedLog.module_name || selectedLog.module}
                  </Tag>
                </Descriptions.Item>
                <Descriptions.Item label={t('common:table.actions')}>
                  <Space>
                    {actionIconMap[selectedLog.action] || <InfoCircleOutlined />}
                    <span>{selectedLog.action_name || selectedLog.action}</span>
                  </Space>
                </Descriptions.Item>
                <Descriptions.Item label={t('common:table.status')}>
                  {selectedLog.success ? (
                    <Badge status="success" text={t('audit:operations.statusSuccess')} />
                  ) : (
                    <Badge status="error" text={t('audit:operations.statusFailed')} />
                  )}
                </Descriptions.Item>
                <Descriptions.Item label={t('audit:operations.statusCode')}>
                  <Tag color={selectedLog.status_code < 400 ? 'green' : 'red'}>
                    {selectedLog.status_code}
                  </Tag>
                </Descriptions.Item>
                <Descriptions.Item label={t('audit:operations.duration')}>{selectedLog.duration}ms</Descriptions.Item>
                <Descriptions.Item label={t('audit:operations.cluster')}>
                  {selectedLog.cluster_name || '-'}
                </Descriptions.Item>
              </Descriptions>

              {/* 请求信息 */}
              <Descriptions
                title={t('operations.requestInfo')}
                bordered
                size="small"
                column={1}
                style={{ marginBottom: 24 }}
              >
                <Descriptions.Item label={t('audit:operations.method')}>
                  <Tag color={methodColorMap[selectedLog.method] || 'default'}>
                    {selectedLog.method}
                  </Tag>
                </Descriptions.Item>
                <Descriptions.Item label={t('audit:operations.path')}>
                  <Text code copyable>{selectedLog.path}</Text>
                </Descriptions.Item>
                {selectedLog.namespace && (
                  <Descriptions.Item label={t('audit:operations.namespace')}>
                    {selectedLog.namespace}
                  </Descriptions.Item>
                )}
                {selectedLog.resource_type && (
                  <Descriptions.Item label={t('audit:operations.resourceType')}>
                    {selectedLog.resource_type}
                  </Descriptions.Item>
                )}
                {selectedLog.resource_name && (
                  <Descriptions.Item label={t('audit:operations.resourceName')}>
                    {selectedLog.resource_name}
                  </Descriptions.Item>
                )}
              </Descriptions>

              {/* 请求体 */}
              {selectedLog.request_body && (
                <Card
                  title={t('operations.requestBody')}
                  size="small"
                  style={{ marginBottom: 24 }}
                >
                  <Paragraph
                    copyable
                    style={{
                      background: '#1e1e1e',
                      color: '#d4d4d4',
                      padding: 12,
                      borderRadius: 4,
                      maxHeight: 300,
                      overflow: 'auto',
                      fontFamily: "'Fira Code', monospace",
                      fontSize: 12,
                      whiteSpace: 'pre-wrap',
                      margin: 0,
                    }}
                  >
                    {(() => {
                      try {
                        return JSON.stringify(JSON.parse(selectedLog.request_body), null, 2);
                      } catch {
                        return selectedLog.request_body;
                      }
                    })()}
                  </Paragraph>
                </Card>
              )}

              {/* 错误信息 */}
              {!selectedLog.success && selectedLog.error_message && (
                <Card
                  title={t('audit:operations.errorInfo')}
                  size="small"
                  style={{ borderColor: '#ff4d4f' }}
                >
                  <Text type="danger">{selectedLog.error_message}</Text>
                </Card>
              )}
            </>
          )}
        </Spin>
      </Drawer>

      <style>{`
        .ant-table-row-error {
          background-color: #fff2f0;
        }
        .ant-table-row-error:hover > td {
          background-color: #ffebe6 !important;
        }
      `}</style>
    </div>
  );
};

export default OperationLogs;

