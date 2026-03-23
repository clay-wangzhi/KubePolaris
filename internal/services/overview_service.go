package services

import (
	"context"
	"fmt"
	"sort"
	"sync"
	"time"

	"github.com/clay-wangzhi/KubePolaris/internal/models"
	"github.com/clay-wangzhi/KubePolaris/pkg/logger"

	rolloutsv1alpha1 "github.com/argoproj/argo-rollouts/pkg/apis/rollouts/v1alpha1"
	rolloutslisters "github.com/argoproj/argo-rollouts/pkg/client/listers/rollouts/v1alpha1"
	"gorm.io/gorm"
	appsv1 "k8s.io/api/apps/v1"
	corev1 "k8s.io/api/core/v1"
	"k8s.io/apimachinery/pkg/labels"
	appsv1listers "k8s.io/client-go/listers/apps/v1"
	corev1listers "k8s.io/client-go/listers/core/v1"
)

// InformerListerProvider 定义获取各类 Lister 的接口（用于解耦 k8s 包）
type InformerListerProvider interface {
	PodsLister(clusterID uint) corev1listers.PodLister
	NodesLister(clusterID uint) corev1listers.NodeLister
	DeploymentsLister(clusterID uint) appsv1listers.DeploymentLister
	StatefulSetsLister(clusterID uint) appsv1listers.StatefulSetLister
	RolloutsLister(clusterID uint) rolloutslisters.RolloutLister
}

// clusterFilterCtxKey 用于在 context 中传递集群过滤条件
type clusterFilterCtxKey struct{}

// ContextWithClusterFilter 将集群过滤条件注入 context
func ContextWithClusterFilter(ctx context.Context, clusterIDs []uint) context.Context {
	return context.WithValue(ctx, clusterFilterCtxKey{}, clusterIDs)
}

// OverviewService 总览服务
type OverviewService struct {
	db                 *gorm.DB
	clusterService     *ClusterService
	listerProvider     InformerListerProvider
	promService        *PrometheusService
	monitoringCfgSvc   *MonitoringConfigService
	alertManagerCfgSvc *AlertManagerConfigService
	alertManagerSvc    *AlertManagerService
}

// NewOverviewService 创建总览服务
func NewOverviewService(
	db *gorm.DB,
	clusterService *ClusterService,
	listerProvider InformerListerProvider,
	promService *PrometheusService,
	monitoringCfgSvc *MonitoringConfigService,
	alertManagerCfgSvc *AlertManagerConfigService,
	alertManagerSvc *AlertManagerService,
) *OverviewService {
	return &OverviewService{
		db:                 db,
		clusterService:     clusterService,
		listerProvider:     listerProvider,
		promService:        promService,
		monitoringCfgSvc:   monitoringCfgSvc,
		alertManagerCfgSvc: alertManagerCfgSvc,
		alertManagerSvc:    alertManagerSvc,
	}
}

// getClusters 获取集群列表，如果 context 中有过滤条件则按条件过滤
func (s *OverviewService) getClusters(ctx context.Context) ([]*models.Cluster, error) {
	if filterIDs, ok := ctx.Value(clusterFilterCtxKey{}).([]uint); ok {
		if len(filterIDs) == 0 {
			return []*models.Cluster{}, nil
		}
		var clusters []*models.Cluster
		if err := s.db.Where("id IN ?", filterIDs).Find(&clusters).Error; err != nil {
			return nil, fmt.Errorf("获取集群列表失败: %w", err)
		}
		return clusters, nil
	}
	return s.clusterService.GetAllClusters()
}

// ========== 响应结构体 ==========

// OverviewStatsResponse 总览统计响应
type OverviewStatsResponse struct {
	ClusterStats        ClusterStatsData      `json:"clusterStats"`
	NodeStats           NodeStatsData         `json:"nodeStats"`
	PodStats            PodStatsData          `json:"podStats"`
	VersionDistribution []VersionDistribution `json:"versionDistribution"`
}

// ClusterStatsData 集群统计
type ClusterStatsData struct {
	Total     int `json:"total"`
	Healthy   int `json:"healthy"`
	Unhealthy int `json:"unhealthy"`
	Unknown   int `json:"unknown"`
}

// NodeStatsData 节点统计
type NodeStatsData struct {
	Total    int `json:"total"`
	Ready    int `json:"ready"`
	NotReady int `json:"notReady"`
}

// PodStatsData Pod 统计
type PodStatsData struct {
	Total     int `json:"total"`
	Running   int `json:"running"`
	Pending   int `json:"pending"`
	Failed    int `json:"failed"`
	Succeeded int `json:"succeeded"`
}

