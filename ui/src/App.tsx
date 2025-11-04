/** genAI_main_start */
import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { ConfigProvider, App as AntdApp } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import MainLayout from './layouts/MainLayout';
import ClusterList from './pages/cluster/ClusterList';
import ClusterDetail from './pages/cluster/ClusterDetail';
import ClusterImport from './pages/cluster/ClusterImport';
import NodeList from './pages/node/NodeList';
import NodeDetail from './pages/node/NodeDetail';
import PodList from './pages/pod/PodList';
import PodDetail from './pages/pod/PodDetail';
import PodLogs from './pages/pod/PodLogs';
import PodTerminal from './pages/pod/PodTerminal';
import WorkloadList from './pages/workload/WorkloadList';
import WorkloadDetail from './pages/workload/WorkloadDetail';
import YAMLEditor from './pages/yaml/YAMLEditor';
import GlobalSearch from './pages/search/GlobalSearch';
import KubectlTerminalPage from './pages/terminal/kubectlTerminal';
import { ConfigSecretManagement, ConfigMapDetail, SecretDetail } from './pages/config';
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
              <Route path="clusters/:clusterId/workloads/:namespace/:name" element={<WorkloadDetail />} />
              <Route path="clusters/:clusterId/yaml/apply" element={<YAMLEditor />} />
              <Route path="workloads" element={<WorkloadList />} />
              <Route path="workloads/:type/:namespace/:name" element={<WorkloadDetail />} />
              <Route path="search" element={<GlobalSearch />} />
              {/* 配置与密钥路由 */}
              <Route path="clusters/:clusterId/configs" element={<ConfigSecretManagement />} />
              <Route path="clusters/:clusterId/configs/configmap/:namespace/:name" element={<ConfigMapDetail />} />
              <Route path="clusters/:clusterId/configs/secret/:namespace/:name" element={<SecretDetail />} />
            </Route>
          </Routes>
        </Router>
      </AntdApp>
    </ConfigProvider>
  );
};

export default App;
/** genAI_main_end */