package handlers

import (
	"strconv"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"

	"github.com/clay-wangzhi/KubePolaris/internal/models"
	"github.com/clay-wangzhi/KubePolaris/internal/response"
	"github.com/clay-wangzhi/KubePolaris/internal/services"
	"github.com/clay-wangzhi/KubePolaris/pkg/logger"
)

// ArgoCDHandler ArgoCD 处理器
type ArgoCDHandler struct {
	db        *gorm.DB
	argoCDSvc *services.ArgoCDService
}

// NewArgoCDHandler 创建 ArgoCD 处理器
func NewArgoCDHandler(db *gorm.DB, argoCDSvc *services.ArgoCDService) *ArgoCDHandler {
	return &ArgoCDHandler{
		db:        db,
		argoCDSvc: argoCDSvc,
	}
}

// GetConfig 获取 ArgoCD 配置
// @Summary 获取 ArgoCD 配置
// @Tags ArgoCD/GitOps
// @Produce json
// @Param clusterID path int true "集群ID"
// @Success 200 {object} models.ArgoCDConfig
// @Router /api/v1/clusters/{clusterID}/argocd/config [get]
func (h *ArgoCDHandler) GetConfig(c *gin.Context) {
	clusterID, err := strconv.ParseUint(c.Param("clusterID"), 10, 64)
	if err != nil {
		response.BadRequest(c, "无效的集群ID")
		return
	}

	config, err := h.argoCDSvc.GetConfig(c.Request.Context(), uint(clusterID))
	if err != nil {
		response.InternalError(c, err.Error())
		return
	}

	// 隐藏敏感信息
	configResp := *config
	configResp.Token = ""
	configResp.Password = ""
	configResp.GitPassword = ""
	configResp.GitSSHKey = ""

	response.OK(c, configResp)
}

// SaveConfig 保存 ArgoCD 配置
// @Summary 保存 ArgoCD 配置
// @Tags ArgoCD/GitOps
// @Accept json
// @Produce json
// @Param clusterID path int true "集群ID"
// @Param config body models.ArgoCDConfig true "配置信息"
// @Success 200 {object} gin.H
// @Router /api/v1/clusters/{clusterID}/argocd/config [put]
func (h *ArgoCDHandler) SaveConfig(c *gin.Context) {
	clusterID, err := strconv.ParseUint(c.Param("clusterID"), 10, 64)
	if err != nil {
		response.BadRequest(c, "无效的集群ID")
		return
	}

	// 使用请求结构体接收前端数据（包含敏感字段）
	var req models.ArgoCDConfigRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "参数错误: "+err.Error())
		return
	}

	// 转换为数据库模型
	config := req.ToModel()
	config.ClusterID = uint(clusterID)

	// 如果没有传新的密码/Token，保留原有的
	existing, _ := h.argoCDSvc.GetConfig(c.Request.Context(), uint(clusterID))
	if existing != nil && existing.ID > 0 {
		if config.Token == "" {
			config.Token = existing.Token
		}
		if config.Password == "" {
			config.Password = existing.Password
		}
		if config.GitPassword == "" {
			config.GitPassword = existing.GitPassword
		}
		if config.GitSSHKey == "" {
			config.GitSSHKey = existing.GitSSHKey
		}
	}

	if err := h.argoCDSvc.SaveConfig(c.Request.Context(), config); err != nil {
		response.InternalError(c, "保存失败: "+err.Error())
		return
	}

	response.OK(c, gin.H{"message": "保存成功"})
}

// TestConnection 测试 ArgoCD 连接
// @Summary 测试 ArgoCD 连接
// @Tags ArgoCD/GitOps
// @Accept json
// @Produce json
// @Param clusterID path int true "集群ID"
// @Param config body models.ArgoCDConfig true "配置信息"
// @Success 200 {object} gin.H
// @Router /api/v1/clusters/{clusterID}/argocd/test-connection [post]
func (h *ArgoCDHandler) TestConnection(c *gin.Context) {
	clusterID, err := strconv.ParseUint(c.Param("clusterID"), 10, 64)
	if err != nil {
		response.BadRequest(c, "无效的集群ID")
		return
	}

	// 使用请求结构体接收前端数据（包含敏感字段）
	var req models.ArgoCDConfigRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "参数错误")
		return
	}

	// 转换为数据库模型
	config := req.ToModel()
	logger.Info("测试 ArgoCD 连接", "serverURL", config.ServerURL, "authType", config.AuthType, "hasToken", config.Token != "", "hasPassword", config.Password != "")

	// 如果没有传认证信息，尝试从数据库获取（仅作为回退）
	if config.Token == "" && config.Password == "" {
		existing, _ := h.argoCDSvc.GetConfig(c.Request.Context(), uint(clusterID))
		if existing != nil {
			config.Token = existing.Token
			config.Username = existing.Username
			config.Password = existing.Password
			logger.Info("使用数据库中的认证信息")
		}
	}

	if err := h.argoCDSvc.TestConnection(c.Request.Context(), config); err != nil {
		response.OK(c, gin.H{
			"connected": false,
			"error":     err.Error(),
		})
		return
	}

	response.OK(c, gin.H{"connected": true})
}

