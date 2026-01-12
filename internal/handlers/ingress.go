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
	"kubepolaris/internal/middleware"
	"kubepolaris/internal/services"
	"kubepolaris/pkg/logger"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
	networkingv1 "k8s.io/api/networking/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/kubernetes"
	"sigs.k8s.io/yaml"
)

// IngressHandler Ingress处理器
type IngressHandler struct {
	db             *gorm.DB
	cfg            *config.Config
	clusterService *services.ClusterService
	k8sMgr         *k8s.ClusterInformerManager
}

// NewIngressHandler 创建Ingress处理器
func NewIngressHandler(db *gorm.DB, cfg *config.Config, clusterService *services.ClusterService, k8sMgr *k8s.ClusterInformerManager) *IngressHandler {
	return &IngressHandler{
		db:             db,
		cfg:            cfg,
		clusterService: clusterService,
		k8sMgr:         k8sMgr,
	}
}

// IngressInfo Ingress信息
type IngressInfo struct {
	Name             string               `json:"name"`
	Namespace        string               `json:"namespace"`
	IngressClassName *string              `json:"ingressClassName,omitempty"`
	Rules            []IngressRuleInfo    `json:"rules"`
	TLS              []IngressTLSInfo     `json:"tls,omitempty"`
	LoadBalancer     []LoadBalancerStatus `json:"loadBalancer,omitempty"`
	CreatedAt        time.Time            `json:"createdAt"`
	Labels           map[string]string    `json:"labels"`
	Annotations      map[string]string    `json:"annotations"`
}

// IngressRuleInfo Ingress规则信息
type IngressRuleInfo struct {
	Host  string            `json:"host"`
	Paths []IngressPathInfo `json:"paths"`
}

// IngressPathInfo Ingress路径信息
type IngressPathInfo struct {
	Path        string `json:"path"`
	PathType    string `json:"pathType"`
	ServiceName string `json:"serviceName"`
	ServicePort string `json:"servicePort"`
}

// IngressTLSInfo Ingress TLS信息
type IngressTLSInfo struct {
	Hosts      []string `json:"hosts"`
	SecretName string   `json:"secretName"`
}

// LoadBalancerStatus 负载均衡器状态
type LoadBalancerStatus struct {
	IP       string `json:"ip,omitempty"`
	Hostname string `json:"hostname,omitempty"`
}

// ListIngresses 获取Ingress列表
func (h *IngressHandler) ListIngresses(c *gin.Context) {
	clusterIDStr := c.Param("clusterID")
	clusterID := parseClusterID(clusterIDStr)

	// 获取查询参数
	namespace := c.DefaultQuery("namespace", "")
	ingressClass := c.DefaultQuery("ingressClass", "")
	search := c.DefaultQuery("search", "")
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("pageSize", "10"))

	// 从集群服务获取集群信息
	cluster, err := h.clusterService.GetCluster(clusterID)
	if err != nil {
		logger.Error("获取集群失败", "error", err, "clusterId", clusterID)
		c.JSON(404, gin.H{"code": 404, "message": "集群不存在", "data": nil})
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
		logger.Error("创建K8s客户端失败", "error", err, "clusterId", clusterID)
		c.JSON(500, gin.H{"code": 500, "message": fmt.Sprintf("创建K8s客户端失败: %v", err), "data": nil})
		return
	}

	clientset := k8sClient.GetClientset()

	// 检查命名空间权限
	nsInfo, hasAccess := middleware.CheckNamespacePermission(c, namespace)
	if !hasAccess {
		c.JSON(http.StatusForbidden, gin.H{
			"code":    403,
			"message": fmt.Sprintf("无权访问命名空间: %s", namespace),
		})
		return
	}

	// 获取Ingresses
	ingresses, err := h.getIngresses(clientset, namespace)
	if err != nil {
		logger.Error("获取Ingresses失败", "error", err, "clusterId", clusterID)
		c.JSON(500, gin.H{"code": 500, "message": fmt.Sprintf("获取Ingresses失败: %v", err), "data": nil})
		return
	}

	// 根据命名空间权限过滤
	if !nsInfo.HasAllAccess && namespace == "" {
		ingresses = middleware.FilterResourcesByNamespace(c, ingresses, func(i IngressInfo) string {
			return i.Namespace
		})
	}

	// 过滤和搜索
	filteredIngresses := h.filterIngresses(ingresses, ingressClass, search)

	// 排序
	sort.Slice(filteredIngresses, func(i, j int) bool {
		return filteredIngresses[i].CreatedAt.After(filteredIngresses[j].CreatedAt)
	})

	// 分页
	total := len(filteredIngresses)
	start := (page - 1) * pageSize
	end := start + pageSize
	if start > total {
		start = total
	}
	if end > total {
		end = total
	}
	pagedIngresses := filteredIngresses[start:end]

	c.JSON(200, gin.H{
		"code":    200,
		"message": "success",
		"data": gin.H{
			"items":    pagedIngresses,
			"total":    total,
			"page":     page,
			"pageSize": pageSize,
		},
	})
}

