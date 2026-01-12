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
	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/util/intstr"
	"k8s.io/client-go/kubernetes"
	"sigs.k8s.io/yaml"
)

// ServiceHandler Service处理器
type ServiceHandler struct {
	db             *gorm.DB
	cfg            *config.Config
	clusterService *services.ClusterService
	k8sMgr         *k8s.ClusterInformerManager
}

// NewServiceHandler 创建Service处理器
func NewServiceHandler(db *gorm.DB, cfg *config.Config, clusterService *services.ClusterService, k8sMgr *k8s.ClusterInformerManager) *ServiceHandler {
	return &ServiceHandler{
		db:             db,
		cfg:            cfg,
		clusterService: clusterService,
		k8sMgr:         k8sMgr,
	}
}

// ServiceInfo Service信息
type ServiceInfo struct {
	Name                string                `json:"name"`
	Namespace           string                `json:"namespace"`
	Type                string                `json:"type"`
	ClusterIP           string                `json:"clusterIP"`
	ExternalIPs         []string              `json:"externalIPs,omitempty"`
	Ports               []ServicePort         `json:"ports"`
	Selector            map[string]string     `json:"selector"`
	SessionAffinity     string                `json:"sessionAffinity"`
	LoadBalancerIP      string                `json:"loadBalancerIP,omitempty"`
	LoadBalancerIngress []LoadBalancerIngress `json:"loadBalancerIngress,omitempty"`
	ExternalName        string                `json:"externalName,omitempty"`
	CreatedAt           time.Time             `json:"createdAt"`
	Labels              map[string]string     `json:"labels"`
	Annotations         map[string]string     `json:"annotations"`
}

// ServicePort Service端口信息
type ServicePort struct {
	Name       string `json:"name"`
	Protocol   string `json:"protocol"`
	Port       int32  `json:"port"`
	TargetPort string `json:"targetPort"`
	NodePort   int32  `json:"nodePort,omitempty"`
}

// LoadBalancerIngress 负载均衡器入口信息
type LoadBalancerIngress struct {
	IP       string `json:"ip,omitempty"`
	Hostname string `json:"hostname,omitempty"`
}

// ListServices 获取Service列表
func (h *ServiceHandler) ListServices(c *gin.Context) {
	clusterIDStr := c.Param("clusterID")
	clusterID := parseClusterID(clusterIDStr)

	// 获取查询参数
	namespace := c.DefaultQuery("namespace", "")
	serviceType := c.DefaultQuery("type", "")
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

	// 获取Services
	services, err := h.getServices(clientset, namespace)
	if err != nil {
		logger.Error("获取Services失败", "error", err, "clusterId", clusterID)
		c.JSON(500, gin.H{"code": 500, "message": fmt.Sprintf("获取Services失败: %v", err), "data": nil})
		return
	}

	// 根据命名空间权限过滤
	if !nsInfo.HasAllAccess && namespace == "" {
		services = middleware.FilterResourcesByNamespace(c, services, func(s ServiceInfo) string {
			return s.Namespace
		})
	}

	// 过滤和搜索
	filteredServices := h.filterServices(services, serviceType, search)

	// 排序
	sort.Slice(filteredServices, func(i, j int) bool {
		return filteredServices[i].CreatedAt.After(filteredServices[j].CreatedAt)
	})

	// 分页
	total := len(filteredServices)
	start := (page - 1) * pageSize
	end := start + pageSize
	if start > total {
		start = total
	}
	if end > total {
		end = total
	}
	pagedServices := filteredServices[start:end]

	c.JSON(200, gin.H{
		"code":    200,
		"message": "success",
		"data": gin.H{
			"items":    pagedServices,
			"total":    total,
			"page":     page,
			"pageSize": pageSize,
		},
	})
}

// GetService 获取单个Service详情
func (h *ServiceHandler) GetService(c *gin.Context) {
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

	// 获取Service
	service, err := clientset.CoreV1().Services(namespace).Get(context.Background(), name, metav1.GetOptions{})
	if err != nil {
		logger.Error("获取Service失败", "error", err, "clusterId", clusterID, "namespace", namespace, "name", name)
		c.JSON(500, gin.H{"code": 500, "message": fmt.Sprintf("获取Service失败: %v", err), "data": nil})
		return
	}

	serviceInfo := h.convertToServiceInfo(service)

	c.JSON(200, gin.H{
		"code":    200,
		"message": "success",
		"data":    serviceInfo,
	})
}

