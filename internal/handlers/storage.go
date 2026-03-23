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
	corev1 "k8s.io/api/core/v1"
	storagev1 "k8s.io/api/storage/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/kubernetes"
	"sigs.k8s.io/yaml"
)

// StorageHandler 存储处理器
type StorageHandler struct {
	db             *gorm.DB
	cfg            *config.Config
	clusterService *services.ClusterService
	k8sMgr         *k8s.ClusterInformerManager
}

// NewStorageHandler 创建存储处理器
func NewStorageHandler(db *gorm.DB, cfg *config.Config, clusterService *services.ClusterService, k8sMgr *k8s.ClusterInformerManager) *StorageHandler {
	return &StorageHandler{
		db:             db,
		cfg:            cfg,
		clusterService: clusterService,
		k8sMgr:         k8sMgr,
	}
}

// ==================== PVC 相关结构体和方法 ====================

// PVCInfo PVC信息
type PVCInfo struct {
	Name             string            `json:"name"`
	Namespace        string            `json:"namespace"`
	Status           string            `json:"status"`
	VolumeName       string            `json:"volumeName"`
	StorageClassName string            `json:"storageClassName"`
	AccessModes      []string          `json:"accessModes"`
	Capacity         string            `json:"capacity"`
	VolumeMode       string            `json:"volumeMode"`
	CreatedAt        time.Time         `json:"createdAt"`
	Labels           map[string]string `json:"labels"`
	Annotations      map[string]string `json:"annotations"`
}

// ListPVCs 获取PVC列表
func (h *StorageHandler) ListPVCs(c *gin.Context) {
	clusterIDStr := c.Param("clusterID")
	clusterID, err := parseClusterID(clusterIDStr)
	if err != nil {
		response.BadRequest(c, "无效的集群ID")
		return
	}

	// 获取查询参数
	namespace := c.DefaultQuery("namespace", "")
	status := c.DefaultQuery("status", "")
	search := c.DefaultQuery("search", "")
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("pageSize", "10"))

	// 从集群服务获取集群信息
	cluster, err := h.clusterService.GetCluster(clusterID)
	if err != nil {
		logger.Error("获取集群失败", "error", err, "clusterId", clusterID)
		response.NotFound(c, "集群不存在")
		return
	}

	// 获取缓存的 K8s 客户端
	k8sClient, err := h.k8sMgr.GetK8sClient(cluster)
	if err != nil {
		logger.Error("获取K8s客户端失败", "error", err, "clusterId", clusterID)
		response.InternalError(c, fmt.Sprintf("获取K8s客户端失败: %v", err))
		return
	}

	clientset := k8sClient.GetClientset()

	// 检查命名空间权限
	nsInfo, hasAccess := middleware.CheckNamespacePermission(c, namespace)
	if !hasAccess {
		response.Forbidden(c, fmt.Sprintf("无权访问命名空间: %s", namespace))
		return
	}

	// 获取PVCs
	pvcs, err := h.getPVCs(clientset, namespace)
	if err != nil {
		logger.Error("获取PVCs失败", "error", err, "clusterId", clusterID)
		response.InternalError(c, fmt.Sprintf("获取PVCs失败: %v", err))
		return
	}

	// 根据命名空间权限过滤
	if !nsInfo.HasAllAccess && namespace == "" {
		pvcs = middleware.FilterResourcesByNamespace(c, pvcs, func(pvc PVCInfo) string {
			return pvc.Namespace
		})
	}

	// 过滤和搜索
	filteredPVCs := h.filterPVCs(pvcs, status, search)

	// 排序
	sort.Slice(filteredPVCs, func(i, j int) bool {
		return filteredPVCs[i].CreatedAt.After(filteredPVCs[j].CreatedAt)
	})

	// 分页
	total := len(filteredPVCs)
	start := (page - 1) * pageSize
	end := start + pageSize
	if start > total {
		start = total
	}
	if end > total {
		end = total
	}
	pagedPVCs := filteredPVCs[start:end]

	response.PagedList(c, pagedPVCs, int64(total), page, pageSize)
}

