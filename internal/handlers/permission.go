package handlers

import (
	"fmt"
	"strconv"

	"github.com/gin-gonic/gin"

	"github.com/clay-wangzhi/KubePolaris/internal/models"
	"github.com/clay-wangzhi/KubePolaris/internal/response"
	"github.com/clay-wangzhi/KubePolaris/internal/services"
	"github.com/clay-wangzhi/KubePolaris/pkg/logger"
)

// PermissionHandler 权限管理处理器
type PermissionHandler struct {
	permissionService *services.PermissionService
	clusterService    *services.ClusterService
	rbacService       *services.RBACService
}

// NewPermissionHandler 创建权限管理处理器
func NewPermissionHandler(permissionService *services.PermissionService, clusterService *services.ClusterService, rbacService *services.RBACService) *PermissionHandler {
	return &PermissionHandler{
		permissionService: permissionService,
		clusterService:    clusterService,
		rbacService:       rbacService,
	}
}

// ========== 权限类型 ==========

// GetPermissionTypes 获取权限类型列表
func (h *PermissionHandler) GetPermissionTypes(c *gin.Context) {
	types := models.GetPermissionTypes()
	response.OK(c, types)
}

// ========== 用户组管理 ==========

// CreateUserGroupRequest 创建用户组请求
type CreateUserGroupRequest struct {
	Name        string `json:"name" binding:"required"`
	Description string `json:"description"`
}

// CreateUserGroup 创建用户组
func (h *PermissionHandler) CreateUserGroup(c *gin.Context) {
	var req CreateUserGroupRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "请求参数错误")
		return
	}

	group, err := h.permissionService.CreateUserGroup(req.Name, req.Description)
	if err != nil {
		response.InternalError(c, err.Error())
		return
	}

	response.OK(c, group)
}

// UpdateUserGroupRequest 更新用户组请求
type UpdateUserGroupRequest struct {
	Name        string `json:"name" binding:"required"`
	Description string `json:"description"`
}

// UpdateUserGroup 更新用户组
func (h *PermissionHandler) UpdateUserGroup(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil {
		response.BadRequest(c, "无效的用户组ID")
		return
	}

	var req UpdateUserGroupRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "请求参数错误")
		return
	}

	group, err := h.permissionService.UpdateUserGroup(uint(id), req.Name, req.Description)
	if err != nil {
		response.InternalError(c, err.Error())
		return
	}

	response.OK(c, group)
}

// DeleteUserGroup 删除用户组
func (h *PermissionHandler) DeleteUserGroup(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil {
		response.BadRequest(c, "无效的用户组ID")
		return
	}

	if err := h.permissionService.DeleteUserGroup(uint(id)); err != nil {
		response.InternalError(c, err.Error())
		return
	}

	response.OK(c, nil)
}

// GetUserGroup 获取用户组详情
func (h *PermissionHandler) GetUserGroup(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil {
		response.BadRequest(c, "无效的用户组ID")
		return
	}

	group, err := h.permissionService.GetUserGroup(uint(id))
	if err != nil {
		response.NotFound(c, err.Error())
		return
	}

	response.OK(c, group)
}

// ListUserGroups 获取用户组列表
func (h *PermissionHandler) ListUserGroups(c *gin.Context) {
	groups, err := h.permissionService.ListUserGroups()
	if err != nil {
		response.InternalError(c, err.Error())
		return
	}

	response.OK(c, groups)
}

// AddUserToGroupRequest 添加用户到用户组请求
type AddUserToGroupRequest struct {
	UserID uint `json:"user_id" binding:"required"`
}

// AddUserToGroup 添加用户到用户组
func (h *PermissionHandler) AddUserToGroup(c *gin.Context) {
	groupID, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil {
		response.BadRequest(c, "无效的用户组ID")
		return
	}

	var req AddUserToGroupRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "请求参数错误")
		return
	}

	if err := h.permissionService.AddUserToGroup(req.UserID, uint(groupID)); err != nil {
		response.InternalError(c, err.Error())
		return
	}

	response.OK(c, nil)
}

