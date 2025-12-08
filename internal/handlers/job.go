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
	"k8s.io/apimachinery/pkg/labels"
	"k8s.io/apimachinery/pkg/runtime/serializer"
	"k8s.io/apimachinery/pkg/util/yaml"
	"k8s.io/client-go/kubernetes/scheme"
)

type JobHandler struct {
	db             *gorm.DB
	cfg            *config.Config
	clusterService *services.ClusterService
	k8sMgr         *k8s.ClusterInformerManager
}

func NewJobHandler(db *gorm.DB, cfg *config.Config, clusterService *services.ClusterService, k8sMgr *k8s.ClusterInformerManager) *JobHandler {
	return &JobHandler{db: db, cfg: cfg, clusterService: clusterService, k8sMgr: k8sMgr}
}

type JobInfo struct {
	ID             string            `json:"id"`
	Name           string            `json:"name"`
	Namespace      string            `json:"namespace"`
	Type           string            `json:"type"`
	Status         string            `json:"status"`
	Completions    int32             `json:"completions"`
	Parallelism    int32             `json:"parallelism"`
	Succeeded      int32             `json:"succeeded"`
	Failed         int32             `json:"failed"`
	Active         int32             `json:"active"`
	StartTime      *time.Time        `json:"startTime"`
	CompletionTime *time.Time        `json:"completionTime"`
	Labels         map[string]string `json:"labels"`
	Annotations    map[string]string `json:"annotations"`
	CreatedAt      time.Time         `json:"createdAt"`
	Images         []string          `json:"images"`
}

func (h *JobHandler) ListJobs(c *gin.Context) {
	clusterId := c.Param("clusterID")
	namespace := c.Query("namespace")
	searchName := c.Query("search")
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("pageSize", "20"))

	logger.Info("获取Job列表: cluster=%s, namespace=%s, search=%s", clusterId, namespace, searchName)

	clusterID := parseClusterID(clusterId)
	cluster, err := h.clusterService.GetCluster(clusterID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"code": 404, "message": "集群不存在"})
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	if _, err := h.k8sMgr.EnsureAndWait(ctx, cluster, 5*time.Second); err != nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"code": 503, "message": "informer 未就绪: " + err.Error()})
		return
	}

	var jobs []JobInfo
	sel := labels.Everything()

	if namespace != "" {
		js, err := h.k8sMgr.JobsLister(cluster.ID).Jobs(namespace).List(sel)
		if err != nil {
			logger.Error("读取Job缓存失败", "error", err)
		} else {
			for _, j := range js {
				jobs = append(jobs, h.convertToJobInfo(j))
			}
		}
	} else {
		js, err := h.k8sMgr.JobsLister(cluster.ID).List(sel)
		if err != nil {
			logger.Error("读取Job缓存失败", "error", err)
		} else {
			for _, j := range js {
				jobs = append(jobs, h.convertToJobInfo(j))
			}
		}
	}

	if searchName != "" {
		var filtered []JobInfo
		searchLower := strings.ToLower(searchName)
		for _, j := range jobs {
			if strings.Contains(strings.ToLower(j.Name), searchLower) {
				filtered = append(filtered, j)
			}
		}
		jobs = filtered
	}

	sort.Slice(jobs, func(i, j int) bool {
		return jobs[i].CreatedAt.After(jobs[j].CreatedAt)
	})

	total := len(jobs)
	start := (page - 1) * pageSize
	end := start + pageSize
	if start > total {
		start = total
	}
	if end > total {
		end = total
	}
	pagedJobs := jobs[start:end]

	c.JSON(http.StatusOK, gin.H{
		"code":    200,
		"message": "success",
		"data": gin.H{
			"items":    pagedJobs,
			"total":    total,
			"page":     page,
			"pageSize": pageSize,
		},
	})
}

func (h *JobHandler) GetJob(c *gin.Context) {
	clusterId := c.Param("clusterID")
	namespace := c.Param("namespace")
	name := c.Param("name")

	logger.Info("获取Job详情: %s/%s/%s", clusterId, namespace, name)

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
	job, err := clientset.BatchV1().Jobs(namespace).Get(ctx, name, metav1.GetOptions{})
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"code": 404, "message": "Job不存在: " + err.Error()})
		return
	}

	pods, err := clientset.CoreV1().Pods(namespace).List(ctx, metav1.ListOptions{
		LabelSelector: metav1.FormatLabelSelector(job.Spec.Selector),
	})
	if err != nil {
		logger.Error("获取Job关联Pods失败", "error", err)
	}

	c.JSON(http.StatusOK, gin.H{
		"code":    200,
		"message": "success",
		"data": gin.H{
			"workload": h.convertToJobInfo(job),
			"raw":      job,
			"pods":     pods,
		},
	})
}

