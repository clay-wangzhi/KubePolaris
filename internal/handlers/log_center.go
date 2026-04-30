package handlers

import (
	"bufio"
	"context"
	"fmt"
	"net/http"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/clay-wangzhi/KubePolaris/internal/k8s"
	"github.com/clay-wangzhi/KubePolaris/internal/middleware"
	"github.com/clay-wangzhi/KubePolaris/internal/models"
	"github.com/clay-wangzhi/KubePolaris/internal/response"
	"github.com/clay-wangzhi/KubePolaris/internal/services"
	"github.com/clay-wangzhi/KubePolaris/pkg/logger"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/gorilla/websocket"
	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/labels"
)

// LogCenterHandler 日志中心处理器
type LogCenterHandler struct {
	clusterSvc *services.ClusterService
	k8sMgr     *k8s.ClusterInformerManager
	aggregator *services.LogAggregator
	upgrader   websocket.Upgrader
}

// NewLogCenterHandler 创建日志中心处理器
func NewLogCenterHandler(clusterSvc *services.ClusterService, k8sMgr *k8s.ClusterInformerManager) *LogCenterHandler {
	return &LogCenterHandler{
		clusterSvc: clusterSvc,
		k8sMgr:     k8sMgr,
		aggregator: services.NewLogAggregator(clusterSvc),
		upgrader: websocket.Upgrader{
			CheckOrigin: func(r *http.Request) bool {
				origin := r.Header.Get("Origin")
				if origin == "" {
					return true
				}
				return middleware.IsRequestOriginAllowed(origin, r.Host)
			},
			ReadBufferSize:  1024,
			WriteBufferSize: 1024,
		},
	}
}

// GetContainerLogs 获取容器日志
func (h *LogCenterHandler) GetContainerLogs(c *gin.Context) {
	clusterID, err := parseClusterID(c.Param("clusterID"))
	if err != nil {
		response.BadRequest(c, "无效的集群ID")
		return
	}
	namespace := c.Query("namespace")
	podName := c.Query("pod")
	container := c.Query("container")
	tailLines, _ := strconv.ParseInt(c.DefaultQuery("tailLines", "100"), 10, 64)
	sinceSeconds, _ := strconv.ParseInt(c.DefaultQuery("sinceSeconds", "0"), 10, 64)
	previous := c.Query("previous") == "true"

	if namespace == "" || podName == "" {
		response.BadRequest(c, "namespace 和 pod 参数必填")
		return
	}

	cluster, err := h.clusterSvc.GetCluster(clusterID)
	if err != nil {
		response.NotFound(c, "集群不存在")
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	logs, err := h.aggregator.GetContainerLogs(ctx, cluster, namespace, podName, container, tailLines, sinceSeconds, previous)
	if err != nil {
		response.InternalError(c, "获取日志失败: "+err.Error())
		return
	}

	response.OK(c, gin.H{
		"logs": logs,
	})
}

// GetEventLogs 获取K8s事件日志
func (h *LogCenterHandler) GetEventLogs(c *gin.Context) {
	clusterID, err := parseClusterID(c.Param("clusterID"))
	if err != nil {
		response.BadRequest(c, "无效的集群ID")
		return
	}
	namespace := c.Query("namespace")
	resourceType := c.Query("resourceType")
	resourceName := c.Query("resourceName")
	eventType := c.Query("type") // Normal, Warning
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "100"))

	cluster, err := h.clusterSvc.GetCluster(clusterID)
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

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	listOpts := metav1.ListOptions{
		Limit: int64(limit),
	}

	// 构建字段选择器
	var fieldSelectors []string
	if resourceType != "" {
		fieldSelectors = append(fieldSelectors, fmt.Sprintf("involvedObject.kind=%s", resourceType))
	}
	if resourceName != "" {
		fieldSelectors = append(fieldSelectors, fmt.Sprintf("involvedObject.name=%s", resourceName))
	}
	if eventType != "" {
		fieldSelectors = append(fieldSelectors, fmt.Sprintf("type=%s", eventType))
	}
	if len(fieldSelectors) > 0 {
		listOpts.FieldSelector = strings.Join(fieldSelectors, ",")
	}

	events, err := k8sClient.GetClientset().CoreV1().Events(namespace).List(ctx, listOpts)
	if err != nil {
		response.InternalError(c, "获取事件失败: "+err.Error())
		return
	}

	// 转换为统一格式
	eventLogs := make([]models.EventLogEntry, 0, len(events.Items))
	for _, e := range events.Items {
		eventLogs = append(eventLogs, models.EventLogEntry{
			ID:              string(e.UID),
			Type:            e.Type,
			Reason:          e.Reason,
			Message:         e.Message,
			Count:           e.Count,
			FirstTimestamp:  e.FirstTimestamp.Time,
			LastTimestamp:   e.LastTimestamp.Time,
			Namespace:       e.Namespace,
			InvolvedKind:    e.InvolvedObject.Kind,
			InvolvedName:    e.InvolvedObject.Name,
			SourceComponent: e.Source.Component,
			SourceHost:      e.Source.Host,
		})
	}

	// 按时间排序（最新的在前）
	sort.Slice(eventLogs, func(i, j int) bool {
		return eventLogs[i].LastTimestamp.After(eventLogs[j].LastTimestamp)
	})

	response.List(c, eventLogs, int64(len(eventLogs)))
}

