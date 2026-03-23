package handlers

import (
	"context"
	"time"

	"github.com/clay-wangzhi/KubePolaris/internal/config"
	"github.com/clay-wangzhi/KubePolaris/internal/k8s"
	"github.com/clay-wangzhi/KubePolaris/internal/models"
	"github.com/clay-wangzhi/KubePolaris/internal/response"
	"github.com/clay-wangzhi/KubePolaris/internal/services"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
	corev1 "k8s.io/api/core/v1"
	networkingv1 "k8s.io/api/networking/v1"
	storagev1 "k8s.io/api/storage/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/util/yaml"
	sigsyaml "sigs.k8s.io/yaml"
)

// ResourceYAMLHandler 通用资源YAML处理器
type ResourceYAMLHandler struct {
	db             *gorm.DB
	cfg            *config.Config
	clusterService *services.ClusterService
	k8sMgr         *k8s.ClusterInformerManager
}

// NewResourceYAMLHandler 创建通用资源YAML处理器
func NewResourceYAMLHandler(db *gorm.DB, cfg *config.Config, clusterService *services.ClusterService, k8sMgr *k8s.ClusterInformerManager) *ResourceYAMLHandler {
	return &ResourceYAMLHandler{
		db:             db,
		cfg:            cfg,
		clusterService: clusterService,
		k8sMgr:         k8sMgr,
	}
}

// ResourceYAMLApplyRequest 资源YAML应用请求
type ResourceYAMLApplyRequest struct {
	YAML   string `json:"yaml" binding:"required"`
	DryRun bool   `json:"dryRun"`
}

// ResourceYAMLResponse 资源YAML响应
type ResourceYAMLResponse struct {
	Name            string `json:"name"`
	Namespace       string `json:"namespace,omitempty"`
	Kind            string `json:"kind"`
	ResourceVersion string `json:"resourceVersion,omitempty"`
	IsCreated       bool   `json:"isCreated"` // true: 创建, false: 更新
}

// ApplyConfigMapYAML 应用ConfigMap YAML
func (h *ResourceYAMLHandler) ApplyConfigMapYAML(c *gin.Context) {
	var req ResourceYAMLApplyRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "参数错误: "+err.Error())
		return
	}

	k8sClient, ok := h.prepareK8sClient(c)
	if !ok {
		return
	}

	// 解析YAML
	var cm corev1.ConfigMap
	if err := yaml.Unmarshal([]byte(req.YAML), &cm); err != nil {
		response.BadRequest(c, "YAML格式错误: "+err.Error())
		return
	}

	// 验证kind
	if cm.Kind != "" && cm.Kind != "ConfigMap" {
		response.BadRequest(c, "YAML类型错误，期望ConfigMap，实际为: "+cm.Kind)
		return
	}

	if cm.Namespace == "" {
		cm.Namespace = "default"
	}

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	clientset := k8sClient.GetClientset()
	var dryRunOpt []string
	if req.DryRun {
		dryRunOpt = []string{metav1.DryRunAll}
	}

	// 尝试获取现有资源
	existing, err := clientset.CoreV1().ConfigMaps(cm.Namespace).Get(ctx, cm.Name, metav1.GetOptions{})
	var result *corev1.ConfigMap
	isCreated := false

	if err == nil {
		// 资源存在，执行更新
		cm.ResourceVersion = existing.ResourceVersion
		result, err = clientset.CoreV1().ConfigMaps(cm.Namespace).Update(ctx, &cm, metav1.UpdateOptions{DryRun: dryRunOpt})
		if err != nil {
			response.InternalError(c, "更新ConfigMap失败: "+err.Error())
			return
		}
	} else {
		// 资源不存在，执行创建
		isCreated = true
		result, err = clientset.CoreV1().ConfigMaps(cm.Namespace).Create(ctx, &cm, metav1.CreateOptions{DryRun: dryRunOpt})
		if err != nil {
			response.InternalError(c, "创建ConfigMap失败: "+err.Error())
			return
		}
	}

	response.OK(c, ResourceYAMLResponse{
		Name:            result.Name,
		Namespace:       result.Namespace,
		Kind:            "ConfigMap",
		ResourceVersion: result.ResourceVersion,
		IsCreated:       isCreated,
	})
}