// VersionDistribution 版本分布
type VersionDistribution struct {
	Version  string   `json:"version"`
	Count    int      `json:"count"`
	Clusters []string `json:"clusters"`
}

// ResourceUsageResponse 资源使用率响应
type ResourceUsageResponse struct {
	CPU     ResourceUsageData `json:"cpu"`
	Memory  ResourceUsageData `json:"memory"`
	Storage ResourceUsageData `json:"storage"`
}

// ResourceUsageData 资源使用数据
type ResourceUsageData struct {
	UsagePercent float64 `json:"usagePercent"`
	Used         float64 `json:"used"`
	Total        float64 `json:"total"`
	Unit         string  `json:"unit"`
}

// ResourceDistributionResponse 资源分布响应
type ResourceDistributionResponse struct {
	PodDistribution    []ClusterResourceCount `json:"podDistribution"`
	NodeDistribution   []ClusterResourceCount `json:"nodeDistribution"`
	CPUDistribution    []ClusterResourceCount `json:"cpuDistribution"`
	MemoryDistribution []ClusterResourceCount `json:"memoryDistribution"`
}

// ClusterResourceCount 集群资源计数
type ClusterResourceCount struct {
	ClusterID   uint    `json:"clusterId"`
	ClusterName string  `json:"clusterName"`
	Value       float64 `json:"value"`
}

// TrendResponse 趋势数据响应
type TrendResponse struct {
	PodTrends  []ClusterTrendSeries `json:"podTrends"`
	NodeTrends []ClusterTrendSeries `json:"nodeTrends"`
}

// ClusterTrendSeries 集群趋势序列
type ClusterTrendSeries struct {
	ClusterID   uint             `json:"clusterId"`
	ClusterName string           `json:"clusterName"`
	DataPoints  []TrendDataPoint `json:"dataPoints"`
}

// TrendDataPoint 趋势数据点
type TrendDataPoint struct {
	Timestamp int64   `json:"timestamp"`
	Value     float64 `json:"value"`
}

// AbnormalWorkload 异常工作负载
type AbnormalWorkload struct {
	Name        string `json:"name"`
	Namespace   string `json:"namespace"`
	ClusterID   uint   `json:"clusterId"`
	ClusterName string `json:"clusterName"`
	Type        string `json:"type"`
	Reason      string `json:"reason"`
	Message     string `json:"message"`
	Duration    string `json:"duration"`
	Severity    string `json:"severity"`
}

// GlobalAlertStats 全局告警统计
type GlobalAlertStats struct {
	Total        int                 `json:"total"`        // 告警总数
	Firing       int                 `json:"firing"`       // 触发中
	Pending      int                 `json:"pending"`      // 等待中
	Resolved     int                 `json:"resolved"`     // 已解决
	Suppressed   int                 `json:"suppressed"`   // 已抑制
	BySeverity   map[string]int      `json:"bySeverity"`   // 按严重程度统计
	ByCluster    []ClusterAlertCount `json:"byCluster"`    // 按集群统计
	EnabledCount int                 `json:"enabledCount"` // 已启用告警的集群数
}

// ClusterAlertCount 集群告警计数
type ClusterAlertCount struct {
	ClusterID   uint   `json:"clusterId"`
	ClusterName string `json:"clusterName"`
	Total       int    `json:"total"`
	Firing      int    `json:"firing"`
}

// ========== 服务方法 ==========

