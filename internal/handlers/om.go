package handlers

import (
	"strconv"

	"github.com/gin-gonic/gin"

	"github.com/clay-wangzhi/KubePolaris/internal/k8s"
	"github.com/clay-wangzhi/KubePolaris/internal/models"
	"github.com/clay-wangzhi/KubePolaris/internal/response"
	"github.com/clay-wangzhi/KubePolaris/internal/services"
	"github.com/clay-wangzhi/KubePolaris/pkg/logger"
)

// OMHandler 运维中心处理器
type OMHandler struct {
	clusterSvc *services.ClusterService
	omSvc      *services.OMService
	k8sMgr     *k8s.ClusterInformerManager
}

// NewOMHandler 创建运维中心处理器
func NewOMHandler(clusterSvc *services.ClusterService, omSvc *services.OMService, k8sMgr *k8s.ClusterInformerManager) *OMHandler {
	return &OMHandler{
		clusterSvc: clusterSvc,
		omSvc:      omSvc,
		k8sMgr:     k8sMgr,
	}
}

// GetHealthDiagnosis 获取集群健康诊断
// @Summary 获取集群健康诊断
// @Description 对集群进行全面健康诊断，返回健康评分、风险项和诊断建议
// @Tags O&M
// @Accept json
// @Produce json
// @Param clusterID path int true "集群ID"
// @Success 200 {object} models.HealthDiagnosisResponse
// @Router /api/v1/clusters/{clusterID}/om/health-diagnosis [get]
func (h *OMHandler) GetHealthDiagnosis(c *gin.Context) {
	clusterIDStr := c.Param("clusterID")
	clusterID, err := strconv.ParseUint(clusterIDStr, 10, 32)
	if err != nil {
		response.BadRequest(c, "无效的集群ID")
		return
	}

	// 获取集群信息
	cluster, err := h.clusterSvc.GetCluster(uint(clusterID))
	if err != nil {
		response.NotFound(c, "集群不存在")
		return
	}

	// 获取 K8s 客户端
	k8sClient, err := h.k8sMgr.GetK8sClient(cluster)
	if err != nil {
		logger.Error("获取K8s客户端失败", "error", err)
		response.InternalError(c, "获取K8s客户端失败: "+err.Error())
		return
	}

	clientset := k8sClient.GetClientset()
	if clientset == nil {
		response.InternalError(c, "获取K8s客户端失败")
		return
	}

	// 执行健康诊断
	result, err := h.omSvc.GetHealthDiagnosis(c.Request.Context(), clientset, uint(clusterID))
	if err != nil {
		logger.Error("执行健康诊断失败", "error", err)
		response.InternalError(c, "执行健康诊断失败: "+err.Error())
		return
	}

	response.OK(c, result)
}

// GetResourceTop 获取资源消耗 Top N
// @Summary 获取资源消耗 Top N
// @Description 获取指定资源类型的消耗排行榜
// @Tags O&M
// @Accept json
// @Produce json
// @Param clusterID path int true "集群ID"
// @Param type query string true "资源类型" Enums(cpu, memory, disk, network)
// @Param level query string true "统计级别" Enums(namespace, workload, pod)
// @Param limit query int false "返回数量" default(10)
// @Success 200 {object} models.ResourceTopResponse
// @Router /api/v1/clusters/{clusterID}/om/resource-top [get]
func (h *OMHandler) GetResourceTop(c *gin.Context) {
	clusterIDStr := c.Param("clusterID")
	clusterID, err := strconv.ParseUint(clusterIDStr, 10, 32)
	if err != nil {
		response.BadRequest(c, "无效的集群ID")
		return
	}

	// 解析请求参数
	var req models.ResourceTopRequest
	if err := c.ShouldBindQuery(&req); err != nil {
		response.BadRequest(c, "请求参数错误: "+err.Error())
		return
	}

	// 设置默认值
	if req.Limit <= 0 {
		req.Limit = 10
	}

	// 获取集群信息
	cluster, err := h.clusterSvc.GetCluster(uint(clusterID))
	if err != nil {
		response.NotFound(c, "集群不存在")
		return
	}

	// 获取 K8s 客户端
	k8sClient, err := h.k8sMgr.GetK8sClient(cluster)
	if err != nil {
		logger.Error("获取K8s客户端失败", "error", err)
		response.InternalError(c, "获取K8s客户端失败: "+err.Error())
		return
	}

	clientset := k8sClient.GetClientset()
	if clientset == nil {
		response.InternalError(c, "获取K8s客户端失败")
		return
	}

	// 获取资源 Top N
	result, err := h.omSvc.GetResourceTop(c.Request.Context(), clientset, uint(clusterID), &req)
	if err != nil {
		logger.Error("获取资源Top N失败", "error", err)
		response.InternalError(c, "获取资源Top N失败: "+err.Error())
		return
	}

	response.OK(c, result)
}

// GetControlPlaneStatus 获取控制面组件状态
// @Summary 获取控制面组件状态
// @Description 获取集群控制面组件（apiserver, scheduler, controller-manager, etcd）的状态
// @Tags O&M
// @Accept json
// @Produce json
// @Param clusterID path int true "集群ID"
// @Success 200 {object} models.ControlPlaneStatusResponse
// @Router /api/v1/clusters/{clusterID}/om/control-plane-status [get]
func (h *OMHandler) GetControlPlaneStatus(c *gin.Context) {
	clusterIDStr := c.Param("clusterID")
	clusterID, err := strconv.ParseUint(clusterIDStr, 10, 32)
	if err != nil {
		response.BadRequest(c, "无效的集群ID")
		return
	}

	// 获取集群信息
	cluster, err := h.clusterSvc.GetCluster(uint(clusterID))
	if err != nil {
		response.NotFound(c, "集群不存在")
		return
	}

	// 获取 K8s 客户端
	k8sClient, err := h.k8sMgr.GetK8sClient(cluster)
	if err != nil {
		logger.Error("获取K8s客户端失败", "error", err)
		response.InternalError(c, "获取K8s客户端失败: "+err.Error())
		return
	}

	clientset := k8sClient.GetClientset()
	if clientset == nil {
		response.InternalError(c, "获取K8s客户端失败")
		return
	}

	// 获取控制面状态
	result, err := h.omSvc.GetControlPlaneStatus(c.Request.Context(), clientset, uint(clusterID))
	if err != nil {
		logger.Error("获取控制面状态失败", "error", err)
		response.InternalError(c, "获取控制面状态失败: "+err.Error())
		return
	}

	response.OK(c, result)
}
