<p align="center">
  <img src="website/static/img/logo.svg" alt="KubePolaris Logo" width="120" height="120">
</p>

<h1 align="center">KubePolaris</h1>

<p align="center">
  <strong>🌟 Enterprise-Grade Kubernetes Multi-Cluster Management Platform</strong>
</p>

<p align="center">
  <a href="https://github.com/clay-wangzhi/KubePolaris/releases/latest">
    <img src="https://img.shields.io/github/v/release/clay-wangzhi/KubePolaris?style=flat-square&logo=github&color=blue" alt="Release">
  </a>
  <a href="https://github.com/clay-wangzhi/KubePolaris/blob/main/LICENSE">
    <img src="https://img.shields.io/github/license/clay-wangzhi/KubePolaris?style=flat-square" alt="License">
  </a>
  <a href="https://github.com/clay-wangzhi/KubePolaris/actions">
    <img src="https://img.shields.io/github/actions/workflow/status/clay-wangzhi/KubePolaris/release.yml?style=flat-square&logo=github" alt="Build Status">
  </a>
  <a href="https://goreportcard.com/report/github.com/clay-wangzhi/KubePolaris">
    <img src="https://goreportcard.com/badge/github.com/clay-wangzhi/KubePolaris?style=flat-square" alt="Go Report Card">
  </a>
  <a href="https://github.com/clay-wangzhi/KubePolaris/stargazers">
    <img src="https://img.shields.io/github/stars/clay-wangzhi/KubePolaris?style=flat-square&logo=github" alt="Stars">
  </a>
</p>

<p align="center">
  <a href="http://kubepolaris.clay-wangzhi.com/">Website</a> •
  <a href="http://kubepolaris.clay-wangzhi.com/docs/getting-started/quick-start">Quick Start</a> •
  <a href="http://kubepolaris.clay-wangzhi.com/docs">Documentation</a> •
  <a href="https://github.com/clay-wangzhi/KubePolaris/discussions">Discussions</a> •
  <a href="./ROADMAP.md">Roadmap</a>
</p>

<p align="center">
  <a href="./README_ZH.md">中文</a> | <a href="./README.md">English</a>
</p>

---

## 📖 About

**KubePolaris** is a modern Kubernetes cluster management platform built with **React + Go**. It provides an intuitive web interface to help DevOps and development teams efficiently manage and monitor multiple Kubernetes clusters.

> "Polaris" refers to the North Star, symbolizing stable and reliable guidance for Kubernetes cluster operations.

### Why KubePolaris?

- 🎯 **User-Centric** - Clean, intuitive interface that lowers the K8s learning curve
- 🏢 **Enterprise-Ready** - Complete permission control, audit logs, multi-cluster management
- 🔌 **Ecosystem Integration** - Seamless integration with Prometheus, Grafana, AlertManager, ArgoCD
- 🚀 **Out-of-the-Box** - One-click Docker deployment, easy to get started
- 💯 **Fully Open Source** - Apache 2.0 License, community-driven

## ✨ Features

<table>
<tr>
<td width="50%">

### 🏗️ Cluster Management
- Multi-cluster unified management
- Support kubeconfig / Token import
- Real-time cluster health monitoring
- Resource usage overview dashboard

</td>
<td width="50%">

### 📦 Workload Management
- Deployment / StatefulSet / DaemonSet
- Job / CronJob management
- Scale, rolling update, rollback
- Online YAML editor with syntax highlighting

</td>
</tr>
<tr>
<td width="50%">

### 🖥️ Node Management
- Node list and details
- Cordon / Uncordon / Drain operations
- Labels and taints management
- SSH terminal remote access

</td>
<td width="50%">

### 📊 Monitoring & Alerting
- Prometheus metrics integration
- Grafana dashboard embedding
- AlertManager integration
- Multi-channel notifications

</td>
</tr>
<tr>
<td width="50%">

### 🔐 Security & Permissions
- User / Role management
- RBAC fine-grained access control
- LDAP authentication integration
- Operation audit logs

</td>
<td width="50%">

### 🚀 DevOps Integration
- ArgoCD GitOps integration
- Global resource search
- Log center aggregation
- Web Terminal (Pod/Kubectl/SSH)

</td>
</tr>
</table>

## 🎬 Screenshots

