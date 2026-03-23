package handlers

import (
	"strconv"

	"github.com/clay-wangzhi/KubePolaris/internal/models"
	"github.com/clay-wangzhi/KubePolaris/internal/response"
	"github.com/clay-wangzhi/KubePolaris/internal/services"
	"github.com/clay-wangzhi/KubePolaris/pkg/logger"

	"github.com/gin-gonic/gin"
)

// MonitoringHandler 监控处理器
type MonitoringHandler struct {
	monitoringConfigService *services.MonitoringConfigService
	prometheusService       *services.PrometheusService
}

// NewMonitoringHandler 创建监控处理器
func NewMonitoringHandler(monitoringConfigService *services.MonitoringConfigService, prometheusService *services.PrometheusService) *MonitoringHandler {
	return &MonitoringHandler{
		monitoringConfigService: monitoringConfigService,
		prometheusService:       prometheusService,
	}
}

// GetMonitoringConfig 获取集群监控配置
func (h *MonitoringHandler) GetMonitoringConfig(c *gin.Context) {
	clusterIDStr := c.Param("clusterID")
	clusterID, err := strconv.ParseUint(clusterIDStr, 10, 32)
	if err != nil {
		response.BadRequest(c, "无效的集群ID")
		return
	}

	config, err := h.monitoringConfigService.GetMonitoringConfig(uint(clusterID))
	if err != nil {
		logger.Error("获取监控配置失败", "error", err)
		response.InternalError(c, "获取监控配置失败: "+err.Error())
		return
	}

	response.OK(c, config)
}

// UpdateMonitoringConfig 更新集群监控配置
func (h *MonitoringHandler) UpdateMonitoringConfig(c *gin.Context) {
	clusterIDStr := c.Param("clusterID")
	clusterID, err := strconv.ParseUint(clusterIDStr, 10, 32)
	if err != nil {
		response.BadRequest(c, "无效的集群ID")
		return
	}

	var config models.MonitoringConfig
	if err := c.ShouldBindJSON(&config); err != nil {
		response.BadRequest(c, "请求参数错误: "+err.Error())
		return
	}

	// 更新配置
	if err := h.monitoringConfigService.UpdateMonitoringConfig(uint(clusterID), &config); err != nil {
		logger.Error("更新监控配置失败", "error", err)
		response.InternalError(c, "更新监控配置失败: "+err.Error())
		return
	}

	response.OK(c, gin.H{"message": "更新成功"})
}

// TestMonitoringConnection 测试监控连接
func (h *MonitoringHandler) TestMonitoringConnection(c *gin.Context) {
	clusterIDStr := c.Param("clusterID")
	_, err := strconv.ParseUint(clusterIDStr, 10, 32)
	if err != nil {
		response.BadRequest(c, "无效的集群ID")
		return
	}

	var config models.MonitoringConfig
	if err := c.ShouldBindJSON(&config); err != nil {
		response.BadRequest(c, "请求参数错误: "+err.Error())
		return
	}

	// 测试连接
	if err := h.prometheusService.TestConnection(c.Request.Context(), &config); err != nil {
		logger.Error("测试监控连接失败", "error", err)
		response.BadRequest(c, "连接测试失败: "+err.Error())
		return
	}

	response.OK(c, gin.H{"message": "连接测试成功"})
}

// GetClusterMetrics 获取集群监控指标
func (h *MonitoringHandler) GetClusterMetrics(c *gin.Context) {
	clusterIDStr := c.Param("clusterID")
	clusterID, err := strconv.ParseUint(clusterIDStr, 10, 32)
	if err != nil {
		response.BadRequest(c, "无效的集群ID")
		return
	}

	// 获取监控配置
	config, err := h.monitoringConfigService.GetMonitoringConfig(uint(clusterID))
	if err != nil {
		logger.Error("获取监控配置失败", "error", err)
		response.InternalError(c, "获取监控配置失败: "+err.Error())
		return
	}

	if config.Type == "disabled" {
		response.OK(c, &models.ClusterMetricsData{})
		return
	}

	// 获取查询参数
	timeRange := c.DefaultQuery("range", "1h")
	step := c.DefaultQuery("step", "1m")
	clusterName := c.Query("clusterName")

	// 查询监控指标
	metrics, err := h.prometheusService.QueryClusterMetrics(c.Request.Context(), config, clusterName, timeRange, step)
	if err != nil {
		logger.Error("查询集群监控指标失败", "error", err)
		response.InternalError(c, "查询监控指标失败: "+err.Error())
		return
	}

	response.OK(c, metrics)
}

