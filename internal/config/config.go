package config

import (
	"fmt"
	"os"
	"strings"
	"time"

	"github.com/clay-wangzhi/KubePolaris/pkg/logger"
	"github.com/joho/godotenv"
	"github.com/spf13/viper"
)

// Config 应用配置结构
type Config struct {
	Server   ServerConfig   `mapstructure:"server"`
	Database DatabaseConfig `mapstructure:"database"`
	JWT      JWTConfig      `mapstructure:"jwt"`
	Log      LogConfig      `mapstructure:"log"`
	K8s      K8sConfig      `mapstructure:"k8s"`
	Grafana  GrafanaConfig  `mapstructure:"grafana"`
}

// GrafanaConfig Grafana 配置
type GrafanaConfig struct {
	Enabled    bool   `mapstructure:"enabled"`
	URL        string `mapstructure:"url"`
	APIKey     string `mapstructure:"api_key"`
	APIKeyFile string `mapstructure:"api_key_file"` // 从文件读取 API Key（优先级高于 api_key）
}

// ServerConfig 服务器配置
type ServerConfig struct {
	Port int    `mapstructure:"port"`
	Mode string `mapstructure:"mode"`
}

// DatabaseConfig 数据库配置
type DatabaseConfig struct {
	Driver   string `mapstructure:"driver"`
	DSN      string `mapstructure:"dsn"`
	Host     string `mapstructure:"host"`
	Port     int    `mapstructure:"port"`
	Username string `mapstructure:"username"`
	Password string `mapstructure:"password"`
	Database string `mapstructure:"database"`
	Charset  string `mapstructure:"charset"`
}

// JWTConfig JWT配置
type JWTConfig struct {
	Secret     string `mapstructure:"secret"`
	ExpireTime int    `mapstructure:"expire_time"`
}

// LogConfig 日志配置
type LogConfig struct {
	Level string `mapstructure:"level"`
}

// K8sConfig Kubernetes配置
type K8sConfig struct {
	DefaultNamespace string `mapstructure:"default_namespace"`
}

// Load 加载配置（纯环境变量模式）
func Load() *Config {
	// 设置默认值
	setDefaults()

	// 先加载 .env 到系统环境变量
	if err := godotenv.Load(); err != nil {
		logger.Info("未找到 .env 文件，使用系统环境变量: %v", err)
	}

	// 读取环境变量
	viper.AutomaticEnv()

	// 绑定服务器环境变量
	_ = viper.BindEnv("server.port", "SERVER_PORT")
	_ = viper.BindEnv("server.mode", "SERVER_MODE")

	// 绑定数据库环境变量
	_ = viper.BindEnv("database.driver", "DB_DRIVER")
	_ = viper.BindEnv("database.dsn", "DB_DSN")
	_ = viper.BindEnv("database.host", "DB_HOST")
	_ = viper.BindEnv("database.port", "DB_PORT")
	_ = viper.BindEnv("database.username", "DB_USERNAME")
	_ = viper.BindEnv("database.password", "DB_PASSWORD")
	_ = viper.BindEnv("database.database", "DB_DATABASE")
	_ = viper.BindEnv("database.charset", "DB_CHARSET")

	// 绑定 JWT 环境变量
	_ = viper.BindEnv("jwt.secret", "JWT_SECRET")
	_ = viper.BindEnv("jwt.expire_time", "JWT_EXPIRE_TIME")

	// 绑定日志环境变量
	_ = viper.BindEnv("log.level", "LOG_LEVEL")

	// 绑定 K8s 环境变量
	_ = viper.BindEnv("k8s.default_namespace", "K8S_DEFAULT_NAMESPACE")

	// 绑定 Grafana 环境变量
	_ = viper.BindEnv("grafana.enabled", "GRAFANA_ENABLED")
	_ = viper.BindEnv("grafana.url", "GRAFANA_URL")
	_ = viper.BindEnv("grafana.api_key", "GRAFANA_API_KEY")
	_ = viper.BindEnv("grafana.api_key_file", "GRAFANA_API_KEY_FILE")

	var config Config
	if err := viper.Unmarshal(&config); err != nil {
		logger.Fatal("配置解析失败: %v", err)
	}
	logger.Info("配置: %+v", config)

	// 如果配置了 API Key 文件路径，尝试从文件读取（带重试和优雅降级）
	if config.Grafana.APIKeyFile != "" {
		if apiKey, err := readAPIKeyFromFile(config.Grafana.APIKeyFile); err == nil {
			config.Grafana.APIKey = apiKey
			logger.Info("Grafana API Key 已从文件加载: %s", config.Grafana.APIKeyFile)
		} else {
			// 如果 Grafana 是启用的，记录警告但不中断启动
			if config.Grafana.Enabled {
				logger.Warn("从文件读取 Grafana API Key 失败: %v", err)
				logger.Warn("Grafana 功能将被禁用，但系统将继续运行")
				config.Grafana.Enabled = false // 自动禁用 Grafana 功能
			} else {
				logger.Info("Grafana 未启用，跳过 API Key 加载")
			}
		}
	} else if config.Grafana.Enabled && config.Grafana.APIKey == "" {
		logger.Warn("Grafana 已启用但未配置 API Key，功能可能不可用")
	}

	return &config
}

// readAPIKeyFromFile 从文件读取 API Key（带重试机制）
func readAPIKeyFromFile(filePath string) (string, error) {
	maxRetries := 30                 // 最多重试 30 次
	retryInterval := 2 * time.Second // 每次间隔 2 秒

	for i := 0; i < maxRetries; i++ {
		data, err := os.ReadFile(filePath)
		if err == nil {
			apiKey := strings.TrimSpace(string(data))
			if apiKey != "" {
				return apiKey, nil
			}
			// 文件存在但内容为空，继续重试
			if i < maxRetries-1 {
				logger.Info("Grafana API Key 文件存在但为空，等待内容写入... (尝试 %d/%d)", i+1, maxRetries)
			}
		} else {
			// 文件不存在，继续重试
			if i < maxRetries-1 {
				logger.Info("等待 Grafana API Key 文件生成... (尝试 %d/%d)", i+1, maxRetries)
			}
		}

		if i < maxRetries-1 {
			time.Sleep(retryInterval)
		}
	}

	return "", fmt.Errorf("重试 %d 次后仍无法读取有效的 API Key 文件: %s", maxRetries, filePath)
}

// setDefaults 设置默认配置值
func setDefaults() {
	// 服务器默认配置
	viper.SetDefault("server.port", 8080)
	viper.SetDefault("server.mode", "debug")

	// 数据库默认配置
	viper.SetDefault("database.driver", "sqlite")
	viper.SetDefault("database.dsn", "./data/kubepolaris.db")
	viper.SetDefault("database.host", "localhost")
	viper.SetDefault("database.port", 3306)
	viper.SetDefault("database.username", "root")
	viper.SetDefault("database.password", "")
	viper.SetDefault("database.database", "kubepolaris")
	viper.SetDefault("database.charset", "utf8mb4")

	// JWT默认配置
	viper.SetDefault("jwt.secret", "kubepolaris-secret")
	viper.SetDefault("jwt.expire_time", 24) // 24小时

	// 日志默认配置
	viper.SetDefault("log.level", "info")

	// K8s默认配置
	viper.SetDefault("k8s.default_namespace", "default")

	// Grafana 默认配置
	viper.SetDefault("grafana.enabled", false)
	viper.SetDefault("grafana.url", "http://localhost:3000")
	viper.SetDefault("grafana.api_key", "")
	viper.SetDefault("grafana.api_key_file", "") // 支持从文件读取 API Key
}