// RemoveUserFromGroup 从用户组移除用户
func (h *PermissionHandler) RemoveUserFromGroup(c *gin.Context) {
	groupID, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil {
		response.BadRequest(c, "无效的用户组ID")
		return
	}

	userID, err := strconv.ParseUint(c.Param("userId"), 10, 64)
	if err != nil {
		response.BadRequest(c, "无效的用户ID")
		return
	}

	if err := h.permissionService.RemoveUserFromGroup(uint(userID), uint(groupID)); err != nil {
		response.InternalError(c, err.Error())
		return
	}

	response.OK(c, nil)
}

// ========== 集群权限管理 ==========

// CreateClusterPermissionRequest 创建集群权限请求
type CreateClusterPermissionRequest struct {
	ClusterID      uint     `json:"cluster_id" binding:"required"`
	UserID         *uint    `json:"user_id"`
	UserGroupID    *uint    `json:"user_group_id"`
	PermissionType string   `json:"permission_type" binding:"required"`
	Namespaces     []string `json:"namespaces"`
	CustomRoleRef  string   `json:"custom_role_ref"`
	// 批量字段：与 UserID/UserGroupID 互斥，支持同时为多个用户和用户组创建权限
	UserIDs      []uint `json:"user_ids"`
	UserGroupIDs []uint `json:"user_group_ids"`
}

// CreateClusterPermission 创建集群权限（支持批量）
func (h *PermissionHandler) CreateClusterPermission(c *gin.Context) {
	var req CreateClusterPermissionRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "请求参数错误")
		return
	}

	// 兼容旧的单个用户/用户组字段
	if req.UserID != nil && len(req.UserIDs) == 0 {
		req.UserIDs = []uint{*req.UserID}
	}
	if req.UserGroupID != nil && len(req.UserGroupIDs) == 0 {
		req.UserGroupIDs = []uint{*req.UserGroupID}
	}

	if len(req.UserIDs) == 0 && len(req.UserGroupIDs) == 0 {
		response.BadRequest(c, "至少需要指定一个用户或用户组")
		return
	}

	var created []models.ClusterPermissionResponse
	var errs []string

	// 为每个用户创建权限
	for _, uid := range req.UserIDs {
		uidCopy := uid
		serviceReq := &services.CreateClusterPermissionRequest{
			ClusterID:      req.ClusterID,
			UserID:         &uidCopy,
			PermissionType: req.PermissionType,
			Namespaces:     req.Namespaces,
			CustomRoleRef:  req.CustomRoleRef,
		}
		permission, err := h.permissionService.CreateClusterPermission(serviceReq)
		if err != nil {
			errs = append(errs, fmt.Sprintf("用户ID=%d: %s", uid, err.Error()))
			continue
		}
		go h.ensureUserRBACInCluster(permission)
		created = append(created, permission.ToResponse())
	}

	// 为每个用户组创建权限
	for _, gid := range req.UserGroupIDs {
		gidCopy := gid
		serviceReq := &services.CreateClusterPermissionRequest{
			ClusterID:      req.ClusterID,
			UserGroupID:    &gidCopy,
			PermissionType: req.PermissionType,
			Namespaces:     req.Namespaces,
			CustomRoleRef:  req.CustomRoleRef,
		}
		permission, err := h.permissionService.CreateClusterPermission(serviceReq)
		if err != nil {
			errs = append(errs, fmt.Sprintf("用户组ID=%d: %s", gid, err.Error()))
			continue
		}
		go h.ensureUserRBACInCluster(permission)
		created = append(created, permission.ToResponse())
	}

	if len(created) == 0 && len(errs) > 0 {
		response.BadRequest(c, "创建失败")
		return
	}

	data := gin.H{"items": created, "count": len(created)}
	if len(errs) > 0 {
		data["errors"] = errs
	}
	response.OK(c, data)
}