// GetPVC 获取单个PVC详情
func (h *StorageHandler) GetPVC(c *gin.Context) {
	clusterIDStr := c.Param("clusterID")
	clusterID, err := parseClusterID(clusterIDStr)
	if err != nil {
		response.BadRequest(c, "无效的集群ID")
		return
	}

	namespace := c.Param("namespace")
	name := c.Param("name")

	// 从集群服务获取集群信息
	cluster, err := h.clusterService.GetCluster(clusterID)
	if err != nil {
		logger.Error("获取集群失败", "error", err, "clusterId", clusterID)
		response.NotFound(c, "集群不存在")
		return
	}

	// 获取缓存的 K8s 客户端
	k8sClient, err := h.k8sMgr.GetK8sClient(cluster)
	if err != nil {
		logger.Error("获取K8s客户端失败", "error", err, "clusterId", clusterID)
		response.InternalError(c, fmt.Sprintf("获取K8s客户端失败: %v", err))
		return
	}

	clientset := k8sClient.GetClientset()

	// 获取PVC
	pvc, err := clientset.CoreV1().PersistentVolumeClaims(namespace).Get(context.Background(), name, metav1.GetOptions{})
	if err != nil {
		logger.Error("获取PVC失败", "error", err, "clusterId", clusterID, "namespace", namespace, "name", name)
		response.InternalError(c, fmt.Sprintf("获取PVC失败: %v", err))
		return
	}

	pvcInfo := h.convertToPVCInfo(pvc)

	response.OK(c, pvcInfo)
}

// GetPVCYAML 获取PVC的YAML
func (h *StorageHandler) GetPVCYAML(c *gin.Context) {
	clusterIDStr := c.Param("clusterID")
	clusterID, err := parseClusterID(clusterIDStr)
	if err != nil {
		response.BadRequest(c, "无效的集群ID")
		return
	}

	namespace := c.Param("namespace")
	name := c.Param("name")

	// 从集群服务获取集群信息
	cluster, err := h.clusterService.GetCluster(clusterID)
	if err != nil {
		logger.Error("获取集群失败", "error", err, "clusterId", clusterID)
		response.NotFound(c, "集群不存在")
		return
	}

	// 获取缓存的 K8s 客户端
	k8sClient, err := h.k8sMgr.GetK8sClient(cluster)
	if err != nil {
		logger.Error("获取K8s客户端失败", "error", err, "clusterId", clusterID)
		response.InternalError(c, fmt.Sprintf("获取K8s客户端失败: %v", err))
		return
	}

	clientset := k8sClient.GetClientset()

	// 获取PVC
	pvc, err := clientset.CoreV1().PersistentVolumeClaims(namespace).Get(context.Background(), name, metav1.GetOptions{})
	if err != nil {
		logger.Error("获取PVC失败", "error", err, "clusterId", clusterID, "namespace", namespace, "name", name)
		response.InternalError(c, fmt.Sprintf("获取PVC失败: %v", err))
		return
	}

	// 转换为YAML
	yamlData, err := yaml.Marshal(pvc)
	if err != nil {
		logger.Error("转换YAML失败", "error", err)
		response.InternalError(c, fmt.Sprintf("转换YAML失败: %v", err))
		return
	}

	response.OK(c, gin.H{"yaml": string(yamlData)})
}

// DeletePVC 删除PVC
func (h *StorageHandler) DeletePVC(c *gin.Context) {
	clusterIDStr := c.Param("clusterID")
	clusterID, err := parseClusterID(clusterIDStr)
	if err != nil {
		response.BadRequest(c, "无效的集群ID")
		return
	}

	namespace := c.Param("namespace")
	name := c.Param("name")

	// 从集群服务获取集群信息
	cluster, err := h.clusterService.GetCluster(clusterID)
	if err != nil {
		logger.Error("获取集群失败", "error", err, "clusterId", clusterID)
		response.NotFound(c, "集群不存在")
		return
	}

	// 获取缓存的 K8s 客户端
	k8sClient, err := h.k8sMgr.GetK8sClient(cluster)
	if err != nil {
		logger.Error("获取K8s客户端失败", "error", err, "clusterId", clusterID)
		response.InternalError(c, fmt.Sprintf("获取K8s客户端失败: %v", err))
		return
	}

	clientset := k8sClient.GetClientset()

	// 删除PVC
	err = clientset.CoreV1().PersistentVolumeClaims(namespace).Delete(context.Background(), name, metav1.DeleteOptions{})
	if err != nil {
		logger.Error("删除PVC失败", "error", err, "clusterId", clusterID, "namespace", namespace, "name", name)
		response.InternalError(c, fmt.Sprintf("删除PVC失败: %v", err))
		return
	}

	logger.Info("PVC删除成功", "clusterId", clusterID, "namespace", namespace, "name", name)
	response.NoContent(c)
}

