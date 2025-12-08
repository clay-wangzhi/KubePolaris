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

// StatefulSetHandler StatefulSet处理器
type StatefulSetHandler struct {
	db             *gorm.DB
	cfg            *config.Config
	clusterService *services.ClusterService
	k8sMgr         *k8s.ClusterInformerManager
}

// NewStatefulSetHandler 创建StatefulSet处理器
func NewStatefulSetHandler(db *gorm.DB, cfg *config.Config, clusterService *services.ClusterService, k8sMgr *k8s.ClusterInformerManager) *StatefulSetHandler {
	return &StatefulSetHandler{
		db:             db,
		cfg:            cfg,
		clusterService: clusterService,
		k8sMgr:         k8sMgr,
	}
}

// StatefulSetInfo StatefulSet信息
type StatefulSetInfo struct {
	ID              string            `json:"id"`
	Name            string            `json:"name"`
	Namespace       string            `json:"namespace"`
	Type            string            `json:"type"`
	Status          string            `json:"status"`
	Replicas        int32             `json:"replicas"`
	ReadyReplicas   int32             `json:"readyReplicas"`
	CurrentReplicas int32             `json:"currentReplicas"`
	UpdatedReplicas int32             `json:"updatedReplicas"`
	Labels          map[string]string `json:"labels"`
	Annotations     map[string]string `json:"annotations"`
	CreatedAt       time.Time         `json:"createdAt"`
	Images          []string          `json:"images"`
	Selector        map[string]string `json:"selector"`
	ServiceName     string            `json:"serviceName"`
}

// ListStatefulSets 获取StatefulSet列表
func (h *StatefulSetHandler) ListStatefulSets(c *gin.Context) {
	clusterId := c.Param("clusterID")
	namespace := c.Query("namespace")
	searchName := c.Query("search")
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("pageSize", "20"))

	logger.Info("获取StatefulSet列表: cluster=%s, namespace=%s, search=%s", clusterId, namespace, searchName)

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

	if _, err := h.k8sMgr.EnsureAndWait(ctx, cluster, 5*time.Second); err != nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{
			"code":    503,
			"message": "informer 未就绪: " + err.Error(),
		})
		return
	}

	var statefulSets []StatefulSetInfo
	sel := labels.Everything()

	if namespace != "" {
		sss, err := h.k8sMgr.StatefulSetsLister(cluster.ID).StatefulSets(namespace).List(sel)
		if err != nil {
			logger.Error("读取StatefulSet缓存失败", "error", err)
		} else {
			for _, ss := range sss {
				statefulSets = append(statefulSets, h.convertToStatefulSetInfo(ss))
			}
		}
	} else {
		sss, err := h.k8sMgr.StatefulSetsLister(cluster.ID).List(sel)
		if err != nil {
			logger.Error("读取StatefulSet缓存失败", "error", err)
		} else {
			for _, ss := range sss {
				statefulSets = append(statefulSets, h.convertToStatefulSetInfo(ss))
			}
		}
	}

	if searchName != "" {
		var filtered []StatefulSetInfo
		searchLower := strings.ToLower(searchName)
		for _, ss := range statefulSets {
			if strings.Contains(strings.ToLower(ss.Name), searchLower) {
				filtered = append(filtered, ss)
			}
		}
		statefulSets = filtered
	}

	sort.Slice(statefulSets, func(i, j int) bool {
		return statefulSets[i].CreatedAt.After(statefulSets[j].CreatedAt)
	})

	total := len(statefulSets)
	start := (page - 1) * pageSize
	end := start + pageSize
	if start > total {
		start = total
	}
	if end > total {
		end = total
	}
	pagedStatefulSets := statefulSets[start:end]

	c.JSON(http.StatusOK, gin.H{
		"code":    200,
		"message": "success",
		"data": gin.H{
			"items":    pagedStatefulSets,
			"total":    total,
			"page":     page,
			"pageSize": pageSize,
		},
	})
}