// GetIngress 获取单个Ingress详情
func (h *IngressHandler) GetIngress(c *gin.Context) {
	clusterIDStr := c.Param("clusterID")
	clusterID := parseClusterID(clusterIDStr)

	namespace := c.Param("namespace")
	name := c.Param("name")

	// 从集群服务获取集群信息
	cluster, err := h.clusterService.GetCluster(clusterID)
	if err != nil {
		logger.Error("获取集群失败", "error", err, "clusterId", clusterID)
		c.JSON(404, gin.H{"code": 404, "message": "集群不存在", "data": nil})
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
		logger.Error("创建K8s客户端失败", "error", err, "clusterId", clusterID)
		c.JSON(500, gin.H{"code": 500, "message": fmt.Sprintf("创建K8s客户端失败: %v", err), "data": nil})
		return
	}

	clientset := k8sClient.GetClientset()

	// 获取Ingress
	ingress, err := clientset.NetworkingV1().Ingresses(namespace).Get(context.Background(), name, metav1.GetOptions{})
	if err != nil {
		logger.Error("获取Ingress失败", "error", err, "clusterId", clusterID, "namespace", namespace, "name", name)
		c.JSON(500, gin.H{"code": 500, "message": fmt.Sprintf("获取Ingress失败: %v", err), "data": nil})
		return
	}

	ingressInfo := h.convertToIngressInfo(ingress)

	c.JSON(200, gin.H{
		"code":    200,
		"message": "success",
		"data":    ingressInfo,
	})
}

// GetIngressYAML 获取Ingress的YAML
func (h *IngressHandler) GetIngressYAML(c *gin.Context) {
	clusterIDStr := c.Param("clusterID")
	clusterID := parseClusterID(clusterIDStr)

	namespace := c.Param("namespace")
	name := c.Param("name")

	// 从集群服务获取集群信息
	cluster, err := h.clusterService.GetCluster(clusterID)
	if err != nil {
		logger.Error("获取集群失败", "error", err, "clusterId", clusterID)
		c.JSON(404, gin.H{"code": 404, "message": "集群不存在", "data": nil})
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
		logger.Error("创建K8s客户端失败", "error", err, "clusterId", clusterID)
		c.JSON(500, gin.H{"code": 500, "message": fmt.Sprintf("创建K8s客户端失败: %v", err), "data": nil})
		return
	}

	clientset := k8sClient.GetClientset()

	// 获取Ingress
	ingress, err := clientset.NetworkingV1().Ingresses(namespace).Get(context.Background(), name, metav1.GetOptions{})
	if err != nil {
		logger.Error("获取Ingress失败", "error", err, "clusterId", clusterID, "namespace", namespace, "name", name)
		c.JSON(500, gin.H{"code": 500, "message": fmt.Sprintf("获取Ingress失败: %v", err), "data": nil})
		return
	}

	// 设置 apiVersion 和 kind（API 返回的对象不包含这些字段）
	cleanIng := ingress.DeepCopy()
	cleanIng.APIVersion = "networking.k8s.io/v1"
	cleanIng.Kind = "Ingress"
	cleanIng.ManagedFields = nil // 移除 managedFields 简化 YAML

	// 转换为YAML
	yamlData, err := yaml.Marshal(cleanIng)
	if err != nil {
		logger.Error("转换YAML失败", "error", err)
		c.JSON(500, gin.H{"code": 500, "message": fmt.Sprintf("转换YAML失败: %v", err), "data": nil})
		return
	}

	c.JSON(200, gin.H{
		"code":    200,
		"message": "success",
		"data":    gin.H{"yaml": string(yamlData)},
	})
}

