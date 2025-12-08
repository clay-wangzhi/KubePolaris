package models

import (
	"time"

	"gorm.io/gorm"
)

// Cluster 集群模型
type Cluster struct {
	ID            uint           `json:"id" gorm:"primaryKey"`
	Name          string         `json:"name" gorm:"uniqueIndex;not null;size:100"`
	APIServer     string         `json:"api_server" gorm:"not null;size:255"`
	KubeconfigEnc string         `json:"-" gorm:"type:text"` // 加密存储的 kubeconfig
	CAEnc         string         `json:"-" gorm:"type:text"` // 加密存储的 CA 证书
	SATokenEnc    string         `json:"-" gorm:"type:text"` // 加密存储的 SA Token
	Version       string         `json:"version" gorm:"size:50"`
	Status        string         `json:"status" gorm:"default:unknown;size:20"` // healthy, unhealthy, unknown
	Labels        string         `json:"labels" gorm:"type:json"`               // JSON 格式存储标签
	CertExpireAt  *time.Time     `json:"cert_expire_at"`
	LastHeartbeat *time.Time     `json:"last_heartbeat"`
	CreatedBy     uint           `json:"created_by"`
	CreatedAt     time.Time      `json:"created_at"`
	UpdatedAt     time.Time      `json:"updated_at"`
	DeletedAt     gorm.DeletedAt `json:"-" gorm:"index"`

	// 监控配置
	MonitoringConfig string `json:"monitoring_config" gorm:"type:json"` // JSON 格式存储监控配置

	// 关联关系
	Creator         User              `json:"creator" gorm:"foreignKey:CreatedBy"`
	TerminalSession []TerminalSession `json:"terminal_sessions" gorm:"foreignKey:ClusterID"`
}

// ClusterStats 集群统计信息
type ClusterStats struct {
	TotalClusters     int `json:"total_clusters"`
	HealthyClusters   int `json:"healthy_clusters"`
	UnhealthyClusters int `json:"unhealthy_clusters"`
	TotalNodes        int `json:"total_nodes"`
	ReadyNodes        int `json:"ready_nodes"`
	TotalPods         int `json:"total_pods"`
	RunningPods       int `json:"running_pods"`
}

// ClusterMetrics 集群实时指标
type ClusterMetrics struct {
	ClusterID    uint      `json:"cluster_id" gorm:"primaryKey"`
	NodeCount    int       `json:"node_count"`
	ReadyNodes   int       `json:"ready_nodes"`
	PodCount     int       `json:"pod_count"`
	RunningPods  int       `json:"running_pods"`
	CPUUsage     float64   `json:"cpu_usage"`
	MemoryUsage  float64   `json:"memory_usage"`
	StorageUsage float64   `json:"storage_usage"`
	UpdatedAt    time.Time `json:"updated_at"`

	// 关联关系
	Cluster Cluster `json:"cluster" gorm:"foreignKey:ClusterID"`
}

// MonitoringConfig 监控配置
type MonitoringConfig struct {
	Type     string                 `json:"type"`     // prometheus, victoriametrics, disabled
	Endpoint string                 `json:"endpoint"` // 监控数据源地址
	Auth     *MonitoringAuth        `json:"auth,omitempty"`
	Labels   map[string]string      `json:"labels,omitempty"` // 用于统一数据源的集群标签
	Options  map[string]interface{} `json:"options,omitempty"`
}

// MonitoringAuth 监控认证配置
type MonitoringAuth struct {
	Type     string `json:"type"` // none, basic, bearer, mtls
	Username string `json:"username,omitempty"`
	Password string `json:"password,omitempty"`
	Token    string `json:"token,omitempty"`
	CertFile string `json:"cert_file,omitempty"`
	KeyFile  string `json:"key_file,omitempty"`
	CAFile   string `json:"ca_file,omitempty"`
}

// MetricsQuery 监控查询参数
type MetricsQuery struct {
	Query   string            `json:"query"`
	Start   int64             `json:"start"`
	End     int64             `json:"end"`
	Step    string            `json:"step"`
	Timeout string            `json:"timeout,omitempty"`
	Labels  map[string]string `json:"labels,omitempty"`
}

// MetricsResponse 监控查询响应
type MetricsResponse struct {
	Status string      `json:"status"`
	Data   MetricsData `json:"data"`
}

// MetricsData 监控数据
type MetricsData struct {
	ResultType string          `json:"resultType"`
	Result     []MetricsResult `json:"result"`
}

