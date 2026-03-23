import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Card, Row, Col, Table, Tag, Select, Spin, message, Progress, 
  Statistic, Badge, Tooltip, Switch, Space, Button 
} from 'antd';
import { 
  ClusterOutlined, 
  CheckCircleOutlined, 
  ExclamationCircleOutlined,
  DesktopOutlined,
  CloudServerOutlined,
  ThunderboltOutlined,
  DatabaseOutlined,
  ReloadOutlined,
  WarningOutlined,
  RightOutlined,
} from '@ant-design/icons';
import { Pie, Line } from '@ant-design/charts';
import { useTranslation } from 'react-i18next';
import { overviewService } from '../../services/overviewService';
import type { 
  OverviewStatsResponse, 
  ResourceUsageResponse, 
  ResourceDistributionResponse,
  TrendResponse,
  AbnormalWorkload,
  VersionDistribution,
  ClusterResourceCount,
  GlobalAlertStats,
} from '../../services/overviewService';

// 图表分布数据接口
interface ChartDistribution {
  name: string;
  value: number;
  clusterId?: number;
}

// 趋势数据接口
interface TrendData {
  date: string;
  cluster: string;
  value: number;
}

// 图表颜色配置
const CHART_COLORS = [
  '#5B8FF9', '#5AD8A6', '#F6BD16', '#E86452', '#6DC8EC',
  '#945FB9', '#FF9845', '#1E9493', '#FF99C3', '#9270CA',
  '#269A99', '#BDD2FD', '#BDEFDB', '#C2C8D5', '#FFC9B7',
  '#A0DC2C', '#946DFF', '#626681', '#EB4185', '#36BFFA',
];

