<p align="center">
  <img src="website/static/img/logo.svg" alt="KubePolaris Logo" width="120" height="120">
</p>

<h1 align="center">KubePolaris（北辰）</h1>

<p align="center">
  <strong>🌟 企业级 Kubernetes 多集群管理平台</strong>
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
  <a href="http://kubepolaris.clay-wangzhi.com/">官网</a> •
  <a href="http://kubepolaris.clay-wangzhi.com/docs/getting-started/quick-start">快速开始</a> •
  <a href="http://kubepolaris.clay-wangzhi.com/docs">文档</a> •
  <a href="https://github.com/clay-wangzhi/KubePolaris/discussions">社区讨论</a> •
  <a href="./ROADMAP.md">路线图</a>
</p>

<p align="center">
  <a href="./README_ZH.md">中文</a> | <a href="./README.md">English</a>
</p>

---

## 📖 项目简介

**KubePolaris（北辰）** 是一个基于 **React + Go** 构建的现代化 Kubernetes 集群管理平台。它提供直观的 Web 界面，帮助运维和开发团队高效管理和监控多个 Kubernetes 集群。

> "北辰"意为北极星，寓意为 Kubernetes 集群运维提供稳定可靠的指引方向。

### 为什么选择 KubePolaris？

- 🎯 **专注用户体验** - 简洁直观的界面设计，降低 K8s 使用门槛
- 🏢 **企业级特性** - 完善的权限控制、审计日志、多集群管理
- 🔌 **生态集成** - 无缝对接 Prometheus、Grafana、AlertManager、ArgoCD
- 🚀 **开箱即用** - Docker 一键部署，快速上手
- 💯 **完全开源** - Apache 2.0 许可证，社区驱动

## ✨ 核心特性

<table>
<tr>
<td width="50%">

### 🏗️ 集群管理
- 多集群统一管理和切换
- 支持 kubeconfig / Token 导入
- 集群健康状态实时监控
- 资源使用概览仪表板

</td>
<td width="50%">

### 📦 工作负载管理
- Deployment / StatefulSet / DaemonSet
- Job / CronJob 任务管理
- 扩缩容、滚动更新、回滚
- YAML 在线编辑（语法高亮）

</td>
</tr>
<tr>
<td width="50%">

### 🖥️ 节点管理
- 节点列表与详细信息
- Cordon / Uncordon / Drain 操作
- 标签和污点管理
- SSH 终端远程访问

</td>
<td width="50%">

### 📊 监控告警
- Prometheus 指标集成
- Grafana 看板嵌入
- AlertManager 告警管理
- 多渠道通知支持

</td>
</tr>
<tr>
<td width="50%">

### 🔐 安全与权限
- 用户 / 角色管理
- RBAC 细粒度权限控制
- LDAP 集成认证
- 操作审计日志

</td>
<td width="50%">

### 🚀 DevOps 集成
- ArgoCD GitOps 集成
- 全局资源搜索
- 日志中心聚合
- Web 终端（Pod/Kubectl/SSH）

</td>
</tr>
</table>

## 🎬 界面预览

<p align="center">
  <img src="docs/screenshots/dashboard.png" alt="Dashboard" width="80%">
</p>

<details>
<summary>📸 查看更多截图</summary>

| 集群概览 | 工作负载管理 |
|:---:|:---:|
| ![集群概览](docs/screenshots/cluster-overview.png) | ![工作负载](docs/screenshots/workloads.png) |

| Pod 管理 | Web 终端 |
|:---:|:---:|
| ![Pod管理](docs/screenshots/pods.png) | ![终端](docs/screenshots/terminal.png) |

</details>

## 🚀 快速开始

### 方式一：Docker Compose（推荐）

```bash
# 克隆项目
git clone https://github.com/clay-wangzhi/KubePolaris.git
cd kubepolaris

# 启动服务
docker-compose -f deploy/docker-compose/docker-compose.yml up -d

# 访问 http://localhost:8080
# 默认账号: admin / admin123
```

### 方式二：Kubernetes 部署

```bash
# 使用 Helm 安装
helm repo add kubepolaris https://kubepolaris.github.io/charts
helm install kubepolaris kubepolaris/kubepolaris -n kubepolaris --create-namespace

# 或使用 YAML 直接部署
kubectl apply -f https://raw.githubusercontent.com/clay-wangzhi/KubePolaris/main/deploy/yaml/kubepolaris.yaml
```

### 方式三：源码运行

```bash
# 环境要求
# - Go 1.24+
# - Node.js 18+
# - MySQL 8.0+

# 启动后端 (端口 8080)
cd kubepolaris
go run cmd/main.go

# 启动前端 (端口 5173)
cd ui
npm install && npm run dev

# 访问 http://localhost:5173
```

