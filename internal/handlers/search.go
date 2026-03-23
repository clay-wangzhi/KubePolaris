package handlers

import (
	"fmt"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
	"k8s.io/apimachinery/pkg/labels"

	"github.com/clay-wangzhi/KubePolaris/internal/config"
	"github.com/clay-wangzhi/KubePolaris/internal/k8s"
	"github.com/clay-wangzhi/KubePolaris/internal/models"
	"github.com/clay-wangzhi/KubePolaris/internal/response"
	"github.com/clay-wangzhi/KubePolaris/internal/services"
	"github.com/clay-wangzhi/KubePolaris/pkg/logger"
)

// SearchHandler 搜索处理器
type SearchHandler struct {
	db            *gorm.DB
	cfg           *config.Config
	k8sMgr        *k8s.ClusterInformerManager
	clusterSvc    *services.ClusterService
	permissionSvc *services.PermissionService
}

// NewSearchHandler 创建搜索处理器
func NewSearchHandler(db *gorm.DB, cfg *config.Config, k8sMgr *k8s.ClusterInformerManager, clusterSvc *services.ClusterService, permSvc *services.PermissionService) *SearchHandler {
	return &SearchHandler{
		db:            db,
		cfg:           cfg,
		k8sMgr:        k8sMgr,
		clusterSvc:    clusterSvc,
		permissionSvc: permSvc,
	}
}

// SearchResult 搜索结果结构
type SearchResult struct {
	Type        string `json:"type"`
	ID          string `json:"id"`
	Name        string `json:"name"`
	Namespace   string `json:"namespace,omitempty"`
	ClusterID   string `json:"clusterId"`
	ClusterName string `json:"clusterName"`
	Status      string `json:"status"`
	Description string `json:"description,omitempty"`
	IP          string `json:"ip,omitempty"`
	Kind        string `json:"kind,omitempty"`
}

