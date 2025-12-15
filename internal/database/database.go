package database

import (
	"encoding/json"
	"fmt"
	"time"

	"kubepolaris/internal/config"
	"kubepolaris/internal/models"
	"kubepolaris/pkg/logger"

	"golang.org/x/crypto/bcrypt"
	"gorm.io/driver/mysql"
	"gorm.io/gorm"
	gormLogger "gorm.io/gorm/logger"
)

// Init 初始化数据库连接
func Init(cfg config.DatabaseConfig) (*gorm.DB, error) {
	// 配置 GORM 日志
	gormConfig := &gorm.Config{
		Logger: gormLogger.Default.LogMode(gormLogger.Info),
	}

	var db *gorm.DB
	var err error

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
	db, err = gorm.Open(mysql.Open(dsn), gormConfig)

	if err != nil {
		return nil, fmt.Errorf("连接数据库失败: %w", err)
	}

	// 获取底层的 sql.DB 对象来配置连接池
	sqlDB, err := db.DB()
	if err != nil {
		return nil, fmt.Errorf("获取数据库连接失败: %w", err)
	}

	// 设置连接池参数
	sqlDB.SetMaxIdleConns(10)
	sqlDB.SetMaxOpenConns(100)
	sqlDB.SetConnMaxLifetime(time.Hour)

	// 自动迁移数据库表
	if err := autoMigrate(db); err != nil {
		return nil, fmt.Errorf("数据库迁移失败: %w", err)
	}

	logger.Info("数据库连接成功")
	return db, nil
}

// autoMigrate 自动迁移数据库表
func autoMigrate(db *gorm.DB) error {
	// 禁用外键约束检查
	db.Exec("SET FOREIGN_KEY_CHECKS = 0")

	// 按依赖顺序迁移表
	err := db.AutoMigrate(
		&models.User{},
		&models.Role{},
		&models.Permission{},
		&models.UserRole{},
		&models.RolePermission{},
		&models.Cluster{},
		&models.ClusterMetrics{},
		&models.TerminalSession{},
		&models.TerminalCommand{},
		&models.AuditLog{},
		&models.SystemSetting{}, // 系统设置表
	)

	// 重新启用外键约束检查
	db.Exec("SET FOREIGN_KEY_CHECKS = 1")

	// 创建默认管理员用户和系统设置（如果不存在）
	if err == nil {
		createDefaultUser(db)
		createTestClusters(db)
		createDefaultSystemSettings(db)
	}

	return err
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
	} else {
		logger.Error("查询默认用户失败: %v", result.Error)
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
