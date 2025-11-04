/** genAI_main_start */
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

type SecretHandler struct {
	db         *gorm.DB
	cfg        *config.Config
	clusterSvc *services.ClusterService
	k8sMgr     *k8s.ClusterInformerManager
}

func NewSecretHandler(db *gorm.DB, cfg *config.Config, clusterSvc *services.ClusterService, k8sMgr *k8s.ClusterInformerManager) *SecretHandler {
	return &SecretHandler{
		db:         db,
		cfg:        cfg,
		clusterSvc: clusterSvc,
		k8sMgr:     k8sMgr,
	}
}

// SecretListItem Secret列表项
type SecretListItem struct {
	Name              string            `json:"name"`
	Namespace         string            `json:"namespace"`
	Type              string            `json:"type"`
	Labels            map[string]string `json:"labels"`
	DataCount         int               `json:"dataCount"`
	CreationTimestamp time.Time         `json:"creationTimestamp"`
	Age               string            `json:"age"`
}

// SecretDetail Secret详情
type SecretDetail struct {
	Name              string            `json:"name"`
	Namespace         string            `json:"namespace"`
	Type              string            `json:"type"`
	Labels            map[string]string `json:"labels"`
	Annotations       map[string]string `json:"annotations"`
	Data              map[string]string `json:"data"` // Base64编码的数据
	CreationTimestamp time.Time         `json:"creationTimestamp"`
	Age               string            `json:"age"`
	ResourceVersion   string            `json:"resourceVersion"`
}