// GetPVCNamespaces 获取PVC所在的命名空间列表
func (h *StorageHandler) GetPVCNamespaces(c *gin.Context) {
	clusterID := c.Param("clusterID")

	// 获取集群
	id, err := strconv.ParseUint(clusterID, 10, 32)
	if err != nil {
		response.BadRequest(c, "无效的集群ID")
		return
	}

	cluster, err := h.clusterService.GetCluster(uint(id))
	if err != nil {
		response.NotFound(c, "集群不存在")
		return
	}

	// 获取缓存的 K8s 客户端
	k8sClient, err := h.k8sMgr.GetK8sClient(cluster)
	if err != nil {
		response.InternalError(c, fmt.Sprintf("获取K8s客户端失败: %v", err))
		return
	}
	clientset := k8sClient.GetClientset()

	// 获取所有PVCs
	pvcList, err := clientset.CoreV1().PersistentVolumeClaims("").List(context.Background(), metav1.ListOptions{})
	if err != nil {
		logger.Error("获取PVC列表失败", "cluster", cluster.Name, "error", err)
		response.InternalError(c, fmt.Sprintf("获取PVC列表失败: %v", err))
		return
	}

	// 统计每个命名空间的PVC数量
	nsMap := make(map[string]int)
	for _, pvc := range pvcList.Items {
		nsMap[pvc.Namespace]++
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

	response.OK(c, namespaces)
}

// getPVCs 获取PVCs
func (h *StorageHandler) getPVCs(clientset kubernetes.Interface, namespace string) ([]PVCInfo, error) {
	var pvcList *corev1.PersistentVolumeClaimList
	var err error

	if namespace == "" || namespace == "_all_" {
		pvcList, err = clientset.CoreV1().PersistentVolumeClaims("").List(context.Background(), metav1.ListOptions{})
	} else {
		pvcList, err = clientset.CoreV1().PersistentVolumeClaims(namespace).List(context.Background(), metav1.ListOptions{})
	}

	if err != nil {
		return nil, err
	}

	pvcs := make([]PVCInfo, 0, len(pvcList.Items))
	for _, pvc := range pvcList.Items {
		pvcs = append(pvcs, h.convertToPVCInfo(&pvc))
	}

	return pvcs, nil
}

// convertToPVCInfo 转换为PVCInfo
func (h *StorageHandler) convertToPVCInfo(pvc *corev1.PersistentVolumeClaim) PVCInfo {
	accessModes := make([]string, 0, len(pvc.Spec.AccessModes))
	for _, mode := range pvc.Spec.AccessModes {
		accessModes = append(accessModes, string(mode))
	}

	capacity := ""
	if pvc.Status.Capacity != nil {
		if storage, ok := pvc.Status.Capacity[corev1.ResourceStorage]; ok {
			capacity = storage.String()
		}
	}

	storageClassName := ""
	if pvc.Spec.StorageClassName != nil {
		storageClassName = *pvc.Spec.StorageClassName
	}

	volumeMode := ""
	if pvc.Spec.VolumeMode != nil {
		volumeMode = string(*pvc.Spec.VolumeMode)
	}

	return PVCInfo{
		Name:             pvc.Name,
		Namespace:        pvc.Namespace,
		Status:           string(pvc.Status.Phase),
		VolumeName:       pvc.Spec.VolumeName,
		StorageClassName: storageClassName,
		AccessModes:      accessModes,
		Capacity:         capacity,
		VolumeMode:       volumeMode,
		CreatedAt:        pvc.CreationTimestamp.Time,
		Labels:           pvc.Labels,
		Annotations:      pvc.Annotations,
	}
}

// filterPVCs 过滤PVCs
func (h *StorageHandler) filterPVCs(pvcs []PVCInfo, status, search string) []PVCInfo {
	filtered := make([]PVCInfo, 0)
	for _, pvc := range pvcs {
		// 状态过滤
		if status != "" && pvc.Status != status {
			continue
		}

		// 搜索过滤
		if search != "" {
			searchLower := strings.ToLower(search)
			if !strings.Contains(strings.ToLower(pvc.Name), searchLower) &&
				!strings.Contains(strings.ToLower(pvc.Namespace), searchLower) &&
				!strings.Contains(strings.ToLower(pvc.StorageClassName), searchLower) {
				continue
			}
		}

		filtered = append(filtered, pvc)
	}
	return filtered
}

// ==================== PV 相关结构体和方法 ====================

// PVInfo PV信息
type PVInfo struct {
	Name                   string            `json:"name"`
	Status                 string            `json:"status"`
	Capacity               string            `json:"capacity"`
	AccessModes            []string          `json:"accessModes"`
	ReclaimPolicy          string            `json:"reclaimPolicy"`
	StorageClassName       string            `json:"storageClassName"`
	VolumeMode             string            `json:"volumeMode"`
	ClaimRef               *PVClaimRef       `json:"claimRef,omitempty"`
	PersistentVolumeSource string            `json:"persistentVolumeSource"`
	MountOptions           []string          `json:"mountOptions,omitempty"`
	NodeAffinity           string            `json:"nodeAffinity,omitempty"`
	CreatedAt              time.Time         `json:"createdAt"`
	Labels                 map[string]string `json:"labels"`
	Annotations            map[string]string `json:"annotations"`
}

// PVClaimRef PV声明引用
type PVClaimRef struct {
	Namespace string `json:"namespace"`
	Name      string `json:"name"`
}

// ListPVs 获取PV列表
func (h *StorageHandler) ListPVs(c *gin.Context) {
	clusterIDStr := c.Param("clusterID")
	clusterID, err := parseClusterID(clusterIDStr)
	if err != nil {
		response.BadRequest(c, "无效的集群ID")
		return
	}

	// 获取查询参数
	status := c.DefaultQuery("status", "")
	search := c.DefaultQuery("search", "")
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("pageSize", "10"))

	// 从集群服务获取集群信息
	cluster, err := h.clusterService.GetCluster(clusterID)
	if err != nil {
		logger.Error("获取集群失败", "error", err, "clusterId", clusterID)
		response.NotFound(c, "集群不存在")
		return
	}

	// 获取缓存的 K8s 客户端
	k8sClient, err := h.k8sMgr.GetK8sClient(cluster)
	if err != nil {
		logger.Error("获取K8s客户端失败", "error", err, "clusterId", clusterID)
		response.InternalError(c, fmt.Sprintf("获取K8s客户端失败: %v", err))
		return
	}

	clientset := k8sClient.GetClientset()

	// 获取PVs
	pvList, err := clientset.CoreV1().PersistentVolumes().List(context.Background(), metav1.ListOptions{})
	if err != nil {
		logger.Error("获取PVs失败", "error", err, "clusterId", clusterID)
		response.InternalError(c, fmt.Sprintf("获取PVs失败: %v", err))
		return
	}

	pvs := make([]PVInfo, 0, len(pvList.Items))
	for _, pv := range pvList.Items {
		pvs = append(pvs, h.convertToPVInfo(&pv))
	}

	// 过滤和搜索
	filteredPVs := h.filterPVs(pvs, status, search)

	// 排序
	sort.Slice(filteredPVs, func(i, j int) bool {
		return filteredPVs[i].CreatedAt.After(filteredPVs[j].CreatedAt)
	})

	// 分页
	total := len(filteredPVs)
	start := (page - 1) * pageSize
	end := start + pageSize
	if start > total {
		start = total
	}
	if end > total {
		end = total
	}
	pagedPVs := filteredPVs[start:end]

	response.PagedList(c, pagedPVs, int64(total), page, pageSize)
}

