package handlers

import (
	"context"
	"fmt"
	"net/http"
	"sort"
	"strconv"
	"time"

	"kubepolaris/internal/config"
	"kubepolaris/internal/k8s"
	"kubepolaris/internal/models"
	"kubepolaris/internal/services"
	"kubepolaris/pkg/logger"

	"strings"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/labels"
)

// PodHandler Pod处理器
type PodHandler struct {
	db             *gorm.DB
	cfg            *config.Config
	clusterService *services.ClusterService
	k8sMgr         *k8s.ClusterInformerManager
}

// NewPodHandler 创建Pod处理器
func NewPodHandler(db *gorm.DB, cfg *config.Config, clusterService *services.ClusterService, k8sMgr *k8s.ClusterInformerManager) *PodHandler {
	return &PodHandler{
		db:             db,
		cfg:            cfg,
		clusterService: clusterService,
		k8sMgr:         k8sMgr,
	}
}

// PodInfo Pod信息
type PodInfo struct {
	Name              string                  `json:"name"`
	Namespace         string                  `json:"namespace"`
	Status            string                  `json:"status"`
	Phase             string                  `json:"phase"`
	NodeName          string                  `json:"nodeName"`
	PodIP             string                  `json:"podIP"`
	HostIP            string                  `json:"hostIP"`
	RestartCount      int32                   `json:"restartCount"`
	CreatedAt         time.Time               `json:"createdAt"`
	Labels            map[string]string       `json:"labels"`
	Annotations       map[string]string       `json:"annotations"`
	OwnerReferences   []metav1.OwnerReference `json:"ownerReferences"`
	Containers        []ContainerInfo         `json:"containers"`
	InitContainers    []ContainerInfo         `json:"initContainers"`
	Conditions        []PodCondition          `json:"conditions"`
	QOSClass          string                  `json:"qosClass"`
	ServiceAccount    string                  `json:"serviceAccount"`
	Priority          *int32                  `json:"priority,omitempty"`
	PriorityClassName string                  `json:"priorityClassName,omitempty"`
}

// ContainerInfo 容器信息
type ContainerInfo struct {
	Name         string            `json:"name"`
	Image        string            `json:"image"`
	Ready        bool              `json:"ready"`
	RestartCount int32             `json:"restartCount"`
	State        ContainerState    `json:"state"`
	Resources    ContainerResource `json:"resources"`
	Ports        []ContainerPort   `json:"ports"`
}

// ContainerState 容器状态
type ContainerState struct {
	State     string     `json:"state"`
	Reason    string     `json:"reason,omitempty"`
	Message   string     `json:"message,omitempty"`
	StartedAt *time.Time `json:"startedAt,omitempty"`
}

// ContainerResource 容器资源
type ContainerResource struct {
	Requests map[string]string `json:"requests"`
	Limits   map[string]string `json:"limits"`
}

// ContainerPort 容器端口
type ContainerPort struct {
	Name          string `json:"name,omitempty"`
	ContainerPort int32  `json:"containerPort"`
	Protocol      string `json:"protocol"`
}

// PodCondition Pod条件
type PodCondition struct {
	Type               string    `json:"type"`
	Status             string    `json:"status"`
	LastProbeTime      time.Time `json:"lastProbeTime,omitempty"`
	LastTransitionTime time.Time `json:"lastTransitionTime"`
	Reason             string    `json:"reason,omitempty"`
	Message            string    `json:"message,omitempty"`
}