// GetStatefulSet 获取StatefulSet详情
func (h *StatefulSetHandler) GetStatefulSet(c *gin.Context) {
	clusterId := c.Param("clusterID")
	namespace := c.Param("namespace")
	name := c.Param("name")

	logger.Info("获取StatefulSet详情: %s/%s/%s", clusterId, namespace, name)

	clusterID := parseClusterID(clusterId)
	cluster, err := h.clusterService.GetCluster(clusterID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{
			"code":    404,
			"message": "集群不存在",
		})
		return
	}

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
	statefulSet, err := clientset.AppsV1().StatefulSets(namespace).Get(ctx, name, metav1.GetOptions{})
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{
			"code":    404,
			"message": "StatefulSet不存在: " + err.Error(),
		})
		return
	}

	pods, err := clientset.CoreV1().Pods(namespace).List(ctx, metav1.ListOptions{
		LabelSelector: metav1.FormatLabelSelector(statefulSet.Spec.Selector),
	})
	if err != nil {
		logger.Error("获取StatefulSet关联Pods失败", "error", err)
	}

	/** genAI_main_start */
	// 清理对象以生成更干净的 YAML
	cleanStatefulSet := statefulSet.DeepCopy()
	// 设置 TypeMeta（client-go 获取的对象默认不包含这些字段）
	cleanStatefulSet.APIVersion = "apps/v1"
	cleanStatefulSet.Kind = "StatefulSet"
	// 清理不需要的字段
	cleanStatefulSet.ManagedFields = nil
	cleanStatefulSet.Status = appsv1.StatefulSetStatus{} // 清理 status 字段
	// 清理 metadata 中的运行时字段
	cleanStatefulSet.ResourceVersion = ""
	cleanStatefulSet.UID = ""
	cleanStatefulSet.Generation = 0
	cleanStatefulSet.CreationTimestamp = metav1.Time{}
	// 将 StatefulSet 对象转换为 YAML 字符串
	yamlBytes, yamlErr := sigsyaml.Marshal(cleanStatefulSet)
	var yamlString string
	if yamlErr == nil {
		yamlString = string(yamlBytes)
	} else {
		logger.Error("转换StatefulSet为YAML失败", "error", yamlErr)
		yamlString = ""
	}
	/** genAI_main_end */

	c.JSON(http.StatusOK, gin.H{
		"code":    200,
		"message": "success",
		"data": gin.H{
			"workload": h.convertToStatefulSetInfo(statefulSet),
			"raw":      statefulSet,
			"yaml":     yamlString,
			"pods":     pods,
		},
	})
}

// GetStatefulSetNamespaces 获取包含StatefulSet的命名空间列表
func (h *StatefulSetHandler) GetStatefulSetNamespaces(c *gin.Context) {
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

	if _, err := h.k8sMgr.EnsureAndWait(ctx, cluster, 5*time.Second); err != nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{
			"code":    503,
			"message": "informer 未就绪: " + err.Error(),
		})
		return
	}

	sel := labels.Everything()
	sss, err := h.k8sMgr.StatefulSetsLister(cluster.ID).List(sel)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"code":    500,
			"message": "读取StatefulSet缓存失败: " + err.Error(),
		})
		return
	}

	nsCount := make(map[string]int)
	for _, ss := range sss {
		nsCount[ss.Namespace]++
	}

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

	sort.Slice(namespaces, func(i, j int) bool {
		return namespaces[i].Name < namespaces[j].Name
	})

	c.JSON(http.StatusOK, gin.H{
		"code":    200,
		"message": "success",
		"data":    namespaces,
	})
}

// ScaleStatefulSet 扩缩容StatefulSet
func (h *StatefulSetHandler) ScaleStatefulSet(c *gin.Context) {
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

	logger.Info("扩缩容StatefulSet: %s/%s/%s to %d", clusterId, namespace, name, req.Replicas)

	clusterID := parseClusterID(clusterId)
	cluster, err := h.clusterService.GetCluster(clusterID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{
			"code":    404,
			"message": "集群不存在",
		})
		return
	}

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
	scale, err := clientset.AppsV1().StatefulSets(namespace).GetScale(ctx, name, metav1.GetOptions{})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"code":    500,
			"message": "获取StatefulSet Scale失败: " + err.Error(),
		})
		return
	}

	scale.Spec.Replicas = req.Replicas
	_, err = clientset.AppsV1().StatefulSets(namespace).UpdateScale(ctx, name, scale, metav1.UpdateOptions{})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"code":    500,
			"message": "扩缩容失败: " + err.Error(),
		})
		return
	}

	auditLog := models.AuditLog{
		UserID:       1,
		Action:       "scale_statefulset",
		ResourceType: "statefulset",
		ResourceRef:  fmt.Sprintf(`{"cluster_id":"%s","namespace":"%s","name":"%s"}`, clusterId, namespace, name),
		Result:       "success",
		Details:      fmt.Sprintf("扩缩容StatefulSet %s/%s 到 %d 个副本", namespace, name, req.Replicas),
	}
	h.db.Create(&auditLog)

	c.JSON(http.StatusOK, gin.H{
		"code":    200,
		"message": "扩缩容成功",
	})
}

// ApplyYAML 应用StatefulSet YAML
func (h *StatefulSetHandler) ApplyYAML(c *gin.Context) {
	clusterId := c.Param("clusterID")

	var req YAMLApplyRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"code":    400,
			"message": "参数错误: " + err.Error(),
		})
		return
	}

	logger.Info("应用StatefulSet YAML: cluster=%s, dryRun=%v", clusterId, req.DryRun)

	clusterID := parseClusterID(clusterId)
	cluster, err := h.clusterService.GetCluster(clusterID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{
			"code":    404,
			"message": "集群不存在",
		})
		return
	}

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

	var objMap map[string]interface{}
	if err := yaml.Unmarshal([]byte(req.YAML), &objMap); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"code":    400,
			"message": "YAML格式错误: " + err.Error(),
		})
		return
	}

	if objMap["apiVersion"] == nil || objMap["kind"] == nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"code":    400,
			"message": "YAML缺少必要字段: apiVersion 或 kind",
		})
		return
	}

	kind := objMap["kind"].(string)
	if kind != "StatefulSet" {
		c.JSON(http.StatusBadRequest, gin.H{
			"code":    400,
			"message": "YAML类型错误，期望StatefulSet，实际为: " + kind,
		})
		return
	}

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

	result, err := h.applyYAML(ctx, k8sClient, req.YAML, namespace, req.DryRun)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"code":    500,
			"message": "YAML应用失败: " + err.Error(),
		})
		return
	}

	if !req.DryRun {
		auditLog := models.AuditLog{
			UserID:       1,
			Action:       "apply_yaml",
			ResourceType: "statefulset",
			ResourceRef:  fmt.Sprintf(`{"cluster_id":"%s","namespace":"%s","name":"%s"}`, clusterId, namespace, name),
			Result:       "success",
			Details:      fmt.Sprintf("应用StatefulSet YAML: %s/%s", namespace, name),
		}
		h.db.Create(&auditLog)
	}

	c.JSON(http.StatusOK, gin.H{
		"code":    200,
		"message": "YAML应用成功",
		"data":    result,
	})
}

