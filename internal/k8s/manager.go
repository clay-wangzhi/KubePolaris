package k8s

import (
	"context"
	"fmt"
	"sync"
	"time"

	"kubepolaris/internal/models"
	"kubepolaris/internal/services"
	"kubepolaris/pkg/logger"

	"k8s.io/apimachinery/pkg/labels"
	"k8s.io/apimachinery/pkg/runtime/schema"
	"k8s.io/client-go/informers"
	"k8s.io/client-go/kubernetes"
	appsv1listers "k8s.io/client-go/listers/apps/v1"
	batchv1listers "k8s.io/client-go/listers/batch/v1"

	corev1listers "k8s.io/client-go/listers/core/v1"
	"k8s.io/client-go/tools/cache"

	rolloutsclientset "github.com/argoproj/argo-rollouts/pkg/client/clientset/versioned"
	rolloutsinformers "github.com/argoproj/argo-rollouts/pkg/client/informers/externalversions"
	rolloutslisters "github.com/argoproj/argo-rollouts/pkg/client/listers/rollouts/v1alpha1"
)

type ClusterRuntime struct {
	clientset *kubernetes.Clientset
	factory   informers.SharedInformerFactory

	startOnce sync.Once
	started   bool
	synced    bool

	stopCh   chan struct{}
	stopOnce sync.Once

	// Argo Rollouts typed informer (if CRD present)
	rolloutEnabled      bool
	rolloutsClientset   *rolloutsclientset.Clientset
	rolloutsFactory     rolloutsinformers.SharedInformerFactory
	rolloutInformer     cache.SharedIndexInformer
	rolloutLister       rolloutslisters.RolloutLister
	rolloutGroupVersion schema.GroupVersion
}

// ClusterInformerManager 统一管理各集群的 Informer 生命周期与缓存访问
type ClusterInformerManager struct {
	mu       sync.RWMutex
	clusters map[uint]*ClusterRuntime
}

func NewClusterInformerManager() *ClusterInformerManager {
	return &ClusterInformerManager{
		clusters: make(map[uint]*ClusterRuntime),
	}
}

// EnsureForCluster 确保指定集群的 informer 已创建并启动
func (m *ClusterInformerManager) EnsureForCluster(cluster *models.Cluster) (*ClusterRuntime, error) {
	m.mu.Lock()
	defer m.mu.Unlock()

	if rt, ok := m.clusters[cluster.ID]; ok {
		return rt, nil
	}

	// 使用已有封装创建 clientset（复用认证/容错逻辑）
	var kc *services.K8sClient
	var err error
	if cluster.KubeconfigEnc != "" {
		kc, err = services.NewK8sClientFromKubeconfig(cluster.KubeconfigEnc)
	} else {
		kc, err = services.NewK8sClientFromToken(cluster.APIServer, cluster.SATokenEnc, cluster.CAEnc)
	}
	if err != nil {
		return nil, fmt.Errorf("为集群创建客户端失败: %w", err)
	}

	clientset := kc.GetClientset()
	// resync 为 0 表示关闭周期性全量 Resync，降低压力
	factory := informers.NewSharedInformerFactory(clientset, 0)

	rt := &ClusterRuntime{
		clientset: clientset,
		factory:   factory,
		stopCh:    make(chan struct{}),
	}

	// 预创建需要的 informer（pods/nodes/ns/services/deployments）
	_ = factory.Core().V1().Pods().Informer()
	_ = factory.Core().V1().Nodes().Informer()
	_ = factory.Core().V1().Namespaces().Informer()
	_ = factory.Core().V1().Services().Informer()
	_ = factory.Apps().V1().Deployments().Informer()
	_ = factory.Apps().V1().StatefulSets().Informer()
	_ = factory.Apps().V1().DaemonSets().Informer()
	_ = factory.Batch().V1().Jobs().Informer()
	// _ = factory.Batch().V1beta1().CronJobs().Informer()

	// Detect and setup Argo Rollouts typed informer if CRD exists
	if gv, found := hasArgoRollouts(clientset); found {
		cfg := kc.GetRestConfig()
		if cfg != nil {
			if roc, err := rolloutsclientset.NewForConfig(cfg); err != nil {
				logger.Error("创建 Argo Rollouts client 失败", "error", err)
			} else {
				rt.rolloutsClientset = roc
				rt.rolloutsFactory = rolloutsinformers.NewSharedInformerFactory(roc, 0)
				informer := rt.rolloutsFactory.Argoproj().V1alpha1().Rollouts()
				rt.rolloutInformer = informer.Informer()
				rt.rolloutLister = informer.Lister()
				rt.rolloutGroupVersion = gv
				rt.rolloutEnabled = true
			}
		}
	}

	// 启动
	rt.startOnce.Do(func() {
		factory.Start(rt.stopCh)
		if rt.rolloutsFactory != nil {
			rt.rolloutsFactory.Start(rt.stopCh)
		}
		rt.started = true
	})

	m.clusters[cluster.ID] = rt
	return rt, nil
}

