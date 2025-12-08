/** genAI_main_start */
package handlers

import (
	"context"
	"fmt"
	"net/http"
	"sort"
	"strconv"
	"strings"
	"time"

	"kubepolaris/internal/config"
	"kubepolaris/internal/k8s"
	"kubepolaris/internal/models"
	"kubepolaris/internal/services"
	"kubepolaris/pkg/logger"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
	appsv1 "k8s.io/api/apps/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/labels"
	"k8s.io/apimachinery/pkg/runtime/serializer"
	"k8s.io/apimachinery/pkg/util/yaml"
	"k8s.io/client-go/kubernetes/scheme"
	sigsyaml "sigs.k8s.io/yaml"
)

// DeploymentHandler Deployment处理器
type DeploymentHandler struct {
	db             *gorm.DB
	cfg            *config.Config
	clusterService *services.ClusterService
	k8sMgr         *k8s.ClusterInformerManager
}

// NewDeploymentHandler 创建Deployment处理器
func NewDeploymentHandler(db *gorm.DB, cfg *config.Config, clusterService *services.ClusterService, k8sMgr *k8s.ClusterInformerManager) *DeploymentHandler {
	return &DeploymentHandler{
		db:             db,
		cfg:            cfg,
		clusterService: clusterService,
		k8sMgr:         k8sMgr,
	}
}

// DeploymentInfo Deployment信息
type DeploymentInfo struct {
	ID                string            `json:"id"`
	Name              string            `json:"name"`
	Namespace         string            `json:"namespace"`
	Type              string            `json:"type"`
	Status            string            `json:"status"`
	Replicas          int32             `json:"replicas"`
	ReadyReplicas     int32             `json:"readyReplicas"`
	AvailableReplicas int32             `json:"availableReplicas"`
	UpdatedReplicas   int32             `json:"updatedReplicas"`
	Labels            map[string]string `json:"labels"`
	Annotations       map[string]string `json:"annotations"`
	CreatedAt         time.Time         `json:"createdAt"`
	Images            []string          `json:"images"`
	Selector          map[string]string `json:"selector"`
	Strategy          string            `json:"strategy"`
	CPULimit          string            `json:"cpuLimit"`
	CPURequest        string            `json:"cpuRequest"`
	MemoryLimit       string            `json:"memoryLimit"`
	MemoryRequest     string            `json:"memoryRequest"`
}

// ListDeployments 获取Deployment列表
func (h *DeploymentHandler) ListDeployments(c *gin.Context) {
	clusterId := c.Param("clusterID")
	namespace := c.Query("namespace")
	searchName := c.Query("search")
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("pageSize", "20"))

	logger.Info("获取Deployment列表: cluster=%s, namespace=%s, search=%s", clusterId, namespace, searchName)

	// 获取集群信息
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
		c.JSON(http.StatusServiceUnavailable, gin.H{
			"code":    503,
			"message": "informer 未就绪: " + err.Error(),
		})
		return
	}

	var deployments []DeploymentInfo
	sel := labels.Everything()

	// 从Informer缓存读取
	if namespace != "" {
		deps, err := h.k8sMgr.DeploymentsLister(cluster.ID).Deployments(namespace).List(sel)
		if err != nil {
			logger.Error("读取Deployment缓存失败", "error", err)
		} else {
			for _, d := range deps {
				deployments = append(deployments, h.convertToDeploymentInfo(d))
			}
		}
	} else {
		deps, err := h.k8sMgr.DeploymentsLister(cluster.ID).List(sel)
		if err != nil {
			logger.Error("读取Deployment缓存失败", "error", err)
		} else {
			for _, d := range deps {
				deployments = append(deployments, h.convertToDeploymentInfo(d))
			}
		}
	}

	// 搜索过滤
	if searchName != "" {
		var filtered []DeploymentInfo
		searchLower := strings.ToLower(searchName)
		for _, dep := range deployments {
			if strings.Contains(strings.ToLower(dep.Name), searchLower) {
				filtered = append(filtered, dep)
			}
		}
		deployments = filtered
	}

	// 排序
	sort.Slice(deployments, func(i, j int) bool {
		return deployments[i].CreatedAt.After(deployments[j].CreatedAt)
	})

	// 分页
	total := len(deployments)
	start := (page - 1) * pageSize
	end := start + pageSize
	if start > total {
		start = total
	}
	if end > total {
		end = total
	}
	pagedDeployments := deployments[start:end]

	c.JSON(http.StatusOK, gin.H{
		"code":    200,
		"message": "success",
		"data": gin.H{
			"items":    pagedDeployments,
			"total":    total,
			"page":     page,
			"pageSize": pageSize,
		},
	})
}

