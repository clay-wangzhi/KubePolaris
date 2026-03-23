package handlers

import (
	"context"
	"time"

	"github.com/clay-wangzhi/KubePolaris/internal/k8s"
	"github.com/clay-wangzhi/KubePolaris/internal/middleware"
	"github.com/clay-wangzhi/KubePolaris/internal/response"
	"github.com/clay-wangzhi/KubePolaris/internal/services"

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
	clusterID, err := parseClusterID(clusterIDStr)
	if err != nil {
		response.BadRequest(c, "无效的集群ID")
		return
	}
	cluster, err := h.clusterService.GetCluster(clusterID)
	if err != nil {
		response.NotFound(c, "集群不存在: "+err.Error())
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	if _, err := h.k8sMgr.EnsureAndWait(ctx, cluster, 5*time.Second); err != nil {
		response.ServiceUnavailable(c, "informer 未就绪: "+err.Error())
		return
	}

	// 获取命名空间列表
	namespaces, err := h.k8sMgr.NamespacesLister(clusterID).List(labels.Everything())
	if err != nil {
		response.InternalError(c, "读取命名空间缓存失败: "+err.Error())
		return
	}

	// 获取用户的命名空间权限
	allowedNs, hasAllAccess := middleware.GetAllowedNamespaces(c)

	// 构建响应数据
	var namespaceList []NamespaceResponse
	for _, ns := range namespaces {
		// 非全部权限用户，只返回有权限的命名空间
		if !hasAllAccess && !middleware.HasNamespaceAccess(c, ns.Name) {
			continue
		}

		namespaceResp := NamespaceResponse{
			Name:              ns.Name,
			Status:            string(ns.Status.Phase),
			Labels:            ns.Labels,
			Annotations:       ns.Annotations,
			CreationTimestamp: ns.CreationTimestamp.Format("2006-01-02 15:04:05"),
		}
		namespaceList = append(namespaceList, namespaceResp)
	}

	// 返回结果，同时告知前端用户是否有全部权限
	response.OK(c, gin.H{
		"items": namespaceList,
		"meta": gin.H{
			"hasAllAccess":      hasAllAccess,
			"allowedNamespaces": allowedNs,
		},
	})
}

// GetNamespaceDetail 获取命名空间详情
func (h *NamespaceHandler) GetNamespaceDetail(c *gin.Context) {
	clusterIDStr := c.Param("clusterID")
	namespaceName := c.Param("namespace")

	// 检查命名空间访问权限
	if !middleware.HasNamespaceAccess(c, namespaceName) {
		response.Forbidden(c, "无权访问命名空间: "+namespaceName)
		return
	}

	// 获取集群信息
	clusterID, err := parseClusterID(clusterIDStr)
	if err != nil {
		response.BadRequest(c, "无效的集群ID")
		return
	}
	cluster, err := h.clusterService.GetCluster(clusterID)
	if err != nil {
		response.NotFound(c, "集群不存在: "+err.Error())
		return
	}

	// 获取缓存的 K8s 客户端
	k8sClient, err := h.k8sMgr.GetK8sClient(cluster)
	if err != nil {
		response.InternalError(c, "获取K8s客户端失败: "+err.Error())
		return
	}

	clientset := k8sClient.GetClientset()

	// 获取命名空间详情
	namespace, err := clientset.CoreV1().Namespaces().Get(context.TODO(), namespaceName, metav1.GetOptions{})
	if err != nil {
		response.NotFound(c, "命名空间不存在: "+err.Error())
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

	resourceCount := map[string]int{
		"pods": 0, "services": 0, "configMaps": 0, "secrets": 0,
	}
	if pods, err := clientset.CoreV1().Pods(namespaceName).List(context.TODO(), metav1.ListOptions{}); err == nil {
		resourceCount["pods"] = len(pods.Items)
	}
	if svcs, err := clientset.CoreV1().Services(namespaceName).List(context.TODO(), metav1.ListOptions{}); err == nil {
		resourceCount["services"] = len(svcs.Items)
	}
	if cms, err := clientset.CoreV1().ConfigMaps(namespaceName).List(context.TODO(), metav1.ListOptions{}); err == nil {
		resourceCount["configMaps"] = len(cms.Items)
	}
	if secs, err := clientset.CoreV1().Secrets(namespaceName).List(context.TODO(), metav1.ListOptions{}); err == nil {
		resourceCount["secrets"] = len(secs.Items)
	}

	namespaceDetail := map[string]interface{}{
		"name":              namespace.Name,
		"status":            string(namespace.Status.Phase),
		"labels":            namespace.Labels,
		"annotations":       namespace.Annotations,
		"creationTimestamp": namespace.CreationTimestamp.Format("2006-01-02 15:04:05"),
		"resourceQuota":     resourceQuota,
		"resourceCount":     resourceCount,
	}

	response.OK(c, namespaceDetail)
}

// CreateNamespace 创建命名空间
func (h *NamespaceHandler) CreateNamespace(c *gin.Context) {
	// 检查是否有管理员权限（只有管理员才能创建命名空间）
	permission := middleware.GetClusterPermission(c)
	if permission == nil || permission.PermissionType != "admin" {
		response.Forbidden(c, "只有管理员才能创建命名空间")
		return
	}

	clusterIDStr := c.Param("clusterID")
	clusterID, err := parseClusterID(clusterIDStr)
	if err != nil {
		response.BadRequest(c, "无效的集群ID")
		return
	}
	cluster, err := h.clusterService.GetCluster(clusterID)
	if err != nil {
		response.NotFound(c, "集群不存在: "+err.Error())
		return
	}

	var req struct {
		Name        string            `json:"name" binding:"required"`
		Labels      map[string]string `json:"labels"`
		Annotations map[string]string `json:"annotations"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "请求参数错误: "+err.Error())
		return
	}

	// 获取缓存的 K8s 客户端
	k8sClient, err := h.k8sMgr.GetK8sClient(cluster)
	if err != nil {
		response.InternalError(c, "获取K8s客户端失败: "+err.Error())
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
		response.InternalError(c, "创建命名空间失败: "+err.Error())
		return
	}

	response.OK(c, NamespaceResponse{
		Name:              createdNs.Name,
		Status:            string(createdNs.Status.Phase),
		Labels:            createdNs.Labels,
		Annotations:       createdNs.Annotations,
		CreationTimestamp: createdNs.CreationTimestamp.Format("2006-01-02 15:04:05"),
	})
}

// DeleteNamespace 删除命名空间
func (h *NamespaceHandler) DeleteNamespace(c *gin.Context) {
	// 检查是否有管理员权限（只有管理员才能删除命名空间）
	permission := middleware.GetClusterPermission(c)
	if permission == nil || permission.PermissionType != "admin" {
		response.Forbidden(c, "只有管理员才能删除命名空间")
		return
	}

	clusterIDStr := c.Param("clusterID")
	namespaceName := c.Param("namespace")

	// 获取集群信息
	clusterID, err := parseClusterID(clusterIDStr)
	if err != nil {
		response.BadRequest(c, "无效的集群ID")
		return
	}
	cluster, err := h.clusterService.GetCluster(clusterID)
	if err != nil {
		response.NotFound(c, "集群不存在: "+err.Error())
		return
	}

	// 获取缓存的 K8s 客户端
	k8sClient, err := h.k8sMgr.GetK8sClient(cluster)
	if err != nil {
		response.InternalError(c, "获取K8s客户端失败: "+err.Error())
		return
	}

	clientset := k8sClient.GetClientset()

	// 删除命名空间
	err = clientset.CoreV1().Namespaces().Delete(context.TODO(), namespaceName, metav1.DeleteOptions{})
	if err != nil {
		response.InternalError(c, "删除命名空间失败: "+err.Error())
		return
	}

	response.NoContent(c)
}

// convertResourceList 转换资源列表为字符串map
func convertResourceList(rl corev1.ResourceList) map[string]string {
	result := make(map[string]string)
	for k, v := range rl {
		result[string(k)] = v.String()
	}
	return result
}