<p align="center">
  <img src="docs/screenshots/dashboard.png" alt="Dashboard" width="80%">
</p>

<details>
<summary>📸 More Screenshots</summary>

| Cluster Overview | Workload Management |
|:---:|:---:|
| ![Cluster Overview](docs/screenshots/cluster-overview.png) | ![Workloads](docs/screenshots/workloads.png) |

| Pod Management | Web Terminal |
|:---:|:---:|
| ![Pod Management](docs/screenshots/pods.png) | ![Terminal](docs/screenshots/terminal.png) |

</details>

## 🚀 Quick Start

### Option 1: Docker Compose (Recommended)

```bash
# Clone the repository
git clone https://github.com/clay-wangzhi/KubePolaris.git
cd kubepolaris

# Start services
docker-compose -f deploy/docker-compose/docker-compose.yml up -d

# Access http://localhost:8080
# Default credentials: admin / admin123
```

### Option 2: Kubernetes Deployment

```bash
# Install with Helm
helm repo add kubepolaris https://kubepolaris.github.io/charts
helm install kubepolaris kubepolaris/kubepolaris -n kubepolaris --create-namespace

# Or deploy with YAML
kubectl apply -f https://raw.githubusercontent.com/clay-wangzhi/KubePolaris/main/deploy/yaml/kubepolaris.yaml
```

### Option 3: Run from Source

```bash
# Requirements
# - Go 1.24+
# - Node.js 18+
# - MySQL 8.0+

# Start backend (port 8080)
cd kubepolaris
go run cmd/main.go

# Start frontend (port 5173)
cd ui
npm install && npm run dev

# Access http://localhost:5173
```

