package router

import (
	"github.com/gin-gonic/gin"
	"gorm.io/gorm"

	"kubepolaris/internal/config"
	"kubepolaris/internal/handlers"
	"kubepolaris/internal/k8s"
	"kubepolaris/internal/middleware"
	"kubepolaris/internal/services"
	"kubepolaris/pkg/logger"
)

func Setup(db *gorm.DB, cfg *config.Config) *gin.Engine {
	r := gin.New()

	// 根据环境设置 gin 模式（可选）
	// if cfg.Server.Mode == "release" {
	// 	gin.SetMode(gin.ReleaseMode)
	// }

	// 全局中间件：建议引入 RequestID + 结构化日志 + 统一恢复
	r.Use(
		// middleware.RequestID(), // TODO: 注入 traceId/requestId
		gin.Recovery(),    // 可替换为自定义 Recovery 统一错误响应
		gin.Logger(),      // 可替换为 zap/logrus 结构化日志中间件
		middleware.CORS(), // TODO: 从 cfg 读取允许的 Origin/Methods/Headers
		// middleware.Gzip(),     // TODO: 如需压缩
		// middleware.RateLimit() // TODO: 关键接口限流
	)

	// Health endpoints：liveness 与 readiness
	r.GET("/healthz", func(c *gin.Context) {
		c.JSON(200, gin.H{"status": "ok"})
	})
	r.GET("/readyz", func(c *gin.Context) {
		// TODO: 检查 db/k8s 可用性
		c.JSON(200, gin.H{"ready": true})
	})

	// 统一的 Service 实例，避免重复创建
	clusterSvc := services.NewClusterService(db)
	monitoringConfigSvc := services.NewMonitoringConfigService(db)
	prometheusSvc := services.NewPrometheusService()
	// K8s Informer 管理器
	k8sMgr := k8s.NewClusterInformerManager()
	// 预热所有已存在集群的 Informer（后台执行，不阻塞启动）
	go func() {
		clusters, err := clusterSvc.GetAllClusters()
		if err != nil {
			logger.Error("预热 informer 失败", "error", err)
			return
		}
		for _, cl := range clusters {
			if _, err := k8sMgr.EnsureForCluster(cl); err != nil {
				logger.Error("初始化集群 informer 失败", "cluster", cl.Name, "error", err)
			}
		}
	}()

	// /api/v1
	api := r.Group("/api/v1")

	// Auth 仅开放登录与登出，其余走受保护分组
	auth := api.Group("/auth")
	{
		authHandler := handlers.NewAuthHandler(db, cfg)
		auth.POST("/login", authHandler.Login)
		auth.POST("/logout", authHandler.Logout)
		// /me 必须带 Auth
		auth.GET("/me", middleware.AuthRequired(cfg.JWT.Secret), authHandler.GetProfile)
	}

	// 受保护的业务路由
	protected := api.Group("")
	// protected.Use(middleware.AuthRequired(cfg.JWT.Secret))
	{
		// clusters 根分组
		clusters := protected.Group("/clusters")
		{
			clusterHandler := handlers.NewClusterHandler(db, cfg, k8sMgr)

			// 静态路由优先
			clusters.GET("/stats", clusterHandler.GetClusterStats)
			clusters.POST("/import", clusterHandler.ImportCluster)
			clusters.POST("/test-connection", clusterHandler.TestConnection)
			clusters.GET("", clusterHandler.GetClusters)

			// 动态 cluster 子分组
			cluster := clusters.Group("/:clusterID")
			{
				cluster.GET("", clusterHandler.GetCluster)
				cluster.GET("/status", clusterHandler.GetClusterStatus)
				cluster.GET("/overview", clusterHandler.GetClusterOverview)
				cluster.GET("/metrics", clusterHandler.GetClusterMetrics)
				cluster.GET("/events", clusterHandler.GetClusterEvents)
				cluster.DELETE("", clusterHandler.DeleteCluster)

				// monitoring 子分组
				monitoringHandler := handlers.NewMonitoringHandler(monitoringConfigSvc, prometheusSvc)
				monitoring := cluster.Group("/monitoring")
				{
					monitoring.GET("/config", monitoringHandler.GetMonitoringConfig)
					monitoring.PUT("/config", monitoringHandler.UpdateMonitoringConfig)
					monitoring.POST("/test-connection", monitoringHandler.TestMonitoringConnection)
					monitoring.GET("/metrics", monitoringHandler.GetClusterMetrics)
				}

				// nodes 子分组
				nodeHandler := handlers.NewNodeHandler(db, cfg, clusterSvc, k8sMgr)
				nodes := cluster.Group("/nodes")
				{
					nodes.GET("", nodeHandler.GetNodes)
					nodes.GET("/overview", nodeHandler.GetNodeOverview)
					nodes.GET("/:name", nodeHandler.GetNode)
					nodes.POST("/:name/cordon", nodeHandler.CordonNode)
					nodes.POST("/:name/uncordon", nodeHandler.UncordonNode)
					nodes.POST("/:name/drain", nodeHandler.DrainNode)
					nodes.GET("/:name/metrics", monitoringHandler.GetNodeMetrics)
				}

				// pods 子分组
				podHandler := handlers.NewPodHandler(db, cfg, clusterSvc, k8sMgr)
				pods := cluster.Group("/pods")
				{
					pods.GET("", podHandler.GetPods) // 可考虑使用 query 过滤 namespace/name
					pods.GET("/namespaces", podHandler.GetPodNamespaces)
					pods.GET("/nodes", podHandler.GetPodNodes)
					pods.GET("/:namespace/:name", podHandler.GetPod)
					pods.DELETE("/:namespace/:name", podHandler.DeletePod)
					pods.GET("/:namespace/:name/logs", podHandler.GetPodLogs)
					pods.GET("/:namespace/:name/metrics", monitoringHandler.GetPodMetrics)
				}

				// workloads 子分组
				workloadHandler := handlers.NewWorkloadHandler(db, cfg, clusterSvc, k8sMgr)
				workloads := cluster.Group("/workloads")
				{
					workloads.GET("", workloadHandler.GetWorkloads)
					workloads.GET("/namespaces", workloadHandler.GetWorkloadNamespaces)
					workloads.GET("/:namespace/:name", workloadHandler.GetWorkload)
					workloads.POST("/:namespace/:name/scale", workloadHandler.ScaleWorkload)
					/** genAI_main_start */
					workloads.GET("/:namespace/:name/metrics", monitoringHandler.GetWorkloadMetrics)
					/** genAI_main_end */
					// YAML apply 可以考虑放 /apply 到 cluster 级别或 workloads 级别均可
					workloads.POST("/yaml/apply", workloadHandler.ApplyYAML)
				}

				/** genAI_main_start */
				// configmaps 子分组
				configMapHandler := handlers.NewConfigMapHandler(db, cfg, clusterSvc, k8sMgr)
				configmaps := cluster.Group("/configmaps")
				{
					configmaps.GET("", configMapHandler.GetConfigMaps)
					configmaps.GET("/namespaces", configMapHandler.GetConfigMapNamespaces)
					configmaps.GET("/:namespace/:name", configMapHandler.GetConfigMap)
					configmaps.POST("", configMapHandler.CreateConfigMap)
					configmaps.PUT("/:namespace/:name", configMapHandler.UpdateConfigMap)
					configmaps.DELETE("/:namespace/:name", configMapHandler.DeleteConfigMap)
				}

				// secrets 子分组
				secretHandler := handlers.NewSecretHandler(db, cfg, clusterSvc, k8sMgr)
				secrets := cluster.Group("/secrets")
				{
					secrets.GET("", secretHandler.GetSecrets)
					secrets.GET("/namespaces", secretHandler.GetSecretNamespaces)
					secrets.GET("/:namespace/:name", secretHandler.GetSecret)
					secrets.POST("", secretHandler.CreateSecret)
					secrets.PUT("/:namespace/:name", secretHandler.UpdateSecret)
					secrets.DELETE("/:namespace/:name", secretHandler.DeleteSecret)
				}
				/** genAI_main_end */
			}
		}

		// search
		search := protected.Group("/search")
		{
			searchHandler := handlers.NewSearchHandler(db, cfg, k8sMgr, clusterSvc)
			search.GET("", searchHandler.GlobalSearch)
			search.GET("/quick", searchHandler.QuickSearch)
		}

		// audit
		audit := protected.Group("/audit")
		{
			auditHandler := handlers.NewAuditHandler(db, cfg)
			audit.GET("/terminal/sessions", auditHandler.GetTerminalSessions)
			audit.GET("/terminal/sessions/:sessionId", auditHandler.GetTerminalSession)
			audit.GET("/terminal/sessions/:sessionId/commands", auditHandler.GetTerminalCommands)
		}

		// monitoring templates
		monitoringHandler := handlers.NewMonitoringHandler(monitoringConfigSvc, prometheusSvc)
		protected.GET("/monitoring/templates", monitoringHandler.GetMonitoringTemplates)
	}

	/** genAI_main_start */
	// WebSocket：建议也加认证
	ws := r.Group("/ws")
	// ws.Use(middleware.AuthRequired(cfg.JWT.Secret))
	{
		kctl := handlers.NewKubectlTerminalHandler(clusterSvc)
		ssh := handlers.NewSSHHandler()
		podTerminal := handlers.NewPodTerminalHandler(clusterSvc)
		podHandler := handlers.NewPodHandler(db, cfg, clusterSvc, k8sMgr)

		// 集群级 kubectl 终端
		ws.GET("/clusters/:clusterID/terminal", kctl.HandleKubectlTerminal)

		// 节点 SSH 终端
		ws.GET("/ssh/terminal", ssh.SSHConnect)

		// Pod 终端：使用 kubectl exec 连接到 Pod
		ws.GET("/clusters/:clusterID/pods/:namespace/:name/terminal", podTerminal.HandlePodTerminal)

		// Pod 日志流式传输
		ws.GET("/clusters/:clusterID/pods/:namespace/:name/logs", podHandler.StreamPodLogs)
	}
	/** genAI_main_end */

	// TODO:
	// - 统一错误处理/响应格式中间件
	// - OpenAPI/Swagger 文档路由（/swagger/*any）
	// - 404/405 兜底处理
	return r
}
