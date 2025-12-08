package services

import (
	"encoding/json"
	"fmt"
	"time"

	"kubepolaris/internal/models"
	"kubepolaris/pkg/logger"

	"gorm.io/gorm"
)

// StoredCluster 存储的集群信息结构体
type StoredCluster struct {
	ID            string            `json:"id"`
	Name          string            `json:"name"`
	Description   string            `json:"description"`
	ApiServer     string            `json:"apiServer"`
	Version       string            `json:"version"`
	Status        string            `json:"status"`
	Labels        map[string]string `json:"labels"`
	CreatedAt     time.Time         `json:"createdAt"`
	LastHeartbeat time.Time         `json:"lastHeartbeat"`
}

// ClusterService 集群服务
type ClusterService struct {
	db *gorm.DB
}

// NewClusterService 创建集群服务
func NewClusterService(db *gorm.DB) *ClusterService {
	return &ClusterService{db: db}
}

// CreateCluster 创建集群
func (s *ClusterService) CreateCluster(cluster *models.Cluster) error {
	// 设置创建时间
	cluster.CreatedAt = time.Now()
	cluster.UpdatedAt = time.Now()
	cluster.LastHeartbeat = &cluster.CreatedAt

	// 确保 MonitoringConfig 是有效的 JSON，避免 MySQL JSON 字段报错
	if cluster.MonitoringConfig == "" {
		cluster.MonitoringConfig = "{}"
	}
	// 验证 MonitoringConfig 是否为有效的 JSON
	if cluster.MonitoringConfig != "" {
		var testJSON interface{}
		if err := json.Unmarshal([]byte(cluster.MonitoringConfig), &testJSON); err != nil {
			// 如果不是有效的 JSON，设置为空对象
			cluster.MonitoringConfig = "{}"
		}
	}

	// 保存到数据库
	if err := s.db.Create(cluster).Error; err != nil {
		logger.Error("创建集群失败", "error", err)
		return fmt.Errorf("创建集群失败: %w", err)
	}

	logger.Info("集群创建成功", "id", cluster.ID, "name", cluster.Name)
	return nil
}

// GetCluster 获取单个集群
func (s *ClusterService) GetCluster(id uint) (*models.Cluster, error) {
	var cluster models.Cluster
	if err := s.db.First(&cluster, id).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			return nil, fmt.Errorf("集群不存在: %d", id)
		}
		return nil, fmt.Errorf("获取集群失败: %w", err)
	}
	return &cluster, nil
}

// GetAllClusters 获取所有集群
func (s *ClusterService) GetAllClusters() ([]*models.Cluster, error) {
	var clusters []*models.Cluster
	if err := s.db.Find(&clusters).Error; err != nil {
		logger.Error("获取集群列表失败", "error", err)
		return nil, fmt.Errorf("获取集群列表失败: %w", err)
	}
	return clusters, nil
}

// UpdateClusterStatus 更新集群状态
func (s *ClusterService) UpdateClusterStatus(id uint, status string, version string) error {
	now := time.Now()
	result := s.db.Model(&models.Cluster{}).Where("id = ?", id).Updates(map[string]interface{}{
		"status":         status,
		"version":        version,
		"last_heartbeat": &now,
		"updated_at":     now,
	})

	if result.Error != nil {
		return fmt.Errorf("更新集群状态失败: %w", result.Error)
	}

	if result.RowsAffected == 0 {
		return fmt.Errorf("集群不存在: %d", id)
	}

	return nil
}

// DeleteCluster 删除集群
func (s *ClusterService) DeleteCluster(id uint) error {
	result := s.db.Delete(&models.Cluster{}, id)
	if result.Error != nil {
		return fmt.Errorf("删除集群失败: %w", result.Error)
	}

	if result.RowsAffected == 0 {
		return fmt.Errorf("集群不存在: %d", id)
	}

	logger.Info("集群删除成功", "id", id)
	return nil
}

// GetClusterStats 获取集群统计信息
func (s *ClusterService) GetClusterStats() (*models.ClusterStats, error) {
	var stats models.ClusterStats
	var totalCount, healthyCount, unhealthyCount int64

	// 统计总集群数
	if err := s.db.Model(&models.Cluster{}).Count(&totalCount).Error; err != nil {
		return nil, fmt.Errorf("统计总集群数失败: %w", err)
	}
	stats.TotalClusters = int(totalCount)

	// 统计健康集群数
	if err := s.db.Model(&models.Cluster{}).Where("status = ?", "healthy").Count(&healthyCount).Error; err != nil {
		return nil, fmt.Errorf("统计健康集群数失败: %w", err)
	}
	stats.HealthyClusters = int(healthyCount)

	// 统计异常集群数
	if err := s.db.Model(&models.Cluster{}).Where("status = ?", "unhealthy").Count(&unhealthyCount).Error; err != nil {
		return nil, fmt.Errorf("统计异常集群数失败: %w", err)
	}
	stats.UnhealthyClusters = int(unhealthyCount)

	// 获取所有集群的实时指标统计
	var clusters []*models.Cluster
	if err := s.db.Find(&clusters).Error; err != nil {
		logger.Error("获取集群列表失败", "error", err)
		return &stats, nil // 返回基础统计，不因为指标获取失败而整体失败
	}

	// 统计总节点数和就绪节点数
	totalNodes := 0
	readyNodes := 0
	totalPods := 0
	runningPods := 0

	for _, cluster := range clusters {
		// 获取集群的实时指标
		if metrics := s.getClusterRealTimeMetrics(cluster); metrics != nil {
			totalNodes += metrics.NodeCount
			readyNodes += metrics.ReadyNodes
			totalPods += metrics.PodCount
			runningPods += metrics.RunningPods
		}
	}

	stats.TotalNodes = totalNodes
	stats.ReadyNodes = readyNodes
	stats.TotalPods = totalPods
	stats.RunningPods = runningPods

	return &stats, nil
}