// DeleteIngress 删除Ingress
func (h *IngressHandler) DeleteIngress(c *gin.Context) {
	clusterIDStr := c.Param("clusterID")
	clusterID := parseClusterID(clusterIDStr)

	namespace := c.Param("namespace")
	name := c.Param("name")

	// 从集群服务获取集群信息
	cluster, err := h.clusterService.GetCluster(clusterID)
	if err != nil {
		logger.Error("获取集群失败", "error", err, "clusterId", clusterID)
		c.JSON(404, gin.H{"code": 404, "message": "集群不存在", "data": nil})
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
		logger.Error("创建K8s客户端失败", "error", err, "clusterId", clusterID)
		c.JSON(500, gin.H{"code": 500, "message": fmt.Sprintf("创建K8s客户端失败: %v", err), "data": nil})
		return
	}

	clientset := k8sClient.GetClientset()

	// 删除Ingress
	err = clientset.NetworkingV1().Ingresses(namespace).Delete(context.Background(), name, metav1.DeleteOptions{})
	if err != nil {
		logger.Error("删除Ingress失败", "error", err, "clusterId", clusterID, "namespace", namespace, "name", name)
		c.JSON(500, gin.H{"code": 500, "message": fmt.Sprintf("删除Ingress失败: %v", err), "data": nil})
		return
	}

	logger.Info("Ingress删除成功", "clusterId", clusterID, "namespace", namespace, "name", name)
	c.JSON(200, gin.H{"code": 200, "message": "Ingress删除成功", "data": nil})
}

// 辅助函数

// getIngresses 获取Ingresses
func (h *IngressHandler) getIngresses(clientset kubernetes.Interface, namespace string) ([]IngressInfo, error) {
	var ingressList *networkingv1.IngressList
	var err error

	if namespace == "" || namespace == "_all_" {
		ingressList, err = clientset.NetworkingV1().Ingresses("").List(context.Background(), metav1.ListOptions{})
	} else {
		ingressList, err = clientset.NetworkingV1().Ingresses(namespace).List(context.Background(), metav1.ListOptions{})
	}

	if err != nil {
		return nil, err
	}

	ingresses := make([]IngressInfo, 0, len(ingressList.Items))
	for _, ing := range ingressList.Items {
		ingresses = append(ingresses, h.convertToIngressInfo(&ing))
	}

	return ingresses, nil
}

// convertToIngressInfo 转换为IngressInfo
func (h *IngressHandler) convertToIngressInfo(ing *networkingv1.Ingress) IngressInfo {
	// 转换规则
	rules := make([]IngressRuleInfo, 0, len(ing.Spec.Rules))
	for _, rule := range ing.Spec.Rules {
		paths := make([]IngressPathInfo, 0)
		if rule.HTTP != nil {
			for _, path := range rule.HTTP.Paths {
				pathType := ""
				if path.PathType != nil {
					pathType = string(*path.PathType)
				}

				servicePort := ""
				if path.Backend.Service != nil {
					if path.Backend.Service.Port.Number > 0 {
						servicePort = strconv.Itoa(int(path.Backend.Service.Port.Number))
					} else {
						servicePort = path.Backend.Service.Port.Name
					}
				}

				paths = append(paths, IngressPathInfo{
					Path:     path.Path,
					PathType: pathType,
					ServiceName: func() string {
						if path.Backend.Service != nil {
							return path.Backend.Service.Name
						}
						return ""
					}(),
					ServicePort: servicePort,
				})
			}
		}

		rules = append(rules, IngressRuleInfo{
			Host:  rule.Host,
			Paths: paths,
		})
	}

	// 转换TLS
	tls := make([]IngressTLSInfo, 0, len(ing.Spec.TLS))
	for _, t := range ing.Spec.TLS {
		tls = append(tls, IngressTLSInfo{
			Hosts:      t.Hosts,
			SecretName: t.SecretName,
		})
	}

	// 转换LoadBalancer状态
	lbStatus := make([]LoadBalancerStatus, 0, len(ing.Status.LoadBalancer.Ingress))
	for _, lb := range ing.Status.LoadBalancer.Ingress {
		lbStatus = append(lbStatus, LoadBalancerStatus{
			IP:       lb.IP,
			Hostname: lb.Hostname,
		})
	}

	return IngressInfo{
		Name:             ing.Name,
		Namespace:        ing.Namespace,
		IngressClassName: ing.Spec.IngressClassName,
		Rules:            rules,
		TLS:              tls,
		LoadBalancer:     lbStatus,
		CreatedAt:        ing.CreationTimestamp.Time,
		Labels:           ing.Labels,
		Annotations:      ing.Annotations,
	}
}

