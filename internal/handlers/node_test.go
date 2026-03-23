package handlers

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"regexp"
	"testing"
	"time"

	"github.com/DATA-DOG/go-sqlmock"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/suite"
	"gorm.io/driver/mysql"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"

	"github.com/clay-wangzhi/KubePolaris/internal/config"
	"github.com/clay-wangzhi/KubePolaris/internal/services"
)

// NodeHandlerTestSuite 定义节点处理器测试套件
type NodeHandlerTestSuite struct {
	suite.Suite
	db      *gorm.DB
	mock    sqlmock.Sqlmock
	router  *gin.Engine
	handler *NodeHandler
}

// SetupTest 每个测试前的设置
func (s *NodeHandlerTestSuite) SetupTest() {
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

	cfg := &config.Config{}
	clusterService := services.NewClusterService(gormDB)
	s.handler = NewNodeHandler(gormDB, cfg, clusterService, nil, nil, nil)

	s.router = gin.New()
	s.router.GET("/api/clusters/:clusterID/nodes", s.handler.GetNodes)
	s.router.GET("/api/clusters/:clusterID/nodes/:name", s.handler.GetNode)
}

// TearDownTest 每个测试后的清理
func (s *NodeHandlerTestSuite) TearDownTest() {
	if s.db != nil {
		sqlDB, _ := s.db.DB()
		if sqlDB != nil {
			_ = sqlDB.Close()
		}
	}
}

// TestGetNodes_ClusterNotFound 测试获取节点列表时集群不存在
func (s *NodeHandlerTestSuite) TestGetNodes_ClusterNotFound() {
	s.mock.ExpectQuery(regexp.QuoteMeta("SELECT * FROM `clusters` WHERE `clusters`.`id` = ? AND `clusters`.`deleted_at` IS NULL ORDER BY `clusters`.`id` LIMIT ?")).
		WithArgs(999, 1).
		WillReturnError(gorm.ErrRecordNotFound)

	w := httptest.NewRecorder()
	req, _ := http.NewRequest("GET", "/api/clusters/999/nodes", nil)
	s.router.ServeHTTP(w, req)

	assert.Equal(s.T(), http.StatusNotFound, w.Code)

	var response map[string]interface{}
	err := json.Unmarshal(w.Body.Bytes(), &response)
	s.Require().NoError(err)

	errObj, ok := response["error"].(map[string]interface{})
	s.Require().True(ok, "response should contain error object")
	assert.Equal(s.T(), "NOT_FOUND", errObj["code"])
}

// TestGetNodes_InvalidClusterID 测试无效的集群 ID
func (s *NodeHandlerTestSuite) TestGetNodes_InvalidClusterID() {
	w := httptest.NewRecorder()
	req, _ := http.NewRequest("GET", "/api/clusters/invalid/nodes", nil)
	s.router.ServeHTTP(w, req)

	assert.Equal(s.T(), http.StatusBadRequest, w.Code)
}

// TestGetNode_ClusterExists 测试获取节点详情时集群存在
func (s *NodeHandlerTestSuite) TestGetNode_ClusterExists() {
	now := time.Now()
	rows := sqlmock.NewRows([]string{
		"id", "name", "api_server", "kube_config", "version", "status",
		"description", "environment", "region", "labels", "monitoring_config",
		"alert_manager_config", "created_at", "updated_at", "last_heartbeat",
	}).AddRow(
		1, "test-cluster", "https://kubernetes.example.com:6443", "test-config",
		"v1.28.0", "connected", "Test cluster", "dev", "cn-north-1",
		"{}", "{}", "{}", now, now, now,
	)

	s.mock.ExpectQuery(regexp.QuoteMeta("SELECT * FROM `clusters` WHERE `clusters`.`id` = ? AND `clusters`.`deleted_at` IS NULL ORDER BY `clusters`.`id` LIMIT ?")).
		WithArgs(1, 1).
		WillReturnRows(rows)

	w := httptest.NewRecorder()
	req, _ := http.NewRequest("GET", "/api/clusters/1/nodes/test-node", nil)
	s.router.ServeHTTP(w, req)

	// 由于 K8s 客户端为 nil，应该返回错误（503 Service Unavailable）
	assert.True(s.T(), w.Code == http.StatusServiceUnavailable || w.Code == http.StatusInternalServerError || w.Code == http.StatusNotFound)
}

// TestNodeHandlerSuite 运行测试套件
func TestNodeHandlerSuite(t *testing.T) {
	suite.Run(t, new(NodeHandlerTestSuite))
}