// GetDeployment 获取Deployment详情
func (h *DeploymentHandler) GetDeployment(c *gin.Context) {
	clusterId := c.Param("clusterID")
	namespace := c.Param("namespace")
	name := c.Param("name")

	logger.Info("获取Deployment详情: %s/%s/%s", clusterId, namespace, name)

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

	clientset := k8sClient.GetClientset()
	deployment, err := clientset.AppsV1().Deployments(namespace).Get(ctx, name, metav1.GetOptions{})
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{
			"code":    404,
			"message": "Deployment不存在: " + err.Error(),
		})
		return
	}

	// 获取关联的Pods
	pods, err := clientset.CoreV1().Pods(namespace).List(ctx, metav1.ListOptions{
		LabelSelector: metav1.FormatLabelSelector(deployment.Spec.Selector),
	})
	if err != nil {
		logger.Error("获取Deployment关联Pods失败", "error", err)
	}

	/** genAI_main_start */
	// 清理对象以生成更干净的 YAML
	cleanDeployment := deployment.DeepCopy()
	// 设置 TypeMeta（client-go 获取的对象默认不包含这些字段）
	cleanDeployment.APIVersion = "apps/v1"
	cleanDeployment.Kind = "Deployment"
	// 清理不需要的字段
	cleanDeployment.ManagedFields = nil
	cleanDeployment.Status = appsv1.DeploymentStatus{} // 清理 status 字段
	// 清理 metadata 中的运行时字段
	cleanDeployment.ResourceVersion = ""
	cleanDeployment.UID = ""
	cleanDeployment.Generation = 0
	cleanDeployment.CreationTimestamp = metav1.Time{}
	// 将 Deployment 对象转换为 YAML 字符串
	yamlBytes, yamlErr := sigsyaml.Marshal(cleanDeployment)
	var yamlString string
	if yamlErr == nil {
		yamlString = string(yamlBytes)
	} else {
		logger.Error("转换Deployment为YAML失败", "error", yamlErr)
		yamlString = ""
	}
	/** genAI_main_end */

	c.JSON(http.StatusOK, gin.H{
		"code":    200,
		"message": "success",
		"data": gin.H{
			"workload": h.convertToDeploymentInfo(deployment),
			"raw":      deployment,
			"yaml":     yamlString,
			"pods":     pods,
		},
	})
}

// GetDeploymentNamespaces 获取包含Deployment的命名空间列表
func (h *DeploymentHandler) GetDeploymentNamespaces(c *gin.Context) {
	clusterId := c.Param("clusterID")

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
		c.JSON(http.StatusServiceUnavailable, gin.H{
			"code":    503,
			"message": "informer 未就绪: " + err.Error(),
		})
		return
	}

	// 从Informer读取所有Deployments并统计命名空间
	sel := labels.Everything()
	deps, err := h.k8sMgr.DeploymentsLister(cluster.ID).List(sel)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"code":    500,
			"message": "读取Deployment缓存失败: " + err.Error(),
		})
		return
	}

	// 统计每个命名空间的Deployment数量
	nsCount := make(map[string]int)
	for _, dep := range deps {
		nsCount[dep.Namespace]++
	}

	// 转换为列表格式
	type NamespaceInfo struct {
		Name  string `json:"name"`
		Count int    `json:"count"`
	}

	var namespaces []NamespaceInfo
	for ns, count := range nsCount {
		namespaces = append(namespaces, NamespaceInfo{
			Name:  ns,
			Count: count,
		})
	}

	// 按名称排序
	sort.Slice(namespaces, func(i, j int) bool {
		return namespaces[i].Name < namespaces[j].Name
	})

	c.JSON(http.StatusOK, gin.H{
		"code":    200,
		"message": "success",
		"data":    namespaces,
	})
}

