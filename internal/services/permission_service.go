package services

import (
	"encoding/json"
	"errors"
	"fmt"

	"github.com/clay-wangzhi/KubePolaris/internal/models"
	"github.com/clay-wangzhi/KubePolaris/pkg/logger"

	"gorm.io/gorm"
)

// PermissionService 权限服务
type PermissionService struct {
	db *gorm.DB
}

// NewPermissionService 创建权限服务
func NewPermissionService(db *gorm.DB) *PermissionService {
	return &PermissionService{db: db}
}

// ========== 用户组管理 ==========

// CreateUserGroup 创建用户组
func (s *PermissionService) CreateUserGroup(name, description string) (*models.UserGroup, error) {
	group := &models.UserGroup{
		Name:        name,
		Description: description,
	}
	if err := s.db.Create(group).Error; err != nil {
		return nil, fmt.Errorf("创建用户组失败: %w", err)
	}
	return group, nil
}

// UpdateUserGroup 更新用户组
func (s *PermissionService) UpdateUserGroup(id uint, name, description string) (*models.UserGroup, error) {
	var group models.UserGroup
	if err := s.db.First(&group, id).Error; err != nil {
		return nil, fmt.Errorf("用户组不存在")
	}

	group.Name = name
	group.Description = description
	if err := s.db.Save(&group).Error; err != nil {
		return nil, fmt.Errorf("更新用户组失败: %w", err)
	}
	return &group, nil
}

// DeleteUserGroup 删除用户组
func (s *PermissionService) DeleteUserGroup(id uint) error {
	// 检查是否有关联的权限配置
	var count int64
	s.db.Model(&models.ClusterPermission{}).Where("user_group_id = ?", id).Count(&count)
	if count > 0 {
		return fmt.Errorf("该用户组还有关联的权限配置，请先删除相关权限")
	}

	// 删除用户组成员关联
	s.db.Where("user_group_id = ?", id).Delete(&models.UserGroupMember{})

	// 删除用户组
	if err := s.db.Delete(&models.UserGroup{}, id).Error; err != nil {
		return fmt.Errorf("删除用户组失败: %w", err)
	}
	return nil
}

// GetUserGroup 获取用户组详情
func (s *PermissionService) GetUserGroup(id uint) (*models.UserGroup, error) {
	var group models.UserGroup
	if err := s.db.Preload("Users").First(&group, id).Error; err != nil {
		return nil, fmt.Errorf("用户组不存在")
	}
	return &group, nil
}

// ListUserGroups 获取用户组列表
func (s *PermissionService) ListUserGroups() ([]models.UserGroup, error) {
	var groups []models.UserGroup
	if err := s.db.Preload("Users").Find(&groups).Error; err != nil {
		return nil, fmt.Errorf("获取用户组列表失败: %w", err)
	}
	return groups, nil
}

// AddUserToGroup 添加用户到用户组
func (s *PermissionService) AddUserToGroup(userID, groupID uint) error {
	// 检查用户是否存在
	var user models.User
	if err := s.db.First(&user, userID).Error; err != nil {
		return fmt.Errorf("用户不存在")
	}

	// 检查用户组是否存在
	var group models.UserGroup
	if err := s.db.First(&group, groupID).Error; err != nil {
		return fmt.Errorf("用户组不存在")
	}

	// 检查是否已在组中
	var count int64
	s.db.Model(&models.UserGroupMember{}).Where("user_id = ? AND user_group_id = ?", userID, groupID).Count(&count)
	if count > 0 {
		return nil // 已存在，跳过
	}

	// 添加关联
	member := &models.UserGroupMember{
		UserID:      userID,
		UserGroupID: groupID,
	}
	return s.db.Create(member).Error
}

// RemoveUserFromGroup 从用户组移除用户
func (s *PermissionService) RemoveUserFromGroup(userID, groupID uint) error {
	return s.db.Where("user_id = ? AND user_group_id = ?", userID, groupID).Delete(&models.UserGroupMember{}).Error
}

// ========== 集群权限管理 ==========