// GetOverviewStats 获取总览统计数据
func (s *OverviewService) GetOverviewStats(ctx context.Context) (*OverviewStatsResponse, error) {
	clusters, err := s.getClusters(ctx)
	if err != nil {
		return nil, fmt.Errorf("获取集群列表失败: %w", err)
	}

	stats := &OverviewStatsResponse{}
	versionMap := make(map[string][]string)

	for _, cluster := range clusters {
		// 集群健康统计
		switch cluster.Status {
		case "healthy":
			stats.ClusterStats.Healthy++
		case "unhealthy":
			stats.ClusterStats.Unhealthy++
		default:
			stats.ClusterStats.Unknown++
		}

		// 版本分布
		version := cluster.Version
		if version == "" {
			version = "unknown"
		}
		versionMap[version] = append(versionMap[version], cluster.Name)

		// 从 Informer 获取 Pod 统计
		if s.listerProvider != nil {
			podLister := s.listerProvider.PodsLister(cluster.ID)
			if podLister != nil {
				pods, err := podLister.List(labels.Everything())
				if err != nil {
					logger.Error("获取集群 Pod 列表失败", "cluster", cluster.Name, "error", err)
				} else {
					for _, pod := range pods {
						stats.PodStats.Total++
						switch pod.Status.Phase {
						case corev1.PodRunning:
							stats.PodStats.Running++
						case corev1.PodPending:
							stats.PodStats.Pending++
						case corev1.PodFailed:
							stats.PodStats.Failed++
						case corev1.PodSucceeded:
							stats.PodStats.Succeeded++
						}
					}
				}
			}

			// 从 Informer 获取 Node 统计
			nodeLister := s.listerProvider.NodesLister(cluster.ID)
			if nodeLister != nil {
				nodes, err := nodeLister.List(labels.Everything())
				if err != nil {
					logger.Error("获取集群节点列表失败", "cluster", cluster.Name, "error", err)
				} else {
					for _, node := range nodes {
						stats.NodeStats.Total++
						for _, cond := range node.Status.Conditions {
							if cond.Type == corev1.NodeReady && cond.Status == corev1.ConditionTrue {
								stats.NodeStats.Ready++
								break
							}
						}
					}
				}
			}
		}
	}

	stats.NodeStats.NotReady = stats.NodeStats.Total - stats.NodeStats.Ready
	stats.ClusterStats.Total = len(clusters)

	// 转换版本分布
	for version, clusterNames := range versionMap {
		stats.VersionDistribution = append(stats.VersionDistribution, VersionDistribution{
			Version:  version,
			Count:    len(clusterNames),
			Clusters: clusterNames,
		})
	}
	// 按数量降序排序
	sort.Slice(stats.VersionDistribution, func(i, j int) bool {
		return stats.VersionDistribution[i].Count > stats.VersionDistribution[j].Count
	})

	return stats, nil
}

// GetResourceDistribution 获取资源分布
func (s *OverviewService) GetResourceDistribution(ctx context.Context) (*ResourceDistributionResponse, error) {
	clusters, err := s.getClusters(ctx)
	if err != nil {
		return nil, fmt.Errorf("获取集群列表失败: %w", err)
	}

	resp := &ResourceDistributionResponse{
		PodDistribution:    make([]ClusterResourceCount, 0),
		NodeDistribution:   make([]ClusterResourceCount, 0),
		CPUDistribution:    make([]ClusterResourceCount, 0),
		MemoryDistribution: make([]ClusterResourceCount, 0),
	}

	if s.listerProvider == nil {
		return resp, nil
	}

	for _, cluster := range clusters {
		clusterID := cluster.ID
		clusterName := cluster.Name

		// Pod 分布
		if podLister := s.listerProvider.PodsLister(clusterID); podLister != nil {
			pods, err := podLister.List(labels.Everything())
			if err == nil {
				resp.PodDistribution = append(resp.PodDistribution, ClusterResourceCount{
					ClusterID: clusterID, ClusterName: clusterName, Value: float64(len(pods)),
				})
			}
		}

		// Node 分布 + CPU/Memory 容量
		if nodeLister := s.listerProvider.NodesLister(clusterID); nodeLister != nil {
			nodes, err := nodeLister.List(labels.Everything())
			if err == nil {
				var totalCPU, totalMemory int64
				for _, node := range nodes {
					// CPU: milliCores -> Cores
					cpu := node.Status.Allocatable.Cpu().MilliValue() / 1000
					// Memory: bytes -> GB
					mem := node.Status.Allocatable.Memory().Value() / (1024 * 1024 * 1024)
					totalCPU += cpu
					totalMemory += mem
				}
				resp.NodeDistribution = append(resp.NodeDistribution, ClusterResourceCount{
					ClusterID: clusterID, ClusterName: clusterName, Value: float64(len(nodes)),
				})
				resp.CPUDistribution = append(resp.CPUDistribution, ClusterResourceCount{
					ClusterID: clusterID, ClusterName: clusterName, Value: float64(totalCPU),
				})
				resp.MemoryDistribution = append(resp.MemoryDistribution, ClusterResourceCount{
					ClusterID: clusterID, ClusterName: clusterName, Value: float64(totalMemory),
				})
			}
		}
	}

	// 按 Value 降序排序
	sortByValue := func(list []ClusterResourceCount) {
		sort.Slice(list, func(i, j int) bool {
			return list[i].Value > list[j].Value
		})
	}
	sortByValue(resp.PodDistribution)
	sortByValue(resp.NodeDistribution)
	sortByValue(resp.CPUDistribution)
	sortByValue(resp.MemoryDistribution)

	return resp, nil
}