// filterIngresses 过滤Ingresses
func (h *IngressHandler) filterIngresses(ingresses []IngressInfo, ingressClass, search string) []IngressInfo {
	filtered := make([]IngressInfo, 0)
	for _, ing := range ingresses {
		// IngressClass过滤
		if ingressClass != "" {
			if ing.IngressClassName == nil || *ing.IngressClassName != ingressClass {
				continue
			}
		}

		// 搜索过滤
		if search != "" {
			searchLower := strings.ToLower(search)
			matched := false

			// 匹配名称和命名空间
			if strings.Contains(strings.ToLower(ing.Name), searchLower) ||
				strings.Contains(strings.ToLower(ing.Namespace), searchLower) {
				matched = true
			}

			// 匹配Host和路径
			for _, rule := range ing.Rules {
				if strings.Contains(strings.ToLower(rule.Host), searchLower) {
					matched = true
					break
				}
				for _, path := range rule.Paths {
					if strings.Contains(strings.ToLower(path.ServiceName), searchLower) ||
						strings.Contains(strings.ToLower(path.Path), searchLower) {
						matched = true
						break
					}
				}
				if matched {
					break
				}
			}

			if !matched {
				continue
			}
		}

		filtered = append(filtered, ing)
	}
	return filtered
}

// CreateIngressRequest 创建Ingress请求
type CreateIngressRequest struct {
	Namespace string           `json:"namespace" binding:"required"`
	YAML      string           `json:"yaml,omitempty"`     // YAML方式创建
	FormData  *IngressFormData `json:"formData,omitempty"` // 表单方式创建
}

// IngressFormData Ingress表单数据
type IngressFormData struct {
	Name             string                `json:"name" binding:"required"`
	IngressClassName *string               `json:"ingressClassName,omitempty"`
	Rules            []IngressRuleFormData `json:"rules" binding:"required"`
	TLS              []IngressTLSFormData  `json:"tls,omitempty"`
	Labels           map[string]string     `json:"labels,omitempty"`
	Annotations      map[string]string     `json:"annotations,omitempty"`
}

// IngressRuleFormData Ingress规则表单数据
type IngressRuleFormData struct {
	Host  string                `json:"host"`
	Paths []IngressPathFormData `json:"paths" binding:"required"`
}

// IngressPathFormData Ingress路径表单数据
type IngressPathFormData struct {
	Path        string `json:"path" binding:"required"`
	PathType    string `json:"pathType" binding:"required"` // Prefix, Exact, ImplementationSpecific
	ServiceName string `json:"serviceName" binding:"required"`
	ServicePort int32  `json:"servicePort" binding:"required"`
}

// IngressTLSFormData Ingress TLS表单数据
type IngressTLSFormData struct {
	Hosts      []string `json:"hosts" binding:"required"`
	SecretName string   `json:"secretName" binding:"required"`
}