// GetPV 获取单个PV详情
func (h *StorageHandler) GetPV(c *gin.Context) {
	clusterIDStr := c.Param("clusterID")
	clusterID, err := parseClusterID(clusterIDStr)
	if err != nil {
		response.BadRequest(c, "无效的集群ID")
		return
	}

	name := c.Param("name")

	// 从集群服务获取集群信息
	cluster, err := h.clusterService.GetCluster(clusterID)
	if err != nil {
		logger.Error("获取集群失败", "error", err, "clusterId", clusterID)
		response.NotFound(c, "集群不存在")
		return
	}

	// 获取缓存的 K8s 客户端
	k8sClient, err := h.k8sMgr.GetK8sClient(cluster)
	if err != nil {
		logger.Error("获取K8s客户端失败", "error", err, "clusterId", clusterID)
		response.InternalError(c, fmt.Sprintf("获取K8s客户端失败: %v", err))
		return
	}

	clientset := k8sClient.GetClientset()

	// 获取PV
	pv, err := clientset.CoreV1().PersistentVolumes().Get(context.Background(), name, metav1.GetOptions{})
	if err != nil {
		logger.Error("获取PV失败", "error", err, "clusterId", clusterID, "name", name)
		response.InternalError(c, fmt.Sprintf("获取PV失败: %v", err))
		return
	}

	pvInfo := h.convertToPVInfo(pv)

	response.OK(c, pvInfo)
}