// ScaleDeployment 扩缩容Deployment
func (h *DeploymentHandler) ScaleDeployment(c *gin.Context) {
	clusterId := c.Param("clusterID")
	namespace := c.Param("namespace")
	name := c.Param("name")

	var req ScaleRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"code":    400,
			"message": "参数错误: " + err.Error(),
		})
		return
	}

	logger.Info("扩缩容Deployment: %s/%s/%s to %d", clusterId, namespace, name, req.Replicas)

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

	clientset := k8sClient.GetClientset()
	scale, err := clientset.AppsV1().Deployments(namespace).GetScale(ctx, name, metav1.GetOptions{})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"code":    500,
			"message": "获取Deployment Scale失败: " + err.Error(),
		})
		return
	}

	scale.Spec.Replicas = req.Replicas
	_, err = clientset.AppsV1().Deployments(namespace).UpdateScale(ctx, name, scale, metav1.UpdateOptions{})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"code":    500,
			"message": "扩缩容失败: " + err.Error(),
		})
		return
	}

	// 记录审计日志
	auditLog := models.AuditLog{
		UserID:       1, // TODO: 从上下文获取用户ID
		Action:       "scale_deployment",
		ResourceType: "deployment",
		ResourceRef:  fmt.Sprintf(`{"cluster_id":"%s","namespace":"%s","name":"%s"}`, clusterId, namespace, name),
		Result:       "success",
		Details:      fmt.Sprintf("扩缩容Deployment %s/%s 到 %d 个副本", namespace, name, req.Replicas),
	}
	h.db.Create(&auditLog)

	c.JSON(http.StatusOK, gin.H{
		"code":    200,
		"message": "扩缩容成功",
	})
}

// ApplyYAML 应用Deployment YAML
func (h *DeploymentHandler) ApplyYAML(c *gin.Context) {
	clusterId := c.Param("clusterID")

	var req YAMLApplyRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"code":    400,
			"message": "参数错误: " + err.Error(),
		})
		return
	}

	logger.Info("应用Deployment YAML: cluster=%s, dryRun=%v", clusterId, req.DryRun)

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

	// 解析YAML
	var objMap map[string]interface{}
	if err := yaml.Unmarshal([]byte(req.YAML), &objMap); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"code":    400,
			"message": "YAML格式错误: " + err.Error(),
		})
		return
	}

	// 验证必要字段
	if objMap["apiVersion"] == nil || objMap["kind"] == nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"code":    400,
			"message": "YAML缺少必要字段: apiVersion 或 kind",
		})
		return
	}

	kind := objMap["kind"].(string)
	if kind != "Deployment" {
		c.JSON(http.StatusBadRequest, gin.H{
			"code":    400,
			"message": "YAML类型错误，期望Deployment，实际为: " + kind,
		})
		return
	}

	// 获取metadata
	metadata, ok := objMap["metadata"].(map[string]interface{})
	if !ok {
		c.JSON(http.StatusBadRequest, gin.H{
			"code":    400,
			"message": "YAML缺少 metadata 字段",
		})
		return
	}

	name, _ := metadata["name"].(string)
	namespace, _ := metadata["namespace"].(string)
	if namespace == "" {
		namespace = "default"
	}

	// 应用YAML
	result, err := h.applyYAML(ctx, k8sClient, req.YAML, namespace, req.DryRun)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"code":    500,
			"message": "YAML应用失败: " + err.Error(),
		})
		return
	}

	// 记录审计日志
	if !req.DryRun {
		auditLog := models.AuditLog{
			UserID:       1, // TODO: 从上下文获取用户ID
			Action:       "apply_yaml",
			ResourceType: "deployment",
			ResourceRef:  fmt.Sprintf(`{"cluster_id":"%s","namespace":"%s","name":"%s"}`, clusterId, namespace, name),
			Result:       "success",
			Details:      fmt.Sprintf("应用Deployment YAML: %s/%s", namespace, name),
		}
		h.db.Create(&auditLog)
	}

	c.JSON(http.StatusOK, gin.H{
		"code":    200,
		"message": "YAML应用成功",
		"data":    result,
	})
}