// GetConfigMapYAML 获取ConfigMap的YAML
func (h *ResourceYAMLHandler) GetConfigMapYAML(c *gin.Context) {
	k8sClient, ok := h.prepareK8sClient(c)
	if !ok {
		return
	}
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	cm, err := k8sClient.GetClientset().CoreV1().ConfigMaps(c.Param("namespace")).Get(ctx, c.Param("name"), metav1.GetOptions{})
	if err != nil {
		response.NotFound(c, "ConfigMap不存在: "+err.Error())
		return
	}
	clean := cm.DeepCopy()
	clean.ManagedFields = nil
	clean.APIVersion = "v1"
	clean.Kind = "ConfigMap"
	respondWithYAML(c, clean)
}

// ApplySecretYAML 应用Secret YAML
func (h *ResourceYAMLHandler) ApplySecretYAML(c *gin.Context) {
	var req ResourceYAMLApplyRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "参数错误: "+err.Error())
		return
	}

	k8sClient, ok := h.prepareK8sClient(c)
	if !ok {
		return
	}

	var secret corev1.Secret
	if err := yaml.Unmarshal([]byte(req.YAML), &secret); err != nil {
		response.BadRequest(c, "YAML格式错误: "+err.Error())
		return
	}

	if secret.Kind != "" && secret.Kind != "Secret" {
		response.BadRequest(c, "YAML类型错误，期望Secret，实际为: "+secret.Kind)
		return
	}

	if secret.Namespace == "" {
		secret.Namespace = "default"
	}

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	clientset := k8sClient.GetClientset()
	var dryRunOpt []string
	if req.DryRun {
		dryRunOpt = []string{metav1.DryRunAll}
	}

	existing, err := clientset.CoreV1().Secrets(secret.Namespace).Get(ctx, secret.Name, metav1.GetOptions{})
	var result *corev1.Secret
	isCreated := false

	if err == nil {
		secret.ResourceVersion = existing.ResourceVersion
		result, err = clientset.CoreV1().Secrets(secret.Namespace).Update(ctx, &secret, metav1.UpdateOptions{DryRun: dryRunOpt})
		if err != nil {
			response.InternalError(c, "更新Secret失败: "+err.Error())
			return
		}
	} else {
		isCreated = true
		result, err = clientset.CoreV1().Secrets(secret.Namespace).Create(ctx, &secret, metav1.CreateOptions{DryRun: dryRunOpt})
		if err != nil {
			response.InternalError(c, "创建Secret失败: "+err.Error())
			return
		}
	}

	response.OK(c, ResourceYAMLResponse{
		Name:            result.Name,
		Namespace:       result.Namespace,
		Kind:            "Secret",
		ResourceVersion: result.ResourceVersion,
		IsCreated:       isCreated,
	})
}