// ensureUserRBACInCluster 确保用户在集群中有对应的 RBAC 资源
func (h *PermissionHandler) ensureUserRBACInCluster(permission *models.ClusterPermission) {
	// 只有用户级别的权限才需要创建 RBAC（用户组的权限需要特殊处理）
	if permission.UserID == nil {
		logger.Info("用户组权限暂不自动创建 RBAC", "userGroupID", permission.UserGroupID)
		return
	}

	// 获取集群信息
	cluster, err := h.clusterService.GetCluster(permission.ClusterID)
	if err != nil {
		logger.Error("获取集群信息失败，无法创建 RBAC", "clusterID", permission.ClusterID, "error", err)
		return
	}

	// 创建 K8s 客户端
	k8sClient, err := services.NewK8sClientForCluster(cluster)
	if err != nil {
		logger.Error("创建 K8s 客户端失败", "clusterID", permission.ClusterID, "error", err)
		return
	}

	// 解析命名空间
	namespaces := permission.GetNamespaceList()

	// 创建 RBAC 配置
	config := &services.UserRBACConfig{
		UserID:         *permission.UserID,
		PermissionType: permission.PermissionType,
		Namespaces:     namespaces,
		ClusterRoleRef: permission.CustomRoleRef,
	}

	// 确保 RBAC 资源存在
	if err := h.rbacService.EnsureUserRBAC(k8sClient.GetClientset(), config); err != nil {
		logger.Error("创建用户 RBAC 失败", "userID", *permission.UserID, "clusterID", permission.ClusterID, "error", err)
	} else {
		logger.Info("用户 RBAC 创建成功", "userID", *permission.UserID, "clusterID", permission.ClusterID, "permissionType", permission.PermissionType)
	}
}

// UpdateClusterPermissionRequest 更新集群权限请求
type UpdateClusterPermissionRequest struct {
	PermissionType string   `json:"permission_type"`
	Namespaces     []string `json:"namespaces"`
	CustomRoleRef  string   `json:"custom_role_ref"`
}

// UpdateClusterPermission 更新集群权限
func (h *PermissionHandler) UpdateClusterPermission(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil {
		response.BadRequest(c, "无效的权限ID")
		return
	}

	var req UpdateClusterPermissionRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "请求参数错误")
		return
	}

	serviceReq := &services.UpdateClusterPermissionRequest{
		PermissionType: req.PermissionType,
		Namespaces:     req.Namespaces,
		CustomRoleRef:  req.CustomRoleRef,
	}

	// 获取旧权限配置用于清理
	oldPermission, _ := h.permissionService.GetClusterPermission(uint(id))

	permission, err := h.permissionService.UpdateClusterPermission(uint(id), serviceReq)
	if err != nil {
		response.BadRequest(c, err.Error())
		return
	}

	// 异步更新 RBAC 资源
	go h.updateUserRBACInCluster(oldPermission, permission)

	response.OK(c, permission.ToResponse())
}