// CreateIngress 创建Ingress
func (h *IngressHandler) CreateIngress(c *gin.Context) {
	clusterIDStr := c.Param("clusterID")
	clusterID := parseClusterID(clusterIDStr)

	var req CreateIngressRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(400, gin.H{"code": 400, "message": "参数错误: " + err.Error(), "data": nil})
		return
	}

	// 从集群服务获取集群信息
	cluster, err := h.clusterService.GetCluster(clusterID)
	if err != nil {
		logger.Error("获取集群失败", "error", err, "clusterId", clusterID)
		c.JSON(404, gin.H{"code": 404, "message": "集群不存在", "data": nil})
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
		logger.Error("创建K8s客户端失败", "error", err, "clusterId", clusterID)
		c.JSON(500, gin.H{"code": 500, "message": fmt.Sprintf("创建K8s客户端失败: %v", err), "data": nil})
		return
	}

	clientset := k8sClient.GetClientset()

	var ingress *networkingv1.Ingress

	// 根据创建方式选择处理逻辑
	if req.YAML != "" {
		// YAML方式创建
		ingress, err = h.createIngressFromYAML(clientset, req.Namespace, req.YAML)
	} else if req.FormData != nil {
		// 表单方式创建
		ingress, err = h.createIngressFromForm(clientset, req.Namespace, req.FormData)
	} else {
		c.JSON(400, gin.H{"code": 400, "message": "必须提供YAML或表单数据", "data": nil})
		return
	}

	if err != nil {
		logger.Error("创建Ingress失败", "error", err, "clusterId", clusterID)
		c.JSON(500, gin.H{"code": 500, "message": fmt.Sprintf("创建Ingress失败: %v", err), "data": nil})
		return
	}

	logger.Info("Ingress创建成功", "clusterId", clusterID, "namespace", ingress.Namespace, "name", ingress.Name)
	c.JSON(200, gin.H{"code": 200, "message": "Ingress创建成功", "data": h.convertToIngressInfo(ingress)})
}

// UpdateIngress 更新Ingress
func (h *IngressHandler) UpdateIngress(c *gin.Context) {
	clusterIDStr := c.Param("clusterID")
	clusterID := parseClusterID(clusterIDStr)
	namespace := c.Param("namespace")
	name := c.Param("name")

	var req CreateIngressRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(400, gin.H{"code": 400, "message": "参数错误: " + err.Error(), "data": nil})
		return
	}

	// 从集群服务获取集群信息
	cluster, err := h.clusterService.GetCluster(clusterID)
	if err != nil {
		logger.Error("获取集群失败", "error", err, "clusterId", clusterID)
		c.JSON(404, gin.H{"code": 404, "message": "集群不存在", "data": nil})
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
		logger.Error("创建K8s客户端失败", "error", err, "clusterId", clusterID)
		c.JSON(500, gin.H{"code": 500, "message": fmt.Sprintf("创建K8s客户端失败: %v", err), "data": nil})
		return
	}

	clientset := k8sClient.GetClientset()

	var ingress *networkingv1.Ingress

	// 根据更新方式选择处理逻辑
	if req.YAML != "" {
		// YAML方式更新
		ingress, err = h.updateIngressFromYAML(clientset, namespace, name, req.YAML)
	} else if req.FormData != nil {
		// 表单方式更新
		ingress, err = h.updateIngressFromForm(clientset, namespace, name, req.FormData)
	} else {
		c.JSON(400, gin.H{"code": 400, "message": "必须提供YAML或表单数据", "data": nil})
		return
	}

	if err != nil {
		logger.Error("更新Ingress失败", "error", err, "clusterId", clusterID)
		c.JSON(500, gin.H{"code": 500, "message": fmt.Sprintf("更新Ingress失败: %v", err), "data": nil})
		return
	}

	logger.Info("Ingress更新成功", "clusterId", clusterID, "namespace", ingress.Namespace, "name", ingress.Name)
	c.JSON(200, gin.H{"code": 200, "message": "Ingress更新成功", "data": h.convertToIngressInfo(ingress)})
}