// GetSecretYAML 获取Secret的YAML
func (h *ResourceYAMLHandler) GetSecretYAML(c *gin.Context) {
	clusterID := c.Param("clusterID")
	namespace := c.Param("namespace")
	name := c.Param("name")

	id, err := parseClusterID(clusterID)
	if err != nil {
		response.BadRequest(c, "无效的集群ID")
		return
	}
	cluster, err := h.clusterService.GetCluster(id)
	if err != nil {
		response.NotFound(c, "集群不存在")
		return
	}

	k8sClient, err := h.createK8sClient(cluster)
	if err != nil {
		response.InternalError(c, "创建K8s客户端失败: "+err.Error())
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	secret, err := k8sClient.GetClientset().CoreV1().Secrets(namespace).Get(ctx, name, metav1.GetOptions{})
	if err != nil {
		response.NotFound(c, "Secret不存在: "+err.Error())
		return
	}

	cleanSecret := secret.DeepCopy()
	cleanSecret.ManagedFields = nil
	cleanSecret.APIVersion = "v1"
	cleanSecret.Kind = "Secret"

	yamlBytes, err := sigsyaml.Marshal(cleanSecret)
	if err != nil {
		response.InternalError(c, "转换YAML失败: "+err.Error())
		return
	}

	response.OK(c, gin.H{
		"yaml": string(yamlBytes),
	})
}

// ApplyServiceYAML 应用Service YAML
func (h *ResourceYAMLHandler) ApplyServiceYAML(c *gin.Context) {
	var req ResourceYAMLApplyRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "参数错误: "+err.Error())
		return
	}

	k8sClient, ok := h.prepareK8sClient(c)
	if !ok {
		return
	}

	var svc corev1.Service
	if err := yaml.Unmarshal([]byte(req.YAML), &svc); err != nil {
		response.BadRequest(c, "YAML格式错误: "+err.Error())
		return
	}

	if svc.Kind != "" && svc.Kind != "Service" {
		response.BadRequest(c, "YAML类型错误，期望Service，实际为: "+svc.Kind)
		return
	}

	if svc.Namespace == "" {
		svc.Namespace = "default"
	}

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	clientset := k8sClient.GetClientset()
	var dryRunOpt []string
	if req.DryRun {
		dryRunOpt = []string{metav1.DryRunAll}
	}

	existing, err := clientset.CoreV1().Services(svc.Namespace).Get(ctx, svc.Name, metav1.GetOptions{})
	var result *corev1.Service
	isCreated := false

	if err == nil {
		// Service更新时需要保留ClusterIP
		svc.ResourceVersion = existing.ResourceVersion
		svc.Spec.ClusterIP = existing.Spec.ClusterIP
		svc.Spec.ClusterIPs = existing.Spec.ClusterIPs
		result, err = clientset.CoreV1().Services(svc.Namespace).Update(ctx, &svc, metav1.UpdateOptions{DryRun: dryRunOpt})
		if err != nil {
			response.InternalError(c, "更新Service失败: "+err.Error())
			return
		}
	} else {
		isCreated = true
		result, err = clientset.CoreV1().Services(svc.Namespace).Create(ctx, &svc, metav1.CreateOptions{DryRun: dryRunOpt})
		if err != nil {
			response.InternalError(c, "创建Service失败: "+err.Error())
			return
		}
	}

	response.OK(c, ResourceYAMLResponse{
		Name:            result.Name,
		Namespace:       result.Namespace,
		Kind:            "Service",
		ResourceVersion: result.ResourceVersion,
		IsCreated:       isCreated,
	})
}

// ApplyIngressYAML 应用Ingress YAML
func (h *ResourceYAMLHandler) ApplyIngressYAML(c *gin.Context) {
	var req ResourceYAMLApplyRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "参数错误: "+err.Error())
		return
	}

	k8sClient, ok := h.prepareK8sClient(c)
	if !ok {
		return
	}

	var ing networkingv1.Ingress
	if err := yaml.Unmarshal([]byte(req.YAML), &ing); err != nil {
		response.BadRequest(c, "YAML格式错误: "+err.Error())
		return
	}

	if ing.Kind != "" && ing.Kind != "Ingress" {
		response.BadRequest(c, "YAML类型错误，期望Ingress，实际为: "+ing.Kind)
		return
	}

	if ing.Namespace == "" {
		ing.Namespace = "default"
	}

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	clientset := k8sClient.GetClientset()
	var dryRunOpt []string
	if req.DryRun {
		dryRunOpt = []string{metav1.DryRunAll}
	}

	existing, err := clientset.NetworkingV1().Ingresses(ing.Namespace).Get(ctx, ing.Name, metav1.GetOptions{})
	var result *networkingv1.Ingress
	isCreated := false

	if err == nil {
		ing.ResourceVersion = existing.ResourceVersion
		result, err = clientset.NetworkingV1().Ingresses(ing.Namespace).Update(ctx, &ing, metav1.UpdateOptions{DryRun: dryRunOpt})
		if err != nil {
			response.InternalError(c, "更新Ingress失败: "+err.Error())
			return
		}
	} else {
		isCreated = true
		result, err = clientset.NetworkingV1().Ingresses(ing.Namespace).Create(ctx, &ing, metav1.CreateOptions{DryRun: dryRunOpt})
		if err != nil {
			response.InternalError(c, "创建Ingress失败: "+err.Error())
			return
		}
	}

	response.OK(c, ResourceYAMLResponse{
		Name:            result.Name,
		Namespace:       result.Namespace,
		Kind:            "Ingress",
		ResourceVersion: result.ResourceVersion,
		IsCreated:       isCreated,
	})
}

