/** genAI_main_start */
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Card, Row, Col, Statistic, Select, Button, Space, Spin, Alert, Switch, Skeleton } from 'antd';
import { Line, Area } from '@ant-design/plots';
import { ReloadOutlined } from '@ant-design/icons';
import api from '../utils/api';
/** genAI_main_end */

const { Option } = Select;

interface DataPoint {
  timestamp: number;
  value: number;
}

interface MetricSeries {
  current: number;
  series: DataPoint[];
}

interface NetworkMetrics {
  in: MetricSeries;
  out: MetricSeries;
}

interface PodMetrics {
  total: number;
  running: number;
  pending: number;
  failed: number;
}

/* genAI_main_start */
interface NetworkPPS {
  in: MetricSeries;
  out: MetricSeries;
}

interface NetworkDrops {
  receive: MetricSeries;
  transmit: MetricSeries;
}

interface DiskIOPS {
  read: MetricSeries;
  write: MetricSeries;
}

interface DiskThroughput {
  read: MetricSeries;
  write: MetricSeries;
}

interface MultiSeriesDataPoint {
  timestamp: number;
  values: { [podName: string]: number };
}

interface MultiSeriesMetric {
  series: MultiSeriesDataPoint[];
}

interface ClusterOverview {
  total_cpu_cores: number;
  total_memory: number;
  worker_nodes: number;
  cpu_usage_rate?: MetricSeries;
  memory_usage_rate?: MetricSeries;
  max_pods: number;
  created_pods: number;
  available_pods: number;
  pod_usage_rate: number;
  etcd_has_leader: boolean;
  apiserver_availability: number;
  cpu_request_ratio?: MetricSeries;
  cpu_limit_ratio?: MetricSeries;
  mem_request_ratio?: MetricSeries;
  mem_limit_ratio?: MetricSeries;
  apiserver_request_rate?: MetricSeries;
}

interface NodeMetricItem {
  node_name: string;
  cpu_usage_rate: number;
  memory_usage_rate: number;
  cpu_cores: number;
  total_memory: number;
  status: string;
}

interface ClusterMetricsData {
  cpu?: MetricSeries;
  memory?: MetricSeries;
  network?: NetworkMetrics;
  storage?: MetricSeries;
  pods?: PodMetrics;
  // Pod 级别的扩展指标
  cpu_request?: MetricSeries;
  cpu_limit?: MetricSeries;
  memory_request?: MetricSeries;
  memory_limit?: MetricSeries;
  probe_failures?: MetricSeries;
  container_restarts?: MetricSeries;
  network_pps?: NetworkPPS;
  threads?: MetricSeries;
  network_drops?: NetworkDrops;
  cpu_throttling?: MetricSeries;
  cpu_throttling_time?: MetricSeries;
  disk_iops?: DiskIOPS;
  disk_throughput?: DiskThroughput;
  cpu_usage_absolute?: MetricSeries;
  memory_usage_bytes?: MetricSeries;
  oom_kills?: MetricSeries;
  // 集群级别监控指标
  cluster_overview?: ClusterOverview;
  node_list?: NodeMetricItem[];
  // 工作负载多Pod监控指标（显示多条曲线）
  cpu_multi?: MultiSeriesMetric;
  memory_multi?: MultiSeriesMetric;
  container_restarts_multi?: MultiSeriesMetric;
  oom_kills_multi?: MultiSeriesMetric;
  probe_failures_multi?: MultiSeriesMetric;
  network_pps_multi?: MultiSeriesMetric;
  threads_multi?: MultiSeriesMetric;
  network_drops_multi?: MultiSeriesMetric;
  cpu_throttling_multi?: MultiSeriesMetric;
  cpu_throttling_time_multi?: MultiSeriesMetric;
  disk_iops_multi?: MultiSeriesMetric;
  disk_throughput_multi?: MultiSeriesMetric;
}
/* genAI_main_end */

/** genAI_main_start */
interface MonitoringChartsProps {
  clusterId: string;
  clusterName?: string;
  nodeName?: string;
  namespace?: string;
  podName?: string;
  workloadName?: string;
  type: 'cluster' | 'node' | 'pod' | 'workload';
  lazyLoad?: boolean; // 是否懒加载，默认 false
}
/** genAI_main_end */

