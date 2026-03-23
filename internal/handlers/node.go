package handlers

import (
	"context"
	"strings"
	"time"

	"github.com/clay-wangzhi/KubePolaris/internal/config"
	"github.com/clay-wangzhi/KubePolaris/internal/k8s"
	"github.com/clay-wangzhi/KubePolaris/internal/response"
	"github.com/clay-wangzhi/KubePolaris/internal/services"
	"github.com/clay-wangzhi/KubePolaris/pkg/logger"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
	corev1 "k8s.io/api/core/v1"
	"k8s.io/apimachinery/pkg/labels"
)

// NodeHandler 节点处理器
type NodeHandler struct {
	db               *gorm.DB
	cfg              *config.Config
	clusterService   *services.ClusterService
	k8sMgr           *k8s.ClusterInformerManager
	promService      *services.PrometheusService
	monitoringCfgSvc *services.MonitoringConfigService
}

// NewNodeHandler 创建节点处理器
func NewNodeHandler(db *gorm.DB, cfg *config.Config, clusterService *services.ClusterService, k8sMgr *k8s.ClusterInformerManager, promService *services.PrometheusService, monitoringCfgSvc *services.MonitoringConfigService) *NodeHandler {
	return &NodeHandler{
		db:               db,
		cfg:              cfg,
		clusterService:   clusterService,
		k8sMgr:           k8sMgr,
		promService:      promService,
		monitoringCfgSvc: monitoringCfgSvc,
	}
}

// GetNodes 获取节点列表
func (h *NodeHandler) GetNodes(c *gin.Context) {
	clusterId := c.Param("clusterID")
	logger.Info("获取节点列表: %s", clusterId)

	// 从集群服务获取集群信息
	clusterID, err := parseClusterID(clusterId)
	if err != nil {
		response.BadRequest(c, "无效的集群ID")
		return
	}
	if clusterID == 0 {
		response.BadRequest(c, "无效的集群ID")
		return
	}
	cluster, err := h.clusterService.GetCluster(clusterID)
	if err != nil {
		response.NotFound(c, "集群不存在")
		return
	}

	// 使用 informer+lister 获取节点列表
	if h.k8sMgr == nil {
		response.ServiceUnavailable(c, "K8s informer 管理器未初始化")
		return
	}
	if _, err := h.k8sMgr.EnsureAndWait(context.Background(), cluster, 5*time.Second); err != nil {
		response.ServiceUnavailable(c, "informer 未就绪: "+err.Error())
		return
	}
	nodeObjs, err := h.k8sMgr.NodesLister(cluster.ID).List(labels.Everything())
	if err != nil {
		response.InternalError(c, "读取节点缓存失败: "+err.Error())
		return
	}
	// 转为值类型以复用原有处理逻辑
	items := make([]corev1.Node, 0, len(nodeObjs))
	for _, n := range nodeObjs {
		items = append(items, *n)
	}

	// 获取所有 Pod，统计每个节点上的 Pod 数量
	nodePodCounts := make(map[string]int)
	podObjs, err := h.k8sMgr.PodsLister(cluster.ID).List(labels.Everything())
	if err != nil {
		logger.Error("读取 Pod 缓存失败: %v", err)
		// 继续执行，podCount 将为 0
	} else {
		for _, pod := range podObjs {
			// 只统计非 Succeeded/Failed 状态的 Pod
			if pod.Status.Phase != corev1.PodSucceeded && pod.Status.Phase != corev1.PodFailed {
				nodePodCounts[pod.Spec.NodeName]++
			}
		}
	}

	// 获取所有节点的资源使用率
	nodeResourceUsage := h.getNodesResourceUsage(c.Request.Context(), cluster.ID)

	// 转换为API响应格式
	result := make([]map[string]interface{}, 0, len(items))
	for _, node := range items {
		// 获取节点状态
		status := "NotReady"
		for _, condition := range node.Status.Conditions {
			if condition.Type == "Ready" {
				if condition.Status == "True" {
					status = "Ready"
				}
				break
			}
		}

		// 获取节点角色
		roles := []string{}
		for label := range node.Labels {
			if label == "node-role.kubernetes.io/control-plane" || label == "node-role.kubernetes.io/master" {
				roles = append(roles, "master")
			} else if strings.HasPrefix(label, "node-role.kubernetes.io/") {
				role := strings.TrimPrefix(label, "node-role.kubernetes.io/")
				roles = append(roles, role)
			}
		}
		if len(roles) == 0 {
			roles = append(roles, "worker")
		}

		// 获取节点污点
		taints := []map[string]string{}
		for _, taint := range node.Spec.Taints {
			taints = append(taints, map[string]string{
				"key":    taint.Key,
				"value":  taint.Value,
				"effect": string(taint.Effect),
			})
		}

		// 获取节点资源信息
		cpuCapacity := node.Status.Capacity.Cpu().MilliValue()
		memoryCapacity := node.Status.Capacity.Memory().Value() / (1024 * 1024) // 转换为MB
		podCapacity := node.Status.Capacity.Pods().Value()

		// 获取节点的 CPU 和内存使用率
		cpuUsage := 0.0
		memoryUsage := 0.0
		// 尝试通过节点名称匹配
		if usage, exists := nodeResourceUsage[node.Name]; exists {
			cpuUsage = usage["cpuUsage"]
			memoryUsage = usage["memoryUsage"]
		} else {
			// 尝试通过内部 IP 匹配（Prometheus 的 instance 标签可能是 IP 地址）
			internalIP := getNodeInternalIP(node)
			if internalIP != "" {
				if usage, exists := nodeResourceUsage[internalIP]; exists {
					cpuUsage = usage["cpuUsage"]
					memoryUsage = usage["memoryUsage"]
				}
			}
		}

		result = append(result, map[string]interface{}{
			"id":               node.Name, // 使用节点名作为ID
			"name":             node.Name,
			"status":           status,
			"roles":            roles,
			"version":          node.Status.NodeInfo.KubeletVersion,
			"osImage":          node.Status.NodeInfo.OSImage,
			"kernelVersion":    node.Status.NodeInfo.KernelVersion,
			"containerRuntime": node.Status.NodeInfo.ContainerRuntimeVersion,
			"cpuUsage":         cpuUsage,
			"memoryUsage":      memoryUsage,
			"podCount":         nodePodCounts[node.Name],
			"maxPods":          podCapacity,
			"taints":           taints,
			"unschedulable":    node.Spec.Unschedulable,
			"createdAt":        node.CreationTimestamp.Time,
			"internalIP":       getNodeInternalIP(node),
			"externalIP":       getNodeExternalIP(node),
			"resources": map[string]interface{}{
				"cpu":    cpuCapacity,
				"memory": memoryCapacity,
				"pods":   podCapacity,
			},
		})
	}

	response.PagedList(c, result, int64(len(result)), 1, 50)
}