// GetResourceUsage 获取资源使用率
func (s *OverviewService) GetResourceUsage(ctx context.Context) (*ResourceUsageResponse, error) {
	clusters, err := s.getClusters(ctx)
	if err != nil {
		return nil, fmt.Errorf("获取集群列表失败: %w", err)
	}

	var totalCPUUsage, totalMemUsage, totalStorageUsage float64
	var totalCPUCores, totalMemoryGB float64
	var totalStorageBytes, usedStorageBytes float64
	var clusterCount, storageClusterCount int

	for _, cluster := range clusters {
		// 获取集群的 MonitoringConfig
		config, err := s.monitoringCfgSvc.GetMonitoringConfig(cluster.ID)
		if err != nil || config.Type == "disabled" {
			logger.Debug("集群监控未配置或已禁用", "cluster", cluster.Name)
			continue
		}

		// 设置时间范围（最近 5 分钟，用于 range query）
		now := time.Now().Unix()
		start := now - 300 // 5 分钟前
		step := "1m"

		// 查询 CPU 使用率
		cpuQuery := &models.MetricsQuery{
			Query: "(1 - avg(rate(node_cpu_seconds_total{mode=\"idle\"}[5m]))) * 100",
			Start: start,
			End:   now,
			Step:  step,
		}
		if resp, err := s.promService.QueryPrometheus(ctx, config, cpuQuery); err == nil {
			if val := extractLatestValue(resp); val >= 0 {
				totalCPUUsage += val
			}
		}

		// 查询内存使用率
		memQuery := &models.MetricsQuery{
			Query: "(1 - sum(node_memory_MemAvailable_bytes) / sum(node_memory_MemTotal_bytes)) * 100",
			Start: start,
			End:   now,
			Step:  step,
		}
		if resp, err := s.promService.QueryPrometheus(ctx, config, memQuery); err == nil {
			if val := extractLatestValue(resp); val >= 0 {
				totalMemUsage += val
			}
		}

		// 查询存储使用率（根目录 /）
		storageUsageQuery := &models.MetricsQuery{
			Query: "avg((1 - node_filesystem_avail_bytes{mountpoint=\"/\"} / node_filesystem_size_bytes{mountpoint=\"/\"}) * 100)",
			Start: start,
			End:   now,
			Step:  step,
		}
		if resp, err := s.promService.QueryPrometheus(ctx, config, storageUsageQuery); err == nil {
			if val := extractLatestValue(resp); val >= 0 {
				totalStorageUsage += val
				storageClusterCount++
			}
		}

		// 查询存储总量（根目录 /）
		storageTotalQuery := &models.MetricsQuery{
			Query: "sum(node_filesystem_size_bytes{mountpoint=\"/\"})",
			Start: start,
			End:   now,
			Step:  step,
		}
		if resp, err := s.promService.QueryPrometheus(ctx, config, storageTotalQuery); err == nil {
			if val := extractLatestValue(resp); val >= 0 {
				totalStorageBytes += val
			}
		}

		// 查询存储已用量（根目录 /）
		storageUsedQuery := &models.MetricsQuery{
			Query: "sum(node_filesystem_size_bytes{mountpoint=\"/\"} - node_filesystem_avail_bytes{mountpoint=\"/\"})",
			Start: start,
			End:   now,
			Step:  step,
		}
		if resp, err := s.promService.QueryPrometheus(ctx, config, storageUsedQuery); err == nil {
			if val := extractLatestValue(resp); val >= 0 {
				usedStorageBytes += val
			}
		}

		// 从 Informer 获取总资源容量
		if s.listerProvider != nil {
			if nodeLister := s.listerProvider.NodesLister(cluster.ID); nodeLister != nil {
				nodes, _ := nodeLister.List(labels.Everything())
				for _, node := range nodes {
					totalCPUCores += float64(node.Status.Allocatable.Cpu().MilliValue()) / 1000
					totalMemoryGB += float64(node.Status.Allocatable.Memory().Value()) / (1024 * 1024 * 1024)
				}
			}
		}

		clusterCount++
	}

	resp := &ResourceUsageResponse{}

	if clusterCount > 0 {
		avgCPU := totalCPUUsage / float64(clusterCount)
		avgMem := totalMemUsage / float64(clusterCount)

		resp.CPU = ResourceUsageData{
			UsagePercent: avgCPU,
			Used:         totalCPUCores * avgCPU / 100,
			Total:        totalCPUCores,
			Unit:         "核",
		}
		resp.Memory = ResourceUsageData{
			UsagePercent: avgMem,
			Used:         totalMemoryGB * avgMem / 100,
			Total:        totalMemoryGB,
			Unit:         "GB",
		}
	}

	// 存储使用率
	if storageClusterCount > 0 {
		avgStorage := totalStorageUsage / float64(storageClusterCount)
		totalStorageTB := totalStorageBytes / (1024 * 1024 * 1024 * 1024)
		usedStorageTB := usedStorageBytes / (1024 * 1024 * 1024 * 1024)

		resp.Storage = ResourceUsageData{
			UsagePercent: avgStorage,
			Used:         usedStorageTB,
			Total:        totalStorageTB,
			Unit:         "TB",
		}
	} else {
		resp.Storage = ResourceUsageData{
			UsagePercent: 0,
			Used:         0,
			Total:        0,
			Unit:         "TB",
		}
	}

	return resp, nil
}

