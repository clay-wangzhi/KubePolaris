package handlers

import (
	"context"
	"fmt"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/labels"

	"github.com/clay-wangzhi/KubePolaris/internal/config"
	"github.com/clay-wangzhi/KubePolaris/internal/k8s"
	"github.com/clay-wangzhi/KubePolaris/internal/models"
	"github.com/clay-wangzhi/KubePolaris/internal/response"
	"github.com/clay-wangzhi/KubePolaris/internal/services"
	"github.com/clay-wangzhi/KubePolaris/pkg/logger"
)

// ClusterHandler 集群处理器
type ClusterHandler struct {
	db               *gorm.DB
	cfg              *config.Config
	clusterService   *services.ClusterService
	k8sMgr           *k8s.ClusterInformerManager
	promService      *services.PrometheusService
	monitoringCfgSvc *services.MonitoringConfigService
	permissionSvc    *services.PermissionService
}

// NewClusterHandler 创建集群处理器
func NewClusterHandler(db *gorm.DB, cfg *config.Config, mgr *k8s.ClusterInformerManager, promService *services.PrometheusService, monitoringCfgSvc *services.MonitoringConfigService, permSvc *services.PermissionService) *ClusterHandler {
	return &ClusterHandler{
		db:               db,
		cfg:              cfg,
		clusterService:   services.NewClusterService(db),
		k8sMgr:           mgr,
		promService:      promService,
		monitoringCfgSvc: monitoringCfgSvc,
		permissionSvc:    permSvc,
	}
}

// GetClusters 获取集群列表（按用户权限过滤）
func (h *ClusterHandler) GetClusters(c *gin.Context) {
	userID := c.GetUint("user_id")

	// 获取用户可访问的集群
	clusters, err := h.getAccessibleClusters(userID)
	if err != nil {
		logger.Error("获取集群列表失败", "error", err)
		response.InternalError(c, "获取集群列表失败: "+err.Error())
		return
	}

	// 转换为响应格式
	clusterList := make([]gin.H, 0, len(clusters))
	for _, cluster := range clusters {
		clusterData := gin.H{
			"id":        cluster.ID,
			"name":      cluster.Name,
			"apiServer": cluster.APIServer,
			"version":   cluster.Version,
			"status":    cluster.Status,
			"createdAt": cluster.CreatedAt.Format("2006-01-02T15:04:05Z"),
			"updatedAt": cluster.UpdatedAt.Format("2006-01-02T15:04:05Z"),
		}

		if cluster.LastHeartbeat != nil {
			clusterData["lastHeartbeat"] = cluster.LastHeartbeat.Format("2006-01-02T15:04:05Z")
		}

		// 获取实时节点信息和指标
		if h.k8sMgr != nil {
			nodeCount, readyNodes := h.getClusterNodeInfo(cluster)
			clusterData["nodeCount"] = nodeCount
			clusterData["readyNodes"] = readyNodes
		} else {
			clusterData["nodeCount"] = 0
			clusterData["readyNodes"] = 0
		}

		// 获取集群 CPU、内存使用率
		cpuUsage, memoryUsage := h.getClusterResourceUsage(c.Request.Context(), cluster)
		clusterData["cpuUsage"] = cpuUsage
		clusterData["memoryUsage"] = memoryUsage

		clusterList = append(clusterList, clusterData)
	}

	response.PagedList(c, clusterList, int64(len(clusterList)), 1, 10)
}