// ListApplications 获取应用列表
// @Summary 获取 ArgoCD 应用列表
// @Tags ArgoCD/GitOps
// @Produce json
// @Param clusterID path int true "集群ID"
// @Success 200 {array} models.ArgoCDApplication
// @Router /api/v1/clusters/{clusterID}/argocd/applications [get]
func (h *ArgoCDHandler) ListApplications(c *gin.Context) {
	clusterID, err := strconv.ParseUint(c.Param("clusterID"), 10, 64)
	if err != nil {
		response.BadRequest(c, "无效的集群ID")
		return
	}

	apps, err := h.argoCDSvc.ListApplications(c.Request.Context(), uint(clusterID))
	if err != nil {
		response.InternalError(c, err.Error())
		return
	}

	response.List(c, apps, int64(len(apps)))
}

// GetApplication 获取应用详情
// @Summary 获取 ArgoCD 应用详情
// @Tags ArgoCD/GitOps
// @Produce json
// @Param clusterID path int true "集群ID"
// @Param appName path string true "应用名称"
// @Success 200 {object} models.ArgoCDApplication
// @Router /api/v1/clusters/{clusterID}/argocd/applications/{appName} [get]
func (h *ArgoCDHandler) GetApplication(c *gin.Context) {
	clusterID, err := strconv.ParseUint(c.Param("clusterID"), 10, 64)
	if err != nil {
		response.BadRequest(c, "无效的集群ID")
		return
	}
	appName := c.Param("appName")

	app, err := h.argoCDSvc.GetApplication(c.Request.Context(), uint(clusterID), appName)
	if err != nil {
		response.InternalError(c, err.Error())
		return
	}

	response.OK(c, app)
}

// CreateApplication 创建应用
// @Summary 创建 ArgoCD 应用
// @Tags ArgoCD/GitOps
// @Accept json
// @Produce json
// @Param clusterID path int true "集群ID"
// @Param request body models.CreateApplicationRequest true "创建请求"
// @Success 200 {object} models.ArgoCDApplication
// @Router /api/v1/clusters/{clusterID}/argocd/applications [post]
func (h *ArgoCDHandler) CreateApplication(c *gin.Context) {
	clusterID, err := strconv.ParseUint(c.Param("clusterID"), 10, 64)
	if err != nil {
		response.BadRequest(c, "无效的集群ID")
		return
	}

	var req models.CreateApplicationRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "参数错误: "+err.Error())
		return
	}

	app, err := h.argoCDSvc.CreateApplication(c.Request.Context(), uint(clusterID), &req)
	if err != nil {
		response.InternalError(c, err.Error())
		return
	}

	response.OK(c, app)
}

// UpdateApplication 更新应用
// @Summary 更新 ArgoCD 应用
// @Tags ArgoCD/GitOps
// @Accept json
// @Produce json
// @Param clusterID path int true "集群ID"
// @Param appName path string true "应用名称"
// @Param request body models.CreateApplicationRequest true "更新请求"
// @Success 200 {object} models.ArgoCDApplication
// @Router /api/v1/clusters/{clusterID}/argocd/applications/{appName} [put]
func (h *ArgoCDHandler) UpdateApplication(c *gin.Context) {
	clusterID, err := strconv.ParseUint(c.Param("clusterID"), 10, 64)
	if err != nil {
		response.BadRequest(c, "无效的集群ID")
		return
	}
	appName := c.Param("appName")

	var req models.CreateApplicationRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "参数错误: "+err.Error())
		return
	}

	app, err := h.argoCDSvc.UpdateApplication(c.Request.Context(), uint(clusterID), appName, &req)
	if err != nil {
		response.InternalError(c, err.Error())
		return
	}

	response.OK(c, app)
}