// GetPods 获取Pod列表
func (h *PodHandler) GetPods(c *gin.Context) {
	clusterId := c.Param("clusterID")
	namespace := c.Query("namespace")
	nodeName := c.Query("nodeName")
	labelSelector := c.Query("labelSelector")
	fieldSelector := c.Query("fieldSelector")
	search := c.Query("search") // 新增搜索参数
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("pageSize", "20"))

	logger.Info("获取Pod列表: cluster=%s, namespace=%s, node=%s, search=%s", clusterId, namespace, nodeName, search)

	// 从集群服务获取集群信息
	clusterID := parseClusterID(clusterId)
	cluster, err := h.clusterService.GetCluster(clusterID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{
			"code":    404,
			"message": "集群不存在",
		})
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	// 确保 informer 缓存就绪
	if _, err := h.k8sMgr.EnsureAndWait(ctx, cluster, 5*time.Second); err != nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"code": 503, "message": "informer 未就绪: " + err.Error()})
		return
	}
	// label 选择器
	sel := labels.Everything()
	if labelSelector != "" {
		if s, err := labels.Parse(labelSelector); err == nil {
			sel = s
		}
	}
	// 节点过滤（支持 nodeName 或 fieldSelector=spec.nodeName=xxx）
	nodeFilter := ""
	if nodeName != "" {
		nodeFilter = nodeName
	} else if fieldSelector != "" && strings.HasPrefix(fieldSelector, "spec.nodeName=") {
		nodeFilter = strings.TrimPrefix(fieldSelector, "spec.nodeName=")
	}

	var pods []PodInfo
	if namespace != "" {
		podObjs, err := h.k8sMgr.PodsLister(cluster.ID).Pods(namespace).List(sel)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"code": 500, "message": "读取Pod缓存失败: " + err.Error()})
			return
		}
		filtered := make([]corev1.Pod, 0, len(podObjs))
		for _, p := range podObjs {
			if nodeFilter == "" || p.Spec.NodeName == nodeFilter {
				filtered = append(filtered, *p)
			}
		}
		pods = h.convertPodsToInfo(filtered)
	} else {
		podObjs, err := h.k8sMgr.PodsLister(cluster.ID).List(sel)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"code": 500, "message": "读取Pod缓存失败: " + err.Error()})
			return
		}
		filtered := make([]corev1.Pod, 0, len(podObjs))
		for _, p := range podObjs {
			if nodeFilter == "" || p.Spec.NodeName == nodeFilter {
				filtered = append(filtered, *p)
			}
		}
		pods = h.convertPodsToInfo(filtered)
	}

	// 搜索过滤
	if search != "" {
		filteredPods := make([]PodInfo, 0)
		searchLower := strings.ToLower(search)
		for _, pod := range pods {
			if strings.Contains(strings.ToLower(pod.Name), searchLower) ||
				strings.Contains(strings.ToLower(pod.Namespace), searchLower) ||
				strings.Contains(strings.ToLower(pod.NodeName), searchLower) {
				filteredPods = append(filteredPods, pod)
			}
		}
		pods = filteredPods
	}

	// 按创建时间排序（最新的在前）
	sort.Slice(pods, func(i, j int) bool {
		return pods[i].CreatedAt.After(pods[j].CreatedAt)
	})

	// 分页处理
	total := len(pods)
	start := (page - 1) * pageSize
	end := start + pageSize
	if start > total {
		start = total
	}
	if end > total {
		end = total
	}

	pagedPods := pods[start:end]

	c.JSON(http.StatusOK, gin.H{
		"code":    200,
		"message": "获取成功",
		"data": gin.H{
			"items":    pagedPods,
			"total":    total,
			"page":     page,
			"pageSize": pageSize,
		},
	})
}

// GetPod 获取Pod详情
func (h *PodHandler) GetPod(c *gin.Context) {
	clusterId := c.Param("clusterID")
	namespace := c.Param("namespace")
	name := c.Param("name")

	logger.Info("获取Pod详情: %s/%s/%s", clusterId, namespace, name)

	// 从集群服务获取集群信息
	clusterID := parseClusterID(clusterId)
	cluster, err := h.clusterService.GetCluster(clusterID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{
			"code":    404,
			"message": "集群不存在",
		})
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	// 使用 informer+lister 获取Pod详情
	if _, err := h.k8sMgr.EnsureAndWait(ctx, cluster, 5*time.Second); err != nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"code": 503, "message": "informer 未就绪: " + err.Error()})
		return
	}
	pod, err := h.k8sMgr.PodsLister(cluster.ID).Pods(namespace).Get(name)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"code": 404, "message": "Pod不存在: " + err.Error()})
		return
	}

	podInfo := h.convertPodToInfo(*pod)

	c.JSON(http.StatusOK, gin.H{
		"code":    200,
		"message": "获取成功",
		"data": gin.H{
			"pod": podInfo,
			"raw": pod,
		},
	})
}

