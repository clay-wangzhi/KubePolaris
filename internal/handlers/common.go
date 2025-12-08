package handlers

import "strconv"

// ScaleRequest 扩缩容请求
type ScaleRequest struct {
	Replicas int32 `json:"replicas" binding:"required,min=0"`
}

// YAMLApplyRequest YAML应用请求
type YAMLApplyRequest struct {
	YAML   string `json:"yaml" binding:"required"`
	DryRun bool   `json:"dryRun"`
}

// parseClusterID 解析集群ID字符串为uint
func parseClusterID(clusterIDStr string) uint {
	if id, err := strconv.ParseUint(clusterIDStr, 10, 32); err == nil {
		return uint(id)
	}
	return 0
}

