package handlers

import (
	"strconv"

	"github.com/gin-gonic/gin"

	"github.com/clay-wangzhi/KubePolaris/internal/response"
	"github.com/clay-wangzhi/KubePolaris/internal/services"
	"github.com/clay-wangzhi/KubePolaris/pkg/logger"
)

// UserHandler 用户管理处理器
type UserHandler struct {
	userService *services.UserService
}

// NewUserHandler 创建用户管理处理器
func NewUserHandler(userService *services.UserService) *UserHandler {
	return &UserHandler{userService: userService}
}

// ListUsers 获取用户列表
func (h *UserHandler) ListUsers(c *gin.Context) {
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("pageSize", "20"))
	if page < 1 {
		page = 1
	}
	if pageSize < 1 || pageSize > 100 {
		pageSize = 20
	}

	params := &services.ListUsersParams{
		Page:     page,
		PageSize: pageSize,
		Search:   c.Query("search"),
		Status:   c.Query("status"),
		AuthType: c.Query("auth_type"),
	}

	users, total, err := h.userService.ListUsers(params)
	if err != nil {
		response.InternalError(c, err.Error())
		return
	}

	response.PagedList(c, users, total, page, pageSize)
}

// GetUser 获取用户详情
func (h *UserHandler) GetUser(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil {
		response.BadRequest(c, "无效的用户ID")
		return
	}

	user, err := h.userService.GetUser(uint(id))
	if err != nil {
		response.NotFound(c, err.Error())
		return
	}

	response.OK(c, user)
}

// CreateUser 创建用户
func (h *UserHandler) CreateUser(c *gin.Context) {
	var req services.CreateUserRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "请求参数错误")
		return
	}

	user, err := h.userService.CreateUser(&req)
	if err != nil {
		response.BadRequest(c, err.Error())
		return
	}

	logger.Info("创建用户: %s", user.Username)
	response.OK(c, user)
}

// UpdateUser 更新用户
func (h *UserHandler) UpdateUser(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil {
		response.BadRequest(c, "无效的用户ID")
		return
	}

	var req services.UpdateUserRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "请求参数错误")
		return
	}

	user, err := h.userService.UpdateUser(uint(id), &req)
	if err != nil {
		response.BadRequest(c, err.Error())
		return
	}

	response.OK(c, user)
}

// DeleteUser 删除用户
func (h *UserHandler) DeleteUser(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil {
		response.BadRequest(c, "无效的用户ID")
		return
	}

	// 不能删除自己
	currentUserID := c.GetUint("user_id")
	if currentUserID == uint(id) {
		response.BadRequest(c, "不能删除自己")
		return
	}

	if err := h.userService.DeleteUser(uint(id)); err != nil {
		response.BadRequest(c, err.Error())
		return
	}

	response.OK(c, nil)
}

// UpdateStatusRequest 更新用户状态请求
type UpdateStatusRequest struct {
	Status string `json:"status" binding:"required"`
}

// UpdateUserStatus 更新用户状态
func (h *UserHandler) UpdateUserStatus(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil {
		response.BadRequest(c, "无效的用户ID")
		return
	}

	var req UpdateStatusRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "请求参数错误")
		return
	}

	if err := h.userService.UpdateUserStatus(uint(id), req.Status); err != nil {
		response.BadRequest(c, err.Error())
		return
	}

	response.OK(c, nil)
}

// ResetPasswordRequest 重置密码请求
type ResetPasswordRequest struct {
	NewPassword string `json:"new_password" binding:"required,min=6"`
}

// ResetPassword 重置用户密码
func (h *UserHandler) ResetPassword(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil {
		response.BadRequest(c, "无效的用户ID")
		return
	}

	var req ResetPasswordRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "请求参数错误")
		return
	}

	if err := h.userService.ResetPassword(uint(id), req.NewPassword); err != nil {
		response.BadRequest(c, err.Error())
		return
	}

	response.OK(c, nil)
}
