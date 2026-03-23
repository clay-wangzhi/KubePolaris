export interface ServiceTabProps {
  clusterId: string;
  onCountChange?: (count: number) => void;
}

export interface KubernetesServiceYAML {
  apiVersion: string;
  kind: string;
  metadata: {
    name: string;
    namespace: string;
    labels: Record<string, string>;
    annotations: Record<string, string>;
  };
  spec: {
    type?: string;
    selector?: Record<string, string>;
    ports: Array<{
      name?: string;
      protocol: string;
      port: number;
      targetPort: number | string;
      nodePort?: number;
    }>;
    sessionAffinity?: string;
  };
}

export interface LabelItem {
  key: string;
  value: string;
}

export interface SearchCondition {
  field: 'name' | 'namespace' | 'type' | 'clusterIP' | 'selector';
  value: string;
}

export interface EndpointsData {
  name: string;
  namespace: string;
  subsets?: Array<{
    addresses?: Array<{ ip: string; nodeName?: string }>;
    ports?: Array<{ name?: string; port: number; protocol: string }>;
  }>;
}
