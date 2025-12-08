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

	rollouts "github.com/argoproj/argo-rollouts/pkg/apis/rollouts/v1alpha1"
	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/labels"
	"k8s.io/apimachinery/pkg/runtime/serializer"
	"k8s.io/apimachinery/pkg/util/yaml"
	"k8s.io/client-go/kubernetes/scheme"
	sigsyaml "sigs.k8s.io/yaml"
)

func init() {
	// 注册Argo Rollouts类型到scheme
	_ = rollouts.AddToScheme(scheme.Scheme)
}

// RolloutHandler Rollout处理器
type RolloutHandler struct {
	db             *gorm.DB
	cfg            *config.Config
	clusterService *services.ClusterService
	k8sMgr         *k8s.ClusterInformerManager
}

// NewRolloutHandler 创建Rollout处理器
func NewRolloutHandler(db *gorm.DB, cfg *config.Config, clusterService *services.ClusterService, k8sMgr *k8s.ClusterInformerManager) *RolloutHandler {
	return &RolloutHandler{
		db:             db,
		cfg:            cfg,
		clusterService: clusterService,
		k8sMgr:         k8sMgr,
	}
}

// RolloutInfo Rollout信息
type RolloutInfo struct {
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
}

/** genAI_main_start */
// CheckRolloutCRD 检查集群是否安装了 Argo Rollouts CRD
func (h *RolloutHandler) CheckRolloutCRD(c *gin.Context) {
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

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	// 确保 informer 缓存就绪
	if _, err := h.k8sMgr.EnsureAndWait(ctx, cluster, 5*time.Second); err != nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{
			"code":    503,
			"message": "informer 未就绪: " + err.Error(),
		})
		return
	}

	// 检查 RolloutsLister 是否可用
	lister := h.k8sMgr.RolloutsLister(cluster.ID)
	enabled := lister != nil

	c.JSON(http.StatusOK, gin.H{
		"code":    200,
		"message": "success",
		"data": gin.H{
			"enabled": enabled,
		},
	})
}

/** genAI_main_end */

// ListRollouts 获取Rollout列表
func (h *RolloutHandler) ListRollouts(c *gin.Context) {
	clusterId := c.Param("clusterID")
	namespace := c.Query("namespace")
	searchName := c.Query("search")
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("pageSize", "20"))

	logger.Info("获取Rollout列表: cluster=%s, namespace=%s, search=%s", clusterId, namespace, searchName)

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

	var rolloutList []RolloutInfo
	sel := labels.Everything()

	/** genAI_main_start */
	// 检查 Argo Rollouts CRD 是否存在
	lister := h.k8sMgr.RolloutsLister(cluster.ID)
	if lister == nil {
		// 集群未安装 Argo Rollouts CRD，返回空列表
		c.JSON(http.StatusOK, gin.H{
			"code":    200,
			"message": "success",
			"data": gin.H{
				"items":           []RolloutInfo{},
				"total":           0,
				"page":            page,
				"pageSize":        pageSize,
				"rolloutEnabled":  false,
				"rolloutDisabled": true,
			},
		})
		return
	}
	/** genAI_main_end */

	// 从Informer缓存读取
	if namespace != "" {
		rs, err := lister.Rollouts(namespace).List(sel)
		if err != nil {
			logger.Error("读取Rollout缓存失败", "error", err)
		} else {
			for _, r := range rs {
				rolloutList = append(rolloutList, h.convertToRolloutInfo(r))
			}
		}
	} else {
		rs, err := lister.List(sel)
		if err != nil {
			logger.Error("读取Rollout缓存失败", "error", err)
		} else {
			for _, r := range rs {
				rolloutList = append(rolloutList, h.convertToRolloutInfo(r))
			}
		}
	}

	// 搜索过滤
	if searchName != "" {
		var filtered []RolloutInfo
		searchLower := strings.ToLower(searchName)
		for _, ro := range rolloutList {
			if strings.Contains(strings.ToLower(ro.Name), searchLower) {
				filtered = append(filtered, ro)
			}
		}
		rolloutList = filtered
	}

	// 排序
	sort.Slice(rolloutList, func(i, j int) bool {
		return rolloutList[i].CreatedAt.After(rolloutList[j].CreatedAt)
	})

	// 分页
	total := len(rolloutList)
	start := (page - 1) * pageSize
	end := start + pageSize
	if start > total {
		start = total
	}
	if end > total {
		end = total
	}
	pagedRollouts := rolloutList[start:end]

	c.JSON(http.StatusOK, gin.H{
		"code":    200,
		"message": "success",
		"data": gin.H{
			"items":    pagedRollouts,
			"total":    total,
			"page":     page,
			"pageSize": pageSize,
		},
	})
}

