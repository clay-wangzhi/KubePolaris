package database

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"time"

	"github.com/clay-wangzhi/KubePolaris/internal/config"
	"github.com/clay-wangzhi/KubePolaris/internal/models"
	"github.com/clay-wangzhi/KubePolaris/pkg/logger"

	"github.com/glebarez/sqlite"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/driver/mysql"
	"gorm.io/gorm"
	gormLogger "gorm.io/gorm/logger"
)

// currentDriver 保存当前使用的数据库驱动类型
var currentDriver string

// GetCurrentDriver 返回当前使用的数据库驱动类型
func GetCurrentDriver() string {
	return currentDriver
}

// Init 初始化数据库连接
// 支持 MySQL 和 SQLite 两种数据库驱动
func Init(cfg config.DatabaseConfig) (*gorm.DB, error) {
	// 配置 GORM 日志
	gormConfig := &gorm.Config{
		Logger: gormLogger.Default.LogMode(gormLogger.Info),
	}

	var db *gorm.DB
	var err error

	// 根据配置的驱动类型选择数据库
	driver := cfg.Driver
	if driver == "" {
		driver = "sqlite" // 默认使用 SQLite
	}
	currentDriver = driver

	switch driver {
	case "sqlite":
		db, err = initSQLite(cfg, gormConfig)
	case "mysql":
		db, err = initMySQL(cfg, gormConfig)
	default:
		return nil, fmt.Errorf("不支持的数据库驱动: %s，请使用 'sqlite' 或 'mysql'", driver)
	}

	if err != nil {
		return nil, err
	}

	// 获取底层的 sql.DB 对象来配置连接池
	sqlDB, err := db.DB()
	if err != nil {
		return nil, fmt.Errorf("获取数据库连接失败: %w", err)
	}

	// 设置连接池参数
	if driver == "mysql" {
		sqlDB.SetMaxIdleConns(10)
		sqlDB.SetMaxOpenConns(100)
		sqlDB.SetConnMaxLifetime(time.Hour)
	} else {
		// SQLite 使用单连接模式以避免锁冲突
		sqlDB.SetMaxIdleConns(1)
		sqlDB.SetMaxOpenConns(1)
		sqlDB.SetConnMaxLifetime(time.Hour)
	}

	// 自动迁移数据库表
	if err := autoMigrate(db); err != nil {
		return nil, fmt.Errorf("数据库迁移失败: %w", err)
	}

	logger.Info("数据库连接成功 (驱动: %s)", driver)
	return db, nil
}

// initSQLite 初始化 SQLite 数据库连接
func initSQLite(cfg config.DatabaseConfig, gormConfig *gorm.Config) (*gorm.DB, error) {
	// 获取数据库文件路径
	dbPath := cfg.DSN
	if dbPath == "" {
		dbPath = "./data/kubepolaris.db"
	}

	// 确保目录存在
	dir := filepath.Dir(dbPath)
	if dir != "" && dir != "." {
		if err := os.MkdirAll(dir, 0755); err != nil {
			return nil, fmt.Errorf("创建数据库目录失败: %w", err)
		}
	}

	logger.Info("连接 SQLite 数据库: %s", dbPath)

	// SQLite 连接参数：启用 WAL 模式提升并发性能，启用外键约束
	dsn := fmt.Sprintf("%s?_journal_mode=WAL&_foreign_keys=on", dbPath)
	db, err := gorm.Open(sqlite.Open(dsn), gormConfig)
	if err != nil {
		return nil, fmt.Errorf("连接 SQLite 数据库失败: %w", err)
	}

	return db, nil
}