/** genAI_main_start */
const MonitoringCharts: React.FC<MonitoringChartsProps> = ({
  clusterId,
  clusterName,
  nodeName,
  namespace,
  podName,
  workloadName,
  type,
  lazyLoad = false,
}) => {
/** genAI_main_end */
  const [metrics, setMetrics] = useState<ClusterMetricsData | null>(null);
  const [loading, setLoading] = useState(false);
  const [timeRange, setTimeRange] = useState('1h');
  const [step, setStep] = useState('15s');
  /* genAI_main_start */
  const [autoRefresh, setAutoRefresh] = useState(false); // 默认关闭自动刷新
  const [hasLoaded, setHasLoaded] = useState(false); // 是否已加载过数据
  const metricsCacheRef = useRef<{ key: string; data: ClusterMetricsData; timestamp: number } | null>(null);
  const CACHE_DURATION = 30000; // 缓存30秒
  /* genAI_main_end */
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  /** genAI_main_start */
  // 生成缓存键
  const cacheKey = useMemo(() => {
    return `${clusterId}-${type}-${timeRange}-${step}-${clusterName || ''}-${nodeName || ''}-${namespace || ''}-${podName || ''}-${workloadName || ''}`;
  }, [clusterId, type, timeRange, step, clusterName, nodeName, namespace, podName, workloadName]);

  // 检查缓存
  const getCachedData = useCallback(() => {
    if (metricsCacheRef.current && metricsCacheRef.current.key === cacheKey) {
      const now = Date.now();
      if (now - metricsCacheRef.current.timestamp < CACHE_DURATION) {
        return metricsCacheRef.current.data;
      }
    }
    return null;
  }, [cacheKey]);

  const fetchMetrics = useCallback(async (forceRefresh = false) => {
    // 检查缓存
    if (!forceRefresh) {
      const cachedData = getCachedData();
      if (cachedData) {
        setMetrics(cachedData);
        setLoading(false);
        return;
      }
    }

    try {
      setLoading(true);
      let url = '';
      const params = new URLSearchParams({
        range: timeRange,
        step: step,
      });

      if (clusterName) {
        params.append('clusterName', clusterName);
      }

      switch (type) {
        case 'cluster':
          url = `/clusters/${clusterId}/monitoring/metrics`;
          break;
        case 'node':
          url = `/clusters/${clusterId}/nodes/${nodeName}/metrics`;
          break;
        case 'pod':
          url = `/clusters/${clusterId}/pods/${namespace}/${podName}/metrics`;
          break;
        case 'workload':
          url = `/clusters/${clusterId}/workloads/${namespace}/${workloadName}/metrics`;
          break;
      }

      const response = await api.get(`${url}?${params.toString()}`);
      const data = response.data.data;
      setMetrics(data);
      
      // 更新缓存
      metricsCacheRef.current = {
        key: cacheKey,
        data: data,
        timestamp: Date.now(),
      };
      
      setHasLoaded(true);
    } catch (error) {
      console.error('获取监控数据失败:', error);
    } finally {
      setLoading(false);
    }
  }, [clusterId, timeRange, step, clusterName, nodeName, namespace, podName, workloadName, type, cacheKey, getCachedData]);
  /** genAI_main_end */

  /* genAI_main_start */
  useEffect(() => {
    // 如果是懒加载模式且未加载过，延迟自动加载
    if (lazyLoad && !hasLoaded) {
      // 延迟自动加载，给用户更好的体验
      const timer = setTimeout(() => {
        // 检查缓存
        const cachedData = getCachedData();
        if (cachedData) {
          setMetrics(cachedData);
          setHasLoaded(true);
          return;
        }
        fetchMetrics();
      }, 100); // 100ms 后自动加载
      return () => clearTimeout(timer);
    }
    
    // 非懒加载模式或已加载过，正常加载
    if (!lazyLoad || hasLoaded) {
      // 检查缓存
      const cachedData = getCachedData();
      if (cachedData) {
        setMetrics(cachedData);
        setHasLoaded(true);
        return;
      }
      
      fetchMetrics();
    }
    
    // 只在开启自动刷新时设置定时器
    if (autoRefresh) {
      intervalRef.current = setInterval(() => fetchMetrics(true), 30000); // 30秒刷新一次，强制刷新
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [clusterId, timeRange, step, clusterName, nodeName, namespace, podName, fetchMetrics, autoRefresh, lazyLoad, hasLoaded, getCachedData]);
  /* genAI_main_end */

  const formatTimestamp = (timestamp: number) => {
    return new Date(timestamp * 1000).toLocaleTimeString();
  };

  const formatValue = (value: number, unit: string = '') => {
    if (unit === '%') {
      return `${value.toFixed(2)}%`;
    }
    if (unit === 'bytes') {
      if (value >= 1024 * 1024 * 1024) {
        return `${(value / (1024 * 1024 * 1024)).toFixed(2)} GB`;
      } else if (value >= 1024 * 1024) {
        return `${(value / (1024 * 1024)).toFixed(2)} MB`;
      } else if (value >= 1024) {
        return `${(value / 1024).toFixed(2)} KB`;
      }
      return `${value.toFixed(2)} B`;
    }
    return value.toFixed(2);
  };

  const renderChart = (data: DataPoint[], color: string, unit: string = '') => {
    const chartData = data.map(point => ({
      time: formatTimestamp(point.timestamp),
      value: point.value,
      timestamp: point.timestamp,
    }));

    const config = {
      data: chartData,
      xField: 'time',
      yField: 'value',
      height: 200,
      smooth: true,
      color: color,
      point: {
        size: 0,
      },
      tooltip: {
        formatter: (datum: { value: number; time: string }) => {
          return {
            name: '数值',
            value: formatValue(datum.value, unit),
          };
        },
        title: (datum: { time: string }) => `时间: ${datum.time}`,
      },
      yAxis: {
        label: {
          formatter: (value: number) => formatValue(value, unit),
        },
      },
    };

    return <Line {...config} />;
  };

  /** genAI_main_start */
  // 渲染多时间序列图表（多个Pod的曲线）
  const renderMultiSeriesChart = (data: MultiSeriesDataPoint[], unit: string = '') => {
    if (!data || data.length === 0) {
      return <div style={{ textAlign: 'center', padding: '20px', color: '#999' }}>暂无数据</div>;
    }

    // 转换数据格式：将 {timestamp, values: {pod1: val1, pod2: val2}} 转为 [{time, pod, value}, ...]
    const chartData: Array<{ time: string; pod: string; value: number }> = [];
    data.forEach(point => {
      const time = formatTimestamp(point.timestamp);
      Object.entries(point.values).forEach(([podName, value]) => {
        // 只添加有效的数值数据点
        if (value != null && typeof value === 'number' && !isNaN(value) && isFinite(value)) {
          chartData.push({
            time,
            pod: podName,
            value,
          });
        }
      });
    });

    const config = {
      data: chartData,
      xField: 'time',
      yField: 'value',
      colorField: 'pod',
      height: 300,
      smooth: true,
      point: {
        size: 0,
      },
      legend: {
        position: 'top' as const,
        maxRow: 3,
        layout: 'horizontal' as const,
      },
      yAxis: {
        label: {
          formatter: (value: string) => formatValue(parseFloat(value), unit),
        },
      },
    };

    return <Line {...config} />;
  };
  /** genAI_main_end */

  // Helper function to convert bytes to appropriate unit
  const convertBytesToUnit = (bytes: number): { value: number; unit: string } => {
    if (bytes >= 1024 * 1024 * 1024) {
      return { value: bytes / (1024 * 1024 * 1024), unit: 'GB' };
    } else if (bytes >= 1024 * 1024) {
      return { value: bytes / (1024 * 1024), unit: 'MB' };
    } else if (bytes >= 1024) {
      return { value: bytes / 1024, unit: 'KB' };
    }
    return { value: bytes, unit: 'B' };
  };

  const renderNetworkChart = (inData: DataPoint[], outData: DataPoint[], unit: string = '', inLabel: string = '入站', outLabel: string = '出站') => {
    let chartData;
    let yAxisSuffix = '';

    if (unit === 'bytes') {
      // Find max value to determine the best unit
      const maxValue = Math.max(
        ...inData.map(p => p.value),
        ...outData.map(p => p.value)
      );
      const { unit: bestUnit } = convertBytesToUnit(maxValue);
      yAxisSuffix = bestUnit;

      // Convert all data to the best unit
      const divisor = 
        bestUnit === 'GB' ? (1024 * 1024 * 1024) :
        bestUnit === 'MB' ? (1024 * 1024) :
        bestUnit === 'KB' ? 1024 : 1;

      chartData = inData.map((point, index) => ({
        time: formatTimestamp(point.timestamp),
        in: point.value / divisor,
        out: (outData[index]?.value || 0) / divisor,
        inRaw: point.value,
        outRaw: outData[index]?.value || 0,
        timestamp: point.timestamp,
      }));
    } else {
      chartData = inData.map((point, index) => ({
        time: formatTimestamp(point.timestamp),
        in: point.value,
        out: outData[index]?.value || 0,
        timestamp: point.timestamp,
      }));
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const config: any = {
      data: chartData,
      xField: 'time',
      yField: ['in', 'out'],
      height: 200,
      smooth: true,
      color: ['#1890ff', '#52c41a'],
      areaStyle: {
        fillOpacity: 0.6,
      },
      tooltip: {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        formatter: (datum: any) => {
          if (unit === 'bytes') {
            return [
              {
                name: inLabel,
                value: formatValue(datum.inRaw, 'bytes'),
              },
              {
                name: outLabel,
                value: formatValue(datum.outRaw, 'bytes'),
              },
            ];
          } else {
            return [
              {
                name: inLabel,
                value: datum.in.toFixed(2),
              },
              {
                name: outLabel,
                value: datum.out.toFixed(2),
              },
            ];
          }
        },
        title: (datum: { time: string }) => `时间: ${datum.time}`,
      },
      yAxis: {
        label: {
          formatter: (value: string) => {
            const numValue = parseFloat(value);
            return yAxisSuffix ? `${numValue.toFixed(2)} ${yAxisSuffix}` : numValue.toFixed(2);
          },
        },
      },
    };

    return <Area {...config} />;
  };

  /* genAI_main_start */
  // 懒加载处理 - 显示骨架屏，自动加载（通过 useEffect 触发）
  if (lazyLoad && !hasLoaded && !loading) {
    return (
      <div style={{ padding: '24px' }}>
        <Card title="监控图表">
          <Skeleton active paragraph={{ rows: 8 }} />
        </Card>
      </div>
    );
  }

  if (loading && !metrics) {
    return (
      <div style={{ padding: '24px' }}>
        <Card title="监控图表">
          <Skeleton active paragraph={{ rows: 8 }} />
        </Card>
      </div>
    );
  }
  /* genAI_main_end */

  if (!metrics) {
    return (
      <Alert
        message="监控数据不可用"
        description="请检查监控配置是否正确，或监控数据源是否可用。"
        type="warning"
        showIcon
      />
    );
  }

  return (
    <div>
      <Card
        title="监控图表"
        extra={
          <Space>
            <Select
              value={timeRange}
              onChange={setTimeRange}
              style={{ width: 100 }}
            >
              <Option value="1h">1小时</Option>
              <Option value="6h">6小时</Option>
              <Option value="24h">24小时</Option>
              <Option value="7d">7天</Option>
            </Select>
            <Select
              value={step}
              onChange={setStep}
              style={{ width: 100 }}
            >
              <Option value="15s">15秒</Option>
              <Option value="1m">1分钟</Option>
              <Option value="5m">5分钟</Option>
              <Option value="15m">15分钟</Option>
              <Option value="1h">1小时</Option>
            </Select>
            {/* genAI_main_start */}
            <Space>
              <span>自动刷新</span>
              <Switch
                checked={autoRefresh}
                onChange={setAutoRefresh}
                checkedChildren="开"
                unCheckedChildren="关"
              />
            </Space>
            {/* genAI_main_end */}
            <Button
              icon={<ReloadOutlined />}
              onClick={fetchMetrics}
              loading={loading}
            >
              刷新
            </Button>
          </Space>
        }
      >
        
        <Row gutter={[16, 16]}>
          {/* genAI_main_start */}
          {/* 集群概览（仅在集群类型时显示） */}
          {type === 'cluster' && metrics.cluster_overview && (
            <>
              {/* 资源总量 */}
              <Col span={24}>
                <Card size="small" title="集群资源总量">
                  <Row gutter={16}>
                    <Col span={6}>
                      <Statistic
                        title="CPU 总核数"
                        value={metrics.cluster_overview.total_cpu_cores}
                        suffix="cores"
                        valueStyle={{ color: '#52c41a' }}
                      />
                    </Col>
                    <Col span={6}>
                      <Statistic
                        title="内存总数"
                        value={formatValue(metrics.cluster_overview.total_memory, 'bytes')}
                        valueStyle={{ color: '#fa8c16' }}
                      />
                    </Col>
                    <Col span={6}>
                      <Statistic
                        title="Pod 最大可创建数"
                        value={metrics.cluster_overview.max_pods}
                        valueStyle={{ color: '#722ed1' }}
                      />
                    </Col>
                  </Row>
                </Card>
              </Col>

              {/* Pod 状态 */}
              <Col span={24}>
                <Card size="small" title="Pod 状态">
                  <Row gutter={16}>
                    <Col span={6}>
                      <Statistic
                        title="Pod 已创建数"
                        value={metrics.cluster_overview.created_pods}
                        valueStyle={{ color: '#1890ff' }}
                      />
                    </Col>
                    <Col span={6}>
                      <Statistic
                        title="Pod 可创建数"
                        value={metrics.cluster_overview.available_pods}
                        valueStyle={{ color: '#52c41a' }}
                      />
                    </Col>
                    <Col span={6}>
                      <Statistic
                        title="Pod 使用率"
                        value={metrics.cluster_overview.pod_usage_rate.toFixed(2)}
                        suffix="%"
                        valueStyle={{ 
                          color: metrics.cluster_overview.pod_usage_rate > 80 ? '#cf1322' : '#3f8600' 
                        }}
                      />
                    </Col>
                  </Row>
                </Card>
              </Col>

              {/* 集群状态 */}
              <Col span={24}>
                <Card size="small" title="集群状态">
                  <Row gutter={16}>
                    <Col span={8}>
                      <Statistic
                        title="Etcd Leader 状态"
                        value={metrics.cluster_overview.etcd_has_leader ? 'YES' : 'NO'}
                        valueStyle={{ 
                          color: metrics.cluster_overview.etcd_has_leader ? '#52c41a' : '#cf1322' 
                        }}
                      />
                    </Col>
                    <Col span={8}>
                      <Statistic
                        title="ApiServer 近30天可用率"
                        value={metrics.cluster_overview.apiserver_availability.toFixed(4)}
                        suffix="%"
                        precision={4}
                        valueStyle={{ color: '#1890ff' }}
                      />
                    </Col>
                  </Row>
                </Card>
              </Col>

              {/* 资源配额比率 */}
              <Col span={24}>
                <Card size="small" title="资源配额比率">
                  <Row gutter={16}>
                    {metrics.cluster_overview.cpu_request_ratio && (
                      <Col span={12}>
                        <Card size="small" title="CPU Request 比率">
                          <Statistic
                            value={metrics.cluster_overview.cpu_request_ratio.current}
                            suffix="%"
                            precision={2}
                            valueStyle={{ color: '#1890ff' }}
                          />
                          {renderChart(metrics.cluster_overview.cpu_request_ratio.series, '#1890ff', '%')}
                        </Card>
                      </Col>
                    )}
                    {metrics.cluster_overview.cpu_limit_ratio && (
                      <Col span={12}>
                        <Card size="small" title="CPU Limit 比率">
                          <Statistic
                            value={metrics.cluster_overview.cpu_limit_ratio.current}
                            suffix="%"
                            precision={2}
                            valueStyle={{ 
                              color: metrics.cluster_overview.cpu_limit_ratio.current > 100 ? '#cf1322' : '#52c41a' 
                            }}
                          />
                          {renderChart(metrics.cluster_overview.cpu_limit_ratio.series, '#52c41a', '%')}
                        </Card>
                      </Col>
                    )}
                    {metrics.cluster_overview.mem_request_ratio && (
                      <Col span={12}>
                        <Card size="small" title="内存 Request 比率">
                          <Statistic
                            value={metrics.cluster_overview.mem_request_ratio.current}
                            suffix="%"
                            precision={2}
                            valueStyle={{ color: '#fa8c16' }}
                          />
                          {renderChart(metrics.cluster_overview.mem_request_ratio.series, '#fa8c16', '%')}
                        </Card>
                      </Col>
                    )}
                    {metrics.cluster_overview.mem_limit_ratio && (
                      <Col span={12}>
                        <Card size="small" title="内存 Limit 比率">
                          <Statistic
                            value={metrics.cluster_overview.mem_limit_ratio.current}
                            suffix="%"
                            precision={2}
                            valueStyle={{ 
                              color: metrics.cluster_overview.mem_limit_ratio.current > 100 ? '#cf1322' : '#52c41a' 
                            }}
                          />
                          {renderChart(metrics.cluster_overview.mem_limit_ratio.series, '#722ed1', '%')}
                        </Card>
                      </Col>
                    )}
                  </Row>
                </Card>
              </Col>

              {/* ApiServer 请求量 */}
              {metrics.cluster_overview.apiserver_request_rate && (
                <Col span={24}>
                  <Card size="small" title="ApiServer 总请求量">
                    <Statistic
                      value={metrics.cluster_overview.apiserver_request_rate.current.toFixed(2)}
                      suffix="req/s"
                      valueStyle={{ color: '#1890ff' }}
                    />
                    {renderChart(metrics.cluster_overview.apiserver_request_rate.series, '#1890ff', '')}
                  </Card>
                </Col>
              )}

              {/* 集群 CPU/内存使用率趋势图 */}
              {metrics.cluster_overview.cpu_usage_rate && (
                <Col span={12}>
                  <Card size="small" title="集群 CPU 使用率">
                    <Statistic
                      value={metrics.cluster_overview.cpu_usage_rate.current}
                      suffix="%"
                      precision={2}
                      valueStyle={{ 
                        color: metrics.cluster_overview.cpu_usage_rate.current > 80 ? '#cf1322' : '#3f8600' 
                      }}
                    />
                    {renderChart(metrics.cluster_overview.cpu_usage_rate.series, '#1890ff', '%')}
                  </Card>
                </Col>
              )}
              
              {metrics.cluster_overview.memory_usage_rate && (
                <Col span={12}>
                  <Card size="small" title="集群内存使用率">
                    <Statistic
                      value={metrics.cluster_overview.memory_usage_rate.current}
                      suffix="%"
                      precision={2}
                      valueStyle={{ 
                        color: metrics.cluster_overview.memory_usage_rate.current > 80 ? '#cf1322' : '#3f8600' 
                      }}
                    />
                    {renderChart(metrics.cluster_overview.memory_usage_rate.series, '#52c41a', '%')}
                  </Card>
                </Col>
              )}
            </>
          )}

          {/* Node 列表监控（仅在集群类型时显示） */}
          {type === 'cluster' && metrics.node_list && metrics.node_list.length > 0 && (
            <Col span={24}>
              <Card size="small" title="Node 资源使用情况">
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ backgroundColor: '#fafafa', borderBottom: '1px solid #f0f0f0' }}>
                        <th style={{ padding: '12px', textAlign: 'left' }}>节点名称</th>
                        <th style={{ padding: '12px', textAlign: 'left' }}>CPU 核数</th>
                        <th style={{ padding: '12px', textAlign: 'left' }}>CPU 使用率</th>
                        <th style={{ padding: '12px', textAlign: 'left' }}>总内存</th>
                        <th style={{ padding: '12px', textAlign: 'left' }}>内存使用率</th>
                        <th style={{ padding: '12px', textAlign: 'left' }}>状态</th>
                      </tr>
                    </thead>
                    <tbody>
                      {metrics.node_list.map((node, index) => (
                        <tr key={index} style={{ borderBottom: '1px solid #f0f0f0' }}>
                          <td style={{ padding: '12px' }}>{node.node_name}</td>
                          <td style={{ padding: '12px' }}>{node.cpu_cores} cores</td>
                          <td style={{ padding: '12px' }}>
                            <span style={{ 
                              color: node.cpu_usage_rate > 80 ? '#cf1322' : '#3f8600',
                              fontWeight: 'bold'
                            }}>
                              {node.cpu_usage_rate.toFixed(2)}%
                            </span>
                          </td>
                          <td style={{ padding: '12px' }}>{formatValue(node.total_memory, 'bytes')}</td>
                          <td style={{ padding: '12px' }}>
                            <span style={{ 
                              color: node.memory_usage_rate > 80 ? '#cf1322' : '#3f8600',
                              fontWeight: 'bold'
                            }}>
                              {node.memory_usage_rate.toFixed(2)}%
                            </span>
                          </td>
                          <td style={{ padding: '12px' }}>
                            <span style={{ 
                              color: node.status === 'Ready' ? '#52c41a' : '#cf1322' 
                            }}>
                              {node.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            </Col>
          )}
          {/* genAI_main_end */}

                    {/* genAI_main_start */}
          {/* Pod/工作负载 资源规格 */}
          {(type === 'pod' || type === 'workload') && (metrics.cpu_request || metrics.cpu_limit || metrics.memory_request || metrics.memory_limit) && (
            <Col span={24}>
              <Card size="small" title="资源规格">
                <Row gutter={16}>
                  {metrics.cpu_request && (
                    <Col span={6}>
                      <Statistic
                        title="CPU Request"
                        value={metrics.cpu_request.current.toFixed(2)}
                        suffix="cores"
                        valueStyle={{ color: '#1890ff' }}
                      />
                    </Col>
                  )}
                  {metrics.cpu_limit && (
                    <Col span={6}>
                      <Statistic
                        title="CPU Limit"
                        value={metrics.cpu_limit.current.toFixed(2)}
                        suffix="cores"
                        valueStyle={{ color: '#1890ff' }}
                      />
                    </Col>
                  )}
                  {metrics.memory_request && (
                    <Col span={6}>
                      <Statistic
                        title="Memory Request"
                        value={formatValue(metrics.memory_request.current, 'bytes')}
                        valueStyle={{ color: '#52c41a' }}
                      />
                    </Col>
                  )}
                  {metrics.memory_limit && (
                    <Col span={6}>
                      <Statistic
                        title="Memory Limit"
                        value={formatValue(metrics.memory_limit.current, 'bytes')}
                        valueStyle={{ color: '#52c41a' }}
                      />
                    </Col>
                  )}
                </Row>
              </Card>
            </Col>
          )}


          {/* genAI_main_start */}
          {/* CPU 使用率 */}
          {(type === 'pod' || type === 'workload') && metrics.cpu && (
            <Col span={12}>
              <Card size="small" title="CPU 使用">
                <Row gutter={16}>
                  <Col span={12}>
                    <Statistic
                      title="使用率"
                      value={metrics.cpu.current}
                      suffix="%"
                      precision={2}
                      valueStyle={{ color: metrics.cpu.current > 80 ? '#cf1322' : '#3f8600' }}
                    />
                  </Col>
                  {(type === 'pod' || type === 'workload') && metrics.cpu_usage_absolute && (
                    <Col span={12}>
                      <Statistic
                        title="实际使用"
                        value={metrics.cpu_usage_absolute.current.toFixed(3)}
                        suffix="cores"
                        precision={3}
                        valueStyle={{ color: '#1890ff' }}
                      />
                    </Col>
                  )}
                </Row>
                {/* 工作负载类型显示多Pod曲线，Pod类型显示单条曲线 */}
                {type === 'workload' && metrics.cpu_multi ? (
                  renderMultiSeriesChart(metrics.cpu_multi.series, '%')
                ) : (
                  renderChart(metrics.cpu.series, '#1890ff', '%')
                )}
              </Card>
            </Col>
          )}
          {/* genAI_main_end */}

          {/* genAI_main_start */}
          {/* 内存使用率 */}
          {(type === 'pod' || type === 'workload') && metrics.memory && (
            <Col span={12}>
              <Card size="small" title="内存使用">
                <Row gutter={16}>
                  <Col span={12}>
                    <Statistic
                      title="使用率"
                      value={metrics.memory.current}
                      suffix="%"
                      precision={2}
                      valueStyle={{ color: metrics.memory.current > 80 ? '#cf1322' : '#3f8600' }}
                    />
                  </Col>
                  {(type === 'pod' || type === 'workload') && metrics.memory_usage_bytes && (
                    <Col span={12}>
                      <Statistic
                        title="实际使用"
                        value={formatValue(metrics.memory_usage_bytes.current, 'bytes')}
                        valueStyle={{ color: '#52c41a' }}
                      />
                    </Col>
                  )}
                </Row>
                {/* 工作负载类型显示多Pod曲线，Pod类型显示单条曲线 */}
                {type === 'workload' && metrics.memory_multi ? (
                  renderMultiSeriesChart(metrics.memory_multi.series, '%')
                ) : (
                  renderChart(metrics.memory.series, '#52c41a', '%')
                )}
              </Card>
            </Col>
          )}
          {/* genAI_main_end */}

          {/* genAI_main_start */}
          {/* 容器重启次数 */}
          {(type === 'pod' || type === 'workload') && metrics.container_restarts && (
            <Col span={12}>
              <Card size="small" title="容器重启次数">
                <Statistic
                  value={metrics.container_restarts.current}
                  precision={0}
                  suffix="次"
                  valueStyle={{ color: metrics.container_restarts.current > 0 ? '#cf1322' : '#3f8600' }}
                />
                {type === 'workload' && metrics.container_restarts_multi ? (
                  renderMultiSeriesChart(metrics.container_restarts_multi.series, '次')
                ) : (
                  renderChart(metrics.container_restarts.series, '#ff4d4f', '次 ')
                )}
              </Card>
            </Col>
          )}
          {/* genAI_main_end */}

          {/* genAI_main_start */}
          {/* OOM Kill 次数 */}
          {(type === 'pod' || type === 'workload') && metrics.oom_kills && (
            <Col span={12}>
              <Card size="small" title="OOM Kill 次数">
                <Statistic
                  value={metrics.oom_kills.current}
                  precision={0}
                  suffix="次"
                  valueStyle={{ color: metrics.oom_kills.current > 0 ? '#cf1322' : '#3f8600' }}
                />
                {type === 'workload' && metrics.oom_kills_multi ? (
                  renderMultiSeriesChart(metrics.oom_kills_multi.series, '次')
                ) : (
                  renderChart(metrics.oom_kills.series, '#ff4d4f', '次 ')
                )}
              </Card>
            </Col>
          )}
          {/* genAI_main_end */}

          {/* genAI_main_start */}
          {/* 健康检查失败次数 */}
          {(type === 'pod' || type === 'workload') && metrics.probe_failures && (
            <Col span={12}>
              <Card size="small" title="健康检查失败次数">
                <Statistic
                  value={metrics.probe_failures.current}
                  precision={2}
                  suffix="次/分钟"
                  valueStyle={{ color: metrics.probe_failures.current > 0 ? '#cf1322' : '#3f8600' }}
                />
                {type === 'workload' && metrics.probe_failures_multi ? (
                  renderMultiSeriesChart(metrics.probe_failures_multi.series, '次')
                ) : (
                  renderChart(metrics.probe_failures.series, '#faad14', '次 ')
                )}
              </Card>
            </Col>
          )}
          {/* genAI_main_end */}

          {/* 网络流量 */}
          {metrics.network && (
            <Col span={24}>
              <Card size="small" title="网络流量">
                <Row gutter={16}>
                  <Col span={12}>
                    {/* genAI_main_start */}
                    <Statistic
                      title="入站流量"
                      value={formatValue(metrics.network.in.current, 'bytes')}
                      suffix="/s"
                      precision={2}
                    />
                    {/* genAI_main_end */}
                  </Col>
                  <Col span={12}>
                    {/* genAI_main_start */}
                    <Statistic
                      title="出站流量"
                      value={formatValue(metrics.network.out.current, 'bytes')}
                      suffix="/s"
                      precision={2}
                    />
                    {/* genAI_main_end */}
                  </Col>
                </Row>
                {renderNetworkChart(metrics.network.in.series, metrics.network.out.series, 'bytes', '入站', '出站')}
              </Card>
            </Col>
          )}

          {/* 存储使用率 */}
          {metrics.storage && (
            <Col span={12}>
              <Card size="small" title="存储使用率">
                <Statistic
                  value={metrics.storage.current}
                  suffix="%"
                  precision={2}
                  valueStyle={{ color: metrics.storage.current > 80 ? '#cf1322' : '#3f8600' }}
                />
                {renderChart(metrics.storage.series, '#fa8c16', '%')}
              </Card>
            </Col>
          )}

          {/* Pod 统计 */}
          {metrics.pods && (
            <Col span={12}>
              <Card size="small" title="Pod 状态">
                <Row gutter={16}>
                  <Col span={6}>
                    <Statistic
                      title="总数"
                      value={metrics.pods.total}
                      valueStyle={{ color: '#1890ff' }}
                    />
                  </Col>
                  <Col span={6}>
                    <Statistic
                      title="运行中"
                      value={metrics.pods.running}
                      valueStyle={{ color: '#52c41a' }}
                    />
                  </Col>
                  <Col span={6}>
                    <Statistic
                      title="等待中"
                      value={metrics.pods.pending}
                      valueStyle={{ color: '#faad14' }}
                    />
                  </Col>
                  <Col span={6}>
                    <Statistic
                      title="失败"
                      value={metrics.pods.failed}
                      valueStyle={{ color: '#cf1322' }}
                    />
                  </Col>
                </Row>
              </Card>
            </Col>
          )}

          {/* genAI_main_start */}
          {/* 网络 PPS */}
          {(type === 'pod' || type === 'workload') && metrics.network_pps && (
            <Col span={24}>
              <Card size="small" title="网络 PPS（包/秒）">
                <Row gutter={16}>
                  <Col span={12}>
                    <Statistic
                      title="入站 PPS"
                      value={metrics.network_pps.in.current.toFixed(2)}
                      suffix="pps"
                    />
                  </Col>
                  <Col span={12}>
                    <Statistic
                      title="出站 PPS"
                      value={metrics.network_pps.out.current.toFixed(2)}
                      suffix="pps"
                    />
                  </Col>
                </Row>
                {renderNetworkChart(metrics.network_pps.in.series, metrics.network_pps.out.series, '', '入站', '出站')}
              </Card>
            </Col>
          )}
          {/* genAI_main_end */}

          {/* genAI_main_start */}
          {/* 磁盘 IOPS */}
          {(type === 'pod' || type === 'workload') && metrics.disk_iops && (
            <Col span={24}>
              <Card size="small" title="磁盘 IOPS">
                <Row gutter={16}>
                  <Col span={12}>
                    <Statistic
                      title="读 IOPS"
                      value={metrics.disk_iops.read.current.toFixed(2)}
                      suffix="ops/s"
                    />
                  </Col>
                  <Col span={12}>
                    <Statistic
                      title="写 IOPS"
                      value={metrics.disk_iops.write.current.toFixed(2)}
                      suffix="ops/s"
                    />
                  </Col>
                </Row>
                {renderNetworkChart(metrics.disk_iops.read.series, metrics.disk_iops.write.series, '', '读', '写')}
              </Card>
            </Col>
          )}
          {/* genAI_main_end */}

          {/* genAI_main_start */}
          {/* 磁盘吞吐量 */}
          {(type === 'pod' || type === 'workload') && metrics.disk_throughput && (
            <Col span={24}>
              <Card size="small" title="磁盘吞吐量">
                <Row gutter={16}>
                  <Col span={12}>
                    <Statistic
                      title="读吞吐量"
                      value={formatValue(metrics.disk_throughput.read.current, 'bytes')}
                      suffix="/s"
                    />
                  </Col>
                  <Col span={12}>
                    <Statistic
                      title="写吞吐量"
                      value={formatValue(metrics.disk_throughput.write.current, 'bytes')}
                      suffix="/s"
                    />
                  </Col>
                </Row>
                {renderNetworkChart(metrics.disk_throughput.read.series, metrics.disk_throughput.write.series, 'bytes', '读', '写')}
              </Card>
            </Col>
          )}
          {/* genAI_main_end */}

          {/* genAI_main_start */}
          {/* 线程数 */}
          {(type === 'pod' || type === 'workload') && metrics.threads && (
            <Col span={12}>
              <Card size="small" title="线程数">
                <Statistic
                  value={metrics.threads.current}
                  precision={0}
                  valueStyle={{ color: '#722ed1' }}
                />
                {type === 'workload' && metrics.threads_multi ? (
                  renderMultiSeriesChart(metrics.threads_multi.series, '次')
                ) : (
                  renderChart(metrics.threads.series, '#722ed1', '次 ')
                )}
              </Card>
            </Col>
          )}
          {/* genAI_main_end */}

          {/* genAI_main_start */}
          {/* CPU 限流情况 */}
          {(type === 'pod' || type === 'workload') && (metrics.cpu_throttling || metrics.cpu_throttling_time) && (
            <Col span={24}>
              <Card size="small" title="CPU 限流情况">
                <Row gutter={16}>
                  {metrics.cpu_throttling && (
                    <Col span={12}>
                      <Card size="small" title="CPU 限流比例">
                        <Statistic
                          value={metrics.cpu_throttling.current}
                          suffix="%"
                          precision={2}
                          valueStyle={{ color: metrics.cpu_throttling.current > 10 ? '#cf1322' : '#3f8600' }}
                        />
                        {type === 'workload' && metrics.cpu_throttling_multi ? (
                          renderMultiSeriesChart(metrics.cpu_throttling_multi.series, '%')
                        ) : (
                          renderChart(metrics.cpu_throttling.series, '#ff7a45', '%')
                        )}
                      </Card>
                    </Col>
                  )}
                  {metrics.cpu_throttling_time && (
                    <Col span={12}>
                      <Card size="small" title="CPU 限流时间">
                        <Statistic
                          value={metrics.cpu_throttling_time.current}
                          suffix="秒"
                          precision={2}
                          valueStyle={{ color: metrics.cpu_throttling_time.current > 1 ? '#cf1322' : '#3f8600' }}
                        />
                        {type === 'workload' && metrics.cpu_throttling_time_multi ? (
                          renderMultiSeriesChart(metrics.cpu_throttling_time_multi.series, '秒')
                        ) : (
                          renderChart(metrics.cpu_throttling_time.series, '#ff4d4f', '秒 ')
                        )}
                      </Card>
                    </Col>
                  )}
                </Row>
              </Card>
            </Col>
          )}
          {/* genAI_main_end */}

          {/* genAI_main_start */}
          {/* 网卡丢包情况 */}
          {(type === 'pod' || type === 'workload') && metrics.network_drops && (
            <Col span={24}>
              <Card size="small" title="网卡丢包情况">
                <Row gutter={16}>
                  <Col span={12}>
                    <Statistic
                      title="接收丢包"
                      value={metrics.network_drops.receive.current.toFixed(2)}
                      suffix="包/秒"
                      valueStyle={{ color: metrics.network_drops.receive.current > 0 ? '#cf1322' : '#3f8600' }}
                    />
                  </Col>
                  <Col span={12}>
                    <Statistic
                      title="发送丢包"
                      value={metrics.network_drops.transmit.current.toFixed(2)}
                      suffix="包/秒"
                      valueStyle={{ color: metrics.network_drops.transmit.current > 0 ? '#cf1322' : '#3f8600' }}
                    />
                  </Col>
                </Row>
                {type === 'workload' && metrics.network_drops_multi ? (
                  renderMultiSeriesChart(metrics.network_drops_multi.series, '包/秒')
                ) : (
                  renderNetworkChart(metrics.network_drops.receive.series, metrics.network_drops.transmit.series, '', '接收', '发送')
                )}
              </Card>
            </Col>
          )}
          {/* genAI_main_end */}
        </Row>
      </Card>
    </div>
  );
};

export default MonitoringCharts;