import React, { useState, useEffect, useCallback } from 'react';
import { Outlet, useNavigate, useLocation, useParams } from 'react-router-dom';
import {
  Layout,
  Menu,
  Button,
  Badge,
  Dropdown,
  Avatar,
  Space,
  Select,
  message,
  Tag,
} from 'antd';
import {
  ClusterOutlined,
  DesktopOutlined,
  RocketOutlined,
  AppstoreOutlined,
  BellOutlined,
  UserOutlined,
  BarChartOutlined,
  SettingOutlined,
  FileTextOutlined,
  AlertOutlined,
  EyeOutlined,
  UploadOutlined,
  ApiOutlined,
  HddOutlined,
  KeyOutlined,
  TagsOutlined,
  ArrowLeftOutlined,
  CodeOutlined,
  ContainerOutlined,
  LogoutOutlined,
  HistoryOutlined,
  AuditOutlined,
  BranchesOutlined,
} from '@ant-design/icons';
import type { MenuProps as AntMenuProps } from 'antd';
import type {  Cluster, PermissionType } from '../types';
import { clusterService } from '../services/clusterService';
import SearchDropdown from '../components/SearchDropdown';
import { tokenManager } from '../services/authService';
import { usePermission } from '../contexts/PermissionContext';
import { getPermissionTypeName, getPermissionTypeColor } from '../services/permissionService';
import { 
  MAIN_MENU_PERMISSIONS, 
  CLUSTER_MENU_PERMISSIONS, 
  hasPermission, 
  isPlatformAdmin 
} from '../config/menuPermissions';


const { Header, Sider, Content } = Layout;

// 自定义滚动条和菜单样式
const scrollbarStyles = `
  .custom-scrollbar::-webkit-scrollbar {
    width: 6px;
  }
  
  .custom-scrollbar::-webkit-scrollbar-track {
    background: transparent;
  }
  
  .custom-scrollbar::-webkit-scrollbar-thumb {
    background-color: #d9d9d9;
    border-radius: 3px;
    transition: background-color 0.2s;
  }
  
  .custom-scrollbar::-webkit-scrollbar-thumb:hover {
    background-color: #bfbfbf;
  }
  
  .custom-scrollbar {
    scrollbar-width: thin;
    scrollbar-color: #d9d9d9 transparent;
  }
  
  .compact-menu .ant-menu-item {
    height: 32px !important;
    line-height: 1.2 !important;
    margin: 2px 0 !important;
    padding: 6px 12px !important;
    font-size: 13px !important;
  }
  
  .compact-menu .ant-menu-submenu-title {
    height: 32px !important;
    line-height: 1.2 !important;
    margin: 2px 0 !important;
    padding: 6px 12px !important;
    font-size: 13px !important;
  }
  
  .compact-menu .ant-menu-item-group-title {
    font-size: 12px !important;
    line-height: 1.2 !important;
    padding: 4px 12px !important;
  }
  
  .compact-menu .ant-menu-submenu .ant-menu-item {
    height: 28px !important;
    line-height: 1.2 !important;
    margin: 1px 0 !important;
    padding: 4px 12px 4px 32px !important;
    font-size: 12px !important;
  }
  
  .compact-menu .ant-menu-submenu-arrow {
    font-size: 10px !important;
  }
  
  .compact-menu .ant-menu-submenu-open > .ant-menu-submenu-title {
    background-color: transparent !important;
    color: rgba(0, 0, 0, 0.88) !important;
  }
  
  .compact-menu .ant-menu-submenu-open > .ant-menu-submenu-title:hover {
    background-color: #f5f5f5 !important;
  }
  
  .compact-menu .ant-menu-submenu-open .ant-menu-submenu-arrow {
    display: none !important;
  }
`;

// 注入样式
if (typeof document !== 'undefined') {
  const styleElement = document.createElement('style');
  styleElement.textContent = scrollbarStyles;
  if (!document.head.querySelector('style[data-scrollbar]')) {
    styleElement.setAttribute('data-scrollbar', 'true');
    document.head.appendChild(styleElement);
  }
}