// GetPVYAML 获取PV的YAML
func (h *StorageHandler) GetPVYAML(c *gin.Context) {
	clusterIDStr := c.Param("clusterID")
	clusterID, err := parseClusterID(clusterIDStr)
	if err != nil {
		response.BadRequest(c, "无效的集群ID")
		return
	}

	name := c.Param("name")

	// 从集群服务获取集群信息
	cluster, err := h.clusterService.GetCluster(clusterID)
	if err != nil {
		logger.Error("获取集群失败", "error", err, "clusterId", clusterID)
		response.NotFound(c, "集群不存在")
		return
	}

	// 获取缓存的 K8s 客户端
	k8sClient, err := h.k8sMgr.GetK8sClient(cluster)
	if err != nil {
		logger.Error("获取K8s客户端失败", "error", err, "clusterId", clusterID)
		response.InternalError(c, fmt.Sprintf("获取K8s客户端失败: %v", err))
		return
	}

	clientset := k8sClient.GetClientset()

	// 获取PV
	pv, err := clientset.CoreV1().PersistentVolumes().Get(context.Background(), name, metav1.GetOptions{})
	if err != nil {
		logger.Error("获取PV失败", "error", err, "clusterId", clusterID, "name", name)
		response.InternalError(c, fmt.Sprintf("获取PV失败: %v", err))
		return
	}

	// 转换为YAML
	yamlData, err := yaml.Marshal(pv)
	if err != nil {
		logger.Error("转换YAML失败", "error", err)
		response.InternalError(c, fmt.Sprintf("转换YAML失败: %v", err))
		return
	}

	response.OK(c, gin.H{"yaml": string(yamlData)})
}

// DeletePV 删除PV
func (h *StorageHandler) DeletePV(c *gin.Context) {
	clusterIDStr := c.Param("clusterID")
	clusterID, err := parseClusterID(clusterIDStr)
	if err != nil {
		response.BadRequest(c, "无效的集群ID")
		return
	}

	name := c.Param("name")

	// 从集群服务获取集群信息
	cluster, err := h.clusterService.GetCluster(clusterID)
	if err != nil {
		logger.Error("获取集群失败", "error", err, "clusterId", clusterID)
		response.NotFound(c, "集群不存在")
		return
	}

	// 获取缓存的 K8s 客户端
	k8sClient, err := h.k8sMgr.GetK8sClient(cluster)
	if err != nil {
		logger.Error("获取K8s客户端失败", "error", err, "clusterId", clusterID)
		response.InternalError(c, fmt.Sprintf("获取K8s客户端失败: %v", err))
		return
	}

	clientset := k8sClient.GetClientset()

	// 删除PV
	err = clientset.CoreV1().PersistentVolumes().Delete(context.Background(), name, metav1.DeleteOptions{})
	if err != nil {
		logger.Error("删除PV失败", "error", err, "clusterId", clusterID, "name", name)
		response.InternalError(c, fmt.Sprintf("删除PV失败: %v", err))
		return
	}

	logger.Info("PV删除成功", "clusterId", clusterID, "name", name)
	response.NoContent(c)
}