func (h *JobHandler) GetJobNamespaces(c *gin.Context) {
	clusterId := c.Param("clusterID")
	clusterID := parseClusterID(clusterId)
	cluster, err := h.clusterService.GetCluster(clusterID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"code": 404, "message": "集群不存在"})
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	if _, err := h.k8sMgr.EnsureAndWait(ctx, cluster, 5*time.Second); err != nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"code": 503, "message": "informer 未就绪: " + err.Error()})
		return
	}

	sel := labels.Everything()
	js, err := h.k8sMgr.JobsLister(cluster.ID).List(sel)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"code": 500, "message": "读取Job缓存失败: " + err.Error()})
		return
	}

	nsCount := make(map[string]int)
	for _, j := range js {
		nsCount[j.Namespace]++
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

func (h *JobHandler) ApplyYAML(c *gin.Context) {
	clusterId := c.Param("clusterID")
	var req YAMLApplyRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"code": 400, "message": "参数错误: " + err.Error()})
		return
	}

	logger.Info("应用Job YAML: cluster=%s, dryRun=%v", clusterId, req.DryRun)

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
	if kind != "Job" {
		c.JSON(http.StatusBadRequest, gin.H{"code": 400, "message": "YAML类型错误，期望Job，实际为: " + kind})
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
			ResourceType: "job",
			ResourceRef:  fmt.Sprintf(`{"cluster_id":"%s","namespace":"%s","name":"%s"}`, clusterId, namespace, name),
			Result:       "success",
			Details:      fmt.Sprintf("应用Job YAML: %s/%s", namespace, name),
		}
		h.db.Create(&auditLog)
	}

	c.JSON(http.StatusOK, gin.H{"code": 200, "message": "YAML应用成功", "data": result})
}

func (h *JobHandler) DeleteJob(c *gin.Context) {
	clusterId := c.Param("clusterID")
	namespace := c.Param("namespace")
	name := c.Param("name")

	logger.Info("删除Job: %s/%s/%s", clusterId, namespace, name)

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
	err = clientset.BatchV1().Jobs(namespace).Delete(ctx, name, metav1.DeleteOptions{})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"code": 500, "message": "删除失败: " + err.Error()})
		return
	}

	auditLog := models.AuditLog{
		UserID:       1,
		Action:       "delete_job",
		ResourceType: "job",
		ResourceRef:  fmt.Sprintf(`{"cluster_id":"%s","namespace":"%s","name":"%s"}`, clusterId, namespace, name),
		Result:       "success",
		Details:      fmt.Sprintf("删除Job: %s/%s", namespace, name),
	}
	h.db.Create(&auditLog)

	c.JSON(http.StatusOK, gin.H{"code": 200, "message": "删除成功"})
}

func (h *JobHandler) convertToJobInfo(j *batchv1.Job) JobInfo {
	status := "Running"
	if j.Status.Succeeded > 0 {
		status = "Completed"
	} else if j.Status.Failed > 0 {
		status = "Failed"
	}

	var images []string
	for _, container := range j.Spec.Template.Spec.Containers {
		images = append(images, container.Image)
	}

	completions := int32(0)
	if j.Spec.Completions != nil {
		completions = *j.Spec.Completions
	}

	parallelism := int32(0)
	if j.Spec.Parallelism != nil {
		parallelism = *j.Spec.Parallelism
	}

	var startTime *time.Time
	if j.Status.StartTime != nil {
		t := j.Status.StartTime.Time
		startTime = &t
	}

	var completionTime *time.Time
	if j.Status.CompletionTime != nil {
		t := j.Status.CompletionTime.Time
		completionTime = &t
	}

	return JobInfo{
		ID:             fmt.Sprintf("%s/%s", j.Namespace, j.Name),
		Name:           j.Name,
		Namespace:      j.Namespace,
		Type:           "Job",
		Status:         status,
		Completions:    completions,
		Parallelism:    parallelism,
		Succeeded:      j.Status.Succeeded,
		Failed:         j.Status.Failed,
		Active:         j.Status.Active,
		StartTime:      startTime,
		CompletionTime: completionTime,
		Labels:         j.Labels,
		Annotations:    j.Annotations,
		CreatedAt:      j.CreationTimestamp.Time,
		Images:         images,
	}
}

func (h *JobHandler) applyYAML(ctx context.Context, k8sClient *services.K8sClient, yamlContent string, namespace string, dryRun bool) (interface{}, error) {
	decode := serializer.NewCodecFactory(scheme.Scheme).UniversalDeserializer().Decode
	obj, _, err := decode([]byte(yamlContent), nil, nil)
	if err != nil {
		return nil, fmt.Errorf("解析YAML失败: %w", err)
	}

	job, ok := obj.(*batchv1.Job)
	if !ok {
		return nil, fmt.Errorf("无法转换为Job类型")
	}

	clientset := k8sClient.GetClientset()
	var dryRunOpt []string
	if dryRun {
		dryRunOpt = []string{metav1.DryRunAll}
	}

	existing, err := clientset.BatchV1().Jobs(job.Namespace).Get(ctx, job.Name, metav1.GetOptions{})
	if err == nil {
		job.ResourceVersion = existing.ResourceVersion
		result, err := clientset.BatchV1().Jobs(job.Namespace).Update(ctx, job, metav1.UpdateOptions{DryRun: dryRunOpt})
		if err != nil {
			return nil, err
		}
		return result, nil
	}

	result, err := clientset.BatchV1().Jobs(job.Namespace).Create(ctx, job, metav1.CreateOptions{DryRun: dryRunOpt})
	if err != nil {
		return nil, err
	}
	return result, nil
}