// DeleteDeployment 删除Deployment
func (h *DeploymentHandler) DeleteDeployment(c *gin.Context) {
	clusterId := c.Param("clusterID")
	namespace := c.Param("namespace")
	name := c.Param("name")

	logger.Info("删除Deployment: %s/%s/%s", clusterId, namespace, name)

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

	clientset := k8sClient.GetClientset()
	err = clientset.AppsV1().Deployments(namespace).Delete(ctx, name, metav1.DeleteOptions{})
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
		Action:       "delete_deployment",
		ResourceType: "deployment",
		ResourceRef:  fmt.Sprintf(`{"cluster_id":"%s","namespace":"%s","name":"%s"}`, clusterId, namespace, name),
		Result:       "success",
		Details:      fmt.Sprintf("删除Deployment: %s/%s", namespace, name),
	}
	h.db.Create(&auditLog)

	c.JSON(http.StatusOK, gin.H{
		"code":    200,
		"message": "删除成功",
	})
}

// 辅助方法：转换Deployment到DeploymentInfo
func (h *DeploymentHandler) convertToDeploymentInfo(d *appsv1.Deployment) DeploymentInfo {
	status := "Running"
	if d.Status.Replicas == 0 {
		status = "Stopped"
	} else if d.Status.AvailableReplicas < d.Status.Replicas {
		status = "Degraded"
	}

	// 提取镜像列表和资源信息
	var images []string
	var cpuLimits, cpuRequests []string
	var memoryLimits, memoryRequests []string

	for _, container := range d.Spec.Template.Spec.Containers {
		images = append(images, container.Image)

		// CPU 限制
		if cpu := container.Resources.Limits.Cpu(); cpu != nil && !cpu.IsZero() {
			cpuLimits = append(cpuLimits, cpu.String())
		}

		// CPU 申请
		if cpu := container.Resources.Requests.Cpu(); cpu != nil && !cpu.IsZero() {
			cpuRequests = append(cpuRequests, cpu.String())
		}

		// 内存 限制
		if memory := container.Resources.Limits.Memory(); memory != nil && !memory.IsZero() {
			memoryLimits = append(memoryLimits, memory.String())
		}

		// 内存 申请
		if memory := container.Resources.Requests.Memory(); memory != nil && !memory.IsZero() {
			memoryRequests = append(memoryRequests, memory.String())
		}
	}

	// 策略
	strategy := string(d.Spec.Strategy.Type)

	// 格式化资源值
	cpuLimit := "-"
	if len(cpuLimits) > 0 {
		cpuLimit = strings.Join(cpuLimits, " + ")
	}

	cpuRequest := "-"
	if len(cpuRequests) > 0 {
		cpuRequest = strings.Join(cpuRequests, " + ")
	}

	memoryLimit := "-"
	if len(memoryLimits) > 0 {
		memoryLimit = strings.Join(memoryLimits, " + ")
	}

	memoryRequest := "-"
	if len(memoryRequests) > 0 {
		memoryRequest = strings.Join(memoryRequests, " + ")
	}

	return DeploymentInfo{
		ID:                fmt.Sprintf("%s/%s", d.Namespace, d.Name),
		Name:              d.Name,
		Namespace:         d.Namespace,
		Type:              "Deployment",
		Status:            status,
		Replicas:          *d.Spec.Replicas,
		ReadyReplicas:     d.Status.ReadyReplicas,
		AvailableReplicas: d.Status.AvailableReplicas,
		UpdatedReplicas:   d.Status.UpdatedReplicas,
		Labels:            d.Labels,
		Annotations:       d.Annotations,
		CreatedAt:         d.CreationTimestamp.Time,
		Images:            images,
		Selector:          d.Spec.Selector.MatchLabels,
		Strategy:          strategy,
		CPULimit:          cpuLimit,
		CPURequest:        cpuRequest,
		MemoryLimit:       memoryLimit,
		MemoryRequest:     memoryRequest,
	}
}

