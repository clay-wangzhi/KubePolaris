package router

import (
	"embed"
	"io/fs"
	"net/http"
	"net/http/httputil"
	"net/url"
	"strings"

	"github.com/gin-contrib/gzip"
	"github.com/gin-gonic/gin"
	"gorm.io/gorm"

	"github.com/clay-wangzhi/KubePolaris/internal/config"
	"github.com/clay-wangzhi/KubePolaris/internal/handlers"
	"github.com/clay-wangzhi/KubePolaris/internal/k8s"
	"github.com/clay-wangzhi/KubePolaris/internal/middleware"
	"github.com/clay-wangzhi/KubePolaris/internal/services"
	"github.com/clay-wangzhi/KubePolaris/pkg/logger"
)

// staticFS 保存嵌入的前端静态文件系统，由 Setup 注入
var staticFS embed.FS

func Setup(db *gorm.DB, cfg *config.Config, frontendFS embed.FS) *gin.Engine {
	staticFS = frontendFS
	r := gin.New()

	// 根据环境设置 gin 模式（可选）
	// if cfg.Server.Mode == "release" {
	// 	gin.SetMode(gin.ReleaseMode)
	// }

	// 创建操作审计日志服务
	opLogSvc := services.NewOperationLogService(db)

	// 全局中间件：建议引入 RequestID + 结构化日志 + 统一恢复
	r.Use(
		// middleware.RequestID(), // TODO: 注入 traceId/requestId
		gin.Recovery(),                      // 可替换为自定义 Recovery 统一错误响应
		gin.Logger(),                        // 可替换为 zap/logrus 结构化日志中间件
		middleware.CORS(),                   // TODO: 从 cfg 读取允许的 Origin/Methods/Headers
		middleware.OperationAudit(opLogSvc), // 操作审计中间件（记录所有非GET请求）
		gzip.Gzip(gzip.DefaultCompression, gzip.WithExcludedPaths([]string{"/ws/"})), // Gzip 压缩（排除 WebSocket）
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
	prometheusSvc := services.NewPrometheusService()
	auditSvc := services.NewAuditService(db)           // 审计服务
	argoCDSvc := services.NewArgoCDService(db)         // ArgoCD 服务
	permissionSvc := services.NewPermissionService(db) // 权限服务

	// 初始化 Grafana 服务（用于自动同步数据源）
	var grafanaSvc *services.GrafanaService
	if cfg.Grafana.Enabled {
		grafanaSvc = services.NewGrafanaService(cfg.Grafana.URL, cfg.Grafana.APIKey)
		if err := grafanaSvc.TestConnection(); err != nil {
			logger.Error("Grafana 连接测试失败，数据源同步将被禁用", "error", err)
			grafanaSvc = nil
		} else {
			logger.Info("Grafana 服务已启用", "url", cfg.Grafana.URL)
		}
	}
	monitoringConfigSvc := services.NewMonitoringConfigServiceWithGrafana(db, grafanaSvc)
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
		authHandler := handlers.NewAuthHandler(db, cfg, opLogSvc)
		auth.POST("/login", authHandler.Login)
		auth.POST("/logout", authHandler.Logout)
		auth.GET("/status", authHandler.GetAuthStatus) // 获取认证状态（无需登录）
		// /me 必须带 Auth
		auth.GET("/me", middleware.AuthRequired(cfg.JWT.Secret), authHandler.GetProfile)
		auth.POST("/change-password", middleware.AuthRequired(cfg.JWT.Secret), authHandler.ChangePassword)
	}

	// 创建权限中间件（在受保护路由和 WebSocket 路由中共用）
	permMiddleware := middleware.NewPermissionMiddleware(permissionSvc)

	// 受保护的业务路由
	protected := api.Group("")
	protected.Use(middleware.AuthRequired(cfg.JWT.Secret))
	{

		// clusters 根分组
		clusters := protected.Group("/clusters")
		{
			clusterHandler := handlers.NewClusterHandler(db, cfg, k8sMgr, prometheusSvc, monitoringConfigSvc)

			// 静态路由优先（不需要集群权限检查）
			clusters.GET("/stats", clusterHandler.GetClusterStats)
			clusters.POST("/import", clusterHandler.ImportCluster)
			clusters.POST("/test-connection", clusterHandler.TestConnection)
			clusters.GET("", clusterHandler.GetClusters)

			// 动态 cluster 子分组（需要集群权限检查）
			cluster := clusters.Group("/:clusterID")
			cluster.Use(permMiddleware.ClusterAccessRequired()) // 启用集群权限检查
			cluster.Use(permMiddleware.AutoWriteCheck())        // 自动检查写权限（POST/PUT/DELETE需要非只读权限）
			{
				cluster.GET("", clusterHandler.GetCluster)
				cluster.GET("/status", clusterHandler.GetClusterStatus)
				cluster.GET("/overview", clusterHandler.GetClusterOverview)
				cluster.GET("/metrics", clusterHandler.GetClusterMetrics)
				cluster.GET("/events", clusterHandler.GetClusterEvents)
				cluster.DELETE("", clusterHandler.DeleteCluster)

				// namespaces 子分组
				namespaceHandler := handlers.NewNamespaceHandler(clusterSvc, k8sMgr)
				namespaces := cluster.Group("/namespaces")
				{
					namespaces.GET("", namespaceHandler.GetNamespaces)
					namespaces.GET("/:namespace", namespaceHandler.GetNamespaceDetail)
					namespaces.POST("", namespaceHandler.CreateNamespace)
					namespaces.DELETE("/:namespace", namespaceHandler.DeleteNamespace)
				}

				// monitoring 子分组
				monitoringHandler := handlers.NewMonitoringHandler(monitoringConfigSvc, prometheusSvc)
				monitoring := cluster.Group("/monitoring")
				{
					monitoring.GET("/config", monitoringHandler.GetMonitoringConfig)
					monitoring.PUT("/config", monitoringHandler.UpdateMonitoringConfig)
					monitoring.POST("/test-connection", monitoringHandler.TestMonitoringConnection)
					monitoring.GET("/metrics", monitoringHandler.GetClusterMetrics)
				}

				// alertmanager 子分组
				alertManagerConfigSvc := services.NewAlertManagerConfigService(db)
				alertManagerSvc := services.NewAlertManagerService()
				alertHandler := handlers.NewAlertHandler(alertManagerConfigSvc, alertManagerSvc)
				alertmanager := cluster.Group("/alertmanager")
				{
					alertmanager.GET("/config", alertHandler.GetAlertManagerConfig)
					alertmanager.PUT("/config", alertHandler.UpdateAlertManagerConfig)
					alertmanager.POST("/test-connection", alertHandler.TestAlertManagerConnection)
					alertmanager.GET("/status", alertHandler.GetAlertManagerStatus)
					alertmanager.GET("/template", alertHandler.GetAlertManagerConfigTemplate)
				}

				// alerts 子分组
				alerts := cluster.Group("/alerts")
				{
					alerts.GET("", alertHandler.GetAlerts)
					alerts.GET("/groups", alertHandler.GetAlertGroups)
					alerts.GET("/stats", alertHandler.GetAlertStats)
				}

				// silences 子分组
				silences := cluster.Group("/silences")
				{
					silences.GET("", alertHandler.GetSilences)
					silences.POST("", alertHandler.CreateSilence)
					silences.DELETE("/:silenceId", alertHandler.DeleteSilence)
				}

				// receivers 子分组
				receivers := cluster.Group("/receivers")
				{
					receivers.GET("", alertHandler.GetReceivers)
				}

				// nodes 子分组
				nodeHandler := handlers.NewNodeHandler(db, cfg, clusterSvc, k8sMgr, prometheusSvc, monitoringConfigSvc)
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
					// Deployment详情页相关接口
					deployments.GET("/:namespace/:name/pods", deploymentHandler.GetDeploymentPods)
					deployments.GET("/:namespace/:name/services", deploymentHandler.GetDeploymentServices)
					deployments.GET("/:namespace/:name/ingresses", deploymentHandler.GetDeploymentIngresses)
					deployments.GET("/:namespace/:name/hpa", deploymentHandler.GetDeploymentHPA)
					deployments.GET("/:namespace/:name/replicasets", deploymentHandler.GetDeploymentReplicaSets)
					deployments.GET("/:namespace/:name/events", deploymentHandler.GetDeploymentEvents)
				}

				// Rollout 子分组
				rolloutHandler := handlers.NewRolloutHandler(db, cfg, clusterSvc, k8sMgr)
				rollouts := cluster.Group("/rollouts")
				{
					rollouts.GET("/crd-check", rolloutHandler.CheckRolloutCRD)
					rollouts.GET("", rolloutHandler.ListRollouts)
					rollouts.GET("/namespaces", rolloutHandler.GetRolloutNamespaces)
					rollouts.GET("/:namespace/:name", rolloutHandler.GetRollout)
					rollouts.GET("/:namespace/:name/metrics", monitoringHandler.GetWorkloadMetrics)
					// Rollout详情相关路由
					rollouts.GET("/:namespace/:name/pods", rolloutHandler.GetRolloutPods)
					rollouts.GET("/:namespace/:name/services", rolloutHandler.GetRolloutServices)
					rollouts.GET("/:namespace/:name/ingresses", rolloutHandler.GetRolloutIngresses)
					rollouts.GET("/:namespace/:name/hpa", rolloutHandler.GetRolloutHPA)
					rollouts.GET("/:namespace/:name/replicasets", rolloutHandler.GetRolloutReplicaSets)
					rollouts.GET("/:namespace/:name/events", rolloutHandler.GetRolloutEvents)
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

				// 通用资源 YAML 处理器（用于 dry-run 和 apply）
				resourceYAMLHandler := handlers.NewResourceYAMLHandler(db, cfg, clusterSvc, k8sMgr)

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
					configmaps.POST("/yaml/apply", resourceYAMLHandler.ApplyConfigMapYAML)
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
					secrets.POST("/yaml/apply", resourceYAMLHandler.ApplySecretYAML)
				}

				// services 子分组
				serviceHandler := handlers.NewServiceHandler(db, cfg, clusterSvc, k8sMgr)
				svcGroup := cluster.Group("/services")
				{
					svcGroup.GET("", serviceHandler.ListServices)
					svcGroup.GET("/namespaces", serviceHandler.GetServiceNamespaces)
					svcGroup.POST("", serviceHandler.CreateService)
					svcGroup.GET("/:namespace/:name", serviceHandler.GetService)
					svcGroup.PUT("/:namespace/:name", serviceHandler.UpdateService)
					svcGroup.GET("/:namespace/:name/yaml", serviceHandler.GetServiceYAML)
					svcGroup.GET("/:namespace/:name/endpoints", serviceHandler.GetServiceEndpoints)
					svcGroup.DELETE("/:namespace/:name", serviceHandler.DeleteService)
					svcGroup.POST("/yaml/apply", resourceYAMLHandler.ApplyServiceYAML)
				}

				// ingresses 子分组
				ingressHandler := handlers.NewIngressHandler(db, cfg, clusterSvc, k8sMgr)
				ingresses := cluster.Group("/ingresses")
				{
					ingresses.GET("", ingressHandler.ListIngresses)
					ingresses.GET("/namespaces", ingressHandler.GetIngressNamespaces)
					ingresses.POST("", ingressHandler.CreateIngress)
					ingresses.GET("/:namespace/:name", ingressHandler.GetIngress)
					ingresses.PUT("/:namespace/:name", ingressHandler.UpdateIngress)
					ingresses.GET("/:namespace/:name/yaml", ingressHandler.GetIngressYAML)
					ingresses.DELETE("/:namespace/:name", ingressHandler.DeleteIngress)
					ingresses.POST("/yaml/apply", resourceYAMLHandler.ApplyIngressYAML)
				}

				// storage 子分组 - PVC, PV, StorageClass
				storageHandler := handlers.NewStorageHandler(db, cfg, clusterSvc, k8sMgr)

				// PVCs 子分组
				pvcs := cluster.Group("/pvcs")
				{
					pvcs.GET("", storageHandler.ListPVCs)
					pvcs.GET("/namespaces", storageHandler.GetPVCNamespaces)
					pvcs.GET("/:namespace/:name", storageHandler.GetPVC)
					pvcs.GET("/:namespace/:name/yaml", storageHandler.GetPVCYAML)
					pvcs.DELETE("/:namespace/:name", storageHandler.DeletePVC)
					pvcs.POST("/yaml/apply", resourceYAMLHandler.ApplyPVCYAML)
				}

				// PVs 子分组
				pvs := cluster.Group("/pvs")
				{
					pvs.GET("", storageHandler.ListPVs)
					pvs.GET("/:name", storageHandler.GetPV)
					pvs.GET("/:name/yaml", storageHandler.GetPVYAML)
					pvs.DELETE("/:name", storageHandler.DeletePV)
					pvs.POST("/yaml/apply", resourceYAMLHandler.ApplyPVYAML)
				}

				// StorageClasses 子分组
				storageclasses := cluster.Group("/storageclasses")
				{
					storageclasses.GET("", storageHandler.ListStorageClasses)
					storageclasses.GET("/:name", storageHandler.GetStorageClass)
					storageclasses.GET("/:name/yaml", storageHandler.GetStorageClassYAML)
					storageclasses.DELETE("/:name", storageHandler.DeleteStorageClass)
					storageclasses.POST("/yaml/apply", resourceYAMLHandler.ApplyStorageClassYAML)
				}

				// ArgoCD / GitOps 插件中心
				argoCDHandler := handlers.NewArgoCDHandler(db, argoCDSvc)
				argocd := cluster.Group("/argocd")
				{
					// 配置管理
					argocd.GET("/config", argoCDHandler.GetConfig)
					argocd.PUT("/config", argoCDHandler.SaveConfig)
					argocd.POST("/test-connection", argoCDHandler.TestConnection)

					// 应用管理（通过 ArgoCD API 代理）
					argocd.GET("/applications", argoCDHandler.ListApplications)
					argocd.GET("/applications/:appName", argoCDHandler.GetApplication)
					argocd.POST("/applications", argoCDHandler.CreateApplication)
					argocd.PUT("/applications/:appName", argoCDHandler.UpdateApplication)
					argocd.DELETE("/applications/:appName", argoCDHandler.DeleteApplication)
					argocd.POST("/applications/:appName/sync", argoCDHandler.SyncApplication)
					argocd.POST("/applications/:appName/rollback", argoCDHandler.RollbackApplication)
					argocd.GET("/applications/:appName/resources", argoCDHandler.GetApplicationResources)
				}

				// RBAC 子分组 - KubePolaris 权限管理
				rbacSvc := services.NewRBACService()
				rbacHandler := handlers.NewRBACHandler(clusterSvc, rbacSvc)
				rbacGroup := cluster.Group("/rbac")
				{
					rbacGroup.GET("/status", rbacHandler.GetSyncStatus)
					rbacGroup.POST("/sync", rbacHandler.SyncPermissions)
					rbacGroup.GET("/clusterroles", rbacHandler.ListClusterRoles)
					rbacGroup.POST("/clusterroles", rbacHandler.CreateCustomClusterRole)
					rbacGroup.DELETE("/clusterroles/:name", rbacHandler.DeleteClusterRole)
				}

				// logs - 日志中心
				logCenterHandler := handlers.NewLogCenterHandler(clusterSvc, k8sMgr)
				logs := cluster.Group("/logs")
				{
					logs.GET("/containers", logCenterHandler.GetContainerLogs)     // 获取容器日志
					logs.GET("/events", logCenterHandler.GetEventLogs)             // 获取K8s事件日志
					logs.POST("/search", logCenterHandler.SearchLogs)              // 日志搜索
					logs.GET("/stats", logCenterHandler.GetLogStats)               // 日志统计
					logs.GET("/namespaces", logCenterHandler.GetNamespacesForLogs) // 获取命名空间列表
					logs.GET("/pods", logCenterHandler.GetPodsForLogs)             // 获取Pod列表
					logs.POST("/export", logCenterHandler.ExportLogs)              // 导出日志
				}

				// O&M - 监控中心（运维）
				omSvc := services.NewOMService(prometheusSvc, monitoringConfigSvc)
				omHandler := handlers.NewOMHandler(clusterSvc, omSvc)
				om := cluster.Group("/om")
				{
					om.GET("/health-diagnosis", omHandler.GetHealthDiagnosis)        // 集群健康诊断
					om.GET("/resource-top", omHandler.GetResourceTop)                // 资源消耗 Top N
					om.GET("/control-plane-status", omHandler.GetControlPlaneStatus) // 控制面组件状态
				}
			}
		}

		// overview - 总览大盘
		overview := protected.Group("/overview")
		{
			alertManagerCfgSvc := services.NewAlertManagerConfigService(db)
			alertManagerSvc := services.NewAlertManagerService()
			overviewHandler := handlers.NewOverviewHandler(clusterSvc, k8sMgr, prometheusSvc, monitoringConfigSvc, alertManagerCfgSvc, alertManagerSvc)
			overview.GET("/stats", overviewHandler.GetStats)
			overview.GET("/resource-usage", overviewHandler.GetResourceUsage)
			overview.GET("/distribution", overviewHandler.GetDistribution)
			overview.GET("/trends", overviewHandler.GetTrends)
			overview.GET("/abnormal-workloads", overviewHandler.GetAbnormalWorkloads)
			overview.GET("/alert-stats", overviewHandler.GetAlertStats)
		}

		// search
		search := protected.Group("/search")
		{
			searchHandler := handlers.NewSearchHandler(db, cfg, k8sMgr, clusterSvc)
			search.GET("", searchHandler.GlobalSearch)
			search.GET("/quick", searchHandler.QuickSearch)
		}

		// audit - 审计管理
		audit := protected.Group("/audit")
		{
			// 终端会话审计（保持不变）
			terminalAuditHandler := handlers.NewAuditHandler(db, cfg)
			audit.GET("/terminal/sessions", terminalAuditHandler.GetTerminalSessions)
			audit.GET("/terminal/sessions/:sessionId", terminalAuditHandler.GetTerminalSession)
			audit.GET("/terminal/sessions/:sessionId/commands", terminalAuditHandler.GetTerminalCommands)
			audit.GET("/terminal/stats", terminalAuditHandler.GetTerminalStats)

			// 操作日志审计（新增）
			opLogHandler := handlers.NewOperationLogHandler(opLogSvc)
			audit.GET("/operations", opLogHandler.GetOperationLogs)
			audit.GET("/operations/:id", opLogHandler.GetOperationLog)
			audit.GET("/operations/stats", opLogHandler.GetOperationLogStats)
			audit.GET("/modules", opLogHandler.GetModules)
			audit.GET("/actions", opLogHandler.GetActions)
		}

		// monitoring templates
		monitoringHandler := handlers.NewMonitoringHandler(monitoringConfigSvc, prometheusSvc)
		protected.GET("/monitoring/templates", monitoringHandler.GetMonitoringTemplates)

		// system settings - 系统设置（LDAP、SSH等）
		systemSettings := protected.Group("/system")
		{
			systemSettingHandler := handlers.NewSystemSettingHandler(db)
			// LDAP 配置
			systemSettings.GET("/ldap/config", systemSettingHandler.GetLDAPConfig)
			systemSettings.PUT("/ldap/config", systemSettingHandler.UpdateLDAPConfig)
			systemSettings.POST("/ldap/test-connection", systemSettingHandler.TestLDAPConnection)
			systemSettings.POST("/ldap/test-auth", systemSettingHandler.TestLDAPAuth)
			// SSH 配置
			systemSettings.GET("/ssh/config", systemSettingHandler.GetSSHConfig)
			systemSettings.PUT("/ssh/config", systemSettingHandler.UpdateSSHConfig)
			systemSettings.GET("/ssh/credentials", systemSettingHandler.GetSSHCredentials)
		}

		// permissions - 权限管理
		globalRbacSvc := services.NewRBACService()
		permissionHandler := handlers.NewPermissionHandler(permissionSvc, clusterSvc, globalRbacSvc)
		globalRbacHandler := handlers.NewRBACHandler(clusterSvc, globalRbacSvc)
		permissions := protected.Group("/permissions")
		{
			// 权限类型
			permissions.GET("/types", permissionHandler.GetPermissionTypes)
			// KubePolaris 预定义 ClusterRole 信息
			permissions.GET("/kubepolaris-roles", globalRbacHandler.GetKubePolarisClusterRoles)

			// 用户列表（用于权限分配）
			permissions.GET("/users", permissionHandler.ListUsers)

			// 用户组管理
			userGroups := permissions.Group("/user-groups")
			{
				userGroups.GET("", permissionHandler.ListUserGroups)
				userGroups.POST("", permissionHandler.CreateUserGroup)
				userGroups.GET("/:id", permissionHandler.GetUserGroup)
				userGroups.PUT("/:id", permissionHandler.UpdateUserGroup)
				userGroups.DELETE("/:id", permissionHandler.DeleteUserGroup)
				userGroups.POST("/:id/users", permissionHandler.AddUserToGroup)
				userGroups.DELETE("/:id/users/:userId", permissionHandler.RemoveUserFromGroup)
			}

			// 集群权限管理
			clusterPerms := permissions.Group("/cluster-permissions")
			{
				clusterPerms.GET("", permissionHandler.ListAllClusterPermissions)
				clusterPerms.POST("", permissionHandler.CreateClusterPermission)
				clusterPerms.GET("/:id", permissionHandler.GetClusterPermission)
				clusterPerms.PUT("/:id", permissionHandler.UpdateClusterPermission)
				clusterPerms.DELETE("/:id", permissionHandler.DeleteClusterPermission)
				clusterPerms.POST("/batch-delete", permissionHandler.BatchDeleteClusterPermissions)
			}

			// 当前用户权限查询
			permissions.GET("/my-permissions", permissionHandler.GetMyPermissions)
		}

		// 集群级权限查询
		protected.GET("/clusters/:clusterID/my-permissions", permissionHandler.GetMyClusterPermission)
	}

	// WebSocket：建议也加认证
	ws := r.Group("/ws")
	ws.Use(middleware.AuthRequired(cfg.JWT.Secret))
	{
		// 终端处理器（注入审计服务）
		kctl := handlers.NewKubectlTerminalHandler(clusterSvc, auditSvc)
		ssh := handlers.NewSSHHandler(auditSvc)
		podTerminal := handlers.NewPodTerminalHandler(clusterSvc, auditSvc)
		kubectlPod := handlers.NewKubectlPodTerminalHandler(clusterSvc, auditSvc)
		podHandler := handlers.NewPodHandler(db, cfg, clusterSvc, k8sMgr)
		logCenterHandler := handlers.NewLogCenterHandler(clusterSvc, k8sMgr)

		// 节点 SSH 终端（不需要集群权限检查）
		ws.GET("/ssh/terminal", ssh.SSHConnect)

		// 集群相关的 WebSocket 路由（需要集群权限检查）
		wsCluster := ws.Group("/clusters/:clusterID")
		wsCluster.Use(permMiddleware.ClusterAccessRequired()) // 启用集群权限检查
		{
			// 集群级 kubectl 终端（旧方案：本地执行）
			wsCluster.GET("/terminal", kctl.HandleKubectlTerminal)

			// 集群级 kubectl 终端（新方案：Pod 模式，支持 tab 补全）
			wsCluster.GET("/kubectl", kubectlPod.HandleKubectlPodTerminal)

			// Pod 终端：使用 kubectl exec 连接到 Pod
			wsCluster.GET("/pods/:namespace/:name/terminal", podTerminal.HandlePodTerminal)

			// Pod 日志流式传输
			wsCluster.GET("/pods/:namespace/:name/logs", podHandler.StreamPodLogs)

			// 日志中心 WebSocket 路由
			wsCluster.GET("/logs/stream", logCenterHandler.HandleAggregateLogStream)               // 多Pod聚合日志流
			wsCluster.GET("/logs/pod/:namespace/:name", logCenterHandler.HandleSinglePodLogStream) // 单Pod日志流
		}
	}

	// Grafana 反向代理（前端嵌入后端后，无 Nginx 时由后端代理 Grafana 请求）
	if cfg.Grafana.Enabled {
		setupGrafanaProxy(r, cfg.Grafana.URL)
	}

	// 嵌入前端静态文件服务
	setupStatic(r)

	// TODO:
	// - 统一错误处理/响应格式中间件
	// - OpenAPI/Swagger 文档路由（/swagger/*any）
	return r
}

