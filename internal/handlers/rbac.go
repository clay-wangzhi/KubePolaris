package handlers

import (
	"strconv"

	"github.com/gin-gonic/gin"
	rbacv1 "k8s.io/api/rbac/v1"

	"github.com/clay-wangzhi/KubePolaris/internal/k8s"
	"github.com/clay-wangzhi/KubePolaris/internal/response"
	"github.com/clay-wangzhi/KubePolaris/internal/services"
	"github.com/clay-wangzhi/KubePolaris/internal/templates/rbac"
)

// RBACHandler RBAC 权限管理处理器
type RBACHandler struct {
	clusterService *services.ClusterService
	rbacService    *services.RBACService
	k8sMgr         *k8s.ClusterInformerManager
}

// NewRBACHandler 创建 RBAC 权限管理处理器
func NewRBACHandler(clusterService *services.ClusterService, rbacService *services.RBACService, k8sMgr *k8s.ClusterInformerManager) *RBACHandler {
	return &RBACHandler{
		clusterService: clusterService,
		rbacService:    rbacService,
		k8sMgr:         k8sMgr,
	}
}

// SyncPermissions syncs KubePolaris RBAC resources to the cluster
// POST /api/v1/clusters/:clusterID/rbac/sync
func (h *RBACHandler) SyncPermissions(c *gin.Context) {
	clusterIDStr := c.Param("clusterID")
	clusterID, err := strconv.ParseUint(clusterIDStr, 10, 64)
	if err != nil {
		response.BadRequest(c, "无效的集群ID")
		return
	}

	// Get cluster
	cluster, err := h.clusterService.GetCluster(uint(clusterID))
	if err != nil {
		response.NotFound(c, "集群不存在")
		return
	}

	// 获取 K8s 客户端
	k8sClient, err := h.k8sMgr.GetK8sClient(cluster)
	if err != nil {
		response.InternalError(c, "获取K8s客户端失败: "+err.Error())
		return
	}

	clientset := k8sClient.GetClientset()

	// Sync permissions
	result, err := h.rbacService.SyncPermissions(clientset)
	if err != nil {
		response.InternalError(c, "同步权限失败: "+err.Error())
		return
	}

	response.OK(c, result)
}

// GetSyncStatus gets the sync status of KubePolaris RBAC resources
// GET /api/v1/clusters/:clusterID/rbac/status
func (h *RBACHandler) GetSyncStatus(c *gin.Context) {
	clusterIDStr := c.Param("clusterID")
	clusterID, err := strconv.ParseUint(clusterIDStr, 10, 64)
	if err != nil {
		response.BadRequest(c, "无效的集群ID")
		return
	}

	// Get cluster
	cluster, err := h.clusterService.GetCluster(uint(clusterID))
	if err != nil {
		response.NotFound(c, "集群不存在")
		return
	}

	// 获取 K8s 客户端
	k8sClient, err := h.k8sMgr.GetK8sClient(cluster)
	if err != nil {
		response.InternalError(c, "获取K8s客户端失败: "+err.Error())
		return
	}

	clientset := k8sClient.GetClientset()

	// Get sync status
	result, err := h.rbacService.GetSyncStatus(clientset)
	if err != nil {
		response.InternalError(c, "获取同步状态失败: "+err.Error())
		return
	}

	response.OK(c, result)
}

// ListClusterRoles lists all ClusterRoles in the cluster
// GET /api/v1/clusters/:clusterID/rbac/clusterroles
func (h *RBACHandler) ListClusterRoles(c *gin.Context) {
	clusterIDStr := c.Param("clusterID")
	clusterID, err := strconv.ParseUint(clusterIDStr, 10, 64)
	if err != nil {
		response.BadRequest(c, "无效的集群ID")
		return
	}

	// Get cluster
	cluster, err := h.clusterService.GetCluster(uint(clusterID))
	if err != nil {
		response.NotFound(c, "集群不存在")
		return
	}

	// 获取 K8s 客户端
	k8sClient, err := h.k8sMgr.GetK8sClient(cluster)
	if err != nil {
		response.InternalError(c, "获取K8s客户端失败: "+err.Error())
		return
	}

	clientset := k8sClient.GetClientset()

	// List ClusterRoles
	clusterRoles, err := h.rbacService.ListClusterRoles(clientset)
	if err != nil {
		response.InternalError(c, "获取ClusterRole列表失败: "+err.Error())
		return
	}

	// Convert to response format
	type ClusterRoleItem struct {
		Name          string            `json:"name"`
		Labels        map[string]string `json:"labels"`
		CreatedAt     string            `json:"created_at"`
		RulesCount    int               `json:"rules_count"`
		IsKubePolaris bool              `json:"is_kubepolaris"`
	}

	items := make([]ClusterRoleItem, 0, len(clusterRoles))
	for _, cr := range clusterRoles {
		isKubePolaris := false
		if cr.Labels != nil && cr.Labels[rbac.LabelManagedBy] == rbac.LabelValue {
			isKubePolaris = true
		}
		items = append(items, ClusterRoleItem{
			Name:          cr.Name,
			Labels:        cr.Labels,
			CreatedAt:     cr.CreationTimestamp.Format("2006-01-02 15:04:05"),
			RulesCount:    len(cr.Rules),
			IsKubePolaris: isKubePolaris,
		})
	}

	response.OK(c, items)
}

