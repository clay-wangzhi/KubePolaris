package services

import (
	"context"
	"crypto/tls"
	"encoding/json"
	"fmt"
	"io"
	"math"
	"net/http"
	"net/url"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/clay-wangzhi/KubePolaris/internal/models"
	"github.com/clay-wangzhi/KubePolaris/pkg/logger"
)

// PrometheusService Prometheus 查询服务
type PrometheusService struct {
	httpClient *http.Client
}

// NewPrometheusService 创建 Prometheus 服务
func NewPrometheusService() *PrometheusService {
	return &PrometheusService{
		httpClient: &http.Client{
			Timeout: 30 * time.Second,
			Transport: &http.Transport{
				TLSClientConfig: &tls.Config{
					InsecureSkipVerify: true, // 可根据需要调整
				},
			},
		},
	}
}

// QueryPrometheus 查询 Prometheus
func (s *PrometheusService) QueryPrometheus(ctx context.Context, config *models.MonitoringConfig, query *models.MetricsQuery) (*models.MetricsResponse, error) {
	if config.Type == "disabled" {
		return nil, fmt.Errorf("监控功能已禁用")
	}

	// 构建查询 URL
	queryURL, err := s.buildQueryURL(config.Endpoint, query)
	if err != nil {
		return nil, fmt.Errorf("构建查询URL失败: %w", err)
	}

	// 创建请求
	req, err := http.NewRequestWithContext(ctx, "GET", queryURL.String(), nil)
	if err != nil {
		return nil, fmt.Errorf("创建请求失败: %w", err)
	}

	// 设置认证
	if err := s.setAuth(req, config.Auth); err != nil {
		return nil, fmt.Errorf("设置认证失败: %w", err)
	}

	// 执行请求
	resp, err := s.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("执行请求失败: %w", err)
	}
	defer func() {
		_ = resp.Body.Close()
	}()

	// 读取响应
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("读取响应失败: %w", err)
	}

	// 检查状态码
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("查询失败: %s, 状态码: %d", string(body), resp.StatusCode)
	}

	// 解析响应
	var result models.MetricsResponse
	if err := json.Unmarshal(body, &result); err != nil {
		return nil, fmt.Errorf("解析响应失败: %w", err)
	}

	return &result, nil
}

// QueryClusterMetrics 查询集群监控指标（使用并发查询优化性能）
func (s *PrometheusService) QueryClusterMetrics(ctx context.Context, config *models.MonitoringConfig, clusterName string, timeRange string, step string) (*models.ClusterMetricsData, error) {
	// 解析时间范围
	start, end, err := s.parseTimeRange(timeRange)
	if err != nil {
		return nil, fmt.Errorf("解析时间范围失败: %w", err)
	}

	metrics := &models.ClusterMetricsData{}

	// 构建集群标签选择器
	// 如果是 prometheus，标签不用过来
	clusterSelector := ""

	// 使用 WaitGroup 和 Mutex 进行并发查询
	var wg sync.WaitGroup
	var mu sync.Mutex

	// 并发查询 CPU 使用率
	wg.Add(1)
	go func() {
		defer wg.Done()
		if cpuSeries, err := s.queryMetricSeries(ctx, config, "(1 - avg(rate(node_cpu_seconds_total{mode=\"idle\"}[1m]))) * 100", start, end, step); err == nil {
			mu.Lock()
			metrics.CPU = cpuSeries
			mu.Unlock()
		}
	}()

	// 并发查询内存使用率
	wg.Add(1)
	go func() {
		defer wg.Done()
		if memorySeries, err := s.queryMetricSeries(ctx, config, "(1 - sum(node_memory_MemAvailable_bytes) / sum(node_memory_MemTotal_bytes)) * 100", start, end, step); err == nil {
			mu.Lock()
			metrics.Memory = memorySeries
			mu.Unlock()
		}
	}()

	// 并发查询网络指标
	wg.Add(1)
	go func() {
		defer wg.Done()
		if networkMetrics, err := s.queryNetworkMetrics(ctx, config, clusterSelector, start, end, step); err == nil {
			mu.Lock()
			metrics.Network = networkMetrics
			mu.Unlock()
		}
	}()

	// 并发查询 Pod 指标
	wg.Add(1)
	go func() {
		defer wg.Done()
		if podMetrics, err := s.queryPodMetrics(ctx, config, clusterSelector); err == nil {
			mu.Lock()
			metrics.Pods = podMetrics
			mu.Unlock()
		}
	}()

	// 并发查询集群概览指标
	wg.Add(1)
	go func() {
		defer wg.Done()
		if clusterOverview, err := s.queryClusterOverview(ctx, config, clusterName, start, end, step); err == nil {
			mu.Lock()
			metrics.ClusterOverview = clusterOverview
			mu.Unlock()
		}
	}()

	// 并发查询节点列表指标
	wg.Add(1)
	go func() {
		defer wg.Done()
		if nodeList, err := s.QueryNodeListMetrics(ctx, config, clusterName); err == nil {
			mu.Lock()
			metrics.NodeList = nodeList
			mu.Unlock()
		}
	}()

	// 等待所有查询完成
	wg.Wait()

	return metrics, nil
}

// QueryNodeMetrics 查询节点监控指标
func (s *PrometheusService) QueryNodeMetrics(ctx context.Context, config *models.MonitoringConfig, clusterName, nodeName string, timeRange string, step string) (*models.ClusterMetricsData, error) {
	// 解析时间范围
	start, end, err := s.parseTimeRange(timeRange)
	if err != nil {
		return nil, fmt.Errorf("解析时间范围失败: %w", err)
	}

	metrics := &models.ClusterMetricsData{}

	// 构建节点标签选择器
	nodeSelector := s.buildNodeSelector(config.Labels, clusterName, nodeName)

	// 查询节点 CPU 使用率
	if cpuSeries, err := s.queryMetricSeries(ctx, config, fmt.Sprintf("rate(node_cpu_seconds_total{mode!=\"idle\",%s}[5m])", nodeSelector), start, end, step); err == nil {
		metrics.CPU = cpuSeries
	}

	// 查询节点内存使用率
	if memorySeries, err := s.queryMetricSeries(ctx, config, fmt.Sprintf("(1 - (node_memory_MemAvailable_bytes{%s} / node_memory_MemTotal_bytes{%s}))", nodeSelector, nodeSelector), start, end, step); err == nil {
		metrics.Memory = memorySeries
	}

	// 查询节点网络指标
	if networkMetrics, err := s.queryNodeNetworkMetrics(ctx, config, nodeSelector, start, end, step); err == nil {
		metrics.Network = networkMetrics
	}

	// 查询节点存储指标
	if storageSeries, err := s.queryMetricSeries(ctx, config, fmt.Sprintf("(1 - (node_filesystem_avail_bytes{%s} / node_filesystem_size_bytes{%s}))", nodeSelector, nodeSelector), start, end, step); err == nil {
		metrics.Storage = storageSeries
	}

	return metrics, nil
}

