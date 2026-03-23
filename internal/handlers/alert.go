package handlers

import (
	"strconv"

	"github.com/clay-wangzhi/KubePolaris/internal/models"
	"github.com/clay-wangzhi/KubePolaris/internal/response"
	"github.com/clay-wangzhi/KubePolaris/internal/services"
	"github.com/clay-wangzhi/KubePolaris/pkg/logger"

	"github.com/gin-gonic/gin"
)

// AlertHandler 告警处理器
type AlertHandler struct {
	alertManagerConfigService *services.AlertManagerConfigService
	alertManagerService       *services.AlertManagerService
}

// NewAlertHandler 创建告警处理器
func NewAlertHandler(alertManagerConfigService *services.AlertManagerConfigService, alertManagerService *services.AlertManagerService) *AlertHandler {
	return &AlertHandler{
		alertManagerConfigService: alertManagerConfigService,
		alertManagerService:       alertManagerService,
	}
}

// GetAlertManagerConfig 获取集群 Alertmanager 配置
func (h *AlertHandler) GetAlertManagerConfig(c *gin.Context) {
	clusterIDStr := c.Param("clusterID")
	clusterID, err := strconv.ParseUint(clusterIDStr, 10, 32)
	if err != nil {
		response.BadRequest(c, "无效的集群ID")
		return
	}

	config, err := h.alertManagerConfigService.GetAlertManagerConfig(uint(clusterID))
	if err != nil {
		logger.Error("获取 Alertmanager 配置失败", "error", err)
		response.InternalError(c, "获取 Alertmanager 配置失败: "+err.Error())
		return
	}

	response.OK(c, config)
}

// UpdateAlertManagerConfig 更新集群 Alertmanager 配置
func (h *AlertHandler) UpdateAlertManagerConfig(c *gin.Context) {
	clusterIDStr := c.Param("clusterID")
	clusterID, err := strconv.ParseUint(clusterIDStr, 10, 32)
	if err != nil {
		response.BadRequest(c, "无效的集群ID")
		return
	}

	var config models.AlertManagerConfig
	if err := c.ShouldBindJSON(&config); err != nil {
		response.BadRequest(c, "请求参数错误: "+err.Error())
		return
	}

	// 更新配置
	if err := h.alertManagerConfigService.UpdateAlertManagerConfig(uint(clusterID), &config); err != nil {
		logger.Error("更新 Alertmanager 配置失败", "error", err)
		response.InternalError(c, "更新 Alertmanager 配置失败: "+err.Error())
		return
	}

	response.OK(c, gin.H{"message": "更新成功"})
}

// TestAlertManagerConnection 测试 Alertmanager 连接
func (h *AlertHandler) TestAlertManagerConnection(c *gin.Context) {
	clusterIDStr := c.Param("clusterID")
	_, err := strconv.ParseUint(clusterIDStr, 10, 32)
	if err != nil {
		response.BadRequest(c, "无效的集群ID")
		return
	}

	var config models.AlertManagerConfig
	if err := c.ShouldBindJSON(&config); err != nil {
		response.BadRequest(c, "请求参数错误: "+err.Error())
		return
	}

	// 测试连接
	if err := h.alertManagerService.TestConnection(c.Request.Context(), &config); err != nil {
		logger.Error("测试 Alertmanager 连接失败", "error", err)
		response.BadRequest(c, "连接测试失败: "+err.Error())
		return
	}

	response.OK(c, gin.H{"message": "连接测试成功"})
}

// GetAlertManagerStatus 获取 Alertmanager 状态
func (h *AlertHandler) GetAlertManagerStatus(c *gin.Context) {
	clusterIDStr := c.Param("clusterID")
	clusterID, err := strconv.ParseUint(clusterIDStr, 10, 32)
	if err != nil {
		response.BadRequest(c, "无效的集群ID")
		return
	}

	// 获取配置
	config, err := h.alertManagerConfigService.GetAlertManagerConfig(uint(clusterID))
	if err != nil {
		logger.Error("获取 Alertmanager 配置失败", "error", err)
		response.InternalError(c, "获取 Alertmanager 配置失败: "+err.Error())
		return
	}

	if !config.Enabled {
	response.OK(c, gin.H{"message": "Alertmanager 未启用"})
		return
	}

	// 获取状态
	status, err := h.alertManagerService.GetStatus(c.Request.Context(), config)
	if err != nil {
		logger.Error("获取 Alertmanager 状态失败", "error", err)
		response.InternalError(c, "获取 Alertmanager 状态失败: "+err.Error())
		return
	}

	response.OK(c, status)
}