// waitForSync 等待本集群的缓存同步就绪（首次可能需要几十到数百毫秒，取决于资源规模）
func (m *ClusterInformerManager) waitForSync(ctx context.Context, rt *ClusterRuntime) bool {
	if rt.synced {
		return true
	}
	syncCh := make(chan struct{})
	go func() {
		// 等待需要的 Informer 同步
		syncedFuncs := []cache.InformerSynced{
			rt.factory.Core().V1().Pods().Informer().HasSynced,
			rt.factory.Core().V1().Nodes().Informer().HasSynced,
			rt.factory.Core().V1().Namespaces().Informer().HasSynced,
			rt.factory.Core().V1().Services().Informer().HasSynced,
			rt.factory.Apps().V1().Deployments().Informer().HasSynced,
			rt.factory.Apps().V1().StatefulSets().Informer().HasSynced,
			rt.factory.Apps().V1().DaemonSets().Informer().HasSynced,
			rt.factory.Batch().V1().Jobs().Informer().HasSynced,
			// rt.factory.Batch().V1beta1().CronJobs().Informer().HasSynced,  todo 后续兼容不同版本
		}
		if rt.rolloutEnabled && rt.rolloutInformer != nil {
			syncedFuncs = append(syncedFuncs, rt.rolloutInformer.HasSynced)
		}
		ok := cache.WaitForCacheSync(rt.stopCh, syncedFuncs...)
		if ok {
			rt.synced = true
		}
		close(syncCh)
	}()
	select {
	case <-ctx.Done():
		return false
	case <-syncCh:
		return rt.synced
	}
}