// QueryPodMetrics 查询 Pod 监控指标
func (s *PrometheusService) QueryPodMetrics(ctx context.Context, config *models.MonitoringConfig, clusterName, namespace, podName string, timeRange string, step string) (*models.ClusterMetricsData, error) {
	// 解析时间范围
	start, end, err := s.parseTimeRange(timeRange)
	if err != nil {
		return nil, fmt.Errorf("解析时间范围失败: %w", err)
	}

	metrics := &models.ClusterMetricsData{}

	// 构建 Pod 标签选择器
	podSelector := s.buildPodSelector(config.Labels, clusterName, namespace, podName)

	// 查询 Pod CPU 使用率
	if cpuSeries, err := s.queryMetricSeries(ctx, config, fmt.Sprintf("sum (rate(container_cpu_usage_seconds_total{container!=\"\",%s}[1m])) by(pod) /( sum (kube_pod_container_resource_limits{container!=\"\",resource=\"cpu\",%s}) by(pod) ) * 100", podSelector, podSelector), start, end, step); err == nil {
		metrics.CPU = cpuSeries
	}

	// 查询 Pod 内存使用率
	if memorySeries, err := s.queryMetricSeries(ctx, config, fmt.Sprintf("sum(container_memory_working_set_bytes{container!=\"\",container!=\"POD\",%s}) by(pod)/sum(kube_pod_container_resource_limits{container!=\"\",container!=\"POD\",resource=\"memory\",%s}) by (pod) * 100", podSelector, podSelector), start, end, step); err == nil {
		// if memorySeries, err := s.queryMetricSeries(ctx, config, fmt.Sprintf("container_memory_working_set_bytes{%s}", podSelector), start, end, step); err == nil {
		metrics.Memory = memorySeries
	}

	// 查询 Pod 网络指标
	if networkMetrics, err := s.queryPodNetworkMetrics(ctx, config, podSelector, start, end, step); err == nil {
		metrics.Network = networkMetrics
	}

	// 查询 CPU Request（固定值）
	if cpuRequest, err := s.queryMetricSeries(ctx, config, fmt.Sprintf("sum(kube_pod_container_resource_requests{resource=\"cpu\",%s}) by (pod)", podSelector), start, end, step); err == nil {
		metrics.CPURequest = cpuRequest
	}

	// 查询 CPU Limit（固定值）
	if cpuLimit, err := s.queryMetricSeries(ctx, config, fmt.Sprintf("sum(kube_pod_container_resource_limits{resource=\"cpu\",%s}) by (pod)", podSelector), start, end, step); err == nil {
		metrics.CPULimit = cpuLimit
	}

	// 查询 Memory Request（固定值）
	if memoryRequest, err := s.queryMetricSeries(ctx, config, fmt.Sprintf("sum(kube_pod_container_resource_requests{resource=\"memory\",%s}) by (pod)", podSelector), start, end, step); err == nil {
		metrics.MemoryRequest = memoryRequest
	}

	// 查询 Memory Limit（固定值）
	if memoryLimit, err := s.queryMetricSeries(ctx, config, fmt.Sprintf("sum(kube_pod_container_resource_limits{resource=\"memory\",%s}) by (pod)", podSelector), start, end, step); err == nil {
		metrics.MemoryLimit = memoryLimit
	}

	// 查询健康检查失败次数
	if probeFailures, err := s.queryMetricSeries(ctx, config, fmt.Sprintf("increase(prober_probe_total{result='failed',%s}[1m])", podSelector), start, end, step); err == nil {
		metrics.ProbeFailures = probeFailures
	}

	// 查询容器重启次数
	if restarts, err := s.queryMetricSeries(ctx, config, fmt.Sprintf("kube_pod_container_status_restarts_total{%s}", podSelector), start, end, step); err == nil {
		metrics.ContainerRestarts = restarts
	}

	// 查询网络PPS
	if networkPPS, err := s.queryPodNetworkPPS(ctx, config, podSelector, start, end, step); err == nil {
		metrics.NetworkPPS = networkPPS
	}

	// 查询线程数
	if threads, err := s.queryMetricSeries(ctx, config, fmt.Sprintf("sum(container_threads{container!=\"\",container!=\"POD\",%s})", podSelector), start, end, step); err == nil {
		metrics.Threads = threads
	}

	// 查询网卡丢包情况
	if networkDrops, err := s.queryPodNetworkDrops(ctx, config, podSelector, start, end, step); err == nil {
		metrics.NetworkDrops = networkDrops
	}

	// 查询 CPU 限流比例
	if cpuThrottling, err := s.queryMetricSeries(ctx, config, fmt.Sprintf("sum(rate(container_cpu_cfs_throttled_periods_total{%s}[1m])) / sum(rate(container_cpu_cfs_periods_total{%s}[5m])) * 100", podSelector, podSelector), start, end, step); err == nil {
		metrics.CPUThrottling = cpuThrottling
	}

	// 查询 CPU 限流时间
	if cpuThrottlingTime, err := s.queryMetricSeries(ctx, config, fmt.Sprintf("sum(rate(container_cpu_cfs_throttled_seconds_total{%s}[1m]))", podSelector), start, end, step); err == nil {
		metrics.CPUThrottlingTime = cpuThrottlingTime
	}

	// 查询磁盘 IOPS
	if diskIOPS, err := s.queryPodDiskIOPS(ctx, config, podSelector, start, end, step); err == nil {
		metrics.DiskIOPS = diskIOPS
	}

	// 查询磁盘吞吐量
	if diskThroughput, err := s.queryPodDiskThroughput(ctx, config, podSelector, start, end, step); err == nil {
		metrics.DiskThroughput = diskThroughput
	}

	// 查询 CPU 实际使用量（cores）
	if cpuAbsolute, err := s.queryMetricSeries(ctx, config, fmt.Sprintf("sum(rate(container_cpu_usage_seconds_total{container!=\"\",container!=\"POD\",%s}[1m]))", podSelector), start, end, step); err == nil {
		metrics.CPUUsageAbsolute = cpuAbsolute
	}

	// 查询内存实际使用量（bytes）
	if memoryBytes, err := s.queryMetricSeries(ctx, config, fmt.Sprintf("sum(container_memory_working_set_bytes{container!=\"\",container!=\"POD\",%s})", podSelector), start, end, step); err == nil {
		metrics.MemoryUsageBytes = memoryBytes
	}

	// 查询 OOM Kill 次数
	if oomKills, err := s.queryMetricSeries(ctx, config, fmt.Sprintf("sum(container_oom_events_total{container!=\"\",container!=\"POD\",%s})", podSelector), start, end, step); err == nil {
		metrics.OOMKills = oomKills
	}

	return metrics, nil
}

