import { request } from '../utils/api';
import type { Service, Endpoints, ApiResponse, PaginatedResponse } from '../types';

export interface ServiceListResponse extends ApiResponse<PaginatedResponse<Service>> {}

export interface ServiceDetailResponse extends ApiResponse<Service> {}

export interface ServiceYAMLResponse extends ApiResponse<{ yaml: string }> {}

export interface EndpointsResponse extends ApiResponse<Endpoints> {}

export class ServiceService {
  // 获取Service列表
  static async getServices(
    clusterId: string,
    namespace?: string,
    type?: string,
    search?: string,
    page = 1,
    pageSize = 20
  ): Promise<ServiceListResponse> {
    const params = new URLSearchParams({
      page: page.toString(),
      pageSize: pageSize.toString(),
    });
    
    if (namespace && namespace !== '_all_') {
      params.append('namespace', namespace);
    }
    
    if (type) {
      params.append('type', type);
    }
    
    if (search) {
      params.append('search', search);
    }
    
    return request.get(`/clusters/${clusterId}/services?${params}`);
  }

  // 获取Service详情
  static async getService(
    clusterId: string,
    namespace: string,
    name: string
  ): Promise<ServiceDetailResponse> {
    return request.get(`/clusters/${clusterId}/services/${namespace}/${name}`);
  }

  // 获取Service的YAML
  static async getServiceYAML(
    clusterId: string,
    namespace: string,
    name: string
  ): Promise<ServiceYAMLResponse> {
    return request.get(`/clusters/${clusterId}/services/${namespace}/${name}/yaml`);
  }

  // 获取Service的Endpoints
  static async getServiceEndpoints(
    clusterId: string,
    namespace: string,
    name: string
  ): Promise<EndpointsResponse> {
    return request.get(`/clusters/${clusterId}/services/${namespace}/${name}/endpoints`);
  }

  // 删除Service
  static async deleteService(
    clusterId: string,
    namespace: string,
    name: string
  ): Promise<ApiResponse<null>> {
    return request.delete(`/clusters/${clusterId}/services/${namespace}/${name}`);
  }

  // 创建Service
  static async createService(
    clusterId: string,
    data: {
      namespace: string;
      yaml?: string;
      formData?: any;
    }
  ): Promise<ApiResponse<Service>> {
    return request.post(`/clusters/${clusterId}/services`, data);
  }

  // 更新Service
  static async updateService(
    clusterId: string,
    namespace: string,
    name: string,
    data: {
      namespace: string;
      yaml?: string;
      formData?: any;
    }
  ): Promise<ApiResponse<Service>> {
    return request.put(`/clusters/${clusterId}/services/${namespace}/${name}`, data);
  }

  // 获取Service类型颜色
  static getTypeColor(type: string): string {
    switch (type) {
      case 'ClusterIP':
        return 'blue';
      case 'NodePort':
        return 'green';
      case 'LoadBalancer':
        return 'purple';
      case 'ExternalName':
        return 'orange';
      default:
        return 'default';
    }
  }

  // 获取Service类型标签
  static getTypeTag(type: string): string {
    switch (type) {
      case 'ClusterIP':
        return '集群内访问';
      case 'NodePort':
        return '节点访问';
      case 'LoadBalancer':
        return '负载均衡';
      case 'ExternalName':
        return '外部名称';
      default:
        return type;
    }
  }

  // 格式化端口信息
  static formatPorts(service: Service): string {
    if (!service.ports || service.ports.length === 0) {
      return '-';
    }

    return service.ports.map(port => {
      let portStr = `${port.port}`;
      if (port.name) {
        portStr = `${port.name}:${portStr}`;
      }
      if (port.nodePort) {
        portStr += `:${port.nodePort}`;
      }
      if (port.protocol && port.protocol !== 'TCP') {
        portStr += `/${port.protocol}`;
      }
      return portStr;
    }).join(', ');
  }

  // 格式化访问地址
  static formatAccessAddress(service: Service): string[] {
    const addresses: string[] = [];

    // ClusterIP
    if (service.clusterIP && service.clusterIP !== 'None') {
      addresses.push(service.clusterIP);
    }

    // ExternalIPs
    if (service.externalIPs && service.externalIPs.length > 0) {
      addresses.push(...service.externalIPs);
    }

    // LoadBalancer
    if (service.loadBalancerIngress && service.loadBalancerIngress.length > 0) {
      service.loadBalancerIngress.forEach(lb => {
        if (lb.ip) {
          addresses.push(lb.ip);
        }
        if (lb.hostname) {
          addresses.push(lb.hostname);
        }
      });
    }

    // LoadBalancerIP
    if (service.loadBalancerIP) {
      addresses.push(service.loadBalancerIP);
    }

    // ExternalName
    if (service.externalName) {
      addresses.push(service.externalName);
    }

    return addresses.length > 0 ? addresses : ['-'];
  }

  // 格式化选择器
  static formatSelector(selector: Record<string, string>): string {
    if (!selector || Object.keys(selector).length === 0) {
      return '-';
    }
    return Object.entries(selector)
      .map(([key, value]) => `${key}=${value}`)
      .join(', ');
  }

  // 获取年龄显示
  static getAge(createdAt: string): string {
    const now = new Date();
    const created = new Date(createdAt);
    const diffMs = now.getTime() - created.getTime();
    
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    const diffHours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const diffMinutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
    
    if (diffDays > 0) {
      return `${diffDays}天`;
    } else if (diffHours > 0) {
      return `${diffHours}小时`;
    } else if (diffMinutes > 0) {
      return `${diffMinutes}分钟`;
    } else {
      return '刚刚';
    }
  }

  // 获取Service命名空间列表（带计数）
  static async getServiceNamespaces(clusterId: string): Promise<{ name: string; count: number }[]> {
    const response = await request.get<{ name: string; count: number }[]>(
      `/clusters/${clusterId}/services/namespaces`
    );
    return response.data;
  }
}