// setupStatic 配置嵌入的前端静态文件服务
func setupStatic(r *gin.Engine) {
	assetsFS, err := fs.Sub(staticFS, "ui/dist/assets")
	if err != nil {
		logger.Error("加载前端静态资源失败", "error", err)
		return
	}

	// 静态资源缓存（assets 目录包含带 hash 的文件，可以长期缓存）
	assetsGroup := r.Group("/assets")
	assetsGroup.Use(func(c *gin.Context) {
		c.Header("Cache-Control", "public, max-age=31536000, immutable")
		c.Next()
	})
	assetsGroup.StaticFS("/", http.FS(assetsFS))

	// 所有未匹配的路由回退到 index.html（SPA 路由支持）
	r.NoRoute(func(c *gin.Context) {
		path := c.Request.URL.Path

		// API 和 WebSocket 路径返回 404
		if strings.HasPrefix(path, "/api/") || strings.HasPrefix(path, "/ws/") {
			c.JSON(404, gin.H{"code": 404, "message": "not found"})
			return
		}

		// 尝试提供静态文件（如 favicon.ico 等根目录文件）
		filePath := strings.TrimPrefix(path, "/")
		if filePath != "" {
			if f, err := staticFS.Open("ui/dist/" + filePath); err == nil {
				f.Close()
				fileServer := http.FileServer(http.FS(mustSub(staticFS, "ui/dist")))
				fileServer.ServeHTTP(c.Writer, c.Request)
				return
			}
		}

		// 回退到 index.html
		content, err := staticFS.ReadFile("ui/dist/index.html")
		if err != nil {
			c.JSON(500, gin.H{"code": 500, "message": "frontend not available"})
			return
		}
		c.Data(200, "text/html; charset=utf-8", content)
	})
}

