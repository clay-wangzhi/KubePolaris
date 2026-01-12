import { request } from '../utils/api';

// 资源类型定义
export type ResourceKind = 
  | 'ConfigMap'
  | 'Secret'
  | 'Service'
  | 'Ingress'
  | 'PersistentVolumeClaim'
  | 'PersistentVolume'
  | 'StorageClass';

// YAML 应用请求
export interface YAMLApplyRequest {
  yaml: string;
  dryRun?: boolean;
}

// YAML 应用响应
export interface YAMLApplyResponse {
  code: number;
  message: string;
  data: {
    name: string;
    namespace?: string;
    kind: string;
    resourceVersion?: string;
    isCreated: boolean;
  };
}

// YAML 获取响应
export interface YAMLGetResponse {
  code: number;
  message: string;
  data: {
    yaml: string;
  };
}

// 资源端点映射
const resourceEndpoints: Record<ResourceKind, string> = {
  ConfigMap: 'configmaps',
  Secret: 'secrets',
  Service: 'services',
  Ingress: 'ingresses',
  PersistentVolumeClaim: 'pvcs',
  PersistentVolume: 'pvs',
  StorageClass: 'storageclasses',
};

// 是否需要命名空间
const namespaceRequired: Record<ResourceKind, boolean> = {
  ConfigMap: true,
  Secret: true,
  Service: true,
  Ingress: true,
  PersistentVolumeClaim: true,
  PersistentVolume: false,
  StorageClass: false,
};

/**
 * 通用资源服务
 * 提供所有资源类型的 YAML 应用和获取功能
 */
export class ResourceService {
  /**
   * 应用 YAML 配置
   * @param clusterId 集群 ID
   * @param kind 资源类型
   * @param yaml YAML 内容
   * @param dryRun 是否为预检模式
   */
  static async applyYAML(
    clusterId: string,
    kind: ResourceKind,
    yaml: string,
    dryRun = false
  ): Promise<YAMLApplyResponse> {
    const endpoint = resourceEndpoints[kind];
    return request.post(`/clusters/${clusterId}/${endpoint}/yaml/apply`, {
      yaml,
      dryRun,
    });
  }

  /**
   * 获取资源的 YAML（干净版本，用于编辑）
   * @param clusterId 集群 ID
   * @param kind 资源类型
   * @param namespace 命名空间（集群级资源可不传）
   * @param name 资源名称
   */
  static async getYAML(
    clusterId: string,
    kind: ResourceKind,
    namespace: string | null,
    name: string
  ): Promise<YAMLGetResponse> {
    const endpoint = resourceEndpoints[kind];
    const needsNamespace = namespaceRequired[kind];
    
    let url: string;
    if (needsNamespace && namespace) {
      url = `/clusters/${clusterId}/${endpoint}/${namespace}/${name}/yaml/clean`;
    } else {
      url = `/clusters/${clusterId}/${endpoint}/${name}/yaml/clean`;
    }
    
    return request.get(url);
  }

  /**
   * 从 YAML 中解析资源类型
   */
  static parseKindFromYAML(yaml: string): ResourceKind | null {
    const match = yaml.match(/kind:\s*(\w+)/);
    if (match) {
      const kind = match[1];
      // 映射到标准类型名
      const kindMap: Record<string, ResourceKind> = {
        ConfigMap: 'ConfigMap',
        Secret: 'Secret',
        Service: 'Service',
        Ingress: 'Ingress',
        PersistentVolumeClaim: 'PersistentVolumeClaim',
        PersistentVolume: 'PersistentVolume',
        StorageClass: 'StorageClass',
      };
      return kindMap[kind] || null;
    }
    return null;
  }

  /**
   * 根据资源类型获取显示名称
   */
  static getKindDisplayName(kind: ResourceKind): string {
    const displayNames: Record<ResourceKind, string> = {
      ConfigMap: 'ConfigMap',
      Secret: 'Secret',
      Service: 'Service',
      Ingress: 'Ingress',
      PersistentVolumeClaim: 'PVC',
      PersistentVolume: 'PV',
      StorageClass: 'StorageClass',
    };
    return displayNames[kind];
  }

  /**
   * 检查资源是否需要命名空间
   */
  static isNamespaced(kind: ResourceKind): boolean {
    return namespaceRequired[kind];
  }

  /**
   * 获取默认 YAML 模板
   */
  static getDefaultYAML(kind: ResourceKind, namespace = 'default'): string {
    const templates: Record<ResourceKind, string> = {
      ConfigMap: `apiVersion: v1
kind: ConfigMap
metadata:
  name: my-configmap
  namespace: ${namespace}
data:
  key1: value1
  key2: value2
`,
      Secret: `apiVersion: v1
kind: Secret
metadata:
  name: my-secret
  namespace: ${namespace}
type: Opaque
stringData:
  username: admin
  password: password123
`,
      Service: `apiVersion: v1
kind: Service
metadata:
  name: my-service
  namespace: ${namespace}
spec:
  type: ClusterIP
  selector:
    app: my-app
  ports:
    - name: http
      port: 80
      targetPort: 8080
      protocol: TCP
`,
      Ingress: `apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: my-ingress
  namespace: ${namespace}
spec:
  ingressClassName: nginx
  rules:
    - host: example.com
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: my-service
                port:
                  number: 80
`,
      PersistentVolumeClaim: `apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: my-pvc
  namespace: ${namespace}
spec:
  accessModes:
    - ReadWriteOnce
  resources:
    requests:
      storage: 1Gi
  storageClassName: standard
`,
      PersistentVolume: `apiVersion: v1
kind: PersistentVolume
metadata:
  name: my-pv
spec:
  capacity:
    storage: 10Gi
  accessModes:
    - ReadWriteOnce
  persistentVolumeReclaimPolicy: Retain
  storageClassName: standard
  hostPath:
    path: /data/my-pv
`,
      StorageClass: `apiVersion: storage.k8s.io/v1
kind: StorageClass
metadata:
  name: my-storageclass
provisioner: kubernetes.io/no-provisioner
volumeBindingMode: WaitForFirstConsumer
`,
    };
    return templates[kind];
  }
}

export default ResourceService;