// CreateClusterPermission 创建集群权限
func (s *PermissionService) CreateClusterPermission(req *CreateClusterPermissionRequest) (*models.ClusterPermission, error) {
	// 验证参数
	if req.ClusterID == 0 {
		return nil, errors.New("集群ID不能为空")
	}
	if req.UserID == nil && req.UserGroupID == nil {
		return nil, errors.New("必须指定用户或用户组")
	}
	if req.UserID != nil && req.UserGroupID != nil {
		return nil, errors.New("不能同时指定用户和用户组")
	}

	// 验证权限类型
	validTypes := map[string]bool{
		models.PermissionTypeAdmin:    true,
		models.PermissionTypeOps:      true,
		models.PermissionTypeDev:      true,
		models.PermissionTypeReadonly: true,
		models.PermissionTypeCustom:   true,
	}
	if !validTypes[req.PermissionType] {
		return nil, errors.New("无效的权限类型")
	}

	// 自定义权限必须指定角色
	if req.PermissionType == models.PermissionTypeCustom && req.CustomRoleRef == "" {
		return nil, errors.New("自定义权限必须指定ClusterRole或Role")
	}

	// 检查是否已存在相同的权限配置
	query := s.db.Model(&models.ClusterPermission{}).Where("cluster_id = ?", req.ClusterID)
	if req.UserID != nil {
		query = query.Where("user_id = ?", *req.UserID)
	} else {
		query = query.Where("user_group_id = ?", *req.UserGroupID)
	}
	var count int64
	query.Count(&count)
	if count > 0 {
		return nil, errors.New("该用户/用户组在此集群已有权限配置")
	}

	// 处理命名空间
	namespaces := req.Namespaces
	if len(namespaces) == 0 {
		namespaces = []string{"*"}
	}
	namespacesJSON, _ := json.Marshal(namespaces)

	permission := &models.ClusterPermission{
		ClusterID:      req.ClusterID,
		UserID:         req.UserID,
		UserGroupID:    req.UserGroupID,
		PermissionType: req.PermissionType,
		Namespaces:     string(namespacesJSON),
		CustomRoleRef:  req.CustomRoleRef,
	}

	if err := s.db.Create(permission).Error; err != nil {
		return nil, fmt.Errorf("创建权限配置失败: %w", err)
	}

	// 预加载关联数据
	s.db.Preload("User").Preload("UserGroup").Preload("Cluster").First(permission, permission.ID)

	logger.Info("创建集群权限: clusterID=%d, userID=%v, userGroupID=%v, type=%s",
		req.ClusterID, req.UserID, req.UserGroupID, req.PermissionType)

	return permission, nil
}

// CreateClusterPermissionRequest 创建集群权限请求
type CreateClusterPermissionRequest struct {
	ClusterID      uint     `json:"cluster_id" binding:"required"`
	UserID         *uint    `json:"user_id"`
	UserGroupID    *uint    `json:"user_group_id"`
	PermissionType string   `json:"permission_type" binding:"required"`
	Namespaces     []string `json:"namespaces"`
	CustomRoleRef  string   `json:"custom_role_ref"`
}

// UpdateClusterPermission 更新集群权限
func (s *PermissionService) UpdateClusterPermission(id uint, req *UpdateClusterPermissionRequest) (*models.ClusterPermission, error) {
	var permission models.ClusterPermission
	if err := s.db.First(&permission, id).Error; err != nil {
		return nil, errors.New("权限配置不存在")
	}

	// 验证权限类型
	if req.PermissionType != "" {
		validTypes := map[string]bool{
			models.PermissionTypeAdmin:    true,
			models.PermissionTypeOps:      true,
			models.PermissionTypeDev:      true,
			models.PermissionTypeReadonly: true,
			models.PermissionTypeCustom:   true,
		}
		if !validTypes[req.PermissionType] {
			return nil, errors.New("无效的权限类型")
		}
		permission.PermissionType = req.PermissionType
	}

	// 自定义权限必须指定角色
	if permission.PermissionType == models.PermissionTypeCustom {
		if req.CustomRoleRef != "" {
			permission.CustomRoleRef = req.CustomRoleRef
		} else if permission.CustomRoleRef == "" {
			return nil, errors.New("自定义权限必须指定ClusterRole或Role")
		}
	}

	// 更新命名空间
	if len(req.Namespaces) > 0 {
		namespacesJSON, _ := json.Marshal(req.Namespaces)
		permission.Namespaces = string(namespacesJSON)
	}

	if err := s.db.Save(&permission).Error; err != nil {
		return nil, fmt.Errorf("更新权限配置失败: %w", err)
	}

	// 预加载关联数据
	s.db.Preload("User").Preload("UserGroup").Preload("Cluster").First(&permission, permission.ID)

	return &permission, nil
}