// GetServiceYAML 获取Service的YAML
func (h *ServiceHandler) GetServiceYAML(c *gin.Context) {
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

	// 获取Service
	service, err := clientset.CoreV1().Services(namespace).Get(context.Background(), name, metav1.GetOptions{})
	if err != nil {
		logger.Error("获取Service失败", "error", err, "clusterId", clusterID, "namespace", namespace, "name", name)
		c.JSON(500, gin.H{"code": 500, "message": fmt.Sprintf("获取Service失败: %v", err), "data": nil})
		return
	}

	// 设置 apiVersion 和 kind（API 返回的对象不包含这些字段）
	cleanSvc := service.DeepCopy()
	cleanSvc.APIVersion = "v1"
	cleanSvc.Kind = "Service"
	cleanSvc.ManagedFields = nil // 移除 managedFields 简化 YAML

	// 转换为YAML
	yamlData, err := yaml.Marshal(cleanSvc)
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

// DeleteService 删除Service
func (h *ServiceHandler) DeleteService(c *gin.Context) {
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

	// 删除Service
	err = clientset.CoreV1().Services(namespace).Delete(context.Background(), name, metav1.DeleteOptions{})
	if err != nil {
		logger.Error("删除Service失败", "error", err, "clusterId", clusterID, "namespace", namespace, "name", name)
		c.JSON(500, gin.H{"code": 500, "message": fmt.Sprintf("删除Service失败: %v", err), "data": nil})
		return
	}

	logger.Info("Service删除成功", "clusterId", clusterID, "namespace", namespace, "name", name)
	c.JSON(200, gin.H{"code": 200, "message": "Service删除成功", "data": nil})
}

// GetServiceEndpoints 获取Service的Endpoints
func (h *ServiceHandler) GetServiceEndpoints(c *gin.Context) {
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

	// 获取Endpoints
	endpoints, err := clientset.CoreV1().Endpoints(namespace).Get(context.Background(), name, metav1.GetOptions{})
	if err != nil {
		logger.Error("获取Endpoints失败", "error", err, "clusterId", clusterID, "namespace", namespace, "name", name)
		c.JSON(500, gin.H{"code": 500, "message": fmt.Sprintf("获取Endpoints失败: %v", err), "data": nil})
		return
	}

	// 转换Endpoints信息
	endpointInfo := h.convertEndpointsInfo(endpoints)

	c.JSON(200, gin.H{
		"code":    200,
		"message": "success",
		"data":    endpointInfo,
	})
}

// 辅助函数

// getServices 获取Services
func (h *ServiceHandler) getServices(clientset kubernetes.Interface, namespace string) ([]ServiceInfo, error) {
	var serviceList *corev1.ServiceList
	var err error

	if namespace == "" || namespace == "_all_" {
		serviceList, err = clientset.CoreV1().Services("").List(context.Background(), metav1.ListOptions{})
	} else {
		serviceList, err = clientset.CoreV1().Services(namespace).List(context.Background(), metav1.ListOptions{})
	}

	if err != nil {
		return nil, err
	}

	services := make([]ServiceInfo, 0, len(serviceList.Items))
	for _, svc := range serviceList.Items {
		services = append(services, h.convertToServiceInfo(&svc))
	}

	return services, nil
}

// convertToServiceInfo 转换为ServiceInfo
func (h *ServiceHandler) convertToServiceInfo(svc *corev1.Service) ServiceInfo {
	ports := make([]ServicePort, 0, len(svc.Spec.Ports))
	for _, p := range svc.Spec.Ports {
		ports = append(ports, ServicePort{
			Name:       p.Name,
			Protocol:   string(p.Protocol),
			Port:       p.Port,
			TargetPort: h.getTargetPortString(p.TargetPort),
			NodePort:   p.NodePort,
		})
	}

	lbIngress := make([]LoadBalancerIngress, 0, len(svc.Status.LoadBalancer.Ingress))
	for _, ing := range svc.Status.LoadBalancer.Ingress {
		lbIngress = append(lbIngress, LoadBalancerIngress{
			IP:       ing.IP,
			Hostname: ing.Hostname,
		})
	}

	return ServiceInfo{
		Name:                svc.Name,
		Namespace:           svc.Namespace,
		Type:                string(svc.Spec.Type),
		ClusterIP:           svc.Spec.ClusterIP,
		ExternalIPs:         svc.Spec.ExternalIPs,
		Ports:               ports,
		Selector:            svc.Spec.Selector,
		SessionAffinity:     string(svc.Spec.SessionAffinity),
		LoadBalancerIP:      svc.Spec.LoadBalancerIP,
		LoadBalancerIngress: lbIngress,
		ExternalName:        svc.Spec.ExternalName,
		CreatedAt:           svc.CreationTimestamp.Time,
		Labels:              svc.Labels,
		Annotations:         svc.Annotations,
	}
}

// getTargetPortString 获取目标端口字符串
func (h *ServiceHandler) getTargetPortString(targetPort intstr.IntOrString) string {
	if targetPort.Type == intstr.Int {
		return strconv.Itoa(int(targetPort.IntVal))
	}
	return targetPort.StrVal
}

// filterServices 过滤Services
func (h *ServiceHandler) filterServices(services []ServiceInfo, serviceType, search string) []ServiceInfo {
	filtered := make([]ServiceInfo, 0)
	for _, svc := range services {
		// 类型过滤
		if serviceType != "" && svc.Type != serviceType {
			continue
		}

		// 搜索过滤
		if search != "" {
			searchLower := strings.ToLower(search)
			if !strings.Contains(strings.ToLower(svc.Name), searchLower) &&
				!strings.Contains(strings.ToLower(svc.Namespace), searchLower) &&
				!strings.Contains(strings.ToLower(svc.ClusterIP), searchLower) {
				continue
			}
		}

		filtered = append(filtered, svc)
	}
	return filtered
}

// convertEndpointsInfo 转换Endpoints信息
func (h *ServiceHandler) convertEndpointsInfo(endpoints *corev1.Endpoints) gin.H {
	subsets := make([]gin.H, 0, len(endpoints.Subsets))
	for _, subset := range endpoints.Subsets {
		addresses := make([]gin.H, 0, len(subset.Addresses))
		for _, addr := range subset.Addresses {
			addresses = append(addresses, gin.H{
				"ip":       addr.IP,
				"nodeName": addr.NodeName,
				"targetRef": func() gin.H {
					if addr.TargetRef != nil {
						return gin.H{
							"kind":      addr.TargetRef.Kind,
							"name":      addr.TargetRef.Name,
							"namespace": addr.TargetRef.Namespace,
						}
					}
					return nil
				}(),
			})
		}

		ports := make([]gin.H, 0, len(subset.Ports))
		for _, port := range subset.Ports {
			ports = append(ports, gin.H{
				"name":     port.Name,
				"port":     port.Port,
				"protocol": string(port.Protocol),
			})
		}

		subsets = append(subsets, gin.H{
			"addresses": addresses,
			"ports":     ports,
		})
	}

	return gin.H{
		"name":      endpoints.Name,
		"namespace": endpoints.Namespace,
		"subsets":   subsets,
	}
}

// CreateServiceRequest 创建Service请求
type CreateServiceRequest struct {
	Namespace string           `json:"namespace" binding:"required"`
	YAML      string           `json:"yaml,omitempty"`     // YAML方式创建
	FormData  *ServiceFormData `json:"formData,omitempty"` // 表单方式创建
}

// ServiceFormData Service表单数据
type ServiceFormData struct {
	Name            string            `json:"name" binding:"required"`
	Type            string            `json:"type" binding:"required"` // ClusterIP, NodePort, LoadBalancer
	Selector        map[string]string `json:"selector"`
	Ports           []ServicePortForm `json:"ports" binding:"required"`
	SessionAffinity string            `json:"sessionAffinity"`
	ExternalIPs     []string          `json:"externalIPs,omitempty"`
	LoadBalancerIP  string            `json:"loadBalancerIP,omitempty"`
	ExternalName    string            `json:"externalName,omitempty"`
	Labels          map[string]string `json:"labels,omitempty"`
	Annotations     map[string]string `json:"annotations,omitempty"`
}

// ServicePortForm Service端口表单
type ServicePortForm struct {
	Name       string `json:"name"`
	Protocol   string `json:"protocol"` // TCP, UDP, SCTP
	Port       int32  `json:"port" binding:"required"`
	TargetPort string `json:"targetPort"` // 可以是数字或字符串
	NodePort   int32  `json:"nodePort,omitempty"`
}

// CreateService 创建Service
func (h *ServiceHandler) CreateService(c *gin.Context) {
	clusterIDStr := c.Param("clusterID")
	clusterID := parseClusterID(clusterIDStr)

	var req CreateServiceRequest
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

	var service *corev1.Service

	// 根据创建方式选择处理逻辑
	if req.YAML != "" {
		// YAML方式创建
		service, err = h.createServiceFromYAML(clientset, req.Namespace, req.YAML)
	} else if req.FormData != nil {
		// 表单方式创建
		service, err = h.createServiceFromForm(clientset, req.Namespace, req.FormData)
	} else {
		c.JSON(400, gin.H{"code": 400, "message": "必须提供YAML或表单数据", "data": nil})
		return
	}

	if err != nil {
		logger.Error("创建Service失败", "error", err, "clusterId", clusterID)
		c.JSON(500, gin.H{"code": 500, "message": fmt.Sprintf("创建Service失败: %v", err), "data": nil})
		return
	}

	logger.Info("Service创建成功", "clusterId", clusterID, "namespace", service.Namespace, "name", service.Name)
	c.JSON(200, gin.H{"code": 200, "message": "Service创建成功", "data": h.convertToServiceInfo(service)})
}

// UpdateService 更新Service
func (h *ServiceHandler) UpdateService(c *gin.Context) {
	clusterIDStr := c.Param("clusterID")
	clusterID := parseClusterID(clusterIDStr)
	namespace := c.Param("namespace")
	name := c.Param("name")

	var req CreateServiceRequest
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

	var service *corev1.Service

	// 根据更新方式选择处理逻辑
	if req.YAML != "" {
		// YAML方式更新
		service, err = h.updateServiceFromYAML(clientset, namespace, name, req.YAML)
	} else if req.FormData != nil {
		// 表单方式更新
		service, err = h.updateServiceFromForm(clientset, namespace, name, req.FormData)
	} else {
		c.JSON(400, gin.H{"code": 400, "message": "必须提供YAML或表单数据", "data": nil})
		return
	}

	if err != nil {
		logger.Error("更新Service失败", "error", err, "clusterId", clusterID)
		c.JSON(500, gin.H{"code": 500, "message": fmt.Sprintf("更新Service失败: %v", err), "data": nil})
		return
	}

	logger.Info("Service更新成功", "clusterId", clusterID, "namespace", service.Namespace, "name", service.Name)
	c.JSON(200, gin.H{"code": 200, "message": "Service更新成功", "data": h.convertToServiceInfo(service)})
}

// createServiceFromYAML 从YAML创建Service
func (h *ServiceHandler) createServiceFromYAML(clientset kubernetes.Interface, namespace, yamlContent string) (*corev1.Service, error) {
	var service corev1.Service
	if err := yaml.Unmarshal([]byte(yamlContent), &service); err != nil {
		return nil, fmt.Errorf("解析YAML失败: %w", err)
	}

	// 确保namespace正确
	if service.Namespace == "" {
		service.Namespace = namespace
	}

	createdService, err := clientset.CoreV1().Services(service.Namespace).Create(context.Background(), &service, metav1.CreateOptions{})
	if err != nil {
		return nil, err
	}

	return createdService, nil
}

// createServiceFromForm 从表单创建Service
func (h *ServiceHandler) createServiceFromForm(clientset kubernetes.Interface, namespace string, formData *ServiceFormData) (*corev1.Service, error) {
	service := &corev1.Service{
		ObjectMeta: metav1.ObjectMeta{
			Name:        formData.Name,
			Namespace:   namespace,
			Labels:      formData.Labels,
			Annotations: formData.Annotations,
		},
		Spec: corev1.ServiceSpec{
			Type:            corev1.ServiceType(formData.Type),
			Selector:        formData.Selector,
			SessionAffinity: corev1.ServiceAffinity(formData.SessionAffinity),
		},
	}

	// 添加端口
	ports := make([]corev1.ServicePort, 0, len(formData.Ports))
	for _, p := range formData.Ports {
		port := corev1.ServicePort{
			Name:     p.Name,
			Protocol: corev1.Protocol(p.Protocol),
			Port:     p.Port,
		}

		// 处理TargetPort
		if portNum, err := strconv.Atoi(p.TargetPort); err == nil {
			port.TargetPort = intstr.FromInt(portNum)
		} else {
			port.TargetPort = intstr.FromString(p.TargetPort)
		}

		// NodePort类型时设置NodePort
		if formData.Type == "NodePort" || formData.Type == "LoadBalancer" {
			port.NodePort = p.NodePort
		}

		ports = append(ports, port)
	}
	service.Spec.Ports = ports

	// 其他可选配置
	if len(formData.ExternalIPs) > 0 {
		service.Spec.ExternalIPs = formData.ExternalIPs
	}
	if formData.LoadBalancerIP != "" {
		service.Spec.LoadBalancerIP = formData.LoadBalancerIP
	}
	if formData.ExternalName != "" {
		service.Spec.ExternalName = formData.ExternalName
	}

	createdService, err := clientset.CoreV1().Services(namespace).Create(context.Background(), service, metav1.CreateOptions{})
	if err != nil {
		return nil, err
	}

	return createdService, nil
}

// updateServiceFromYAML 从YAML更新Service
func (h *ServiceHandler) updateServiceFromYAML(clientset kubernetes.Interface, namespace, name, yamlContent string) (*corev1.Service, error) {
	var service corev1.Service
	if err := yaml.Unmarshal([]byte(yamlContent), &service); err != nil {
		return nil, fmt.Errorf("解析YAML失败: %w", err)
	}

	// 获取现有Service
	existingService, err := clientset.CoreV1().Services(namespace).Get(context.Background(), name, metav1.GetOptions{})
	if err != nil {
		return nil, err
	}

	// 保留ResourceVersion
	service.ResourceVersion = existingService.ResourceVersion
	service.Namespace = namespace
	service.Name = name

	updatedService, err := clientset.CoreV1().Services(namespace).Update(context.Background(), &service, metav1.UpdateOptions{})
	if err != nil {
		return nil, err
	}

	return updatedService, nil
}

// updateServiceFromForm 从表单更新Service
func (h *ServiceHandler) updateServiceFromForm(clientset kubernetes.Interface, namespace, name string, formData *ServiceFormData) (*corev1.Service, error) {
	// 获取现有Service
	existingService, err := clientset.CoreV1().Services(namespace).Get(context.Background(), name, metav1.GetOptions{})
	if err != nil {
		return nil, err
	}

	// 更新Spec
	existingService.Spec.Type = corev1.ServiceType(formData.Type)
	existingService.Spec.Selector = formData.Selector
	existingService.Spec.SessionAffinity = corev1.ServiceAffinity(formData.SessionAffinity)

	// 更新端口
	ports := make([]corev1.ServicePort, 0, len(formData.Ports))
	for _, p := range formData.Ports {
		port := corev1.ServicePort{
			Name:     p.Name,
			Protocol: corev1.Protocol(p.Protocol),
			Port:     p.Port,
		}

		// 处理TargetPort
		if portNum, err := strconv.Atoi(p.TargetPort); err == nil {
			port.TargetPort = intstr.FromInt(portNum)
		} else {
			port.TargetPort = intstr.FromString(p.TargetPort)
		}

		// NodePort类型时设置NodePort
		if formData.Type == "NodePort" || formData.Type == "LoadBalancer" {
			port.NodePort = p.NodePort
		}

		ports = append(ports, port)
	}
	existingService.Spec.Ports = ports

	// 更新其他可选配置
	existingService.Spec.ExternalIPs = formData.ExternalIPs
	existingService.Spec.LoadBalancerIP = formData.LoadBalancerIP
	existingService.Spec.ExternalName = formData.ExternalName

	// 更新Labels和Annotations
	if formData.Labels != nil {
		existingService.Labels = formData.Labels
	}
	if formData.Annotations != nil {
		existingService.Annotations = formData.Annotations
	}

	updatedService, err := clientset.CoreV1().Services(namespace).Update(context.Background(), existingService, metav1.UpdateOptions{})
	if err != nil {
		return nil, err
	}

	return updatedService, nil
}


// GetServiceNamespaces 获取Service所在的命名空间列表
func (h *ServiceHandler) GetServiceNamespaces(c *gin.Context) {
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

	// 获取所有Services
	serviceList, err := clientset.CoreV1().Services("").List(context.Background(), metav1.ListOptions{})
	if err != nil {
		logger.Error("获取Service列表失败", "cluster", cluster.Name, "error", err)
		c.JSON(500, gin.H{"error": fmt.Sprintf("获取Service列表失败: %v", err)})
		return
	}

	// 统计每个命名空间的Service数量
	nsMap := make(map[string]int)
	for _, svc := range serviceList.Items {
		nsMap[svc.Namespace]++
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