// GlobalSearch 全局搜索
func (h *SearchHandler) GlobalSearch(c *gin.Context) {
	query := c.Query("q")
	if query == "" {
		response.BadRequest(c, "搜索关键词不能为空")
		return
	}

	logger.Info("全局搜索: %s", query)

	// 获取用户可访问的集群
	clusters, err := h.getAccessibleClusters(c.GetUint("user_id"))
	if err != nil {
		logger.Error("获取集群列表失败", "error", err)
		response.InternalError(c, "获取集群列表失败")
		return
	}

	var results []SearchResult

	// 搜索集群
	for _, cluster := range clusters {
		if strings.Contains(strings.ToLower(cluster.Name), strings.ToLower(query)) {
			clusterIDStr := strconv.FormatUint(uint64(cluster.ID), 10)
			results = append(results, SearchResult{
				Type:        "cluster",
				ID:          clusterIDStr,
				Name:        cluster.Name,
				ClusterID:   clusterIDStr,
				ClusterName: cluster.Name,
				Status:      cluster.Status,
				Description: cluster.APIServer,
			})
		}
	}

	// 搜索节点、Pod和工作负载
	for _, cluster := range clusters {
		// 确保集群的 informer 已初始化
		_, err := h.k8sMgr.EnsureForCluster(cluster)
		if err != nil {
			logger.Error("初始化集群 informer 失败", "cluster", cluster.Name, "error", err)
			continue
		}

		clusterIDStr := strconv.FormatUint(uint64(cluster.ID), 10)

		// 搜索节点
		nodeLister := h.k8sMgr.NodesLister(cluster.ID)
		if nodeLister != nil {
			nodes, err := nodeLister.List(labels.Everything())
			if err == nil {
				for _, node := range nodes {
					// 搜索节点名称
					if strings.Contains(strings.ToLower(node.Name), strings.ToLower(query)) {
						results = append(results, SearchResult{
							Type:        "node",
							ID:          node.Name,
							Name:        node.Name,
							ClusterID:   clusterIDStr,
							ClusterName: cluster.Name,
							Status:      h.getNodeStatus(node),
							Description: node.Spec.PodCIDR,
							IP:          h.getNodeIP(node),
						})
					}

					// 搜索节点IP
					for _, addr := range node.Status.Addresses {
						if strings.Contains(addr.Address, query) {
							results = append(results, SearchResult{
								Type:        "node",
								ID:          node.Name,
								Name:        node.Name,
								ClusterID:   clusterIDStr,
								ClusterName: cluster.Name,
								Status:      h.getNodeStatus(node),
								Description: node.Spec.PodCIDR,
								IP:          addr.Address,
							})
							break
						}
					}
				}
			}
		}

		// 搜索Pod
		podLister := h.k8sMgr.PodsLister(cluster.ID)
		if podLister != nil {
			pods, err := podLister.List(labels.Everything())
			if err == nil {
				for _, pod := range pods {
					// 搜索Pod名称
					if strings.Contains(strings.ToLower(pod.Name), strings.ToLower(query)) {
						results = append(results, SearchResult{
							Type:        "pod",
							ID:          pod.Name,
							Name:        pod.Name,
							Namespace:   pod.Namespace,
							ClusterID:   clusterIDStr,
							ClusterName: cluster.Name,
							Status:      string(pod.Status.Phase),
							Description: pod.Spec.NodeName,
							IP:          pod.Status.PodIP,
						})
					}

					// 搜索Pod IP
					if strings.Contains(pod.Status.PodIP, query) {
						results = append(results, SearchResult{
							Type:        "pod",
							ID:          pod.Name,
							Name:        pod.Name,
							Namespace:   pod.Namespace,
							ClusterID:   clusterIDStr,
							ClusterName: cluster.Name,
							Status:      string(pod.Status.Phase),
							Description: pod.Spec.NodeName,
							IP:          pod.Status.PodIP,
						})
					}
				}
			}
		}

		// 搜索工作负载
		// Deployment
		deploymentLister := h.k8sMgr.DeploymentsLister(cluster.ID)
		if deploymentLister != nil {
			deployments, err := deploymentLister.List(labels.Everything())
			if err == nil {
				for _, deployment := range deployments {
					if strings.Contains(strings.ToLower(deployment.Name), strings.ToLower(query)) {
						replicas := "1"
						if deployment.Spec.Replicas != nil {
							replicas = strconv.FormatInt(int64(*deployment.Spec.Replicas), 10)
						}
						results = append(results, SearchResult{
							Type:        "workload",
							ID:          deployment.Name,
							Name:        deployment.Name,
							Namespace:   deployment.Namespace,
							ClusterID:   clusterIDStr,
							ClusterName: cluster.Name,
							Status:      "Deployment",
							Kind:        "Deployment",
							Description: replicas,
						})
					}
				}
			}
		}

		// Rollout
		rolloutLister := h.k8sMgr.RolloutsLister(cluster.ID)
		if rolloutLister != nil {
			rollouts, err := rolloutLister.List(labels.Everything())
			if err == nil {
				for _, rollout := range rollouts {
					if strings.Contains(strings.ToLower(rollout.Name), strings.ToLower(query)) {
						results = append(results, SearchResult{
							Type:        "workload",
							ID:          rollout.Name,
							Name:        rollout.Name,
							Namespace:   rollout.Namespace,
							ClusterID:   clusterIDStr,
							ClusterName: cluster.Name,
							Status:      "Rollout",
							Kind:        "Rollout",
							Description: strconv.FormatInt(int64(rollout.Status.AvailableReplicas), 10),
						})
					}
				}
			}
		}

		// StatefulSet
		statefulSetLister := h.k8sMgr.StatefulSetsLister(cluster.ID)
		if statefulSetLister != nil {
			statefulSets, err := statefulSetLister.List(labels.Everything())
			if err == nil {
				for _, statefulSet := range statefulSets {
					if strings.Contains(strings.ToLower(statefulSet.Name), strings.ToLower(query)) {
						replicas := "1"
						if statefulSet.Spec.Replicas != nil {
							replicas = strconv.FormatInt(int64(*statefulSet.Spec.Replicas), 10)
						}
						results = append(results, SearchResult{
							Type:        "workload",
							ID:          statefulSet.Name,
							Name:        statefulSet.Name,
							Namespace:   statefulSet.Namespace,
							ClusterID:   clusterIDStr,
							ClusterName: cluster.Name,
							Status:      "StatefulSet",
							Kind:        "StatefulSet",
							Description: replicas,
						})
					}
				}
			}
		}

		// DaemonSet
		daemonSetLister := h.k8sMgr.DaemonSetsLister(cluster.ID)
		if daemonSetLister != nil {
			daemonSets, err := daemonSetLister.List(labels.Everything())
			if err == nil {
				for _, daemonSet := range daemonSets {
					if strings.Contains(strings.ToLower(daemonSet.Name), strings.ToLower(query)) {
						results = append(results, SearchResult{
							Type:        "workload",
							ID:          daemonSet.Name,
							Name:        daemonSet.Name,
							Namespace:   daemonSet.Namespace,
							ClusterID:   clusterIDStr,
							ClusterName: cluster.Name,
							Status:      "DaemonSet",
							Kind:        "DaemonSet",
							Description: "DaemonSet",
						})
					}
				}
			}
		}
	}

	// 计算统计信息
	stats := struct {
		Cluster  int `json:"cluster"`
		Node     int `json:"node"`
		Pod      int `json:"pod"`
		Workload int `json:"workload"`
	}{}

	for _, result := range results {
		switch result.Type {
		case "cluster":
			stats.Cluster++
		case "node":
			stats.Node++
		case "pod":
			stats.Pod++
		case "workload":
			stats.Workload++
		}
	}

	response.OK(c, gin.H{
		"results": results,
		"total":   len(results),
		"stats":   stats,
	})
}