// ImportCluster 导入集群
func (h *ClusterHandler) ImportCluster(c *gin.Context) {
	logger.Info("导入集群")

	// 获取请求参数
	var req struct {
		Name        string `json:"name" binding:"required"`
		Description string `json:"description"`
		ApiServer   string `json:"apiServer"`
		Kubeconfig  string `json:"kubeconfig"`
		Token       string `json:"token"`
		CaCert      string `json:"caCert"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "请求参数错误: "+err.Error())
		return
	}

	logger.Info("导入集群: %s, API Server: %s", req.Name, req.ApiServer)

	// 验证参数
	if req.Kubeconfig == "" && (req.ApiServer == "" || req.Token == "") {
		response.BadRequest(c, "请提供kubeconfig或者API Server地址和访问令牌")
		return
	}

	var k8sClient *services.K8sClient
	var err error

	// 根据提供的参数创建Kubernetes客户端
	if req.Kubeconfig != "" {
		k8sClient, err = services.NewK8sClientFromKubeconfig(req.Kubeconfig)
		if err != nil {
			logger.Error("从kubeconfig创建客户端失败", "error", err)
			response.BadRequest(c, fmt.Sprintf("kubeconfig格式错误: %v", err))
			return
		}
	} else {
		k8sClient, err = services.NewK8sClientFromToken(req.ApiServer, req.Token, req.CaCert)
		if err != nil {
			logger.Error("从Token创建客户端失败", "error", err)
			response.BadRequest(c, fmt.Sprintf("连接配置错误: %v", err))
			return
		}
	}

	// 测试连接
	clusterInfo, err := k8sClient.TestConnection()
	if err != nil {
		logger.Error("连接测试失败", "error", err)
		response.BadRequest(c, fmt.Sprintf("连接测试失败: %v", err))
		return
	}

	// 获取 API Server 地址：如果使用 kubeconfig，从配置中解析
	apiServer := req.ApiServer
	if apiServer == "" && req.Kubeconfig != "" {
		// 从 kubeconfig 解析出的配置中获取 API Server 地址
		restConfig := k8sClient.GetRestConfig()
		if restConfig != nil && restConfig.Host != "" {
			apiServer = restConfig.Host
			logger.Info("从 kubeconfig 中解析出 API Server: %s", apiServer)
		}
	}

	// 创建集群模型
	cluster := &models.Cluster{
		Name:               req.Name,
		APIServer:          apiServer,
		KubeconfigEnc:      req.Kubeconfig, // TODO: 需要加密存储
		SATokenEnc:         req.Token,      // TODO: 需要加密存储
		CAEnc:              req.CaCert,     // TODO: 需要加密存储
		Version:            clusterInfo.Version,
		Status:             clusterInfo.Status,
		Labels:             "{}",
		MonitoringConfig:   "{}", // 初始化为空 JSON 对象，避免 MySQL JSON 字段报错
		AlertManagerConfig: "{}", // 初始化为空 JSON 对象，避免 MySQL JSON 字段报错
		CreatedBy:          1,    // 临时设置为1，后续需要从JWT中获取用户ID
	}

	// 保存到数据库
	err = h.clusterService.CreateCluster(cluster)
	if err != nil {
		logger.Error("保存集群信息失败", "error", err)
		response.InternalError(c, "保存集群信息失败: "+err.Error())
		return
	}

	// 返回新创建的集群信息
	newCluster := gin.H{
		"id":        cluster.ID,
		"name":      cluster.Name,
		"apiServer": cluster.APIServer,
		"version":   cluster.Version,
		"status":    cluster.Status,
		"createdAt": cluster.CreatedAt.Format("2006-01-02T15:04:05Z"),
	}

	response.OK(c, newCluster)
}

// GetCluster 获取集群详情
func (h *ClusterHandler) GetCluster(c *gin.Context) {
	idStr := c.Param("clusterID")
	id, err := strconv.ParseUint(idStr, 10, 32)
	if err != nil {
		response.BadRequest(c, "无效的集群ID")
		return
	}

	cluster, err := h.clusterService.GetCluster(uint(id))
	if err != nil {
		response.NotFound(c, err.Error())
		return
	}

	clusterData := gin.H{
		"id":        cluster.ID,
		"name":      cluster.Name,
		"apiServer": cluster.APIServer,
		"version":   cluster.Version,
		"status":    cluster.Status,
		"createdAt": cluster.CreatedAt.Format("2006-01-02T15:04:05Z"),
		"updatedAt": cluster.UpdatedAt.Format("2006-01-02T15:04:05Z"),
	}

	if cluster.LastHeartbeat != nil {
		clusterData["lastHeartbeat"] = cluster.LastHeartbeat.Format("2006-01-02T15:04:05Z")
	}

	response.OK(c, clusterData)
}

// DeleteCluster 删除集群
func (h *ClusterHandler) DeleteCluster(c *gin.Context) {
	idStr := c.Param("clusterID")
	id, err := strconv.ParseUint(idStr, 10, 32)
	if err != nil {
		response.BadRequest(c, "无效的集群ID")
		return
	}

	clusterID := uint(id)

	// 先停止集群的 informer/watch，避免删除后继续 watch 导致错误
	if h.k8sMgr != nil {
		h.k8sMgr.StopForCluster(clusterID)
	}

	err = h.clusterService.DeleteCluster(clusterID)
	if err != nil {
		// 检查是否是集群不存在的错误
		if strings.Contains(err.Error(), "集群不存在") {
			response.NotFound(c, err.Error())
			return
		}
		response.InternalError(c, err.Error())
		return
	}

	response.OK(c, nil)
}

// GetClusterStats 获取集群统计
func (h *ClusterHandler) GetClusterStats(c *gin.Context) {
	logger.Info("获取集群统计")

	stats, err := h.clusterService.GetClusterStats()
	if err != nil {
		logger.Error("获取集群统计失败", "error", err)
		response.InternalError(c, "获取集群统计失败: "+err.Error())
		return
	}

	response.OK(c, stats)
}

// GetClusterStatus 获取集群实时状态
func (h *ClusterHandler) GetClusterStatus(c *gin.Context) {
	idStr := c.Param("clusterID")
	id, err := strconv.ParseUint(idStr, 10, 32)
	if err != nil {
		response.BadRequest(c, "无效的集群ID")
		return
	}

	cluster, err := h.clusterService.GetCluster(uint(id))
	if err != nil {
		response.NotFound(c, err.Error())
		return
	}

	// 获取实时节点信息
	nodeCount, readyNodes := h.getClusterNodeInfo(cluster)

	statusData := gin.H{
		"id":         cluster.ID,
		"name":       cluster.Name,
		"status":     cluster.Status,
		"nodeCount":  nodeCount,
		"readyNodes": readyNodes,
		"version":    cluster.Version,
	}

	response.OK(c, statusData)
}

// GetClusterOverview 获取集群概览信息
func (h *ClusterHandler) GetClusterOverview(c *gin.Context) {
	clusterID := c.Param("clusterID")
	id, err := strconv.ParseUint(clusterID, 10, 32)
	if err != nil {
		response.BadRequest(c, "无效的集群ID")
		return
	}

	// 获取集群信息
	cluster, err := h.clusterService.GetCluster(uint(id))
	if err != nil {
		response.NotFound(c, "集群不存在")
		return
	}

	// 优先使用 Informer 缓存（方案C）
	// 确保本集群的 informer 已初始化并启动
	if _, err := h.k8sMgr.EnsureForCluster(cluster); err == nil {
		if snap, err := h.k8sMgr.GetOverviewSnapshot(c.Request.Context(), cluster.ID); err == nil {
			// 获取容器子网IP信息
			containerSubnetIPs, err := h.getContainerSubnetIPs(c.Request.Context(), cluster)
			if err != nil {
				logger.Error("获取容器子网IP信息失败", "error", err)
				// 不返回错误，只是不显示容器子网信息
			} else {
				// 转换类型
				snap.ContainerSubnetIPs = &k8s.ContainerSubnetIPs{
					TotalIPs:     containerSubnetIPs.TotalIPs,
					UsedIPs:      containerSubnetIPs.UsedIPs,
					AvailableIPs: containerSubnetIPs.AvailableIPs,
				}
			}

			response.OK(c, snap)
			return
		}
	}

	// 如果 informer 方式失败，返回错误
	response.ServiceUnavailable(c, "集群信息获取失败")
}

// getContainerSubnetIPs 获取容器子网IP信息
func (h *ClusterHandler) getContainerSubnetIPs(ctx context.Context, cluster *models.Cluster) (*models.ContainerSubnetIPs, error) {
	// 获取监控配置
	monitoringConfigService := services.NewMonitoringConfigService(h.db)
	config, err := monitoringConfigService.GetMonitoringConfig(cluster.ID)
	if err != nil {
		return nil, fmt.Errorf("获取监控配置失败: %w", err)
	}

	// 如果监控功能被禁用，返回空信息
	if config.Type == "disabled" {
		return nil, fmt.Errorf("监控功能已禁用")
	}

	// 查询容器子网IP信息
	prometheusService := services.NewPrometheusService()
	return prometheusService.QueryContainerSubnetIPs(ctx, config)
}

/*
*
GetClusterEvents 获取集群 K8s 事件列表
GET /api/v1/clusters/:clusterID/events?search=xxx&type=Normal|Warning
返回前端定义的 K8sEvent 数组（不分页）
*/
func (h *ClusterHandler) GetClusterEvents(c *gin.Context) {
	idStr := c.Param("clusterID")
	id, err := strconv.ParseUint(idStr, 10, 32)
	if err != nil {
		response.BadRequest(c, "无效的集群ID")
		return
	}

	cluster, err := h.clusterService.GetCluster(uint(id))
	if err != nil {
		response.NotFound(c, "集群不存在")
		return
	}

	// 获取缓存的 K8s 客户端
	k8sClient, err := h.k8sMgr.GetK8sClient(cluster)
	if err != nil {
		logger.Error("获取K8s客户端失败", "error", err)
		response.InternalError(c, "获取K8s客户端失败: "+err.Error())
		return
	}

	cs := k8sClient.GetClientset()

	// 拉取所有命名空间的 core/v1 Event
	evList, err := cs.CoreV1().Events("").List(c.Request.Context(), metav1.ListOptions{})
	if err != nil {
		logger.Error("获取K8s事件失败", "error", err)
		response.InternalError(c, "获取K8s事件失败: "+err.Error())
		return
	}

	search := strings.TrimSpace(c.Query("search"))
	ftype := strings.TrimSpace(c.Query("type"))

	out := make([]gin.H, 0, len(evList.Items))
	for _, e := range evList.Items {
		// 类型过滤
		if ftype != "" && !strings.EqualFold(e.Type, ftype) {
			continue
		}
		// 关键字过滤（对象kind/name/ns、reason、message）
		if search != "" {
			s := strings.ToLower(search)
			if !strings.Contains(strings.ToLower(e.InvolvedObject.Kind), s) &&
				!strings.Contains(strings.ToLower(e.InvolvedObject.Name), s) &&
				!strings.Contains(strings.ToLower(e.InvolvedObject.Namespace), s) &&
				!strings.Contains(strings.ToLower(e.Reason), s) &&
				!strings.Contains(strings.ToLower(e.Message), s) {
				continue
			}
		}

		// 发生时间优先级：lastTimestamp > eventTime > firstTimestamp > metadata.creationTimestamp
		var lastTS string
		if !e.LastTimestamp.IsZero() {
			lastTS = e.LastTimestamp.Time.UTC().Format(time.RFC3339)
		} else if !e.EventTime.IsZero() {
			lastTS = e.EventTime.Time.UTC().Format(time.RFC3339)
		} else if !e.FirstTimestamp.IsZero() {
			lastTS = e.FirstTimestamp.Time.UTC().Format(time.RFC3339)
		} else if !e.CreationTimestamp.IsZero() {
			lastTS = e.ObjectMeta.CreationTimestamp.Time.UTC().Format(time.RFC3339)
		}

		out = append(out, gin.H{
			"metadata": gin.H{
				"uid":       string(e.UID),
				"name":      e.Name,
				"namespace": e.Namespace,
				"creationTimestamp": func() string {
					if e.CreationTimestamp.IsZero() {
						return ""
					}
					return e.CreationTimestamp.Time.UTC().Format(time.RFC3339)
				}(),
			},
			"involvedObject": gin.H{
				"kind":       e.InvolvedObject.Kind,
				"name":       e.InvolvedObject.Name,
				"namespace":  e.InvolvedObject.Namespace,
				"uid":        string(e.InvolvedObject.UID),
				"apiVersion": e.InvolvedObject.APIVersion,
				"fieldPath":  e.InvolvedObject.FieldPath,
			},
			"type":    e.Type,
			"reason":  e.Reason,
			"message": e.Message,
			"source":  gin.H{"component": e.Source.Component, "host": e.Source.Host},
			"firstTimestamp": func() string {
				if e.FirstTimestamp.IsZero() {
					return ""
				}
				return e.FirstTimestamp.Time.UTC().Format(time.RFC3339)
			}(),
			"lastTimestamp": lastTS,
			"eventTime": func() string {
				if e.EventTime.IsZero() {
					return ""
				}
				return e.EventTime.Time.UTC().Format(time.RFC3339)
			}(),
			"count": e.Count,
		})
	}

	response.OK(c, out)
}

// GetClusterMetrics 获取集群监控数据
func (h *ClusterHandler) GetClusterMetrics(c *gin.Context) {
	id := c.Param("clusterID")
	logger.Info("获取集群监控数据: %s", id)

	// 获取请求参数
	rangeParam := c.DefaultQuery("range", "1h")
	step := c.DefaultQuery("step", "1m")

	// 从数据库获取集群
	clusterID, err := strconv.ParseUint(id, 10, 32)
	if err != nil {
		response.BadRequest(c, "无效的集群ID")
		return
	}

	cluster, err := h.clusterService.GetCluster(uint(clusterID))
	if err != nil {
		logger.Error("获取集群失败", "error", err)
		response.NotFound(c, "集群不存在")
		return
	}

	// 获取缓存的 K8s 客户端
	k8sClient, err := h.k8sMgr.GetK8sClient(cluster)
	if err != nil {
		logger.Error("获取K8s客户端失败", "error", err)
		response.InternalError(c, "获取集群监控数据失败: "+err.Error())
		return
	}

	// 获取集群监控数据
	metrics, err := k8sClient.GetClusterMetrics(rangeParam, step)
	if err != nil {
		logger.Error("获取集群监控数据失败", "error", err)
		response.InternalError(c, "获取集群监控数据失败: "+err.Error())
		return
	}

	response.OK(c, metrics)
}

// TestConnection 测试集群连接
func (h *ClusterHandler) TestConnection(c *gin.Context) {
	logger.Info("测试集群连接")

	// 获取请求参数
	var req struct {
		ApiServer  string `json:"apiServer"`
		Kubeconfig string `json:"kubeconfig"`
		Token      string `json:"token"`
		CaCert     string `json:"caCert"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		logger.Error("参数绑定错误: %v", err)
		response.BadRequest(c, "请求参数错误: "+err.Error())
		return
	}

	// 打印接收到的参数用于调试

	// 验证参数
	if req.Kubeconfig == "" && (req.ApiServer == "" || req.Token == "") {
		response.BadRequest(c, "请提供kubeconfig或者API Server地址和访问令牌")
		return
	}

	var k8sClient *services.K8sClient
	var err error

	// 根据提供的参数创建Kubernetes客户端
	if req.Kubeconfig != "" {
		// 使用kubeconfig创建客户端
		k8sClient, err = services.NewK8sClientFromKubeconfig(req.Kubeconfig)
		if err != nil {
			logger.Error("从kubeconfig创建客户端失败", "error", err)
			response.BadRequest(c, fmt.Sprintf("kubeconfig格式错误: %v", err))
			return
		}
	} else {
		// 使用API Server和Token创建客户端
		k8sClient, err = services.NewK8sClientFromToken(req.ApiServer, req.Token, req.CaCert)
		if err != nil {
			logger.Error("从Token创建客户端失败", "error", err)
			response.BadRequest(c, fmt.Sprintf("连接配置错误: %v", err))
			return
		}
	}

	// 测试连接并获取集群信息
	clusterInfo, err := k8sClient.TestConnection()
	if err != nil {
		logger.Error("连接测试失败", "error", err)
		response.BadRequest(c, fmt.Sprintf("连接测试失败: %v", err))
		return
	}

	testResult := gin.H{
		"version":    clusterInfo.Version,
		"nodeCount":  clusterInfo.NodeCount,
		"readyNodes": clusterInfo.ReadyNodes,
		"status":     clusterInfo.Status,
	}

	response.OK(c, testResult)
}

