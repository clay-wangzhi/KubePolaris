package handlers

import (
	"context"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/clay-wangzhi/KubePolaris/internal/k8s"
	"github.com/clay-wangzhi/KubePolaris/internal/models"
	"github.com/clay-wangzhi/KubePolaris/internal/services"
	"github.com/clay-wangzhi/KubePolaris/pkg/logger"

	"github.com/gin-gonic/gin"
	"github.com/gorilla/websocket"
	corev1 "k8s.io/api/core/v1"
	"k8s.io/apimachinery/pkg/api/errors"
	"k8s.io/apimachinery/pkg/api/resource"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/types"
	"k8s.io/apimachinery/pkg/util/validation"
	"k8s.io/client-go/kubernetes"
)

const (
	kubectlPodNamespace    = "kubepolaris-system"
	kubectlPodImage        = "registry.cn-hangzhou.aliyuncs.com/clay-wangzhi/kubectl:v0.1"
	kubectlPodPrefix       = "kubepolaris-kubectl-"
	kubectlIdleTimeout     = 1 * time.Hour
	kubectlCleanupInterval = 10 * time.Minute
)

// KubectlPodTerminalHandler kubectl Pod 终端处理器
type KubectlPodTerminalHandler struct {
	clusterService *services.ClusterService
	auditService   *services.AuditService
	k8sMgr         *k8s.ClusterInformerManager
	podTerminal    *PodTerminalHandler
	activeSessions map[string]int // podName -> activeConnections
	sessionsMutex  sync.RWMutex
	upgrader       websocket.Upgrader
}

// NewKubectlPodTerminalHandler 创建 kubectl Pod 终端处理器
func NewKubectlPodTerminalHandler(clusterService *services.ClusterService, auditService *services.AuditService, k8sMgr *k8s.ClusterInformerManager) *KubectlPodTerminalHandler {
	h := &KubectlPodTerminalHandler{
		clusterService: clusterService,
		auditService:   auditService,
		k8sMgr:         k8sMgr,
		podTerminal:    NewPodTerminalHandler(clusterService, auditService, k8sMgr),
		activeSessions: make(map[string]int),
		upgrader: websocket.Upgrader{
			CheckOrigin: func(r *http.Request) bool { return true },
		},
	}

	// 启动后台清理任务
	go h.startCleanupWorker()

	return h
}