// QuickSearch 快速搜索（用于顶部搜索栏）
func (h *SearchHandler) QuickSearch(c *gin.Context) {
	query := c.Query("q")
	limitStr := c.DefaultQuery("limit", "10")
	limit, err := strconv.Atoi(limitStr)
	if err != nil {
		limit = 10
	}

	if query == "" {
		response.OK(c, gin.H{
			"results": []SearchResult{},
		})
		return
	}

	logger.Info("快速搜索: %s", query)

	// 获取用户可访问的集群
	clusters, err := h.getAccessibleClusters(c.GetUint("user_id"))
	if err != nil {
		logger.Error("获取集群列表失败", "error", err)
		response.InternalError(c, "获取集群列表失败")
		return
	}

	// 按资源类型分组存储结果，确保每种类型都能被搜索到
	typeResults := map[string][]SearchResult{
		"cluster":  {},
		"node":     {},
		"pod":      {},
		"workload": {},
	}

	// 每种资源类型都有独立的 limit 限制
	typeLimit := limit

	// 遍历所有集群进行搜索
	for _, cluster := range clusters {
		// 确保集群的 informer 已初始化
		_, err := h.k8sMgr.EnsureForCluster(cluster)
		if err != nil {
			logger.Error("初始化集群 informer 失败", "cluster", cluster.Name, "error", err)
			continue
		}

		clusterIDStr := strconv.FormatUint(uint64(cluster.ID), 10)

		// 搜索集群本身
		if len(typeResults["cluster"]) < typeLimit && strings.Contains(strings.ToLower(cluster.Name), strings.ToLower(query)) {
			typeResults["cluster"] = append(typeResults["cluster"], SearchResult{
				Type:        "cluster",
				ID:          clusterIDStr,
				Name:        cluster.Name,
				ClusterID:   clusterIDStr,
				ClusterName: cluster.Name,
				Status:      cluster.Status,
				Description: cluster.APIServer,
			})
		}

		// 搜索节点
		if len(typeResults["node"]) < typeLimit {
			nodeLister := h.k8sMgr.NodesLister(cluster.ID)
			if nodeLister != nil {
				nodes, err := nodeLister.List(labels.Everything())
				if err == nil {
					for _, node := range nodes {
						if len(typeResults["node"]) >= typeLimit {
							break
						}
						if strings.Contains(strings.ToLower(node.Name), strings.ToLower(query)) {
							typeResults["node"] = append(typeResults["node"], SearchResult{
								Type:        "node",
								ID:          node.Name,
								Name:        node.Name,
								ClusterID:   clusterIDStr,
								ClusterName: cluster.Name,
								Status:      h.getNodeStatus(node),
								Description: node.Spec.PodCIDR,
								IP:          h.getNodeIP(node),
							})
						}
					}
				}
			}
		}

		// 搜索Pod
		if len(typeResults["pod"]) < typeLimit {
			podLister := h.k8sMgr.PodsLister(cluster.ID)
			if podLister != nil {
				pods, err := podLister.List(labels.Everything())
				if err == nil {
					for _, pod := range pods {
						if len(typeResults["pod"]) >= typeLimit {
							break
						}
						if strings.Contains(strings.ToLower(pod.Name), strings.ToLower(query)) {
							typeResults["pod"] = append(typeResults["pod"], SearchResult{
								Type:        "pod",
								ID:          pod.Name,
								Name:        pod.Name,
								Namespace:   pod.Namespace,
								ClusterID:   clusterIDStr,
								ClusterName: cluster.Name,
								Status:      string(pod.Status.Phase),
								Description: pod.Spec.NodeName,
								IP:          pod.Status.PodIP,
							})
						}
					}
				}
			}
		}

		// 搜索工作负载
		if len(typeResults["workload"]) < typeLimit {
			// Deployment
			deploymentLister := h.k8sMgr.DeploymentsLister(cluster.ID)
			if deploymentLister != nil {
				deployments, err := deploymentLister.List(labels.Everything())
				if err == nil {
					for _, deployment := range deployments {
						if len(typeResults["workload"]) >= typeLimit {
							break
						}
						if strings.Contains(strings.ToLower(deployment.Name), strings.ToLower(query)) {
							replicas := "1"
							if deployment.Spec.Replicas != nil {
								replicas = strconv.FormatInt(int64(*deployment.Spec.Replicas), 10)
							}
							typeResults["workload"] = append(typeResults["workload"], SearchResult{
								Type:        "workload",
								ID:          deployment.Name,
								Name:        deployment.Name,
								Namespace:   deployment.Namespace,
								ClusterID:   clusterIDStr,
								ClusterName: cluster.Name,
								Status:      "Deployment",
								Kind:        "Deployment",
								Description: replicas,
							})
						}
					}
				}
			}

			// StatefulSet
			if len(typeResults["workload"]) < typeLimit {
				statefulSetLister := h.k8sMgr.StatefulSetsLister(cluster.ID)
				if statefulSetLister != nil {
					statefulSets, err := statefulSetLister.List(labels.Everything())
					if err == nil {
						for _, statefulSet := range statefulSets {
							if len(typeResults["workload"]) >= typeLimit {
								break
							}
							if strings.Contains(strings.ToLower(statefulSet.Name), strings.ToLower(query)) {
								replicas := "1"
								if statefulSet.Spec.Replicas != nil {
									replicas = strconv.FormatInt(int64(*statefulSet.Spec.Replicas), 10)
								}
								typeResults["workload"] = append(typeResults["workload"], SearchResult{
									Type:        "workload",
									ID:          statefulSet.Name,
									Name:        statefulSet.Name,
									Namespace:   statefulSet.Namespace,
									ClusterID:   clusterIDStr,
									ClusterName: cluster.Name,
									Status:      "StatefulSet",
									Kind:        "StatefulSet",
									Description: replicas,
								})
							}
						}
					}
				}
			}

			// DaemonSet
			if len(typeResults["workload"]) < typeLimit {
				daemonSetLister := h.k8sMgr.DaemonSetsLister(cluster.ID)
				if daemonSetLister != nil {
					daemonSets, err := daemonSetLister.List(labels.Everything())
					if err == nil {
						for _, daemonSet := range daemonSets {
							if len(typeResults["workload"]) >= typeLimit {
								break
							}
							if strings.Contains(strings.ToLower(daemonSet.Name), strings.ToLower(query)) {
								typeResults["workload"] = append(typeResults["workload"], SearchResult{
									Type:        "workload",
									ID:          daemonSet.Name,
									Name:        daemonSet.Name,
									Namespace:   daemonSet.Namespace,
									ClusterID:   clusterIDStr,
									ClusterName: cluster.Name,
									Status:      "DaemonSet",
									Kind:        "DaemonSet",
									Description: "DaemonSet",
								})
							}
						}
					}
				}
			}

			// Rollout
			if len(typeResults["workload"]) < typeLimit {
				rolloutLister := h.k8sMgr.RolloutsLister(cluster.ID)
				if rolloutLister != nil {
					rollouts, err := rolloutLister.List(labels.Everything())
					if err == nil {
						for _, rollout := range rollouts {
							if len(typeResults["workload"]) >= typeLimit {
								break
							}
							if strings.Contains(strings.ToLower(rollout.Name), strings.ToLower(query)) {
								typeResults["workload"] = append(typeResults["workload"], SearchResult{
									Type:        "workload",
									ID:          rollout.Name,
									Name:        rollout.Name,
									Namespace:   rollout.Namespace,
									ClusterID:   clusterIDStr,
									ClusterName: cluster.Name,
									Status:      "Rollout",
									Kind:        "Rollout",
									Description: strconv.FormatInt(int64(rollout.Status.AvailableReplicas), 10),
								})
							}
						}
					}
				}
			}
		}
	}

	// 合并所有类型的结果
	var results []SearchResult
	for _, typeResult := range typeResults {
		results = append(results, typeResult...)
	}

	response.OK(c, gin.H{
		"results": results,
	})
}

// getAccessibleClusters 获取用户可访问的集群列表
func (h *SearchHandler) getAccessibleClusters(userID uint) ([]*models.Cluster, error) {
	clusterIDs, isAll, err := h.permissionSvc.GetUserAccessibleClusterIDs(userID)
	if err != nil {
		return nil, err
	}
	if isAll {
		return h.clusterSvc.GetAllClusters()
	}
	if len(clusterIDs) == 0 {
		return []*models.Cluster{}, nil
	}
	var clusters []*models.Cluster
	if err := h.db.Where("id IN ?", clusterIDs).Find(&clusters).Error; err != nil {
		return nil, fmt.Errorf("获取集群列表失败: %w", err)
	}
	return clusters, nil
}

// getNodeStatus 获取节点状态
func (h *SearchHandler) getNodeStatus(node interface{}) string {
	// 这里需要根据实际的节点结构来获取状态
	// 由于我们使用的是 interface{}，这里简化处理
	return "Ready"
}

// getNodeIP 获取节点的主要IP地址
func (h *SearchHandler) getNodeIP(node interface{}) string {
	// 这里需要根据实际的节点结构来获取IP
	// 由于我们使用的是 interface{}，这里简化处理
	return ""
}