// QueryWorkloadMetrics 查询工作负载监控指标（聚合多个Pod的数据）
func (s *PrometheusService) QueryWorkloadMetrics(ctx context.Context, config *models.MonitoringConfig, clusterName, namespace, workloadName string, timeRange string, step string) (*models.ClusterMetricsData, error) {
	// 解析时间范围
	start, end, err := s.parseTimeRange(timeRange)
	if err != nil {
		return nil, fmt.Errorf("解析时间范围失败: %w", err)
	}

	metrics := &models.ClusterMetricsData{}

	// 构建工作负载标签选择器（使用正则表达式匹配pod名称）
	workloadSelector := s.buildWorkloadSelector(config.Labels, clusterName, namespace, workloadName)

	// 查询工作负载 CPU 使用率
	if cpuSeries, err := s.queryMetricSeries(ctx, config, fmt.Sprintf("sum (rate(container_cpu_usage_seconds_total{container!=\"\",%s}[1m])) /( sum (kube_pod_container_resource_limits{container!=\"\",resource=\"cpu\",%s}) ) * 100", workloadSelector, workloadSelector), start, end, step); err == nil {
		metrics.CPU = cpuSeries
	}

	// 查询工作负载内存使用率
	if memorySeries, err := s.queryMetricSeries(ctx, config, fmt.Sprintf("sum(container_memory_working_set_bytes{container!=\"\",container!=\"POD\",%s})/sum(kube_pod_container_resource_limits{container!=\"\",container!=\"POD\",resource=\"memory\",%s}) * 100", workloadSelector, workloadSelector), start, end, step); err == nil {
		metrics.Memory = memorySeries
	}

	// 查询工作负载网络指标
	if networkMetrics, err := s.queryWorkloadNetworkMetrics(ctx, config, workloadSelector, start, end, step); err == nil {
		metrics.Network = networkMetrics
	}

	// 查询 CPU Request（固定值）
	if cpuRequest, err := s.queryMetricSeries(ctx, config, fmt.Sprintf("sum(kube_pod_container_resource_requests{resource=\"cpu\",%s})/count(kube_pod_container_resource_requests{resource=\"cpu\",%s})", workloadSelector, workloadSelector), start, end, step); err == nil {
		metrics.CPURequest = cpuRequest
	}

	// 查询 CPU Limit（固定值）
	if cpuLimit, err := s.queryMetricSeries(ctx, config, fmt.Sprintf("sum(kube_pod_container_resource_limits{resource=\"cpu\",%s})/count(kube_pod_container_resource_limits{resource=\"cpu\",%s})", workloadSelector, workloadSelector), start, end, step); err == nil {
		metrics.CPULimit = cpuLimit
	}

	// 查询 Memory Request（固定值）
	if memoryRequest, err := s.queryMetricSeries(ctx, config, fmt.Sprintf("sum(kube_pod_container_resource_requests{resource=\"memory\",%s})/count(kube_pod_container_resource_requests{resource=\"memory\",%s})", workloadSelector, workloadSelector), start, end, step); err == nil {
		metrics.MemoryRequest = memoryRequest
	}

	// 查询 Memory Limit（固定值）
	if memoryLimit, err := s.queryMetricSeries(ctx, config, fmt.Sprintf("sum(kube_pod_container_resource_limits{resource=\"memory\",%s})/count(kube_pod_container_resource_limits{resource=\"memory\",%s})", workloadSelector, workloadSelector), start, end, step); err == nil {
		metrics.MemoryLimit = memoryLimit
	}

	// 查询健康检查失败次数
	if probeFailures, err := s.queryMetricSeries(ctx, config, fmt.Sprintf("sum(increase(prober_probe_total{result='failed',%s}[1m]))", workloadSelector), start, end, step); err == nil {
		metrics.ProbeFailures = probeFailures
	}

	// 查询容器重启次数（总和）
	if restarts, err := s.queryMetricSeries(ctx, config, fmt.Sprintf("sum(kube_pod_container_status_restarts_total{%s})", workloadSelector), start, end, step); err == nil {
		metrics.ContainerRestarts = restarts
	}

	// 查询网络PPS
	if networkPPS, err := s.queryWorkloadNetworkPPS(ctx, config, workloadSelector, start, end, step); err == nil {
		metrics.NetworkPPS = networkPPS
	}

	// 查询线程数（总和）
	if threads, err := s.queryMetricSeries(ctx, config, fmt.Sprintf("sum(container_threads{container!=\"\",container!=\"POD\",%s})", workloadSelector), start, end, step); err == nil {
		metrics.Threads = threads
	}

	// 查询网卡丢包情况
	if networkDrops, err := s.queryWorkloadNetworkDrops(ctx, config, workloadSelector, start, end, step); err == nil {
		metrics.NetworkDrops = networkDrops
	}

	// 查询 CPU 限流比例
	if cpuThrottling, err := s.queryMetricSeries(ctx, config, fmt.Sprintf("sum(rate(container_cpu_cfs_throttled_periods_total{%s}[1m])) / sum(rate(container_cpu_cfs_periods_total{%s}[5m])) * 100", workloadSelector, workloadSelector), start, end, step); err == nil {
		metrics.CPUThrottling = cpuThrottling
	}

	// 查询 CPU 限流时间
	if cpuThrottlingTime, err := s.queryMetricSeries(ctx, config, fmt.Sprintf("sum(rate(container_cpu_cfs_throttled_seconds_total{%s}[1m]))", workloadSelector), start, end, step); err == nil {
		metrics.CPUThrottlingTime = cpuThrottlingTime
	}

	// 查询磁盘 IOPS
	if diskIOPS, err := s.queryWorkloadDiskIOPS(ctx, config, workloadSelector, start, end, step); err == nil {
		metrics.DiskIOPS = diskIOPS
	}

	// 查询磁盘吞吐量
	if diskThroughput, err := s.queryWorkloadDiskThroughput(ctx, config, workloadSelector, start, end, step); err == nil {
		metrics.DiskThroughput = diskThroughput
	}

	// 查询 CPU 实际使用量（cores）
	if cpuAbsolute, err := s.queryMetricSeries(ctx, config, fmt.Sprintf("sum(rate(container_cpu_usage_seconds_total{container!=\"\",container!=\"POD\",%s}[1m]))", workloadSelector), start, end, step); err == nil {
		metrics.CPUUsageAbsolute = cpuAbsolute
	}

	// 查询内存实际使用量（bytes）
	if memoryBytes, err := s.queryMetricSeries(ctx, config, fmt.Sprintf("sum(container_memory_working_set_bytes{container!=\"\",container!=\"POD\",%s})", workloadSelector), start, end, step); err == nil {
		metrics.MemoryUsageBytes = memoryBytes
	}

	// 查询 OOM Kill 次数（总和）
	if oomKills, err := s.queryMetricSeries(ctx, config, fmt.Sprintf("sum(container_oom_events_total{container!=\"\",container!=\"POD\",%s})", workloadSelector), start, end, step); err == nil {
		metrics.OOMKills = oomKills
	}

	// 查询多Pod时间序列数据（用于展示多条曲线）
	// CPU使用率（每个Pod独立）
	if cpuMulti, err := s.queryMultiSeriesMetric(ctx, config, fmt.Sprintf("sum (rate(container_cpu_usage_seconds_total{container!=\"\",%s}[1m])) by(pod) /( sum (kube_pod_container_resource_limits{container!=\"\",resource=\"cpu\",%s}) by(pod) ) * 100", workloadSelector, workloadSelector), start, end, step); err == nil {
		metrics.CPUMulti = cpuMulti
	}

	// 内存使用率（每个Pod独立）
	if memoryMulti, err := s.queryMultiSeriesMetric(ctx, config, fmt.Sprintf("sum(container_memory_working_set_bytes{container!=\"\",%s}) by(pod) / sum(kube_pod_container_resource_limits{container!=\"\",container!=\"POD\",resource=\"memory\",%s}) by(pod) * 100", workloadSelector, workloadSelector), start, end, step); err == nil {
		metrics.MemoryMulti = memoryMulti
	}

	// 查询容器重启次数（多Pod）
	if containerRestartsMulti, err := s.queryMultiSeriesMetric(ctx, config, fmt.Sprintf("sum(kube_pod_container_status_restarts_total{%s}) by(pod)", workloadSelector), start, end, step); err == nil {
		metrics.ContainerRestartsMulti = containerRestartsMulti
	}

	// 查询 OOM Kill 次数（多Pod）
	if oomKillsMulti, err := s.queryMultiSeriesMetric(ctx, config, fmt.Sprintf("sum(container_oom_events_total{container!=\"\",container!=\"POD\",%s}) by(pod)", workloadSelector), start, end, step); err == nil {
		metrics.OOMKillsMulti = oomKillsMulti
	}

	// 查询网络PPS（多Pod）
	if networkPPSMulti, err := s.queryMultiSeriesMetric(ctx, config, fmt.Sprintf("sum(network_packets_received_total{%s}) by(pod)", workloadSelector), start, end, step); err == nil {
		metrics.NetworkPPSMulti = networkPPSMulti
	}

	// 查询线程数（多Pod）
	if threadsMulti, err := s.queryMultiSeriesMetric(ctx, config, fmt.Sprintf("sum(container_threads{container!=\"\",container!=\"POD\",%s}) by(pod)", workloadSelector), start, end, step); err == nil {
		metrics.ThreadsMulti = threadsMulti
	}

	// 查询网卡丢包情况（多Pod）
	if networkDropsMulti, err := s.queryMultiSeriesMetric(ctx, config, fmt.Sprintf("sum(network_packets_dropped_total{%s}) by(pod)", workloadSelector), start, end, step); err == nil {
		metrics.NetworkDropsMulti = networkDropsMulti
	}

	// 查询 CPU 限流比例（多Pod）
	if cpuThrottlingMulti, err := s.queryMultiSeriesMetric(ctx, config, fmt.Sprintf("sum(rate(container_cpu_cfs_throttled_periods_total{%s}[1m])) by(pod) / sum(rate(container_cpu_cfs_periods_total{%s}[5m])) by(pod) * 100", workloadSelector, workloadSelector), start, end, step); err == nil {
		metrics.CPUThrottlingMulti = cpuThrottlingMulti
	}

	// 查询 CPU 限流时间（多Pod）
	if cpuThrottlingTimeMulti, err := s.queryMultiSeriesMetric(ctx, config, fmt.Sprintf("sum(rate(container_cpu_cfs_throttled_seconds_total{%s}[1m])) by(pod)", workloadSelector), start, end, step); err == nil {
		metrics.CPUThrottlingTimeMulti = cpuThrottlingTimeMulti
	}

	// 查询磁盘 IOPS（多Pod）
	if diskIOPSMulti, err := s.queryMultiSeriesMetric(ctx, config, fmt.Sprintf("sum(disk_io_now{%s}) by(pod)", workloadSelector), start, end, step); err == nil {
		metrics.DiskIOPSMulti = diskIOPSMulti
	}

	// 查询磁盘吞吐量（多Pod）
	if diskThroughputMulti, err := s.queryMultiSeriesMetric(ctx, config, fmt.Sprintf("sum(disk_io_bytes_total{%s}) by(pod)", workloadSelector), start, end, step); err == nil {
		metrics.DiskThroughputMulti = diskThroughputMulti
	}

	// 查询健康检查失败次数（多Pod）
	if probeFailuresMulti, err := s.queryMultiSeriesMetric(ctx, config, fmt.Sprintf("sum(increase(prober_probe_total{result='failed',%s}[1m])) by(pod)", workloadSelector), start, end, step); err == nil {
		metrics.ProbeFailuresMulti = probeFailuresMulti
	}

	return metrics, nil
}

// buildQueryURL 构建查询 URL
func (s *PrometheusService) buildQueryURL(endpoint string, query *models.MetricsQuery) (*url.URL, error) {
	baseURL, err := url.Parse(endpoint)
	if err != nil {
		return nil, err
	}

	// 设置查询路径
	baseURL.Path = "/api/v1/query_range"

	// 设置查询参数
	params := url.Values{}
	params.Set("query", query.Query)
	params.Set("start", strconv.FormatInt(query.Start, 10))
	params.Set("end", strconv.FormatInt(query.End, 10))
	params.Set("step", query.Step)

	if query.Timeout != "" {
		params.Set("timeout", query.Timeout)
	}

	baseURL.RawQuery = params.Encode()
	return baseURL, nil
}

// setAuth 设置认证
func (s *PrometheusService) setAuth(req *http.Request, auth *models.MonitoringAuth) error {
	if auth == nil {
		return nil
	}

	switch auth.Type {
	case "none":
		// 无需认证，直接返回
		return nil
	case "basic":
		req.SetBasicAuth(auth.Username, auth.Password)
	case "bearer":
		req.Header.Set("Authorization", "Bearer "+auth.Token)
	case "mtls":
		// mTLS 认证需要在创建 HTTP 客户端时配置
		// 这里可以添加证书配置逻辑
		return fmt.Errorf("mTLS 认证暂未实现")
	default:
		return fmt.Errorf("不支持的认证类型: %s", auth.Type)
	}

	return nil
}

// parseTimeRange 解析时间范围
func (s *PrometheusService) parseTimeRange(timeRange string) (int64, int64, error) {
	now := time.Now()
	var duration time.Duration
	var err error

	switch timeRange {
	case "1h":
		duration = time.Hour
	case "6h":
		duration = 6 * time.Hour
	case "24h", "1d":
		duration = 24 * time.Hour
	case "7d":
		duration = 7 * 24 * time.Hour
	case "30d":
		duration = 30 * 24 * time.Hour
	default:
		duration, err = time.ParseDuration(timeRange)
		if err != nil {
			return 0, 0, fmt.Errorf("无效的时间范围: %s", timeRange)
		}
	}

	end := now.Unix()
	start := now.Add(-duration).Unix()
	return start, end, nil
}

