import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button, Select, Space, Tag, message } from 'antd';
import {
  ArrowLeftOutlined,
  ClusterOutlined,
  CodeOutlined,
} from '@ant-design/icons';
import type { Cluster } from '../types';
import { clusterService } from '../services/clusterService';
import { usePermission } from '../hooks/usePermission';
import { getPermissionTypeName, getPermissionTypeColor } from '../services/permissionService';

const { Option } = Select;

const ClusterSelector: React.FC = () => {
  const { id, clusterId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useTranslation();
  const [clusters, setClusters] = useState<Cluster[]>([]);
  const { getPermissionType, setCurrentClusterId, canWrite } = usePermission();

  const currentClusterId = clusterId || id;

  const permissionType = currentClusterId ? getPermissionType(currentClusterId) : null;
  const hasWritePermission = currentClusterId ? canWrite(currentClusterId) : false;

  useEffect(() => {
    if (currentClusterId) {
      setCurrentClusterId(currentClusterId);
    }
  }, [currentClusterId, setCurrentClusterId]);

  const openTerminal = () => {
    if (currentClusterId) {
      window.open(`/clusters/${currentClusterId}/terminal`);
    } else {
      message.error(t('menu.cannotGetClusterId'));
    }
  };

  const fetchClusters = useCallback(async () => {
    try {
      const response = await clusterService.getClusters();
      setClusters(response.items || []);
    } catch (error) {
      console.error('Failed to fetch clusters:', error);
    }
  }, []);

  useEffect(() => {
    fetchClusters();
  }, [fetchClusters]);

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '16px', justifyContent: 'space-between', width: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
        <Button
          type="text"
          icon={<ArrowLeftOutlined />}
          onClick={() => navigate('/clusters')}
          style={{ marginRight: 16 }}
        >
          {t('menu.backToClusterList')}
        </Button>
        <ClusterOutlined style={{ color: '#1890ff' }} />
        <span>{t('menu.currentCluster')}</span>

        <Select
          value={currentClusterId}
          style={{ minWidth: 200 }}
          onChange={(newClusterId) => {
            const currentPath = location.pathname;
            const newPath = currentPath.replace(/\/clusters\/[^/]+/, `/clusters/${newClusterId}`);
            navigate(newPath);
          }}
        >
          {clusters.map(cluster => (
            <Option key={cluster.id} value={cluster.id.toString()}>
              {cluster.name}
            </Option>
          ))}
        </Select>
        {permissionType && (
          <Tag color={getPermissionTypeColor(permissionType)} style={{ marginLeft: 8 }}>
            {getPermissionTypeName(permissionType)}
          </Tag>
        )}
        {!hasWritePermission && permissionType && (
          <span style={{ color: '#ff4d4f', fontSize: '12px' }}>
            {t('menu.readonlyMode')}
          </span>
        )}
      </div>
      <Space size="middle">
        <Button
          type="text"
          icon={<CodeOutlined />}
          onClick={() => openTerminal()}
          disabled={!hasWritePermission}
          title={!hasWritePermission ? t('menu.readonlyNoTerminal') : undefined}
        >
          {t('menu.kubectlTerminal')}
        </Button>
      </Space>
    </div>
  );
};

export default React.memo(ClusterSelector);