// initMySQL 初始化 MySQL 数据库连接
func initMySQL(cfg config.DatabaseConfig, gormConfig *gorm.Config) (*gorm.DB, error) {
	// 先连接到MySQL服务器（不指定数据库）来创建数据库
	dsnWithoutDB := fmt.Sprintf("%s:%s@tcp(%s:%d)/?charset=%s&parseTime=True&loc=Local",
		cfg.Username,
		cfg.Password,
		cfg.Host,
		cfg.Port,
		cfg.Charset,
	)

	logger.Info("连接MySQL服务器: %s@%s:%d", cfg.Username, cfg.Host, cfg.Port)
	tempDB, err := gorm.Open(mysql.Open(dsnWithoutDB), gormConfig)
	if err != nil {
		return nil, fmt.Errorf("连接MySQL服务器失败: %w", err)
	}

	// 创建数据库（如果不存在）
	createDBSQL := fmt.Sprintf("CREATE DATABASE IF NOT EXISTS `%s` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci", cfg.Database)
	if err := tempDB.Exec(createDBSQL).Error; err != nil {
		return nil, fmt.Errorf("创建数据库失败: %w", err)
	}
	logger.Info("数据库 %s 创建成功或已存在", cfg.Database)

	// 现在连接到具体的数据库
	dsn := fmt.Sprintf("%s:%s@tcp(%s:%d)/%s?charset=%s&parseTime=True&loc=Local",
		cfg.Username,
		cfg.Password,
		cfg.Host,
		cfg.Port,
		cfg.Database,
		cfg.Charset,
	)

	logger.Info("连接MySQL数据库: %s@%s:%d/%s", cfg.Username, cfg.Host, cfg.Port, cfg.Database)
	db, err := gorm.Open(mysql.Open(dsn), gormConfig)
	if err != nil {
		return nil, fmt.Errorf("连接数据库失败: %w", err)
	}

	return db, nil
}

// autoMigrate 自动迁移数据库表
func autoMigrate(db *gorm.DB) error {
	// 根据数据库驱动类型禁用外键约束检查
	if currentDriver == "mysql" {
		db.Exec("SET FOREIGN_KEY_CHECKS = 0")
	} else if currentDriver == "sqlite" {
		db.Exec("PRAGMA foreign_keys = OFF")
	}

	// 按依赖顺序迁移表
	err := db.AutoMigrate(
		&models.User{},
		&models.Cluster{},
		&models.ClusterMetrics{},
		&models.TerminalSession{},
		&models.TerminalCommand{},
		&models.AuditLog{},
		&models.OperationLog{},      // 操作审计日志表（新增）
		&models.SystemSetting{},     // 系统设置表
		&models.ArgoCDConfig{},      // ArgoCD 配置表
		&models.UserGroup{},         // 用户组表
		&models.UserGroupMember{},   // 用户组成员关联表
		&models.ClusterPermission{}, // 集群权限表
		&models.AIConfig{},          // AI 配置表
	)

	// 根据数据库驱动类型重新启用外键约束检查
	if currentDriver == "mysql" {
		db.Exec("SET FOREIGN_KEY_CHECKS = 1")
	} else if currentDriver == "sqlite" {
		db.Exec("PRAGMA foreign_keys = ON")
	}

	// 创建默认管理员用户和系统设置（如果不存在）
	if err == nil {
		createDefaultUser(db)
		createTestClusters(db)
		createDefaultSystemSettings(db)
		createDefaultPermissions(db)
	}

	return err
}

// createDefaultPermissions 创建默认权限配置
func createDefaultPermissions(db *gorm.DB) {
	// 检查是否已有权限配置
	var count int64
	db.Model(&models.ClusterPermission{}).Count(&count)
	if count > 0 {
		return
	}

	// 获取管理员用户
	var adminUser models.User
	if err := db.Where("username = ?", "admin").First(&adminUser).Error; err != nil {
		logger.Error("未找到管理员用户，跳过权限配置: %v", err)
		return
	}

	// 获取所有集群
	var clusters []models.Cluster
	if err := db.Find(&clusters).Error; err != nil {
		logger.Error("获取集群列表失败: %v", err)
		return
	}

	// 为管理员用户在所有集群创建管理员权限
	for _, cluster := range clusters {
		permission := &models.ClusterPermission{
			ClusterID:      cluster.ID,
			UserID:         &adminUser.ID,
			PermissionType: models.PermissionTypeAdmin,
			Namespaces:     `["*"]`,
		}

		if err := db.Create(permission).Error; err != nil {
			logger.Error("创建集群权限失败: cluster=%s, error=%v", cluster.Name, err)
		} else {
			logger.Info("创建默认管理员权限: user=%s, cluster=%s", adminUser.Username, cluster.Name)
		}
	}

	// 创建默认用户组
	defaultGroups := []models.UserGroup{
		{Name: "运维组", Description: "运维团队成员，拥有运维权限"},
		{Name: "开发组", Description: "开发团队成员，拥有开发权限"},
		{Name: "只读组", Description: "只读权限用户组"},
	}

	for _, group := range defaultGroups {
		if err := db.Create(&group).Error; err != nil {
			logger.Error("创建用户组失败: %v", err)
		} else {
			logger.Info("创建默认用户组: %s", group.Name)
		}
	}
}