// buildClusterSelector 构建集群标签选择器
//
//nolint:unused // 保留用于未来使用
func (s *PrometheusService) buildClusterSelector(labels map[string]string, clusterName string) string {
	selectors := []string{}

	// 添加集群标签
	if clusterName != "" {
		selectors = append(selectors, fmt.Sprintf("cluster=\"%s\"", clusterName))
	}

	// 添加自定义标签
	for key, value := range labels {
		selectors = append(selectors, fmt.Sprintf("%s=\"%s\"", key, value))
	}

	return strings.Join(selectors, ",")
}

// buildNodeSelector 构建节点标签选择器
func (s *PrometheusService) buildNodeSelector(labels map[string]string, clusterName, nodeName string) string {
	selectors := []string{}

	// 添加集群标签
	if clusterName != "" {
		selectors = append(selectors, fmt.Sprintf("cluster=\"%s\"", clusterName))
	}

	// 添加节点标签
	if nodeName != "" {
		selectors = append(selectors, fmt.Sprintf("instance=~\".*%s.*\"", nodeName))
	}

	// 添加自定义标签
	for key, value := range labels {
		selectors = append(selectors, fmt.Sprintf("%s=\"%s\"", key, value))
	}

	return strings.Join(selectors, ",")
}

// buildPodSelector 构建 Pod 标签选择器
func (s *PrometheusService) buildPodSelector(labels map[string]string, clusterName, namespace, podName string) string {
	selectors := []string{}

	// 添加集群标签
	if clusterName != "" {
		selectors = append(selectors, fmt.Sprintf("cluster=\"%s\"", clusterName))
	}

	// 添加命名空间标签
	if namespace != "" {
		selectors = append(selectors, fmt.Sprintf("namespace=\"%s\"", namespace))
	}

	// 添加 Pod 标签
	if podName != "" {
		selectors = append(selectors, fmt.Sprintf("pod=\"%s\"", podName))
	}

	// 添加自定义标签
	for key, value := range labels {
		selectors = append(selectors, fmt.Sprintf("%s=\"%s\"", key, value))
	}

	return strings.Join(selectors, ",")
}

// buildWorkloadSelector 构建工作负载标签选择器（使用正则表达式匹配pod名称）
func (s *PrometheusService) buildWorkloadSelector(labels map[string]string, clusterName, namespace, workloadName string) string {
	selectors := []string{}

	// 添加集群标签
	if clusterName != "" {
		selectors = append(selectors, fmt.Sprintf("cluster=\"%s\"", clusterName))
	}

	// 添加命名空间标签
	if namespace != "" {
		selectors = append(selectors, fmt.Sprintf("namespace=\"%s\"", namespace))
	}

	// 使用正则表达式匹配工作负载的Pod名称
	// Deployment: deployment-name-xxx-xxx
	// StatefulSet: statefulset-name-0, statefulset-name-1, ...
	// DaemonSet: daemonset-name-xxx
	// ReplicaSet: replicaset-name-xxx
	if workloadName != "" {
		selectors = append(selectors, fmt.Sprintf("pod=~\"%s-.*\"", workloadName))
	}

	// 添加自定义标签
	for key, value := range labels {
		selectors = append(selectors, fmt.Sprintf("%s=\"%s\"", key, value))
	}

	return strings.Join(selectors, ",")
}

// queryMetricSeries 查询指标时间序列
func (s *PrometheusService) queryMetricSeries(ctx context.Context, config *models.MonitoringConfig, query string, start, end int64, step string) (*models.MetricSeries, error) {
	logger.Debug("query: %s", query)
	metricsQuery := &models.MetricsQuery{
		Query: query,
		Start: start,
		End:   end,
		Step:  step,
	}

	resp, err := s.QueryPrometheus(ctx, config, metricsQuery)
	if err != nil {
		return nil, err
	}

	if len(resp.Data.Result) == 0 {
		return &models.MetricSeries{Current: 0, Series: []models.DataPoint{}}, nil
	}

	// 处理第一个结果
	result := resp.Data.Result[0]
	var series []models.DataPoint
	var current float64

	if len(result.Values) > 0 {
		// 时间序列数据
		for _, value := range result.Values {
			if len(value) >= 2 {
				timestamp, _ := strconv.ParseInt(fmt.Sprintf("%.0f", value[0]), 10, 64)
				val, _ := strconv.ParseFloat(fmt.Sprintf("%v", value[1]), 64)
				series = append(series, models.DataPoint{
					Timestamp: timestamp,
					Value:     val,
				})
			}
		}
		// 当前值取最后一个
		if len(series) > 0 {
			current = series[len(series)-1].Value
		}
	} else if len(result.Value) >= 2 {
		// 即时查询数据
		timestamp, _ := strconv.ParseInt(fmt.Sprintf("%.0f", result.Value[0]), 10, 64)
		val, _ := strconv.ParseFloat(fmt.Sprintf("%v", result.Value[1]), 64)
		series = append(series, models.DataPoint{
			Timestamp: timestamp,
			Value:     val,
		})
		current = val
	}

	return &models.MetricSeries{
		Current: current,
		Series:  series,
	}, nil
}

// queryMultiSeriesMetric 查询多时间序列指标（每个Pod一条独立曲线）
func (s *PrometheusService) queryMultiSeriesMetric(ctx context.Context, config *models.MonitoringConfig, query string, start, end int64, step string) (*models.MultiSeriesMetric, error) {
	logger.Debug("query multi-series: %s", query)
	metricsQuery := &models.MetricsQuery{
		Query: query,
		Start: start,
		End:   end,
		Step:  step,
	}

	resp, err := s.QueryPrometheus(ctx, config, metricsQuery)
	if err != nil {
		return nil, err
	}

	if len(resp.Data.Result) == 0 {
		return &models.MultiSeriesMetric{Series: []models.MultiSeriesDataPoint{}}, nil
	}

	// 构建时间戳到数据点的映射
	timestampMap := make(map[int64]map[string]float64)

	// 遍历所有结果（每个结果代表一个Pod）
	for _, result := range resp.Data.Result {
		// 获取 pod 名称
		podName := ""
		if metric, ok := result.Metric["pod"]; ok {
			podName = fmt.Sprintf("%v", metric)
		}
		if podName == "" {
			continue
		}

		// 处理时间序列数据
		if len(result.Values) > 0 {
			for _, value := range result.Values {
				if len(value) >= 2 {
					timestamp, _ := strconv.ParseInt(fmt.Sprintf("%.0f", value[0]), 10, 64)
					valStr := fmt.Sprintf("%v", value[1])

					// 跳过无效值（NaN, +Inf, -Inf等）
					if valStr == "NaN" || valStr == "+Inf" || valStr == "-Inf" || valStr == "null" {
						continue
					}

					val, err := strconv.ParseFloat(valStr, 64)
					if err != nil {
						continue
					}

					// 再次检查值是否有效
					if math.IsNaN(val) || math.IsInf(val, 0) {
						continue
					}

					if timestampMap[timestamp] == nil {
						timestampMap[timestamp] = make(map[string]float64)
					}
					timestampMap[timestamp][podName] = val
				}
			}
		}
	}

	// 将map转换为有序切片
	var timestamps []int64
	for ts := range timestampMap {
		timestamps = append(timestamps, ts)
	}

	// 排序时间戳
	sort.Slice(timestamps, func(i, j int) bool {
		return timestamps[i] < timestamps[j]
	})

	// 构建最终的时间序列数据
	var series []models.MultiSeriesDataPoint
	for _, ts := range timestamps {
		series = append(series, models.MultiSeriesDataPoint{
			Timestamp: ts,
			Values:    timestampMap[ts],
		})
	}

	return &models.MultiSeriesMetric{
		Series: series,
	}, nil
}

// queryNetworkMetrics 查询网络指标（使用并发查询优化性能）
func (s *PrometheusService) queryNetworkMetrics(ctx context.Context, config *models.MonitoringConfig, selector string, start, end int64, step string) (*models.NetworkMetrics, error) {
	var wg sync.WaitGroup
	var mu sync.Mutex
	networkMetrics := &models.NetworkMetrics{}

	// 并发查询入站流量
	wg.Add(1)
	go func() {
		defer wg.Done()
		inQuery := fmt.Sprintf("sum(rate(container_network_receive_bytes_total{%s}[5m]))", selector)
		if inSeries, err := s.queryMetricSeries(ctx, config, inQuery, start, end, step); err == nil {
			mu.Lock()
			networkMetrics.In = inSeries
			mu.Unlock()
		} else {
			logger.Error("查询入站网络指标失败", "error", err)
			mu.Lock()
			networkMetrics.In = &models.MetricSeries{Current: 0, Series: []models.DataPoint{}}
			mu.Unlock()
		}
	}()

	// 并发查询出站流量
	wg.Add(1)
	go func() {
		defer wg.Done()
		outQuery := fmt.Sprintf("sum(rate(container_network_transmit_bytes_total{%s}[5m]))", selector)
		if outSeries, err := s.queryMetricSeries(ctx, config, outQuery, start, end, step); err == nil {
			mu.Lock()
			networkMetrics.Out = outSeries
			mu.Unlock()
		} else {
			logger.Error("查询出站网络指标失败", "error", err)
			mu.Lock()
			networkMetrics.Out = &models.MetricSeries{Current: 0, Series: []models.DataPoint{}}
			mu.Unlock()
		}
	}()

	wg.Wait()
	return networkMetrics, nil
}