// GetTrends 获取趋势数据（并发查询优化性能）
func (s *OverviewService) GetTrends(ctx context.Context, timeRange string, step string) (*TrendResponse, error) {
	clusters, err := s.getClusters(ctx)
	if err != nil {
		return nil, fmt.Errorf("获取集群列表失败: %w", err)
	}

	// 解析时间范围
	start, end := parseTimeRange(timeRange)
	// 每天一个数据点，使用 1d 步长
	if step == "" {
		step = "1d"
	}

	resp := &TrendResponse{
		PodTrends:  make([]ClusterTrendSeries, 0),
		NodeTrends: make([]ClusterTrendSeries, 0),
	}

	// 使用并发查询所有集群
	type trendResult struct {
		ClusterID   uint
		ClusterName string
		PodPoints   []TrendDataPoint
		NodePoints  []TrendDataPoint
	}

	resultCh := make(chan trendResult, len(clusters))
	var wg sync.WaitGroup

	for _, cluster := range clusters {
		wg.Add(1)
		go func(c *models.Cluster) {
			defer wg.Done()
			clusterStart := time.Now()

			// 在 goroutine 内部获取监控配置
			config, err := s.monitoringCfgSvc.GetMonitoringConfig(c.ID)
			if err != nil || config.Type == "disabled" {
				return
			}

			result := trendResult{
				ClusterID:   c.ID,
				ClusterName: c.Name,
			}

			// Pod 趋势 - 直接查询 count，step=1d 已保证每天一个点
			podQuery := &models.MetricsQuery{
				Query: "count(kube_pod_info)",
				Start: start,
				End:   end,
				Step:  step,
			}
			if promResp, err := s.promService.QueryPrometheus(ctx, config, podQuery); err == nil {
				result.PodPoints = extractRangeSeriesWithDefault(promResp)
			}

			// Node 趋势 - 直接查询 count
			nodeQuery := &models.MetricsQuery{
				Query: "count(kube_node_info)",
				Start: start,
				End:   end,
				Step:  step,
			}
			if promResp, err := s.promService.QueryPrometheus(ctx, config, nodeQuery); err == nil {
				result.NodePoints = extractRangeSeriesWithDefault(promResp)
			}

			logger.Info("集群趋势查询完成", "cluster", c.Name, "耗时", time.Since(clusterStart).String())

			resultCh <- result
		}(cluster)
	}

	// 等待所有 goroutine 完成后关闭 channel
	go func() {
		wg.Wait()
		close(resultCh)
	}()

	// 收集结果
	for result := range resultCh {
		if len(result.PodPoints) > 0 {
			resp.PodTrends = append(resp.PodTrends, ClusterTrendSeries{
				ClusterID:   result.ClusterID,
				ClusterName: result.ClusterName,
				DataPoints:  result.PodPoints,
			})
		}
		if len(result.NodePoints) > 0 {
			resp.NodeTrends = append(resp.NodeTrends, ClusterTrendSeries{
				ClusterID:   result.ClusterID,
				ClusterName: result.ClusterName,
				DataPoints:  result.NodePoints,
			})
		}
	}

	return resp, nil
}

