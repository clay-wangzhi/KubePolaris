import { request } from '../utils/api';
import type { Ingress, ApiResponse, PaginatedResponse } from '../types';

export interface IngressListResponse extends ApiResponse<PaginatedResponse<Ingress>> {}

export interface IngressDetailResponse extends ApiResponse<Ingress> {}

export interface IngressYAMLResponse extends ApiResponse<{ yaml: string }> {}

export class IngressService {
  // 获取Ingress列表
  static async getIngresses(
    clusterId: string,
    namespace?: string,
    ingressClass?: string,
    search?: string,
    page = 1,
    pageSize = 20
  ): Promise<IngressListResponse> {
    const params = new URLSearchParams({
      page: page.toString(),
      pageSize: pageSize.toString(),
    });
    
    if (namespace && namespace !== '_all_') {
      params.append('namespace', namespace);
    }
    
    if (ingressClass) {
      params.append('ingressClass', ingressClass);
    }
    
    if (search) {
      params.append('search', search);
    }
    
    return request.get(`/clusters/${clusterId}/ingresses?${params}`);
  }

  // 获取Ingress详情
  static async getIngress(
    clusterId: string,
    namespace: string,
    name: string
  ): Promise<IngressDetailResponse> {
    return request.get(`/clusters/${clusterId}/ingresses/${namespace}/${name}`);
  }

  // 获取Ingress的YAML
  static async getIngressYAML(
    clusterId: string,
    namespace: string,
    name: string
  ): Promise<IngressYAMLResponse> {
    return request.get(`/clusters/${clusterId}/ingresses/${namespace}/${name}/yaml`);
  }

  // 删除Ingress
  static async deleteIngress(
    clusterId: string,
    namespace: string,
    name: string
  ): Promise<ApiResponse<null>> {
    return request.delete(`/clusters/${clusterId}/ingresses/${namespace}/${name}`);
  }

  // 创建Ingress
  static async createIngress(
    clusterId: string,
    data: {
      namespace: string;
      yaml?: string;
      formData?: any;
    }
  ): Promise<ApiResponse<Ingress>> {
    return request.post(`/clusters/${clusterId}/ingresses`, data);
  }

  // 更新Ingress
  static async updateIngress(
    clusterId: string,
    namespace: string,
    name: string,
    data: {
      namespace: string;
      yaml?: string;
      formData?: any;
    }
  ): Promise<ApiResponse<Ingress>> {
    return request.put(`/clusters/${clusterId}/ingresses/${namespace}/${name}`, data);
  }

  // 获取IngressClass颜色
  static getIngressClassColor(ingressClassName?: string): string {
    if (!ingressClassName) return 'default';
    
    if (ingressClassName.includes('nginx')) {
      return 'green';
    } else if (ingressClassName.includes('traefik')) {
      return 'purple';
    } else if (ingressClassName.includes('alb')) {
      return 'blue';
    } else {
      return 'orange';
    }
  }

  // 格式化IngressClass显示
  static formatIngressClass(ingressClassName?: string): string {
    if (!ingressClassName) return '-';
    return ingressClassName;
  }

  // 格式化规则信息
  static formatRules(ingress: Ingress): string {
    if (!ingress.rules || ingress.rules.length === 0) {
      return '-';
    }

    const rules = ingress.rules.map(rule => {
      const host = rule.host || '*';
      const pathCount = rule.paths?.length || 0;
      return `${host} (${pathCount}个路径)`;
    });

    return rules.join(', ');
  }

  // 格式化转发策略
  static formatBackends(ingress: Ingress): string[] {
    if (!ingress.rules || ingress.rules.length === 0) {
      return ['-'];
    }

    const backends: string[] = [];
    ingress.rules.forEach(rule => {
      rule.paths?.forEach(path => {
        const backend = `${rule.host || '*'}${path.path} -> ${path.serviceName}:${path.servicePort}`;
        backends.push(backend);
      });
    });

    return backends.length > 0 ? backends : ['-'];
  }

  // 格式化负载均衡器
  static formatLoadBalancers(ingress: Ingress): string[] {
    if (!ingress.loadBalancer || ingress.loadBalancer.length === 0) {
      return ['-'];
    }

    const lbs = ingress.loadBalancer.map(lb => {
      if (lb.ip) return lb.ip;
      if (lb.hostname) return lb.hostname;
      return '-';
    }).filter(lb => lb !== '-');

    return lbs.length > 0 ? lbs : ['-'];
  }

  // 获取TLS状态
  static hasTLS(ingress: Ingress): boolean {
    return !!(ingress.tls && ingress.tls.length > 0);
  }

  // 格式化TLS信息
  static formatTLS(ingress: Ingress): string {
    if (!ingress.tls || ingress.tls.length === 0) {
      return '否';
    }

    const tlsInfo = ingress.tls.map(t => {
      const hosts = t.hosts.join(', ');
      return `${hosts} (${t.secretName})`;
    });

    return tlsInfo.join('; ');
  }

  // 获取Hosts列表
  static getHosts(ingress: Ingress): string[] {
    if (!ingress.rules || ingress.rules.length === 0) {
      return ['-'];
    }

    const hosts = ingress.rules
      .map(rule => rule.host || '*')
      .filter((host, index, self) => self.indexOf(host) === index); // 去重

    return hosts.length > 0 ? hosts : ['-'];
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

  // 格式化路径类型
  static formatPathType(pathType: string): string {
    switch (pathType) {
      case 'Prefix':
        return '前缀匹配';
      case 'Exact':
        return '精确匹配';
      case 'ImplementationSpecific':
        return '实现特定';
      default:
        return pathType;
    }
  }

  // 获取Ingress命名空间列表（带计数）
  static async getIngressNamespaces(clusterId: string): Promise<{ name: string; count: number }[]> {
    const response = await request.get<{ name: string; count: number }[]>(
      `/clusters/${clusterId}/ingresses/namespaces`
    );
    return response.data;
  }
}

