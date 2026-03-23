package models

import (
	"encoding/json"
	"time"

	"gorm.io/gorm"
)

// PermissionType 权限类型常量
const (
	PermissionTypeAdmin    = "admin"    // 管理员权限：全部命名空间所有资源的读写权限
	PermissionTypeOps      = "ops"      // 运维权限：大多数资源读写，节点/存储/配额只读
	PermissionTypeDev      = "dev"      // 开发权限：指定命名空间内资源读写
	PermissionTypeReadonly = "readonly" // 只读权限：资源只读
	PermissionTypeCustom   = "custom"   // 自定义权限：用户选择 ClusterRole/Role
)

// UserGroup 用户组模型
type UserGroup struct {
	ID          uint           `json:"id" gorm:"primaryKey"`
	Name        string         `json:"name" gorm:"uniqueIndex;not null;size:50"`
	Description string         `json:"description" gorm:"size:255"`
	CreatedAt   time.Time      `json:"created_at"`
	UpdatedAt   time.Time      `json:"updated_at"`
	DeletedAt   gorm.DeletedAt `json:"-" gorm:"index"`

	// 关联关系
	Users []User `json:"users,omitempty" gorm:"many2many:user_group_members;"`
}

// UserGroupMember 用户组成员关联表
type UserGroupMember struct {
	UserID      uint `json:"user_id" gorm:"primaryKey"`
	UserGroupID uint `json:"user_group_id" gorm:"primaryKey"`
}

// TableName 指定用户组成员关联表名
func (UserGroupMember) TableName() string {
	return "user_group_members"
}

// ClusterPermission 集群级别权限配置
type ClusterPermission struct {
	ID             uint           `json:"id" gorm:"primaryKey"`
	ClusterID      uint           `json:"cluster_id" gorm:"index;not null"`        // 关联集群
	UserID         *uint          `json:"user_id" gorm:"index"`                    // 用户ID（与用户组二选一）
	UserGroupID    *uint          `json:"user_group_id" gorm:"index"`              // 用户组ID
	PermissionType string         `json:"permission_type" gorm:"not null;size:50"` // admin, ops, dev, readonly, custom
	Namespaces     string         `json:"namespaces" gorm:"type:text"`             // 命名空间范围，JSON格式，["*"] 表示全部
	CustomRoleRef  string         `json:"custom_role_ref" gorm:"size:200"`         // 自定义权限时引用的 ClusterRole/Role 名称
	CreatedAt      time.Time      `json:"created_at"`
	UpdatedAt      time.Time      `json:"updated_at"`
	DeletedAt      gorm.DeletedAt `json:"-" gorm:"index"`

	// 关联（预加载用）
	Cluster   *Cluster   `json:"cluster,omitempty" gorm:"foreignKey:ClusterID"`
	User      *User      `json:"user,omitempty" gorm:"foreignKey:UserID"`
	UserGroup *UserGroup `json:"user_group,omitempty" gorm:"foreignKey:UserGroupID"`
}

// GetNamespaceList 获取命名空间列表
func (cp *ClusterPermission) GetNamespaceList() []string {
	if cp.Namespaces == "" {
		return []string{"*"}
	}
	var namespaces []string
	if err := json.Unmarshal([]byte(cp.Namespaces), &namespaces); err != nil {
		return []string{}
	}
	return namespaces
}

// SetNamespaceList 设置命名空间列表
func (cp *ClusterPermission) SetNamespaceList(namespaces []string) error {
	data, err := json.Marshal(namespaces)
	if err != nil {
		return err
	}
	cp.Namespaces = string(data)
	return nil
}

// PermissionTypeInfo 权限类型信息
type PermissionTypeInfo struct {
	Type                   string   `json:"type"`
	Name                   string   `json:"name"`
	Description            string   `json:"description"`
	Resources              []string `json:"resources"`
	Actions                []string `json:"actions"`
	AllowPartialNamespaces bool     `json:"allowPartialNamespaces"` // 是否允许选择部分命名空间
	RequireAllNamespaces   bool     `json:"requireAllNamespaces"`   // 是否必须选择全部命名空间
	ClusterRoleName        string   `json:"clusterRoleName"`        // 对应的 ClusterRole 名称
	ServiceAccountName     string   `json:"serviceAccountName"`     // 对应的 ServiceAccount 名称
}

// ClusterRole 和 ServiceAccount 常量
const (
	// ClusterRole 名称
	ClusterRoleClusterAdmin = "kubepolaris-cluster-admin"
	ClusterRoleOps          = "kubepolaris-ops"
	ClusterRoleDev          = "kubepolaris-dev"
	ClusterRoleReadonly     = "kubepolaris-readonly"

	// ServiceAccount 名称
	SAClusterAdmin = "kubepolaris-admin-sa"
	SAOps          = "kubepolaris-ops-sa"
	SADev          = "kubepolaris-dev-sa"
	SAReadonly     = "kubepolaris-readonly-sa"

	// Namespace
	KubePolarisNamespace = "kubepolaris-system"
)