// getClusterRealTimeMetrics 获取集群实时指标
func (s *ClusterService) getClusterRealTimeMetrics(cluster *models.Cluster) *models.ClusterMetrics {
	// 如果没有连接信息，返回空指标
	if cluster.KubeconfigEnc == "" && cluster.SATokenEnc == "" {
		return nil
	}

	var k8sClient *K8sClient
	var err error

	// 根据存储的信息创建客户端
	if cluster.KubeconfigEnc != "" {
		k8sClient, err = NewK8sClientFromKubeconfig(cluster.KubeconfigEnc)
	} else if cluster.SATokenEnc != "" {
		k8sClient, err = NewK8sClientFromToken(cluster.APIServer, cluster.SATokenEnc, cluster.CAEnc)
	}

	if err != nil {
		logger.Error("创建K8s客户端失败", "cluster", cluster.Name, "error", err)
		return nil
	}

	// 获取集群信息
	clusterInfo, err := k8sClient.TestConnection()
	if err != nil {
		logger.Error("获取集群信息失败", "cluster", cluster.Name, "error", err)
		return nil
	}

	// 创建指标对象
	metrics := &models.ClusterMetrics{
		ClusterID:   cluster.ID,
		NodeCount:   clusterInfo.NodeCount,
		ReadyNodes:  clusterInfo.ReadyNodes,
		PodCount:    0, // TODO: 实现Pod统计
		RunningPods: 0, // TODO: 实现运行中Pod统计
		CPUUsage:    0, // TODO: 实现CPU使用率统计
		MemoryUsage: 0, // TODO: 实现内存使用率统计
		UpdatedAt:   time.Now(),
	}

	return metrics
}

// UpdateClusterMetrics 更新集群指标到数据库
func (s *ClusterService) UpdateClusterMetrics(clusterID uint, metrics *models.ClusterMetrics) error {
	// 使用UPSERT操作，如果记录存在则更新，不存在则插入
	return s.db.Save(metrics).Error
}

// GetClusterMetrics 获取集群指标
func (s *ClusterService) GetClusterMetrics(clusterID uint) (*models.ClusterMetrics, error) {
	var metrics models.ClusterMetrics
	if err := s.db.Where("cluster_id = ?", clusterID).First(&metrics).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			return nil, nil // 没有找到指标记录，返回nil而不是错误
		}
		return nil, fmt.Errorf("获取集群指标失败: %w", err)
	}
	return &metrics, nil
}

// ConvertToStoredCluster 将数据库模型转换为存储格式
func (s *ClusterService) ConvertToStoredCluster(cluster *models.Cluster) *StoredCluster {
	var labels map[string]string
	if cluster.Labels != "" {
		json.Unmarshal([]byte(cluster.Labels), &labels)
	}
	if labels == nil {
		labels = make(map[string]string)
	}

	stored := &StoredCluster{
		ID:          fmt.Sprintf("%d", cluster.ID),
		Name:        cluster.Name,
		Description: "", // 数据库模型中没有description字段，可以后续添加
		ApiServer:   cluster.APIServer,
		Version:     cluster.Version,
		Status:      cluster.Status,
		Labels:      labels,
		CreatedAt:   cluster.CreatedAt,
	}

	if cluster.LastHeartbeat != nil {
		stored.LastHeartbeat = *cluster.LastHeartbeat
	}

	return stored
}

// ConvertFromStoredCluster 将存储格式转换为数据库模型
func (s *ClusterService) ConvertFromStoredCluster(stored *StoredCluster) *models.Cluster {
	labelsJSON := ""
	if len(stored.Labels) > 0 {
		if data, err := json.Marshal(stored.Labels); err == nil {
			labelsJSON = string(data)
		}
	}

	cluster := &models.Cluster{
		Name:      stored.Name,
		APIServer: stored.ApiServer,
		Version:   stored.Version,
		Status:    stored.Status,
		Labels:    labelsJSON,
		CreatedAt: stored.CreatedAt,
	}

	if !stored.LastHeartbeat.IsZero() {
		cluster.LastHeartbeat = &stored.LastHeartbeat
	}

	return cluster
}