📚 For detailed installation guide, see [Installation Documentation](http://kubepolaris.clay-wangzhi.com/docs/getting-started/installation)

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        KubePolaris                               │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────────────────────┐    │
│  │                    Frontend (React)                      │    │
│  │  React 19 · TypeScript · Ant Design · Monaco · xterm.js │    │
│  └─────────────────────────────────────────────────────────┘    │
│                              │                                   │
│                         REST / WebSocket                         │
│                              │                                   │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │                     Backend (Go)                         │    │
│  │      Gin · GORM · k8s client-go · WebSocket · JWT       │    │
│  └─────────────────────────────────────────────────────────┘    │
│                              │                                   │
│         ┌────────────────────┼────────────────────┐             │
│         │                    │                    │             │
│    ┌────▼────┐         ┌────▼────┐         ┌────▼────┐         │
│    │  MySQL  │         │   K8s   │         │ Monitor │         │
│    │  Store  │         │ Clusters│         │Prometheus│         │
│    └─────────┘         └─────────┘         └─────────┘         │
└─────────────────────────────────────────────────────────────────┘
```

### Tech Stack

| Layer | Technology | Version |
|:---|:---|:---|
| **Frontend** | React, TypeScript, Ant Design, Vite | 19.x, 5.8, 5.x, 7.x |
| **Backend** | Go, Gin, GORM | 1.24, 1.9, 1.30 |
| **Database** | MySQL | 8.0+ |
| **K8s Client** | client-go | 0.29 |
| **Monitoring** | Prometheus, Grafana | - |

## 📁 Project Structure

```
kubepolaris/
├── cmd/                    # Application entry
├── internal/               # Internal packages
│   ├── handlers/           # HTTP handlers
│   ├── services/           # Business services
│   ├── models/             # Data models
│   ├── middleware/         # Middleware
│   ├── router/             # Router configuration
│   └── k8s/                # K8s client wrapper
├── ui/                     # Frontend source
│   ├── src/
│   │   ├── pages/          # Page components
│   │   ├── components/     # Common components
│   │   ├── services/       # API services
│   │   └── types/          # Type definitions
├── deploy/                 # Deployment configs
│   ├── docker/             # Docker configs
│   ├── docker-compose/     # Compose files
│   └── yaml/               # K8s YAML
├── website/                # Documentation site
└── configs/                # Configuration files
```

## 📊 Feature Status

| Module | Status | Description |
|:---|:---:|:---|
| Cluster Management | ✅ | Import, switch, monitor, delete |
| Node Management | ✅ | List, details, operations, SSH |
| Workloads | ✅ | Deploy/STS/DS/Job/CronJob |
| Pod Management | ✅ | List, logs, terminal, delete |
| Config Management | ✅ | ConfigMap, Secret |
| Network Management | ✅ | Service, Ingress |
| Storage Management | ✅ | PV, PVC, StorageClass |
| User & Permissions | ✅ | Users, roles, RBAC |
| Monitoring | ✅ | Prometheus, Grafana |
| Alerting | ✅ | AlertManager integration |
| GitOps | ✅ | ArgoCD integration |
| Audit Logs | ✅ | Operation logs, session audit |
| Global Search | ✅ | Cross-cluster resource search |
| i18n | 🚧 | Planned for v1.1 |

## 🗺️ Roadmap

See [ROADMAP.md](./ROADMAP.md) for the detailed plan.

### Upcoming

- **v1.1 (Q2 2026)** - i18n support, OAuth2/OIDC integration, cost analysis
- **v1.2 (Q3 2026)** - Multi-tenancy, NetworkPolicy management, Service Mesh visualization
- **v2.0 (Q4 2026)** - Cluster lifecycle management, backup & restore, plugin system

## 🤝 Contributing

We welcome all contributions!

- 🐛 [Report Bug](https://github.com/clay-wangzhi/KubePolaris/issues/new?template=bug_report.md)
- 💡 [Request Feature](https://github.com/clay-wangzhi/KubePolaris/issues/new?template=feature_request.md)
- 📖 [Improve Documentation](https://github.com/clay-wangzhi/KubePolaris/tree/main/website/docs)
- 🔧 [Submit PR](https://github.com/clay-wangzhi/KubePolaris/pulls)

### How to Contribute

```bash
# 1. Fork and clone
git clone https://github.com/YOUR_USERNAME/kubepolaris.git

# 2. Create feature branch
git checkout -b feature/amazing-feature

# 3. Commit changes
git commit -m 'feat: add amazing feature'

# 4. Push and create PR
git push origin feature/amazing-feature
```

See [CONTRIBUTING.md](./CONTRIBUTING.md) for detailed guidelines.

## 📚 Documentation

| Document | Link |
|:---|:---|
| 🏠 Official Website | [kubepolaris.clay-wangzhi.com](http://kubepolaris.clay-wangzhi.com/) |
| 📖 User Documentation | [docs](http://kubepolaris.clay-wangzhi.com/docs) |
| 🚀 Quick Start | [quick-start](http://kubepolaris.clay-wangzhi.com/docs/getting-started/quick-start) |
| 📦 Installation Guide | [installation](http://kubepolaris.clay-wangzhi.com/docs/getting-started/installation) |
| 🔧 Configuration | [configuration](http://kubepolaris.clay-wangzhi.com/docs/admin-guide/configuration) |
| 🔌 API Reference | [api-reference](http://kubepolaris.clay-wangzhi.com/docs/api/overview) |

## 💬 Community

- 💭 [GitHub Discussions](https://github.com/clay-wangzhi/KubePolaris/discussions) - Q&A and feature discussions
- 📢 [Slack](https://kubepolaris.slack.com) - Real-time chat
- 📧 Mailing List: [kubepolaris@googlegroups.com](mailto:kubepolaris@googlegroups.com)

## 🔒 Security

If you discover a security vulnerability, please see [SECURITY.md](./SECURITY.md) for the reporting process.

## 📄 License

KubePolaris is open-sourced under the [Apache License 2.0](./LICENSE).

## 🙏 Acknowledgements

Thanks to these amazing open source projects:

- [Kubernetes](https://kubernetes.io/) - Container orchestration platform
- [Gin](https://gin-gonic.com/) - Go web framework
- [Ant Design](https://ant.design/) - React UI component library
- [client-go](https://github.com/kubernetes/client-go) - Kubernetes Go client
- [xterm.js](https://xtermjs.org/) - Terminal component

Special thanks to all [contributors](https://github.com/clay-wangzhi/KubePolaris/graphs/contributors)!

---

<p align="center">
  If KubePolaris helps you, please give us a ⭐️ Star!
</p>

<p align="center">
  <a href="https://github.com/clay-wangzhi/KubePolaris/stargazers">
    <img src="https://img.shields.io/github/stars/clay-wangzhi/KubePolaris?style=social" alt="Stars">
  </a>
</p>
