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
				/** genAI_main_start */

				// namespaces 子分组
				namespaceHandler := handlers.NewNamespaceHandler(clusterSvc, k8sMgr)
				namespaces := cluster.Group("/namespaces")
				{
					namespaces.GET("", namespaceHandler.GetNamespaces)
					namespaces.GET("/:namespace", namespaceHandler.GetNamespaceDetail)
					namespaces.POST("", namespaceHandler.CreateNamespace)
					namespaces.DELETE("/:namespace", namespaceHandler.DeleteNamespace)
				}
				/** genAI_main_end */

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

				/** genAI_main_start */
				// Deployment 子分组
				deploymentHandler := handlers.NewDeploymentHandler(db, cfg, clusterSvc, k8sMgr)
				deployments := cluster.Group("/deployments")
				{
					deployments.GET("", deploymentHandler.ListDeployments)
					deployments.GET("/namespaces", deploymentHandler.GetDeploymentNamespaces)
					deployments.GET("/:namespace/:name", deploymentHandler.GetDeployment)
					deployments.GET("/:namespace/:name/metrics", monitoringHandler.GetWorkloadMetrics)
					deployments.POST("/yaml/apply", deploymentHandler.ApplyYAML)
					deployments.POST("/:namespace/:name/scale", deploymentHandler.ScaleDeployment)
					deployments.DELETE("/:namespace/:name", deploymentHandler.DeleteDeployment)
					/** genAI_main_start */
					// Deployment详情页相关接口
					deployments.GET("/:namespace/:name/pods", deploymentHandler.GetDeploymentPods)
					deployments.GET("/:namespace/:name/services", deploymentHandler.GetDeploymentServices)
					deployments.GET("/:namespace/:name/ingresses", deploymentHandler.GetDeploymentIngresses)
					deployments.GET("/:namespace/:name/hpa", deploymentHandler.GetDeploymentHPA)
					deployments.GET("/:namespace/:name/replicasets", deploymentHandler.GetDeploymentReplicaSets)
					deployments.GET("/:namespace/:name/events", deploymentHandler.GetDeploymentEvents)
					/** genAI_main_end */
				}

				// Rollout 子分组
				rolloutHandler := handlers.NewRolloutHandler(db, cfg, clusterSvc, k8sMgr)
				rollouts := cluster.Group("/rollouts")
				{
					/** genAI_main_start */
					rollouts.GET("/crd-check", rolloutHandler.CheckRolloutCRD)
					/** genAI_main_end */
					rollouts.GET("", rolloutHandler.ListRollouts)
					rollouts.GET("/namespaces", rolloutHandler.GetRolloutNamespaces)
					rollouts.GET("/:namespace/:name", rolloutHandler.GetRollout)
					rollouts.GET("/:namespace/:name/metrics", monitoringHandler.GetWorkloadMetrics)
					/** genAI_main_start */
					// Rollout详情相关路由
					rollouts.GET("/:namespace/:name/pods", rolloutHandler.GetRolloutPods)
					rollouts.GET("/:namespace/:name/services", rolloutHandler.GetRolloutServices)
					rollouts.GET("/:namespace/:name/ingresses", rolloutHandler.GetRolloutIngresses)
					rollouts.GET("/:namespace/:name/hpa", rolloutHandler.GetRolloutHPA)
					rollouts.GET("/:namespace/:name/replicasets", rolloutHandler.GetRolloutReplicaSets)
					rollouts.GET("/:namespace/:name/events", rolloutHandler.GetRolloutEvents)
					/** genAI_main_end */
					rollouts.POST("/yaml/apply", rolloutHandler.ApplyYAML)
					rollouts.POST("/:namespace/:name/scale", rolloutHandler.ScaleRollout)
					rollouts.DELETE("/:namespace/:name", rolloutHandler.DeleteRollout)
				}

				// StatefulSet 子分组
				statefulSetHandler := handlers.NewStatefulSetHandler(db, cfg, clusterSvc, k8sMgr)
				statefulSets := cluster.Group("/statefulsets")
				{
					statefulSets.GET("", statefulSetHandler.ListStatefulSets)
					statefulSets.GET("/namespaces", statefulSetHandler.GetStatefulSetNamespaces)
					statefulSets.GET("/:namespace/:name", statefulSetHandler.GetStatefulSet)
					statefulSets.GET("/:namespace/:name/metrics", monitoringHandler.GetWorkloadMetrics)
					statefulSets.POST("/yaml/apply", statefulSetHandler.ApplyYAML)
					statefulSets.POST("/:namespace/:name/scale", statefulSetHandler.ScaleStatefulSet)
					statefulSets.DELETE("/:namespace/:name", statefulSetHandler.DeleteStatefulSet)
				}

				// DaemonSet 子分组
				daemonSetHandler := handlers.NewDaemonSetHandler(db, cfg, clusterSvc, k8sMgr)
				daemonsets := cluster.Group("/daemonsets")
				{
					daemonsets.GET("", daemonSetHandler.ListDaemonSets)
					daemonsets.GET("/namespaces", daemonSetHandler.GetDaemonSetNamespaces)
					daemonsets.GET("/:namespace/:name", daemonSetHandler.GetDaemonSet)
					daemonsets.GET("/:namespace/:name/metrics", monitoringHandler.GetWorkloadMetrics)
					daemonsets.POST("/yaml/apply", daemonSetHandler.ApplyYAML)
					daemonsets.DELETE("/:namespace/:name", daemonSetHandler.DeleteDaemonSet)
				}

				// Job 子分组
				jobHandler := handlers.NewJobHandler(db, cfg, clusterSvc, k8sMgr)
				jobs := cluster.Group("/jobs")
				{
					jobs.GET("", jobHandler.ListJobs)
					jobs.GET("/namespaces", jobHandler.GetJobNamespaces)
					jobs.GET("/:namespace/:name", jobHandler.GetJob)
					jobs.GET("/:namespace/:name/metrics", monitoringHandler.GetWorkloadMetrics)
					jobs.POST("/yaml/apply", jobHandler.ApplyYAML)
					jobs.DELETE("/:namespace/:name", jobHandler.DeleteJob)
				}

				// CronJob 子分组
				cronJobHandler := handlers.NewCronJobHandler(db, cfg, clusterSvc, k8sMgr)
				cronjobs := cluster.Group("/cronjobs")
				{
					cronjobs.GET("", cronJobHandler.ListCronJobs)
					cronjobs.GET("/namespaces", cronJobHandler.GetCronJobNamespaces)
					cronjobs.GET("/:namespace/:name", cronJobHandler.GetCronJob)
					cronjobs.GET("/:namespace/:name/metrics", monitoringHandler.GetWorkloadMetrics)
					cronjobs.POST("/yaml/apply", cronJobHandler.ApplyYAML)
					cronjobs.DELETE("/:namespace/:name", cronJobHandler.DeleteCronJob)
				}
				/** genAI_main_end */

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

				/** genAI_main_start */
				// services 子分组
				serviceHandler := handlers.NewServiceHandler(db, cfg, clusterSvc, k8sMgr)
				services := cluster.Group("/services")
				{
					services.GET("", serviceHandler.ListServices)
					/** genAI_main_start */
					services.GET("/namespaces", serviceHandler.GetServiceNamespaces)
					/** genAI_main_end */
					services.POST("", serviceHandler.CreateService)
					services.GET("/:namespace/:name", serviceHandler.GetService)
					services.PUT("/:namespace/:name", serviceHandler.UpdateService)
					services.GET("/:namespace/:name/yaml", serviceHandler.GetServiceYAML)
					services.GET("/:namespace/:name/endpoints", serviceHandler.GetServiceEndpoints)
					services.DELETE("/:namespace/:name", serviceHandler.DeleteService)
				}
				/** genAI_main_end */

				/** genAI_main_start */
				// ingresses 子分组
				ingressHandler := handlers.NewIngressHandler(db, cfg, clusterSvc, k8sMgr)
				ingresses := cluster.Group("/ingresses")
				{
					ingresses.GET("", ingressHandler.ListIngresses)
					/** genAI_main_start */
					ingresses.GET("/namespaces", ingressHandler.GetIngressNamespaces)
					/** genAI_main_end */
					ingresses.POST("", ingressHandler.CreateIngress)
					ingresses.GET("/:namespace/:name", ingressHandler.GetIngress)
					ingresses.PUT("/:namespace/:name", ingressHandler.UpdateIngress)
					ingresses.GET("/:namespace/:name/yaml", ingressHandler.GetIngressYAML)
					ingresses.DELETE("/:namespace/:name", ingressHandler.DeleteIngress)
				}
				/** genAI_main_end */
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
