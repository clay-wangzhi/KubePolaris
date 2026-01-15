# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Documentation website with Docusaurus
- GitHub Actions for documentation deployment
- Contributing guidelines

## [1.0.0] - 2026-01-07

### Added

#### Cluster Management
- Multi-cluster unified management
- Support kubeconfig and token authentication
- Cluster connection status monitoring
- Cluster resource overview dashboard

#### Workload Management
- Deployment/StatefulSet/DaemonSet management
- Job/CronJob management
- Scale, restart, and rollback operations
- YAML online editor with syntax highlighting

#### Pod Management
- Pod list and details view
- Real-time log streaming
- Web terminal (Pod exec)

#### Node Management
- Node list and details view
- Cordon/Uncordon/Drain operations
- Node labels and taints management
- SSH terminal access

#### Configuration Management
- ConfigMap management
- Secret management
- Service management
- Ingress management

#### User & Permissions
- User management
- Role management
- RBAC permission control
- LDAP integration

#### Monitoring & Alerting
- Prometheus integration
- Grafana panel embedding
- AlertManager integration
- Alert notifications

#### Other Features
- Global resource search
- Operation audit logs
- Log center
- ArgoCD integration

### Security
- JWT authentication
- Password encryption
- Audit logging
- CORS configuration

---

## Version History

| Version | Release Date | Highlights |
|---------|--------------|------------|
| 1.0.0 | 2026-01-07 | Initial release |

## Upgrade Guide

See [Upgrade Documentation](http://kubepolaris.clay-wangzhi.com/docs/installation/upgrade) for detailed upgrade instructions.