// updateUserRBACInCluster 更新用户在集群中的 RBAC 资源
func (h *PermissionHandler) updateUserRBACInCluster(oldPermission, newPermission *models.ClusterPermission) {
	if newPermission.UserID == nil {
		return
	}

	// 获取集群信息
	cluster, err := h.clusterService.GetCluster(newPermission.ClusterID)
	if err != nil {
		logger.Error("获取集群信息失败", "clusterID", newPermission.ClusterID, "error", err)
		return
	}

	// 创建 K8s 客户端
	k8sClient, err := services.NewK8sClientForCluster(cluster)
	if err != nil {
		logger.Error("创建 K8s 客户端失败", "error", err)
		return
	}

	// 如果旧权限存在，先清理
	if oldPermission != nil && oldPermission.UserID != nil {
		oldNamespaces := oldPermission.GetNamespaceList()
		if err := h.rbacService.CleanupUserRBAC(k8sClient.GetClientset(), *oldPermission.UserID, oldPermission.PermissionType, oldNamespaces); err != nil {
			logger.Warn("清理旧 RBAC 失败", "error", err)
		}
	}

	// 创建新 RBAC
	newNamespaces := newPermission.GetNamespaceList()
	config := &services.UserRBACConfig{
		UserID:         *newPermission.UserID,
		PermissionType: newPermission.PermissionType,
		Namespaces:     newNamespaces,
		ClusterRoleRef: newPermission.CustomRoleRef,
	}

	if err := h.rbacService.EnsureUserRBAC(k8sClient.GetClientset(), config); err != nil {
		logger.Error("更新用户 RBAC 失败", "error", err)
	} else {
		logger.Info("用户 RBAC 更新成功", "userID", *newPermission.UserID, "clusterID", newPermission.ClusterID)
	}
}

// DeleteClusterPermission 删除集群权限
func (h *PermissionHandler) DeleteClusterPermission(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil {
		response.BadRequest(c, "无效的权限ID")
		return
	}

	// 先获取权限信息用于清理 RBAC
	permission, _ := h.permissionService.GetClusterPermission(uint(id))

	if err := h.permissionService.DeleteClusterPermission(uint(id)); err != nil {
		response.InternalError(c, err.Error())
		return
	}

	// 异步清理 RBAC 资源
	if permission != nil {
		go h.cleanupUserRBACInCluster(permission)
	}

	response.OK(c, nil)
}

// cleanupUserRBACInCluster 清理用户在集群中的 RBAC 资源
func (h *PermissionHandler) cleanupUserRBACInCluster(permission *models.ClusterPermission) {
	if permission.UserID == nil {
		return
	}

	// 获取集群信息
	cluster, err := h.clusterService.GetCluster(permission.ClusterID)
	if err != nil {
		logger.Error("获取集群信息失败，无法清理 RBAC", "clusterID", permission.ClusterID, "error", err)
		return
	}

	// 创建 K8s 客户端
	k8sClient, err := services.NewK8sClientForCluster(cluster)
	if err != nil {
		logger.Error("创建 K8s 客户端失败", "error", err)
		return
	}

	namespaces := permission.GetNamespaceList()
	if err := h.rbacService.CleanupUserRBAC(k8sClient.GetClientset(), *permission.UserID, permission.PermissionType, namespaces); err != nil {
		logger.Error("清理用户 RBAC 失败", "error", err)
	} else {
		logger.Info("用户 RBAC 清理成功", "userID", *permission.UserID, "clusterID", permission.ClusterID)
	}
}

// BatchDeleteClusterPermissionsRequest 批量删除请求
type BatchDeleteClusterPermissionsRequest struct {
	IDs []uint `json:"ids" binding:"required"`
}

// BatchDeleteClusterPermissions 批量删除集群权限
func (h *PermissionHandler) BatchDeleteClusterPermissions(c *gin.Context) {
	var req BatchDeleteClusterPermissionsRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "请求参数错误")
		return
	}

	if err := h.permissionService.BatchDeleteClusterPermissions(req.IDs); err != nil {
		response.InternalError(c, err.Error())
		return
	}

	response.OK(c, nil)
}

// GetClusterPermission 获取集群权限详情
func (h *PermissionHandler) GetClusterPermission(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil {
		response.BadRequest(c, "无效的权限ID")
		return
	}

	permission, err := h.permissionService.GetClusterPermission(uint(id))
	if err != nil {
		response.NotFound(c, err.Error())
		return
	}

	response.OK(c, permission.ToResponse())
}