// GetAbnormalWorkloads 获取异常工作负载
func (s *OverviewService) GetAbnormalWorkloads(ctx context.Context, limit int) ([]AbnormalWorkload, error) {
	clusters, err := s.getClusters(ctx)
	if err != nil {
		return nil, fmt.Errorf("获取集群列表失败: %w", err)
	}

	if limit <= 0 {
		limit = 20
	}

	var workloads []AbnormalWorkload

	if s.listerProvider == nil {
		return workloads, nil
	}

	for _, cluster := range clusters {
		// 检查 Deployment 副本不一致
		if depLister := s.listerProvider.DeploymentsLister(cluster.ID); depLister != nil {
			deps, err := depLister.List(labels.Everything())
			if err == nil {
				for _, dep := range deps {
					if dep.Spec.Replicas != nil && dep.Status.ReadyReplicas < *dep.Spec.Replicas {
						duration := formatDuration(dep.CreationTimestamp.Time)
						workloads = append(workloads, AbnormalWorkload{
							Name:        dep.Name,
							Namespace:   dep.Namespace,
							ClusterID:   cluster.ID,
							ClusterName: cluster.Name,
							Type:        "Deployment",
							Reason:      "Pod副本不足",
							Message:     fmt.Sprintf("期望 %d 个副本，就绪 %d 个", *dep.Spec.Replicas, dep.Status.ReadyReplicas),
							Duration:    duration,
							Severity:    "warning",
						})
					}
				}
			}
		}

		// 检查 StatefulSet 副本不一致
		if stsLister := s.listerProvider.StatefulSetsLister(cluster.ID); stsLister != nil {
			stss, err := stsLister.List(labels.Everything())
			if err == nil {
				for _, sts := range stss {
					if sts.Spec.Replicas != nil && sts.Status.ReadyReplicas < *sts.Spec.Replicas {
						duration := formatDuration(sts.CreationTimestamp.Time)
						workloads = append(workloads, AbnormalWorkload{
							Name:        sts.Name,
							Namespace:   sts.Namespace,
							ClusterID:   cluster.ID,
							ClusterName: cluster.Name,
							Type:        "StatefulSet",
							Reason:      "Pod副本不足",
							Message:     fmt.Sprintf("期望 %d 个副本，就绪 %d 个", *sts.Spec.Replicas, sts.Status.ReadyReplicas),
							Duration:    duration,
							Severity:    "warning",
						})
					}
				}
			}
		}

		// 检查 Argo Rollout 副本不一致或发布异常
		if rolloutLister := s.listerProvider.RolloutsLister(cluster.ID); rolloutLister != nil {
			rollouts, err := rolloutLister.List(labels.Everything())
			if err == nil {
				for _, rollout := range rollouts {
					reason, msg, severity := detectRolloutIssue(rollout)
					if reason != "" {
						duration := formatDuration(rollout.CreationTimestamp.Time)
						workloads = append(workloads, AbnormalWorkload{
							Name:        rollout.Name,
							Namespace:   rollout.Namespace,
							ClusterID:   cluster.ID,
							ClusterName: cluster.Name,
							Type:        "Rollout",
							Reason:      reason,
							Message:     msg,
							Duration:    duration,
							Severity:    severity,
						})
					}
				}
			}
		}

		// 检查异常 Pod
		if podLister := s.listerProvider.PodsLister(cluster.ID); podLister != nil {
			pods, err := podLister.List(labels.Everything())
			if err == nil {
				for _, pod := range pods {
					if reason, severity := detectPodIssue(pod); reason != "" {
						duration := formatDuration(pod.CreationTimestamp.Time)
						workloads = append(workloads, AbnormalWorkload{
							Name:        pod.Name,
							Namespace:   pod.Namespace,
							ClusterID:   cluster.ID,
							ClusterName: cluster.Name,
							Type:        "Pod",
							Reason:      reason,
							Duration:    duration,
							Severity:    severity,
						})
					}
				}
			}
		}

		// 限制数量
		if len(workloads) >= limit {
			break
		}
	}

	// 截断到限制数量
	if len(workloads) > limit {
		workloads = workloads[:limit]
	}

	return workloads, nil
}