// 辅助方法：应用YAML
func (h *DeploymentHandler) applyYAML(ctx context.Context, k8sClient *services.K8sClient, yamlContent string, namespace string, dryRun bool) (interface{}, error) {
	// 创建解码器
	decode := serializer.NewCodecFactory(scheme.Scheme).UniversalDeserializer().Decode
	obj, _, err := decode([]byte(yamlContent), nil, nil)
	if err != nil {
		return nil, fmt.Errorf("解析YAML失败: %w", err)
	}

	deployment, ok := obj.(*appsv1.Deployment)
	if !ok {
		return nil, fmt.Errorf("无法转换为Deployment类型")
	}

	clientset := k8sClient.GetClientset()
	var dryRunOpt []string
	if dryRun {
		dryRunOpt = []string{metav1.DryRunAll}
	}

	// 尝试获取现有资源
	existing, err := clientset.AppsV1().Deployments(deployment.Namespace).Get(ctx, deployment.Name, metav1.GetOptions{})
	if err == nil {
		// 资源存在，执行更新
		deployment.ResourceVersion = existing.ResourceVersion
		result, err := clientset.AppsV1().Deployments(deployment.Namespace).Update(ctx, deployment, metav1.UpdateOptions{DryRun: dryRunOpt})
		if err != nil {
			return nil, err
		}
		return result, nil
	}

	// 资源不存在，执行创建
	result, err := clientset.AppsV1().Deployments(deployment.Namespace).Create(ctx, deployment, metav1.CreateOptions{DryRun: dryRunOpt})
	if err != nil {
		return nil, err
	}
	return result, nil
}

/** genAI_main_start */
// GetDeploymentPods 获取Deployment关联的Pods
func (h *DeploymentHandler) GetDeploymentPods(c *gin.Context) {
	clusterId := c.Param("clusterID")
	namespace := c.Param("namespace")
	name := c.Param("name")

	logger.Info("获取Deployment Pods: cluster=%s, namespace=%s, name=%s", clusterId, namespace, name)

	// 获取集群信息
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

	clientset := k8sClient.GetClientset()
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	// 获取Deployment
	deployment, err := clientset.AppsV1().Deployments(namespace).Get(ctx, name, metav1.GetOptions{})
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{
			"code":    404,
			"message": "Deployment不存在",
		})
		return
	}

	// 使用selector查询Pods
	selector := labels.SelectorFromSet(deployment.Spec.Selector.MatchLabels)
	podList, err := clientset.CoreV1().Pods(namespace).List(ctx, metav1.ListOptions{
		LabelSelector: selector.String(),
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"code":    500,
			"message": "获取Pod列表失败: " + err.Error(),
		})
		return
	}

	// 转换Pod信息
	pods := make([]map[string]interface{}, 0, len(podList.Items))
	for _, pod := range podList.Items {
		podInfo := map[string]interface{}{
			"name":         pod.Name,
			"namespace":    pod.Namespace,
			"phase":        string(pod.Status.Phase),
			"nodeName":     pod.Spec.NodeName,
			"nodeIP":       pod.Status.HostIP,
			"podIP":        pod.Status.PodIP,
			"restartCount": 0,
			"createdAt":    pod.CreationTimestamp.Time,
		}

		// 计算重启次数和提取资源限制
		var totalRestarts int32
		var cpuRequest, cpuLimit, memoryRequest, memoryLimit string
		for _, container := range pod.Spec.Containers {
			// 资源限制
			if container.Resources.Requests != nil {
				if cpu, ok := container.Resources.Requests["cpu"]; ok {
					cpuRequest = cpu.String()
				}
				if mem, ok := container.Resources.Requests["memory"]; ok {
					memoryRequest = mem.String()
				}
			}
			if container.Resources.Limits != nil {
				if cpu, ok := container.Resources.Limits["cpu"]; ok {
					cpuLimit = cpu.String()
				}
				if mem, ok := container.Resources.Limits["memory"]; ok {
					memoryLimit = mem.String()
				}
			}
		}

		// 统计重启次数
		for _, containerStatus := range pod.Status.ContainerStatuses {
			totalRestarts += containerStatus.RestartCount
		}

		podInfo["restartCount"] = totalRestarts
		podInfo["cpuRequest"] = cpuRequest
		podInfo["cpuLimit"] = cpuLimit
		podInfo["memoryRequest"] = memoryRequest
		podInfo["memoryLimit"] = memoryLimit

		pods = append(pods, podInfo)
	}

	c.JSON(http.StatusOK, gin.H{
		"code":    200,
		"message": "success",
		"data": gin.H{
			"items": pods,
			"total": len(pods),
		},
	})
}