// UpdateClusterPermissionRequest 更新集群权限请求
type UpdateClusterPermissionRequest struct {
	PermissionType string   `json:"permission_type"`
	Namespaces     []string `json:"namespaces"`
	CustomRoleRef  string   `json:"custom_role_ref"`
}

// DeleteClusterPermission 删除集群权限
func (s *PermissionService) DeleteClusterPermission(id uint) error {
	result := s.db.Delete(&models.ClusterPermission{}, id)
	if result.Error != nil {
		return fmt.Errorf("删除权限配置失败: %w", result.Error)
	}
	if result.RowsAffected == 0 {
		return errors.New("权限配置不存在")
	}
	return nil
}

// GetClusterPermission 获取集群权限详情
func (s *PermissionService) GetClusterPermission(id uint) (*models.ClusterPermission, error) {
	var permission models.ClusterPermission
	if err := s.db.Preload("User").Preload("UserGroup").Preload("Cluster").First(&permission, id).Error; err != nil {
		return nil, errors.New("权限配置不存在")
	}
	return &permission, nil
}

// ListClusterPermissions 获取集群的权限列表
func (s *PermissionService) ListClusterPermissions(clusterID uint) ([]models.ClusterPermission, error) {
	var permissions []models.ClusterPermission
	query := s.db.Preload("User").Preload("UserGroup")
	if clusterID > 0 {
		query = query.Where("cluster_id = ?", clusterID)
	}
	if err := query.Find(&permissions).Error; err != nil {
		return nil, fmt.Errorf("获取权限列表失败: %w", err)
	}
	return permissions, nil
}

// ListAllClusterPermissions 获取所有集群的权限列表
func (s *PermissionService) ListAllClusterPermissions() ([]models.ClusterPermission, error) {
	var permissions []models.ClusterPermission
	if err := s.db.Preload("User").Preload("UserGroup").Preload("Cluster").Find(&permissions).Error; err != nil {
		return nil, fmt.Errorf("获取权限列表失败: %w", err)
	}
	return permissions, nil
}

// ========== 权限查询 ==========

// GetUserClusterPermission 获取用户在指定集群的权限
// 权限优先级：用户直接权限 > 用户组权限 > 默认权限
func (s *PermissionService) GetUserClusterPermission(userID, clusterID uint) (*models.ClusterPermission, error) {
	// 1. 先查找用户直接权限
	var directPermission models.ClusterPermission
	err := s.db.Where("cluster_id = ? AND user_id = ?", clusterID, userID).First(&directPermission).Error
	if err == nil {
		return &directPermission, nil
	}

	// 2. 查找用户组权限
	var userGroups []models.UserGroupMember
	s.db.Where("user_id = ?", userID).Find(&userGroups)

	if len(userGroups) > 0 {
		groupIDs := make([]uint, len(userGroups))
		for i, ug := range userGroups {
			groupIDs[i] = ug.UserGroupID
		}

		var groupPermission models.ClusterPermission
		err = s.db.Where("cluster_id = ? AND user_group_id IN ?", clusterID, groupIDs).
			Order("FIELD(permission_type, 'admin', 'ops', 'dev', 'readonly', 'custom')"). // 优先返回权限最大的
			First(&groupPermission).Error
		if err == nil {
			return &groupPermission, nil
		}
	}

	// 3. 返回默认权限
	return s.getDefaultPermission(userID, clusterID)
}

// getDefaultPermission 获取用户的默认权限
// admin 用户默认为管理员权限，其他用户默认为只读权限
func (s *PermissionService) getDefaultPermission(userID, clusterID uint) (*models.ClusterPermission, error) {
	// 查询用户信息
	var user models.User
	if err := s.db.First(&user, userID).Error; err != nil {
		return nil, errors.New("用户不存在")
	}

	// 确定默认权限类型
	permissionType := models.PermissionTypeReadonly // 默认只读
	if user.Username == "admin" {
		permissionType = models.PermissionTypeAdmin // admin 用户默认管理员权限
	}

	// 返回虚拟权限对象（不存储到数据库，仅用于权限检查）
	defaultPermission := &models.ClusterPermission{
		ClusterID:      clusterID,
		UserID:         &userID,
		PermissionType: permissionType,
		Namespaces:     `["*"]`, // 默认全部命名空间
	}

	logger.Info("使用默认权限: userID=%d, clusterID=%d, type=%s", userID, clusterID, permissionType)

	return defaultPermission, nil
}