// convertToPVInfo 转换为PVInfo
func (h *StorageHandler) convertToPVInfo(pv *corev1.PersistentVolume) PVInfo {
	accessModes := make([]string, 0, len(pv.Spec.AccessModes))
	for _, mode := range pv.Spec.AccessModes {
		accessModes = append(accessModes, string(mode))
	}

	capacity := ""
	if pv.Spec.Capacity != nil {
		if storage, ok := pv.Spec.Capacity[corev1.ResourceStorage]; ok {
			capacity = storage.String()
		}
	}

	volumeMode := ""
	if pv.Spec.VolumeMode != nil {
		volumeMode = string(*pv.Spec.VolumeMode)
	}

	var claimRef *PVClaimRef
	if pv.Spec.ClaimRef != nil {
		claimRef = &PVClaimRef{
			Namespace: pv.Spec.ClaimRef.Namespace,
			Name:      pv.Spec.ClaimRef.Name,
		}
	}

	// 获取PersistentVolumeSource类型
	sourceType := h.getPVSourceType(&pv.Spec.PersistentVolumeSource)

	return PVInfo{
		Name:                   pv.Name,
		Status:                 string(pv.Status.Phase),
		Capacity:               capacity,
		AccessModes:            accessModes,
		ReclaimPolicy:          string(pv.Spec.PersistentVolumeReclaimPolicy),
		StorageClassName:       pv.Spec.StorageClassName,
		VolumeMode:             volumeMode,
		ClaimRef:               claimRef,
		PersistentVolumeSource: sourceType,
		MountOptions:           pv.Spec.MountOptions,
		CreatedAt:              pv.CreationTimestamp.Time,
		Labels:                 pv.Labels,
		Annotations:            pv.Annotations,
	}
}

// getPVSourceType 获取PV源类型
func (h *StorageHandler) getPVSourceType(source *corev1.PersistentVolumeSource) string {
	if source.HostPath != nil {
		return "HostPath"
	}
	if source.NFS != nil {
		return "NFS"
	}
	if source.ISCSI != nil {
		return "iSCSI"
	}
	if source.Cinder != nil {
		return "Cinder"
	}
	if source.CephFS != nil {
		return "CephFS"
	}
	if source.FC != nil {
		return "FC"
	}
	if source.FlexVolume != nil {
		return "FlexVolume"
	}
	if source.AWSElasticBlockStore != nil {
		return "AWSElasticBlockStore"
	}
	if source.GCEPersistentDisk != nil {
		return "GCEPersistentDisk"
	}
	if source.AzureDisk != nil {
		return "AzureDisk"
	}
	if source.AzureFile != nil {
		return "AzureFile"
	}
	if source.VsphereVolume != nil {
		return "vSphereVolume"
	}
	if source.RBD != nil {
		return "RBD"
	}
	if source.Glusterfs != nil {
		return "Glusterfs"
	}
	if source.Local != nil {
		return "Local"
	}
	if source.CSI != nil {
		return "CSI"
	}
	return "Unknown"
}

// filterPVs 过滤PVs
func (h *StorageHandler) filterPVs(pvs []PVInfo, status, search string) []PVInfo {
	filtered := make([]PVInfo, 0)
	for _, pv := range pvs {
		// 状态过滤
		if status != "" && pv.Status != status {
			continue
		}

		// 搜索过滤
		if search != "" {
			searchLower := strings.ToLower(search)
			if !strings.Contains(strings.ToLower(pv.Name), searchLower) &&
				!strings.Contains(strings.ToLower(pv.StorageClassName), searchLower) &&
				!strings.Contains(strings.ToLower(pv.PersistentVolumeSource), searchLower) {
				continue
			}
		}

		filtered = append(filtered, pv)
	}
	return filtered
}

// ==================== StorageClass 相关结构体和方法 ====================

// StorageClassInfo StorageClass信息
type StorageClassInfo struct {
	Name                 string            `json:"name"`
	Provisioner          string            `json:"provisioner"`
	ReclaimPolicy        string            `json:"reclaimPolicy"`
	VolumeBindingMode    string            `json:"volumeBindingMode"`
	AllowVolumeExpansion bool              `json:"allowVolumeExpansion"`
	Parameters           map[string]string `json:"parameters,omitempty"`
	MountOptions         []string          `json:"mountOptions,omitempty"`
	IsDefault            bool              `json:"isDefault"`
	CreatedAt            time.Time         `json:"createdAt"`
	Labels               map[string]string `json:"labels"`
	Annotations          map[string]string `json:"annotations"`
}