// GetOverviewSnapshot 从本地缓存即时汇总概览（不触发远端 List）
func (m *ClusterInformerManager) GetOverviewSnapshot(ctx context.Context, clusterID uint) (*OverviewSnapshot, error) {
	m.mu.RLock()
	rt, ok := m.clusters[clusterID]
	m.mu.RUnlock()
	if !ok {
		return nil, fmt.Errorf("集群 %d 未初始化 informer", clusterID)
	}

	// 等待缓存同步（给一个较短的时间窗以保护延迟）
	sctx, cancel := context.WithTimeout(ctx, 2*time.Second)
	defer cancel()
	if !m.waitForSync(sctx, rt) {
		return nil, fmt.Errorf("informer 缓存尚未就绪")
	}

	snap := &OverviewSnapshot{ClusterID: clusterID}

	// Pods
	pods, err := rt.factory.Core().V1().Pods().Lister().List(labels.Everything())
	if err != nil {
		return nil, fmt.Errorf("读取缓存 pods 失败: %w", err)
	}
	snap.Pods = len(pods)

	// Nodes
	nodes, err := rt.factory.Core().V1().Nodes().Lister().List(labels.Everything())
	if err != nil {
		return nil, fmt.Errorf("读取缓存 nodes 失败: %w", err)
	}
	snap.Nodes = len(nodes)

	// Namespaces
	namespaces, err := rt.factory.Core().V1().Namespaces().Lister().List(labels.Everything())
	if err != nil {
		return nil, fmt.Errorf("读取缓存 namespaces 失败: %w", err)
	}
	snap.Namespace = len(namespaces)

	// Deployments
	deploys, err := rt.factory.Apps().V1().Deployments().Lister().List(labels.Everything())
	if err != nil {
		logger.Error("读取缓存 deployments 失败", "error", err)
	} else {
		snap.Deployments = len(deploys)
	}

	// StatefulSets
	statefulsets, err := rt.factory.Apps().V1().StatefulSets().Lister().List(labels.Everything())
	if err != nil {
		logger.Error("读取缓存 statefulsets 失败", "error", err)
	} else {
		snap.StatefulSets = len(statefulsets)
	}

	// DaemonSets
	daemonsets, err := rt.factory.Apps().V1().DaemonSets().Lister().List(labels.Everything())
	if err != nil {
		logger.Error("读取缓存 daemonsets 失败", "error", err)
	} else {
		snap.DaemonSets = len(daemonsets)
	}

	// Jobs
	jobs, err := rt.factory.Batch().V1().Jobs().Lister().List(labels.Everything())
	if err != nil {
		logger.Error("读取缓存 jobs 失败", "error", err)
	} else {
		snap.Jobs = len(jobs)
	}

	// Rollouts
	if rt.rolloutEnabled && rt.rolloutLister != nil {
		rollouts, err := rt.rolloutLister.List(labels.Everything())
		if err != nil {
			logger.Error("读取缓存 rollouts 失败", "error", err)
		} else {
			snap.Rollouts = len(rollouts)
		}
	}

	return snap, nil
}

// EnsureAndWait 确保指定集群的 informer 启动并等待缓存同步
func (m *ClusterInformerManager) EnsureAndWait(ctx context.Context, cluster *models.Cluster, timeout time.Duration) (*ClusterRuntime, error) {
	rt, err := m.EnsureForCluster(cluster)
	if err != nil {
		return nil, err
	}
	wctx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()
	if !m.waitForSync(wctx, rt) {
		return nil, fmt.Errorf("informer 缓存尚未就绪")
	}
	return rt, nil
}

// PodsLister 返回 Pods 的 Lister
func (m *ClusterInformerManager) PodsLister(clusterID uint) corev1listers.PodLister {
	m.mu.RLock()
	defer m.mu.RUnlock()
	if rt, ok := m.clusters[clusterID]; ok {
		return rt.factory.Core().V1().Pods().Lister()
	}
	return nil
}

// NodesLister 返回 Nodes 的 Lister
func (m *ClusterInformerManager) NodesLister(clusterID uint) corev1listers.NodeLister {
	m.mu.RLock()
	defer m.mu.RUnlock()
	if rt, ok := m.clusters[clusterID]; ok {
		return rt.factory.Core().V1().Nodes().Lister()
	}
	return nil
}

// NamespacesLister 返回 Namespaces 的 Lister
func (m *ClusterInformerManager) NamespacesLister(clusterID uint) corev1listers.NamespaceLister {
	m.mu.RLock()
	defer m.mu.RUnlock()
	if rt, ok := m.clusters[clusterID]; ok {
		return rt.factory.Core().V1().Namespaces().Lister()
	}
	return nil
}

// ServicesLister 返回 Services 的 Lister
func (m *ClusterInformerManager) ServicesLister(clusterID uint) corev1listers.ServiceLister {
	m.mu.RLock()
	defer m.mu.RUnlock()
	if rt, ok := m.clusters[clusterID]; ok {
		return rt.factory.Core().V1().Services().Lister()
	}
	return nil
}

// DeploymentsLister 返回 Deployments 的 Lister
func (m *ClusterInformerManager) DeploymentsLister(clusterID uint) appsv1listers.DeploymentLister {
	m.mu.RLock()
	defer m.mu.RUnlock()
	if rt, ok := m.clusters[clusterID]; ok {
		return rt.factory.Apps().V1().Deployments().Lister()
	}
	return nil
}