// GetNodeOverview 获取节点概览信息
func (h *NodeHandler) GetNodeOverview(c *gin.Context) {
	clusterId := c.Param("clusterID")
	logger.Info("获取节点概览: %s", clusterId)

	// 从集群服务获取集群信息
	clusterID, err := parseClusterID(clusterId)
	if err != nil {
		response.BadRequest(c, "无效的集群ID")
		return
	}
	cluster, err := h.clusterService.GetCluster(clusterID)
	if err != nil {
		response.NotFound(c, "集群不存在")
		return
	}

	// 使用 informer+lister 读取节点并统计
	if _, err := h.k8sMgr.EnsureAndWait(context.Background(), cluster, 5*time.Second); err != nil {
		logger.Error("informer 未就绪", "error", err)
		response.ServiceUnavailable(c, "informer 未就绪: "+err.Error())
		return
	}
	nodeObjs, err := h.k8sMgr.NodesLister(cluster.ID).List(labels.Everything())
	if err != nil {
		logger.Error("读取节点缓存失败", "error", err)
		response.InternalError(c, "读取节点缓存失败: "+err.Error())
		return
	}
	totalNodes := len(nodeObjs)
	readyNodes := 0
	notReadyNodes := 0
	maintenanceNodes := 0

	for _, node := range nodeObjs {
		for _, condition := range node.Status.Conditions {
			if condition.Type == "Ready" {
				if condition.Status == "True" {
					readyNodes++
				} else {
					notReadyNodes++
				}
				break
			}
		}

		// 检查是否处于维护状态（有NoSchedule污点）
		if node.Spec.Unschedulable {
			maintenanceNodes++
		}
	}

	ctx := c.Request.Context()
	nodeResourceUsage := h.getNodesResourceUsage(ctx, cluster.ID)
	var totalCPU, totalMemory float64
	usageCount := 0
	for _, usage := range nodeResourceUsage {
		totalCPU += usage["cpuUsage"]
		totalMemory += usage["memoryUsage"]
		usageCount++
	}
	var cpuUsage, memoryUsage float64
	if usageCount > 0 {
		cpuUsage = totalCPU / float64(usageCount)
		memoryUsage = totalMemory / float64(usageCount)
	}

	overview := gin.H{
		"totalNodes":       totalNodes,
		"readyNodes":       readyNodes,
		"notReadyNodes":    notReadyNodes,
		"maintenanceNodes": maintenanceNodes,
		"cpuUsage":         cpuUsage,
		"memoryUsage":      memoryUsage,
		"storageUsage":     0.0,
	}

	response.OK(c, overview)
}

