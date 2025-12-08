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

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
	batchv1 "k8s.io/api/batch/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime/serializer"
	"k8s.io/apimachinery/pkg/util/yaml"
	"k8s.io/client-go/kubernetes/scheme"
)

type CronJobHandler struct {
	db             *gorm.DB
	cfg            *config.Config
	clusterService *services.ClusterService
	k8sMgr         *k8s.ClusterInformerManager
}

func NewCronJobHandler(db *gorm.DB, cfg *config.Config, clusterService *services.ClusterService, k8sMgr *k8s.ClusterInformerManager) *CronJobHandler {
	return &CronJobHandler{db: db, cfg: cfg, clusterService: clusterService, k8sMgr: k8sMgr}
}

type CronJobInfo struct {
	ID               string            `json:"id"`
	Name             string            `json:"name"`
	Namespace        string            `json:"namespace"`
	Type             string            `json:"type"`
	Status           string            `json:"status"`
	Schedule         string            `json:"schedule"`
	Suspend          bool              `json:"suspend"`
	Active           int               `json:"active"`
	LastScheduleTime *time.Time        `json:"lastScheduleTime"`
	Labels           map[string]string `json:"labels"`
	Annotations      map[string]string `json:"annotations"`
	CreatedAt        time.Time         `json:"createdAt"`
}

func (h *CronJobHandler) ListCronJobs(c *gin.Context) {
	clusterId := c.Param("clusterID")
	namespace := c.Query("namespace")
	searchName := c.Query("search")
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("pageSize", "20"))

	logger.Info("获取CronJob列表: cluster=%s, namespace=%s, search=%s", clusterId, namespace, searchName)

	clusterID := parseClusterID(clusterId)
	cluster, err := h.clusterService.GetCluster(clusterID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"code": 404, "message": "集群不存在"})
		return
	}

	// 创建K8s客户端直接查询，因为CronJob可能不在informer cache中
	var k8sClient *services.K8sClient
	if cluster.KubeconfigEnc != "" {
		k8sClient, err = services.NewK8sClientFromKubeconfig(cluster.KubeconfigEnc)
	} else {
		k8sClient, err = services.NewK8sClientFromToken(cluster.APIServer, cluster.SATokenEnc, cluster.CAEnc)
	}
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"code": 500, "message": "创建K8s客户端失败: " + err.Error()})
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	clientset := k8sClient.GetClientset()
	var cronJobList *batchv1.CronJobList
	if namespace != "" {
		cronJobList, err = clientset.BatchV1().CronJobs(namespace).List(ctx, metav1.ListOptions{})
	} else {
		cronJobList, err = clientset.BatchV1().CronJobs("").List(ctx, metav1.ListOptions{})
	}

	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"code": 500, "message": "获取CronJob列表失败: " + err.Error()})
		return
	}

	var cronJobs []CronJobInfo
	for _, cj := range cronJobList.Items {
		cronJobs = append(cronJobs, h.convertToCronJobInfo(&cj))
	}

	if searchName != "" {
		var filtered []CronJobInfo
		searchLower := strings.ToLower(searchName)
		for _, cj := range cronJobs {
			if strings.Contains(strings.ToLower(cj.Name), searchLower) {
				filtered = append(filtered, cj)
			}
		}
		cronJobs = filtered
	}

	sort.Slice(cronJobs, func(i, j int) bool {
		return cronJobs[i].CreatedAt.After(cronJobs[j].CreatedAt)
	})

	total := len(cronJobs)
	start := (page - 1) * pageSize
	end := start + pageSize
	if start > total {
		start = total
	}
	if end > total {
		end = total
	}
	pagedCronJobs := cronJobs[start:end]

	c.JSON(http.StatusOK, gin.H{
		"code":    200,
		"message": "success",
		"data": gin.H{
			"items":    pagedCronJobs,
			"total":    total,
			"page":     page,
			"pageSize": pageSize,
		},
	})
}