const Overview: React.FC = () => {
const { t } = useTranslation(['overview', 'common']);
const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [podTimeRange, setPodTimeRange] = useState<'7d' | '30d'>('7d');
  const [nodeTimeRange, setNodeTimeRange] = useState<'7d' | '30d'>('7d');
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [refreshInterval, setRefreshInterval] = useState<number>(30);
  const [lastRefreshTime, setLastRefreshTime] = useState<Date>(new Date());

  // 数据状态
  const [stats, setStats] = useState<OverviewStatsResponse | null>(null);
  const [resourceUsage, setResourceUsage] = useState<ResourceUsageResponse | null>(null);
  const [distribution, setDistribution] = useState<ResourceDistributionResponse | null>(null);
  const [trends, setTrends] = useState<TrendResponse | null>(null);
  const [abnormalWorkloads, setAbnormalWorkloads] = useState<AbnormalWorkload[]>([]);
  const [alertStats, setAlertStats] = useState<GlobalAlertStats | null>(null);

  // 获取所有数据
  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [statsRes, usageRes, distRes, workloadsRes, alertStatsRes] = await Promise.all([
        overviewService.getStats(),
        overviewService.getResourceUsage(),
        overviewService.getDistribution(),
        overviewService.getAbnormalWorkloads({ limit: 20 }),
        overviewService.getAlertStats(),
      ]);
      
      setStats(statsRes);
      setResourceUsage(usageRes);
      setDistribution(distRes);
      setAbnormalWorkloads(workloadsRes || []);
      setAlertStats(alertStatsRes);
      setLastRefreshTime(new Date());
    } catch (error) {
console.error('Failed to fetch overview data:', error);
      message.error(t('common:messages.fetchError'));
} finally {
      setLoading(false);
    }
  }, []);

  // 获取趋势数据（使用较长的时间范围，一次请求获取所有数据）
  const fetchTrends = useCallback(async (podRange: string, nodeRange: string) => {
    try {
      // 使用较长的时间范围，一次请求获取所有数据
      const longerRange = podRange === '30d' || nodeRange === '30d' ? '30d' : '7d';
      const trendsRes = await overviewService.getTrends({ timeRange: longerRange });
      
      setTrends({
        podTrends: trendsRes?.podTrends || [],
        nodeTrends: trendsRes?.nodeTrends || [],
      });
    } catch (error) {
      console.error('Failed to fetch trend data:', error);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    fetchTrends(podTimeRange, nodeTimeRange);
  }, [fetchTrends, podTimeRange, nodeTimeRange]);

  // 自动刷新
  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (autoRefresh) {
      timer = setInterval(() => {
        fetchData();
        fetchTrends(podTimeRange, nodeTimeRange);
      }, refreshInterval * 1000);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [autoRefresh, refreshInterval, fetchData, fetchTrends, podTimeRange, nodeTimeRange]);

  // ========== 数据转换 ==========

  // 转换分布数据为图表格式
  const convertToChartDistribution = (data: ClusterResourceCount[] | undefined): ChartDistribution[] => {
    if (!data) return [];
    return data.map(item => ({
      name: item.clusterName,
      value: item.value,
      clusterId: item.clusterId,
    }));
  };

  const podDistribution = convertToChartDistribution(distribution?.podDistribution);
  const nodeDistribution = convertToChartDistribution(distribution?.nodeDistribution);
  const cpuDistribution = convertToChartDistribution(distribution?.cpuDistribution);
  const memoryDistribution = convertToChartDistribution(distribution?.memoryDistribution);

  // 计算总数
  const totalNodes = nodeDistribution.reduce((sum, c) => sum + c.value, 0);
  const totalPods = podDistribution.reduce((sum, c) => sum + c.value, 0);
  const totalCPU = cpuDistribution.reduce((sum, c) => sum + c.value, 0);
  const totalMemory = memoryDistribution.reduce((sum, c) => sum + c.value, 0);

  // 转换趋势数据为图表格式
  const convertTrendData = (trendSeries: TrendResponse['podTrends'] | undefined): TrendData[] => {
    if (!trendSeries || trendSeries.length === 0) return [];
    const result: TrendData[] = [];
    trendSeries.forEach(series => {
      let lastValidValue = 0;
      series.dataPoints?.forEach(point => {
        const date = new Date(point.timestamp * 1000);
        const dateStr = `${(date.getMonth() + 1).toString().padStart(2, '0')}-${date.getDate().toString().padStart(2, '0')}`;
        // 处理 null/undefined/NaN 值，使用前一个有效值
        let value = point.value;
        if (value === null || value === undefined || Number.isNaN(value)) {
          value = lastValidValue;
        } else {
          lastValidValue = value;
        }
        result.push({
          date: dateStr,
          cluster: series.clusterName,
          value: Math.round(value), // 取整数
        });
      });
    });
    return result;
  };

  const podTrendData = convertTrendData(trends?.podTrends);
  const nodeTrendData = convertTrendData(trends?.nodeTrends);

  // ========== 图表配置 ==========

  // 饼图配置
  const getPieConfig = (data: ChartDistribution[], labelSuffix: string = '', title: string = '') => ({
    data,
    angleField: 'value',
    colorField: 'name',
    color: CHART_COLORS,
    radius: 0.85,
    innerRadius: 0.6,
    label: {
      type: 'spider',
      content: ({ value }: { value: number }) => `${value}${labelSuffix}`,
      style: { fontSize: 11 },
    },
    legend: {
      position: 'left' as const,
      layout: 'vertical' as const,
      itemWidth: 150,
      maxRow: 12,
      flipPage: false,
      itemName: { style: { fontSize: 12 } },
    },
    statistic: { title: false as const, content: false as const },
    interactions: [{ type: 'element-active' }, { type: 'pie-legend-active' }],
    state: { active: { style: { lineWidth: 2, stroke: '#fff' } } },
tooltip: {
      showTitle: true,
      title: () => title || t('distribution.clusterDistribution'),
      customContent: (_: string, items: Array<{ name: string; value: string; color: string; data: ChartDistribution }>) => {
        if (!items || items.length === 0) return '';
        const item = items[0];
        const total = data.reduce((sum, d) => sum + d.value, 0);
        const percent = total > 0 ? ((parseFloat(item.value) / total) * 100).toFixed(1) : '0';
        return `
          <div style="padding: 10px 14px; min-width: 180px;">
            <div style="font-weight: 600; margin-bottom: 10px; color: #1f2937; border-bottom: 1px solid #e5e7eb; padding-bottom: 8px;">
              ${title}
            </div>
            <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 6px;">
              <span style="display: inline-block; width: 10px; height: 10px; border-radius: 50%; background: ${item.color};"></span>
              <span style="color: #6b7280;">${t('distribution.cluster')}:</span>
              <span style="font-weight: 600; color: #1f2937;">${item.name}</span>
            </div>
            <div style="padding-left: 18px; color: #6b7280;">
              ${t('distribution.quantity')}: <span style="font-weight: 600; color: #3b82f6;">${item.value}${labelSuffix}</span>
              <span style="margin-left: 8px; color: #9ca3af;">(${percent}%)</span>
            </div>
          </div>
        `;
},
    },
    onReady: (plot: { on: (event: string, callback: (evt: { data?: { data?: ChartDistribution } }) => void) => void }) => {
      plot.on('element:click', (evt: { data?: { data?: ChartDistribution } }) => {
        const clusterId = evt.data?.data?.clusterId;
        if (clusterId) {
          navigate(`/clusters/${clusterId}/overview`);
        }
      });
    },
  });

  // 趋势图配置
  const getTrendConfig = (data: TrendData[], yAxisTitle: string) => ({
    data,
    xField: 'date',
    yField: 'value',
    seriesField: 'cluster',
    color: ['#3b82f6', '#10b981', '#f59e0b', '#ef4444'],
    smooth: true,
    lineStyle: { lineWidth: 2 },
    point: { size: 3, shape: 'circle', style: { fill: '#fff', lineWidth: 2 } },
    legend: { position: 'top' as const, marker: { symbol: 'circle' } },
    yAxis: { 
      title: { text: yAxisTitle, style: { fontSize: 12 } },
      grid: { line: { style: { stroke: '#f0f0f0', lineDash: [4, 4] } } },
    },
    xAxis: { title: { text: '' }, line: { style: { stroke: '#d9d9d9' } } },
    animation: { appear: { animation: 'path-in', duration: 800 } },
    colorField: 'cluster',
  });

// 格式化数字
  const formatNumber = (num: number, unit: string = '') => {
    if (num >= 10000) return `${(num / 10000).toFixed(2)}w${unit}`;
    return `${num}${unit}`;
  };
// 版本分布表格列
  const versionColumns = [
    {
      title: t('distribution.versionName'),
      dataIndex: 'version',
      key: 'version',
      render: (text: string) => (
        <Tag color="volcano" style={{ borderRadius: 4, fontSize: 12, padding: '2px 8px' }}>
          {text}
        </Tag>
      ),
    },
    {
      title: t('distribution.clusterCount'),
      dataIndex: 'count',
      key: 'count',
      align: 'right' as const,
      render: (count: number, record: VersionDistribution) => (
        <Tooltip title={record.clusters?.join(', ')}>
          <span style={{ color: '#3b82f6', fontWeight: 'bold', fontSize: 14, cursor: 'pointer' }}>
            {count}
          </span>
        </Tooltip>
      ),
    },
  ];

  // 异常工作负载表格列
  const abnormalColumns = [
    {
      title: t('abnormal.workload'),
      dataIndex: 'name',
      key: 'name',
      width: 180,
      render: (text: string, record: AbnormalWorkload) => {
        // 根据类型构建跳转路径
        const getDetailPath = () => {
          const { clusterId, namespace, name, type } = record;
          if (type === 'Pod') {
            return `/clusters/${clusterId}/pods/${namespace}/${name}`;
          }
          // Deployment/StatefulSet/DaemonSet 等工作负载
          const workloadType = type.toLowerCase();
          return `/clusters/${clusterId}/workloads/${workloadType}/${namespace}/${name}`;
        };
        
        return (
          <Button 
            type="link" 
            size="small" 
            style={{ 
              padding: 0, 
              whiteSpace: 'normal', 
              wordBreak: 'break-all',
              textAlign: 'left',
              height: 'auto',
              lineHeight: 1.4,
            }}
            onClick={() => navigate(getDetailPath())}
          >
            {text}
          </Button>
        );
      },
    },
    {
      title: t('abnormal.namespace'),
      dataIndex: 'namespace',
      key: 'namespace',
      width: 120,
      render: (text: string) => (
        <Tag color="blue" style={{ whiteSpace: 'normal', wordBreak: 'break-all' }}>
          {text}
        </Tag>
      ),
    },
    {
      title: t('abnormal.cluster'),
      dataIndex: 'clusterName',
      key: 'clusterName',
      width: 100,
    },
    {
      title: t('abnormal.type'),
      dataIndex: 'type',
      key: 'type',
      render: (text: string) => <Tag>{text}</Tag>,
    },
    {
      title: t('abnormal.reason'),
      dataIndex: 'reason',
      key: 'reason',
      render: (text: string, record: AbnormalWorkload) => (
        <Tooltip title={record.message}>
          <span style={{ color: record.severity === 'critical' ? '#ef4444' : '#f59e0b' }}>
            <WarningOutlined style={{ marginRight: 4 }} />
            {text}
          </span>
        </Tooltip>
      ),
    },
    {
      title: t('abnormal.duration'),
      dataIndex: 'duration',
      key: 'duration',
    },
  ];

  // 卡片样式
  const cardStyle = { boxShadow: '0 1px 4px rgba(0,0,0,0.08)', borderRadius: 8 };
  const cardHeadStyle = { borderBottom: '1px solid #f0f0f0', padding: '12px 16px', minHeight: 48 };

  // 获取统计数据，提供默认值
  const clusterStats = stats?.clusterStats || { total: 0, healthy: 0, unhealthy: 0, unknown: 0 };
  const nodeStats = stats?.nodeStats || { total: 0, ready: 0, notReady: 0 };
  const podStats = stats?.podStats || { total: 0, running: 0, pending: 0, failed: 0, succeeded: 0 };
  const versionDistribution = stats?.versionDistribution || [];
  
  // 资源使用率
  const cpuUsage = resourceUsage?.cpu?.usagePercent || 0;
  const memoryUsage = resourceUsage?.memory?.usagePercent || 0;
  const storageUsage = resourceUsage?.storage?.usagePercent || 0;

  if (loading && !stats) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 'calc(100vh - 200px)' }}>
        <Spin size="large" tip={t('common:messages.loading')} />
      </div>
    );
  }

  return (
    <div style={{ padding: '0 4px' }}>
      {/* 顶部工具栏 */}
      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center', 
        marginBottom: 16,
        padding: '12px 16px',
        background: '#fff',
        borderRadius: 8,
        boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
      }}>
        <div>
          <span style={{ fontSize: 18, fontWeight: 600, color: '#1f2937' }}>{t('title')}</span>
          <span style={{ marginLeft: 16, color: '#9ca3af', fontSize: 13 }}>
            {t('common:time.lastUpdate')}: {lastRefreshTime.toLocaleTimeString()}
          </span>
        </div>
        <Space>
          <span style={{ color: '#6b7280' }}>{t('autoRefresh')}:</span>
          <Switch 
            checked={autoRefresh} 
            onChange={setAutoRefresh}
            size="small"
          />
          {autoRefresh && (
            <Select 
              value={refreshInterval} 
              onChange={setRefreshInterval}
              size="small"
              style={{ width: 90 }}
            >
              <Select.Option value={30}>{t('common:units.second30')}</Select.Option>
              <Select.Option value={60}>{t('common:units.minute1')}</Select.Option>
              <Select.Option value={300}>{t('common:units.minute5')}</Select.Option>
            </Select>
          )}
          <Button 
            icon={<ReloadOutlined spin={loading} />} 
            onClick={fetchData}
            loading={loading}
            size="small"
          >
            {t('common:actions.refresh')}
          </Button>
        </Space>
      </div>

      {/* 第一行: 全局健康状态概览 */}
      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={4}>
          <Card bordered={false} style={{ ...cardStyle, height: 140 }} bodyStyle={{ padding: '20px 16px' }}>
            <Statistic
              title={<span style={{ color: '#6b7280' }}><ClusterOutlined /> {t('stats.clusterTotal')}</span>}
              value={clusterStats.total}
              valueStyle={{ color: '#1f2937', fontSize: 32, fontWeight: 700 }}
            />
          </Card>
        </Col>
        <Col span={4}>
          <Card bordered={false} style={{ ...cardStyle, height: 140, cursor: 'pointer' }} bodyStyle={{ padding: '20px 16px' }}
            onClick={() => navigate('/clusters')}>
            <Statistic
              title={<span style={{ color: '#6b7280' }}><CheckCircleOutlined style={{ color: '#10b981' }} /> {t('stats.clusterHealthy')}</span>}
              value={clusterStats.healthy}
              valueStyle={{ color: '#10b981', fontSize: 32, fontWeight: 700 }}
              suffix={<span style={{ fontSize: 14, color: '#9ca3af' }}>/ {clusterStats.total}</span>}
            />
          </Card>
        </Col>
        <Col span={4}>
          <Card bordered={false} style={{ ...cardStyle, height: 140, cursor: clusterStats.unhealthy > 0 ? 'pointer' : 'default' }} 
            bodyStyle={{ padding: '20px 16px' }}
            onClick={() => clusterStats.unhealthy > 0 && navigate('/clusters')}>
            <Badge dot={clusterStats.unhealthy > 0} offset={[8, 0]}>
              <Statistic
                title={<span style={{ color: '#6b7280' }}><ExclamationCircleOutlined style={{ color: '#ef4444' }} /> {t('stats.clusterUnhealthy')}</span>}
                value={clusterStats.unhealthy}
                valueStyle={{ color: clusterStats.unhealthy > 0 ? '#ef4444' : '#9ca3af', fontSize: 32, fontWeight: 700 }}
              />
            </Badge>
          </Card>
        </Col>
        <Col span={4}>
          <Card bordered={false} style={{ ...cardStyle, height: 140 }} bodyStyle={{ padding: '20px 16px' }}>
            <Statistic
              title={<span style={{ color: '#6b7280' }}><DesktopOutlined /> {t('stats.nodeStatus')}</span>}
              value={nodeStats.ready}
              valueStyle={{ color: '#1f2937', fontSize: 32, fontWeight: 700 }}
              suffix={<span style={{ fontSize: 14, color: '#9ca3af' }}>/ {nodeStats.total}</span>}
            />
            {nodeStats.notReady > 0 && (
              <div style={{ marginTop: 4, color: '#ef4444', fontSize: 12 }}>
                <WarningOutlined /> {t('stats.nodeAbnormal', { count: nodeStats.notReady })}
              </div>
            )}
          </Card>
        </Col>
        <Col span={4}>
          <Card bordered={false} style={{ ...cardStyle, height: 140 }} bodyStyle={{ padding: '20px 16px' }}>
            <Statistic
              title={<span style={{ color: '#6b7280' }}><CloudServerOutlined /> {t('stats.podRunning')}</span>}
              value={podStats.running}
              valueStyle={{ color: '#1f2937', fontSize: 32, fontWeight: 700 }}
              suffix={<span style={{ fontSize: 14, color: '#9ca3af' }}>/ {formatNumber(podStats.total)}</span>}
            />
            {(podStats.pending > 0 || podStats.failed > 0) && (
              <div style={{ marginTop: 4, fontSize: 12 }}>
                {podStats.pending > 0 && <span style={{ color: '#f59e0b', marginRight: 8 }}>Pending: {podStats.pending}</span>}
                {podStats.failed > 0 && <span style={{ color: '#ef4444' }}>Failed: {podStats.failed}</span>}
              </div>
            )}
          </Card>
        </Col>
        <Col span={4}>
          <Card 
            bordered={false} 
            style={{ ...cardStyle, height: 140, cursor: (alertStats?.firing || 0) > 0 ? 'pointer' : 'default' }} 
            bodyStyle={{ padding: '20px 16px' }}
            onClick={() => (alertStats?.firing || 0) > 0 && navigate('/alerts')}
          >
            <Statistic
              title={<span style={{ color: '#6b7280' }}><WarningOutlined style={{ color: '#f59e0b' }} /> {t('stats.alerts')}</span>}
              value={alertStats?.firing || 0}
              valueStyle={{ color: (alertStats?.firing || 0) > 0 ? '#f59e0b' : '#9ca3af', fontSize: 32, fontWeight: 700 }}
              suffix={<span style={{ fontSize: 14, color: '#9ca3af' }}>{t('stats.alertFiring')}</span>}
            />
            {alertStats && alertStats.enabledCount > 0 && (
              <div style={{ marginTop: 4, fontSize: 12, color: '#9ca3af' }}>
                {t('stats.alertConfigured', { count: alertStats.enabledCount })}
              </div>
            )}
          </Card>
        </Col>
      </Row>

      {/* 第二行: 资源使用率 */}
      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={8}>
          <Card 
            title={<span><ThunderboltOutlined style={{ color: '#3b82f6' }} /> {t('resource.cpuUsage')}</span>}
            bordered={false} 
            style={{ ...cardStyle, height: 160 }}
            headStyle={{ ...cardHeadStyle, padding: '10px 16px' }}
            bodyStyle={{ padding: '16px' }}
          >
            <Progress 
              percent={cpuUsage} 
              strokeColor={cpuUsage > 80 ? '#ef4444' : cpuUsage > 60 ? '#f59e0b' : '#10b981'}
              format={(percent) => (
                <span style={{ fontWeight: 600, fontSize: 18 }}>{percent?.toFixed(1)}%</span>
              )}
            />
            <div style={{ marginTop: 8, color: '#6b7280', fontSize: 13 }}>
              {t('common:resources.used')}: {formatNumber(Math.floor(totalCPU * cpuUsage / 100), t('common:units.cores'))} / 
              {t('common:resources.total')}: {formatNumber(totalCPU, t('common:units.cores'))}
            </div>
          </Card>
        </Col>
        <Col span={8}>
          <Card 
            title={<span><DatabaseOutlined style={{ color: '#10b981' }} /> {t('resource.memoryUsage')}</span>}
            bordered={false} 
            style={{ ...cardStyle, height: 160 }}
            headStyle={{ ...cardHeadStyle, padding: '10px 16px' }}
            bodyStyle={{ padding: '16px' }}
          >
            <Progress 
              percent={memoryUsage} 
              strokeColor={memoryUsage > 80 ? '#ef4444' : memoryUsage > 60 ? '#f59e0b' : '#10b981'}
              format={(percent) => (
                <span style={{ fontWeight: 600, fontSize: 18 }}>{percent?.toFixed(1)}%</span>
              )}
            />
            <div style={{ marginTop: 8, color: '#6b7280', fontSize: 13 }}>
              {t('common:resources.used')}: {(totalMemory * memoryUsage / 100 / 1024).toFixed(2)}TB / 
              {t('common:resources.total')}: {(totalMemory / 1024).toFixed(2)}TB
            </div>
          </Card>
        </Col>
        <Col span={8}>
          <Card 
            title={<span><DatabaseOutlined style={{ color: '#8b5cf6' }} /> {t('resource.storageUsage')}</span>}
            bordered={false} 
            style={{ ...cardStyle, height: 160 }}
            headStyle={{ ...cardHeadStyle, padding: '10px 16px' }}
            bodyStyle={{ padding: '16px' }}
          >
            <Progress 
              percent={storageUsage} 
              strokeColor={storageUsage > 80 ? '#ef4444' : storageUsage > 60 ? '#f59e0b' : '#8b5cf6'}
              format={(percent) => (
                <span style={{ fontWeight: 600, fontSize: 18 }}>{percent?.toFixed(1)}%</span>
              )}
            />
            <div style={{ marginTop: 8, color: '#6b7280', fontSize: 13 }}>
              {t('common:resources.used')}: {resourceUsage?.storage?.used?.toFixed(0) || 0}{resourceUsage?.storage?.unit || 'GB'} / 
              {t('common:resources.total')}: {resourceUsage?.storage?.total?.toFixed(0) || 0}{resourceUsage?.storage?.unit || 'GB'}
            </div>
          </Card>
        </Col>
      </Row>

      {/* 第三行: 版本分布 + 异常工作负载 */}
      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={6}>
          <Card
            title={t('distribution.clusterVersion')}
            bordered={false}
            style={{ ...cardStyle, height: 320 }}
            headStyle={cardHeadStyle}
            bodyStyle={{ padding: '12px 16px' }}
          >
            <Table
              dataSource={versionDistribution}
              columns={versionColumns}
              rowKey="version"
              pagination={false}
              size="small"
              scroll={{ y: 220 }}
            />
          </Card>
        </Col>
        <Col span={18}>
          <Card
            title={
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span><WarningOutlined style={{ color: '#ef4444', marginRight: 8 }} />{t('abnormal.title')}</span>
                <Button type="link" size="small" onClick={() => navigate('/clusters')}>
                  {t('common:actions.viewAll')} <RightOutlined />
                </Button>
              </div>
            }
            bordered={false}
            style={{ ...cardStyle, height: 320 }}
            headStyle={cardHeadStyle}
            bodyStyle={{ padding: '12px 16px' }}
          >
            {abnormalWorkloads.length > 0 ? (
              <Table
                dataSource={abnormalWorkloads}
                columns={abnormalColumns}
                rowKey={(record) => `${record.clusterId}-${record.namespace}-${record.name}`}
                pagination={false}
                size="small"
                scroll={{ y: 220 }}
              />
            ) : (
              <div style={{ textAlign: 'center', padding: 60, color: '#9ca3af' }}>
                <CheckCircleOutlined style={{ fontSize: 48, color: '#10b981', marginBottom: 16 }} />
                <div>{t('abnormal.allNormal')}</div>
              </div>
            )}
          </Card>
        </Col>
      </Row>

      {/* 第四行: Pod分布 + Node分布 */}
      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={12}>
          <Card
            title={
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>{t('distribution.podDistribution')}</span>
                <span style={{ fontSize: 16, color: '#3b82f6', fontWeight: 'bold' }}>
                  {formatNumber(totalPods, t('common:units.count'))}
                </span>
              </div>
            }
            bordered={false}
            style={{ ...cardStyle, height: 400 }}
            headStyle={cardHeadStyle}
            bodyStyle={{ padding: '8px 16px', height: 'calc(100% - 57px)' }}
          >
            {podDistribution.length > 0 ? (
              <Pie {...getPieConfig(podDistribution, t('common:units.count'), t('distribution.podDistribution'))} height={300} />
            ) : (
              <div style={{ textAlign: 'center', padding: 60, color: '#9ca3af' }}>{t('common:messages.noData')}</div>
            )}
          </Card>
        </Col>
        <Col span={12}>
          <Card
            title={
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>{t('distribution.nodeDistribution')}</span>
                <span style={{ fontSize: 16, color: '#3b82f6', fontWeight: 'bold' }}>
                  {totalNodes}{t('common:units.count')}
                </span>
              </div>
            }
            bordered={false}
            style={{ ...cardStyle, height: 400 }}
            headStyle={cardHeadStyle}
            bodyStyle={{ padding: '8px 16px', height: 'calc(100% - 57px)' }}
          >
            {nodeDistribution.length > 0 ? (
              <Pie {...getPieConfig(nodeDistribution, t('common:units.count'), t('distribution.nodeDistribution'))} height={300} />
            ) : (
              <div style={{ textAlign: 'center', padding: 60, color: '#9ca3af' }}>{t('common:messages.noData')}</div>
            )}
          </Card>
        </Col>
      </Row>

      {/* 第五行: CPU分布 + 内存分布 */}
      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={12}>
          <Card
            title={
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>{t('distribution.cpuDistribution')}</span>
                <span style={{ fontSize: 16, color: '#3b82f6', fontWeight: 'bold' }}>
                  {formatNumber(totalCPU, t('common:units.cores'))}
                </span>
              </div>
            }
            bordered={false}
            style={{ ...cardStyle, height: 400 }}
            headStyle={cardHeadStyle}
            bodyStyle={{ padding: '8px 16px', height: 'calc(100% - 57px)' }}
          >
            {cpuDistribution.length > 0 ? (
              <Pie {...getPieConfig(cpuDistribution, t('common:units.cores'), t('distribution.cpuDistribution'))} height={300} />
            ) : (
              <div style={{ textAlign: 'center', padding: 60, color: '#9ca3af' }}>{t('common:messages.noData')}</div>
            )}
          </Card>
        </Col>
        <Col span={12}>
          <Card
            title={
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>{t('distribution.memoryDistribution')}</span>
                <span style={{ fontSize: 16, color: '#3b82f6', fontWeight: 'bold' }}>
                  {(totalMemory / 1024).toFixed(2)}TB
                </span>
              </div>
            }
            bordered={false}
            style={{ ...cardStyle, height: 400 }}
            headStyle={cardHeadStyle}
            bodyStyle={{ padding: '8px 16px', height: 'calc(100% - 57px)' }}
          >
            {memoryDistribution.length > 0 ? (
              <Pie {...getPieConfig(memoryDistribution, 'GB', t('distribution.memoryDistribution'))} height={300} />
            ) : (
              <div style={{ textAlign: 'center', padding: 60, color: '#9ca3af' }}>{t('common:messages.noData')}</div>
            )}
          </Card>
        </Col>
      </Row>

      {/* 第六行: Pod趋势 + Node趋势 */}
      <Row gutter={16}>
        <Col span={12}>
          <Card
            title={t('trend.podTrend')}
            bordered={false}
            style={{ ...cardStyle, height: 400 }}
            headStyle={cardHeadStyle}
            bodyStyle={{ padding: '8px 16px', height: 'calc(100% - 57px)' }}
            extra={
              <Select value={podTimeRange} onChange={setPodTimeRange} size="small" style={{ width: 100 }}>
                <Select.Option value="7d">{t('common:units.last7Days')}</Select.Option>
                <Select.Option value="30d">{t('common:units.last30Days')}</Select.Option>
              </Select>
            }
          >
            {podTrendData.length > 0 ? (
              <Line {...getTrendConfig(podTrendData, 'Pod')} height={300} />
            ) : (
              <div style={{ textAlign: 'center', padding: 60, color: '#9ca3af' }}>{t('common:messages.noData')}</div>
            )}
          </Card>
        </Col>
        <Col span={12}>
          <Card
            title={t('trend.nodeTrend')}
            bordered={false}
            style={{ ...cardStyle, height: 400 }}
            headStyle={cardHeadStyle}
            bodyStyle={{ padding: '8px 16px', height: 'calc(100% - 57px)' }}
            extra={
              <Select value={nodeTimeRange} onChange={setNodeTimeRange} size="small" style={{ width: 100 }}>
                <Select.Option value="7d">{t('common:units.last7Days')}</Select.Option>
                <Select.Option value="30d">{t('common:units.last30Days')}</Select.Option>
              </Select>
            }
          >
            {nodeTrendData.length > 0 ? (
              <Line {...getTrendConfig(nodeTrendData, 'Node')} height={300} />
            ) : (
              <div style={{ textAlign: 'center', padding: 60, color: '#9ca3af' }}>{t('common:messages.noData')}</div>
            )}
          </Card>
        </Col>
      </Row>
    </div>
  );
};

export default Overview;