// GetNode 获取节点详情
func (h *NodeHandler) GetNode(c *gin.Context) {
	clusterId := c.Param("clusterID")
	name := c.Param("name")
	logger.Info("获取节点详情: %s/%s", clusterId, name)

	// 从集群服务获取集群信息
	clusterID, err := parseClusterID(clusterId)
	if err != nil {
		response.BadRequest(c, "无效的集群ID")
		return
	}
	cluster, err := h.clusterService.GetCluster(clusterID)
	if err != nil {
		response.NotFound(c, "集群不存在")
		return
	}

	// 使用 informer+lister 获取节点详情
	if h.k8sMgr == nil {
		response.ServiceUnavailable(c, "K8s informer 管理器未初始化")
		return
	}
	if _, err := h.k8sMgr.EnsureAndWait(context.Background(), cluster, 5*time.Second); err != nil {
		response.ServiceUnavailable(c, "informer 未就绪: "+err.Error())
		return
	}
	node, err := h.k8sMgr.NodesLister(cluster.ID).Get(name)
	if err != nil {
		response.InternalError(c, "读取节点缓存失败: "+err.Error())
		return
	}

	// 获取节点状态
	status := "NotReady"
	conditions := []map[string]interface{}{}
	for _, condition := range node.Status.Conditions {
		conditions = append(conditions, map[string]interface{}{
			"type":    string(condition.Type),
			"status":  string(condition.Status),
			"reason":  condition.Reason,
			"message": condition.Message,
		})

		if condition.Type == "Ready" {
			if condition.Status == "True" {
				status = "Ready"
			}
		}
	}

	// 获取节点角色
	roles := []string{}
	for label := range node.Labels {
		if label == "node-role.kubernetes.io/control-plane" || label == "node-role.kubernetes.io/master" {
			roles = append(roles, "master")
		} else if strings.HasPrefix(label, "node-role.kubernetes.io/") {
			role := strings.TrimPrefix(label, "node-role.kubernetes.io/")
			roles = append(roles, role)
		}
	}
	if len(roles) == 0 {
		roles = append(roles, "worker")
	}

	// 获取节点污点
	taints := []map[string]string{}
	for _, taint := range node.Spec.Taints {
		taints = append(taints, map[string]string{
			"key":    taint.Key,
			"value":  taint.Value,
			"effect": string(taint.Effect),
		})
	}

	// 获取节点标签
	nodeLabels := []map[string]string{}
	for key, value := range node.Labels {
		nodeLabels = append(nodeLabels, map[string]string{
			"key":   key,
			"value": value,
		})
	}

	// 获取节点资源信息
	cpuCapacity := node.Status.Capacity.Cpu().MilliValue()
	memoryCapacity := node.Status.Capacity.Memory().Value() / (1024 * 1024) // 转换为MB
	podCapacity := node.Status.Capacity.Pods().Value()

	// 获取节点地址
	addresses := []map[string]string{}
	for _, address := range node.Status.Addresses {
		addresses = append(addresses, map[string]string{
			"type":    string(address.Type),
			"address": address.Address,
		})
	}

	// 获取节点的实际资源使用情况（通过缓存读取路径暂不直连 API，保留默认值）
	cpuUsage := 0.0
	memoryUsage := 0.0
	podCount := 0

	// 统计该节点上的 Pod 数量
	podObjs, err := h.k8sMgr.PodsLister(cluster.ID).List(labels.Everything())
	if err != nil {
		logger.Error("读取 Pod 缓存失败: %v", err)
	} else {
		for _, pod := range podObjs {
			// 只统计运行在该节点上且非 Succeeded/Failed 状态的 Pod
			if pod.Spec.NodeName == name && pod.Status.Phase != corev1.PodSucceeded && pod.Status.Phase != corev1.PodFailed {
				podCount++
			}
		}
	}

	result := map[string]interface{}{
		"name":              node.Name,
		"status":            status,
		"roles":             roles,
		"addresses":         addresses,
		"conditions":        conditions,
		"osImage":           node.Status.NodeInfo.OSImage,
		"kernelVersion":     node.Status.NodeInfo.KernelVersion,
		"kubeletVersion":    node.Status.NodeInfo.KubeletVersion,
		"containerRuntime":  node.Status.NodeInfo.ContainerRuntimeVersion,
		"architecture":      node.Status.NodeInfo.Architecture,
		"taints":            taints,
		"labels":            nodeLabels,
		"unschedulable":     node.Spec.Unschedulable,
		"creationTimestamp": node.CreationTimestamp.Time,
		"cpuUsage":          cpuUsage,
		"memoryUsage":       memoryUsage,
		"podCount":          podCount,
		"resources": map[string]interface{}{
			"cpu":    cpuCapacity,
			"memory": memoryCapacity,
			"pods":   podCapacity,
		},
	}

	response.OK(c, result)
}

