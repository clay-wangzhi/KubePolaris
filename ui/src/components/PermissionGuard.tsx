/**
 * 权限守卫组件
 * 用于保护需要特定权限才能访问的路由和组件
 */

import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { Result, Button, Spin } from 'antd';
import { useTranslation } from 'react-i18next';
import { tokenManager } from '../services/authService';
import { usePermission } from '../hooks/usePermission';
import { 
  isPlatformAdmin, 
  hasPermission, 
  ROUTE_PERMISSIONS, 
  CLUSTER_ROUTE_PERMISSIONS 
} from '../config/menuPermissions';
import type { PermissionType } from '../types';

interface PermissionGuardProps {
  children: React.ReactNode;
  platformAdminOnly?: boolean;
  requiredPermission?: PermissionType;
  fallback?: React.ReactNode;
}

/**
 * 权限守卫组件
 * 根据用户权限决定是否渲染子组件
 */
export const PermissionGuard: React.FC<PermissionGuardProps> = ({
  children,
  platformAdminOnly = false,
  requiredPermission,
  fallback,
}) => {
  const { t } = useTranslation('components');
  const currentUser = tokenManager.getUser();
  const { currentClusterPermission, clusterPermissions, loading } = usePermission();

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 200 }}>
        <Spin size="large" />
      </div>
    );
  }

  // 检查平台管理员权限
  if (platformAdminOnly) {
    const allPerms = Array.from(clusterPermissions.values());
    if (!isPlatformAdmin(currentUser?.username, allPerms)) {
      if (fallback) return <>{fallback}</>;
      return (
        <Result
          status="403"
          title={t('permissionGuard.noAccess')}
          subTitle={t('permissionGuard.platformAdminOnly')}
          extra={
            <Button type="primary" onClick={() => window.history.back()}>
              {t('permissionGuard.goBack')}
            </Button>
          }
        />
      );
    }
  }

  // 检查集群级别权限
  if (requiredPermission) {
    const userPermission = currentClusterPermission?.permission_type as PermissionType | undefined;
    if (!hasPermission(userPermission, requiredPermission)) {
      if (fallback) return <>{fallback}</>;
      return (
        <Result
          status="403"
          title={t('permissionGuard.insufficientPermission')}
          subTitle={t('permissionGuard.requirePermission', { permission: getPermissionLabel(requiredPermission, t) })}
          extra={
            <Button type="primary" onClick={() => window.history.back()}>
              {t('permissionGuard.goBack')}
            </Button>
          }
        />
      );
    }
  }

  return <>{children}</>;
};

/**
 * 平台管理员路由守卫
 */
export const PlatformAdminGuard: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const location = useLocation();
  const currentUser = tokenManager.getUser();
  const { clusterPermissions } = usePermission();

  const routeConfig = ROUTE_PERMISSIONS[location.pathname];
  const allPerms = Array.from(clusterPermissions.values());
  
  if (routeConfig?.platformAdminOnly && !isPlatformAdmin(currentUser?.username, allPerms)) {
    return <Navigate to="/overview" replace />;
  }

  return <>{children}</>;
};

/**
 * 集群权限路由守卫
 */
export const ClusterPermissionGuard: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { t } = useTranslation('components');
  const location = useLocation();
  const { currentClusterPermission, loading } = usePermission();

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 200 }}>
        <Spin size="large" />
      </div>
    );
  }

  const pathMatch = location.pathname.match(/\/clusters\/[^/]+(.+)/);
  const subPath = pathMatch ? pathMatch[1] : '';

  for (const [routePattern, requiredPermission] of Object.entries(CLUSTER_ROUTE_PERMISSIONS)) {
    if (subPath.startsWith(routePattern)) {
      const userPermission = currentClusterPermission?.permission_type as PermissionType | undefined;
      if (!hasPermission(userPermission, requiredPermission)) {
        return (
          <Result
            status="403"
            title={t('permissionGuard.insufficientPermission')}
            subTitle={t('permissionGuard.requirePermission', { permission: getPermissionLabel(requiredPermission, t) })}
            extra={
              <Button type="primary" onClick={() => window.history.back()}>
                {t('permissionGuard.goBack')}
              </Button>
            }
          />
        );
      }
      break;
    }
  }

  return <>{children}</>;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const getPermissionLabel = (type: PermissionType, t: any): string => {
  const labels: Record<PermissionType, string> = {
    admin: t('permissionGuard.adminPermission'),
    ops: t('permissionGuard.opsPermission'),
    dev: t('permissionGuard.devPermission'),
    readonly: t('permissionGuard.readonlyPermission'),
    custom: t('permissionGuard.customPermission'),
  };
  return labels[type] || type;
};

export default PermissionGuard;