// CreateCustomClusterRoleRequest represents a request to create a custom ClusterRole
type CreateCustomClusterRoleRequest struct {
	Name  string              `json:"name" binding:"required"`
	Rules []rbacv1.PolicyRule `json:"rules" binding:"required"`
}

// CreateCustomClusterRole creates a custom ClusterRole
// POST /api/v1/clusters/:clusterID/rbac/clusterroles
func (h *RBACHandler) CreateCustomClusterRole(c *gin.Context) {
	clusterIDStr := c.Param("clusterID")
	clusterID, err := strconv.ParseUint(clusterIDStr, 10, 64)
	if err != nil {
		response.BadRequest(c, "无效的集群ID")
		return
	}

	var req CreateCustomClusterRoleRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "请求参数错误: "+err.Error())
		return
	}

	// Get cluster
	cluster, err := h.clusterService.GetCluster(uint(clusterID))
	if err != nil {
		response.NotFound(c, "集群不存在")
		return
	}

	// 获取 K8s 客户端
	k8sClient, err := h.k8sMgr.GetK8sClient(cluster)
	if err != nil {
		response.InternalError(c, "获取K8s客户端失败: "+err.Error())
		return
	}

	clientset := k8sClient.GetClientset()

	// Create ClusterRole
	err = h.rbacService.CreateCustomClusterRole(clientset, req.Name, req.Rules)
	if err != nil {
		response.InternalError(c, "创建ClusterRole失败: "+err.Error())
		return
	}

	response.OK(c, gin.H{"message": "创建成功"})
}

// DeleteClusterRole deletes a ClusterRole
// DELETE /api/v1/clusters/:clusterID/rbac/clusterroles/:name
func (h *RBACHandler) DeleteClusterRole(c *gin.Context) {
	clusterIDStr := c.Param("clusterID")
	name := c.Param("name")

	clusterID, err := strconv.ParseUint(clusterIDStr, 10, 64)
	if err != nil {
		response.BadRequest(c, "无效的集群ID")
		return
	}

	// Get cluster
	cluster, err := h.clusterService.GetCluster(uint(clusterID))
	if err != nil {
		response.NotFound(c, "集群不存在")
		return
	}

	// 获取 K8s 客户端
	k8sClient, err := h.k8sMgr.GetK8sClient(cluster)
	if err != nil {
		response.InternalError(c, "获取K8s客户端失败: "+err.Error())
		return
	}

	clientset := k8sClient.GetClientset()

	// Delete ClusterRole
	err = h.rbacService.DeleteClusterRole(clientset, name)
	if err != nil {
		response.InternalError(c, "删除ClusterRole失败: "+err.Error())
		return
	}

	response.OK(c, gin.H{"message": "删除成功"})
}

// ListRoles lists all Roles in a namespace
// GET /api/v1/clusters/:clusterID/namespaces/:namespace/rbac/roles
func (h *RBACHandler) ListRoles(c *gin.Context) {
	clusterIDStr := c.Param("clusterID")
	namespace := c.Param("namespace")

	clusterID, err := strconv.ParseUint(clusterIDStr, 10, 64)
	if err != nil {
		response.BadRequest(c, "无效的集群ID")
		return
	}

	// Get cluster
	cluster, err := h.clusterService.GetCluster(uint(clusterID))
	if err != nil {
		response.NotFound(c, "集群不存在")
		return
	}

	// 获取 K8s 客户端
	k8sClient, err := h.k8sMgr.GetK8sClient(cluster)
	if err != nil {
		response.InternalError(c, "获取K8s客户端失败: "+err.Error())
		return
	}

	clientset := k8sClient.GetClientset()

	// List Roles
	roles, err := h.rbacService.ListRoles(clientset, namespace)
	if err != nil {
		response.InternalError(c, "获取Role列表失败: "+err.Error())
		return
	}

	// Convert to response format
	type RoleItem struct {
		Name          string            `json:"name"`
		Namespace     string            `json:"namespace"`
		Labels        map[string]string `json:"labels"`
		CreatedAt     string            `json:"created_at"`
		RulesCount    int               `json:"rules_count"`
		IsKubePolaris bool              `json:"is_kubepolaris"`
	}

	items := make([]RoleItem, 0, len(roles))
	for _, role := range roles {
		isKubePolaris := false
		if role.Labels != nil && role.Labels[rbac.LabelManagedBy] == rbac.LabelValue {
			isKubePolaris = true
		}
		items = append(items, RoleItem{
			Name:          role.Name,
			Namespace:     role.Namespace,
			Labels:        role.Labels,
			CreatedAt:     role.CreationTimestamp.Format("2006-01-02 15:04:05"),
			RulesCount:    len(role.Rules),
			IsKubePolaris: isKubePolaris,
		})
	}

	response.OK(c, items)
}