// ListStorageClasses 获取StorageClass列表
func (h *StorageHandler) ListStorageClasses(c *gin.Context) {
	clusterIDStr := c.Param("clusterID")
	clusterID, err := parseClusterID(clusterIDStr)
	if err != nil {
		response.BadRequest(c, "无效的集群ID")
		return
	}

	// 获取查询参数
	search := c.DefaultQuery("search", "")
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("pageSize", "10"))

	// 从集群服务获取集群信息
	cluster, err := h.clusterService.GetCluster(clusterID)
	if err != nil {
		logger.Error("获取集群失败", "error", err, "clusterId", clusterID)
		response.NotFound(c, "集群不存在")
		return
	}

	// 获取缓存的 K8s 客户端
	k8sClient, err := h.k8sMgr.GetK8sClient(cluster)
	if err != nil {
		logger.Error("获取K8s客户端失败", "error", err, "clusterId", clusterID)
		response.InternalError(c, fmt.Sprintf("获取K8s客户端失败: %v", err))
		return
	}

	clientset := k8sClient.GetClientset()

	// 获取StorageClasses
	scList, err := clientset.StorageV1().StorageClasses().List(context.Background(), metav1.ListOptions{})
	if err != nil {
		logger.Error("获取StorageClasses失败", "error", err, "clusterId", clusterID)
		response.InternalError(c, fmt.Sprintf("获取StorageClasses失败: %v", err))
		return
	}

	scs := make([]StorageClassInfo, 0, len(scList.Items))
	for _, sc := range scList.Items {
		scs = append(scs, h.convertToStorageClassInfo(&sc))
	}

	// 过滤和搜索
	filteredSCs := h.filterStorageClasses(scs, search)

	// 排序
	sort.Slice(filteredSCs, func(i, j int) bool {
		return filteredSCs[i].CreatedAt.After(filteredSCs[j].CreatedAt)
	})

	// 分页
	total := len(filteredSCs)
	start := (page - 1) * pageSize
	end := start + pageSize
	if start > total {
		start = total
	}
	if end > total {
		end = total
	}
	pagedSCs := filteredSCs[start:end]

	response.PagedList(c, pagedSCs, int64(total), page, pageSize)
}

// GetStorageClass 获取单个StorageClass详情
func (h *StorageHandler) GetStorageClass(c *gin.Context) {
	clusterIDStr := c.Param("clusterID")
	clusterID, err := parseClusterID(clusterIDStr)
	if err != nil {
		response.BadRequest(c, "无效的集群ID")
		return
	}

	name := c.Param("name")

	// 从集群服务获取集群信息
	cluster, err := h.clusterService.GetCluster(clusterID)
	if err != nil {
		logger.Error("获取集群失败", "error", err, "clusterId", clusterID)
		response.NotFound(c, "集群不存在")
		return
	}

	// 获取缓存的 K8s 客户端
	k8sClient, err := h.k8sMgr.GetK8sClient(cluster)
	if err != nil {
		logger.Error("获取K8s客户端失败", "error", err, "clusterId", clusterID)
		response.InternalError(c, fmt.Sprintf("获取K8s客户端失败: %v", err))
		return
	}

	clientset := k8sClient.GetClientset()

	// 获取StorageClass
	sc, err := clientset.StorageV1().StorageClasses().Get(context.Background(), name, metav1.GetOptions{})
	if err != nil {
		logger.Error("获取StorageClass失败", "error", err, "clusterId", clusterID, "name", name)
		response.InternalError(c, fmt.Sprintf("获取StorageClass失败: %v", err))
		return
	}

	scInfo := h.convertToStorageClassInfo(sc)

	response.OK(c, scInfo)
}

// GetStorageClassYAML 获取StorageClass的YAML
func (h *StorageHandler) GetStorageClassYAML(c *gin.Context) {
	clusterIDStr := c.Param("clusterID")
	clusterID, err := parseClusterID(clusterIDStr)
	if err != nil {
		response.BadRequest(c, "无效的集群ID")
		return
	}

	name := c.Param("name")

	// 从集群服务获取集群信息
	cluster, err := h.clusterService.GetCluster(clusterID)
	if err != nil {
		logger.Error("获取集群失败", "error", err, "clusterId", clusterID)
		response.NotFound(c, "集群不存在")
		return
	}

	// 获取缓存的 K8s 客户端
	k8sClient, err := h.k8sMgr.GetK8sClient(cluster)
	if err != nil {
		logger.Error("获取K8s客户端失败", "error", err, "clusterId", clusterID)
		response.InternalError(c, fmt.Sprintf("获取K8s客户端失败: %v", err))
		return
	}

	clientset := k8sClient.GetClientset()

	// 获取StorageClass
	sc, err := clientset.StorageV1().StorageClasses().Get(context.Background(), name, metav1.GetOptions{})
	if err != nil {
		logger.Error("获取StorageClass失败", "error", err, "clusterId", clusterID, "name", name)
		response.InternalError(c, fmt.Sprintf("获取StorageClass失败: %v", err))
		return
	}

	// 转换为YAML
	yamlData, err := yaml.Marshal(sc)
	if err != nil {
		logger.Error("转换YAML失败", "error", err)
		response.InternalError(c, fmt.Sprintf("转换YAML失败: %v", err))
		return
	}

	response.OK(c, gin.H{"yaml": string(yamlData)})
}

