// Grafana Dashboard 和 Panel 配置
// ⚠️ 请根据实际情况修改 UID 和 Panel ID

export const GRAFANA_CONFIG = {
  cluster: {
    // 使用项目自带的集群概览 Dashboard
    dashboardUid: 'kubepolaris-cluster-overview',
    panels: {
      // 集群资源总量
      cpuTotal: 85,
      cpuUsed: 87,
      memoryTotal: 89,
      memoryUsed: 90,
      podCapacity: 91,
      podRunning: 92,
      // 集群状态
      nodeReady: 63,
      nodeNotReady: 65,
      podHealthy: 69,
      // 资源使用趋势
      cpuUsageTrend: 2,
      memoryUsageTrend: 4,
      // 网络
      networkReceive: 73,
      networkTransmit: 75,
    },
  },
  node: {
    // ⚠️ 修改为你导入的节点 Dashboard UID
    dashboardUid: 'node-exporter-full',
    panels: {
      cpuUsage: 2,
      memoryUsage: 4,
      diskUsage: 6,
      networkIO: 8,
      loadAverage: 10,
    },
  },
  pod: {
    // ⚠️ 修改为你导入的 Pod Dashboard UID
    // 推荐使用 Dashboard ID: 6417 (Kubernetes Pod Monitoring)
    dashboardUid: 'k8s-pod-monitoring',
    panels: {
      cpuUsage: 2,
      memoryUsage: 4,
      networkTraffic: 6,
      containerRestarts: 8,
      cpuThrottling: 10,
      diskIO: 12,
    },
  },
  workload: {
    // ⚠️ 修改为你导入的工作负载 Dashboard UID
    dashboardUid: 'k8s-workload-monitoring',
    panels: {
      cpuUsageMulti: 2,
      memoryUsageMulti: 4,
      podStatus: 6,
      replicaCount: 8,
      restartCount: 10,
    },
  },
  // 工作负载详情监控 Dashboard 配置
  workloadDetail: {
    dashboardUid: 'kubepolaris-workload-detail',
    panels: {
      // 资源使用
      cpuUsage: 2,              // CPU 使用率
      memoryUsage: 6,           // Memory 使用率
      ioReadQps: 18,            // IO Read QPS
      ioWriteQps: 19,           // IO Write QPS
      // 容器状态
      cpuLimit: 28,             // CPU 核限制
      memoryLimit: 30,          // 内存限制
      availability: 34,         // 容器整体可用率
      healthCheckFailed: 36,    // 健康检查失败次数
      containerRestarts: 38,    // 容器重启情况
      // 网络流量
      networkIncoming: 4,       // Network Incoming
      networkOutgoing: 14,      // Network Outgoing
      networkInputPps: 15,      // Network Input PPS
      networkOutputPps: 16,     // Network Output PPS
      // 系统资源
      fileDescriptors: 22,      // 文件句柄打开数
      runningThreads: 23,       // Running Threads
      networkInputDropped: 12,  // Network Input Dropped
      networkOutputDropped: 20, // Network Output Dropped
      // CPU 限流
      cpuThrottleRate: 46,      // CPU限流比例
      cpuThrottleTime: 32,      // CPU节流时间
    },
  },
};

// 时间范围映射
export const TIME_RANGE_MAP: Record<string, { from: string; to: string }> = {
  '1h': { from: 'now-1h', to: 'now' },
  '6h': { from: 'now-6h', to: 'now' },
  '24h': { from: 'now-24h', to: 'now' },
  '7d': { from: 'now-7d', to: 'now' },
};

// 根据集群名生成 Grafana 数据源 UID
// 与后端 GenerateDataSourceUID 保持一致
export const generateDataSourceUID = (clusterName: string): string => {
  const uid = clusterName.toLowerCase().replace(/[_ ]/g, '-');
  return `prometheus-${uid}`;
};