// GetRollout 获取Rollout详情
func (h *RolloutHandler) GetRollout(c *gin.Context) {
	clusterId := c.Param("clusterID")
	namespace := c.Param("namespace")
	name := c.Param("name")

	logger.Info("获取Rollout详情: %s/%s/%s", clusterId, namespace, name)

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

	rolloutClient, err := k8sClient.GetRolloutClient()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"code":    500,
			"message": "获取Rollout客户端失败: " + err.Error(),
		})
		return
	}

	rollout, err := rolloutClient.ArgoprojV1alpha1().Rollouts(namespace).Get(ctx, name, metav1.GetOptions{})
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{
			"code":    404,
			"message": "Rollout不存在: " + err.Error(),
		})
		return
	}

	// 获取关联的Pods
	clientset := k8sClient.GetClientset()
	pods, err := clientset.CoreV1().Pods(namespace).List(ctx, metav1.ListOptions{
		LabelSelector: metav1.FormatLabelSelector(rollout.Spec.Selector),
	})
	if err != nil {
		logger.Error("获取Rollout关联Pods失败", "error", err)
	}

	/** genAI_main_start */
	// 清理对象以生成更干净的 YAML
	cleanRollout := rollout.DeepCopy()
	// 设置 TypeMeta（client-go 获取的对象默认不包含这些字段）
	cleanRollout.APIVersion = "argoproj.io/v1alpha1"
	cleanRollout.Kind = "Rollout"
	// 清理不需要的字段
	cleanRollout.ManagedFields = nil
	cleanRollout.Status = rollouts.RolloutStatus{} // 清理 status 字段
	// 清理 metadata 中的运行时字段
	cleanRollout.ResourceVersion = ""
	cleanRollout.UID = ""
	cleanRollout.Generation = 0
	cleanRollout.CreationTimestamp = metav1.Time{}
	// 将 Rollout 对象转换为 YAML 字符串
	yamlBytes, yamlErr := sigsyaml.Marshal(cleanRollout)
	var yamlString string
	if yamlErr == nil {
		yamlString = string(yamlBytes)
	} else {
		logger.Error("转换Rollout为YAML失败", "error", yamlErr)
		yamlString = ""
	}
	/** genAI_main_end */

	c.JSON(http.StatusOK, gin.H{
		"code":    200,
		"message": "success",
		"data": gin.H{
			"workload": h.convertToRolloutInfo(rollout),
			"raw":      rollout,
			"yaml":     yamlString,
			"pods":     pods,
		},
	})
}

// GetRolloutNamespaces 获取包含Rollout的命名空间列表
func (h *RolloutHandler) GetRolloutNamespaces(c *gin.Context) {
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

	// 从Informer读取所有Rollouts并统计命名空间
	sel := labels.Everything()
	/** genAI_main_start */
	lister := h.k8sMgr.RolloutsLister(cluster.ID)
	if lister == nil {
		// 集群未安装 Argo Rollouts CRD，返回空列表
		c.JSON(http.StatusOK, gin.H{
			"code":    200,
			"message": "success",
			"data":    []interface{}{},
		})
		return
	}
	rs, err := lister.List(sel)
	/** genAI_main_end */
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"code":    500,
			"message": "读取Rollout缓存失败: " + err.Error(),
		})
		return
	}

	// 统计每个命名空间的Rollout数量
	nsCount := make(map[string]int)
	for _, ro := range rs {
		nsCount[ro.Namespace]++
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

// ScaleRollout 扩缩容Rollout
func (h *RolloutHandler) ScaleRollout(c *gin.Context) {
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

	logger.Info("扩缩容Rollout: %s/%s/%s to %d", clusterId, namespace, name, req.Replicas)

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

	rolloutClient, err := k8sClient.GetRolloutClient()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"code":    500,
			"message": "获取Rollout客户端失败: " + err.Error(),
		})
		return
	}

	// 获取Rollout
	rollout, err := rolloutClient.ArgoprojV1alpha1().Rollouts(namespace).Get(ctx, name, metav1.GetOptions{})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"code":    500,
			"message": "获取Rollout失败: " + err.Error(),
		})
		return
	}

	// 更新副本数
	rollout.Spec.Replicas = &req.Replicas
	_, err = rolloutClient.ArgoprojV1alpha1().Rollouts(namespace).Update(ctx, rollout, metav1.UpdateOptions{})
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
		Action:       "scale_rollout",
		ResourceType: "rollout",
		ResourceRef:  fmt.Sprintf(`{"cluster_id":"%s","namespace":"%s","name":"%s"}`, clusterId, namespace, name),
		Result:       "success",
		Details:      fmt.Sprintf("扩缩容Rollout %s/%s 到 %d 个副本", namespace, name, req.Replicas),
	}
	h.db.Create(&auditLog)

	c.JSON(http.StatusOK, gin.H{
		"code":    200,
		"message": "扩缩容成功",
	})
}