// DeleteStorageClass 删除StorageClass
func (h *StorageHandler) DeleteStorageClass(c *gin.Context) {
	clusterIDStr := c.Param("clusterID")
	clusterID, err := parseClusterID(clusterIDStr)
	if err != nil {
		response.BadRequest(c, "无效的集群ID")
		return
	}

	name := c.Param("name")

	// 从集群服务获取集群信息
	cluster, err := h.clusterService.GetCluster(clusterID)
	if err != nil {
		logger.Error("获取集群失败", "error", err, "clusterId", clusterID)
		response.NotFound(c, "集群不存在")
		return
	}

	// 获取缓存的 K8s 客户端
	k8sClient, err := h.k8sMgr.GetK8sClient(cluster)
	if err != nil {
		logger.Error("获取K8s客户端失败", "error", err, "clusterId", clusterID)
		response.InternalError(c, fmt.Sprintf("获取K8s客户端失败: %v", err))
		return
	}

	clientset := k8sClient.GetClientset()

	// 删除StorageClass
	err = clientset.StorageV1().StorageClasses().Delete(context.Background(), name, metav1.DeleteOptions{})
	if err != nil {
		logger.Error("删除StorageClass失败", "error", err, "clusterId", clusterID, "name", name)
		response.InternalError(c, fmt.Sprintf("删除StorageClass失败: %v", err))
		return
	}

	logger.Info("StorageClass删除成功", "clusterId", clusterID, "name", name)
	response.NoContent(c)
}

// convertToStorageClassInfo 转换为StorageClassInfo
func (h *StorageHandler) convertToStorageClassInfo(sc *storagev1.StorageClass) StorageClassInfo {
	reclaimPolicy := ""
	if sc.ReclaimPolicy != nil {
		reclaimPolicy = string(*sc.ReclaimPolicy)
	}

	volumeBindingMode := ""
	if sc.VolumeBindingMode != nil {
		volumeBindingMode = string(*sc.VolumeBindingMode)
	}

	allowVolumeExpansion := false
	if sc.AllowVolumeExpansion != nil {
		allowVolumeExpansion = *sc.AllowVolumeExpansion
	}

	// 检查是否为默认StorageClass
	isDefault := false
	if sc.Annotations != nil {
		if val, ok := sc.Annotations["storageclass.kubernetes.io/is-default-class"]; ok && val == "true" {
			isDefault = true
		}
		if val, ok := sc.Annotations["storageclass.beta.kubernetes.io/is-default-class"]; ok && val == "true" {
			isDefault = true
		}
	}

	return StorageClassInfo{
		Name:                 sc.Name,
		Provisioner:          sc.Provisioner,
		ReclaimPolicy:        reclaimPolicy,
		VolumeBindingMode:    volumeBindingMode,
		AllowVolumeExpansion: allowVolumeExpansion,
		Parameters:           sc.Parameters,
		MountOptions:         sc.MountOptions,
		IsDefault:            isDefault,
		CreatedAt:            sc.CreationTimestamp.Time,
		Labels:               sc.Labels,
		Annotations:          sc.Annotations,
	}
}

// filterStorageClasses 过滤StorageClasses
func (h *StorageHandler) filterStorageClasses(scs []StorageClassInfo, search string) []StorageClassInfo {
	if search == "" {
		return scs
	}

	filtered := make([]StorageClassInfo, 0)
	searchLower := strings.ToLower(search)
	for _, sc := range scs {
		if strings.Contains(strings.ToLower(sc.Name), searchLower) ||
			strings.Contains(strings.ToLower(sc.Provisioner), searchLower) {
			filtered = append(filtered, sc)
		}
	}
	return filtered
}