// GetGlobalAlertStats 获取全局告警统计（聚合所有集群的告警数据）
func (s *OverviewService) GetGlobalAlertStats(ctx context.Context) (*GlobalAlertStats, error) {
	clusters, err := s.getClusters(ctx)
	if err != nil {
		return nil, fmt.Errorf("获取集群列表失败: %w", err)
	}

	stats := &GlobalAlertStats{
		BySeverity: make(map[string]int),
		ByCluster:  make([]ClusterAlertCount, 0),
	}

	if s.alertManagerCfgSvc == nil || s.alertManagerSvc == nil {
		logger.Warn("AlertManager 服务未配置，返回空统计")
		return stats, nil
	}

	// 并发获取各集群告警
	type clusterResult struct {
		ClusterID   uint
		ClusterName string
		Stats       *models.AlertStats
		Enabled     bool
		Err         error
	}

	resultCh := make(chan clusterResult, len(clusters))
	var wg sync.WaitGroup

	for _, cluster := range clusters {
		wg.Add(1)
		go func(c *models.Cluster) {
			defer wg.Done()

			result := clusterResult{
				ClusterID:   c.ID,
				ClusterName: c.Name,
			}

			// 获取集群的 AlertManager 配置
			config, err := s.alertManagerCfgSvc.GetAlertManagerConfig(c.ID)
			if err != nil {
				result.Err = err
				resultCh <- result
				return
			}

			if !config.Enabled {
				result.Enabled = false
				resultCh <- result
				return
			}

			result.Enabled = true

			// 获取告警统计
			alertStats, err := s.alertManagerSvc.GetAlertStats(ctx, config)
			if err != nil {
				logger.Warn("获取集群告警统计失败", "cluster", c.Name, "error", err)
				result.Err = err
				resultCh <- result
				return
			}

			result.Stats = alertStats
			resultCh <- result
		}(cluster)
	}

	// 等待完成后关闭 channel
	go func() {
		wg.Wait()
		close(resultCh)
	}()

	// 汇总结果
	for result := range resultCh {
		if !result.Enabled {
			continue
		}

		stats.EnabledCount++

		if result.Stats == nil {
			continue
		}

		// 汇总总数
		stats.Total += result.Stats.Total
		stats.Firing += result.Stats.Firing
		stats.Pending += result.Stats.Pending
		stats.Resolved += result.Stats.Resolved
		stats.Suppressed += result.Stats.Suppressed

		// 汇总按严重程度
		for severity, count := range result.Stats.BySeverity {
			stats.BySeverity[severity] += count
		}

		// 记录每个集群的告警数
		stats.ByCluster = append(stats.ByCluster, ClusterAlertCount{
			ClusterID:   result.ClusterID,
			ClusterName: result.ClusterName,
			Total:       result.Stats.Total,
			Firing:      result.Stats.Firing,
		})
	}

	// 按告警数排序
	sort.Slice(stats.ByCluster, func(i, j int) bool {
		return stats.ByCluster[i].Firing > stats.ByCluster[j].Firing
	})

	return stats, nil
}

// ========== 辅助函数 ==========

// detectPodIssue 检测 Pod 异常
func detectPodIssue(pod *corev1.Pod) (string, string) {
	for _, cs := range pod.Status.ContainerStatuses {
		if cs.State.Waiting != nil {
			switch cs.State.Waiting.Reason {
			case "ImagePullBackOff", "ErrImagePull":
				return "镜像拉取失败", "critical"
			case "CrashLoopBackOff":
				return "容器崩溃重启", "critical"
			case "CreateContainerConfigError":
				return "容器配置错误", "warning"
			}
		}
		if cs.LastTerminationState.Terminated != nil {
			if cs.LastTerminationState.Terminated.Reason == "OOMKilled" {
				return "OOM 内存溢出", "critical"
			}
		}
	}
	if pod.Status.Phase == corev1.PodPending {
		// 检查是否 Pending 超过 5 分钟
		if time.Since(pod.CreationTimestamp.Time) > 5*time.Minute {
			return "调度超时", "warning"
		}
	}
	return "", ""
}

// detectRolloutIssue 检测 Argo Rollout 异常
func detectRolloutIssue(rollout *rolloutsv1alpha1.Rollout) (string, string, string) {
	// 检查副本不一致
	if rollout.Spec.Replicas != nil {
		desired := *rollout.Spec.Replicas
		ready := rollout.Status.ReadyReplicas
		if ready < desired {
			return "Pod副本不足", fmt.Sprintf("期望 %d 个副本，就绪 %d 个", desired, ready), "warning"
		}
	}

	// 检查发布状态
	phase := rollout.Status.Phase
	switch phase {
	case rolloutsv1alpha1.RolloutPhaseDegraded:
		return "发布降级", "Rollout 处于降级状态", "critical"
	case rolloutsv1alpha1.RolloutPhasePaused:
		// 暂停状态可能是正常的（金丝雀发布暂停），检查是否有异常条件
		for _, cond := range rollout.Status.Conditions {
			if cond.Type == rolloutsv1alpha1.RolloutProgressing && cond.Reason == "ProgressDeadlineExceeded" {
				return "发布超时", cond.Message, "critical"
			}
		}
	}

	// 检查 Condition 中的异常
	for _, cond := range rollout.Status.Conditions {
		if cond.Type == rolloutsv1alpha1.RolloutProgressing && cond.Reason == "ProgressDeadlineExceeded" {
			return "发布超时", cond.Message, "critical"
		}
		if cond.Type == rolloutsv1alpha1.RolloutReplicaFailure {
			return "副本失败", cond.Message, "critical"
		}
	}

	return "", "", ""
}