// ApplyPVCYAML 应用PVC YAML
func (h *ResourceYAMLHandler) ApplyPVCYAML(c *gin.Context) {
	var req ResourceYAMLApplyRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "参数错误: "+err.Error())
		return
	}

	k8sClient, ok := h.prepareK8sClient(c)
	if !ok {
		return
	}

	var pvc corev1.PersistentVolumeClaim
	if err := yaml.Unmarshal([]byte(req.YAML), &pvc); err != nil {
		response.BadRequest(c, "YAML格式错误: "+err.Error())
		return
	}

	if pvc.Kind != "" && pvc.Kind != "PersistentVolumeClaim" {
		response.BadRequest(c, "YAML类型错误，期望PersistentVolumeClaim，实际为: "+pvc.Kind)
		return
	}

	if pvc.Namespace == "" {
		pvc.Namespace = "default"
	}

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	clientset := k8sClient.GetClientset()
	var dryRunOpt []string
	if req.DryRun {
		dryRunOpt = []string{metav1.DryRunAll}
	}

	existing, err := clientset.CoreV1().PersistentVolumeClaims(pvc.Namespace).Get(ctx, pvc.Name, metav1.GetOptions{})
	var result *corev1.PersistentVolumeClaim
	isCreated := false

	if err == nil {
		pvc.ResourceVersion = existing.ResourceVersion
		// PVC的spec大部分字段是不可变的，只能更新某些字段
		pvc.Spec.VolumeName = existing.Spec.VolumeName
		result, err = clientset.CoreV1().PersistentVolumeClaims(pvc.Namespace).Update(ctx, &pvc, metav1.UpdateOptions{DryRun: dryRunOpt})
		if err != nil {
			response.InternalError(c, "更新PVC失败: "+err.Error())
			return
		}
	} else {
		isCreated = true
		result, err = clientset.CoreV1().PersistentVolumeClaims(pvc.Namespace).Create(ctx, &pvc, metav1.CreateOptions{DryRun: dryRunOpt})
		if err != nil {
			response.InternalError(c, "创建PVC失败: "+err.Error())
			return
		}
	}

	response.OK(c, ResourceYAMLResponse{
		Name:            result.Name,
		Namespace:       result.Namespace,
		Kind:            "PersistentVolumeClaim",
		ResourceVersion: result.ResourceVersion,
		IsCreated:       isCreated,
	})
}

// ApplyPVYAML 应用PV YAML
func (h *ResourceYAMLHandler) ApplyPVYAML(c *gin.Context) {
	var req ResourceYAMLApplyRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "参数错误: "+err.Error())
		return
	}

	k8sClient, ok := h.prepareK8sClient(c)
	if !ok {
		return
	}

	var pv corev1.PersistentVolume
	if err := yaml.Unmarshal([]byte(req.YAML), &pv); err != nil {
		response.BadRequest(c, "YAML格式错误: "+err.Error())
		return
	}

	if pv.Kind != "" && pv.Kind != "PersistentVolume" {
		response.BadRequest(c, "YAML类型错误，期望PersistentVolume，实际为: "+pv.Kind)
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	clientset := k8sClient.GetClientset()
	var dryRunOpt []string
	if req.DryRun {
		dryRunOpt = []string{metav1.DryRunAll}
	}

	existing, err := clientset.CoreV1().PersistentVolumes().Get(ctx, pv.Name, metav1.GetOptions{})
	var result *corev1.PersistentVolume
	isCreated := false

	if err == nil {
		pv.ResourceVersion = existing.ResourceVersion
		result, err = clientset.CoreV1().PersistentVolumes().Update(ctx, &pv, metav1.UpdateOptions{DryRun: dryRunOpt})
		if err != nil {
			response.InternalError(c, "更新PV失败: "+err.Error())
			return
		}
	} else {
		isCreated = true
		result, err = clientset.CoreV1().PersistentVolumes().Create(ctx, &pv, metav1.CreateOptions{DryRun: dryRunOpt})
		if err != nil {
			response.InternalError(c, "创建PV失败: "+err.Error())
			return
		}
	}

	response.OK(c, ResourceYAMLResponse{
		Name:            result.Name,
		Kind:            "PersistentVolume",
		ResourceVersion: result.ResourceVersion,
		IsCreated:       isCreated,
	})
}