// GetDeploymentServices 获取Deployment关联的Services
func (h *DeploymentHandler) GetDeploymentServices(c *gin.Context) {
	clusterId := c.Param("clusterID")
	namespace := c.Param("namespace")
	name := c.Param("name")

	logger.Info("获取Deployment Services: cluster=%s, namespace=%s, name=%s", clusterId, namespace, name)

	// 获取集群信息
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

	clientset := k8sClient.GetClientset()
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	// 获取Deployment
	deployment, err := clientset.AppsV1().Deployments(namespace).Get(ctx, name, metav1.GetOptions{})
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{
			"code":    404,
			"message": "Deployment不存在",
		})
		return
	}

	// 获取Services
	serviceList, err := clientset.CoreV1().Services(namespace).List(ctx, metav1.ListOptions{})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"code":    500,
			"message": "获取Service列表失败: " + err.Error(),
		})
		return
	}

	// 筛选匹配的Services
	deploymentLabels := deployment.Spec.Selector.MatchLabels
	matchedServices := make([]map[string]interface{}, 0)
	for _, svc := range serviceList.Items {
		// 检查Service的selector是否匹配Deployment的labels
		matches := true
		for key, value := range svc.Spec.Selector {
			if deploymentLabels[key] != value {
				matches = false
				break
			}
		}

		if matches {
			ports := make([]map[string]interface{}, 0, len(svc.Spec.Ports))
			for _, port := range svc.Spec.Ports {
				ports = append(ports, map[string]interface{}{
					"name":       port.Name,
					"protocol":   port.Protocol,
					"port":       port.Port,
					"targetPort": port.TargetPort.String(),
					"nodePort":   port.NodePort,
				})
			}

			serviceInfo := map[string]interface{}{
				"name":        svc.Name,
				"namespace":   svc.Namespace,
				"type":        string(svc.Spec.Type),
				"clusterIP":   svc.Spec.ClusterIP,
				"externalIPs": svc.Spec.ExternalIPs,
				"ports":       ports,
				"selector":    svc.Spec.Selector,
				"createdAt":   svc.CreationTimestamp.Time,
			}
			matchedServices = append(matchedServices, serviceInfo)
		}
	}

	c.JSON(http.StatusOK, gin.H{
		"code":    200,
		"message": "success",
		"data": gin.H{
			"items": matchedServices,
			"total": len(matchedServices),
		},
	})
}