// GetAlerts 获取告警列表
func (h *AlertHandler) GetAlerts(c *gin.Context) {
	clusterIDStr := c.Param("clusterID")
	clusterID, err := strconv.ParseUint(clusterIDStr, 10, 32)
	if err != nil {
		response.BadRequest(c, "无效的集群ID")
		return
	}

	// 获取配置
	config, err := h.alertManagerConfigService.GetAlertManagerConfig(uint(clusterID))
	if err != nil {
		logger.Error("获取 Alertmanager 配置失败", "error", err)
		response.InternalError(c, "获取 Alertmanager 配置失败: "+err.Error())
		return
	}

	if !config.Enabled {
	response.OK(c, []models.Alert{})
		return
	}

	// 获取过滤参数
	filter := make(map[string]string)
	if severity := c.Query("severity"); severity != "" {
		filter["severity"] = severity
	}
	if alertname := c.Query("alertname"); alertname != "" {
		filter["alertname"] = alertname
	}

	// 获取告警列表
	alerts, err := h.alertManagerService.GetAlerts(c.Request.Context(), config, filter)
	if err != nil {
		logger.Error("获取告警列表失败", "error", err)
		response.InternalError(c, "获取告警列表失败: "+err.Error())
		return
	}

	response.OK(c, alerts)
}

// GetAlertGroups 获取告警分组
func (h *AlertHandler) GetAlertGroups(c *gin.Context) {
	clusterIDStr := c.Param("clusterID")
	clusterID, err := strconv.ParseUint(clusterIDStr, 10, 32)
	if err != nil {
		response.BadRequest(c, "无效的集群ID")
		return
	}

	// 获取配置
	config, err := h.alertManagerConfigService.GetAlertManagerConfig(uint(clusterID))
	if err != nil {
		logger.Error("获取 Alertmanager 配置失败", "error", err)
		response.InternalError(c, "获取 Alertmanager 配置失败: "+err.Error())
		return
	}

	if !config.Enabled {
	response.OK(c, []models.AlertGroup{})
		return
	}

	// 获取告警分组
	groups, err := h.alertManagerService.GetAlertGroups(c.Request.Context(), config)
	if err != nil {
		logger.Error("获取告警分组失败", "error", err)
		response.InternalError(c, "获取告警分组失败: "+err.Error())
		return
	}

	response.OK(c, groups)
}

// GetAlertStats 获取告警统计
func (h *AlertHandler) GetAlertStats(c *gin.Context) {
	clusterIDStr := c.Param("clusterID")
	clusterID, err := strconv.ParseUint(clusterIDStr, 10, 32)
	if err != nil {
		response.BadRequest(c, "无效的集群ID")
		return
	}

	// 获取配置
	config, err := h.alertManagerConfigService.GetAlertManagerConfig(uint(clusterID))
	if err != nil {
		logger.Error("获取 Alertmanager 配置失败", "error", err)
		response.InternalError(c, "获取 Alertmanager 配置失败: "+err.Error())
		return
	}

	if !config.Enabled {
	response.OK(c, &models.AlertStats{
		Total:      0,
		Firing:     0,
		Pending:    0,
		Resolved:   0,
		Suppressed: 0,
		BySeverity: make(map[string]int),
	})
		return
	}

	// 获取告警统计
	stats, err := h.alertManagerService.GetAlertStats(c.Request.Context(), config)
	if err != nil {
		logger.Error("获取告警统计失败", "error", err)
		response.InternalError(c, "获取告警统计失败: "+err.Error())
		return
	}

	response.OK(c, stats)
}

