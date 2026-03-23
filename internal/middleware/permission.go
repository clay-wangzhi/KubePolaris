package middleware

import (
	"strconv"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"

	"github.com/clay-wangzhi/KubePolaris/internal/models"
	"github.com/clay-wangzhi/KubePolaris/internal/response"
	"github.com/clay-wangzhi/KubePolaris/internal/services"
)

// PermissionMiddleware 权限中间件
type PermissionMiddleware struct {
	permissionService *services.PermissionService
}

// NewPermissionMiddleware 创建权限中间件
func NewPermissionMiddleware(permissionService *services.PermissionService) *PermissionMiddleware {
	return &PermissionMiddleware{
		permissionService: permissionService,
	}
}

// ClusterAccessRequired 集群访问权限检查
// 检查用户是否有权限访问指定集群
func (m *PermissionMiddleware) ClusterAccessRequired() gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := c.GetUint("user_id")
		if userID == 0 {
			response.Unauthorized(c, "未登录")
			return
		}

		// 获取集群ID
		clusterIDStr := c.Param("clusterID")
		if clusterIDStr == "" {
			clusterIDStr = c.Param("clusterId")
		}
		if clusterIDStr == "" {
			// 没有集群ID参数，跳过检查
			c.Next()
			return
		}

		clusterID, err := strconv.ParseUint(clusterIDStr, 10, 64)
		if err != nil {
			response.BadRequest(c, "无效的集群ID")
			return
		}

		// 检查权限
		permission, err := m.permissionService.GetUserClusterPermission(userID, uint(clusterID))
		if err != nil {
			response.Forbidden(c, "无权限访问该集群")
			return
		}

		// 将权限信息存入上下文
		c.Set("cluster_permission", permission)
		c.Set("cluster_id", uint(clusterID))
		c.Next()
	}
}

// NamespaceAccessRequired 命名空间访问权限检查
// 需要在 ClusterAccessRequired 之后使用
func (m *PermissionMiddleware) NamespaceAccessRequired() gin.HandlerFunc {
	return func(c *gin.Context) {
		// 获取权限信息
		permissionInterface, exists := c.Get("cluster_permission")
		if !exists {
			response.Forbidden(c, "无集群访问权限")
			return
		}

		permission := permissionInterface.(*models.ClusterPermission)

		// 获取命名空间参数
		namespace := c.Param("namespace")
		if namespace == "" {
			namespace = c.Query("namespace")
		}

		// 如果有命名空间参数，检查权限
		if namespace != "" && !services.HasNamespaceAccess(permission, namespace) {
			response.Forbidden(c, "无权限访问该命名空间")
			return
		}

		c.Next()
	}
}

// ActionRequired 操作权限检查
// 检查用户是否有权限执行指定操作
func (m *PermissionMiddleware) ActionRequired(actions ...string) gin.HandlerFunc {
	return func(c *gin.Context) {
		// 获取权限信息
		permissionInterface, exists := c.Get("cluster_permission")
		if !exists {
			response.Forbidden(c, "无集群访问权限")
			return
		}

		permission := permissionInterface.(*models.ClusterPermission)

		// 检查所有要求的操作权限
		for _, action := range actions {
			if !services.CanPerformAction(permission, action) {
				response.Forbidden(c, "权限不足，无法执行此操作")
				return
			}
		}

		c.Next()
	}
}

// AdminRequired 管理员权限检查
// 只有管理员权限才能访问
func (m *PermissionMiddleware) AdminRequired() gin.HandlerFunc {
	return func(c *gin.Context) {
		// 获取权限信息
		permissionInterface, exists := c.Get("cluster_permission")
		if !exists {
			response.Forbidden(c, "无集群访问权限")
			return
		}

		permission := permissionInterface.(*models.ClusterPermission)

		if permission.PermissionType != models.PermissionTypeAdmin {
			response.Forbidden(c, "需要管理员权限")
			return
		}

		c.Next()
	}
}