// MetricsResult 监控结果
type MetricsResult struct {
	Metric map[string]string `json:"metric"`
	Values [][]interface{}   `json:"values,omitempty"`
	Value  []interface{}     `json:"value,omitempty"`
}

// ClusterMetricsData 集群监控数据
type ClusterMetricsData struct {
	CPU     *MetricSeries   `json:"cpu,omitempty"`
	Memory  *MetricSeries   `json:"memory,omitempty"`
	Network *NetworkMetrics `json:"network,omitempty"`
	Storage *MetricSeries   `json:"storage,omitempty"`
	Pods    *PodMetrics     `json:"pods,omitempty"`
	// Pod 级别的扩展监控指标
	CPURequest        *MetricSeries   `json:"cpu_request,omitempty"`         // CPU 请求值（固定）
	CPULimit          *MetricSeries   `json:"cpu_limit,omitempty"`           // CPU 限制值（固定）
	MemoryRequest     *MetricSeries   `json:"memory_request,omitempty"`      // 内存请求值（固定）
	MemoryLimit       *MetricSeries   `json:"memory_limit,omitempty"`        // 内存限制值（固定）
	ProbeFailures     *MetricSeries   `json:"probe_failures,omitempty"`      // 健康检查失败次数
	ContainerRestarts *MetricSeries   `json:"container_restarts,omitempty"`  // 容器重启次数
	NetworkPPS        *NetworkPPS     `json:"network_pps,omitempty"`         // 网络PPS（包/秒）
	Threads           *MetricSeries   `json:"threads,omitempty"`             // 线程数
	NetworkDrops      *NetworkDrops   `json:"network_drops,omitempty"`       // 网卡丢包情况
	CPUThrottling     *MetricSeries   `json:"cpu_throttling,omitempty"`      // CPU 限流比例
	CPUThrottlingTime *MetricSeries   `json:"cpu_throttling_time,omitempty"` // CPU 限流时间
	DiskIOPS          *DiskIOPS       `json:"disk_iops,omitempty"`           // 磁盘 IOPS
	DiskThroughput    *DiskThroughput `json:"disk_throughput,omitempty"`     // 磁盘吞吐量
	CPUUsageAbsolute  *MetricSeries   `json:"cpu_usage_absolute,omitempty"`  // CPU 实际使用量（cores）
	MemoryUsageBytes  *MetricSeries   `json:"memory_usage_bytes,omitempty"`  // 内存实际使用量（bytes）
	OOMKills          *MetricSeries   `json:"oom_kills,omitempty"`           // OOM Kill 次数

	// 集群级别监控指标
	ClusterOverview *ClusterOverview `json:"cluster_overview,omitempty"` // 集群概览
	NodeList        []NodeMetricItem `json:"node_list,omitempty"`        // Node列表指标

	// 工作负载多Pod监控指标（显示多条曲线）
	CPUMulti               *MultiSeriesMetric `json:"cpu_multi,omitempty"`                 // CPU使用率（多Pod）
	MemoryMulti            *MultiSeriesMetric `json:"memory_multi,omitempty"`              // 内存使用率（多Pod）
	ContainerRestartsMulti *MultiSeriesMetric `json:"container_restarts_multi,omitempty"`  // 容器重启次数（多Pod）
	OOMKillsMulti          *MultiSeriesMetric `json:"oom_kills_multi,omitempty"`           // OOM Kill 次数（多Pod）
	ProbeFailuresMulti     *MultiSeriesMetric `json:"probe_failures_multi,omitempty"`      // 健康检查失败次数（多Pod）
	NetworkPPSMulti        *MultiSeriesMetric `json:"network_pps_multi,omitempty"`         // 网络PPS（多Pod）
	ThreadsMulti           *MultiSeriesMetric `json:"threads_multi,omitempty"`             // 线程数（多Pod）
	NetworkDropsMulti      *MultiSeriesMetric `json:"network_drops_multi,omitempty"`       // 网卡丢包情况（多Pod）
	CPUThrottlingMulti     *MultiSeriesMetric `json:"cpu_throttling_multi,omitempty"`      // CPU 限流比例（多Pod）
	CPUThrottlingTimeMulti *MultiSeriesMetric `json:"cpu_throttling_time_multi,omitempty"` // CPU 限流时间（多Pod）
	DiskIOPSMulti          *MultiSeriesMetric `json:"disk_iops_multi,omitempty"`           // 磁盘 IOPS（多Pod）
	DiskThroughputMulti    *MultiSeriesMetric `json:"disk_throughput_multi,omitempty"`     // 磁盘吞吐量（多Pod）
}

