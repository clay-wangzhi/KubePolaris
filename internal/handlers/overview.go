package handlers

import (
	"context"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"

	"github.com/clay-wangzhi/KubePolaris/internal/response"
	"github.com/clay-wangzhi/KubePolaris/internal/services"
	"github.com/clay-wangzhi/KubePolaris/pkg/logger"
)

// OverviewHandler 总览处理器
type OverviewHandler struct {
	overviewService *services.OverviewService
	permissionSvc   *services.PermissionService
}

// NewOverviewHandler 创建总览处理器
func NewOverviewHandler(
	db *gorm.DB,
	clusterService *services.ClusterService,
	listerProvider services.InformerListerProvider,
	promService *services.PrometheusService,
	monitoringCfgSvc *services.MonitoringConfigService,
	alertManagerCfgSvc *services.AlertManagerConfigService,
	alertManagerSvc *services.AlertManagerService,
	permSvc *services.PermissionService,
) *OverviewHandler {
	overviewSvc := services.NewOverviewService(
		db,
		clusterService,
		listerProvider,
		promService,
		monitoringCfgSvc,
		alertManagerCfgSvc,
		alertManagerSvc,
	)
	return &OverviewHandler{
		overviewService: overviewSvc,
		permissionSvc:   permSvc,
	}
}

// filteredContext 在 context 中注入用户可访问的集群过滤条件
func (h *OverviewHandler) filteredContext(c *gin.Context) context.Context {
	userID := c.GetUint("user_id")
	clusterIDs, isAll, err := h.permissionSvc.GetUserAccessibleClusterIDs(userID)
	if err != nil || isAll {
		return c.Request.Context()
	}
	return services.ContextWithClusterFilter(c.Request.Context(), clusterIDs)
}

// GetStats 获取总览统计数据
// @Summary 获取总览统计数据
// @Description 返回集群、节点、Pod 的统计数据以及版本分布
// @Tags Overview
// @Accept json
// @Produce json
// @Success 200 {object} services.OverviewStatsResponse
// @Router /api/v1/overview/stats [get]
func (h *OverviewHandler) GetStats(c *gin.Context) {
	logger.Info("获取总览统计数据")

	stats, err := h.overviewService.GetOverviewStats(h.filteredContext(c))
	if err != nil {
		logger.Error("获取总览统计数据失败", "error", err)
		response.InternalError(c, "获取统计数据失败: "+err.Error())
		return
	}

	response.OK(c, stats)
}

// GetResourceUsage 获取资源使用率
// @Summary 获取资源使用率
// @Description 返回 CPU、内存、存储的使用率
// @Tags Overview
// @Accept json
// @Produce json
// @Success 200 {object} services.ResourceUsageResponse
// @Router /api/v1/overview/resource-usage [get]
func (h *OverviewHandler) GetResourceUsage(c *gin.Context) {
	logger.Info("获取资源使用率")

	usage, err := h.overviewService.GetResourceUsage(h.filteredContext(c))
	if err != nil {
		logger.Error("获取资源使用率失败", "error", err)
		response.InternalError(c, "获取资源使用率失败: "+err.Error())
		return
	}

	response.OK(c, usage)
}

// GetDistribution 获取资源分布
// @Summary 获取资源分布
// @Description 返回各集群的 Pod、Node、CPU、内存分布
// @Tags Overview
// @Accept json
// @Produce json
// @Success 200 {object} services.ResourceDistributionResponse
// @Router /api/v1/overview/distribution [get]
func (h *OverviewHandler) GetDistribution(c *gin.Context) {
	logger.Info("获取资源分布")

	distribution, err := h.overviewService.GetResourceDistribution(h.filteredContext(c))
	if err != nil {
		logger.Error("获取资源分布失败", "error", err)
		response.InternalError(c, "获取资源分布失败: "+err.Error())
		return
	}

	response.OK(c, distribution)
}

// GetTrends 获取趋势数据
// @Summary 获取趋势数据
// @Description 返回 Pod 和 Node 的历史趋势数据
// @Tags Overview
// @Accept json
// @Produce json
// @Param timeRange query string false "时间范围: 7d, 30d" default(7d)
// @Param step query string false "步长: 1h, 6h, 1d" default(1h)
// @Success 200 {object} services.TrendResponse
// @Router /api/v1/overview/trends [get]
func (h *OverviewHandler) GetTrends(c *gin.Context) {
	startTime := time.Now()
	timeRange := c.DefaultQuery("timeRange", "7d")
	step := c.DefaultQuery("step", "")

	logger.Info("获取趋势数据开始", "timeRange", timeRange, "step", step)

	trends, err := h.overviewService.GetTrends(h.filteredContext(c), timeRange, step)

	elapsed := time.Since(startTime)
	logger.Info("获取趋势数据完成", "耗时", elapsed.String())

	if err != nil {
		logger.Error("获取趋势数据失败", "error", err, "耗时", elapsed.String())
		response.InternalError(c, "获取趋势数据失败: "+err.Error())
		return
	}

	response.OK(c, trends)
}

// GetAbnormalWorkloads 获取异常工作负载
// @Summary 获取异常工作负载
// @Description 返回异常的 Pod、Deployment、StatefulSet 列表
// @Tags Overview
// @Accept json
// @Produce json
// @Param limit query int false "返回数量限制" default(20)
// @Success 200 {array} services.AbnormalWorkload
// @Router /api/v1/overview/abnormal-workloads [get]
func (h *OverviewHandler) GetAbnormalWorkloads(c *gin.Context) {
	limitStr := c.DefaultQuery("limit", "20")
	limit, _ := strconv.Atoi(limitStr)

	logger.Info("获取异常工作负载", "limit", limit)

	workloads, err := h.overviewService.GetAbnormalWorkloads(h.filteredContext(c), limit)
	if err != nil {
		logger.Error("获取异常工作负载失败", "error", err)
		response.InternalError(c, "获取异常工作负载失败: "+err.Error())
		return
	}

	response.OK(c, workloads)
}

// GetAlertStats 获取全局告警统计
// @Summary 获取全局告警统计
// @Description 返回所有集群的告警汇总统计
// @Tags Overview
// @Accept json
// @Produce json
// @Success 200 {object} services.GlobalAlertStats
// @Router /api/v1/overview/alert-stats [get]
func (h *OverviewHandler) GetAlertStats(c *gin.Context) {
	logger.Info("获取全局告警统计")

	stats, err := h.overviewService.GetGlobalAlertStats(h.filteredContext(c))
	if err != nil {
		logger.Error("获取全局告警统计失败", "error", err)
		response.InternalError(c, "获取全局告警统计失败: "+err.Error())
		return
	}

	response.OK(c, stats)
}