// GetSilences 获取静默规则列表
func (h *AlertHandler) GetSilences(c *gin.Context) {
	clusterIDStr := c.Param("clusterID")
	clusterID, err := strconv.ParseUint(clusterIDStr, 10, 32)
	if err != nil {
		response.BadRequest(c, "无效的集群ID")
		return
	}

	// 获取配置
	config, err := h.alertManagerConfigService.GetAlertManagerConfig(uint(clusterID))
	if err != nil {
		logger.Error("获取 Alertmanager 配置失败", "error", err)
		response.InternalError(c, "获取 Alertmanager 配置失败: "+err.Error())
		return
	}

	if !config.Enabled {
		response.OK(c, []models.Silence{})
		return
	}

	// 获取静默规则
	silences, err := h.alertManagerService.GetSilences(c.Request.Context(), config)
	if err != nil {
		logger.Error("获取静默规则失败", "error", err)
		response.InternalError(c, "获取静默规则失败: "+err.Error())
		return
	}

	response.OK(c, silences)
}

// CreateSilence 创建静默规则
func (h *AlertHandler) CreateSilence(c *gin.Context) {
	clusterIDStr := c.Param("clusterID")
	clusterID, err := strconv.ParseUint(clusterIDStr, 10, 32)
	if err != nil {
		response.BadRequest(c, "无效的集群ID")
		return
	}

	// 获取配置
	config, err := h.alertManagerConfigService.GetAlertManagerConfig(uint(clusterID))
	if err != nil {
		logger.Error("获取 Alertmanager 配置失败", "error", err)
		response.InternalError(c, "获取 Alertmanager 配置失败: "+err.Error())
		return
	}

	if !config.Enabled {
		response.BadRequest(c, "Alertmanager 未启用")
		return
	}

	var req models.CreateSilenceRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "请求参数错误: "+err.Error())
		return
	}

	// 创建静默规则
	silence, err := h.alertManagerService.CreateSilence(c.Request.Context(), config, &req)
	if err != nil {
		logger.Error("创建静默规则失败", "error", err)
		response.InternalError(c, "创建静默规则失败: "+err.Error())
		return
	}

	response.OK(c, silence)
}

// DeleteSilence 删除静默规则
func (h *AlertHandler) DeleteSilence(c *gin.Context) {
	clusterIDStr := c.Param("clusterID")
	clusterID, err := strconv.ParseUint(clusterIDStr, 10, 32)
	if err != nil {
		response.BadRequest(c, "无效的集群ID")
		return
	}

	silenceID := c.Param("silenceId")
	if silenceID == "" {
		response.BadRequest(c, "静默规则ID不能为空")
		return
	}

	// 获取配置
	config, err := h.alertManagerConfigService.GetAlertManagerConfig(uint(clusterID))
	if err != nil {
		logger.Error("获取 Alertmanager 配置失败", "error", err)
		response.InternalError(c, "获取 Alertmanager 配置失败: "+err.Error())
		return
	}

	if !config.Enabled {
		response.BadRequest(c, "Alertmanager 未启用")
		return
	}

	// 删除静默规则
	if err := h.alertManagerService.DeleteSilence(c.Request.Context(), config, silenceID); err != nil {
		logger.Error("删除静默规则失败", "error", err)
		response.InternalError(c, "删除静默规则失败: "+err.Error())
		return
	}

	response.OK(c, gin.H{"message": "删除成功"})
}

// GetReceivers 获取接收器列表
func (h *AlertHandler) GetReceivers(c *gin.Context) {
	clusterIDStr := c.Param("clusterID")
	clusterID, err := strconv.ParseUint(clusterIDStr, 10, 32)
	if err != nil {
		response.BadRequest(c, "无效的集群ID")
		return
	}

	// 获取配置
	config, err := h.alertManagerConfigService.GetAlertManagerConfig(uint(clusterID))
	if err != nil {
		logger.Error("获取 Alertmanager 配置失败", "error", err)
		response.InternalError(c, "获取 Alertmanager 配置失败: "+err.Error())
		return
	}

	if !config.Enabled {
		response.OK(c, []models.Receiver{})
		return
	}

	// 获取接收器列表
	receivers, err := h.alertManagerService.GetReceivers(c.Request.Context(), config)
	if err != nil {
		logger.Error("获取接收器列表失败", "error", err)
		response.InternalError(c, "获取接收器列表失败: "+err.Error())
		return
	}

	response.OK(c, receivers)
}

// GetAlertManagerConfigTemplate 获取 Alertmanager 配置模板
func (h *AlertHandler) GetAlertManagerConfigTemplate(c *gin.Context) {
	template := h.alertManagerConfigService.GetAlertManagerConfigTemplate()
	response.OK(c, template)
}