// CordonNode 封锁节点
func (h *NodeHandler) CordonNode(c *gin.Context) {
	clusterId := c.Param("clusterID")
	name := c.Param("name")
	logger.Info("封锁节点: %s/%s", clusterId, name)

	// 从集群服务获取集群信息
	clusterID, err := parseClusterID(clusterId)
	if err != nil {
		response.BadRequest(c, "无效的集群ID")
		return
	}
	cluster, err := h.clusterService.GetCluster(clusterID)
	if err != nil {
		response.NotFound(c, "集群不存在")
		return
	}

	// 获取缓存的 K8s 客户端
	k8sClient, err := h.k8sMgr.GetK8sClient(cluster)
	if err != nil {
		response.InternalError(c, "获取K8s客户端失败: "+err.Error())
		return
	}

	// 封锁节点
	err = k8sClient.CordonNode(name)
	if err != nil {
		response.InternalError(c, "封锁节点失败: "+err.Error())
		return
	}

	response.NoContent(c)
}

// UncordonNode 解封节点
func (h *NodeHandler) UncordonNode(c *gin.Context) {
	clusterId := c.Param("clusterID")
	name := c.Param("name")
	logger.Info("解封节点: %s/%s", clusterId, name)

	// 从集群服务获取集群信息
	clusterID, err := parseClusterID(clusterId)
	if err != nil {
		response.BadRequest(c, "无效的集群ID")
		return
	}
	cluster, err := h.clusterService.GetCluster(clusterID)
	if err != nil {
		response.NotFound(c, "集群不存在")
		return
	}

	// 获取缓存的 K8s 客户端
	k8sClient, err := h.k8sMgr.GetK8sClient(cluster)
	if err != nil {
		response.InternalError(c, "获取K8s客户端失败: "+err.Error())
		return
	}

	// 解封节点
	err = k8sClient.UncordonNode(name)
	if err != nil {
		response.InternalError(c, "解封节点失败: "+err.Error())
		return
	}

	response.NoContent(c)
}

// DrainNode 驱逐节点
func (h *NodeHandler) DrainNode(c *gin.Context) {
	clusterId := c.Param("clusterID")
	name := c.Param("name")
	logger.Info("驱逐节点: %s/%s", clusterId, name)

	// 解析请求参数
	var options map[string]interface{}
	if err := c.ShouldBindJSON(&options); err != nil {
		response.BadRequest(c, "参数解析失败: "+err.Error())
		return
	}

	// 从集群服务获取集群信息
	clusterID, err := parseClusterID(clusterId)
	if err != nil {
		response.BadRequest(c, "无效的集群ID")
		return
	}
	cluster, err := h.clusterService.GetCluster(clusterID)
	if err != nil {
		response.NotFound(c, "集群不存在")
		return
	}

	// 获取缓存的 K8s 客户端
	k8sClient, err := h.k8sMgr.GetK8sClient(cluster)
	if err != nil {
		response.InternalError(c, "获取K8s客户端失败: "+err.Error())
		return
	}

	// 驱逐节点
	err = k8sClient.DrainNode(name, options)
	if err != nil {
		response.InternalError(c, "驱逐节点失败: "+err.Error())
		return
	}

	response.NoContent(c)
}

// 获取节点内部IP
func getNodeInternalIP(node corev1.Node) string {
	for _, address := range node.Status.Addresses {
		if address.Type == corev1.NodeInternalIP {
			return address.Address
		}
	}
	return ""
}

// 获取节点外部IP
func getNodeExternalIP(node corev1.Node) string {
	for _, address := range node.Status.Addresses {
		if address.Type == corev1.NodeExternalIP {
			return address.Address
		}
	}
	return ""
}

// getNodesResourceUsage 获取所有节点的 CPU 和内存使用率
// 返回一个 map，key 是节点名称，value 包含 cpuUsage 和 memoryUsage
func (h *NodeHandler) getNodesResourceUsage(ctx context.Context, clusterID uint) map[string]map[string]float64 {
	result := make(map[string]map[string]float64)

	if h.promService == nil || h.monitoringCfgSvc == nil {
		return result
	}

	// 获取集群的监控配置
	config, err := h.monitoringCfgSvc.GetMonitoringConfig(clusterID)
	if err != nil || config.Type == "disabled" {
		return result
	}

	// 调用 PrometheusService 的 queryNodeListMetrics 获取节点指标
	nodeList, err := h.promService.QueryNodeListMetrics(ctx, config, "")
	if err != nil {
		logger.Error("获取节点资源使用率失败", "error", err)
		return result
	}

	// 将结果转换为 map
	for _, node := range nodeList {
		result[node.NodeName] = map[string]float64{
			"cpuUsage":    node.CPUUsageRate,
			"memoryUsage": node.MemoryUsageRate,
		}
	}

	return result
}
