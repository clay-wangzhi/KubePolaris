import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { ConfigProvider, App as AntdApp } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import MainLayout from './layouts/MainLayout';
import ClusterList from './pages/cluster/ClusterList';
import ClusterDetail from './pages/cluster/ClusterDetail';
import ClusterImport from './pages/cluster/ClusterImport';
import ConfigCenter from './pages/cluster/ConfigCenter';
import ClusterUpgrade from './pages/cluster/ClusterUpgrade';
import NodeList from './pages/node/NodeList';
import NodeDetail from './pages/node/NodeDetail';
import PodList from './pages/pod/PodList';
import PodDetail from './pages/pod/PodDetail';
import PodLogs from './pages/pod/PodLogs';
import PodTerminal from './pages/pod/PodTerminal';
import WorkloadList from './pages/workload/WorkloadList';
import WorkloadDetail from './pages/workload/WorkloadDetail';
import DeploymentCreate from './pages/workload/DeploymentCreate';
import DeploymentDetail from './pages/workload/DeploymentDetail';
import RolloutDetail from './pages/workload/RolloutDetail';
import YAMLEditor from './pages/yaml/YAMLEditor';
import GlobalSearch from './pages/search/GlobalSearch';
import KubectlTerminalPage from './pages/terminal/kubectlTerminal';
import { ConfigSecretManagement, ConfigMapDetail, SecretDetail } from './pages/config';
import ConfigMapEdit from './pages/config/ConfigMapEdit';
import SecretEdit from './pages/config/SecretEdit';
import ConfigMapCreate from './pages/config/ConfigMapCreate';
import SecretCreate from './pages/config/SecretCreate';
import { NamespaceList, NamespaceDetail } from './pages/namespace';
import NetworkList from './pages/network/NetworkList';
import ServiceEdit from './pages/network/ServiceEdit';
import IngressEdit from './pages/network/IngressEdit';
import StorageList from './pages/storage/StorageList';
import Login from './pages/auth/Login';
import SystemSettings from './pages/settings/SystemSettings';
import UserProfile from './pages/profile/UserProfile';
import Overview from './pages/overview/Overview';
import { AlertCenter, GlobalAlertCenter } from './pages/alert';
import { CommandHistory, OperationLogs } from './pages/audit';
import { LogCenter, EventLogs } from './pages/logs';
import ArgoCDConfigPage from './pages/plugins/ArgoCDConfigPage';
import ArgoCDApplicationsPage from './pages/plugins/ArgoCDApplicationsPage';
import { PermissionManagement } from './pages/permission';
import { MonitoringCenter } from './pages/om';
import { PermissionProvider } from './contexts/PermissionContext';
import { tokenManager } from './services/authService';
import { PermissionGuard, ClusterPermissionGuard } from './components/PermissionGuard';
import './App.css';

// 认证保护组件
interface RequireAuthProps {
  children: React.ReactNode;
}