// DeletePod 删除Pod
func (h *PodHandler) DeletePod(c *gin.Context) {
	clusterId := c.Param("clusterID")
	namespace := c.Param("namespace")
	name := c.Param("name")

	logger.Info("删除Pod: %s/%s/%s", clusterId, namespace, name)

	// 从集群服务获取集群信息
	clusterID := parseClusterID(clusterId)
	cluster, err := h.clusterService.GetCluster(clusterID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{
			"code":    404,
			"message": "集群不存在",
		})
		return
	}

	// 创建K8s客户端
	var k8sClient *services.K8sClient
	if cluster.KubeconfigEnc != "" {
		k8sClient, err = services.NewK8sClientFromKubeconfig(cluster.KubeconfigEnc)
	} else {
		k8sClient, err = services.NewK8sClientFromToken(cluster.APIServer, cluster.SATokenEnc, cluster.CAEnc)
	}
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"code":    500,
			"message": "创建K8s客户端失败: " + err.Error(),
		})
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	// 删除Pod
	deletePolicy := metav1.DeletePropagationForeground
	deleteOptions := metav1.DeleteOptions{
		PropagationPolicy: &deletePolicy,
	}

	err = k8sClient.GetClientset().CoreV1().Pods(namespace).Delete(ctx, name, deleteOptions)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"code":    500,
			"message": "删除失败: " + err.Error(),
		})
		return
	}

	// 记录审计日志
	auditLog := models.AuditLog{
		UserID:       1, // TODO: 从上下文获取用户ID
		Action:       "delete_pod",
		ResourceType: "pod",
		ResourceRef:  fmt.Sprintf(`{"cluster_id":"%s","namespace":"%s","name":"%s"}`, clusterId, namespace, name),
		Result:       "success",
		Details:      fmt.Sprintf("删除Pod %s/%s", namespace, name),
	}
	h.db.Create(&auditLog)

	c.JSON(http.StatusOK, gin.H{
		"code":    200,
		"message": "删除成功",
		"data":    nil,
	})
}

// GetPodLogs 获取Pod日志
func (h *PodHandler) GetPodLogs(c *gin.Context) {
	clusterId := c.Param("clusterID")
	namespace := c.Param("namespace")
	name := c.Param("name")
	container := c.Query("container")
	follow := c.Query("follow") == "true"
	previous := c.Query("previous") == "true"
	tailLines := c.Query("tailLines")
	sinceSeconds := c.Query("sinceSeconds")

	logger.Info("获取Pod日志: %s/%s/%s, container=%s", clusterId, namespace, name, container)

	// 从集群服务获取集群信息
	clusterID := parseClusterID(clusterId)
	cluster, err := h.clusterService.GetCluster(clusterID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{
			"code":    404,
			"message": "集群不存在",
		})
		return
	}

	// 创建K8s客户端
	var k8sClient *services.K8sClient
	if cluster.KubeconfigEnc != "" {
		k8sClient, err = services.NewK8sClientFromKubeconfig(cluster.KubeconfigEnc)
	} else {
		k8sClient, err = services.NewK8sClientFromToken(cluster.APIServer, cluster.SATokenEnc, cluster.CAEnc)
	}
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"code":    500,
			"message": "创建K8s客户端失败: " + err.Error(),
		})
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	// 构建日志选项
	logOptions := &corev1.PodLogOptions{
		Follow:   follow,
		Previous: previous,
	}

	if container != "" {
		logOptions.Container = container
	}

	if tailLines != "" {
		if lines, err := strconv.ParseInt(tailLines, 10, 64); err == nil {
			logOptions.TailLines = &lines
		}
	}

	if sinceSeconds != "" {
		if seconds, err := strconv.ParseInt(sinceSeconds, 10, 64); err == nil {
			logOptions.SinceSeconds = &seconds
		}
	}

	// 获取日志
	req := k8sClient.GetClientset().CoreV1().Pods(namespace).GetLogs(name, logOptions)
	logs, err := req.Stream(ctx)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"code":    500,
			"message": "获取日志失败: " + err.Error(),
		})
		return
	}
	defer logs.Close()

	// 如果是follow模式，使用WebSocket流式传输
	if follow {
		// TODO: 实现WebSocket流式日志传输
		c.JSON(http.StatusNotImplemented, gin.H{
			"code":    501,
			"message": "流式日志功能待实现",
		})
		return
	}

	// 读取日志内容
	buf := make([]byte, 4096)
	var logContent string
	for {
		n, err := logs.Read(buf)
		if n > 0 {
			logContent += string(buf[:n])
		}
		if err != nil {
			break
		}
	}

	c.JSON(http.StatusOK, gin.H{
		"code":    200,
		"message": "获取成功",
		"data": gin.H{
			"logs": logContent,
		},
	})
}

// convertPodsToInfo 转换Pod列表为PodInfo
func (h *PodHandler) convertPodsToInfo(pods []corev1.Pod) []PodInfo {
	var podInfos []PodInfo
	for _, pod := range pods {
		podInfos = append(podInfos, h.convertPodToInfo(pod))
	}
	return podInfos
}