// formatDuration 格式化持续时间
func formatDuration(t time.Time) string {
	d := time.Since(t)
	if d < time.Minute {
		return fmt.Sprintf("%d秒", int(d.Seconds()))
	}
	if d < time.Hour {
		return fmt.Sprintf("%d分钟", int(d.Minutes()))
	}
	if d < 24*time.Hour {
		return fmt.Sprintf("%d小时", int(d.Hours()))
	}
	return fmt.Sprintf("%d天", int(d.Hours()/24))
}

// parseTimeRange 解析时间范围
func parseTimeRange(timeRange string) (int64, int64) {
	end := time.Now().Unix()
	var start int64
	switch timeRange {
	case "1h":
		start = end - 3600
	case "6h":
		start = end - 6*3600
	case "1d":
		start = end - 24*3600
	case "7d":
		start = end - 7*24*3600
	case "30d":
		start = end - 30*24*3600
	default:
		start = end - 7*24*3600
	}
	return start, end
}

// extractInstantValue 从 Prometheus 响应中提取即时值（用于 instant query）
//nolint:unused // 保留用于未来使用
func extractInstantValue(resp *models.MetricsResponse) float64 {
	if resp == nil || len(resp.Data.Result) == 0 {
		return -1
	}
	result := resp.Data.Result[0]
	if len(result.Value) >= 2 {
		if val, ok := result.Value[1].(string); ok {
			var f float64
			if _, err := fmt.Sscanf(val, "%f", &f); err == nil {
				return f
			}
		}
	}
	return -1
}

// extractLatestValue 从 Prometheus range query 响应中提取最新值
func extractLatestValue(resp *models.MetricsResponse) float64 {
	if resp == nil || len(resp.Data.Result) == 0 {
		return -1
	}
	result := resp.Data.Result[0]
	// 优先从 Values (range query) 中获取最后一个值
	if len(result.Values) > 0 {
		lastValue := result.Values[len(result.Values)-1]
		if len(lastValue) >= 2 {
			if strVal, ok := lastValue[1].(string); ok {
				var f float64
				if _, err := fmt.Sscanf(strVal, "%f", &f); err == nil {
					return f
				}
			}
		}
	}
	// 兼容 instant query 的 Value 格式
	if len(result.Value) >= 2 {
		if val, ok := result.Value[1].(string); ok {
			var f float64
			if _, err := fmt.Sscanf(val, "%f", &f); err == nil {
				return f
			}
		}
	}
	return -1
}

// extractRangeSeries 从 Prometheus 响应中提取范围序列
//nolint:unused // 保留用于未来使用
func extractRangeSeries(resp *models.MetricsResponse) []TrendDataPoint {
	if resp == nil || len(resp.Data.Result) == 0 {
		return nil
	}
	result := resp.Data.Result[0]
	var points []TrendDataPoint
	for _, v := range result.Values {
		if len(v) >= 2 {
			ts, _ := v[0].(float64)
			var val float64
			if strVal, ok := v[1].(string); ok {
				_, _ = fmt.Sscanf(strVal, "%f", &val)
			}
			points = append(points, TrendDataPoint{
				Timestamp: int64(ts),
				Value:     val,
			})
		}
	}
	return points
}

// extractRangeSeriesWithDefault 从 Prometheus 响应中提取范围序列，处理 null 值
// 如果某个时间点的值为 null 或无效，使用前一个有效值填充
func extractRangeSeriesWithDefault(resp *models.MetricsResponse) []TrendDataPoint {
	if resp == nil || len(resp.Data.Result) == 0 {
		return nil
	}
	result := resp.Data.Result[0]
	var points []TrendDataPoint
	var lastValidValue float64 = 0

	for _, v := range result.Values {
		if len(v) >= 2 {
			ts, _ := v[0].(float64)
			var val float64
			var valid bool

			if strVal, ok := v[1].(string); ok && strVal != "" && strVal != "NaN" && strVal != "null" {
				n, err := fmt.Sscanf(strVal, "%f", &val)
				valid = (n == 1 && err == nil)
			}

			if valid {
				lastValidValue = val
			} else {
				// 使用前一个有效值
				val = lastValidValue
			}

			points = append(points, TrendDataPoint{
				Timestamp: int64(ts),
				Value:     val,
			})
		}
	}
	return points
}

// 确保 appsv1 包被使用（避免 unused import 错误）
var _ *appsv1.Deployment = nil
