package handlers

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"regexp"
	"testing"

	"github.com/DATA-DOG/go-sqlmock"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/suite"
	"gorm.io/driver/mysql"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"

	"github.com/clay-wangzhi/KubePolaris/internal/services"
)

// AuthHandlerTestSuite 定义认证处理器测试套件
type AuthHandlerTestSuite struct {
	suite.Suite
	db      *gorm.DB
	mock    sqlmock.Sqlmock
	router  *gin.Engine
	handler *AuthHandler
}

// SetupTest 每个测试前的设置
func (s *AuthHandlerTestSuite) SetupTest() {
	gin.SetMode(gin.TestMode)

	db, mock, err := sqlmock.New(sqlmock.QueryMatcherOption(sqlmock.QueryMatcherRegexp))
	s.Require().NoError(err)

	gormDB, err := gorm.Open(mysql.New(mysql.Config{
		Conn:                      db,
		SkipInitializeWithVersion: true,
	}), &gorm.Config{
		Logger: logger.Default.LogMode(logger.Silent),
	})
	s.Require().NoError(err)

	s.db = gormDB
	s.mock = mock

	authSvc := services.NewAuthService(gormDB, "test-secret-key-for-unit-tests-only", 24)
	opLogSvc := services.NewOperationLogService(gormDB)
	s.handler = NewAuthHandler(authSvc, opLogSvc)

	s.router = gin.New()
	s.router.POST("/api/auth/login", s.handler.Login)
	s.router.GET("/api/auth/profile", s.handler.GetProfile)
}

// TearDownTest 每个测试后的清理
func (s *AuthHandlerTestSuite) TearDownTest() {
	if s.db != nil {
		sqlDB, _ := s.db.DB()
		if sqlDB != nil {
			_ = sqlDB.Close()
		}
	}
}

// TestLogin_EmptyCredentials 测试空凭据登录
func (s *AuthHandlerTestSuite) TestLogin_EmptyCredentials() {
	loginReq := map[string]string{
		"username": "",
		"password": "",
	}
	body, _ := json.Marshal(loginReq)

	w := httptest.NewRecorder()
	req, _ := http.NewRequest("POST", "/api/auth/login", bytes.NewBuffer(body))
	req.Header.Set("Content-Type", "application/json")
	s.router.ServeHTTP(w, req)

	assert.Equal(s.T(), http.StatusBadRequest, w.Code)

	var response map[string]interface{}
	err := json.Unmarshal(w.Body.Bytes(), &response)
	s.Require().NoError(err)

	errObj, ok := response["error"].(map[string]interface{})
	s.Require().True(ok, "response should contain error object")
	assert.Equal(s.T(), "BAD_REQUEST", errObj["code"])
}

// TestLogin_UserNotFound 测试用户不存在
func (s *AuthHandlerTestSuite) TestLogin_UserNotFound() {
	s.mock.ExpectQuery(regexp.QuoteMeta("SELECT * FROM `users` WHERE username = ?")).
		WithArgs("nonexistent").
		WillReturnError(gorm.ErrRecordNotFound)

	loginReq := map[string]string{
		"username": "nonexistent",
		"password": "password123",
	}
	body, _ := json.Marshal(loginReq)

	w := httptest.NewRecorder()
	req, _ := http.NewRequest("POST", "/api/auth/login", bytes.NewBuffer(body))
	req.Header.Set("Content-Type", "application/json")
	s.router.ServeHTTP(w, req)

	assert.Equal(s.T(), http.StatusUnauthorized, w.Code)
}

// TestLogin_InvalidJSON 测试无效的 JSON 请求
func (s *AuthHandlerTestSuite) TestLogin_InvalidJSON() {
	w := httptest.NewRecorder()
	req, _ := http.NewRequest("POST", "/api/auth/login", bytes.NewBuffer([]byte("invalid json")))
	req.Header.Set("Content-Type", "application/json")
	s.router.ServeHTTP(w, req)

	assert.Equal(s.T(), http.StatusBadRequest, w.Code)
}

// TestGetProfile_NoToken 测试无 Token 获取当前用户
func (s *AuthHandlerTestSuite) TestGetProfile_NoToken() {
	w := httptest.NewRecorder()
	req, _ := http.NewRequest("GET", "/api/auth/profile", nil)
	s.router.ServeHTTP(w, req)

	// 没有 user_id 在上下文中时，会返回未授权
	assert.Equal(s.T(), http.StatusUnauthorized, w.Code)
}

// TestAuthHandlerSuite 运行测试套件
func TestAuthHandlerSuite(t *testing.T) {
	suite.Run(t, new(AuthHandlerTestSuite))
}
