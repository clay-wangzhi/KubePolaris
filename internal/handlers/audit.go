package handlers

import (
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"

	"github.com/clay-wangzhi/KubePolaris/internal/config"
	"github.com/clay-wangzhi/KubePolaris/internal/response"
	"github.com/clay-wangzhi/KubePolaris/internal/services"
)

// AuditHandler 审计处理器
type AuditHandler struct {
	db           *gorm.DB
	cfg          *config.Config
	auditService *services.AuditService
}

// NewAuditHandler 创建审计处理器
func NewAuditHandler(db *gorm.DB, cfg *config.Config) *AuditHandler {
	return &AuditHandler{
		db:           db,
		cfg:          cfg,
		auditService: services.NewAuditService(db),
	}
}

// GetAuditLogs 获取审计日志
// TODO: 尚未实现通用审计日志查询，当前仅返回空列表。
// 终端会话审计已通过 GetTerminalSessions 等端点实现；
// 操作审计已通过 OperationLog 模块实现。
// 此端点预留用于未来整合所有审计数据的统一查询入口。
func (h *AuditHandler) GetAuditLogs(c *gin.Context) {
	response.PagedList(c, []interface{}{}, 0, 1, 10)
}

// GetTerminalSessions 获取终端会话记录
func (h *AuditHandler) GetTerminalSessions(c *gin.Context) {
	// 解析查询参数
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("pageSize", "20"))
	userIDStr := c.Query("userId")
	clusterIDStr := c.Query("clusterId")
	targetType := c.Query("targetType")
	status := c.Query("status")
	startTimeStr := c.Query("startTime")
	endTimeStr := c.Query("endTime")
	keyword := c.Query("keyword")

	req := &services.SessionListRequest{
		Page:       page,
		PageSize:   pageSize,
		TargetType: targetType,
		Status:     status,
		Keyword:    keyword,
	}

	if userIDStr != "" {
		if uid, err := strconv.ParseUint(userIDStr, 10, 32); err == nil {
			req.UserID = uint(uid)
		}
	}
	if clusterIDStr != "" {
		if cid, err := strconv.ParseUint(clusterIDStr, 10, 32); err == nil {
			req.ClusterID = uint(cid)
		}
	}
	if startTimeStr != "" {
		if t, err := time.Parse(time.RFC3339, startTimeStr); err == nil {
			req.StartTime = &t
		}
	}
	if endTimeStr != "" {
		if t, err := time.Parse(time.RFC3339, endTimeStr); err == nil {
			req.EndTime = &t
		}
	}

	resp, err := h.auditService.GetSessions(req)
	if err != nil {
		response.InternalError(c, "获取会话列表失败: "+err.Error())
		return
	}

	response.OK(c, resp)
}

// GetTerminalSession 获取终端会话详情
func (h *AuditHandler) GetTerminalSession(c *gin.Context) {
	sessionIDStr := c.Param("sessionId")
	sessionID, err := strconv.ParseUint(sessionIDStr, 10, 32)
	if err != nil {
		response.BadRequest(c, "无效的会话ID")
		return
	}

	session, err := h.auditService.GetSessionDetail(uint(sessionID))
	if err != nil {
		response.NotFound(c, "会话不存在")
		return
	}

	response.OK(c, session)
}

// GetTerminalCommands 获取终端命令记录
func (h *AuditHandler) GetTerminalCommands(c *gin.Context) {
	sessionIDStr := c.Param("sessionId")
	sessionID, err := strconv.ParseUint(sessionIDStr, 10, 32)
	if err != nil {
		response.BadRequest(c, "无效的会话ID")
		return
	}

	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("pageSize", "100"))

	resp, err := h.auditService.GetSessionCommands(uint(sessionID), page, pageSize)
	if err != nil {
		response.InternalError(c, "获取命令记录失败: "+err.Error())
		return
	}

	response.OK(c, resp)
}

// GetTerminalStats 获取终端会话统计
func (h *AuditHandler) GetTerminalStats(c *gin.Context) {
	stats, err := h.auditService.GetSessionStats()
	if err != nil {
		response.InternalError(c, "获取统计信息失败: "+err.Error())
		return
	}

	response.OK(c, stats)
}
