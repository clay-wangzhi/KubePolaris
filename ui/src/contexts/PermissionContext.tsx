import React, { useState, useEffect, useCallback, useMemo, type ReactNode } from 'react';
import type { MyPermissionsResponse, PermissionType } from '../types';
import permissionService from '../services/permissionService';
import { tokenManager } from '../services/authService';
import { PermissionContext, type PermissionContextType } from './PermissionContext';

// 权限Provider组件
export const PermissionProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [clusterPermissions, setClusterPermissions] = useState<Map<number, MyPermissionsResponse>>(new Map());
  const [currentClusterPermission, setCurrentClusterPermission] = useState<MyPermissionsResponse | null>(null);
  const [currentClusterId, setCurrentClusterIdState] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);

  // 加载用户权限
  const refreshPermissions = useCallback(async () => {
    if (!tokenManager.isLoggedIn()) {
      setClusterPermissions(new Map());
      setCurrentClusterPermission(null);
      return;
    }

    setLoading(true);
    try {
      const response = await permissionService.getMyPermissions();
      const permissions = response || [];
      
      const permMap = new Map<number, MyPermissionsResponse>();
      permissions.forEach((p) => {
        permMap.set(p.cluster_id, p);
      });
      
      setClusterPermissions(permMap);
      
      // 更新当前集群权限
      if (currentClusterId) {
        setCurrentClusterPermission(permMap.get(currentClusterId) || null);
      }
    } catch (error) {
      console.error('加载权限失败:', error);
    } finally {
      setLoading(false);
    }
  }, [currentClusterId]);

  // 设置当前集群
  const setCurrentClusterId = useCallback((clusterId: number | string | null) => {
    if (clusterId === null) {
      setCurrentClusterIdState(null);
      setCurrentClusterPermission(null);
      return;
    }
    
    const id = typeof clusterId === 'string' ? parseInt(clusterId, 10) : clusterId;
    setCurrentClusterIdState(id);
    setCurrentClusterPermission(clusterPermissions.get(id) || null);
  }, [clusterPermissions]);

  // 检查是否有集群访问权限
  const hasClusterAccess = useCallback((clusterId: number | string): boolean => {
    const id = typeof clusterId === 'string' ? parseInt(clusterId, 10) : clusterId;
    return clusterPermissions.has(id);
  }, [clusterPermissions]);

  // 检查是否有命名空间访问权限
  const hasNamespaceAccess = useCallback((clusterId: number | string, namespace: string): boolean => {
    const id = typeof clusterId === 'string' ? parseInt(clusterId, 10) : clusterId;
    const permission = clusterPermissions.get(id);
    if (!permission) return false;
    
    const namespaces = permission.namespaces;
    if (namespaces.includes('*')) return true;
    if (namespaces.includes(namespace)) return true;
    
    // 检查通配符匹配
    for (const ns of namespaces) {
      if (ns.endsWith('*') && namespace.startsWith(ns.slice(0, -1))) {
        return true;
      }
    }
    
    return false;
  }, [clusterPermissions]);

  // 检查是否可以执行操作
  const canPerformAction = useCallback((action: string, clusterId?: number | string): boolean => {
    let permission: MyPermissionsResponse | null = null;
    
    if (clusterId) {
      const id = typeof clusterId === 'string' ? parseInt(clusterId, 10) : clusterId;
      permission = clusterPermissions.get(id) || null;
    } else {
      permission = currentClusterPermission;
    }
    
    if (!permission) return false;
    
    const type = permission.permission_type;
    
    switch (type) {
      case 'admin':
        return true;
      case 'ops': {
        // 运维权限：排除节点操作和存储管理
        const restrictedOps = ['node:cordon', 'node:uncordon', 'node:drain', 'pv:create', 'pv:delete'];
        return !restrictedOps.includes(action);
      }
      case 'dev': {
        // 开发权限：只能操作工作负载相关
        const allowedDev = ['pod:', 'deployment:', 'statefulset:', 'service:', 'configmap:', 'secret:'];
        return allowedDev.some(prefix => action.startsWith(prefix)) || action === 'view';
      }
      case 'readonly':
        return action === 'view' || action === 'list' || action === 'get';
      case 'custom':
        return true; // 自定义权限由 K8s RBAC 控制
      default:
        return false;
    }
  }, [clusterPermissions, currentClusterPermission]);

  // 检查是否是管理员
  const isAdmin = useCallback((clusterId?: number | string): boolean => {
    let permission: MyPermissionsResponse | null = null;
    
    if (clusterId) {
      const id = typeof clusterId === 'string' ? parseInt(clusterId, 10) : clusterId;
      permission = clusterPermissions.get(id) || null;
    } else {
      permission = currentClusterPermission;
    }
    
    return permission?.permission_type === 'admin';
  }, [clusterPermissions, currentClusterPermission]);

  // 检查是否是只读
  const isReadonly = useCallback((clusterId?: number | string): boolean => {
    let permission: MyPermissionsResponse | null = null;
    
    if (clusterId) {
      const id = typeof clusterId === 'string' ? parseInt(clusterId, 10) : clusterId;
      permission = clusterPermissions.get(id) || null;
    } else {
      permission = currentClusterPermission;
    }
    
    return permission?.permission_type === 'readonly';
  }, [clusterPermissions, currentClusterPermission]);

  // 检查是否有写权限（非只读权限）
  const canWrite = useCallback((clusterId?: number | string): boolean => {
    let permission: MyPermissionsResponse | null = null;
    
    if (clusterId) {
      const id = typeof clusterId === 'string' ? parseInt(clusterId, 10) : clusterId;
      permission = clusterPermissions.get(id) || null;
    } else {
      permission = currentClusterPermission;
    }
    
    if (!permission) return false;
    
    // 只读权限无法执行写操作
    return permission.permission_type !== 'readonly';
  }, [clusterPermissions, currentClusterPermission]);

  // 获取权限类型
  const getPermissionType = useCallback((clusterId: number | string): PermissionType | null => {
    const id = typeof clusterId === 'string' ? parseInt(clusterId, 10) : clusterId;
    const permission = clusterPermissions.get(id);
    return permission?.permission_type || null;
  }, [clusterPermissions]);

  // 获取允许访问的命名空间列表
  const getAllowedNamespaces = useCallback((clusterId?: number | string): string[] => {
    let permission: MyPermissionsResponse | null = null;
    
    if (clusterId) {
      const id = typeof clusterId === 'string' ? parseInt(clusterId, 10) : clusterId;
      permission = clusterPermissions.get(id) || null;
    } else {
      permission = currentClusterPermission;
    }
    
    if (!permission) return [];
    return permission.namespaces || ['*'];
  }, [clusterPermissions, currentClusterPermission]);

  // 检查是否有全部命名空间访问权限
  const hasAllNamespaceAccess = useCallback((clusterId?: number | string): boolean => {
    const namespaces = getAllowedNamespaces(clusterId);
    return namespaces.includes('*');
  }, [getAllowedNamespaces]);

  // 过滤命名空间列表，只返回用户有权限访问的
  const filterNamespaces = useCallback((namespaces: string[], clusterId?: number | string): string[] => {
    const allowedNamespaces = getAllowedNamespaces(clusterId);
    
    // 如果有全部权限，返回全部
    if (allowedNamespaces.includes('*')) {
      return namespaces;
    }
    
    // 过滤只保留有权限的命名空间
    return namespaces.filter(ns => {
      // 精确匹配
      if (allowedNamespaces.includes(ns)) {
        return true;
      }
      // 通配符匹配
      for (const allowed of allowedNamespaces) {
        if (allowed.endsWith('*')) {
          const prefix = allowed.slice(0, -1);
          if (ns.startsWith(prefix)) {
            return true;
          }
        }
      }
      return false;
    });
  }, [getAllowedNamespaces]);

  // 初始加载
  useEffect(() => {
    refreshPermissions();
  }, [refreshPermissions]);

  const value = useMemo<PermissionContextType>(() => ({
    clusterPermissions,
    currentClusterPermission,
    loading,
    hasClusterAccess,
    hasNamespaceAccess,
    canPerformAction,
    isAdmin,
    isReadonly,
    canWrite,
    getPermissionType,
    refreshPermissions,
    setCurrentClusterId,
    getAllowedNamespaces,
    hasAllNamespaceAccess,
    filterNamespaces,
  }), [
    clusterPermissions,
    currentClusterPermission,
    loading,
    hasClusterAccess,
    hasNamespaceAccess,
    canPerformAction,
    isAdmin,
    isReadonly,
    canWrite,
    getPermissionType,
    refreshPermissions,
    setCurrentClusterId,
    getAllowedNamespaces,
    hasAllNamespaceAccess,
    filterNamespaces,
  ]);

  return (
    <PermissionContext.Provider value={value}>
      {children}
    </PermissionContext.Provider>
  );
};