// setupGrafanaProxy 配置 Grafana 反向代理
// 将 /grafana/* 请求代理到 Grafana 服务，支持前端嵌入后端的场景（无需 Nginx）
func setupGrafanaProxy(r *gin.Engine, grafanaURL string) {
	target, err := url.Parse(grafanaURL)
	if err != nil {
		logger.Error("解析 Grafana URL 失败，代理未启用", "url", grafanaURL, "error", err)
		return
	}

	proxy := httputil.NewSingleHostReverseProxy(target)

	// 自定义 Director：保留原始请求路径（Grafana 配置了 sub_path=/grafana/）
	originalDirector := proxy.Director
	proxy.Director = func(req *http.Request) {
		originalDirector(req)
		req.Host = target.Host
	}

	// 自定义错误处理
	proxy.ErrorHandler = func(w http.ResponseWriter, r *http.Request, err error) {
		logger.Error("Grafana 代理请求失败", "path", r.URL.Path, "error", err)
		w.WriteHeader(http.StatusBadGateway)
		_, _ = w.Write([]byte(`{"error": "grafana proxy error"}`))
	}

	// 注册 /grafana 路由组，支持所有 HTTP 方法
	grafanaGroup := r.Group("/grafana")
	grafanaGroup.Any("/*path", func(c *gin.Context) {
		// 移除 X-Frame-Options 以允许 iframe 嵌入
		c.Writer.Header().Del("X-Frame-Options")
		proxy.ServeHTTP(c.Writer, c.Request)
	})

	logger.Info("Grafana 反向代理已启用", "target", grafanaURL, "path", "/grafana/*")
}

// mustSub 是 fs.Sub 的便捷封装
func mustSub(fsys fs.FS, dir string) fs.FS {
	sub, err := fs.Sub(fsys, dir)
	if err != nil {
		panic(err)
	}
	return sub
}