// ApplyYAML 应用Rollout YAML
func (h *RolloutHandler) ApplyYAML(c *gin.Context) {
	clusterId := c.Param("clusterID")

	var req YAMLApplyRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"code":    400,
			"message": "参数错误: " + err.Error(),
		})
		return
	}

	logger.Info("应用Rollout YAML: cluster=%s, dryRun=%v", clusterId, req.DryRun)

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
	if kind != "Rollout" {
		c.JSON(http.StatusBadRequest, gin.H{
			"code":    400,
			"message": "YAML类型错误，期望Rollout，实际为: " + kind,
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
			ResourceType: "rollout",
			ResourceRef:  fmt.Sprintf(`{"cluster_id":"%s","namespace":"%s","name":"%s"}`, clusterId, namespace, name),
			Result:       "success",
			Details:      fmt.Sprintf("应用Rollout YAML: %s/%s", namespace, name),
		}
		h.db.Create(&auditLog)
	}

	c.JSON(http.StatusOK, gin.H{
		"code":    200,
		"message": "YAML应用成功",
		"data":    result,
	})
}

// DeleteRollout 删除Rollout
func (h *RolloutHandler) DeleteRollout(c *gin.Context) {
	clusterId := c.Param("clusterID")
	namespace := c.Param("namespace")
	name := c.Param("name")

	logger.Info("删除Rollout: %s/%s/%s", clusterId, namespace, name)

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

	rolloutClient, err := k8sClient.GetRolloutClient()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"code":    500,
			"message": "获取Rollout客户端失败: " + err.Error(),
		})
		return
	}

	err = rolloutClient.ArgoprojV1alpha1().Rollouts(namespace).Delete(ctx, name, metav1.DeleteOptions{})
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
		Action:       "delete_rollout",
		ResourceType: "rollout",
		ResourceRef:  fmt.Sprintf(`{"cluster_id":"%s","namespace":"%s","name":"%s"}`, clusterId, namespace, name),
		Result:       "success",
		Details:      fmt.Sprintf("删除Rollout: %s/%s", namespace, name),
	}
	h.db.Create(&auditLog)

	c.JSON(http.StatusOK, gin.H{
		"code":    200,
		"message": "删除成功",
	})
}

// 辅助方法：转换Rollout到RolloutInfo
func (h *RolloutHandler) convertToRolloutInfo(r *rollouts.Rollout) RolloutInfo {
	status := "Healthy"
	if r.Status.Replicas == 0 {
		status = "Stopped"
	} else if r.Status.AvailableReplicas < r.Status.Replicas {
		status = "Degraded"
	}

	// 提取镜像列表
	var images []string
	for _, container := range r.Spec.Template.Spec.Containers {
		images = append(images, container.Image)
	}

	// 策略
	strategy := "Canary"
	if r.Spec.Strategy.BlueGreen != nil {
		strategy = "BlueGreen"
	}

	replicas := int32(0)
	if r.Spec.Replicas != nil {
		replicas = *r.Spec.Replicas
	}

	return RolloutInfo{
		ID:                fmt.Sprintf("%s/%s", r.Namespace, r.Name),
		Name:              r.Name,
		Namespace:         r.Namespace,
		Type:              "Rollout",
		Status:            status,
		Replicas:          replicas,
		ReadyReplicas:     r.Status.ReadyReplicas,
		AvailableReplicas: r.Status.AvailableReplicas,
		UpdatedReplicas:   r.Status.UpdatedReplicas,
		Labels:            r.Labels,
		Annotations:       r.Annotations,
		CreatedAt:         r.CreationTimestamp.Time,
		Images:            images,
		Selector:          r.Spec.Selector.MatchLabels,
		Strategy:          strategy,
	}
}