// GetPermissionTypes 获取所有权限类型信息
func GetPermissionTypes() []PermissionTypeInfo {
	return []PermissionTypeInfo{
		{
			Type:                   PermissionTypeAdmin,
			Name:                   "管理员权限",
			Description:            "对全部命名空间下所有资源的读写权限（必须选择全部命名空间）",
			Resources:              []string{"*"},
			Actions:                []string{"*"},
			AllowPartialNamespaces: false,
			RequireAllNamespaces:   true,
			ClusterRoleName:        ClusterRoleClusterAdmin,
			ServiceAccountName:     SAClusterAdmin,
		},
		{
			Type:                   PermissionTypeOps,
			Name:                   "运维权限",
			Description:            "对全部命名空间下大多数资源的读写权限，对节点、存储卷、命名空间和配额管理的只读权限（必须选择全部命名空间）",
			Resources:              []string{"pods", "deployments", "statefulsets", "daemonsets", "services", "ingresses", "configmaps", "secrets"},
			Actions:                []string{"get", "list", "watch", "create", "update", "delete"},
			AllowPartialNamespaces: false,
			RequireAllNamespaces:   true,
			ClusterRoleName:        ClusterRoleOps,
			ServiceAccountName:     SAOps,
		},
		{
			Type:                   PermissionTypeDev,
			Name:                   "开发权限",
			Description:            "对全部或所选命名空间下大多数资源的读写权限",
			Resources:              []string{"pods", "deployments", "statefulsets", "daemonsets", "services", "ingresses", "configmaps", "secrets"},
			Actions:                []string{"get", "list", "watch", "create", "update", "delete"},
			AllowPartialNamespaces: true,
			RequireAllNamespaces:   false,
			ClusterRoleName:        ClusterRoleDev,
			ServiceAccountName:     SADev,
		},
		{
			Type:                   PermissionTypeReadonly,
			Name:                   "只读权限",
			Description:            "对全部或所选命名空间下大多数资源的只读权限",
			Resources:              []string{"*"},
			Actions:                []string{"get", "list", "watch"},
			AllowPartialNamespaces: true,
			RequireAllNamespaces:   false,
			ClusterRoleName:        ClusterRoleReadonly,
			ServiceAccountName:     SAReadonly,
		},
		{
			Type:                   PermissionTypeCustom,
			Name:                   "自定义权限",
			Description:            "权限由您所选择的ClusterRole或Role决定",
			Resources:              []string{},
			Actions:                []string{},
			AllowPartialNamespaces: true,
			RequireAllNamespaces:   false,
			ClusterRoleName:        "", // 自定义权限由用户指定
			ServiceAccountName:     "",
		},
	}
}

// GetClusterRoleByPermissionType 根据权限类型获取 ClusterRole 名称
func GetClusterRoleByPermissionType(permissionType string) string {
	switch permissionType {
	case PermissionTypeAdmin:
		return ClusterRoleClusterAdmin
	case PermissionTypeOps:
		return ClusterRoleOps
	case PermissionTypeDev:
		return ClusterRoleDev
	case PermissionTypeReadonly:
		return ClusterRoleReadonly
	default:
		return ""
	}
}

// GetServiceAccountByPermissionType 根据权限类型获取 ServiceAccount 名称
func GetServiceAccountByPermissionType(permissionType string) string {
	switch permissionType {
	case PermissionTypeAdmin:
		return SAClusterAdmin
	case PermissionTypeOps:
		return SAOps
	case PermissionTypeDev:
		return SADev
	case PermissionTypeReadonly:
		return SAReadonly
	default:
		return ""
	}
}

// ClusterPermissionResponse 集群权限响应结构
type ClusterPermissionResponse struct {
	ID             uint      `json:"id"`
	ClusterID      uint      `json:"cluster_id"`
	ClusterName    string    `json:"cluster_name,omitempty"`
	UserID         *uint     `json:"user_id,omitempty"`
	Username       string    `json:"username,omitempty"`
	UserGroupID    *uint     `json:"user_group_id,omitempty"`
	UserGroupName  string    `json:"user_group_name,omitempty"`
	PermissionType string    `json:"permission_type"`
	PermissionName string    `json:"permission_name"`
	Namespaces     []string  `json:"namespaces"`
	CustomRoleRef  string    `json:"custom_role_ref,omitempty"`
	CreatedAt      time.Time `json:"created_at"`
	UpdatedAt      time.Time `json:"updated_at"`
}

// ToResponse 转换为响应结构
func (cp *ClusterPermission) ToResponse() ClusterPermissionResponse {
	resp := ClusterPermissionResponse{
		ID:             cp.ID,
		ClusterID:      cp.ClusterID,
		UserID:         cp.UserID,
		UserGroupID:    cp.UserGroupID,
		PermissionType: cp.PermissionType,
		Namespaces:     cp.GetNamespaceList(),
		CustomRoleRef:  cp.CustomRoleRef,
		CreatedAt:      cp.CreatedAt,
		UpdatedAt:      cp.UpdatedAt,
	}

	// 获取权限类型名称
	for _, pt := range GetPermissionTypes() {
		if pt.Type == cp.PermissionType {
			resp.PermissionName = pt.Name
			break
		}
	}

	// 填充关联信息
	if cp.Cluster != nil {
		resp.ClusterName = cp.Cluster.Name
	}
	if cp.User != nil {
		resp.Username = cp.User.Username
	}
	if cp.UserGroup != nil {
		resp.UserGroupName = cp.UserGroup.Name
	}

	return resp
}

// MyPermissionsResponse 用户权限响应
type MyPermissionsResponse struct {
	ClusterID      uint     `json:"cluster_id"`
	ClusterName    string   `json:"cluster_name"`
	PermissionType string   `json:"permission_type"`
	PermissionName string   `json:"permission_name"`
	Namespaces     []string `json:"namespaces"`
	AllowedActions []string `json:"allowed_actions"`
	CustomRoleRef  string   `json:"custom_role_ref,omitempty"`
}
