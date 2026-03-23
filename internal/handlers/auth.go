package handlers

import (
	"github.com/gin-gonic/gin"

	"github.com/clay-wangzhi/KubePolaris/internal/constants"
	"github.com/clay-wangzhi/KubePolaris/internal/response"
	"github.com/clay-wangzhi/KubePolaris/internal/services"
	"github.com/clay-wangzhi/KubePolaris/pkg/logger"
)

// AuthHandler 认证处理器
type AuthHandler struct {
	authService *services.AuthService
	opLogSvc    *services.OperationLogService
}

// NewAuthHandler 创建认证处理器
func NewAuthHandler(authService *services.AuthService, opLogSvc *services.OperationLogService) *AuthHandler {
	return &AuthHandler{
		authService: authService,
		opLogSvc:    opLogSvc,
	}
}

// LoginRequest 登录请求结构
type LoginRequest struct {
	Username string `json:"username" binding:"required"`
	Password string `json:"password" binding:"required"`
	AuthType string `json:"auth_type"` // 认证类型：local, ldap，默认local
}

// Login 用户登录 - 支持本地密码和LDAP两种认证方式
func (h *AuthHandler) Login(c *gin.Context) {
	var req LoginRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "请求参数错误")
		return
	}

	result, err := h.authService.Login(req.Username, req.Password, req.AuthType, c.ClientIP())
	if err != nil {
		logger.Warn("用户登录失败: %s, 错误: %v", req.Username, err)

		// 判断错误类型确定状态码
		statusCode := 401
		if err.Error() == "用户账号已被禁用" {
			statusCode = 403
		} else if err.Error() == "不支持的认证类型" {
			statusCode = 400
		} else if err.Error() == "JWT token生成失败" {
			statusCode = 500
		}

		// 记录登录失败审计日志
		if h.opLogSvc != nil {
			h.opLogSvc.RecordAsync(&services.LogEntry{
				Username:     req.Username,
				Method:       "POST",
				Path:         "/api/v1/auth/login",
				Module:       constants.ModuleAuth,
				Action:       constants.ActionLoginFailed,
				ResourceType: "user",
				ResourceName: req.Username,
				StatusCode:   statusCode,
				Success:      false,
				ErrorMessage: err.Error(),
				ClientIP:     c.ClientIP(),
				UserAgent:    c.Request.UserAgent(),
			})
		}

		switch statusCode {
		case 400:
			response.BadRequest(c, err.Error())
		case 403:
			response.Forbidden(c, err.Error())
		case 500:
			response.InternalError(c, err.Error())
		default:
			response.Unauthorized(c, err.Error())
		}
		return
	}

	// 记录登录成功审计日志
	if h.opLogSvc != nil {
		userID := result.User.ID
		h.opLogSvc.RecordAsync(&services.LogEntry{
			UserID:       &userID,
			Username:     result.User.Username,
			Method:       "POST",
			Path:         "/api/v1/auth/login",
			Module:       constants.ModuleAuth,
			Action:       constants.ActionLogin,
			ResourceType: "user",
			ResourceName: result.User.Username,
			StatusCode:   200,
			Success:      true,
			ClientIP:     c.ClientIP(),
			UserAgent:    c.Request.UserAgent(),
		})
	}

	response.OK(c, result)
}

// Logout 用户登出
func (h *AuthHandler) Logout(c *gin.Context) {
	var userID *uint
	username := ""
	if uid := c.GetUint("user_id"); uid > 0 {
		userID = &uid
	}
	if un := c.GetString("username"); un != "" {
		username = un
	}

	// 记录登出审计日志
	if h.opLogSvc != nil {
		h.opLogSvc.RecordAsync(&services.LogEntry{
			UserID:       userID,
			Username:     username,
			Method:       "POST",
			Path:         "/api/v1/auth/logout",
			Module:       constants.ModuleAuth,
			Action:       constants.ActionLogout,
			ResourceType: "user",
			ResourceName: username,
			StatusCode:   200,
			Success:      true,
			ClientIP:     c.ClientIP(),
			UserAgent:    c.Request.UserAgent(),
		})
	}

	response.OK(c, nil)
}

// GetProfile 获取用户信息
func (h *AuthHandler) GetProfile(c *gin.Context) {
	userID := c.GetUint("user_id")
	if userID == 0 {
		response.Unauthorized(c, "无效的用户认证信息")
		return
	}

	user, err := h.authService.GetProfile(userID)
	if err != nil {
		response.NotFound(c, "用户不存在")
		return
	}

	response.OK(c, user)
}

// AuthStatusResponse 认证状态响应
type AuthStatusResponse struct {
	LDAPEnabled bool `json:"ldap_enabled"`
}

// GetAuthStatus 获取认证状态（无需登录即可访问）
func (h *AuthHandler) GetAuthStatus(c *gin.Context) {
	ldapEnabled, _ := h.authService.GetAuthStatus()

	response.OK(c, AuthStatusResponse{
		LDAPEnabled: ldapEnabled,
	})
}

// ChangePasswordRequest 修改密码请求
type ChangePasswordRequest struct {
	OldPassword string `json:"old_password" binding:"required"`
	NewPassword string `json:"new_password" binding:"required,min=6"`
}

// ChangePassword 修改密码（仅限本地用户）
func (h *AuthHandler) ChangePassword(c *gin.Context) {
	userID := c.GetUint("user_id")
	if userID == 0 {
		response.Unauthorized(c, "无效的用户认证信息")
		return
	}

	var req ChangePasswordRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "请求参数错误")
		return
	}

	err := h.authService.ChangePassword(userID, req.OldPassword, req.NewPassword)
	if err != nil {
		switch err.Error() {
		case "用户不存在":
			response.NotFound(c, err.Error())
		case "LDAP用户不能在此修改密码":
			response.Forbidden(c, err.Error())
		case "原密码错误":
			response.Unauthorized(c, err.Error())
		default:
			response.InternalError(c, err.Error())
		}
		return
	}

	response.OK(c, nil)
}