// queryNodeNetworkMetrics 查询节点网络指标
func (s *PrometheusService) queryNodeNetworkMetrics(ctx context.Context, config *models.MonitoringConfig, selector string, start, end int64, step string) (*models.NetworkMetrics, error) {
	// 查询入站流量
	inQuery := fmt.Sprintf("rate(node_network_receive_bytes_total{%s}[5m])", selector)
	inSeries, err := s.queryMetricSeries(ctx, config, inQuery, start, end, step)
	if err != nil {
		logger.Error("查询节点入站网络指标失败", "error", err)
		inSeries = &models.MetricSeries{Current: 0, Series: []models.DataPoint{}}
	}

	// 查询出站流量
	outQuery := fmt.Sprintf("rate(node_network_transmit_bytes_total{%s}[5m])", selector)
	outSeries, err := s.queryMetricSeries(ctx, config, outQuery, start, end, step)
	if err != nil {
		logger.Error("查询节点出站网络指标失败", "error", err)
		outSeries = &models.MetricSeries{Current: 0, Series: []models.DataPoint{}}
	}

	return &models.NetworkMetrics{
		In:  inSeries,
		Out: outSeries,
	}, nil
}

// queryPodNetworkMetrics 查询 Pod 网络指标
func (s *PrometheusService) queryPodNetworkMetrics(ctx context.Context, config *models.MonitoringConfig, selector string, start, end int64, step string) (*models.NetworkMetrics, error) {
	// 查询入站流量
	inQuery := fmt.Sprintf("rate(container_network_receive_bytes_total{%s}[5m])", selector)
	inSeries, err := s.queryMetricSeries(ctx, config, inQuery, start, end, step)
	if err != nil {
		logger.Error("查询Pod入站网络指标失败", "error", err)
		inSeries = &models.MetricSeries{Current: 0, Series: []models.DataPoint{}}
	}

	// 查询出站流量
	outQuery := fmt.Sprintf("rate(container_network_transmit_bytes_total{%s}[5m])", selector)
	outSeries, err := s.queryMetricSeries(ctx, config, outQuery, start, end, step)
	if err != nil {
		logger.Error("查询Pod出站网络指标失败", "error", err)
		outSeries = &models.MetricSeries{Current: 0, Series: []models.DataPoint{}}
	}

	return &models.NetworkMetrics{
		In:  inSeries,
		Out: outSeries,
	}, nil
}

// queryPodMetrics 查询 Pod 统计指标（使用并发查询优化性能）
func (s *PrometheusService) queryPodMetrics(ctx context.Context, config *models.MonitoringConfig, selector string) (*models.PodMetrics, error) {
	var wg sync.WaitGroup
	var mu sync.Mutex
	podMetrics := &models.PodMetrics{}
	now := time.Now().Unix()

	// 并发查询总 Pod 数
	wg.Add(1)
	go func() {
		defer wg.Done()
		totalQuery := fmt.Sprintf("sum(kube_pod_info{%s})", selector)
		if totalResp, err := s.QueryPrometheus(ctx, config, &models.MetricsQuery{
			Query: totalQuery,
			Start: now,
			End:   now,
			Step:  "1m",
		}); err == nil && len(totalResp.Data.Result) > 0 {
			if val, err := strconv.ParseFloat(fmt.Sprintf("%v", totalResp.Data.Result[0].Values[0][1]), 64); err == nil {
				mu.Lock()
				podMetrics.Total = int(val)
				mu.Unlock()
			}
		} else if err != nil {
			logger.Error("查询Pod总数失败", "error", err)
		}
	}()

	// 并发查询运行中 Pod 数
	wg.Add(1)
	go func() {
		defer wg.Done()
		runningQuery := fmt.Sprintf("sum(kube_pod_status_phase{phase=\"Running\",%s})", selector)
		if runningResp, err := s.QueryPrometheus(ctx, config, &models.MetricsQuery{
			Query: runningQuery,
			Start: now,
			End:   now,
			Step:  "1m",
		}); err == nil && len(runningResp.Data.Result) > 0 {
			if val, err := strconv.ParseFloat(fmt.Sprintf("%v", runningResp.Data.Result[0].Values[0][1]), 64); err == nil {
				mu.Lock()
				podMetrics.Running = int(val)
				mu.Unlock()
			}
		} else if err != nil {
			logger.Error("查询运行中Pod数失败", "error", err)
		}
	}()

	// 并发查询 Pending Pod 数
	wg.Add(1)
	go func() {
		defer wg.Done()
		pendingQuery := fmt.Sprintf("sum(kube_pod_status_phase{phase=\"Pending\",%s})", selector)
		if pendingResp, err := s.QueryPrometheus(ctx, config, &models.MetricsQuery{
			Query: pendingQuery,
			Start: now,
			End:   now,
			Step:  "1m",
		}); err == nil && len(pendingResp.Data.Result) > 0 {
			if val, err := strconv.ParseFloat(fmt.Sprintf("%v", pendingResp.Data.Result[0].Values[0][1]), 64); err == nil {
				mu.Lock()
				podMetrics.Pending = int(val)
				mu.Unlock()
			}
		} else if err != nil {
			logger.Error("查询Pending Pod数失败", "error", err)
		}
	}()

	// 并发查询失败 Pod 数
	wg.Add(1)
	go func() {
		defer wg.Done()
		failedQuery := fmt.Sprintf("sum(kube_pod_status_phase{phase=\"Failed\",%s})", selector)
		if failedResp, err := s.QueryPrometheus(ctx, config, &models.MetricsQuery{
			Query: failedQuery,
			Start: now,
			End:   now,
			Step:  "1m",
		}); err == nil && len(failedResp.Data.Result) > 0 {
			if val, err := strconv.ParseFloat(fmt.Sprintf("%v", failedResp.Data.Result[0].Values[0][1]), 64); err == nil {
				mu.Lock()
				podMetrics.Failed = int(val)
				mu.Unlock()
			}
		} else if err != nil {
			logger.Error("查询失败Pod数失败", "error", err)
		}
	}()

	wg.Wait()
	return podMetrics, nil
}

// QueryContainerSubnetIPs 查询容器子网IP信息
func (s *PrometheusService) QueryContainerSubnetIPs(ctx context.Context, config *models.MonitoringConfig) (*models.ContainerSubnetIPs, error) {
	if config.Type == "disabled" {
		return nil, fmt.Errorf("监控功能已禁用")
	}

	// 查询总IP数
	totalIPsQuery := "sum(ipam_ippool_size)"
	totalResp, err := s.QueryPrometheus(ctx, config, &models.MetricsQuery{
		Query: totalIPsQuery,
		Start: time.Now().Unix(),
		End:   time.Now().Unix(),
		Step:  "1m",
	})
	if err != nil {
		logger.Error("查询总IP数失败", "error", err)
		return &models.ContainerSubnetIPs{}, nil
	}

	totalIPs := 0
	if len(totalResp.Data.Result) > 0 && len(totalResp.Data.Result[0].Values) > 0 {
		if val, err := strconv.ParseFloat(fmt.Sprintf("%v", totalResp.Data.Result[0].Values[0][1]), 64); err == nil {
			totalIPs = int(val)
		}
	}

	// 查询已使用IP数
	usedIPsQuery := "sum(ipam_allocations_in_use)"
	usedResp, err := s.QueryPrometheus(ctx, config, &models.MetricsQuery{
		Query: usedIPsQuery,
		Start: time.Now().Unix(),
		End:   time.Now().Unix(),
		Step:  "1m",
	})
	if err != nil {
		logger.Error("查询已使用IP数失败", "error", err)
		return &models.ContainerSubnetIPs{TotalIPs: totalIPs}, nil
	}

	usedIPs := 0
	if len(usedResp.Data.Result) > 0 && len(usedResp.Data.Result[0].Values) > 0 {
		if val, err := strconv.ParseFloat(fmt.Sprintf("%v", usedResp.Data.Result[0].Values[0][1]), 64); err == nil {
			usedIPs = int(val)
		}
	}

	// 计算可用IP数
	availableIPs := totalIPs - usedIPs
	if availableIPs < 0 {
		availableIPs = 0
	}

	return &models.ContainerSubnetIPs{
		TotalIPs:     totalIPs,
		UsedIPs:      usedIPs,
		AvailableIPs: availableIPs,
	}, nil
}

