package handlers

import (
	"net/http"
	"strconv"

	"kubepolaris/internal/models"
	"kubepolaris/internal/services"
	"kubepolaris/pkg/logger"

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
		c.JSON(http.StatusBadRequest, gin.H{
			"code":    400,
			"message": "无效的集群ID",
			"data":    nil,
		})
		return
	}

	config, err := h.monitoringConfigService.GetMonitoringConfig(uint(clusterID))
	if err != nil {
		logger.Error("获取监控配置失败", "error", err)
		c.JSON(http.StatusInternalServerError, gin.H{
			"code":    500,
			"message": "获取监控配置失败: " + err.Error(),
			"data":    nil,
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"code":    200,
		"message": "获取成功",
		"data":    config,
	})
}

// UpdateMonitoringConfig 更新集群监控配置
func (h *MonitoringHandler) UpdateMonitoringConfig(c *gin.Context) {
	clusterIDStr := c.Param("clusterID")
	clusterID, err := strconv.ParseUint(clusterIDStr, 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"code":    400,
			"message": "无效的集群ID",
			"data":    nil,
		})
		return
	}

	var config models.MonitoringConfig
	if err := c.ShouldBindJSON(&config); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"code":    400,
			"message": "请求参数错误: " + err.Error(),
			"data":    nil,
		})
		return
	}

	// 更新配置
	if err := h.monitoringConfigService.UpdateMonitoringConfig(uint(clusterID), &config); err != nil {
		logger.Error("更新监控配置失败", "error", err)
		c.JSON(http.StatusInternalServerError, gin.H{
			"code":    500,
			"message": "更新监控配置失败: " + err.Error(),
			"data":    nil,
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"code":    200,
		"message": "更新成功",
		"data":    nil,
	})
}

// TestMonitoringConnection 测试监控连接
func (h *MonitoringHandler) TestMonitoringConnection(c *gin.Context) {
	clusterIDStr := c.Param("clusterID")
	_, err := strconv.ParseUint(clusterIDStr, 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"code":    400,
			"message": "无效的集群ID",
			"data":    nil,
		})
		return
	}

	var config models.MonitoringConfig
	if err := c.ShouldBindJSON(&config); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"code":    400,
			"message": "请求参数错误: " + err.Error(),
			"data":    nil,
		})
		return
	}

	// 测试连接
	if err := h.prometheusService.TestConnection(c.Request.Context(), &config); err != nil {
		logger.Error("测试监控连接失败", "error", err)
		c.JSON(http.StatusBadRequest, gin.H{
			"code":    400,
			"message": "连接测试失败: " + err.Error(),
			"data":    nil,
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"code":    200,
		"message": "连接测试成功",
		"data":    nil,
	})
}

// GetClusterMetrics 获取集群监控指标
func (h *MonitoringHandler) GetClusterMetrics(c *gin.Context) {
	clusterIDStr := c.Param("clusterID")
	clusterID, err := strconv.ParseUint(clusterIDStr, 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"code":    400,
			"message": "无效的集群ID",
			"data":    nil,
		})
		return
	}

	// 获取监控配置
	config, err := h.monitoringConfigService.GetMonitoringConfig(uint(clusterID))
	if err != nil {
		logger.Error("获取监控配置失败", "error", err)
		c.JSON(http.StatusInternalServerError, gin.H{
			"code":    500,
			"message": "获取监控配置失败: " + err.Error(),
			"data":    nil,
		})
		return
	}

	if config.Type == "disabled" {
		c.JSON(http.StatusOK, gin.H{
			"code":    200,
			"message": "监控功能已禁用",
			"data":    &models.ClusterMetricsData{},
		})
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
		c.JSON(http.StatusInternalServerError, gin.H{
			"code":    500,
			"message": "查询监控指标失败: " + err.Error(),
			"data":    nil,
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"code":    200,
		"message": "获取成功",
		"data":    metrics,
	})
}