func (h *CronJobHandler) GetCronJob(c *gin.Context) {
	clusterId := c.Param("clusterID")
	namespace := c.Param("namespace")
	name := c.Param("name")

	logger.Info("获取CronJob详情: %s/%s/%s", clusterId, namespace, name)

	clusterID := parseClusterID(clusterId)
	cluster, err := h.clusterService.GetCluster(clusterID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"code": 404, "message": "集群不存在"})
		return
	}

	var k8sClient *services.K8sClient
	if cluster.KubeconfigEnc != "" {
		k8sClient, err = services.NewK8sClientFromKubeconfig(cluster.KubeconfigEnc)
	} else {
		k8sClient, err = services.NewK8sClientFromToken(cluster.APIServer, cluster.SATokenEnc, cluster.CAEnc)
	}
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"code": 500, "message": "创建K8s客户端失败: " + err.Error()})
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	clientset := k8sClient.GetClientset()
	cronJob, err := clientset.BatchV1().CronJobs(namespace).Get(ctx, name, metav1.GetOptions{})
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"code": 404, "message": "CronJob不存在: " + err.Error()})
		return
	}

	// 获取关联的Jobs
	jobs, err := clientset.BatchV1().Jobs(namespace).List(ctx, metav1.ListOptions{})
	if err != nil {
		logger.Error("获取CronJob关联Jobs失败", "error", err)
	}

	c.JSON(http.StatusOK, gin.H{
		"code":    200,
		"message": "success",
		"data": gin.H{
			"workload": h.convertToCronJobInfo(cronJob),
			"raw":      cronJob,
			"jobs":     jobs,
		},
	})
}

func (h *CronJobHandler) GetCronJobNamespaces(c *gin.Context) {
	clusterId := c.Param("clusterID")
	clusterID := parseClusterID(clusterId)
	cluster, err := h.clusterService.GetCluster(clusterID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"code": 404, "message": "集群不存在"})
		return
	}

	var k8sClient *services.K8sClient
	if cluster.KubeconfigEnc != "" {
		k8sClient, err = services.NewK8sClientFromKubeconfig(cluster.KubeconfigEnc)
	} else {
		k8sClient, err = services.NewK8sClientFromToken(cluster.APIServer, cluster.SATokenEnc, cluster.CAEnc)
	}
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"code": 500, "message": "创建K8s客户端失败: " + err.Error()})
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	clientset := k8sClient.GetClientset()
	cronJobList, err := clientset.BatchV1().CronJobs("").List(ctx, metav1.ListOptions{})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"code": 500, "message": "获取CronJob列表失败: " + err.Error()})
		return
	}

	nsCount := make(map[string]int)
	for _, cj := range cronJobList.Items {
		nsCount[cj.Namespace]++
	}

	type NamespaceInfo struct {
		Name  string `json:"name"`
		Count int    `json:"count"`
	}

	var namespaces []NamespaceInfo
	for ns, count := range nsCount {
		namespaces = append(namespaces, NamespaceInfo{Name: ns, Count: count})
	}

	sort.Slice(namespaces, func(i, j int) bool {
		return namespaces[i].Name < namespaces[j].Name
	})

	c.JSON(http.StatusOK, gin.H{"code": 200, "message": "success", "data": namespaces})
}

func (h *CronJobHandler) ApplyYAML(c *gin.Context) {
	clusterId := c.Param("clusterID")
	var req YAMLApplyRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"code": 400, "message": "参数错误: " + err.Error()})
		return
	}

	logger.Info("应用CronJob YAML: cluster=%s, dryRun=%v", clusterId, req.DryRun)

	clusterID := parseClusterID(clusterId)
	cluster, err := h.clusterService.GetCluster(clusterID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"code": 404, "message": "集群不存在"})
		return
	}

	var k8sClient *services.K8sClient
	if cluster.KubeconfigEnc != "" {
		k8sClient, err = services.NewK8sClientFromKubeconfig(cluster.KubeconfigEnc)
	} else {
		k8sClient, err = services.NewK8sClientFromToken(cluster.APIServer, cluster.SATokenEnc, cluster.CAEnc)
	}
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"code": 500, "message": "创建K8s客户端失败: " + err.Error()})
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	var objMap map[string]interface{}
	if err := yaml.Unmarshal([]byte(req.YAML), &objMap); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"code": 400, "message": "YAML格式错误: " + err.Error()})
		return
	}

	if objMap["apiVersion"] == nil || objMap["kind"] == nil {
		c.JSON(http.StatusBadRequest, gin.H{"code": 400, "message": "YAML缺少必要字段: apiVersion 或 kind"})
		return
	}

	kind := objMap["kind"].(string)
	if kind != "CronJob" {
		c.JSON(http.StatusBadRequest, gin.H{"code": 400, "message": "YAML类型错误，期望CronJob，实际为: " + kind})
		return
	}

	metadata, ok := objMap["metadata"].(map[string]interface{})
	if !ok {
		c.JSON(http.StatusBadRequest, gin.H{"code": 400, "message": "YAML缺少 metadata 字段"})
		return
	}

	name, _ := metadata["name"].(string)
	namespace, _ := metadata["namespace"].(string)
	if namespace == "" {
		namespace = "default"
	}

	result, err := h.applyYAML(ctx, k8sClient, req.YAML, namespace, req.DryRun)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"code": 500, "message": "YAML应用失败: " + err.Error()})
		return
	}

	if !req.DryRun {
		auditLog := models.AuditLog{
			UserID:       1,
			Action:       "apply_yaml",
			ResourceType: "cronjob",
			ResourceRef:  fmt.Sprintf(`{"cluster_id":"%s","namespace":"%s","name":"%s"}`, clusterId, namespace, name),
			Result:       "success",
			Details:      fmt.Sprintf("应用CronJob YAML: %s/%s", namespace, name),
		}
		h.db.Create(&auditLog)
	}

	c.JSON(http.StatusOK, gin.H{"code": 200, "message": "YAML应用成功", "data": result})
}