// convertPodToInfo 转换Pod为PodInfo
func (h *PodHandler) convertPodToInfo(pod corev1.Pod) PodInfo {
	// 计算重启次数
	var restartCount int32
	for _, containerStatus := range pod.Status.ContainerStatuses {
		restartCount += containerStatus.RestartCount
	}

	// 转换容器信息
	containers := make([]ContainerInfo, 0, len(pod.Spec.Containers))
	for i, container := range pod.Spec.Containers {
		containerInfo := ContainerInfo{
			Name:  container.Name,
			Image: container.Image,
			Resources: ContainerResource{
				Requests: make(map[string]string),
				Limits:   make(map[string]string),
			},
		}

		// 资源信息
		if container.Resources.Requests != nil {
			for k, v := range container.Resources.Requests {
				containerInfo.Resources.Requests[string(k)] = v.String()
			}
		}
		if container.Resources.Limits != nil {
			for k, v := range container.Resources.Limits {
				containerInfo.Resources.Limits[string(k)] = v.String()
			}
		}

		// 端口信息
		for _, port := range container.Ports {
			containerInfo.Ports = append(containerInfo.Ports, ContainerPort{
				Name:          port.Name,
				ContainerPort: port.ContainerPort,
				Protocol:      string(port.Protocol),
			})
		}

		// 状态信息
		if i < len(pod.Status.ContainerStatuses) {
			status := pod.Status.ContainerStatuses[i]
			containerInfo.Ready = status.Ready
			containerInfo.RestartCount = status.RestartCount

			if status.State.Running != nil {
				containerInfo.State = ContainerState{
					State:     "Running",
					StartedAt: &status.State.Running.StartedAt.Time,
				}
			} else if status.State.Waiting != nil {
				containerInfo.State = ContainerState{
					State:   "Waiting",
					Reason:  status.State.Waiting.Reason,
					Message: status.State.Waiting.Message,
				}
			} else if status.State.Terminated != nil {
				containerInfo.State = ContainerState{
					State:     "Terminated",
					Reason:    status.State.Terminated.Reason,
					Message:   status.State.Terminated.Message,
					StartedAt: &status.State.Terminated.StartedAt.Time,
				}
			}
		}

		containers = append(containers, containerInfo)
	}

	// 转换Init容器信息
	initContainers := make([]ContainerInfo, 0, len(pod.Spec.InitContainers))
	for i, container := range pod.Spec.InitContainers {
		containerInfo := ContainerInfo{
			Name:  container.Name,
			Image: container.Image,
			Resources: ContainerResource{
				Requests: make(map[string]string),
				Limits:   make(map[string]string),
			},
		}

		// 状态信息
		if i < len(pod.Status.InitContainerStatuses) {
			status := pod.Status.InitContainerStatuses[i]
			containerInfo.Ready = status.Ready
			containerInfo.RestartCount = status.RestartCount
		}

		initContainers = append(initContainers, containerInfo)
	}

	// 转换条件信息
	conditions := make([]PodCondition, 0, len(pod.Status.Conditions))
	for _, condition := range pod.Status.Conditions {
		conditions = append(conditions, PodCondition{
			Type:               string(condition.Type),
			Status:             string(condition.Status),
			LastProbeTime:      condition.LastProbeTime.Time,
			LastTransitionTime: condition.LastTransitionTime.Time,
			Reason:             condition.Reason,
			Message:            condition.Message,
		})
	}

	return PodInfo{
		Name:              pod.Name,
		Namespace:         pod.Namespace,
		Status:            h.getPodStatus(pod),
		Phase:             string(pod.Status.Phase),
		NodeName:          pod.Spec.NodeName,
		PodIP:             pod.Status.PodIP,
		HostIP:            pod.Status.HostIP,
		RestartCount:      restartCount,
		CreatedAt:         pod.CreationTimestamp.Time,
		Labels:            pod.Labels,
		Annotations:       pod.Annotations,
		OwnerReferences:   pod.OwnerReferences,
		Containers:        containers,
		InitContainers:    initContainers,
		Conditions:        conditions,
		QOSClass:          string(pod.Status.QOSClass),
		ServiceAccount:    pod.Spec.ServiceAccountName,
		Priority:          pod.Spec.Priority,
		PriorityClassName: pod.Spec.PriorityClassName,
	}
}