// TestConnection 测试监控数据源连接
func (s *PrometheusService) TestConnection(ctx context.Context, config *models.MonitoringConfig) error {
	if config.Type == "disabled" {
		return fmt.Errorf("监控功能已禁用")
	}

	// 构建测试查询 URL
	testURL, err := url.Parse(config.Endpoint)
	if err != nil {
		return fmt.Errorf("无效的监控端点: %w", err)
	}
	testURL.Path = "/api/v1/query"
	testURL.RawQuery = "query=up"

	// 创建测试请求
	req, err := http.NewRequestWithContext(ctx, "GET", testURL.String(), nil)
	if err != nil {
		return fmt.Errorf("创建测试请求失败: %w", err)
	}

	// 设置认证
	if err := s.setAuth(req, config.Auth); err != nil {
		return fmt.Errorf("设置认证失败: %w", err)
	}

	// 执行测试请求
	resp, err := s.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("连接测试失败: %w", err)
	}
	defer func() {
		_ = resp.Body.Close()
	}()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("监控数据源响应异常: %s", string(body))
	}

	return nil
}

// queryPodNetworkPPS 查询 Pod 网络PPS指标
func (s *PrometheusService) queryPodNetworkPPS(ctx context.Context, config *models.MonitoringConfig, selector string, start, end int64, step string) (*models.NetworkPPS, error) {
	// 查询入站PPS
	inQuery := fmt.Sprintf("sum(rate(container_network_receive_packets_total{%s}[1m]))", selector)
	inSeries, err := s.queryMetricSeries(ctx, config, inQuery, start, end, step)
	if err != nil {
		logger.Error("查询Pod入站PPS失败", "error", err)
		inSeries = &models.MetricSeries{Current: 0, Series: []models.DataPoint{}}
	}

	// 查询出站PPS
	outQuery := fmt.Sprintf("sum(rate(container_network_transmit_packets_total{%s}[1m]))", selector)
	outSeries, err := s.queryMetricSeries(ctx, config, outQuery, start, end, step)
	if err != nil {
		logger.Error("查询Pod出站PPS失败", "error", err)
		outSeries = &models.MetricSeries{Current: 0, Series: []models.DataPoint{}}
	}

	return &models.NetworkPPS{
		In:  inSeries,
		Out: outSeries,
	}, nil
}

// queryPodNetworkDrops 查询 Pod 网卡丢包情况
func (s *PrometheusService) queryPodNetworkDrops(ctx context.Context, config *models.MonitoringConfig, selector string, start, end int64, step string) (*models.NetworkDrops, error) {
	// 查询接收丢包
	receiveQuery := fmt.Sprintf("sum(rate(container_network_receive_packets_dropped_total{%s}[1m]))", selector)
	receiveSeries, err := s.queryMetricSeries(ctx, config, receiveQuery, start, end, step)
	if err != nil {
		logger.Error("查询Pod接收丢包失败", "error", err)
		receiveSeries = &models.MetricSeries{Current: 0, Series: []models.DataPoint{}}
	}

	// 查询发送丢包
	transmitQuery := fmt.Sprintf("sum(rate(container_network_transmit_packets_dropped_total{%s}[1m]))", selector)
	transmitSeries, err := s.queryMetricSeries(ctx, config, transmitQuery, start, end, step)
	if err != nil {
		logger.Error("查询Pod发送丢包失败", "error", err)
		transmitSeries = &models.MetricSeries{Current: 0, Series: []models.DataPoint{}}
	}

	return &models.NetworkDrops{
		Receive:  receiveSeries,
		Transmit: transmitSeries,
	}, nil
}

// queryPodDiskIOPS 查询 Pod 磁盘IOPS
func (s *PrometheusService) queryPodDiskIOPS(ctx context.Context, config *models.MonitoringConfig, selector string, start, end int64, step string) (*models.DiskIOPS, error) {
	// 查询读IOPS
	readQuery := fmt.Sprintf("sum(rate(container_fs_reads_total{%s}[1m]))", selector)
	readSeries, err := s.queryMetricSeries(ctx, config, readQuery, start, end, step)
	if err != nil {
		logger.Error("查询Pod磁盘读IOPS失败", "error", err)
		readSeries = &models.MetricSeries{Current: 0, Series: []models.DataPoint{}}
	}

	// 查询写IOPS
	writeQuery := fmt.Sprintf("sum(rate(container_fs_writes_total{%s}[1m]))", selector)
	writeSeries, err := s.queryMetricSeries(ctx, config, writeQuery, start, end, step)
	if err != nil {
		logger.Error("查询Pod磁盘写IOPS失败", "error", err)
		writeSeries = &models.MetricSeries{Current: 0, Series: []models.DataPoint{}}
	}

	return &models.DiskIOPS{
		Read:  readSeries,
		Write: writeSeries,
	}, nil
}

// queryPodDiskThroughput 查询 Pod 磁盘吞吐量
func (s *PrometheusService) queryPodDiskThroughput(ctx context.Context, config *models.MonitoringConfig, selector string, start, end int64, step string) (*models.DiskThroughput, error) {
	// 查询读吞吐量
	readQuery := fmt.Sprintf("sum(rate(container_fs_reads_bytes_total{container!=\"\",container!=\"POD\",%s}[1m]))", selector)
	readSeries, err := s.queryMetricSeries(ctx, config, readQuery, start, end, step)
	if err != nil {
		logger.Error("查询Pod磁盘读吞吐量失败", "error", err)
		readSeries = &models.MetricSeries{Current: 0, Series: []models.DataPoint{}}
	}

	// 查询写吞吐量
	writeQuery := fmt.Sprintf("sum(rate(container_fs_writes_bytes_total{container!=\"\",container!=\"POD\",%s}[1m]))", selector)
	writeSeries, err := s.queryMetricSeries(ctx, config, writeQuery, start, end, step)
	if err != nil {
		logger.Error("查询Pod磁盘写吞吐量失败", "error", err)
		writeSeries = &models.MetricSeries{Current: 0, Series: []models.DataPoint{}}
	}

	return &models.DiskThroughput{
		Read:  readSeries,
		Write: writeSeries,
	}, nil
}