// 辅助方法：应用YAML
func (h *RolloutHandler) applyYAML(ctx context.Context, k8sClient *services.K8sClient, yamlContent string, namespace string, dryRun bool) (interface{}, error) {
	// 创建解码器
	decode := serializer.NewCodecFactory(scheme.Scheme).UniversalDeserializer().Decode
	obj, _, err := decode([]byte(yamlContent), nil, nil)
	if err != nil {
		return nil, fmt.Errorf("解析YAML失败: %w", err)
	}

	rollout, ok := obj.(*rollouts.Rollout)
	if !ok {
		return nil, fmt.Errorf("无法转换为Rollout类型")
	}

	rolloutClient, err := k8sClient.GetRolloutClient()
	if err != nil {
		return nil, fmt.Errorf("获取Rollout客户端失败: %w", err)
	}

	var dryRunOpt []string
	if dryRun {
		dryRunOpt = []string{metav1.DryRunAll}
	}

	// 尝试获取现有资源
	existing, err := rolloutClient.ArgoprojV1alpha1().Rollouts(rollout.Namespace).Get(ctx, rollout.Name, metav1.GetOptions{})
	if err == nil {
		// 资源存在，执行更新
		rollout.ResourceVersion = existing.ResourceVersion
		result, err := rolloutClient.ArgoprojV1alpha1().Rollouts(rollout.Namespace).Update(ctx, rollout, metav1.UpdateOptions{DryRun: dryRunOpt})
		if err != nil {
			return nil, err
		}
		return result, nil
	}

	// 资源不存在，执行创建
	result, err := rolloutClient.ArgoprojV1alpha1().Rollouts(rollout.Namespace).Create(ctx, rollout, metav1.CreateOptions{DryRun: dryRunOpt})
	if err != nil {
		return nil, err
	}
	return result, nil
}

