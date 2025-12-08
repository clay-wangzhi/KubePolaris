package handlers

import (
	"context"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"

	"kubepolaris/internal/config"
	"kubepolaris/internal/k8s"
	"kubepolaris/internal/services"
	"kubepolaris/pkg/logger"
)

type ConfigMapHandler struct {
	db         *gorm.DB
	cfg        *config.Config
	clusterSvc *services.ClusterService
	k8sMgr     *k8s.ClusterInformerManager
}

func NewConfigMapHandler(db *gorm.DB, cfg *config.Config, clusterSvc *services.ClusterService, k8sMgr *k8s.ClusterInformerManager) *ConfigMapHandler {
	return &ConfigMapHandler{
		db:         db,
		cfg:        cfg,
		clusterSvc: clusterSvc,
		k8sMgr:     k8sMgr,
	}
}

// ConfigMapListItem ConfigMap列表项
type ConfigMapListItem struct {
	Name              string            `json:"name"`
	Namespace         string            `json:"namespace"`
	Labels            map[string]string `json:"labels"`
	DataCount         int               `json:"dataCount"`
	CreationTimestamp time.Time         `json:"creationTimestamp"`
	Age               string            `json:"age"`
}

// ConfigMapDetail ConfigMap详情
type ConfigMapDetail struct {
	Name              string            `json:"name"`
	Namespace         string            `json:"namespace"`
	Labels            map[string]string `json:"labels"`
	Annotations       map[string]string `json:"annotations"`
	Data              map[string]string `json:"data"`
	BinaryData        map[string][]byte `json:"binaryData,omitempty"`
	CreationTimestamp time.Time         `json:"creationTimestamp"`
	Age               string            `json:"age"`
	ResourceVersion   string            `json:"resourceVersion"`
}

// GetConfigMaps 获取ConfigMap列表
func (h *ConfigMapHandler) GetConfigMaps(c *gin.Context) {
	clusterID := c.Param("clusterID")
	namespace := c.Query("namespace") // 支持过滤命名空间
	name := c.Query("name")           // 支持搜索名称
	pageStr := c.DefaultQuery("page", "1")
	pageSizeStr := c.DefaultQuery("pageSize", "10")

	page, _ := strconv.Atoi(pageStr)
	pageSize, _ := strconv.Atoi(pageSizeStr)
	if page < 1 {
		page = 1
	}
	if pageSize < 1 || pageSize > 100 {
		pageSize = 10
	}

	// 获取集群
	id, err := strconv.ParseUint(clusterID, 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "无效的集群ID"})
		return
	}

	cluster, err := h.clusterSvc.GetCluster(uint(id))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "集群不存在"})
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
		c.JSON(http.StatusInternalServerError, gin.H{"error": fmt.Sprintf("创建K8s客户端失败: %v", err)})
		return
	}

	clientset := k8sClient.GetClientset()

	// 获取ConfigMap列表
	var configMaps []corev1.ConfigMap
	if namespace != "" && namespace != "_all_" {
		list, err := clientset.CoreV1().ConfigMaps(namespace).List(context.Background(), metav1.ListOptions{})
		if err != nil {
			logger.Error("获取ConfigMap列表失败", "cluster", cluster.Name, "namespace", namespace, "error", err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": fmt.Sprintf("获取ConfigMap列表失败: %v", err)})
			return
		}
		configMaps = list.Items
	} else {
		// 获取所有命名空间的ConfigMaps
		list, err := clientset.CoreV1().ConfigMaps("").List(context.Background(), metav1.ListOptions{})
		if err != nil {
			logger.Error("获取ConfigMap列表失败", "cluster", cluster.Name, "error", err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": fmt.Sprintf("获取ConfigMap列表失败: %v", err)})
			return
		}
		configMaps = list.Items
	}

	// 过滤和转换
	var items []ConfigMapListItem
	for _, cm := range configMaps {
		// 名称过滤
		if name != "" && !strings.Contains(strings.ToLower(cm.Name), strings.ToLower(name)) {
			continue
		}

		item := ConfigMapListItem{
			Name:              cm.Name,
			Namespace:         cm.Namespace,
			Labels:            cm.Labels,
			DataCount:         len(cm.Data) + len(cm.BinaryData),
			CreationTimestamp: cm.CreationTimestamp.Time,
			Age:               formatAge(time.Since(cm.CreationTimestamp.Time)),
		}
		items = append(items, item)
	}

	// 分页
	total := len(items)
	start := (page - 1) * pageSize
	end := start + pageSize
	if start > total {
		start = total
	}
	if end > total {
		end = total
	}

	pagedItems := items[start:end]

	c.JSON(http.StatusOK, gin.H{
		"code":    200,
		"message": "success",
		"data": gin.H{
			"items":    pagedItems,
			"total":    total,
			"page":     page,
			"pageSize": pageSize,
		},
	})
}

// GetConfigMap 获取ConfigMap详情
func (h *ConfigMapHandler) GetConfigMap(c *gin.Context) {
	clusterID := c.Param("clusterID")
	namespace := c.Param("namespace")
	name := c.Param("name")

	// 获取集群
	id, err := strconv.ParseUint(clusterID, 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "无效的集群ID"})
		return
	}

	cluster, err := h.clusterSvc.GetCluster(uint(id))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "集群不存在"})
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
		c.JSON(http.StatusInternalServerError, gin.H{"error": fmt.Sprintf("创建K8s客户端失败: %v", err)})
		return
	}

	clientset := k8sClient.GetClientset()

	// 获取ConfigMap
	cm, err := clientset.CoreV1().ConfigMaps(namespace).Get(context.Background(), name, metav1.GetOptions{})
	if err != nil {
		logger.Error("获取ConfigMap失败", "cluster", cluster.Name, "namespace", namespace, "name", name, "error", err)
		c.JSON(http.StatusNotFound, gin.H{"error": fmt.Sprintf("ConfigMap不存在: %v", err)})
		return
	}

	detail := ConfigMapDetail{
		Name:              cm.Name,
		Namespace:         cm.Namespace,
		Labels:            cm.Labels,
		Annotations:       cm.Annotations,
		Data:              cm.Data,
		BinaryData:        cm.BinaryData,
		CreationTimestamp: cm.CreationTimestamp.Time,
		Age:               formatAge(time.Since(cm.CreationTimestamp.Time)),
		ResourceVersion:   cm.ResourceVersion,
	}

	c.JSON(http.StatusOK, gin.H{
		"code":    200,
		"message": "success",
		"data":    detail,
	})
}