// GetNodeMetrics 获取节点监控指标
func (h *MonitoringHandler) GetNodeMetrics(c *gin.Context) {
	clusterIDStr := c.Param("clusterID")
	clusterID, err := strconv.ParseUint(clusterIDStr, 10, 32)
	if err != nil {
		response.BadRequest(c, "无效的集群ID")
		return
	}

	nodeName := c.Param("nodeName")
	if nodeName == "" {
		response.BadRequest(c, "节点名称不能为空")
		return
	}

	// 获取监控配置
	config, err := h.monitoringConfigService.GetMonitoringConfig(uint(clusterID))
	if err != nil {
		logger.Error("获取监控配置失败", "error", err)
		response.InternalError(c, "获取监控配置失败: "+err.Error())
		return
	}

	if config.Type == "disabled" {
		response.OK(c, &models.ClusterMetricsData{})
		return
	}

	// 获取查询参数
	timeRange := c.DefaultQuery("range", "1h")
	step := c.DefaultQuery("step", "1m")
	clusterName := c.Query("clusterName")

	// 查询节点监控指标
	metrics, err := h.prometheusService.QueryNodeMetrics(c.Request.Context(), config, clusterName, nodeName, timeRange, step)
	if err != nil {
		logger.Error("查询节点监控指标失败", "error", err)
		response.InternalError(c, "查询监控指标失败: "+err.Error())
		return
	}

	response.OK(c, metrics)
}

// GetPodMetrics 获取 Pod 监控指标
func (h *MonitoringHandler) GetPodMetrics(c *gin.Context) {
	clusterIDStr := c.Param("clusterID")
	clusterID, err := strconv.ParseUint(clusterIDStr, 10, 32)
	if err != nil {
		response.BadRequest(c, "无效的集群ID")
		return
	}

	namespace := c.Param("namespace")
	podName := c.Param("name")
	if namespace == "" || podName == "" {
		response.BadRequest(c, "命名空间和Pod名称不能为空")
		return
	}

	// 获取监控配置
	config, err := h.monitoringConfigService.GetMonitoringConfig(uint(clusterID))
	if err != nil {
		logger.Error("获取监控配置失败", "error", err)
		response.InternalError(c, "获取监控配置失败: "+err.Error())
		return
	}

	if config.Type == "disabled" {
		response.OK(c, &models.ClusterMetricsData{})
		return
	}

	// 获取查询参数
	timeRange := c.DefaultQuery("range", "1h")
	step := c.DefaultQuery("step", "1m")
	clusterName := c.Query("clusterName")

	// 查询 Pod 监控指标
	metrics, err := h.prometheusService.QueryPodMetrics(c.Request.Context(), config, clusterName, namespace, podName, timeRange, step)
	if err != nil {
		logger.Error("查询Pod监控指标失败", "error", err)
		response.InternalError(c, "查询监控指标失败: "+err.Error())
		return
	}

	response.OK(c, metrics)
}

// GetWorkloadMetrics 获取工作负载监控指标
func (h *MonitoringHandler) GetWorkloadMetrics(c *gin.Context) {
	clusterIDStr := c.Param("clusterID")
	clusterID, err := strconv.ParseUint(clusterIDStr, 10, 32)
	if err != nil {
		response.BadRequest(c, "无效的集群ID")
		return
	}

	namespace := c.Param("namespace")
	workloadName := c.Param("name")
	if namespace == "" || workloadName == "" {
		response.BadRequest(c, "命名空间和工作负载名称不能为空")
		return
	}

	// 获取监控配置
	config, err := h.monitoringConfigService.GetMonitoringConfig(uint(clusterID))
	if err != nil {
		logger.Error("获取监控配置失败", "error", err)
		response.InternalError(c, "获取监控配置失败: "+err.Error())
		return
	}

	if config.Type == "disabled" {
		response.OK(c, &models.ClusterMetricsData{})
		return
	}

	// 获取查询参数
	timeRange := c.DefaultQuery("range", "1h")
	step := c.DefaultQuery("step", "1m")
	clusterName := c.Query("clusterName")

	// 查询工作负载监控指标
	metrics, err := h.prometheusService.QueryWorkloadMetrics(c.Request.Context(), config, clusterName, namespace, workloadName, timeRange, step)
	if err != nil {
		logger.Error("查询工作负载监控指标失败", "error", err)
		response.InternalError(c, "查询监控指标失败: "+err.Error())
		return
	}

	response.OK(c, metrics)
}

// GetMonitoringTemplates 获取监控配置模板
func (h *MonitoringHandler) GetMonitoringTemplates(c *gin.Context) {
	templates := gin.H{
		"disabled":        h.monitoringConfigService.GetDefaultConfig(),
		"prometheus":      h.monitoringConfigService.GetPrometheusConfig(),
		"victoriametrics": h.monitoringConfigService.GetVictoriaMetricsConfig(),
	}

	response.OK(c, templates)
}