// ListClusterPermissions 获取集群权限列表
func (h *PermissionHandler) ListClusterPermissions(c *gin.Context) {
	clusterIDStr := c.Query("cluster_id")
	var clusterID uint
	if clusterIDStr != "" {
		id, err := strconv.ParseUint(clusterIDStr, 10, 64)
		if err != nil {
			response.BadRequest(c, "无效的集群ID")
			return
		}
		clusterID = uint(id)
	}

	permissions, err := h.permissionService.ListClusterPermissions(clusterID)
	if err != nil {
		response.InternalError(c, err.Error())
		return
	}

	// 转换为响应格式
	responses := make([]models.ClusterPermissionResponse, len(permissions))
	for i, p := range permissions {
		responses[i] = p.ToResponse()
	}

	response.OK(c, responses)
}

// ListAllClusterPermissions 获取所有集群权限列表
func (h *PermissionHandler) ListAllClusterPermissions(c *gin.Context) {
	permissions, err := h.permissionService.ListAllClusterPermissions()
	if err != nil {
		response.InternalError(c, err.Error())
		return
	}

	// 转换为响应格式
	responses := make([]models.ClusterPermissionResponse, len(permissions))
	for i, p := range permissions {
		responses[i] = p.ToResponse()
	}

	response.OK(c, responses)
}

// ========== 用户权限查询 ==========

// GetMyPermissions 获取当前用户的权限
func (h *PermissionHandler) GetMyPermissions(c *gin.Context) {
	userID := c.GetUint("user_id")
	if userID == 0 {
		response.Unauthorized(c, "未登录")
		return
	}

	permissions, err := h.permissionService.GetUserAllClusterPermissions(userID)
	if err != nil {
		response.InternalError(c, err.Error())
		return
	}

	// 转换为响应格式
	responses := make([]models.MyPermissionsResponse, len(permissions))
	for i, p := range permissions {
		permissionName := ""
		for _, pt := range models.GetPermissionTypes() {
			if pt.Type == p.PermissionType {
				permissionName = pt.Name
				break
			}
		}

		clusterName := ""
		if p.Cluster != nil {
			clusterName = p.Cluster.Name
		}

		responses[i] = models.MyPermissionsResponse{
			ClusterID:      p.ClusterID,
			ClusterName:    clusterName,
			PermissionType: p.PermissionType,
			PermissionName: permissionName,
			Namespaces:     p.GetNamespaceList(),
			CustomRoleRef:  p.CustomRoleRef,
		}
	}

	response.OK(c, responses)
}

// GetMyClusterPermission 获取当前用户在指定集群的权限
func (h *PermissionHandler) GetMyClusterPermission(c *gin.Context) {
	userID := c.GetUint("user_id")
	if userID == 0 {
		response.Unauthorized(c, "未登录")
		return
	}

	clusterID, err := strconv.ParseUint(c.Param("clusterID"), 10, 64)
	if err != nil {
		response.BadRequest(c, "无效的集群ID")
		return
	}

	permission, err := h.permissionService.GetUserClusterPermission(userID, uint(clusterID))
	if err != nil {
		response.Forbidden(c, "无权限访问该集群")
		return
	}

	// 获取权限类型信息
	permissionName := ""
	var allowedActions []string
	for _, pt := range models.GetPermissionTypes() {
		if pt.Type == permission.PermissionType {
			permissionName = pt.Name
			allowedActions = pt.Actions
			break
		}
	}

	response.OK(c, models.MyPermissionsResponse{
		ClusterID:      permission.ClusterID,
		PermissionType: permission.PermissionType,
		PermissionName: permissionName,
		Namespaces:     permission.GetNamespaceList(),
		AllowedActions: allowedActions,
		CustomRoleRef:  permission.CustomRoleRef,
	})
}

// ========== 用户列表 ==========

// ListUsers 获取用户列表
func (h *PermissionHandler) ListUsers(c *gin.Context) {
	users, err := h.permissionService.ListUsers()
	if err != nil {
		response.InternalError(c, err.Error())
		return
	}

	response.OK(c, users)
}