// createDefaultUser 创建默认管理员用户
func createDefaultUser(db *gorm.DB) {
	// 使用 bcrypt 生成密码哈希
	salt := "kubepolaris_salt"
	password := "KubePolaris@2026" + salt
	hashedPassword, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		logger.Error("生成密码哈希失败: %v", err)
		return
	}

	// 查找是否存在admin用户
	var user models.User
	result := db.Where("username = ?", "admin").First(&user)

	if result.Error == gorm.ErrRecordNotFound {
		// 创建新的默认管理员用户
		user = models.User{
			Username:     "admin",
			PasswordHash: string(hashedPassword),
			Salt:         salt,
			Email:        "admin@kubepolaris.io",
			DisplayName:  "管理员",
			AuthType:     "local",
			Status:       "active",
		}

		if err := db.Create(&user).Error; err != nil {
			logger.Error("创建默认用户失败: %v", err)
		} else {
			logger.Info("默认管理员用户创建成功: admin/KubePolaris@2026")
		}
	} else if result.Error != nil {
		logger.Error("查询默认用户失败: %v", result.Error)
	} else {
		logger.Info("默认管理员用户已存在，跳过创建")
	}
}

// createDefaultSystemSettings 创建默认系统设置
func createDefaultSystemSettings(db *gorm.DB) {
	var count int64
	db.Model(&models.SystemSetting{}).Where("config_key = ?", "ldap_config").Count(&count)
	if count == 0 {
		// 创建默认LDAP配置
		defaultLDAPConfig := models.GetDefaultLDAPConfig()
		ldapConfigJSON, _ := json.Marshal(defaultLDAPConfig)

		setting := &models.SystemSetting{
			ConfigKey: "ldap_config",
			Value:     string(ldapConfigJSON),
			Type:      "ldap",
		}

		if err := db.Create(setting).Error; err != nil {
			logger.Error("创建默认LDAP配置失败: %v", err)
		} else {
			logger.Info("默认LDAP配置创建成功")
		}
	}
}

// createTestClusters 创建测试集群数据
func createTestClusters(db *gorm.DB) {
	var count int64
	db.Model(&models.Cluster{}).Count(&count)
	if count == 0 {
		// 创建测试集群
		testClusters := []*models.Cluster{
			{
				Name:      "dev-cluster",
				APIServer: "https://dev-k8s-api.example.com:6443",
				Version:   "v1.28.2",
				Status:    "healthy",
				Labels:    `{"env":"dev","team":"backend"}`,
				KubeconfigEnc: `apiVersion: v1
kind: Config
clusters:
- cluster:
    server: https://dev-k8s-api.example.com:6443
    insecure-skip-tls-verify: true
  name: dev-cluster
contexts:
- context:
    cluster: dev-cluster
    user: dev-user
  name: dev-context
current-context: dev-context
users:
- name: dev-user
  user:
    token: fake-token-for-testing`,
			},
			{
				Name:      "prod-cluster",
				APIServer: "https://prod-k8s-api.example.com:6443",
				Version:   "v1.28.1",
				Status:    "healthy",
				Labels:    `{"env":"prod","team":"ops"}`,
				KubeconfigEnc: `apiVersion: v1
kind: Config
clusters:
- cluster:
    server: https://prod-k8s-api.example.com:6443
    insecure-skip-tls-verify: true
  name: prod-cluster
contexts:
- context:
    cluster: prod-cluster
    user: prod-user
  name: prod-context
current-context: prod-context
users:
- name: prod-user
  user:
    token: fake-token-for-testing`,
			},
			{
				Name:      "test-cluster",
				APIServer: "https://test-k8s-api.example.com:6443",
				Version:   "v1.27.8",
				Status:    "unhealthy",
				Labels:    `{"env":"test","team":"qa"}`,
				KubeconfigEnc: `apiVersion: v1
kind: Config
clusters:
- cluster:
    server: https://test-k8s-api.example.com:6443
    insecure-skip-tls-verify: true
  name: test-cluster
contexts:
- context:
    cluster: test-cluster
    user: test-user
  name: test-context
current-context: test-context
users:
- name: test-user
  user:
    token: fake-token-for-testing`,
			},
		}

		for _, cluster := range testClusters {
			if err := db.Create(cluster).Error; err != nil {
				logger.Error("创建测试集群失败: %v", err)
			} else {
				logger.Info("测试集群创建成功: %s", cluster.Name)
			}
		}
	}
}
