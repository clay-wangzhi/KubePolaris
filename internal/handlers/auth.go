package handlers

import (
	"fmt"
	"net/http"
	"time"

	"kubepolaris/internal/config"
	"kubepolaris/internal/models"
	"kubepolaris/internal/services"
	"kubepolaris/pkg/logger"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"
)

// AuthHandler 认证处理器
type AuthHandler struct {
	db          *gorm.DB
	cfg         *config.Config
	ldapService *services.LDAPService
}

// NewAuthHandler 创建认证处理器
func NewAuthHandler(db *gorm.DB, cfg *config.Config) *AuthHandler {
	return &AuthHandler{
		db:          db,
		cfg:         cfg,
		ldapService: services.NewLDAPService(db),
	}
}

// LoginRequest 登录请求结构
type LoginRequest struct {
	Username string `json:"username" binding:"required"`
	Password string `json:"password" binding:"required"`
	AuthType string `json:"auth_type"` // 认证类型：local, ldap，默认local
}

// LoginResponse 登录响应结构
type LoginResponse struct {
	Token     string      `json:"token"`
	User      models.User `json:"user"`
	ExpiresAt int64       `json:"expires_at"`
}

// Login 用户登录 - 支持本地密码和LDAP两种认证方式
func (h *AuthHandler) Login(c *gin.Context) {
	var req LoginRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"code":    400,
			"message": "请求参数错误",
			"data":    nil,
		})
		return
	}

	// 默认使用本地认证
	if req.AuthType == "" {
		req.AuthType = "local"
	}

	var user *models.User
	var err error

	switch req.AuthType {
	case "ldap":
		user, err = h.authenticateLDAP(req.Username, req.Password, c.ClientIP())
	case "local":
		user, err = h.authenticateLocal(req.Username, req.Password, c.ClientIP())
	default:
		c.JSON(http.StatusBadRequest, gin.H{
			"code":    400,
			"message": "不支持的认证类型",
			"data":    nil,
		})
		return
	}

	if err != nil {
		logger.Warn("用户登录失败: %s, 错误: %v", req.Username, err)
		c.JSON(http.StatusUnauthorized, gin.H{
			"code":    401,
			"message": err.Error(),
			"data":    nil,
		})
		return
	}

	// 检查用户状态
	if user.Status != "active" {
		c.JSON(http.StatusForbidden, gin.H{
			"code":    403,
			"message": "用户账号已被禁用",
			"data":    nil,
		})
		return
	}

	// 生成JWT token
	expiresAt := time.Now().Add(time.Duration(h.cfg.JWT.ExpireTime) * time.Hour)
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{
		"user_id":   user.ID,
		"username":  user.Username,
		"auth_type": user.AuthType,
		"exp":       expiresAt.Unix(),
	})

	tokenString, err := token.SignedString([]byte(h.cfg.JWT.Secret))
	if err != nil {
		logger.Error("JWT token生成失败: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{
			"code":    500,
			"message": "登录失败",
			"data":    nil,
		})
		return
	}

	// 更新最后登录时间和IP
	now := time.Now()
	user.LastLoginAt = &now
	user.LastLoginIP = c.ClientIP()
	h.db.Save(user)

	logger.Info("用户登录成功: %s (认证类型: %s)", user.Username, user.AuthType)

	c.JSON(http.StatusOK, gin.H{
		"code":    200,
		"message": "登录成功",
		"data": LoginResponse{
			Token:     tokenString,
			User:      *user,
			ExpiresAt: expiresAt.Unix(),
		},
	})
}

// authenticateLocal 本地密码认证
func (h *AuthHandler) authenticateLocal(username, password, clientIP string) (*models.User, error) {
	var user models.User
	if err := h.db.Where("username = ?", username).First(&user).Error; err != nil {
		return nil, fmt.Errorf("用户名或密码错误")
	}

	// 验证密码
	passwordWithSalt := password + user.Salt
	logger.Info("验证密码 - 用户: %s, Salt: %s", username, user.Salt)

	if err := bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(passwordWithSalt)); err != nil {
		logger.Warn("密码验证失败 - 用户: %s, 错误: %v", username, err)
		return nil, fmt.Errorf("用户名或密码错误")
	}

	return &user, nil
}