// ApplyStorageClassYAML 应用StorageClass YAML
func (h *ResourceYAMLHandler) ApplyStorageClassYAML(c *gin.Context) {
	var req ResourceYAMLApplyRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "参数错误: "+err.Error())
		return
	}

	k8sClient, ok := h.prepareK8sClient(c)
	if !ok {
		return
	}

	var sc storagev1.StorageClass
	if err := yaml.Unmarshal([]byte(req.YAML), &sc); err != nil {
		response.BadRequest(c, "YAML格式错误: "+err.Error())
		return
	}

	if sc.Kind != "" && sc.Kind != "StorageClass" {
		response.BadRequest(c, "YAML类型错误，期望StorageClass，实际为: "+sc.Kind)
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	clientset := k8sClient.GetClientset()
	var dryRunOpt []string
	if req.DryRun {
		dryRunOpt = []string{metav1.DryRunAll}
	}

	existing, err := clientset.StorageV1().StorageClasses().Get(ctx, sc.Name, metav1.GetOptions{})
	var result *storagev1.StorageClass
	isCreated := false

	if err == nil {
		sc.ResourceVersion = existing.ResourceVersion
		result, err = clientset.StorageV1().StorageClasses().Update(ctx, &sc, metav1.UpdateOptions{DryRun: dryRunOpt})
		if err != nil {
			response.InternalError(c, "更新StorageClass失败: "+err.Error())
			return
		}
	} else {
		isCreated = true
		result, err = clientset.StorageV1().StorageClasses().Create(ctx, &sc, metav1.CreateOptions{DryRun: dryRunOpt})
		if err != nil {
			response.InternalError(c, "创建StorageClass失败: "+err.Error())
			return
		}
	}

	response.OK(c, ResourceYAMLResponse{
		Name:            result.Name,
		Kind:            "StorageClass",
		ResourceVersion: result.ResourceVersion,
		IsCreated:       isCreated,
	})
}

// createK8sClient 获取缓存的 K8s 客户端
func (h *ResourceYAMLHandler) createK8sClient(cluster *models.Cluster) (*services.K8sClient, error) {
	return h.k8sMgr.GetK8sClient(cluster)
}

// prepareK8sClient 通用初始化：解析 clusterID → 获取集群 → 创建客户端
func (h *ResourceYAMLHandler) prepareK8sClient(c *gin.Context) (*services.K8sClient, bool) {
	clusterID := c.Param("clusterID")
	id, err := parseClusterID(clusterID)
	if err != nil {
		response.BadRequest(c, "无效的集群ID")
		return nil, false
	}
	cluster, err := h.clusterService.GetCluster(id)
	if err != nil {
		response.NotFound(c, "集群不存在")
		return nil, false
	}
	k8sClient, err := h.createK8sClient(cluster)
	if err != nil {
		response.InternalError(c, "创建K8s客户端失败: "+err.Error())
		return nil, false
	}
	return k8sClient, true
}

