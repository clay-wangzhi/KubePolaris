package handlers

import (
	"context"
	"net/http"
	"time"

	"kubepolaris/internal/k8s"
	"kubepolaris/internal/services"

	"github.com/gin-gonic/gin"
	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/labels"
)

type NamespaceHandler struct {
	clusterService *services.ClusterService
	k8sMgr         *k8s.ClusterInformerManager
}

func NewNamespaceHandler(clusterService *services.ClusterService, k8sMgr *k8s.ClusterInformerManager) *NamespaceHandler {
	return &NamespaceHandler{
		clusterService: clusterService,
		k8sMgr:         k8sMgr,
	}
}

// NamespaceResponse 命名空间响应结构
type NamespaceResponse struct {
	Name              string             `json:"name"`
	Status            string             `json:"status"`
	Labels            map[string]string  `json:"labels"`
	Annotations       map[string]string  `json:"annotations"`
	CreationTimestamp string             `json:"creationTimestamp"`
	ResourceQuota     *ResourceQuotaInfo `json:"resourceQuota,omitempty"`
}

// ResourceQuotaInfo 资源配额信息
type ResourceQuotaInfo struct {
	Hard map[string]string `json:"hard"`
	Used map[string]string `json:"used"`
}

// GetNamespaces 获取集群命名空间列表
func (h *NamespaceHandler) GetNamespaces(c *gin.Context) {
	clusterIDStr := c.Param("clusterID")

	// 获取集群信息
	clusterID := parseClusterID(clusterIDStr)
	cluster, err := h.clusterService.GetCluster(clusterID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{
			"code":    http.StatusNotFound,
			"message": "集群不存在: " + err.Error(),
			"data":    nil,
		})
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	if _, err := h.k8sMgr.EnsureAndWait(ctx, cluster, 5*time.Second); err != nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"code": 503, "message": "informer 未就绪: " + err.Error()})
		return
	}

	// 获取命名空间列表
	namespaces, err := h.k8sMgr.NamespacesLister(clusterID).List(labels.Everything())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"code": 500, "message": "读取命名空间缓存失败: " + err.Error()})
		return
	}

	// 构建响应数据
	var namespaceList []NamespaceResponse
	for _, ns := range namespaces {
		namespaceResp := NamespaceResponse{
			Name:              ns.Name,
			Status:            string(ns.Status.Phase),
			Labels:            ns.Labels,
			Annotations:       ns.Annotations,
			CreationTimestamp: ns.CreationTimestamp.Format("2006-01-02 15:04:05"),
		}
		namespaceList = append(namespaceList, namespaceResp)
	}

	c.JSON(http.StatusOK, gin.H{
		"code":    http.StatusOK,
		"message": "success",
		"data":    namespaceList,
	})
}

// GetNamespaceDetail 获取命名空间详情
func (h *NamespaceHandler) GetNamespaceDetail(c *gin.Context) {
	clusterIDStr := c.Param("clusterID")
	namespaceName := c.Param("namespace")

	// 获取集群信息
	clusterID := parseClusterID(clusterIDStr)
	cluster, err := h.clusterService.GetCluster(clusterID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{
			"code":    http.StatusNotFound,
			"message": "集群不存在: " + err.Error(),
			"data":    nil,
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
			"code":    http.StatusInternalServerError,
			"message": "创建K8s客户端失败: " + err.Error(),
			"data":    nil,
		})
		return
	}

	clientset := k8sClient.GetClientset()

	// 获取命名空间详情
	namespace, err := clientset.CoreV1().Namespaces().Get(context.TODO(), namespaceName, metav1.GetOptions{})
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{
			"code":    http.StatusNotFound,
			"message": "命名空间不存在: " + err.Error(),
			"data":    nil,
		})
		return
	}

	// 获取资源配额
	quotas, err := clientset.CoreV1().ResourceQuotas(namespaceName).List(context.TODO(), metav1.ListOptions{})
	var resourceQuota *ResourceQuotaInfo
	if err == nil && len(quotas.Items) > 0 {
		quota := quotas.Items[0]
		resourceQuota = &ResourceQuotaInfo{
			Hard: convertResourceList(quota.Status.Hard),
			Used: convertResourceList(quota.Status.Used),
		}
	}

	// 获取命名空间下的资源统计
	pods, _ := clientset.CoreV1().Pods(namespaceName).List(context.TODO(), metav1.ListOptions{})
	services, _ := clientset.CoreV1().Services(namespaceName).List(context.TODO(), metav1.ListOptions{})
	configMaps, _ := clientset.CoreV1().ConfigMaps(namespaceName).List(context.TODO(), metav1.ListOptions{})
	secrets, _ := clientset.CoreV1().Secrets(namespaceName).List(context.TODO(), metav1.ListOptions{})

	namespaceDetail := map[string]interface{}{
		"name":              namespace.Name,
		"status":            string(namespace.Status.Phase),
		"labels":            namespace.Labels,
		"annotations":       namespace.Annotations,
		"creationTimestamp": namespace.CreationTimestamp.Format("2006-01-02 15:04:05"),
		"resourceQuota":     resourceQuota,
		"resourceCount": map[string]int{
			"pods":       len(pods.Items),
			"services":   len(services.Items),
			"configMaps": len(configMaps.Items),
			"secrets":    len(secrets.Items),
		},
	}

	c.JSON(http.StatusOK, gin.H{
		"code":    http.StatusOK,
		"message": "success",
		"data":    namespaceDetail,
	})
}