// getClusterNodeInfo 获取集群节点信息
func (h *ClusterHandler) getClusterNodeInfo(cluster *models.Cluster) (int, int) {
	// 使用 informer+lister 读取节点并统计（不直连 API）
	if _, err := h.k8sMgr.EnsureAndWait(context.Background(), cluster, 5*time.Second); err != nil {
		logger.Error("informer 未就绪", "error", err)
		return 0, 0
	}
	nodes, err := h.k8sMgr.NodesLister(cluster.ID).List(labels.Everything())
	if err != nil {
		logger.Error("读取节点缓存失败", "error", err)
		return 0, 0
	}
	nodeCount := len(nodes)
	readyNodes := 0
	for _, node := range nodes {
		for _, condition := range node.Status.Conditions {
			if condition.Type == "Ready" && condition.Status == "True" {
				readyNodes++
				break
			}
		}
	}
	return nodeCount, readyNodes
}

// getClusterResourceUsage 获取集群 CPU 和内存使用率
func (h *ClusterHandler) getClusterResourceUsage(ctx context.Context, cluster *models.Cluster) (float64, float64) {
	if h.promService == nil || h.monitoringCfgSvc == nil {
		return 0, 0
	}

	// 获取集群的监控配置
	config, err := h.monitoringCfgSvc.GetMonitoringConfig(cluster.ID)
	if err != nil || config.Type == "disabled" {
		return 0, 0
	}

	// 设置时间范围（最近 5 分钟）
	now := time.Now().Unix()
	start := now - 300
	step := "1m"

	var cpuUsage, memoryUsage float64

	// 查询 CPU 使用率
	cpuQuery := &models.MetricsQuery{
		Query: "(1 - avg(rate(node_cpu_seconds_total{mode=\"idle\"}[5m]))) * 100",
		Start: start,
		End:   now,
		Step:  step,
	}
	if resp, err := h.promService.QueryPrometheus(ctx, config, cpuQuery); err == nil {
		if val := extractLatestValueFromResponse(resp); val >= 0 {
			cpuUsage = val
		}
	}

	// 查询内存使用率
	memQuery := &models.MetricsQuery{
		Query: "(1 - sum(node_memory_MemAvailable_bytes) / sum(node_memory_MemTotal_bytes)) * 100",
		Start: start,
		End:   now,
		Step:  step,
	}
	if resp, err := h.promService.QueryPrometheus(ctx, config, memQuery); err == nil {
		if val := extractLatestValueFromResponse(resp); val >= 0 {
			memoryUsage = val
		}
	}

	return cpuUsage, memoryUsage
}

// extractLatestValueFromResponse 从 Prometheus range query 响应中提取最新值
func extractLatestValueFromResponse(resp *models.MetricsResponse) float64 {
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

// getAccessibleClusters 获取用户可访问的集群列表
func (h *ClusterHandler) getAccessibleClusters(userID uint) ([]*models.Cluster, error) {
	clusterIDs, isAll, err := h.permissionSvc.GetUserAccessibleClusterIDs(userID)
	if err != nil {
		return nil, err
	}
	if isAll {
		return h.clusterService.GetAllClusters()
	}
	if len(clusterIDs) == 0 {
		return []*models.Cluster{}, nil
	}
	var clusters []*models.Cluster
	if err := h.db.Where("id IN ?", clusterIDs).Find(&clusters).Error; err != nil {
		return nil, fmt.Errorf("获取集群列表失败: %w", err)
	}
	return clusters, nil
}

// maxInt 返回较大的整数，避免出现负数（例如 worker = total - 1）
//nolint:unused // 保留用于未来使用
func maxInt(a, b int) int {
	if a > b {
		return a
	}
	return b
}
