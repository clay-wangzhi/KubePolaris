package main

import (
	"context"
	"embed"
	"fmt"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/clay-wangzhi/KubePolaris/internal/config"
	"github.com/clay-wangzhi/KubePolaris/internal/database"
	"github.com/clay-wangzhi/KubePolaris/internal/router"
	"github.com/clay-wangzhi/KubePolaris/pkg/logger"

	"github.com/gin-gonic/gin"
)

//go:embed all:ui/dist
var staticFS embed.FS

func main() {
	// 初始化配置
	cfg := config.Load()

	// 初始化日志
	logger.Init(cfg.Log.Level)

	// 初始化数据库连接
	db, err := database.Init(cfg.Database)
	if err != nil {
		logger.Fatal("数据库初始化失败: %v", err)
	}

	// 设置 Gin 模式
	if cfg.Server.Mode == "release" {
		gin.SetMode(gin.ReleaseMode)
	}

	// 初始化路由
	r := router.Setup(db, cfg, staticFS)

	// 创建 HTTP 服务器
	srv := &http.Server{
		Addr:    fmt.Sprintf(":%d", cfg.Server.Port),
		Handler: r,
	}

	// 启动服务器
	go func() {
		logger.Info("服务器启动在端口: %d", cfg.Server.Port)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			logger.Fatal("服务器启动失败: %v", err)
		}
	}()

	// 等待中断信号以优雅地关闭服务器
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit
	logger.Info("正在关闭服务器...")

	// 设置 5 秒的超时时间来关闭服务器
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := srv.Shutdown(ctx); err != nil {
		logger.Fatal("服务器强制关闭: %v", err)
	}

	logger.Info("服务器已退出")
}