// DeleteStatefulSet 删除StatefulSet
func (h *StatefulSetHandler) DeleteStatefulSet(c *gin.Context) {
	clusterId := c.Param("clusterID")
	namespace := c.Param("namespace")
	name := c.Param("name")

	logger.Info("删除StatefulSet: %s/%s/%s", clusterId, namespace, name)

	clusterID := parseClusterID(clusterId)
	cluster, err := h.clusterService.GetCluster(clusterID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{
			"code":    404,
			"message": "集群不存在",
		})
		return
	}

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
	err = clientset.AppsV1().StatefulSets(namespace).Delete(ctx, name, metav1.DeleteOptions{})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"code":    500,
			"message": "删除失败: " + err.Error(),
		})
		return
	}

	auditLog := models.AuditLog{
		UserID:       1,
		Action:       "delete_statefulset",
		ResourceType: "statefulset",
		ResourceRef:  fmt.Sprintf(`{"cluster_id":"%s","namespace":"%s","name":"%s"}`, clusterId, namespace, name),
		Result:       "success",
		Details:      fmt.Sprintf("删除StatefulSet: %s/%s", namespace, name),
	}
	h.db.Create(&auditLog)

	c.JSON(http.StatusOK, gin.H{
		"code":    200,
		"message": "删除成功",
	})
}

// 辅助方法
func (h *StatefulSetHandler) convertToStatefulSetInfo(ss *appsv1.StatefulSet) StatefulSetInfo {
	status := "Running"
	if ss.Status.Replicas == 0 {
		status = "Stopped"
	} else if ss.Status.ReadyReplicas < ss.Status.Replicas {
		status = "Degraded"
	}

	var images []string
	for _, container := range ss.Spec.Template.Spec.Containers {
		images = append(images, container.Image)
	}

	return StatefulSetInfo{
		ID:              fmt.Sprintf("%s/%s", ss.Namespace, ss.Name),
		Name:            ss.Name,
		Namespace:       ss.Namespace,
		Type:            "StatefulSet",
		Status:          status,
		Replicas:        *ss.Spec.Replicas,
		ReadyReplicas:   ss.Status.ReadyReplicas,
		CurrentReplicas: ss.Status.CurrentReplicas,
		UpdatedReplicas: ss.Status.UpdatedReplicas,
		Labels:          ss.Labels,
		Annotations:     ss.Annotations,
		CreatedAt:       ss.CreationTimestamp.Time,
		Images:          images,
		Selector:        ss.Spec.Selector.MatchLabels,
		ServiceName:     ss.Spec.ServiceName,
	}
}

func (h *StatefulSetHandler) applyYAML(ctx context.Context, k8sClient *services.K8sClient, yamlContent string, namespace string, dryRun bool) (interface{}, error) {
	decode := serializer.NewCodecFactory(scheme.Scheme).UniversalDeserializer().Decode
	obj, _, err := decode([]byte(yamlContent), nil, nil)
	if err != nil {
		return nil, fmt.Errorf("解析YAML失败: %w", err)
	}

	statefulSet, ok := obj.(*appsv1.StatefulSet)
	if !ok {
		return nil, fmt.Errorf("无法转换为StatefulSet类型")
	}

	clientset := k8sClient.GetClientset()
	var dryRunOpt []string
	if dryRun {
		dryRunOpt = []string{metav1.DryRunAll}
	}

	existing, err := clientset.AppsV1().StatefulSets(statefulSet.Namespace).Get(ctx, statefulSet.Name, metav1.GetOptions{})
	if err == nil {
		statefulSet.ResourceVersion = existing.ResourceVersion
		result, err := clientset.AppsV1().StatefulSets(statefulSet.Namespace).Update(ctx, statefulSet, metav1.UpdateOptions{DryRun: dryRunOpt})
		if err != nil {
			return nil, err
		}
		return result, nil
	}

	result, err := clientset.AppsV1().StatefulSets(statefulSet.Namespace).Create(ctx, statefulSet, metav1.CreateOptions{DryRun: dryRunOpt})
	if err != nil {
		return nil, err
	}
	return result, nil
}

/** genAI_main_end */