// CreateCustomRoleRequest represents a request to create a custom Role
type CreateCustomRoleRequest struct {
	Name  string              `json:"name" binding:"required"`
	Rules []rbacv1.PolicyRule `json:"rules" binding:"required"`
}

// CreateCustomRole creates a custom Role in a namespace
// POST /api/v1/clusters/:clusterID/namespaces/:namespace/rbac/roles
func (h *RBACHandler) CreateCustomRole(c *gin.Context) {
	clusterIDStr := c.Param("clusterID")
	namespace := c.Param("namespace")

	clusterID, err := strconv.ParseUint(clusterIDStr, 10, 64)
	if err != nil {
		response.BadRequest(c, "无效的集群ID")
		return
	}

	var req CreateCustomRoleRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "请求参数错误: "+err.Error())
		return
	}

	// Get cluster
	cluster, err := h.clusterService.GetCluster(uint(clusterID))
	if err != nil {
		response.NotFound(c, "集群不存在")
		return
	}

	// 获取 K8s 客户端
	k8sClient, err := h.k8sMgr.GetK8sClient(cluster)
	if err != nil {
		response.InternalError(c, "获取K8s客户端失败: "+err.Error())
		return
	}

	clientset := k8sClient.GetClientset()

	// Create Role
	err = h.rbacService.CreateCustomRole(clientset, namespace, req.Name, req.Rules)
	if err != nil {
		response.InternalError(c, "创建Role失败: "+err.Error())
		return
	}

	response.OK(c, gin.H{"message": "创建成功"})
}

// DeleteRole deletes a Role
// DELETE /api/v1/clusters/:clusterID/namespaces/:namespace/rbac/roles/:name
func (h *RBACHandler) DeleteRole(c *gin.Context) {
	clusterIDStr := c.Param("clusterID")
	namespace := c.Param("namespace")
	name := c.Param("name")

	clusterID, err := strconv.ParseUint(clusterIDStr, 10, 64)
	if err != nil {
		response.BadRequest(c, "无效的集群ID")
		return
	}

	// Get cluster
	cluster, err := h.clusterService.GetCluster(uint(clusterID))
	if err != nil {
		response.NotFound(c, "集群不存在")
		return
	}

	// 获取 K8s 客户端
	k8sClient, err := h.k8sMgr.GetK8sClient(cluster)
	if err != nil {
		response.InternalError(c, "获取K8s客户端失败: "+err.Error())
		return
	}

	clientset := k8sClient.GetClientset()

	// Delete Role
	err = h.rbacService.DeleteRole(clientset, namespace, name)
	if err != nil {
		response.InternalError(c, "删除Role失败: "+err.Error())
		return
	}

	response.OK(c, gin.H{"message": "删除成功"})
}

// GetKubePolarisClusterRoles returns the predefined KubePolaris ClusterRoles
// GET /api/v1/rbac/kubepolaris-roles
func (h *RBACHandler) GetKubePolarisClusterRoles(c *gin.Context) {
	roles := rbac.GetAllClusterRoles()

	type RoleInfo struct {
		Name        string `json:"name"`
		Description string `json:"description"`
		RulesCount  int    `json:"rules_count"`
	}

	descriptions := map[string]string{
		rbac.ClusterRoleClusterAdmin: "管理员权限 - 对全部命名空间下所有资源的读写权限",
		rbac.ClusterRoleOps:          "运维权限 - 对大多数资源读写，namespace/node等只读",
		rbac.ClusterRoleDev:          "开发权限 - 对工作负载等资源读写，namespace只读",
		rbac.ClusterRoleReadonly:     "只读权限 - 对所有资源只读",
	}

	items := make([]RoleInfo, 0, len(roles))
	for _, role := range roles {
		items = append(items, RoleInfo{
			Name:        role.Name,
			Description: descriptions[role.Name],
			RulesCount:  len(role.Rules),
		})
	}

	response.OK(c, items)
}