// GetUserAllClusterPermissions 获取用户在所有集群的权限（包括默认权限）
func (s *PermissionService) GetUserAllClusterPermissions(userID uint) ([]models.ClusterPermission, error) {
	var permissions []models.ClusterPermission

	// 获取用户所在的用户组
	var userGroups []models.UserGroupMember
	s.db.Where("user_id = ?", userID).Find(&userGroups)

	groupIDs := make([]uint, len(userGroups))
	for i, ug := range userGroups {
		groupIDs[i] = ug.UserGroupID
	}

	// 查询用户直接权限和用户组权限
	query := s.db.Preload("Cluster").Where("user_id = ?", userID)
	if len(groupIDs) > 0 {
		query = s.db.Preload("Cluster").Where("user_id = ? OR user_group_id IN ?", userID, groupIDs)
	}

	if err := query.Find(&permissions).Error; err != nil {
		return nil, fmt.Errorf("获取用户权限失败: %w", err)
	}

	// 获取已配置权限的集群ID
	configuredClusterIDs := make(map[uint]bool)
	for _, p := range permissions {
		configuredClusterIDs[p.ClusterID] = true
	}

	// 获取所有集群，为未配置权限的集群添加默认权限
	var allClusters []models.Cluster
	if err := s.db.Find(&allClusters).Error; err != nil {
		return nil, fmt.Errorf("获取集群列表失败: %w", err)
	}

	// 查询用户信息（用于确定默认权限类型）
	var user models.User
	if err := s.db.First(&user, userID).Error; err != nil {
		return nil, fmt.Errorf("用户不存在: %w", err)
	}

	// 确定默认权限类型
	defaultPermissionType := models.PermissionTypeReadonly
	if user.Username == "admin" {
		defaultPermissionType = models.PermissionTypeAdmin
	}

	// 为未配置权限的集群添加默认权限
	for _, cluster := range allClusters {
		if !configuredClusterIDs[cluster.ID] {
			defaultPerm := models.ClusterPermission{
				ClusterID:      cluster.ID,
				UserID:         &userID,
				PermissionType: defaultPermissionType,
				Namespaces:     `["*"]`,
				Cluster:        &cluster,
			}
			permissions = append(permissions, defaultPerm)
		}
	}

	return permissions, nil
}

// HasClusterAccess 检查用户是否有集群访问权限
func (s *PermissionService) HasClusterAccess(userID, clusterID uint) bool {
	_, err := s.GetUserClusterPermission(userID, clusterID)
	return err == nil
}

// CanPerformUserAction 检查用户是否可以执行指定操作
func (s *PermissionService) CanPerformUserAction(userID, clusterID uint, action string, namespace string) bool {
	permission, err := s.GetUserClusterPermission(userID, clusterID)
	if err != nil {
		return false
	}

	if namespace != "" && !HasNamespaceAccess(permission, namespace) {
		return false
	}

	return CanPerformAction(permission, action)
}

// HasNamespaceAccess 检查权限是否包含指定命名空间的访问
func HasNamespaceAccess(cp *models.ClusterPermission, namespace string) bool {
	namespaces := cp.GetNamespaceList()
	for _, ns := range namespaces {
		if ns == "*" || ns == namespace {
			return true
		}
		if len(ns) > 1 && ns[len(ns)-1] == '*' {
			prefix := ns[:len(ns)-1]
			if len(namespace) >= len(prefix) && namespace[:len(prefix)] == prefix {
				return true
			}
		}
	}
	return false
}

// HasAllNamespaceAccess 检查是否有全部命名空间的访问权限
func HasAllNamespaceAccess(cp *models.ClusterPermission) bool {
	namespaces := cp.GetNamespaceList()
	for _, ns := range namespaces {
		if ns == "*" {
			return true
		}
	}
	return false
}