// SearchLogs 日志搜索
func (h *LogCenterHandler) SearchLogs(c *gin.Context) {
	clusterID, err := parseClusterID(c.Param("clusterID"))
	if err != nil {
		response.BadRequest(c, "无效的集群ID")
		return
	}

	var query models.LogQuery
	if err := c.ShouldBindJSON(&query); err != nil {
		response.BadRequest(c, "参数错误: "+err.Error())
		return
	}

	cluster, err := h.clusterSvc.GetCluster(clusterID)
	if err != nil {
		response.NotFound(c, "集群不存在")
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()

	results, total, err := h.aggregator.SearchLogs(ctx, cluster, &query)
	if err != nil {
		response.InternalError(c, "搜索失败: "+err.Error())
		return
	}

	response.List(c, results, int64(total))
}

// GetLogStats 获取日志统计
func (h *LogCenterHandler) GetLogStats(c *gin.Context) {
	clusterID, err := parseClusterID(c.Param("clusterID"))
	if err != nil {
		response.BadRequest(c, "无效的集群ID")
		return
	}
	namespace := c.Query("namespace")
	timeRange := c.DefaultQuery("timeRange", "1h") // 1h, 6h, 24h, 7d

	cluster, err := h.clusterSvc.GetCluster(clusterID)
	if err != nil {
		response.NotFound(c, "集群不存在")
		return
	}

	// 计算时间范围
	var since time.Duration
	switch timeRange {
	case "1h":
		since = time.Hour
	case "6h":
		since = 6 * time.Hour
	case "24h":
		since = 24 * time.Hour
	case "7d":
		since = 7 * 24 * time.Hour
	default:
		since = time.Hour
	}
	startTime := time.Now().Add(-since)

	// 获取缓存的 K8s 客户端
	k8sClient, err := h.k8sMgr.GetK8sClient(cluster)
	if err != nil {
		response.InternalError(c, "获取K8s客户端失败: "+err.Error())
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	// 获取事件统计
	events, err := k8sClient.GetClientset().CoreV1().Events(namespace).List(ctx, metav1.ListOptions{})
	if err != nil {
		response.InternalError(c, "获取事件失败: "+err.Error())
		return
	}

	stats := models.LogStats{}
	levelCount := make(map[string]int64)
	nsCount := make(map[string]int64)

	for _, e := range events.Items {
		// 过滤时间范围
		if e.LastTimestamp.Time.Before(startTime) {
			continue
		}

		stats.TotalCount++

		if e.Type == "Warning" {
			stats.WarnCount++
			levelCount["warn"]++
		} else {
			stats.InfoCount++
			levelCount["info"]++
		}

		// 检查是否包含错误关键词
		lowerMsg := strings.ToLower(e.Message)
		if strings.Contains(lowerMsg, "error") ||
			strings.Contains(lowerMsg, "fail") ||
			strings.Contains(lowerMsg, "crash") {
			stats.ErrorCount++
			levelCount["error"]++
		}

		nsCount[e.Namespace]++
	}

	// 转换为统计数组
	for level, count := range levelCount {
		stats.LevelStats = append(stats.LevelStats, models.LevelStat{Level: level, Count: count})
	}
	for ns, count := range nsCount {
		stats.NamespaceStats = append(stats.NamespaceStats, models.NamespaceStat{Namespace: ns, Count: count})
	}

	// 按数量排序命名空间统计
	sort.Slice(stats.NamespaceStats, func(i, j int) bool {
		return stats.NamespaceStats[i].Count > stats.NamespaceStats[j].Count
	})

	response.OK(c, stats)
}

// HandleAggregateLogStream 处理聚合日志流 WebSocket
func (h *LogCenterHandler) HandleAggregateLogStream(c *gin.Context) {
	clusterID, err := parseClusterID(c.Param("clusterID"))
	if err != nil {
		response.BadRequest(c, "无效的集群ID")
		return
	}

	cluster, err := h.clusterSvc.GetCluster(clusterID)
	if err != nil {
		response.NotFound(c, "集群不存在")
		return
	}

	// 升级WebSocket
	conn, err := h.upgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		logger.Error("WebSocket升级失败", "error", err)
		return
	}
	defer func() {
		_ = conn.Close()
	}()

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	// 读取客户端配置消息
	var config models.LogStreamConfig
	if err := conn.ReadJSON(&config); err != nil {
		_ = conn.WriteJSON(gin.H{"type": "error", "message": "无效的配置: " + err.Error()})
		return
	}

	if len(config.Targets) == 0 {
		_ = conn.WriteJSON(gin.H{"type": "error", "message": "至少需要一个日志目标"})
		return
	}

	// 发送连接成功消息
	_ = conn.WriteJSON(gin.H{
		"type":    "connected",
		"message": fmt.Sprintf("已连接到 %d 个日志源", len(config.Targets)),
	})

	// 启动聚合日志流
	opts := &models.LogStreamOptions{
		TailLines:     config.TailLines,
		SinceSeconds:  config.SinceSeconds,
		ShowTimestamp: config.ShowTimestamp,
	}

	logCh, err := h.aggregator.AggregateStream(ctx, cluster, config.Targets, opts)
	if err != nil {
		_ = conn.WriteJSON(gin.H{"type": "error", "message": err.Error()})
		return
	}

	// 监听客户端断开
	go func() {
		for {
			if _, _, err := conn.ReadMessage(); err != nil {
				cancel()
				return
			}
		}
	}()

	// 发送日志开始消息
	_ = conn.WriteJSON(gin.H{
		"type":    "start",
		"message": "开始接收日志流",
	})

	// 转发日志
	for entry := range logCh {
		msg := gin.H{
			"type":      "log",
			"id":        entry.ID,
			"timestamp": entry.Timestamp.Format(time.RFC3339Nano),
			"namespace": entry.Namespace,
			"pod_name":  entry.PodName,
			"container": entry.Container,
			"level":     entry.Level,
			"message":   entry.Message,
		}

		if err := conn.WriteJSON(msg); err != nil {
			logger.Info("发送日志失败，客户端可能已断开", "error", err)
			return
		}
	}

	_ = conn.WriteJSON(gin.H{
		"type":    "end",
		"message": "日志流已结束",
	})
}

// HandleSinglePodLogStream 处理单个Pod日志流 WebSocket
func (h *LogCenterHandler) HandleSinglePodLogStream(c *gin.Context) {
	clusterID, err := parseClusterID(c.Param("clusterID"))
	if err != nil {
		response.BadRequest(c, "无效的集群ID")
		return
	}
	namespace := c.Param("namespace")
	podName := c.Param("name")
	container := c.Query("container")
	previous := c.Query("previous") == "true"
	tailLines, _ := strconv.ParseInt(c.DefaultQuery("tailLines", "100"), 10, 64)
	sinceSeconds, _ := strconv.ParseInt(c.DefaultQuery("sinceSeconds", "0"), 10, 64)

	cluster, err := h.clusterSvc.GetCluster(clusterID)
	if err != nil {
		response.NotFound(c, "集群不存在")
		return
	}

	// 升级WebSocket
	conn, err := h.upgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		logger.Error("WebSocket升级失败", "error", err)
		return
	}
	defer func() {
		_ = conn.Close()
	}()

	// 发送连接成功消息
	_ = conn.WriteJSON(gin.H{
		"type":    "connected",
		"message": "WebSocket连接已建立",
	})

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	// 获取缓存的 K8s 客户端
	k8sClient, err := h.k8sMgr.GetK8sClient(cluster)
	if err != nil {
		_ = conn.WriteJSON(gin.H{"type": "error", "message": "获取K8s客户端失败: " + err.Error()})
		return
	}

	// 构建日志选项
	podLogOpts := &corev1.PodLogOptions{
		Follow:     true,
		Timestamps: true,
		Previous:   previous,
	}

	if container != "" {
		podLogOpts.Container = container
	}

	if tailLines > 0 {
		podLogOpts.TailLines = &tailLines
	}

	if sinceSeconds > 0 {
		podLogOpts.SinceSeconds = &sinceSeconds
	}

	// 获取日志流
	stream, err := k8sClient.GetClientset().CoreV1().Pods(namespace).GetLogs(podName, podLogOpts).Stream(ctx)
	if err != nil {
		_ = conn.WriteJSON(gin.H{"type": "error", "message": "获取日志流失败: " + err.Error()})
		return
	}
	defer func() {
		_ = stream.Close()
	}()

	// 监听客户端断开
	go func() {
		for {
			_, _, err := conn.ReadMessage()
			if err != nil {
				cancel()
				_ = stream.Close()
				return
			}
		}
	}()

	// 发送日志开始消息
	_ = conn.WriteJSON(gin.H{
		"type":    "start",
		"message": "开始接收日志流",
	})

	// 读取并转发日志
	reader := bufio.NewReader(stream)
	for {
		select {
		case <-ctx.Done():
			_ = conn.WriteJSON(gin.H{"type": "closed", "message": "日志流已关闭"})
			return
		default:
			line, err := reader.ReadString('\n')
			if err != nil {
				if ctx.Err() != nil {
					return
				}
				if strings.Contains(err.Error(), "closed") || strings.Contains(err.Error(), "canceled") {
					return
				}
				_ = conn.WriteJSON(gin.H{"type": "end", "message": "日志流已结束"})
				return
			}

			// 解析日志级别
			level := "info"
			lowerLine := strings.ToLower(line)
			if strings.Contains(lowerLine, "error") || strings.Contains(lowerLine, "fail") {
				level = "error"
			} else if strings.Contains(lowerLine, "warn") {
				level = "warn"
			}

			msg := gin.H{
				"type":      "log",
				"id":        uuid.New().String(),
				"timestamp": time.Now().Format(time.RFC3339Nano),
				"namespace": namespace,
				"pod":       podName,
				"container": container,
				"level":     level,
				"message":   strings.TrimSpace(line),
			}

			if err := conn.WriteJSON(msg); err != nil {
				return
			}
		}
	}
}