// HandleKubectlPodTerminal 处理 kubectl Pod 终端请求
func (h *KubectlPodTerminalHandler) HandleKubectlPodTerminal(c *gin.Context) {
	clusterIDStr := c.Param("clusterID")
	clusterID, err := strconv.ParseUint(clusterIDStr, 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "无效的集群ID"})
		return
	}

	userID := c.GetUint("user_id")

	// 获取用户的集群权限，确定使用哪个 ServiceAccount
	permissionType := "readonly" // 默认只读权限
	var namespaces []string
	var customRoleRef string

	if perm, exists := c.Get("cluster_permission"); exists {
		if cp, ok := perm.(*models.ClusterPermission); ok && cp != nil {
			permissionType = cp.PermissionType
			namespaces = cp.GetNamespaceList()
			customRoleRef = cp.CustomRoleRef
		}
	}

	// 使用 RBACService 获取有效的 ServiceAccount
	rbacSvc := services.NewRBACService()
	rbacConfig := &services.UserRBACConfig{
		UserID:         userID,
		PermissionType: permissionType,
		Namespaces:     namespaces,
		ClusterRoleRef: customRoleRef,
	}
	serviceAccount := rbacSvc.GetEffectiveServiceAccount(rbacConfig)

	logger.Info("用户kubectl终端权限", "userID", userID, "permissionType", permissionType, "namespaces", namespaces, "serviceAccount", serviceAccount)

	targetNS := strings.TrimSpace(c.DefaultQuery("namespace", "default"))
	if targetNS == "" {
		targetNS = "default"
	}
	if errs := validation.IsDNS1123Subdomain(targetNS); len(errs) > 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "无效的命名空间: " + strings.Join(errs, "; ")})
		return
	}
	var clusterPerm *models.ClusterPermission
	if perm, exists := c.Get("cluster_permission"); exists {
		if cp, ok := perm.(*models.ClusterPermission); ok {
			clusterPerm = cp
		}
	}
	if clusterPerm != nil && !services.HasNamespaceAccess(clusterPerm, targetNS) {
		c.JSON(http.StatusForbidden, gin.H{"error": "无权访问该命名空间"})
		return
	}

	// 获取集群信息
	cluster, err := h.clusterService.GetCluster(uint(clusterID))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "集群不存在"})
		return
	}

	// 获取缓存的 K8s 客户端
	k8sClient, err := h.k8sMgr.GetK8sClient(cluster)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "获取K8s客户端失败: " + err.Error()})
		return
	}
	client := k8sClient.GetClientset()

	podName := fmt.Sprintf("%s%d-%s", kubectlPodPrefix, userID, permissionType)
	sessionKey := fmt.Sprintf("%s-%s", clusterIDStr, podName)

	conn, err := h.upgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		logger.Error("kubectl终端升级WebSocket失败", "error", err)
		return
	}

	var sessionCountAdded bool
	defer func() {
		if sessionCountAdded {
			h.sessionsMutex.Lock()
			h.activeSessions[sessionKey]--
			if h.activeSessions[sessionKey] <= 0 {
				delete(h.activeSessions, sessionKey)
			}
			h.sessionsMutex.Unlock()
		}
		_ = conn.Close()
	}()

	h.sendKubectlPrep(conn, "正在准备 kubectl 终端 Pod，请稍候…")

	beforeCreate := func() {
		h.sendKubectlPrep(conn, "正在集群中创建 kubectl 终端 Pod（首次连接可能需要拉取镜像，耗时取决于网络）…")
	}
	if err := h.ensureKubectlPod(client, podName, userID, serviceAccount, permissionType, beforeCreate); err != nil {
		logger.Error("创建kubectl Pod失败", "error", err, "podName", podName)
		h.sendTerminalJSON(conn, "error", fmt.Sprintf("创建 kubectl Pod 失败: %v", err))
		return
	}

	if err := h.waitForPodRunningWithProgress(client, podName, conn); err != nil {
		logger.Error("等待Pod运行失败", "error", err, "podName", podName)
		h.sendTerminalJSON(conn, "error", fmt.Sprintf("等待 Pod 就绪失败: %v", err))
		return
	}

	h.updateLastActivity(client, podName)

	h.sessionsMutex.Lock()
	h.activeSessions[sessionKey]++
	h.sessionsMutex.Unlock()
	sessionCountAdded = true

	logger.Info("kubectl Pod终端连接", "cluster", cluster.Name, "pod", podName, "user", userID)

	h.podTerminal.RunPodTerminalWithConn(
		conn,
		cluster,
		clusterIDStr,
		kubectlPodNamespace,
		podName,
		"kubectl",
		userID,
		services.TerminalTypeKubectl,
		clusterPerm,
		targetNS,
	)
}

func (h *KubectlPodTerminalHandler) sendKubectlPrep(conn *websocket.Conn, text string) {
	_ = conn.WriteJSON(PodTerminalMessage{Type: "kubectl_prep", Data: text})
}

func (h *KubectlPodTerminalHandler) sendTerminalJSON(conn *websocket.Conn, msgType, data string) {
	_ = conn.WriteJSON(PodTerminalMessage{Type: msgType, Data: data})
}

func describeKubectlPodProgress(pod *corev1.Pod) string {
	var parts []string
	if pod.Status.Phase != "" {
		parts = append(parts, fmt.Sprintf("Pod 阶段：%s", pod.Status.Phase))
	}
	for _, ics := range pod.Status.InitContainerStatuses {
		if ics.State.Waiting != nil {
			w := ics.State.Waiting
			s := fmt.Sprintf("初始化容器 %s：%s", ics.Name, w.Reason)
			if w.Message != "" {
				s += " — " + strings.TrimSpace(w.Message)
			}
			parts = append(parts, s)
		}
	}
	for _, cs := range pod.Status.ContainerStatuses {
		if cs.State.Waiting != nil {
			w := cs.State.Waiting
			s := fmt.Sprintf("容器 %s：%s", cs.Name, w.Reason)
			if w.Message != "" {
				s += " — " + strings.TrimSpace(w.Message)
			}
			parts = append(parts, s)
		} else if cs.State.Running != nil {
			parts = append(parts, fmt.Sprintf("容器 %s：已启动", cs.Name))
		}
	}
	if pod.Status.Reason != "" {
		parts = append(parts, fmt.Sprintf("状态说明：%s", pod.Status.Reason))
	}
	for _, cond := range pod.Status.Conditions {
		if cond.Status == corev1.ConditionFalse && cond.Message != "" {
			parts = append(parts, fmt.Sprintf("%s：%s", cond.Type, cond.Message))
		}
	}
	if len(parts) == 0 {
		if pod.Status.Phase != "" {
			return fmt.Sprintf("Pod 阶段：%s（详情尚未上报）", pod.Status.Phase)
		}
		return "等待 Pod 状态上报…"
	}
	return strings.Join(parts, " | ")
}