// WriteRequired 写权限检查
// 只读权限无法通过
func (m *PermissionMiddleware) WriteRequired() gin.HandlerFunc {
	return func(c *gin.Context) {
		// 获取权限信息
		permissionInterface, exists := c.Get("cluster_permission")
		if !exists {
			response.Forbidden(c, "无集群访问权限")
			return
		}

		permission := permissionInterface.(*models.ClusterPermission)

		if permission.PermissionType == models.PermissionTypeReadonly {
			response.Forbidden(c, "只读权限无法执行写操作")
			return
		}

		c.Next()
	}
}

// AutoWriteCheck 自动写权限检查
// 对于 POST/PUT/DELETE/PATCH 请求自动检查写权限
func (m *PermissionMiddleware) AutoWriteCheck() gin.HandlerFunc {
	return func(c *gin.Context) {
		// 只对写操作进行权限检查
		method := c.Request.Method
		if method == "GET" || method == "HEAD" || method == "OPTIONS" {
			c.Next()
			return
		}

		// 获取权限信息
		permissionInterface, exists := c.Get("cluster_permission")
		if !exists {
			// 如果没有权限信息，说明 ClusterAccessRequired 没有运行或失败
			response.Forbidden(c, "无集群访问权限")
			return
		}

		permission := permissionInterface.(*models.ClusterPermission)

		// 只读权限无法执行写操作
		if permission.PermissionType == models.PermissionTypeReadonly {
			response.Forbidden(c, "只读权限无法执行写操作，请联系管理员获取更高权限")
			return
		}

		c.Next()
	}
}

// PlatformAdminRequired 平台管理员权限检查
// 判定逻辑：用户名为 admin，或用户（直接/通过用户组）在任意集群拥有 admin 权限类型
func PlatformAdminRequired(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := c.GetUint("user_id")
		username := c.GetString("username")
		if userID == 0 {
			response.Unauthorized(c, "未登录")
			return
		}

		if username == "admin" {
			c.Next()
			return
		}

		// 检查用户是否直接拥有 admin 权限
		var count int64
		db.Model(&models.ClusterPermission{}).
			Where("user_id = ? AND permission_type = ?", userID, models.PermissionTypeAdmin).
			Count(&count)
		if count > 0 {
			c.Next()
			return
		}

		// 检查用户所在用户组是否拥有 admin 权限
		var groupIDs []uint
		db.Model(&models.UserGroupMember{}).Where("user_id = ?", userID).Pluck("user_group_id", &groupIDs)
		if len(groupIDs) > 0 {
			db.Model(&models.ClusterPermission{}).
				Where("user_group_id IN ? AND permission_type = ?", groupIDs, models.PermissionTypeAdmin).
				Count(&count)
			if count > 0 {
				c.Next()
				return
			}
		}

		response.Forbidden(c, "需要平台管理员权限")
	}
}

// GetClusterPermission 从上下文获取集群权限
func GetClusterPermission(c *gin.Context) *models.ClusterPermission {
	permissionInterface, exists := c.Get("cluster_permission")
	if !exists {
		return nil
	}
	permission, ok := permissionInterface.(*models.ClusterPermission)
	if !ok {
		return nil
	}
	return permission
}

// GetCurrentUserID 从上下文获取当前用户ID
func GetCurrentUserID(c *gin.Context) uint {
	return c.GetUint("user_id")
}

// GetAllowedNamespaces 获取用户允许访问的命名空间列表
// 返回: 命名空间列表, 是否有全部命名空间权限
func GetAllowedNamespaces(c *gin.Context) ([]string, bool) {
	permission := GetClusterPermission(c)
	if permission == nil {
		return []string{}, false
	}

	namespaces := permission.GetNamespaceList()
	for _, ns := range namespaces {
		if ns == "*" {
			return namespaces, true
		}
	}
	return namespaces, false
}

// HasNamespaceAccess 检查是否有访问指定命名空间的权限
func HasNamespaceAccess(c *gin.Context, namespace string) bool {
	permission := GetClusterPermission(c)
	if permission == nil {
		return false
	}
	return services.HasNamespaceAccess(permission, namespace)
}