// GetDeploymentIngresses 获取Deployment关联的Ingresses
func (h *DeploymentHandler) GetDeploymentIngresses(c *gin.Context) {
	clusterId := c.Param("clusterID")
	namespace := c.Param("namespace")
	name := c.Param("name")

	logger.Info("获取Deployment Ingresses: cluster=%s, namespace=%s, name=%s", clusterId, namespace, name)

	// 获取集群信息
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

	clientset := k8sClient.GetClientset()
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	// 获取Ingresses
	ingressList, err := clientset.NetworkingV1().Ingresses(namespace).List(ctx, metav1.ListOptions{})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"code":    500,
			"message": "获取Ingress列表失败: " + err.Error(),
		})
		return
	}

	// 转换Ingress信息
	ingresses := make([]map[string]interface{}, 0, len(ingressList.Items))
	for _, ingress := range ingressList.Items {
		rules := make([]map[string]interface{}, 0, len(ingress.Spec.Rules))
		for _, rule := range ingress.Spec.Rules {
			paths := make([]map[string]interface{}, 0)
			if rule.HTTP != nil {
				for _, path := range rule.HTTP.Paths {
					paths = append(paths, map[string]interface{}{
						"path":     path.Path,
						"pathType": string(*path.PathType),
						"backend": map[string]interface{}{
							"serviceName": path.Backend.Service.Name,
							"servicePort": path.Backend.Service.Port.Number,
						},
					})
				}
			}
			rules = append(rules, map[string]interface{}{
				"host":  rule.Host,
				"paths": paths,
			})
		}

		ingressInfo := map[string]interface{}{
			"name":             ingress.Name,
			"namespace":        ingress.Namespace,
			"ingressClassName": ingress.Spec.IngressClassName,
			"rules":            rules,
			"createdAt":        ingress.CreationTimestamp.Time,
		}
		ingresses = append(ingresses, ingressInfo)
	}

	c.JSON(http.StatusOK, gin.H{
		"code":    200,
		"message": "success",
		"data": gin.H{
			"items": ingresses,
			"total": len(ingresses),
		},
	})
}

// GetDeploymentHPA 获取Deployment的HPA
func (h *DeploymentHandler) GetDeploymentHPA(c *gin.Context) {
	clusterId := c.Param("clusterID")
	namespace := c.Param("namespace")
	name := c.Param("name")

	logger.Info("获取Deployment HPA: cluster=%s, namespace=%s, name=%s", clusterId, namespace, name)

	// 获取集群信息
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

	clientset := k8sClient.GetClientset()
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	// 获取HPA列表
	hpaList, err := clientset.AutoscalingV2().HorizontalPodAutoscalers(namespace).List(ctx, metav1.ListOptions{})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"code":    500,
			"message": "获取HPA列表失败: " + err.Error(),
		})
		return
	}

	// 查找匹配的HPA
	for _, hpa := range hpaList.Items {
		if hpa.Spec.ScaleTargetRef.Kind == "Deployment" && hpa.Spec.ScaleTargetRef.Name == name {
			metrics := make([]map[string]interface{}, 0, len(hpa.Spec.Metrics))
			for _, metric := range hpa.Spec.Metrics {
				metricInfo := map[string]interface{}{
					"type": string(metric.Type),
				}
				if metric.Resource != nil {
					metricInfo["resource"] = map[string]interface{}{
						"name":   metric.Resource.Name,
						"target": metric.Resource.Target,
					}
				}
				metrics = append(metrics, metricInfo)
			}

			conditions := make([]map[string]interface{}, 0, len(hpa.Status.Conditions))
			for _, condition := range hpa.Status.Conditions {
				conditions = append(conditions, map[string]interface{}{
					"type":    string(condition.Type),
					"status":  string(condition.Status),
					"reason":  condition.Reason,
					"message": condition.Message,
				})
			}

			hpaInfo := map[string]interface{}{
				"name":            hpa.Name,
				"namespace":       hpa.Namespace,
				"minReplicas":     *hpa.Spec.MinReplicas,
				"maxReplicas":     hpa.Spec.MaxReplicas,
				"currentReplicas": hpa.Status.CurrentReplicas,
				"desiredReplicas": hpa.Status.DesiredReplicas,
				"metrics":         metrics,
				"conditions":      conditions,
			}

			c.JSON(http.StatusOK, gin.H{
				"code":    200,
				"message": "success",
				"data":    hpaInfo,
			})
			return
		}
	}

	// 未找到HPA
	c.JSON(http.StatusNotFound, gin.H{
		"code":    404,
		"message": "未找到HPA",
	})
}