// GetNamespacesForLogs 获取日志中心可用的命名空间列表
func (h *LogCenterHandler) GetNamespacesForLogs(c *gin.Context) {
	clusterID, err := parseClusterID(c.Param("clusterID"))
	if err != nil {
		response.BadRequest(c, "无效的集群ID")
		return
	}

	cluster, err := h.clusterSvc.GetCluster(clusterID)
	if err != nil {
		response.NotFound(c, "集群不存在")
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	// 确保 informer 缓存就绪
	if _, err := h.k8sMgr.EnsureAndWait(ctx, cluster, 5*time.Second); err != nil {
		response.ServiceUnavailable(c, "informer 未就绪: "+err.Error())
		return
	}

	// 使用 informer 获取命名空间列表（通过获取所有 Pod 的命名空间）
	sel := labels.Everything()
	pods, err := h.k8sMgr.PodsLister(cluster.ID).List(sel)
	if err != nil {
		response.InternalError(c, "获取命名空间失败: "+err.Error())
		return
	}

	// 收集所有有 Pod 的命名空间
	nsSet := make(map[string]bool)
	for _, pod := range pods {
		nsSet[pod.Namespace] = true
	}

	nsList := make([]string, 0, len(nsSet))
	for ns := range nsSet {
		nsList = append(nsList, ns)
	}
	sort.Strings(nsList)

	response.OK(c, nsList)
}

// GetPodsForLogs 获取指定命名空间的Pod列表（用于日志选择）
func (h *LogCenterHandler) GetPodsForLogs(c *gin.Context) {
	clusterID, err := parseClusterID(c.Param("clusterID"))
	if err != nil {
		response.BadRequest(c, "无效的集群ID")
		return
	}
	namespace := c.Query("namespace")

	cluster, err := h.clusterSvc.GetCluster(clusterID)
	if err != nil {
		response.NotFound(c, "集群不存在")
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	// 确保 informer 缓存就绪
	if _, err := h.k8sMgr.EnsureAndWait(ctx, cluster, 5*time.Second); err != nil {
		response.ServiceUnavailable(c, "informer 未就绪: "+err.Error())
		return
	}

	// 使用 informer 获取 Pod 列表
	sel := labels.Everything()
	var podObjs []*corev1.Pod

	if namespace != "" {
		podObjs, err = h.k8sMgr.PodsLister(cluster.ID).Pods(namespace).List(sel)
	} else {
		podObjs, err = h.k8sMgr.PodsLister(cluster.ID).List(sel)
	}

	if err != nil {
		response.InternalError(c, "获取Pod列表失败: "+err.Error())
		return
	}

	type PodInfo struct {
		Name       string   `json:"name"`
		Namespace  string   `json:"namespace"`
		Status     string   `json:"status"`
		Containers []string `json:"containers"`
	}

	podList := make([]PodInfo, 0, len(podObjs))
	for _, pod := range podObjs {
		containers := make([]string, 0, len(pod.Spec.Containers))
		for _, c := range pod.Spec.Containers {
			containers = append(containers, c.Name)
		}
		podList = append(podList, PodInfo{
			Name:       pod.Name,
			Namespace:  pod.Namespace,
			Status:     string(pod.Status.Phase),
			Containers: containers,
		})
	}

	// 按名称排序
	sort.Slice(podList, func(i, j int) bool {
		return podList[i].Name < podList[j].Name
	})

	response.OK(c, podList)
}

// ExportLogs 导出日志
func (h *LogCenterHandler) ExportLogs(c *gin.Context) {
	clusterID, err := parseClusterID(c.Param("clusterID"))
	if err != nil {
		response.BadRequest(c, "无效的集群ID")
		return
	}

	var query models.LogQuery
	if err := c.ShouldBindJSON(&query); err != nil {
		response.BadRequest(c, "参数错误: "+err.Error())
		return
	}

	cluster, err := h.clusterSvc.GetCluster(clusterID)
	if err != nil {
		response.NotFound(c, "集群不存在")
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 120*time.Second)
	defer cancel()

	// 设置较大的限制用于导出
	if query.Limit <= 0 || query.Limit > 10000 {
		query.Limit = 10000
	}

	results, _, err := h.aggregator.SearchLogs(ctx, cluster, &query)
	if err != nil {
		response.InternalError(c, "获取日志失败: "+err.Error())
		return
	}

	// 构建导出内容
	var builder strings.Builder
	for _, entry := range results {
		builder.WriteString(fmt.Sprintf("%s [%s] [%s/%s] %s\n",
			entry.Timestamp.Format(time.RFC3339),
			strings.ToUpper(entry.Level),
			entry.Namespace,
			entry.PodName,
			entry.Message,
		))
	}

	// 设置响应头
	filename := fmt.Sprintf("logs-%s-%s.txt", cluster.Name, time.Now().Format("20060102-150405"))
	c.Header("Content-Disposition", fmt.Sprintf("attachment; filename=%s", filename))
	c.Header("Content-Type", "text/plain; charset=utf-8")
	c.String(http.StatusOK, builder.String())
}