// GetConfigMapNamespaces 获取ConfigMap所在的命名空间列表
func (h *ConfigMapHandler) GetConfigMapNamespaces(c *gin.Context) {
	clusterID := c.Param("clusterID")

	// 获取集群
	id, err := strconv.ParseUint(clusterID, 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "无效的集群ID"})
		return
	}

	cluster, err := h.clusterSvc.GetCluster(uint(id))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "集群不存在"})
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
		c.JSON(http.StatusInternalServerError, gin.H{"error": fmt.Sprintf("创建K8s客户端失败: %v", err)})
		return
	}

	clientset := k8sClient.GetClientset()

	// 获取所有ConfigMaps
	configMaps, err := clientset.CoreV1().ConfigMaps("").List(context.Background(), metav1.ListOptions{})
	if err != nil {
		logger.Error("获取ConfigMap列表失败", "cluster", cluster.Name, "error", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": fmt.Sprintf("获取ConfigMap列表失败: %v", err)})
		return
	}

	// 统计每个命名空间的ConfigMap数量
	nsMap := make(map[string]int)
	for _, cm := range configMaps.Items {
		nsMap[cm.Namespace]++
	}

	type NamespaceItem struct {
		Name  string `json:"name"`
		Count int    `json:"count"`
	}

	var namespaces []NamespaceItem
	for ns, count := range nsMap {
		namespaces = append(namespaces, NamespaceItem{
			Name:  ns,
			Count: count,
		})
	}

	c.JSON(http.StatusOK, gin.H{
		"code":    200,
		"message": "success",
		"data":    namespaces,
	})
}

// DeleteConfigMap 删除ConfigMap
func (h *ConfigMapHandler) DeleteConfigMap(c *gin.Context) {
	clusterID := c.Param("clusterID")
	namespace := c.Param("namespace")
	name := c.Param("name")

	// 获取集群
	id, err := strconv.ParseUint(clusterID, 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "无效的集群ID"})
		return
	}

	cluster, err := h.clusterSvc.GetCluster(uint(id))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "集群不存在"})
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
		c.JSON(http.StatusInternalServerError, gin.H{"error": fmt.Sprintf("创建K8s客户端失败: %v", err)})
		return
	}

	clientset := k8sClient.GetClientset()

	// 删除ConfigMap
	err = clientset.CoreV1().ConfigMaps(namespace).Delete(context.Background(), name, metav1.DeleteOptions{})
	if err != nil {
		logger.Error("删除ConfigMap失败", "cluster", cluster.Name, "namespace", namespace, "name", name, "error", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": fmt.Sprintf("删除ConfigMap失败: %v", err)})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"code":    200,
		"message": "ConfigMap删除成功",
		"data":    nil,
	})
}