// ensureKubectlPod 确保 kubectl Pod 存在；即将在集群中新建 Pod 时会调用 beforeCreate（用于向前端推送提示）
func (h *KubectlPodTerminalHandler) ensureKubectlPod(client *kubernetes.Clientset, podName string, userID uint, serviceAccount string, permissionType string, beforeCreate func()) error {
	ctx := context.Background()

	// 检查 Pod 是否已存在
	existingPod, err := client.CoreV1().Pods(kubectlPodNamespace).Get(ctx, podName, metav1.GetOptions{})
	if err == nil {
		// Pod 存在
		if existingPod.Status.Phase == corev1.PodRunning {
			logger.Info("复用已存在的kubectl Pod", "pod", podName, "sa", serviceAccount)
			return nil // 可以复用
		}
		if existingPod.Status.Phase == corev1.PodFailed || existingPod.Status.Phase == corev1.PodSucceeded {
			// 删除旧 Pod，重新创建
			logger.Info("删除已终止的kubectl Pod", "pod", podName, "phase", existingPod.Status.Phase)
			_ = client.CoreV1().Pods(kubectlPodNamespace).Delete(ctx, podName, metav1.DeleteOptions{})
			time.Sleep(2 * time.Second)
		}
		// 如果是 Pending 状态，继续等待
		if existingPod.Status.Phase == corev1.PodPending {
			return nil
		}
	}

	if !errors.IsNotFound(err) && err != nil {
		return err
	}

	// 创建新 Pod，使用对应权限的 ServiceAccount
	logger.Info("创建新的kubectl Pod", "pod", podName, "user", userID, "sa", serviceAccount, "permissionType", permissionType)
	pod := &corev1.Pod{
		ObjectMeta: metav1.ObjectMeta{
			Name:      podName,
			Namespace: kubectlPodNamespace,
			Labels: map[string]string{
				"app":             "kubepolaris-kubectl",
				"user-id":         fmt.Sprintf("%d", userID),
				"permission-type": permissionType,
			},
			Annotations: map[string]string{
				"kubepolaris.io/last-activity":   time.Now().Format(time.RFC3339),
				"kubepolaris.io/permission-type": permissionType,
				"kubepolaris.io/service-account": serviceAccount,
			},
		},
		Spec: corev1.PodSpec{
			ServiceAccountName: serviceAccount, // 使用对应权限的 ServiceAccount
			Containers: []corev1.Container{{
				Name:    "kubectl",
				Image:   kubectlPodImage,
				Command: []string{"sleep", "infinity"},
				Stdin:   true,
				TTY:     true,
				Resources: corev1.ResourceRequirements{
					Requests: corev1.ResourceList{
						corev1.ResourceCPU:    resource.MustParse("100m"),
						corev1.ResourceMemory: resource.MustParse("128Mi"),
					},
					Limits: corev1.ResourceList{
						corev1.ResourceCPU:    resource.MustParse("500m"),
						corev1.ResourceMemory: resource.MustParse("256Mi"),
					},
				},
			}},
			RestartPolicy: corev1.RestartPolicyNever,
		},
	}

	if beforeCreate != nil {
		beforeCreate()
	}
	_, err = client.CoreV1().Pods(kubectlPodNamespace).Create(ctx, pod, metav1.CreateOptions{})
	return err
}