// GetSecrets 获取Secret列表
func (h *SecretHandler) GetSecrets(c *gin.Context) {
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

	// 获取Secret列表
	var secrets []corev1.Secret
	if namespace != "" && namespace != "_all_" {
		list, err := clientset.CoreV1().Secrets(namespace).List(context.Background(), metav1.ListOptions{})
		if err != nil {
			logger.Error("获取Secret列表失败", "cluster", cluster.Name, "namespace", namespace, "error", err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": fmt.Sprintf("获取Secret列表失败: %v", err)})
			return
		}
		secrets = list.Items
	} else {
		// 获取所有命名空间的Secrets
		list, err := clientset.CoreV1().Secrets("").List(context.Background(), metav1.ListOptions{})
		if err != nil {
			logger.Error("获取Secret列表失败", "cluster", cluster.Name, "error", err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": fmt.Sprintf("获取Secret列表失败: %v", err)})
			return
		}
		secrets = list.Items
	}

	// 过滤和转换
	var items []SecretListItem
	for _, secret := range secrets {
		// 名称过滤
		if name != "" && !strings.Contains(strings.ToLower(secret.Name), strings.ToLower(name)) {
			continue
		}

		item := SecretListItem{
			Name:              secret.Name,
			Namespace:         secret.Namespace,
			Type:              string(secret.Type),
			Labels:            secret.Labels,
			DataCount:         len(secret.Data),
			CreationTimestamp: secret.CreationTimestamp.Time,
			Age:               formatAge(time.Since(secret.CreationTimestamp.Time)),
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

// GetSecret 获取Secret详情
func (h *SecretHandler) GetSecret(c *gin.Context) {
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

	// 获取Secret
	secret, err := clientset.CoreV1().Secrets(namespace).Get(context.Background(), name, metav1.GetOptions{})
	if err != nil {
		logger.Error("获取Secret失败", "cluster", cluster.Name, "namespace", namespace, "name", name, "error", err)
		c.JSON(http.StatusNotFound, gin.H{"error": fmt.Sprintf("Secret不存在: %v", err)})
		return
	}

	// 将Data字节数组转换为Base64字符串
	dataStr := make(map[string]string)
	for k, v := range secret.Data {
		dataStr[k] = string(v) // 前端需要Base64解码显示
	}

	detail := SecretDetail{
		Name:              secret.Name,
		Namespace:         secret.Namespace,
		Type:              string(secret.Type),
		Labels:            secret.Labels,
		Annotations:       secret.Annotations,
		Data:              dataStr,
		CreationTimestamp: secret.CreationTimestamp.Time,
		Age:               formatAge(time.Since(secret.CreationTimestamp.Time)),
		ResourceVersion:   secret.ResourceVersion,
	}

	c.JSON(http.StatusOK, gin.H{
		"code":    200,
		"message": "success",
		"data":    detail,
	})
}

// GetSecretNamespaces 获取Secret所在的命名空间列表
func (h *SecretHandler) GetSecretNamespaces(c *gin.Context) {
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

	// 获取所有Secrets
	secrets, err := clientset.CoreV1().Secrets("").List(context.Background(), metav1.ListOptions{})
	if err != nil {
		logger.Error("获取Secret列表失败", "cluster", cluster.Name, "error", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": fmt.Sprintf("获取Secret列表失败: %v", err)})
		return
	}

	// 统计每个命名空间的Secret数量
	nsMap := make(map[string]int)
	for _, secret := range secrets.Items {
		nsMap[secret.Namespace]++
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

// DeleteSecret 删除Secret
func (h *SecretHandler) DeleteSecret(c *gin.Context) {
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

	// 删除Secret
	err = clientset.CoreV1().Secrets(namespace).Delete(context.Background(), name, metav1.DeleteOptions{})
	if err != nil {
		logger.Error("删除Secret失败", "cluster", cluster.Name, "namespace", namespace, "name", name, "error", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": fmt.Sprintf("删除Secret失败: %v", err)})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"code":    200,
		"message": "Secret删除成功",
		"data":    nil,
	})
}

// CreateSecret 创建Secret
func (h *SecretHandler) CreateSecret(c *gin.Context) {
	clusterID := c.Param("clusterID")

	var req struct {
		Name        string            `json:"name" binding:"required"`
		Namespace   string            `json:"namespace" binding:"required"`
		Type        string            `json:"type"`
		Labels      map[string]string `json:"labels"`
		Annotations map[string]string `json:"annotations"`
		Data        map[string]string `json:"data"` // Base64编码的数据
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

	// 将字符串数据转换为字节数组
	dataBytes := make(map[string][]byte)
	for k, v := range req.Data {
		dataBytes[k] = []byte(v)
	}

	// 默认类型
	secretType := corev1.SecretTypeOpaque
	if req.Type != "" {
		secretType = corev1.SecretType(req.Type)
	}

	// 创建Secret
	secret := &corev1.Secret{
		ObjectMeta: metav1.ObjectMeta{
			Name:        req.Name,
			Namespace:   req.Namespace,
			Labels:      req.Labels,
			Annotations: req.Annotations,
		},
		Type: secretType,
		Data: dataBytes,
	}

	created, err := clientset.CoreV1().Secrets(req.Namespace).Create(context.Background(), secret, metav1.CreateOptions{})
	if err != nil {
		logger.Error("创建Secret失败", "cluster", cluster.Name, "namespace", req.Namespace, "name", req.Name, "error", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": fmt.Sprintf("创建Secret失败: %v", err)})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"code":    200,
		"message": "Secret创建成功",
		"data": gin.H{
			"name":      created.Name,
			"namespace": created.Namespace,
		},
	})
}

// UpdateSecret 更新Secret
func (h *SecretHandler) UpdateSecret(c *gin.Context) {
	clusterID := c.Param("clusterID")
	namespace := c.Param("namespace")
	name := c.Param("name")

	var req struct {
		Labels      map[string]string `json:"labels"`
		Annotations map[string]string `json:"annotations"`
		Data        map[string]string `json:"data"` // Base64编码的数据
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

	// 获取现有Secret
	secret, err := clientset.CoreV1().Secrets(namespace).Get(context.Background(), name, metav1.GetOptions{})
	if err != nil {
		logger.Error("获取Secret失败", "cluster", cluster.Name, "namespace", namespace, "name", name, "error", err)
		c.JSON(http.StatusNotFound, gin.H{"error": fmt.Sprintf("Secret不存在: %v", err)})
		return
	}

	// 将字符串数据转换为字节数组
	dataBytes := make(map[string][]byte)
	for k, v := range req.Data {
		dataBytes[k] = []byte(v)
	}

	// 更新Secret
	secret.Labels = req.Labels
	secret.Annotations = req.Annotations
	secret.Data = dataBytes

	updated, err := clientset.CoreV1().Secrets(namespace).Update(context.Background(), secret, metav1.UpdateOptions{})
	if err != nil {
		logger.Error("更新Secret失败", "cluster", cluster.Name, "namespace", namespace, "name", name, "error", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": fmt.Sprintf("更新Secret失败: %v", err)})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"code":    200,
		"message": "Secret更新成功",
		"data": gin.H{
			"name":            updated.Name,
			"namespace":       updated.Namespace,
			"resourceVersion": updated.ResourceVersion,
		},
	})
}

/** genAI_main_end */