// MetricSeries 指标时间序列
type MetricSeries struct {
	Current float64     `json:"current"`
	Series  []DataPoint `json:"series"`
}

// DataPoint 数据点
type DataPoint struct {
	Timestamp int64   `json:"timestamp"`
	Value     float64 `json:"value"`
}

// NetworkMetrics 网络指标
type NetworkMetrics struct {
	In  *MetricSeries `json:"in"`
	Out *MetricSeries `json:"out"`
}

// PodMetrics Pod指标
type PodMetrics struct {
	Total   int `json:"total"`
	Running int `json:"running"`
	Pending int `json:"pending"`
	Failed  int `json:"failed"`
}

// ContainerSubnetIPs 容器子网IP信息
type ContainerSubnetIPs struct {
	TotalIPs     int `json:"total_ips"`
	UsedIPs      int `json:"used_ips"`
	AvailableIPs int `json:"available_ips"`
}

// NetworkPPS 网络PPS指标
type NetworkPPS struct {
	In  *MetricSeries `json:"in"`  // 入站PPS
	Out *MetricSeries `json:"out"` // 出站PPS
}

// NetworkDrops 网卡丢包指标
type NetworkDrops struct {
	Receive  *MetricSeries `json:"receive"`  // 接收丢包
	Transmit *MetricSeries `json:"transmit"` // 发送丢包
}

// DiskIOPS 磁盘IOPS指标
type DiskIOPS struct {
	Read  *MetricSeries `json:"read"`  // 读IOPS
	Write *MetricSeries `json:"write"` // 写IOPS
}

// DiskThroughput 磁盘吞吐量指标
type DiskThroughput struct {
	Read  *MetricSeries `json:"read"`  // 读吞吐量（bytes/s）
	Write *MetricSeries `json:"write"` // 写吞吐量（bytes/s）
}

// MultiSeriesDataPoint 多时间序列数据点（支持多个Pod/实例）
type MultiSeriesDataPoint struct {
	Timestamp int64              `json:"timestamp"`
	Values    map[string]float64 `json:"values"` // key为pod名称，value为对应值
}

// MultiSeriesMetric 多时间序列指标（用于展示多个Pod的数据）
type MultiSeriesMetric struct {
	Series []MultiSeriesDataPoint `json:"series"` // 时间序列数据
}

// ClusterOverview 集群概览监控指标
type ClusterOverview struct {
	// 资源总量
	TotalCPUCores float64 `json:"total_cpu_cores"` // CPU 总核数
	TotalMemory   float64 `json:"total_memory"`    // 内存总数（bytes）

	// 资源使用
	CPUUsageRate    *MetricSeries `json:"cpu_usage_rate,omitempty"`    // CPU 使用率
	MemoryUsageRate *MetricSeries `json:"memory_usage_rate,omitempty"` // 内存使用率

	// Pod 相关
	MaxPods       int     `json:"max_pods"`       // Pod 最大可创建数
	CreatedPods   int     `json:"created_pods"`   // Pod 已创建数
	AvailablePods int     `json:"available_pods"` // Pod 可创建数
	PodUsageRate  float64 `json:"pod_usage_rate"` // Pod 使用率

	// 集群状态
	EtcdHasLeader         bool    `json:"etcd_has_leader"`        // Etcd 是否有 leader
	ApiServerAvailability float64 `json:"apiserver_availability"` // ApiServer 近30天可用率

	// 资源配额
	CPURequestRatio *MetricSeries `json:"cpu_request_ratio,omitempty"` // CPU Request 比值
	CPULimitRatio   *MetricSeries `json:"cpu_limit_ratio,omitempty"`   // CPU Limit 比值
	MemRequestRatio *MetricSeries `json:"mem_request_ratio,omitempty"` // 内存 Request 比值
	MemLimitRatio   *MetricSeries `json:"mem_limit_ratio,omitempty"`   // 内存 Limit 比值

	// ApiServer 请求量
	ApiServerRequestRate *MetricSeries `json:"apiserver_request_rate,omitempty"` // ApiServer 总请求量
}

// NodeMetricItem Node 监控指标项
type NodeMetricItem struct {
	NodeName        string  `json:"node_name"`         // 节点名称
	CPUUsageRate    float64 `json:"cpu_usage_rate"`    // CPU 使用率
	MemoryUsageRate float64 `json:"memory_usage_rate"` // 内存使用率
	CPUCores        float64 `json:"cpu_cores"`         // CPU 核数
	TotalMemory     float64 `json:"total_memory"`      // 总内存（bytes）
	Status          string  `json:"status"`            // 节点状态
}

