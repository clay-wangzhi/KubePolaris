export interface IngressTabProps {
  clusterId: string;
  onCountChange?: (count: number) => void;
}

export interface LabelItem {
  key: string;
  value?: string;
}

export interface AnnotationItem {
  key: string;
  value?: string;
}

export interface PathItem {
  path: string;
  pathType: string;
  serviceName: string;
  servicePort: number | string;
}

export interface RuleItem {
  host: string;
  paths?: PathItem[];
}

export interface KubernetesIngressYAML {
  apiVersion: string;
  kind: string;
  metadata: {
    name: string;
    namespace: string;
    labels: Record<string, string>;
    annotations: Record<string, string>;
  };
  spec: {
    ingressClassName?: string;
    rules: Array<{
      host: string;
      http: {
        paths: Array<{
          path: string;
          pathType: string;
          backend: {
            service: {
              name: string;
              port: {
                number: number | string;
              };
            };
          };
        }>;
      };
    }>;
    tls?: Array<{
      hosts: string[];
      secretName: string;
    }>;
  };
}

export interface SearchCondition {
  field: 'name' | 'namespace' | 'ingressClassName' | 'host';
  value: string;
}