📚 详细安装指南请参考 [安装文档](http://kubepolaris.clay-wangzhi.com/docs/getting-started/installation)

## 🏗️ 技术架构

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
│    │ 数据存储 │         │ Clusters│         │Prometheus│         │
│    └─────────┘         └─────────┘         └─────────┘         │
└─────────────────────────────────────────────────────────────────┘
```

### 技术栈

| 层级 | 技术 | 版本 |
|:---|:---|:---|
| **前端** | React, TypeScript, Ant Design, Vite | 19.x, 5.8, 5.x, 7.x |
| **后端** | Go, Gin, GORM | 1.24, 1.9, 1.30 |
| **数据库** | MySQL | 8.0+ |
| **K8s 客户端** | client-go | 0.29 |
| **监控** | Prometheus, Grafana | - |

## 📁 项目结构

```
kubepolaris/
├── cmd/                    # 程序入口
├── internal/               # 内部包
│   ├── handlers/           # HTTP 处理器
│   ├── services/           # 业务服务层
│   ├── models/             # 数据模型
│   ├── middleware/         # 中间件
│   ├── router/             # 路由配置
│   └── k8s/                # K8s 客户端封装
├── ui/                     # 前端源码
│   ├── src/
│   │   ├── pages/          # 页面组件
│   │   ├── components/     # 通用组件
│   │   ├── services/       # API 服务
│   │   └── types/          # 类型定义
├── deploy/                 # 部署配置
│   ├── docker/             # Docker 配置
│   ├── docker-compose/     # Compose 文件
│   └── yaml/               # K8s YAML
├── website/                # 文档站点
└── configs/                # 配置文件
```

## 📊 功能完成度

| 模块 | 状态 | 说明 |
|:---|:---:|:---|
| 集群管理 | ✅ | 导入、切换、监控、删除 |
| 节点管理 | ✅ | 列表、详情、操作、SSH |
| 工作负载 | ✅ | Deploy/STS/DS/Job/CronJob |
| Pod 管理 | ✅ | 列表、日志、终端、删除 |
| 配置管理 | ✅ | ConfigMap、Secret |
| 网络管理 | ✅ | Service、Ingress |
| 存储管理 | ✅ | PV、PVC、StorageClass |
| 用户权限 | ✅ | 用户、角色、RBAC |
| 监控集成 | ✅ | Prometheus、Grafana |
| 告警管理 | ✅ | AlertManager 集成 |
| GitOps | ✅ | ArgoCD 集成 |
| 审计日志 | ✅ | 操作记录、会话审计 |
| 全局搜索 | ✅ | 跨集群资源搜索 |
| 国际化 | 🚧 | 计划 v1.1 |

## 🗺️ 路线图

查看 [ROADMAP.md](./ROADMAP.md) 了解详细规划。

### 近期计划

- **v1.1 (Q2 2026)** - 国际化支持、OAuth2/OIDC 集成、成本分析
- **v1.2 (Q3 2026)** - 多租户、NetworkPolicy 管理、Service Mesh 可视化
- **v2.0 (Q4 2026)** - 集群生命周期管理、备份恢复、插件系统

## 🤝 参与贡献

我们欢迎任何形式的贡献！

- 🐛 [报告 Bug](https://github.com/clay-wangzhi/KubePolaris/issues/new?template=bug_report.md)
- 💡 [提交功能建议](https://github.com/clay-wangzhi/KubePolaris/issues/new?template=feature_request.md)
- 📖 [完善文档](https://github.com/clay-wangzhi/KubePolaris/tree/main/website/docs)
- 🔧 [提交 PR](https://github.com/clay-wangzhi/KubePolaris/pulls)

### 贡献流程

```bash
# 1. Fork 并克隆项目
git clone https://github.com/YOUR_USERNAME/kubepolaris.git

# 2. 创建功能分支
git checkout -b feature/amazing-feature

# 3. 提交更改
git commit -m 'feat: add amazing feature'

# 4. 推送并创建 PR
git push origin feature/amazing-feature
```

详细指南请参考 [CONTRIBUTING.md](./CONTRIBUTING.md) | [CONTRIBUTING_zh.md](./CONTRIBUTING_zh.md)

## 📚 文档

| 文档 | 链接 |
|:---|:---|
| 🏠 官方网站 | [kubepolaris.clay-wangzhi.com](http://kubepolaris.clay-wangzhi.com/) |
| 📖 用户文档 | [docs](http://kubepolaris.clay-wangzhi.com/docs) |
| 🚀 快速开始 | [quick-start](http://kubepolaris.clay-wangzhi.com/docs/getting-started/quick-start) |
| 📦 安装指南 | [installation](http://kubepolaris.clay-wangzhi.com/docs/getting-started/installation) |
| 🔧 配置说明 | [configuration](http://kubepolaris.clay-wangzhi.com/docs/admin-guide/configuration) |
| 🔌 API 文档 | [api-reference](http://kubepolaris.clay-wangzhi.com/docs/api/overview) |

## 💬 社区

- 💭 [GitHub Discussions](https://github.com/clay-wangzhi/KubePolaris/discussions) - 问题讨论和功能建议
- 📢 [Slack](https://kubepolaris.slack.com) - 实时交流
- 📧 邮件列表: [kubepolaris@googlegroups.com](mailto:kubepolaris@googlegroups.com)

## 🔒 安全

如果发现安全漏洞，请查阅 [SECURITY.md](./SECURITY.md) 了解报告流程。

## 📄 许可证

KubePolaris 基于 [Apache License 2.0](./LICENSE) 开源。

## 🙏 致谢

感谢以下开源项目：

- [Kubernetes](https://kubernetes.io/) - 容器编排平台
- [Gin](https://gin-gonic.com/) - Go Web 框架
- [Ant Design](https://ant.design/) - React UI 组件库
- [client-go](https://github.com/kubernetes/client-go) - Kubernetes Go 客户端
- [xterm.js](https://xtermjs.org/) - 终端组件

特别感谢所有 [贡献者](https://github.com/clay-wangzhi/KubePolaris/graphs/contributors)！

---

<p align="center">
  如果 KubePolaris 对您有帮助，请给我们一个 ⭐️ Star！
</p>

<p align="center">
  <a href="https://github.com/clay-wangzhi/KubePolaris/stargazers">
    <img src="https://img.shields.io/github/stars/clay-wangzhi/KubePolaris?style=social" alt="Stars">
  </a>
</p>