// GetDeploymentReplicaSets 获取Deployment的ReplicaSets
func (h *DeploymentHandler) GetDeploymentReplicaSets(c *gin.Context) {
	clusterId := c.Param("clusterID")
	namespace := c.Param("namespace")
	name := c.Param("name")

	logger.Info("获取Deployment ReplicaSets: cluster=%s, namespace=%s, name=%s", clusterId, namespace, name)

	// 获取集群信息
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

	clientset := k8sClient.GetClientset()
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	// 检查Deployment是否存在
	_, err = clientset.AppsV1().Deployments(namespace).Get(ctx, name, metav1.GetOptions{})
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{
			"code":    404,
			"message": "Deployment不存在",
		})
		return
	}

	// 获取ReplicaSets
	rsList, err := clientset.AppsV1().ReplicaSets(namespace).List(ctx, metav1.ListOptions{})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"code":    500,
			"message": "获取ReplicaSet列表失败: " + err.Error(),
		})
		return
	}

	// 筛选匹配的ReplicaSets
	matchedReplicaSets := make([]map[string]interface{}, 0)
	for _, rs := range rsList.Items {
		// 检查owner reference
		isOwned := false
		for _, owner := range rs.OwnerReferences {
			if owner.Kind == "Deployment" && owner.Name == name {
				isOwned = true
				break
			}
		}

		if isOwned {
			// 提取镜像列表
			images := make([]string, 0)
			for _, container := range rs.Spec.Template.Spec.Containers {
				images = append(images, container.Image)
			}

			// 获取revision号
			revision := rs.Annotations["deployment.kubernetes.io/revision"]

			rsInfo := map[string]interface{}{
				"name":              rs.Name,
				"namespace":         rs.Namespace,
				"replicas":          *rs.Spec.Replicas,
				"readyReplicas":     rs.Status.ReadyReplicas,
				"availableReplicas": rs.Status.AvailableReplicas,
				"revision":          revision,
				"images":            images,
				"createdAt":         rs.CreationTimestamp.Time,
			}
			matchedReplicaSets = append(matchedReplicaSets, rsInfo)
		}
	}

	c.JSON(http.StatusOK, gin.H{
		"code":    200,
		"message": "success",
		"data": gin.H{
			"items": matchedReplicaSets,
			"total": len(matchedReplicaSets),
		},
	})
}

// GetDeploymentEvents 获取Deployment的Events
func (h *DeploymentHandler) GetDeploymentEvents(c *gin.Context) {
	clusterId := c.Param("clusterID")
	namespace := c.Param("namespace")
	name := c.Param("name")

	logger.Info("获取Deployment Events: cluster=%s, namespace=%s, name=%s", clusterId, namespace, name)

	// 获取集群信息
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

	clientset := k8sClient.GetClientset()
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	// 获取Events
	eventList, err := clientset.CoreV1().Events(namespace).List(ctx, metav1.ListOptions{
		FieldSelector: fmt.Sprintf("involvedObject.name=%s,involvedObject.kind=Deployment", name),
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"code":    500,
			"message": "获取Events失败: " + err.Error(),
		})
		return
	}

	// 转换Event信息
	events := make([]map[string]interface{}, 0, len(eventList.Items))
	for _, event := range eventList.Items {
		eventInfo := map[string]interface{}{
			"type":           event.Type,
			"reason":         event.Reason,
			"message":        event.Message,
			"source":         event.Source,
			"count":          event.Count,
			"firstTimestamp": event.FirstTimestamp.Time,
			"lastTimestamp":  event.LastTimestamp.Time,
			"involvedObject": map[string]interface{}{
				"kind":      event.InvolvedObject.Kind,
				"name":      event.InvolvedObject.Name,
				"namespace": event.InvolvedObject.Namespace,
			},
		}
		events = append(events, eventInfo)
	}

	c.JSON(http.StatusOK, gin.H{
		"code":    200,
		"message": "success",
		"data": gin.H{
			"items": events,
			"total": len(events),
		},
	})
}

/** genAI_main_end */

/** genAI_main_end */