// waitForPodRunningWithProgress 等待 Pod 进入 Running，并通过 WebSocket 推送与上次不同的进度摘要（含镜像拉取、容器 Waiting 原因等）
func (h *KubectlPodTerminalHandler) waitForPodRunningWithProgress(client *kubernetes.Clientset, podName string, conn *websocket.Conn) error {
	ctx, cancel := context.WithTimeout(context.Background(), 120*time.Second)
	defer cancel()

	lastSent := ""
	for {
		pod, err := client.CoreV1().Pods(kubectlPodNamespace).Get(ctx, podName, metav1.GetOptions{})
		if err != nil {
			return err
		}

		if pod.Status.Phase == corev1.PodRunning {
			return nil
		}

		if pod.Status.Phase == corev1.PodFailed {
			return fmt.Errorf("pod启动失败: %s", pod.Status.Message)
		}

		desc := describeKubectlPodProgress(pod)
		if desc != "" && desc != lastSent {
			lastSent = desc
			h.sendKubectlPrep(conn, desc)
		}

		select {
		case <-ctx.Done():
			return fmt.Errorf("等待Pod运行超时")
		case <-time.After(1 * time.Second):
		}
	}
}

// updateLastActivity 更新 Pod 最后活动时间
func (h *KubectlPodTerminalHandler) updateLastActivity(client *kubernetes.Clientset, podName string) {
	ctx := context.Background()
	patch := []byte(fmt.Sprintf(`{"metadata":{"annotations":{"kubepolaris.io/last-activity":"%s"}}}`,
		time.Now().Format(time.RFC3339)))

	_, err := client.CoreV1().Pods(kubectlPodNamespace).Patch(ctx, podName, types.MergePatchType, patch, metav1.PatchOptions{})
	if err != nil {
		logger.Error("更新Pod活动时间失败", "error", err, "pod", podName)
	}
}

// startCleanupWorker 启动后台清理任务
func (h *KubectlPodTerminalHandler) startCleanupWorker() {
	ticker := time.NewTicker(kubectlCleanupInterval)
	logger.Info("kubectl Pod清理任务已启动", "interval", kubectlCleanupInterval)

	for range ticker.C {
		h.cleanupIdlePods()
	}
}

// cleanupIdlePods 清理空闲的 kubectl Pod
func (h *KubectlPodTerminalHandler) cleanupIdlePods() {
	// 获取所有集群
	clusters, err := h.clusterService.GetAllClusters()
	if err != nil {
		logger.Error("获取集群列表失败", "error", err)
		return
	}

	for _, cluster := range clusters {
		h.cleanupClusterIdlePods(cluster)
	}
}

// cleanupClusterIdlePods 清理指定集群的空闲 Pod
func (h *KubectlPodTerminalHandler) cleanupClusterIdlePods(cluster *models.Cluster) {
	k8sClient, err := h.k8sMgr.GetK8sClient(cluster)
	if err != nil {
		return
	}
	client := k8sClient.GetClientset()

	ctx := context.Background()
	pods, err := client.CoreV1().Pods(kubectlPodNamespace).List(ctx, metav1.ListOptions{
		LabelSelector: "app=kubepolaris-kubectl",
	})
	if err != nil {
		return
	}

	for _, pod := range pods.Items {
		// 检查是否有活跃会话
		sessionKey := fmt.Sprintf("%d-%s", cluster.ID, pod.Name)
		h.sessionsMutex.RLock()
		activeCount := h.activeSessions[sessionKey]
		h.sessionsMutex.RUnlock()

		if activeCount > 0 {
			continue // 有活跃连接，不清理
		}

		// 检查空闲时间
		lastActivityStr := pod.Annotations["kubepolaris.io/last-activity"]
		if lastActivityStr == "" {
			continue
		}

		lastActivity, err := time.Parse(time.RFC3339, lastActivityStr)
		if err != nil {
			continue
		}

		if time.Since(lastActivity) > kubectlIdleTimeout {
			logger.Info("清理空闲kubectl Pod", "cluster", cluster.Name, "pod", pod.Name, "idleTime", time.Since(lastActivity))
			_ = client.CoreV1().Pods(kubectlPodNamespace).Delete(ctx, pod.Name, metav1.DeleteOptions{})
		}
	}
}