// SyncApplication 同步应用
// @Summary 同步 ArgoCD 应用
// @Tags ArgoCD/GitOps
// @Accept json
// @Produce json
// @Param clusterID path int true "集群ID"
// @Param appName path string true "应用名称"
// @Param request body models.SyncApplicationRequest false "同步请求"
// @Success 200 {object} gin.H
// @Router /api/v1/clusters/{clusterID}/argocd/applications/{appName}/sync [post]
func (h *ArgoCDHandler) SyncApplication(c *gin.Context) {
	clusterID, err := strconv.ParseUint(c.Param("clusterID"), 10, 64)
	if err != nil {
		response.BadRequest(c, "无效的集群ID")
		return
	}
	appName := c.Param("appName")

	var req models.SyncApplicationRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "请求参数错误: "+err.Error())
		return
	}

	if err := h.argoCDSvc.SyncApplication(c.Request.Context(), uint(clusterID), appName, req.Revision); err != nil {
		response.InternalError(c, err.Error())
		return
	}

	response.OK(c, gin.H{"message": "同步已触发"})
}

// DeleteApplication 删除应用
// @Summary 删除 ArgoCD 应用
// @Tags ArgoCD/GitOps
// @Produce json
// @Param clusterID path int true "集群ID"
// @Param appName path string true "应用名称"
// @Param cascade query bool false "是否级联删除资源" default(true)
// @Success 200 {object} gin.H
// @Router /api/v1/clusters/{clusterID}/argocd/applications/{appName} [delete]
func (h *ArgoCDHandler) DeleteApplication(c *gin.Context) {
	clusterID, err := strconv.ParseUint(c.Param("clusterID"), 10, 64)
	if err != nil {
		response.BadRequest(c, "无效的集群ID")
		return
	}
	appName := c.Param("appName")
	cascade := c.Query("cascade") != "false"

	if err := h.argoCDSvc.DeleteApplication(c.Request.Context(), uint(clusterID), appName, cascade); err != nil {
		response.InternalError(c, err.Error())
		return
	}

	response.OK(c, gin.H{"message": "删除成功"})
}

// RollbackApplication 回滚应用
// @Summary 回滚 ArgoCD 应用
// @Tags ArgoCD/GitOps
// @Accept json
// @Produce json
// @Param clusterID path int true "集群ID"
// @Param appName path string true "应用名称"
// @Param request body models.RollbackApplicationRequest true "回滚请求"
// @Success 200 {object} gin.H
// @Router /api/v1/clusters/{clusterID}/argocd/applications/{appName}/rollback [post]
func (h *ArgoCDHandler) RollbackApplication(c *gin.Context) {
	clusterID, err := strconv.ParseUint(c.Param("clusterID"), 10, 64)
	if err != nil {
		response.BadRequest(c, "无效的集群ID")
		return
	}
	appName := c.Param("appName")

	var req models.RollbackApplicationRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "参数错误")
		return
	}

	if err := h.argoCDSvc.RollbackApplication(c.Request.Context(), uint(clusterID), appName, req.RevisionID); err != nil {
		response.InternalError(c, err.Error())
		return
	}

	response.OK(c, gin.H{"message": "回滚已触发"})
}

// GetApplicationResources 获取应用资源树
// @Summary 获取 ArgoCD 应用资源树
// @Tags ArgoCD/GitOps
// @Produce json
// @Param clusterID path int true "集群ID"
// @Param appName path string true "应用名称"
// @Success 200 {array} models.ArgoCDResource
// @Router /api/v1/clusters/{clusterID}/argocd/applications/{appName}/resources [get]
func (h *ArgoCDHandler) GetApplicationResources(c *gin.Context) {
	clusterID, err := strconv.ParseUint(c.Param("clusterID"), 10, 64)
	if err != nil {
		response.BadRequest(c, "无效的集群ID")
		return
	}
	appName := c.Param("appName")

	resources, err := h.argoCDSvc.GetApplicationResources(c.Request.Context(), uint(clusterID), appName)
	if err != nil {
		response.InternalError(c, err.Error())
		return
	}

	response.OK(c, resources)
}
