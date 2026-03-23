# KubePolaris Roadmap

This document outlines the planned features and improvements for KubePolaris.

## Vision

To become the most popular enterprise-grade Kubernetes multi-cluster management platform, making container orchestration simple and efficient.

## Current Status: v1.0 ✅

### Completed Features
- ✅ Multi-cluster management
- ✅ Workload management (Deployment, StatefulSet, DaemonSet, Job, CronJob)
- ✅ Pod management with logs and terminal
- ✅ Node management with SSH terminal
- ✅ ConfigMap and Secret management
- ✅ Service and Ingress management
- ✅ RBAC permission control
- ✅ Prometheus/Grafana integration
- ✅ AlertManager integration
- ✅ ArgoCD integration
- ✅ Audit logging (terminal sessions + operation logs)
- ✅ Global search
- ✅ AI Chat integration (cluster-level)
- ✅ Log Center (multi-pod aggregation)
- ✅ Monitoring Center (health diagnosis, resource top, control plane status)

### v1.0.x Security & Quality Fixes
- ✅ Unified API response format (`internal/response` package)
- ✅ Permission management APIs restricted to platform admin
- ✅ Cluster list/search/overview filtered by user permissions
- ✅ Import/test-connection restricted to platform admin
- ✅ SSH WebSocket restricted to platform admin
- ✅ JWT Secret default value detection & production warning
- ✅ WebSocket CheckOrigin validation against allowed origins
- ✅ React Error Boundary (global + route level)
- ✅ PermissionGuard loading state with Spin
- ✅ Graceful shutdown (DB + InformerManager cleanup)
- ✅ `parseClusterID` error handling (returns error instead of 0)
- ✅ `GetNamespaceList` no longer defaults to `["*"]` on parse failure
- ✅ `hasShellInContainer` timeout context (5s)
- ✅ Large file decomposition (ServiceTab, IngressTab, workloadYamlService)

---

## Q2 2026: v1.1

### Internationalization (i18n)
- ✅ Frontend multi-language support (English, Chinese) — 23 namespaces, en/zh complete
- [ ] Backend error message localization
- ✅ Language switcher component
- [ ] Translated documentation

### API Documentation
- [ ] Swagger/OpenAPI integration (based on unified response format)
- [ ] Interactive API explorer

### OAuth2/OIDC Integration
- [ ] Generic OIDC provider support
- [ ] Keycloak integration
- [ ] GitHub OAuth
- [ ] Single Sign-On (SSO)

### Cost Analysis
- [ ] Resource usage statistics
- [ ] Cost calculation model
- [ ] Cost reports by cluster/namespace/workload
- [ ] Cost trend charts

---

## Q3 2026: v1.2

### Multi-tenancy
- [ ] Tenant data isolation
- [ ] Tenant quota management
- [ ] Tenant member management
- [ ] Tenant billing

### Network Policy Management
- [ ] NetworkPolicy CRUD
- [ ] Visual policy editor
- [ ] Policy effect preview

### Service Mesh Visualization
- [ ] Istio traffic visualization
- [ ] Service topology graph
- [ ] Traffic management UI

### UI/UX Improvements
- [ ] Dark mode
- [ ] Keyboard shortcuts
- [ ] Guided tours
- [ ] Mobile responsive design

---

## Q4 2026: v2.0

### Cluster Lifecycle Management
- [ ] Cluster API integration
- [ ] Cluster creation wizard
- [ ] Cluster upgrade wizard
- [ ] Multi-cloud support

### Backup & Restore
- [ ] Velero integration
- [ ] Backup policy configuration
- [ ] One-click restore
- [ ] Disaster recovery

### Plugin System
- [ ] Plugin interface definition
- [ ] Plugin marketplace
- [ ] Custom dashboard plugins
- [ ] Third-party integrations

### Webhook Support
- [ ] Event webhooks
- [ ] Multi-channel notifications
- [ ] Custom integrations

---

## Future Considerations

- Kubernetes cost optimization recommendations
- AI-powered anomaly detection
- GitOps workflow builder
- Chaos engineering integration
- Edge cluster management
- Serverless/Knative support

---

## How to Contribute

We welcome community input on our roadmap:

1. **Vote** on existing feature requests in [GitHub Discussions](https://github.com/clay-wangzhi/KubePolaris/discussions)
2. **Propose** new features by opening a discussion
3. **Contribute** by submitting pull requests

## Feedback

Your feedback helps shape the future of KubePolaris. Please share your thoughts:

- GitHub Discussions: https://github.com/clay-wangzhi/KubePolaris/discussions
- Email: feedback@kubepolaris.io

---

*Last updated: March 2026*