// queryClusterOverview 查询集群概览指标（使用并发查询优化性能）
func (s *PrometheusService) queryClusterOverview(ctx context.Context, config *models.MonitoringConfig, clusterName string, start, end int64, step string) (*models.ClusterOverview, error) {
	overview := &models.ClusterOverview{}
	var wg sync.WaitGroup
	var mu sync.Mutex

	// 并发查询 CPU 总核数
	wg.Add(1)
	go func() {
		defer wg.Done()
		totalCPUQuery := "sum(machine_cpu_cores)"
		if cpuResp, err := s.QueryPrometheus(ctx, config, &models.MetricsQuery{
			Query: totalCPUQuery,
			Start: end,
			End:   end,
			Step:  "1m",
		}); err == nil && len(cpuResp.Data.Result) > 0 && len(cpuResp.Data.Result[0].Values) > 0 {
			if val, err := strconv.ParseFloat(fmt.Sprintf("%v", cpuResp.Data.Result[0].Values[0][1]), 64); err == nil {
				mu.Lock()
				overview.TotalCPUCores = val
				mu.Unlock()
			}
		}
	}()

	// 并发查询内存总数
	wg.Add(1)
	go func() {
		defer wg.Done()
		totalMemQuery := "sum(machine_memory_bytes)"
		if memResp, err := s.QueryPrometheus(ctx, config, &models.MetricsQuery{
			Query: totalMemQuery,
			Start: end,
			End:   end,
			Step:  "1m",
		}); err == nil && len(memResp.Data.Result) > 0 && len(memResp.Data.Result[0].Values) > 0 {
			if val, err := strconv.ParseFloat(fmt.Sprintf("%v", memResp.Data.Result[0].Values[0][1]), 64); err == nil {
				mu.Lock()
				overview.TotalMemory = val
				mu.Unlock()
			}
		}
	}()

	// 并发查询集群 CPU 使用率
	wg.Add(1)
	go func() {
		defer wg.Done()
		cpuUsageQuery := "(1 - avg(rate(node_cpu_seconds_total{mode=\"idle\"}[1m]))) * 100"
		if cpuUsageSeries, err := s.queryMetricSeries(ctx, config, cpuUsageQuery, start, end, step); err == nil {
			mu.Lock()
			overview.CPUUsageRate = cpuUsageSeries
			mu.Unlock()
		}
	}()

	// 并发查询集群内存使用率
	wg.Add(1)
	go func() {
		defer wg.Done()
		memUsageQuery := "(1 - sum(node_memory_MemAvailable_bytes) / sum(node_memory_MemTotal_bytes)) * 100"
		if memUsageSeries, err := s.queryMetricSeries(ctx, config, memUsageQuery, start, end, step); err == nil {
			mu.Lock()
			overview.MemoryUsageRate = memUsageSeries
			mu.Unlock()
		}
	}()

	// 并发查询 Pod 最大可创建数
	wg.Add(1)
	go func() {
		defer wg.Done()
		maxPodsQuery := "sum(kube_node_status_capacity{resource=\"pods\"} unless on(node) kube_node_role)"
		if maxPodsResp, err := s.QueryPrometheus(ctx, config, &models.MetricsQuery{
			Query: maxPodsQuery,
			Start: end,
			End:   end,
			Step:  "1m",
		}); err == nil && len(maxPodsResp.Data.Result) > 0 && len(maxPodsResp.Data.Result[0].Values) > 0 {
			if val, err := strconv.ParseFloat(fmt.Sprintf("%v", maxPodsResp.Data.Result[0].Values[0][1]), 64); err == nil {
				mu.Lock()
				overview.MaxPods = int(val)
				mu.Unlock()
			}
		}
	}()

	// 并发查询 Pod 已创建数
	wg.Add(1)
	go func() {
		defer wg.Done()
		createdPodsQuery := "sum(kube_pod_info)"
		if createdPodsResp, err := s.QueryPrometheus(ctx, config, &models.MetricsQuery{
			Query: createdPodsQuery,
			Start: end,
			End:   end,
			Step:  "1m",
		}); err == nil && len(createdPodsResp.Data.Result) > 0 && len(createdPodsResp.Data.Result[0].Values) > 0 {
			if val, err := strconv.ParseFloat(fmt.Sprintf("%v", createdPodsResp.Data.Result[0].Values[0][1]), 64); err == nil {
				mu.Lock()
				overview.CreatedPods = int(val)
				mu.Unlock()
			}
		}
	}()

	// 并发查询 Etcd 是否有 Leader
	wg.Add(1)
	go func() {
		defer wg.Done()
		etcdLeaderQuery := "etcd_server_has_leader"
		if etcdResp, err := s.QueryPrometheus(ctx, config, &models.MetricsQuery{
			Query: etcdLeaderQuery,
			Start: end,
			End:   end,
			Step:  "1m",
		}); err == nil && len(etcdResp.Data.Result) > 0 && len(etcdResp.Data.Result[0].Values) > 0 {
			if val, err := strconv.ParseFloat(fmt.Sprintf("%v", etcdResp.Data.Result[0].Values[0][1]), 64); err == nil {
				mu.Lock()
				overview.EtcdHasLeader = val == 1
				mu.Unlock()
			}
		}
	}()

	// 并发查询 ApiServer 近30天可用率
	wg.Add(1)
	go func() {
		defer wg.Done()
		apiAvailabilityQuery := "apiserver_request:availability30d{verb=\"all\"}"
		if apiResp, err := s.QueryPrometheus(ctx, config, &models.MetricsQuery{
			Query: apiAvailabilityQuery,
			Start: end,
			End:   end,
			Step:  "1m",
		}); err == nil && len(apiResp.Data.Result) > 0 && len(apiResp.Data.Result[0].Values) > 0 {
			if val, err := strconv.ParseFloat(fmt.Sprintf("%v", apiResp.Data.Result[0].Values[0][1]), 64); err == nil {
				mu.Lock()
				overview.ApiServerAvailability = val * 100
				mu.Unlock()
			}
		}
	}()

	// 并发查询 CPU Request 比值
	wg.Add(1)
	go func() {
		defer wg.Done()
		cpuRequestQuery := "sum(namespace_cpu:kube_pod_container_resource_requests:sum) / sum(kube_node_status_allocatable{resource=\"cpu\"} unless on(node) kube_node_role) * 100"
		if cpuReqSeries, err := s.queryMetricSeries(ctx, config, cpuRequestQuery, start, end, step); err == nil {
			mu.Lock()
			overview.CPURequestRatio = cpuReqSeries
			mu.Unlock()
		}
	}()

	// 并发查询 CPU Limit 比值
	wg.Add(1)
	go func() {
		defer wg.Done()
		cpuLimitQuery := "sum(namespace_cpu:kube_pod_container_resource_limits:sum) / sum(kube_node_status_allocatable{resource=\"cpu\"} unless on(node) kube_node_role) * 100"
		if cpuLimitSeries, err := s.queryMetricSeries(ctx, config, cpuLimitQuery, start, end, step); err == nil {
			mu.Lock()
			overview.CPULimitRatio = cpuLimitSeries
			mu.Unlock()
		}
	}()

	// 并发查询内存 Request 比值
	wg.Add(1)
	go func() {
		defer wg.Done()
		memRequestQuery := "sum(namespace_memory:kube_pod_container_resource_requests:sum) / sum(kube_node_status_allocatable{resource=\"memory\"} unless on(node) kube_node_role) * 100"
		if memReqSeries, err := s.queryMetricSeries(ctx, config, memRequestQuery, start, end, step); err == nil {
			mu.Lock()
			overview.MemRequestRatio = memReqSeries
			mu.Unlock()
		}
	}()

	// 并发查询内存 Limit 比值
	wg.Add(1)
	go func() {
		defer wg.Done()
		memLimitQuery := "sum(namespace_memory:kube_pod_container_resource_limits:sum) / sum(kube_node_status_allocatable{resource=\"memory\"} unless on(node) kube_node_role) * 100"
		if memLimitSeries, err := s.queryMetricSeries(ctx, config, memLimitQuery, start, end, step); err == nil {
			mu.Lock()
			overview.MemLimitRatio = memLimitSeries
			mu.Unlock()
		}
	}()

	// 并发查询 ApiServer 总请求量
	wg.Add(1)
	go func() {
		defer wg.Done()
		apiRequestQuery := "sum(rate(apiserver_request_total[5m]))"
		if apiReqSeries, err := s.queryMetricSeries(ctx, config, apiRequestQuery, start, end, step); err == nil {
			mu.Lock()
			overview.ApiServerRequestRate = apiReqSeries
			mu.Unlock()
		}
	}()

	// 等待所有查询完成
	wg.Wait()

	// 计算 Pod 可创建数和使用率（需要等待 MaxPods 和 CreatedPods 查询完成）
	overview.AvailablePods = overview.MaxPods - overview.CreatedPods
	if overview.MaxPods > 0 {
		overview.PodUsageRate = float64(overview.CreatedPods) / float64(overview.MaxPods) * 100
	}

	return overview, nil
}

// QueryNodeListMetrics 查询节点列表监控指标（使用并发查询优化性能）
func (s *PrometheusService) QueryNodeListMetrics(ctx context.Context, config *models.MonitoringConfig, clusterName string) ([]models.NodeMetricItem, error) {
	nodeList := []models.NodeMetricItem{}
	now := time.Now().Unix()

	var wg sync.WaitGroup
	var mu sync.Mutex
	var cpuResp, memResp, cpuCoresResp, totalMemResp *models.MetricsResponse

	// 并发查询节点 CPU 使用率
	wg.Add(1)
	go func() {
		defer wg.Done()
		cpuQuery := "(1 - avg by (instance) (rate(node_cpu_seconds_total{mode=\"idle\"}[1m]))) * 100"
		if resp, err := s.QueryPrometheus(ctx, config, &models.MetricsQuery{
			Query: cpuQuery,
			Start: now,
			End:   now,
			Step:  "1m",
		}); err == nil {
			mu.Lock()
			cpuResp = resp
			mu.Unlock()
		} else {
			logger.Error("查询节点CPU使用率失败", "error", err)
		}
	}()

	// 并发查询节点内存使用率
	wg.Add(1)
	go func() {
		defer wg.Done()
		memQuery := "(1 - (node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes)) * 100"
		if resp, err := s.QueryPrometheus(ctx, config, &models.MetricsQuery{
			Query: memQuery,
			Start: now,
			End:   now,
			Step:  "1m",
		}); err == nil {
			mu.Lock()
			memResp = resp
			mu.Unlock()
		} else {
			logger.Error("查询节点内存使用率失败", "error", err)
		}
	}()

	// 并发查询节点CPU核数
	wg.Add(1)
	go func() {
		defer wg.Done()
		cpuCoresQuery := "machine_cpu_cores"
		if resp, err := s.QueryPrometheus(ctx, config, &models.MetricsQuery{
			Query: cpuCoresQuery,
			Start: now,
			End:   now,
			Step:  "1m",
		}); err == nil {
			mu.Lock()
			cpuCoresResp = resp
			mu.Unlock()
		} else {
			logger.Error("查询节点CPU核数失败", "error", err)
		}
	}()

	// 并发查询节点总内存
	wg.Add(1)
	go func() {
		defer wg.Done()
		totalMemQuery := "machine_memory_bytes"
		if resp, err := s.QueryPrometheus(ctx, config, &models.MetricsQuery{
			Query: totalMemQuery,
			Start: now,
			End:   now,
			Step:  "1m",
		}); err == nil {
			mu.Lock()
			totalMemResp = resp
			mu.Unlock()
		} else {
			logger.Error("查询节点总内存失败", "error", err)
		}
	}()

	// 等待所有查询完成
	wg.Wait()

	// 构建节点映射
	nodeMap := make(map[string]*models.NodeMetricItem)

	// 处理 CPU 使用率数据
	if cpuResp != nil && len(cpuResp.Data.Result) > 0 {
		for _, result := range cpuResp.Data.Result {
			if instance, ok := result.Metric["instance"]; ok {
				nodeName := s.extractNodeName(instance)
				if _, exists := nodeMap[nodeName]; !exists {
					nodeMap[nodeName] = &models.NodeMetricItem{
						NodeName: nodeName,
						Status:   "Ready",
					}
				}
				if len(result.Values) > 0 {
					if val, err := strconv.ParseFloat(fmt.Sprintf("%v", result.Values[0][1]), 64); err == nil {
						nodeMap[nodeName].CPUUsageRate = val
					}
				}
			}
		}
	}

	// 处理内存使用率数据
	if memResp != nil && len(memResp.Data.Result) > 0 {
		for _, result := range memResp.Data.Result {
			if instance, ok := result.Metric["instance"]; ok {
				nodeName := s.extractNodeName(instance)
				if _, exists := nodeMap[nodeName]; !exists {
					nodeMap[nodeName] = &models.NodeMetricItem{
						NodeName: nodeName,
						Status:   "Ready",
					}
				}
				if len(result.Values) > 0 {
					if val, err := strconv.ParseFloat(fmt.Sprintf("%v", result.Values[0][1]), 64); err == nil {
						nodeMap[nodeName].MemoryUsageRate = val
					}
				}
			}
		}
	}

	// 处理 CPU 核数数据
	if cpuCoresResp != nil && len(cpuCoresResp.Data.Result) > 0 {
		for _, result := range cpuCoresResp.Data.Result {
			if instance, ok := result.Metric["instance"]; ok {
				nodeName := s.extractNodeName(instance)
				if _, exists := nodeMap[nodeName]; !exists {
					nodeMap[nodeName] = &models.NodeMetricItem{
						NodeName: nodeName,
						Status:   "Ready",
					}
				}
				if len(result.Values) > 0 {
					if val, err := strconv.ParseFloat(fmt.Sprintf("%v", result.Values[0][1]), 64); err == nil {
						nodeMap[nodeName].CPUCores = val
					}
				}
			}
		}
	}

	// 处理总内存数据
	if totalMemResp != nil && len(totalMemResp.Data.Result) > 0 {
		for _, result := range totalMemResp.Data.Result {
			if instance, ok := result.Metric["instance"]; ok {
				nodeName := s.extractNodeName(instance)
				if _, exists := nodeMap[nodeName]; !exists {
					nodeMap[nodeName] = &models.NodeMetricItem{
						NodeName: nodeName,
						Status:   "Ready",
					}
				}
				if len(result.Values) > 0 {
					if val, err := strconv.ParseFloat(fmt.Sprintf("%v", result.Values[0][1]), 64); err == nil {
						nodeMap[nodeName].TotalMemory = val
					}
				}
			}
		}
	}

	// 转换为列表
	for _, node := range nodeMap {
		nodeList = append(nodeList, *node)
	}

	return nodeList, nil
}