// getPodStatus 获取Pod状态
func (h *PodHandler) getPodStatus(pod corev1.Pod) string {
	if pod.DeletionTimestamp != nil {
		return "Terminating"
	}

	switch pod.Status.Phase {
	case corev1.PodPending:
		// 检查是否有容器在等待
		for _, containerStatus := range pod.Status.ContainerStatuses {
			if containerStatus.State.Waiting != nil {
				if containerStatus.State.Waiting.Reason == "ImagePullBackOff" ||
					containerStatus.State.Waiting.Reason == "ErrImagePull" {
					return containerStatus.State.Waiting.Reason
				}
			}
		}
		return "Pending"
	case corev1.PodRunning:
		// 检查是否所有容器都就绪
		ready := 0
		total := len(pod.Status.ContainerStatuses)
		for _, containerStatus := range pod.Status.ContainerStatuses {
			if containerStatus.Ready {
				ready++
			} else if containerStatus.State.Waiting != nil {
				return containerStatus.State.Waiting.Reason
			} else if containerStatus.State.Terminated != nil {
				return containerStatus.State.Terminated.Reason
			}
		}
		if ready == total {
			return "Running"
		}
		return fmt.Sprintf("NotReady (%d/%d)", ready, total)
	case corev1.PodSucceeded:
		return "Completed"
	case corev1.PodFailed:
		return "Failed"
	default:
		return string(pod.Status.Phase)
	}
}

// GetPodNamespaces 获取Pod的命名空间列表
func (h *PodHandler) GetPodNamespaces(c *gin.Context) {
	clusterId := c.Param("clusterID")

	logger.Info("获取Pod命名空间列表: cluster=%s", clusterId)

	// 从集群服务获取集群信息
	clusterID := parseClusterID(clusterId)
	cluster, err := h.clusterService.GetCluster(clusterID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{
			"code":    404,
			"message": "集群不存在",
		})
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	// 确保 informer 缓存就绪
	if _, err := h.k8sMgr.EnsureAndWait(ctx, cluster, 5*time.Second); err != nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"code": 503, "message": "informer 未就绪: " + err.Error()})
		return
	}

	// 获取所有Pod的命名空间
	sel := labels.Everything()
	pods, err := h.k8sMgr.PodsLister(cluster.ID).List(sel)
	if err != nil {
		logger.Error("读取Pod缓存失败", "error", err)
		c.JSON(http.StatusInternalServerError, gin.H{
			"code":    500,
			"message": "获取命名空间列表失败: " + err.Error(),
		})
		return
	}

	// 收集唯一的命名空间
	namespaceSet := make(map[string]bool)
	for _, pod := range pods {
		namespaceSet[pod.Namespace] = true
	}

	// 转换为切片并排序
	var namespaces []string
	for ns := range namespaceSet {
		namespaces = append(namespaces, ns)
	}
	sort.Strings(namespaces)

	// 如果没有找到命名空间，返回默认的
	if len(namespaces) == 0 {
		namespaces = []string{"default", "kube-system", "kube-public", "kube-node-lease"}
	}

	c.JSON(http.StatusOK, gin.H{
		"code":    200,
		"message": "获取成功",
		"data":    namespaces,
	})
}

// GetPodNodes 获取Pod的节点列表
func (h *PodHandler) GetPodNodes(c *gin.Context) {
	clusterId := c.Param("clusterID")

	logger.Info("获取Pod节点列表: cluster=%s", clusterId)

	// 从集群服务获取集群信息
	clusterID := parseClusterID(clusterId)
	cluster, err := h.clusterService.GetCluster(clusterID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{
			"code":    404,
			"message": "集群不存在",
		})
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	// 确保 informer 缓存就绪
	if _, err := h.k8sMgr.EnsureAndWait(ctx, cluster, 5*time.Second); err != nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"code": 503, "message": "informer 未就绪: " + err.Error()})
		return
	}

	// 获取所有Pod的节点
	sel := labels.Everything()
	pods, err := h.k8sMgr.PodsLister(cluster.ID).List(sel)
	if err != nil {
		logger.Error("读取Pod缓存失败", "error", err)
		c.JSON(http.StatusInternalServerError, gin.H{
			"code":    500,
			"message": "获取节点列表失败: " + err.Error(),
		})
		return
	}

	// 收集唯一的节点名称
	nodeSet := make(map[string]bool)
	for _, pod := range pods {
		if pod.Spec.NodeName != "" {
			nodeSet[pod.Spec.NodeName] = true
		}
	}

	// 转换为切片并排序
	var nodes []string
	for node := range nodeSet {
		nodes = append(nodes, node)
	}
	sort.Strings(nodes)

	c.JSON(http.StatusOK, gin.H{
		"code":    200,
		"message": "获取成功",
		"data":    nodes,
	})
}