// createIngressFromYAML 从YAML创建Ingress
func (h *IngressHandler) createIngressFromYAML(clientset kubernetes.Interface, namespace, yamlContent string) (*networkingv1.Ingress, error) {
	var ingress networkingv1.Ingress
	if err := yaml.Unmarshal([]byte(yamlContent), &ingress); err != nil {
		return nil, fmt.Errorf("解析YAML失败: %w", err)
	}

	// 确保namespace正确
	if ingress.Namespace == "" {
		ingress.Namespace = namespace
	}

	createdIngress, err := clientset.NetworkingV1().Ingresses(ingress.Namespace).Create(context.Background(), &ingress, metav1.CreateOptions{})
	if err != nil {
		return nil, err
	}

	return createdIngress, nil
}

// createIngressFromForm 从表单创建Ingress
func (h *IngressHandler) createIngressFromForm(clientset kubernetes.Interface, namespace string, formData *IngressFormData) (*networkingv1.Ingress, error) {
	ingress := &networkingv1.Ingress{
		ObjectMeta: metav1.ObjectMeta{
			Name:        formData.Name,
			Namespace:   namespace,
			Labels:      formData.Labels,
			Annotations: formData.Annotations,
		},
		Spec: networkingv1.IngressSpec{
			IngressClassName: formData.IngressClassName,
		},
	}

	// 添加规则
	rules := make([]networkingv1.IngressRule, 0, len(formData.Rules))
	for _, r := range formData.Rules {
		paths := make([]networkingv1.HTTPIngressPath, 0, len(r.Paths))
		for _, p := range r.Paths {
			pathType := networkingv1.PathType(p.PathType)
			paths = append(paths, networkingv1.HTTPIngressPath{
				Path:     p.Path,
				PathType: &pathType,
				Backend: networkingv1.IngressBackend{
					Service: &networkingv1.IngressServiceBackend{
						Name: p.ServiceName,
						Port: networkingv1.ServiceBackendPort{
							Number: p.ServicePort,
						},
					},
				},
			})
		}

		rules = append(rules, networkingv1.IngressRule{
			Host: r.Host,
			IngressRuleValue: networkingv1.IngressRuleValue{
				HTTP: &networkingv1.HTTPIngressRuleValue{
					Paths: paths,
				},
			},
		})
	}
	ingress.Spec.Rules = rules

	// 添加TLS
	if len(formData.TLS) > 0 {
		tls := make([]networkingv1.IngressTLS, 0, len(formData.TLS))
		for _, t := range formData.TLS {
			tls = append(tls, networkingv1.IngressTLS{
				Hosts:      t.Hosts,
				SecretName: t.SecretName,
			})
		}
		ingress.Spec.TLS = tls
	}

	createdIngress, err := clientset.NetworkingV1().Ingresses(namespace).Create(context.Background(), ingress, metav1.CreateOptions{})
	if err != nil {
		return nil, err
	}

	return createdIngress, nil
}

// updateIngressFromYAML 从YAML更新Ingress
func (h *IngressHandler) updateIngressFromYAML(clientset kubernetes.Interface, namespace, name, yamlContent string) (*networkingv1.Ingress, error) {
	var ingress networkingv1.Ingress
	if err := yaml.Unmarshal([]byte(yamlContent), &ingress); err != nil {
		return nil, fmt.Errorf("解析YAML失败: %w", err)
	}

	// 获取现有Ingress
	existingIngress, err := clientset.NetworkingV1().Ingresses(namespace).Get(context.Background(), name, metav1.GetOptions{})
	if err != nil {
		return nil, err
	}

	// 保留ResourceVersion
	ingress.ResourceVersion = existingIngress.ResourceVersion
	ingress.Namespace = namespace
	ingress.Name = name

	updatedIngress, err := clientset.NetworkingV1().Ingresses(namespace).Update(context.Background(), &ingress, metav1.UpdateOptions{})
	if err != nil {
		return nil, err
	}

	return updatedIngress, nil
}