// GetNodeMetrics 获取节点监控指标
func (h *MonitoringHandler) GetNodeMetrics(c *gin.Context) {
	clusterIDStr := c.Param("clusterID")
	clusterID, err := strconv.ParseUint(clusterIDStr, 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"code":    400,
			"message": "无效的集群ID",
			"data":    nil,
		})
		return
	}

	nodeName := c.Param("nodeName")
	if nodeName == "" {
		c.JSON(http.StatusBadRequest, gin.H{
			"code":    400,
			"message": "节点名称不能为空",
			"data":    nil,
		})
		return
	}

	// 获取监控配置
	config, err := h.monitoringConfigService.GetMonitoringConfig(uint(clusterID))
	if err != nil {
		logger.Error("获取监控配置失败", "error", err)
		c.JSON(http.StatusInternalServerError, gin.H{
			"code":    500,
			"message": "获取监控配置失败: " + err.Error(),
			"data":    nil,
		})
		return
	}

	if config.Type == "disabled" {
		c.JSON(http.StatusOK, gin.H{
			"code":    200,
			"message": "监控功能已禁用",
			"data":    &models.ClusterMetricsData{},
		})
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
		c.JSON(http.StatusInternalServerError, gin.H{
			"code":    500,
			"message": "查询监控指标失败: " + err.Error(),
			"data":    nil,
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"code":    200,
		"message": "获取成功",
		"data":    metrics,
	})
}

// GetPodMetrics 获取 Pod 监控指标
func (h *MonitoringHandler) GetPodMetrics(c *gin.Context) {
	clusterIDStr := c.Param("clusterID")
	clusterID, err := strconv.ParseUint(clusterIDStr, 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"code":    400,
			"message": "无效的集群ID",
			"data":    nil,
		})
		return
	}

	namespace := c.Param("namespace")
	podName := c.Param("name")
	if namespace == "" || podName == "" {
		c.JSON(http.StatusBadRequest, gin.H{
			"code":    400,
			"message": "命名空间和Pod名称不能为空",
			"data":    nil,
		})
		return
	}

	// 获取监控配置
	config, err := h.monitoringConfigService.GetMonitoringConfig(uint(clusterID))
	if err != nil {
		logger.Error("获取监控配置失败", "error", err)
		c.JSON(http.StatusInternalServerError, gin.H{
			"code":    500,
			"message": "获取监控配置失败: " + err.Error(),
			"data":    nil,
		})
		return
	}

	if config.Type == "disabled" {
		c.JSON(http.StatusOK, gin.H{
			"code":    200,
			"message": "监控功能已禁用",
			"data":    &models.ClusterMetricsData{},
		})
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
		c.JSON(http.StatusInternalServerError, gin.H{
			"code":    500,
			"message": "查询监控指标失败: " + err.Error(),
			"data":    nil,
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"code":    200,
		"message": "获取成功",
		"data":    metrics,
	})
}

// GetWorkloadMetrics 获取工作负载监控指标
func (h *MonitoringHandler) GetWorkloadMetrics(c *gin.Context) {
	clusterIDStr := c.Param("clusterID")
	clusterID, err := strconv.ParseUint(clusterIDStr, 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"code":    400,
			"message": "无效的集群ID",
			"data":    nil,
		})
		return
	}

	namespace := c.Param("namespace")
	workloadName := c.Param("name")
	if namespace == "" || workloadName == "" {
		c.JSON(http.StatusBadRequest, gin.H{
			"code":    400,
			"message": "命名空间和工作负载名称不能为空",
			"data":    nil,
		})
		return
	}

	// 获取监控配置
	config, err := h.monitoringConfigService.GetMonitoringConfig(uint(clusterID))
	if err != nil {
		logger.Error("获取监控配置失败", "error", err)
		c.JSON(http.StatusInternalServerError, gin.H{
			"code":    500,
			"message": "获取监控配置失败: " + err.Error(),
			"data":    nil,
		})
		return
	}

	if config.Type == "disabled" {
		c.JSON(http.StatusOK, gin.H{
			"code":    200,
			"message": "监控功能已禁用",
			"data":    &models.ClusterMetricsData{},
		})
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
		c.JSON(http.StatusInternalServerError, gin.H{
			"code":    500,
			"message": "查询监控指标失败: " + err.Error(),
			"data":    nil,
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"code":    200,
		"message": "获取成功",
		"data":    metrics,
	})
}


// GetMonitoringTemplates 获取监控配置模板
func (h *MonitoringHandler) GetMonitoringTemplates(c *gin.Context) {
	templates := gin.H{
		"disabled":        h.monitoringConfigService.GetDefaultConfig(),
		"prometheus":      h.monitoringConfigService.GetPrometheusConfig(),
		"victoriametrics": h.monitoringConfigService.GetVictoriaMetricsConfig(),
	}

	c.JSON(http.StatusOK, gin.H{
		"code":    200,
		"message": "获取成功",
		"data":    templates,
	})
}