// StatefulSetsLister 返回 StatefulSets 的 Lister
func (m *ClusterInformerManager) StatefulSetsLister(clusterID uint) appsv1listers.StatefulSetLister {
	m.mu.RLock()
	defer m.mu.RUnlock()
	if rt, ok := m.clusters[clusterID]; ok {
		return rt.factory.Apps().V1().StatefulSets().Lister()
	}
	return nil
}

// DaemonSetsLister 返回 DaemonSets 的 Lister
func (m *ClusterInformerManager) DaemonSetsLister(clusterID uint) appsv1listers.DaemonSetLister {
	m.mu.RLock()
	defer m.mu.RUnlock()
	if rt, ok := m.clusters[clusterID]; ok {
		return rt.factory.Apps().V1().DaemonSets().Lister()
	}
	return nil
}

// JobsLister 返回 Jobs 的 Lister
func (m *ClusterInformerManager) JobsLister(clusterID uint) batchv1listers.JobLister {
	m.mu.RLock()
	defer m.mu.RUnlock()
	if rt, ok := m.clusters[clusterID]; ok {
		return rt.factory.Batch().V1().Jobs().Lister()
	}
	return nil
}

// CronJobsLister 返回 CronJobs 的 Lister
// func (m *ClusterInformerManager) CronJobsLister(clusterID uint) batchv1beta1listers.CronJobLister {
// 	m.mu.RLock()
// 	defer m.mu.RUnlock()
// 	if rt, ok := m.clusters[clusterID]; ok {
// 		return rt.factory.Batch().V1beta1().CronJobs().Lister()
// 	}
// 	return nil
// }

// hasArgoRollouts 探测是否存在 argoproj.io 的 rollouts 资源，返回其 GroupVersion
func hasArgoRollouts(cs *kubernetes.Clientset) (schema.GroupVersion, bool) {
	groups, resources, err := cs.Discovery().ServerGroupsAndResources()
	_ = groups // 未直接使用
	if err != nil && len(resources) == 0 {
		return schema.GroupVersion{}, false
	}
	for _, rl := range resources {
		gv, err := schema.ParseGroupVersion(rl.GroupVersion)
		if err != nil {
			continue
		}
		if gv.Group == "argoproj.io" {
			for _, r := range rl.APIResources {
				if r.Name == "rollouts" {
					return gv, true
				}
			}
		}
	}
	return schema.GroupVersion{}, false
}

// RolloutsLister 返回 Argo Rollouts 的 GenericLister（若 CRD 存在）
func (m *ClusterInformerManager) RolloutsLister(clusterID uint) rolloutslisters.RolloutLister {
	m.mu.RLock()
	defer m.mu.RUnlock()
	if rt, ok := m.clusters[clusterID]; ok && rt.rolloutEnabled && rt.rolloutLister != nil {
		return rt.rolloutLister
	}
	return nil
}

// StopForCluster 停止指定集群的 informer（删除集群时调用）
func (m *ClusterInformerManager) StopForCluster(clusterID uint) {
	m.mu.Lock()
	rt, ok := m.clusters[clusterID]
	if ok {
		delete(m.clusters, clusterID)
	}
	m.mu.Unlock()

	if ok && rt != nil {
		logger.Info("停止集群 informer", "clusterID", clusterID)
		// 使用 sync.Once 确保只关闭一次，避免重复关闭导致 panic
		rt.stopOnce.Do(func() {
			close(rt.stopCh)
		})
		logger.Info("集群 informer 已停止", "clusterID", clusterID)
	}
}


// Stop 关闭所有集群的 informer（应用退出时调用）
func (m *ClusterInformerManager) Stop() {
	m.mu.Lock()
	defer m.mu.Unlock()
	for id, rt := range m.clusters {
		close(rt.stopCh)
		delete(m.clusters, id)
	}
}
