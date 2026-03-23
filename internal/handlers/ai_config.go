package handlers

import (
	"context"
	"time"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"

	"github.com/clay-wangzhi/KubePolaris/internal/models"
	"github.com/clay-wangzhi/KubePolaris/internal/response"
	"github.com/clay-wangzhi/KubePolaris/internal/services"
	"github.com/clay-wangzhi/KubePolaris/pkg/logger"
)

// AIConfigHandler AI 配置处理器
type AIConfigHandler struct {
	configService *services.AIConfigService
}

// NewAIConfigHandler 创建 AI 配置处理器
func NewAIConfigHandler(db *gorm.DB) *AIConfigHandler {
	return &AIConfigHandler{
		configService: services.NewAIConfigService(db),
	}
}

// GetConfig 获取 AI 配置
func (h *AIConfigHandler) GetConfig(c *gin.Context) {
	config, err := h.configService.GetConfig()
	if err != nil {
		logger.Error("获取 AI 配置失败", "error", err)
		response.InternalError(c, "获取 AI 配置失败: "+err.Error())
		return
	}

	if config == nil {
		defaultCfg := models.GetDefaultAIConfig()
		response.OK(c, gin.H{
			"provider": defaultCfg.Provider,
			"endpoint": defaultCfg.Endpoint,
			"api_key":  "",
			"model":    defaultCfg.Model,
			"enabled":  defaultCfg.Enabled,
		})
		return
	}

	apiKeyDisplay := ""
	if config.ID > 0 {
		// 检查是否有 API Key 已配置（需要查带 key 的记录）
		fullConfig, _ := h.configService.GetConfigWithAPIKey()
		if fullConfig != nil && fullConfig.APIKey != "" {
			apiKeyDisplay = "******"
		}
	}

	response.OK(c, gin.H{
		"provider": config.Provider,
		"endpoint": config.Endpoint,
		"api_key":  apiKeyDisplay,
		"model":    config.Model,
		"enabled":  config.Enabled,
	})
}

// UpdateConfig 更新 AI 配置
func (h *AIConfigHandler) UpdateConfig(c *gin.Context) {
	var req struct {
		Provider string `json:"provider"`
		Endpoint string `json:"endpoint"`
		APIKey   string `json:"api_key"`
		Model    string `json:"model"`
		Enabled  bool   `json:"enabled"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "请求参数错误: "+err.Error())
		return
	}

	config := &models.AIConfig{
		Provider: req.Provider,
		Endpoint: req.Endpoint,
		APIKey:   req.APIKey,
		Model:    req.Model,
		Enabled:  req.Enabled,
	}

	if err := h.configService.SaveConfig(config); err != nil {
		logger.Error("保存 AI 配置失败", "error", err)
		response.InternalError(c, "保存 AI 配置失败: "+err.Error())
		return
	}

	response.OK(c, gin.H{"message": "保存成功"})
}

// TestConnection 测试 AI 连接
func (h *AIConfigHandler) TestConnection(c *gin.Context) {
	var req struct {
		Provider string `json:"provider"`
		Endpoint string `json:"endpoint"`
		APIKey   string `json:"api_key"`
		Model    string `json:"model"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "请求参数错误: "+err.Error())
		return
	}

	apiKey := req.APIKey
	if apiKey == "" || apiKey == "******" {
		fullConfig, err := h.configService.GetConfigWithAPIKey()
		if err != nil || fullConfig == nil || fullConfig.APIKey == "" {
			response.BadRequest(c, "请提供 API Key")
			return
		}
		apiKey = fullConfig.APIKey
	}

	endpoint := req.Endpoint
	if endpoint == "" {
		endpoint = "https://api.openai.com/v1"
	}

	model := req.Model
	if model == "" {
		model = "gpt-4o"
	}

	testConfig := &models.AIConfig{
		Provider: req.Provider,
		Endpoint: endpoint,
		APIKey:   apiKey,
		Model:    model,
	}

	provider := services.NewAIProvider(testConfig)

	ctx, cancel := context.WithTimeout(c.Request.Context(), 30*time.Second)
	defer cancel()

	if err := provider.TestConnection(ctx); err != nil {
		logger.Error("AI 连接测试失败", "error", err)
		response.OK(c, gin.H{
			"message": "连接测试失败: " + err.Error(),
			"success": false,
		})
		return
	}

	response.OK(c, gin.H{
		"message": "连接测试成功",
		"success": true,
	})
}