// CanPerformAction 检查权限类型是否允许执行指定操作
func CanPerformAction(cp *models.ClusterPermission, action string) bool {
	switch cp.PermissionType {
	case models.PermissionTypeAdmin:
		return true
	case models.PermissionTypeOps:
		restrictedActions := map[string]bool{
			"node:cordon": true, "node:uncordon": true, "node:drain": true,
			"pv:create": true, "pv:delete": true,
			"storageclass:create": true, "storageclass:delete": true,
			"quota:create": true, "quota:update": true, "quota:delete": true,
		}
		return !restrictedActions[action]
	case models.PermissionTypeDev:
		allowedPrefixes := []string{
			"pod:", "deployment:", "statefulset:", "daemonset:",
			"job:", "cronjob:", "service:", "ingress:",
			"configmap:", "secret:", "rollout:",
		}
		for _, prefix := range allowedPrefixes {
			if len(action) >= len(prefix) && action[:len(prefix)] == prefix {
				return true
			}
		}
		return false
	case models.PermissionTypeReadonly:
		return action == "view" || action == "list" || action == "get"
	case models.PermissionTypeCustom:
		return true
	default:
		return false
	}
}

// ========== 用户查询 ==========

// ListUsers 获取用户列表
func (s *PermissionService) ListUsers() ([]models.User, error) {
	var users []models.User
	if err := s.db.Find(&users).Error; err != nil {
		return nil, fmt.Errorf("获取用户列表失败: %w", err)
	}
	return users, nil
}

// GetUser 获取用户详情
func (s *PermissionService) GetUser(id uint) (*models.User, error) {
	var user models.User
	if err := s.db.Preload("Roles").First(&user, id).Error; err != nil {
		return nil, errors.New("用户不存在")
	}
	return &user, nil
}

// GetUserAccessibleClusterIDs 获取用户可访问的集群 ID 列表
// 返回值: clusterIDs, isAllAccess（平台管理员）, error
func (s *PermissionService) GetUserAccessibleClusterIDs(userID uint) ([]uint, bool, error) {
	var user models.User
	if err := s.db.First(&user, userID).Error; err != nil {
		return nil, false, errors.New("用户不存在")
	}

	// admin 用户拥有全部集群权限
	if user.Username == "admin" {
		return nil, true, nil
	}

	// 检查用户是否直接拥有 admin 权限（即为平台管理员）
	var adminCount int64
	s.db.Model(&models.ClusterPermission{}).
		Where("user_id = ? AND permission_type = ?", userID, models.PermissionTypeAdmin).
		Count(&adminCount)
	if adminCount > 0 {
		return nil, true, nil
	}

	// 获取用户所在的用户组
	var groupIDs []uint
	s.db.Model(&models.UserGroupMember{}).Where("user_id = ?", userID).Pluck("user_group_id", &groupIDs)

	// 检查用户组是否有 admin 权限
	if len(groupIDs) > 0 {
		s.db.Model(&models.ClusterPermission{}).
			Where("user_group_id IN ? AND permission_type = ?", groupIDs, models.PermissionTypeAdmin).
			Count(&adminCount)
		if adminCount > 0 {
			return nil, true, nil
		}
	}

	// 收集用户有明确权限的集群 ID（直接权限 + 用户组权限）
	var clusterIDs []uint
	query := s.db.Model(&models.ClusterPermission{}).Where("user_id = ?", userID)
	if len(groupIDs) > 0 {
		query = s.db.Model(&models.ClusterPermission{}).Where("user_id = ? OR user_group_id IN ?", userID, groupIDs)
	}
	query.Distinct().Pluck("cluster_id", &clusterIDs)

	// 没有任何明确权限记录的用户，拥有所有集群的默认只读权限
	// 与 GetUserAllClusterPermissions / GetUserClusterPermission 保持一致
	if len(clusterIDs) == 0 {
		return nil, true, nil
	}

	return clusterIDs, false, nil
}

// BatchDeleteClusterPermissions 批量删除集群权限
func (s *PermissionService) BatchDeleteClusterPermissions(ids []uint) error {
	if len(ids) == 0 {
		return nil
	}
	result := s.db.Delete(&models.ClusterPermission{}, ids)
	if result.Error != nil {
		return fmt.Errorf("批量删除权限配置失败: %w", result.Error)
	}
	return nil
}