// authenticateLDAP LDAP认证
func (h *AuthHandler) authenticateLDAP(username, password, clientIP string) (*models.User, error) {
	// 首先检查LDAP是否已启用
	ldapConfig, err := h.ldapService.GetLDAPConfig()
	if err != nil {
		return nil, fmt.Errorf("获取LDAP配置失败")
	}

	if !ldapConfig.Enabled {
		return nil, fmt.Errorf("LDAP认证未启用")
	}

	// 进行LDAP认证
	ldapUser, err := h.ldapService.Authenticate(username, password)
	if err != nil {
		return nil, fmt.Errorf("LDAP认证失败: %v", err)
	}

	// 查找或创建本地用户记录
	var user models.User
	result := h.db.Where("username = ? AND auth_type = ?", username, "ldap").First(&user)

	if result.Error == gorm.ErrRecordNotFound {
		// 首次LDAP登录，创建本地用户记录
		user = models.User{
			Username:    ldapUser.Username,
			Email:       ldapUser.Email,
			DisplayName: ldapUser.DisplayName,
			AuthType:    "ldap",
			Status:      "active",
		}
		if err := h.db.Create(&user).Error; err != nil {
			return nil, fmt.Errorf("创建用户记录失败")
		}
		logger.Info("LDAP用户首次登录，已创建本地记录: %s", username)
	} else if result.Error != nil {
		return nil, fmt.Errorf("查询用户失败")
	} else {
		// 更新用户信息
		user.Email = ldapUser.Email
		user.DisplayName = ldapUser.DisplayName
		h.db.Save(&user)
	}

	return &user, nil
}

// Logout 用户登出
func (h *AuthHandler) Logout(c *gin.Context) {
	// 这里可以实现token黑名单机制
	c.JSON(http.StatusOK, gin.H{
		"code":    200,
		"message": "登出成功",
		"data":    nil,
	})
}

// GetProfile 获取用户信息
func (h *AuthHandler) GetProfile(c *gin.Context) {
	userID := c.GetUint("user_id")
	if userID == 0 {
		c.JSON(http.StatusUnauthorized, gin.H{
			"code":    401,
			"message": "无效的用户认证信息",
			"data":    nil,
		})
		return
	}

	var user models.User
	if err := h.db.Preload("Roles").First(&user, userID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{
			"code":    404,
			"message": "用户不存在",
			"data":    nil,
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"code":    200,
		"message": "获取成功",
		"data":    user,
	})
}

// AuthStatusResponse 认证状态响应
type AuthStatusResponse struct {
	LDAPEnabled bool `json:"ldap_enabled"`
}

// GetAuthStatus 获取认证状态（无需登录即可访问）
func (h *AuthHandler) GetAuthStatus(c *gin.Context) {
	ldapConfig, err := h.ldapService.GetLDAPConfig()
	if err != nil {
		c.JSON(http.StatusOK, gin.H{
			"code":    200,
			"message": "获取成功",
			"data": AuthStatusResponse{
				LDAPEnabled: false,
			},
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"code":    200,
		"message": "获取成功",
		"data": AuthStatusResponse{
			LDAPEnabled: ldapConfig.Enabled,
		},
	})
}

// ChangePasswordRequest 修改密码请求
type ChangePasswordRequest struct {
	OldPassword string `json:"old_password" binding:"required"`
	NewPassword string `json:"new_password" binding:"required,min=6"`
}

// ChangePassword 修改密码（仅限本地用户）
func (h *AuthHandler) ChangePassword(c *gin.Context) {
	userID := c.GetUint("user_id")
	if userID == 0 {
		c.JSON(http.StatusUnauthorized, gin.H{
			"code":    401,
			"message": "无效的用户认证信息",
			"data":    nil,
		})
		return
	}

	var req ChangePasswordRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"code":    400,
			"message": "请求参数错误",
			"data":    nil,
		})
		return
	}

	// 获取用户
	var user models.User
	if err := h.db.First(&user, userID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{
			"code":    404,
			"message": "用户不存在",
			"data":    nil,
		})
		return
	}

	// 检查是否是LDAP用户
	if user.AuthType == "ldap" {
		c.JSON(http.StatusForbidden, gin.H{
			"code":    403,
			"message": "LDAP用户不能在此修改密码",
			"data":    nil,
		})
		return
	}

	// 验证旧密码
	if err := bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(req.OldPassword+user.Salt)); err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{
			"code":    401,
			"message": "原密码错误",
			"data":    nil,
		})
		return
	}

	// 生成新密码哈希
	newHashedPassword, err := bcrypt.GenerateFromPassword([]byte(req.NewPassword+user.Salt), bcrypt.DefaultCost)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"code":    500,
			"message": "密码加密失败",
			"data":    nil,
		})
		return
	}

	// 更新密码
	user.PasswordHash = string(newHashedPassword)
	if err := h.db.Save(&user).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"code":    500,
			"message": "密码更新失败",
			"data":    nil,
		})
		return
	}

	logger.Info("用户修改密码成功: %s", user.Username)

	c.JSON(http.StatusOK, gin.H{
		"code":    200,
		"message": "密码修改成功",
		"data":    nil,
	})
}
