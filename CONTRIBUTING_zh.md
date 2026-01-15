# KubePolaris 贡献指南

首先，感谢你考虑为 KubePolaris 做出贡献！🎉

正是像你这样的人让 KubePolaris 成为一个出色的工具。

## 目录

- [行为准则](#行为准则)
- [如何贡献](#如何贡献)
- [开发环境搭建](#开发环境搭建)
- [编码规范](#编码规范)
- [提交规范](#提交规范)
- [Pull Request 流程](#pull-request-流程)

## 行为准则

参与本项目的所有人都受我们的[行为准则](CODE_OF_CONDUCT.md)约束。参与即表示你同意遵守此准则。

## 如何贡献

### 报告 Bug

在创建 Bug 报告之前，请先搜索现有 Issue，可能已经有人报告过了。

创建 Bug 报告时，请包含：

- **清晰的标题**，描述问题
- **详细描述** Bug 的表现
- **复现步骤**
- **期望行为** vs 实际行为
- **截图**（如适用）
- **环境信息**（版本、操作系统、浏览器等）

### 提出新功能

功能建议通过 GitHub Issue 跟踪。创建 Issue 时请提供：

- **清晰的标题**
- **详细描述** 提议的功能
- **使用场景**，解释为什么这个功能有用
- **可能的实现方案**（如果有想法的话）

### 提交代码

我们欢迎 Pull Request：

1. Fork 仓库并从 `main` 创建分支
2. 如果添加了代码，请添加测试
3. 如果修改了 API，请更新文档
4. 确保测试通过
5. 确保代码通过 lint 检查
6. 提交 Pull Request

## 开发环境搭建

### 前置要求

- Go 1.22+
- Node.js 18+
- MySQL 8.0+
- Docker & Docker Compose（可选）

### 后端搭建

```bash
# 克隆仓库
git clone https://github.com/clay-wangzhi/KubePolaris.git
cd kubepolaris

# 安装 Go 依赖
go mod download

# 复制配置文件
cp configs/config.example.yaml configs/config.yaml

# 编辑配置
vim configs/config.yaml

# 运行后端
go run cmd/main.go
```

### 前端搭建

```bash
# 进入前端目录
cd ui

# 安装依赖
npm install
# 或
pnpm install

# 启动开发服务器
npm run dev
```

### 数据库搭建

```bash
# 使用 Docker 启动 MySQL
docker run -d \
  --name kubepolaris-mysql \
  -e MYSQL_ROOT_PASSWORD=root \
  -e MYSQL_DATABASE=kubepolaris \
  -p 3306:3306 \
  mysql:8.0

# 或使用 docker-compose
docker-compose up -d mysql
```

### 运行测试

```bash
# 后端测试
go test ./...

# 前端测试
cd ui && npm test
```

## 编码规范

### Go（后端）

- 遵循 [Effective Go](https://golang.org/doc/effective_go)
- 使用 `gofmt` 格式化代码
- 使用 `golint` 和 `go vet` 进行检查
- 为新功能编写测试
- 为导出的函数添加注释

```go
// 好的示例
// ClusterService 处理集群相关操作
type ClusterService struct {
    db *gorm.DB
}

// GetByID 根据 ID 获取集群
func (s *ClusterService) GetByID(id uint) (*Cluster, error) {
    // 实现
}
```

### TypeScript（前端）

- 遵循 TypeScript 最佳实践
- 使用 ESLint 和 Prettier
- 使用函数组件和 Hooks
- 定义正确的类型，避免使用 `any`

```typescript
// 好的示例
interface ClusterProps {
  cluster: Cluster;
  onEdit: (id: number) => void;
}

const ClusterCard: React.FC<ClusterProps> = ({ cluster, onEdit }) => {
  // 实现
};
```

### API 设计

- 使用 RESTful 规范
- 使用正确的 HTTP 方法（GET、POST、PUT、DELETE）
- 返回一致的 JSON 响应
- 使用 Swagger 注解记录端点

## 提交规范

我们遵循 [Conventional Commits](https://www.conventionalcommits.org/)：

```
<类型>(<范围>): <主题>

<正文>

<页脚>
```

### 类型

- `feat`: 新功能
- `fix`: Bug 修复
- `docs`: 仅文档更新
- `style`: 格式化，无代码更改
- `refactor`: 代码重构
- `perf`: 性能优化
- `test`: 添加测试
- `chore`: 维护任务

### 示例

```bash
feat(cluster): 添加集群导入验证

fix(terminal): 解决 WebSocket 重连问题

docs(readme): 更新安装说明

refactor(api): 简化错误处理中间件
```

## Pull Request 流程

### 提交前检查

1. **更新文档**（如需要）
2. **添加测试**（新功能）
3. **运行 lint** 并修复问题
4. **运行测试** 确保通过
5. **Rebase** 到最新的 main 分支

### PR 标题

遵循与提交相同的格式：

```
feat(cluster): 添加支持多 kubeconfig 文件
```

### PR 描述

使用 PR 模板，包含：

- 变更描述
- 相关 Issue 编号
- 变更类型
- 测试情况
- 截图（UI 变更）

### 审查流程

1. 自动检查必须通过
2. 至少一位维护者审查
3. 处理审查意见
4. 根据需要合并提交
5. 维护者会在准备就绪时合并

## 获取帮助

- 💬 [GitHub Discussions](https://github.com/clay-wangzhi/KubePolaris/discussions)
- 📖 [文档](http://kubepolaris.clay-wangzhi.com/docs)
- 🐛 [Issue 追踪器](https://github.com/clay-wangzhi/KubePolaris/issues)

## 贡献者认可

贡献者会在以下位置得到认可：

- [CONTRIBUTORS.md](CONTRIBUTORS.md)
- 发布说明
- README 贡献者部分

感谢你的贡献！🙏

