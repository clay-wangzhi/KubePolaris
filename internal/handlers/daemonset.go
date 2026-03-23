package handlers

import (
	"context"
	"fmt"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/clay-wangzhi/KubePolaris/internal/config"
	"github.com/clay-wangzhi/KubePolaris/internal/k8s"
	"github.com/clay-wangzhi/KubePolaris/internal/middleware"
	"github.com/clay-wangzhi/KubePolaris/internal/response"
	"github.com/clay-wangzhi/KubePolaris/internal/services"
	"github.com/clay-wangzhi/KubePolaris/pkg/logger"

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

// DaemonSetHandler DaemonSet处理器
type DaemonSetHandler struct {
	db             *gorm.DB
	cfg            *config.Config
	clusterService *services.ClusterService
	k8sMgr         *k8s.ClusterInformerManager
}

// NewDaemonSetHandler 创建DaemonSet处理器
func NewDaemonSetHandler(db *gorm.DB, cfg *config.Config, clusterService *services.ClusterService, k8sMgr *k8s.ClusterInformerManager) *DaemonSetHandler {
	return &DaemonSetHandler{
		db:             db,
		cfg:            cfg,
		clusterService: clusterService,
		k8sMgr:         k8sMgr,
	}
}

// DaemonSetInfo DaemonSet信息
type DaemonSetInfo struct {
	ID                     string            `json:"id"`
	Name                   string            `json:"name"`
	Namespace              string            `json:"namespace"`
	Type                   string            `json:"type"`
	Status                 string            `json:"status"`
	DesiredNumberScheduled int32             `json:"desiredNumberScheduled"`
	CurrentNumberScheduled int32             `json:"currentNumberScheduled"`
	NumberReady            int32             `json:"numberReady"`
	NumberAvailable        int32             `json:"numberAvailable"`
	Labels                 map[string]string `json:"labels"`
	Annotations            map[string]string `json:"annotations"`
	CreatedAt              time.Time         `json:"createdAt"`
	Images                 []string          `json:"images"`
	Selector               map[string]string `json:"selector"`
}

// ListDaemonSets 获取DaemonSet列表
func (h *DaemonSetHandler) ListDaemonSets(c *gin.Context) {
	clusterId := c.Param("clusterID")
	namespace := c.Query("namespace")
	searchName := c.Query("search")
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("pageSize", "20"))

	logger.Info("获取DaemonSet列表: cluster=%s, namespace=%s, search=%s", clusterId, namespace, searchName)

	clusterID, err := parseClusterID(clusterId)
	if err != nil {
		response.BadRequest(c, "无效的集群ID")
		return
	}
	cluster, err := h.clusterService.GetCluster(clusterID)
	if err != nil {
		response.NotFound(c, "集群不存在")
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	if _, err := h.k8sMgr.EnsureAndWait(ctx, cluster, 5*time.Second); err != nil {
		response.ServiceUnavailable(c, "informer 未就绪: "+err.Error())
		return
	}

	// 检查命名空间权限
	nsInfo, hasAccess := middleware.CheckNamespacePermission(c, namespace)
	if !hasAccess {
		response.Forbidden(c, fmt.Sprintf("无权访问命名空间: %s", namespace))
		return
	}

	var daemonSets []DaemonSetInfo
	sel := labels.Everything()

	if namespace != "" {
		dss, err := h.k8sMgr.DaemonSetsLister(cluster.ID).DaemonSets(namespace).List(sel)
		if err != nil {
			logger.Error("读取DaemonSet缓存失败", "error", err)
		} else {
			for _, ds := range dss {
				daemonSets = append(daemonSets, h.convertToDaemonSetInfo(ds))
			}
		}
	} else {
		dss, err := h.k8sMgr.DaemonSetsLister(cluster.ID).List(sel)
		if err != nil {
			logger.Error("读取DaemonSet缓存失败", "error", err)
		} else {
			for _, ds := range dss {
				daemonSets = append(daemonSets, h.convertToDaemonSetInfo(ds))
			}
		}
	}

	// 根据命名空间权限过滤
	if !nsInfo.HasAllAccess && namespace == "" {
		daemonSets = middleware.FilterResourcesByNamespace(c, daemonSets, func(ds DaemonSetInfo) string {
			return ds.Namespace
		})
	}

	if searchName != "" {
		var filtered []DaemonSetInfo
		searchLower := strings.ToLower(searchName)
		for _, ds := range daemonSets {
			if strings.Contains(strings.ToLower(ds.Name), searchLower) {
				filtered = append(filtered, ds)
			}
		}
		daemonSets = filtered
	}

	sort.Slice(daemonSets, func(i, j int) bool {
		return daemonSets[i].CreatedAt.After(daemonSets[j].CreatedAt)
	})

	total := len(daemonSets)
	start := (page - 1) * pageSize
	end := start + pageSize
	if start > total {
		start = total
	}
	if end > total {
		end = total
	}
	pagedDaemonSets := daemonSets[start:end]

	response.PagedList(c, pagedDaemonSets, int64(total), page, pageSize)
}

// GetDaemonSet 获取DaemonSet详情
func (h *DaemonSetHandler) GetDaemonSet(c *gin.Context) {
	clusterId := c.Param("clusterID")
	namespace := c.Param("namespace")
	name := c.Param("name")

	logger.Info("获取DaemonSet详情: %s/%s/%s", clusterId, namespace, name)

	clusterID, err := parseClusterID(clusterId)
	if err != nil {
		response.BadRequest(c, "无效的集群ID")
		return
	}
	cluster, err := h.clusterService.GetCluster(clusterID)
	if err != nil {
		response.NotFound(c, "集群不存在")
		return
	}

	k8sClient, err := h.k8sMgr.GetK8sClient(cluster)
	if err != nil {
		response.InternalError(c, "获取K8s客户端失败: "+err.Error())
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	clientset := k8sClient.GetClientset()
	daemonSet, err := clientset.AppsV1().DaemonSets(namespace).Get(ctx, name, metav1.GetOptions{})
	if err != nil {
		response.NotFound(c, "DaemonSet不存在: "+err.Error())
		return
	}

	pods, err := clientset.CoreV1().Pods(namespace).List(ctx, metav1.ListOptions{
		LabelSelector: metav1.FormatLabelSelector(daemonSet.Spec.Selector),
	})
	if err != nil {
		logger.Error("获取DaemonSet关联Pods失败", "error", err)
	}

	// 清理 managed fields 以生成更干净的 YAML
	cleanDaemonSet := daemonSet.DeepCopy()
	cleanDaemonSet.ManagedFields = nil
	// 设置 TypeMeta（client-go 返回的对象默认不包含 apiVersion 和 kind）
	cleanDaemonSet.APIVersion = "apps/v1"
	cleanDaemonSet.Kind = "DaemonSet"
	// 将 DaemonSet 对象转换为 YAML 字符串
	yamlBytes, yamlErr := sigsyaml.Marshal(cleanDaemonSet)
	var yamlString string
	if yamlErr == nil {
		yamlString = string(yamlBytes)
	} else {
		logger.Error("转换DaemonSet为YAML失败", "error", yamlErr)
		yamlString = ""
	}

	response.OK(c, gin.H{
		"workload": h.convertToDaemonSetInfo(daemonSet),
		"raw":      daemonSet,
		"yaml":     yamlString,
		"pods":     pods,
	})
}

// GetDaemonSetNamespaces 获取包含DaemonSet的命名空间列表
func (h *DaemonSetHandler) GetDaemonSetNamespaces(c *gin.Context) {
	clusterId := c.Param("clusterID")

	clusterID, err := parseClusterID(clusterId)
	if err != nil {
		response.BadRequest(c, "无效的集群ID")
		return
	}
	cluster, err := h.clusterService.GetCluster(clusterID)
	if err != nil {
		response.NotFound(c, "集群不存在")
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	if _, err := h.k8sMgr.EnsureAndWait(ctx, cluster, 5*time.Second); err != nil {
		response.ServiceUnavailable(c, "informer 未就绪: "+err.Error())
		return
	}

	sel := labels.Everything()
	dss, err := h.k8sMgr.DaemonSetsLister(cluster.ID).List(sel)
	if err != nil {
		response.InternalError(c, "读取DaemonSet缓存失败: "+err.Error())
		return
	}

	nsCount := make(map[string]int)
	for _, ds := range dss {
		nsCount[ds.Namespace]++
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

	response.OK(c, namespaces)
}

// ApplyYAML 应用DaemonSet YAML
func (h *DaemonSetHandler) ApplyYAML(c *gin.Context) {
	clusterId := c.Param("clusterID")

	var req YAMLApplyRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "参数错误: "+err.Error())
		return
	}

	logger.Info("应用DaemonSet YAML: cluster=%s, dryRun=%v", clusterId, req.DryRun)

	clusterID, err := parseClusterID(clusterId)
	if err != nil {
		response.BadRequest(c, "无效的集群ID")
		return
	}
	cluster, err := h.clusterService.GetCluster(clusterID)
	if err != nil {
		response.NotFound(c, "集群不存在")
		return
	}

	k8sClient, err := h.k8sMgr.GetK8sClient(cluster)
	if err != nil {
		response.InternalError(c, "获取K8s客户端失败: "+err.Error())
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	var objMap map[string]interface{}
	if err := yaml.Unmarshal([]byte(req.YAML), &objMap); err != nil {
		response.BadRequest(c, "YAML格式错误: "+err.Error())
		return
	}

	if objMap["apiVersion"] == nil || objMap["kind"] == nil {
		response.BadRequest(c, "YAML缺少必要字段: apiVersion 或 kind")
		return
	}

	kind := objMap["kind"].(string)
	if kind != "DaemonSet" {
		response.BadRequest(c, "YAML类型错误，期望DaemonSet，实际为: "+kind)
		return
	}

	metadata, ok := objMap["metadata"].(map[string]interface{})
	if !ok {
		response.BadRequest(c, "YAML缺少 metadata 字段")
		return
	}

	namespace, _ := metadata["namespace"].(string)
	if namespace == "" {
		namespace = "default"
	}

	result, err := h.applyYAML(ctx, k8sClient, req.YAML, namespace, req.DryRun)
	if err != nil {
		response.InternalError(c, "YAML应用失败: "+err.Error())
		return
	}

	response.OK(c, result)
}

// DeleteDaemonSet 删除DaemonSet
func (h *DaemonSetHandler) DeleteDaemonSet(c *gin.Context) {
	clusterId := c.Param("clusterID")
	namespace := c.Param("namespace")
	name := c.Param("name")

	logger.Info("删除DaemonSet: %s/%s/%s", clusterId, namespace, name)

	clusterID, err := parseClusterID(clusterId)
	if err != nil {
		response.BadRequest(c, "无效的集群ID")
		return
	}
	cluster, err := h.clusterService.GetCluster(clusterID)
	if err != nil {
		response.NotFound(c, "集群不存在")
		return
	}

	k8sClient, err := h.k8sMgr.GetK8sClient(cluster)
	if err != nil {
		response.InternalError(c, "获取K8s客户端失败: "+err.Error())
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	clientset := k8sClient.GetClientset()
	err = clientset.AppsV1().DaemonSets(namespace).Delete(ctx, name, metav1.DeleteOptions{})
	if err != nil {
		response.InternalError(c, "删除失败: "+err.Error())
		return
	}

	response.OK(c, gin.H{"message": "删除成功"})
}

// 辅助方法
func (h *DaemonSetHandler) convertToDaemonSetInfo(ds *appsv1.DaemonSet) DaemonSetInfo {
	status := "Running"
	if ds.Status.NumberReady == 0 {
		status = "Stopped"
	} else if ds.Status.NumberReady < ds.Status.DesiredNumberScheduled {
		status = "Degraded"
	}

	var images []string
	for _, container := range ds.Spec.Template.Spec.Containers {
		images = append(images, container.Image)
	}

	return DaemonSetInfo{
		ID:                     fmt.Sprintf("%s/%s", ds.Namespace, ds.Name),
		Name:                   ds.Name,
		Namespace:              ds.Namespace,
		Type:                   "DaemonSet",
		Status:                 status,
		DesiredNumberScheduled: ds.Status.DesiredNumberScheduled,
		CurrentNumberScheduled: ds.Status.CurrentNumberScheduled,
		NumberReady:            ds.Status.NumberReady,
		NumberAvailable:        ds.Status.NumberAvailable,
		Labels:                 ds.Labels,
		Annotations:            ds.Annotations,
		CreatedAt:              ds.CreationTimestamp.Time,
		Images:                 images,
		Selector:               ds.Spec.Selector.MatchLabels,
	}
}

func (h *DaemonSetHandler) applyYAML(ctx context.Context, k8sClient *services.K8sClient, yamlContent string, namespace string, dryRun bool) (interface{}, error) {
	decode := serializer.NewCodecFactory(scheme.Scheme).UniversalDeserializer().Decode
	obj, _, err := decode([]byte(yamlContent), nil, nil)
	if err != nil {
		return nil, fmt.Errorf("解析YAML失败: %w", err)
	}

	daemonSet, ok := obj.(*appsv1.DaemonSet)
	if !ok {
		return nil, fmt.Errorf("无法转换为DaemonSet类型")
	}

	clientset := k8sClient.GetClientset()
	var dryRunOpt []string
	if dryRun {
		dryRunOpt = []string{metav1.DryRunAll}
	}

	existing, err := clientset.AppsV1().DaemonSets(daemonSet.Namespace).Get(ctx, daemonSet.Name, metav1.GetOptions{})
	if err == nil {
		daemonSet.ResourceVersion = existing.ResourceVersion
		result, err := clientset.AppsV1().DaemonSets(daemonSet.Namespace).Update(ctx, daemonSet, metav1.UpdateOptions{DryRun: dryRunOpt})
		if err != nil {
			return nil, err
		}
		return result, nil
	}

	result, err := clientset.AppsV1().DaemonSets(daemonSet.Namespace).Create(ctx, daemonSet, metav1.CreateOptions{DryRun: dryRunOpt})
	if err != nil {
		return nil, err
	}
	return result, nil
}