/** genAI_main_start */
// GetRolloutPods 获取Rollout关联的Pods
func (h *RolloutHandler) GetRolloutPods(c *gin.Context) {
	clusterId := c.Param("clusterID")
	namespace := c.Param("namespace")
	name := c.Param("name")

	logger.Info("获取Rollout关联的Pods: %s/%s/%s", clusterId, namespace, name)

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

	// 获取Rollout
	rolloutClient, err := k8sClient.GetRolloutClient()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"code":    500,
			"message": "获取Rollout客户端失败: " + err.Error(),
		})
		return
	}

	rollout, err := rolloutClient.ArgoprojV1alpha1().Rollouts(namespace).Get(ctx, name, metav1.GetOptions{})
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{
			"code":    404,
			"message": "Rollout不存在: " + err.Error(),
		})
		return
	}

	// 获取关联的Pods
	clientset := k8sClient.GetClientset()
	podList, err := clientset.CoreV1().Pods(namespace).List(ctx, metav1.ListOptions{
		LabelSelector: metav1.FormatLabelSelector(rollout.Spec.Selector),
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"code":    500,
			"message": "获取Pods失败: " + err.Error(),
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

// GetRolloutServices 获取Rollout关联的Services
func (h *RolloutHandler) GetRolloutServices(c *gin.Context) {
	clusterId := c.Param("clusterID")
	namespace := c.Param("namespace")
	name := c.Param("name")

	logger.Info("获取Rollout关联的Services: %s/%s/%s", clusterId, namespace, name)

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

	// 获取Rollout
	rolloutClient, err := k8sClient.GetRolloutClient()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"code":    500,
			"message": "获取Rollout客户端失败: " + err.Error(),
		})
		return
	}

	rollout, err := rolloutClient.ArgoprojV1alpha1().Rollouts(namespace).Get(ctx, name, metav1.GetOptions{})
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{
			"code":    404,
			"message": "Rollout不存在: " + err.Error(),
		})
		return
	}

	// 获取所有Services
	clientset := k8sClient.GetClientset()
	serviceList, err := clientset.CoreV1().Services(namespace).List(ctx, metav1.ListOptions{})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"code":    500,
			"message": "获取Services失败: " + err.Error(),
		})
		return
	}

	// 筛选匹配的Services
	rolloutLabels := rollout.Spec.Selector.MatchLabels
	matchedServices := make([]map[string]interface{}, 0)
	for _, svc := range serviceList.Items {
		// 检查Service的selector是否匹配Rollout的labels
		matches := true
		for key, value := range svc.Spec.Selector {
			if rolloutLabels[key] != value {
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

// GetRolloutIngresses 获取Rollout关联的Ingresses
func (h *RolloutHandler) GetRolloutIngresses(c *gin.Context) {
	clusterId := c.Param("clusterID")
	namespace := c.Param("namespace")

	logger.Info("获取Rollout关联的Ingresses: %s/%s", clusterId, namespace)

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

	// 获取Ingresses
	clientset := k8sClient.GetClientset()
	ingressList, err := clientset.NetworkingV1().Ingresses(namespace).List(ctx, metav1.ListOptions{})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"code":    500,
			"message": "获取Ingresses失败: " + err.Error(),
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

// GetRolloutHPA 获取Rollout关联的HPA
func (h *RolloutHandler) GetRolloutHPA(c *gin.Context) {
	clusterId := c.Param("clusterID")
	namespace := c.Param("namespace")
	name := c.Param("name")

	logger.Info("获取Rollout关联的HPA: %s/%s/%s", clusterId, namespace, name)

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
	hpaList, err := clientset.AutoscalingV2().HorizontalPodAutoscalers(namespace).List(ctx, metav1.ListOptions{})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"code":    500,
			"message": "获取HPA失败: " + err.Error(),
		})
		return
	}

	// 查找与Rollout关联的HPA
	var targetHPA interface{}
	for _, hpa := range hpaList.Items {
		if hpa.Spec.ScaleTargetRef.Kind == "Rollout" && hpa.Spec.ScaleTargetRef.Name == name {
			targetHPA = hpa
			break
		}
	}

	c.JSON(http.StatusOK, gin.H{
		"code":    200,
		"message": "success",
		"data":    targetHPA,
	})
}

// GetRolloutReplicaSets 获取Rollout关联的ReplicaSets
func (h *RolloutHandler) GetRolloutReplicaSets(c *gin.Context) {
	clusterId := c.Param("clusterID")
	namespace := c.Param("namespace")
	name := c.Param("name")

	logger.Info("获取Rollout关联的ReplicaSets: %s/%s/%s", clusterId, namespace, name)

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

	// 获取Rollout
	rolloutClient, err := k8sClient.GetRolloutClient()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"code":    500,
			"message": "获取Rollout客户端失败: " + err.Error(),
		})
		return
	}

	_, err = rolloutClient.ArgoprojV1alpha1().Rollouts(namespace).Get(ctx, name, metav1.GetOptions{})
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{
			"code":    404,
			"message": "Rollout不存在: " + err.Error(),
		})
		return
	}

	clientset := k8sClient.GetClientset()
	replicaSets, err := clientset.AppsV1().ReplicaSets(namespace).List(ctx, metav1.ListOptions{})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"code":    500,
			"message": "获取ReplicaSets失败: " + err.Error(),
		})
		return
	}

	// 筛选由Rollout管理的ReplicaSets
	var relatedReplicaSets []interface{}
	for _, rs := range replicaSets.Items {
		for _, ownerRef := range rs.OwnerReferences {
			if ownerRef.Kind == "Rollout" && ownerRef.Name == name {
				relatedReplicaSets = append(relatedReplicaSets, rs)
				break
			}
		}
	}

	c.JSON(http.StatusOK, gin.H{
		"code":    200,
		"message": "success",
		"data":    relatedReplicaSets,
	})
}

// GetRolloutEvents 获取Rollout相关的Events
func (h *RolloutHandler) GetRolloutEvents(c *gin.Context) {
	clusterId := c.Param("clusterID")
	namespace := c.Param("namespace")
	name := c.Param("name")

	logger.Info("获取Rollout相关的Events: %s/%s/%s", clusterId, namespace, name)

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
	events, err := clientset.CoreV1().Events(namespace).List(ctx, metav1.ListOptions{
		FieldSelector: fmt.Sprintf("involvedObject.name=%s,involvedObject.kind=Rollout", name),
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"code":    500,
			"message": "获取Events失败: " + err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"code":    200,
		"message": "success",
		"data":    events,
	})
}

/** genAI_main_end */

/** genAI_main_end */