// respondWithYAML 通用 YAML GET 响应：清理 ManagedFields、设置 TypeMeta、序列化
func respondWithYAML(c *gin.Context, obj interface{}) {
	yamlBytes, err := sigsyaml.Marshal(obj)
	if err != nil {
		response.InternalError(c, "转换YAML失败: "+err.Error())
		return
	}
	response.OK(c, gin.H{"yaml": string(yamlBytes)})
}

// GetServiceYAMLClean 获取干净的Service YAML（用于编辑）
func (h *ResourceYAMLHandler) GetServiceYAMLClean(c *gin.Context) {
	k8sClient, ok := h.prepareK8sClient(c)
	if !ok {
		return
	}
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	svc, err := k8sClient.GetClientset().CoreV1().Services(c.Param("namespace")).Get(ctx, c.Param("name"), metav1.GetOptions{})
	if err != nil {
		response.NotFound(c, "Service不存在: "+err.Error())
		return
	}
	clean := svc.DeepCopy()
	clean.ManagedFields = nil
	clean.APIVersion = "v1"
	clean.Kind = "Service"
	respondWithYAML(c, clean)
}

// GetIngressYAMLClean 获取干净的Ingress YAML（用于编辑）
func (h *ResourceYAMLHandler) GetIngressYAMLClean(c *gin.Context) {
	k8sClient, ok := h.prepareK8sClient(c)
	if !ok {
		return
	}
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	ing, err := k8sClient.GetClientset().NetworkingV1().Ingresses(c.Param("namespace")).Get(ctx, c.Param("name"), metav1.GetOptions{})
	if err != nil {
		response.NotFound(c, "Ingress不存在: "+err.Error())
		return
	}
	clean := ing.DeepCopy()
	clean.ManagedFields = nil
	clean.APIVersion = "networking.k8s.io/v1"
	clean.Kind = "Ingress"
	respondWithYAML(c, clean)
}

// GetPVCYAMLClean 获取干净的PVC YAML（用于编辑）
func (h *ResourceYAMLHandler) GetPVCYAMLClean(c *gin.Context) {
	k8sClient, ok := h.prepareK8sClient(c)
	if !ok {
		return
	}
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	pvc, err := k8sClient.GetClientset().CoreV1().PersistentVolumeClaims(c.Param("namespace")).Get(ctx, c.Param("name"), metav1.GetOptions{})
	if err != nil {
		response.NotFound(c, "PVC不存在: "+err.Error())
		return
	}
	clean := pvc.DeepCopy()
	clean.ManagedFields = nil
	clean.APIVersion = "v1"
	clean.Kind = "PersistentVolumeClaim"
	respondWithYAML(c, clean)
}

// GetPVYAMLClean 获取干净的PV YAML（用于编辑）
func (h *ResourceYAMLHandler) GetPVYAMLClean(c *gin.Context) {
	k8sClient, ok := h.prepareK8sClient(c)
	if !ok {
		return
	}
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	pv, err := k8sClient.GetClientset().CoreV1().PersistentVolumes().Get(ctx, c.Param("name"), metav1.GetOptions{})
	if err != nil {
		response.NotFound(c, "PV不存在: "+err.Error())
		return
	}
	clean := pv.DeepCopy()
	clean.ManagedFields = nil
	clean.APIVersion = "v1"
	clean.Kind = "PersistentVolume"
	respondWithYAML(c, clean)
}

// GetStorageClassYAMLClean 获取干净的StorageClass YAML（用于编辑）
func (h *ResourceYAMLHandler) GetStorageClassYAMLClean(c *gin.Context) {
	k8sClient, ok := h.prepareK8sClient(c)
	if !ok {
		return
	}
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	sc, err := k8sClient.GetClientset().StorageV1().StorageClasses().Get(ctx, c.Param("name"), metav1.GetOptions{})
	if err != nil {
		response.NotFound(c, "StorageClass不存在: "+err.Error())
		return
	}
	clean := sc.DeepCopy()
	clean.ManagedFields = nil
	clean.APIVersion = "storage.k8s.io/v1"
	clean.Kind = "StorageClass"
	respondWithYAML(c, clean)
}