const RequireAuth: React.FC<RequireAuthProps> = ({ children }) => {
  const location = useLocation();
  
  if (!tokenManager.isLoggedIn()) {
    // 重定向到登录页，保存当前位置
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return <>{children}</>;
};

const App: React.FC = () => {
  return (
    <ConfigProvider locale={zhCN}>
      <AntdApp>
        <Router>
          <Routes>
            {/* 登录页面 - 不需要认证 */}
            <Route path="/login" element={<Login />} />
            
            {/* 受保护的路由 */}
            <Route path="/" element={
              <RequireAuth>
                <PermissionProvider>
                  <MainLayout />
                </PermissionProvider>
              </RequireAuth>
            }>
              <Route index element={<Navigate to="/overview" replace />} />
              <Route path="overview" element={<Overview />} />
              <Route path="clusters" element={<ClusterList />} />
              <Route path="clusters/:id/overview" element={<ClusterDetail />} />
              {/* 配置中心 - 需要运维权限 */}
              <Route path="clusters/:clusterId/config-center" element={
                <PermissionGuard requiredPermission="ops">
                  <ConfigCenter />
                </PermissionGuard>
              } />
              {/* 集群升级 - 需要管理员权限 */}
              <Route path="clusters/:clusterId/upgrade" element={
                <PermissionGuard requiredPermission="admin">
                  <ClusterUpgrade />
                </PermissionGuard>
              } />
              <Route path="clusters/import" element={<ClusterImport />} />
              <Route path="clusters/:id/terminal" element={<KubectlTerminalPage  />} />
              {/* 节点管理 - 需要运维权限 */}
              <Route path="clusters/:clusterId/nodes" element={
                <PermissionGuard requiredPermission="ops">
                  <NodeList />
                </PermissionGuard>
              } />
              <Route path="clusters/:clusterId/nodes/:nodeName" element={
                <PermissionGuard requiredPermission="ops">
                  <NodeDetail />
                </PermissionGuard>
              } />
              <Route path="nodes" element={<NodeList />} />
              <Route path="nodes/:id" element={<NodeDetail />} />
              <Route path="clusters/:clusterId/pods" element={<PodList />} />
              <Route path="clusters/:clusterId/pods/:namespace/:name" element={<PodDetail />} />
              <Route path="clusters/:clusterId/pods/:namespace/:name/logs" element={<PodLogs />} />
              <Route path="clusters/:clusterId/pods/:namespace/:name/terminal" element={<PodTerminal />} />
              <Route path="clusters/:clusterId/pods" element={<PodList />} />
              <Route path="clusters/:clusterId/pods/:namespace/:name" element={<PodDetail />} />
              <Route path="clusters/:clusterId/workloads" element={<WorkloadList />} />
              <Route path="clusters/:clusterId/workloads/create" element={<DeploymentCreate />} />
              <Route path="clusters/:clusterId/workloads/deployment/:namespace/:name" element={<DeploymentDetail />} />
              <Route path="clusters/:clusterId/workloads/rollout/:namespace/:name" element={<RolloutDetail />} />
              <Route path="clusters/:clusterId/workloads/:namespace/:name" element={<WorkloadDetail />} />
              <Route path="clusters/:clusterId/yaml/apply" element={<YAMLEditor />} />
              <Route path="workloads" element={<WorkloadList />} />
              <Route path="workloads/:type/:namespace/:name" element={<WorkloadDetail />} />
              <Route path="search" element={<GlobalSearch />} />
              {/* 全局告警中心路由 */}
              <Route path="alerts" element={<GlobalAlertCenter />} />
              {/* 命名空间路由 */}
              <Route path="clusters/:clusterId/namespaces" element={<NamespaceList />} />
              <Route path="clusters/:clusterId/namespaces/:namespace" element={<NamespaceDetail />} />
              {/* 配置与密钥路由 */}
              <Route path="clusters/:clusterId/configs" element={<ConfigSecretManagement />} />
              <Route path="clusters/:clusterId/configs/configmap/create" element={<ConfigMapCreate />} />
              <Route path="clusters/:clusterId/configs/configmap/:namespace/:name" element={<ConfigMapDetail />} />
              <Route path="clusters/:clusterId/configs/configmap/:namespace/:name/edit" element={<ConfigMapEdit />} />
              <Route path="clusters/:clusterId/configs/secret/create" element={<SecretCreate />} />
              <Route path="clusters/:clusterId/configs/secret/:namespace/:name" element={<SecretDetail />} />
              <Route path="clusters/:clusterId/configs/secret/:namespace/:name/edit" element={<SecretEdit />} />
              {/* 网络管理路由（Service和Ingress） */}
              <Route path="clusters/:clusterId/network" element={<NetworkList />} />
              <Route path="clusters/:clusterId/network/service/:namespace/:name/edit" element={<ServiceEdit />} />
              <Route path="clusters/:clusterId/network/ingress/:namespace/:name/edit" element={<IngressEdit />} />
              {/* 存储管理路由（PVC、PV、StorageClass） */}
              <Route path="clusters/:clusterId/storage" element={<StorageList />} />
              {/* 告警中心路由 */}
              <Route path="clusters/:clusterId/alerts" element={<AlertCenter />} />
              {/* 日志中心路由 */}
              <Route path="clusters/:clusterId/logs" element={<LogCenter />} />
              <Route path="clusters/:clusterId/logs/events" element={<EventLogs />} />
              {/* 监控中心路由 */}
              <Route path="clusters/:clusterId/monitoring" element={<MonitoringCenter />} />
              {/* ArgoCD 应用管理路由 - 需要运维权限 */}
              <Route path="clusters/:clusterId/plugins" element={
                <PermissionGuard requiredPermission="ops">
                  <ArgoCDApplicationsPage />
                </PermissionGuard>
              } />
              <Route path="clusters/:clusterId/argocd" element={
                <PermissionGuard requiredPermission="ops">
                  <ArgoCDApplicationsPage />
                </PermissionGuard>
              } />
              <Route path="clusters/:clusterId/argocd/config" element={
                <PermissionGuard requiredPermission="ops">
                  <ArgoCDConfigPage />
                </PermissionGuard>
              } />
              <Route path="clusters/:clusterId/argocd/applications" element={
                <PermissionGuard requiredPermission="ops">
                  <ArgoCDApplicationsPage />
                </PermissionGuard>
              } />
              {/* 审计管理路由 - 仅平台管理员 */}
              <Route path="audit/operations" element={
                <PermissionGuard platformAdminOnly>
                  <OperationLogs />
                </PermissionGuard>
              } />
              <Route path="audit/commands" element={
                <PermissionGuard platformAdminOnly>
                  <CommandHistory />
                </PermissionGuard>
              } />
              {/* 权限管理路由 - 仅平台管理员 */}
              <Route path="permissions" element={
                <PermissionGuard platformAdminOnly>
                  <PermissionManagement />
                </PermissionGuard>
              } />
              {/* 系统设置路由 - 仅平台管理员 */}
              <Route path="settings" element={
                <PermissionGuard platformAdminOnly>
                  <SystemSettings />
                </PermissionGuard>
              } />
              {/* 个人资料路由 */}
              <Route path="profile" element={<UserProfile />} />
            </Route>
          </Routes>
        </Router>
      </AntdApp>
    </ConfigProvider>
  );
};

export default App;