// CreateNamespace 创建命名空间
func (h *NamespaceHandler) CreateNamespace(c *gin.Context) {
	clusterIDStr := c.Param("clusterID")
	clusterID := parseClusterID(clusterIDStr)
	cluster, err := h.clusterService.GetCluster(clusterID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{
			"code":    http.StatusNotFound,
			"message": "集群不存在: " + err.Error(),
			"data":    nil,
		})
		return
	}

	var req struct {
		Name        string            `json:"name" binding:"required"`
		Labels      map[string]string `json:"labels"`
		Annotations map[string]string `json:"annotations"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"code":    http.StatusBadRequest,
			"message": "请求参数错误: " + err.Error(),
			"data":    nil,
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
			"code":    http.StatusInternalServerError,
			"message": "创建K8s客户端失败: " + err.Error(),
			"data":    nil,
		})
		return
	}

	clientset := k8sClient.GetClientset()

	// 构建命名空间对象
	namespace := &corev1.Namespace{
		ObjectMeta: metav1.ObjectMeta{
			Name:        req.Name,
			Labels:      req.Labels,
			Annotations: req.Annotations,
		},
	}

	// 创建命名空间
	createdNs, err := clientset.CoreV1().Namespaces().Create(context.TODO(), namespace, metav1.CreateOptions{})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"code":    http.StatusInternalServerError,
			"message": "创建命名空间失败: " + err.Error(),
			"data":    nil,
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"code":    http.StatusOK,
		"message": "命名空间创建成功",
		"data": NamespaceResponse{
			Name:              createdNs.Name,
			Status:            string(createdNs.Status.Phase),
			Labels:            createdNs.Labels,
			Annotations:       createdNs.Annotations,
			CreationTimestamp: createdNs.CreationTimestamp.Format("2006-01-02 15:04:05"),
		},
	})
}

// DeleteNamespace 删除命名空间
func (h *NamespaceHandler) DeleteNamespace(c *gin.Context) {
	clusterIDStr := c.Param("clusterID")
	namespaceName := c.Param("namespace")

	// 获取集群信息
	clusterID := parseClusterID(clusterIDStr)
	cluster, err := h.clusterService.GetCluster(clusterID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{
			"code":    http.StatusNotFound,
			"message": "集群不存在: " + err.Error(),
			"data":    nil,
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
			"code":    http.StatusInternalServerError,
			"message": "创建K8s客户端失败: " + err.Error(),
			"data":    nil,
		})
		return
	}

	clientset := k8sClient.GetClientset()

	// 删除命名空间
	err = clientset.CoreV1().Namespaces().Delete(context.TODO(), namespaceName, metav1.DeleteOptions{})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"code":    http.StatusInternalServerError,
			"message": "删除命名空间失败: " + err.Error(),
			"data":    nil,
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"code":    http.StatusOK,
		"message": "命名空间删除成功",
		"data":    nil,
	})
}

// convertResourceList 转换资源列表为字符串map
func convertResourceList(rl corev1.ResourceList) map[string]string {
	result := make(map[string]string)
	for k, v := range rl {
		result[string(k)] = v.String()
	}
	return result
}