// updateIngressFromForm 从表单更新Ingress
func (h *IngressHandler) updateIngressFromForm(clientset kubernetes.Interface, namespace, name string, formData *IngressFormData) (*networkingv1.Ingress, error) {
	// 获取现有Ingress
	existingIngress, err := clientset.NetworkingV1().Ingresses(namespace).Get(context.Background(), name, metav1.GetOptions{})
	if err != nil {
		return nil, err
	}

	// 更新Spec
	existingIngress.Spec.IngressClassName = formData.IngressClassName

	// 更新规则
	rules := make([]networkingv1.IngressRule, 0, len(formData.Rules))
	for _, r := range formData.Rules {
		paths := make([]networkingv1.HTTPIngressPath, 0, len(r.Paths))
		for _, p := range r.Paths {
			pathType := networkingv1.PathType(p.PathType)
			paths = append(paths, networkingv1.HTTPIngressPath{
				Path:     p.Path,
				PathType: &pathType,
				Backend: networkingv1.IngressBackend{
					Service: &networkingv1.IngressServiceBackend{
						Name: p.ServiceName,
						Port: networkingv1.ServiceBackendPort{
							Number: p.ServicePort,
						},
					},
				},
			})
		}

		rules = append(rules, networkingv1.IngressRule{
			Host: r.Host,
			IngressRuleValue: networkingv1.IngressRuleValue{
				HTTP: &networkingv1.HTTPIngressRuleValue{
					Paths: paths,
				},
			},
		})
	}
	existingIngress.Spec.Rules = rules

	// 更新TLS
	if len(formData.TLS) > 0 {
		tls := make([]networkingv1.IngressTLS, 0, len(formData.TLS))
		for _, t := range formData.TLS {
			tls = append(tls, networkingv1.IngressTLS{
				Hosts:      t.Hosts,
				SecretName: t.SecretName,
			})
		}
		existingIngress.Spec.TLS = tls
	} else {
		existingIngress.Spec.TLS = nil
	}

	// 更新Labels和Annotations
	if formData.Labels != nil {
		existingIngress.Labels = formData.Labels
	}
	if formData.Annotations != nil {
		existingIngress.Annotations = formData.Annotations
	}

	updatedIngress, err := clientset.NetworkingV1().Ingresses(namespace).Update(context.Background(), existingIngress, metav1.UpdateOptions{})
	if err != nil {
		return nil, err
	}

	return updatedIngress, nil
}


// GetIngressNamespaces 获取Ingress所在的命名空间列表
func (h *IngressHandler) GetIngressNamespaces(c *gin.Context) {
	clusterID := c.Param("clusterID")

	// 获取集群
	id, err := strconv.ParseUint(clusterID, 10, 32)
	if err != nil {
		c.JSON(400, gin.H{"error": "无效的集群ID"})
		return
	}

	cluster, err := h.clusterService.GetCluster(uint(id))
	if err != nil {
		c.JSON(404, gin.H{"error": "集群不存在"})
		return
	}

	// 初始化K8s客户端
	var clientset *kubernetes.Clientset
	if cluster.KubeconfigEnc != "" {
		k8sClient, err := services.NewK8sClientFromKubeconfig(cluster.KubeconfigEnc)
		if err != nil {
			c.JSON(500, gin.H{"error": fmt.Sprintf("创建K8s客户端失败: %v", err)})
			return
		}
		clientset = k8sClient.GetClientset()
	} else {
		k8sClient, err := services.NewK8sClientFromToken(cluster.APIServer, cluster.SATokenEnc, cluster.CAEnc)
		if err != nil {
			c.JSON(500, gin.H{"error": fmt.Sprintf("创建K8s客户端失败: %v", err)})
			return
		}
		clientset = k8sClient.GetClientset()
	}

	// 获取所有Ingresses
	ingressList, err := clientset.NetworkingV1().Ingresses("").List(context.Background(), metav1.ListOptions{})
	if err != nil {
		logger.Error("获取Ingress列表失败", "cluster", cluster.Name, "error", err)
		c.JSON(500, gin.H{"error": fmt.Sprintf("获取Ingress列表失败: %v", err)})
		return
	}

	// 统计每个命名空间的Ingress数量
	nsMap := make(map[string]int)
	for _, ing := range ingressList.Items {
		nsMap[ing.Namespace]++
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

	// 按名称排序
	sort.Slice(namespaces, func(i, j int) bool {
		return namespaces[i].Name < namespaces[j].Name
	})

	c.JSON(200, gin.H{
		"code":    200,
		"message": "success",
		"data":    namespaces,
	})
}