type MenuItem = Required<AntMenuProps>['items'][number];

const MainLayout: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();

  // 判断是否在集群详情页面
  const isClusterDetailPage = () => {
    return location.pathname.match(/\/clusters\/[^/]+\//);
  };
  
  // 获取默认展开的菜单键
  const getDefaultOpenKeys = () => {
    if (isClusterDetailPage()) {
      return ['kubernetes-resources', 'cluster', 'cloud-native-observability', 'cloud-native-cost'];
    }
    // 主页面：如果当前在审计页面，默认展开审计管理
    if (location.pathname.startsWith('/audit')) {
      return ['audit-management'];
    }
    return [];
  };

  // 管理菜单展开状态
  const [openKeys, setOpenKeys] = useState<string[]>(getDefaultOpenKeys());

  // 当路由变化时，更新展开的菜单
  useEffect(() => {
    setOpenKeys(getDefaultOpenKeys());
  }, [location.pathname]);

  // 处理菜单展开/折叠
  const handleOpenChange = (keys: string[]) => {
    setOpenKeys(keys);
  };

  const getSelectedKeys = () => {
    const path = location.pathname;
    
    // 集群详情页面的路由匹配
    if (path.match(/\/clusters\/[^/]+\/overview/)) return ['cluster-overview'];
    if (path.match(/\/clusters\/[^/]+\/workloads/)) return ['k8s-workloads'];
    if (path.match(/\/clusters\/[^/]+\/pods/)) return ['k8s-pods'];
    if (path.match(/\/clusters\/[^/]+\/network/)) return ['k8s-network'];
    if (path.match(/\/clusters\/[^/]+\/services/)) return ['k8s-services'];
    if (path.match(/\/clusters\/[^/]+\/storage/)) return ['k8s-storage'];
    if (path.match(/\/clusters\/[^/]+\/configs/)) return ['k8s-configs'];
    if (path.match(/\/clusters\/[^/]+\/namespaces/)) return ['k8s-namespaces'];
    if (path.match(/\/clusters\/[^/]+\/nodes/)) return ['cluster-nodes'];
    if (path.match(/\/clusters\/[^/]+\/config-center/)) return ['cluster-config'];
    if (path.match(/\/clusters\/[^/]+\/upgrade/)) return ['cluster-upgrade'];
    if (path.match(/\/clusters\/[^/]+\/plugins/)) return ['cluster-plugins'];
    if (path.match(/\/clusters\/[^/]+\/monitoring/)) return ['observability-monitoring'];
    if (path.match(/\/clusters\/[^/]+\/logs/)) return ['observability-logs'];
    if (path.match(/\/clusters\/[^/]+\/alerts/)) return ['observability-alerts'];
    if (path.match(/\/clusters\/[^/]+\/cost-insights/)) return ['cost-insights'];
    
    // 主页面的路由匹配
    if (path === '/overview' || path === '/') return ['overview'];
    if (path.startsWith('/clusters') && !path.match(/\/clusters\/[^/]+\//)) return ['cluster-management'];
    if (path.startsWith('/permissions')) return ['permission-management'];
    if (path === '/audit/operations') return ['audit-operations'];
    if (path === '/audit/commands') return ['audit-commands'];
    if (path.startsWith('/audit')) return ['audit-operations'];
    if (path === '/alerts') return ['alert-center'];
    if (path.startsWith('/settings')) return ['system-settings'];
    
    return ['overview'];
  };

  // 主页面侧边栏菜单
  const mainMenuItems: MenuItem[] = [
    {
      key: 'overview',
      icon: <AppstoreOutlined />,
      label: '总览',
      onClick: () => navigate('/overview'),
    },
    {
      key: 'cluster-management',
      icon: <ClusterOutlined />,
      label: '集群管理',
      onClick: () => navigate('/clusters'),
    },
    {
      key: 'permission-management',
      icon: <KeyOutlined />,
      label: '权限管理',
      onClick: () => navigate('/permissions'),
    },
    {
      key: 'audit-management',
      icon: <AuditOutlined />,
      label: '审计管理',
      children: [
        {
          key: 'audit-operations',
          icon: <AuditOutlined />,
          label: '操作审计',
          onClick: () => navigate('/audit/operations'),
        },
        {
          key: 'audit-commands',
          icon: <HistoryOutlined />,
          label: '命令历史',
          onClick: () => navigate('/audit/commands'),
        },
      ],
    },
    {
      key: 'alert-center',
      icon: <AlertOutlined />,
      label: '告警中心',
      onClick: () => navigate('/alerts'),
    },
    {
      key: 'system-settings',
      icon: <SettingOutlined />,
      label: '系统设置',
      onClick: () => navigate('/settings'),
    },
  ];

  // 集群详情页侧边栏菜单
  const clusterDetailMenuItems: MenuItem[] = [
    {
      key: 'cluster-overview',
      label: '概览',
      onClick: () => {
        const clusterMatch = location.pathname.match(/\/clusters\/([^/]+)/);
        if (clusterMatch) {
          navigate(`/clusters/${clusterMatch[1]}/overview`);
        }
      },
    },
    {
      key: 'kubernetes-resources',
      label: 'Kubernetes资源',
      children: [
        {
          key: 'k8s-workloads',
          icon: <RocketOutlined />,
          label: '工作负载',
          onClick: () => {
            const clusterMatch = location.pathname.match(/\/clusters\/([^/]+)/);
            if (clusterMatch) {
              navigate(`/clusters/${clusterMatch[1]}/workloads`);
            }
          },
        },
        {
          key: 'k8s-pods',
          icon: <ContainerOutlined />,
          label: '容器组',
          onClick: () => {
            const clusterMatch = location.pathname.match(/\/clusters\/([^/]+)/);
            if (clusterMatch) {
              navigate(`/clusters/${clusterMatch[1]}/pods`);
            }
          },
        },
        {
          key: 'k8s-network',
          icon: <ApiOutlined />,
          label: '服务与路由',
          onClick: () => {
            const clusterMatch = location.pathname.match(/\/clusters\/([^/]+)/);
            if (clusterMatch) {
              navigate(`/clusters/${clusterMatch[1]}/network?tab=service`);
            }
          },
        },
        {
          key: 'k8s-storage',
          icon: <HddOutlined />,
          label: '存储',
          onClick: () => {
            const clusterMatch = location.pathname.match(/\/clusters\/([^/]+)/);
            if (clusterMatch) {
              navigate(`/clusters/${clusterMatch[1]}/storage`);
            }
          },
        },
        {
          key: 'k8s-configs',
          icon: <KeyOutlined />,
          label: '配置与密钥',
          onClick: () => {
            const clusterMatch = location.pathname.match(/\/clusters\/([^/]+)/);
            if (clusterMatch) {
              navigate(`/clusters/${clusterMatch[1]}/configs`);
            }
          },
        },
        {
          key: 'k8s-namespaces',
          icon: <TagsOutlined />,
          label: '命名空间',
          onClick: () => {
            const clusterMatch = location.pathname.match(/\/clusters\/([^/]+)/);
            if (clusterMatch) {
              navigate(`/clusters/${clusterMatch[1]}/namespaces`);
            }
          },
        },
      ],
    },
    {
      key: 'cluster',
      label: '集群',
      children: [
        {
          key: 'cluster-nodes',
          icon: <DesktopOutlined />,
          label: '节点管理',
          onClick: () => {
            const clusterMatch = location.pathname.match(/\/clusters\/([^/]+)/);
            if (clusterMatch) {
              navigate(`/clusters/${clusterMatch[1]}/nodes`);
            }
          },
        },
        {
          key: 'cluster-config',
          icon: <SettingOutlined />,
          label: '配置中心',
          onClick: () => {
            const clusterMatch = location.pathname.match(/\/clusters\/([^/]+)/);
            if (clusterMatch) {
              navigate(`/clusters/${clusterMatch[1]}/config-center`);
            }
          },
        },
        {
          key: 'cluster-upgrade',
          icon: <UploadOutlined />,
          label: '集群升级',
          onClick: () => {
            const clusterMatch = location.pathname.match(/\/clusters\/([^/]+)/);
            if (clusterMatch) {
              navigate(`/clusters/${clusterMatch[1]}/upgrade`);
            }
          },
        },
        {
          key: 'cluster-plugins',
          icon: <BranchesOutlined />,
          label: 'GitOps 应用',
          onClick: () => {
            const clusterMatch = location.pathname.match(/\/clusters\/([^/]+)/);
            if (clusterMatch) {
              navigate(`/clusters/${clusterMatch[1]}/plugins`);
            }
          },
        },
      ],
    },
    {
      key: 'cloud-native-observability',
      label: '云原生观测',
      children: [
        {
          key: 'observability-monitoring',
          icon: <BarChartOutlined />,
          label: '监控中心',
          onClick: () => {
            const clusterMatch = location.pathname.match(/\/clusters\/([^/]+)/);
            if (clusterMatch) {
              navigate(`/clusters/${clusterMatch[1]}/monitoring`);
            }
          },
        },
        {
          key: 'observability-logs',
          icon: <FileTextOutlined />,
          label: '日志中心',
          onClick: () => {
            const clusterMatch = location.pathname.match(/\/clusters\/([^/]+)/);
            if (clusterMatch) {
              navigate(`/clusters/${clusterMatch[1]}/logs`);
            }
          },
        },
        {
          key: 'observability-alerts',
          icon: <AlertOutlined />,
          label: '告警中心',
          onClick: () => {
            const clusterMatch = location.pathname.match(/\/clusters\/([^/]+)/);
            if (clusterMatch) {
              navigate(`/clusters/${clusterMatch[1]}/alerts`);
            }
          },
        },
      ],
    },
    {
      key: 'cloud-native-cost',
      label: '云原生成本治理',
      children: [
        {
          key: 'cost-insights',
          icon: <EyeOutlined />,
          label: '成本洞察',
          onClick: () => {
            const clusterMatch = location.pathname.match(/\/clusters\/([^/]+)/);
            if (clusterMatch) {
              navigate(`/clusters/${clusterMatch[1]}/cost-insights`);
            }
          },
        },
      ],
    },
  ];

  // 获取当前用户信息
  const currentUser = tokenManager.getUser();
  const isUserPlatformAdmin = isPlatformAdmin(currentUser?.username);
  
  // 获取当前集群权限（用于集群内层菜单过滤）
  const { currentClusterPermission } = usePermission();
  const currentPermissionType = currentClusterPermission?.permission_type as PermissionType | undefined;

  // 过滤外层主菜单
  const filterMainMenuItems = useCallback((items: MenuItem[]): MenuItem[] => {
    return items.filter((item) => {
      if (!item || typeof item !== 'object' || !('key' in item)) return true;
      const key = item.key as string;
      const config = MAIN_MENU_PERMISSIONS[key];
      
      // 如果没有配置，默认显示
      if (!config) return true;
      
      // 平台管理员专属菜单
      if (config.platformAdminOnly && !isUserPlatformAdmin) {
        return false;
      }
      
      // 递归过滤子菜单
      if ('children' in item && Array.isArray(item.children)) {
        const filteredChildren = filterMainMenuItems(item.children as MenuItem[]);
        if (filteredChildren.length === 0) return false;
        (item as any).children = filteredChildren;
      }
      
      return true;
    });
  }, [isUserPlatformAdmin]);

  // 过滤集群内层菜单
  const filterClusterMenuItems = useCallback((items: MenuItem[]): MenuItem[] => {
    return items.filter((item) => {
      if (!item || typeof item !== 'object' || !('key' in item)) return true;
      const key = item.key as string;
      const config = CLUSTER_MENU_PERMISSIONS[key];
      
      // 如果没有配置，默认显示
      if (!config) return true;
      
      // 检查权限要求
      if (config.requiredPermission) {
        if (!hasPermission(currentPermissionType, config.requiredPermission)) {
          return false;
        }
      }
      
      // 递归过滤子菜单
      if ('children' in item && Array.isArray(item.children)) {
        const filteredChildren = filterClusterMenuItems(item.children as MenuItem[]);
        if (filteredChildren.length === 0) return false;
        (item as any).children = filteredChildren;
      }
      
      return true;
    });
  }, [currentPermissionType]);

  // 根据当前页面和权限选择对应的菜单
  const menuItems = isClusterDetailPage() 
    ? filterClusterMenuItems([...clusterDetailMenuItems]) 
    : filterMainMenuItems([...mainMenuItems]);
  
  // 处理用户名显示，去掉末尾的数字
  const getDisplayName = () => {
    const name = currentUser?.display_name || currentUser?.username || 'User';
    // 去掉末尾的数字，例如 "王植4" -> "王植"
    return name.replace(/\d+$/, '');
  };
  
  // 处理用户菜单点击
  const handleUserMenuClick: AntMenuProps['onClick'] = ({ key }) => {
    if (key === 'logout') {
      tokenManager.clear();
      message.success('已退出登录');
      navigate('/login');
    } else if (key === 'settings') {
      navigate('/settings');
    } else if (key === 'profile') {
      navigate('/profile');
    }
  };

  const userMenuItems: AntMenuProps['items'] = [
    {
      key: 'profile',
      icon: <UserOutlined />,
      label: '个人资料',
    },
    {
      key: 'settings',
      icon: <SettingOutlined />,
      label: '系统设置',
    },
    {
      type: 'divider',
    },
    {
      key: 'logout',
      icon: <LogoutOutlined />,
      label: '退出登录',
      danger: true,
    },
  ];

  const handleSearch = (value: string) => {
    if (value.trim()) {
      navigate(`/search?q=${encodeURIComponent(value)}`);
    }
  };

  const ClusterSelector = () => {
    const { id, clusterId } = useParams();
    const navigate = useNavigate();
    const { Option } = Select;
    const [clusters, setClusters] = useState<Cluster[]>([]);
    const { getPermissionType, setCurrentClusterId, canWrite } = usePermission();
    // 优先使用 clusterId，如果没有则使用 id
    const currentClusterId = clusterId || id;
    
    // 获取当前集群的权限类型
    const permissionType = currentClusterId ? getPermissionType(currentClusterId) : null;
    const hasWritePermission = currentClusterId ? canWrite(currentClusterId) : false;
    
    // 同步当前集群到权限上下文
    useEffect(() => {
      if (currentClusterId) {
        setCurrentClusterId(currentClusterId);
      }
    }, [currentClusterId, setCurrentClusterId]);
    
    const openTerminal = () => {
      if (currentClusterId) {
        window.open(`/clusters/${currentClusterId}/terminal`);
      } else {
        message.error('无法获取集群ID');
      }
    };


      // 获取集群列表 - 使用useCallback优化
    const fetchClusters = useCallback(async () => {
      try {
        const response = await clusterService.getClusters();
        setClusters(response.data.items || []);
      } catch (error) {
        console.error('获取集群列表失败:', error);
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
          返回集群列表
        </Button>
        <ClusterOutlined style={{ color: '#1890ff' }} />
        <span>当前集群：</span>

        <Select
          value={currentClusterId}
          style={{ minWidth: 200 }}
          onChange={(newClusterId) => {
            // 保持当前子路由，只切换集群ID
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
        {/* 权限类型标签 */}
        {permissionType && (
          <Tag color={getPermissionTypeColor(permissionType)} style={{ marginLeft: 8 }}>
            {getPermissionTypeName(permissionType)}
          </Tag>
        )}
        {!hasWritePermission && permissionType && (
          <span style={{ color: '#ff4d4f', fontSize: '12px' }}>
            （只读模式）
          </span>
        )}
        </div>
        <Space size="middle">
          <Button 
            type="text" 
            icon={<CodeOutlined />}
            onClick={() => openTerminal()}  // 调用已有的终端功能
            disabled={!hasWritePermission}
            title={!hasWritePermission ? '只读权限无法使用终端' : undefined}
          >
              kubectl终端
          </Button>
        </Space>
      </div>
    );
};


  return (
    <Layout style={{ minHeight: '100vh', background: '#fafbfc' }}>
      <Header
        style={{
          position: 'fixed',
          top: 0,
          zIndex: 1000,
          width: '100%',
          height: '48px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 16px',
          background: '#1f2937',
          borderBottom: '1px solid #f0f0f0',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <div 
            style={{ 
              display: 'flex', 
              alignItems: 'center', 
              marginLeft: 16, 
              cursor: 'pointer',
              transition: 'opacity 0.2s'
            }}
            onClick={() => navigate('/')}
            onMouseEnter={(e) => {
              e.currentTarget.style.opacity = '0.8';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.opacity = '1';
            }}
          >
            <img 
              src="/src/assets/kubernetes.png" 
              alt="Kubernetes" 
              style={{ width: '32px', height: '32px', marginRight: 8 }} 
            />
            <span style={{ fontSize: '18px', fontWeight: 'bold', color: '#ffffff' }}>KubePolaris</span>
          </div>
        </div>

        <div style={{ flex: 1, maxWidth: 600, margin: '0 24px',display: 'flex', alignItems: 'center' }}>
          <SearchDropdown onSearch={handleSearch} />
        </div>

        <Space size="middle">
          <Badge count={3} size="small" offset={[-8, 10]}>
            <Button type="text" icon={<BellOutlined />} size="large" style={{ color: '#ffffff' }} />
          </Badge>
          <Dropdown menu={{ items: userMenuItems, onClick: handleUserMenuClick }} placement="bottomRight">
            <Space style={{ cursor: 'pointer' }}>
              <Avatar icon={<UserOutlined />} style={{ backgroundColor: '#667eea' }} />
              <span style={{ color: '#ffffff' }}>{getDisplayName()}</span>
            </Space>
          </Dropdown>
        </Space>
      </Header>

      {/* 新增：集群头部栏 */}
      {isClusterDetailPage() && (
        <div style={{
          position: 'fixed',
          top: '48px',
          left: '0',
          right: '0',
          width: '100%',
          height: '48px',
          background: '#f8fafc',
          borderBottom: '1px solid #f0f0f0',
          zIndex: 999,
          display: 'flex',
          alignItems: 'center',
          padding: '0 24px'
        }}>
          <ClusterSelector />  {/* 集群选择器组件 */}
        </div>
      )}

      <Layout style={{ 
        marginTop: isClusterDetailPage() ? 112 : 64  // 动态调整顶部间距
        }}>
        <Sider
          width={192}
          style={{
            position: 'fixed',
            left: 0,
            top: isClusterDetailPage() ? 112 : 52,
            bottom: 0,
            zIndex: 999,
            background: '#f8fafc',
            boxShadow: '2px 0 12px 0 rgba(0, 0, 0, 0.08)',
            borderRight: '1px solid #e0e0e0',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              height: '100%',
              overflowY: 'auto',
              overflowX: 'hidden',
              scrollbarWidth: 'thin',
              scrollbarColor: '#d9d9d9 transparent',
              padding: '6px 0',
            }}
            className="custom-scrollbar"
          >
            <Menu
              mode="inline"
              selectedKeys={getSelectedKeys()}
              openKeys={openKeys}
              onOpenChange={handleOpenChange}
              items={menuItems}
              className="compact-menu"
              style={{ 
                height: 'auto',
                minHeight: '100%',
                borderRight: 0,
                background: 'transparent',
                padding: '6px 8px',
              }}
            />
          </div>
        </Sider>

        <Layout style={{ marginLeft: 192 }}>
          <Content
            style={{
              margin: '0px 4px',
              padding: 16,
              minHeight: 'calc(100vh - 96px)',
              background: '#ffffff',
              borderRadius: '8px',
              boxShadow: '0 2px 8px rgba(0, 0, 0, 0.06)',
            }}
          >
            <Outlet />
          </Content>
        </Layout>
      </Layout>
    </Layout>
  );
};

export default MainLayout;