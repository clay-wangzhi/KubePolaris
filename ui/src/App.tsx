import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { ConfigProvider, App as AntdApp } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import MainLayout from './layouts/MainLayout';
import ClusterList from './pages/cluster/ClusterList';
import ClusterDetail from './pages/cluster/ClusterDetail';
import ClusterImport from './pages/cluster/ClusterImport';
import ConfigCenter from './pages/cluster/ConfigCenter';
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
import './App.css';

const App: React.FC = () => {
  return (
    <ConfigProvider locale={zhCN}>
      <AntdApp>
        <Router>
          <Routes>
            <Route path="/" element={<MainLayout />}>
              <Route index element={<Navigate to="/clusters" replace />} />
              <Route path="clusters" element={<ClusterList />} />
              <Route path="clusters/:id/overview" element={<ClusterDetail />} />
              <Route path="clusters/:clusterId/config-center" element={<ConfigCenter />} />
              <Route path="clusters/import" element={<ClusterImport />} />
              <Route path="clusters/:id/terminal" element={<KubectlTerminalPage  />} />
              <Route path="clusters/:clusterId/nodes" element={<NodeList />} />
              <Route path="clusters/:clusterId/nodes/:nodeName" element={<NodeDetail />} />
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
            </Route>
          </Routes>
        </Router>
      </AntdApp>
    </ConfigProvider>
  );
};

export default App;