// CreateConfigMap 创建ConfigMap
func (h *ConfigMapHandler) CreateConfigMap(c *gin.Context) {
	clusterID := c.Param("clusterID")

	var req struct {
		Name        string            `json:"name" binding:"required"`
		Namespace   string            `json:"namespace" binding:"required"`
		Labels      map[string]string `json:"labels"`
		Annotations map[string]string `json:"annotations"`
		Data        map[string]string `json:"data"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": fmt.Sprintf("请求参数错误: %v", err)})
		return
	}

	// 获取集群
	id, err := strconv.ParseUint(clusterID, 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "无效的集群ID"})
		return
	}

	cluster, err := h.clusterSvc.GetCluster(uint(id))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "集群不存在"})
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
		c.JSON(http.StatusInternalServerError, gin.H{"error": fmt.Sprintf("创建K8s客户端失败: %v", err)})
		return
	}

	clientset := k8sClient.GetClientset()

	// 创建ConfigMap
	configMap := &corev1.ConfigMap{
		ObjectMeta: metav1.ObjectMeta{
			Name:        req.Name,
			Namespace:   req.Namespace,
			Labels:      req.Labels,
			Annotations: req.Annotations,
		},
		Data: req.Data,
	}

	created, err := clientset.CoreV1().ConfigMaps(req.Namespace).Create(context.Background(), configMap, metav1.CreateOptions{})
	if err != nil {
		logger.Error("创建ConfigMap失败", "cluster", cluster.Name, "namespace", req.Namespace, "name", req.Name, "error", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": fmt.Sprintf("创建ConfigMap失败: %v", err)})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"code":    200,
		"message": "ConfigMap创建成功",
		"data": gin.H{
			"name":      created.Name,
			"namespace": created.Namespace,
		},
	})
}

// UpdateConfigMap 更新ConfigMap
func (h *ConfigMapHandler) UpdateConfigMap(c *gin.Context) {
	clusterID := c.Param("clusterID")
	namespace := c.Param("namespace")
	name := c.Param("name")

	var req struct {
		Labels      map[string]string `json:"labels"`
		Annotations map[string]string `json:"annotations"`
		Data        map[string]string `json:"data"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": fmt.Sprintf("请求参数错误: %v", err)})
		return
	}

	// 获取集群
	id, err := strconv.ParseUint(clusterID, 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "无效的集群ID"})
		return
	}

	cluster, err := h.clusterSvc.GetCluster(uint(id))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "集群不存在"})
		return
	}

	// 创建K8s客户端
	// Todo 改为使用informer，再 k8s/manager.go 中实现
	var k8sClient *services.K8sClient
	if cluster.KubeconfigEnc != "" {
		k8sClient, err = services.NewK8sClientFromKubeconfig(cluster.KubeconfigEnc)
	} else {
		k8sClient, err = services.NewK8sClientFromToken(cluster.APIServer, cluster.SATokenEnc, cluster.CAEnc)
	}
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": fmt.Sprintf("创建K8s客户端失败: %v", err)})
		return
	}

	clientset := k8sClient.GetClientset()

	// 获取现有ConfigMap
	configMap, err := clientset.CoreV1().ConfigMaps(namespace).Get(context.Background(), name, metav1.GetOptions{})
	if err != nil {
		logger.Error("获取ConfigMap失败", "cluster", cluster.Name, "namespace", namespace, "name", name, "error", err)
		c.JSON(http.StatusNotFound, gin.H{"error": fmt.Sprintf("ConfigMap不存在: %v", err)})
		return
	}

	// 更新ConfigMap
	configMap.Labels = req.Labels
	configMap.Annotations = req.Annotations
	configMap.Data = req.Data

	updated, err := clientset.CoreV1().ConfigMaps(namespace).Update(context.Background(), configMap, metav1.UpdateOptions{})
	if err != nil {
		logger.Error("更新ConfigMap失败", "cluster", cluster.Name, "namespace", namespace, "name", name, "error", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": fmt.Sprintf("更新ConfigMap失败: %v", err)})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"code":    200,
		"message": "ConfigMap更新成功",
		"data": gin.H{
			"name":            updated.Name,
			"namespace":       updated.Namespace,
			"resourceVersion": updated.ResourceVersion,
		},
	})
}

// formatAge 格式化时间差
func formatAge(d time.Duration) string {
	if d < time.Minute {
		return fmt.Sprintf("%ds", int(d.Seconds()))
	} else if d < time.Hour {
		return fmt.Sprintf("%dm", int(d.Minutes()))
	} else if d < 24*time.Hour {
		return fmt.Sprintf("%dh", int(d.Hours()))
	}
	return fmt.Sprintf("%dd", int(d.Hours()/24))
}