// extractNodeName 从 instance 标签中提取节点名称
func (s *PrometheusService) extractNodeName(instance string) string {
	// instance 格式可能是 "node-name:9100" 或 "192.168.1.1:9100"
	// 简单处理：去除端口号
	parts := strings.Split(instance, ":")
	if len(parts) > 0 {
		return parts[0]
	}
	return instance
}

// queryWorkloadNetworkMetrics 查询工作负载网络指标（聚合所有Pod）
func (s *PrometheusService) queryWorkloadNetworkMetrics(ctx context.Context, config *models.MonitoringConfig, selector string, start, end int64, step string) (*models.NetworkMetrics, error) {
	// 查询入站流量（聚合）
	inQuery := fmt.Sprintf("sum(rate(container_network_receive_bytes_total{%s}[5m]))", selector)
	inSeries, err := s.queryMetricSeries(ctx, config, inQuery, start, end, step)
	if err != nil {
		logger.Error("查询工作负载入站网络指标失败", "error", err)
		inSeries = &models.MetricSeries{Current: 0, Series: []models.DataPoint{}}
	}

	// 查询出站流量（聚合）
	outQuery := fmt.Sprintf("sum(rate(container_network_transmit_bytes_total{%s}[5m]))", selector)
	outSeries, err := s.queryMetricSeries(ctx, config, outQuery, start, end, step)
	if err != nil {
		logger.Error("查询工作负载出站网络指标失败", "error", err)
		outSeries = &models.MetricSeries{Current: 0, Series: []models.DataPoint{}}
	}

	return &models.NetworkMetrics{
		In:  inSeries,
		Out: outSeries,
	}, nil
}

// queryWorkloadNetworkPPS 查询工作负载网络PPS（聚合所有Pod）
func (s *PrometheusService) queryWorkloadNetworkPPS(ctx context.Context, config *models.MonitoringConfig, selector string, start, end int64, step string) (*models.NetworkPPS, error) {
	// 查询入站PPS（聚合）
	inQuery := fmt.Sprintf("sum(rate(container_network_receive_packets_total{%s}[1m]))", selector)
	inSeries, err := s.queryMetricSeries(ctx, config, inQuery, start, end, step)
	if err != nil {
		logger.Error("查询工作负载入站PPS失败", "error", err)
		inSeries = &models.MetricSeries{Current: 0, Series: []models.DataPoint{}}
	}

	// 查询出站PPS（聚合）
	outQuery := fmt.Sprintf("sum(rate(container_network_transmit_packets_total{%s}[1m]))", selector)
	outSeries, err := s.queryMetricSeries(ctx, config, outQuery, start, end, step)
	if err != nil {
		logger.Error("查询工作负载出站PPS失败", "error", err)
		outSeries = &models.MetricSeries{Current: 0, Series: []models.DataPoint{}}
	}

	return &models.NetworkPPS{
		In:  inSeries,
		Out: outSeries,
	}, nil
}

// queryWorkloadNetworkDrops 查询工作负载网络丢包（聚合所有Pod）
func (s *PrometheusService) queryWorkloadNetworkDrops(ctx context.Context, config *models.MonitoringConfig, selector string, start, end int64, step string) (*models.NetworkDrops, error) {
	// 查询接收丢包（聚合）
	receiveQuery := fmt.Sprintf("sum(rate(container_network_receive_packets_dropped_total{%s}[1m]))", selector)
	receiveSeries, err := s.queryMetricSeries(ctx, config, receiveQuery, start, end, step)
	if err != nil {
		logger.Error("查询工作负载接收丢包失败", "error", err)
		receiveSeries = &models.MetricSeries{Current: 0, Series: []models.DataPoint{}}
	}

	// 查询发送丢包（聚合）
	transmitQuery := fmt.Sprintf("sum(rate(container_network_transmit_packets_dropped_total{%s}[1m]))", selector)
	transmitSeries, err := s.queryMetricSeries(ctx, config, transmitQuery, start, end, step)
	if err != nil {
		logger.Error("查询工作负载发送丢包失败", "error", err)
		transmitSeries = &models.MetricSeries{Current: 0, Series: []models.DataPoint{}}
	}

	return &models.NetworkDrops{
		Receive:  receiveSeries,
		Transmit: transmitSeries,
	}, nil
}

// queryWorkloadDiskIOPS 查询工作负载磁盘IOPS（聚合所有Pod）
func (s *PrometheusService) queryWorkloadDiskIOPS(ctx context.Context, config *models.MonitoringConfig, selector string, start, end int64, step string) (*models.DiskIOPS, error) {
	// 查询读IOPS（聚合）
	readQuery := fmt.Sprintf("sum(rate(container_fs_reads_total{%s}[1m]))", selector)
	readSeries, err := s.queryMetricSeries(ctx, config, readQuery, start, end, step)
	if err != nil {
		logger.Error("查询工作负载磁盘读IOPS失败", "error", err)
		readSeries = &models.MetricSeries{Current: 0, Series: []models.DataPoint{}}
	}

	// 查询写IOPS（聚合）
	writeQuery := fmt.Sprintf("sum(rate(container_fs_writes_total{%s}[1m]))", selector)
	writeSeries, err := s.queryMetricSeries(ctx, config, writeQuery, start, end, step)
	if err != nil {
		logger.Error("查询工作负载磁盘写IOPS失败", "error", err)
		writeSeries = &models.MetricSeries{Current: 0, Series: []models.DataPoint{}}
	}

	return &models.DiskIOPS{
		Read:  readSeries,
		Write: writeSeries,
	}, nil
}

// queryWorkloadDiskThroughput 查询工作负载磁盘吞吐量（聚合所有Pod）
func (s *PrometheusService) queryWorkloadDiskThroughput(ctx context.Context, config *models.MonitoringConfig, selector string, start, end int64, step string) (*models.DiskThroughput, error) {
	// 查询读吞吐量（聚合）
	readQuery := fmt.Sprintf("sum(rate(container_fs_reads_bytes_total{container!=\"\",container!=\"POD\",%s}[1m]))", selector)
	readSeries, err := s.queryMetricSeries(ctx, config, readQuery, start, end, step)
	if err != nil {
		logger.Error("查询工作负载磁盘读吞吐量失败", "error", err)
		readSeries = &models.MetricSeries{Current: 0, Series: []models.DataPoint{}}
	}

	// 查询写吞吐量（聚合）
	writeQuery := fmt.Sprintf("sum(rate(container_fs_writes_bytes_total{container!=\"\",container!=\"POD\",%s}[1m]))", selector)
	writeSeries, err := s.queryMetricSeries(ctx, config, writeQuery, start, end, step)
	if err != nil {
		logger.Error("查询工作负载磁盘写吞吐量失败", "error", err)
		writeSeries = &models.MetricSeries{Current: 0, Series: []models.DataPoint{}}
	}

	return &models.DiskThroughput{
		Read:  readSeries,
		Write: writeSeries,
	}, nil
}