func (h *CronJobHandler) DeleteCronJob(c *gin.Context) {
	clusterId := c.Param("clusterID")
	namespace := c.Param("namespace")
	name := c.Param("name")

	logger.Info("删除CronJob: %s/%s/%s", clusterId, namespace, name)

	clusterID := parseClusterID(clusterId)
	cluster, err := h.clusterService.GetCluster(clusterID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"code": 404, "message": "集群不存在"})
		return
	}

	var k8sClient *services.K8sClient
	if cluster.KubeconfigEnc != "" {
		k8sClient, err = services.NewK8sClientFromKubeconfig(cluster.KubeconfigEnc)
	} else {
		k8sClient, err = services.NewK8sClientFromToken(cluster.APIServer, cluster.SATokenEnc, cluster.CAEnc)
	}
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"code": 500, "message": "创建K8s客户端失败: " + err.Error()})
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	clientset := k8sClient.GetClientset()
	err = clientset.BatchV1().CronJobs(namespace).Delete(ctx, name, metav1.DeleteOptions{})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"code": 500, "message": "删除失败: " + err.Error()})
		return
	}

	auditLog := models.AuditLog{
		UserID:       1,
		Action:       "delete_cronjob",
		ResourceType: "cronjob",
		ResourceRef:  fmt.Sprintf(`{"cluster_id":"%s","namespace":"%s","name":"%s"}`, clusterId, namespace, name),
		Result:       "success",
		Details:      fmt.Sprintf("删除CronJob: %s/%s", namespace, name),
	}
	h.db.Create(&auditLog)

	c.JSON(http.StatusOK, gin.H{"code": 200, "message": "删除成功"})
}

func (h *CronJobHandler) convertToCronJobInfo(cj *batchv1.CronJob) CronJobInfo {
	status := "Active"
	if cj.Spec.Suspend != nil && *cj.Spec.Suspend {
		status = "Suspended"
	}

	suspend := false
	if cj.Spec.Suspend != nil {
		suspend = *cj.Spec.Suspend
	}

	var lastScheduleTime *time.Time
	if cj.Status.LastScheduleTime != nil {
		t := cj.Status.LastScheduleTime.Time
		lastScheduleTime = &t
	}

	return CronJobInfo{
		ID:               fmt.Sprintf("%s/%s", cj.Namespace, cj.Name),
		Name:             cj.Name,
		Namespace:        cj.Namespace,
		Type:             "CronJob",
		Status:           status,
		Schedule:         cj.Spec.Schedule,
		Suspend:          suspend,
		Active:           len(cj.Status.Active),
		LastScheduleTime: lastScheduleTime,
		Labels:           cj.Labels,
		Annotations:      cj.Annotations,
		CreatedAt:        cj.CreationTimestamp.Time,
	}
}

func (h *CronJobHandler) applyYAML(ctx context.Context, k8sClient *services.K8sClient, yamlContent string, namespace string, dryRun bool) (interface{}, error) {
	decode := serializer.NewCodecFactory(scheme.Scheme).UniversalDeserializer().Decode
	obj, _, err := decode([]byte(yamlContent), nil, nil)
	if err != nil {
		return nil, fmt.Errorf("解析YAML失败: %w", err)
	}

	cronJob, ok := obj.(*batchv1.CronJob)
	if !ok {
		return nil, fmt.Errorf("无法转换为CronJob类型")
	}

	clientset := k8sClient.GetClientset()
	var dryRunOpt []string
	if dryRun {
		dryRunOpt = []string{metav1.DryRunAll}
	}

	existing, err := clientset.BatchV1().CronJobs(cronJob.Namespace).Get(ctx, cronJob.Name, metav1.GetOptions{})
	if err == nil {
		cronJob.ResourceVersion = existing.ResourceVersion
		result, err := clientset.BatchV1().CronJobs(cronJob.Namespace).Update(ctx, cronJob, metav1.UpdateOptions{DryRun: dryRunOpt})
		if err != nil {
			return nil, err
		}
		return result, nil
	}

	result, err := clientset.BatchV1().CronJobs(cronJob.Namespace).Create(ctx, cronJob, metav1.CreateOptions{DryRun: dryRunOpt})
	if err != nil {
		return nil, err
	}
	return result, nil
}