// FilterNamespaces 过滤命名空间列表，只返回用户有权限访问的
func FilterNamespaces(c *gin.Context, namespaces []string) []string {
	permission := GetClusterPermission(c)
	if permission == nil {
		return []string{}
	}

	if services.HasAllNamespaceAccess(permission) {
		return namespaces
	}

	filtered := make([]string, 0)
	for _, ns := range namespaces {
		if services.HasNamespaceAccess(permission, ns) {
			filtered = append(filtered, ns)
		}
	}
	return filtered
}

// GetEffectiveNamespace 获取有效的命名空间查询参数
// 如果用户请求的命名空间不在权限范围内，返回空字符串和false
// 如果用户有全部权限，返回原始请求的命名空间
// 如果用户没有指定命名空间但只有部分权限，返回权限范围内的第一个命名空间
func GetEffectiveNamespace(c *gin.Context, requestedNs string) (string, bool) {
	permission := GetClusterPermission(c)
	if permission == nil {
		return "", false
	}

	// 如果有全部权限
	if services.HasAllNamespaceAccess(permission) {
		return requestedNs, true
	}

	allowedNs := permission.GetNamespaceList()

	if requestedNs != "" {
		if services.HasNamespaceAccess(permission, requestedNs) {
			return requestedNs, true
		}
		return "", false // 无权访问请求的命名空间
	}

	// 用户没有指定命名空间，返回空字符串让后续逻辑处理
	// 后续逻辑会遍历用户有权限的所有命名空间
	if len(allowedNs) > 0 {
		return "", true // 表示需要遍历多个命名空间
	}

	return "", false
}

// NamespacePermissionInfo 命名空间权限信息
type NamespacePermissionInfo struct {
	HasAllAccess      bool     // 是否有全部命名空间权限
	AllowedNamespaces []string // 允许的命名空间列表
	RequestedNs       string   // 请求的命名空间
	HasAccess         bool     // 是否有权限访问
}

// CheckNamespacePermission 检查命名空间权限
// 返回权限信息和是否应该继续处理
func CheckNamespacePermission(c *gin.Context, requestedNs string) (*NamespacePermissionInfo, bool) {
	info := &NamespacePermissionInfo{
		RequestedNs: requestedNs,
	}

	allowedNs, hasAll := GetAllowedNamespaces(c)
	info.HasAllAccess = hasAll
	info.AllowedNamespaces = allowedNs

	// 如果用户指定了命名空间，检查权限
	if requestedNs != "" {
		if hasAll || HasNamespaceAccess(c, requestedNs) {
			info.HasAccess = true
			return info, true
		}
		info.HasAccess = false
		return info, false // 无权访问
	}

	// 没有指定命名空间
	info.HasAccess = true
	return info, true
}

// FilterResourcesByNamespace 通用的命名空间过滤函数
// 用于过滤任何包含 Namespace 字段的资源列表
// getNamespace: 从资源对象中获取命名空间的函数
func FilterResourcesByNamespace[T any](c *gin.Context, resources []T, getNamespace func(T) string) []T {
	allowedNs, hasAll := GetAllowedNamespaces(c)

	// 如果有全部权限，直接返回
	if hasAll {
		return resources
	}

	// 过滤资源
	filtered := make([]T, 0, len(resources))
	for _, r := range resources {
		ns := getNamespace(r)
		if matchNamespace(ns, allowedNs) {
			filtered = append(filtered, r)
		}
	}
	return filtered
}

// matchNamespace 检查命名空间是否匹配权限列表
func matchNamespace(namespace string, allowedNamespaces []string) bool {
	for _, ns := range allowedNamespaces {
		if ns == "*" || ns == namespace {
			return true
		}
		// 通配符匹配
		if len(ns) > 1 && ns[len(ns)-1] == '*' {
			prefix := ns[:len(ns)-1]
			if len(namespace) >= len(prefix) && namespace[:len(prefix)] == prefix {
				return true
			}
		}
	}
	return false
}
